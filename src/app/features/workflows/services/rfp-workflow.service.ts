import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Page, Principal, Run } from '../models/workflow.model';
import {
  RFPProject,
  RFPDetail,
  RFPCreate,
  RFPRequirement,
  RFPResponse,
  RFPResponseInput,
  RFPAttachment,
  RFPCorrection,
  RFPCorrectionInput,
  RFPOutput,
  RFPExport,
} from '../models/rfp.model';
@Injectable({ providedIn: 'root' })
export class RFPWorkflowService {
  private http = inject(HttpClient);
  readonly revoked$ = new Subject<string>();
  private base = environment.apiBaseUrl + '/workflows/rfp-projects/';
  private url(uuid: string, path = '') {
    return this.base + encodeURIComponent(uuid) + '/' + path;
  }
  projects(page = 1) {
    return this.http.get<Page<RFPProject>>(this.base, { params: { page } });
  }
  project(uuid: string) {
    return this.http.get<RFPDetail>(this.url(uuid));
  }
  create(value: RFPCreate) {
    return this.http.post<RFPProject>(this.base, value);
  }
  submit(
    uuid: string,
    value: { revision: number; reviewer: Principal; approver: Principal; idempotency_key: string },
  ) {
    return this.http.post<Run>(this.url(uuid, 'submit/'), value);
  }
  requirements(uuid: string, page = 1, kind = '') {
    return this.http.get<Page<RFPRequirement>>(this.url(uuid, 'requirements/'), {
      params: { page, ...(kind ? { kind } : {}) },
    });
  }
  history(uuid: string, item: string, page = 1) {
    return this.http.get<Page<RFPResponse>>(
      this.url(uuid, 'responses/' + encodeURIComponent(item) + '/history/'),
      { params: { page } },
    );
  }
  saveResponse(uuid: string, item: string, value: RFPResponseInput) {
    return this.http.post<RFPResponse>(
      this.url(uuid, 'responses/' + encodeURIComponent(item) + '/'),
      value,
    );
  }
  confirm(uuid: string, revision: number) {
    return this.http.post<RFPProject>(this.url(uuid, 'confirm-extraction/'), { revision });
  }
  draft(uuid: string, revision: number) {
    return this.http.post<{
      drafted: number;
      remaining: number;
      revision: number;
      abstained?: number;
      review_required?: boolean;
    }>(this.url(uuid, 'draft-batch/'), { revision });
  }
  corrections(uuid: string, page = 1) {
    return this.http.get<Page<RFPCorrection>>(this.url(uuid, 'corrections/'), { params: { page } });
  }
  correct(uuid: string, value: RFPCorrectionInput) {
    return this.http.post<{ uuid: string; number: number }>(this.url(uuid, 'corrections/'), value);
  }
  attachments(uuid: string, page = 1) {
    return this.http.get<Page<RFPAttachment>>(this.url(uuid, 'attachments/'), { params: { page } });
  }
  attach(
    uuid: string,
    item: string,
    value: { revision: number; document_uuid: string; assignment?: Principal },
  ) {
    return this.http.post<{ revision: number }>(
      this.url(uuid, 'attachments/' + encodeURIComponent(item) + '/'),
      value,
    );
  }
  outputs(uuid: string, page = 1) {
    return this.http.get<Page<RFPOutput>>(this.url(uuid, 'outputs/'), { params: { page } });
  }
  export(uuid: string, output: string, external: boolean) {
    return this.http.post<RFPExport>(
      this.url(uuid, 'outputs/' + encodeURIComponent(output) + '/export/'),
      { external },
    );
  }
  message(error: unknown): string {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    if ([401, 403, 404].includes(status)) this.revoked$.next('*');
    return status === 409
      ? 'This RFP changed while you were reviewing it. Current state was refreshed; review before saving again.'
      : status === 401
        ? 'Your session has expired. Sign in again.'
        : status === 403
          ? 'You no longer have access to one or more proposal sources.'
          : status === 404
            ? 'This RFP or resource is unavailable.'
            : status === 400 || status === 422
              ? 'The server could not validate this change. Check required fields, evidence, assignments and review readiness.'
              : 'The RFP request could not be completed. Please retry.';
  }
}
