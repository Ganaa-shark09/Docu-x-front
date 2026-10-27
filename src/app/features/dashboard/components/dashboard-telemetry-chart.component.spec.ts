import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { DashboardTelemetryChartComponent } from './dashboard-telemetry-chart.component';

describe('DOCU-X safe wavy dashboard chart', () => {
  it('preserves exact backend upload counts and exposes keyboard-readable trend values', () => {
    TestBed.configureTestingModule({imports:[DashboardTelemetryChartComponent]});
    const fixture=TestBed.createComponent(DashboardTelemetryChartComponent);
    fixture.componentRef.setInput('items', {'2026-10-20':0,'2026-10-21':3,'2026-10-22':1});
    fixture.componentRef.setInput('days',7);
    fixture.detectChanges();
    expect(fixture.componentInstance.plotRows().map(row=>row.cumulative)).toEqual([0,3,4]);
    const chart=fixture.nativeElement.querySelector('.telemetry-plot') as SVGSVGElement;
    expect(chart.getAttribute('tabindex')).toBe('0');
    expect(chart.getAttribute('aria-label')).toContain('4 uploads total');
    expect(fixture.nativeElement.querySelector('table').textContent).toContain('2026-10-21');
    chart.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));
    fixture.detectChanges();
    expect(fixture.componentInstance.focusedPoint()?.count).toBe(1);
    fixture.destroy();
  });
  it('changes range and cumulative mode without inventing values or creating an ECharts instance', () => {
    TestBed.configureTestingModule({imports:[DashboardTelemetryChartComponent]});
    const fixture=TestBed.createComponent(DashboardTelemetryChartComponent);
    fixture.componentRef.setInput('items',{'2026-10-20':2,'2026-10-21':1,'2026-10-22':3});
    fixture.componentRef.setInput('days',7);
    fixture.detectChanges();
    fixture.componentRef.setInput('metric','cumulative');
    fixture.componentRef.setInput('days',14);
    fixture.detectChanges();
    expect(fixture.componentInstance.values()).toEqual([2,3,6]);
    expect(fixture.nativeElement.querySelector('.telemetry-wave')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('table').textContent).toContain('6');
    fixture.destroy();
  });
});
