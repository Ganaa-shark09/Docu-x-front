import { NgClass } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-document-status-badge',
  standalone: true,
  imports: [NgClass],
  templateUrl: './document-status-badge.component.html',
  styleUrls: ['./document-status-badge.component.scss'],
})
export class DocumentStatusBadgeComponent {
  @Input() status = '';

  get label(): string {
    return this.status
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  get statusClass(): string {
    switch (this.status) {
      case 'ready':
        return 'bg-emerald-100 text-emerald-700';
      case 'processing':
      case 'uploaded':
        return 'bg-amber-100 text-amber-700';
      case 'failed':
        return 'bg-red-100 text-red-700';
      case 'archived':
        return 'bg-slate-200 text-slate-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  }
}
