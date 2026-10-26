import { provideHttpClient, HttpErrorResponse } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { LegalClauseService } from './legal-clause.service';
import { environment } from '../../../../environments/environment';
import { uuid, doc, doc2, page } from '../workflow-test.fixtures';
import {
  legalBook,
  legalType,
  legalAnalysis,
  legalVersion,
  legalProof,
} from '../legal-test.fixtures';
describe('Legal actual backend API integration', () => {
  let api: LegalClauseService, http: HttpTestingController;
  const root = environment.apiBaseUrl + '/workflows';
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(LegalClauseService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  const reads: [string, (a: LegalClauseService) => unknown, unknown][] = [
    ['/clause-types/?page=2', (a) => a.taxonomy(2), page([legalType])],
    ['/clause-types/' + doc2 + '/', (a) => a.type(doc2), legalType],
    ['/clause-playbooks/?page=2', (a) => a.playbooks(2), page([legalBook])],
    ['/clause-playbooks/' + uuid + '/', (a) => a.playbook(uuid), legalBook],
    [
      '/clause-playbooks/' + uuid + '/versions/?page=2',
      (a) => a.versions(uuid, 2),
      page([legalVersion]),
    ],
    ['/runs/' + uuid + '/clause-analysis/', (a) => a.forRun(uuid), legalAnalysis],
    ['/contract-reviews/' + uuid + '/clause-analysis/', (a) => a.forContract(uuid), legalAnalysis],
    ['/clause-analyses/' + uuid + '/', (a) => a.analysis(uuid), legalAnalysis],
    ['/clause-analyses/' + uuid + '/clauses/', (a) => a.clauses(uuid), legalAnalysis.clauses],
    [
      '/clause-analyses/' + uuid + '/deviations/',
      (a) => a.deviations(uuid),
      legalAnalysis.deviations,
    ],
    ['/clause-analyses/' + uuid + '/evidence/', (a) => a.evidence(uuid), []],
    ['/clause-analyses/' + uuid + '/corrections/?page=2', (a) => a.corrections(uuid, 2), page([])],
    ['/clause-analyses/' + uuid + '/outputs/', (a) => a.outputs(uuid), []],
  ];
  it.each(reads)('reads authorized contract %s', (path, call, body) => {
    const request = call(api) as ReturnType<LegalClauseService['analysis']>;
    request.subscribe();
    const r = http.expectOne(root + path);
    expect(r.request.method).toBe('GET');
    expect(r.request.headers.has('Authorization')).toBe(false);
    r.flush(body as object);
  });
  it('creates company taxonomy without tenant identifiers', () => {
    const { uuid: unused, scope: other, ...input } = legalType;
    api.createType(input).subscribe();
    const r = http.expectOne(root + '/clause-types/');
    expect(r.request.body).toEqual(input);
    r.flush(legalType);
  });
  it('updates company taxonomy with PATCH', () => {
    api.updateType(doc2, { name: 'Revised' }).subscribe();
    const r = http.expectOne(root + '/clause-types/' + doc2 + '/');
    expect(r.request.method).toBe('PATCH');
    r.flush(legalType);
  });
  it('creates a draft playbook', () => {
    api
      .createPlaybook({ name: 'Policy', description: '', department: null, draft: {} })
      .subscribe();
    http.expectOne(root + '/clause-playbooks/').flush(legalBook);
  });
  it('saves revision protected drafts', () => {
    api
      .editDraft(uuid, {
        expected_revision: 4,
        name: legalBook.name,
        description: '',
        draft: legalBook.draft,
      })
      .subscribe();
    const r = http.expectOne(root + '/clause-playbooks/' + uuid + '/draft/');
    expect(r.request.body.expected_revision).toBe(4);
    r.flush(legalBook);
  });
  it('publishes saved revisions', () => {
    api.publish(uuid, 4).subscribe();
    const r = http.expectOne(root + '/clause-playbooks/' + uuid + '/publish/');
    expect(r.request.body).toEqual({ expected_revision: 4 });
    r.flush(legalVersion);
  });
  it('activates an explicit immutable version', () => {
    api.activate(uuid, 4, true, doc2).subscribe();
    const r = http.expectOne(root + '/clause-playbooks/' + uuid + '/activate/');
    expect(r.request.body).toEqual({ expected_revision: 4, active: true, version: doc2 });
    r.flush(legalBook);
  });
  it('sends run revision and stable decision key', () => {
    const body = {
      target: doc2,
      target_type: 'clause' as const,
      decision: 'confirmed' as const,
      reason: 'Verified',
      expected_revision: 3,
      idempotency_key: uuid,
    };
    api.decide(uuid, body).subscribe();
    const r = http.expectOne(root + '/clause-analyses/' + uuid + '/decision/');
    expect(r.request.body).toEqual(body);
    r.flush({});
  });
  it('corrects typed facts with actual source proof', () => {
    const body = {
      clause: doc2,
      clause_type: doc2,
      facts: legalAnalysis.clauses[0].facts,
      evidence: [legalProof],
      reason: 'Verified',
      expected_revision: 3,
    };
    api.correct(uuid, body).subscribe();
    const r = http.expectOne(root + '/clause-analyses/' + uuid + '/correct/');
    expect(r.request.body).toEqual(body);
    r.flush({});
  });
  it('reanalyzes with a workflow version and idempotency key', () => {
    api.reanalyze(uuid, doc2, uuid).subscribe();
    const r = http.expectOne(root + '/clause-analyses/' + uuid + '/reanalyze/');
    expect(r.request.body).toEqual({ version: doc2, idempotency_key: uuid });
    r.flush({});
  });
  it('uses authenticated HttpClient Blob export', () => {
    api.export(uuid).subscribe();
    const r = http.expectOne(root + '/clause-analyses/' + uuid + '/export/');
    expect(r.request.responseType).toBe('blob');
    expect(r.request.url).not.toContain('token');
    r.flush(new Blob(['{}'], { type: 'application/json' }));
  });
  it('creates canonical legal workflows', () => {
    api
      .createDefinition({
        name: 'Legal',
        code: 'legal',
        department: null,
        reviewer: { user: 1 },
        policy: { use_ai: false, playbook_version: null },
      })
      .subscribe();
    http.expectOne(root + '/clause-analyses/definitions/').flush({});
  });
  it.each([401, 403, 404, 409, 400, 422, 500, 0])('sanitizes errors for %s', (status) => {
    const message = api.message(
      new HttpErrorResponse({ status, error: { detail: 'provider-secret' } }),
    );
    expect(message).not.toContain('provider-secret');
    expect(message.length).toBeGreaterThan(10);
  });
  it('coordinates revocation without caching protected data', () => {
    let received = '';
    api.revoked$.subscribe((v) => (received = v));
    api.invalidate(doc);
    expect(received).toBe(doc);
  });
});
