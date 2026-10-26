import { Component, input, output } from '@angular/core';
import { JsonPipe, PercentPipe } from '@angular/common';
import { Finding, FindingDecision } from '../models/workflow.model';
import { WorkflowStatusComponent } from './workflow-status.component';
@Component({
  selector: 'app-workflow-finding',
  standalone: true,
  imports: [JsonPipe, PercentPipe, WorkflowStatusComponent],
  styleUrls: ['../workflow.scss'],
  template: ` <article class="card finding">
    <header>
      <h3>{{ finding().title }}</h3>
      <app-workflow-status [status]="finding().severity" />
    </header>
    <p>{{ finding().description }}</p>
    <p class="muted">
      Category: {{ finding().category }} | Owner: {{ finding().owner ?? 'Unassigned' }}
    </p>
    @if (invoiceContext() && invoiceFieldNames().length) {
      <p class="workflow-finding__fields"><strong>Affected fields:</strong> {{ invoiceFieldNames().join(', ') }}</p>
    }
    <app-workflow-status [status]="finding().status" />
    <app-workflow-status [status]="finding().review_state" />
    @if (finding().confidence !== null) {
      <p>Model confidence: {{ finding().confidence | percent }} | an estimate requiring review.</p>
    }
    <details>
      <summary>Source / evidence references ({{ finding().evidence.length }})</summary>
      <pre>{{ finding().evidence | json }}</pre>
    </details>
    @if (reviewHint()) {
      <p class="muted workflow-finding__hint"><strong>Action unavailable:</strong> {{ reviewHint() }}</p>
    }
    @if (canReview()) {
      <div class="actions" aria-label="Finding review">
        <button [disabled]="pending()" (click)="review.emit('accepted')">Accept finding</button
        ><button [disabled]="pending()" (click)="review.emit('dismissed')">Dismiss finding</button
        ><button [disabled]="pending()" (click)="review.emit('resolved')">Mark resolved</button>
      </div>
    }
  </article>`,
})
export class WorkflowFindingComponent {
  readonly finding = input.required<Finding>();
  readonly invoiceContext = input(false);
  readonly canReview = input(false);
  readonly reviewHint = input('');
  readonly pending = input(false);
  readonly review = output<FindingDecision>();
  invoiceFieldNames(): string[] {
    const data = this.finding().data;
    if (!data || Array.isArray(data) || typeof data !== 'object') return [];
    const fields = data['fields'];
    return Array.isArray(fields) ? fields.filter((field): field is string =>
      typeof field === 'string' && field.length <= 100).slice(0, 20) : [];
  }
}
