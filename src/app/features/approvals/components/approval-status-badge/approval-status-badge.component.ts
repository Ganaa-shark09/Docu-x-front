import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-approval-status-badge',
  standalone: true,
  imports: [],
  templateUrl: './approval-status-badge.component.html',
  styleUrl: './approval-status-badge.component.scss',
})
export class ApprovalStatusBadgeComponent {
  @Input({ required: true }) status = '';

  get label(): string {
    return this.status.replace(/_/g, ' ');
  }

  get statusClass(): string {
    return `approval-status--${this.status || 'unknown'}`;
  }
}
