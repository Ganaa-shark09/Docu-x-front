import { provideHttpClient, HttpErrorResponse } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { environment } from '../../../../environments/environment';
import { RFPWorkflowService } from './rfp-workflow.service';
import { rfpId, rfpDoc, rfpSource, rfpProof, rfpClaim } from '../rfp-test.fixtures';
describe('RFP authenticated endpoint contracts', () => {
  let api: RFPWorkflowService, http: HttpTestingController;
  const base = environment.apiBaseUrl + '/workflows/rfp-projects/';
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(RFPWorkflowService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  const reads = [
    ['projects', ''],
    ['project', rfpId + '/'],
    ['requirements', rfpId + '/requirements/'],
    ['history', rfpId + '/responses/' + rfpId + '/history/'],
    ['corrections', rfpId + '/corrections/'],
    ['attachments', rfpId + '/attachments/'],
    ['outputs', rfpId + '/outputs/'],
  ] as const;
  it.each(reads)('uses GET for %s', (name, path) => {
    switch (name) {
      case 'projects':
        api.projects(2).subscribe();
        break;
      case 'project':
        api.project(rfpId).subscribe();
        break;
      case 'requirements':
        api.requirements(rfpId, 2, 'question').subscribe();
        break;
      case 'history':
        api.history(rfpId, rfpId, 2).subscribe();
        break;
      case 'corrections':
        api.corrections(rfpId, 2).subscribe();
        break;
      case 'attachments':
        api.attachments(rfpId, 2).subscribe();
        break;
      case 'outputs':
        api.outputs(rfpId, 2).subscribe();
        break;
    }
    const r = http.expectOne((q) => q.url === base + path);
    expect(r.request.method).toBe('GET');
    if (name !== 'project') expect(r.request.params.get('page')).toBe('2');
    if (name === 'requirements') expect(r.request.params.get('kind')).toBe('question');
    r.flush({});
  });
  it('creates exact package and distinct knowledge list', () => {
    const body = {
      title: 'RFP',
      department: null,
      sources: [{ document_uuid: rfpDoc, role: 'rfp_main' as const }],
      knowledge_document_uuids: [rfpId],
      finalization: { require_owners: true },
    };
    api.create(body).subscribe();
    const r = http.expectOne(base);
    expect(r.request.body).toEqual(body);
    expect(r.request.method).toBe('POST');
    r.flush({});
  });
  it('starts with project revision and stable key', () => {
    const body = {
      revision: 5,
      reviewer: { user: 1 },
      approver: { department: 1, role: 'member' },
      idempotency_key: 'stable',
    };
    api.submit(rfpId, body).subscribe();
    const r = http.expectOne(base + rfpId + '/submit/');
    expect(r.request.body).toEqual(body);
    r.flush({});
  });
  it('saves item revision with original evidence and disclosure decision', () => {
    const body = {
      revision: 7,
      text: 'Reviewed response',
      evidence: [rfpClaim],
      compliance: 'compliant' as const,
      reason: 'Verified source',
      externally_shareable: true,
      assignment: { user: 1 },
    };
    api.saveResponse(rfpId, rfpId, body).subscribe();
    const r = http.expectOne(base + rfpId + '/responses/' + rfpId + '/');
    expect(r.request.body).toEqual(body);
    r.flush({});
  });
  it.each(['draft', 'confirm'] as const)('%s uses project revision only', (name) => {
    if (name === 'draft') api.draft(rfpId, 5).subscribe();
    else api.confirm(rfpId, 5).subscribe();
    const r = http.expectOne(
      base + rfpId + '/' + (name === 'draft' ? 'draft-batch' : 'confirm-extraction') + '/',
    );
    expect(r.request.body).toEqual({ revision: 5 });
    r.flush({});
  });
  it('sends immutable extraction correction with source UUID', () => {
    const body = {
      revision: 5,
      source_uuid: rfpSource,
      kind: 'deadline' as const,
      key: '0',
      value: { date: '2026-11-12' },
      evidence: rfpProof,
      reason: 'Source review',
    };
    api.correct(rfpId, body).subscribe();
    const r = http.expectOne(base + rfpId + '/corrections/');
    expect(r.request.body).toEqual(body);
    r.flush({});
  });
  it('attaches with attachment revision', () => {
    api
      .attach(rfpId, rfpId, { revision: 2, document_uuid: rfpDoc, assignment: { department: 1 } })
      .subscribe();
    const r = http.expectOne(base + rfpId + '/attachments/' + rfpId + '/');
    expect(r.request.body.revision).toBe(2);
    r.flush({});
  });
  it.each([true, false])('requests server export with external=%s', (external) => {
    api.export(rfpId, rfpId, external).subscribe();
    const r = http.expectOne(base + rfpId + '/outputs/' + rfpId + '/export/');
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual({ external });
    r.flush({});
  });
  it.each([400, 401, 403, 404, 409, 422, 500])('maps %s safely', (status) => {
    const revoke = vi.fn();
    api.revoked$.subscribe(revoke);
    const message = api.message(
      new HttpErrorResponse({ status, error: { detail: 'SECRET_PROVIDER_STACK' } }),
    );
    expect(message).not.toContain('SECRET');
    expect(revoke).toHaveBeenCalledTimes([401, 403, 404].includes(status) ? 1 : 0);
  });
});
