import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { actionToastInterceptor, SILENT_ACTION_TOAST } from './action-toast.interceptor';
import { ToastService } from './toast.service';
import { environment } from '../../../environments/environment';

describe('Action toast interceptor', () => {
  let http: HttpClient;
  let mock: HttpTestingController;
  let toasts: ToastService;
  const base = environment.apiBaseUrl;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(withInterceptors([actionToastInterceptor])), provideHttpClientTesting(),
    ] });
    http = TestBed.inject(HttpClient);
    mock = TestBed.inject(HttpTestingController);
    toasts = TestBed.inject(ToastService);
  });
  afterEach(() => { mock.verify(); for (const toast of toasts.messages()) toasts.dismiss(toast.id); TestBed.resetTestingModule(); });

  it('reports document, workflow and approval mutations', () => {
    for (const url of [base + '/documents/', base + '/workflows/runs/', base + '/approvals/abc/approve/']) {
      http.post(url, {}).subscribe();
      mock.expectOne(url).flush({});
      expect(toasts.messages().at(-1)?.kind).toBe('success');
    }
    expect(toasts.messages().map((toast) => toast.message)).toEqual([
      'Document uploaded. Processing has started.', 'Workflow started.', 'Approval completed.',
    ]);
  });

  it('ignores reads, chat and opted-out operations', () => {
    http.get(base + '/documents/').subscribe(); mock.expectOne(base + '/documents/').flush([]);
    http.post(base + '/ai/conversations/', {}).subscribe(); mock.expectOne(base + '/ai/conversations/').flush({});
    http.patch(base + '/documents/abc/', {}, { context: new HttpContext().set(SILENT_ACTION_TOAST, true) }).subscribe();
    mock.expectOne(base + '/documents/abc/').flush({});
    expect(toasts.messages()).toEqual([]);
  });

  it('reports external-document and notification actions without toasting chat sends', () => {
    http.post(base + '/ai/external-documents/', {}).subscribe();
    mock.expectOne(base + '/ai/external-documents/').flush({});
    http.post(base + '/notifications/mark-all-read/', {}).subscribe();
    mock.expectOne(base + '/notifications/mark-all-read/').flush({});
    http.post(base + '/ai/chat/', {}).subscribe();
    mock.expectOne(base + '/ai/chat/').flush({});
    expect(toasts.messages().map((toast) => toast.message)).toEqual([
      'External document uploaded.', 'Notifications updated.',
    ]);
  });

  it('uses specific messages for HR draft saves', () => {
    http.post(base + '/workflows/hr-policies/policy-1/draft/', {}).subscribe();
    mock.expectOne(base + '/workflows/hr-policies/policy-1/draft/').flush({});
    expect(toasts.messages()[0].message).toBe('HR policy draft saved.');
  });

  it('reports a permission failure without treating it as success', () => {
    http.patch(base + '/workflows/runs/abc/', {}).subscribe({ error: () => undefined });
    mock.expectOne(base + '/workflows/runs/abc/').flush({ detail: 'private data' }, { status: 403, statusText: 'Forbidden' });
    expect(toasts.messages().map((toast) => [toast.kind, toast.message])).toEqual([
      ['error', 'You do not have permission to complete this action.'],
    ]);
  });
});
