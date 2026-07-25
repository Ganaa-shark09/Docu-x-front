import { DatePipe, NgIf } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { timeout } from 'rxjs';

import {
  DashboardOverview,
  RecentActivity,
} from '../../../core/models/dashboard.model';
import { MetricCardComponent } from '../components/metric-card.component';
import { RecentActivityListComponent } from '../components/recent-activity-list.component';
import { StatusBreakdownCardComponent } from '../components/status-breakdown-card.component';
import { DashboardService } from '../services/dashboard.service';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [
    DatePipe,
    MetricCardComponent,
    NgIf,
    RecentActivityListComponent,
    StatusBreakdownCardComponent,
  ],
  template: `
    <section class="space-y-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 class="text-2xl font-bold text-slate-950">Dashboard</h2>
          <p class="text-sm text-slate-500">
            Live workspace summary for documents, approvals, extraction, notifications, and RAG usage.
          </p>
          <p *ngIf="overview()?.generated_at" class="mt-1 text-xs text-slate-400">
            Last generated: {{ overview()?.generated_at | date: 'medium' }}
          </p>
        </div>

        <button
          type="button"
          (click)="loadDashboard()"
          [disabled]="isLoading()"
          class="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {{ isLoading() ? 'Refreshing...' : 'Refresh' }}
        </button>
      </div>

      <div
        *ngIf="errorMessage()"
        class="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
      >
        {{ errorMessage() }}
      </div>

      <div
        *ngIf="isLoading() && !overview()"
        class="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm"
      >
        Loading dashboard metrics...
      </div>

      <ng-container *ngIf="overview() as data">
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <app-metric-card
            title="Total Documents"
            [value]="data.documents.total_documents"
            [subtitle]="data.documents.ai_ready_documents + ' AI-ready documents'"
            badge="Docs"
          />

          <app-metric-card
            title="Pending Approvals"
            [value]="data.approvals.pending"
            [subtitle]="data.approvals.assigned_to_me + ' assigned to you'"
            badge="Review"
          />

          <app-metric-card
            title="Unread Notifications"
            [value]="data.notifications.unread_count"
            [subtitle]="data.notifications.total_notifications + ' active notifications'"
            badge="Inbox"
          />

          <app-metric-card
            title="RAG Conversations"
            [value]="data.rag_usage.total_conversations"
            [subtitle]="data.rag_usage.total_ai_responses + ' AI responses'"
            badge="AI"
          />
        </div>

        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <app-metric-card
            title="Indexed Documents"
            [value]="data.documents.indexed_documents"
            [subtitle]="data.documents.failed_documents + ' failed documents'"
            badge="Index"
          />

          <app-metric-card
            title="Extraction Runs"
            [value]="data.extractions.total_extraction_runs"
            [subtitle]="data.extractions.approved + ' approved extractions'"
            badge="Extract"
          />

          <app-metric-card
            title="Avg Extraction Confidence"
            [value]="formatConfidence(data.extractions.average_confidence)"
            [subtitle]="data.extractions.review_required + ' require review'"
            badge="Quality"
          />

          <app-metric-card
            title="Total Tokens"
            [value]="data.rag_usage.total_tokens"
            [subtitle]="data.rag_usage.total_prompt_tokens + ' prompt tokens'"
            badge="Usage"
          />
        </div>

        <div class="grid gap-4 xl:grid-cols-3">
          <app-status-breakdown-card
            title="Document Status"
            subtitle="Processing and readiness states"
            [items]="data.documents.by_status"
          />

          <app-status-breakdown-card
            title="Approval Status"
            subtitle="Human review workflow distribution"
            [items]="data.approvals.by_status"
          />

          <app-status-breakdown-card
            title="Extraction Status"
            subtitle="Structured extraction pipeline state"
            [items]="data.extractions.by_status"
          />
        </div>

        <div class="grid gap-4 xl:grid-cols-3">
          <app-status-breakdown-card
            title="Document Types"
            subtitle="Uploaded document categories"
            [items]="data.documents.by_type"
          />

          <app-status-breakdown-card
            title="Sensitivity Labels"
            subtitle="Data firewall classification"
            [items]="data.documents.by_sensitivity"
          />

          <app-status-breakdown-card
            title="RAG Providers"
            subtitle="Model provider usage"
            [items]="data.rag_usage.by_provider"
          />
        </div>

        <app-recent-activity-list [activities]="recentActivities()" />
      </ng-container>
    </section>
  `,
})
export class DashboardPageComponent {
  private readonly dashboardService = inject(DashboardService);

  readonly overview = signal<DashboardOverview | null>(null);
  readonly recentActivities = signal<RecentActivity[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal('');

  constructor() {
    this.loadDashboard();
  }

  loadDashboard(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    let overviewDone = false;
    let activityDone = false;

    const finishIfDone = () => {
      if (overviewDone && activityDone) {
        this.isLoading.set(false);
      }
    };

    this.dashboardService
      .getOverview()
      .pipe(timeout(15000))
      .subscribe({
        next: (overview) => {
          console.log('Dashboard overview loaded:', overview);
          this.overview.set(overview);
        },
        error: (error) => {
          console.error('Dashboard overview error:', error);
          this.errorMessage.set(
            error?.error?.detail ||
              'Unable to load dashboard overview. Check backend logs and browser Network tab.',
          );
        },
        complete: () => {
          overviewDone = true;
          finishIfDone();
        },
      });

    this.dashboardService
      .getRecentActivity(20)
      .pipe(timeout(15000))
      .subscribe({
        next: (response) => {
          console.log('Recent activity loaded:', response);
          this.recentActivities.set(response.results || []);
        },
        error: (error) => {
          console.error('Recent activity error:', error);
        },
        complete: () => {
          activityDone = true;
          finishIfDone();
        },
      });
  }

  formatConfidence(value: number): string {
    return `${Number(value || 0).toFixed(2)}%`;
  }
}
