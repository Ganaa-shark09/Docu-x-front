import { NgFor, NgIf } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-status-breakdown-card',
  standalone: true,
  imports: [NgFor, NgIf],
  templateUrl: './status-breakdown-card.component.html',
  styleUrls: ['./status-breakdown-card.component.scss'],
})
export class StatusBreakdownCardComponent {
  @Input() title = '';
  @Input() subtitle = '';
  @Input() items: Record<string, number> | null | undefined = {};

  get rows(): Array<{ key: string; value: number }> {
    return Object.entries(this.items ?? {})
      .map(([key, value]) => ({ key, value }))
      .sort((a, b) => b.value - a.value);
  }

  formatLabel(value: string): string {
    return value
      .replaceAll('_', ' ')
      .replaceAll('-', ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }
}
