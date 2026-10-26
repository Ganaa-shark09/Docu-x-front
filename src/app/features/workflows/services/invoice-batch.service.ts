import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { InvoiceBatch, InvoiceBatchPage } from '../models/invoice-batch.model';

@Injectable({ providedIn: 'root' })
export class InvoiceBatchService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/workflows/invoice-batches/`;

  list(page = 1, search = ''): Observable<InvoiceBatchPage> {
    let params = new HttpParams().set('page', page);
    if (search.trim()) params = params.set('search', search.trim());
    return this.http.get<InvoiceBatchPage>(this.base, { params });
  }

  detail(uuid: string): Observable<InvoiceBatch> {
    return this.http.get<InvoiceBatch>(`${this.base}${uuid}/`);
  }

  create(name: string, version: string, documents: string[], idempotencyKey: string): Observable<InvoiceBatch> {
    return this.http.post<InvoiceBatch>(this.base, {
      name, version, documents, idempotency_key: idempotencyKey,
    });
  }

  retryItem(batchUuid: string, itemUuid: string): Observable<InvoiceBatch> {
    return this.http.post<InvoiceBatch>(`${this.base}${batchUuid}/retry-item/`, { item_uuid: itemUuid });
  }
}
