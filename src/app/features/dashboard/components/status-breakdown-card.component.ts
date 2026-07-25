import { NgFor, NgIf } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-status-breakdown-card',
  standalone: true,
  imports: [NgFor, NgIf],
  template: `
    <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div class="mb-4 flex items-center justify-between">
        <div>
          <h3 class="font-semibold text-slate-950">{{ title }}</h3>
          <p class="text-sm text-slate-500">{{ subtitle }}</p>
        </div>
      </div>

      <div *ngIf="rows.length; else emptyState" class="space-y-3">
        <div *ngFor="let row of rows" class="flex items-center justify-between gap-4">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-slate-700">
              {{ formatLabel(row.key) }}
            </p>
          </div>

          <div class="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
            {{ row.value }}
          </div>
        </div>
      </div>

      <ng-template #emptyState>
        <p class="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
          No data available yet.
        </p>
      </ng-template>
    </div>
  `,
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
