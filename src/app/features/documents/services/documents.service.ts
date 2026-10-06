import {
  HttpClient,
  HttpParams,
} from '@angular/common/http';

import {
  Injectable,
  inject,
} from '@angular/core';

import {
  Observable,
  map,
} from 'rxjs';

import {
  environment,
} from '../../../../environments/environment';

import {
  DepartmentOption,
  DocumentDetail,
  DocumentListRecord,
  DocumentProcessingJob,
  DocumentRetryResponse,
} from '../models/document.model';


export type DocumentScope =
  | 'internal'
  | 'external';


type ListEnvelope<T> = {
  count?: number;
  results?: T[];
  documents?: T[];
  data?: T[];
  items?: T[];
};


type ListResponse<T> =
  | T[]
  | ListEnvelope<T>;


type DocumentListApiRecord =
  Omit<
    DocumentListRecord,
    'uuid'
  > & {
    uuid?: string;
  };


@Injectable({
  providedIn: 'root',
})
export class DocumentsService {
  private readonly http =
    inject(HttpClient);

  private readonly apiBaseUrl =
    environment.apiBaseUrl;


  getDocuments(
    scope: DocumentScope = 'internal',

    filters:
      Record<
        string,
        string | null | undefined
      > = {},
  ): Observable<DocumentListRecord[]> {
    if (scope === 'external') {
      return this.http
        .get<
          ListResponse<DocumentListApiRecord>
        >(
          `${this.apiBaseUrl}/ai/external-documents/`,
        )
        .pipe(
          map(
            (response) =>
              this.normalizeDocumentList(
                response,
              ),
          ),
        );
    }


    let params =
      new HttpParams().set(
        'scope',
        'internal',
      );


    Object.entries(
      filters,
    ).forEach(
      ([key, value]) => {
        if (value) {
          params =
            params.set(
              key,
              value,
            );
        }
      },
    );


    return this.http
      .get<
        ListResponse<DocumentListApiRecord>
      >(
        `${this.apiBaseUrl}/documents/`,
        {
          params,
        },
      )
      .pipe(
        map(
          (response) =>
            this.normalizeDocumentList(
              response,
            ),
        ),
      );
  }


  getDocument(
    uuid: string,
  ): Observable<DocumentDetail> {
    return this.http.get<DocumentDetail>(
      `${this.apiBaseUrl}/documents/${uuid}/`,
    );
  }


  uploadInternalDocument(
    formData: FormData,
  ): Observable<DocumentListRecord> {
    return this.http.post<DocumentListRecord>(
      `${this.apiBaseUrl}/documents/`,
      formData,
    );
  }


  getDepartments():
    Observable<DepartmentOption[]> {
    return this.http
      .get<
        ListResponse<DepartmentOption>
      >(
        `${this.apiBaseUrl}/workspaces/departments/`,
      )
      .pipe(
        map(
          (response) =>
            this.normalizeList(
              response,
            ),
        ),
      );
  }


  uploadDocument(
    formData: FormData,
  ): Observable<DocumentListRecord> {
    return this.uploadInternalDocument(
      formData,
    );
  }


  deleteDocument(
    uuid: string,
  ): Observable<void> {
    return this.http.delete<void>(
      `${this.apiBaseUrl}/documents/${uuid}/`,
    );
  }


  getProcessingJobs(
    uuid: string,
  ): Observable<DocumentProcessingJob[]> {
    return this.http
      .get<
        ListResponse<DocumentProcessingJob>
      >(
        `${this.apiBaseUrl}/documents/${uuid}/processing-jobs/`,
      )
      .pipe(
        map(
          (response) =>
            this.normalizeList(
              response,
            ),
        ),
      );
  }


  retryProcessing(
    uuid: string,
  ): Observable<DocumentRetryResponse> {
    return this.http.post<DocumentRetryResponse>(
      `${this.apiBaseUrl}/documents/${uuid}/retry-processing/`,
      {},
    );
  }


  private normalizeDocumentList(
    response:
      ListResponse<DocumentListApiRecord>,
  ): DocumentListRecord[] {
    return this
      .normalizeList(response)
      .flatMap(
        (document) => {
          const uuid =
            document.uuid ||
            document.id;

          if (!uuid) {
            return [];
          }

          return [
            {
              ...document,
              uuid,
            },
          ];
        },
      );
  }


  private normalizeList<T>(
    response: ListResponse<T>,
  ): T[] {
    if (Array.isArray(response)) {
      return [
        ...response,
      ];
    }


    const envelope =
      response as ListEnvelope<T>;


    return (
      envelope.results
      ??
      envelope.documents
      ??
      envelope.data
      ??
      envelope.items
      ??
      []
    );
  }
}
