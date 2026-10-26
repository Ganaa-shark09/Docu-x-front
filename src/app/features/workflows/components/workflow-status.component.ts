import { Component, input } from '@angular/core';
import { label } from '../models/workflow.model';
@Component({
  selector: 'app-workflow-status',
  standalone: true,
  template: `<span
    class="badge"
    [class.success]="success()"
    [class.warning]="warning()"
    [class.danger]="danger()"
    >{{ label(status()) }}</span
  >`,
  styleUrls: ['../workflow.scss'],
})
export class WorkflowStatusComponent {
  readonly status = input.required<string>();
  readonly label = label;
  success(): boolean {
    return ['completed', 'approved', 'accepted', 'resolved'].includes(this.status());
  }
  warning(): boolean {
    return [
      'waiting',
      'review_required',
      'approval_required',
      'exception',
      'queued',
      'pending',
      'unreviewed',
    ].includes(this.status());
  }
  danger(): boolean {
    return ['failed', 'rejected', 'critical', 'high'].includes(this.status());
  }
}
