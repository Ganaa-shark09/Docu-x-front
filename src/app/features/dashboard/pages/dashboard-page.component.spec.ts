import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DashboardPageComponent } from './dashboard-page.component';
describe('Enterprise dashboard data integrity', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DashboardPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('preserves loading state and prevents repeated button submission', () => {
    const f = TestBed.createComponent(DashboardPageComponent);
    f.detectChanges();
    const button = f.nativeElement.querySelector('button');
    expect(button.disabled).toBe(true);
    button.click();
    expect(http.match((r) => r.url.includes('/dashboard/')).length).toBe(2);
    f.destroy();
  });
  it('renders only the actual returned metrics, including honest zero values', () => {
    const f = TestBed.createComponent(DashboardPageComponent);
    http
      .expectOne((r) => r.url.includes('/dashboard/overview/'))
      .flush({
        generated_at: '2026-10-19T08:00:00Z',
        documents: {
          total_documents: 7,
          ai_ready_documents: 3,
          indexed_documents: 3,
          failed_documents: 0,
          by_status: { ready: 3 },
          by_type: { invoice: 7 },
          by_sensitivity: { internal: 7 },
        },
        approvals: { pending: 0, assigned_to_me: 0, by_status: {} },
        notifications: { unread_count: 0, total_notifications: 0 },
        extractions: {
          total_extraction_runs: 2,
          approved: 1,
          average_confidence: 0.9,
          review_required: 0,
          by_status: {},
        },
        rag_usage: {
          total_conversations: 4,
          total_ai_responses: 8,
          total_tokens: 120,
          total_prompt_tokens: 80,
          by_provider: {},
        },
      });
    http.expectOne((r) => r.url.includes('/dashboard/recent-activity/')).flush({ results: [] });
    f.detectChanges();
    expect(f.nativeElement.querySelectorAll('app-metric-card').length).toBe(8);
    expect(f.nativeElement.querySelector('app-metric-card').textContent).toContain('7');
    expect(f.nativeElement.textContent).not.toMatch(/revenue|spending|storage usage|model cost/i);
    expect(f.nativeElement.querySelector('button').disabled).toBe(false);
    f.destroy();
  });
  it('shows an error instead of invented fallback metrics', () => {
    const f = TestBed.createComponent(DashboardPageComponent);
    http
      .expectOne((r) => r.url.includes('/overview/'))
      .flush({}, { status: 503, statusText: 'Unavailable' });
    http.expectOne((r) => r.url.includes('/recent-activity/')).flush({ results: [] });
    f.detectChanges();
    expect(f.nativeElement.querySelectorAll('app-metric-card').length).toBe(0);
    expect(f.componentInstance.errorMessage()).not.toBe('');
    expect(f.componentInstance.isLoading()).toBe(false);
    expect(f.nativeElement.querySelector('button').disabled).toBe(false);
    f.destroy();
  });
});
