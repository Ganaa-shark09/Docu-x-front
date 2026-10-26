import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from '../../../../environments/environment';
import { ToastService } from '../../../core/notifications/toast.service';
import { WorkflowRunDetailComponent } from './workflow-run-detail.component';
import { DocumentGovernanceService } from '../../documents/services/document-governance.service';
import { DocumentRealtimeService } from '../../../core/realtime/document-realtime.service';
import {
  artifact,
  definition,
  doc,
  doc2,
  finding,
  page,
  run,
  step,
  uuid,
  version,
} from '../workflow-test.fixtures';
import { invoice, invoiceRun, invoiceDefinition } from '../invoice-test.fixtures';
import { Run } from '../models/workflow.model';
describe('Workflow run operations and protected content', () => {
  let fixture: ComponentFixture<WorkflowRunDetailComponent>;
  let c: WorkflowRunDetailComponent;
  let http: HttpTestingController;
  let revoked: Subject<string>;
  let changes: Subject<string>;
  const base = environment.apiBaseUrl;
  const url = `${base}/workflows/runs/${uuid}`;
  function flushLoad(value: Run = structuredClone(run), isInvoice = false): void {
    http.expectOne(url + '/').flush(value);
    http
      .expectOne(`${base}/workflows/definitions/${uuid}/`)
      .flush(isInvoice ? invoiceDefinition : definition);
    http.expectOne(`${base}/workflows/versions/${uuid}/`).flush(version);
    http.expectOne(url + '/steps/').flush([step]);
    http.expectOne(url + '/findings/').flush([finding]);
    http.expectOne(url + '/exceptions/').flush([]);
    http.expectOne(url + '/comments/').flush([
      {
        uuid,
        step_run: null,
        author: 1,
        body: '<img src=x onerror=alert(1)>',
        created_at: '2026-10-01T00:00:00Z',
      },
    ]);
    http.expectOne(url + '/artifacts/').flush([artifact]);
    fixture.detectChanges();
    if (isInvoice) {
      http.expectOne(url + '/invoice/').flush(invoice);
      fixture.detectChanges();
    }
  }
  beforeEach(() => {
    revoked = new Subject();
    changes = new Subject();
    TestBed.configureTestingModule({
      imports: [WorkflowRunDetailComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ uuid })) } },
        {
          provide: DocumentRealtimeService,
          useValue: { revoked$: revoked, subscribeDocuments: vi.fn() },
        },
        {
          provide: DocumentGovernanceService,
          useValue: { changes$: changes, memberships: () => of([]) },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(WorkflowRunDetailComponent);
    c = fixture.componentInstance;
  });
  afterEach(() => {
    fixture.destroy();
    http.verify();
    vi.restoreAllMocks();
  });
  it('places invoice workspace before generic source proof and links back to register', () => {
    flushLoad(structuredClone(invoiceRun), true);
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('a[href="/workflows/invoices"]')).toBeTruthy();
    const invoiceWorkspace = element.querySelector('app-invoice-workspace');
    const sourceProof = element.querySelector('app-source-proof-panel');
    expect(invoiceWorkspace).toBeTruthy();
    if (sourceProof) {
      expect(invoiceWorkspace!.compareDocumentPosition(sourceProof) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });
  it('renders current step, multiple documents and linked existing approval', () => {
    flushLoad();
    expect(fixture.nativeElement.textContent).toContain('Review documents');
    expect(fixture.nativeElement.querySelectorAll('a[href^="/documents/detail/"]').length).toBe(2);
    expect(fixture.nativeElement.querySelector('a[href^="/approvals/"]')).toBeTruthy();
  });
  it('renders comments as escaped text', () => {
    flushLoad();
    expect(fixture.nativeElement.textContent).toContain('<img src=x');
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
  });
  it('sends human review as command with revision and no status PATCH', () => {
    flushLoad();
    c.command({ action: 'accept', comment: 'Reviewed' });
    const req = http.expectOne(url + '/commands/');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toMatchObject({
      action: 'accept',
      expected_revision: 3,
      comment: 'Reviewed',
    });
    expect(req.request.body.status).toBeUndefined();
    req.flush({ ...run, revision: 4 });
    flushLoad({ ...run, revision: 4 });
  });
  it('blocks duplicate action while pending', () => {
    flushLoad();
    c.command({ action: 'accept' });
    c.command({ action: 'accept' });
    const req = http.expectOne(url + '/commands/');
    req.flush(run);
    flushLoad();
  });
  it('retains idempotency key after ambiguous network failure', () => {
    flushLoad();
    c.command({ action: 'accept' });
    const first = http.expectOne(url + '/commands/');
    const key = first.request.body.idempotency_key;
    first.error(new ProgressEvent('error'));
    c.command({ action: 'accept' });
    const retry = http.expectOne(url + '/commands/');
    expect(retry.request.body.idempotency_key).toBe(key);
    retry.flush(run);
    flushLoad();
  });
  it('refreshes after 409 without replaying approval', () => {
    flushLoad();
    c.command({ action: 'accept' });
    http
      .expectOne(url + '/commands/')
      .flush({ detail: 'conflict' }, { status: 409, statusText: 'Conflict' });
    expect(TestBed.inject(ToastService).messages().at(-1)?.message).toContain('Another action');
    flushLoad({ ...run, revision: 4, status: 'completed' });
    http.expectNone(url + '/commands/');
    expect(c.can('review')).toBe(false);
  });
  it('approves only using backend approval capability', () => {
    const approval = {
      ...run,
      status: 'approval_required' as const,
      capabilities: { ...run.capabilities, approve: true, review: false },
    };
    flushLoad(approval);
    c.command({ action: 'approve' });
    const req = http.expectOne(url + '/commands/');
    expect(req.request.body.action).toBe('approve');
    req.flush(approval);
    flushLoad(approval);
  });
  it('does not present unauthorized actions', () => {
    flushLoad({
      ...run,
      capabilities: {
        view: true,
        cancel: false,
        assign: false,
        review: false,
        approve: false,
        reject: false,
        resolve_exception: false,
        comment: false,
        administer: false,
        request_changes: false,
      },
    });
    expect(fixture.nativeElement.textContent).not.toContain('Accept review');
    c.command({ action: 'cancel' });
    http.expectNone(url + '/commands/');
  });
  it('requires cancellation confirmation', () => {
    flushLoad();
    c.command({ action: 'cancel' });
    http.expectNone(url + '/commands/');
    c.cancelConfirmed = true;
    c.command({ action: 'cancel' });
    const req = http.expectOne(url + '/commands/');
    expect(req.request.body.action).toBe('cancel');
    req.flush({ ...run, status: 'cancelled' });
    flushLoad({ ...run, status: 'cancelled' });
  });
  it.each(['completed', 'approved', 'rejected', 'failed', 'cancelled'] as const)(
    'has no mutation actions on %s even with stale capabilities',
    (status) => {
      flushLoad({ ...run, status });
      expect(c.can('cancel')).toBe(false);
      expect(c.can('comment')).toBe(false);
      expect(c.can('administer')).toBe(false);
    },
  );
  it('handles forbidden comment by clearing all protected local state', () => {
    flushLoad();
    c.command({ action: 'comment', comment: 'test' });
    http
      .expectOne(url + '/commands/')
      .flush({ detail: 'Permission denied' }, { status: 403, statusText: 'Forbidden' });
    expect(c.run()).toBeNull();
    expect(c.artifacts()).toEqual([]);
    expect(c.comments()).toEqual([]);
  });
  it('clears inaccessible run on 404', () => {
    http.expectOne(url + '/').flush({}, { status: 404, statusText: 'Not found' });
    expect(c.run()).toBeNull();
    expect(c.error()).toContain('unavailable');
  });
  it('clears all content on document revocation and refetches', () => {
    flushLoad();
    revoked.next(doc);
    expect(c.run()).toBeNull();
    expect(c.findings()).toEqual([]);
    http.expectOne(url + '/').flush({}, { status: 404, statusText: 'Not found' });
  });
  it('clears immediately when revoked during pending command and ignores late response', () => {
    flushLoad();
    c.command({ action: 'accept' });
    const req = http.expectOne(url + '/commands/');
    revoked.next(doc2);
    expect(c.run()).toBeNull();
    expect(c.artifacts()).toEqual([]);
    req.flush(run);
    expect(c.run()).toBeNull();
  });
  it('ignores stale protected responses after governance invalidation', () => {
    http.expectOne(url + '/').flush(run);
    const old = http.match((req) => req.url.startsWith(base));
    changes.next('*');
    for (const req of old) if (!req.cancelled) req.flush([]);
    http.expectOne(url + '/').flush({}, { status: 403, statusText: 'Forbidden' });
    expect(c.artifacts()).toEqual([]);
  });
  it('retains safe overview while clearing protected sections on field-content denial', () => {
    http.expectOne(url + '/').flush(run);
    http.expectOne(`${base}/workflows/definitions/${uuid}/`).flush(definition);
    http.expectOne(`${base}/workflows/versions/${uuid}/`).flush(version);
    http.expectOne(url + '/steps/').flush([step]);
    http.expectOne(url + '/findings/').flush({}, { status: 403, statusText: 'Forbidden' });
    http.expectOne(url + '/comments/').flush([{ body: 'stale' }]);
    http.expectOne(url + '/exceptions/').flush([]);
    http.expectOne(url + '/artifacts/').flush([artifact]);
    expect(c.run()?.uuid).toBe(uuid);
    expect(c.comments()).toEqual([]);
    expect(c.artifacts()).toEqual([]);
    expect(c.can('comment')).toBe(false);
  });
  it('review finding only after server confirms', () => {
    flushLoad();
    c.reviewFinding(finding, 'dismissed');
    expect(c.findings()[0].status).toBe('open');
    const req = http.expectOne(url + `/findings/${uuid}/review/`);
    expect(req.request.body).toEqual({ status: 'dismissed' });
    req.flush({ ...finding, status: 'dismissed' });
    expect(c.findings()[0].status).toBe('dismissed');
  });
  it('denied finding review removes protected finding data', () => {
    flushLoad();
    c.reviewFinding(finding, 'accepted');
    http
      .expectOne(url + `/findings/${uuid}/review/`)
      .flush({}, { status: 403, statusText: 'Forbidden' });
    expect(c.findings()).toEqual([]);
  });
  it('re-fetches artifact over authenticated API before inspection', () => {
    flushLoad();
    c.artifact(uuid);
    expect(c.inspected()).toBeNull();
    http.expectOne(url + '/artifacts/').flush([artifact]);
    expect(c.inspected()?.data).toEqual(artifact.data);
  });
  it('artifact authorization failure clears all protected content', () => {
    flushLoad();
    c.artifact(uuid);
    http.expectOne(url + '/artifacts/').flush({}, { status: 403, statusText: 'Forbidden' });
    expect(c.artifacts()).toEqual([]);
    expect(c.findings()).toEqual([]);
    expect(c.inspected()).toBeNull();
  });
  it('downloads freshly authorized JSON and revokes object URL', () => {
    flushLoad();
    const create = vi.fn(() => 'blob:protected');
    const revoke = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    c.artifact(uuid, true);
    http.expectOne(url + '/artifacts/').flush([artifact]);
    expect(create).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith('blob:protected');
  });
  it('assigns selected membership principal through command', () => {
    flushLoad();
    c.assignment = { user: 1 };
    c.assign();
    const req = http.expectOne(url + '/commands/');
    expect(req.request.body.assignment).toEqual({ user: 1 });
    req.flush(run);
    flushLoad();
  });
  it('resolves exception through supported command and handles denial', () => {
    flushLoad({
      ...run,
      status: 'exception',
      capabilities: { ...run.capabilities, resolve_exception: true },
    });
    c.resolution = 'Verified';
    c.resolve({
      uuid,
      step_run: 1,
      category: 'validation',
      status: 'open',
      safe_message: 'Check',
      owner: null,
      resolved_by: null,
      resolved_at: null,
      resolution: '',
    });
    const req = http.expectOne(url + '/commands/');
    expect(req.request.body).toMatchObject({
      action: 'resolve_exception',
      exception: uuid,
      resolution: 'Verified',
    });
    req.flush({}, { status: 403, statusText: 'Forbidden' });
    expect(c.run()).toBeNull();
  });
  it('stops polling when destroyed', () => {
    flushLoad();
    fixture.destroy();
    expect(c.run()).toBeNull();
  });
  it('invoice detail embeds child workspace with generic findings and approval progress', () => {
    flushLoad(invoiceRun, true);
    expect(fixture.nativeElement.querySelector('app-invoice-workspace')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-workflow-finding')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('a[href^="/approvals/"]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('0000123');
  });
  it('blocks parent commands and refresh while invoice correction is unsaved', () => {
    flushLoad(invoiceRun, true);
    c.invoicePending.set(true);
    c.command({ action: 'accept' });
    c.reviewFinding(finding, 'resolved');
    c.load();
    http.expectNone((req) => req.method === 'POST');
    http.expectNone(url + '/');
  });
  it('invoice denial clears generic findings and artifacts and blocks commands', () => {
    flushLoad(invoiceRun, true);
    c.invoiceDenied('Access unavailable');
    fixture.detectChanges();
    expect(c.findings()).toEqual([]);
    expect(c.artifacts()).toEqual([]);
    expect(fixture.nativeElement.querySelector('app-invoice-workspace')).toBeNull();
    c.command({ action: 'accept' });
    http.expectNone((req) => req.method === 'POST');
  });
  it('keeps invoice review workspace stable instead of polling while reviewer is working', () => {
    flushLoad(invoiceRun, true);
    expect(c.definition()?.workflow_type).toBe('invoice');
    expect(c.run()?.status).toBe('review_required');
    expect((c as unknown as { poll: unknown }).poll).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('will not refresh automatically');
  });
  it('does not offer forbidden decisions for invoice findings from older processing steps', () => {
    flushLoad(invoiceRun, true);
    expect(c.canReviewFinding(finding)).toBe(false);
    c.reviewFinding(finding, 'accepted');
    http.expectNone((req) => req.method === 'POST' && req.url.includes('/findings/'));
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Read-only validation finding');
  });
  it('allows assigned invoice reviewer to review generic findings without administrator rights', () => {
    flushLoad(
      { ...invoiceRun, capabilities: { ...invoiceRun.capabilities, administer: false } },
      true,
    );
    const activeFinding = { ...finding, step_key: 'review', step_run_status: 'waiting' as const };
    c.findings.set([activeFinding]);
    expect(c.canReviewFinding(activeFinding)).toBe(true);
    c.reviewFinding(activeFinding, 'resolved');
    const req = http.expectOne(url + '/findings/' + uuid + '/review/');
    expect(req.request.body.status).toBe('resolved');
    req.flush({ ...finding, status: 'resolved' });
  });
});
