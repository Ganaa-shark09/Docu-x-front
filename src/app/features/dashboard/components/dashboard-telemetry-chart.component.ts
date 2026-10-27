import { AfterViewInit, Component, computed, ElementRef, input, NgZone, OnChanges, OnDestroy, signal, ViewChild, inject } from '@angular/core';
import { WAVE, interpolateWave, pixelY, safeMax, sampleWave, wavePath } from '../../../shared/charts/wave-chart-geometry';

/** Permission-scoped upload counts, drawn with an independent SVG animation.
 * ECharts/ZRender's former series-track animation caused repeated Animator.js
 * errors. SVG path morphing avoids the ECharts engine entirely for this chart.
 * No estimated counts are generated: the exact source values remain in the table.
 */
@Component({
  selector: 'app-dashboard-telemetry-chart',
  standalone: true,
  template: `
    <div class="telemetry-frame" [class.telemetry-frame--bars]="mode() === 'bars'">
      <svg class="telemetry-plot" viewBox="0 0 960 300" preserveAspectRatio="none"
        role="img" tabindex="0" focusable="true" [attr.aria-label]="accessibleDescription()"
        (pointermove)="onPointerMove($event)" (pointerleave)="selectedIndex.set(null)" (keydown)="onChartKeydown($event)">
        <defs>
          <linearGradient id="docux-wave-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--docux-chart-1,#9ce7b4)" stop-opacity=".31"/><stop offset="100%" stop-color="var(--docux-chart-1,#9ce7b4)" stop-opacity="0"/></linearGradient>
          <linearGradient id="docux-bar-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--docux-chart-1,#9ce7b4)"/><stop offset="100%" stop-color="var(--docux-chart-2,#6bb996)"/></linearGradient>
        </defs>
        @for (tick of ticks(); track tick.value) {
          <line class="telemetry-grid" x1="44" x2="940" [attr.y1]="tick.y" [attr.y2]="tick.y" />
          <text class="telemetry-axis-label" x="30" [attr.y]="tick.y + 4" text-anchor="end">{{tick.value}}</text>
        }
        <line class="telemetry-baseline" x1="44" x2="940" y1="252" y2="252"/>
        @for (tick of xTicks(); track tick.date) {
          <text class="telemetry-axis-label" [attr.x]="tick.x" y="280" text-anchor="middle">{{tick.label}}</text>
        }
        <path #area class="telemetry-area" [class.is-hidden]="mode() === 'bars' || rows().length < 2" />
        <path #wave class="telemetry-wave" [class.is-hidden]="mode() === 'bars' || rows().length < 2"/>
        @if(mode() === 'area' && rows().length===1){<circle class="telemetry-single-dot" cx="492" [attr.cy]="pixelY(values()[0],maxValue())" r="6"/>}
        @if (mode() === 'bars') {
          @for (bar of bars(); track bar.date) {
            <rect class="telemetry-bar" [attr.x]="bar.x" [attr.width]="bar.width" [attr.y]="bar.y"
              [attr.height]="bar.height" rx="5" fill="url(#docux-bar-gradient)" />
          }
        }
        @if (focusedPoint(); as focus) {
          <line class="telemetry-focus-line" [attr.x1]="focus.x" [attr.x2]="focus.x" y1="18" y2="252"/>
          <circle class="telemetry-focus-dot" [attr.cx]="focus.x" [attr.cy]="focus.y" r="7" />
        }
      </svg>
      @if (focusedPoint(); as focus) {
        <div class="telemetry-hover" role="status" aria-live="off">
          <strong>{{focus.date}}</strong><span>{{focus.count}} uploads · {{focus.cumulative}} cumulative</span>
        </div>
      }
      @if (!rows().length) { <div class="telemetry-empty">No daily upload data reported for this period.</div> }
    </div>
    <details class="telemetry-table">
      <summary>View exact daily values</summary>
      <table><caption class="sr-only">Daily document uploads</caption>
        <thead><tr><th scope="col">Date</th><th scope="col">Uploads</th><th scope="col">Running total</th></tr></thead>
        <tbody>@for (r of plotRows(); track r.date) {
          <tr><th scope="row">{{r.date}}</th><td>{{r.count}}</td><td>{{r.cumulative}}</td></tr>
          } @empty { <tr><td colspan="3">No daily upload data reported.</td></tr> }
        </tbody>
      </table>
    </details>`,
  styles: [`
    :host{display:block;min-width:0;width:100%}
    .telemetry-frame{position:relative;min-width:0;isolation:isolate}
    .telemetry-plot{display:block;width:100%;height:244px;min-width:0;overflow:visible;outline:none}
    .telemetry-frame--bars .telemetry-plot{height:262px}
    .telemetry-plot:focus-visible{outline:2px solid var(--app-focus);outline-offset:4px;border-radius:9px}
    .telemetry-grid{stroke:var(--app-border);stroke-opacity:.56;stroke-dasharray:3 6;stroke-width:1}
    .telemetry-baseline{stroke:var(--app-border-strong,var(--app-border));stroke-width:1}
    .telemetry-single-dot{fill:var(--docux-chart-1,#9ce7b4);stroke:var(--app-surface);stroke-width:3;filter:drop-shadow(0 0 6px var(--docux-chart-soft,rgba(112,190,145,.3)))}
    .telemetry-axis-label{font-size:12px;fill:var(--app-text-muted);font-variant-numeric:tabular-nums}
    .telemetry-area{fill:url(#docux-wave-gradient);pointer-events:none}
    .telemetry-wave{fill:none;stroke:var(--docux-chart-1,#9ce7b4);stroke-width:3.5;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke;filter:drop-shadow(0 3px 6px var(--docux-chart-soft,rgba(112,190,145,.3)));pointer-events:none}
    .telemetry-area.is-hidden,.telemetry-wave.is-hidden{display:none}
    .telemetry-bar{transform-box:fill-box;transform-origin:center bottom;animation:telemetry-rise .64s cubic-bezier(.17,.83,.33,1) both}
    .telemetry-focus-line{stroke:var(--docux-chart-1,#9ce7b4);stroke-dasharray:3 6;stroke-opacity:.72}
    .telemetry-focus-dot{fill:var(--docux-chart-1,#9ce7b4);stroke:var(--app-surface);stroke-width:3;filter:drop-shadow(0 0 5px var(--docux-chart-soft,rgba(112,190,145,.3)))}
    .telemetry-hover{display:flex;gap:10px;align-items:center;justify-content:flex-start;flex-wrap:wrap;padding:8px 12px;background:var(--app-surface-soft);border:1px solid var(--app-border);border-radius:10px;font-size:11px;color:var(--app-text-muted);animation:telemetry-popup .16s ease-out both}
    .telemetry-hover strong{color:var(--app-text);font-weight:750}
    .telemetry-empty{position:absolute;inset:0;display:grid;place-items:center;text-align:center;color:var(--app-text-muted);font-size:12px;pointer-events:none}
    .telemetry-table{margin-top:4px;padding-top:9px;border-top:1px solid var(--app-border);font-size:11px;color:var(--app-text-muted)}
    .telemetry-table summary{cursor:pointer;padding:6px 0}.telemetry-table summary:focus-visible{outline:2px solid var(--app-focus);outline-offset:3px}
    .telemetry-table table{margin-top:6px;width:100%;border-collapse:collapse}.telemetry-table th,.telemetry-table td{padding:6px 4px;text-align:left;border-bottom:1px solid var(--app-border)}
    .telemetry-table td{text-align:right;font-variant-numeric:tabular-nums}
    .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
    @keyframes telemetry-rise{from{transform:scaleY(.035);opacity:.35}to{transform:scaleY(1);opacity:1}}
    @keyframes telemetry-popup{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
    @media(prefers-reduced-motion:reduce){.telemetry-bar,.telemetry-hover{animation:none!important}.telemetry-wave{filter:none}}
  `],
})
export class DashboardTelemetryChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  private zone = inject(NgZone);
  readonly items = input<Record<string,number> | null | undefined>({});
  readonly days = input<7 | 14 | 30>(30);
  readonly mode = input<'area' | 'bars'>('area');
  readonly metric = input<'daily' | 'cumulative'>('daily');
  readonly selectedIndex = signal<number | null>(null);
  readonly rows = computed(() => Object.entries(this.items() ?? {})
    .filter(([date,value])=>/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(value) && value >= 0)
    .sort(([a],[b])=>a.localeCompare(b)).slice(-this.days())
    .map(([date,count])=>({date,count})));
  readonly plotRows = computed(() => {let sum=0;return this.rows().map(r=>({...r,cumulative:(sum+=r.count)}));});
  readonly values = computed(()=>this.plotRows().map(r=>this.metric()==='cumulative' && this.mode()!=='bars' ? r.cumulative:r.count));
  readonly maxValue = computed(()=>safeMax(this.values()));
  readonly ticks = computed(()=>[...new Set(Array.from({length:4},(_,i)=>Math.round(this.maxValue()*i/3)))].map(value=>({value,y:pixelY(value,this.maxValue())})));
  readonly pixelY=pixelY;
  readonly xTicks = computed(()=>{
    const rows=this.rows(); const step=Math.max(1,Math.ceil((rows.length-1)/6));
    return rows.map((r,index)=>({date:r.date,label:r.date.slice(5),x:rows.length===1 ? 492 : WAVE.left+(WAVE.width-WAVE.left-WAVE.right)*index/Math.max(1,rows.length-1),index}))
      .filter(r=>r.index%step===0||r.index===rows.length-1);
  });
  readonly bars = computed(()=>{
    const rows=this.rows();const width=(WAVE.width-WAVE.left-WAVE.right)/Math.max(rows.length,1);
    return rows.map((r,index)=>({date:r.date,x:WAVE.left+width*index+width*.2,width:width*.6,
      y:pixelY(r.count,this.maxValue()),height:WAVE.height-WAVE.bottom-pixelY(r.count,this.maxValue())}));
  });
  readonly focusedPoint = computed(()=>{
    const index=this.selectedIndex();const rows=this.plotRows();
    if(index===null||index<0||index>=rows.length)return null;
    const r=rows[index];return {...r,x:rows.length===1 ? 492 : WAVE.left+(WAVE.width-WAVE.left-WAVE.right)*index/Math.max(1,rows.length-1),
      y:pixelY(this.values()[index]??0,this.maxValue())};
  });
  readonly accessibleDescription = computed(()=>`${this.rows().length} reported days of document uploads, ${this.rows().reduce((sum,row)=>sum+row.count,0)} uploads total. ${this.mode()==='bars'?'Daily bars':this.metric()==='cumulative'?'Running total':'Daily intake'} chart. Use arrow keys to inspect a date; exact daily counts are in the table below.`);
  @ViewChild('wave') wave!: ElementRef<SVGPathElement>;
  @ViewChild('area') area!: ElementRef<SVGPathElement>;
  private frame: number | null = null;
  private queued: number | null = null;
  private showing: number[] | null = null;
  private destroyed=false;

  ngAfterViewInit(): void { this.scheduleTransition(); }
  ngOnChanges(): void { this.scheduleTransition(); }
  private scheduleTransition(): void {
    if(this.destroyed || !this.wave || typeof requestAnimationFrame==='undefined')return;
    // Allow Angular to finish its bindings; never mutate paths during change detection.
    if(this.queued !== null)cancelAnimationFrame(this.queued);
    this.zone.runOutsideAngular(()=>{this.queued=requestAnimationFrame(()=>{this.queued=null;this.transition();});});
  }
  private transition(): void {
    if(this.destroyed || !this.wave || !this.area)return;
    if(this.frame!==null){cancelAnimationFrame(this.frame);this.frame=null;}
    const to=sampleWave(this.values()).map(v=>pixelY(v,this.maxValue()));
    const baseline=WAVE.height-WAVE.bottom;
    const from=this.showing?.length===to.length ? [...this.showing] : Array(to.length).fill(baseline);
    const reduced=typeof window!=='undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if(reduced || this.mode()==='bars') {this.paint(to);return;}
    let start:number|null=null;
    this.zone.runOutsideAngular(()=>{
      const tick=(time:number)=>{
        if(this.destroyed)return;
        if(start===null)start=time;
        const fraction=Math.min(1,(time-start)/720);
        this.paint(interpolateWave(from,to,fraction));
        if(fraction<1)this.frame=requestAnimationFrame(tick);else this.frame=null;
      };
      this.frame=requestAnimationFrame(tick);
    });
  }
  private paint(y:number[]):void{
    this.showing=y;
    this.wave.nativeElement.setAttribute('d',wavePath(y));
    this.area.nativeElement.setAttribute('d',wavePath(y,true));
  }
  onPointerMove(event: PointerEvent):void{
    const rect=(event.currentTarget as SVGElement).getBoundingClientRect();
    if(!rect.width||!this.rows().length)return;
    const x=(event.clientX-rect.left)/rect.width*WAVE.width;
    const index=Math.round((x-WAVE.left)/(WAVE.width-WAVE.left-WAVE.right)*Math.max(1,this.rows().length-1));
    this.selectedIndex.set(Math.max(0,Math.min(this.rows().length-1,index)));
  }
  onChartKeydown(event:KeyboardEvent):void{
    if(!['ArrowLeft','ArrowRight','Home','End','Escape'].includes(event.key))return;
    event.preventDefault();
    if(event.key==='Escape'){this.selectedIndex.set(null);return;}
    const n=this.rows().length;if(!n)return;
    let next=this.selectedIndex()??0;
    if(event.key==='ArrowRight')next=Math.min(n-1,next+1);
    if(event.key==='ArrowLeft')next=Math.max(0,next-1);
    if(event.key==='Home')next=0;
    if(event.key==='End')next=n-1;
    this.selectedIndex.set(next);
  }
  ngOnDestroy():void{
    this.destroyed=true;
    if(this.frame!==null)cancelAnimationFrame(this.frame);
    if(this.queued!==null)cancelAnimationFrame(this.queued);
  }
}
