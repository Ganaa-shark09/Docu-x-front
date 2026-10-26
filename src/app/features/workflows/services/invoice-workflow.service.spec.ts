import { provideHttpClient, HttpErrorResponse } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { InvoiceWorkflowService } from './invoice-workflow.service';
import { invoice, output, invoiceDefinition, invoiceVersion } from '../invoice-test.fixtures';
import { uuid } from '../workflow-test.fixtures';
import { invoiceMoney, invoiceConfidence, invoiceValue } from '../models/invoice.model';
import { environment } from '../../../../environments/environment';
describe('Invoice typed API and decimal display', () => {
  let api: InvoiceWorkflowService, http: HttpTestingController;
  const root = environment.apiBaseUrl + '/workflows';
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(InvoiceWorkflowService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('uses real factory definition endpoint without tenant/company override', () => {
    const input = {
      name: 'Invoice',
      code: 'invoice',
      reviewer: { user: 1 },
      policy: { require_approval: true },
    };
    api.create(input).subscribe((r) => expect(r.definition.workflow_type).toBe('invoice'));
    const req = http.expectOne(root + '/invoices/definitions/');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(input);
    req.flush({ definition: invoiceDefinition, version: invoiceVersion });
  });
  it('uses real detail and aggregate output endpoints', () => {
    api.detail(uuid).subscribe((r) => expect(r.normalized.invoice_number).toBe('0000123'));
    http.expectOne(root + '/invoices/' + uuid + '/').flush(invoice);
    api.outputs(uuid).subscribe((r) => expect(r[0].revision).toBe(9));
    http.expectOne(root + '/invoices/' + uuid + '/outputs/').flush([output]);
  });
  it('preserves decimal precision beyond floating point and currency code', () => {
    expect(invoiceMoney('12345678901234567890.123456', 'KWD')).toBe(
      'KWD 12,345,678,901,234,567,890.123456',
    );
  });
  it('keeps zero and negative monetary amounts without rounding', () => {
    expect(invoiceMoney('0.00', 'INR')).toBe('INR 0.00');
    expect(invoiceMoney('-1234.0001')).toBe('-1,234.0001');
  });
  it('never infers money or confidence for absent/invalid values', () => {
    expect(invoiceMoney(null)).toBe('Unknown');
    expect(invoiceMoney('invalid')).toBe('Unavailable');
    expect(invoiceConfidence(null)).toBe('Not provided');
    expect(invoiceConfidence('2')).toBe('Not provided');
    expect(invoiceValue(undefined)).toBe('Unknown');
  });
  it.each([400, 401, 403, 404, 409, 422, 500])(
    'maps %s without leaking server internals',
    (status) => {
      const message = api.message(
        new HttpErrorResponse({ status, error: { detail: 'SECRET trace' } }),
        'correct',
      );
      expect(message).toBeTruthy();
      expect(message).not.toContain('SECRET');
    },
  );
});
