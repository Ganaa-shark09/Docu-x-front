import { NgIf } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-metric-card',
  standalone: true,
  imports: [NgIf],
  template: `
    <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-sm font-medium text-slate-500">{{ title }}</p>
          <p class="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            {{ value }}
          </p>
        </div>

        <div class="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">
          {{ badge }}
        </div>
      </div>

      <p *ngIf="subtitle" class="mt-4 text-sm text-slate-500">
        {{ subtitle }}
      </p>
    </div>
  `,
})
export class MetricCardComponent {
  @Input() title = '';
  @Input() value: string | number = '-';
  @Input() subtitle = '';
  @Input() badge = 'Metric';
}
