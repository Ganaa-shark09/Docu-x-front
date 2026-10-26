import { HttpClient, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  InvoiceRecord,
  InvoiceField,
  InvoiceOutput,
  InvoiceDefinitionInput,
  InvoiceDefinitionResult,
  InvoiceCorrectionInput,
  InvoiceAccountingStatus,
} from '../models/invoice.model';
import { ExtractionResultField } from '../models/extraction-workflow.model';
@Injectable({ providedIn: 'root' })
export class InvoiceWorkflowService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl + '/workflows';
  forRun(uuid: string): Observable<InvoiceRecord> {
    return this.http.get<InvoiceRecord>(this.base + '/runs/' + uuid + '/invoice/');
  }
  detail(uuid: string): Observable<InvoiceRecord> {
    return this.http.get<InvoiceRecord>(this.base + '/invoices/' + uuid + '/');
  }
  fields(uuid: string): Observable<InvoiceField[]> {
    return this.http.get<InvoiceField[]>(this.base + '/invoices/' + uuid + '/fields/');
  }
  outputs(uuid: string): Observable<InvoiceOutput[]> {
    return this.http.get<InvoiceOutput[]>(this.base + '/invoices/' + uuid + '/outputs/');
  }
  accountingStatus(uuid: string): Observable<InvoiceAccountingStatus> {
    return this.http.get<InvoiceAccountingStatus>(this.base + '/invoices/' + uuid + '/accounting-status/');
  }
  postAccounting(uuid: string, idempotencyKey: string): Observable<{ handoff_uuid: string; status: string }> {
    return this.http.post<{ handoff_uuid: string; status: string }>(
      this.base + '/invoices/' + uuid + '/post-accounting/', { idempotency_key: idempotencyKey },
    );
  }
  reconcileAccounting(uuid: string): Observable<{ handoff_uuid: string; status: string }> {
    return this.http.post<{ handoff_uuid: string; status: string }>(
      this.base + '/invoices/' + uuid + '/reconcile-accounting/', {},
    );
  }
  create(input: InvoiceDefinitionInput): Observable<InvoiceDefinitionResult> {
    return this.http.post<InvoiceDefinitionResult>(this.base + '/invoices/definitions/', input);
  }
  correct(
    extraction: string,
    field: string,
    input: InvoiceCorrectionInput,
  ): Observable<ExtractionResultField> {
    return this.http.patch<ExtractionResultField>(
      this.base + '/extraction-runs/' + extraction + '/fields/' + field + '/correct/',
      input,
    );
  }
  export(uuid: string): Observable<HttpResponse<Blob>> {
    return this.http.get(this.base + '/invoices/' + uuid + '/export/', {
      observe: 'response',
      responseType: 'blob',
    });
  }
  message(error: unknown, operation = 'read'): string {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    if (status === 401) return 'Your session has ended. Sign in again.';
    if (status === 403)
      return operation === 'export'
        ? 'Invoice export is not permitted. Refresh to check current access.'
        : 'You no longer have permission to access or modify this invoice.';
    if (status === 404) return 'This invoice or source document is unavailable.';
    if (status === 409)
      return 'The invoice changed while you were reviewing it. Refreshing latest data; reconsider your action before submitting again.';
    if ([400, 422].includes(status))
      return operation === 'correct'
        ? 'The correction is invalid. Check the value and reason before submitting again.'
        : 'The invoice requires additional validation or review before proceeding.';
    return 'Unable to complete the invoice request. Try again or refresh current permissions.';
  }
}
