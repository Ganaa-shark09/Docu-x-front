import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DashboardPageComponent } from './dashboard-page.component';

const overview = {
  generated_at: '2026-10-26T08:00:00Z',
  documents: { total_documents: 7, ai_ready_documents: 3, indexed_documents: 3, failed_documents: 0,
    by_status: { ready: 3 }, by_type: { invoice: 7 }, by_sensitivity: { internal: 7 },
    uploads_by_day: { '2026-10-23': 1, '2026-10-24': 2, '2026-10-25': 0, '2026-10-26': 4 },
  },
  approvals: { total_approvals: 2, approved: 1, pending: 0, assigned_to_me: 0, by_status: {} },
  notifications: { unread_count: 0, total_notifications: 0 },
  extractions: { total_extraction_runs: 2, approved: 1, average_confidence: 0.9, review_required: 0, by_status: {} },
  rag_usage: { total_conversations: 4, total_ai_responses: 8, total_tokens: 120, total_prompt_tokens: 80, by_provider: {} },
};

describe('DOCU-X V4 executive dashboard metrics and chart integrity', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [DashboardPageComponent],
      providers: [provideHttpClient(),provideHttpClientTesting(),provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify({ignoreCancelled: true}));

  it('prevents repeat refresh while authorized dashboard requests are outstanding', () => {
    const f = TestBed.createComponent(DashboardPageComponent); f.detectChanges();
    const button = f.nativeElement.querySelector('.dash-refresh');
    expect(button.disabled).toBe(true);
    button.click();
    expect(http.match(r => r.url.includes('/dashboard/')).length).toBe(2);
    f.destroy();
  });

  it('shows exact server metrics, empty alerts, server trend, and action links', () => {
    const f = TestBed.createComponent(DashboardPageComponent);
    http.expectOne(r => r.url.includes('/dashboard/overview/')).flush(overview);
    http.expectOne(r => r.url.includes('/dashboard/recent-activity/')).flush({results: []});
    f.detectChanges();
    expect(f.nativeElement.querySelectorAll('app-metric-card').length).toBe(7);
    expect(f.nativeElement.querySelectorAll('app-dashboard-telemetry-chart').length).toBe(1);
    expect(f.nativeElement.textContent).toContain('Needs attention');
    expect(f.nativeElement.textContent).toContain('Portfolio intelligence');
    expect(f.nativeElement.textContent).toContain('Intake timeline');
    expect(f.nativeElement.textContent).not.toContain('Your workspace, in focus.');
    expect(f.nativeElement.querySelectorAll('app-dashboard-radial-card').length).toBe(3);
    expect(f.nativeElement.textContent).toContain('documents ready for AI');
    expect(f.nativeElement.querySelector('.v6-readiness__body').textContent).toContain('3');
    expect(f.nativeElement.querySelector('.v6-weekline').textContent).toContain('7');
    expect(f.nativeElement.querySelector('a[href="/notifications"]')).toBeTruthy();
    expect(f.nativeElement.querySelector('a[href="/approvals"]')).toBeTruthy();
    expect(f.nativeElement.textContent).not.toMatch(/revenue|spending|storage usage|model cost/i);
    expect(f.nativeElement.querySelector('.dash-refresh').disabled).toBe(false);
    f.componentInstance.setDays(7);
    f.detectChanges();
    expect(f.componentInstance.trendTotal()).toBe(7);
    expect(f.componentInstance.weeklyTotal()).toBe(7);
    expect(f.componentInstance.activeDays()).toBe(3);
    const running=f.nativeElement.querySelector('.dash-metric-switch button:nth-child(2)') as HTMLButtonElement;
    running.click(); f.detectChanges();
    expect(f.componentInstance.chartMetric()).toBe('cumulative');
    expect(running.getAttribute('aria-pressed')).toBe('true');
    f.destroy();
  });

  it('preserves the prior authorized snapshot on a temporary refresh failure', () => {
    const f = TestBed.createComponent(DashboardPageComponent);
    http.expectOne(r => r.url.includes('/dashboard/overview/')).flush(overview);
    http.expectOne(r => r.url.includes('/dashboard/recent-activity/')).flush({results: []});
    f.componentInstance.loadDashboard();
    http.expectOne(r => r.url.includes('/dashboard/overview/')).flush({}, {status:503,statusText:'Service unavailable'});
    http.expectOne(r => r.url.includes('/dashboard/recent-activity/')).flush({results: []});
    expect(f.componentInstance.overview()?.documents.total_documents).toBe(7);
    expect(f.componentInstance.errorMessage()).not.toBe('');
    f.destroy();
  });

  it('clears previously authorized metrics when access is revoked', () => {
    const f = TestBed.createComponent(DashboardPageComponent);
    http.expectOne(r => r.url.includes('/dashboard/overview/')).flush(overview);
    http.expectOne(r => r.url.includes('/dashboard/recent-activity/')).flush({results: []});
    f.componentInstance.loadDashboard();
    http.expectOne(r => r.url.includes('/dashboard/overview/')).flush({}, {status:403,statusText:'Forbidden'});
    http.expectOne(r => r.url.includes('/dashboard/recent-activity/')).flush({results: []});
    expect(f.componentInstance.overview()).toBeNull();
    expect(f.componentInstance.recentActivities()).toHaveLength(0);
    f.destroy();
  });

  it('shows an error, not invented fallback data, on first-load failure', () => {
    const f = TestBed.createComponent(DashboardPageComponent);
    http.expectOne(r => r.url.includes('/dashboard/overview/')).flush({}, {status:503,statusText:'Unavailable'});
    http.expectOne(r => r.url.includes('/dashboard/recent-activity/')).flush({results: []});
    f.detectChanges();
    expect(f.nativeElement.querySelectorAll('app-metric-card').length).toBe(0);
    expect(f.componentInstance.errorMessage()).not.toBe('');
    f.destroy();
  });
});

describe('DOCU-X V6 dashboard density and verified operational signals', () => {
  it('uses just one large chart and an exact seven-day intake sparkline', () => {
    TestBed.configureTestingModule({imports:[DashboardPageComponent],providers:[provideHttpClient(),provideHttpClientTesting(),provideRouter([])]});
    const http=TestBed.inject(HttpTestingController);
    const f=TestBed.createComponent(DashboardPageComponent);
    http.expectOne(r=>r.url.includes('/dashboard/overview/')).flush(overview);
    http.expectOne(r=>r.url.includes('/dashboard/recent-activity/')).flush({results:[]});
    f.detectChanges();
    expect(f.nativeElement.querySelectorAll('app-dashboard-telemetry-chart').length).toBe(1);
    expect(f.nativeElement.querySelectorAll('.v6-worklist__row').length).toBe(3);
    expect(f.nativeElement.querySelectorAll('.v6-spark__column').length).toBe(4);
    expect(f.componentInstance.attentionCount()).toBe(0);
    expect(f.componentInstance.weeklyAccessibleDescription()).toContain('2026-10-26 4');
    expect(f.nativeElement.textContent).not.toContain('Weekly throughput');
    expect(f.nativeElement.textContent).not.toContain('Intake & throughput');
    f.destroy();http.verify();
  });
});


describe('DOCU-X V9 readiness surfaces and operational hierarchy', () => {
  it('puts attention beside processing health, then portfolio, then the intake chart', () => {
    TestBed.configureTestingModule({imports:[DashboardPageComponent],providers:[provideHttpClient(),provideHttpClientTesting(),provideRouter([])]});
    const http=TestBed.inject(HttpTestingController);
    const fixture=TestBed.createComponent(DashboardPageComponent);
    http.expectOne(r=>r.url.includes('/dashboard/overview/')).flush(overview);
    http.expectOne(r=>r.url.includes('/dashboard/recent-activity/')).flush({results:[]});
    fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement;
    const operations=root.querySelector('.v9-operations-grid') as HTMLElement;
    expect(operations.querySelector('.v9-attention')).toBeTruthy();
    expect(operations.querySelector('.v9-health-panel')).toBeTruthy();
    expect(root.querySelectorAll('.v9-composition-grid app-dashboard-radial-card').length).toBe(3);
    expect(root.querySelectorAll('.v9-activity-grid app-dashboard-telemetry-chart').length).toBe(1);
    expect(root.querySelectorAll('.v9-healthmetrics app-metric-card').length).toBe(3);
    expect(root.textContent).toContain('Needs attention');
    expect(root.textContent).toContain('Processing health');
    expect(root.textContent).toContain('Portfolio intelligence');
    expect(root.textContent).toContain('Intake timeline');
    expect(Array.from(root.querySelectorAll('.v9-operations-grid,.v9-composition-grid,.v9-activity-grid'))
      .map(el=>el.className.split(' ').find(cls=>cls.startsWith('v9-'))))
      .toEqual(['v9-operations-grid','v9-composition-grid','v9-activity-grid']);
    expect(root.querySelectorAll('.v6-weekline').length).toBe(1);
    fixture.destroy();
    http.verify({ignoreCancelled:true});
  });
});
