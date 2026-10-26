import { EntityPickerComponent } from '../../../shared/entity-picker/entity-picker.component';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FinanceWorkspaceStore, FinanceCollection } from '../services/finance-workspace.store';
import {
  FINANCE_FIELDS,
  FinanceTransaction,
  FinanceCorrection,
  FinanceEvidence,
  FinanceRecord,
  FinanceSupport,
  decimalValid,
} from '../models/finance.model';
import { Json } from '../models/workflow.model';
import { FinanceValueComponent } from './finance-value.component';
import { FinancePagerComponent } from './finance-pager.component';
import { FinanceSourceComponent } from './finance-source.component';
@Component({
  selector: 'app-finance-transactions',
  standalone: true,
  imports: [
    FormsModule,
    EntityPickerComponent,
    DatePipe,
    FinanceValueComponent,
    FinancePagerComponent,
    FinanceSourceComponent,
  ],
  styleUrls: ['../workflow.scss', './finance.scss'],
  templateUrl: './finance-transactions.component.html',
})
export class FinanceTransactionsComponent {
  readonly s = inject(FinanceWorkspaceStore);
  readonly txs = new FinanceCollection<FinanceTransaction>(this.s, 'transactions/');
  readonly corrections = new FinanceCollection<FinanceCorrection>(this.s, '');
  readonly evidence = new FinanceCollection<FinanceEvidence>(this.s, '');
  readonly selected = signal<FinanceTransaction | null>(null);
  readonly filterKeys = [
    'identifier',
    'currency',
    'transaction_type',
    'vendor',
    'account',
    'date_from',
    'date_to',
    'amount_min',
    'amount_max',
  ];
  filters: Record<string, string> = {};
  applied: Record<string, string> = {};
  readonly fields = FINANCE_FIELDS.filter((f) => !['lines', 'manual_entry'].includes(f));
  readonly lineFields = [
    'account_code',
    'description',
    'cost_center',
    'department',
    'project_reference',
    'gross_amount',
    'net_amount',
    'tax_amount',
    'debit',
    'credit',
    'quantity',
    'unit_price',
  ];
  draft: Record<string, string> = {};
  lines: Record<string, string>[] = [];
  manual = false;
  reason = '';
  editing = false;
  supportDoc = '';
  supportRole: FinanceSupport['role'] = 'receipt';
  supportRevision = 1;
  start = 0;
  end = 0;
  quote = '';
  page: number | null = null;
  supportValues: Record<string, string> = {};
  readonly supportKeys = ['reference', 'amount', 'currency', 'quantity', 'unit_price', 'date'];
  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.close();
      this.filters = {};
      this.applied = {};
    });
    this.txs.load();
    this.s.refreshed$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.close();
      this.txs.load(this.txs.page, this.applied);
    });
  }
  apply(page = 1) {
    if (
      ['amount_min', 'amount_max'].some((k) => this.filters[k] && !decimalValid(this.filters[k]))
    ) {
      this.s.error.set('Amount filters require exact decimal strings.');
      return;
    }
    this.applied = Object.fromEntries(Object.entries(this.filters).filter(([, v]) => v));
    this.close();
    this.txs.load(page, this.applied);
  }
  close() {
    this.selected.set(null);
    this.draft = {};
    this.lines = [];
    this.reason = '';
    this.editing = false;
    this.supportDoc = '';
    this.quote = '';
    this.supportValues = {};
    this.start = 0;
    this.end = 0;
    this.supportRevision = 1;
    this.page = null;
    this.evidence.rows.set([]);
    this.corrections.rows.set([]);
  }
  select(tx: FinanceTransaction) {
    this.close();
    this.selected.set(tx);
    this.corrections.path = `transactions/${tx.uuid}/corrections/`;
    this.evidence.path = `transactions/${tx.uuid}/evidence/`;
    this.corrections.load();
    this.evidence.load();
  }
  beginCorrection() {
    const tx = this.selected();
    if (!tx || !this.s.canEdit()) return;
    this.draft = Object.fromEntries(
      Object.entries(tx.data)
        .filter(([, v]) => typeof v === 'string')
        .map(([k, v]) => [k, String(v)]),
    );
    this.manual = tx.data['manual_entry'] === true;
    this.lines = (tx.data.lines || []).map((line) =>
      Object.fromEntries(
        Object.entries(line)
          .filter(([, v]) => typeof v === 'string')
          .map(([k, v]) => [k, String(v)]),
      ),
    );
    this.editing = true;
  }
  correct() {
    const tx = this.selected();
    if (!tx || !this.s.canEdit() || !this.reason.trim()) return;
    const values: FinanceRecord = {
      transaction_id: this.draft['transaction_id'] || '',
      transaction_date: this.draft['transaction_date'] || '',
      transaction_type: this.draft['transaction_type'] || '',
      currency: this.draft['currency'] || '',
      ...Object.fromEntries(Object.entries(this.draft).filter(([, v]) => v !== '')),
      manual_entry: this.manual,
      ...(this.lines.length
        ? {
            lines: this.lines.map((line) =>
              Object.fromEntries(Object.entries(line).filter(([, v]) => v !== '')),
            ),
          }
        : {}),
    };
    this.s.mutate(() =>
      this.s.api.correct(this.s.id, tx.uuid, this.s.revision(), values, this.reason),
    );
  }
  link() {
    const tx = this.selected();
    if (
      !tx ||
      !this.s.canEdit() ||
      !this.supportDoc ||
      !this.quote ||
      !Number.isInteger(this.start) ||
      !Number.isInteger(this.end) ||
      this.end <= this.start ||
      this.end - this.start > 2000 ||
      !Number.isInteger(this.supportRevision) ||
      this.supportRevision < 1
    ) {
      this.s.error.set(
        'Provide authorized source proof with its governance revision and a valid exact span of up to 2,000 characters.',
      );
      return;
    }
    const evidence: FinanceSupport['evidence'] = {
      proof: {
        document_uuid: this.supportDoc,
        governance_revision: this.supportRevision,
        start: this.start,
        end: this.end,
        preview: this.quote.slice(0, 500),
        page: this.page,
      },
      values: Object.fromEntries(Object.entries(this.supportValues).filter(([, v]) => v)),
    };
    this.s.mutate(() =>
      this.s.api.support(this.s.id, tx.uuid, {
        revision: this.s.revision(),
        document_uuid: this.supportDoc,
        role: this.supportRole,
        evidence,
      }),
    );
  }
  json(v: unknown) {
    return v as Json;
  }
}
