import { DatePipe, NgClass, NgFor, NgIf, SlicePipe } from '@angular/common';
import { Component, Input } from '@angular/core';

import { RecentActivity } from '../models/dashboard.model';

@Component({
  selector: 'app-recent-activity-list',
  standalone: true,
  imports: [
    DatePipe,
    NgClass,
    NgFor,
    NgIf,
    //  SlicePipe
  ],
  templateUrl: './recent-activity-list.component.html',
  styleUrls: ['./recent-activity-list.component.scss'],
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
