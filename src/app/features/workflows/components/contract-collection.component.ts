import { Component, input, output } from '@angular/core';
import {
  ContractRow,
  ContractEvidence,
  ContractProvenance,
  contractValue,
} from '../models/contract.model';
import { label } from '../models/workflow.model';
import { invoiceConfidence } from '../models/invoice.model';
@Component({
  selector: 'app-contract-collection',
  standalone: true,
  styleUrls: ['../workflow.scss', './contract.scss'],
  template: `
    @for (row of rows(); track $index) {
      <article class="card">
        <dl>
          @for (column of columns(); track column) {
            <dt>{{ label(column) }}</dt>
            <dd>{{ rowValue(column, row[column]) }}</dd>
          }
        </dl>
        @if (provenance(); as fact) {
          <p>
            Collection extraction confidence: {{ confidence(fact.confidence) }} · Collection review:
            {{ label(fact.review_status) }} · Estimate, not verification.
          </p>
        }
        @if (!readonly()) {
          <button
            (click)="
              evidence.emit(row.evidence?.length ? row.evidence : provenance()?.evidence || [])
            "
            [disabled]="busy()"
          >
            Inspect source evidence
          </button>
        }
      </article>
    } @empty {
      <p class="empty">No {{ label(kind()) }} detected.</p>
    }
  `,
})
export class ContractCollectionComponent {
  readonly kind = input.required<string>();
  readonly rows = input<ContractRow[]>([]);
  readonly columns = input<string[]>([]);
  readonly provenance = input<ContractProvenance | null>(null);
  readonly busy = input(false);
  readonly readonly = input(false);
  readonly evidence = output<ContractEvidence[]>();
  readonly label = label;
  readonly confidence = invoiceConfidence;
  rowValue(column: string, value: unknown): string {
    return ['role', 'timing_type', 'category', 'kind'].includes(column) && typeof value === 'string'
      ? label(value)
      : contractValue(value);
  }
}
