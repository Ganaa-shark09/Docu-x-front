import { provideHttpClient, HttpErrorResponse } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowDefinitionsComponent } from './workflow-definitions.component';
import { WorkflowRunsComponent } from './workflow-runs.component';
import { DocumentGovernanceService } from '../../documents/services/document-governance.service';
import { DocumentRealtimeService } from '../../../core/realtime/document-realtime.service';
import { definition, page, run, uuid } from '../workflow-test.fixtures';
import { environment } from '../../../../environments/environment';
describe('Workflow list pages', () => {
  let http: HttpTestingController;
  const base = environment.apiBaseUrl;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: DocumentGovernanceService,
          useValue: { changes$: new Subject(), memberships: () => of([]) },
        },
        {
          provide: DocumentRealtimeService,
          useValue: { revoked$: new Subject(), subscribeDocuments: vi.fn() },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });
  it('renders paginated definitions and permits create for server profile company admin', () => {
    const f = TestBed.createComponent(WorkflowDefinitionsComponent);
    http.expectOne((req) => req.url === base + '/workflows/definitions/').flush(page([definition]));
    http.expectOne(base + '/auth/profile/').flush({ id: 1, role: 'company_admin' });
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Contract review');
    expect(f.componentInstance.canCreate()).toBe(true);
  });
  it('creates with real tenant-derived endpoint and no company ID', () => {
    const f = TestBed.createComponent(WorkflowDefinitionsComponent);
    http.expectOne((req) => req.url === base + '/workflows/definitions/').flush(page([]));
    http.expectOne(base + '/auth/profile/').flush({ id: 1, role: 'company_admin' });
    f.componentInstance.input = {
      name: 'Legal',
      code: 'legal',
      description: '',
      workflow_type: 'generic',
      department: null,
      is_active: true,
    };
    f.componentInstance.create();
    const req = http.expectOne(base + '/workflows/definitions/');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.company).toBeUndefined();
    req.flush({}, { status: 403, statusText: 'Forbidden' });
    expect(f.componentInstance.pending()).toBe(false);
  });
  it('renders empty state and hides create for regular member', () => {
    const f = TestBed.createComponent(WorkflowDefinitionsComponent);
    http.expectOne((req) => req.url === base + '/workflows/definitions/').flush(page([]));
    http.expectOne(base + '/auth/profile/').flush({ id: 1, role: 'member' });
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('No workflow definitions');
    expect(f.nativeElement.textContent).not.toContain('Create definition');
  });
  it('shows workflow creation to a superuser whose stored role is member', () => {
    const f = TestBed.createComponent(WorkflowDefinitionsComponent);
    http.expectOne((req) => req.url === base + '/workflows/definitions/').flush(page([]));
    http.expectOne(base + '/auth/profile/').flush({ id: 1, role: 'member', is_superuser: true });
    f.detectChanges();
    expect(f.componentInstance.canCreate()).toBe(true);
    expect(f.nativeElement.textContent).toContain('Create invoice workflow');
  });
  it('passes only backend-supported run status filter and page', () => {
    const f = TestBed.createComponent(WorkflowRunsComponent);
    http.expectOne((req) => req.url === base + '/workflows/runs/').flush(page([]));
    f.componentInstance.status = 'review_required';
    f.componentInstance.load(2);
    const req = http.expectOne((req) => req.url === base + '/workflows/runs/');
    expect(req.request.params.keys().sort()).toEqual(['page', 'status']);
    expect(req.request.params.get('page')).toBe('2');
    req.flush(page([run]));
    http.expectOne(base + `/workflows/definitions/${uuid}/`).flush(definition);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Review required');
    expect(f.nativeElement.textContent).toContain('Contract review');
  });
  it('renders actual array definitions and actionable empty state without useless pagination', () => {
    const f = TestBed.createComponent(WorkflowDefinitionsComponent);
    http.expectOne((req) => req.url === base + '/workflows/definitions/').flush([definition]);
    http.expectOne(base + '/auth/profile/').flush({ id: 1, role: 'company_admin' });
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Contract review');
    expect(f.nativeElement.querySelector('.pager')).toBeNull();
    expect(f.nativeElement.textContent).toContain('1 workflows on this page');
  });
  it('does not hide company-admin creation when assignment directory fails', () => {
    vi.spyOn(TestBed.inject(DocumentGovernanceService), 'memberships').mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 503 })),
    );
    const f = TestBed.createComponent(WorkflowDefinitionsComponent);
    http.expectOne((req) => req.url === base + '/workflows/definitions/').flush([]);
    http.expectOne(base + '/auth/profile/').flush({ id: 1, role: 'company_admin' });
    f.detectChanges();
    expect(f.componentInstance.canCreate()).toBe(true);
    expect(f.nativeElement.textContent).toContain('assignment directory could not be loaded');
    expect(f.nativeElement.querySelector('.workflow-empty-state button')).toBeTruthy();
  });
  it('makes creation forms mutually exclusive and blocks toggling during invoice submission', () => {
    const f = TestBed.createComponent(WorkflowDefinitionsComponent);
    http.expectOne((req) => req.url === base + '/workflows/definitions/').flush([]);
    http.expectOne(base + '/auth/profile/').flush({ id: 1, role: 'company_admin' });
    const c = f.componentInstance;
    c.toggleCreate('generic');
    expect(c.showCreate).toBe(true);
    c.toggleCreate('invoice');
    expect(c.showCreate).toBe(false);
    expect(c.showInvoiceCreate).toBe(true);
    c.invoiceCreating.set(true);
    c.toggleCreate('generic');
    c.load();
    expect(c.showInvoiceCreate).toBe(true);
    http.expectNone((req) => req.url === base + '/workflows/definitions/');
  });
});
