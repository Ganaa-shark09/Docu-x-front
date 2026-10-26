import { Component, DestroyRef, OnChanges, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, Subject, takeUntil, timeout } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SourceProofService } from './source-proof.service';
import {
  ProofContext,
  ProofGraph,
  Citation,
  Evidence,
  ClaimNode,
  ProofValue,
  HistoryPage,
} from './source-proof.models';
import { DocumentGovernanceService } from '../documents/services/document-governance.service';
import { DocumentRealtimeService } from '../../core/realtime/document-realtime.service';
@Component({
  selector: 'app-source-proof-panel',
  standalone: true,
  imports: [DatePipe, RouterLink],
  templateUrl: './source-proof-panel.component.html',
  styleUrls: ['./source-proof-panel.component.scss'],
})
export class SourceProofPanelComponent implements OnChanges {
  readonly kind = input<'run' | 'document'>('run');
  readonly contextUuid = input.required<string>();
  readonly epoch = input(0);
  private api = inject(SourceProofService);
  private destroy = inject(DestroyRef);
  private governance = inject(DocumentGovernanceService);
  private realtime = inject(DocumentRealtimeService);
  private cancel = new Subject<void>();
  private detailCancel = new Subject<void>();
  private citationCancel = new Subject<void>();
  private historyCancel = new Subject<void>();
  outputIndex = 0;
  selectedClaim = '';
  selectedEvidence = '';
  readonly opened = signal(false);
  readonly context = signal<ProofContext | null>(null);
  readonly graph = signal<ProofGraph | null>(null);
  readonly citation = signal<Citation | null>(null);
  readonly history = signal<HistoryPage | null>(null);
  readonly loading = signal(false);
  readonly detailLoading = signal(false);
  readonly citationLoading = signal(false);
  readonly historyLoading = signal(false);
  readonly error = signal('');
  readonly detailError = signal('');
  readonly citationError = signal('');
  readonly historyError = signal('');
  readonly denied = signal(false);
  page = 1;
  historyPage = 1;
  private generation = 0;
  private detailGeneration = 0;
  private citationGeneration = 0;
  constructor() {
    for (const events of [this.governance.changes$, this.realtime.revoked$])
      events.pipe(takeUntilDestroyed()).subscribe(() => {
        this.clear();
        this.denied.set(true);
        this.error.set(
          'Access changed. Source Proof was cleared. Refresh to check current permissions.',
        );
      });
    this.destroy.onDestroy(() => {
      this.clear();
      this.cancel.complete();
      this.detailCancel.complete();
      this.citationCancel.complete();
      this.historyCancel.complete();
    });
  }
  ngOnChanges() {
    this.clear();
    this.opened.set(false);
  }
  private clear() {
    this.outputIndex = 0;
    this.selectedClaim = '';
    this.selectedEvidence = '';
    this.generation++;
    this.detailGeneration++;
    this.citationGeneration++;
    this.cancel.next();
    this.detailCancel.next();
    this.citationCancel.next();
    this.historyCancel.next();
    this.context.set(null);
    this.graph.set(null);
    this.citation.set(null);
    this.history.set(null);
    this.loading.set(false);
    this.detailLoading.set(false);
    this.citationLoading.set(false);
    this.historyLoading.set(false);
    this.error.set('');
    this.detailError.set('');
    this.citationError.set('');
    this.historyError.set('');
    this.denied.set(false);
  }
  toggle() {
    if (this.opened()) {
      this.opened.set(false);
      this.clear();
      return;
    }
    this.opened.set(true);
    this.load();
  }
  load(page = 1) {
    this.clear();
    this.page = page;
    this.loading.set(true);
    const gen = this.generation;
    this.read(
      this.api.context(this.kind(), this.contextUuid(), page),
      gen,
      (v) => {
        this.context.set(v);
        this.watchEvidence(v.evidence);
        this.loading.set(false);
      },
      (e) => {
        this.loading.set(false);
        this.error.set(this.message(e));
      },
      this.cancel,
    );
  }
  private read<T>(
    request: Observable<T>,
    gen: number,
    accept: (value: T) => void,
    fail: (e: unknown) => void,
    cancel: Subject<void>,
  ) {
    request.pipe(timeout(20000), takeUntil(cancel), takeUntilDestroyed(this.destroy)).subscribe({
      next: (v) => {
        if (gen === this.generation) accept(v);
      },
      error: (e) => {
        if (gen !== this.generation) return;
        if (e instanceof HttpErrorResponse && [401, 403, 404].includes(e.status)) {
          this.clear();
          this.denied.set(true);
          this.error.set(this.message(e));
          return;
        }
        fail(e);
      },
    });
  }
  build() {
    this.selectedClaim = '';
    this.citationGeneration++;
    this.citationLoading.set(false);
    this.historyLoading.set(false);
    const field = this.context()?.output_fields?.[this.outputIndex];
    if (!field || this.detailLoading() || this.denied()) return;
    this.detailCancel.next();
    this.detailGeneration++;
    this.graph.set(null);
    this.citationCancel.next();
    this.historyCancel.next();
    this.citation.set(null);
    this.history.set(null);
    this.detailLoading.set(true);
    this.detailError.set('');
    this.read(
      this.api.build(field),
      this.generation,
      (v) => {
        this.graph.set(v);
        this.watchEvidence(v.evidence);
        this.detailLoading.set(false);
      },
      (e) => {
        this.detailLoading.set(false);
        this.detailError.set(this.message(e));
      },
      this.detailCancel,
    );
  }
  openClaim(uuid: string) {
    this.citationError.set('');
    this.historyError.set('');
    this.selectedEvidence = '';
    this.selectedClaim = uuid;
    this.citationGeneration++;
    this.citationLoading.set(false);
    this.historyLoading.set(false);
    this.detailCancel.next();
    this.citationCancel.next();
    this.historyCancel.next();
    this.detailGeneration++;
    const selected = this.detailGeneration;
    this.graph.set(null);
    this.citation.set(null);
    this.history.set(null);
    this.detailError.set('');
    this.detailLoading.set(true);
    const gen = this.generation;
    this.read(
      this.api.graph(uuid),
      gen,
      (v) => {
        if (selected === this.detailGeneration) {
          this.graph.set(v);
          this.watchEvidence(v.evidence);
          this.detailLoading.set(false);
        }
      },
      (e) => {
        if (selected === this.detailGeneration) {
          this.detailLoading.set(false);
          this.detailError.set(this.message(e));
        }
      },
      this.detailCancel,
    );
  }
  openEvidence(uuid: string) {
    this.historyError.set('');
    this.selectedEvidence = uuid;
    this.historyLoading.set(false);
    this.citationCancel.next();
    this.historyCancel.next();
    this.citationGeneration++;
    const selected = this.citationGeneration;
    this.citation.set(null);
    this.history.set(null);
    this.citationError.set('');
    this.citationLoading.set(true);
    this.read(
      this.api.citation(uuid),
      this.generation,
      (v) => {
        if (selected === this.citationGeneration) {
          this.citation.set(v);
          this.realtime.subscribeDocuments(v.documents.map((d) => d.uuid));
          this.citationLoading.set(false);
        }
      },
      (e) => {
        if (selected === this.citationGeneration) {
          this.citationLoading.set(false);
          this.citationError.set(this.message(e));
        }
      },
      this.citationCancel,
    );
  }
  loadHistory(page = 1) {
    this.historyCancel.next();
    const row = this.citation();
    if (!row) return;
    this.historyPage = page;
    this.history.set(null);
    this.historyError.set('');
    this.historyLoading.set(true);
    const selected = this.citationGeneration;
    this.read(
      this.api.history(row.uuid, page),
      this.generation,
      (v) => {
        if (selected === this.citationGeneration) {
          this.history.set(v);
          this.historyLoading.set(false);
        }
      },
      (e) => {
        this.historyLoading.set(false);
        this.historyError.set(this.message(e));
      },
      this.historyCancel,
    );
  }
  readonly label = (value: string) =>
    (
      ({
        fully_supported: 'Fully supported',
        partially_supported: 'Partially supported',
        unsupported: 'Unsupported',
        valid: 'Verified source',
        stale: 'Stale evidence',
        expired: 'Expired evidence',
        invalid: 'Invalid evidence',
        insufficient: 'Insufficient evidence',
      }) as Record<string, string>
    )[value] || value.replaceAll('_', ' ');
  reason(code: string) {
    return (
      (
        {
          validated_source: 'The server validated the source version and locator.',
          source_changed: 'The source changed after this evidence was captured.',
          legacy_unverified: 'This source has no verified location or historical lineage.',
          locator_invalid: 'The recorded location no longer matches the source.',
          evidence_expired: 'The evidence validity period has ended.',
          source_superseded: 'A source version changed or its review became due.',
          not_yet_effective: 'This evidence is not effective yet.',
          review_rejected: 'A reviewer rejected this evidence.',
        } as Record<string, string>
      )[code] ||
      'The server could not establish sufficient evidence. Inspect current verification details.'
    );
  }
  value(value: ProofValue): string {
    if (value === null) return 'No value recorded';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  }
  field(key: string) {
    try {
      const path = JSON.parse(key);
      if (Array.isArray(path)) return path.map(String).join(' / ').replaceAll('_', ' ');
    } catch {}
    return key.replaceAll('_', ' ');
  }
  location(row: Evidence) {
    const l = row.locator;
    const parts: string[] = [];
    if (typeof l['page'] === 'number') parts.push('Page ' + l['page']);
    if (typeof l['start'] === 'number' && typeof l['end'] === 'number')
      parts.push('Characters ' + l['start'] + ' to ' + l['end']);
    if (Array.isArray(l['path'])) parts.push('Output: ' + l['path'].join(' / '));
    if (typeof l['row'] === 'number') parts.push('Dataset row ' + l['row']);
    return parts.join(' | ') || this.label(row.locator_type);
  }
  currentNodes() {
    const g = this.graph();
    return g
      ? g.claims
          .filter((n) => n.claim_uuid === g.claim_uuid)
          .sort((a, b) => b.revision - a.revision)
      : [];
  }
  supports(node: ClaimNode) {
    return node.evidence.map((ref) => ({
      role: ref.role,
      row: this.graph()?.evidence.find((e) => e.uuid === ref.evidence_uuid),
    }));
  }
  sourceDocuments(row: Citation) {
    const uuid = row.locator['document_uuid'];
    return typeof uuid === 'string'
      ? row.documents.filter((doc) => doc.uuid === uuid)
      : row.documents;
  }
  private watchEvidence(rows: Evidence[]) {
    this.realtime.subscribeDocuments([
      ...new Set(
        rows.flatMap((row) => (row.source.pin.documents || []).map((doc) => doc.document_uuid)),
      ),
    ]);
  }
  private message(e: unknown) {
    const status = e instanceof HttpErrorResponse ? e.status : 0;
    return (
      (
        {
          401: 'Your session expired. Sign in again to view Source Proof.',
          403: 'Source Proof is unavailable under your current permissions.',
          404: 'This proof or source is no longer available.',
          400: 'The server could not build a valid proof graph for this source.',
          409: 'The source changed. Refresh before inspecting proof again.',
          422: 'The evidence cannot currently be verified.',
        } as Record<number, string>
      )[status] || 'Source Proof could not be loaded. Please retry.'
    );
  }
}
