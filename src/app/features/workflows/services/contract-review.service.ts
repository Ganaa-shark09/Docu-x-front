import { HttpClient, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  ContractReview,
  ContractField,
  ContractOutput,
  ContractDefinitionInput,
  ContractDefinitionResult,
  ContractCorrectionInput,
} from '../models/contract.model';
import { ExtractionResultField } from '../models/extraction-workflow.model';
@Injectable({ providedIn: 'root' })
export class ContractReviewService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl + '/workflows';
  forRun(uuid: string): Observable<ContractReview> {
    return this.http.get<ContractReview>(this.base + '/runs/' + uuid + '/contract-review/');
  }
  detail(uuid: string): Observable<ContractReview> {
    return this.http.get<ContractReview>(this.base + '/contract-reviews/' + uuid + '/');
  }
  fields(uuid: string): Observable<ContractField[]> {
    return this.http.get<ContractField[]>(this.base + '/contract-reviews/' + uuid + '/fields/');
  }
  outputs(uuid: string): Observable<ContractOutput[]> {
    return this.http.get<ContractOutput[]>(this.base + '/contract-reviews/' + uuid + '/outputs/');
  }
  create(input: ContractDefinitionInput): Observable<ContractDefinitionResult> {
    return this.http.post<ContractDefinitionResult>(
      this.base + '/contract-reviews/definitions/',
      input,
    );
  }
  correct(
    extraction: string,
    field: string,
    input: ContractCorrectionInput,
  ): Observable<ExtractionResultField> {
    return this.http.patch<ExtractionResultField>(
      this.base + '/extraction-runs/' + extraction + '/fields/' + field + '/correct/',
      input,
    );
  }
  export(uuid: string): Observable<HttpResponse<Blob>> {
    return this.http.get(this.base + '/contract-reviews/' + uuid + '/export/', {
      observe: 'response',
      responseType: 'blob',
    });
  }
  message(error: unknown, operation = 'read'): string {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    if (status === 401) return 'Your session has ended. Sign in again.';
    if (status === 403)
      return operation === 'export'
        ? 'Contract export is not permitted. Refresh to check current access.'
        : 'You no longer have permission to access or modify this contract.';
    if (status === 404) return 'This contract or source document is unavailable.';
    if (status === 409)
      return 'The contract changed while you were reviewing it. Refreshing latest data; reconsider your action before submitting again.';
    if ([400, 422].includes(status))
      return operation === 'correct'
        ? 'The correction is invalid. Check the value and reason before submitting again.'
        : 'The contract requires additional validation or review before proceeding.';
    return 'Unable to complete the contract request. Try again or refresh current permissions.';
  }
}
