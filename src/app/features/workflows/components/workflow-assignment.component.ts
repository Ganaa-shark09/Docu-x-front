import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Membership } from '../../documents/models/governance.model';
import { Principal } from '../models/workflow.model';
@Component({
  selector: 'app-workflow-assignment',
  standalone: true,
  imports: [FormsModule],
  styleUrls: ['../workflow.scss'],
  template: `
    <label
      >Assignment target<select
        [ngModel]="selected"
        [ngModelOptions]="{ standalone: true }"
        (ngModelChange)="select($event)"
        [disabled]="disabled()"
      >
        <option value="">Choose an available membership target</option>
        @for (m of active(); track m.uuid) {
          <option [value]="'user:' + m.uuid">
            User: {{ m.user_email || m.username }} | {{ m.department_name }}
          </option>
          <option [value]="'department:' + m.uuid">Department: {{ m.department_name }}</option>
          <option [value]="'group:' + m.uuid">{{ m.department_name }} | {{ m.role }}</option>
        }
      </select></label
    >
    @if (!active().length) {
      <p class="muted">
        No company membership choices are available. An administrator must configure the directory.
      </p>
    }
  `,
})
export class WorkflowAssignmentComponent {
  readonly memberships = input<Membership[]>([]);
  readonly disabled = input(false);
  readonly changed = output<Principal | null>();
  selected = '';
  active(): Membership[] {
    return this.memberships().filter((m) => m.is_active);
  }
  select(value: string): void {
    this.selected = value;
    const [kind, uuid] = value.split(':');
    const m = this.active().find((x) => x.uuid === uuid);
    this.changed.emit(
      !m
        ? null
        : kind === 'user'
          ? { user: m.user }
          : kind === 'group'
            ? { department: m.department, role: m.role }
            : { department: m.department },
    );
  }
}
