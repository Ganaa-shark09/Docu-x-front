import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { API_ENDPOINTS } from '../../../core/config/api-endpoints';
import { PaginatedResponse } from '../../../shared/models/api-response.model';
import {
  DepartmentOption,
  DocumentDetail,
  DocumentFilters,
  DocumentListItem,
  DocumentProcessingJob,
} from '../models/document.model';

@Injectable({
  providedIn: 'root',
})
export class DocumentsService {
  private readonly http = inject(HttpClient);

  listDocuments(filters: DocumentFilters = {}): Observable<PaginatedResponse<DocumentListItem>> {
    return this.http
      .get<PaginatedResponse<DocumentListItem> | DocumentListItem[]>(
        `${environment.apiBaseUrl}${API_ENDPOINTS.documents.base}`,
        {
          params: this.buildParams(filters),
        },
      )
      .pipe(
        map((response) => this.normalizePaginatedResponse<DocumentListItem>(response)),
      );
  }

  getDocument(uuid: string): Observable<DocumentDetail> {
    return this.http.get<DocumentDetail>(
      `${environment.apiBaseUrl}${API_ENDPOINTS.documents.base}${uuid}/`,
    );
  }

  uploadDocument(payload: {
    title: string;
    description?: string;
    document_type: string;
    sensitivity_label: string;
    department?: string;
    file: File;
  }): Observable<DocumentDetail> {
    const formData = new FormData();

    formData.append('title', payload.title);
    formData.append('description', payload.description || '');
    formData.append('document_type', payload.document_type);
    formData.append('sensitivity_label', payload.sensitivity_label);
    formData.append('file', payload.file);

    if (payload.department) {
      formData.append('department', payload.department);
    }

    return this.http.post<DocumentDetail>(
      `${environment.apiBaseUrl}${API_ENDPOINTS.documents.base}`,
      formData,
    );
  }

  retryProcessing(uuid: string): Observable<{ detail: string; document_uuid: string }> {
    return this.http.post<{ detail: string; document_uuid: string }>(
      `${environment.apiBaseUrl}${API_ENDPOINTS.documents.base}${uuid}/retry-processing/`,
      {},
    );
  }

  getProcessingJobs(uuid: string): Observable<DocumentProcessingJob[]> {
    return this.http.get<DocumentProcessingJob[]>(
      `${environment.apiBaseUrl}${API_ENDPOINTS.documents.base}${uuid}/processing-jobs/`,
    );
  }

  deleteDocument(uuid: string): Observable<void> {
    return this.http.delete<void>(
      `${environment.apiBaseUrl}${API_ENDPOINTS.documents.base}${uuid}/`,
    );
  }

  listDepartments(): Observable<PaginatedResponse<DepartmentOption>> {
    return this.http
      .get<PaginatedResponse<DepartmentOption> | DepartmentOption[]>(
        `${environment.apiBaseUrl}${API_ENDPOINTS.workspaces.departments}`,
      )
      .pipe(
        map((response) => this.normalizePaginatedResponse<DepartmentOption>(response)),
      );
  }

  private normalizePaginatedResponse<T>(
    response: PaginatedResponse<T> | T[],
  ): PaginatedResponse<T> {
    if (Array.isArray(response)) {
      return {
        count: response.length,
        next: null,
        previous: null,
        results: response,
      };
    }

    return response;
  }

  private buildParams(filters: DocumentFilters): HttpParams {
    let params = new HttpParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    });

    return params;
  }
}
