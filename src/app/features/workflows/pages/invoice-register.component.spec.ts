import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from '../../../../environments/environment';
import { InvoiceRegisterComponent } from './invoice-register.component';

const ROOT = `${environment.apiBaseUrl}/workflows/invoices/`;
const empty = { count: 0, next: null, previous: null, results: [] };
const statuses = { draft: 0, queued: 0, processing: 0, review_required: 0,
  approval_required: 0, approved: 0, rejected: 0, exception: 0,
  completed: 0, failed: 0, cancelled: 0 };

describe('Invoice register UI', () => {
  let http: HttpTestingController;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  beforeEach(() => {
    params = new BehaviorSubject(convertToParamMap({}));
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const route = TestBed.inject(ActivatedRoute);
    Object.defineProperty(route, 'queryParamMap', { value: params, configurable: true });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });

  function open() {
    const fixture = TestBed.createComponent(InvoiceRegisterComponent);
    return fixture;
  }
  function flushEmpty() {
    http.expectOne((r) => r.url === ROOT).flush(empty);
    http.expectOne((r) => r.url === ROOT + 'summary/').flush({ total: 0, by_status: statuses });
  }

  it('loads register and summary, shows an empty state and a batch action', () => {
    const fixture = open();
    flushEmpty();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No invoices found');
    expect(fixture.nativeElement.querySelector('a[href="/workflows/invoice-batches"]')).toBeTruthy();
  });

  it('cancels stale requests when bookmarked filters change', () => {
    const fixture = open();
    const stalePage = http.expectOne((r) => r.url === ROOT);
    const staleSummary = http.expectOne((r) => r.url === ROOT + 'summary/');
    params.next(convertToParamMap({ status: 'review_required', search: 'Acme', page: '3' }));
    expect(stalePage.cancelled).toBe(true);
    expect(staleSummary.cancelled).toBe(true);
    const page = http.expectOne((r) => r.url === ROOT);
    expect(page.request.params.get('status')).toBe('review_required');
    expect(page.request.params.get('search')).toBe('Acme');
    expect(page.request.params.get('page')).toBe('3');
    page.flush(empty);
    http.expectOne((r) => r.url === ROOT + 'summary/').flush({ total: 0, by_status: statuses });
    expect(fixture.componentInstance.currentPage()).toBe(3);
  });

  it('suppresses protected results and sensitive server errors on denied access', () => {
    const fixture = open();
    const page = http.expectOne((r) => r.url === ROOT);
    http.expectOne((r) => r.url === ROOT + 'summary/').flush({ total: 0, by_status: statuses });
    page.flush({ detail: 'secret invoice content' }, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('secret invoice content');
    expect(fixture.componentInstance.pageData()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('current permissions');
  });

  it('does not send invalid status filters or pages to the API', () => {
    params.next(convertToParamMap({ status: 'invalid', page: '-2' }));
    const fixture = open();
    const page = http.expectOne((r) => r.url === ROOT);
    expect(page.request.params.get('status')).toBeNull();
    expect(page.request.params.get('page')).toBe('1');
    page.flush(empty);
    http.expectOne((r) => r.url === ROOT + 'summary/').flush({ total: 0, by_status: statuses });
    expect(fixture.componentInstance.currentPage()).toBe(1);
  });

  it('shows actual invoice rows without performing browser monetary arithmetic', () => {
    const fixture = open();
    http.expectOne((r) => r.url === ROOT).flush({ ...empty, count: 1, results: [{
      uuid: 'i-1', workflow_uuid: 'run-1', document_uuid: 'd-1', document_title: 'Source.pdf',
      invoice_number: '000007', invoice_date: '2026-10-20', vendor_name: 'Acme',
      currency: 'INR', grand_total: '1234567890123456.0001', open_issues: 2,
      has_final_output: false, effective_confidence: null, status: 'review_required',
      revision: 1, created_at: '2026-10-23T00:00:00Z', updated_at: '2026-10-23T00:00:00Z',
    }] });
    http.expectOne((r) => r.url === ROOT + 'summary/').flush({ total: 1, by_status: { ...statuses, review_required: 1 } });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('INR 1,234,567,890,123,456.0001');
    expect(fixture.nativeElement.textContent).toContain('2 blocking');
    expect(fixture.nativeElement.querySelector('a[href="/workflows/runs/run-1"]')).toBeTruthy();
  });

  it('navigates search changes through query params', () => {
    const fixture = open();
    flushEmpty();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.componentInstance.searchDraft = ' ACME ';
    fixture.componentInstance.search();
    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: { page: 1, search: 'ACME' },
      queryParamsHandling: 'merge',
    }));
  });
});
