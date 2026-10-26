import { Component, input, signal, OnChanges } from '@angular/core';
import { Json } from '../models/workflow.model';
import { financeLabel } from '../models/finance.model';
@Component({
  selector: 'app-finance-value',
  standalone: true,
  template: `
    @if (isObject(value())) {
      <dl>
        @for (entry of entries(value()); track entry[0]) {
          <div>
            <dt>{{ label(entry[0]) }}</dt>
            <dd><app-finance-value [value]="entry[1]" /></dd>
          </div>
        }
      </dl>
    } @else if (isArray(value())) {
      <ol>
        @for (item of array(value()).slice((page() - 1) * 50, page() * 50); track $index) {
          <li><app-finance-value [value]="item" /></li>
        }
      </ol>
      @if (array(value()).length > 50) {
        <nav aria-label="Evidence items">
          <button (click)="page.set(page() - 1)" [disabled]="page() === 1">Previous items</button
          ><span> Items page {{ page() }}</span
          ><button (click)="page.set(page() + 1)" [disabled]="page() * 50 >= array(value()).length">
            Next items
          </button>
        </nav>
      }
    } @else {
      <span>{{
        value() === null || value() === undefined ? 'Unavailable' : display(value())
      }}</span>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
        overflow-wrap: anywhere;
        white-space: pre-wrap;
        color: var(--app-text);
      }
      dl {
        margin: 0.25rem 0;
      }
      dl > div {
        padding: 0.4rem 0;
        border-bottom: 1px solid var(--app-border);
      }
      dt {
        color: var(--app-text-muted);
        font-size: 0.85rem;
      }
      dd {
        margin: 0.2rem 0 0.2rem 0.5rem;
      }
      ol {
        padding-left: 1.2rem;
        max-height: 28rem;
        overflow: auto;
      }
    `,
  ],
})
export class FinanceValueComponent implements OnChanges {
  readonly page = signal(1);
  ngOnChanges() {
    this.page.set(1);
  }

  readonly value = input<Json | undefined>(null);
  readonly label = financeLabel;
  display(v: Json | undefined) {
    const labels: Record<string, string> = {
      currency_comparison_unavailable: 'Comparison unavailable (FX data unavailable)',
      probable: 'Probable match',
      matched: 'Matched',
      probable_match: 'Probable match',
      exact: 'Exact match',
      not_found: 'Not found',
      ambiguous: 'Ambiguous match',
      partial_payment: 'Partial payment',
      overpayment: 'Overpayment',
      missing_po: 'Missing PO',
      missing_receipt: 'Missing receipt',
      not_applicable: 'Not applicable',
      review_required: 'Requires review',
      insufficient_data: 'Insufficient data',
      amount_mismatch: 'Amount mismatch',
      evidence_requested: 'Evidence requested',
      management_response_received: 'Management response received',
    };
    return typeof v === 'string' ? (labels[v] ?? v) : v;
  }
  isObject(v: Json | undefined) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }
  isArray(v: Json | undefined) {
    return Array.isArray(v);
  }
  entries(v: Json | undefined): [string, Json][] {
    return this.isObject(v) ? Object.entries(v as Record<string, Json>) : [];
  }
  array(v: Json | undefined): Json[] {
    return Array.isArray(v) ? v : [];
  }
}
