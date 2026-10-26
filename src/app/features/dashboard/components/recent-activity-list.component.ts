import { DatePipe } from '@angular/common';
import { Component, Input, OnChanges } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideFileText,
  LucideCircleCheck,
  LucideScanText,
  LucideBell,
  LucideActivity,
} from '@lucide/angular';
import { RecentActivity } from '../models/dashboard.model';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const routes: Record<string, string> = {
  document: '/documents/detail',
  approval: '/approvals',
  approval_request: '/approvals',
  extraction: '/workflows/extractions',
  extraction_run: '/workflows/extractions',
  workflow_run: '/workflows/runs',
  workflow_definition: '/workflows/definitions',
  finance_audit: '/workflows/finance-audits',
  rfp_project: '/workflows/rfp-projects',
  hr_policy: '/workflows/hr-policies',
  compliance_assessment: '/workflows/compliance/assessments',
};
@Component({
  selector: 'app-recent-activity-list',
  standalone: true,
  imports: [
    DatePipe,
    RouterLink,
    LucideFileText,
    LucideCircleCheck,
    LucideScanText,
    LucideBell,
    LucideActivity,
  ],
  templateUrl: './recent-activity-list.component.html',
  styleUrls: ['./recent-activity-list.component.scss'],
})
export class RecentActivityListComponent implements OnChanges {
  @Input() activities: RecentActivity[] = [];
  readonly categories = [
    { value: '', label: 'All activity' },
    { value: 'document', label: 'Documents' },
    { value: 'approval', label: 'Approvals' },
    { value: 'extraction', label: 'Extractions' },
    { value: 'notification', label: 'Notifications' },
    { value: 'audit', label: 'Audit trail' },
  ];
  category = '';
  visibleCount = 5;
  readonly incrementBy = 5;
  ngOnChanges() {
    this.visibleCount = 5;
  }
  get filteredActivities() {
    return this.activities.filter((a) => !this.category || a.type === this.category);
  }
  get visibleActivities() {
    return this.filteredActivities.slice(0, this.visibleCount);
  }
  get hasMoreActivities() {
    return this.visibleCount < this.filteredActivities.length;
  }
  filter(category: string) {
    this.category = this.categories.some((c) => c.value === category) ? category : '';
    this.visibleCount = 5;
  }
  loadMore() {
    this.visibleCount += this.incrementBy;
  }
  formatLabel(value: string) {
    const text = (value || '').replaceAll('_', ' ').replaceAll('-', ' ');
    return text ? text[0].toUpperCase() + text.slice(1) : 'Recorded';
  }
  readable(value: string) {
    return (value || '').replace(
      /(^|\s)([a-z]+(?:_[a-z]+)+)(?=$|[\s,:;!?]|\.$)/g,
      (_, space: string, code: string) => space + code.replaceAll('_', ' '),
    );
  }
  title(activity: RecentActivity) {
    return ['audit', 'notification'].includes(activity.type)
      ? this.readable(activity.title)
      : activity.title;
  }
  description(activity: RecentActivity) {
    if (activity.type === 'audit') return '';
    const title = activity.title || '';
    const index = title ? activity.message.indexOf(title) : -1;
    return index >= 0
      ? this.readable(activity.message.slice(0, index)) +
          title +
          this.readable(activity.message.slice(index + title.length))
      : this.readable(activity.message);
  }
  typeLabel(type: string) {
    return this.categories.find((c) => c.value === type)?.label || 'Workspace';
  }
  statusLabel(status: string) {
    return status === 'info' ? 'Recorded' : this.formatLabel(status);
  }
  statusClass(status: string) {
    if (['approved', 'success', 'ready'].includes(status)) return 'positive';
    if (['failed', 'rejected', 'critical', 'high'].includes(status)) return 'danger';
    if (
      [
        'pending',
        'in_review',
        'processing',
        'running',
        'changes_requested',
        'review_required',
        'submitted_for_approval',
        'medium',
      ].includes(status)
    )
      return 'warning';
    return 'neutral';
  }
  path(activity: RecentActivity) {
    const linked = ['audit', 'notification'].includes(activity.type);
    const type = linked ? activity.metadata?.['resource_type'] : activity.type;
    const id = linked ? activity.metadata?.['related_resource_uuid'] : activity.resource_uuid;
    return typeof type === 'string' && typeof id === 'string' && uuid.test(id) && routes[type]
      ? routes[type] + '/' + id
      : null;
  }
}
