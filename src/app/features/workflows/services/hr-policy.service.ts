import { HttpClient, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { AiApiErrorMessageService } from '../../ai-chat/services/ai-api-error-message.service';
import { Injectable, inject } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Page, Run } from '../models/workflow.model';
import {
  HRPolicy,
  HRPolicyCreate,
  HRDraft,
  HRVersion,
  HRCategory,
  HRCategoryKind,
  HRContext,
  HRResolution,
  HRPrecedence,
  HRComparison,
  HRSubmit,
} from '../models/hr-policy.model';
@Injectable({ providedIn: 'root' })
export class HRPolicyService {
  readonly revoked$ = new Subject<string>();
  private readonly http = inject(HttpClient);
  private readonly errors = inject(AiApiErrorMessageService);
  private readonly base = environment.apiBaseUrl + '/workflows';
  policies(page = 1): Observable<Page<HRPolicy>> {
    return this.http.get<Page<HRPolicy>>(this.base + '/hr-policies/', { params: { page } });
  }
  policy(uuid: string): Observable<HRPolicy> {
    return this.http.get<HRPolicy>(this.base + '/hr-policies/' + uuid + '/');
  }
  create(value: HRPolicyCreate): Observable<HRPolicy> {
    return this.http.post<HRPolicy>(this.base + '/hr-policies/', value);
  }
  edit(
    uuid: string,
    revision: number,
    draft: HRDraft,
    workflow_revision?: number,
  ): Observable<HRPolicy> {
    return this.http.post<HRPolicy>(this.base + '/hr-policies/' + uuid + '/draft/', {
      revision,
      draft,
      ...(workflow_revision === undefined ? {} : { workflow_revision }),
    });
  }
  submit(uuid: string, value: HRSubmit): Observable<Run> {
    return this.http.post<Run>(this.base + '/hr-policies/' + uuid + '/submit/', value);
  }
  index(
    uuid: string,
    revision: number,
  ): Observable<{ indexed: boolean; chunk_count: number; reused: boolean }> {
    return this.http.post<{ indexed: boolean; chunk_count: number; reused: boolean }>(
      this.base + '/hr-policies/' + uuid + '/index/',
      { revision },
    );
  }
  versions(page = 1, policy?: string): Observable<Page<HRVersion>> {
    return this.http.get<Page<HRVersion>>(this.base + '/hr-policy-versions/', {
      params: { page, ...(policy ? { policy } : {}) },
    });
  }
  version(uuid: string): Observable<HRVersion> {
    return this.http.get<HRVersion>(this.base + '/hr-policy-versions/' + uuid + '/');
  }
  retire(uuid: string, revision: number): Observable<HRVersion> {
    return this.http.post<HRVersion>(this.base + '/hr-policy-versions/' + uuid + '/retire/', {
      revision,
    });
  }
  compare(left: string, right: string): Observable<HRComparison> {
    return this.http.post<HRComparison>(this.base + '/hr-policy-versions/' + left + '/compare/', {
      other_version_uuid: right,
    });
  }
  export(uuid: string): Observable<HttpResponse<Blob>> {
    return this.http.get(this.base + '/hr-policy-versions/' + uuid + '/export/', {
      observe: 'response',
      responseType: 'blob',
    });
  }
  categories(page = 1): Observable<Page<HRCategory>> {
    return this.http.get<Page<HRCategory>>(this.base + '/hr-policy-categories/', {
      params: { page, page_size: 100 },
    });
  }
  createCategory(value: {
    kind: HRCategoryKind;
    name: string;
    code: string;
  }): Observable<{ uuid: string; kind: HRCategoryKind; name: string; code: string }> {
    return this.http.post<{ uuid: string; kind: HRCategoryKind; name: string; code: string }>(
      this.base + '/hr-policy-categories/',
      value,
    );
  }
  deactivate(uuid: string): Observable<{ uuid: string; is_active: boolean }> {
    return this.http.post<{ uuid: string; is_active: boolean }>(
      this.base + '/hr-policy-categories/' + uuid + '/deactivate/',
      {},
    );
  }
  precedence(): Observable<HRPrecedence> {
    return this.http.get<HRPrecedence>(this.base + '/hr-policies/precedence/');
  }
  savePrecedence(value: HRPrecedence): Observable<HRPrecedence> {
    return this.http.post<HRPrecedence>(this.base + '/hr-policies/precedence/', value);
  }
  resolve(context: HRContext): Observable<HRResolution> {
    return this.http.post<HRResolution>(this.base + '/hr-policies/resolve/', context);
  }
  message(error: unknown): string {
    if (error instanceof HttpErrorResponse && [401, 403, 404].includes(error.status))
      this.revoked$.next('*');
    return this.errors.getPolicyMessage(error);
  }
}
