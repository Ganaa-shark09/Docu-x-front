import { provideHttpClient, HttpErrorResponse } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { Observable } from 'rxjs';
import { ComplianceService } from './compliance.service';
import { environment } from '../../../../environments/environment';
import { cid, rid, control, evidence, detail, framework } from '../compliance-test.fixtures';
describe('Compliance exact authenticated API contracts', () => {
  let api: ComplianceService, http: HttpTestingController;
  const base = environment.apiBaseUrl + '/workflows/';
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ComplianceService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it.each(['frameworks', 'controls', 'assessments'] as const)(
    'paginates %s without following server-supplied URLs',
    (kind) => {
      (api[kind](2) as Observable<unknown>).subscribe();
      const req = http.expectOne((r) => r.url === base + 'compliance-' + kind + '/');
      expect(req.request.params.get('page')).toBe('2');
      expect(req.request.method).toBe('GET');
      req.flush({ results: [], count: 0, next: null, previous: null });
    },
  );
  it.each([
    'versions',
    'requirements',
    'mappings',
    'evidence',
    'decisions',
    'outputs',
    'evaluations',
  ] as const)('uses exact paginated %s endpoint', (section) => {
    let call: Observable<unknown>;
    const group =
      section === 'versions' || section === 'requirements'
        ? 'frameworks'
        : section === 'mappings'
          ? 'controls'
          : 'assessments';
    call = section === 'requirements' ? api.requirements(cid, rid, 3) : api[section](cid, 3);
    call.subscribe();
    const req = http.expectOne(
      (r) => r.url === base + 'compliance-' + group + '/' + cid + '/' + section + '/',
    );
    expect(req.request.params.get('page')).toBe('3');
    if (section === 'requirements') expect(req.request.params.get('version_uuid')).toBe(rid);
    req.flush({ results: [], count: 0, next: null, previous: null });
  });
  it('sends framework draft and revision separately from immutable published versions', () => {
    api.draft(cid, 2, framework.draft).subscribe();
    const req = http.expectOne(base + 'compliance-frameworks/' + cid + '/draft/');
    expect(req.request.body).toEqual({ revision: 2, draft: framework.draft });
    req.flush(framework);
  });
  it('publishes with revision only', () => {
    api.publish(cid, 2).subscribe();
    const req = http.expectOne(base + 'compliance-frameworks/' + cid + '/publish/');
    expect(req.request.body).toEqual({ revision: 2 });
    req.flush({ uuid: rid, number: 2, digest: 'hash' });
  });
  it.each([null, rid])('activates or retires through version reference %s', (version_uuid) => {
    api.activate(cid, 2, version_uuid).subscribe();
    const req = http.expectOne(base + 'compliance-frameworks/' + cid + '/activate/');
    expect(req.request.body).toEqual({ revision: 2, version_uuid });
    req.flush(framework);
  });
  it('maps a reusable control with the current revision', () => {
    api.map(control, rid, true).subscribe();
    const req = http.expectOne(base + 'compliance-controls/' + control.uuid + '/mapping/');
    expect(req.request.body).toEqual({ revision: 2, requirement_uuid: rid, is_active: true });
    req.flush({ uuid: cid, revision: 3 });
  });
  it('preserves separate reassessment lineage and explicit document scope', () => {
    const input = {
      title: 'Review',
      department: 1,
      framework_version_uuid: rid,
      scope: detail.scope,
      previous_uuid: cid,
      idempotency_key: 'stable',
    };
    api.createAssessment(input).subscribe();
    const req = http.expectOne(base + 'compliance-assessments/');
    expect(req.request.body).toEqual(input);
    expect(req.request.body.company).toBeUndefined();
    req.flush(detail);
  });
  it('uses existing assignments on submit', () => {
    api.submit(cid, 7, { user: 1 }, { department: 1, role: 'reviewer' }, 'stable').subscribe();
    const req = http.expectOne(base + 'compliance-assessments/' + cid + '/submit/');
    expect(req.request.body).toEqual({
      revision: 7,
      reviewer: { user: 1 },
      approver: { department: 1, role: 'reviewer' },
      idempotency_key: 'stable',
    });
    req.flush({});
  });
  it('links a typed source without client-authoritative validity', () => {
    const input = {
      revision: 7,
      requirement_uuid: rid,
      control_uuid: control.uuid,
      source_kind: evidence.source_kind,
      source_uuid: evidence.source_uuid,
      dates: evidence.dates,
      location: {},
      externally_shareable: false,
      idempotency_key: 'stable',
    };
    api.link(cid, input).subscribe();
    const req = http.expectOne(base + 'compliance-assessments/' + cid + '/evidence/');
    expect(req.request.body).toEqual(input);
    expect(req.request.body.state).toBeUndefined();
    req.flush({ uuid: cid, revision: 8 });
  });
  it('keeps risk acceptance separate from a satisfied control', () => {
    const input = {
      revision: 7,
      kind: 'risk_acceptance' as const,
      target: detail.rows[0].target,
      outcome: 'accepted_risk',
      reason: 'Reviewed gap',
      data: { expires: '2027-01-01' },
      idempotency_key: 'stable',
    };
    api.decide(cid, input).subscribe();
    const req = http.expectOne(base + 'compliance-assessments/' + cid + '/decisions/');
    expect(req.request.body).toEqual(input);
    req.flush({ uuid: cid, revision: 8 });
  });
  it('evaluates using an idempotency key', () => {
    api.evaluate(cid, 7, 'stable').subscribe();
    const req = http.expectOne(base + 'compliance-assessments/' + cid + '/evaluate/');
    expect(req.request.body).toEqual({ revision: 7, idempotency_key: 'stable' });
    req.flush({});
  });
  it('discovers text only through the assessment-scoped endpoint', () => {
    api.discover(cid, 'Access review').subscribe();
    const req = http.expectOne(base + 'compliance-assessments/' + cid + '/discover/');
    expect(req.request.body).toEqual({ query: 'Access review' });
    req.flush({ candidates: [] });
  });
  it('requests server-filtered external JSON rather than rebuilding disclosure locally', () => {
    api.export(cid, rid, true).subscribe();
    const req = http.expectOne(base + 'compliance-assessments/' + cid + '/export/');
    expect(req.request.body).toEqual({ output_uuid: rid, external: true });
    req.flush({ data: { counts: {} } });
  });
  it.each([400, 401, 403, 404, 409, 422, 500])(
    'maps %s to safe language without raw errors',
    (status) => {
      const msg = api.message(
        new HttpErrorResponse({ status, error: { detail: 'CONFIDENTIAL stack trace' } }),
      );
      expect(msg).not.toContain('CONFIDENTIAL');
      expect(msg.length).toBeGreaterThan(15);
    },
  );
});
