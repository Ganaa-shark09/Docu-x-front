import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { Page, Principal, Run } from '../models/workflow.model';
import {
  FinanceAudit,
  FinanceCreate,
  FinanceDetail,
  FinanceLibrary,
  FinanceImport,
  FinanceDataset,
  FinanceSampling,
  FinanceSample,
  FinanceTestRun,
  FinanceResponseInput,
  FinanceSupport,
  FinanceScope,
  FinancePolicy,
  FinanceRecord,
  FinanceVersion,
  FinanceDecisionState,
  FinanceOutput,
} from '../models/finance.model';
@Injectable({ providedIn: 'root' })
export class FinanceAuditService {
  private http = inject(HttpClient);
  private base = environment.apiBaseUrl + '/workflows/finance-audits/';
  url(id: string, path = '') {
    return this.base + encodeURIComponent(id) + '/' + path;
  }
  list(page = 1) {
    return this.http.get<Page<FinanceAudit>>(this.base, { params: { page } });
  }
  detail(id: string) {
    return this.http.get<FinanceDetail>(this.url(id));
  }
  create(input: FinanceCreate) {
    return this.http.post<FinanceAudit>(this.base, input);
  }
  library() {
    return this.http.get<FinanceLibrary>(this.base + 'test-library/');
  }
  page<T>(id: string, path: string, page = 1, filters: Record<string, string> = {}) {
    return this.http.get<Page<T>>(this.url(id, path), { params: { page, ...filters } });
  }
  configure(id: string, revision: number, scope: FinanceScope, policy: FinancePolicy) {
    return this.http.post<FinanceAudit>(this.url(id, 'configure/'), { revision, scope, policy });
  }
  import(id: string, input: FinanceImport) {
    return this.http.post<FinanceDataset>(this.url(id, 'datasets/'), input);
  }
  sample(id: string, revision: number, parameters: FinanceSampling, key: string) {
    return this.http.post<FinanceSample>(this.url(id, 'samples/'), {
      revision,
      parameters,
      idempotency_key: key,
    });
  }
  execute(
    id: string,
    revision: number,
    key: string,
    sample_uuid: string | null,
    previous_uuid: string | null,
  ) {
    return this.http.post<FinanceTestRun>(this.url(id, 'test-runs/'), {
      revision,
      idempotency_key: key,
      sample_uuid,
      previous_uuid,
    });
  }
  submit(id: string, revision: number, reviewer: Principal, approver: Principal, key: string) {
    return this.http.post<Run>(this.url(id, 'submit/'), {
      revision,
      reviewer,
      approver,
      idempotency_key: key,
    });
  }
  correct(id: string, tx: string, revision: number, values: FinanceRecord, reason: string) {
    return this.http.post<FinanceVersion>(
      this.url(id, `transactions/${encodeURIComponent(tx)}/correct/`),
      { revision, values, reason },
    );
  }
  support(id: string, tx: string, input: FinanceSupport) {
    return this.http.post<FinanceVersion>(
      this.url(id, `transactions/${encodeURIComponent(tx)}/support/`),
      input,
    );
  }
  respond(id: string, finding: string, input: FinanceResponseInput) {
    return this.http.post<FinanceVersion>(
      this.url(id, `findings/${encodeURIComponent(finding)}/respond/`),
      input,
    );
  }
  requestEvidence(
    id: string,
    finding: string,
    revision: number,
    requested_item: string,
    owner: Principal,
    due_date?: string,
  ) {
    return this.http.post<FinanceVersion>(
      this.url(id, `findings/${encodeURIComponent(finding)}/request-evidence/`),
      { revision, requested_item, owner, ...(due_date ? { due_date } : {}) },
    );
  }
  decide(
    id: string,
    finding: string,
    revision: number,
    decision: FinanceDecisionState,
    reason: string,
  ) {
    return this.http.post<FinanceVersion>(
      this.url(id, `findings/${encodeURIComponent(finding)}/decide/`),
      { revision, decision, reason },
    );
  }
  output(id: string, output: string) {
    return this.http.get<FinanceOutput>(this.url(id, `outputs/${encodeURIComponent(output)}/`));
  }
  export(id: string, output: string) {
    return this.http.post<FinanceOutput['data']>(
      this.url(id, `outputs/${encodeURIComponent(output)}/export/`),
      {},
    );
  }
  message(error: unknown) {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    return status === 409
      ? 'This audit changed while you were reviewing it. Current state was refreshed. Review before submitting again.'
      : status === 401
        ? 'Your session has expired. Sign in again.'
        : status === 403
          ? 'You no longer have access to this financial source or action. Protected content was cleared.'
          : status === 404
            ? 'This audit or financial resource is unavailable.'
            : status === 413
              ? 'The selected file exceeds the import size limit of 8 MiB.'
              : status === 400 || status === 422
                ? 'Validation failed. Check mapping, exact decimal strings, scope, evidence, assignments and required finding review. Finalization requires current tests, reviewed blocking findings and approval.'
                : 'The finance request could not be completed. Try again later.';
  }
}
