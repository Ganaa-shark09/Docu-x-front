import { Component, input } from '@angular/core';
import { label } from '../models/compliance.model';
@Component({
  selector: 'app-compliance-status',
  standalone: true,
  styleUrls: ['../workflow.scss'],
  template: `<span
    class="badge"
    [class.success]="['satisfied', 'valid', 'completed'].includes(status())"
    [class.danger]="['not_satisfied', 'expired', 'revoked'].includes(status())"
    [class.warning]="
      [
        'partially_satisfied',
        'insufficient_evidence',
        'insufficient',
        'stale',
        'pending_review',
        'review_required',
        'undetermined',
      ].includes(status())
    "
    >{{ label(status()) }}</span
  >`,
})
export class ComplianceStatusComponent {
  readonly status = input.required<string>();
  readonly label = label;
}
