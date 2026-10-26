import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { SourceProofPanelComponent } from './source-proof-panel.component';
import { DocumentGovernanceService } from '../documents/services/document-governance.service';
import { DocumentRealtimeService } from '../../core/realtime/document-realtime.service';
import { environment } from '../../../environments/environment';
describe('Source Proof authorized experience', () => {
  let f: ComponentFixture<SourceProofPanelComponent>,
    c: SourceProofPanelComponent,
    http: HttpTestingController;
  let revoked: Subject<unknown>, changed: Subject<unknown>;
  const id = '11111111-1111-4111-8111-111111111111';
  const base = environment.apiBaseUrl + '/workflows/';
  const row = {
    uuid: id,
    source: {
      uuid: id,
      kind: 'document',
      reference: id,
      identity: 'pin',
      pin: { documents: [{ document_uuid: id }] },
    },
    locator_type: 'text_offsets',
    locator: { page: 1, start: 0, end: 5 },
    precision: 'exact',
    method: 'capture',
    disclosure: 'internal',
    validity: 'valid',
    code: 'validated_source',
    captured_at: '2026-10-21T00:00:00Z',
    review_state: 'unreviewed',
    review_revision: 0,
    valid_from: null,
    valid_until: null,
    review_due_at: null,
  };
  beforeEach(() => {
    revoked = new Subject();
    changed = new Subject();
    TestBed.configureTestingModule({
      imports: [SourceProofPanelComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: DocumentGovernanceService, useValue: { changes$: changed } },
        {
          provide: DocumentRealtimeService,
          useValue: { revoked$: revoked, subscribeDocuments: vi.fn() },
        },
      ],
    });
    f = TestBed.createComponent(SourceProofPanelComponent);
    c = f.componentInstance;
    f.componentRef.setInput('contextUuid', id);
    http = TestBed.inject(HttpTestingController);
    f.detectChanges();
  });
  afterEach(() => {
    f.destroy();
    http.verify({ ignoreCancelled: true });
  });
  function context(data = { claims: [], evidence: [row], next: false, previous: false }) {
    c.toggle();
    const req = http.expectOne((r) => r.url === base + 'proof-claims/context/');
    expect(req.request.params.get('run_uuid')).toBe(id);
    req.flush(data);
    f.detectChanges();
  }
  it('does not request protected content before opening', () => {
    http.expectNone((r) => r.url.includes('proof-claims'));
    expect(f.nativeElement.textContent).toContain('Inspect proof');
  });
  it('renders authorized evidence and source navigation', () => {
    context();
    c.openEvidence(id);
    http
      .expectOne(base + 'evidence/' + id + '/citation/')
      .flush({ ...row, excerpt: 'Total', documents: [{ uuid: id, title: 'Invoice source' }] });
    f.detectChanges();
    expect(f.nativeElement.querySelector('blockquote').textContent).toBe('Total');
    expect(f.nativeElement.querySelector('a').getAttribute('href')).toBe('/documents/detail/' + id);
    expect(f.nativeElement.textContent).toContain('Verified source');
  });
  it.each(['stale', 'invalid', 'expired', 'insufficient'])(
    'withholds an excerpt for %s evidence even if a response includes text',
    (validity) => {
      context();
      c.openEvidence(id);
      http
        .expectOne(base + 'evidence/' + id + '/citation/')
        .flush({ ...row, validity, excerpt: 'Do not show', documents: [] });
      f.detectChanges();
      expect(f.nativeElement.querySelector('blockquote')).toBeNull();
      expect(f.nativeElement.textContent).toContain('excerpt is withheld');
    },
  );
  it.each([401, 403, 404])('clears all proof on protected response %s', (status) => {
    context();
    c.openEvidence(id);
    http
      .expectOne(base + 'evidence/' + id + '/citation/')
      .flush({}, { status, statusText: 'Unavailable' });
    f.detectChanges();
    expect(c.context()).toBeNull();
    expect(c.citation()).toBeNull();
    expect(c.denied()).toBe(true);
    expect(f.nativeElement.querySelector('a')).toBeNull();
  });
  it('offers retry after API failure', () => {
    c.toggle();
    http
      .expectOne((r) => r.url.endsWith('/context/'))
      .flush({}, { status: 500, statusText: 'Error' });
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Please retry');
    c.load();
    http
      .expectOne((r) => r.url.endsWith('/context/'))
      .flush({ claims: [], evidence: [], next: false, previous: false });
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('No stored evidence');
  });
  it('cancels stale context requests on input changes', () => {
    c.toggle();
    const old = http.expectOne((r) => r.url.endsWith('/context/'));
    f.componentRef.setInput('contextUuid', '22222222-2222-4222-8222-222222222222');
    f.detectChanges();
    expect(old.cancelled).toBe(true);
    expect(c.context()).toBeNull();
    expect(c.opened()).toBe(false);
  });
  it('clears proof and cancels requests immediately on revocation', () => {
    context();
    c.openEvidence(id);
    const req = http.expectOne(base + 'evidence/' + id + '/citation/');
    revoked.next({});
    f.detectChanges();
    expect(req.cancelled).toBe(true);
    expect(c.context()).toBeNull();
    expect(c.denied()).toBe(true);
  });
  it('renders claim revisions and missing support honestly', () => {
    context();
    c.openClaim(id);
    http.expectOne(base + 'proof-claims/' + id + '/').flush({
      claim_uuid: id,
      current_revision: 1,
      coverage: 'unsupported',
      purpose: 'traceability',
      claims: [
        {
          uuid: id,
          claim_uuid: id,
          domain: 'invoice',
          key: 'total',
          revision: 1,
          value: '500',
          review_state: 'unreviewed',
          reason: null,
          created_at: row.captured_at,
          evidence: [],
          previous_uuid: null,
          derivation: null,
        },
      ],
      evidence: [],
    });
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('500');
    expect(f.nativeElement.textContent).toContain('No supporting evidence');
    expect(f.nativeElement.textContent).toContain('Unsupported');
  });
  it('uses document context without duplicate navigation routes', () => {
    f.componentRef.setInput('kind', 'document');
    f.detectChanges();
    c.toggle();
    const req = http.expectOne((r) => r.url.endsWith('/context/'));
    expect(req.request.params.get('document_uuid')).toBe(id);
    expect(req.request.params.has('run_uuid')).toBe(false);
    req.flush({ claims: [], evidence: [], next: false, previous: false });
  });
  it('cancels obsolete evidence and history requests', () => {
    context();
    c.openEvidence(id);
    const old = http.expectOne(base + 'evidence/' + id + '/citation/');
    c.openEvidence('new');
    expect(old.cancelled).toBe(true);
    http.expectOne(base + 'evidence/new/citation/').flush({ ...row, documents: [], excerpt: null });
    c.loadHistory();
    const h = http.expectOne((r) => r.url.endsWith('/history/'));
    c.loadHistory(2);
    expect(h.cancelled).toBe(true);
    http
      .expectOne((r) => r.url.endsWith('/history/'))
      .flush({ results: [], next: null, previous: null, count: 0 });
  });
  it.each(['light', 'dark'])(
    'keeps semantic content and focus controls under %s theme',
    (theme) => {
      document.documentElement.setAttribute('data-theme', theme);
      context();
      expect(f.nativeElement.querySelector('h2').textContent).toContain('Source Proof');
      expect(f.nativeElement.querySelector('button').getAttribute('aria-expanded')).toBe('true');
      document.documentElement.removeAttribute('data-theme');
    },
  );
  it('builds only the explicitly selected server-provided native field', () => {
    c.toggle();
    http
      .expectOne((r) => r.url.endsWith('/context/'))
      .flush({
        claims: [],
        evidence: [],
        next: false,
        previous: false,
        output_fields: [
          { kind: 'invoice_output', source_uuid: id, path: ['invoice', 'grand_total'] },
        ],
      });
    f.detectChanges();
    http.expectNone((r) => r.method === 'POST');
    c.outputIndex = 99;
    c.build();
    http.expectNone((r) => r.method === 'POST');
    c.outputIndex = 0;
    c.build();
    const req = http.expectOne(base + 'proof-claims/output/');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      kind: 'invoice_output',
      source_uuid: id,
      path: ['invoice', 'grand_total'],
    });
    req.flush({
      claim_uuid: id,
      current_revision: 1,
      coverage: 'unsupported',
      purpose: 'traceability',
      claims: [],
      evidence: [],
    });
    expect(c.graph()?.coverage).toBe('unsupported');
  });
  it('does not expose stale claim responses after selecting another claim', () => {
    context();
    c.openClaim('old');
    const old = http.expectOne(base + 'proof-claims/old/');
    c.openClaim(id);
    expect(old.cancelled).toBe(true);
    http.expectOne(base + 'proof-claims/' + id + '/').flush({
      claim_uuid: id,
      current_revision: 1,
      coverage: 'unsupported',
      purpose: 'traceability',
      claims: [],
      evidence: [],
    });
    expect(c.graph()?.claim_uuid).toBe(id);
  });
  it('renders excerpt text safely without treating it as markup', () => {
    context();
    c.openEvidence(id);
    http
      .expectOne(base + 'evidence/' + id + '/citation/')
      .flush({ ...row, excerpt: '<img src=x onerror=alert(1)>', documents: [] });
    f.detectChanges();
    expect(f.nativeElement.querySelector('img')).toBeNull();
    expect(f.nativeElement.querySelector('blockquote').textContent).toContain('<img');
  });
  it('cancels hidden proof requests and revalidates on reopen', () => {
    context();
    c.openEvidence(id);
    const req = http.expectOne(base + 'evidence/' + id + '/citation/');
    c.toggle();
    expect(req.cancelled).toBe(true);
    expect(c.context()).toBeNull();
    expect(c.opened()).toBe(false);
    c.toggle();
    http
      .expectOne((r) => r.url.endsWith('/context/'))
      .flush({ claims: [], evidence: [], next: false, previous: false });
  });
  it('registers source documents for immediate revocation notifications', () => {
    context();
    expect(TestBed.inject(DocumentRealtimeService).subscribeDocuments).toHaveBeenCalledWith([id]);
  });
  it('identifies the cited document within a multi-document source', () => {
    const citation = {
      ...row,
      locator: { document_uuid: id },
      documents: [
        { uuid: 'other', title: 'Other document' },
        { uuid: id, title: 'Cited document' },
      ],
      excerpt: 'Text',
    };
    expect(c.sourceDocuments(citation as any)).toEqual([{ uuid: id, title: 'Cited document' }]);
  });
});
