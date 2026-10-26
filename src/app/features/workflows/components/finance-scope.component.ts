import { Component, input, output, OnInit, OnDestroy, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FinanceScope, FinancePolicy, FinanceMethod, decimalValid } from '../models/finance.model';
import { FinanceWorkspaceStore } from '../services/finance-workspace.store';
@Component({
  selector: 'app-finance-scope',
  standalone: true,
  imports: [FormsModule],
  styleUrls: ['../workflow.scss', './finance.scss'],
  template: ` <form (ngSubmit)="save()">
    <fieldset [disabled]="s.pending() || s.loading()">
      <legend>Audit scope and period</legend>
      <div class="grid">
        <label
          >Start date<input type="date" name="start" [(ngModel)]="scope.start" required /></label
        ><label>End date<input type="date" name="end" [(ngModel)]="scope.end" required /></label>
        <label
          >Period<select name="period" [(ngModel)]="scope.period">
            <option value="custom">Custom</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="annual">Annual</option>
          </select></label
        >
        <label
          >Fiscal label (explicit, optional)<input
            name="fiscal"
            [(ngModel)]="scope.fiscal_year"
            maxlength="30"
            placeholder="Organization fiscal label"
        /></label>
      </div>
      <label class="check"
        ><input type="checkbox" name="closed" [(ngModel)]="scope.period_closed" />Period
        closed</label
      >
      <div class="grid">
        @for (key of dimensions; track key) {
          <label
            >{{ key.replaceAll('_', ' ') }} (one per line)<textarea
              [name]="key"
              [(ngModel)]="values[key]"
            ></textarea>
          </label>
        }
      </div>
    </fieldset>
    <fieldset [disabled]="s.pending() || s.loading()">
      <legend>Deterministic audit policy</legend>
      <p>
        Materiality and tolerance are explicit thresholds per currency. No FX conversion or client
        calculation is performed.
      </p>
      @for (row of thresholds; track $index) {
        <div class="grid">
          <label
            >Currency<input
              [name]="'currency' + $index"
              [(ngModel)]="row.currency"
              maxlength="3"
              placeholder="USD" /></label
          ><label
            >Materiality (exact decimal)<input
              [name]="'materiality' + $index"
              [(ngModel)]="row.materiality"
              inputmode="decimal" /></label
          ><label
            >Tolerance (exact decimal)<input
              [name]="'tolerance' + $index"
              [(ngModel)]="row.tolerance"
              inputmode="decimal" /></label
          ><button type="button" (click)="thresholds.splice($index, 1)">Remove currency</button>
        </div>
      }
      <button
        type="button"
        (click)="thresholds.push({ currency: '', materiality: '', tolerance: '' })"
      >
        Add currency threshold
      </button>
      <h3>Tests to perform</h3>
      <div class="grid">
        @for (test of s.library()?.tests || []; track test.code) {
          <label class="check"
            ><input
              type="checkbox"
              [name]="test.code"
              [ngModel]="tests.includes(test.code)"
              (ngModelChange)="toggle(test.code, $event)"
            />{{ test.name }}</label
          >
        }
      </div>
      <div class="grid">
        @for (key of rules; track key) {
          <label
            >{{ key.replaceAll('_', ' ')
            }}<input type="number" min="0" max="3660" [name]="key" [(ngModel)]="policy[key]"
          /></label>
        }
      </div>
      <label
        >Required supporting transaction types (one per line)<textarea
          name="supportTypes"
          [(ngModel)]="supportTypes"
        ></textarea>
      </label>
      <label
        >Blocking severities<select name="blocking" multiple [(ngModel)]="blocking">
          <option value="info">Info</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select></label
      >
      <details>
        <summary>Initial sampling (optional)</summary>
        <label class="check"
          ><input type="checkbox" name="useSampling" [(ngModel)]="useSampling" />Sample initial
          audit tests</label
        >
        @if (useSampling) {
          <div class="grid">
            <label
              >Method<select name="initialMethod" [(ngModel)]="method">
                @for (m of s.library()?.sampling_methods || []; track m) {
                  <option [value]="m">{{ m.replaceAll('_', ' ') }}</option>
                }
              </select></label
            ><label
              >Sample size<input
                type="number"
                name="initialSize"
                [(ngModel)]="size"
                min="1"
                max="5000"
            /></label>
            @if (method === 'random' || method === 'stratified') {
              <label
                >Reproducible seed<input name="initialSeed" [(ngModel)]="seed" maxlength="128"
              /></label>
            }
          </div>
          <p>
            For threshold sampling, the currency materiality values above supply initial sampling
            thresholds.
          </p>
        }
      </details>
    </fieldset>
    @if (error) {
      <p class="error" role="alert">{{ error }}</p>
    }
    <button class="primary" [disabled]="s.pending() || s.loading()">{{ submitLabel() }}</button>
  </form>`,
})
export class FinanceScopeComponent implements OnInit, OnDestroy {
  readonly initial = input<{ scope: FinanceScope; policy: FinancePolicy } | null>(null);
  readonly submitLabel = input('Save scope and policy');
  readonly saved = output<{ scope: FinanceScope; policy: FinancePolicy }>();
  readonly s = inject(FinanceWorkspaceStore);
  scope: FinanceScope = {
    start: '',
    end: '',
    period: 'custom',
    fiscal_year: '',
    period_closed: false,
  };
  policy: FinancePolicy = {};
  error = '';
  readonly dimensions = [
    'objectives',
    'transaction_types',
    'vendors',
    'accounts',
    'cost_centers',
    'business_units',
  ] as const;
  readonly rules = ['cutoff_days', 'posting_days', 'duplicate_days', 'frequency_limit'] as const;
  values: Record<string, string> = {};
  thresholds: { currency: string; materiality: string; tolerance: string }[] = [];
  tests: string[] = [];
  supportTypes = '';
  blocking = ['high', 'critical'];
  useSampling = false;
  method: FinanceMethod = 'random';
  size = 100;
  seed = '';
  ngOnInit() {
    const v = this.initial();
    if (v) {
      this.scope = structuredClone(v.scope);
      this.policy = structuredClone(v.policy);
    }
    for (const k of this.dimensions) this.values[k] = (this.scope[k] || []).join('\n');
    this.tests = this.policy.tests || this.s.library()?.tests.map((t) => t.code) || [];
    this.blocking = this.policy.blocking_severities || ['high', 'critical'];
    this.supportTypes = (this.policy.required_support_types || []).join('\n');
    const currencies = new Set([
      ...Object.keys(this.policy.materiality || {}),
      ...Object.keys(this.policy.tolerance || {}),
    ]);
    this.thresholds = [...currencies].map((currency) => ({
      currency,
      materiality: this.policy.materiality?.[currency] || '',
      tolerance: this.policy.tolerance?.[currency] || '',
    }));
    const sample = this.policy.sampling;
    if (sample) {
      this.useSampling = true;
      this.method = sample.method;
      this.size = sample.size;
      this.seed = sample.seed || '';
    }
  }
  ngOnDestroy() {
    this.scope = { start: '', end: '', period: 'custom' };
    this.policy = {};
    this.values = {};
    this.thresholds = [];
    this.tests = [];
    this.supportTypes = '';
    this.seed = '';
  }
  toggle(code: string, on: boolean) {
    this.tests = on ? [...this.tests, code] : this.tests.filter((t) => t !== code);
  }
  save() {
    this.error = '';
    if (
      !this.scope.start ||
      !this.scope.end ||
      this.scope.start > this.scope.end ||
      !this.tests.length
    ) {
      this.error = 'Choose a valid date range and at least one deterministic test.';
      return;
    }
    const materiality: Record<string, string> = {},
      tolerance: Record<string, string> = {};
    const seen = new Set<string>();
    for (const row of this.thresholds) {
      if (
        !/^[A-Z]{3}$/.test(row.currency) ||
        seen.has(row.currency) ||
        (!row.materiality && !row.tolerance) ||
        [row.materiality, row.tolerance].some((v) => v && !decimalValid(v, true))
      ) {
        this.error =
          'Use unique uppercase currencies and nonnegative exact decimals with up to eight fractional places.';
        return;
      }
      seen.add(row.currency);
      if (row.materiality) materiality[row.currency] = row.materiality;
      if (row.tolerance) tolerance[row.currency] = row.tolerance;
    }
    for (const k of this.dimensions)
      this.scope[k] = this.values[k]
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean);
    const policy: FinancePolicy = {
      ...this.policy,
      tests: [...this.tests],
      materiality,
      tolerance,
      blocking_severities: this.blocking,
      required_support_types: this.supportTypes
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean),
    };
    for (const k of this.rules) {
      if (policy[k] === null || policy[k] === undefined) delete policy[k];
      else if (!Number.isInteger(policy[k]) || policy[k]! < 0 || policy[k]! > 3660) {
        this.error = 'Rule limits must be integers from 0 to 3660.';
        return;
      }
    }
    if (this.useSampling) {
      if (
        !Number.isInteger(this.size) ||
        this.size < 1 ||
        this.size > 5000 ||
        (['random', 'stratified'].includes(this.method) && !this.seed.trim())
      ) {
        this.error =
          'Choose a bounded sample size and an explicit seed for random or stratified sampling.';
        return;
      }
      policy.sampling = {
        method: this.method,
        size: this.size,
        ...(['random', 'stratified'].includes(this.method) ? { seed: this.seed } : {}),
        ...(this.method === 'value_threshold' ? { thresholds: materiality } : {}),
      };
    } else delete policy.sampling;
    this.saved.emit({ scope: { ...this.scope }, policy });
  }
}
