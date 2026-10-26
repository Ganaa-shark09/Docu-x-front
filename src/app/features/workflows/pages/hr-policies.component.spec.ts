import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { run } from '../workflow-test.fixtures';
import { HRPoliciesComponent } from './hr-policies.component';
import { DocumentGovernanceService } from '../../documents/services/document-governance.service';
import { DocumentRealtimeService } from '../../../core/realtime/document-realtime.service';
import { environment } from '../../../../environments/environment';
import { ToastService } from '../../../core/notifications/toast.service';
import { hrId, hrDoc, hrOther, hrPolicy, hrVersion, hrCategory, hrPage } from '../hr-test.fixtures';
describe('HR policy permissions, versions and concurrency', () => {
  let fixture: ComponentFixture<HRPoliciesComponent>,
    c: HRPoliciesComponent,
    http: HttpTestingController;
  let changes: Subject<string>, revoked: Subject<string>;
  const base = environment.apiBaseUrl + '/workflows';
  function setup(role = 'company_admin', memberships: object[] = []) {
    TestBed.configureTestingModule({
      imports: [HRPoliciesComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({})) } },
        {
          provide: DocumentGovernanceService,
          useValue: { changes$: changes, memberships: () => of(memberships) },
        },
        {
          provide: DocumentRealtimeService,
          useValue: { revoked$: revoked, subscribeDocuments: vi.fn() },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(HRPoliciesComponent);
    c = fixture.componentInstance;
    http.expectOne((r) => r.url === base + '/hr-policy-versions/').flush(hrPage([hrVersion]));
    http
      .expectOne((r) => r.url === base + '/hr-policy-categories/')
      .flush(
        hrPage([
          hrCategory,
          { ...hrCategory, uuid: hrOther, name: 'Company leave', scope: 'company' },
        ]),
      );
    http.expectOne(environment.apiBaseUrl + '/auth/profile/').flush({ id: 1, role });
    if (role === 'company_admin') {
      http.expectOne((r) => r.url === base + '/hr-policies/').flush(hrPage([hrPolicy]));
      http
        .expectOne((r) => r.url === environment.apiBaseUrl + '/documents/')
        .flush(hrPage([{ uuid: hrDoc, title: 'Leave source', status: 'ready' }]));
      http.expectOne(base + '/hr-policies/precedence/').flush({
        revision: 1,
        precedence: ['priority', 'department', 'employee_category', 'location'],
      });
    }
    fixture.detectChanges();
  }
  function render() {
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    return fixture.nativeElement.textContent as string;
  }
  beforeEach(() => {
    changes = new Subject();
    revoked = new Subject();
  });
  afterEach(() => {
    fixture?.destroy();
    http?.verify({ ignoreCancelled: true });
  });
  it('renders the readable policy list', () => {
    setup();
    expect(render()).toContain('Leave policy');
  });
  it('renders empty readable lists without fake policies', () => {
    setup();
    c.versions.set([]);
    expect(render()).toContain('No readable published policy versions');
  });
  it.each(['member', 'hr', 'reviewer'])('does not grant management from role %s', (role) => {
    setup(role);
    expect(c.manager()).toBe(false);
    expect(render()).not.toContain('Administrative drafts');
    c.save();
    http.expectNone((r) => r.method === 'POST');
  });
  it('creates a draft with exact selected scope', () => {
    setup();
    c.title = 'New policy';
    c.code = 'new-policy';
    c.category = hrId;
    c.draft = {
      document_uuid: hrDoc,
      effective_from: '2026-10-01',
      employee_categories: ['permanent'],
      locations: ['india'],
    };
    c.save();
    const r = http.expectOne(base + '/hr-policies/');
    expect(r.request.body.department).toBeNull();
    expect(r.request.body.draft).toEqual(c.draft);
    r.flush({ ...hrPolicy, title: 'New policy' });
    http.expectOne((r) => r.url === base + '/hr-policies/').flush(hrPage([hrPolicy]));
    expect(c.policy()?.title).toBe('New policy');
  });
  it('updates administrative draft with optimistic revision', () => {
    setup();
    c.selectPolicy(hrPolicy);
    c.draft.priority = 5;
    c.save();
    const r = http.expectOne(base + '/hr-policies/' + hrId + '/draft/');
    expect(r.request.body).toEqual({ revision: 3, draft: c.draft });
    r.flush({ ...hrPolicy, revision: 4 });
    http.expectOne((r) => r.url === base + '/hr-policies/').flush(hrPage([hrPolicy]));
    expect(c.policy()?.revision).toBe(4);
  });
  it('blocks duplicate mutation while pending', () => {
    setup();
    c.selectPolicy(hrPolicy);
    c.save();
    c.save();
    const r = http.expectOne(base + '/hr-policies/' + hrId + '/draft/');
    r.flush(hrPolicy);
    http.expectOne((r) => r.url === base + '/hr-policies/').flush(hrPage([hrPolicy]));
  });
  it.each([401, 403, 404])('clears every protected state on mutation status %s', (status) => {
    setup();
    c.selectPolicy(hrPolicy);
    c.selected.set(hrVersion);
    c.save();
    http
      .expectOne(base + '/hr-policies/' + hrId + '/draft/')
      .flush({ detail: 'RESTRICTED' }, { status, statusText: 'Denied' });
    expect(c.policy()).toBeNull();
    expect(c.selected()).toBeNull();
    expect(c.versions()).toEqual([]);
    expect(c.draft).toEqual({});
    expect(render()).not.toContain('RESTRICTED');
  });
  it('handles overlap without printing backend data', () => {
    setup();
    c.selectPolicy(hrPolicy);
    c.save();
    http
      .expectOne(base + '/hr-policies/' + hrId + '/draft/')
      .flush({ detail: 'RESTRICTED overlap' }, { status: 400, statusText: 'Bad Request' });
    expect(c.error()).toContain('dates');
    expect(c.error()).not.toContain('RESTRICTED');
  });
  it('keeps system taxonomy read only', () => {
    setup();
    c.deactivate(hrCategory);
    http.expectNone((r) => r.method === 'POST');
    expect(render()).toContain('system');
  });
  it('renders company categories', () => {
    setup();
    expect(render()).toContain('Company leave');
  });
  it('deactivates only company categories', () => {
    setup();
    c.deactivate({ ...hrCategory, uuid: hrOther, scope: 'company' });
    http
      .expectOne(base + '/hr-policy-categories/' + hrOther + '/deactivate/')
      .flush({ uuid: hrOther, is_active: false });
    http.expectOne((r) => r.url === base + '/hr-policy-categories/').flush(hrPage([hrCategory]));
  });
  it.each(['effective', 'superseded', 'expired', 'scheduled', 'retired'] as const)(
    'displays authoritative effective state %s',
    (status) => {
      setup();
      c.selected.set({
        ...hrVersion,
        effective_status: status,
        status: status === 'retired' ? 'retired' : 'published',
      });
      const text = render();
      expect(text).toContain(c.label(status));
      expect(text).toContain('Version 2');
    },
  );
  it('shows source, employee, location and effective date', () => {
    setup();
    c.selected.set(hrVersion);
    const text = render();
    expect(text).toContain('permanent');
    expect(text).toContain('india');
    expect(text).toContain('2026-10-01');
    expect(text).toContain(hrVersion.sections![0].evidence.preview);
  });
  it('does not mutate an immutable published version', () => {
    setup();
    c.selected.set(hrVersion);
    c.selectPolicy(hrPolicy);
    c.draft.priority = 10;
    expect(c.selected()?.priority).toBe(0);
    expect(hrVersion.priority).toBe(0);
  });
  it('ignores a late version selection response', () => {
    setup();
    c.selectVersion(hrId);
    const first = http.expectOne(base + '/hr-policy-versions/' + hrId + '/');
    c.selectVersion(hrOther);
    http
      .expectOne(base + '/hr-policy-versions/' + hrOther + '/')
      .flush({ ...hrVersion, uuid: hrOther, title: 'Other version' });
    first.flush(hrVersion);
    expect(c.selected()?.uuid).toBe(hrOther);
  });
  it.each(['resolved', 'abstained', 'review_required'] as const)(
    'shows server resolution %s without guessing',
    (status) => {
      setup();
      c.context = { as_of: '2025-01-01' };
      c.resolve();
      const r = http.expectOne(base + '/hr-policies/resolve/');
      expect(r.request.body).toEqual(c.context);
      r.flush({
        status,
        reason: status === 'resolved' ? null : 'ambiguous_applicability',
        as_of: '2025-01-01',
        mode: 'historical',
        versions: [],
      });
      expect(render()).toContain(c.label(status));
      expect(render()).toContain('Historical');
      expect(c.resolution()?.versions).toEqual([]);
    },
  );
  it('renders current resolution as current', () => {
    setup();
    c.resolve();
    http.expectOne(base + '/hr-policies/resolve/').flush({
      status: 'resolved',
      reason: null,
      as_of: '2026-10-11',
      mode: 'current',
      versions: [hrVersion],
    });
    expect(render()).toContain('Current');
  });
  it('requires reviewer, approver and publication confirmation', () => {
    setup();
    c.selectPolicy(hrPolicy);
    c.submit();
    http.expectNone((r) => r.method === 'POST');
  });
  it('submits through the existing workflow and prevents duplicate publication commands', () => {
    setup();
    c.selectPolicy(hrPolicy);
    c.reviewer = { user: 1 };
    c.approver = { user: 2 };
    c.confirmed = true;
    c.submit();
    c.submit();
    const r = http.expectOne(base + '/hr-policies/' + hrId + '/submit/');
    expect(r.request.body.idempotency_key).toBeTruthy();
    r.flush({ ...run, uuid: hrOther, status: 'running', current_step: 'ingest_policy' });
    expect(render()).toContain('Open review and approval workflow');
    http.expectNone((r) => r.url.includes('/publish/'));
  });
  it('requires confirmation before retirement', () => {
    setup();
    c.selected.set(hrVersion);
    c.retire();
    http.expectNone((r) => r.method === 'POST');
  });
  it('retires without reactivating a predecessor', () => {
    setup();
    c.selected.set(hrVersion);
    c.confirmed = true;
    c.retire();
    http
      .expectOne(base + '/hr-policy-versions/' + hrId + '/retire/')
      .flush({ ...hrVersion, status: 'retired', effective_status: 'retired', revision: 2 });
    expect(c.selected()?.status).toBe('retired');
    expect(TestBed.inject(ToastService).messages().at(-1)?.message).toContain('No predecessor');
    http.expectNone((r) => r.method === 'POST');
  });
  it('uses backend comparison evidence for before and after', () => {
    setup();
    c.selected.set(hrVersion);
    c.compareUuid = hrOther;
    c.compare();
    http.expectOne(base + '/hr-policy-versions/' + hrId + '/compare/').flush({
      left_version_uuid: hrId,
      right_version_uuid: hrOther,
      changes: [
        {
          position: 0,
          kind: 'wording_changed',
          before: {
            heading: 'Leave',
            digest: 'a',
            evidence: { ...hrVersion.sections![0].evidence, preview: 'Old evidence' },
          },
          after: {
            heading: 'Leave',
            digest: 'b',
            evidence: { ...hrVersion.sections![0].evidence, preview: 'New evidence' },
          },
        },
      ],
      effective_dates: { before: ['2025-01-01', null], after: ['2026-01-01', null] },
      interpretation: 'Source-only comparison',
    });
    const text = render();
    expect(text).toContain('Old evidence');
    expect(text).toContain('New evidence');
    expect(text).toContain('Source-only comparison');
  });
  it('does not invent a browser tenant selector', () => {
    setup();
    expect(fixture.nativeElement.querySelector('select[name=company]')).toBeNull();
  });
  it('reorders and saves revisioned company precedence', () => {
    setup();
    c.reorder(1, -1);
    c.savePrecedence();
    const r = http.expectOne(base + '/hr-policies/precedence/');
    expect(r.request.body).toEqual({
      revision: 1,
      precedence: ['department', 'priority', 'employee_category', 'location'],
    });
    r.flush({
      revision: 2,
      precedence: ['department', 'priority', 'employee_category', 'location'],
    });
  });
  it.each(['governance', 'realtime'])(
    'clears protected evidence, comparison, draft and taxonomy on %s',
    (kind) => {
      setup();
      c.selectPolicy(hrPolicy);
      c.selected.set(hrVersion);
      c.context = { category: 'leave' };
      (kind === 'governance' ? changes : revoked).next(hrDoc);
      expect(c.policy()).toBeNull();
      expect(c.selected()).toBeNull();
      expect(c.comparison()).toBeNull();
      expect(c.categories()).toEqual([]);
      expect(c.draft).toEqual({});
      expect(c.context).toEqual({});
    },
  );
  it('cancels late protected reads after revocation', () => {
    setup();
    c.selectVersion(hrId);
    const request = http.expectOne(base + '/hr-policy-versions/' + hrId + '/');
    revoked.next(hrDoc);
    expect(request.cancelled).toBe(true);
    expect(c.selected()).toBeNull();
  });
  it('never reconstructs an export after denial', () => {
    setup();
    c.selected.set(hrVersion);
    c.export();
    http
      .expectOne(base + '/hr-policy-versions/' + hrId + '/export/')
      .flush(null, { status: 403, statusText: 'Denied' });
    expect(c.selected()).toBeNull();
    expect(c.versions()).toEqual([]);
    http.expectNone((r) => r.url.includes('/preview/'));
  });

  it('blocks duplicate comparisons while their request is pending', () => {
    setup();
    c.selected.set(hrVersion);
    c.compareUuid = hrOther;
    c.compare();
    c.compare();
    const request = http.expectOne(base + '/hr-policy-versions/' + hrId + '/compare/');
    expect(c.comparing()).toBe(true);
    request.flush({
      left_version_uuid: hrId,
      right_version_uuid: hrOther,
      changes: [],
      effective_dates: { before: ['2025-01-01', null], after: ['2026-01-01', null] },
      interpretation: 'Source changes only',
    });
    expect(c.comparing()).toBe(false);
  });
  it('blocks duplicate applicability resolution while pending', () => {
    setup();
    c.resolve();
    c.resolve();
    const request = http.expectOne(base + '/hr-policies/resolve/');
    expect(c.resolving()).toBe(true);
    request.flush({
      status: 'abstained',
      reason: 'no_policy',
      mode: 'current',
      as_of: '2026-10-11',
      versions: [],
    });
    expect(c.resolving()).toBe(false);
  });
  it('refreshes after a revision conflict without replaying the mutation', () => {
    setup();
    c.selectPolicy(hrPolicy);
    c.draft.priority = 10;
    c.save();
    http
      .expectOne(base + '/hr-policies/' + hrId + '/draft/')
      .flush({ detail: 'SECRET revision' }, { status: 409, statusText: 'Conflict' });
    expect(c.policy()).toBeNull();
    expect(c.draft).toEqual({});
    http.expectOne((r) => r.url === base + '/hr-policy-versions/').flush(hrPage([hrVersion]));
    http.expectOne((r) => r.url === base + '/hr-policy-categories/').flush(hrPage([hrCategory]));
    http
      .expectOne(environment.apiBaseUrl + '/auth/profile/')
      .flush({ id: 1, role: 'company_admin' });
    http
      .expectOne((r) => r.url === base + '/hr-policies/')
      .flush(hrPage([{ ...hrPolicy, revision: 4 }]));
    http.expectOne((r) => r.url === environment.apiBaseUrl + '/documents/').flush(hrPage([]));
    http
      .expectOne(base + '/hr-policies/precedence/')
      .flush({ revision: 1, precedence: ['priority'] });
    http.expectNone((r) => r.method === 'POST');
    expect(c.error()).toContain('changed');
    expect(c.error()).not.toContain('SECRET');
  });
  it('reuses the submission key after a transient request failure', () => {
    setup();
    c.selectPolicy(hrPolicy);
    c.reviewer = { user: 1 };
    c.approver = { user: 2 };
    c.confirmed = true;
    c.submit();
    const first = http.expectOne(base + '/hr-policies/' + hrId + '/submit/');
    const key = first.request.body.idempotency_key;
    first.flush(null, { status: 500, statusText: 'Unavailable' });
    c.submit();
    const second = http.expectOne(base + '/hr-policies/' + hrId + '/submit/');
    expect(second.request.body.idempotency_key).toBe(key);
    second.flush({ ...run, uuid: hrOther, status: 'running', current_step: 'ingest_policy' });
  });
  it('downloads only the authenticated export Blob and releases its URL', () => {
    setup();
    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn(() => 'blob:export'),
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    c.selected.set(hrVersion);
    c.export();
    http
      .expectOne(base + '/hr-policy-versions/' + hrId + '/export/')
      .flush(new Blob(['{}'], { type: 'application/json' }));
    expect(click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:export');
    click.mockRestore();
  });
  it('restricts retirement and company creation to the managed department', () => {
    setup('member');
    c.manager.set(true);
    c.managedDepartments.set([2]);
    c.selected.set(hrVersion);
    c.confirmed = true;
    c.retire();
    http.expectNone((r) => r.method === 'POST');
    expect(c.canManageDepartment(null)).toBe(false);
    expect(c.canManageDepartment(1)).toBe(false);
    expect(c.canManageDepartment(2)).toBe(true);
  });
  it('excludes other policies from comparison and supersession choices', () => {
    setup();
    c.selected.set(hrVersion);
    c.selectPolicy(hrPolicy);
    c.versions.set([hrVersion, { ...hrVersion, uuid: hrOther, policy_uuid: hrDoc }]);
    expect(c.comparisonChoices()).toEqual([]);
    expect(c.supersessionChoices()).toEqual([hrVersion]);
  });
  it('requires a current review boundary and workflow capability before editing an active draft', () => {
    setup();
    c.selectPolicy({ ...hrPolicy, review_run_uuid: hrOther });
    expect(c.canEditDraft()).toBe(false);
    http.expectOne(base + '/runs/' + hrOther + '/').flush({
      uuid: hrOther,
      revision: 5,
      status: 'approval_required',
      current_step: 'approve_policy',
      capabilities: { review: false },
    });
    expect(c.canEditDraft()).toBe(false);
    c.save();
    http.expectNone((r) => r.method === 'POST');
    expect(c.canSubmitDraft()).toBe(false);
  });
  it('passes the active workflow revision when the review boundary permits editing', () => {
    setup();
    c.selectPolicy({ ...hrPolicy, review_run_uuid: hrOther });
    http.expectOne(base + '/runs/' + hrOther + '/').flush({
      uuid: hrOther,
      revision: 5,
      status: 'review_required',
      current_step: 'review_policy',
      capabilities: { review: true },
    });
    expect(c.canEditDraft()).toBe(true);
    c.save();
    const request = http.expectOne(base + '/hr-policies/' + hrId + '/draft/');
    expect(request.request.body.workflow_revision).toBe(5);
    request.flush({ ...hrPolicy, revision: 4 });
    http.expectOne((r) => r.url === base + '/hr-policies/').flush(hrPage([hrPolicy]));
  });
});
