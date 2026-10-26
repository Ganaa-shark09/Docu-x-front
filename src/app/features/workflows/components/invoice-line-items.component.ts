import { Component, input, output } from '@angular/core';
import {
  InvoiceLine,
  InvoiceEvidence,
  InvoiceProvenance,
  LINE_COLUMNS,
  invoiceValue,
} from '../models/invoice.model';
import { label } from '../models/workflow.model';
@Component({
  selector: 'app-invoice-line-items',
  standalone: true,
  styleUrls: ['../workflow.scss', './invoice.scss'],
  template: `
    @if (rows().length) {
      <div
        class="table-wrap line-scroll"
        tabindex="0"
        aria-label="Invoice line items, scroll horizontally to see all columns"
      >
        <table>
          <caption>
            Line items ·
            {{
              rows().length
            }}
            source rows
          </caption>
          <thead>
            <tr>
              @for (key of columns; track key) {
                <th scope="col">{{ label(key) }}</th>
              }
              <th scope="col">Evidence</th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track $index; let i = $index) {
              <tr>
                @for (key of columns; track key) {
                  <td>{{ value(row[key]) }}</td>
                }
                <td>
                  @if (proof(i).length) {
                    <button (click)="evidence.emit(proof(i))">View row {{ i + 1 }} evidence</button>
                  } @else {
                    Unavailable
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <p class="empty">No line items were provided. Missing rows are not inferred.</p>
    }
  `,
})
export class InvoiceLineItemsComponent {
  readonly rows = input<InvoiceLine[]>([]);
  readonly provenance = input<InvoiceProvenance | null>(null);
  readonly evidence = output<InvoiceEvidence[]>();
  readonly columns = LINE_COLUMNS;
  readonly label = label;
  readonly value = invoiceValue;
  proof(index: number): InvoiceEvidence[] {
    const cells = this.provenance()?.cells?.[index];
    return cells
      ? cells.description?.evidence ||
          Object.values(cells).find((x) => x?.evidence.length)?.evidence ||
          []
      : [];
  }
}
