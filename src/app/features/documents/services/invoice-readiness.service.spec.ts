import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { DocumentsService } from './documents.service';

describe('Invoice preflight API', () => {
  let service: DocumentsService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DocumentsService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('fetches only a server-calculated preflight, scoped to one internal document', () => {
    let result = '';
    service.getInvoiceReadiness('doc-1').subscribe((data) => { result = data.status; });
    const req = http.expectOne(r => r.url.endsWith('/documents/doc-1/invoice-readiness/'));
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('scope')).toBe('internal');
    expect(req.request.body).toBeNull();
    req.flush({
      status: 'needs_review', can_start_invoice_workflow: true, internal_ai_indexed: false,
      message: 'Source requires review', checks: [], missing_signals: [],
    });
    expect(result).toBe('needs_review');
  });
});
