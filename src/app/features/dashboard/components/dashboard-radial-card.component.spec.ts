import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { DashboardRadialCardComponent } from './dashboard-radial-card.component';

describe('DOCU-X dashboard composition ring', () => {
  it('shows only measured records with accessible values and stable percentages', () => {
    TestBed.configureTestingModule({imports: [DashboardRadialCardComponent]});
    const fixture = TestBed.createComponent(DashboardRadialCardComponent);
    fixture.componentRef.setInput('title', 'Document mix');
    fixture.componentRef.setInput('items', {invoice: 3, contract: 1, empty: 0});
    fixture.detectChanges();
    expect(fixture.componentInstance.total()).toBe(4);
    expect(fixture.componentInstance.segments().map(s => s.length)).toEqual([75, 25]);
    expect(fixture.nativeElement.querySelector('.composition__graphic').getAttribute('aria-label')).toContain('invoice: 3');
    expect(fixture.nativeElement.querySelectorAll('.composition__segment').length).toBe(2);
    fixture.destroy();
  });

  it('keeps empty datasets honest and groups only after five categories', () => {
    TestBed.configureTestingModule({imports: [DashboardRadialCardComponent]});
    const fixture = TestBed.createComponent(DashboardRadialCardComponent);
    fixture.componentRef.setInput('title', 'Processing pipeline');
    fixture.componentRef.setInput('items', {});
    fixture.detectChanges();
    expect(fixture.componentInstance.total()).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('No categorized records');
    fixture.componentRef.setInput('items', {a:1,b:1,c:1,d:1,e:1,f:1,g:1});
    fixture.detectChanges();
    expect(fixture.componentInstance.segments().length).toBe(6);
    expect(fixture.componentInstance.segments().at(-1)?.label).toBe('Other categories');
    expect(fixture.componentInstance.total()).toBe(7);
    fixture.destroy();
  });
});

describe('DOCU-X V5 category exploration', () => {
  it('reveals selected category share and supports clearing it', () => {
    TestBed.configureTestingModule({imports:[DashboardRadialCardComponent]});
    const fixture=TestBed.createComponent(DashboardRadialCardComponent);
    fixture.componentRef.setInput('title','Document categories');
    fixture.componentRef.setInput('items',{invoice:3,contract:1});
    fixture.detectChanges();
    const first=fixture.nativeElement.querySelector('.composition__legend-item') as HTMLButtonElement;
    expect(first.getAttribute('aria-pressed')).toBe('false');
    first.click();
    fixture.detectChanges();
    expect(first.getAttribute('aria-pressed')).toBe('true');
    expect(fixture.nativeElement.querySelector('.composition__center').textContent).toContain('75.0%');
    (fixture.nativeElement.querySelector('.composition__reset') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.activeSegment()).toBeNull();
    fixture.destroy();
  });
});

describe('DOCU-X V6 segmented radial explorer', () => {
  it('shows the selected segment and precise count alongside animated legend bars', () => {
    TestBed.configureTestingModule({imports:[DashboardRadialCardComponent]});
    const f=TestBed.createComponent(DashboardRadialCardComponent);
    f.componentRef.setInput('title','Document mix');
    f.componentRef.setInput('items',{invoice:6,contract:2});
    f.detectChanges();
    const legend=f.nativeElement.querySelector('.composition__legend-item') as HTMLButtonElement;
    expect(f.nativeElement.querySelectorAll('.composition__bar').length).toBe(2);
    legend.click();f.detectChanges();
    expect(f.nativeElement.querySelector('.composition__center').textContent).toContain('75.0%');
    expect(f.nativeElement.querySelector('.composition__center').textContent).toContain('6');
    f.destroy();
  });
});
