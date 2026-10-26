import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkflowFindingComponent } from './workflow-finding.component';
import { WorkflowStatusComponent } from './workflow-status.component';
import { WorkflowAssignmentComponent } from './workflow-assignment.component';
import { WorkflowPublisherComponent } from './workflow-publisher.component';
import { finding, page, uuid, version } from '../workflow-test.fixtures';
import { Membership } from '../../documents/models/governance.model';
import { notificationPath } from '../models/notification.model';
import { environment } from '../../../../environments/environment';
const m: Membership = {
  uuid,
  user: 7,
  user_email: 'reviewer@company.local',
  username: 'reviewer',
  department: 3,
  department_name: 'Legal',
  role: 'reviewer',
  is_active: true,
};
afterEach(() => {
  TestBed.resetTestingModule();
  document.documentElement.removeAttribute('data-theme');
});
describe('Reusable workflow presentation', () => {
  it('renders generic finding confidence as an estimate and escaped evidence', () => {
    const f = TestBed.createComponent(WorkflowFindingComponent);
    f.componentRef.setInput('finding', finding);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Model confidence: 70%');
    expect(f.nativeElement.textContent).toContain('estimate requiring review');
    expect(f.nativeElement.textContent).toContain('Source / evidence');
    expect(f.nativeElement.querySelector('button')).toBeNull();
  });
  it('uses text for every run and step status', () => {
    const f = TestBed.createComponent(WorkflowStatusComponent);
    for (const s of [
      'draft',
      'queued',
      'processing',
      'review_required',
      'approval_required',
      'approved',
      'rejected',
      'exception',
      'completed',
      'failed',
      'cancelled',
      'pending',
      'running',
      'skipped',
      'waiting',
    ]) {
      f.componentRef.setInput('status', s);
      f.detectChanges();
      expect(f.nativeElement.textContent.toLowerCase()).toContain(s.replaceAll('_', ' '));
    }
  });
  it.each(['light', 'dark'])(
    'renders finding and statuses in %s theme without inline colors',
    (theme) => {
      document.documentElement.dataset['theme'] = theme;
      const f = TestBed.createComponent(WorkflowFindingComponent);
      f.componentRef.setInput('finding', finding);
      f.detectChanges();
      expect(f.nativeElement.querySelector('article.card')).toBeTruthy();
      expect(f.nativeElement.querySelector('[style*="color"]')).toBeNull();
      expect(f.nativeElement.textContent).toContain('Possible risk');
    },
  );
  it('assignment emits only directory principals and rejects arbitrary IDs', () => {
    const f = TestBed.createComponent(WorkflowAssignmentComponent);
    f.componentRef.setInput('memberships', [m, { ...m, uuid: 'inactive', is_active: false }]);
    const changed = vi.spyOn(f.componentInstance.changed, 'emit');
    f.detectChanges();
    expect(f.nativeElement.textContent).not.toContain('inactive');
    f.componentInstance.select('user:' + uuid);
    expect(changed).toHaveBeenLastCalledWith({ user: 7 });
    f.componentInstance.select('group:' + uuid);
    expect(changed).toHaveBeenLastCalledWith({ department: 3, role: 'reviewer' });
    f.componentInstance.select('department:' + uuid);
    expect(changed).toHaveBeenLastCalledWith({ department: 3 });
    f.componentInstance.select('user:123456');
    expect(changed).toHaveBeenLastCalledWith(null);
  });
  it('routes system workflow notifications using protected resource UUID', () => {
    const n = {
      uuid,
      notification_type: 'system',
      status: 'unread',
      priority: 'normal',
      title: 'Workflow update',
      message: 'Review',
      resource_type: 'workflow_run',
      resource_uuid: uuid,
      action_url: 'https://evil.invalid',
      metadata: { event: 'review_required' },
      created_at: '',
    };
    expect(notificationPath(n)).toBe('/workflows/runs/' + uuid);
    expect(notificationPath({ ...n, resource_uuid: '../../external' })).toBeNull();
    expect(notificationPath({ ...n, resource_type: 'unknown' })).toBeNull();
  });
});
describe('Version publication', () => {
  it('publishes a new immutable version through real endpoint and prevents duplicate request', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const f = TestBed.createComponent(WorkflowPublisherComponent);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne((req) => req.url.endsWith('/extraction-templates/')).flush(page([]));
    f.componentRef.setInput('definition', uuid);
    const c = f.componentInstance;
    c.steps[0].name = 'Done';
    c.steps[0].type = 'terminal';
    c.reviewed = true;
    c.publish();
    c.publish();
    const req = http.expectOne(`${environment.apiBaseUrl}/workflows/definitions/${uuid}/versions/`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.steps[0]).toMatchObject({
      step_type: 'terminal',
      configuration: { status: 'completed' },
    });
    expect(req.request.body).not.toHaveProperty('uuid');
    req.flush(version);
    http.verify();
  });
  it('blocks publication without explicit graph review', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const f = TestBed.createComponent(WorkflowPublisherComponent);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne((req) => req.url.endsWith('/extraction-templates/')).flush(page([]));
    f.componentRef.setInput('definition', uuid);
    f.componentInstance.publish();
    http.expectNone((req) => req.method === 'POST');
    http.verify();
  });
});
