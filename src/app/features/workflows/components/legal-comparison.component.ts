import { Component, input, output } from '@angular/core';
import {
  ClauseDeviation,
  ClauseEvidence,
  Predicate,
  factValue,
  comparisonLabel,
} from '../models/legal-clause.model';
import { label } from '../models/workflow.model';
@Component({
  selector: 'app-legal-comparison',
  standalone: true,
  styleUrls: ['../workflow.scss', './legal.scss'],
  template: ` <article class="card legal-card">
    <header>
      <h3>{{ label(deviation().rule_code) }}</h3>
      <span class="badge">{{ result(deviation().comparison, complete()) }}</span>
    </header>
    <div class="comparison-grid">
      <section>
        <p class="eyebrow">DOCUMENT FACT</p>
        <dl class="legal-facts">
          @for (key of keys(); track key) {
            <div>
              <dt>{{ label(key) }}</dt>
              <dd>{{ value(deviation().observed.facts[key]) }}</dd>
            </div>
          } @empty {
            <p>
              {{
                complete()
                  ? 'No supported clause facts detected.'
                  : 'Coverage is insufficient to establish absence.'
              }}
            </p>
          }
        </dl>
      </section>
      <section>
        <p class="eyebrow">PLAYBOOK EXPECTATION</p>
        <p>{{ label(deviation().expected.requirement) }} clause</p>
        @for (group of groups; track group.key) {
          <h4>{{ group.title }}</h4>
          <ul>
            @for (p of deviation().expected[group.key] || []; track $index) {
              <li>{{ predicate(p) }}</li>
            } @empty {
              <li class="muted">No position configured.</li>
            }
          </ul>
        }
      </section>
    </div>
    <section>
      <p class="eyebrow">DEVIATION</p>
      <p>{{ result(deviation().comparison, complete()) }}</p>
      <p class="eyebrow">POLICY RISK</p>
      <span class="badge" [attr.data-severity]="deviation().severity"
        >{{ label(deviation().severity) }} severity — company playbook</span
      >
      @if (deviation().requires_approval) {
        <span class="badge warning">Approval required for exception</span>
      }
      <p>Review state: {{ state() }}</p>
    </section>
    <div class="actions">
      @if (deviation().evidence.length) {
        <button type="button" (click)="evidence.emit(deviation().evidence)">
          Inspect deviation evidence
        </button>
      }
      @if (reviewable()) {
        <button type="button" [disabled]="busy()" (click)="review.emit(deviation())">
          Review comparison
        </button>
      }
    </div>
  </article>`,
})
export class LegalComparisonComponent {
  readonly deviation = input.required<ClauseDeviation>();
  readonly complete = input(false);
  readonly state = input('Unreviewed');
  readonly reviewable = input(false);
  readonly busy = input(false);
  readonly evidence = output<ClauseEvidence[]>();
  readonly review = output<ClauseDeviation>();
  readonly label = label;
  readonly value = factValue;
  readonly result = comparisonLabel;
  readonly groups: { key: 'preferred' | 'fallback' | 'prohibited' | 'when'; title: string }[] = [
    { key: 'when', title: 'Applicability' },
    { key: 'preferred', title: 'Preferred' },
    { key: 'fallback', title: 'Fallback' },
    { key: 'prohibited', title: 'Unacceptable' },
  ];
  keys(): string[] {
    return Object.keys(this.deviation().observed.facts);
  }
  predicate(p: Predicate): string {
    return (
      label(p.field) +
      ' ' +
      ({ eq: '=', ne: '≠', gte: '≥', lte: '≤', contains: 'contains' } as Record<string, string>)[
        p.operator
      ] +
      ' ' +
      factValue(p.value)
    );
  }
}
