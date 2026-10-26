import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { interval } from 'rxjs';
import { ToastService } from '../../../core/notifications/toast.service';
import { DocumentsService } from '../../documents/services/documents.service';
import { DocumentDetail, DocumentListRecord, DepartmentOption } from '../../documents/models/document.model';
import { InvoiceBatch, InvoiceBatchPage } from '../models/invoice-batch.model';
import { Definition } from '../models/workflow.model';
import { InvoiceBatchService } from '../services/invoice-batch.service';
import { WorkflowService } from '../services/workflow.service';

@Component({
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink],
  templateUrl: './invoice-batches.component.html',
  styleUrls: ['../workflow.scss', './invoice-batches.component.scss'],
})
export class InvoiceBatchesComponent {
  private readonly api = inject(InvoiceBatchService);
  private readonly workflows = inject(WorkflowService);
  private readonly documentsApi = inject(DocumentsService);
  private readonly toasts = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);

  readonly batches = signal<InvoiceBatchPage | null>(null);
  readonly selected = signal<InvoiceBatch | null>(null);
  readonly definitions = signal<Definition[]>([]);
  readonly documents = signal<DocumentListRecord[]>([]);
  readonly departments = signal<DepartmentOption[]>([]);
  readonly loading = signal(false);
  readonly pending = signal(false);
  readonly error = signal('');
  readonly uploadError = signal('');
  readonly uploadedIds = signal<string[]>([]);
  readonly pendingFiles = signal<File[]>([]);
  readonly selectedDocuments = signal<string[]>([]);
  readonly uploadStatus = signal('');
  readonly handoffDocument = signal<DocumentListRecord | null>(null);
  readonly handoffError = signal('');
  readonly handoffLoading = signal(false);
  existingSearch = '';
  name = '';
  definitionUuid = '';
  departmentUuid = '';
  sensitivity = 'internal';
  search = '';
  page = 1;
  private idempotencyKey = '';
  private detailGeneration = 0;
  private listGeneration = 0;
  private handoffGeneration = 0;
  private handoffUuid = '';

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroy)).subscribe((params) => {
      const uuid = params.get('document') ?? '';
      if (uuid === this.handoffUuid) return;
      this.handoffUuid = uuid;
      this.resolveDocumentHandoff(uuid);
    });
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroy)).subscribe((params) => {
      const uuid = params.get('uuid');
      if (uuid) this.loadDetail(uuid);
      else { ++this.detailGeneration; this.selected.set(null); this.load(); }
    });
    interval(10000).pipe(takeUntilDestroyed(this.destroy)).subscribe(() => {
      const batch = this.selected();
      if (batch && batch.progress.processing > 0) this.loadDetail(batch.uuid, true);
    });
  }

  /**
   * Deep links are hints, not grants of access. Resolve through an authorized
   * INTERNAL document read, never by trusting a title, company, or scope in the URL.
   */
  private resolveDocumentHandoff(uuid: string): void {
    const generation = ++this.handoffGeneration;
    this.handoffDocument.set(null);
    this.handoffError.set('');
    this.handoffLoading.set(false);
    this.selectedDocuments.set([]);
    this.idempotencyKey = '';
    if (!uuid) return;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) {
      this.handoffError.set('Invalid invoice document link. Open the document in DOCU-X and try again.');
      return;
    }
    this.handoffLoading.set(true);
    this.documentsApi.getDocument(uuid, 'internal')
      .pipe(takeUntilDestroyed(this.destroy)).subscribe({
        next: (doc) => {
          if (generation !== this.handoffGeneration) return;
          this.handoffLoading.set(false);
          if (!this.isEligibleHandoff(doc, uuid)) {
            this.handoffError.set('This source cannot be prepared as an invoice. Check its document type, readiness and edit access in Documents.');
            return;
          }
          this.handoffDocument.set({
            uuid: doc.uuid,
            title: doc.title,
            original_filename: doc.original_filename,
            document_type: doc.document_type,
            status: doc.status,
            sensitivity_label: doc.sensitivity_label,
          });
          this.selectedDocuments.set([doc.uuid]);
        },
        error: () => {
          if (generation !== this.handoffGeneration) return;
          this.handoffLoading.set(false);
          this.handoffError.set('This invoice is unavailable with your current internal document permissions.');
        },
      });
  }

  private isEligibleHandoff(doc: DocumentDetail, uuid: string): boolean {
    return doc.uuid === uuid && doc.document_type === 'invoice' && doc.status === 'ready' &&
      ['edit', 'review', 'approve', 'admin'].includes(doc.current_user_access ?? '');
  }

  load(): void {
    const generation = ++this.listGeneration;
    this.loading.set(true);
    this.error.set('');
    this.api.list(this.page, this.search).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: (page) => {
        if (generation !== this.listGeneration) return;
        this.batches.set(page);
        this.loading.set(false);
      },
      error: (error) => {
        if (generation !== this.listGeneration) return;
        // A revoked document or tenant permission must not leave previous batch names on screen.
        this.batches.set(null);
        this.error.set(this.message(error));
        this.loading.set(false);
      },
    });
    this.workflows.definitions(1, 'invoice').pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: (page) => {
        if (generation !== this.listGeneration) return;
        this.definitions.set(page.results.filter((d) => d.is_active && d.latest_version));
        if (!this.definitions().some((d) => d.uuid === this.definitionUuid)) {
          this.definitionUuid = this.definitions()[0]?.uuid ?? '';
        }
      },
      error: (error) => {
        if (generation !== this.listGeneration) return;
        this.definitions.set([]);
        this.definitionUuid = '';
        this.error.set(this.message(error));
      },
    });
    this.documentsApi.getDocuments('internal', { document_type: 'invoice' })
      .pipe(takeUntilDestroyed(this.destroy)).subscribe({
        next: (documents) => {
          if (generation !== this.listGeneration) return;
          this.documents.set(documents);
        },
        error: (error) => {
          if (generation !== this.listGeneration) return;
          this.documents.set([]);
          this.selectedDocuments.set([]);
          this.error.set(this.message(error));
        },
      });
    this.documentsApi.getDepartments().pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: (departments) => {
        if (generation === this.listGeneration) this.departments.set(departments);
      },
      error: () => {
        if (generation === this.listGeneration) this.departments.set([]);
      },
    });
  }

  loadDetail(uuid: string, silent = false): void {
    const generation = ++this.detailGeneration;
    if (!silent) { this.loading.set(true); this.error.set(''); }
    this.api.detail(uuid).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: (batch) => {
        if (generation !== this.detailGeneration) return;
        this.selected.set(batch);
        this.loading.set(false);
      },
      error: (error) => {
        if (generation !== this.detailGeneration) return;
        this.selected.set(null);
        this.error.set(this.message(error));
        this.loading.set(false);
      },
    });
  }

  /** Add files without discarding files still queued after a partial upload. */
  filesChanged(event: Event): void {
    if (this.pending()) return;
    const input = event.target as HTMLInputElement;
    const incoming = Array.from(input.files ?? []);
    // Allow selecting the same file again after removing it from the queue.
    input.value = '';
    if (!incoming.length) return;
    const known = new Set(this.pendingFiles().map((file) => this.fileSignature(file)));
    const newFiles: File[] = [];
    let skipped = 0;
    for (const file of incoming) {
      const signature = this.fileSignature(file);
      if (known.has(signature)) { skipped++; continue; }
      known.add(signature);
      newFiles.push(file);
    }
    if (newFiles.length) this.pendingFiles.update((queued) => [...queued, ...newFiles]);
    this.uploadError.set(skipped ? `${skipped} file${skipped === 1 ? ' was' : 's were'} already in the upload queue.` : '');
    if (newFiles.length) this.idempotencyKey = '';
  }

  removePendingFile(index: number): void {
    if (this.pending() || index < 0 || index >= this.pendingFiles().length) return;
    this.pendingFiles.update((files) => files.filter((_, position) => position !== index));
    this.uploadError.set('');
    this.idempotencyKey = '';
  }

  private fileSignature(file: File): string {
    return `${file.name}\u0000${file.size}\u0000${file.lastModified}`;
  }

  selectedCount(): number {
    return new Set([...this.selectedDocuments(), ...this.uploadedIds()]).size + this.pendingFiles().length;
  }

  visibleDocuments(): DocumentListRecord[] {
    const needle = this.existingSearch.trim().toLocaleLowerCase();
    if (!needle) return this.documents();
    return this.documents().filter((document) =>
      `${document.title ?? ''} ${document.original_filename ?? ''}`.toLocaleLowerCase().includes(needle));
  }

  fileSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return 'Size unavailable';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  isSelectableStoredInvoice(doc: DocumentListRecord): boolean {
    // Metadata is not an AI classification. Do not offer clearly incompatible sources
    // or records whose list serializer expressly reports insufficient edit access.
    return (!doc.document_type || doc.document_type === 'invoice') &&
      !['failed', 'archived'].includes(doc.status ?? '') &&
      (!doc.current_user_access ||
        ['edit', 'review', 'approve', 'admin'].includes(doc.current_user_access));
  }

  toggleDocument(uuid: string): void {
    if (this.pending() || this.handoffLoading()) return;
    const doc = this.documents().find((item) => item.uuid === uuid) ??
      (this.handoffDocument()?.uuid === uuid ? this.handoffDocument() : null);
    if (!doc || !this.isSelectableStoredInvoice(doc)) return;
    this.selectedDocuments.update((items) => items.includes(uuid)
      ? items.filter((item) => item !== uuid) : [...items, uuid]);
    this.idempotencyKey = '';
  }

  submit(): void {
    const definition = this.definitions().find((item) => item.uuid === this.definitionUuid);
    const count = this.selectedCount();
    if (!definition?.latest_version || !this.name.trim() || count < 1 || count > 500 || this.pending() || this.handoffLoading()) {
      this.uploadError.set('Enter a batch name, choose a published invoice workflow and select 1–500 invoices.');
      return;
    }
    if (!this.idempotencyKey) this.idempotencyKey = crypto.randomUUID();
    this.pending.set(true);
    this.uploadError.set('');
    this.uploadStatus.set('Preparing invoice uploads…');
    const queuedAtStart = this.pendingFiles().length;
    this.uploadNext(() => this.startBatch(definition.latest_version!.uuid), queuedAtStart);
  }

  private uploadNext(done: () => void, total: number): void {
    const file = this.pendingFiles()[0];
    if (!file) { done(); return; }
    const current = total - this.pendingFiles().length + 1;
    this.uploadStatus.set(`Uploading invoice ${current} of ${total}…`);
    const body = new FormData();
    body.append('title', file.name);
    body.append('file', file);
    body.append('document_type', 'invoice');
    body.append('sensitivity_label', this.sensitivity);
    if (this.departmentUuid) body.append('department', this.departmentUuid);
    this.documentsApi.uploadInternalDocument(body).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: (document) => {
        this.uploadedIds.update((items) => [...items, document.uuid]);
        this.pendingFiles.update((items) => items.slice(1));
        this.uploadNext(done, total);
      },
      error: (error) => {
        this.uploadStatus.set('');
        this.uploadError.set(`Upload stopped at ${file.name}. Accepted documents remain available; retry the remaining files.`);
        this.error.set(this.message(error));
        this.pending.set(false);
      },
    });
  }

  private startBatch(version: string): void {
    this.uploadStatus.set('Creating invoice workflow runs…');
    const documents = [...new Set([...this.selectedDocuments(), ...this.uploadedIds()])];
    this.api.create(this.name.trim(), version, documents, this.idempotencyKey)
      .pipe(takeUntilDestroyed(this.destroy)).subscribe({
        next: (batch) => {
          this.pending.set(false);
          this.uploadStatus.set('');
          this.toasts.success(`Invoice batch started for ${batch.progress.total} document${batch.progress.total === 1 ? '' : 's'}.`);
          this.uploadedIds.set([]);
          this.pendingFiles.set([]);
          this.selectedDocuments.set([]);
          this.idempotencyKey = '';
          void this.router.navigate(['/workflows/invoice-batches', batch.uuid]);
        },
        error: (error) => { this.pending.set(false); this.uploadStatus.set(''); this.error.set(this.message(error)); },
      });
  }

  changePage(next: number): void { this.page = next; this.load(); }
  retryItem(itemUuid: string): void {
    const batch = this.selected();
    if (!batch || this.pending()) return;
    this.pending.set(true);
    this.error.set('');
    this.api.retryItem(batch.uuid, itemUuid).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: (updated) => {
        this.selected.set(updated);
        this.pending.set(false);
        this.toasts.success('Invoice workflow start retried.');
      },
      error: (error) => { this.pending.set(false); this.error.set(this.message(error)); },
    });
  }
  private message(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 403 || error.status === 404) return 'Invoice data is unavailable with your current permissions.';
      if (error.status === 409) return 'This request conflicts with an existing batch. Refresh and review it before retrying.';
      if (error.status === 400) return 'Check the selected documents and workflow policy before retrying.';
    }
    return 'Unable to load or start the invoice batch. Retry when the service is available.';
  }
}
