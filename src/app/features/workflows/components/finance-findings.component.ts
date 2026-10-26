import { EntityPickerComponent } from '../../../shared/entity-picker/entity-picker.component';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FinanceWorkspaceStore, FinanceCollection } from '../services/finance-workspace.store';
import {
  FinanceFinding,
  FinanceResponse,
  FinanceDecision,
  FinanceDecisionState,
} from '../models/finance.model';
import { Principal, Json } from '../models/workflow.model';
import { WorkflowAssignmentComponent } from './workflow-assignment.component';
import { FinanceValueComponent } from './finance-value.component';
import { FinancePagerComponent } from './finance-pager.component';
import { FinanceTransactionEvidenceComponent } from './finance-transaction-evidence.component';
import { FinanceSourceComponent } from './finance-source.component';
@Component({
  selector: 'app-finance-findings',
  standalone: true,
  imports: [
    FormsModule,
    EntityPickerComponent,
    DatePipe,
    WorkflowAssignmentComponent,
    FinanceValueComponent,
    FinancePagerComponent,
    FinanceSourceComponent,
    FinanceTransactionEvidenceComponent,
  ],
  styleUrls: ['../workflow.scss', './finance.scss'],
  templateUrl: './finance-findings.component.html',
})
export class FinanceFindingsComponent {
  readonly s = inject(FinanceWorkspaceStore);
  readonly findings = new FinanceCollection<FinanceFinding>(this.s, 'findings/');
  readonly responses = new FinanceCollection<FinanceResponse>(this.s, '');
  readonly decisions = new FinanceCollection<FinanceDecision>(this.s, '');
  readonly selectedEvidence = signal('');
  readonly selected = signal<FinanceFinding | null>(null);
  filters: Record<string, string> = {};
  applied: Record<string, string> = {};
  response = '';
  plannedAction = '';
  targetDate = '';
  owner: Principal | null = null;
  requestedItem = '';
  dueDate = '';
  requestUuid = '';
  evidenceDocuments = '';
  decision: FinanceDecisionState = 'under_review';
  reason = '';
  riskConfirmed = false;
  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.close();
      this.filters = {};
      this.applied = {};
    });
    this.findings.load();
    this.s.refreshed$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.close();
      this.findings.load(this.findings.page, this.applied);
    });
  }
  apply(page = 1) {
    this.applied = Object.fromEntries(Object.entries(this.filters).filter(([, v]) => v));
    this.close();
    this.findings.load(page, this.applied);
  }
  close() {
    this.selectedEvidence.set('');
    this.selected.set(null);
    this.responses.rows.set([]);
    this.decisions.rows.set([]);
    this.response = '';
    this.plannedAction = '';
    this.targetDate = '';
    this.owner = null;
    this.requestedItem = '';
    this.dueDate = '';
    this.requestUuid = '';
    this.evidenceDocuments = '';
    this.reason = '';
    this.riskConfirmed = false;
    this.decision = 'under_review';
  }
  select(f: FinanceFinding) {
    this.close();
    this.selected.set(f);
    this.responses.path = `findings/${f.uuid}/responses/`;
    this.decisions.path = `findings/${f.uuid}/decisions/`;
    this.responses.load();
    this.decisions.load();
  }
  request() {
    const f = this.selected();
    if (!f || !this.s.canReview() || !this.owner || !this.requestedItem.trim()) return;
    this.s.mutate(() =>
      this.s.api.requestEvidence(
        this.s.id,
        f.uuid,
        this.s.revision(),
        this.requestedItem,
        this.owner!,
        this.dueDate || undefined,
      ),
    );
  }
  private evidenceCache = { raw: '', ids: [] as string[] };
  evidenceIds() {
    if (this.evidenceCache.raw !== this.evidenceDocuments)
      this.evidenceCache = {
        raw: this.evidenceDocuments,
        ids: this.evidenceDocuments.split('\n').filter(Boolean),
      };
    return this.evidenceCache.ids;
  }
  setEvidenceIds(ids: string[]) {
    this.evidenceDocuments = ids.join('\n');
  }
  requestLabel(row: FinanceResponse) {
    const data = row.data;
    return data &&
      typeof data === 'object' &&
      !Array.isArray(data) &&
      typeof data['requested_item'] === 'string'
      ? data['requested_item']
      : 'Evidence request, version ' + row.number;
  }
  respond() {
    const f = this.selected();
    if (!f || !this.s.canReview() || !this.response.trim() || !this.plannedAction.trim()) return;
    const docs = this.evidenceDocuments
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
    this.s.mutate(() =>
      this.s.api.respond(this.s.id, f.uuid, {
        revision: this.s.revision(),
        response: this.response,
        planned_action: this.plannedAction,
        ...(this.targetDate ? { target_date: this.targetDate } : {}),
        ...(this.owner ? { owner: this.owner } : {}),
        ...(docs.length ? { evidence_documents: docs } : {}),
        ...(this.requestUuid ? { request_uuid: this.requestUuid } : {}),
      }),
    );
  }
  decide() {
    const f = this.selected();
    if (
      !f ||
      !this.s.canReview() ||
      !this.reason.trim() ||
      (this.decision === 'accepted_risk' &&
        (!this.s.canManage(this.s.audit()?.department ?? null) || !this.riskConfirmed))
    )
      return;
    this.s.mutate(() =>
      this.s.api.decide(this.s.id, f.uuid, this.s.revision(), this.decision, this.reason),
    );
  }
  transaction(data: Json): string {
    return data &&
      typeof data === 'object' &&
      !Array.isArray(data) &&
      typeof data['transaction_uuid'] === 'string'
      ? data['transaction_uuid']
      : '';
  }
  sources(data: Json): string[] {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
    const docs = data['evidence_documents'];
    return Array.isArray(docs) ? docs.filter((d): d is string => typeof d === 'string') : [];
  }
}
