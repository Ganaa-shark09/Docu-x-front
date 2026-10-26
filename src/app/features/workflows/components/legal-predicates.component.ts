import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FactSchema, Predicate, operators } from '../models/legal-clause.model';
import { label } from '../models/workflow.model';
@Component({
  selector: 'app-legal-predicates',
  standalone: true,
  imports: [FormsModule],
  styleUrls: ['../workflow.scss', './legal.scss'],
  template: ` <fieldset [disabled]="disabled()">
    <legend>{{ title() }}</legend>
    @for (p of predicates(); track $index; let i = $index) {
      <div class="predicate">
        <label
          >Fact<select
            [ngModel]="p.field"
            (ngModelChange)="field(i, $event)"
            [ngModelOptions]="{ standalone: true }"
          >
            <option value="">Choose fact</option>
            @for (key of keys(); track key) {
              <option [value]="key">{{ label(key) }}</option>
            }
          </select></label
        >
        <label
          >Comparison<select
            [ngModel]="p.operator"
            (ngModelChange)="edit(i, 'operator', $event)"
            [ngModelOptions]="{ standalone: true }"
          >
            @for (op of ops(p.field); track op) {
              <option [value]="op">{{ operatorLabel(op) }}</option>
            }
          </select></label
        >
        <label
          >Expected value
          @if (schema()[p.field]?.type === 'boolean') {
            <select
              [ngModel]="p.value"
              (ngModelChange)="edit(i, 'value', $event)"
              [ngModelOptions]="{ standalone: true }"
            >
              <option [ngValue]="true">Yes</option>
              <option [ngValue]="false">No</option>
            </select>
          } @else if (schema()[p.field]?.type === 'enum') {
            <select
              [ngModel]="p.value"
              (ngModelChange)="edit(i, 'value', $event)"
              [ngModelOptions]="{ standalone: true }"
            >
              <option value="">Choose value</option>
              @for (v of schema()[p.field].values || []; track v) {
                <option [value]="v">{{ v }}</option>
              }
            </select>
          } @else {
            <input
              [type]="schema()[p.field]?.type === 'date' ? 'date' : 'text'"
              [attr.inputmode]="schema()[p.field]?.type === 'decimal' ? 'decimal' : null"
              maxlength="2000"
              [ngModel]="p.value"
              (ngModelChange)="edit(i, 'value', $event)"
              [ngModelOptions]="{ standalone: true }"
            />
          }</label
        ><button type="button" (click)="remove(i)">Remove condition</button>
      </div>
    } @empty {
      <p class="muted">No {{ title().toLowerCase() }} configured.</p>
    }
    <button
      type="button"
      [disabled]="disabled() || predicates().length >= 16 || !keys().length"
      (click)="add()"
    >
      Add condition
    </button>
  </fieldset>`,
})
export class LegalPredicatesComponent {
  readonly predicates = input<Predicate[]>([]);
  readonly schema = input<FactSchema>({});
  readonly title = input('Conditions');
  readonly disabled = input(false);
  readonly changed = output<Predicate[]>();
  readonly label = label;
  keys(): string[] {
    return Object.keys(this.schema());
  }
  ops(key: string) {
    return operators(this.schema()[key]);
  }
  operatorLabel(value: string): string {
    return (
      (
        {
          eq: 'Equals',
          ne: 'Does not equal',
          gte: 'At least',
          lte: 'At most',
          contains: 'Contains',
        } as Record<string, string>
      )[value] || value
    );
  }
  add(): void {
    if (this.disabled()) return;
    const field = this.keys()[0];
    if (!field) return;
    this.changed.emit([
      ...this.predicates(),
      { field, operator: 'eq', value: this.schema()[field].type === 'boolean' ? true : '' },
    ]);
  }
  field(index: number, value: string): void {
    if (this.disabled()) return;
    const rows = structuredClone(this.predicates());
    rows[index] = {
      field: value,
      operator: 'eq',
      value: this.schema()[value]?.type === 'boolean' ? true : '',
    };
    this.changed.emit(rows);
  }
  edit(
    index: number,
    key: 'operator' | 'value',
    value: Predicate['operator'] | Predicate['value'],
  ): void {
    if (this.disabled()) return;
    const rows = structuredClone(this.predicates());
    if (key === 'operator') rows[index].operator = value as Predicate['operator'];
    else rows[index].value = value;
    this.changed.emit(rows);
  }
  remove(index: number): void {
    if (!this.disabled()) this.changed.emit(this.predicates().filter((_, i) => i !== index));
  }
}
