import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { environment } from '../../../../environments/environment';
import { HRPolicyService } from './hr-policy.service';
import { hrId, hrOther, hrPolicy, hrVersion, hrCategory, hrPage } from '../hr-test.fixtures';
describe('HR policy actual backend contracts', () => {
  let api: HRPolicyService, http: HttpTestingController;
  const base = environment.apiBaseUrl + '/workflows';
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(HRPolicyService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  const reads: [string, (a: HRPolicyService) => Observable<unknown>, object][] = [
    ['/hr-policies/?page=2', (a) => a.policies(2), hrPage([hrPolicy])],
    ['/hr-policies/' + hrId + '/', (a) => a.policy(hrId), hrPolicy],
    ['/hr-policy-versions/?page=2', (a) => a.versions(2), hrPage([hrVersion])],
    ['/hr-policy-versions/?page=1&policy=' + hrId, (a) => a.versions(1, hrId), hrPage([hrVersion])],
    ['/hr-policy-versions/' + hrId + '/', (a) => a.version(hrId), hrVersion],
    ['/hr-policy-categories/?page=2&page_size=100', (a) => a.categories(2), hrPage([hrCategory])],
    ['/hr-policies/precedence/', (a) => a.precedence(), { revision: 1, precedence: ['priority'] }],
  ];
  it.each(reads)('reads %s without browser-selected tenant', (path, request, body) => {
    request(api).subscribe();
    const r = http.expectOne(base + path);
    expect(r.request.method).toBe('GET');
    expect(r.request.params.has('company')).toBe(false);
    r.flush(body);
  });
  const writes: [string, (a: HRPolicyService) => Observable<unknown>, object, object][] = [
    [
      '/hr-policies/',
      (a) =>
        a.create({
          title: hrPolicy.title,
          code: hrPolicy.code,
          category_uuid: hrId,
          department: null,
          draft: hrPolicy.draft,
        }),
      {
        title: hrPolicy.title,
        code: hrPolicy.code,
        category_uuid: hrId,
        department: null,
        draft: hrPolicy.draft,
      },
      hrPolicy,
    ],
    [
      '/hr-policies/' + hrId + '/draft/',
      (a) => a.edit(hrId, 3, hrPolicy.draft),
      { revision: 3, draft: hrPolicy.draft },
      hrPolicy,
    ],
    [
      '/hr-policies/' + hrId + '/draft/',
      (a) => a.edit(hrId, 3, hrPolicy.draft, 5),
      { revision: 3, draft: hrPolicy.draft, workflow_revision: 5 },
      hrPolicy,
    ],
    [
      '/hr-policies/' + hrId + '/index/',
      (a) => a.index(hrId, 3),
      { revision: 3 },
      { indexed: true, chunk_count: 2, reused: true },
    ],
    [
      '/hr-policies/' + hrId + '/submit/',
      (a) =>
        a.submit(hrId, {
          revision: 3,
          reviewer: { user: 1 },
          approver: { user: 2 },
          idempotency_key: 'stable-key',
        }),
      { revision: 3, reviewer: { user: 1 }, approver: { user: 2 }, idempotency_key: 'stable-key' },
      { uuid: hrOther },
    ],
    [
      '/hr-policy-versions/' + hrId + '/retire/',
      (a) => a.retire(hrId, 1),
      { revision: 1 },
      { ...hrVersion, status: 'retired' },
    ],
    [
      '/hr-policy-versions/' + hrId + '/compare/',
      (a) => a.compare(hrId, hrOther),
      { other_version_uuid: hrOther },
      { changes: [] },
    ],
    [
      '/hr-policies/resolve/',
      (a) =>
        a.resolve({
          as_of: '2025-01-01',
          category: 'leave',
          employee_category: 'permanent',
          location: 'india',
          department: 1,
          version_uuids: [hrId],
        }),
      {
        as_of: '2025-01-01',
        category: 'leave',
        employee_category: 'permanent',
        location: 'india',
        department: 1,
        version_uuids: [hrId],
      },
      { status: 'resolved', versions: [hrVersion] },
    ],
    [
      '/hr-policy-categories/',
      (a) => a.createCategory({ kind: 'location', name: 'India', code: 'india' }),
      { kind: 'location', name: 'India', code: 'india' },
      { uuid: hrOther },
    ],
    [
      '/hr-policy-categories/' + hrId + '/deactivate/',
      (a) => a.deactivate(hrId),
      {},
      { uuid: hrId, is_active: false },
    ],
    [
      '/hr-policies/precedence/',
      (a) => a.savePrecedence({ revision: 2, precedence: ['location', 'department'] }),
      { revision: 2, precedence: ['location', 'department'] },
      { revision: 3, precedence: ['location', 'department'] },
    ],
  ];
  it.each(writes)('posts exact command %s', (path, request, body, response) => {
    request(api).subscribe();
    const r = http.expectOne(base + path);
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual(body);
    r.flush(response);
  });
  it('exports only an authenticated Blob response', () => {
    api.export(hrId).subscribe((r) => expect(r.body).toBeInstanceOf(Blob));
    const r = http.expectOne(base + '/hr-policy-versions/' + hrId + '/export/');
    expect(r.request.responseType).toBe('blob');
    r.flush(new Blob(['{}'], { type: 'application/json' }));
  });
  it.each([0, 400, 401, 403, 404, 409, 422, 500])(
    'never leaks protected API detail for status %s',
    (status) => {
      const listener = vi.fn();
      api.revoked$.subscribe(listener);
      const text = api.message(
        new HttpErrorResponse({
          status,
          error: { detail: 'RESTRICTED POLICY SECRET', files: ['SECRET'] },
        }),
      );
      expect(text).not.toContain('SECRET');
      expect(text.length).toBeGreaterThan(10);
      expect(listener).toHaveBeenCalledTimes([401, 403, 404].includes(status) ? 1 : 0);
    },
  );
});
