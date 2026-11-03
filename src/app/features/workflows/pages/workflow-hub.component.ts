import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  standalone: true,
  imports: [RouterLink],
  styleUrls: ['../workflow.scss', './workflow-hub.component.scss'],
  template: `
    <section class="page wf-home">
      <header class="wf-home__heading">
        <div>
          <span class="eyebrow">DOCUMENT OPERATIONS</span>
          <h1>Workflow hub</h1>
          <p class="muted">Monitor active work, find the right document workspace, and manage workflow setup in one place.</p>
        </div>
      </header>

      <section class="wf-home__section" aria-labelledby="wf-home-tools">
        <div class="wf-home__section-heading">
          <div><h2 id="wf-home-tools">Workflow tools</h2><p>Configuration, monitoring, and extraction history are available here—not in the sidebar.</p></div>
        </div>
        <div class="wf-home__grid wf-home__grid--three">
          <a class="wf-home__tile" routerLink="/workflows/definitions">
            <span class="wf-home__tile-number">CONFIGURATION</span>
            <strong>Definitions &amp; setup <span aria-hidden="true">→</span></strong>
            <small>Create, publish and manage reusable invoice, contract and legal workflows.</small>
          </a>
          <a class="wf-home__tile" routerLink="/workflows/runs">
            <span class="wf-home__tile-number">MONITORING</span>
            <strong>Workflow runs <span aria-hidden="true">→</span></strong>
            <small>Track processing, human reviews, approvals and exceptions.</small>
          </a>
          <a class="wf-home__tile" routerLink="/workflows/extractions">
            <span class="wf-home__tile-number">DOCUMENT PROCESSING</span>
            <strong>Extraction runs <span aria-hidden="true">→</span></strong>
            <small>Inspect extraction results, confidence and correction history.</small>
          </a>
        </div>
      </section>

      <section class="wf-home__section" aria-labelledby="wf-home-queues">
        <div class="wf-home__section-heading">
          <div><h2 id="wf-home-queues">Continue active work</h2><p>Jump straight into a status queue, or open your assigned approvals.</p></div>
          <a class="wf-home__link" routerLink="/approvals">Approval queue →</a>
        </div>
        <div class="wf-home__quick-queue" aria-label="Workflow run status shortcuts">
          <span>Review queues</span>
          <a routerLink="/workflows/runs" [queryParams]="{ status: 'processing' }">Processing</a>
          <a routerLink="/workflows/runs" [queryParams]="{ status: 'review_required' }">Needs review</a>
          <a routerLink="/workflows/runs" [queryParams]="{ status: 'approval_required' }">Needs approval</a>
          <a routerLink="/workflows/runs" [queryParams]="{ status: 'exception' }">Exceptions</a>
        </div>
      </section>

      <section class="wf-home__section" aria-labelledby="wf-home-workspaces">
        <div class="wf-home__section-heading"><div><h2 id="wf-home-workspaces">Document workspaces</h2><p>Use a dedicated workspace for each business process.</p></div></div>
        <div class="wf-home__grid wf-home__grid--two">
          <a class="wf-home__tile" routerLink="/workflows/invoices"><span class="wf-home__tile-number">ACCOUNTS PAYABLE</span><strong>Invoices <span aria-hidden="true">→</span></strong><small>Process invoices, batches, validation and exception handling.</small></a>
          <a class="wf-home__tile" routerLink="/workflows/contract-workspace"><span class="wf-home__tile-number">LEGAL OPERATIONS</span><strong>Contract review <span aria-hidden="true">→</span></strong><small>Start reviews, follow contracts, inspect findings, milestones, obligations and related playbooks.</small></a>
          <a class="wf-home__tile" routerLink="/workflows/legal/playbooks"><span class="wf-home__tile-number">LEGAL GOVERNANCE</span><strong>Legal playbooks <span aria-hidden="true">→</span></strong><small>Manage shared legal clauses and organization review requirements.</small></a>
          <a class="wf-home__tile" routerLink="/workflows/rfp-projects"><span class="wf-home__tile-number">PROPOSALS</span><strong>RFP &amp; proposals <span aria-hidden="true">→</span></strong><small>Manage requests, source-backed responses and controlled disclosure.</small></a>
        </div>
        <div class="wf-home__secondary-links">
          <a routerLink="/workflows/hr-policies">HR policies &amp; Q&amp;A</a>
          <a routerLink="/workflows/compliance">Compliance</a>
          <a routerLink="/workflows/finance-audits">Finance audits</a>
        </div>
      </section>
    </section>
  `,
})
export class WorkflowHubComponent {}
