import { provideHttpClient, HttpErrorResponse } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { Observable } from 'rxjs';
import { FinanceAuditService } from './finance-audit.service';
import { environment } from '../../../../environments/environment';
import { decimalValid } from '../models/finance.model';
import {
  financeId as id,
  financeDoc as doc,
  financeAudit as audit,
  financeTx as tx,
} from '../finance-test.fixtures';
describe('Finance Audit authenticated API contracts', () => {
  let service: FinanceAuditService, http: HttpTestingController;
  const base = environment.apiBaseUrl + '/workflows/finance-audits/',
    url = base + id + '/';
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(FinanceAuditService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  function verify(request: Observable<unknown>, path: string, method = 'POST', body?: unknown) {
    request.subscribe();
    const req = http.expectOne(path);
    expect(req.request.method).toBe(method);
    if (body !== undefined) expect(req.request.body).toEqual(body);
    req.flush({});
  }
  it('lists using backend pagination', () => {
    service.list(3).subscribe();
    const req = http.expectOne((q) => q.url === base);
    expect(req.request.params.get('page')).toBe('3');
    req.flush({ results: [] });
  });
  it('gets exact detail route', () => verify(service.detail(id), url, 'GET'));
  it('reads protected test library', () =>
    verify(service.library(), base + 'test-library/', 'GET'));
  it('creates without authoritative tenant input', () =>
    verify(service.create({ title: audit.title, scope: audit.scope }), base, 'POST', {
      title: audit.title,
      scope: audit.scope,
    }));
  it('configure uses revision scope policy', () =>
    verify(service.configure(id, 5, audit.scope, audit.policy), url + 'configure/', 'POST', {
      revision: 5,
      scope: audit.scope,
      policy: audit.policy,
    }));
  it('imports canonical mapping and decimal control totals', () => {
    const value = {
      revision: 5,
      document_uuid: doc,
      kind: 'json' as const,
      mapping: { Amount: 'gross_amount' },
      control_totals: { USD: { gross_amount: '9007199254740993.12345678' } },
      idempotency_key: 'stable',
    };
    verify(service.import(id, value), url + 'datasets/', 'POST', value);
  });
  it('creates server sample with seed and stable key', () => {
    const parameters = { method: 'random' as const, size: 100, seed: 'review-seed' };
    verify(service.sample(id, 5, parameters, 'stable'), url + 'samples/', 'POST', {
      revision: 5,
      parameters,
      idempotency_key: 'stable',
    });
  });
  it('executes separate test with lineage', () =>
    verify(service.execute(id, 5, 'stable', doc, id), url + 'test-runs/', 'POST', {
      revision: 5,
      idempotency_key: 'stable',
      sample_uuid: doc,
      previous_uuid: id,
    }));
  it('submits to existing workflow engine', () =>
    verify(
      service.submit(id, 5, { user: 1 }, { department: 1, role: 'department_admin' }, 'stable'),
      url + 'submit/',
      'POST',
      {
        revision: 5,
        reviewer: { user: 1 },
        approver: { department: 1, role: 'department_admin' },
        idempotency_key: 'stable',
      },
    ));
  it('correction includes full normalized replacement and reason', () =>
    verify(
      service.correct(id, doc, 5, tx.data, 'Source checked'),
      url + 'transactions/' + doc + '/correct/',
      'POST',
      { revision: 5, values: tx.data, reason: 'Source checked' },
    ));
  it('links proof backed support with current governance version', () => {
    const value = {
      revision: 5,
      document_uuid: doc,
      role: 'receipt' as const,
      evidence: {
        proof: {
          document_uuid: doc,
          governance_revision: 2,
          start: 0,
          end: 4,
          preview: '1000',
          page: null,
        },
        values: { amount: '1000' },
      },
    };
    verify(
      service.support(id, doc, value),
      url + 'transactions/' + doc + '/support/',
      'POST',
      value,
    );
  });
  it('records management response without optimistic finding patch', () => {
    const value = {
      revision: 5,
      response: 'Reviewed',
      planned_action: 'Obtain receipt',
      target_date: '2026-10-20',
      owner: { user: 1 },
      evidence_documents: [doc],
      request_uuid: doc,
    };
    verify(service.respond(id, doc, value), url + 'findings/' + doc + '/respond/', 'POST', value);
  });
  it('requests evidence with optional due date', () =>
    verify(
      service.requestEvidence(id, doc, 5, 'Receipt', { user: 1 }, '2026-10-20'),
      url + 'findings/' + doc + '/request-evidence/',
      'POST',
      { revision: 5, requested_item: 'Receipt', owner: { user: 1 }, due_date: '2026-10-20' },
    ));
  it('records deliberate controlled risk decision', () =>
    verify(
      service.decide(id, doc, 5, 'accepted_risk', 'Approved reason'),
      url + 'findings/' + doc + '/decide/',
      'POST',
      { revision: 5, decision: 'accepted_risk', reason: 'Approved reason' },
    ));
  it('loads immutable output separately', () =>
    verify(service.output(id, doc), url + 'outputs/' + doc + '/', 'GET'));
  it('exports through permission checked POST without reconstructed body', () =>
    verify(service.export(id, doc), url + 'outputs/' + doc + '/export/', 'POST', {}));
  it.each([
    'datasets/',
    'transactions/',
    'samples/',
    'test-runs/',
    'findings/',
    'outputs/',
    'transactions/' + doc + '/evidence/',
    'transactions/' + doc + '/corrections/',
    'test-runs/' + doc + '/results/',
    'findings/' + doc + '/responses/',
    'findings/' + doc + '/decisions/',
  ])('paginates %s without following untrusted next URLs', (path) => {
    service.page(id, path, 2, { currency: 'USD' }).subscribe();
    const req = http.expectOne((q) => q.url === url + path);
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('currency')).toBe('USD');
    req.flush({ results: [], next: 'https://untrusted.test' });
  });
  it.each([400, 401, 403, 404, 409, 413, 422, 500])(
    'maps safe error %i without backend details',
    (status) => {
      const message = service.message(
        new HttpErrorResponse({ status, error: { detail: 'SECRET_STACK_TRACE' } }),
      );
      expect(message).not.toContain('SECRET_STACK_TRACE');
      expect(message.length).toBeGreaterThan(20);
    },
  );
  it.each(['9007199254740993.12345678', '0.00000001', '-1.12345678', '0', '00001.00'])(
    'accepts exact decimal syntax %s without conversion',
    (value) => expect(decimalValid(value)).toBe(true),
  );
  it.each(['NaN', 'Infinity', '1e4', '1,000', '0.123456789', '10000000000000000000000', ''])(
    'rejects unsupported money syntax %s',
    (value) => expect(decimalValid(value)).toBe(false),
  );
});
