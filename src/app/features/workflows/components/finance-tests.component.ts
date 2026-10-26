import { Component, DestroyRef, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FinanceWorkspaceStore, FinanceCollection } from '../services/finance-workspace.store';
import {
  FinanceSample,
  FinanceTestRun,
  FinanceResult,
  FinanceMethod,
  FinanceSampling,
  decimalValid,
} from '../models/finance.model';
import { Json } from '../models/workflow.model';
import { FinanceValueComponent } from './finance-value.component';
import { FinanceTransactionEvidenceComponent } from './finance-transaction-evidence.component';
import { FinancePagerComponent } from './finance-pager.component';
@Component({
  selector: 'app-finance-tests',
  standalone: true,
  imports: [
    FormsModule,
    DatePipe,
    FinanceValueComponent,
    FinancePagerComponent,
    FinanceTransactionEvidenceComponent,
  ],
  styleUrls: ['../workflow.scss', './finance.scss'],
  templateUrl: './finance-tests.component.html',
})
export class FinanceTestsComponent {
  readonly s = inject(FinanceWorkspaceStore);
  readonly selectedEvidence = signal('');
  readonly reconciliation = input(false);
  readonly samples = new FinanceCollection<FinanceSample>(this.s, 'samples/');
  readonly tests = new FinanceCollection<FinanceTestRun>(this.s, 'test-runs/');
  readonly results = new FinanceCollection<FinanceResult>(this.s, '');
  readonly selectedSample = signal<FinanceSample | null>(null);
  readonly selectedTest = signal<FinanceTestRun | null>(null);
  method: FinanceMethod = 'random';
  size = 100;
  seed = '';
  thresholds: { currency: string; amount: string }[] = [];
  sampleUuid = '';
  previousUuid = '';
  code = '';
  status = '';
  samplePage = 1;
  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.selectedSample.set(null);
      this.selectedTest.set(null);
      this.selectedEvidence.set('');
      this.seed = '';
      this.thresholds = [];
      this.sampleUuid = '';
      this.previousUuid = '';
    });
    this.samples.load();
    this.tests.load();
    this.s.refreshed$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.selectedEvidence.set('');
      this.selectedTest.set(null);
      this.selectedSample.set(null);
      this.results.rows.set([]);
      this.samples.load(this.samples.page);
      this.tests.load(this.tests.page);
      this.sampleUuid = '';
      this.previousUuid = '';
      this.seed = '';
      this.thresholds = [];
    });
  }
  sample() {
    if (!this.s.canEdit() || this.s.pending()) return;
    if (
      !Number.isInteger(this.size) ||
      this.size < 1 ||
      this.size > 5000 ||
      (['random', 'stratified'].includes(this.method) && !this.seed.trim())
    ) {
      this.s.error.set(
        'Choose a size from 1 to 5000 and an explicit reproducible seed where required.',
      );
      return;
    }
    const thresholds: Record<string, string> = {};
    if (this.method === 'value_threshold') {
      for (const row of this.thresholds) {
        if (
          !/^[A-Z]{3}$/.test(row.currency) ||
          !decimalValid(row.amount, true) ||
          thresholds[row.currency]
        ) {
          this.s.error.set('Use unique uppercase currencies and exact nonnegative thresholds.');
          return;
        }
        thresholds[row.currency] = row.amount;
      }
      if (!this.thresholds.length) {
        this.s.error.set('Add at least one currency threshold.');
        return;
      }
    }
    const parameters: FinanceSampling = {
      method: this.method,
      size: this.size,
      ...(['random', 'stratified'].includes(this.method) ? { seed: this.seed } : {}),
      ...(this.method === 'value_threshold' ? { thresholds } : {}),
    };
    this.s.mutate(() =>
      this.s.api.sample(
        this.s.id,
        this.s.revision(),
        parameters,
        this.s.key('sample', { revision: this.s.revision(), parameters }),
      ),
    );
  }
  execute() {
    if (!this.s.canReview() || this.s.pending()) return;
    const value = {
      revision: this.s.revision(),
      sample_uuid: this.sampleUuid || null,
      previous_uuid: this.previousUuid || null,
    };
    this.s.mutate(() =>
      this.s.api.execute(
        this.s.id,
        value.revision,
        this.s.key('execute', value),
        value.sample_uuid,
        value.previous_uuid,
      ),
    );
  }
  selectTest(test: FinanceTestRun) {
    this.selectedEvidence.set('');
    this.selectedTest.set(test);
    this.results.path = `test-runs/${test.uuid}/results/`;
    this.filterResults();
  }
  filterResults(page = 1) {
    if (!this.selectedTest()) return;
    this.results.load(page, {
      ...(this.code ? { code: this.code } : {}),
      ...(this.status ? { status: this.status } : {}),
    });
  }
  json(value: unknown) {
    return value as Json;
  }
}
