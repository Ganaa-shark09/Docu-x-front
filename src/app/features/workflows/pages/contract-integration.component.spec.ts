import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from '../../../../environments/environment';
import { WorkflowRunDetailComponent } from './workflow-run-detail.component';
import { WorkflowDefinitionDetailComponent } from './workflow-definition-detail.component';
import { WorkflowDefinitionsComponent } from './workflow-definitions.component';
import { DocumentGovernanceService } from '../../documents/services/document-governance.service';
import { DocumentRealtimeService } from '../../../core/realtime/document-realtime.service';
import { artifact, doc, doc2, finding, page, step, uuid } from '../workflow-test.fixtures';
import {
  contract,
  contractRun,
  contractDefinition,
  contractVersion,
} from '../contract-test.fixtures';
import { Run } from '../models/workflow.model';
const base = environment.apiBaseUrl,
  root = base + '/workflows',
  url = root + '/runs/' + uuid;
function providers() {
  return [
    provideHttpClient(),
    provideHttpClientTesting(),
    provideRouter([]),
    {
      provide: ActivatedRoute,
      useValue: {
        paramMap: of(convertToParamMap({ uuid })),
        snapshot: { queryParamMap: convertToParamMap({ type: 'contract_review' }) },
        queryParamMap: of(convertToParamMap({ type: 'contract_review' })),
      },
    },
    {
      provide: DocumentGovernanceService,
      useValue: { changes$: new Subject(), memberships: () => of([]) },
    },
    {
      provide: DocumentRealtimeService,
      useValue: { revoked$: new Subject(), subscribeDocuments: vi.fn() },
    },
  ];
}
describe('Contract integration with shared workflow controls', () => {
  let fixture: ComponentFixture<WorkflowRunDetailComponent>,
    c: WorkflowRunDetailComponent,
    http: HttpTestingController;
  function load(r: Run = contractRun, complete = true) {
    http.expectOne(url + '/').flush(structuredClone(r));
    http.expectOne(root + '/definitions/' + uuid + '/').flush(contractDefinition);
    http.expectOne(root + '/versions/' + uuid + '/').flush(contractVersion);
    http.expectOne(url + '/steps/').flush([step]);
    http.expectOne(url + '/findings/').flush([finding]);
    http.expectOne(url + '/exceptions/').flush([]);
    http.expectOne(url + '/comments/').flush([]);
    http.expectOne(url + '/artifacts/').flush([artifact]);
    fixture.detectChanges();
    http
      .expectOne(url + '/contract-review/')
      .flush({ ...contract, coverage: { ...contract.coverage, complete } });
    http
      .expectOne(base + '/documents/' + doc + '/')
      .flush({ uuid: doc, current_user_access: 'review' });
    fixture.detectChanges();
  }
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [WorkflowRunDetailComponent],
      providers: providers(),
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
  it('embeds contract workspace in existing run with findings and approval link', () => {
    load();
    expect(fixture.nativeElement.querySelector('app-contract-workspace')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('#workflow-findings')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('a[href^="/approvals/"]')).toBeTruthy();
  });
  it('submits review through generic command with revision and idempotency', () => {
    load();
    c.command({ action: 'accept', comment: 'Evidence checked' });
    c.command({ action: 'accept', comment: 'Evidence checked' });
    const req = http.expectOne(url + '/commands/');
    expect(req.request.body.expected_revision).toBe(3);
    expect(req.request.body.idempotency_key).toBeTruthy();
    req.flush({}, { status: 409, statusText: 'Conflict' });
    load();
  });
  it('incomplete contract evidence disables review acceptance', () => {
    load(contractRun, false);
    const button = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((b) => b.textContent?.includes('Accept review'));
    expect(button?.disabled).toBe(true);
    c.command({ action: 'accept', comment: '' });
    http.expectNone(url + '/commands/');
  });
  it('unsaved domain correction blocks parent review, findings and refresh', () => {
    load();
    c.invoicePending.set(true);
    c.command({ action: 'accept', comment: '' });
    c.reviewFinding(finding, 'accepted');
    c.load();
    http.expectNone(url + '/commands/');
    http.expectNone(url + '/');
  });
  it('finding decisions reuse existing endpoint and do not update optimistically', () => {
    load();
    c.reviewFinding(finding, 'accepted');
    expect(c.findings()[0].review_state).toBe('unreviewed');
    const req = http.expectOne(url + '/findings/' + uuid + '/review/');
    expect(req.request.body.status).toBe('accepted');
    req.flush({ ...finding, review_state: 'accepted' });
    expect(c.findings()[0].review_state).toBe('accepted');
  });
  it('approval uses existing workflow command with authoritative capability', () => {
    load({
      ...contractRun,
      status: 'approval_required',
      capabilities: { ...contractRun.capabilities, review: false, approve: true },
    });
    c.command({ action: 'approve', comment: 'Approved' });
    const req = http.expectOne(url + '/commands/');
    expect(req.request.body.action).toBe('approve');
    req.flush({}, { status: 409, statusText: 'Conflict' });
    load();
  });
  it('exception resolution reuses existing command', () => {
    load({
      ...contractRun,
      status: 'exception',
      capabilities: { ...contractRun.capabilities, resolve_exception: true },
    });
    c.resolution = 'Reviewed source';
    c.resolve({
      uuid,
      step_run: 1,
      category: 'validation',
      status: 'open',
      safe_message: 'Review required',
      owner: null,
      resolved_at: null,
      resolved_by: null,
      resolution: '',
    });
    const req = http.expectOne(url + '/commands/');
    expect(req.request.body.action).toBe('resolve_exception');
    req.flush({}, { status: 409, statusText: 'Conflict' });
    load();
  });
  it('domain access denial destroys workspace and clears generic protected content', () => {
    load();
    c.invoiceDenied('Contract access unavailable');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-contract-workspace')).toBeNull();
    expect(c.findings()).toEqual([]);
    expect(c.artifacts()).toEqual([]);
    expect(c.can('review')).toBe(false);
  });
});
describe('Contract single principal document start flow', () => {
  let fixture: ComponentFixture<WorkflowDefinitionDetailComponent>,
    c: WorkflowDefinitionDetailComponent,
    http: HttpTestingController;
  function load() {
    http.expectOne(root + '/definitions/' + uuid + '/').flush(contractDefinition);
    http.expectOne(root + '/definitions/' + uuid + '/versions/').flush([contractVersion]);
    http
      .expectOne((r) => r.url === base + '/documents/')
      .flush([
        {
          uuid: doc,
          title: 'Contract',
          document_type: 'contract',
          status: 'ready',
          current_user_access: 'review',
        },
        {
          uuid: doc2,
          title: 'Other',
          document_type: 'contract',
          status: 'processing',
          current_user_access: 'review',
        },
      ]);
    fixture.detectChanges();
  }
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [WorkflowDefinitionDetailComponent],
      providers: providers(),
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
  it('starts one contract with stable idempotency key through generic API', () => {
    load();
    c.toggle(doc, true);
    c.start();
    const first = http.expectOne(root + '/runs/');
    const key = first.request.body.idempotency_key;
    expect(first.request.body.documents).toEqual([doc]);
    first.error(new ProgressEvent('error'));
    c.start();
    const second = http.expectOne(root + '/runs/');
    expect(second.request.body.idempotency_key).toBe(key);
    second.flush(contractRun);
  });
  it('replaces selected principal document', () => {
    load();
    c.toggle(doc, true);
    c.toggle(doc2, true);
    expect(c.selected).toEqual([doc2]);
  });
  it('blocks manipulated multi-document selection', () => {
    load();
    c.selected = [doc, doc2];
    c.start();
    http.expectNone(root + '/runs/');
  });
  it('rejects processing documents in selection display', () => {
    load();
    expect(c.allowed(c.documents()[0])).toBe(true);
    expect(c.allowed(c.documents()[1])).toBe(false);
  });
  it('uses radio selection and protects canonical graph from generic publisher', () => {
    load();
    expect(fixture.nativeElement.querySelector('input[type="radio"]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).not.toContain('Publish new version');
  });
  it('blocks duplicate start while request pending', () => {
    load();
    c.selected = [doc];
    c.start();
    c.start();
    http.expectOne(root + '/runs/').flush(contractRun);
  });
});
describe('Contract workflow discovery', () => {
  let fixture: ComponentFixture<WorkflowDefinitionsComponent>,
    c: WorkflowDefinitionsComponent,
    http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [WorkflowDefinitionsComponent],
      providers: providers(),
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(WorkflowDefinitionsComponent);
    c = fixture.componentInstance;
    http
      .expectOne((r) => r.url === root + '/definitions/' && r.params.get('type') === 'contract_review')
      .flush(page([contractDefinition]));
    http.expectOne(base + '/auth/profile/').flush({ id: 1, role: 'company_admin' });
    fixture.detectChanges();
  });
  afterEach(() => {
    fixture.destroy();
    http.verify();
  });
  it('requests and renders contract definitions filtered by the backend', () => {
    expect(c.visibleDefinitions()).toHaveLength(1);
    expect(c.visibleDefinitions()[0].workflow_type).toBe('contract_review');
    expect(fixture.nativeElement.textContent).toContain('Contract review workflows');
  });
  it('uses one mutually exclusive creation form', () => {
    c.toggleCreate('contract');
    expect(c.showContractCreate()).toBe(true);
    expect(c.canCreate()).toBe(true);
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-contract-definition')).toBeTruthy();
    c.toggleCreate('invoice');
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-contract-definition')).toBeNull();
    expect(c.showInvoiceCreate).toBe(true);
  });
  it('closes contract factory after authorization denial', () => {
    c.toggleCreate('contract');
    c.invoiceDenied();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-contract-definition')).toBeNull();
    expect(c.canCreate()).toBe(false);
  });
});
