import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdministrationComponent } from './administration.component';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../core/notifications/toast.service';

describe('Administration workspace', () => {
  let http: HttpTestingController;
  let section = 'company';
  const base = environment.apiBaseUrl;
  beforeEach(() => {
    section = 'company';
    TestBed.configureTestingModule({
      imports: [AdministrationComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: ActivatedRoute, useValue: { snapshot: { data: { get section() { return section; } } } } }],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });

  it('does not request tenant data for a member', () => {
    const fixture = TestBed.createComponent(AdministrationComponent);
    http.expectOne(base + '/auth/profile/').flush({ id: 4, role: 'member', is_superuser: false, company: 1 });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Company administration permission is required');
    expect(fixture.nativeElement.querySelector('.admin-header__actions .ui-button--primary')).toBeNull();
    http.expectNone((request) => request.url.includes('/auth/companies/'));
  });

  it('loads a superuser-selected company and scopes user, department and membership calls', () => {
    section = 'access';
    const fixture = TestBed.createComponent(AdministrationComponent);
    const component = fixture.componentInstance;
    http.expectOne(base + '/auth/profile/').flush({ id: 1, role: 'member', is_superuser: true, company: null });
    http.expectOne((req) => req.url === base + '/auth/companies/').flush([{ id: 7, uuid: 'company-7', name: 'Acme', status: 'active', legal_name: '', website: '', slug: 'acme' }]);
    for (const path of ['/auth/users/', '/workspaces/departments/', '/workspaces/memberships/']) {
      const request = http.expectOne((req) => req.url === base + path);
      expect(request.request.params.get('company')).toBe('7');
      request.flush([]);
    }
    fixture.detectChanges();
    expect(component.selectedCompany).toBe(7);
    expect(fixture.nativeElement.textContent).toContain('Department access');
    expect(fixture.nativeElement.textContent).not.toContain('Create company');
  });

  it('keeps company-admin requests in their own company', () => {
    section = 'departments';
    const fixture = TestBed.createComponent(AdministrationComponent);
    http.expectOne(base + '/auth/profile/').flush({ id: 2, role: 'company_admin', is_superuser: false, company: 5 });
    http.expectOne((req) => req.url === base + '/auth/companies/').flush([{ id: 5, uuid: 'company-5', name: 'Own', status: 'active', legal_name: '', website: '', slug: 'own' }]);
    for (const path of ['/workspaces/departments/']) {
      const request = http.expectOne((req) => req.url === base + path);
      expect(request.request.params.has('company')).toBe(false);
      request.flush([]);
    }
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Create company');
  });
  it('keeps organization creation separate from tenant management', () => {
    section = 'organizations';
    const fixture = TestBed.createComponent(AdministrationComponent);
    http.expectOne(base + '/auth/profile/').flush({ id: 1, role: 'member', is_superuser: true, company: null });
    http.expectOne((req) => req.url === base + '/auth/companies/').flush([{ id: 7, uuid: 'company-7', name: 'Acme', status: 'active', legal_name: '', website: '', slug: 'acme' }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Create company');
    expect(fixture.nativeElement.textContent).not.toContain('Create user');
    http.expectNone((req) => req.url.includes('/auth/users/') || req.url.includes('/workspaces/'));
  });
  it('loads users without requesting unrelated department data', () => {
    section = 'users';
    const fixture = TestBed.createComponent(AdministrationComponent);
    http.expectOne(base + '/auth/profile/').flush({ id: 2, role: 'company_admin', is_superuser: false, company: 5 });
    http.expectOne((req) => req.url === base + '/auth/companies/').flush([{ id: 5, uuid: 'company-5', name: 'Own', status: 'active', legal_name: '', website: '', slug: 'own' }]);
    const request = http.expectOne((req) => req.url === base + '/auth/users/');
    expect(request.request.params.has('company')).toBe(false);
    request.flush([]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Create user');
    expect(fixture.nativeElement.textContent).not.toContain('Create department');
    http.expectNone((req) => req.url.includes('/workspaces/'));
  });
  it('opens the create dialog, shows API errors there, and closes after a successful create', () => {
    section = 'organizations';
    const fixture = TestBed.createComponent(AdministrationComponent);
    const component = fixture.componentInstance;
    http.expectOne(base + '/auth/profile/').flush({ id: 1, role: 'member', is_superuser: true, company: null });
    http.expectOne((req) => req.url === base + '/auth/companies/').flush([]);
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(false);
    dialog.showModal = vi.fn(() => dialog.setAttribute('open', ''));
    dialog.close = vi.fn(() => dialog.removeAttribute('open'));
    fixture.nativeElement.querySelector('.admin-header__actions .ui-button--primary').click();
    expect(dialog.open).toBe(true);
    component.newCompany.name = 'New company';
    component.createCompany();
    http.expectOne(base + '/auth/companies/').flush({ name: ['Already exists'] }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain('Already exists');
    component.createCompany();
    const create = http.expectOne(base + '/auth/companies/');
    expect(create.request.body.name).toBe('New company');
    create.flush({ id: 8 });
    http.expectOne((req) => req.url === base + '/auth/companies/').flush([]);
    expect(dialog.open).toBe(false);
    expect(TestBed.inject(ToastService).messages().at(-1)?.message).toBe('Company created.');
    expect(fixture.nativeElement.querySelector('.admin-feedback--success')).toBeNull();
  });
  for (const [page, action] of [
    ['users', 'Create user'],
    ['departments', 'Create department'],
    ['access', 'Assign access'],
  ] as const) {
    it(`opens the ${page} create form only after the action is selected`, () => {
      section = page;
      const fixture = TestBed.createComponent(AdministrationComponent);
      http.expectOne(base + '/auth/profile/').flush({ id: 2, role: 'company_admin', is_superuser: false, company: 5 });
      http.expectOne((req) => req.url === base + '/auth/companies/').flush([{ id: 5, uuid: 'company-5', name: 'Own', status: 'active', legal_name: '', website: '', slug: 'own' }]);
      const paths = page === 'users' ? ['/auth/users/'] : page === 'departments' ? ['/workspaces/departments/'] : ['/auth/users/', '/workspaces/departments/', '/workspaces/memberships/'];
      for (const path of paths) http.expectOne((req) => req.url === base + path).flush([]);
      fixture.detectChanges();
      const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
      expect(dialog.open).toBe(false);
      dialog.showModal = vi.fn(() => dialog.setAttribute('open', ''));
      dialog.close = vi.fn(() => dialog.removeAttribute('open'));
      const button: HTMLButtonElement = fixture.nativeElement.querySelector('.admin-header__actions .ui-button--primary');
      expect(button.textContent).toContain(action);
      button.click();
      expect(dialog.open).toBe(true);
      fixture.nativeElement.querySelector('.admin-dialog__close').click();
      expect(dialog.open).toBe(false);
    });
  }
});
