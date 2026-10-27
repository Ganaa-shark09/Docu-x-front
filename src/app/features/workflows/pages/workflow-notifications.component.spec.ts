import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { WorkflowNotificationsComponent } from './workflow-notifications.component';

describe('Document-safe notification center', () => {
  let http: HttpTestingController;
  const base = environment.apiBaseUrl + '/notifications/';
  const id = '11111111-1111-4111-8111-111111111111';
  const sample = {
    uuid: id, title: 'Invoice review required', message: 'Review this invoice',
    status: 'unread', priority: 'high', notification_type: 'workflow',
    resource_type: 'workflow_run', resource_uuid: id, action_url: '',
    created_at: '2026-10-19T12:00:00Z', metadata: {},
  };
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [WorkflowNotificationsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('only renders backend data and links to allowlisted resources', () => {
    const f = TestBed.createComponent(WorkflowNotificationsComponent);
    http.expectOne((r) => r.url === base).flush({ results: [sample], next: null, previous: null });
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Invoice review required');
    expect(f.nativeElement.querySelector(`a[href="/workflows/runs/${id}"]`)).toBeTruthy();
    f.destroy();
  });
  it('applies real unread filters and server-authoritative mark read', () => {
    const f = TestBed.createComponent(WorkflowNotificationsComponent);
    http.expectOne((r) => r.url === base).flush({ results: [sample], next: null, previous: null });
    f.componentInstance.filter('unread');
    const request = http.expectOne((r) => r.url === base);
    expect(request.request.params.get('status')).toBe('unread');
    request.flush({ results: [sample], next: null, previous: null });
    f.componentInstance.mark(sample);
    http.expectOne(base + id + '/mark-read/').flush({ status: 'read' });
    http.expectOne((r) => r.url === base).flush({ results: [{ ...sample, status: 'read' }], next: null, previous: null });
    expect(f.componentInstance.result()?.results[0].status).toBe('read');
    f.destroy();
  });
});


describe('DOCU-X V5 private notification search', () => {
  it('searches only the current authorized page without new API reads', () => {
    TestBed.configureTestingModule({imports:[WorkflowNotificationsComponent],
      providers:[provideHttpClient(),provideHttpClientTesting(),provideRouter([])]});
    const http=TestBed.inject(HttpTestingController);
    const fixture=TestBed.createComponent(WorkflowNotificationsComponent);
    http.expectOne(r=>r.url===environment.apiBaseUrl+'/notifications/').flush({
      results:[
        {uuid:'1',title:'Invoice requires review',message:'Check invoice',status:'unread',priority:'high',notification_type:'workflow',created_at:'2026-10-18T12:00:00Z'},
        {uuid:'2',title:'Contract completed',message:'Done',status:'read',priority:'normal',notification_type:'workflow',created_at:'2026-10-19T12:00:00Z'},
      ],next:null,previous:null,count:2,
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.notification-v3__group-heading').length).toBe(2);
    fixture.componentInstance.setQuery('invoice');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.notification-v3__item').length).toBe(1);
    expect(fixture.nativeElement.textContent).not.toContain('Contract completed');
    http.verify();
    fixture.destroy();
  });
});

describe('DOCU-X V6 glass inbox information hierarchy', () => {
  it('preserves priority, read state and permission-scoped navigation', () => {
    TestBed.configureTestingModule({imports:[WorkflowNotificationsComponent],
      providers:[provideHttpClient(),provideHttpClientTesting(),provideRouter([])]});
    const http=TestBed.inject(HttpTestingController);
    const fixture=TestBed.createComponent(WorkflowNotificationsComponent);
    http.expectOne(r=>r.url===environment.apiBaseUrl+'/notifications/').flush({
      results:[{uuid:'11111111-1111-4111-8111-111111111111',title:'Review required',
        message:'Please review this case',status:'unread',priority:'high',notification_type:'workflow',
        resource_type:'workflow_run',resource_uuid:'11111111-1111-4111-8111-111111111111',
        created_at:'2026-10-26T10:00:00Z',metadata:{}}],next:null,previous:null,
    });
    fixture.detectChanges();
    const item=fixture.nativeElement.querySelector('.notification-v3__item') as HTMLElement;
    expect(item.classList.contains('is-unread')).toBe(true);
    expect(item.classList.contains('is-important')).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('UNREAD');
    expect(fixture.nativeElement.querySelector('a[href="/workflows/runs/11111111-1111-4111-8111-111111111111"]')).toBeTruthy();
    fixture.destroy();http.verify();
  });
});
