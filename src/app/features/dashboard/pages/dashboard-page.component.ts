import { DatePipe, NgIf } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { timeout } from 'rxjs';

import {
  DashboardOverview,
  RecentActivity,
} from '../models/dashboard.model';
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
  templateUrl: './dashboard-page.component.html',
  styleUrls: ['./dashboard-page.component.scss'],
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
