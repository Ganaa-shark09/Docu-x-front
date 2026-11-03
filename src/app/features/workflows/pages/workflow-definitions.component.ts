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

type WorkflowTypeFilter = '' | 'invoice' | 'contract_review' | 'legal_clause_intelligence';
type CreateKind = 'invoice' | 'contract' | 'generic' | 'legal';
type DefinitionStatusFilter = 'all' | 'active' | 'inactive' | 'published' | 'draft' | 'ready';

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
  styleUrls: ['../workflow.scss', './workflow-definitions.component.scss'],
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
  readonly type = signal<WorkflowTypeFilter>(this.readType(this.route.snapshot.queryParamMap.get('type')));
  readonly search = signal('');
  readonly status = signal<DefinitionStatusFilter>('all');

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
      this.type.set(this.readType(params.get('type')));
      this.resetCreateState();
      this.resetFilters();
      this.load(1);
    });
    this.governance.changes$.pipe(takeUntilDestroyed(this.destroy)).subscribe(() => {
      this.generation++;
      this.result.set(null);
      this.canCreate.set(false);
      this.memberships.set([]);
      this.companyAdmin.set(false);
      this.directoryError.set('');
      this.resetCreateState();
      this.resetFilters();
      this.load();
    });
  }

  visibleDefinitions(): Definition[] {
    return this.result()?.results || [];
  }

  filteredDefinitions(): Definition[] {
    const term = this.search().trim().toLowerCase();
    const filter = this.status();
    return this.visibleDefinitions().filter((definition) => {
      if (filter !== 'all') {
        const published = !!definition.latest_version;
        const ready = !!definition.is_active && !!definition.latest_version && !!definition.capabilities.start;
        if (
          (filter === 'active' && !definition.is_active) ||
          (filter === 'inactive' && definition.is_active) ||
          (filter === 'published' && !published) ||
          (filter === 'draft' && published) ||
          (filter === 'ready' && !ready)
        ) {
          return false;
        }
      }
      if (!term) return true;
      return [
        definition.name,
        definition.description,
        this.labelForType(definition.workflow_type),
        definition.department === null ? 'company wide' : `department ${definition.department}`,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term));
    });
  }

  totalDefinitions(): number {
    return this.visibleDefinitions().length;
  }

  publishedDefinitions(): number {
    return this.visibleDefinitions().filter((definition) => !!definition.latest_version).length;
  }

  readyDefinitions(): number {
    return this.visibleDefinitions().filter(
      (definition) => !!definition.is_active && !!definition.latest_version && !!definition.capabilities.start,
    ).length;
  }

  currentCreateKind(): CreateKind {
    switch (this.type()) {
      case 'invoice':
        return 'invoice';
      case 'contract_review':
        return 'contract';
      case 'legal_clause_intelligence':
        return 'legal';
      default:
        return 'generic';
    }
  }

  headerTitle(): string {
    switch (this.type()) {
      case 'invoice':
        return 'Invoice workflows';
      case 'contract_review':
        return 'Contract review';
      case 'legal_clause_intelligence':
        return 'Legal clause intelligence';
      default:
        return 'Workflow definitions';
    }
  }

  headerEyebrow(): string {
    switch (this.type()) {
      case 'invoice':
        return 'ACCOUNTS PAYABLE · WORKFLOW DEFINITIONS';
      case 'contract_review':
        return 'LEGAL OPERATIONS · WORKFLOW DEFINITIONS';
      case 'legal_clause_intelligence':
        return 'LEGAL OPERATIONS · CLAUSE WORKFLOWS';
      default:
        return 'DOCUMENT OPERATIONS · WORKFLOW DEFINITIONS';
    }
  }

  headerDescription(): string {
    switch (this.type()) {
      case 'invoice':
        return 'Manage invoice extraction workflows, publishing, and the definitions used to start new processing runs.';
      case 'contract_review':
        return 'Configure reusable contract review workflows with reviewers, approvals, and clean access to the review register.';
      case 'legal_clause_intelligence':
        return 'Organize legal clause review workflows and connect them to your playbooks and clause intelligence process.';
      default:
        return 'Centralize reusable workflow definitions so teams can launch work, review progress, and keep operations consistent.';
    }
  }

  secondaryAction(): { label: string; route: string } | null {
    switch (this.type()) {
      case 'invoice':
        return { label: 'Open invoice workspace', route: '/workflows/invoices' };
      case 'contract_review':
        return { label: 'Open contract register', route: '/workflows/contract-workspace' };
      case 'legal_clause_intelligence':
        return { label: 'Open legal playbooks', route: '/workflows/legal/playbooks' };
      default:
        return { label: 'View workflow runs', route: '/workflows/runs' };
    }
  }

  primaryActionLabel(): string {
    switch (this.currentCreateKind()) {
      case 'invoice':
        return this.showInvoiceCreate ? 'Close workflow form' : 'New invoice workflow';
      case 'contract':
        return this.showContractCreate() ? 'Close workflow form' : 'New contract workflow';
      case 'legal':
        return this.showLegalCreate() ? 'Close workflow form' : 'New legal workflow';
      default:
        return this.showCreate ? 'Close definition form' : 'Create definition';
    }
  }

  sectionTitle(): string {
    return this.type() ? `${this.headerTitle()} definitions` : 'All workflow definitions';
  }

  sectionDescription(): string {
    switch (this.type()) {
      case 'invoice':
        return 'Search published invoice workflows, check publishing status, and open a workflow to begin processing.';
      case 'contract_review':
        return 'Review contract workflow configuration, version status, and open a workflow to start or inspect its definition.';
      case 'legal_clause_intelligence':
        return 'Keep legal clause workflows organized with a clear list of definitions, version status, and direct actions.';
      default:
        return 'Browse every accessible workflow definition across invoice, contract, and legal operations from one place.';
    }
  }

  searchPlaceholder(): string {
    switch (this.type()) {
      case 'invoice':
        return 'Search invoice workflows, descriptions, or departments';
      case 'contract_review':
        return 'Search contract workflows, descriptions, or departments';
      case 'legal_clause_intelligence':
        return 'Search legal workflows, descriptions, or departments';
      default:
        return 'Search workflows, descriptions, types, or departments';
    }
  }

  tableContextHeading(): string {
    return this.type() ? 'Scope' : 'Workflow type';
  }

  tableContextValue(definition: Definition): string {
    if (!this.type()) {
      return this.labelForType(definition.workflow_type);
    }
    return definition.department === null ? 'Company wide' : `Department ${definition.department}`;
  }

  tableContextMeta(definition: Definition): string {
    if (!this.type()) {
      return definition.department === null ? 'Company wide' : `Department ${definition.department}`;
    }
    return this.labelForType(definition.workflow_type);
  }

  versionLabel(definition: Definition): string {
    return definition.latest_version ? `v${definition.latest_version.number}` : 'Not published';
  }

  definitionStatus(definition: Definition): string {
    if (!definition.is_active) return 'Inactive';
    if (definition.latest_version && definition.capabilities.start) return 'Ready';
    if (definition.latest_version) return 'Published';
    return 'Draft';
  }

  statusTone(definition: Definition): 'success' | 'warning' | 'neutral' {
    const status = this.definitionStatus(definition);
    if (status === 'Ready' || status === 'Published') return 'success';
    if (status === 'Draft') return 'warning';
    return 'neutral';
  }

  actionLabel(definition: Definition): string {
    return definition.capabilities.start && definition.latest_version ? 'Open & start' : 'Open definition';
  }

  hasFilters(): boolean {
    return !!this.search().trim() || this.status() !== 'all';
  }

  clearFilters(): void {
    this.resetFilters();
  }

  setSearch(value: string): void {
    this.search.set(value);
  }

  setStatus(value: DefinitionStatusFilter): void {
    this.status.set(value);
  }

  selectCreateAction(): void {
    this.toggleCreate(this.currentCreateKind());
  }

  openDefinition(definition: Definition): void {
    void this.router.navigate(['/workflows/definitions', definition.uuid]);
  }

  emptyStateTitle(): string {
    if (this.hasFilters()) return 'No workflows match the current filters';
    switch (this.type()) {
      case 'invoice':
        return 'No invoice workflows yet';
      case 'contract_review':
        return 'No contract review workflows yet';
      case 'legal_clause_intelligence':
        return 'No legal clause workflows yet';
      default:
        return 'No workflow definitions available';
    }
  }

  emptyStateDescription(): string {
    if (this.hasFilters()) {
      return 'Try a different search term or reset the status filter to see more workflows.';
    }
    return this.canCreate()
      ? 'Create and publish a workflow to make it available for document operations.'
      : 'No workflow definitions in this area are currently visible to your account.';
  }

  toggleCreate(kind: CreateKind): void {
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
      this.showContractCreate.set(false);
    } else {
      this.showCreate = !this.showCreate;
      this.showInvoiceCreate = false;
      this.showContractCreate.set(false);
    }
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
          if (gen === this.generation) {
            this.directoryError.set(
              'The assignment directory could not be loaded. Refresh to retry before choosing a reviewer.',
            );
          }
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
            (member) => member.is_active && member.user === profile.id && member.role === 'department_admin',
          );
          this.memberships.set(this.companyAdmin() ? members.filter((member) => member.is_active) : own);
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
        next: (result) => {
          if (gen === this.generation) {
            this.result.set(result);
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
    ) {
      return;
    }
    const gen = this.generation;
    this.pending.set(true);
    this.error.set('');
    this.api
      .create({ ...this.input })
      .pipe(timeout(15000), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (definition) => {
          this.pending.set(false);
          if (gen !== this.generation) return;
          void this.router.navigate(['/workflows/definitions', definition.uuid]);
        },
        error: (e) => {
          this.pending.set(false);
          if (gen !== this.generation) return;
          this.error.set(this.errors.getMessage(e, 'Unable to create workflow.'));
          if (e instanceof HttpErrorResponse && [401, 403, 404].includes(e.status)) {
            this.canCreate.set(false);
            this.memberships.set([]);
            this.resetCreateState();
          }
        },
      });
  }

  invoiceCreated(definition: Definition): void {
    void this.router.navigate(['/workflows/definitions', definition.uuid]);
  }

  invoiceDenied(): void {
    this.resetCreateState();
    this.canCreate.set(false);
    this.error.set('Workflow administration is no longer permitted. Refresh current permissions.');
  }

  departments(): Membership[] {
    return this.memberships().filter(
      (member, index, all) => all.findIndex((entry) => entry.department === member.department) === index,
    );
  }

  private readType(value: string | null): WorkflowTypeFilter {
    return ['invoice', 'contract_review', 'legal_clause_intelligence'].includes(value || '')
      ? (value as WorkflowTypeFilter)
      : '';
  }

  private labelForType(type: string): string {
    switch (type) {
      case 'invoice':
        return 'Invoice extraction';
      case 'contract_review':
        return 'Contract review';
      case 'legal_clause_intelligence':
        return 'Legal clause intelligence';
      default:
        return type;
    }
  }

  private resetCreateState(): void {
    this.invoiceCreating.set(false);
    this.showCreate = false;
    this.showInvoiceCreate = false;
    this.showContractCreate.set(false);
    this.showLegalCreate.set(false);
  }

  private resetFilters(): void {
    this.search.set('');
    this.status.set('all');
  }
}
