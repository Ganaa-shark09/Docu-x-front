import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
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


describe('DOCU-X V11 precise selection during numeric animation', () => {
  it('shows the selected record count immediately even when the total is still counting up', () => {
    TestBed.configureTestingModule({imports: [DashboardRadialCardComponent]});
    const fixture = TestBed.createComponent(DashboardRadialCardComponent);
    fixture.componentRef.setInput('title', 'Document mix');
    fixture.componentRef.setInput('items', {invoice: 6, contract: 2});
    fixture.detectChanges();
    const options = fixture.nativeElement.querySelectorAll('.composition__legend-item') as NodeListOf<HTMLButtonElement>;
    options[0].click();
    fixture.detectChanges();
    const centerValue = fixture.nativeElement.querySelector('.composition__center strong') as HTMLElement;
    expect(centerValue.textContent?.trim()).toBe('6');
    expect(centerValue.getAttribute('aria-label')).toBe('6 records');
    options[1].click();
    fixture.detectChanges();
    expect(centerValue.textContent?.trim()).toBe('2');
    expect(centerValue.getAttribute('aria-label')).toBe('2 records');
    fixture.destroy();
  });
});

describe('DOCU-X V11 SVG ring reveal and authoritative counts', () => {
  it('preserves exact arc lengths and recalculates proportions after a server update', () => {
    TestBed.configureTestingModule({imports: [DashboardRadialCardComponent]});
    const fixture = TestBed.createComponent(DashboardRadialCardComponent);
    fixture.componentRef.setInput('title', 'Portfolio');
    fixture.componentRef.setInput('items', {invoice:3, contract:1});
    fixture.detectChanges();
    const segments = Array.from(fixture.nativeElement.querySelectorAll('.composition__segment')) as SVGCircleElement[];
    expect(segments.length).toBe(2);
    expect(segments[0].style.getPropertyValue('--docux-ring-target')).toBe('75 25');
    expect(segments[1].style.getPropertyValue('--docux-ring-target')).toBe('25 75');
    expect(fixture.componentInstance.total()).toBe(4);
    fixture.componentRef.setInput('items', {invoice:1, contract:3});
    fixture.detectChanges();
    expect(fixture.componentInstance.segments()[0].key).toBe('contract');
    expect(fixture.componentInstance.total()).toBe(4);
    expect(fixture.nativeElement.querySelector('.composition__graphic').getAttribute('aria-label')).toContain('contract: 3');
    fixture.destroy();
  });
  it('clears previously rendered totals immediately on an empty authorized snapshot', () => {
    TestBed.configureTestingModule({imports: [DashboardRadialCardComponent]});
    const fixture = TestBed.createComponent(DashboardRadialCardComponent);
    fixture.componentRef.setInput('title', 'Pipeline');
    fixture.componentRef.setInput('items', {ready:8});
    fixture.detectChanges();
    fixture.componentRef.setInput('items', {});
    fixture.detectChanges();
    expect(fixture.componentInstance.total()).toBe(0);
    expect(fixture.componentInstance.displayCount()).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('.composition__segment').length).toBe(0);
    fixture.destroy();
  });
});


describe('DOCU-X V12 one-time viewport revolution', () => {
  it('makes one revolution after becoming visible, without replay on selection or refresh', () => {
    let enterViewport: (() => void) | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal('IntersectionObserver', class {
      constructor(private callback: IntersectionObserverCallback) {
        enterViewport = () => this.callback([{isIntersecting: true} as IntersectionObserverEntry], this as unknown as IntersectionObserver);
      }
      observe = observe;
      disconnect = disconnect;
    });
    try {
      TestBed.configureTestingModule({imports: [DashboardRadialCardComponent]});
      const fixture = TestBed.createComponent(DashboardRadialCardComponent);
      fixture.componentRef.setInput('title', 'Document mix');
      fixture.componentRef.setInput('items', {invoice: 6, contract: 2});
      fixture.detectChanges();
      const ring = fixture.nativeElement.querySelector('.composition__ring') as SVGElement;
      expect(ring.classList.contains('is-revolving')).toBe(false);
      expect(observe).toHaveBeenCalledOnce();
      enterViewport?.();
      fixture.detectChanges();
      expect(ring.classList.contains('is-revolving')).toBe(true);
      expect(fixture.componentInstance.spinStarted()).toBe(true);
      expect(disconnect).toHaveBeenCalledOnce();
      const legend = fixture.nativeElement.querySelector('.composition__legend-item') as HTMLButtonElement;
      legend.click();
      fixture.detectChanges();
      expect((fixture.nativeElement.querySelector('.composition__center strong') as HTMLElement).textContent?.trim()).toBe('6');
      fixture.componentRef.setInput('items', {invoice: 3, contract: 5});
      fixture.detectChanges();
      expect(fixture.componentInstance.spinStarted()).toBe(true);
      expect(ring.classList.contains('is-revolving')).toBe(true);
      expect(observe).toHaveBeenCalledTimes(1);
      fixture.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('starts once when data arrives after the card is visible, with exact non-animated counts', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    try {
      TestBed.configureTestingModule({imports: [DashboardRadialCardComponent]});
      const fixture = TestBed.createComponent(DashboardRadialCardComponent);
      fixture.componentRef.setInput('title', 'Processing pipeline');
      fixture.componentRef.setInput('items', {});
      fixture.detectChanges();
      expect(fixture.componentInstance.spinStarted()).toBe(false);
      fixture.componentRef.setInput('items', {ready: 4});
      fixture.detectChanges();
      expect(fixture.componentInstance.spinStarted()).toBe(true);
      expect(fixture.componentInstance.displayCount()).toBe(4);
      fixture.componentRef.setInput('items', {});
      fixture.detectChanges();
      expect(fixture.componentInstance.displayCount()).toBe(0);
      expect(fixture.componentInstance.spinStarted()).toBe(true);
      fixture.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
