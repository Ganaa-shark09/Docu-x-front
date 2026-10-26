import { DistributionChartComponent } from '../../../shared/charts/distribution-chart.component';
import { DatePipe, NgIf } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { catchError, finalize, forkJoin, of, timeout } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { DashboardOverview, RecentActivity } from '../models/dashboard.model';
import { MetricCardComponent } from '../components/metric-card.component';
import { RecentActivityListComponent } from '../components/recent-activity-list.component';
import { DashboardService } from '../services/dashboard.service';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [
    DatePipe,
    MetricCardComponent,
    NgIf,
    RecentActivityListComponent,
    DistributionChartComponent,
  ],
  templateUrl: './dashboard-page.component.html',
  styleUrls: ['./dashboard-page.component.scss'],
})
export class DashboardPageComponent {
  private readonly destroy = inject(DestroyRef);
  private readonly dashboardService = inject(DashboardService);

  readonly overview = signal<DashboardOverview | null>(null);
  readonly recentActivities = signal<RecentActivity[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal('');

  constructor() {
    this.loadDashboard();
  }

  loadDashboard(): void {
    if (this.isLoading()) return;
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.overview.set(null);
    this.recentActivities.set([]);
    forkJoin({
      overview: this.dashboardService.getOverview().pipe(
        timeout(15000),
        catchError(() => {
          this.errorMessage.set('Unable to load workspace metrics. Please retry.');
          return of(null);
        }),
      ),
      activity: this.dashboardService.getRecentActivity(20).pipe(
        timeout(15000),
        catchError(() => {
          this.errorMessage.set('Recent activity is unavailable. Please retry.');
          return of(null);
        }),
      ),
    })
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.isLoading.set(false)),
      )
      .subscribe(({ overview, activity }) => {
        this.overview.set(overview);
        this.recentActivities.set(activity?.results || []);
      });
  }

  formatConfidence(value: number): string {
    return `${Number(value || 0).toFixed(2)}%`;
  }
}
