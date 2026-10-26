import { Component, DestroyRef, Input, OnChanges, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subject, takeUntil, timeout } from 'rxjs';
import { Json } from '../models/workflow.model';
import { ClauseAnalysis } from '../models/legal-clause.model';
import { LegalClauseService } from '../services/legal-clause.service';
import { RFPWorkflowService } from '../services/rfp-workflow.service';
import { DocumentGovernanceService } from '../../documents/services/document-governance.service';
import { DocumentRealtimeService } from '../../../core/realtime/document-realtime.service';
@Component({
  selector: 'app-rfp-legal-reference',
  standalone: true,
  imports: [RouterLink],
  styleUrls: ['../workflow.scss'],
  template: `@if (analysis(); as a) {
      <p>
        Legal clause analysis {{ a.analysis_uuid }} · Revision {{ a.revision }} ·
        {{ a.coverage.complete ? 'Source coverage complete' : 'Source coverage requires review' }}
      </p>
      <a [routerLink]="['/workflows/runs', a.workflow_uuid]"
        >Open existing Legal Clause Intelligence analysis</a
      >
    }
    @if (error()) {
      <p role="alert">{{ error() }}</p>
    }`,
})
export class RFPLegalReferenceComponent implements OnChanges {
  @Input({ required: true }) value!: Json;
  private legal = inject(LegalClauseService);
  private api = inject(RFPWorkflowService);
  private governance = inject(DocumentGovernanceService);
  private realtime = inject(DocumentRealtimeService);
  private destroy = inject(DestroyRef);
  private cancel = new Subject<void>();
  readonly analysis = signal<ClauseAnalysis | null>(null);
  readonly error = signal('');
  constructor() {
    for (const events of [this.api.revoked$, this.governance.changes$, this.realtime.revoked$])
      events.pipe(takeUntilDestroyed(this.destroy)).subscribe(() => {
        this.cancel.next();
        this.analysis.set(null);
      });
    this.destroy.onDestroy(() => {
      this.cancel.next();
      this.cancel.complete();
    });
  }
  ngOnChanges() {
    this.cancel.next();
    this.analysis.set(null);
    this.error.set('');
    const value = this.value;
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      typeof value['analysis_uuid'] !== 'string'
    )
      return;
    this.legal
      .analysis(value['analysis_uuid'])
      .pipe(timeout(15000), takeUntil(this.cancel), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (a) => {
          this.analysis.set(a);
          this.realtime.subscribeDocuments([a.document_uuid]);
        },
        error: (e) => this.error.set(this.api.message(e)),
      });
  }
}
