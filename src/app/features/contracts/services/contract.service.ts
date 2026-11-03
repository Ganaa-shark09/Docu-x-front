import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  AssignContractObligationPayload,
  ContractMilestoneSnapshot,
  ContractObligation,
  ContractPage,
  ContractReviewDetail,
  ContractSummary,
  TransitionContractObligationPayload,
} from '../models/contract.model';

/** All requests are tenant-/document-permission checked by Django. No local caching of contract text. */
@Injectable({ providedIn: 'root' })
export class ContractService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/workflows/contract-reviews/`;

  list(filters: { search?: string; status?: string; page?: number; page_size?: number }): Observable<ContractPage> {
    let params = new HttpParams();
    if (filters.search?.trim()) params = params.set('search', filters.search.trim().slice(0, 100));
    if (filters.status) params = params.set('status', filters.status);
    if (filters.page) params = params.set('page', filters.page);
    if (filters.page_size) params = params.set('page_size', filters.page_size);
    return this.http.get<ContractPage>(this.base, { params });
  }

  summary(filters: { search?: string; status?: string }): Observable<ContractSummary> {
    let params = new HttpParams();
    if (filters.search?.trim()) params = params.set('search', filters.search.trim().slice(0, 100));
    if (filters.status) params = params.set('status', filters.status);
    return this.http.get<ContractSummary>(`${this.base}summary/`, { params });
  }

  detail(uuid: string): Observable<ContractReviewDetail> {
    return this.http.get<ContractReviewDetail>(`${this.base}${encodeURIComponent(uuid)}/`);
  }

  milestones(uuid: string): Observable<ContractMilestoneSnapshot> {
    return this.http.get<ContractMilestoneSnapshot>(`${this.base}${encodeURIComponent(uuid)}/milestones/`);
  }

  obligations(uuid: string): Observable<ContractObligation[]> {
    return this.http.get<ContractObligation[]>(`${this.obligationBase(uuid)}`);
  }

  assign(uuid: string, payload: AssignContractObligationPayload): Observable<ContractObligation> {
    return this.http.post<ContractObligation>(this.obligationBase(uuid), payload);
  }

  transition(uuid: string, obligationUuid: string, payload: TransitionContractObligationPayload): Observable<ContractObligation> {
    return this.http.post<ContractObligation>(
      `${this.obligationBase(uuid)}${encodeURIComponent(obligationUuid)}/transition/`, payload,
    );
  }

  private obligationBase(uuid: string): string {
    return `${this.base}${encodeURIComponent(uuid)}/obligation-tracker/`;
  }
}
