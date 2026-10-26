import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect } from 'vitest';
import { RecentActivityListComponent } from './recent-activity-list.component';
import { RecentActivity } from '../models/dashboard.model';
const id = '11111111-1111-4111-8111-111111111111';
const row = (changes: Partial<RecentActivity> = {}): RecentActivity => ({
  type: 'document',
  title: 'ACME_Invoice_v2.pdf',
  message: 'Document uploaded: ACME_Invoice_v2.pdf',
  status: 'ready',
  created_at: '2026-10-21T10:00:00Z',
  resource_uuid: id,
  metadata: {},
  ...changes,
});
describe('Recent activity presentation and navigation', () => {
  function setup(rows: RecentActivity[]) {
    TestBed.configureTestingModule({
      imports: [RecentActivityListComponent],
      providers: [provideRouter([])],
    });
    const f = TestBed.createComponent(RecentActivityListComponent);
    f.componentRef.setInput('activities', rows);
    f.detectChanges();
    return f;
  }
  it('renders readable audit events once while preserving document names and case', () => {
    const f = setup([
      row(),
      row({
        type: 'audit',
        title: 'Finance audit scope_configured',
        message: 'Finance audit scope_configured',
        status: 'info',
      }),
    ]);
    expect(f.nativeElement.textContent).toContain('ACME_Invoice_v2.pdf');
    expect(f.nativeElement.textContent).toContain('Finance audit scope configured');
    expect(f.nativeElement.textContent).not.toContain('scope_configured');
    expect(f.nativeElement.querySelectorAll('.activity-copy p').length).toBe(1);
    expect(f.nativeElement.querySelector('.neutral').textContent).toContain('Recorded');
    f.destroy();
  });
  it('filters the loaded feed and resets progressive disclosure', async () => {
    const f = setup(
      Array.from({ length: 9 }, (_, i) => row({ type: i < 6 ? 'document' : 'approval' })),
    );
    const c = f.componentInstance;
    expect(c.visibleActivities.length).toBe(5);
    c.loadMore();
    expect(c.visibleActivities.length).toBe(9);
    const select = f.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value = 'approval';
    select.dispatchEvent(new Event('change'));
    await f.whenStable();
    expect(c.visibleActivities.length).toBe(3);
    expect(c.hasMoreActivities).toBe(false);
    select.value = 'audit';
    select.dispatchEvent(new Event('change'));
    await f.whenStable();
    expect(f.nativeElement.textContent).toContain('No matching activity in the loaded feed');
    f.destroy();
  });
  it('uses related record metadata for audit links, never the audit-log UUID', () => {
    const f = setup([]),
      c = f.componentInstance;
    expect(
      c.path(
        row({
          type: 'audit',
          metadata: { resource_type: 'workflow_run', related_resource_uuid: id },
        }),
      ),
    ).toBe('/workflows/runs/' + id);
    expect(
      c.path(
        row({
          type: 'audit',
          metadata: { resource_type: 'workflow_run', related_resource_uuid: '../../outside' },
        }),
      ),
    ).toBeNull();
    expect(
      c.path(
        row({ type: 'audit', metadata: { resource_type: 'unknown', related_resource_uuid: id } }),
      ),
    ).toBeNull();
    expect(c.path(row({ type: 'audit' }))).toBeNull();
    f.destroy();
  });
  it('shows actual empty state without fabricated rows or timestamps', () => {
    const f = setup([]);
    expect(f.nativeElement.textContent).toContain('No activity yet');
    expect(f.nativeElement.querySelector('time')).toBeNull();
    expect(f.nativeElement.querySelector('tbody')).toBeNull();
    f.destroy();
  });
  it('resets visible count on refresh and keeps read/info neutral', () => {
    const f = setup(Array.from({ length: 8 }, () => row()));
    f.componentInstance.loadMore();
    f.componentRef.setInput('activities', [row({ status: 'read' })]);
    f.detectChanges();
    expect(f.componentInstance.visibleCount).toBe(5);
    expect(f.nativeElement.querySelector('.neutral')).toBeTruthy();
    expect(f.componentInstance.statusClass('info')).toBe('neutral');
    f.destroy();
  });
});
