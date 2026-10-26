import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from '../../../../environments/environment';
import { WorkflowDefinitionDetailComponent } from './workflow-definition-detail.component';
import { DocumentGovernanceService } from '../../documents/services/document-governance.service';
import { DocumentRealtimeService } from '../../../core/realtime/document-realtime.service';
import { definition, doc, doc2, run, uuid, version } from '../workflow-test.fixtures';
describe('Published workflow and multi-document start', () => {
  let fixture: ComponentFixture<WorkflowDefinitionDetailComponent>;
  let c: WorkflowDefinitionDetailComponent;
  let http: HttpTestingController;
  let revoked: Subject<string>;
  const base = environment.apiBaseUrl;
  const url = `${base}/workflows/definitions/${uuid}`;
  function load(admin = true): void {
    http
      .expectOne(url + '/')
      .flush({ ...definition, capabilities: { ...definition.capabilities, administer: admin } });
    http.expectOne(url + '/versions/').flush([version]);
    http
      .expectOne((req) => req.url === base + '/documents/')
      .flush([
        { uuid: doc, title: 'First', document_type: 'contract', current_user_access: 'edit' },
        { uuid: doc2, title: 'Second', document_type: 'policy', current_user_access: 'review' },
        { uuid: 'view-only', title: 'Read only', current_user_access: 'view' },
      ]);
    fixture.detectChanges();
  }
  beforeEach(() => {
    revoked = new Subject();
    TestBed.configureTestingModule({
      imports: [WorkflowDefinitionDetailComponent],
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
          useValue: { changes$: new Subject(), memberships: () => of([]) },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(WorkflowDefinitionDetailComponent);
    c = fixture.componentInstance;
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });
  afterEach(() => {
    fixture.destroy();
    http.verify();
    vi.restoreAllMocks();
  });
  it('renders published version and safe graph without config prompts', () => {
    load();
    expect(fixture.nativeElement.textContent).toContain('Version 2');
    expect(fixture.nativeElement.textContent).toContain('Review documents');
    expect(fixture.nativeElement.textContent).toContain('Published versions are immutable');
    expect(fixture.nativeElement.textContent).not.toContain('assignment:{');
    http.expectNone((req) => req.method === 'PATCH');
  });
  it('hides administration without backend capability', () => {
    load(false);
    expect(fixture.nativeElement.textContent).not.toContain('Publish new version');
    expect(fixture.nativeElement.textContent).not.toContain('Deactivate');
    c.activate();
    http.expectNone(url + '/activation/');
  });
  it('filters documents without edit access and supports multiple selection', () => {
    load();
    expect(c.documents().length).toBe(2);
    c.toggle(doc, true);
    c.toggle(doc2, true);
    c.start();
    const req = http.expectOne(base + '/workflows/runs/');
    expect(req.request.body.documents).toEqual([doc, doc2]);
    expect(req.request.body.version).toBe(uuid);
    expect(req.request.body.company).toBeUndefined();
    req.flush(run);
  });
  it('blocks duplicate start clicks', () => {
    load();
    c.selected = [doc];
    c.start();
    c.start();
    const req = http.expectOne(base + '/workflows/runs/');
    req.flush(run);
    expect(c.pending()).toBe(false);
  });
  it('retains start idempotency key on retry of unchanged selection', () => {
    load();
    c.selected = [doc, doc2];
    c.start();
    const first = http.expectOne(base + '/workflows/runs/');
    const key = first.request.body.idempotency_key;
    first.error(new ProgressEvent('error'));
    c.start();
    const retry = http.expectOne(base + '/workflows/runs/');
    expect(retry.request.body.idempotency_key).toBe(key);
    retry.flush(run);
  });
  it('uses a new key for a changed submission', () => {
    load();
    c.selected = [doc];
    c.start();
    const first = http.expectOne(base + '/workflows/runs/');
    const key = first.request.body.idempotency_key;
    first.error(new ProgressEvent('error'));
    c.selected = [doc2];
    c.start();
    const retry = http.expectOne(base + '/workflows/runs/');
    expect(retry.request.body.idempotency_key).not.toBe(key);
    retry.flush(run);
  });
  it('enforces version document types in selection UX', () => {
    load();
    c.versions.set([{ ...version, allowed_document_types: ['contract'] }]);
    expect(c.allowed(c.documents()[0])).toBe(true);
    expect(c.allowed(c.documents()[1])).toBe(false);
  });
  it('clears selected documents when access is revoked', () => {
    load();
    c.selected = [doc];
    revoked.next(doc);
    expect(c.selected).toEqual([]);
    expect(c.documents()).toEqual([]);
    http.expectOne(url + '/').flush({}, { status: 404, statusText: 'Not found' });
    expect(http.expectOne(url + '/versions/').cancelled).toBe(true);
  });
  it('clears selected protected documents when a start request loses access', () => {
    load();
    c.selected = [doc];
    c.start();
    http.expectOne(base + '/workflows/runs/').flush({}, { status: 403, statusText: 'Forbidden' });
    expect(c.selected).toEqual([]);
    expect(c.documents()).toEqual([]);
    expect(c.definition()).toBeNull();
  });
  it('uses server pagination metadata for document choices', () => {
    http.expectOne(url + '/').flush(definition);
    http.expectOne(url + '/versions/').flush([version]);
    http
      .expectOne((req) => req.url === base + '/documents/')
      .flush({
        count: 70,
        next: 'http://localhost:8000/api/documents/?page=2',
        previous: null,
        results: [],
      });
    expect(c.docsHasNext()).toBe(true);
    expect(c.docsHasPrevious()).toBe(false);
    c.loadDocuments(2);
    const req = http.expectOne((req) => req.url === base + '/documents/');
    expect(req.request.params.get('scope')).toBe('internal');
    expect(req.request.params.get('page')).toBe('2');
    req.flush({ count: 70, next: null, previous: 'page1', results: [] });
    expect(c.docsHasNext()).toBe(false);
  });
  it('uses only activation endpoint with permitted boolean', () => {
    load();
    c.activate();
    const req = http.expectOne(url + '/activation/');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ is_active: false });
    req.flush({ ...definition, is_active: false });
    expect(c.definition()?.is_active).toBe(false);
  });
  it('requires a nonempty input and respects 20 document maximum', () => {
    load();
    c.start();
    http.expectNone(base + '/workflows/runs/');
    c.selected = Array.from({ length: 21 }, (_, i) => String(i));
    c.start();
    http.expectNone(base + '/workflows/runs/');
  });
  function loadInvoice(): void {
    http.expectOne(url + '/').flush({ ...definition, workflow_type: 'invoice' });
    http.expectOne(url + '/versions/').flush([version]);
    http
      .expectOne((req) => req.url === base + '/documents/')
      .flush([
        { uuid: doc, title: 'Invoice A', status: 'ready', current_user_access: 'edit' },
        { uuid: doc2, title: 'Invoice B', status: 'processing', current_user_access: 'edit' },
      ]);
    fixture.detectChanges();
  }
  it('starts invoice through generic API with a single ready source and stable key', () => {
    loadInvoice();
    expect(c.allowed(c.documents()[0])).toBe(true);
    expect(c.allowed(c.documents()[1])).toBe(false);
    c.toggle(doc, true);
    c.start();
    const first = http.expectOne(base + '/workflows/runs/');
    const key = first.request.body.idempotency_key;
    expect(first.request.body.documents).toEqual([doc]);
    first.error(new ProgressEvent('error'));
    c.start();
    const retry = http.expectOne(base + '/workflows/runs/');
    expect(retry.request.body.idempotency_key).toBe(key);
    retry.flush({ ...run, documents: [doc] });
  });
  it('invoice selection replaces previous source instead of combining documents', () => {
    loadInvoice();
    c.toggle(doc, true);
    c.toggle(doc2, true);
    expect(c.selected).toEqual([doc2]);
  });
  it('rejects more than one invoice source even for manipulated local selection', () => {
    loadInvoice();
    c.selected = [doc, doc2];
    c.start();
    http.expectNone(base + '/workflows/runs/');
  });
  it('invoice uses radio source selection and upload link without generic graph publisher', () => {
    loadInvoice();
    expect(fixture.nativeElement.querySelector('input[type=radio]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('a[href="/documents/internal"]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).not.toContain('Publish new version');
  });
});
