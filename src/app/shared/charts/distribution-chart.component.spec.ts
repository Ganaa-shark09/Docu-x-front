import { TestBed } from '@angular/core/testing';
import { describe, it, expect } from 'vitest';
import { DistributionChartComponent } from './distribution-chart.component';
describe('Dashboard chart data semantics', () => {
  it('keeps daily uploads in calendar order rather than sorting by count', () => {
    const f = TestBed.createComponent(DistributionChartComponent);
    f.componentRef.setInput('kind', 'line');
    f.componentRef.setInput('items', { '2026-10-21': 1, '2026-10-19': 12, '2026-10-20': 0 });
    expect(f.componentInstance.rows().map((r) => r.key)).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
    ]);
    expect(f.componentInstance.rows().map((r) => r.value)).toEqual([12, 0, 1]);
    f.destroy();
  });
  it('retains actual category counts and a keyboard-accessible source-values disclosure', () => {
    const f = TestBed.createComponent(DistributionChartComponent);
    f.componentRef.setInput('items', { invoice: 5, contract: 2 });
    f.detectChanges();
    expect(f.nativeElement.querySelector('details').open).toBe(false);
    expect(f.nativeElement.querySelector('summary').textContent).toContain('View source values');
    expect(f.componentInstance.rows().map((r) => r.value)).toEqual([5, 2]);
    f.destroy();
  });
});
