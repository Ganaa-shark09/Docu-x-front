import { DatePipe, JsonPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Observable, Subject, takeUntil, timeout } from 'rxjs';
import { DocumentsService } from '../../documents/services/documents.service';
import { DocumentGovernanceService } from '../../documents/services/document-governance.service';
import { DocumentRealtimeService } from '../../../core/realtime/document-realtime.service';
import { Run, Version, StepRun, label } from '../models/workflow.model';
import {
  INVOICE_FIELDS,
  LINE_COLUMNS,
  InvoiceKey,
  InvoiceRecord,
  InvoiceField,
  InvoiceOutput,
  InvoiceEvidence,
  InvoiceLine,
  InvoiceData,
  InvoiceValidation,
  InvoiceAccountingStatus,
  invoiceMoney,
  invoiceValue,
  invoiceConfidence,
} from '../models/invoice.model';
import { InvoiceWorkflowService } from '../services/invoice-workflow.service';
import { InvoiceFieldComponent } from './invoice-field.component';
import { InvoiceLineItemsComponent } from './invoice-line-items.component';
type Tab = 'summary' | 'fields' | 'line_items' | 'evidence' | 'validation' | 'matches' | 'output';
@Component({
  selector: 'app-invoice-workspace',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    DatePipe,
    JsonPipe,
    InvoiceFieldComponent,
    InvoiceLineItemsComponent,
  ],
  templateUrl: './invoice-workspace.component.html',
  styleUrls: ['../workflow.scss', './invoice.scss'],
})
export class InvoiceWorkspaceComponent {
  readonly run = input.required<Run>();
  readonly version = input<Version | null>(null);
  readonly steps = input<StepRun[]>([]);
  readonly busy = input(false);
  readonly refreshed = output<string>();
  readonly denied = output<string>();
  readonly busyChange = output<boolean>();
  private readonly api = inject(InvoiceWorkflowService);
  private readonly docs = inject(DocumentsService);
  private readonly governance = inject(DocumentGovernanceService);
  private readonly realtime = inject(DocumentRealtimeService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly destroy = inject(DestroyRef);
  readonly invoice = signal<InvoiceRecord | null>(null);
  readonly fields = signal<InvoiceField[]>([]);
  readonly outputs = signal<InvoiceOutput[]>([]);
  readonly tab = signal<Tab>('summary');
  readonly tabs: Tab[] = [
    'summary',
    'fields',
    'line_items',
    'evidence',
    'validation',
    'matches',
    'output',
  ];
  readonly loading = signal(false);
  readonly pending = signal(false);
  readonly error = signal('');
  readonly historyError = signal('');
  readonly evidence = signal<InvoiceEvidence[]>([]);
  readonly evidenceTitle = signal('');
  readonly editor = signal<InvoiceKey | null>(null);
  readonly preview = signal<SafeResourceUrl | null>(null);
  readonly previewBusy = signal(false);
  readonly outputRevision = signal<number | null>(null);
  readonly accounting = signal<InvoiceAccountingStatus | null>(null);
  readonly accountingError = signal('');
  private postingKey = '';
  readonly allFields = INVOICE_FIELDS;
  readonly lineColumns = LINE_COLUMNS;
  readonly label = label;
  readonly value = invoiceValue;
  readonly money = invoiceMoney;
  readonly confidence = invoiceConfidence;
  readonly groups: { name: string; fields: InvoiceKey[] }[] = [
    {
      name: 'Invoice',
      fields: ['invoice_number', 'invoice_date', 'due_date', 'currency', 'invoice_reference'],
    },
    {
      name: 'Vendor',
      fields: ['vendor_name', 'vendor_identifier', 'vendor_tax_id', 'vendor_address'],
    },
    { name: 'Billing', fields: ['bill_to_name', 'bill_to_address', 'customer_reference'] },
    {
      name: 'Purchase order and payment',
      fields: ['purchase_order_number', 'payment_terms', 'payment_method'],
    },
    {
      name: 'Totals',
      fields: [
        'subtotal',
        'tax_total',
        'discount_total',
        'shipping_total',
        'other_charges',
        'grand_total',
        'amount_due',
      ],
    },
  ];
  draft = '';
  reason = '';
  lineDraft: InvoiceLine[] = [];
  private generation = 0;
  private unavailable = false;
  private historyLoaded = false;
  private outputLoaded = false;
  private readonly cancel = new Subject<void>();
  private readonly previewCancel = new Subject<void>();
  private previewUrl: string | null = null;
  private readonly moneyFields = new Set([
    'subtotal',
    'tax_total',
    'discount_total',
    'shipping_total',
    'other_charges',
    'grand_total',
    'amount_due',
  ]);
  constructor() {
    effect(() => {
      const run = this.run();
      this.load(run);
    });
    for (const stream of [this.governance.changes$, this.realtime.revoked$])
      stream.pipe(takeUntilDestroyed(this.destroy)).subscribe((uuid) => {
        if (uuid === '*' || this.run().documents.includes(uuid))
          this.invalidate('Access changed. Invoice values, evidence and output have been cleared.');
      });
    this.destroy.onDestroy(() => {
      this.generation++;
      this.cancel.next();
      this.cancel.complete();
      this.clear(false);
      this.previewCancel.complete();
    });
  }
  private clear(emit = true): void {
    this.invoice.set(null);
    this.fields.set([]);
    this.outputs.set([]);
    this.evidence.set([]);
    this.evidenceTitle.set('');
    this.editor.set(null);
    this.draft = '';
    this.reason = '';
    this.lineDraft = [];
    this.outputRevision.set(null);
    this.accounting.set(null);
    this.accountingError.set('');
    this.postingKey = '';
    this.historyLoaded = false;
    this.outputLoaded = false;
    this.closePreview();
    if (emit) this.busyChange.emit(false);
  }
  invalidate(message: string): void {
    this.unavailable = true;
    this.generation++;
    this.cancel.next();
    this.clear();
    this.loading.set(false);
    this.pending.set(false);
    this.error.set(message);
    this.denied.emit(message);
  }
  private load(run: Run): void {
    const gen = ++this.generation;
    this.cancel.next();
    this.clear();
    this.error.set('');
    this.historyError.set('');
    this.unavailable = false;
    this.loading.set(true);
    this.request(
      this.api.forRun(run.uuid),
      gen,
      (record) => {
        if (record.workflow_uuid !== run.uuid || !run.documents.includes(record.document_uuid)) {
          this.invalidate('Invoice source is unavailable.');
          return;
        }
        this.invoice.set(record);
        this.loading.set(false);
      },
      (error) => {
        this.loading.set(false);
        if (
          error instanceof HttpErrorResponse &&
          error.status === 404 &&
          ['draft', 'queued', 'processing'].includes(run.status)
        ) {
          this.error.set(
            'Invoice extraction has not produced a record yet. Workflow progress will update automatically.',
          );
          return;
        }
        this.handle(error);
      },
    );
  }
  private request<T>(
    source: Observable<T>,
    gen: number,
    next: (value: T) => void,
    error: (error: unknown) => void,
  ): void {
    source
      .pipe(timeout(15000), takeUntil(this.cancel), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (value) => {
          if (gen === this.generation && !this.unavailable) next(value);
        },
        error: (e) => {
          if (gen === this.generation && !this.unavailable) error(e);
        },
      });
  }
  private handle(error: unknown, operation = 'read'): void {
    const message = this.api.message(error, operation);
    if (error instanceof HttpErrorResponse && [401, 403, 404].includes(error.status))
      this.invalidate(message);
    else if (error instanceof HttpErrorResponse && error.status === 409) {
      this.cancelEdit();
      this.refreshed.emit(message);
    } else this.error.set(message);
  }
  changeTab(tab: Tab): void {
    if (this.pending() || this.editor()) return;
    this.tab.set(tab);
    if (tab === 'fields') this.loadHistory();
    if (tab === 'output') { this.loadOutputs(); this.loadAccounting(); }
  }
  tabKey(event: KeyboardEvent, index: number): void {
    const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!offset && !['Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? this.tabs.length - 1
          : (index + offset + this.tabs.length) % this.tabs.length;
    this.changeTab(this.tabs[next]);
    (event.currentTarget as HTMLElement).parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role=tab]')
      [next]?.focus();
  }
  data(): InvoiceData {
    return this.invoice()?.normalized || {};
  }
  display(key: InvoiceKey, data = this.data()): string {
    const v = data[key];
    return this.moneyFields.has(key)
      ? invoiceMoney(typeof v === 'string' ? v : null, data.currency)
      : invoiceValue(v);
  }
  provenance(key: InvoiceKey) {
    return this.invoice()?.field_provenance[key] || null;
  }
  fieldHistory(key: InvoiceKey) {
    return this.fields().find((f) => f.field_key === key)?.corrections || [];
  }
  confidenceThreshold(): string | null {
    const options = this.version()?.steps.find(
      (s) => s.step_type === 'processing' && s.configuration['adapter'] === 'invoice',
    )?.configuration['options'];
    if (!options || typeof options !== 'object' || Array.isArray(options)) return null;
    const threshold = options['confidence_threshold'];
    return typeof threshold === 'string' && /^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(threshold)
      ? threshold
      : null;
  }
  lowConfidenceFields(): InvoiceKey[] {
    const threshold = this.confidenceThreshold();
    if (threshold === null) return [];
    return INVOICE_FIELDS.filter((key) => {
      const score = this.provenance(key)?.extracted_confidence;
      return (
        score !== null &&
        score !== undefined &&
        Number.isFinite(Number(score)) &&
        Number(score) < Number(threshold)
      );
    });
  }
  orderedFields(): InvoiceKey[] {
    return [...INVOICE_FIELDS].sort(
      (a, b) =>
        Number(this.provenance(b)?.validation_status === 'invalid') -
        Number(this.provenance(a)?.validation_status === 'invalid'),
    );
  }
  issues(): InvoiceValidation[] {
    return this.invoice()?.validation || [];
  }
  blockingIssueCount(): number {
    return this.issues().filter((issue) => issue.blocking).length;
  }
  financialIssues(): InvoiceValidation[] {
    return this.issues().filter((i) =>
      [
        'totals_mismatch',
        'line_subtotal_mismatch',
        'line_total_mismatch',
        'line_items_subtotal_mismatch',
        'line_items_total_mismatch',
        'tax_validation_failed',
        'amount_due_differs',
        'invalid_currency_precision',
        'invalid_currency_amount',
      ].includes(i.code),
    );
  }
  financialState(): string {
    if (!this.steps().some((s) => s.key === 'validate_totals' && s.status === 'completed'))
      return 'NOT APPLICABLE · Financial validation has not completed';
    const issues = this.financialIssues();
    if (issues.some((i) => i.blocking)) return 'FAIL · Server reported financial discrepancies';
    if (issues.length) return 'WARNING · Server reported financial warnings';
    if (this.data().subtotal == null || this.data().grand_total == null)
      return 'NOT APPLICABLE · Required totals are unavailable';
    return 'PASS · Completed validation reported no financial discrepancies';
  }
  canCorrect(key: InvoiceKey): boolean {
    const r = this.run();
    const f = this.provenance(key);
    return (
      !!this.invoice()?.extraction_uuid &&
      !!f?.field_uuid &&
      f.document_uuid === this.invoice()?.document_uuid &&
      ((r.status === 'review_required' && r.capabilities.review) ||
        (r.status === 'exception' && r.capabilities.resolve_exception)) &&
      !this.unavailable
    );
  }
  openEdit(key: InvoiceKey): void {
    if (!this.canCorrect(key) || this.busy() || this.pending()) return;
    this.editor.set(key);
    this.reason = '';
    this.draft = this.provenance(key)?.corrected_value ?? this.provenance(key)?.raw_value ?? '';
    this.lineDraft = structuredClone(this.data().line_items || []);
    if (key === 'line_items' && !this.draft) this.draft = '[]';
    this.error.set('');
    this.busyChange.emit(true);
    queueMicrotask(() => document.getElementById('invoice-correction-value')?.focus());
  }
  cancelEdit(): void {
    if (this.pending()) return;
    this.editor.set(null);
    this.draft = '';
    this.reason = '';
    this.lineDraft = [];
    this.busyChange.emit(false);
  }
  saveCorrection(): void {
    const key = this.editor(),
      record = this.invoice(),
      run = this.run();
    if (
      !key ||
      !record?.extraction_uuid ||
      !this.canCorrect(key) ||
      this.pending() ||
      this.busy() ||
      !this.reason.trim()
    )
      return;
    const field = this.provenance(key)!;
    let corrected_value = this.draft;
    if (key === 'line_items') {
      let rows: unknown = this.lineDraft;
      if (!this.lineDraft.length) {
        try {
          rows = JSON.parse(this.draft);
        } catch {
          this.error.set('Enter a valid JSON list of source-verified line items.');
          return;
        }
      }
      if (
        !Array.isArray(rows) ||
        rows.length > 200 ||
        rows.some(
          (row) =>
            !row ||
            typeof row !== 'object' ||
            Array.isArray(row) ||
            Object.entries(row).some(
              ([column, value]) =>
                !LINE_COLUMNS.includes(column as (typeof LINE_COLUMNS)[number]) ||
                (value !== null && typeof value !== 'string'),
            ),
        )
      ) {
        this.error.set(
          'Use at most 200 line items with supported columns and string or null values.',
        );
        return;
      }
      corrected_value = JSON.stringify(rows);
    }
    if (this.reason.length > 4000 || new TextEncoder().encode(corrected_value).length > 262144) {
      this.error.set('Correction exceeds the supported size.');
      return;
    }
    this.pending.set(true);
    this.busyChange.emit(true);
    this.error.set('');
    const gen = this.generation;
    this.request(
      this.api.correct(record.extraction_uuid, field.field_uuid, {
        corrected_value,
        expected_revision: run.revision,
        reason: this.reason.trim(),
      }),
      gen,
      () => {
        this.pending.set(false);
        this.cancelEdit();
        this.refreshed.emit(
          'Invoice correction saved. Current values and workflow revision have been refreshed.',
        );
      },
      (e) => {
        this.pending.set(false);
        this.handle(e, 'correct');
      },
    );
  }
  loadHistory(): void {
    const record = this.invoice();
    if (!record || this.historyLoaded) return;
    this.historyLoaded = true;
    const gen = this.generation;
    this.request(
      this.api.fields(record.uuid),
      gen,
      (rows) => this.fields.set(rows.filter((f) => f.document_uuid === record.document_uuid)),
      (e) => {
        this.historyLoaded = false;
        this.historyError.set(this.api.message(e));
        this.handle(e);
      },
    );
  }
  loadOutputs(): void {
    const record = this.invoice();
    if (!record || this.outputLoaded) return;
    this.outputLoaded = true;
    const gen = this.generation;
    this.request(
      this.api.outputs(record.uuid),
      gen,
      (rows) => {
        const safe = rows.filter(
          (o) =>
            o.data.source.document_uuid === record.document_uuid &&
            o.data.source.workflow_uuid === this.run().uuid,
        );
        this.outputs.set(safe);
        this.outputRevision.set(safe[0]?.revision ?? record.final_output?.revision ?? null);
      },
      (e) => {
        this.outputLoaded = false;
        this.handle(e);
      },
    );
  }
  selectedOutput(): InvoiceOutput | null {
    const all = this.outputs();
    return (
      all.find((o) => o.revision === this.outputRevision()) ||
      (!all.length ? this.invoice()?.final_output || null : null)
    );
  }
  loadAccounting(): void {
    const record = this.invoice();
    if (!record || this.unavailable) return;
    this.accountingError.set('');
    const gen = this.generation;
    this.request(this.api.accountingStatus(record.uuid), gen,
      (status) => this.accounting.set(status),
      (error) => {
        this.accounting.set(null);
        if (error instanceof HttpErrorResponse && [401, 403, 404].includes(error.status)) this.handle(error);
        else this.accountingError.set('Accounting status is unavailable. Invoice export may still be available.');
      });
  }
  postAccounting(): void {
    const record = this.invoice();
    if (!record || this.accounting()?.status !== 'ready_to_post' || !this.run().capabilities.administer || this.pending() || this.busy()) return;
    if (!this.postingKey) this.postingKey = crypto.randomUUID();
    this.pending.set(true);
    this.accountingError.set('');
    const gen = this.generation;
    this.request(this.api.postAccounting(record.uuid, this.postingKey), gen,
      () => { this.pending.set(false); this.postingKey = ''; this.loadAccounting(); },
      (error) => { this.pending.set(false); this.accountingError.set(this.api.message(error, 'post')); });
  }
  reconcileAccounting(): void {
    const record = this.invoice();
    if (!record || this.accounting()?.status !== 'uncertain' || !this.run().capabilities.administer || this.pending() || this.busy()) return;
    this.pending.set(true);
    this.accountingError.set('');
    const gen = this.generation;
    this.request(this.api.reconcileAccounting(record.uuid), gen,
      () => { this.pending.set(false); this.loadAccounting(); },
      (error) => { this.pending.set(false); this.accountingError.set(this.api.message(error, 'reconcile')); });
  }
  showEvidence(key: InvoiceKey): void {
    const field = this.provenance(key);
    if (!field) return;
    this.showProof(field.evidence, label(key));
  }
  showProof(rows: InvoiceEvidence[], title = 'Line item'): void {
    const uuid = this.invoice()?.document_uuid;
    const safe = rows.filter(
      (e) => e.document_uuid === uuid && (e.preview || e.chunk_uuid || Number.isInteger(e.start)),
    );
    if (!safe.length) return;
    this.evidence.set(safe);
    this.evidenceTitle.set(title);
    this.tab.set('evidence');
  }
  openPreview(page?: number | null): void {
    const record = this.invoice();
    if (!record || this.unavailable || this.previewBusy() || this.pending() || this.busy()) return;
    if (this.previewUrl) {
      this.preview.set(
        this.sanitizer.bypassSecurityTrustResourceUrl(
          this.previewUrl + (page && Number.isInteger(page) && page > 0 ? '#page=' + page : ''),
        ),
      );
      return;
    }
    this.previewBusy.set(true);
    const gen = this.generation;
    this.docs
      .getFile(record.document_uuid, 'preview', 'internal')
      .pipe(
        timeout(15000),
        takeUntil(this.cancel),
        takeUntil(this.previewCancel),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: (blob) => {
          if (gen !== this.generation || this.unavailable) return;
          this.previewBusy.set(false);
          if (
            blob.type !== 'application/pdf' &&
            !/^image\/(png|jpeg|webp|gif|bmp)$/.test(blob.type)
          ) {
            this.error.set(
              'Inline preview is unavailable for this file type. Open the source document to inspect it.',
            );
            return;
          }
          this.previewUrl = URL.createObjectURL(blob);
          this.preview.set(
            this.sanitizer.bypassSecurityTrustResourceUrl(
              this.previewUrl +
                (blob.type === 'application/pdf' && page && Number.isInteger(page) && page > 0
                  ? '#page=' + page
                  : ''),
            ),
          );
        },
        error: (e) => {
          if (gen === this.generation) {
            this.previewBusy.set(false);
            this.handle(e, 'preview');
          }
        },
      });
  }
  closePreview(): void {
    this.previewCancel.next();
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = null;
    this.preview.set(null);
    this.previewBusy.set(false);
  }
  canExport(): boolean {
    return (
      !!this.invoice()?.final_output &&
      ['completed', 'approved'].includes(this.run().status) &&
      !this.unavailable
    );
  }
  export(): void {
    const record = this.invoice();
    if (!record || !this.canExport() || this.pending() || this.busy()) return;
    this.pending.set(true);
    this.busyChange.emit(true);
    const gen = this.generation;
    this.request(
      this.api.export(record.uuid),
      gen,
      (response) => {
        this.pending.set(false);
        this.busyChange.emit(false);
        if (!response.body) {
          this.error.set('Invoice export returned no data.');
          return;
        }
        const url = URL.createObjectURL(response.body);
        try {
          const a = document.createElement('a');
          a.href = url;
          a.download =
            'invoice-' +
            record.uuid +
            '-r' +
            (record.final_output?.revision || record.revision) +
            '.json';
          a.click();
        } finally {
          URL.revokeObjectURL(url);
        }
      },
      (e) => {
        this.pending.set(false);
        this.busyChange.emit(false);
        this.handle(e, 'export');
      },
    );
  }
}
