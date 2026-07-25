import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { API_ENDPOINTS } from '../../../core/config/api-endpoints';
import {
  ApprovalDashboardMetrics,
  DashboardOverview,
  DocumentDashboardMetrics,
  ExtractionDashboardMetrics,
  RagUsageDashboardMetrics,
  RecentActivityResponse,
} from '../../../core/models/dashboard.model';

@Injectable({
  providedIn: 'root',
})
export class DashboardService {
  private readonly http = inject(HttpClient);

  getOverview(): Observable<DashboardOverview> {
    return this.http.get<DashboardOverview>(
      `${environment.apiBaseUrl}${API_ENDPOINTS.dashboard.overview}`,
    );
  }

  getDocumentMetrics(): Observable<DocumentDashboardMetrics> {
    return this.http.get<DocumentDashboardMetrics>(
      `${environment.apiBaseUrl}${API_ENDPOINTS.dashboard.documents}`,
    );
  }

  getApprovalMetrics(): Observable<ApprovalDashboardMetrics> {
    return this.http.get<ApprovalDashboardMetrics>(
      `${environment.apiBaseUrl}${API_ENDPOINTS.dashboard.approvals}`,
    );
  }

  getExtractionMetrics(): Observable<ExtractionDashboardMetrics> {
    return this.http.get<ExtractionDashboardMetrics>(
      `${environment.apiBaseUrl}${API_ENDPOINTS.dashboard.extractions}`,
    );
  }

  getRagUsageMetrics(): Observable<RagUsageDashboardMetrics> {
    return this.http.get<RagUsageDashboardMetrics>(
      `${environment.apiBaseUrl}${API_ENDPOINTS.dashboard.ragUsage}`,
    );
  }

  getRecentActivity(limit = 20): Observable<RecentActivityResponse> {
    return this.http.get<RecentActivityResponse>(
      `${environment.apiBaseUrl}${API_ENDPOINTS.dashboard.recentActivity}`,
      {
        params: {
          limit,
        },
      },
    );
  }
}
