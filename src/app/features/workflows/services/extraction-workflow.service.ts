import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  ExtractionResultField,
  ExtractionRun,
  ExtractionRunFilters,
  ExtractionRunListResponse,
  FieldCorrectionPayload,
  SubmitForApprovalPayload,
} from '../models/extraction-workflow.model';

type ExtractionRunApiResponse =
  | ExtractionRun[]
  | ExtractionRunListResponse;

@Injectable({
  providedIn: 'root',
})
export class ExtractionWorkflowService {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = `${environment.apiBaseUrl}/workflows/extraction-runs`;

  getRuns(filters: ExtractionRunFilters = {}): Observable<ExtractionRun[]> {
    let params = new HttpParams();

    if (filters.search) {
      params = params.set('search', filters.search);
    }

    if (filters.status) {
      params = params.set('status', filters.status);
    }

    return this.http
      .get<ExtractionRunApiResponse>(`${this.baseUrl}/`, { params })
      .pipe(map((response) => this.normalizeList(response)));
  }

  getRun(uuid: string): Observable<ExtractionRun> {
    return this.http.get<ExtractionRun>(`${this.baseUrl}/${uuid}/`);
  }

  getFields(uuid: string): Observable<ExtractionResultField[]> {
    return this.http.get<ExtractionResultField[]>(`${this.baseUrl}/${uuid}/fields/`);
  }

  rerun(uuid: string): Observable<{ detail?: string; extraction_run_uuid?: string }> {
    return this.http.post<{ detail?: string; extraction_run_uuid?: string }>(
      `${this.baseUrl}/${uuid}/rerun/`,
      {},
    );
  }

  submitForApproval(
    uuid: string,
    payload: SubmitForApprovalPayload = {},
  ): Observable<unknown> {
    return this.http.post<unknown>(
      `${this.baseUrl}/${uuid}/submit-for-approval/`,
      payload,
    );
  }

  correctField(
    runUuid: string,
    fieldUuid: string,
    payload: FieldCorrectionPayload,
  ): Observable<ExtractionResultField> {
    return this.http.patch<ExtractionResultField>(
      `${this.baseUrl}/${runUuid}/fields/${fieldUuid}/correct/`,
      payload,
    );
  }

  exportRun(uuid: string, exportFormat = 'json'): Observable<HttpResponse<Blob>> {
    const params = new HttpParams().set('export_format', exportFormat);

    return this.http.get(`${this.baseUrl}/${uuid}/export/`, {
      params,
      observe: 'response',
      responseType: 'blob',
    });
  }

  private normalizeList(response: ExtractionRunApiResponse): ExtractionRun[] {
    if (Array.isArray(response)) {
      return response;
    }

    return (
      response.results ||
      response.data ||
      response.items ||
      response.extraction_runs ||
      []
    );
  }
}
