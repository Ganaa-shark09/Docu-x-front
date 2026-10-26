import { Component, DestroyRef, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { EMPTY, Observable, expand, forkJoin, map, of, reduce } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../core/notifications/toast.service';

interface Profile { id: number; role: string; is_superuser: boolean; company: number | null }
interface Company { id: number; uuid: string; name: string; slug: string; legal_name: string; website: string; status: string }
interface User { id: number; username: string; email: string; company: number; role: string; is_active: boolean; passwordDraft?: string }
interface Department { id: number; uuid: string; name: string; department_type: string; is_active: boolean }
interface Membership { uuid: string; user: number; username: string; department: number; department_name: string; role: string; is_active: boolean }
interface Page<T> { results: T[]; next: string | null }

@Component({ standalone: true, imports: [FormsModule], templateUrl: './administration.component.html', styleUrls: ['./administration.component.scss'] })
export class AdministrationComponent {
  @ViewChild('createDialog') private createDialog?: ElementRef<HTMLDialogElement>;
  private readonly http = inject(HttpClient);
  private readonly destroy = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly base = environment.apiBaseUrl;
  readonly section = this.route.snapshot.data['section'] as 'organizations' | 'company' | 'users' | 'departments' | 'access';
  readonly profile = signal<Profile | null>(null);
  readonly companies = signal<Company[]>([]);
  readonly users = signal<User[]>([]);
  readonly departments = signal<Department[]>([]);
  readonly memberships = signal<Membership[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly dialogError = signal('');
  readonly title: Record<string, string> = {
    organizations: 'Organizations', company: 'Company settings', users: 'Users',
    departments: 'Departments', access: 'Department access',
  };
  readonly description: Record<string, string> = {
    organizations: 'Manage the companies in your workspace.',
    company: 'Update your company profile and availability.',
    users: 'Manage accounts, roles and account status.',
    departments: 'Organize teams and manage department status.',
    access: 'Control who belongs to each department.',
  };
  selectedCompany = 0;
  newCompany = { name: '', legal_name: '', website: '' };
  newUser = { username: '', email: '', password: '', role: 'member' };
  newDepartment = { name: '', department_type: 'custom', description: '' };
  newMembership = { user: 0, department: 0, role: 'member' };
  readonly userRoles = ['company_admin', 'department_admin', 'reviewer', 'member', 'viewer'];
  readonly membershipRoles = ['department_admin', 'reviewer', 'member', 'viewer'];
  readonly departmentTypes = ['finance', 'legal', 'hr', 'sales', 'operations', 'management', 'custom'];
  private scopeGeneration = 0;
  companyActive(): boolean {
    return this.companies().some((company) => company.id === this.selectedCompany && company.status === 'active');
  }
  openCreate(): void {
    if (this.loading() || this.busy() || (this.section !== 'organizations' && !this.companyActive())) return;
    if (this.section === 'organizations' && !this.profile()?.is_superuser) return;
    this.error.set('');
    this.dialogError.set('');
    if (!this.createDialog?.nativeElement.open) this.createDialog?.nativeElement.showModal();
  }
  closeCreate(): void {
    if (this.busy()) return;
    if (this.createDialog?.nativeElement.open) this.createDialog.nativeElement.close();
    this.dialogError.set('');
  }
  onDialogCancel(event: Event): void {
    if (this.busy()) event.preventDefault();
    else this.dialogError.set('');
  }
  onDialogClick(event: MouseEvent): void {
    const dialog = this.createDialog?.nativeElement;
    if (event.target !== dialog || !dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) this.closeCreate();
  }

  constructor() {
    this.http.get<Profile>(`${this.base}/auth/profile/`).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: (profile) => {
        this.profile.set(profile);
        if (!profile.is_superuser && !['company_admin', 'platform_admin'].includes(profile.role)) {
          this.error.set('Company administration permission is required.'); this.loading.set(false); return;
        }
        this.selectedCompany = profile.company || 0;
        if (profile.is_superuser) {
          const stored = sessionStorage.getItem(`docux-admin-company-${profile.id}`);
          if (stored && /^\d+$/.test(stored)) this.selectedCompany = Number(stored);
        }
        this.loadCompanies();
      }, error: (error) => this.fail(error),
    });
  }
  private list<T>(path: string, params = new HttpParams()): Observable<T[]> {
    const get = (page: number) => this.http.get<Page<T> | T[]>(`${this.base}${path}`, { params: params.set('page', page) });
    return get(1).pipe(
      expand((response, index) => !Array.isArray(response) && response.next ? get(index + 2) : EMPTY),
      map((response) => Array.isArray(response) ? response : response.results),
      reduce((all, rows) => [...all, ...rows], [] as T[]),
    );
  }
  loadCompanies(): void {
    this.loading.set(true);
    this.list<Company>('/auth/companies/').pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: (rows) => {
        this.companies.set(rows);
        if (!rows.some((company) => company.id === this.selectedCompany))
          this.selectedCompany = rows.find((company) => company.status === 'active')?.id || 0;
        this.loadScoped();
      }, error: (error) => this.fail(error),
    });
  }
  loadScoped(): void {
    const generation = ++this.scopeGeneration;
    if (!this.selectedCompany) {
      this.users.set([]); this.departments.set([]); this.memberships.set([]); this.loading.set(false); return;
    }
    if (!this.companyActive()) {
      this.users.set([]); this.departments.set([]); this.memberships.set([]); this.loading.set(false); return;
    }
    this.loading.set(true);
    const params = this.options().params;
    forkJoin({
      users: ['users', 'access'].includes(this.section) ? this.list<User>('/auth/users/', params) : of([] as User[]),
      departments: ['departments', 'access'].includes(this.section) ? this.list<Department>('/workspaces/departments/', params) : of([] as Department[]),
      memberships: this.section === 'access' ? this.list<Membership>('/workspaces/memberships/', params) : of([] as Membership[]),
    }).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: (result) => {
        if (generation !== this.scopeGeneration) return;
        this.users.set(result.users); this.departments.set(result.departments);
        this.memberships.set(result.memberships); this.loading.set(false);
      }, error: (error) => { if (generation === this.scopeGeneration) this.fail(error); },
    });
  }
  selectCompany(id: number): void {
    if (!this.profile()?.is_superuser || !this.companies().some((company) => company.id === id)) return;
    this.selectedCompany = id;
    sessionStorage.setItem(`docux-admin-company-${this.profile()!.id}`, String(id));
    this.router.navigate(['/administration/company']);
  }
  changeCompany(id: number): void {
    if (!this.profile()?.is_superuser) return;
    sessionStorage.setItem(`docux-admin-company-${this.profile()!.id}`, String(id));
    this.loadScoped();
  }
  private options(): { params: HttpParams } {
    return { params: this.profile()?.is_superuser
      ? new HttpParams().set('company', this.selectedCompany) : new HttpParams() };
  }
  private save<T>(request: Observable<T>, message: string, refresh: () => void): void {
    if (this.busy()) return;
    this.busy.set(true); this.error.set('');
    request.pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: () => { this.busy.set(false); this.toasts.success(message); this.closeCreate(); refresh(); },
      error: (error) => { this.busy.set(false); this.fail(error); },
    });
  }
  createCompany(): void {
    if (!this.profile()?.is_superuser || !this.newCompany.name.trim()) return;
    this.save(this.http.post(`${this.base}/auth/companies/`, this.newCompany), 'Company created.', () => {
      this.newCompany = { name: '', legal_name: '', website: '' }; this.loadCompanies();
    });
  }
  updateCompany(company: Company): void {
    this.save(this.http.patch(`${this.base}/auth/companies/${company.uuid}/`, {
      name: company.name, legal_name: company.legal_name, website: company.website,
      ...(this.profile()?.is_superuser ? { status: company.status } : {}),
    }), 'Company updated.', () => this.loadCompanies());
  }
  createUser(): void {
    if (!this.selectedCompany || !this.newUser.username.trim() || !this.newUser.password) return;
    this.save(this.http.post(`${this.base}/auth/users/`, { ...this.newUser, company: this.selectedCompany }), 'User created.', () => {
      this.newUser = { username: '', email: '', password: '', role: 'member' }; this.loadScoped();
    });
  }
  updateUser(user: User): void {
    this.save(this.http.patch(`${this.base}/auth/users/${user.id}/`, {
      role: user.role, is_active: user.is_active,
      ...(user.passwordDraft ? { password: user.passwordDraft } : {}),
    }, this.options()), 'User updated.', () => { user.passwordDraft = ''; this.loadScoped(); });
  }
  createDepartment(): void {
    if (!this.selectedCompany || !this.newDepartment.name.trim()) return;
    this.save(this.http.post(`${this.base}/workspaces/departments/`, this.newDepartment, this.options()),
      'Department created.', () => {
        this.newDepartment = { name: '', department_type: 'custom', description: '' }; this.loadScoped();
      });
  }
  updateDepartment(department: Department): void {
    this.save(this.http.patch(`${this.base}/workspaces/departments/${department.uuid}/`, {
      name: department.name, is_active: department.is_active,
    }, this.options()), 'Department updated.', () => this.loadScoped());
  }
  createMembership(): void {
    if (!this.newMembership.user || !this.newMembership.department) return;
    this.save(this.http.post(`${this.base}/workspaces/memberships/`, this.newMembership, this.options()),
      'Department access assigned.', () => {
        this.newMembership = { user: 0, department: 0, role: 'member' }; this.loadScoped();
      });
  }
  updateMembership(membership: Membership): void {
    this.save(this.http.patch(`${this.base}/workspaces/memberships/${membership.uuid}/`, {
      role: membership.role, is_active: membership.is_active,
    }, this.options()), 'Department access updated.', () => this.loadScoped());
  }
  private fail(error: unknown): void {
    const response = error as HttpErrorResponse;
    const detail = response.error?.detail;
    const fields = response.error && typeof response.error === 'object'
      ? Object.entries(response.error as Record<string, unknown>)
        .filter(([key]) => key !== 'detail')
        .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
        .join(' ')
      : '';
    this.error.set(typeof detail === 'string' ? detail : fields || 'Unable to complete this request. Check the fields and your permissions.');
    this.toasts.error(this.error());
    if (this.createDialog?.nativeElement.open) this.dialogError.set(this.error());
    this.loading.set(false);
  }
}
