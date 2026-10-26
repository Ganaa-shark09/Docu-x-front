import { SourceProofPanelComponent } from '../../source-proof/source-proof-panel.component';
import { DatePipe, JsonPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable, Subject, takeUntil, timeout } from 'rxjs';
import {
  Artifact,
  Command,
  CommandInput,
  Definition,
  Exception,
  Finding,
  FindingDecision,
  Principal,
  Run,
  StepRun,
  Version,
  WorkflowComment,
  closed,
  label,
} from '../models/workflow.model';
import { WorkflowService } from '../services/workflow.service';
import { LegalAnalysisComponent } from '../components/legal-analysis.component';
import { ContractWorkspaceComponent } from '../components/contract-workspace.component';
import { InvoiceWorkspaceComponent } from '../components/invoice-workspace.component';
import { WorkflowStatusComponent } from '../components/workflow-status.component';
import { WorkflowFindingComponent } from '../components/workflow-finding.component';
import { WorkflowAssignmentComponent } from '../components/workflow-assignment.component';
import { DocumentGovernanceService } from '../../documents/services/document-governance.service';
import { Membership } from '../../documents/models/governance.model';
import { DocumentRealtimeService } from '../../../core/realtime/document-realtime.service';
import { ToastService } from '../../../core/notifications/toast.service';
@Component({
  standalone: true,
  imports: [SourceProofPanelComponent,
    DatePipe,
    JsonPipe,
    FormsModule,
    RouterLink,
    WorkflowStatusComponent,
    WorkflowFindingComponent,
    WorkflowAssignmentComponent,
    InvoiceWorkspaceComponent,
    ContractWorkspaceComponent,
    LegalAnalysisComponent,
  ],
  templateUrl: './workflow-run-detail.component.html',
  styleUrls: ['../workflow.scss'],
})
export class WorkflowRunDetailComponent {
  private readonly api = inject(WorkflowService);
  private readonly destroy = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly governance = inject(DocumentGovernanceService);
  private readonly realtime = inject(DocumentRealtimeService);
  private readonly toasts = inject(ToastService);
  readonly run = signal<Run | null>(null);
  readonly definition = signal<Definition | null>(null);
  readonly version = signal<Version | null>(null);
  readonly steps = signal<StepRun[]>([]);
  readonly findings = signal<Finding[]>([]);
  readonly exceptions = signal<Exception[]>([]);
  readonly comments = signal<WorkflowComment[]>([]);
  readonly artifacts = signal<Artifact[]>([]);
  readonly memberships = signal<Membership[]>([]);
  readonly loading = signal(false);
  readonly pending = signal(false);
  readonly invoicePending = signal(false);
  readonly contractCompletionBlocked = signal(true);
  readonly error = signal('');
  readonly contentError = signal('');
  readonly sectionErrors = signal<Record<string, string>>({});
  readonly sectionsLoading = signal<Record<string, boolean>>({});
  readonly inspected = signal<Artifact | null>(null);
  readonly findingError = signal('');
  readonly label = label;
  complianceAssessmentUuid(): string | null {
    if (this.definition()?.workflow_type !== 'compliance') return null;
    const options = this.version()?.steps.find((s) => s.key === 'validate_scope')?.configuration[
      'options'
    ];
    if (!options || typeof options !== 'object' || Array.isArray(options)) return null;
    return typeof options['assessment_uuid'] === 'string' ? options['assessment_uuid'] : null;
  }
  financeAuditUuid(): string | null {
    if (this.definition()?.workflow_type !== 'finance_audit') return null;
    const options = this.version()?.steps.find((s) => s.key === 'validate_scope')?.configuration[
      'options'
    ];
    if (!options || typeof options !== 'object' || Array.isArray(options)) return null;
    return typeof options['audit_uuid'] === 'string' ? options['audit_uuid'] : null;
  }
  rfpProjectUuid(): string | null {
    if (this.definition()?.workflow_type !== 'rfp_proposal') return null;
    const options = this.version()?.steps.find((s) => s.key === 'ingest_rfp')?.configuration[
      'options'
    ];
    if (!options || typeof options !== 'object' || Array.isArray(options)) return null;
    return typeof options['project_uuid'] === 'string' ? options['project_uuid'] : null;
  }
  uuid = '';
  comment = '';
  resolution = '';
  assignment: Principal | null = null;
  cancelConfirmed = false;
  private generation = 0;
  private contentDenied = false;
  private readonly refreshCancel = new Subject<void>();
  private poll: ReturnType<typeof setInterval> | null = null;
  private polls = 0;
  private commandAttempt: { fingerprint: string; body: Command } | null = null;
  private readonly objectUrls = new Set<string>();
  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroy)).subscribe((p) => {
      this.uuid = p.get('uuid') || '';
      this.commandAttempt = null;
      this.comment = '';
      this.resolution = '';
      this.load();
      this.startPolling();
    });
    for (const event of [this.governance.changes$, this.realtime.revoked$])
      event.pipe(takeUntilDestroyed(this.destroy)).subscribe((uuid) => {
        const r = this.run();
        if (uuid === '*' || r?.documents.includes(uuid)) {
          this.generation++;
          this.refreshCancel.next();
          this.clear();
          this.commandAttempt = null;
          this.contentError.set(
            'Access changed. Protected content was cleared. Refresh to check current permissions.',
          );
          if (!this.pending()) this.load();
        }
      });
    this.destroy.onDestroy(() => {
      this.stopPolling();
      this.refreshCancel.next();
      this.refreshCancel.complete();
      this.clear();
    });
  }
  private safeMessage(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) return fallback;
    const messages: Record<number, string> = {
      401: 'Your session has ended. Sign in again.',
      403: 'This action is not permitted. Document or field permissions may have changed.',
      404: 'This workflow resource is unavailable or no longer accessible.',
      409: 'The workflow changed. Refresh and reconsider your action.',
      422: 'This command is not valid in the current workflow state.',
    };
    return messages[error.status] || fallback;
  }
  private startPolling(): void {
    this.stopPolling();
    this.polls = 0;
    this.poll = setInterval(() => {
      // Never replace the working review form while somebody is evaluating an invoice.
      const activeRun = this.run();
      if (
        ++this.polls >= 20 ||
        !activeRun ||
        closed(activeRun) ||
        (this.definition()?.workflow_type === 'invoice' &&
          !['draft', 'queued', 'processing'].includes(activeRun.status))
      ) {
        this.stopPolling();
        return;
      }
      if (
        !this.pending() &&
        !this.invoicePending() &&
        !this.loading() &&
        document.visibilityState !== 'hidden'
      )
        this.load(false);
    }, 30000);
  }
  private stopPolling(): void {
    if (this.poll) {
      clearInterval(this.poll);
      this.poll = null;
    }
  }
  clearContent(): void {
    this.findings.set([]);
    this.exceptions.set([]);
    this.comments.set([]);
    this.artifacts.set([]);
    this.inspected.set(null);
    this.findingError.set('');
    this.comment = '';
    this.resolution = '';
    for (const url of this.objectUrls) URL.revokeObjectURL(url);
    this.objectUrls.clear();
  }
  private clear(): void {
    this.invoicePending.set(false);
    this.contractCompletionBlocked.set(true);
    this.clearContent();
    this.run.set(null);
    this.definition.set(null);
    this.version.set(null);
    this.steps.set([]);
    this.memberships.set([]);
    this.assignment = null;
    this.cancelConfirmed = false;
  }
  load(manual = true): void {
    if (this.pending() || this.invoicePending()) return;
    const gen = ++this.generation;
    this.refreshCancel.next();
    this.clear();
    this.contentDenied = false;
    this.contentError.set('');
    this.sectionErrors.set({});
    this.sectionsLoading.set({});
    this.loading.set(true);
    if (manual) this.error.set('');
    this.api
      .run(this.uuid)
      .pipe(timeout(15000), takeUntil(this.refreshCancel), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (r) => {
          if (gen !== this.generation) return;
          this.run.set(r);
          this.loading.set(false);
          if (closed(r) || (this.definition()?.workflow_type === 'invoice' &&
              !['draft', 'queued', 'processing'].includes(r.status))) this.stopPolling();
          this.realtime.subscribeDocuments(r.documents);
          this.read(this.api.definition(r.definition_uuid), 'definition', gen, (d) => {
            this.definition.set(d);
            if (d.workflow_type === 'invoice' &&
                !['draft', 'queued', 'processing'].includes(r.status)) this.stopPolling();
          });
          this.read(this.api.version(r.version_uuid), 'version', gen, (v) => this.version.set(v));
          this.read(this.api.steps(r.uuid), 'steps', gen, (s) => this.steps.set(s));
          this.read(this.api.findings(r.uuid), 'findings', gen, (x) => this.findings.set(x), true);
          this.read(
            this.api.exceptions(r.uuid),
            'exceptions',
            gen,
            (x) => this.exceptions.set(x),
            true,
          );
          this.read(this.api.comments(r.uuid), 'comments', gen, (x) => this.comments.set(x), true);
          this.read(
            this.api.artifacts(r.uuid),
            'artifacts',
            gen,
            (x) => this.artifacts.set(x),
            true,
          );
          if (r.capabilities.assign)
            this.read(this.governance.memberships(), 'memberships', gen, (m) =>
              this.memberships.set(m.filter((x) => x.is_active)),
            );
        },
        error: (e) => {
          if (gen !== this.generation) return;
          this.clear();
          this.loading.set(false);
          this.stopPolling();
          this.error.set(this.safeMessage(e, 'Unable to load this workflow run.'));
        },
      });
  }
  private read<T>(
    source: Observable<T>,
    section: string,
    gen: number,
    set: (value: T) => void,
    protectedContent = false,
  ): void {
    this.sectionsLoading.update((s) => ({ ...s, [section]: true }));
    source
      .pipe(timeout(15000), takeUntil(this.refreshCancel), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (x) => {
          if (gen !== this.generation) return;
          this.sectionsLoading.update((s) => ({ ...s, [section]: false }));
          if (!protectedContent || !this.contentDenied) set(x);
        },
        error: (e) => {
          if (gen !== this.generation) return;
          this.sectionsLoading.update((s) => ({ ...s, [section]: false }));
          if (
            !protectedContent &&
            e instanceof HttpErrorResponse &&
            [401, 403, 404].includes(e.status)
          ) {
            this.refreshCancel.next();
            this.generation++;
            this.clear();
            this.stopPolling();
            this.error.set(this.safeMessage(e, 'This workflow resource is unavailable.'));
            return;
          }
          if (
            protectedContent &&
            e instanceof HttpErrorResponse &&
            [401, 403, 404].includes(e.status)
          ) {
            this.contentDenied = true;
            this.clearContent();
            this.contentError.set(this.safeMessage(e, 'Workflow content is unavailable.'));
            if (e.status !== 403) {
              this.refreshCancel.next();
              this.generation++;
              this.clear();
              this.stopPolling();
              this.error.set(this.contentError());
            }
          } else
            this.sectionErrors.update((s) => ({
              ...s,
              [section]: this.safeMessage(e, 'Unable to load ' + section + '.'),
            }));
        },
      });
  }
  can(action: keyof Run['capabilities']): boolean {
    const r = this.run();
    return !!r && !closed(r) && r.capabilities[action] && !this.contentDenied;
  }
  stepName(key: string | null): string {
    return this.version()?.steps.find((s) => s.key === key)?.name || key || 'No current step';
  }
  assignmentText(s: StepRun): string {
    const a = s.assignment;
    return !a
      ? 'Unassigned'
      : a.user
        ? 'User ' + a.user
        : [a.department ? 'Department ' + a.department : '', a.role ? label(a.role) : '']
            .filter(Boolean)
            .join(' | ');
  }
  command(input: CommandInput): void {
    const r = this.run();
    const capability = input.action === 'accept' ? 'review' : input.action;
    if (
      input.action === 'accept' &&
      ['contract_review', 'legal_clause_intelligence'].includes(
        this.definition()?.workflow_type || '',
      ) &&
      this.contractCompletionBlocked()
    )
      return;
    if (!r || this.pending() || this.invoicePending() || !this.can(capability)) return;
    if (input.action === 'cancel' && !this.cancelConfirmed) return;
    if (input.action === 'comment' && !input.comment.trim()) return;
    if (input.action === 'resolve_exception' && !input.resolution.trim()) return;
    const fingerprint = JSON.stringify({ uuid: r.uuid, revision: r.revision, input });
    if (this.commandAttempt?.fingerprint !== fingerprint)
      this.commandAttempt = {
        fingerprint,
        body: { ...input, expected_revision: r.revision, idempotency_key: crypto.randomUUID() },
      };
    this.pending.set(true);
    this.error.set('');
    const gen = this.generation;
    this.api
      .command(r.uuid, this.commandAttempt.body)
      .pipe(timeout(15000), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: () => {
          this.pending.set(false);
          if (gen !== this.generation) return;
          this.commandAttempt = null;
          this.load(false);
        },
        error: (e) => {
          this.pending.set(false);
          if (gen !== this.generation) return;
          if (e instanceof HttpErrorResponse && e.status === 409) {
            this.commandAttempt = null;
            this.toasts.warning(
              'Another action changed this workflow. Current state has been refreshed; review it before acting again.',
            );
            this.load(false);
          } else {
            this.error.set(
              this.safeMessage(
                e,
                'Unable to confirm the action. Retry the same action to check this submission.',
              ),
            );
            if (e instanceof HttpErrorResponse && [401, 403, 404].includes(e.status)) {
              this.clear();
              this.refreshCancel.next();
              this.generation++;
              this.stopPolling();
            }
          }
        },
      });
  }
  invoiceRefreshed(message: string): void {
    this.invoicePending.set(false);
    this.toasts.success(message);
    this.load(false);
  }
  invoiceDenied(message: string): void {
    this.generation++;
    this.refreshCancel.next();
    this.contentDenied = true;
    this.clearContent();
    this.contentError.set(message);
    this.stopPolling();
    this.invoicePending.set(false);
  }
  assign(): void {
    if (this.assignment) this.command({ action: 'assign', assignment: this.assignment });
  }
  resolve(ex: Exception): void {
    if (ex.status === 'open')
      this.command({
        action: 'resolve_exception',
        exception: ex.uuid,
        resolution: this.resolution,
      });
  }
  canReviewFinding(f: Finding): boolean {
    const r = this.run();
    if (!r || this.contentDenied) return false;
    if (this.definition()?.workflow_type === 'invoice') {
      // Server accepts invoice finding decisions ONLY on the active waiting
      // human-review step. Older API responses without these keys fail closed.
      return r.status === 'review_required' && this.can('review') &&
        f.status === 'open' && f.review_state === 'unreviewed' &&
        f.step_key === r.current_step && f.step_run_status === 'waiting' &&
        this.steps().some((s) => s.key === r.current_step &&
          s.step_type === 'human_review' && s.status === 'waiting');
    }
    return this.can('administer') || this.can('review') || this.can('resolve_exception');
  }
  reviewFinding(f: Finding, status: FindingDecision): void {
    const r = this.run();
    if (!r || !this.canReviewFinding(f) || this.pending() || this.invoicePending()) return;
    this.findingError.set('');
    this.pending.set(true);
    const gen = this.generation;
    this.api
      .reviewFinding(r.uuid, f.uuid, status)
      .pipe(timeout(15000), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (updated) => {
          this.pending.set(false);
          if (gen === this.generation) {
            this.findings.update((rows) =>
              rows.map((x) => (x.uuid === updated.uuid ? updated : x)),
            );
            this.toasts.success('Finding decision recorded in workflow history.');
          }
        },
        error: (e) => {
          this.pending.set(false);
          if (gen !== this.generation) return;
          this.findingError.set(
            e instanceof HttpErrorResponse && [400, 409, 422].includes(e.status)
              ? 'This finding cannot be decided in the current review step. Correct the invoice field and refresh the workflow state.'
              : this.safeMessage(e, 'Unable to review finding.'),
          );
          this.error.set(this.findingError());
          if (e instanceof HttpErrorResponse && [401, 403, 404].includes(e.status)) {
            this.clearContent();
            this.contentDenied = true;
            this.contentError.set(this.error());
          }
          if (e instanceof HttpErrorResponse && e.status === 409) this.load(false);
        },
      });
  }
  artifact(uuid: string, download = false): void {
    const r = this.run();
    if (!r || this.pending() || this.invoicePending() || this.contentDenied) return;
    const gen = this.generation;
    this.pending.set(true);
    this.api
      .artifacts(r.uuid)
      .pipe(timeout(15000), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (rows) => {
          this.pending.set(false);
          if (gen !== this.generation || this.contentDenied) return;
          const artifact = rows.find((x) => x.uuid === uuid);
          if (!artifact) {
            this.clearContent();
            this.contentDenied = true;
            this.contentError.set('This artifact is no longer available.');
            return;
          }
          this.artifacts.set(rows);
          if (!download) {
            this.inspected.set(artifact);
            return;
          }
          const url = URL.createObjectURL(
            new Blob([JSON.stringify(artifact, null, 2)], { type: 'application/json' }),
          );
          this.objectUrls.add(url);
          const a = document.createElement('a');
          a.href = url;
          a.download = `workflow-artifact-${artifact.uuid}.json`;
          a.click();
          URL.revokeObjectURL(url);
          this.objectUrls.delete(url);
          this.toasts.success('Workflow artifact downloaded.');
        },
        error: (e) => {
          this.pending.set(false);
          if (gen !== this.generation) return;
          this.clearContent();
          this.contentDenied = true;
          this.contentError.set(
            this.safeMessage(
              e,
              'Artifact access is unavailable. Refresh to check current permissions.',
            ),
          );
        },
      });
  }
}
