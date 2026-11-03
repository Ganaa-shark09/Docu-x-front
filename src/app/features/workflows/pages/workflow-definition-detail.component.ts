import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, timeout } from 'rxjs';
import { Definition, Version, StartInput, label } from '../models/workflow.model';
import { WorkflowService } from '../services/workflow.service';
import { DocumentsService } from '../../documents/services/documents.service';
import { DocumentListRecord } from '../../documents/models/document.model';
import { DocumentGovernanceService } from '../../documents/services/document-governance.service';
import { Membership } from '../../documents/models/governance.model';
import { DocumentRealtimeService } from '../../../core/realtime/document-realtime.service';
import { AiApiErrorMessageService } from '../../ai-chat/services/ai-api-error-message.service';
import { WorkflowPublisherComponent } from '../components/workflow-publisher.component';
@Component({
  standalone: true,
  imports: [FormsModule, RouterLink, WorkflowPublisherComponent],
  templateUrl: './workflow-definition-detail.component.html',
  styleUrls: ['../workflow.scss', './workflow-definition-detail.component.scss'],
})
export class WorkflowDefinitionDetailComponent {
  private readonly api = inject(WorkflowService);
  private readonly docs = inject(DocumentsService);
  private readonly governance = inject(DocumentGovernanceService);
  private readonly realtime = inject(DocumentRealtimeService);
  private readonly destroy = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly errors = inject(AiApiErrorMessageService);
  private readonly route = inject(ActivatedRoute);
  readonly definition = signal<Definition | null>(null);
  readonly versions = signal<Version[]>([]);
  readonly documents = signal<DocumentListRecord[]>([]);
  readonly memberships = signal<Membership[]>([]);
  readonly loading = signal(false);
  readonly pending = signal(false);
  readonly error = signal('');
  readonly label = label;
  versionUuid = '';
  selected: string[] = [];
  showPublisher = false;
  showUnavailable = false;
  docPage = 1;
  docsLoading = signal(false);
  readonly docsHasNext = signal(false);
  readonly docsHasPrevious = signal(false);
  docsError = signal('');
  private generation = 0;
  private docGeneration = 0;
  private startAttempt: { fingerprint: string; input: StartInput } | null = null;
  uuid = '';
  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroy)).subscribe((p) => {
      this.uuid = p.get('uuid') || '';
      this.selected = [];
      this.startAttempt = null;
      this.showUnavailable = false;
      this.documents.set([]);
      this.docGeneration++;
      this.load();
    });
    for (const event of [this.governance.changes$, this.realtime.revoked$])
      event.pipe(takeUntilDestroyed(this.destroy)).subscribe(() => {
        this.selected = [];
        this.startAttempt = null;
        this.documents.set([]);
        this.memberships.set([]);
        this.showPublisher = false;
        this.load();
      });
  }
  private clearDenied(error: unknown): void {
    if (!(error instanceof HttpErrorResponse) || ![401, 403, 404].includes(error.status)) return;
    this.generation++;
    this.docGeneration++;
    this.definition.set(null);
    this.versions.set([]);
    this.documents.set([]);
    this.memberships.set([]);
    this.selected = [];
    this.showPublisher = false;
    this.showUnavailable = false;
    this.loading.set(false);
    this.docsLoading.set(false);
    this.startAttempt = null;
  }
  administrationDenied(): void {
    this.load();
    this.error.set(
      'Administration permission changed. Current workflow permissions are being refreshed.',
    );
  }
  load(): void {
    this.docGeneration++;
    this.documents.set([]);
    this.showUnavailable = false;
    const gen = ++this.generation;
    this.definition.set(null);
    this.versions.set([]);
    this.loading.set(true);
    this.error.set('');
    forkJoin({ definition: this.api.definition(this.uuid), versions: this.api.versions(this.uuid) })
      .pipe(timeout(15000), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (r) => {
          if (gen !== this.generation) return;
          this.definition.set(r.definition);
          this.versions.set(r.versions);
          if (!r.versions.some((v) => v.uuid === this.versionUuid))
            this.versionUuid = r.versions[0]?.uuid || '';
          this.loading.set(false);
          if (r.definition.capabilities.start && r.versions.length) this.loadDocuments(1);
          if (r.definition.capabilities.administer)
            this.governance
              .memberships()
              .pipe(timeout(15000), takeUntilDestroyed(this.destroy))
              .subscribe({
                next: (m) => {
                  if (gen === this.generation) this.memberships.set(m.filter((x) => x.is_active));
                },
                error: () => this.memberships.set([]),
              });
        },
        error: (e) => {
          if (gen === this.generation) {
            this.loading.set(false);
            this.error.set(this.errors.getMessage(e, 'Unable to load this workflow.'));
          }
        },
      });
  }
  isContract(): boolean {
    return this.definition()?.workflow_type === 'contract_review';
  }
  isInvoice(): boolean {
    return this.definition()?.workflow_type === 'invoice';
  }
  workflowKind(): string {
    return this.isContract() ? 'Contract review' : this.isInvoice() ? 'Invoice extraction' : 'Workflow';
  }
  backRoute(): string {
    return this.isContract() ? '/workflows/contract-workspace' :
      this.isInvoice() ? '/workflows/invoices' : '/workflows/definitions';
  }
  backLabel(): string {
    return this.isContract() ? 'Back to contract reviews' :
      this.isInvoice() ? 'Back to invoice workspace' : 'Back to definitions';
  }
  startTitle(): string {
    return this.isContract() ? 'Start contract review' :
      this.isInvoice() ? 'Start invoice workflow' : 'Start workflow';
  }
  documentHint(): string {
    return this.isContract()
      ? 'Choose one authorized, ready document. The server verifies document and field permissions before starting the contract review.'
      : this.isInvoice()
        ? 'Choose one authorized, ready invoice document. The server verifies document and field permissions before starting.'
        : 'Choose up to 20 accessible internal documents. The server verifies document and field permissions before starting.';
  }
  documentUploadHint(): string {
    return this.isContract() ? 'Prepare a contract document in Documents' :
      this.isInvoice() ? 'Prepare an invoice in Documents' : 'Prepare a document in Documents';
  }
  eligibleDocuments(): DocumentListRecord[] {
    return this.documents().filter((doc) => this.allowed(doc));
  }
  unavailableDocuments(): DocumentListRecord[] {
    return this.documents().filter((doc) => !this.allowed(doc));
  }
  documentReason(doc: DocumentListRecord): string {
    if (this.singleDocument() && doc.status !== 'ready') return 'Not ready';
    const types = this.version()?.allowed_document_types || [];
    return types.length && !types.includes(doc.document_type || '') ? 'Document type not allowed' : 'Not eligible';
  }
  documentTitle(doc: DocumentListRecord): string {
    return doc.title || doc.original_filename || doc.uuid;
  }
  versionChanged(): void {
    this.selected = [];
    this.startAttempt = null;
    this.showUnavailable = false;
  }
  nextSteps(key: string): string[] {
    return (this.version()?.transitions || []).filter((transition) => transition.source === key)
      .map((transition) => `${label(transition.outcome)} → ${transition.target}`);
  }
  workflowScope(): string {
    const department = this.definition()?.department;
    return department == null ? 'Company wide' : `Department ${department}`;
  }
  isReadyToStart(): boolean {
    const d = this.definition();
    return !!d?.is_active && !!d.capabilities.start && !!this.version();
  }
  version(): Version | undefined {
    return this.versions().find((v) => v.uuid === this.versionUuid);
  }
  loadDocuments(page = this.docPage): void {
    const gen = ++this.docGeneration;
    this.docPage = page;
    this.docsHasNext.set(false);
    this.docsHasPrevious.set(false);
    this.documents.set([]);
    this.docsLoading.set(true);
    this.docsError.set('');
    this.docs
      .getInternalDocumentPage(page)
      .pipe(timeout(15000), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (result) => {
          if (gen !== this.docGeneration) return;
          const d = result.results;
          this.docsHasNext.set(!!result.next);
          this.docsHasPrevious.set(!!result.previous);
          this.documents.set(
            d.filter((x) =>
              ['edit', 'review', 'approve', 'admin'].includes(x.current_user_access || ''),
            ),
          );
          this.docsLoading.set(false);
          this.realtime.subscribeDocuments(d.map((x) => x.uuid));
        },
        error: (e) => {
          if (gen === this.docGeneration) {
            this.documents.set([]);
            this.selected = [];
            this.docsLoading.set(false);
            this.docsError.set(
              this.errors.getMessage(e, 'Unable to load accessible internal documents.'),
            );
          }
        },
      });
  }
  allowed(d: DocumentListRecord): boolean {
    const types = this.version()?.allowed_document_types || [];
    return (
      (!this.singleDocument() || d.status === 'ready') &&
      (!types.length || types.includes(d.document_type || ''))
    );
  }
  checked(event: Event): boolean {
    return event.target instanceof HTMLInputElement && event.target.checked;
  }
  toggle(uuid: string, checked: boolean): void {
    if (this.pending()) return;
    if (this.singleDocument()) {
      this.selected = checked ? [uuid] : [];
      return;
    }
    this.selected = checked
      ? [...new Set([...this.selected, uuid])]
      : this.selected.filter((x) => x !== uuid);
  }
  start(): void {
    const d = this.definition();
    if (
      this.pending() ||
      !d?.capabilities.start ||
      !this.version() ||
      !this.selected.length ||
      this.selected.length > 20 ||
      (this.singleDocument() && this.selected.length !== 1) ||
      !d.is_active
    )
      return;
    const documents = [...this.selected].sort();
    const fingerprint = JSON.stringify({ version: this.versionUuid, documents });
    if (this.startAttempt?.fingerprint !== fingerprint)
      this.startAttempt = {
        fingerprint,
        input: { version: this.versionUuid, documents, idempotency_key: crypto.randomUUID() },
      };
    this.pending.set(true);
    this.error.set('');
    const gen = this.generation;
    this.api
      .start(this.startAttempt.input)
      .pipe(timeout(15000), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (r) => {
          this.pending.set(false);
          if (gen === this.generation) void this.router.navigate(['/workflows/runs', r.uuid]);
        },
        error: (e) => {
          this.pending.set(false);
          if (gen === this.generation) {
            this.error.set(
              this.errors.getMessage(
                e,
                'Unable to start workflow. Retry the same selection to check this submission.',
              ),
            );
            this.clearDenied(e);
          }
        },
      });
  }
  activate(): void {
    const d = this.definition();
    if (!d?.capabilities.administer || this.pending()) return;
    this.pending.set(true);
    const gen = this.generation;
    this.api
      .activate(d.uuid, !d.is_active)
      .pipe(timeout(15000), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (r) => {
          this.pending.set(false);
          if (gen === this.generation) this.definition.set(r);
        },
        error: (e) => {
          this.pending.set(false);
          if (gen === this.generation) {
            this.error.set(this.errors.getMessage(e, 'Unable to change activation.'));
            this.clearDenied(e);
          }
        },
      });
  }
  published(v: Version): void {
    this.showPublisher = false;
    this.versionUuid = v.uuid;
    this.load();
  }
  singleDocument(): boolean {
    return ['invoice', 'contract_review'].includes(this.definition()?.workflow_type || '');
  }
  nature(type: string): string {
    return ['human_review', 'approval'].includes(type) ? 'Human' : type === 'ai' ? 'AI' : 'System';
  }
}
