import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { API_ENDPOINTS } from '../../../core/config/api-endpoints';

@Injectable({
  providedIn: 'root',
})
export class DashboardService {
  private readonly http = inject(HttpClient);

  getOverview(): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(
      `${environment.apiBaseUrl}${API_ENDPOINTS.dashboard.overview}`,
    );
  }
}
