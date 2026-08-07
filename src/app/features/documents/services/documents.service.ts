import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../../environments/environment';

type DocumentScope = 'internal' | 'external';

@Injectable({
  providedIn: 'root',
})
export class DocumentsService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = environment.apiBaseUrl;

  getDocuments(
    scope: DocumentScope = 'internal',
    filters: Record<string, string | null | undefined> = {},
  ): Observable<any[]> {
    if (scope === 'external') {
      return this.http
        .get<any>(`${this.apiBaseUrl}/ai/external-documents/`)
        .pipe(map((response) => this.normalizeList(response)));
    }

    let params = new HttpParams().set('scope', 'internal');

    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        params = params.set(key, value);
      }
    });

    return this.http
      .get<any>(`${this.apiBaseUrl}/documents/`, { params })
      .pipe(map((response) => this.normalizeList(response)));
  }

  getDocument(uuid: string): Observable<any> {
    return this.http.get<any>(`${this.apiBaseUrl}/documents/${uuid}/`);
  }

  uploadInternalDocument(formData: FormData): Observable<any> {
    return this.http.post<any>(`${this.apiBaseUrl}/documents/`, formData);
  }

  uploadDocument(formData: FormData): Observable<any> {
    return this.uploadInternalDocument(formData);
  }

  deleteDocument(uuid: string): Observable<void> {
    return this.http.delete<void>(`${this.apiBaseUrl}/documents/${uuid}/`);
  }

  getProcessingJobs(uuid: string): Observable<any[]> {
    return this.http
      .get<any>(`${this.apiBaseUrl}/documents/${uuid}/processing-jobs/`)
      .pipe(map((response) => this.normalizeList(response)));
  }

  retryProcessing(uuid: string): Observable<any> {
    return this.http.post<any>(
      `${this.apiBaseUrl}/documents/${uuid}/retry-processing/`,
      {},
    );
  }

  private normalizeList(response: any): any[] {
    if (Array.isArray(response)) {
      return response;
    }

    return response?.results || response?.documents || response?.data || response?.items || [];
  }
}
