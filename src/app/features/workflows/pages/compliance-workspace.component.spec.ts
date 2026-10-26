import { Router } from '@angular/router';
import { ChangeDetectorRef } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { ComplianceWorkspaceComponent } from './compliance-workspace.component';
import { ComplianceSourceComponent } from '../components/compliance-source.component';
import { ComplianceStatusComponent } from '../components/compliance-status.component';
import { DocumentGovernanceService } from '../../documents/services/document-governance.service';
import { DocumentRealtimeService } from '../../../core/realtime/document-realtime.service';
import { environment } from '../../../../environments/environment';
import {
  cid,
  rid,
  docId,
  eid,
  framework,
  version,
  control,
  detail,
  evidence,
  decision,
  output,
  run,
  finding,
  page,
  member,
} from '../compliance-test.fixtures';
import { Outcome, Validity, SourceKind } from '../models/compliance.model';
const base = environment.apiBaseUrl + '/workflows/',
  url = base + 'compliance-assessments/' + cid + '/';
describe('Compliance enterprise workspace security and product behavior', () => {
  let f: ComponentFixture<ComplianceWorkspaceComponent>,
    c: ComplianceWorkspaceComponent,
    http: HttpTestingController,
    changes: Subject<string>,
    revoked: Subject<string>;
  beforeEach(() => {
    changes = new Subject();
    revoked = new Subject();
    if (!URL.createObjectURL) URL.createObjectURL = () => '';
    if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};
  });
  afterEach(() => {
    f?.destroy();
    http?.verify({ ignoreCancelled: true });
    vi.restoreAllMocks();
  });
  function render() {
    f.debugElement.injector.get(ChangeDetectorRef).markForCheck();
    f.changeDetectorRef.markForCheck();
    for (const type of [ComplianceSourceComponent, ComplianceStatusComponent])
      for (const child of f.debugElement.queryAll(By.directive(type)))
        child.injector.get(ChangeDetectorRef).markForCheck();
    f.detectChanges();
    return f.nativeElement.textContent as string;
  }
  function setup(
    mode = 'assessments',
    hasId = true,
    role = 'company_admin',
    a = structuredClone(detail),
    review = true,
  ) {
    TestBed.configureTestingModule({
      imports: [ComplianceWorkspaceComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { data: { mode } },
            paramMap: of(convertToParamMap(hasId ? { uuid: cid } : {})),
          },
        },
        {
          provide: DocumentGovernanceService,
          useValue: { changes$: changes, memberships: () => of(role === 'member' ? [] : [member]) },
        },
        {
          provide: DocumentRealtimeService,
          useValue: { revoked$: revoked, subscribeDocuments: vi.fn() },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    f = TestBed.createComponent(ComplianceWorkspaceComponent);
    c = f.componentInstance;
    http.expectOne(environment.apiBaseUrl + '/auth/profile/').flush({ id: 1, role });
    if (!hasId)
      http
        .expectOne((r) => r.url === base + 'compliance-' + mode + '/')
        .flush(
          page<unknown>(
            mode === 'frameworks' ? [framework] : mode === 'controls' ? [control] : [a],
          ),
        );
    else if (mode === 'assessments') refresh(a, review);
    else if (mode === 'frameworks') {
      http.expectOne(base + 'compliance-frameworks/' + cid + '/').flush(framework);
      http
        .expectOne((r) => r.url === base + 'compliance-frameworks/' + cid + '/versions/')
        .flush(page([version]));
      http
        .expectOne((r) => r.url === base + 'compliance-frameworks/' + cid + '/requirements/')
        .flush(page(version.requirements));
    } else {
      http.expectOne(base + 'compliance-controls/' + cid + '/').flush({ ...control, uuid: cid });
      http
        .expectOne((r) => r.url === base + 'compliance-controls/' + cid + '/mappings/')
        .flush(
          page([
            { uuid: eid, requirement_uuid: rid, framework_version_uuid: rid, is_active: true },
          ]),
        );
    }
    render();
  }
  function refresh(a = structuredClone(detail), review = true) {
    http.expectOne(url).flush(a);
    if (a.run_uuid) {
      http
        .expectOne(base + 'runs/' + cid + '/')
        .flush({ ...run, status: a.status, capabilities: { ...run.capabilities, review } });
      http.expectOne(base + 'runs/' + cid + '/findings/').flush([finding]);
      http.expectOne(base + 'runs/' + cid + '/exceptions/').flush([]);
    }
  }
  function evidenceTab(state: Validity = 'pending_review', kind: SourceKind = 'document') {
    c.selectTab('Evidence');
    http
      .expectOne((r) => r.url === url + 'evidence/')
      .flush(
        page([
          {
            ...evidence,
            state,
            source_kind: kind,
            pin: { ...evidence.pin, version: 3, revision: 8 },
          },
        ]),
      );
    return render();
  }
  it.each(['frameworks', 'controls', 'assessments'])('renders the %s list', (mode) => {
    setup(mode, false);
    expect(render()).toContain(
      mode === 'frameworks' ? framework.name : mode === 'controls' ? control.name : detail.title,
    );
  });
  it('shows system frameworks as protected and read-only', () => {
    setup('frameworks');
    c.framework.set({ ...framework, scope: 'system' });
    const text = render();
    expect(text).toContain('protected and read-only');
    expect(text).not.toContain('Edit company draft');
    expect(c.manageFramework()).toBe(false);
  });
  it('hides company administration from ordinary members', () => {
    setup('frameworks', true, 'member');
    expect(render()).not.toContain('Edit company draft');
    expect(render()).not.toContain('Publish new immutable version');
  });
  it('renders immutable version history and hierarchy references', () => {
    setup('frameworks');
    c.requirements.set(page([{ ...version.requirements[0], parent: cid }]));
    expect(render()).toContain('Published versions are immutable');
    expect(render()).toContain('Child of requirement');
  });
  it('paginates requirements with the exact version pin', () => {
    setup('frameworks');
    c.loadRequirements(2);
    const req = http.expectOne(
      (r) => r.url === base + 'compliance-frameworks/' + cid + '/requirements/',
    );
    expect(req.request.params.get('version_uuid')).toBe(rid);
    expect(req.request.params.get('page')).toBe('2');
    req.flush(page([]));
  });
  it('saves company drafts without changing published history', () => {
    setup('frameworks');
    c.editFramework();
    c.draft.requirements[0].title = 'Updated draft';
    c.saveFramework();
    const req = http.expectOne(base + 'compliance-frameworks/' + cid + '/draft/');
    expect(req.request.body.revision).toBe(2);
    expect(req.request.body.draft.requirements[0].title).toBe('Updated draft');
    req.flush(framework);
    http.expectOne(base + 'compliance-frameworks/' + cid + '/').flush(framework);
    http.expectOne((r) => r.url.endsWith('/versions/')).flush(page([version]));
    http.expectOne((r) => r.url.endsWith('/requirements/')).flush(page(version.requirements));
  });
  it('renders reusable controls and cross-framework mappings', () => {
    setup('controls');
    expect(render()).toContain('cross-framework reuse');
    expect(render()).toContain(rid);
  });
  it('does not create editable system controls absent from the backend contract', () => {
    setup('controls', true, 'member');
    expect(render()).not.toContain('Edit control');
  });
  it('renders frozen scope and authoritative backend counts', () => {
    setup();
    const text = render();
    expect(text).toContain('ERP');
    expect(text).toContain('India');
    expect(text).toContain('Framework version 1');
    expect(text).not.toContain('compliance score');
  });
  it.each(['applicable', 'not_applicable', 'conditionally_applicable', 'undetermined'] as const)(
    'renders applicability %s without changing outcome',
    (state) => {
      const a = structuredClone(detail);
      a.rows[0].applicability = state;
      setup('assessments', true, 'company_admin', a);
      c.selectTab('Requirements / controls');
      expect(render()).toContain(state.replaceAll('_', ' '));
      expect(render()).toContain('insufficient evidence');
    },
  );
  it.each([
    'satisfied',
    'partially_satisfied',
    'not_satisfied',
    'insufficient_evidence',
    'not_applicable',
    'review_required',
  ] as Outcome[])('renders server control outcome %s', (state) => {
    const a = structuredClone(detail);
    a.rows[0].outcome = state;
    setup('assessments', true, 'company_admin', a);
    c.selectTab('Requirements / controls');
    expect(render()).toContain(state.replaceAll('_', ' '));
  });
  it('separates requirement, control, evidence, assessment and finding', () => {
    setup();
    c.selectTab('Requirements / controls');
    const text = render();
    for (const label of [
      'Requirement',
      'Control',
      'Evidence references',
      'Assessment outcome',
      'Finding',
    ])
      expect(text).toContain(label);
  });
  it.each(['valid', 'stale', 'expired', 'revoked', 'insufficient', 'pending_review'] as Validity[])(
    'renders evidence state %s with freshness metadata',
    (state) => {
      setup();
      const text = evidenceTab(state);
      expect(text).toContain(state.replaceAll('_', ' '));
      expect(text).toContain('2027-01-01');
      expect(text).toContain('2026-12-01');
      expect(text).toContain('Internal-only evidence');
    },
  );
  it.each([
    'hr_policy_version',
    'contract_output',
    'clause_output',
    'finance_output',
    'rfp_output',
  ] as SourceKind[])('shows exact pinned %s source references', (kind) => {
    setup();
    const text = evidenceTab('pending_review', kind);
    expect(text).toContain(kind.replaceAll('_', ' '));
    expect(text).toContain('3');
    expect(text).toContain(docId);
    if (kind === 'rfp_output') expect(text).toContain('not an independent determination');
  });
  it('does not offer unauthorized review controls', () => {
    setup('assessments', true, 'member', structuredClone(detail), false);
    c.selectTab('Requirements / controls');
    expect(render()).not.toContain('Review control assessment');
  });
  it('sends actual revisioned human-review command and blocks duplicate submissions', () => {
    setup();
    c.prepareDecision('control', detail.rows[0].target, 'not_satisfied');
    c.reason = 'Evidence insufficient';
    c.decide();
    c.decide();
    const req = http.expectOne(url + 'decisions/');
    expect(req.request.body).toMatchObject({
      kind: 'control',
      target: detail.rows[0].target,
      outcome: 'not_satisfied',
      revision: 7,
      reason: 'Evidence insufficient',
      data: {},
    });
    expect(req.request.body.idempotency_key).toBeTruthy();
    req.flush({ uuid: eid, revision: 8 });
    refresh();
  });
  it('keeps idempotency keys stable across a retryable error', () => {
    setup();
    const first = c.s.key('decision', { revision: 7 });
    expect(c.s.key('decision', { revision: 7 })).toBe(first);
    expect(c.s.key('decision', { revision: 8 })).not.toBe(first);
  });
  it('requires a reason before submitting decisions', () => {
    setup();
    c.prepareDecision('control', detail.rows[0].target, 'satisfied');
    c.decide();
    http.expectNone(url + 'decisions/');
  });
  it('shows evidence requests with assignments and preserves remediation history', () => {
    setup();
    c.selectTab('Requests / remediation / risk');
    http
      .expectOne((r) => r.url === url + 'decisions/')
      .flush(
        page([
          {
            ...decision,
            kind: 'evidence_request',
            outcome: 'open',
            data: { owner: { user: 1 }, due: '2026-12-01' },
          },
          { ...decision, uuid: cid, kind: 'remediation', outcome: 'in_progress' },
        ]),
      );
    const text = render();
    expect(text).toContain('evidence request');
    expect(text).toContain('remediation');
    expect(text).toContain('2026-12-01');
    expect(c.s.findings()).toHaveLength(1);
  });
  it('shows accepted risk without rewriting the underlying gap', () => {
    setup();
    c.selectTab('Requests / remediation / risk');
    http.expectOne((r) => r.url === url + 'decisions/').flush(page([decision]));
    const text = render();
    expect(text).toContain('Control gap: still recorded');
    expect(text).toContain('Temporary reviewed exception');
    expect(c.s.detail()?.rows[0].outcome).toBe('insufficient_evidence');
  });
  it('integrates approval actions with WorkflowService and run revision', () => {
    setup();
    c.s.command({ action: 'accept' });
    const req = http.expectOne(base + 'runs/' + cid + '/commands/');
    expect(req.request.body).toMatchObject({ action: 'accept', expected_revision: 9 });
    expect(req.request.body.idempotency_key).toBeTruthy();
    req.flush(run);
    refresh();
  });
  it('does not add a client Finalize override', () => {
    setup();
    c.selectTab('Review / approval');
    expect(render()).toContain('generated automatically after approval');
    expect(
      [...f.nativeElement.querySelectorAll('button')].some(
        (b: Element) => b.textContent?.trim() === 'Finalize',
      ),
    ).toBe(false);
  });
  it('reuses existing findings and safe exception resolution links', () => {
    setup();
    c.selectTab('Findings / exceptions');
    render();
    expect(f.debugElement.query(By.css('app-workflow-finding'))).toBeTruthy();
    expect(render()).toContain('Open existing workflow exception resolution');
  });
  it('renders immutable outputs and exact structured JSON export labels', () => {
    setup();
    c.selectTab('Final output');
    http.expectOne((r) => r.url === url + 'outputs/').flush(page([output]));
    c.selectedOutput.set(output);
    const text = render();
    expect(text).toContain('Read-only output version 1');
    expect(text).toContain('Current output');
    expect(text).toContain('Export authorized JSON');
    expect(text).not.toContain('Download PDF');
    expect(text).not.toContain('Compliance Q&A');
  });
  it('downloads only the server-authorized export response and releases its URL', () => {
    setup();
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:export');
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    c.external = true;
    c.export(output);
    const req = http.expectOne(url + 'export/');
    expect(req.request.body).toEqual({ output_uuid: eid, external: true });
    req.flush({ output_uuid: eid, external: true, digest: 'safe', data: { counts: {} } });
    expect(create).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith('blob:export');
  });
  it.each([401, 403, 404])('clears all protected state after HTTP %s', (status) => {
    setup();
    evidenceTab();
    c.prepareDecision('control', detail.rows[0].target);
    c.reason = 'PRIVATE REASON';
    c.s.read(c.s.api.evidence(cid), () => {});
    http
      .expectOne((r) => r.url === url + 'evidence/')
      .flush({ detail: 'PRIVATE STACK' }, { status, statusText: 'denied' });
    const text = render();
    expect(c.s.detail()).toBeNull();
    expect(c.evidence().results).toEqual([]);
    expect(c.reason).toBe('');
    expect(text).not.toContain('PRIVATE');
    expect(text).not.toContain(detail.title);
  });
  it.each(['governance', 'realtime'])(
    'clears protected history and cancels requests on %s revocation',
    (event) => {
      setup();
      c.loadOutputs();
      const pending = http.expectOne((r) => r.url === url + 'outputs/');
      c.selectedOutput.set(output);
      (event === 'governance' ? changes : revoked).next(docId);
      expect(pending.cancelled).toBe(true);
      expect(c.s.detail()).toBeNull();
      expect(c.selectedOutput()).toBeNull();
      expect(render()).not.toContain(detail.title);
    },
  );
  it('handles 409 by clearing stale state and reloading without replaying the mutation', () => {
    setup();
    c.prepareDecision('control', detail.rows[0].target, 'not_satisfied');
    c.reason = 'Review';
    c.decide();
    http.expectOne(url + 'decisions/').flush({}, { status: 409, statusText: 'Conflict' });
    expect(c.s.detail()).toBeNull();
    http
      .expectOne(environment.apiBaseUrl + '/auth/profile/')
      .flush({ id: 1, role: 'company_admin' });
    refresh();
    http.expectNone((r) => r.method === 'POST');
    expect(render()).toContain('changed while you were reviewing');
  });
  it('previews authenticated source blobs and immediately revokes object URLs on access changes', () => {
    setup();
    evidenceTab();
    const source = f.debugElement.query(By.directive(ComplianceSourceComponent))
      .componentInstance as ComplianceSourceComponent;
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:private');
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    source.preview();
    const req = http.expectOne(
      (r) => r.url === environment.apiBaseUrl + '/documents/' + docId + '/preview/',
    );
    expect(req.request.params.get('scope')).toBe('internal');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['image'], { type: 'image/png' }));
    expect(source.url()).toBe('blob:private');
    revoked.next(docId);
    expect(source.url()).toBeNull();
    expect(revoke).toHaveBeenCalledWith('blob:private');
  });
  it('403 during a preview clears the whole assessment safely', () => {
    setup();
    evidenceTab();
    const source = f.debugElement.query(By.directive(ComplianceSourceComponent))
      .componentInstance as ComplianceSourceComponent;
    source.preview();
    http
      .expectOne((r) => r.url.endsWith('/preview/'))
      .flush(new Blob([]), { status: 403, statusText: 'Forbidden' });
    expect(c.s.detail()).toBeNull();
    expect(source.url()).toBeNull();
  });
  it('ignores an older collection response after a newer page is selected', () => {
    setup();
    c.loadEvidence(1);
    const old = http.expectOne((r) => r.url === url + 'evidence/' && r.params.get('page') === '1');
    c.loadEvidence(2);
    http
      .expectOne((r) => r.url === url + 'evidence/' && r.params.get('page') === '2')
      .flush(page([{ ...evidence, uuid: cid }]));
    old.flush(page([evidence]));
    expect(c.evidence().results[0].uuid).toBe(cid);
  });
  it('uses backend counts rather than recomputing an authoritative score', () => {
    const a = structuredClone(detail);
    a.counts = { not_applicable: 17 };
    setup('assessments', true, 'company_admin', a);
    expect(render()).toContain('17');
    expect(render()).toContain('not applicable');
  });
  it.each(['light', 'dark'])(
    'uses accessible token-based status components in %s theme',
    (theme) => {
      document.documentElement.setAttribute('data-theme', theme);
      setup();
      c.selectTab('Requirements / controls');
      expect(render()).toContain('insufficient evidence');
      expect(f.nativeElement.querySelector('nav[aria-label="Assessment sections"]')).toBeTruthy();
      expect(f.nativeElement.querySelectorAll('h3').length).toBeGreaterThan(3);
      document.documentElement.removeAttribute('data-theme');
    },
  );

  it('bounds large framework draft editing to ten requirements per page', () => {
    setup('frameworks');
    c.editFramework();
    c.draft.requirements = Array.from({ length: 120 }, (_, i) => ({
      ...structuredClone(framework.draft.requirements[0]),
      code: 'R' + i,
    }));
    render();
    expect(f.nativeElement.querySelectorAll('form > fieldset > fieldset').length).toBe(10);
    c.draftPage = 12;
    render();
    expect(render()).toContain('Requirement 111');
    expect(render()).toContain('Requirement 120');
  });
  it.each([true, false])('shows risk acceptance only when policy allows it: %s', (allowed) => {
    const a = structuredClone(detail);
    a.framework['policy'] = { allow_risk_acceptance: allowed };
    setup('assessments', true, 'company_admin', a);
    c.selectTab('Requirements / controls');
    expect(render().includes('Review risk acceptance')).toBe(allowed);
  });
  it('creates a new assessment using explicit scope and no company ownership input', () => {
    setup('assessments', false);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    c.title = 'New review';
    c.department = 1;
    c.start = '2026-10-01';
    c.end = '2026-10-31';
    c.documents = docId;
    c.selectedVersion = rid;
    c.createAssessment();
    c.createAssessment();
    const req = http.expectOne(base + 'compliance-assessments/');
    expect(req.request.body).toMatchObject({
      title: 'New review',
      department: 1,
      framework_version_uuid: rid,
      scope: { document_uuids: [docId] },
    });
    expect(req.request.body.company).toBeUndefined();
    expect(req.request.body.idempotency_key).toBeTruthy();
    req.flush(detail);
  });
  it('rejects arbitrary text instead of sending an invalid document UUID', () => {
    setup('assessments', false);
    c.title = 'Review';
    c.selectedVersion = rid;
    c.start = '2026-01-01';
    c.end = '2026-12-31';
    c.documents = 'dmeo';
    c.createAssessment();
    http.expectNone(base + 'compliance-assessments/');
    expect(c.s.error()).toContain('Select available documents');
  });
  it('rejects a reversed assessment period before contacting the backend', () => {
    setup('assessments', false);
    c.title = 'Review';
    c.selectedVersion = rid;
    c.documents = docId;
    c.start = '2026-12-31';
    c.end = '2026-01-01';
    c.createAssessment();
    http.expectNone(base + 'compliance-assessments/');
    expect(c.s.error()).toContain('End date');
  });
  it('starts a draft assessment through real reviewer and approver assignments', () => {
    const a = structuredClone(detail);
    a.run_uuid = null;
    a.status = 'draft';
    setup('assessments', true, 'company_admin', a);
    c.reviewer = { user: 1 };
    c.approver = { department: 1, role: 'reviewer' };
    c.submit();
    const req = http.expectOne(url + 'submit/');
    expect(req.request.body).toMatchObject({
      revision: 7,
      reviewer: { user: 1 },
      approver: { department: 1, role: 'reviewer' },
    });
    req.flush(run);
    refresh();
  });
  it('links typed evidence for a frozen mapping and preserves the disclosure flag', () => {
    setup();
    c.selectedTarget = detail.rows[0].target;
    c.sourceKind = 'hr_policy_version';
    c.sourceId = eid;
    c.evidenceExpires = '2027-01-01';
    c.link();
    const req = http.expectOne(url + 'evidence/');
    expect(req.request.body).toMatchObject({
      revision: 7,
      source_kind: 'hr_policy_version',
      source_uuid: eid,
      requirement_uuid: rid,
      control_uuid: control.uuid,
      externally_shareable: false,
      dates: { expires: '2027-01-01' },
    });
    req.flush({ uuid: eid, revision: 8 });
    refresh();
  });
  it('preserves request lineage and an authorized owner on evidence submission', () => {
    setup();
    c.prepareDecision('evidence_request', detail.rows[0].target, 'submitted');
    c.reason = 'Provided reviewed evidence';
    c.actionOwner = { user: 1 };
    c.requestId = cid;
    c.submitted = eid;
    c.decide();
    const req = http.expectOne(url + 'decisions/');
    expect(req.request.body.data).toEqual({
      owner: { user: 1 },
      request_uuid: cid,
      evidence_uuids: [eid],
    });
    req.flush({ uuid: eid, revision: 8 });
    refresh();
  });
  it('does not claim satisfaction from expired evidence', () => {
    const a = structuredClone(detail);
    a.evaluation_current = false;
    a.rows[0].outcome = 'review_required';
    a.rows[0].historical_reviewed_outcome = 'satisfied';
    a.counts = { review_required: 1 };
    setup('assessments', true, 'company_admin', a);
    c.selectTab('Requirements / controls');
    const text = render();
    expect(text).toContain('review required');
    expect(text).not.toContain('>satisfied<');
    expect(c.s.detail()?.evaluation_current).toBe(false);
  });
});
