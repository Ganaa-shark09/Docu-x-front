import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

/** One consistent navigation surface shared by contract reviews and related legal playbooks. */
export type ContractArea = 'register' | 'runs' | 'detail' | 'playbooks' | 'taxonomy';

@Component({
  selector: 'app-contract-area-nav',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="dca-shell">
      <nav class="dca-breadcrumb" aria-label="Breadcrumb">
        <a routerLink="/workflows">All workflows</a>
        <span aria-hidden="true">/</span>
        @if (active === 'playbooks' || active === 'taxonomy') {
          <a routerLink="/workflows/legal/playbooks">Legal intelligence</a>
          <span aria-hidden="true">/</span>
          <strong>{{ active === 'taxonomy' ? 'Clause taxonomy' : 'Legal playbooks' }}</strong>
        } @else {
          @if (active === 'register') {
            <strong>Contract review</strong>
          } @else {
            <a routerLink="/workflows/contract-workspace">Contract review</a>
            <span aria-hidden="true">/</span>
            <strong>{{ active === 'runs' ? 'Review runs' : 'Review details' }}</strong>
          }
        }
      </nav>

      <nav class="dca-tabs" aria-label="Contract and legal workspace navigation">
        <a routerLink="/workflows/contract-workspace" [class.is-current]="active === 'register' || active === 'detail'"
           [attr.aria-current]="active === 'register' || active === 'detail' ? 'page' : null">Review register</a>
        <a routerLink="/workflows/contract-workspace/runs" [class.is-current]="active === 'runs'"
           [attr.aria-current]="active === 'runs' ? 'page' : null">Review runs</a>
        <a routerLink="/workflows/legal/playbooks" [class.is-current]="active === 'playbooks'"
           [attr.aria-current]="active === 'playbooks' ? 'page' : null">Legal playbooks</a>
        @if (showTaxonomy) {
          <a routerLink="/workflows/legal/clause-types" [class.is-current]="active === 'taxonomy'"
             [attr.aria-current]="active === 'taxonomy' ? 'page' : null">Clause taxonomy</a>
        }
      </nav>
    </div>
  `,
  styleUrl: './contract-area-nav.component.scss',
})
export class ContractAreaNavComponent {
  @Input({ required: true }) active: ContractArea = 'register';
  @Input() showTaxonomy = false;
}
