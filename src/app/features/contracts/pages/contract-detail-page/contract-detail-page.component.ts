import { ContractAreaNavComponent } from '../../components/contract-area-nav.component';
import { DatePipe, NgFor, NgIf, TitleCasePipe } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  ContractEvidence,
  ContractMilestone,
  ContractMilestoneSnapshot,
  ContractObligation,
  ContractReviewDetail,
} from '../../models/contract.model';
import { ContractService } from '../../services/contract.service';

interface SourceObligation {
  index: number;
  action: string;
  dueDate: string;
  evidence: unknown;
}

@Component({
  selector: 'app-contract-detail-page',
  standalone: true,
  imports: [ContractAreaNavComponent, DatePipe, NgFor, NgIf, TitleCasePipe, FormsModule],
  templateUrl: './contract-detail-page.component.html',
  styleUrl: './contract-detail-page.component.scss',
})
export class ContractDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(ContractService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  activeTab: 'overview' | 'findings' | 'milestones' | 'obligations' = 'overview';
  uuid = '';
  review: ContractReviewDetail | null = null;
  snapshot: ContractMilestoneSnapshot | null = null;
  obligations: ContractObligation[] = [];
  loadingReview = true;
  loadingMilestones = true;
  loadingObligations = true;
  assigning = false;
  transitioningId = '';
  reviewError = '';
  milestoneError = '';
  obligationError = '';
  actionError = '';
  actionMessage = '';
  ownerId: number | null = null;
  selectedSourceIndex: number | null = null;
  transitionReasons: Record<string, string> = {};

  ngOnInit(): void {
    this.uuid = this.route.snapshot.paramMap.get('uuid') ?? '';
    if (!this.uuid) {
      this.reviewError = 'Invalid contract reference.';
      this.loadingReview = this.loadingMilestones = this.loadingObligations = false;
      return;
    }
    this.reload();
  }

  reload(): void {
    this.actionError = this.actionMessage = '';
    this.loadReview();
    this.loadMilestones();
    this.loadObligations();
  }

  private loadReview(): void {
    this.loadingReview = true;
    this.review = null;
    this.reviewError = '';
    this.service.detail(this.uuid).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: review => {
        this.review = review;
        this.loadingReview = false;
        this.cdr.markForCheck();
      },
      error: err => {
        this.review = null;
        this.loadingReview = false;
        this.reviewError = this.errorText(err, 'Contract detail unavailable.');
        this.cdr.markForCheck();
      },
    });
  }

  private loadMilestones(): void {
    this.loadingMilestones = true;
    this.snapshot = null;
    this.milestoneError = '';
    this.service.milestones(this.uuid).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: snapshot => {
        this.snapshot = snapshot;
        this.loadingMilestones = false;
        this.cdr.markForCheck();
      },
      error: err => {
        this.snapshot = null;
        this.loadingMilestones = false;
        this.milestoneError = this.errorText(err, 'Milestones unavailable.');
        this.cdr.markForCheck();
      },
    });
  }

  private loadObligations(): void {
    this.loadingObligations = true;
    this.obligations = [];
    this.obligationError = '';
    this.service.obligations(this.uuid).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: obligations => {
        this.obligations = obligations;
        this.loadingObligations = false;
        this.cdr.markForCheck();
      },
      error: err => {
        this.obligations = [];
        this.loadingObligations = false;
        this.obligationError = this.errorText(err, 'Obligation tracker unavailable.');
        this.cdr.markForCheck();
      },
    });
  }

  get details(): Array<{ label: string; value: string }> {
    const obj = this.review?.normalized;
    if (!obj || typeof obj !== 'object') return [];
    const fields = [
      ['contract_type', 'Contract type'],
      ['counterparty', 'Counterparty'],
      ['effective_date', 'Effective date'],
      ['expiration_date', 'Expiration date'],
      ['notice_deadline', 'Notice deadline'],
      ['governing_law', 'Governing law'],
      ['renewal_terms', 'Renewal terms'],
      ['payment_terms', 'Payment terms'],
    ];
    return fields.map(([key, label]) => ({ label, value: this.asText(obj[key]) }))
      .filter(row => row.value.trim().length > 0);
  }

  get findings(): Array<{ label: string; severity: string; field: string }> {
    const data = this.review?.validation;
    if (!Array.isArray(data)) return [];
    return data.slice(0, 100).filter(row => row && typeof row === 'object')
      .map((row: Record<string, unknown>) => ({
        label: this.asText(row['message'] ?? row['detail'] ?? row['code'] ?? 'Review finding'),
        severity: this.asText(row['severity'] ?? (row['blocking'] === true ? 'blocking' : 'review')),
        field: this.asText(row['field_key'] ?? row['field'] ?? ''),
      }));
  }

  get activeCount(): number { return this.obligations.filter(row => row.status !== 'completed').length; }
  get completedCount(): number { return this.obligations.filter(row => row.status === 'completed').length; }
  get isFinalized(): boolean { return this.snapshot?.review_output_finalized === true; }
  get hasStaleObligations(): boolean { return this.obligations.some(row => row.stale); }
  get reviewStatus(): string { return this.review?.status ?? 'Not available'; }
  label(value: string): string { return value.replace(/_/g, ' '); }

  get sourceObligations(): SourceObligation[] {
    const source = this.review?.normalized?.['obligations'];
    if (!Array.isArray(source)) return [];
    return source.slice(0, 100).map((row: unknown, index: number) => {
      const obj = row && typeof row === 'object' && !Array.isArray(row)
        ? row as Record<string, unknown> : {};
      return {
        index,
        action: this.asText(obj['action'] ?? obj['obligation'] ?? obj['description']),
        dueDate: this.asText(obj['due_date']),
        evidence: obj['evidence'],
      };
    });
  }

  get canAssign(): boolean {
    return !!this.review && this.snapshot?.review_output_finalized === true
      && this.sourceObligations.length > 0 && !this.loadingObligations && !this.obligationError;
  }

  get availableSourceObligations(): SourceObligation[] {
    return this.sourceObligations.filter(row => !this.obligations.some(
      obligation => obligation.source_revision === this.review?.revision
        && obligation.source_index === row.index,
    ));
  }

  assign(): void {
    if (!this.canAssign || this.assigning || !this.review || this.selectedSourceIndex == null
      || !this.availableSourceObligations.some(row => row.index === this.selectedSourceIndex)
      || !Number.isSafeInteger(this.ownerId) || (this.ownerId ?? 0) < 1) {
      this.actionError = 'Choose a verified obligation and enter a valid authorized owner user ID.';
      return;
    }
    this.assigning = true;
    this.actionError = this.actionMessage = '';
    this.service.assign(this.uuid, {
      source_index: this.selectedSourceIndex,
      owner_id: this.ownerId!,
      expected_review_revision: this.review.revision,
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: item => {
        this.assigning = false;
        this.ownerId = null;
        this.selectedSourceIndex = null;
        this.actionMessage = `Obligation assigned to user #${item.owner_id}.`;
        this.reloadAfterMutation();
      },
      error: err => {
        this.assigning = false;
        this.actionError = this.errorText(err, 'Could not assign obligation.');
        if (err.status === 409) this.reloadAfterMutation();
        this.cdr.markForCheck();
      },
    });
  }

  transition(item: ContractObligation): void {
    const status = item.status === 'open' ? 'in_progress' : 'completed';
    const reason = (this.transitionReasons[item.uuid] ?? '').trim();
    if (item.stale || item.status === 'completed' || reason.length < 3 || reason.length > 500
      || !!this.transitioningId) {
      this.actionError = 'Enter a reason of 3–500 characters for an active obligation.';
      return;
    }
    this.transitioningId = item.uuid;
    this.actionError = this.actionMessage = '';
    this.service.transition(this.uuid, item.uuid, {
      status,
      reason,
      expected_revision: item.revision,
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.transitioningId = '';
        delete this.transitionReasons[item.uuid];
        this.actionMessage = 'Obligation status updated and recorded in history.';
        this.reloadAfterMutation();
      },
      error: err => {
        this.transitioningId = '';
        this.actionError = this.errorText(err, 'Could not update obligation status.');
        if (err.status === 409) this.reloadAfterMutation();
        this.cdr.markForCheck();
      },
    });
  }

  /** Refresh stale optimistic revisions; never silently retry a write. */
  private reloadAfterMutation(): void {
    this.loadReview();
    this.loadMilestones();
    this.loadObligations();
  }

  evidenceLines(raw: unknown): string[] {
    const list = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
    return list.slice(0, 10).map(evidence => {
      if (typeof evidence === 'string') return evidence;
      if (!evidence || typeof evidence !== 'object') return '';
      const obj = evidence as ContractEvidence;
      const quote = obj.source_text ?? obj.snippet ?? obj.quote ?? obj.text ?? obj.source ?? '';
      const label = obj.page_number ?? obj.page;
      const location = label != null ? `Page ${String(label)} · ` : '';
      return `${location}${typeof quote === 'string' ? quote : ''}`;
    }).filter(line => line.length > 0);
  }

  snapshotValue(item: ContractObligation, key: string): string {
    return this.asText(item.source_snapshot?.[key]);
  }

  asText(value: unknown): string {
    return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  }

  trackMilestone(index: number, item: ContractMilestone): string { return `${item.source_field}-${item.date}-${index}`; }
  trackObligation(_: number, item: ContractObligation): string { return item.uuid; }
  trackSource(_: number, item: SourceObligation): number { return item.index; }

  private errorText(err: { status?: number; error?: unknown }, fallback: string): string {
    if (err.status === 403) return 'Your current permissions do not allow this action or content.';
    if (err.status === 404) return 'Contract or record not found in your accessible workspace.';
    if (err.status === 409) return 'This record changed. The latest state has been reloaded; review it before retrying.';
    if (err.status === 400) return 'Request rejected by contract validation. Confirm source evidence, revision and authorized owner.';
    return fallback;
  }
}
