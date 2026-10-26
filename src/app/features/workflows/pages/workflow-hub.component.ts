import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  standalone: true,
  imports: [RouterLink],
  styleUrls: ['../workflow.scss'],
  template: `
    <section class="page">
      <header>
        <div>
          <span class="eyebrow">DOCUMENT OPERATIONS</span>
          <h1>All Workflows</h1>
          <p class="muted">Start document work, track progress, and continue authorized reviews.</p>
        </div>
      </header>
      <div class="grid">
        <article class="card">
          <h2>Workflow definitions</h2>
          <p>Browse published workflows and start work with accessible documents.</p>
          <a class="button primary" routerLink="/workflows/definitions">Open definitions</a>
        </article>
        <article class="card">
          <h2>Workflow runs</h2>
          <p>Track work, findings, reviews, approvals, and recorded outputs.</p>
          <a class="button" routerLink="/workflows/runs">Open all runs</a>
        </article>
        <article class="card">
          <h2>Extraction history</h2>
          <p>Inspect existing extraction runs and their review history.</p>
          <a class="button" routerLink="/workflows/extractions">Open extraction history</a>
        </article>
      </div>
      <section class="card">
        <h2>Continue active work</h2>
        <p class="muted">These queues use the existing server status filters.</p>
        <div class="actions">
          <a class="button" routerLink="/workflows/runs" [queryParams]="{ status: 'processing' }"
            >Processing</a
          >
          <a class="button" routerLink="/workflows/runs" [queryParams]="{ status: 'queued' }"
            >Queued</a
          >
          <a
            class="button"
            routerLink="/workflows/runs"
            [queryParams]="{ status: 'review_required' }"
            >Review required</a
          >
          <a
            class="button"
            routerLink="/workflows/runs"
            [queryParams]="{ status: 'approval_required' }"
            >Approval required</a
          >
        </div>
      </section>
      <section class="card">
        <h2>Document workspaces</h2>
        <div class="actions">
          <a class="button" routerLink="/workflows/invoices"
            >Invoices</a
          >
          <a
            class="button"
            routerLink="/workflows/definitions"
            [queryParams]="{ type: 'contract_review' }"
            >Contract review</a
          >
          <a
            class="button"
            routerLink="/workflows/definitions"
            [queryParams]="{ type: 'legal_clause_intelligence' }"
            >Legal clause intelligence</a
          >
          <a class="button" routerLink="/workflows/hr-policies">HR policies</a>
          <a class="button" routerLink="/workflows/rfp-projects">RFP &amp; proposals</a>
          <a class="button" routerLink="/workflows/finance-audits">Finance audit</a>
          <a class="button" routerLink="/workflows/compliance">Compliance</a>
        </div>
      </section>
    </section>
  `,
})
export class WorkflowHubComponent {}
