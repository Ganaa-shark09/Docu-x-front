import { Component, input, output } from '@angular/core';
import { ClauseInstance, ClauseEvidence, factValue } from '../models/legal-clause.model';
import { label } from '../models/workflow.model';
@Component({
  selector: 'app-legal-clause-card',
  standalone: true,
  styleUrls: ['../workflow.scss', './legal.scss'],
  template: ` <article class="card legal-card">
    <header>
      <div>
        <h3>{{ clause().heading || name() || 'Detected clause' }}</h3>
        <p class="muted">{{ name() || clause().clause_type }}</p>
      </div>
      <span class="badge">{{ label(clause().review_state) }}</span>
    </header>
    <p class="eyebrow">DOCUMENT FACT</p>
    <dl class="legal-facts">
      @for (key of keys(); track key) {
        <div>
          <dt>{{ label(key) }}</dt>
          <dd>{{ value(clause().facts[key].value) }}</dd>
          <dd>
            <button type="button" (click)="evidence.emit(clause().facts[key].evidence)">
              Inspect fact evidence
            </button>
          </dd>
        </div>
      } @empty {
        <p class="muted">No supported normalized facts were extracted.</p>
      }
    </dl>
    <p class="muted">
      Detection confidence: {{ clause().confidence === null ? 'Unknown' : clause().confidence }} —
      estimate, not risk severity.
    </p>
    <p class="muted">
      Method: {{ label(clause().detection_method) }}
      @if (clause().correction_uuid) {
        <span class="badge">Corrected; original preserved in history</span>
      }
    </p>
    <div class="actions">
      <button type="button" (click)="evidence.emit(clause().evidence)">
        Inspect clause evidence
      </button>
      @if (reviewable()) {
        <button type="button" (click)="review.emit(clause())" [disabled]="busy()">
          Review detection
        </button>
        @if (correctable()) {
          <button type="button" (click)="correct.emit(clause())" [disabled]="busy()">
            Correct classification or facts
          </button>
        }
      }
    </div>
  </article>`,
})
export class LegalClauseCardComponent {
  readonly clause = input.required<ClauseInstance>();
  readonly name = input('');
  readonly reviewable = input(false);
  readonly correctable = input(false);
  readonly busy = input(false);
  readonly evidence = output<ClauseEvidence[]>();
  readonly review = output<ClauseInstance>();
  readonly correct = output<ClauseInstance>();
  readonly label = label;
  readonly value = factValue;
  keys(): string[] {
    return Object.keys(this.clause().facts);
  }
}
