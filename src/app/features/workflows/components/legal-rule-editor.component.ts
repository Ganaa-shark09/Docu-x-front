import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ClauseRule,
  ClauseType,
  Predicate,
  CONDITIONS,
  SEVERITIES,
} from '../models/legal-clause.model';
import { LegalPredicatesComponent } from './legal-predicates.component';
@Component({
  selector: 'app-legal-rule-editor',
  standalone: true,
  imports: [FormsModule, LegalPredicatesComponent],
  styleUrls: ['../workflow.scss', './legal.scss'],
  template: ` <section aria-label="Playbook rules">
    @for (rule of rules(); track $index; let i = $index) {
      <section class="card rule-group">
        <div class="rule-heading">
          <h3>Rule {{ i + 1 }}</h3>
          @if (!disabled()) {
            <button type="button" (click)="remove(i)">Remove rule</button>
          }
        </div>
        <div class="grid">
          <label
            >Stable rule code<input
              [ngModel]="rule.code"
              (ngModelChange)="edit(i, 'code', $event)"
              [ngModelOptions]="{ standalone: true }"
              maxlength="80"
              [disabled]="disabled()"
          /></label>
          <label
            >Clause type<select
              [ngModel]="rule.clause_type"
              (ngModelChange)="type(i, $event)"
              [ngModelOptions]="{ standalone: true }"
              [disabled]="disabled()"
            >
              <option value="">Choose clause type</option>
              @for (t of taxonomy(); track t.uuid) {
                <option [value]="t.uuid" [disabled]="!t.is_active">
                  {{ t.name }} ({{ t.scope }})
                </option>
              }
            </select></label
          >
          <label
            >Requirement<select
              [ngModel]="rule.requirement"
              (ngModelChange)="edit(i, 'requirement', $event)"
              [ngModelOptions]="{ standalone: true }"
              [disabled]="disabled()"
            >
              <option value="required">Required</option>
              <option value="optional">Optional</option>
              <option value="prohibited">Clause prohibited</option>
            </select></label
          >
          <label
            >Policy severity<select
              [ngModel]="rule.severity || 'medium'"
              (ngModelChange)="edit(i, 'severity', $event)"
              [ngModelOptions]="{ standalone: true }"
              [disabled]="disabled()"
            >
              @for (s of severities; track s) {
                <option [value]="s">{{ s }}</option>
              }
            </select></label
          >
          <label class="check"
            ><input
              type="checkbox"
              [ngModel]="rule.requires_approval || false"
              (ngModelChange)="edit(i, 'requires_approval', $event)"
              [ngModelOptions]="{ standalone: true }"
              [disabled]="disabled()"
            />Require approval for exceptions</label
          >
        </div>
        <p class="muted">
          Conditional requirements apply only when all applicability conditions match. Missing facts
          require review.
        </p>
        <details class="playbook-rule-disclosure" [open]="(rule.when || []).length > 0">
          <summary>Applicability conditions ({{ (rule.when || []).length }})</summary>
          <app-legal-predicates
            title="Applicability conditions"
            [schema]="conditions"
            [predicates]="rule.when || []"
            [disabled]="disabled()"
            (changed)="position(i, 'when', $event)"
          />
        </details>
        @for (group of positions; track group.key) {
          <details class="playbook-rule-disclosure" [open]="(rule[group.key] || []).length > 0">
            <summary>{{ group.title }} ({{ (rule[group.key] || []).length }})</summary>
            <app-legal-predicates
              [title]="group.title"
              [schema]="schema(rule.clause_type)"
              [predicates]="rule[group.key] || []"
              [disabled]="disabled()"
              (changed)="position(i, group.key, $event)"
            />
          </details>
        }
      </section>
    } @empty {
      <p class="notice">
        Add a clause requirement to begin. No organization policy is selected by default.
      </p>
    }
    @if (!disabled()) {
      <button type="button" (click)="add()" [disabled]="rules().length >= 64">
        Add clause rule
      </button>
    }
  </section>`,
})
export class LegalRuleEditorComponent {
  readonly rules = input<ClauseRule[]>([]);
  readonly taxonomy = input<ClauseType[]>([]);
  readonly disabled = input(false);
  readonly changed = output<ClauseRule[]>();
  readonly conditions = CONDITIONS;
  readonly severities = SEVERITIES;
  readonly positions: { key: 'preferred' | 'fallback' | 'prohibited'; title: string }[] = [
    { key: 'preferred', title: 'Preferred position' },
    { key: 'fallback', title: 'Acceptable fallback' },
    { key: 'prohibited', title: 'Unacceptable position' },
  ];
  schema(uuid: string) {
    return this.taxonomy().find((t) => t.uuid === uuid)?.fact_schema || {};
  }
  add(): void {
    if (!this.disabled())
      this.changed.emit([
        ...this.rules(),
        {
          code: '',
          clause_type: '',
          requirement: 'required',
          severity: 'medium',
          requires_approval: false,
          when: [],
          preferred: [],
          fallback: [],
          prohibited: [],
        },
      ]);
  }
  edit(
    index: number,
    key: 'code' | 'requirement' | 'severity' | 'requires_approval',
    value: string | boolean,
  ): void {
    if (this.disabled()) return;
    const rows = structuredClone(this.rules());
    rows[index] = { ...rows[index], [key]: value };
    this.changed.emit(rows);
  }
  type(index: number, uuid: string): void {
    if (this.disabled()) return;
    const rows = structuredClone(this.rules());
    rows[index] = {
      ...rows[index],
      clause_type: uuid,
      preferred: [],
      fallback: [],
      prohibited: [],
    };
    this.changed.emit(rows);
  }
  position(
    index: number,
    key: 'when' | 'preferred' | 'fallback' | 'prohibited',
    value: Predicate[],
  ): void {
    if (this.disabled()) return;
    const rows = structuredClone(this.rules());
    rows[index][key] = value;
    this.changed.emit(rows);
  }
  remove(index: number): void {
    if (!this.disabled()) this.changed.emit(this.rules().filter((_, i) => i !== index));
  }
}
