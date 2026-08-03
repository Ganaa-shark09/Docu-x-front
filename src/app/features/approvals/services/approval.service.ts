import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import {
  ApprovalActionPayload,
  ApprovalFilters,
  ApprovalRequest,
} from '../models/approval.model';

type ApprovalListApiResponse =
  | ApprovalRequest[]
  | {
      count?: number;
      next?: string | null;
      previous?: string | null;
      results?: ApprovalRequest[];
      approvals?: ApprovalRequest[];
      approval_requests?: ApprovalRequest[];
      data?: ApprovalRequest[];
      items?: ApprovalRequest[];
    };

@Injectable({
  providedIn: 'root',
})
export class ApprovalService {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = 'http://127.0.0.1:8000/api/approvals';

  getApprovals(filters: ApprovalFilters = {}): Observable<ApprovalRequest[]> {
    let params = new HttpParams();

    if (filters.status) {
      params = params.set('status', filters.status);
    }

    if (filters.search) {
      params = params.set('search', filters.search);
    }

    return this.http
      .get<ApprovalListApiResponse>(`${this.baseUrl}/`, { params })
      .pipe(map((response) => this.normalizeApprovalList(response)));
  }

  getApproval(uuid: string): Observable<ApprovalRequest> {
    return this.http.get<ApprovalRequest>(`${this.baseUrl}/${uuid}/`);
  }

  approve(uuid: string, payload: ApprovalActionPayload): Observable<ApprovalRequest> {
    return this.http.post<ApprovalRequest>(`${this.baseUrl}/${uuid}/approve/`, payload);
  }

  reject(uuid: string, payload: ApprovalActionPayload): Observable<ApprovalRequest> {
    return this.http.post<ApprovalRequest>(`${this.baseUrl}/${uuid}/reject/`, payload);
  }

  requestChanges(uuid: string, payload: ApprovalActionPayload): Observable<ApprovalRequest> {
    return this.http.post<ApprovalRequest>(
      `${this.baseUrl}/${uuid}/request-changes/`,
      payload,
    );
  }

  private normalizeApprovalList(response: ApprovalListApiResponse): ApprovalRequest[] {
    if (Array.isArray(response)) {
      return response;
    }

    return (
      response.results ||
      response.approvals ||
      response.approval_requests ||
      response.data ||
      response.items ||
      []
    );
  }
}
