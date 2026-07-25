import { JsonPipe } from '@angular/common';
import { Component, inject } from '@angular/core';

import { DashboardService } from '../services/dashboard.service';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [JsonPipe],
  template: `
    <section class="space-y-6">
      <div>
        <h2 class="text-2xl font-bold text-slate-950">Dashboard</h2>
        <p class="text-sm text-slate-500">
          Overview from protected backend dashboard API.
        </p>
      </div>

      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="text-sm text-slate-500">Documents</div>
          <div class="mt-2 text-2xl font-bold text-slate-950">
            {{ getMetric('documents', 'total_documents') }}
          </div>
        </div>

        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="text-sm text-slate-500">Approvals</div>
          <div class="mt-2 text-2xl font-bold text-slate-950">
            {{ getMetric('approvals', 'total_approvals') }}
          </div>
        </div>

        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="text-sm text-slate-500">Unread Notifications</div>
          <div class="mt-2 text-2xl font-bold text-slate-950">
            {{ getMetric('notifications', 'unread_count') }}
          </div>
        </div>

        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="text-sm text-slate-500">RAG Conversations</div>
          <div class="mt-2 text-2xl font-bold text-slate-950">
            {{ getMetric('rag_usage', 'total_conversations') }}
          </div>
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div class="mb-3 font-semibold text-slate-950">Raw API Response</div>

        <pre class="max-h-[500px] overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">{{ overview | json }}</pre>
      </div>
    </section>
  `,
})
export class DashboardPageComponent {
  private readonly dashboardService = inject(DashboardService);

  overview: Record<string, unknown> | null = null;

  constructor() {
    this.dashboardService.getOverview().subscribe({
      next: (response) => {
        this.overview = response;
      },
    });
  }

  getMetric(section: string, key: string): string | number {
    const sectionValue = this.overview?.[section];

    if (!sectionValue || typeof sectionValue !== 'object') {
      return '-';
    }

    const value = (sectionValue as Record<string, unknown>)[key];

    if (typeof value === 'number' || typeof value === 'string') {
      return value;
    }

    return '-';
  }
}
