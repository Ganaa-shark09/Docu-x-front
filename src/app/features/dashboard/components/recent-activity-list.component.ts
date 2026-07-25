import { DatePipe, NgClass, NgFor, NgIf, SlicePipe } from '@angular/common';
import { Component, Input } from '@angular/core';

import { RecentActivity } from '../../../core/models/dashboard.model';

@Component({
  selector: 'app-recent-activity-list',
  standalone: true,
  imports: [DatePipe, NgClass, NgFor, NgIf, SlicePipe],
  template: `
    <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div class="mb-5 flex items-start justify-between gap-4">
        <div>
          <h3 class="font-semibold text-slate-950">Recent Activity</h3>
          <p class="text-sm text-slate-500">
            Latest document, approval, extraction, notification, and audit activity.
          </p>
        </div>

        <div
          *ngIf="activities.length"
          class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600"
        >
          Showing {{ visibleActivities.length }} of {{ activities.length }}
        </div>
      </div>

      <div *ngIf="activities.length; else emptyState">
        <div class="max-h-[460px] space-y-4 overflow-y-auto pr-2">
          <div
            *ngFor="let activity of visibleActivities"
            class="flex gap-4 rounded-xl border border-slate-100 bg-slate-50 p-4"
          >
            <div
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold"
              [ngClass]="activityTypeClass(activity.type)"
            >
              {{ activity.type.slice(0, 2).toUpperCase() }}
            </div>

            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <h4 class="font-medium text-slate-950">
                  {{ activity.title }}
                </h4>

                <span
                  class="rounded-full px-2.5 py-1 text-xs font-semibold"
                  [ngClass]="statusClass(activity.status)"
                >
                  {{ formatLabel(activity.status) }}
                </span>
              </div>

              <p class="mt-1 text-sm text-slate-600">
                {{ activity.message }}
              </p>

              <p class="mt-2 text-xs text-slate-400">
                {{ activity.created_at | date: 'medium' }}
              </p>
            </div>
          </div>
        </div>

        <div class="mt-5 flex justify-center" *ngIf="hasMoreActivities">
          <button
            type="button"
            (click)="loadMore()"
            class="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            Load more
          </button>
        </div>
      </div>

      <ng-template #emptyState>
        <p class="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
          No recent activity yet.
        </p>
      </ng-template>
    </div>
  `,
})
export class RecentActivityListComponent {
  @Input() activities: RecentActivity[] = [];

  visibleCount = 5;
  readonly incrementBy = 5;

  get visibleActivities(): RecentActivity[] {
    return this.activities.slice(0, this.visibleCount);
  }

  get hasMoreActivities(): boolean {
    return this.visibleCount < this.activities.length;
  }

  loadMore(): void {
    this.visibleCount += this.incrementBy;
  }

  formatLabel(value: string): string {
    return value
      .replaceAll('_', ' ')
      .replaceAll('-', ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  activityTypeClass(type: string): string {
    switch (type) {
      case 'document':
        return 'bg-blue-100 text-blue-700';
      case 'approval':
        return 'bg-purple-100 text-purple-700';
      case 'extraction':
        return 'bg-emerald-100 text-emerald-700';
      case 'notification':
        return 'bg-amber-100 text-amber-700';
      case 'audit':
        return 'bg-slate-200 text-slate-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  }

  statusClass(status: string): string {
    switch (status) {
      case 'approved':
      case 'success':
      case 'ready':
      case 'read':
      case 'info':
        return 'bg-emerald-100 text-emerald-700';

      case 'pending':
      case 'in_review':
      case 'processing':
      case 'running':
      case 'unread':
      case 'medium':
        return 'bg-amber-100 text-amber-700';

      case 'failed':
      case 'rejected':
      case 'critical':
      case 'high':
        return 'bg-red-100 text-red-700';

      case 'changes_requested':
      case 'review_required':
      case 'submitted_for_approval':
        return 'bg-purple-100 text-purple-700';

      default:
        return 'bg-slate-100 text-slate-700';
    }
  }
}
