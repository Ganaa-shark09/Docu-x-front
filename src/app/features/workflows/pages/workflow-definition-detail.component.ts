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
  styleUrls: ['../workflow.scss'],
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
          this.loadDocuments(1);
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
      (this.singleDocument() && this.selected.length !== 1)
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
  isInvoice(): boolean {
    return this.definition()?.workflow_type === 'invoice';
  }
  nature(type: string): string {
    return ['human_review', 'approval'].includes(type) ? 'Human' : type === 'ai' ? 'AI' : 'System';
  }
}
