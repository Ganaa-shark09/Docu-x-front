import { TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WORKFLOWS_ROUTES } from '../workflows.routes';
import { WorkflowHubComponent } from './workflow-hub.component';
import { WorkflowRunsComponent } from './workflow-runs.component';
import { DocumentGovernanceService } from '../../documents/services/document-governance.service';
import { DocumentRealtimeService } from '../../../core/realtime/document-realtime.service';
import { page, run, definition, uuid } from '../workflow-test.fixtures';
import { environment } from '../../../../environments/environment';

describe('Workflow navigation and queues', () => {
  afterEach(() => TestBed.resetTestingModule());
  it('opens the canonical hub and links existing history and filtered queues without duplicating lists', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'workflows', children: WORKFLOWS_ROUTES }])],
    });
    const harness = await RouterTestingHarness.create('/workflows');
    expect(harness.routeDebugElement?.componentInstance).toBeInstanceOf(WorkflowHubComponent);
    const host = harness.routeNativeElement!;
    expect(host.querySelector('a[href="/workflows/extractions"]')).toBeTruthy();
    expect(host.querySelector('a[href="/workflows/invoices"]')).toBeTruthy();
    expect(host.querySelector('a[href="/workflows/runs?status=review_required"]')).toBeTruthy();
    expect(host.querySelector('a[href="/workflows/runs?status=processing"]')).toBeTruthy();
    expect(host.querySelector('table')).toBeNull();
  });
  function setup(initial: Record<string, string> = {}) {
    const params = new BehaviorSubject(convertToParamMap(initial));
    const revoked = new Subject<string>();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { queryParamMap: params } },
        { provide: DocumentGovernanceService, useValue: { changes$: new Subject() } },
        {
          provide: DocumentRealtimeService,
          useValue: { revoked$: revoked, subscribeDocuments: vi.fn() },
        },
      ],
    });
    const fixture = TestBed.createComponent(WorkflowRunsComponent);
    const http = TestBed.inject(HttpTestingController);
    return { fixture, http, params, revoked };
  }
  const base = environment.apiBaseUrl;
  it('loads supported status and pagination from bookmarked query parameters', () => {
    const { fixture, http } = setup({ status: 'review_required', page: '2' });
    const request = http.expectOne((r) => r.url === base + '/workflows/runs/');
    expect(request.request.params.get('status')).toBe('review_required');
    expect(request.request.params.get('page')).toBe('2');
    request.flush(page([]));
    expect(fixture.componentInstance.page).toBe(2);
    http.verify();
  });
  it('cancels obsolete status requests and responds to Back/Forward query updates', () => {
    const { fixture, http, params } = setup({ status: 'queued' });
    const first = http.expectOne((r) => r.url === base + '/workflows/runs/');
    params.next(convertToParamMap({ status: 'processing' }));
    expect(first.cancelled).toBe(true);
    const latest = http.expectOne((r) => r.url === base + '/workflows/runs/');
    expect(latest.request.params.get('status')).toBe('processing');
    latest.flush(page([]));
    params.next(convertToParamMap({ status: 'queued' }));
    http.expectOne((r) => r.url === base + '/workflows/runs/').flush(page([]));
    expect(fixture.componentInstance.status).toBe('queued');
    http.verify();
  });
  it('clears protected results and cancels name lookups immediately on revocation', () => {
    const { fixture, http, revoked } = setup();
    http.expectOne((r) => r.url === base + '/workflows/runs/').flush(page([run]));
    const name = http.expectOne(base + '/workflows/definitions/' + uuid + '/');
    revoked.next('*');
    expect(name.cancelled).toBe(true);
    expect(fixture.componentInstance.result()).toBeNull();
    expect(fixture.componentInstance.names()).toEqual({});
    http.expectOne((r) => r.url === base + '/workflows/runs/').flush(page([]));
    http.verify();
  });
  it('does not forward unsupported filters or invalid pagination', () => {
    const { http } = setup({ status: 'made-up', page: '-3' });
    const request = http.expectOne((r) => r.url === base + '/workflows/runs/');
    expect(request.request.params.has('status')).toBe(false);
    expect(request.request.params.get('page')).toBe('1');
    request.flush(page([]));
    http.verify();
  });
});
