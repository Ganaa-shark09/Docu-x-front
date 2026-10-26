import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { RFPProjectsComponent } from './rfp-projects.component';
import { DocumentGovernanceService } from '../../documents/services/document-governance.service';
import { DocumentRealtimeService } from '../../../core/realtime/document-realtime.service';
import { environment } from '../../../../environments/environment';
import { ToastService } from '../../../core/notifications/toast.service';
import { RFP_COMPLIANCE, RFPDetail, RFPRequirement } from '../models/rfp.model';
import {
  rfpId,
  rfpDoc,
  rfpKnowledge,
  rfpSource,
  rfpProof,
  rfpClaim,
  rfpRun,
  rfpProject,
  rfpItem,
  rfpAttachment,
  rfpOutput,
  rfpExport,
  rfpPage,
  rfpMembership,
} from '../rfp-test.fixtures';
describe('RFP enterprise workspace', () => {
  let fixture: ComponentFixture<RFPProjectsComponent>,
    c: RFPProjectsComponent,
    http: HttpTestingController,
    changes: Subject<string>,
    revoked: Subject<string>;
  const base = environment.apiBaseUrl + '/workflows/rfp-projects/',
    url = base + rfpId + '/';
  beforeEach(() => {
    if (!URL.createObjectURL) URL.createObjectURL = () => '';
    if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};
    changes = new Subject<string>();
    revoked = new Subject<string>();
  });
  afterEach(() => {
    fixture?.destroy();
    http?.verify({ ignoreCancelled: true });
    vi.restoreAllMocks();
  });
  function setup(detail = true, role = 'company_admin', p: RFPDetail = rfpProject) {
    TestBed.configureTestingModule({
      imports: [RFPProjectsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap(detail ? { uuid: rfpId } : {})) },
        },
        {
          provide: DocumentGovernanceService,
          useValue: { changes$: changes, memberships: () => of([rfpMembership]) },
        },
        {
          provide: DocumentRealtimeService,
          useValue: { revoked$: revoked, subscribeDocuments: vi.fn() },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(RFPProjectsComponent);
    c = fixture.componentInstance;
    http.expectOne(environment.apiBaseUrl + '/auth/profile/').flush({ id: 1, role });
    if (detail) {
      http.expectOne(url).flush(p);
      http.expectOne(environment.apiBaseUrl + '/workflows/runs/' + rfpId + '/').flush(rfpRun);
      http.expectOne((q) => q.url === url + 'corrections/').flush(rfpPage([]));
    } else http.expectOne((q) => q.url === base).flush(rfpPage([rfpProject]));
    render();
  }
  function render() {
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    return fixture.nativeElement.textContent as string;
  }
  function items(item: RFPRequirement = rfpItem) {
    c.setTab('Requirements');
    http.expectOne((q) => q.url === url + 'requirements/').flush(rfpPage([item], true));
    return render();
  }
  function refresh() {
    http.expectOne(url).flush(rfpProject);
    http.expectOne(environment.apiBaseUrl + '/workflows/runs/' + rfpId + '/').flush(rfpRun);
    if (c.tab() === 'Overview')
      http.expectOne((q) => q.url === url + 'corrections/').flush(rfpPage([]));
    if (['Requirements', 'Compliance matrix'].includes(c.tab()))
      http.expectOne((q) => q.url === url + 'requirements/').flush(rfpPage([rfpItem]));
  }
  it('loads authorized RFP project', () => {
    setup();
    expect(c.project()?.uuid).toBe(rfpId);
  });
  it.each([
    'Secure procurement proposal',
    'Acme procurement',
    'RFP-2026-18',
    'response deadline',
    '12/11/2026',
    'Ambiguous deadline',
    'Signed security schedule required',
    'Mandatory',
    'Principal RFP',
    'Supporting document',
    'Solicitation package',
    'Internal knowledge sources',
  ])('renders overview %s', (text) => {
    setup();
    expect(render()).toContain(text);
  });
  it('does not invent timezone', () => {
    setup();
    expect(render()).not.toMatch(/UTC|Asia\/|GMT/);
  });
  it('shows missing deadline explicitly', () => {
    const p = structuredClone(rfpProject);
    p.metadata[rfpDoc].deadlines = [];
    setup(true, 'company_admin', p);
    expect(render()).toContain('deadline remains unknown');
  });
  it('separates solicitation documents from knowledge and attachments', () => {
    setup();
    expect(render()).toContain('separate from the solicitation');
    expect(c.project()?.sources[0].role).toBe('rfp_main');
  });
  it('lists accessible projects', () => {
    setup(false);
    expect(render()).toContain(rfpProject.title);
  });
  it('exposes authorized creation', () => {
    setup(false);
    expect(render()).toContain('Create RFP project');
  });
  it('hides unauthorized creation without active admin membership', () => {
    setup(false, 'member');
    c.memberships.set([]);
    c.manager.set(false);
    expect(render()).not.toContain('Create RFP project');
    c.create();
    http.expectNone((q) => q.method === 'POST');
  });
  it('creates using explicit roles and separate knowledge', () => {
    setup(false);
    c.title = 'New proposal';
    c.packageDocs = [{ document_uuid: rfpDoc, role: 'rfp_main' }];
    c.knowledge = [rfpKnowledge];
    c.create();
    const r = http.expectOne(base);
    expect(r.request.body.sources).toEqual(c.packageDocs);
    expect(r.request.body.knowledge_document_uuids).toEqual([rfpKnowledge]);
    expect(r.request.body).not.toHaveProperty('company');
    r.flush({}, { status: 400, statusText: 'Bad request' });
  });
  it('blocks duplicate create', () => {
    setup(false);
    c.title = 'New';
    c.packageDocs = [{ document_uuid: rfpDoc, role: 'rfp_main' }];
    c.create();
    c.create();
    expect(http.match(base).length).toBe(1);
  });
  it.each(
    [
      [],
      [{ document_uuid: rfpDoc, role: 'rfp_appendix' as const }],
      [
        { document_uuid: rfpDoc, role: 'rfp_main' as const },
        { document_uuid: rfpKnowledge, role: 'rfp_main' as const },
      ],
    ].map((sources) => ({ sources })),
  )('requires exactly one principal source', ({ sources }) => {
    setup(false);
    c.title = 'New';
    c.packageDocs = sources;
    c.create();
    http.expectNone((q) => q.method === 'POST');
  });
  it('never adds same document to both package and knowledge', () => {
    setup(false);
    c.addPackage({ uuid: rfpDoc });
    c.addKnowledge({ uuid: rfpDoc });
    expect(c.knowledge).toEqual([]);
  });
  it('never infers roles from filenames', () => {
    setup(false);
    c.pickerRole = 'rfp_addendum';
    c.addPackage({ uuid: rfpDoc, title: 'principal-rfp.pdf' });
    expect(c.packageDocs[0].role).toBe('rfp_addendum');
  });
  it('uses stable start key after uncertain transport failure', () => {
    setup();
    c.reviewer = { user: 1 };
    c.approver = { user: 2 };
    c.run.set(null);
    c.start();
    const first = http.expectOne(url + 'submit/');
    const key = first.request.body.idempotency_key;
    expect(first.request.body.revision).toBe(5);
    first.flush({}, { status: 500, statusText: 'Error' });
    c.start();
    const retry = http.expectOne(url + 'submit/');
    expect(retry.request.body.idempotency_key).toBe(key);
    retry.flush({}, { status: 500, statusText: 'Error' });
  });
  it('prevents duplicate start', () => {
    setup();
    c.run.set(null);
    c.reviewer = { user: 1 };
    c.approver = { user: 2 };
    c.start();
    c.start();
    const r = http.expectOne(url + 'submit/');
    r.flush({}, { status: 500, statusText: 'Error' });
  });
  it('cannot start a second active run', () => {
    setup();
    c.reviewer = { user: 1 };
    c.approver = { user: 2 };
    c.start();
    http.expectNone(url + 'submit/');
  });
  it('renders stable requirement keys and question constraints', () => {
    setup();
    const text = items();
    expect(text).toContain('Q1');
    expect(text).toContain('100 words');
    c.selectItem(rfpItem);
    expect(render()).toContain(rfpItem.key);
  });
  it.each(RFP_COMPLIANCE)('uses server compliance %s', (compliance) => {
    setup();
    items({ ...rfpItem, compliance });
    expect(c.items()[0].compliance).toBe(compliance);
    expect(render()).toContain(c.label(compliance));
  });
  it.each(['grounded', 'partially_grounded', 'insufficient_evidence', 'evidence_invalid'] as const)(
    'displays grounding %s honestly',
    (grounding) => {
      setup();
      items({
        ...rfpItem,
        response: {
          ...rfpItem.response!,
          grounding,
          ...(grounding === 'evidence_invalid' ? { text: null, evidence: [] } : {}),
        },
      });
      expect(render()).toContain(c.label(grounding));
    },
  );
  it('abstains without evidence', () => {
    setup();
    items({ ...rfpItem, response: null });
    c.selectItem(c.items()[0]);
    expect(render()).toContain('Subject-matter expert input required');
    expect(render()).toContain('Unsupported claims cannot be marked verified');
  });
  it('distinguishes company evidence from response prose', () => {
    setup();
    items();
    c.selectItem(rfpItem);
    expect(render()).toContain('Draft response text is not evidence');
    expect(render()).toContain('Internal company evidence');
  });
  it('saves exact revision, reason, evidence and disclosure flag', () => {
    setup();
    items();
    c.selectItem(rfpItem);
    c.responseText = 'Reviewed security response';
    c.responseReason = 'Verified';
    c.responseCompliance = 'compliant';
    c.shareable = true;
    c.responseAssignment = { user: 1 };
    c.saveResponse();
    const r = http.expectOne(url + 'responses/' + rfpId + '/');
    expect(r.request.body).toEqual({
      revision: 7,
      text: 'Reviewed security response',
      evidence: [rfpClaim],
      compliance: 'compliant',
      reason: 'Verified',
      externally_shareable: true,
      category: 'security',
      assignment: { user: 1 },
    });
    r.flush({});
    refresh();
  });
  it('saves retained original proof without inventing citations', () => {
    setup();
    items();
    c.selectItem(rfpItem);
    c.toggleProof(0, false);
    c.responseReason = 'Removed stale proof';
    c.saveResponse();
    const r = http.expectOne(url + 'responses/' + rfpId + '/');
    expect(r.request.body.evidence).toEqual([]);
    r.flush({}, { status: 400, statusText: 'Bad request' });
  });
  it('blocks duplicate response save', () => {
    setup();
    items();
    c.selectItem(rfpItem);
    c.responseReason = 'Review';
    c.saveResponse();
    c.saveResponse();
    const r = http.expectOne(url + 'responses/' + rfpId + '/');
    r.flush({}, { status: 400, statusText: 'Bad request' });
  });
  it('read-only capability hides response editing', () => {
    setup();
    items();
    c.run.set({ ...rfpRun, capabilities: { ...rfpRun.capabilities, review: false } });
    c.selectItem(rfpItem);
    expect(render()).not.toContain('Save reviewed response version');
    c.responseReason = 'Test';
    c.saveResponse();
    http.expectNone((q) => q.method === 'POST');
  });
  it.each(['approval_required', 'completed'] as const)('cannot edit in %s phase', (status) => {
    setup();
    items();
    c.run.set({ ...rfpRun, status });
    expect(c.editable()).toBe(false);
    c.draft();
    http.expectNone((q) => q.method === 'POST');
  });
  it('drafts deliberately using project revision and blocks repeats', () => {
    setup();
    c.draft();
    c.draft();
    const r = http.expectOne(url + 'draft-batch/');
    expect(r.request.body).toEqual({ revision: 5 });
    r.flush({ drafted: 0, remaining: 4, revision: 5, abstained: 4 });
    refresh();
    expect(TestBed.inject(ToastService).messages().at(-1)?.message).toContain('Insufficient authorized evidence: 4');
  });
  it('does not draft automatically', () => {
    setup();
    http.expectNone(url + 'draft-batch/');
  });
  it('conflict refreshes authoritative response and clears stale draft without replay', () => {
    setup();
    items();
    c.selectItem(rfpItem);
    c.responseReason = 'Review';
    c.responseText = 'STALE DRAFT';
    c.saveResponse();
    http
      .expectOne(url + 'responses/' + rfpId + '/')
      .flush({}, { status: 409, statusText: 'Conflict' });
    refresh();
    expect(c.responseText).toBe('');
    expect(render()).toContain('changed while you were reviewing');
    http.expectNone((q) => q.method === 'POST');
  });
  it('records source-backed requirement correction', () => {
    setup();
    items();
    c.correctRequirement(rfpItem);
    c.correctionReason = 'Reviewed question type';
    c.correctedMandatory = false;
    c.saveCorrection();
    const r = http.expectOne(url + 'corrections/');
    expect(r.request.body.source_uuid).toBe(rfpSource);
    expect(r.request.body.evidence).toEqual(rfpProof);
    expect(r.request.body.value).toEqual({
      section: 'Security',
      kind: 'question',
      mandatory: false,
      response_required: true,
      category: 'security',
    });
    r.flush({});
    refresh();
  });
  it('corrects date with source proof and project revision', () => {
    setup();
    c.correctDeadline(rfpProject.sources[0], rfpProject.metadata[rfpDoc].deadlines[0], 0);
    c.correctionDate = '2026-11-12';
    c.correctionReason = 'Source-supported interpretation';
    c.saveCorrection();
    const r = http.expectOne(url + 'corrections/');
    expect(r.request.body).toMatchObject({
      revision: 5,
      source_uuid: rfpSource,
      key: '0',
      kind: 'deadline',
      value: { date: '2026-11-12' },
      evidence: rfpProof,
    });
    r.flush({});
    refresh();
  });
  it('confirms extraction with current revision', () => {
    setup();
    c.confirm();
    http.expectOne(url + 'confirm-extraction/').flush({});
    refresh();
  });
  it('shows response version history with source state', () => {
    setup();
    items();
    c.selectItem(rfpItem);
    c.loadHistory();
    http
      .expectOne((q) => q.url === url + 'responses/' + rfpId + '/history/')
      .flush(rfpPage([rfpItem.response!]));
    expect(render()).toContain('Response version 2');
  });
  it('renders restricted response history without old excerpts', () => {
    setup();
    items();
    c.selectItem(rfpItem);
    c.loadHistory();
    http
      .expectOne((q) => q.url === url + 'responses/' + rfpId + '/history/')
      .flush(
        rfpPage([
          { uuid: rfpId, number: 1, grounding: 'evidence_invalid', text: null, evidence: [] },
        ]),
      );
    expect(c.history()[0].text).toBeNull();
    expect(render()).toContain('Protected or unsupported response content unavailable');
  });
  it('discards history for a previously selected item', () => {
    setup();
    items();
    c.selectItem(rfpItem);
    c.loadHistory();
    const r = http.expectOne((q) => q.url === url + 'responses/' + rfpId + '/history/');
    c.selectItem({ ...rfpItem, uuid: rfpKnowledge });
    r.flush(rfpPage([rfpItem.response!]));
    expect(c.history()).toEqual([]);
  });
  it('uses server pagination and kind filter', () => {
    setup();
    items();
    c.kind = 'question';
    c.filterKind();
    const r = http.expectOne((q) => q.url === url + 'requirements/');
    expect(r.request.params.get('kind')).toBe('question');
    expect(r.request.params.get('page')).toBe('1');
    r.flush(rfpPage([]));
  });
  it('shows mandatory missing attachment without promising export', () => {
    setup();
    c.setTab('Attachments');
    http.expectOne((q) => q.url === url + 'attachments/').flush(rfpPage([rfpAttachment]));
    expect(render()).toContain('Mandatory attachment is unresolved');
    expect(render()).toContain('Linked internally does not mean approved');
  });
  it('links only directory-selected attachment with attachment revision', () => {
    setup();
    c.setTab('Attachments');
    http.expectOne((q) => q.url === url + 'attachments/').flush(rfpPage([rfpAttachment]));
    c.docs.set([{ uuid: rfpKnowledge }]);
    c.attachmentDoc = rfpKnowledge;
    c.attach(rfpAttachment);
    const r = http.expectOne(url + 'attachments/' + rfpId + '/');
    expect(r.request.body).toEqual({ revision: 2, document_uuid: rfpKnowledge });
    r.flush({});
    http.expectOne(url).flush(rfpProject);
    http.expectOne(environment.apiBaseUrl + '/workflows/runs/' + rfpId + '/').flush(rfpRun);
    http.expectOne((q) => q.url === url + 'attachments/').flush(rfpPage([]));
  });
  it('rejects arbitrary attachment not in available directory', () => {
    setup();
    c.attachmentDoc = 'arbitrary';
    c.attach(rfpAttachment);
    http.expectNone((q) => q.method === 'POST');
  });
  it('uses existing workflow for findings, exceptions and approval', () => {
    setup();
    c.setTab('Review / approval');
    const text = render();
    expect(text).toContain('existing workflow review, findings, exceptions & approvals');
    expect(text).toContain('no client-side Finalize shortcut');
    expect(
      fixture.nativeElement.querySelector('a[href="/workflows/runs/' + rfpId + '"]'),
    ).toBeTruthy();
  });
  it('loads immutable output versions and approved response references', () => {
    setup();
    c.setTab('Proposal output');
    http
      .expectOne((q) => q.url === url + 'outputs/')
      .flush(rfpPage([rfpOutput, { ...rfpOutput, uuid: rfpKnowledge, number: 1 }]));
    expect(render()).toContain('Historical');
    c.inspectOutput(rfpOutput, true);
    http.expectOne(url + 'outputs/' + rfpId + '/export/').flush(rfpExport);
    expect(render()).toContain('Approved response version 3');
    expect(render()).toContain('Approved response text');
    expect(render()).toContain('internal proof excluded');
  });
  it('exposes real JSON without fake rich exports', () => {
    setup();
    c.setTab('Proposal output');
    http.expectOne((q) => q.url === url + 'outputs/').flush(rfpPage([rfpOutput]));
    const text = render();
    expect(text).toContain('external JSON');
    expect(text).not.toMatch(/DOCX|PDF/);
  });
  it('downloads server export and revokes the object URL', () => {
    setup();
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:export');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    c.inspectOutput(rfpOutput, true, true);
    const r = http.expectOne(url + 'outputs/' + rfpId + '/export/');
    expect(r.request.body).toEqual({ external: true });
    r.flush(rfpExport);
    expect(create).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith('blob:export');
  });
  it.each([401, 403, 404])('clears metadata, drafts, history and export on %s', (status) => {
    setup();
    items();
    c.selectItem(rfpItem);
    c.responseText = 'CONFIDENTIAL DRAFT';
    c.history.set([rfpItem.response!]);
    c.proposal.set(rfpExport);
    c.responseReason = 'Review';
    c.saveResponse();
    http
      .expectOne(url + 'responses/' + rfpId + '/')
      .flush({ detail: 'SECRET_STACK' }, { status, statusText: 'Denied' });
    expect(c.project()).toBeNull();
    expect(c.responseText).toBe('');
    expect(c.history()).toEqual([]);
    expect(c.proposal()).toBeNull();
    expect(render()).not.toContain('SECRET_STACK');
  });
  it.each(['governance', 'realtime'])(
    'clears all protected content after %s revocation',
    (event) => {
      setup();
      items();
      c.selectItem(rfpItem);
      c.responseText = 'SECRET';
      (event === 'governance' ? changes : revoked).next(rfpKnowledge);
      expect(c.project()).toBeNull();
      expect(c.items()).toEqual([]);
      expect(c.selected()).toBeNull();
      expect(c.responseText).toBe('');
    },
  );
  it('revalidates response evidence on focus even without project revision change', () => {
    setup();
    items();
    c.selectItem(rfpItem);
    c.verify();
    http.expectOne(url).flush(rfpProject);
    http.expectOne(environment.apiBaseUrl + '/workflows/runs/' + rfpId + '/').flush(rfpRun);
    http
      .expectOne((q) => q.url === url + 'requirements/')
      .flush(
        rfpPage([
          {
            ...rfpItem,
            compliance: 'review_required',
            response: {
              uuid: rfpId,
              number: 2,
              grounding: 'evidence_invalid',
              text: null,
              evidence: [],
            },
          },
        ]),
      );
    expect(c.selected()).toBeNull();
    expect(c.responseText).toBe('');
    expect(c.items()[0].response?.grounding).toBe('evidence_invalid');
  });
  it('cancels pending reads on revocation', () => {
    setup();
    c.setTab('Requirements');
    const r = http.expectOne((q) => q.url === url + 'requirements/');
    revoked.next('*');
    expect(r.cancelled).toBe(true);
    expect(c.items()).toEqual([]);
  });
  it('warns about a past source date without inventing timezone', () => {
    setup();
    expect(
      c.deadlineWarning({ ...rfpProject.metadata[rfpDoc].deadlines[0], date: '2000-01-01' }),
    ).toContain('on this device');
  });
  it('does not interpret a timezone-free timestamp as an instant', () => {
    setup();
    expect(
      c.deadlineWarning({
        ...rfpProject.metadata[rfpDoc].deadlines[0],
        datetime: '2000-01-01T12:00:00',
        timezone: null,
      }),
    ).toBe('');
  });
  it('warns for past explicitly zoned timestamps', () => {
    setup();
    expect(
      c.deadlineWarning({
        ...rfpProject.metadata[rfpDoc].deadlines[0],
        datetime: '2000-01-01T12:00:00Z',
        timezone: 'Z',
      }),
    ).toContain('has passed');
  });
});
