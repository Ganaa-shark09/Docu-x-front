import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { environment } from '../../../../environments/environment';
import { ContractWorkspaceComponent } from './contract-workspace.component';
import { DocumentGovernanceService } from '../../documents/services/document-governance.service';
import { DocumentRealtimeService } from '../../../core/realtime/document-realtime.service';
import {
  contract,
  contractRun,
  contractVersion,
  contractOutput,
  proof,
  contractFact,
} from '../contract-test.fixtures';
import { doc, doc2, uuid } from '../workflow-test.fixtures';
import { ContractReview } from '../models/contract.model';
describe('Contract source-grounded review workspace', () => {
  let fixture: ComponentFixture<ContractWorkspaceComponent>,
    c: ContractWorkspaceComponent,
    http: HttpTestingController,
    revoked: Subject<string>,
    changes: Subject<string>;
  const base = environment.apiBaseUrl,
    root = base + '/workflows',
    url = root + '/contract-reviews/' + uuid;
  function load(record: ContractReview = structuredClone(contract), access = 'review') {
    fixture.detectChanges();
    http.expectOne(root + '/runs/' + uuid + '/contract-review/').flush(record);
    if (c.contract())
      http
        .expectOne(base + '/documents/' + doc + '/')
        .flush({ uuid: doc, current_user_access: access });
    fixture.detectChanges();
  }
  function text() {
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent || '';
  }
  function edit() {
    c.openEdit('contract_title');
    c.draft = 'Reviewed title';
    c.reason = 'Checked original document';
  }
  function correction() {
    return http.expectOne(root + '/extraction-runs/' + uuid + '/fields/' + uuid + '/correct/');
  }
  function cleared() {
    expect(c.contract()).toBeNull();
    expect(c.fields()).toEqual([]);
    expect(c.outputs()).toEqual([]);
    expect(c.evidence()).toEqual([]);
    expect(c.editor()).toBeNull();
    expect(c.draft).toBe('');
    expect(c.reason).toBe('');
    expect(c.evidenceDraft).toBe('');
    expect(c.preview()).toBeNull();
    expect(c.correctionEvidence).toEqual([]);
  }
  beforeEach(() => {
    revoked = new Subject();
    changes = new Subject();
    TestBed.configureTestingModule({
      imports: [ContractWorkspaceComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: DocumentGovernanceService, useValue: { changes$: changes } },
        { provide: DocumentRealtimeService, useValue: { revoked$: revoked } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ContractWorkspaceComponent);
    c = fixture.componentInstance;
    fixture.componentRef.setInput('run', structuredClone(contractRun));
    fixture.componentRef.setInput('version', contractVersion);
    vi.stubGlobal(
      'URL',
      class extends URL {
        static override createObjectURL = vi.fn(() => 'blob:contract');
        static override revokeObjectURL = vi.fn();
      },
    );
  });
  afterEach(() => {
    fixture.destroy();
    http.verify();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete document.documentElement.dataset['theme'];
  });
  it('loads aggregate contract without per-fact requests', () => {
    load();
    expect(c.contract()?.uuid).toBe(uuid);
    http.expectNone(url + '/fields/');
  });
  it('renders backend contract type', () => {
    load();
    expect(text()).toContain('Service agreement');
  });
  it('preserves unknown classification', () => {
    load({
      ...contract,
      normalized: { contract_type: 'unknown' },
      classification: { uncertain: true },
    });
    expect(text()).toContain('Unknown');
    expect(text()).toContain('Uncertain classification');
  });
  it('supports configurable contract types', () => {
    load({ ...contract, normalized: { contract_type: 'custom_research_agreement' } });
    expect(text()).toContain('Custom research agreement');
  });
  it('renders more than two parties and their actual roles', () => {
    load();
    c.changeTab('parties');
    expect(text()).toContain('Gamma');
    expect(text()).toContain('Vendor');
    expect(text()).toContain('Customer');
    expect(text()).toContain('Supplier');
  });
  it('does not infer governing law from party jurisdiction', () => {
    load({
      ...contract,
      normalized: { parties: contract.normalized.parties, governing_law: null },
    });
    expect(c.display('governing_law')).toBe('Unknown');
  });
  it.each([
    ['effective_date', '2026-10-01'],
    ['expiration_date', '2027-10-01'],
    ['notice_deadline', '2027-09-01'],
    ['renewal_term', '12 months'],
    ['renewal_mechanism', 'Automatic'],
  ])('renders backend %s without reinterpretation', (key, value) => {
    load();
    c.changeTab('dates_term');
    expect(text()).toContain(value);
  });
  it('keeps ambiguous dates unresolved and raw value visible', () => {
    load({
      ...contract,
      normalized: { effective_date: null },
      field_provenance: {
        effective_date: { ...contractFact, raw_value: '01/02/2026', normalized_value: null },
      },
    });
    c.changeTab('dates_term');
    expect(c.display('effective_date')).toBe('Unknown');
    expect(text()).toContain('01/02/2026');
  });
  it.each([true, false, null])('renders auto renewal %s without inventing a deadline', (value) => {
    load({ ...contract, normalized: { auto_renewal: value, notice_deadline: null } });
    c.changeTab('dates_term');
    expect(c.display('auto_renewal')).toBe(value === null ? 'Unknown' : value ? 'Yes' : 'No');
    expect(c.display('notice_deadline')).toBe('Unknown');
  });
  it('renders termination text as document facts', () => {
    load();
    c.changeTab('termination');
    expect(text()).toContain('Material breach');
    expect(text()).toContain('30 days');
  });
  it('preserves money precision and backend currency', () => {
    load();
    c.changeTab('commercial_terms');
    expect(text()).toContain('INR 12,345,678,901,234,567,890.1200');
  });
  it('does not assume USD or perform FX conversion', () => {
    load({ ...contract, normalized: { contract_value: '10.1234', currency: null } });
    expect(c.display('contract_value')).toBe('10.1234');
    expect(text()).not.toContain('USD');
  });
  it('renders obligations as structured party, action and timing', () => {
    load();
    c.changeTab('obligations');
    expect(text()).toContain('Provide services');
    expect(text()).toContain('Acme');
    expect(text()).toContain('Monthly');
  });
  it('opens obligation evidence', () => {
    load();
    c.changeTab('obligations');
    c.showEvidence('obligations');
    expect(c.tab()).toBe('evidence');
    expect(text()).toContain(proof.preview);
  });
  it('renders clauses with category, heading and text', () => {
    load();
    c.changeTab('clauses');
    expect(text()).toContain('Section 9');
    expect(text()).toContain('Either party may terminate');
  });
  it('opens clause evidence without inventing exact highlighting', () => {
    load({
      ...contract,
      field_provenance: {
        key_clauses: { ...contractFact, evidence: [{ ...proof, boundary: 'approximate_chunk' }] },
      },
    });
    c.showEvidence('key_clauses');
    expect(text()).toContain('Approximate chunk location');
    expect(fixture.nativeElement.querySelector('mark')).toBeNull();
  });
  it.each(['missing_clause', 'missing_information', 'evidence_conflict', 'risk'])(
    'renders %s as review item separate from facts',
    (category) => {
      load({
        ...contract,
        validation: [
          {
            code: 'required_review_item',
            fields: ['effective_date'],
            category,
            severity: 'high',
            blocking: true,
          },
        ],
      });
      c.changeTab('risks_findings');
      expect(text()).toContain('Required review item');
      expect(text()).toContain('Severity: High');
      expect(text()).not.toContain('contract is illegal');
      expect(fixture.nativeElement.querySelector('a[href="#workflow-findings"]')).toBeTruthy();
    },
  );
  it('keeps both contradiction sources without resolving them', () => {
    load({
      ...contract,
      validation: [
        {
          code: 'conflicting_terms',
          fields: ['effective_date'],
          category: 'evidence_conflict',
          severity: 'high',
          blocking: true,
        },
      ],
      field_provenance: {
        effective_date: {
          ...contractFact,
          evidence: [
            proof,
            { ...proof, start: 50, end: 80, preview: 'Conflicting notice 60 days' },
          ],
        },
      },
    });
    c.showEvidence('effective_date');
    expect(text()).toContain(proof.preview);
    expect(text()).toContain('Conflicting notice 60 days');
    expect(c.provenance('effective_date')?.review_status).toBe('unreviewed');
  });
  it('confidence is an estimate, never verification', () => {
    load();
    expect(text()).toContain('80%');
    expect(text()).toContain('Estimate, not verification');
    expect(text()).not.toContain('Verified');
  });
  it('unknown confidence remains unavailable', () => {
    load({ ...contract, effective_confidence: null });
    expect(text()).toContain('Not provided');
  });
  it('evidence unavailable has a clear empty state', () => {
    load({ ...contract, field_provenance: { contract_title: { ...contractFact, evidence: [] } } });
    c.showEvidence('contract_title');
    expect(text()).toContain('Source evidence unavailable');
  });
  it('filters foreign-document evidence', () => {
    load();
    c.showProof([{ ...proof, document_uuid: doc2 }]);
    expect(c.evidence()).toEqual([]);
  });
  it('fetches authenticated preview without token URLs', () => {
    load();
    c.openPreview(2);
    const req = http.expectOne((r) => r.url === base + '/documents/' + doc + '/preview/');
    expect(req.request.params.get('scope')).toBe('internal');
    expect(req.request.urlWithParams).not.toContain('token');
    req.flush(new Blob(['pdf'], { type: 'application/pdf' }));
    expect(c.preview()).toBeTruthy();
  });
  it('reuses a loaded preview and revokes URL on close', () => {
    load();
    c.openPreview();
    http
      .expectOne((r) => r.url.endsWith('/preview/'))
      .flush(new Blob(['pdf'], { type: 'application/pdf' }));
    c.openPreview(3);
    http.expectNone((r) => r.url.endsWith('/preview/'));
    c.closePreview();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:contract');
  });
  it('refuses unsafe HTML previews', () => {
    load();
    c.openPreview();
    http
      .expectOne((r) => r.url.endsWith('/preview/'))
      .flush(new Blob(['<script>'], { type: 'text/html' }));
    expect(c.preview()).toBeNull();
  });
  it('preview denial clears evidence and contract', () => {
    load();
    c.showEvidence('contract_title');
    c.openPreview();
    http
      .expectOne((r) => r.url.endsWith('/preview/'))
      .flush(new Blob(['SECRET'], { type: 'application/json' }), {
        status: 403,
        statusText: 'Forbidden',
      });
    cleared();
    expect(c.error()).not.toContain('SECRET');
  });
  it('sends actual correction contract, revision, reason and evidence', () => {
    load();
    edit();
    c.saveCorrection();
    const req = correction();
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({
      corrected_value: 'Reviewed title',
      expected_revision: 3,
      reason: 'Checked original document',
      evidence: [proof],
    });
    req.flush({});
  });
  it('requires a correction reason', () => {
    load();
    c.openEdit('contract_title');
    c.saveCorrection();
    http.expectNone((r) => r.method === 'PATCH');
  });
  it('does not expose correction for a view-only document', () => {
    load(contract, 'view');
    expect(c.canCorrect('contract_title')).toBe(false);
    c.openEdit('contract_title');
    expect(c.editor()).toBeNull();
  });
  it('does not expose correction without workflow review capability', () => {
    fixture.componentRef.setInput('run', {
      ...contractRun,
      capabilities: { ...contractRun.capabilities, review: false },
    });
    load();
    expect(c.canCorrect('contract_title')).toBe(false);
  });
  it('blocks duplicate corrections', () => {
    load();
    edit();
    c.saveCorrection();
    c.saveCorrection();
    correction().flush({});
  });
  it('403 correction clears draft and protected facts', () => {
    load();
    edit();
    c.saveCorrection();
    correction().flush({ detail: 'SECRET' }, { status: 403, statusText: 'Forbidden' });
    cleared();
  });
  it('409 correction refreshes without automatic replay', () => {
    load();
    const refresh = vi.fn();
    c.refreshed.subscribe(refresh);
    edit();
    c.saveCorrection();
    correction().flush({}, { status: 409, statusText: 'Conflict' });
    expect(refresh).toHaveBeenCalledOnce();
    expect(c.editor()).toBeNull();
    http.expectNone((r) => r.method === 'PATCH');
  });
  it('400 correction preserves safe unsaved draft', () => {
    load();
    edit();
    c.saveCorrection();
    correction().flush({}, { status: 400, statusText: 'Bad request' });
    expect(c.draft).toBe('Reviewed title');
    expect(c.editor()).toBe('contract_title');
  });
  it('validates structured party correction JSON', () => {
    load();
    c.openEdit('parties');
    c.reason = 'Source checked';
    c.draft = 'invalid';
    c.saveCorrection();
    http.expectNone((r) => r.method === 'PATCH');
    expect(c.error()).toContain('JSON list');
  });
  it('sends structured party rows without inferring roles', () => {
    load();
    c.openEdit('parties');
    c.reason = 'Source checked';
    c.saveCorrection();
    const req = correction();
    expect(JSON.parse(req.request.body.corrected_value)).toHaveLength(3);
    req.flush({});
  });
  it('rejects foreign-document correction evidence', () => {
    load();
    edit();
    c.evidenceDraft = JSON.stringify([{ ...proof, document_uuid: doc2 }]);
    c.saveCorrection();
    http.expectNone((r) => r.method === 'PATCH');
  });
  it('loads correction history only once when requested', () => {
    load();
    c.changeTab('fields');
    http.expectOne(url + '/fields/').flush([
      {
        ...contractFact,
        field_key: 'contract_title',
        corrections: [
          {
            uuid,
            actor: 9,
            revision: 2,
            previous_value: 'Previous',
            corrected_value: 'Corrected',
            reason: 'Evidence checked',
            source_metadata: { evidence: [proof] },
            created_at: '2026-10-08T00:00:00Z',
          },
        ],
      },
    ]);
    expect(text()).toContain('Evidence checked');
    expect(text()).toContain('Previous');
    c.changeTab('overview');
    c.changeTab('fields');
    http.expectNone(url + '/fields/');
  });
  it('history denial clears all historical protected values', () => {
    load();
    c.changeTab('fields');
    http.expectOne(url + '/fields/').flush({}, { status: 403, statusText: 'Forbidden' });
    cleared();
  });
  it('highlights unresolved review queue', () => {
    load({
      ...contract,
      validation: [
        {
          code: 'missing_clause',
          fields: [],
          category: 'missing_clause',
          severity: 'medium',
          blocking: true,
        },
      ],
    });
    expect(text()).toContain('1 reported review items');
    expect(text()).toContain('Review queue');
  });
  it('reports incomplete coverage as completion blocked', () => {
    const blocked = vi.fn();
    c.completionBlocked.subscribe(blocked);
    load({ ...contract, coverage: { complete: false, method: 'incomplete_chunk_coverage' } });
    expect(blocked).toHaveBeenLastCalledWith(true);
    expect(text()).toContain('finalization blocked');
  });
  it('renders finalized reviewed values instead of live extraction', () => {
    load({ ...contract, final_output: contractOutput });
    c.changeTab('output');
    http.expectOne(url + '/outputs/').flush([contractOutput]);
    expect(text()).toContain('Reviewed contract');
    expect(text()).toContain('Approval: Approved');
  });
  it('selects one historical version without merging outputs', () => {
    load({ ...contract, final_output: contractOutput });
    c.changeTab('output');
    http
      .expectOne(url + '/outputs/')
      .flush([{ ...contractOutput, uuid: doc2, revision: 2 }, contractOutput]);
    c.outputRevision.set(1);
    expect(c.selectedOutput()?.uuid).toBe(uuid);
    expect(text()).toContain('HISTORICAL');
  });
  it('rejects output belonging to another source', () => {
    load();
    c.changeTab('output');
    http.expectOne(url + '/outputs/').flush([
      {
        ...contractOutput,
        data: {
          ...contractOutput.data,
          source: { ...contractOutput.data.source, document_uuid: doc2 },
        },
      },
    ]);
    expect(c.selectedOutput()).toBeNull();
  });
  it('final output unavailable before completion', () => {
    load();
    c.changeTab('output');
    http.expectOne(url + '/outputs/').flush([]);
    expect(text()).toContain('required validation, review and approval');
    expect(c.canExport()).toBe(false);
  });
  it('downloads authorized finalized export and releases blob URL', () => {
    fixture.componentRef.setInput('run', { ...contractRun, status: 'completed' });
    load({ ...contract, final_output: contractOutput });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    c.export();
    const req = http.expectOne(url + '/export/');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['{}'], { type: 'application/json' }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:contract');
  });
  it('export denial clears finalized output', () => {
    fixture.componentRef.setInput('run', { ...contractRun, status: 'completed' });
    load({ ...contract, final_output: contractOutput });
    c.export();
    http
      .expectOne(url + '/export/')
      .flush(new Blob(['{}']), { status: 403, statusText: 'Forbidden' });
    cleared();
    expect(c.error()).toContain('export is not permitted');
  });
  it('blocks duplicate exports', () => {
    fixture.componentRef.setInput('run', { ...contractRun, status: 'completed' });
    load({ ...contract, final_output: contractOutput });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    c.export();
    c.export();
    http.expectOne(url + '/export/').flush(new Blob(['{}']));
  });
  it.each(['realtime', 'governance'])(
    '%s revocation clears all facts, history, draft and preview',
    (stream) => {
      load({ ...contract, final_output: contractOutput });
      c.openPreview();
      http
        .expectOne((r) => r.url.endsWith('/preview/'))
        .flush(new Blob(['pdf'], { type: 'application/pdf' }));
      edit();
      c.evidenceDraft = 'protected draft';
      (stream === 'realtime' ? revoked : changes).next(doc);
      cleared();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:contract');
      expect(text()).not.toContain('Acme');
    },
  );
  it('revocation cancels pending evidence download', () => {
    load();
    c.openPreview();
    const req = http.expectOne((r) => r.url.endsWith('/preview/'));
    revoked.next(doc);
    expect(req.cancelled).toBe(true);
    cleared();
  });
  it('ignores unrelated document revocation', () => {
    load();
    revoked.next(doc2);
    expect(c.contract()).toBeTruthy();
  });
  it('404 inaccessible review clears state safely', () => {
    fixture.detectChanges();
    http
      .expectOne(root + '/runs/' + uuid + '/contract-review/')
      .flush({ detail: 'SECRET' }, { status: 404, statusText: 'Not found' });
    cleared();
    expect(c.error()).not.toContain('SECRET');
  });
  it('processing 404 renders pending without inventing results', () => {
    fixture.componentRef.setInput('run', { ...contractRun, status: 'processing' });
    fixture.detectChanges();
    http
      .expectOne(root + '/runs/' + uuid + '/contract-review/')
      .flush({}, { status: 404, statusText: 'Not found' });
    expect(c.contract()).toBeNull();
    expect(c.error()).toContain('not produced a record yet');
  });
  it('foreign-source aggregate is rejected', () => {
    load({ ...contract, document_uuid: doc2 });
    cleared();
  });
  it('supports keyboard tab navigation and named panel', () => {
    load();
    const button = fixture.nativeElement.querySelector('[role=tab]');
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(c.tab()).toBe('parties');
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[role=tabpanel]').getAttribute('aria-labelledby'),
    ).toBe('contract-tab-parties');
  });
  it('unsaved correction blocks tab changes', () => {
    load();
    edit();
    c.changeTab('clauses');
    expect(c.tab()).toBe('overview');
  });
  it.each(['light', 'dark'])(
    '%s theme covers overview, clauses, risks, evidence and correction controls',
    (theme) => {
      document.documentElement.dataset['theme'] = theme;
      load();
      for (const tab of ['overview', 'clauses', 'risks_findings', 'evidence'] as const) {
        c.changeTab(tab);
        expect(text()).toBeTruthy();
        expect(fixture.nativeElement.querySelector('[role=tabpanel]')).toBeTruthy();
      }
      edit();
      expect(fixture.nativeElement.querySelector('[style*="background: white"]')).toBeNull();
    },
  );
  it('uses the actual obligation row evidence rather than unrelated collection sources', () => {
    load({
      ...contract,
      normalized: {
        ...contract.normalized,
        obligations: [
          {
            ...contract.normalized.obligations![0],
            evidence: [{ ...proof, preview: 'Specific obligation proof' }],
          },
        ],
      },
    });
    c.changeTab('obligations');
    fixture.detectChanges();
    fixture.nativeElement.querySelector('app-contract-collection button').click();
    expect(c.evidence()[0].preview).toBe('Specific obligation proof');
  });
});
