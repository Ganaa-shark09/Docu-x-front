import { ContractAreaNavComponent } from '../../components/contract-area-nav.component';
import { DatePipe, NgFor, NgIf, TitleCasePipe } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, timeout } from 'rxjs';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ContractRegisterRow, ContractSummary } from '../../models/contract.model';
import { ContractService } from '../../services/contract.service';
import { WorkflowService } from '../../../workflows/services/workflow.service';
import { Definition } from '../../../workflows/models/workflow.model';
import { ContractDefinitionComponent } from '../../../workflows/components/contract-definition.component';
import { DocumentGovernanceService } from '../../../documents/services/document-governance.service';
import { Membership } from '../../../documents/models/governance.model';

@Component({
  selector: 'app-contract-register-page',
  standalone: true,
  imports: [ContractAreaNavComponent, DatePipe, NgFor, NgIf, TitleCasePipe, ReactiveFormsModule, RouterLink, ContractDefinitionComponent],
  templateUrl: './contract-register-page.component.html',
  styleUrl: './contract-register-page.component.scss',
})
export class ContractRegisterPageComponent implements OnInit {
  private readonly service = inject(ContractService);
  private readonly workflows = inject(WorkflowService);
  private readonly router = inject(Router);
  private readonly governance = inject(DocumentGovernanceService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly filters = this.fb.nonNullable.group({ search: [''], status: [''] });
  readonly statusChoices = [
    { value: 'completed', label: 'Completed' },
    { value: 'review_required', label: 'Review required' },
    { value: 'approval_required', label: 'Approval required' },
    { value: 'exception', label: 'Exception' },
    { value: 'failed', label: 'Failed' },
  ];
  rows: ContractRegisterRow[] = [];
  summary: ContractSummary | null = null;
  count = 0;
  page = 1;
  readonly pageSize = 20;
  next: string | null = null;
  previous: string | null = null;
  loading = false;
  summaryLoading = false;
  error = '';
  summaryError = '';

  // Contract workflow configuration and starting reviews are independent flows.
  choosingWorkflow = false;
  creatingWorkflow = false;
  createBusy = false;
  permissionsLoading = true;
  canCreateWorkflow = false;
  companyAdmin = false;
  memberships: Membership[] = [];
  permissionsError = '';
  creationMessage = '';
  private permissionsGeneration = 0;
  workflowsLoading = false;
  workflowsError = '';
  availableWorkflows: Definition[] = [];
  selectedWorkflowUuid: string | null = null;
  workflowPage = 1;
  workflowNext: string | null = null;
  workflowPrevious: string | null = null;
  private workflowRequestVersion = 0;
  private requestVersion = 0;
  private summaryVersion = 0;

  ngOnInit(): void {
    this.refresh();
    this.loadCreatePermissions();
  }

  private loadCreatePermissions(): void {
    const generation = ++this.permissionsGeneration;
    this.permissionsLoading = true;
    this.permissionsError = '';
    this.canCreateWorkflow = false;
    this.companyAdmin = false;
    this.memberships = [];
    forkJoin({
      profile: this.workflows.profile().pipe(timeout(15000)),
      members: this.governance.memberships().pipe(timeout(15000)),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ profile, members }) => {
        if (generation !== this.permissionsGeneration) return;
        this.companyAdmin = !!profile.is_superuser || ['company_admin', 'platform_admin'].includes(profile.role);
        const own = members.filter(member => member.is_active && member.user === profile.id && member.role === 'department_admin');
        this.memberships = this.companyAdmin ? members.filter(member => member.is_active) : own;
        this.canCreateWorkflow = this.companyAdmin || own.length > 0;
        this.permissionsLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        if (generation !== this.permissionsGeneration) return;
        this.permissionsLoading = false;
        this.permissionsError = 'Unable to verify workflow administration permissions. Retry before creating a workflow.';
        this.cdr.markForCheck();
      },
    });
  }

  toggleCreateWorkflow(): void {
    if (this.createBusy || !this.canCreateWorkflow) return;
    this.creatingWorkflow = !this.creatingWorkflow;
    if (this.creatingWorkflow) {
      this.choosingWorkflow = false;
      this.creationMessage = '';
    }
  }

  onContractWorkflowCreated(definition: Definition): void {
    this.createBusy = false;
    this.creatingWorkflow = false;
    this.creationMessage = `“${definition.name}” was created and published. You can now choose it to start a review.`;
    this.choosingWorkflow = true;
    this.availableWorkflows = [];
    this.loadStartWorkflows(1);
    this.cdr.markForCheck();
  }

  onContractWorkflowDenied(): void {
    this.createBusy = false;
    this.creatingWorkflow = false;
    this.canCreateWorkflow = false;
    this.memberships = [];
    this.permissionsError = 'Workflow administration access changed. Refresh permissions to try again.';
    this.cdr.markForCheck();
  }

  retryCreatePermissions(): void {
    if (this.createBusy) return;
    this.loadCreatePermissions();
  }

  toggleStartReview(): void {
    if (this.createBusy) return;
    this.choosingWorkflow = !this.choosingWorkflow;
    if (this.choosingWorkflow) this.creatingWorkflow = false;
    if (!this.choosingWorkflow) this.selectedWorkflowUuid = null;
    if (this.choosingWorkflow && !this.availableWorkflows.length) this.loadStartWorkflows(1);
  }

  loadStartWorkflows(page: number): void {
    if (page < 1 || this.workflowsLoading) return;
    const version = ++this.workflowRequestVersion;
    this.workflowsLoading = true;
    this.workflowsError = '';
    this.workflowPage = page;
    this.selectedWorkflowUuid = null;
    this.workflows.definitions(page, 'contract_review')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          if (version !== this.workflowRequestVersion) return;
          this.availableWorkflows = (result.results ?? []).filter(
            (item) => item.is_active && !!item.latest_version && !!item.capabilities.start,
          );
          this.workflowNext = result.next;
          this.workflowPrevious = result.previous;
          this.workflowsLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          if (version !== this.workflowRequestVersion) return;
          this.workflowsError = 'Unable to load published contract workflows. Please retry.';
          this.availableWorkflows = [];
          this.workflowsLoading = false;
          this.cdr.markForCheck();
        },
      });
  }

  selectStartWorkflow(uuid: string): void {
    if (!this.availableWorkflows.some((workflow) => workflow.uuid === uuid)) return;
    this.selectedWorkflowUuid = uuid;
    this.cdr.markForCheck();
  }

  continueToDocumentSelection(): void {
    const uuid = this.selectedWorkflowUuid;
    if (!uuid || !this.availableWorkflows.some((workflow) => workflow.uuid === uuid)) return;
    // Keep the existing definition-start flow and backend document authorization checks.
    // This navigation selects a workflow; it does not initiate a review on the server.
    void this.router.navigate(['/workflows/definitions', uuid]);
  }

  applyFilters(): void { this.page = 1; this.refresh(); }
  resetFilters(): void { this.filters.reset({ search: '', status: '' }); this.applyFilters(); }

  goToPage(page: number): void {
    if (page < 1 || (page > this.page && !this.next)) return;
    this.page = page;
    this.loadRows();
  }

  refresh(): void {
    this.loadRows();
    this.loadSummary();
  }

  private loadRows(): void {
    const version = ++this.requestVersion;
    this.loading = true;
    this.error = '';
    const filters = { ...this.filters.getRawValue(), page: this.page, page_size: this.pageSize };
    this.service.list(filters).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: response => {
        if (version !== this.requestVersion) return;
        this.rows = response.results ?? [];
        this.count = response.count ?? 0;
        this.next = response.next;
        this.previous = response.previous;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        if (version !== this.requestVersion) return;
        this.rows = [];
        this.count = 0;
        this.next = this.previous = null;
        this.loading = false;
        this.error = err.status === 403 || err.status === 404
          ? 'You do not have access to this contract register.'
          : 'The contract register could not be loaded. Try again.';
        this.cdr.markForCheck();
      },
    });
  }

  private loadSummary(): void {
    const version = ++this.summaryVersion;
    this.summaryLoading = true;
    this.summary = null;
    this.summaryError = '';
    this.service.summary(this.filters.getRawValue())
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: summary => {
          if (version !== this.summaryVersion) return;
          this.summary = summary;
          this.summaryLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          if (version !== this.summaryVersion) return;
          this.summaryError = 'Summary unavailable.';
          this.summaryLoading = false;
          this.cdr.markForCheck();
        },
      });
  }

  get firstRow(): number { return this.count === 0 ? 0 : ((this.page - 1) * this.pageSize + 1); }
  get lastRow(): number { return Math.min(this.page * this.pageSize, this.count); }
  showAttention(): void { this.filters.controls.status.setValue('review_required'); this.applyFilters(); }
  showCompleted(): void { this.filters.controls.status.setValue('completed'); this.applyFilters(); }
  statusTone(status: string): string {
    if (status === 'completed' || status === 'approved') return 'positive';
    if (status === 'failed' || status === 'exception') return 'negative';
    if (status === 'review_required' || status === 'approval_required') return 'attention';
    return 'neutral';
  }
  label(value: string): string { return value.replace(/_/g, ' '); }

  get attention(): number { return this.summary?.needs_attention ?? 0; }
  get completed(): number { return this.summary?.by_status?.['completed'] ?? 0; }
  get pageCount(): number { return Math.max(1, Math.ceil(this.count / this.pageSize)); }
  trackUuid(_: number, item: ContractRegisterRow): string { return item.uuid; }
}
