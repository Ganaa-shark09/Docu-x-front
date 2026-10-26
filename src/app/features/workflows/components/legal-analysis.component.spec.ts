import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { LegalAnalysisComponent } from './legal-analysis.component';
import { DocumentGovernanceService } from '../../documents/services/document-governance.service';
import { DocumentRealtimeService } from '../../../core/realtime/document-realtime.service';
import { LegalClauseService } from '../services/legal-clause.service';
import { environment } from '../../../../environments/environment';
import { legalAnalysis, legalRun, legalType, legalProof } from '../legal-test.fixtures';
import { uuid, doc, doc2, page, version } from '../workflow-test.fixtures';
import { ClauseAnalysis } from '../models/legal-clause.model';
describe('Legal source grounded analysis workspace', () => {
  let fixture: ComponentFixture<LegalAnalysisComponent>,
    c: LegalAnalysisComponent,
    http: HttpTestingController,
    changes: Subject<string>,
    revoked: Subject<string>;
  const base = environment.apiBaseUrl,
    root = base + '/workflows',
    url = root + '/clause-analyses/' + uuid;
  function load(a: ClauseAnalysis = structuredClone(legalAnalysis), access = 'review') {
    fixture.detectChanges();
    http.expectOne(root + '/runs/' + uuid + '/clause-analysis/').flush(a);
    if (c.analysis())
      http
        .expectOne(base + '/documents/' + doc + '/')
        .flush({ uuid: doc, current_user_access: access });
    fixture.detectChanges();
  }
  function editor() {
    c.editCorrection(c.analysis()!.clauses[0]);
    http.expectOne((r) => r.url === root + '/clause-types/').flush(page([legalType]));
    c.correctionReason = 'Verified current source';
    fixture.detectChanges();
  }
  beforeEach(() => {
    changes = new Subject();
    revoked = new Subject();
    TestBed.configureTestingModule({
      imports: [LegalAnalysisComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: DocumentGovernanceService, useValue: { changes$: changes } },
        { provide: DocumentRealtimeService, useValue: { revoked$: revoked } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(LegalAnalysisComponent);
    c = fixture.componentInstance;
    fixture.componentRef.setInput('run', structuredClone(legalRun));
    fixture.componentRef.setInput('version', version);
  });
  afterEach(() => {
    fixture.destroy();
    http.verify({ ignoreCancelled: true });
    vi.restoreAllMocks();
  });
  it('loads a single bounded aggregate without per clause requests', () => {
    load();
    http.expectNone((r) => r.url.endsWith('/evidence/'));
    http.expectNone((r) => r.url.endsWith('/deviations/'));
    expect(fixture.nativeElement.textContent).toContain('100000.50');
  });
  it('preserves large decimal context without number conversion', () => {
    load();
    expect(fixture.nativeElement.textContent).toContain('12345678901234567890.1200');
  });
  it('shows detection confidence separately from severity', () => {
    load();
    expect(fixture.nativeElement.textContent).toContain('estimate, not risk severity');
    c.changeTab('comparison');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('POLICY RISK');
    expect(fixture.nativeElement.textContent).toContain('PLAYBOOK EXPECTATION');
  });
  it('renders malicious source as text', () => {
    const a = structuredClone(legalAnalysis);
    a.clauses[0].heading = '<script>secret()</script>';
    load(a);
    expect(fixture.nativeElement.querySelector('script')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('<script>');
  });
  it('labels incomplete coverage without definitive missing clauses', () => {
    const a = structuredClone(legalAnalysis);
    a.coverage.complete = false;
    a.deviations[0].comparison = 'not_detected';
    load(a);
    c.changeTab('comparison');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Coverage insufficient');
    expect(fixture.nativeElement.textContent).not.toContain('Required clause not detected');
  });
  it('rejects mismatched workflow aggregates', () => {
    const a = structuredClone(legalAnalysis);
    a.workflow_uuid = doc2;
    load(a);
    expect(c.analysis()).toBeNull();
  });
  it('rejects foreign source documents', () => {
    const a = structuredClone(legalAnalysis);
    a.document_uuid = doc2;
    load(a);
    expect(c.analysis()).toBeNull();
  });
  it('does not offer review without backend capability', () => {
    fixture.componentRef.setInput('run', {
      ...legalRun,
      capabilities: { ...legalRun.capabilities, review: false },
    });
    load();
    c.reviewClause(legalAnalysis.clauses[0]);
    expect(c.target).toBeNull();
  });
  it('does not allow correction with view access', () => {
    load(undefined, 'view');
    c.editCorrection(legalAnalysis.clauses[0]);
    expect(c.correction).toBeNull();
  });
  it('permits correction with source review access', () => {
    load();
    editor();
    expect(c.correction).not.toBeNull();
  });
  it('restricts completed runs to history and export', () => {
    fixture.componentRef.setInput('run', { ...legalRun, status: 'completed' });
    load();
    expect(c.reviewable()).toBe(false);
  });
  it('sends the workflow revision, not analysis revision', () => {
    load();
    c.reviewClause(legalAnalysis.clauses[0]);
    c.reason = 'Checked source';
    c.submitDecision();
    const r = http.expectOne(url + '/decision/');
    expect(r.request.body.expected_revision).toBe(3);
    expect(r.request.body.target_type).toBe('clause');
    r.flush({});
  });
  it('reuses idempotency key after a network failure', () => {
    load();
    c.reviewClause(legalAnalysis.clauses[0]);
    c.reason = 'Verified';
    c.submitDecision();
    const r = http.expectOne(url + '/decision/'),
      key = r.request.body.idempotency_key;
    r.error(new ProgressEvent('error'));
    c.submitDecision();
    const retry = http.expectOne(url + '/decision/');
    expect(retry.request.body.idempotency_key).toBe(key);
    retry.flush({});
  });
  it('changes idempotency key when user changes intent', () => {
    load();
    c.reviewClause(legalAnalysis.clauses[0]);
    c.reason = 'Verified';
    c.submitDecision();
    const r = http.expectOne(url + '/decision/'),
      key = r.request.body.idempotency_key;
    r.error(new ProgressEvent('error'));
    c.reason = 'New intent';
    c.submitDecision();
    const retry = http.expectOne(url + '/decision/');
    expect(retry.request.body.idempotency_key).not.toBe(key);
    retry.flush({});
  });
  it('blocks blank review reasons', () => {
    load();
    c.reviewClause(legalAnalysis.clauses[0]);
    c.submitDecision();
    http.expectNone(url + '/decision/');
  });
  it('does not offer confirmed for deviations', () => {
    load();
    c.reviewDeviation(legalAnalysis.deviations[0]);
    expect(c.choices()).not.toContain('confirmed');
  });
  it('does not accept deviation decisions on a clause', () => {
    load();
    c.reviewClause(legalAnalysis.clauses[0]);
    c.decision = 'exception_approved';
    c.reason = 'Wrong';
    c.submitDecision();
    http.expectNone(url + '/decision/');
  });
  it('prevents duplicate submissions while pending', () => {
    load();
    c.reviewClause(legalAnalysis.clauses[0]);
    c.reason = 'Verified';
    c.submitDecision();
    c.submitDecision();
    http.expectOne(url + '/decision/').flush({});
  });
  it('refreshes conflicts without replaying a decision', () => {
    load();
    c.reviewClause(legalAnalysis.clauses[0]);
    c.reason = 'Verified';
    c.submitDecision();
    http
      .expectOne(url + '/decision/')
      .flush({ detail: 'provider-secret' }, { status: 409, statusText: 'Conflict' });
    expect(c.target).toBeNull();
    expect(c.analysis()).toBeNull();
    http.expectOne(root + '/runs/' + uuid + '/clause-analysis/').flush(legalAnalysis);
    http
      .expectOne(base + '/documents/' + doc + '/')
      .flush({ uuid: doc, current_user_access: 'review' });
    http.expectNone(url + '/decision/');
    expect(c.error()).not.toContain('provider-secret');
  });
  it.each([401, 403, 404])('clears protected data on denied review %s', (status) => {
    load();
    c.reviewClause(legalAnalysis.clauses[0]);
    c.reason = 'Verified';
    c.submitDecision();
    http
      .expectOne(url + '/decision/')
      .flush({ detail: 'secret' }, { status, statusText: 'Denied' });
    expect(c.analysis()).toBeNull();
    expect(c.target).toBeNull();
    expect(c.reason).toBe('');
    expect(c.error()).not.toContain('secret');
  });
  it.each(['governance', 'realtime', 'legal'])(
    'clears all drafts and history on %s revocation',
    (kind) => {
      load();
      editor();
      c.corrections.set([{ uuid } as never]);
      c.showEvidence([legalProof]);
      c.outputs.set([{ uuid } as never]);
      if (kind === 'governance') changes.next(doc);
      else if (kind === 'realtime') revoked.next(doc);
      else TestBed.inject(LegalClauseService).invalidate(doc);
      expect(c.analysis()).toBeNull();
      expect(c.factEdits).toEqual([]);
      expect(c.corrections()).toEqual([]);
      expect(c.outputs()).toEqual([]);
      expect(c.proofs()).toEqual([]);
      expect(c.correctionReason).toBe('');
      expect(c.taxonomy()).toEqual([]);
    },
  );
  it('ignores unrelated document revocation', () => {
    load();
    changes.next(doc2);
    expect(c.analysis()).not.toBeNull();
  });
  it('cancels in flight aggregate reads on revocation', () => {
    fixture.detectChanges();
    const r = http.expectOne(root + '/runs/' + uuid + '/clause-analysis/');
    revoked.next(doc);
    expect(r.cancelled).toBe(true);
    expect(c.analysis()).toBeNull();
  });
  it('correction drafts preserve original facts', () => {
    load();
    editor();
    c.factEdits[0].value = '90000';
    expect(c.analysis()!.clauses[0].facts['amount'].value).toBe('100000.50');
  });
  it('rejects unsupported normalized correction', () => {
    load();
    editor();
    c.factEdits[0].value = '1e12';
    expect(c.correctionValid()).toBe(false);
  });
  it('requires source support for edited facts', () => {
    load();
    editor();
    c.factEdits[0].value = '999';
    expect(c.correctionValid()).toBe(false);
  });
  it('submits typed corrections with source and run revision', () => {
    load();
    editor();
    c.saveCorrection();
    const r = http.expectOne(url + '/correct/');
    expect(r.request.body.expected_revision).toBe(3);
    expect(r.request.body.facts.amount.value).toBe('100000.50');
    expect(r.request.body.evidence).toEqual([legalProof]);
    r.flush({});
  });
  it('changing source boundaries clears stale fact references', () => {
    load();
    editor();
    c.proofStart = 20;
    c.proofEnd = 50;
    c.proofText = 'Verified excerpt';
    c.proofConfirmed = true;
    c.replaceProof();
    expect(c.factEdits[0].evidence).toEqual([]);
    expect(c.clauseProofs[0].boundary).toBe('exact_text_offsets');
  });
  it('blocks unverified exact boundary changes', () => {
    load();
    editor();
    c.proofStart = 20;
    c.proofEnd = 50;
    c.proofText = 'Excerpt';
    c.replaceProof();
    expect(c.clauseProofs).toEqual([legalProof]);
  });
  it('does not show foreign evidence', () => {
    load();
    c.showEvidence([{ ...legalProof, document_uuid: doc2 }]);
    expect(c.proofs()).toEqual([]);
  });
  it('uses authenticated blob preview and exact page only', () => {
    load();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:safe');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    c.asyncPreview(legalProof);
    const r = http.expectOne(base + '/documents/' + doc + '/preview/?scope=internal');
    expect(r.request.responseType).toBe('blob');
    r.flush(new Blob(['%PDF'], { type: 'application/pdf' }));
    expect(c.preview()).toBeTruthy();
    c.closePreview();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:safe');
  });
  it('rejects unsafe source preview MIME', () => {
    load();
    c.asyncPreview(legalProof);
    http
      .expectOne(base + '/documents/' + doc + '/preview/?scope=internal')
      .flush(new Blob(['<script>'], { type: 'text/html' }));
    expect(c.preview()).toBeNull();
  });
  it('ignores preview response after closing evidence', () => {
    load();
    c.asyncPreview(legalProof);
    const r = http.expectOne(base + '/documents/' + doc + '/preview/?scope=internal');
    c.closePreview();
    r.flush(new Blob(['%PDF'], { type: 'application/pdf' }));
    expect(c.preview()).toBeNull();
  });
  it('lazy loads paginated corrections and immutable outputs', () => {
    load();
    c.changeTab('history');
    const r = http.expectOne((request) => request.url === url + '/corrections/');
    expect(r.request.params.get('page')).toBe('1');
    r.flush(page([]));
    http.expectOne(url + '/outputs/').flush([]);
    expect(c.historyOpen()).toBe(true);
  });
  it('does not export an incomplete run', () => {
    load();
    c.export();
    http.expectNone(url + '/export/');
  });
  it('downloads server exported result and revokes its URL', () => {
    fixture.componentRef.setInput('run', { ...legalRun, status: 'completed' });
    load();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:export');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    c.export();
    http
      .expectOne(url + '/export/')
      .flush(new Blob(['{"source":"server"}'], { type: 'application/json' }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:export');
  });
  it('reanalysis creates a new run and preserves historical results', () => {
    load();
    c.openReanalysis();
    http.expectOne(root + '/definitions/' + uuid + '/versions/').flush([version]);
    c.reanalyzeConfirmed = true;
    c.reanalyze();
    const r = http.expectOne(url + '/reanalyze/');
    expect(r.request.body.version).toBe(uuid);
    r.flush({ ...legalRun, uuid: doc2 });
    expect(c.newRun()).toBe(doc2);
    expect(c.analysis()!.analysis_uuid).toBe(uuid);
  });
  it('does not allow unauthorized reanalysis', () => {
    fixture.componentRef.setInput('run', {
      ...legalRun,
      capabilities: { ...legalRun.capabilities, administer: false },
    });
    load();
    c.openReanalysis();
    http.expectNone(root + '/definitions/' + uuid + '/versions/');
  });
  it('blocks completion until supported clause and risk decisions are closed', () => {
    const gate = vi.fn();
    c.completionBlocked.subscribe(gate);
    load();
    expect(gate).toHaveBeenLastCalledWith(true);
    const a = structuredClone(legalAnalysis);
    a.clauses[0].review_state = 'confirmed';
    a.decisions = [
      {
        target: doc,
        target_type: 'deviation',
        decision: 'accepted',
        reason: 'Verified',
        actor_id: 1,
        created_at: '2026-10-01',
      },
    ];
    c.analysis.set(a);
    c.updateGate();
    expect(gate).toHaveBeenLastCalledWith(false);
  });
  it('never closes an ambiguous comparison through a generic accepted decision', () => {
    load();
    const a = structuredClone(legalAnalysis);
    a.deviations[0].comparison = 'ambiguous';
    a.clauses[0].review_state = 'confirmed';
    a.decisions = [
      {
        target: doc,
        target_type: 'deviation',
        decision: 'accepted',
        reason: 'Verified',
        actor_id: 1,
        created_at: '2026-10-01',
      },
    ];
    c.analysis.set(a);
    const gate = vi.fn();
    c.completionBlocked.subscribe(gate);
    c.updateGate();
    expect(gate).toHaveBeenLastCalledWith(true);
  });

  it('does not treat a queued analysis that is not yet created as revocation', () => {
    fixture.componentRef.setInput('run', { ...legalRun, status: 'queued' });
    const denied = vi.fn();
    c.denied.subscribe(denied);
    fixture.detectChanges();
    http
      .expectOne(root + '/runs/' + uuid + '/clause-analysis/')
      .flush({ detail: 'private' }, { status: 404, statusText: 'Pending' });
    expect(c.analysis()).toBeNull();
    expect(c.notice()).toContain('processing');
    expect(denied).not.toHaveBeenCalled();
  });
  it('clears all protected state on preview denial', () => {
    load();
    c.showEvidence([legalProof]);
    c.asyncPreview(legalProof);
    http
      .expectOne(base + '/documents/' + doc + '/preview/?scope=internal')
      .flush(null, { status: 403, statusText: 'Denied' });
    expect(c.analysis()).toBeNull();
    expect(c.proofs()).toEqual([]);
    expect(c.preview()).toBeNull();
  });
  it('clears protected data on server export denial', () => {
    fixture.componentRef.setInput('run', { ...legalRun, status: 'completed' });
    load();
    c.export();
    http.expectOne(url + '/export/').flush(null, { status: 403, statusText: 'Denied' });
    expect(c.analysis()).toBeNull();
    expect(c.outputs()).toEqual([]);
  });
  it('correction conflicts discard drafts and refresh without replay', () => {
    load();
    editor();
    c.saveCorrection();
    http.expectOne(url + '/correct/').flush({}, { status: 409, statusText: 'Conflict' });
    expect(c.correction).toBeNull();
    expect(c.factEdits).toEqual([]);
    http.expectOne(root + '/runs/' + uuid + '/clause-analysis/').flush(legalAnalysis);
    http
      .expectOne(base + '/documents/' + doc + '/')
      .flush({ uuid: doc, current_user_access: 'review' });
    http.expectNone(url + '/correct/');
  });
  it('keeps reanalysis idempotency stable after a failed attempt', () => {
    load();
    c.openReanalysis();
    http.expectOne(root + '/definitions/' + uuid + '/versions/').flush([version]);
    c.reanalyzeConfirmed = true;
    c.reanalyze();
    const r = http.expectOne(url + '/reanalyze/'),
      key = r.request.body.idempotency_key;
    r.error(new ProgressEvent('error'));
    c.reanalyze();
    const retry = http.expectOne(url + '/reanalyze/');
    expect(retry.request.body.idempotency_key).toBe(key);
    retry.flush({ ...legalRun, uuid: doc2 });
  });
  it('supports keyboard navigation and selected tab semantics', async () => {
    load();
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true });
    c.tabKey(event, 0);
    await fixture.whenStable();
    expect(c.tab()).toBe('comparison');
    expect(
      fixture.nativeElement.querySelector('[role=tab][aria-selected=true]').textContent,
    ).toContain('Playbook comparison');
    expect(event.defaultPrevented).toBe(true);
  });
});
