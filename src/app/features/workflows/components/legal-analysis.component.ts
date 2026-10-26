import { DatePipe, KeyValuePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Observable, Subject, takeUntil, timeout } from 'rxjs';
import { LegalClauseService } from '../services/legal-clause.service';
import { WorkflowService } from '../services/workflow.service';
import { DocumentsService } from '../../documents/services/documents.service';
import { DocumentGovernanceService } from '../../documents/services/document-governance.service';
import { DocumentRealtimeService } from '../../../core/realtime/document-realtime.service';
import { Run, Version, StepRun, label } from '../models/workflow.model';
import {
  ClauseAnalysis,
  ClauseInstance,
  ClauseDeviation,
  ClauseEvidence,
  ClauseType,
  ClauseFacts,
  ClauseCorrection,
  LegalOutput,
  LegalDecision,
  DecisionInput,
  FactValue,
  factValue,
  validScalar,
} from '../models/legal-clause.model';
import { LegalClauseCardComponent } from './legal-clause-card.component';
import { LegalComparisonComponent } from './legal-comparison.component';
import { ToastService } from '../../../core/notifications/toast.service';
type FactEdit = { key: string; value: FactValue; raw_value: string; evidence: ClauseEvidence[] };
@Component({
  selector: 'app-legal-analysis',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    DatePipe,
    KeyValuePipe,
    LegalClauseCardComponent,
    LegalComparisonComponent,
  ],
  templateUrl: './legal-analysis.component.html',
  styleUrls: ['../workflow.scss', './legal.scss'],
})
export class LegalAnalysisComponent {
  readonly run = input.required<Run>();
  readonly version = input<Version | null>(null);
  readonly steps = input<StepRun[]>([]);
  readonly busy = input(false);
  readonly refreshed = output<string>();
  readonly denied = output<string>();
  readonly busyChange = output<boolean>();
  readonly completionBlocked = output<boolean>();
  readonly api = inject(LegalClauseService);
  private readonly workflow = inject(WorkflowService);
  private readonly docs = inject(DocumentsService);
  private readonly governance = inject(DocumentGovernanceService);
  private readonly realtime = inject(DocumentRealtimeService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly destroy = inject(DestroyRef);
  private readonly toasts = inject(ToastService);
  readonly analysis = signal<ClauseAnalysis | null>(null);
  readonly loading = signal(false);
  readonly pending = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly sourceAccess = signal<string | null>(null);
  readonly proofs = signal<ClauseEvidence[]>([]);
  readonly preview = signal<SafeResourceUrl | null>(null);
  readonly previewImage = signal(false);
  readonly previewBusy = signal(false);
  readonly inspectedOutput = signal<LegalOutput | null>(null);
  readonly corrections = signal<ClauseCorrection[]>([]);
  readonly outputs = signal<LegalOutput[]>([]);
  readonly historyOpen = signal(false);
  readonly taxonomy = signal<ClauseType[]>([]);
  readonly taxonomyReady = signal(false);
  readonly workflowVersions = signal<Version[]>([]);
  readonly newRun = signal<string | null>(null);
  readonly tabs = ['clauses', 'comparison', 'history'] as const;
  readonly label = label;
  readonly value = factValue;
  readonly tab = signal<'clauses' | 'comparison' | 'history'>('clauses');
  target: { uuid: string; type: 'clause' | 'deviation' } | null = null;
  decision: LegalDecision = 'confirmed';
  reason = '';
  correction: ClauseInstance | null = null;
  classification = '';
  factEdits: FactEdit[] = [];
  clauseProofs: ClauseEvidence[] = [];
  correctionReason = '';
  proofStart: number | null = null;
  proofEnd: number | null = null;
  proofPage: number | null = null;
  proofText = '';
  proofConfirmed = false;
  historyPage = 1;
  historyNext = false;
  historyPrevious = false;
  taxonomyPage = 1;
  taxonomyNext = false;
  reanalyzeVersion = '';
  reanalyzeConfirmed = false;
  reanalysisOpen = false;
  private generation = 0;
  private readonly cancel = new Subject<void>();
  private attempt: { fingerprint: string; body: DecisionInput } | null = null;
  private reattempt: { version: string; key: string } | null = null;
  private objectUrl: string | null = null;
  private previewGeneration = 0;
  constructor() {
    effect(() => {
      this.run();
      this.load();
    });
    for (const events of [this.governance.changes$, this.realtime.revoked$, this.api.revoked$])
      events.pipe(takeUntilDestroyed(this.destroy)).subscribe((uuid) => {
        if (
          uuid === '*' ||
          this.run().documents.includes(uuid) ||
          uuid === this.analysis()?.document_uuid
        )
          this.invalidate(
            'Access changed. Protected legal content, history and drafts were cleared.',
          );
      });
    this.destroy.onDestroy(() => {
      this.clear();
      this.cancel.complete();
    });
  }
  clear(): void {
    this.generation++;
    this.cancel.next();
    this.closePreview();
    this.analysis.set(null);
    this.sourceAccess.set(null);
    this.proofs.set([]);
    this.corrections.set([]);
    this.outputs.set([]);
    this.inspectedOutput.set(null);
    this.taxonomy.set([]);
    this.taxonomyReady.set(false);
    this.workflowVersions.set([]);
    this.newRun.set(null);
    this.historyOpen.set(false);
    this.resetEditors();
    this.loading.set(false);
    this.pending.set(false);
    this.previewBusy.set(false);
    if (!this.destroy.destroyed) {
      this.busyChange.emit(false);
      this.completionBlocked.emit(true);
    }
  }
  invalidate(message: string): void {
    this.clear();
    this.error.set(message);
    this.denied.emit(message);
  }
  private resetEditors(): void {
    this.target = null;
    this.reason = '';
    this.decision = 'confirmed';
    this.correction = null;
    this.classification = '';
    this.factEdits = [];
    this.clauseProofs = [];
    this.correctionReason = '';
    this.proofText = '';
    this.proofStart = null;
    this.proofEnd = null;
    this.proofPage = null;
    this.proofConfirmed = false;
    this.reanalyzeVersion = '';
    this.reanalyzeConfirmed = false;
    this.reanalysisOpen = false;
    this.attempt = null;
    this.reattempt = null;
    if (!this.destroy.destroyed) this.busyChange.emit(false);
  }
  load(): void {
    this.clear();
    this.error.set('');
    this.loading.set(true);
    const g = this.generation;
    this.read(
      this.api.forRun(this.run().uuid),
      (a) => {
        if (g !== this.generation) return;
        if (
          a.workflow_uuid !== this.run().uuid ||
          !this.run().documents.includes(a.document_uuid)
        ) {
          this.invalidate('Source access could not be verified for this workflow.');
          return;
        }
        this.analysis.set(a);
        this.loading.set(false);
        this.updateGate();
        this.read(this.docs.getDocument(a.document_uuid), (doc) => {
          this.sourceAccess.set(doc.current_user_access || null);
        });
      },
      true,
    );
  }
  private read<T>(request: Observable<T>, accept: (v: T) => void, notReady = false): void {
    const g = this.generation;
    request
      .pipe(timeout(15000), takeUntil(this.cancel), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (v) => {
          if (g === this.generation) accept(v);
        },
        error: (e) => {
          if (g === this.generation) {
            this.loading.set(false);
            this.previewBusy.set(false);
            if (
              notReady &&
              e instanceof HttpErrorResponse &&
              e.status === 404 &&
              ['draft', 'queued', 'processing'].includes(this.run().status)
            ) {
              this.notice.set(
                'Clause analysis is not yet available. Workflow processing is in progress.',
              );
            } else this.fail(e);
          }
        },
      });
  }
  private mutate<T>(request: Observable<T>, accept: (v: T) => void): void {
    if (this.pending() || this.busy()) return;
    const g = this.generation;
    this.pending.set(true);
    this.busyChange.emit(true);
    this.error.set('');
    request
      .pipe(timeout(20000), takeUntil(this.cancel), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (v) => {
          if (g !== this.generation) return;
          this.pending.set(false);
          this.busyChange.emit(false);
          accept(v);
        },
        error: (e) => {
          if (g !== this.generation) return;
          this.pending.set(false);
          this.busyChange.emit(!!this.target || !!this.correction);
          this.fail(e);
        },
      });
  }
  fail(error: unknown): void {
    const message = this.api.message(error);
    if (error instanceof HttpErrorResponse && [401, 403, 404].includes(error.status)) {
      this.invalidate(message);
      return;
    }
    if (error instanceof HttpErrorResponse && error.status === 409) {
      this.resetEditors();
      this.refreshed.emit(message);
      this.load();
    }
    this.error.set(message);
  }
  reviewable(): boolean {
    return (
      !!this.analysis() &&
      !this.busy() &&
      !this.pending() &&
      ['review_required', 'exception'].includes(this.run().status) &&
      !!this.run().capabilities['review']
    );
  }
  correctable(): boolean {
    return this.reviewable() && ['admin', 'edit', 'review'].includes(this.sourceAccess() || '');
  }
  outputState(output: LegalOutput, uuid: string): string {
    return label(output.data.decisions.find((d) => d.target === uuid)?.decision || 'unreviewed');
  }
  state(uuid: string): string {
    return label(
      this.analysis()?.decisions.find((d) => d.target === uuid)?.decision || 'unreviewed',
    );
  }
  updateGate(): void {
    const a = this.analysis();
    const decisions = a?.decisions || [];
    const blocked =
      !a?.coverage.complete ||
      a.clauses.some((c) => !['confirmed', 'dismissed'].includes(c.review_state)) ||
      a.deviations.some(
        (d) =>
          ['ambiguous', 'coverage_insufficient'].includes(d.comparison) ||
          (['deviation', 'prohibited', 'not_detected'].includes(d.comparison) &&
            !decisions.some(
              (x) =>
                x.target === d.uuid &&
                ['accepted', 'dismissed', 'exception_approved'].includes(x.decision),
            )),
      );
    this.completionBlocked.emit(blocked);
  }
  tabKey(event: KeyboardEvent, index: number): void {
    if (
      !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) ||
      this.pending() ||
      this.target ||
      this.correction
    )
      return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? this.tabs.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + this.tabs.length) % this.tabs.length;
    this.changeTab(this.tabs[next]);
    document.getElementById('legal-tab-' + this.run().uuid + '-' + this.tabs[next])?.focus();
  }
  changeTab(tab: 'clauses' | 'comparison' | 'history'): void {
    if (this.pending() || this.target || this.correction) return;
    this.tab.set(tab);
    if (tab === 'history' && !this.historyOpen()) this.loadHistory();
  }
  showEvidence(proofs: ClauseEvidence[]): void {
    this.closePreview();
    this.proofs.set(proofs.filter((p) => p.document_uuid === this.analysis()?.document_uuid));
  }
  asyncPreview(proof: ClauseEvidence): void {
    if (
      this.previewBusy() ||
      this.pending() ||
      proof.document_uuid !== this.analysis()?.document_uuid ||
      !this.sourceAccess()
    )
      return;
    this.closePreview();
    this.previewBusy.set(true);
    const previewGeneration = this.previewGeneration;
    this.read(this.docs.getFile(proof.document_uuid, 'preview', 'internal'), (blob) => {
      if (previewGeneration !== this.previewGeneration) return;
      this.previewBusy.set(false);
      if (
        !blob.size ||
        blob.size > 50 * 1024 * 1024 ||
        !['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(
          blob.type,
        )
      ) {
        this.error.set('A safe PDF or image preview is unavailable.');
        return;
      }
      this.objectUrl = URL.createObjectURL(blob);
      this.previewImage.set(blob.type.startsWith('image/'));
      const page = Number.isInteger(proof.page) && Number(proof.page) > 0 ? proof.page : 1;
      this.preview.set(
        this.sanitizer.bypassSecurityTrustResourceUrl(
          this.objectUrl + (blob.type === 'application/pdf' ? '#page=' + page : ''),
        ),
      );
    });
  }
  closePreview(): void {
    this.previewGeneration++;
    this.previewBusy.set(false);
    this.preview.set(null);
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
  reviewClause(c: ClauseInstance): void {
    if (!this.reviewable()) return;
    this.target = { uuid: c.uuid, type: 'clause' };
    this.decision = 'confirmed';
    this.reason = '';
    this.attempt = null;
    this.busyChange.emit(true);
  }
  reviewDeviation(d: ClauseDeviation): void {
    if (!this.reviewable()) return;
    this.target = { uuid: d.uuid, type: 'deviation' };
    this.decision = 'accepted';
    this.reason = '';
    this.attempt = null;
    this.busyChange.emit(true);
  }
  choices(): LegalDecision[] {
    return this.target?.type === 'clause'
      ? ['confirmed', 'dismissed', 'needs_more_information']
      : [
          'accepted',
          'dismissed',
          'negotiation_required',
          'exception_approved',
          'needs_more_information',
        ];
  }
  cancelEdit(): void {
    if (this.pending()) return;
    this.resetEditors();
  }
  submitDecision(): void {
    const a = this.analysis();
    const t = this.target;
    if (
      !a ||
      !t ||
      !this.reviewable() ||
      !this.reason.trim() ||
      !this.choices().includes(this.decision)
    )
      return;
    const payload = {
      target: t.uuid,
      target_type: t.type,
      decision: this.decision,
      reason: this.reason.trim(),
      expected_revision: this.run().revision,
    };
    const fingerprint = JSON.stringify(payload);
    if (this.attempt?.fingerprint !== fingerprint)
      this.attempt = { fingerprint, body: { ...payload, idempotency_key: crypto.randomUUID() } };
    this.mutate(this.api.decide(a.analysis_uuid, this.attempt.body), () => {
      this.resetEditors();
      this.refreshed.emit('Legal decision saved. Current run and permissions have been refreshed.');
    });
  }
  editCorrection(c: ClauseInstance): void {
    if (!this.correctable()) return;
    this.correction = structuredClone(c);
    this.classification = c.clause_type;
    this.factEdits = Object.entries(c.facts).map(([key, f]) => ({ key, ...structuredClone(f) }));
    this.clauseProofs = structuredClone(c.evidence);
    this.correctionReason = '';
    this.target = null;
    this.busyChange.emit(true);
    if (!this.taxonomyReady()) {
      this.taxonomyPage = 1;
      this.read(this.api.taxonomy(), (p) => {
        this.taxonomy.set(p.results);
        this.taxonomyNext = !!p.next;
        this.taxonomyReady.set(!p.next);
      });
    }
  }
  moreTypes(): void {
    if (!this.taxonomyNext) return;
    this.read(this.api.taxonomy(++this.taxonomyPage), (p) => {
      this.taxonomy.update((rows) => [...rows, ...p.results]);
      this.taxonomyNext = !!p.next;
      this.taxonomyReady.set(!p.next);
    });
  }
  schema() {
    return this.taxonomy().find((t) => t.uuid === this.classification)?.fact_schema || {};
  }
  reclassify(uuid: string): void {
    this.classification = uuid;
    this.factEdits = Object.keys(this.schema()).map((key) => ({
      key,
      value: null,
      raw_value: '',
      evidence: [],
    }));
  }
  factType(key: string): string {
    return this.schema()[key]?.type || 'text';
  }
  enumValues(key: string): string[] {
    return this.schema()[key]?.values || [];
  }
  useProof(index: number): void {
    this.factEdits[index].evidence = structuredClone(this.clauseProofs);
  }
  replaceProof(): void {
    const a = this.analysis();
    const original = this.clauseProofs[0];
    if (
      !a ||
      !original ||
      !this.proofConfirmed ||
      !this.proofText.trim() ||
      !Number.isInteger(this.proofStart) ||
      !Number.isInteger(this.proofEnd) ||
      Number(this.proofStart) < 0 ||
      Number(this.proofEnd) <= Number(this.proofStart)
    )
      return;
    this.clauseProofs = [
      {
        document_uuid: a.document_uuid,
        governance_revision: original.governance_revision,
        page: this.proofPage,
        boundary: 'exact_text_offsets',
        bounding_box: null,
        start: Number(this.proofStart),
        end: Number(this.proofEnd),
        preview: this.proofText.slice(0, 500),
        method: 'explicit_source',
      },
    ];
    for (const f of this.factEdits) f.evidence = [];
    this.proofConfirmed = false;
  }
  correctionValid(): boolean {
    return (
      !!this.correction &&
      this.taxonomyReady() &&
      !!this.schema() &&
      this.taxonomy().some((t) => t.uuid === this.classification && t.is_active) &&
      !!this.correctionReason.trim() &&
      this.clauseProofs.length > 0 &&
      this.factEdits.every(
        (f) =>
          !!this.schema()[f.key] &&
          validScalar(f.value, this.schema()[f.key], true) &&
          (f.value === null ||
            (!!f.raw_value.trim() &&
              f.evidence.length > 0 &&
              (typeof f.value === 'boolean' || f.raw_value.includes(f.value)))),
      )
    );
  }
  saveCorrection(): void {
    const a = this.analysis();
    const c = this.correction;
    if (!a || !c || !this.correctable() || !this.correctionValid()) return;
    const facts: ClauseFacts = {};
    for (const f of this.factEdits) {
      if (f.value === null && (!f.raw_value.trim() || !f.evidence.length)) continue;
      facts[f.key] = { value: f.value, raw_value: f.raw_value, evidence: f.evidence };
    }
    this.mutate(
      this.api.correct(a.analysis_uuid, {
        clause: c.uuid,
        clause_type: this.classification,
        facts,
        evidence: this.clauseProofs,
        reason: this.correctionReason.trim(),
        expected_revision: this.run().revision,
      }),
      () => {
        this.resetEditors();
        this.refreshed.emit(
          'Correction saved as a new revision. Original evidence and facts are preserved. Review the updated comparisons.',
        );
      },
    );
  }
  loadHistory(delta = 0): void {
    const a = this.analysis();
    if (!a || this.pending()) return;
    this.historyPage += delta;
    this.read(this.api.corrections(a.analysis_uuid, this.historyPage), (p) => {
      this.corrections.set(p.results);
      this.historyNext = !!p.next;
      this.historyPrevious = !!p.previous;
      this.historyOpen.set(true);
    });
    if (!delta) this.read(this.api.outputs(a.analysis_uuid), (v) => this.outputs.set(v));
  }
  openReanalysis(): void {
    const a = this.analysis();
    if (!a || !this.run().capabilities['administer'] || this.pending()) return;
    this.reanalysisOpen = true;
    this.reanalyzeVersion = this.run().version_uuid;
    this.read(this.workflow.versions(this.run().definition_uuid), (v) =>
      this.workflowVersions.set(v),
    );
  }
  reanalyze(): void {
    const a = this.analysis();
    if (
      !a ||
      !this.run().capabilities['administer'] ||
      !this.reanalyzeConfirmed ||
      !this.workflowVersions().some((v) => v.uuid === this.reanalyzeVersion)
    )
      return;
    if (this.reattempt?.version !== this.reanalyzeVersion)
      this.reattempt = { version: this.reanalyzeVersion, key: crypto.randomUUID() };
    this.mutate(
      this.api.reanalyze(a.analysis_uuid, this.reanalyzeVersion, this.reattempt.key),
      (r) => {
        this.newRun.set(r.uuid);
        this.reanalysisOpen = false;
        this.reattempt = null;
        this.toasts.success(
          'A new workflow run was created. This historical analysis remains unchanged.',
        );
      },
    );
  }
  export(): void {
    const a = this.analysis();
    if (!a || this.run().status !== 'completed' || !this.sourceAccess()) return;
    this.mutate(this.api.export(a.analysis_uuid), (response) => {
      const blob = response.body;
      if (!blob?.size) {
        this.error.set('No export is available.');
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'legal-clause-analysis-' + a.analysis_uuid + '.json';
      link.click();
      URL.revokeObjectURL(url);
    });
  }
}
