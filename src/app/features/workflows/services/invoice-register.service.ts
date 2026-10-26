import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  InvoiceRegisterPage,
  InvoiceRegisterQuery,
  InvoiceRegisterSummary,
} from '../models/invoice-register.model';

@Injectable({ providedIn: 'root' })
export class InvoiceRegisterService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/workflows/invoices/`;

  list(query: InvoiceRegisterQuery = {}): Observable<InvoiceRegisterPage> {
    return this.http.get<InvoiceRegisterPage>(this.base, { params: this.params(query) });
  }

  summary(query: Pick<InvoiceRegisterQuery, 'search'> = {}): Observable<InvoiceRegisterSummary> {
    // KPI counts include all statuses matching the search, not only the current tab.
    return this.http.get<InvoiceRegisterSummary>(`${this.base}summary/`, {
      params: this.params({ search: query.search }),
    });
  }

  private params(query: InvoiceRegisterQuery): HttpParams {
    let params = new HttpParams();
    if (query.page !== undefined) params = params.set('page', String(query.page));
    if (query.status) params = params.set('status', query.status);
    if (query.search?.trim()) params = params.set('search', query.search.trim().slice(0, 100));
    return params;
  }
}
