import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationDrawerComponent } from './notification-drawer.component';
import { environment } from '../../../environments/environment';
describe('Real notification API drawer', () => {
  let f: ComponentFixture<NotificationDrawerComponent>,
    c: NotificationDrawerComponent,
    http: HttpTestingController;
  const close = vi.fn();
  const base = environment.apiBaseUrl + '/notifications/';
  const id = '11111111-1111-4111-8111-111111111111';
  const row = {
    uuid: id,
    title: 'Review required',
    message: 'Review the invoice',
    status: 'unread',
    resource_type: 'workflow_run',
    resource_uuid: id,
    notification_type: 'workflow',
    priority: 'normal',
    created_at: '2026-10-19T12:00:00Z',
    action_url: '',
    metadata: {},
  };
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [NotificationDrawerComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    f = TestBed.createComponent(NotificationDrawerComponent);
    c = f.componentInstance;
    http.expectOne((r) => r.url === base).flush({ results: [row], next: null });
    f.detectChanges();
  });
  afterEach(() => {
    f.destroy();
    http.verify({ ignoreCancelled: true });
    vi.restoreAllMocks();
  });
  it('renders backend titles and real read state', () => {
    expect(f.nativeElement.textContent).toContain('Review required');
    expect(c.rows()[0].status).toBe('unread');
  });
  it('filters unread records with a real query', () => {
    c.filter('unread');
    const req = http.expectOne((r) => r.url === base);
    expect(req.request.params.get('status')).toBe('unread');
    expect(req.request.params.get('page')).toBe('1');
    req.flush({ results: [], next: null });
  });
  it('marks a notification read then reloads authoritative state', () => {
    c.mark(row);
    http.expectOne(base + id + '/mark-read/').flush({ ...row, status: 'read' });
    http
      .expectOne((r) => r.url === base)
      .flush({ results: [{ ...row, status: 'read' }], next: null });
    expect(c.rows()[0].status).toBe('read');
  });
  it('prevents duplicate writes and handles errors with retry', () => {
    c.markAll();
    c.markAll();
    http.expectOne(base + 'mark-all-read/').flush({}, { status: 500, statusText: 'Error' });
    expect(c.busy()).toBe(false);
    expect(c.error()).toContain('retry');
  });
  it('navigates only through an allowlisted resource route', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    c.navigate(row);
    expect(navigate).toHaveBeenCalledWith('/workflows/runs/' + id);
    navigate.mockClear();
    c.navigate({ ...row, resource_uuid: '../../outside' });
    expect(navigate).not.toHaveBeenCalled();
  });
});
