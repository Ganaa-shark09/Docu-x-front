import { provideHttpClient, HttpErrorResponse } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkflowService } from './workflow.service';
import { AiApiErrorMessageService } from '../../ai-chat/services/ai-api-error-message.service';
import { environment } from '../../../../environments/environment';
import { uuid, definition, run, page } from '../workflow-test.fixtures';
describe('Workflow API contracts and safe errors', () => {
  let api: WorkflowService;
  let http: HttpTestingController;
  const base = environment.apiBaseUrl + '/workflows';
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(WorkflowService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('loads versions and subresources as actual arrays through exact endpoints', () => {
    api.versions(uuid).subscribe();
    http.expectOne(`${base}/definitions/${uuid}/versions/`).flush([]);
    api.version(uuid).subscribe();
    http.expectOne(`${base}/versions/${uuid}/`).flush({});
    for (const section of ['steps', 'findings', 'exceptions', 'comments', 'artifacts'] as const) {
      const call: import('rxjs').Observable<unknown> = api[section](uuid);
      call.subscribe();
      const req = http.expectOne(`${base}/runs/${uuid}/${section}/`);
      expect(req.request.method).toBe('GET');
      req.flush([]);
    }
  });
  it('does not use PATCH to mutate workflow state', () => {
    api
      .command(uuid, { action: 'reject', expected_revision: 4, idempotency_key: 'stable' })
      .subscribe();
    const req = http.expectOne(`${base}/runs/${uuid}/commands/`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      action: 'reject',
      expected_revision: 4,
      idempotency_key: 'stable',
    });
    req.flush({});
  });
  it.each([400, 401, 403, 404, 409, 422, 500])(
    'handles HTTP %s safely without stack trace',
    (status) => {
      const errors = TestBed.inject(AiApiErrorMessageService);
      const error = new HttpErrorResponse({
        status,
        error: status === 500 ? { detail: 'Traceback confidential-server-secret' } : {},
      });
      const message = errors.getMessage(error, 'Unable to complete workflow action.');
      expect(message).not.toContain('Traceback');
      expect(message.length).toBeGreaterThan(0);
      if (status === 409) expect(message).toContain('state changed');
    },
  );
  it('uses safe field validation message for 400', () => {
    const errors = TestBed.inject(AiApiErrorMessageService);
    expect(
      errors.getMessage(
        new HttpErrorResponse({
          status: 400,
          error: { documents: ['Document types are not permitted.'] },
        }),
        'Failed',
      ),
    ).toContain('Document types are not permitted');
  });
  it('normalizes actual unpaginated definitions and runs rather than hiding them', () => {
    api.definitions().subscribe((rows) => {
      expect(rows.results[0].name).toBe(definition.name);
      expect(rows.count).toBe(1);
      expect(rows.next).toBeNull();
    });
    http.expectOne((req) => req.url === base + '/definitions/').flush([definition]);
    api.runs().subscribe((rows) => {
      expect(rows.results[0].uuid).toBe(run.uuid);
      expect(rows.count).toBe(1);
    });
    http.expectOne((req) => req.url === base + '/runs/').flush([run]);
  });
  it('retains server pagination links and total counts', () => {
    const rows = { ...page([definition]), count: 45, next: 'next-page', previous: 'previous-page' };
    api.definitions(2).subscribe((result) => expect(result).toEqual(rows));
    http.expectOne((req) => req.url === base + '/definitions/').flush(rows);
  });
  it('makes actual array templates available to the generic publisher', () => {
    api.templates().subscribe((rows) => expect(rows.results[0].name).toBe('Invoice'));
    http
      .expectOne((req) => req.url === base + '/extraction-templates/')
      .flush([{ uuid, name: 'Invoice', is_system: true, is_active: true }]);
  });
});
