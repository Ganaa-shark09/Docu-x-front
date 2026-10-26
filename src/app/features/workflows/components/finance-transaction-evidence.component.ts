import { Component, input, inject, OnChanges } from '@angular/core';
import { FinanceWorkspaceStore, FinanceCollection } from '../services/finance-workspace.store';
import { FinanceEvidence } from '../models/finance.model';
import { FinanceValueComponent } from './finance-value.component';
import { FinanceSourceComponent } from './finance-source.component';
import { FinancePagerComponent } from './finance-pager.component';
@Component({
  selector: 'app-finance-transaction-evidence',
  standalone: true,
  imports: [FinanceValueComponent, FinanceSourceComponent, FinancePagerComponent],
  styleUrls: ['../workflow.scss', './finance.scss'],
  template: `<section class="source">
    <h3>Authorized transaction support</h3>
    <p class="pre">Transaction {{ transaction() }}</p>
    @if (links.loading()) {
      <p role="status">Loading supporting evidence...</p>
    }
    @for (link of links.rows(); track link.uuid) {
      <article class="source">
        <h4>{{ link.role.replaceAll('_', ' ') }}</h4>
        <p>Governance revision {{ link.governance_revision }}</p>
        <p class="pre">Checksum {{ link.checksum }}</p>
        <app-finance-value [value]="link.data" /><app-finance-source
          [document]="link.document_uuid"
        />
      </article>
    } @empty {
      <p>No linked support on this page. Missing evidence remains unavailable.</p>
    }
    <app-finance-pager
      [page]="links.page"
      [next]="links.next"
      [previous]="links.previous"
      [count]="links.count"
      [busy]="links.loading() || s.pending()"
      (changed)="links.load($event)"
    />
  </section>`,
})
export class FinanceTransactionEvidenceComponent implements OnChanges {
  readonly transaction = input.required<string>();
  readonly s = inject(FinanceWorkspaceStore);
  readonly links = new FinanceCollection<FinanceEvidence>(this.s, '');
  ngOnChanges() {
    this.links.path = `transactions/${encodeURIComponent(this.transaction())}/evidence/`;
    this.links.load();
  }
}
