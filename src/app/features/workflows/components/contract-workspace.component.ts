import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { invoiceMoney, invoiceConfidence } from '../models/invoice.model';
import { Observable, Subject, takeUntil, timeout } from 'rxjs';
import { DocumentsService } from '../../documents/services/documents.service';
import { DocumentGovernanceService } from '../../documents/services/document-governance.service';
import { DocumentRealtimeService } from '../../../core/realtime/document-realtime.service';
import { Run, Version, StepRun, label } from '../models/workflow.model';
import {
  CONTRACT_FIELDS,
  ContractKey,
  ContractReview,
  ContractField,
  ContractOutput,
  ContractEvidence,
  ContractData,
  ContractRow,
  ContractValidation,
  contractValue,
} from '../models/contract.model';
import { LegalAnalysisComponent } from './legal-analysis.component';
import { ContractCollectionComponent } from './contract-collection.component';
import { ContractReviewService } from '../services/contract-review.service';

type Tab =
  | 'overview'
  | 'parties'
  | 'dates_term'
  | 'commercial_terms'
  | 'termination'
  | 'obligations'
  | 'clauses'
  | 'risks_findings'
  | 'evidence'
  | 'fields'
  | 'output'
  | 'clause_intelligence';
@Component({
  selector: 'app-contract-workspace',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe, ContractCollectionComponent, LegalAnalysisComponent],
  templateUrl: './contract-workspace.component.html',
  styleUrls: ['../workflow.scss', './contract.scss'],
})
export class ContractWorkspaceComponent {
  readonly run = input.required<Run>();
  readonly version = input<Version | null>(null);
  readonly steps = input<StepRun[]>([]);
  readonly busy = input(false);
  readonly refreshed = output<string>();
  readonly denied = output<string>();
  readonly busyChange = output<boolean>();
  readonly completionBlocked = output<boolean>();
  readonly sourceAccess = signal<string | null>(null);
  private readonly api = inject(ContractReviewService);
  private readonly docs = inject(DocumentsService);
  private readonly governance = inject(DocumentGovernanceService);
  private readonly realtime = inject(DocumentRealtimeService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly destroy = inject(DestroyRef);
  readonly contract = signal<ContractReview | null>(null);
  readonly fields = signal<ContractField[]>([]);
  readonly outputs = signal<ContractOutput[]>([]);
  readonly tab = signal<Tab>('overview');
  readonly tabs: Tab[] = [
    'overview',
    'parties',
    'dates_term',
    'commercial_terms',
    'termination',
    'obligations',
    'clauses',
    'risks_findings',
    'evidence',
    'fields',
    'output',
    'clause_intelligence',
  ];
  readonly tabTitle: Record<Tab, string> = {
    overview: 'Overview',
    parties: 'Parties',
    dates_term: 'Dates & term',
    commercial_terms: 'Commercial terms',
    termination: 'Termination',
    obligations: 'Obligations',
    clauses: 'Clauses',
    risks_findings: 'Risks & findings',
    evidence: 'Evidence',
    fields: 'Fields & history',
    output: 'Final output',
    clause_intelligence: 'Legal clause intelligence',
  };
  readonly loading = signal(false);
  readonly pending = signal(false);
  readonly error = signal('');
  readonly historyError = signal('');
  readonly evidence = signal<ContractEvidence[]>([]);
  readonly evidenceTitle = signal('');
  readonly editor = signal<ContractKey | null>(null);
  readonly preview = signal<SafeResourceUrl | null>(null);
  readonly previewBusy = signal(false);
  readonly outputRevision = signal<number | null>(null);
  readonly allFields = CONTRACT_FIELDS;

  readonly label = label;
  readonly value = contractValue;
  readonly money = invoiceMoney;
  readonly confidence = invoiceConfidence;
  readonly groups: { name: string; fields: ContractKey[] }[] = [
    {
      name: 'Overview',
      fields: [
        'contract_title',
        'contract_type',
        'effective_date',
        'expiration_date',
        'governing_law',
        'jurisdiction',
        'venue',
        'dispute_resolution',
        'auto_renewal',
        'contract_value',
      ],
    },
    {
      name: 'Dates and term',
      fields: [
        'effective_date',
        'execution_date',
        'start_date',
        'expiration_date',
        'renewal_date',
        'notice_deadline',
        'term_type',
        'initial_term',
        'renewal_term',
        'renewal_mechanism',
        'termination_notice_period',
        'auto_renewal',
      ],
    },
    {
      name: 'Commercial terms',
      fields: [
        'currency',
        'contract_value',
        'minimum_commitment',
        'maximum_commitment',
        'pricing',
        'payment_terms',
        'payment_frequency',
        'late_fees',
        'credits',
        'renewal_pricing',
        'price_increase',
        'liability_cap',
      ],
    },
    {
      name: 'Termination',
      fields: [
        'termination_for_convenience',
        'termination_for_cause',
        'termination_notice_period',
        'cure_period',
        'termination_fees',
        'survival_obligations',
      ],
    },
  ];
  correctionEvidence: ContractEvidence[] = [];
  draft = '';
  reason = '';

  private generation = 0;
  private unavailable = false;
  private historyLoaded = false;
  private outputLoaded = false;
  private readonly cancel = new Subject<void>();
  private readonly previewCancel = new Subject<void>();
  private previewIsPdf = false;
  private previewUrl: string | null = null;
  private readonly moneyFields = new Set([
    'contract_value',
    'minimum_commitment',
    'maximum_commitment',
  ]);
  constructor() {
    effect(() => {
      const run = this.run();
      this.load(run);
    });
    for (const stream of [this.governance.changes$, this.realtime.revoked$])
      stream.pipe(takeUntilDestroyed(this.destroy)).subscribe((uuid) => {
        if (uuid === '*' || this.run().documents.includes(uuid))
          this.invalidate(
            'Access changed. Contract values, evidence and output have been cleared.',
          );
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
    this.contract.set(null);
    this.sourceAccess.set(null);
    if (emit) this.completionBlocked.emit(true);
    this.fields.set([]);
    this.outputs.set([]);
    this.evidence.set([]);
    this.evidenceTitle.set('');
    this.editor.set(null);
    this.draft = '';
    this.evidenceDraft = '';
    this.correctionEvidence = [];
    this.reason = '';

    this.outputRevision.set(null);
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
          this.invalidate('Contract source is unavailable.');
          return;
        }
        this.contract.set(record);
        this.completionBlocked.emit(!record.coverage.complete || this.legalEnabled());
        this.request(
          this.docs.getDocument(record.document_uuid),
          gen,
          (d) => {
            if (d.uuid !== record.document_uuid) {
              this.invalidate('Contract source is unavailable.');
              return;
            }
            this.sourceAccess.set(d.current_user_access || null);
          },
          (e) => this.handle(e),
        );
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
            'Contract extraction has not produced a record yet. Workflow progress will update automatically.',
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
    if (tab === 'output') this.loadOutputs();
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
  knownField(key: string): ContractKey | null {
    return CONTRACT_FIELDS.includes(key as ContractKey) ? (key as ContractKey) : null;
  }
  rows(key: ContractKey, data = this.data()): ContractRow[] {
    const value = data[key];
    return Array.isArray(value) ? (value as unknown as ContractRow[]) : [];
  }
  columns(key: ContractKey): string[] {
    return (
      (
        {
          parties: [
            'legal_name',
            'role',
            'address',
            'jurisdiction',
            'registration_identifier',
            'signatory',
          ],
          key_contacts: ['name', 'role', 'email'],
          obligations: [
            'party',
            'action',
            'timing',
            'timing_type',
            'due_date',
            'condition',
            'frequency',
          ],
          key_clauses: ['category', 'section_heading', 'text'],
          schedule_dates: ['kind', 'raw_date', 'date', 'description'],
        } as Partial<Record<ContractKey, string[]>>
      )[key] || []
    );
  }
  collectionKey(): ContractKey {
    return this.tab() === 'clauses'
      ? 'key_clauses'
      : this.tab() === 'obligations'
        ? 'obligations'
        : 'parties';
  }
  activeFields(): ContractKey[] {
    return this.groups[
      this.tab() === 'dates_term'
        ? 1
        : this.tab() === 'commercial_terms'
          ? 2
          : this.tab() === 'termination'
            ? 3
            : 0
    ].fields;
  }
  evidenceDraft = '';
  updateEvidence(): boolean {
    if (!this.evidenceDraft.trim()) return true;
    try {
      const rows: unknown = JSON.parse(this.evidenceDraft);
      if (
        !Array.isArray(rows) ||
        rows.length > 20 ||
        rows.some(
          (r) => !r || typeof r !== 'object' || r.document_uuid !== this.contract()?.document_uuid,
        )
      )
        throw new Error();
      this.correctionEvidence = rows as ContractEvidence[];
      return true;
    } catch {
      this.error.set('Evidence must be a JSON list of source references for this contract.');
      return false;
    }
  }
  data(): ContractData {
    return this.contract()?.normalized || {};
  }
  display(key: ContractKey, data = this.data()): string {
    const v = data[key];
    return this.moneyFields.has(key)
      ? invoiceMoney(typeof v === 'string' ? v : null, data.currency)
      : contractValue(v);
  }
  provenance(key: ContractKey) {
    return this.contract()?.field_provenance[key] || null;
  }
  fieldHistory(key: ContractKey) {
    return this.fields().find((f) => f.field_key === key)?.corrections || [];
  }
  legalEnabled(): boolean {
    return !!this.version()?.steps.some((s) => {
      const options = s.configuration['options'];
      return (
        !!options &&
        typeof options === 'object' &&
        !Array.isArray(options) &&
        typeof options['clause_playbook_version'] === 'string' &&
        !!options['clause_playbook_version']
      );
    });
  }
  legalGate(blocked: boolean): void {
    this.completionBlocked.emit(blocked || !this.contract()?.coverage.complete);
  }
  confidenceThreshold(): string | null {
    const options = this.version()?.steps.find(
      (s) => s.step_type === 'processing' && s.configuration['adapter'] === 'contract_review',
    )?.configuration['options'];
    if (!options || typeof options !== 'object' || Array.isArray(options)) return null;
    const threshold = options['confidence_threshold'];
    return typeof threshold === 'string' && /^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(threshold)
      ? threshold
      : null;
  }
  lowConfidenceFields(): ContractKey[] {
    const threshold = this.confidenceThreshold();
    if (threshold === null) return [];
    return CONTRACT_FIELDS.filter((key) => {
      const score = this.provenance(key)?.confidence;
      return (
        this.provenance(key)?.review_status !== 'reviewed' &&
        score !== null &&
        score !== undefined &&
        Number.isFinite(Number(score)) &&
        Number(score) < Number(threshold)
      );
    });
  }
  orderedFields(): ContractKey[] {
    return [...CONTRACT_FIELDS];
  }
  issues(): ContractValidation[] {
    return this.contract()?.validation || [];
  }
  canCorrect(key: ContractKey): boolean {
    const r = this.run();
    const f = this.provenance(key);
    return (
      !!this.contract()?.extraction_uuid &&
      !!f?.field_uuid &&
      ['review', 'approve', 'admin'].includes(this.sourceAccess() || '') &&
      ((r.status === 'review_required' && r.capabilities.review) ||
        (r.status === 'exception' && r.capabilities.resolve_exception)) &&
      !this.unavailable
    );
  }
  openEdit(key: ContractKey): void {
    if (!this.canCorrect(key) || this.busy() || this.pending()) return;
    this.evidenceDraft = '';
    this.editor.set(key);
    this.correctionEvidence = structuredClone(this.provenance(key)?.evidence || []);
    this.reason = '';
    this.draft = this.provenance(key)?.corrected_value ?? this.provenance(key)?.raw_value ?? '';
    if (['parties', 'key_contacts', 'obligations', 'key_clauses', 'schedule_dates'].includes(key))
      this.draft = JSON.stringify(this.data()[key] ?? [], null, 2);
    this.error.set('');
    this.busyChange.emit(true);
    queueMicrotask(() => document.getElementById('contract-correction-value')?.focus());
  }
  cancelEdit(): void {
    if (this.pending()) return;
    this.editor.set(null);
    this.draft = '';
    this.evidenceDraft = '';
    this.correctionEvidence = [];
    this.reason = '';

    this.busyChange.emit(false);
  }
  saveCorrection(): void {
    const key = this.editor(),
      record = this.contract(),
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
    if (!this.updateEvidence()) return;
    const field = this.provenance(key)!;
    const corrected_value = this.draft;
    if (['parties', 'key_contacts', 'obligations', 'key_clauses', 'schedule_dates'].includes(key)) {
      try {
        const rows: unknown = JSON.parse(this.draft);
        if (!Array.isArray(rows) || rows.length > 100) throw new Error();
      } catch {
        this.error.set('Enter a valid JSON list with at most 100 source-supported rows.');
        return;
      }
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
        evidence: this.correctionEvidence,
      }),
      gen,
      () => {
        this.pending.set(false);
        this.cancelEdit();
        this.refreshed.emit(
          'Contract correction saved. Current values and workflow revision have been refreshed.',
        );
      },
      (e) => {
        this.pending.set(false);
        this.handle(e, 'correct');
      },
    );
  }
  loadHistory(): void {
    const record = this.contract();
    if (!record || this.historyLoaded) return;
    this.historyLoaded = true;
    const gen = this.generation;
    this.request(
      this.api.fields(record.uuid),
      gen,
      (rows) => this.fields.set(rows),
      (e) => {
        this.historyLoaded = false;
        this.historyError.set(this.api.message(e));
        this.handle(e);
      },
    );
  }
  loadOutputs(): void {
    const record = this.contract();
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
  selectedOutput(): ContractOutput | null {
    const all = this.outputs();
    return (
      all.find((o) => o.revision === this.outputRevision()) ||
      (!all.length ? this.contract()?.final_output || null : null)
    );
  }
  showEvidence(key: ContractKey): void {
    const field = this.provenance(key);
    if (!field) return;
    this.showProof(field.evidence, label(key));
  }
  showProof(rows: ContractEvidence[], title = 'Contract fact'): void {
    const uuid = this.contract()?.document_uuid;
    const safe = rows.filter(
      (e) => e.document_uuid === uuid && (e.preview || e.chunk_uuid || Number.isInteger(e.start)),
    );

    this.evidence.set(safe);
    this.evidenceTitle.set(title);
    this.tab.set('evidence');
  }
  openPreview(page?: number | null): void {
    const record = this.contract();
    if (!record || this.unavailable || this.previewBusy() || this.pending() || this.busy()) return;
    if (this.previewUrl) {
      this.preview.set(
        this.sanitizer.bypassSecurityTrustResourceUrl(
          this.previewUrl +
            (this.previewIsPdf && page && Number.isInteger(page) && page > 0
              ? '#page=' + page
              : ''),
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
          this.previewIsPdf = blob.type === 'application/pdf';
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
    this.previewIsPdf = false;
    this.preview.set(null);
    this.previewBusy.set(false);
  }
  canExport(): boolean {
    return (
      !!this.contract()?.final_output && this.run().status === 'completed' && !this.unavailable
    );
  }
  export(): void {
    const record = this.contract();
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
          this.error.set('Contract export returned no data.');
          return;
        }
        const url = URL.createObjectURL(response.body);
        try {
          const a = document.createElement('a');
          a.href = url;
          a.download =
            'contract-' +
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
