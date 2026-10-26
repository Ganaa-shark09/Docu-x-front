import { HttpClient, HttpParams } from '@angular/common/http';

import { Injectable, inject } from '@angular/core';

import { Observable, map } from 'rxjs';

import { environment } from '../../../../environments/environment';

import {
  DepartmentOption,
  DocumentDetail,
  DocumentListRecord,
  DocumentProcessingJob,
  DocumentRetryResponse,
} from '../models/document.model';

import { InvoiceReadiness } from '../models/invoice-readiness.model';

export type DocumentScope = 'internal' | 'external';

type ListEnvelope<T> = {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results?: T[];
  documents?: T[];
  data?: T[];
  items?: T[];
};

type ListResponse<T> = T[] | ListEnvelope<T>;

type DocumentListApiRecord = Omit<DocumentListRecord, 'uuid'> & {
  uuid?: string;
};

@Injectable({
  providedIn: 'root',
})
export class DocumentsService {
  private readonly http = inject(HttpClient);

  private readonly apiBaseUrl = environment.apiBaseUrl;

  getDocuments(
    scope: DocumentScope = 'internal',

    filters: Record<string, string | null | undefined> = {},
  ): Observable<DocumentListRecord[]> {
    if (scope === 'external') {
      return this.http
        .get<ListResponse<DocumentListApiRecord>>(`${this.apiBaseUrl}/ai/external-documents/`)
        .pipe(map((response) => this.normalizeDocumentList(response)));
    }

    let params = new HttpParams().set('scope', 'internal');

    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        params = params.set(key, value);
      }
    });

    return this.http
      .get<ListResponse<DocumentListApiRecord>>(`${this.apiBaseUrl}/documents/`, {
        params,
      })
      .pipe(map((response) => this.normalizeDocumentList(response)));
  }

  getInternalDocumentPage(page = 1): Observable<{
    count: number;
    next: string | null;
    previous: string | null;
    results: DocumentListRecord[];
  }> {
    return this.http
      .get<ListResponse<DocumentListApiRecord>>(`${this.apiBaseUrl}/documents/`, {
        params: new HttpParams().set('scope', 'internal').set('page', page),
      })
      .pipe(
        map((response) => {
          const results = this.normalizeDocumentList(response);
          return {
            results,
            count: Array.isArray(response) ? results.length : (response.count ?? results.length),
            next: Array.isArray(response) ? null : (response.next ?? null),
            previous: Array.isArray(response) ? null : (response.previous ?? null),
          };
        }),
      );
  }

  getDocument(uuid: string, scope: DocumentScope = 'internal'): Observable<DocumentDetail> {
    return this.http.get<DocumentDetail>(
      `${this.apiBaseUrl}/documents/${uuid}/${this.scopeQuery(scope)}`,
    );
  }

  /** Recomputed by Django; the browser cannot authorize or classify a source. */
  getInvoiceReadiness(uuid: string): Observable<InvoiceReadiness> {
    return this.http.get<InvoiceReadiness>(
      `${this.apiBaseUrl}/documents/${uuid}/invoice-readiness/`,
      { params: new HttpParams().set('scope', 'internal') },
    );
  }

  uploadInternalDocument(formData: FormData): Observable<DocumentListRecord> {
    return this.http.post<DocumentListRecord>(`${this.apiBaseUrl}/documents/`, formData);
  }

  getDepartments(): Observable<DepartmentOption[]> {
    return this.http
      .get<ListResponse<DepartmentOption>>(`${this.apiBaseUrl}/workspaces/departments/`)
      .pipe(map((response) => this.normalizeList(response)));
  }

  uploadDocument(formData: FormData): Observable<DocumentListRecord> {
    return this.uploadInternalDocument(formData);
  }

  deleteDocument(uuid: string, scope: DocumentScope = 'internal'): Observable<void> {
    return this.http.delete<void>(`${this.apiBaseUrl}/documents/${uuid}/${this.scopeQuery(scope)}`);
  }

  getProcessingJobs(uuid: string): Observable<DocumentProcessingJob[]> {
    return this.http
      .get<ListResponse<DocumentProcessingJob>>(
        `${this.apiBaseUrl}/documents/${uuid}/processing-jobs/`,
      )
      .pipe(map((response) => this.normalizeList(response)));
  }

  retryProcessing(
    uuid: string,
    scope: DocumentScope = 'internal',
  ): Observable<DocumentRetryResponse> {
    return this.http.post<DocumentRetryResponse>(
      `${this.apiBaseUrl}/documents/${uuid}/retry-processing/${this.scopeQuery(scope)}`,
      {},
    );
  }

  getFile(
    uuid: string,
    action: 'preview' | 'download',
    scope: DocumentScope = 'internal',
  ): Observable<Blob> {
    return this.http.get(`${this.apiBaseUrl}/documents/${uuid}/${action}/`, {
      params: new HttpParams().set('scope', scope),
      responseType: 'blob',
    });
  }

  private scopeQuery(scope: DocumentScope): string {
    return scope === 'external' ? '?scope=external' : '';
  }

  private normalizeDocumentList(
    response: ListResponse<DocumentListApiRecord>,
  ): DocumentListRecord[] {
    return this.normalizeList(response).flatMap((document) => {
      const uuid = document.uuid || document.id;

      if (!uuid) {
        return [];
      }

      return [
        {
          ...document,
          uuid,
        },
      ];
    });
  }

  private normalizeList<T>(response: ListResponse<T>): T[] {
    if (Array.isArray(response)) {
      return [...response];
    }

    const envelope = response as ListEnvelope<T>;

    return envelope.results ?? envelope.documents ?? envelope.data ?? envelope.items ?? [];
  }
}
