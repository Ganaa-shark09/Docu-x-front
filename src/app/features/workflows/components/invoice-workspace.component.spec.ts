import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { environment } from '../../../../environments/environment';
import { InvoiceWorkspaceComponent } from './invoice-workspace.component';
import { DocumentGovernanceService } from '../../documents/services/document-governance.service';
import { DocumentRealtimeService } from '../../../core/realtime/document-realtime.service';
import {
  invoice,
  invoiceRun,
  invoiceVersion,
  financialStep,
  output,
  line,
  provenance,
} from '../invoice-test.fixtures';
import { doc, doc2, uuid } from '../workflow-test.fixtures';
import { InvoiceRecord, InvoiceKey } from '../models/invoice.model';
describe('Invoice workspace protected review and server authority', () => {
  let fixture: ComponentFixture<InvoiceWorkspaceComponent>,
    c: InvoiceWorkspaceComponent,
    http: HttpTestingController,
    revoked: Subject<string>,
    changes: Subject<string>;
  const base = environment.apiBaseUrl,
    root = base + '/workflows';
  function load(record: InvoiceRecord = structuredClone(invoice)) {
    fixture.detectChanges();
    http.expectOne(root + '/runs/' + uuid + '/invoice/').flush(record);
    fixture.detectChanges();
  }
  function text() {
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent || '';
  }
  function edit(key: InvoiceKey = 'invoice_number') {
    c.openEdit(key);
    c.reason = 'Checked source';
    c.draft = '0000999';
  }
  function correction() {
    return http.expectOne(root + '/extraction-runs/' + uuid + '/fields/' + uuid + '/correct/');
  }
  function closed() {
    expect(c.invoice()).toBeNull();
    expect(c.fields()).toEqual([]);
    expect(c.outputs()).toEqual([]);
    expect(c.evidence()).toEqual([]);
    expect(c.editor()).toBeNull();
    expect(c.preview()).toBeNull();
  }
  beforeEach(() => {
    revoked = new Subject();
    changes = new Subject();
    TestBed.configureTestingModule({
      imports: [InvoiceWorkspaceComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: DocumentGovernanceService, useValue: { changes$: changes } },
        { provide: DocumentRealtimeService, useValue: { revoked$: revoked } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(InvoiceWorkspaceComponent);
    c = fixture.componentInstance;
    fixture.componentRef.setInput('run', structuredClone(invoiceRun));
    fixture.componentRef.setInput('steps', [financialStep]);
    vi.stubGlobal(
      'URL',
      class extends URL {
        static override createObjectURL = vi.fn(() => 'blob:invoice-test');
        static override revokeObjectURL = vi.fn();
      },
    );
  });
  afterEach(() => {
    for (const request of http.match((r) => r.url.endsWith('/accounting-status/'))) {
      if (!request.cancelled) request.flush({ status: 'not_connected', handoff_uuid: null, external_reference: '', failure_code: '' });
    }
    fixture.destroy();
    http.verify();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete document.documentElement.dataset['theme'];
  });
  it('loads aggregate run invoice without per-field or candidate requests', () => {
    load();
    expect(c.invoice()?.uuid).toBe(uuid);
    http.expectNone(root + '/invoices/' + uuid + '/fields/');
  });
  it('preserves leading zeros, server dates and currency in summary', () => {
    load();
    expect(text()).toContain('0000123');
    expect(text()).toContain('2026-10-01');
    expect(text()).toContain('INR 110.00');
  });
  it('keeps absent dates and vendor values unknown', () => {
    load({ ...invoice, normalized: { due_date: null, vendor_name: null } });
    expect(text()).toContain('Unknown');
    expect(text()).not.toContain('Verified vendor');
  });
  it('shows clear review actions and keeps server-provided issue counts', () => {
    load({ ...invoice, validation: [{ code: 'totals_mismatch', fields: ['grand_total'], severity: 'high', blocking: true }] });
    expect(text()).toContain('What to check next');
    expect(text()).toContain('Blocking validation issues');
    expect(c.blockingIssueCount()).toBe(1);
    const actions = [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.invoice-workspace__review-link')];
    expect(actions).toHaveLength(4);
    expect(actions.map((action) => action.querySelector('strong')?.textContent?.trim())).toEqual([
      'Verify fields',
      'Financial checks',
      'Matches & duplicates',
      'Workflow decision',
    ]);
    expect(actions[3].tagName).toBe('A');
    expect(actions[3].getAttribute('href')).toBe('#workflow-review-actions');
    actions[1].click();
    fixture.detectChanges();
    expect(c.tab()).toBe('validation');
    expect((fixture.nativeElement as HTMLElement).querySelector('[role=tab][aria-selected=true]')?.textContent).toContain('Validation');
    http.expectNone((request) => request.method === 'PATCH' || request.method === 'POST');
  });
  it('uses read-only output navigation rather than a dead review anchor for completed invoices', () => {
    fixture.componentRef.setInput('run', { ...invoiceRun, status: 'completed' });
    load();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('a[href="#workflow-review-actions"]')).toBeNull();
    const lastAction = [...element.querySelectorAll<HTMLButtonElement>('.invoice-workspace__review-link')].at(-1);
    expect(lastAction?.textContent).toContain('Output & handoff');
    lastAction?.click();
    fixture.detectChanges();
    expect(c.tab()).toBe('output');
    http.expectOne(root + '/invoices/' + uuid + '/outputs/').flush([]);
    http.expectOne(root + '/invoices/' + uuid + '/accounting-status/').flush({ status: 'not_connected', handoff_uuid: null, external_reference: '', failure_code: '' });
  });
  it('keeps review action links and accessible tab panels aligned', () => {
    load();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('a[href="/workflows/invoices"]')).toBeTruthy();
    expect(element.querySelector('a[href="#workflow-review-actions"]')).toBeTruthy();
    expect(element.querySelector('[role=tabpanel][tabindex="0"]')).toBeTruthy();
  });
  it('places source preview alongside evidence and revokes it when closed', () => {
    load();
    c.showEvidence('invoice_number');
    c.openPreview();
    http.expectOne((request) => request.url.endsWith('/preview/')).flush(new Blob(['pdf'], { type: 'application/pdf' }));
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.invoice-workspace__source-viewer iframe')).toBeTruthy();
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.invoice-workspace__viewer-heading button')?.click();
    expect(c.preview()).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:invoice-test');
  });
  it('renders confidence as an estimate rather than verification', () => {
    load();
    expect(text()).toContain('75%');
    expect(text()).toContain('Estimate');
  });
  it('keeps missing confidence explicitly unavailable', () => {
    load({ ...invoice, effective_confidence: null });
    expect(text()).toContain('Not provided');
  });
  it('shows review attention with generic findings and exceptions links', () => {
    load({
      ...invoice,
      validation: [
        {
          code: 'missing_required_field',
          fields: ['vendor_name'],
          severity: 'high',
          blocking: true,
        },
      ],
    });
    expect(text()).toContain('Missing required field');
    expect(fixture.nativeElement.querySelector('a[href="#workflow-findings"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('a[href="#workflow-exceptions"]')).toBeTruthy();
  });
  it('does not invent evidence for an absent field', () => {
    load();
    c.showEvidence('vendor_name');
    expect(c.evidence()).toEqual([]);
  });
  it('uses actual offsets without inventing a page', () => {
    load();
    c.showEvidence('invoice_number');
    expect(text()).toContain('Text offsets 0');
    expect(text()).not.toContain('Page 1');
  });
  it('filters source evidence from unrelated documents', () => {
    load();
    c.showProof([{ document_uuid: doc2, page: 5, preview: 'SECRET' }]);
    expect(text()).not.toContain('SECRET');
    expect(c.evidence()).toEqual([]);
  });
  it('escapes evidence markup', () => {
    load();
    c.showProof([{ document_uuid: doc, preview: '<img src=x onerror=alert(1)>' }]);
    expect(text()).toContain('<img');
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
  });
  it('reads authenticated preview with internal scope and blob response', () => {
    load();
    c.openPreview(2);
    const req = http.expectOne((r) => r.url === base + '/documents/' + doc + '/preview/');
    expect(req.request.params.get('scope')).toBe('internal');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['pdf'], { type: 'application/pdf' }));
    expect(c.preview()).toBeTruthy();
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
  });
  it('reuses preview blob for another source page and revokes on close', () => {
    load();
    c.openPreview(2);
    http
      .expectOne((r) => r.url.endsWith('/preview/'))
      .flush(new Blob(['pdf'], { type: 'application/pdf' }));
    c.openPreview(3);
    http.expectNone((r) => r.url.endsWith('/preview/'));
    c.closePreview();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:invoice-test');
  });
  it('rejects unsafe inline file types without generating a URL', () => {
    load();
    c.openPreview();
    http
      .expectOne((r) => r.url.endsWith('/preview/'))
      .flush(new Blob(['html'], { type: 'text/html' }));
    expect(c.preview()).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it('preview permission denial clears protected values', () => {
    load();
    c.openPreview();
    http
      .expectOne((r) => r.url.endsWith('/preview/'))
      .flush(null, { status: 403, statusText: 'Forbidden' });
    closed();
  });
  it('cancels preview while closing before its response', () => {
    load();
    c.openPreview();
    const req = http.expectOne((r) => r.url.endsWith('/preview/'));
    c.closePreview();
    expect(req.cancelled).toBe(true);
    expect(c.previewBusy()).toBe(false);
  });
  it('corrects against workflow revision rather than invoice revision', () => {
    load();
    edit();
    c.saveCorrection();
    const req = correction();
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({
      corrected_value: '0000999',
      expected_revision: 3,
      reason: 'Checked source',
    });
    req.flush({});
    expect(c.editor()).toBeNull();
  });
  it('blocks repeated correction clicks', () => {
    load();
    edit();
    c.saveCorrection();
    c.saveCorrection();
    correction().flush({});
  });
  it('requires a meaningful correction reason', () => {
    load();
    edit();
    c.reason = ' ';
    c.saveCorrection();
    http.expectNone((r) => r.method === 'PATCH');
  });
  it('hides correction when backend denies review capability', () => {
    fixture.componentRef.setInput('run', {
      ...invoiceRun,
      capabilities: { ...invoiceRun.capabilities, review: false, administer: true },
    });
    load();
    expect(c.canCorrect('invoice_number')).toBe(false);
    edit();
    expect(c.editor()).toBeNull();
  });
  it('cannot correct missing provenance or extraction record', () => {
    load({ ...invoice, extraction_uuid: null });
    expect(c.canCorrect('invoice_number')).toBe(false);
    expect(c.canCorrect('vendor_name')).toBe(false);
  });
  it('permits assigned exception resolver corrections', () => {
    fixture.componentRef.setInput('run', {
      ...invoiceRun,
      status: 'exception',
      capabilities: { ...invoiceRun.capabilities, review: false, resolve_exception: true },
    });
    load();
    expect(c.canCorrect('invoice_number')).toBe(true);
  });
  it('does not offer corrections after completion', () => {
    fixture.componentRef.setInput('run', { ...invoiceRun, status: 'completed' });
    load();
    expect(c.canCorrect('invoice_number')).toBe(false);
  });
  it('clears protected editor after correction 403', () => {
    load();
    edit();
    c.saveCorrection();
    correction().flush({ detail: 'SECRET_STACK' }, { status: 403, statusText: 'Forbidden' });
    closed();
    expect(text()).not.toContain('SECRET_STACK');
  });
  it('requests current workflow refresh on conflict without replay', () => {
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
  it('keeps invalid correction editable after 400', () => {
    load();
    edit();
    c.saveCorrection();
    correction().flush({ detail: 'private trace' }, { status: 400, statusText: 'Bad Request' });
    expect(c.editor()).toBe('invoice_number');
    expect(c.error()).toContain('invalid');
    expect(text()).not.toContain('private trace');
  });
  it('loads aggregate history once and distinguishes original/corrected', () => {
    load();
    c.changeTab('fields');
    http.expectOne(root + '/invoices/' + uuid + '/fields/').flush([
      {
        ...provenance,
        field_key: 'invoice_number',
        corrected_value: '999',
        corrections: [
          {
            uuid,
            actor: 7,
            revision: 4,
            previous_value: '0000123',
            corrected_value: '999',
            reason: 'Verified printed number',
            created_at: '2026-10-01T00:00:00Z',
          },
        ],
      },
    ]);
    c.invoice.update((record) =>
      record
        ? {
            ...record,
            field_provenance: {
              ...record.field_provenance,
              invoice_number: { ...provenance, corrected_value: '999' },
            },
          }
        : null,
    );
    expect(text()).toContain('Original extracted value');
    expect(text()).toContain('Reviewer correction');
    expect(text()).toContain('Verified printed number');
    c.changeTab('summary');
    c.changeTab('fields');
    http.expectNone(root + '/invoices/' + uuid + '/fields/');
  });
  it('renders line values and a semantic scrolling table', () => {
    load();
    c.changeTab('line_items');
    expect(text()).toContain('Verified service');
    expect(fixture.nativeElement.querySelector('th[scope="col"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.line-scroll table caption')).toBeTruthy();
  });
  it('renders 200 source rows in a bounded scroll container', () => {
    load({
      ...invoice,
      normalized: {
        ...invoice.normalized,
        line_items: Array.from({ length: 200 }, () => ({ ...line })),
      },
    });
    c.changeTab('line_items');
    text();
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(200);
    expect(fixture.nativeElement.querySelector('.line-scroll')).toBeTruthy();
  });
  it('preserves server totals without browser recalculation', () => {
    load({
      ...invoice,
      normalized: {
        ...invoice.normalized,
        subtotal: '999999999999999999999.01',
        grand_total: '0.12',
      },
    });
    c.changeTab('validation');
    expect(text()).toContain('0.12');
    expect(c.data().grand_total).toBe('0.12');
  });
  it('renders financial PASS only after server validation', () => {
    load();
    c.changeTab('validation');
    expect(text()).toContain('PASS');
  });
  it('renders pending financial validation as not applicable', () => {
    fixture.componentRef.setInput('steps', []);
    load();
    expect(c.financialState()).toContain('NOT APPLICABLE');
  });
  it('does not call incomplete totals validated', () => {
    load({ ...invoice, normalized: { grand_total: null, subtotal: null } });
    expect(c.financialState()).toContain('NOT APPLICABLE');
  });
  it('renders blocking financial discrepancies as FAIL', () => {
    load({
      ...invoice,
      validation: [
        { code: 'totals_mismatch', fields: ['grand_total'], severity: 'high', blocking: true },
      ],
    });
    c.changeTab('validation');
    expect(text()).toContain('FAIL');
    expect(text()).toContain('Totals mismatch');
  });
  it('renders server financial warnings distinctly', () => {
    load({
      ...invoice,
      validation: [
        { code: 'amount_due_differs', fields: ['amount_due'], severity: 'medium', blocking: false },
      ],
    });
    expect(c.financialState()).toContain('WARNING');
  });
  it.each(['exact', 'probable'] as const)(
    'renders %s duplicate candidates without additional reads or accusations',
    (strength) => {
      load({
        ...invoice,
        duplicate_candidates: [
          {
            invoice_uuid: uuid,
            document_uuid: doc2,
            match_strength: strength,
            signals: ['invoice_number'],
            status: 'candidate',
          },
        ],
      });
      c.changeTab('matches');
      expect(text()).toContain(
        strength === 'exact' ? 'Exact duplicate candidate' : 'Probable duplicate candidate',
      );
      expect(text()).not.toMatch(/definitely fraud/i);
      http.expectNone(root + '/invoices/' + doc2 + '/');
    },
  );
  it('does not discover filtered duplicate candidates by alternate lookup', () => {
    load();
    c.changeTab('matches');
    expect(text()).toContain('No visible duplicate candidates');
    expect(
      fixture.nativeElement.querySelector('a[href="/documents/detail/' + doc2 + '"]'),
    ).toBeNull();
  });
  it.each(['matched', 'ambiguous', 'not_matched'] as const)(
    'renders vendor %s from the server',
    (status) => {
      load({ ...invoice, matches: { vendor: { ...invoice.matches.vendor!, status } } });
      c.changeTab('matches');
      expect(text()).toContain(
        status === 'not_matched' ? 'Unmatched' : status === 'matched' ? 'Matched' : 'Ambiguous',
      );
      expect(text()).toContain('Not provided');
    },
  );
  it.each([
    'matched',
    'not_matched',
    'ambiguous',
    'not_applicable',
    'integration_unavailable',
  ] as const)('renders PO %s distinctly', (status) => {
    load({ ...invoice, matches: { purchase_order: { status, reference: 'PO-01', checks: [] } } });
    c.changeTab('matches');
    expect(text()).toContain(
      status
        .split('_')
        .join(' ')
        .replace(/^./, (v) => v.toUpperCase()),
    );
    if (status === 'integration_unavailable') expect(text()).toContain('differs from a completed');
  });
  it('renders final reviewed output and revision metadata', () => {
    fixture.componentRef.setInput('run', { ...invoiceRun, status: 'completed' });
    load({ ...invoice, final_output: output });
    c.changeTab('output');
    http.expectOne(root + '/invoices/' + uuid + '/outputs/').flush([output]);
    expect(text()).toContain('REVIEWED-001');
    expect(text()).toContain('Revision 9');
    expect(text()).toContain('Schema 1');
  });
  it('posts only an authorized finalized output and reads provider status from the server', () => {
    fixture.componentRef.setInput('run', { ...invoiceRun, status: 'completed' });
    load({ ...invoice, final_output: output });
    c.changeTab('output');
    http.expectOne(root + '/invoices/' + uuid + '/outputs/').flush([output]);
    http.expectOne(root + '/invoices/' + uuid + '/accounting-status/').flush({
      status: 'ready_to_post', handoff_uuid: null, external_reference: '', failure_code: '',
    });
    c.postAccounting();
    const post = http.expectOne(root + '/invoices/' + uuid + '/post-accounting/');
    expect(post.request.body.idempotency_key).toBeTruthy();
    post.flush({ handoff_uuid: 'handoff-1', status: 'pending' });
    http.expectOne(root + '/invoices/' + uuid + '/accounting-status/').flush({
      status: 'pending', handoff_uuid: 'handoff-1', external_reference: '', failure_code: '',
    });
    expect(c.accounting()?.status).toBe('pending');
    c.postAccounting();
    http.expectNone(root + '/invoices/' + uuid + '/post-accounting/');
  });
  it('inspects historical output without merging revised values', () => {
    load({ ...invoice, final_output: output });
    c.changeTab('output');
    http.expectOne(root + '/invoices/' + uuid + '/outputs/').flush([
      output,
      {
        ...output,
        uuid: doc2,
        revision: 8,
        data: { ...output.data, invoice: { invoice_number: 'HISTORIC-008' } },
      },
    ]);
    c.outputRevision.set(8);
    expect(c.selectedOutput()?.data.invoice.invoice_number).toBe('HISTORIC-008');
  });
  it('filters outputs whose source belongs to another workflow or document', () => {
    load();
    c.changeTab('output');
    http.expectOne(root + '/invoices/' + uuid + '/outputs/').flush([
      {
        ...output,
        data: { ...output.data, source: { ...output.data.source, document_uuid: doc2 } },
      },
    ]);
    expect(c.outputs()).toEqual([]);
  });
  it('does not expose a finalized export during review', () => {
    load({ ...invoice, final_output: output });
    expect(c.canExport()).toBe(false);
    c.export();
    http.expectNone(root + '/invoices/' + uuid + '/export/');
  });
  it('downloads only authenticated server export bytes and cleans object URL', () => {
    fixture.componentRef.setInput('run', { ...invoiceRun, status: 'completed' });
    load({ ...invoice, final_output: output });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    c.export();
    c.export();
    const req = http.expectOne(root + '/invoices/' + uuid + '/export/');
    expect(req.request.responseType).toBe('blob');
    expect(req.request.body).toBeNull();
    req.flush(new Blob(['authorized-server-payload'], { type: 'application/json' }));
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:invoice-test');
  });
  it('clears export and invoice after denied export without local reconstruction', () => {
    fixture.componentRef.setInput('run', { ...invoiceRun, status: 'completed' });
    load({ ...invoice, final_output: output });
    c.export();
    http
      .expectOne(root + '/invoices/' + uuid + '/export/')
      .flush(null, { status: 403, statusText: 'Forbidden' });
    closed();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it.each([401, 403, 404])('clears protected invoice after inaccessible read %s', (status) => {
    fixture.detectChanges();
    http
      .expectOne(root + '/runs/' + uuid + '/invoice/')
      .flush({ detail: 'RESTRICTED_RAW' }, { status, statusText: 'Denied' });
    closed();
    expect(text()).not.toContain('RESTRICTED_RAW');
    expect(text()).not.toContain('0000123');
  });
  it('permits queued missing record as a safe processing state', () => {
    fixture.componentRef.setInput('run', { ...invoiceRun, status: 'queued' });
    const denial = vi.fn();
    c.denied.subscribe(denial);
    fixture.detectChanges();
    http
      .expectOne(root + '/runs/' + uuid + '/invoice/')
      .flush({}, { status: 404, statusText: 'Not Found' });
    expect(c.error()).toContain('not produced a record');
    expect(denial).not.toHaveBeenCalled();
  });
  it('clears invoice, draft, evidence, history, output and preview on revocation', () => {
    load({ ...invoice, final_output: output });
    c.showEvidence('invoice_number');
    c.fields.set([{ ...provenance, field_key: 'invoice_number', corrections: [] }]);
    c.outputs.set([output]);
    c.openPreview();
    http
      .expectOne((r) => r.url.endsWith('/preview/'))
      .flush(new Blob(['pdf'], { type: 'application/pdf' }));
    edit();
    revoked.next(doc);
    closed();
    expect(c.draft).toBe('');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:invoice-test');
    expect(text()).not.toContain('0000123');
  });
  it('cancels late history response on governance change', () => {
    load();
    c.changeTab('fields');
    const req = http.expectOne(root + '/invoices/' + uuid + '/fields/');
    changes.next(doc);
    expect(req.cancelled).toBe(true);
    closed();
  });
  it('ignores unrelated document revocation', () => {
    load();
    revoked.next(doc2);
    expect(c.invoice()).toBeTruthy();
  });
  it('rejects mismatched invoice source from aggregate response', () => {
    load({ ...invoice, document_uuid: doc2 });
    closed();
  });
  it('clears restricted line items and raw provenance on invoice fields 403', () => {
    load();
    c.changeTab('fields');
    http
      .expectOne(root + '/invoices/' + uuid + '/fields/')
      .flush({ detail: 'RESTRICTED_LINE' }, { status: 403, statusText: 'Forbidden' });
    closed();
    expect(text()).not.toContain('Verified service');
    expect(text()).not.toContain('RESTRICTED_LINE');
  });
  it('saves whole line set using supported correction contract', () => {
    load();
    c.openEdit('line_items');
    c.lineDraft[0].quantity = '3';
    c.reason = 'Verified quantity';
    c.saveCorrection();
    const req = correction();
    expect(JSON.parse(req.request.body.corrected_value)[0].quantity).toBe('3');
    expect(req.request.body.expected_revision).toBe(3);
    req.flush({});
  });
  it('uses JSON draft for source-verified rows when no lines were extracted', () => {
    load({ ...invoice, normalized: { ...invoice.normalized, line_items: [] } });
    c.openEdit('line_items');
    c.draft = JSON.stringify([{ description: 'Verified new row', quantity: '1' }]);
    c.reason = 'Source table checked';
    c.saveCorrection();
    const req = correction();
    expect(JSON.parse(req.request.body.corrected_value)[0].description).toBe('Verified new row');
    req.flush({});
  });
  it.each(['not json', '{}', '[{"quantity":2}]', '[{"unexpected":"secret"}]'])(
    'rejects invalid line correction %s',
    (draft) => {
      load({ ...invoice, normalized: { line_items: [] } });
      c.openEdit('line_items');
      c.draft = draft;
      c.reason = 'Checked';
      c.saveCorrection();
      http.expectNone((r) => r.method === 'PATCH');
      expect(c.error()).toBeTruthy();
    },
  );
  it('supports keyboard navigation and selected tab relationships', () => {
    load();
    fixture.nativeElement
      .querySelector('[role=tab]')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    http.expectOne(root + '/invoices/' + uuid + '/outputs/').flush([]);
    text();
    expect(
      fixture.nativeElement.querySelector('[role=tab][aria-selected=true]').textContent.trim(),
    ).toBe('Output');
    expect(
      fixture.nativeElement.querySelector('[role=tabpanel]').getAttribute('aria-labelledby'),
    ).toBe('invoice-tab-output');
  });
  it.each(['light', 'dark'])(
    'renders summary and line/review controls in %s without hardcoded inline colors',
    (theme) => {
      document.documentElement.dataset['theme'] = theme;
      load();
      expect(text()).toContain('INR 110.00');
      c.changeTab('line_items');
      c.openEdit('line_items');
      text();
      expect(fixture.nativeElement.querySelector('input')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('[style*="background"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('[style*="color"]')).toBeNull();
    },
  );
  it('shows low-confidence attention only against a published server threshold', () => {
    fixture.componentRef.setInput('version', invoiceVersion);
    load();
    expect(c.confidenceThreshold()).toBe('0.85');
    expect(c.lowConfidenceFields()).toContain('invoice_number');
    expect(text()).toContain('Below the published extraction confidence threshold');
  });
  it('does not fabricate a low confidence cutoff when policy is unavailable', () => {
    load();
    expect(c.confidenceThreshold()).toBeNull();
    expect(c.lowConfidenceFields()).toEqual([]);
  });
  it('shows uncertain classification without inventing certainty', () => {
    load({ ...invoice, classification: { document_type: 'invoice', uncertain: true } });
    expect(text()).toContain('Uncertain classification');
  });
});
