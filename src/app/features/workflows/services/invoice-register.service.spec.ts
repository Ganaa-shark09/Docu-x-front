import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { InvoiceRegisterService } from './invoice-register.service';

describe('Invoice register API', () => {
  let service: InvoiceRegisterService;
  let http: HttpTestingController;
  const root = `${environment.apiBaseUrl}/workflows/invoices/`;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(InvoiceRegisterService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });

  it('uses the paginated, server-filtered invoice register without client-side tenant fields', () => {
    service.list({ page: 2, status: 'review_required', search: ' Acme ' }).subscribe();
    const request = http.expectOne((r) => r.url === root);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('status')).toBe('review_required');
    expect(request.request.params.get('search')).toBe('Acme');
    expect(request.request.params.has('company')).toBe(false);
    request.flush({ count: 0, next: null, previous: null, results: [] });
  });

  it('fetches searchable KPI counts without filtering by current status', () => {
    service.summary({ search: '009' }).subscribe();
    const request = http.expectOne(root + 'summary/?search=009');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.has('status')).toBe(false);
    request.flush({ total: 0, by_status: {} });
  });
});
