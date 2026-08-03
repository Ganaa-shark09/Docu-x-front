import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-extraction-status-badge',
  standalone: true,
  imports: [],
  templateUrl: './extraction-status-badge.component.html',
  styleUrl: './extraction-status-badge.component.scss',
})
export class ExtractionStatusBadgeComponent {
  @Input({ required: true }) status = '';

  get label(): string {
    return (this.status || 'unknown').replace(/_/g, ' ');
  }

  get statusClass(): string {
    return `extraction-status--${this.status || 'unknown'}`;
  }
}
