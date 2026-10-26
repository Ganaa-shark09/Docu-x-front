import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, of, skip, Subject, takeUntil, timeout } from 'rxjs';
import { ContractDefinitionComponent } from '../components/contract-definition.component';
import { LegalDefinitionComponent } from '../components/legal-definition.component';
import { InvoiceDefinitionComponent } from '../components/invoice-definition.component';
import { WorkflowService } from '../services/workflow.service';
import { Definition, DefinitionInput, Page } from '../models/workflow.model';
import { DocumentGovernanceService } from '../../documents/services/document-governance.service';
import { Membership } from '../../documents/models/governance.model';
import { AiApiErrorMessageService } from '../../ai-chat/services/ai-api-error-message.service';
@Component({
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    InvoiceDefinitionComponent,
    ContractDefinitionComponent,
    LegalDefinitionComponent,
  ],
  templateUrl: './workflow-definitions.component.html',
  styleUrls: ['../workflow.scss'],
})
export class WorkflowDefinitionsComponent {
  readonly api = inject(WorkflowService);
  private readonly governance = inject(DocumentGovernanceService);
  private readonly destroy = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly errors = inject(AiApiErrorMessageService);
  readonly result = signal<Page<Definition> | null>(null);
  readonly loading = signal(false);
  readonly pending = signal(false);
  readonly error = signal('');
  readonly canCreate = signal(false);
  readonly companyAdmin = signal(false);
  readonly memberships = signal<Membership[]>([]);
  readonly directoryError = signal('');
  readonly invoiceCreating = signal(false);
  readonly type = signal(
    ['invoice', 'contract_review', 'legal_clause_intelligence'].includes(
      this.route.snapshot.queryParamMap.get('type') || '',
    )
      ? this.route.snapshot.queryParamMap.get('type')!
      : '',
  );
  visibleDefinitions(): Definition[] {
    return this.result()?.results || [];
  }
  toggleCreate(kind: 'invoice' | 'contract' | 'generic' | 'legal'): void {
    if (this.pending() || this.invoiceCreating()) return;
    this.showLegalCreate.set(kind === 'legal' ? !this.showLegalCreate() : false);
    if (kind === 'legal') {
      this.showCreate = false;
      this.showInvoiceCreate = false;
      this.showContractCreate.set(false);
      return;
    }
    this.showContractCreate.set(kind === 'contract' ? !this.showContractCreate() : false);
    if (kind === 'contract') {
      this.showCreate = false;
      this.showInvoiceCreate = false;
    } else if (kind === 'invoice') {
      this.showInvoiceCreate = !this.showInvoiceCreate;
      this.showCreate = false;
    } else {
      this.showCreate = !this.showCreate;
      this.showInvoiceCreate = false;
      this.showContractCreate.set(false);
    }
  }
  page = 1;
  showCreate = false;
  showInvoiceCreate = false;
  readonly showContractCreate = signal(false);
  readonly showLegalCreate = signal(false);
  input: DefinitionInput = {
    name: '',
    code: '',
    description: '',
    workflow_type: 'generic',
    department: null,
    is_active: true,
  };
  private generation = 0;
  private readonly loadCancel = new Subject<void>();
  constructor() {
    this.load();
    this.route.queryParamMap.pipe(skip(1), takeUntilDestroyed(this.destroy)).subscribe((params) => {
      this.type.set(
        ['invoice', 'contract_review', 'legal_clause_intelligence'].includes(
          params.get('type') || '',
        )
          ? params.get('type')!
          : '',
      );
      this.invoiceCreating.set(false);
      this.showCreate = false;
      this.showInvoiceCreate = false;
      this.showContractCreate.set(false);
      this.showLegalCreate.set(false);
      this.load(1);
    });
    this.governance.changes$.pipe(takeUntilDestroyed(this.destroy)).subscribe(() => {
      this.generation++;
      this.invoiceCreating.set(false);
      this.result.set(null);
      this.canCreate.set(false);
      this.showCreate = false;
      this.showInvoiceCreate = false;
      this.showContractCreate.set(false);
      this.memberships.set([]);
      this.showLegalCreate.set(false);
      this.load();
    });
  }
  load(page = this.page): void {
    if (this.pending() || this.invoiceCreating()) return;
    this.loadCancel.next();
    this.directoryError.set('');
    const gen = ++this.generation;
    this.page = page;
    this.loading.set(true);
    this.result.set(null);
    this.error.set('');
    this.canCreate.set(false);
    forkJoin({
      profile: this.api.profile(),
      members: this.governance.memberships().pipe(
        timeout(10000),
        catchError(() => {
          if (gen === this.generation)
            this.directoryError.set(
              'The assignment directory could not be loaded. Refresh to retry before choosing a reviewer.',
            );
          return of<Membership[]>([]);
        }),
      ),
    })
      .pipe(timeout(15000), takeUntil(this.loadCancel), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: ({ profile, members }) => {
          if (gen !== this.generation) return;
          this.companyAdmin.set(!!profile.is_superuser || ['company_admin', 'platform_admin'].includes(profile.role));
          const own = members.filter(
            (m) => m.is_active && m.user === profile.id && m.role === 'department_admin',
          );
          this.memberships.set(this.companyAdmin() ? members.filter((m) => m.is_active) : own);
          this.canCreate.set(this.companyAdmin() || own.length > 0);
          if (!this.companyAdmin()) this.input.department = own[0]?.department ?? null;
        },
        error: () => {
          if (gen !== this.generation) return;
          this.canCreate.set(false);
          this.companyAdmin.set(false);
          this.memberships.set([]);
          this.directoryError.set(
            'Unable to verify workflow administration permissions. Refresh to retry.',
          );
        },
      });
    this.api
      .definitions(page, this.type())
      .pipe(timeout(15000), takeUntil(this.loadCancel), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (r) => {
          if (gen === this.generation) {
            this.result.set(r);
            this.loading.set(false);
          }
        },
        error: (e) => {
          if (gen === this.generation) {
            this.error.set(this.errors.getMessage(e, 'Unable to load workflows.'));
            this.loading.set(false);
          }
        },
      });
  }
  create(): void {
    if (
      this.pending() ||
      !this.canCreate() ||
      !this.input.name.trim() ||
      !/^[-a-zA-Z0-9_]{1,80}$/.test(this.input.code)
    )
      return;
    const gen = this.generation;
    this.pending.set(true);
    this.error.set('');
    this.api
      .create({ ...this.input })
      .pipe(timeout(15000), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (d) => {
          this.pending.set(false);
          if (gen !== this.generation) return;
          void this.router.navigate(['/workflows/definitions', d.uuid]);
        },
        error: (e) => {
          this.pending.set(false);
          if (gen !== this.generation) return;
          this.error.set(this.errors.getMessage(e, 'Unable to create workflow.'));
          if (e instanceof HttpErrorResponse && [401, 403, 404].includes(e.status)) {
            this.canCreate.set(false);
            this.memberships.set([]);
            this.showCreate = false;
            this.showInvoiceCreate = false;
            this.showContractCreate.set(false);
          }
        },
      });
  }
  invoiceCreated(definition: Definition): void {
    void this.router.navigate(['/workflows/definitions', definition.uuid]);
  }
  invoiceDenied(): void {
    this.showLegalCreate.set(false);
    this.showInvoiceCreate = false;
    this.showContractCreate.set(false);
    this.canCreate.set(false);
    this.error.set('Workflow administration is no longer permitted. Refresh current permissions.');
  }
  departments(): Membership[] {
    return this.memberships().filter(
      (m, i, all) => all.findIndex((x) => x.department === m.department) === i,
    );
  }
}
