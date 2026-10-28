import { AfterViewInit, Component, computed, effect, ElementRef, inject, input, NgZone, OnDestroy, signal } from '@angular/core';

type RadialSegment = {key: string; label: string; value: number; length: number; start: number; color: string};

/** A category explorer. Exact counts come from permission-scoped dashboard metrics. */
@Component({
  selector: 'app-dashboard-radial-card',
  standalone: true,
  template: `
    <section class="composition" [attr.aria-label]="title() + ': ' + total() + ' records'">
      <header class="composition__head">
        <div><span class="composition__eyebrow">{{ eyebrow() }}</span><h3>{{ title() }}</h3><p>{{ description() }}</p></div>
        <span class="composition__mark" aria-hidden="true">↗</span>
      </header>
      <div class="composition__body">
        <div class="composition__graphic" role="img" [attr.aria-label]="descriptionText()">
          <svg class="composition__ring" [class.is-revolving]="spinStarted()" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
            <circle class="composition__track" cx="100" cy="100" r="75" pathLength="100" fill="none" stroke-width="18" />
            @for(segment of segments();track segment.key + ':' + segment.length.toFixed(4) + ':' + segment.start.toFixed(4)){
              <circle class="composition__segment" [class.is-muted]="activeSegment() && activeSegment()!.key!==segment.key"
                cx="100" cy="100" r="75" pathLength="100" fill="none" stroke-width="18"
                [attr.stroke]="segment.color" [style.--docux-ring-target]="segment.length + ' ' + (100-segment.length)"
                [attr.stroke-dasharray]="segment.length + ' ' + (100-segment.length)"
                [attr.stroke-dashoffset]="-segment.start">
                <title>{{segment.label}}: {{segment.value}} records, {{segment.length.toFixed(1)}}%</title>
              </circle>
            }
          </svg>
          <div class="composition__center"><span>{{activeSegment() ? 'SELECTED' : 'TOTAL RECORDS'}}</span>
            <strong [attr.aria-label]="(activeSegment()?.value ?? total()) + ' records'" aria-live="off">{{displayCount()}}</strong>
            <small>{{activeSegment() ? activeSegment()!.length.toFixed(1) + '% of total' : 'verified records'}}</small>
          </div>
        </div>
        <div class="composition__legend" aria-label="Choose a category to inspect">
          @for(segment of segments();track segment.key){
            <button type="button" class="composition__legend-item" [class.is-active]="selectedKey()===segment.key"
              [attr.aria-pressed]="selectedKey()===segment.key" (click)="toggle(segment.key)"
              [attr.aria-label]="segment.label + ': ' + segment.value + ' records, ' + segment.length.toFixed(1) + ' percent'">
              <span class="composition__dot" [style.background]="segment.color" aria-hidden="true"></span>
              <span class="composition__name" [title]="segment.label">{{segment.label}}</span>
              <strong>{{segment.value}}</strong>
              <span class="composition__percent">{{segment.length.toFixed(1)}}%</span>
              <span class="composition__bar" aria-hidden="true"><i [style.width.%]="segment.length" [style.background]="segment.color"></i></span>
            </button>
          } @empty {
            <div class="composition__empty"><span aria-hidden="true">◌</span><p>No categorized records yet</p></div>
          }
        </div>
      </div>
      <footer><span>{{activeSegment()?.label || 'Select a category to explore'}}</span>
        @if(activeSegment()){<button type="button" class="composition__reset" (click)="selectedKey.set(null)">Clear selection ×</button>}
        @else{<span class="composition__foot-dot" aria-hidden="true"></span>}
      </footer>
    </section>
  `,
  styles: [`
    :host{display:block;min-width:0;height:100%}
    .composition{box-sizing:border-box;position:relative;isolation:isolate;display:flex;flex-direction:column;gap:16px;min-width:0;height:100%;min-height:310px;overflow:hidden;padding:22px;border-radius:19px;border:1px solid var(--app-border);background:radial-gradient(circle at 100% 0%,color-mix(in srgb,var(--app-primary) 7%,transparent),transparent 49%),var(--app-surface);box-shadow:var(--app-shadow-raised);color:var(--app-text);transition:border-color .22s,box-shadow .22s,transform .22s}
    .composition:hover{border-color:var(--app-border-strong);transform:translateY(-2px)}
    .composition__head{display:flex;align-items:start;justify-content:space-between;gap:12px}
    .composition__eyebrow{display:block;font-size:9px;letter-spacing:.13em;font-weight:800;color:var(--app-primary);margin-bottom:9px}
    .composition h3{margin:0;font-size:17px;line-height:1.3;letter-spacing:-.033em;font-weight:780}.composition p{font-size:11px;line-height:1.6;margin:5px 0 0;color:var(--app-text-muted)}
    .composition__mark{display:grid;place-items:center;height:30px;width:30px;flex:none;border-radius:10px;border:1px solid var(--app-border);color:var(--app-primary);background:var(--app-surface-soft);font-size:16px}
    .composition__body{display:grid;grid-template-columns:minmax(125px,.85fr) minmax(126px,1fr);gap:12px;align-items:center;flex:1;min-width:0}
    .composition__graphic{position:relative;width:100%;max-width:225px;aspect-ratio:1;margin:auto}
    .composition__graphic svg{display:block;width:100%;height:100%;overflow:visible;transform:rotate(-90deg);filter:drop-shadow(0 9px 12px rgb(0 0 0 / 9%))}
    .composition__track{stroke:var(--app-surface-soft)}.composition__segment{stroke-linecap:round;transition:opacity .2s,stroke-width .2s}
    .composition__segment.is-muted{opacity:.18}
    .composition__center{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:3px;pointer-events:none;text-align:center}
    .composition__center span{font-size:8px;letter-spacing:.13em;font-weight:780;color:var(--app-text-muted)}
    .composition__center strong{font-size:clamp(29px,2.8vw,40px);font-weight:800;letter-spacing:-.075em;line-height:1.1;font-variant-numeric:tabular-nums}
    .composition__center small{font-size:10px;color:var(--app-text-muted)}
    .composition__legend{display:grid;gap:6px;min-width:0;align-content:center}
    .composition__legend-item{display:grid;grid-template-columns:7px minmax(0,1fr) auto;align-items:center;column-gap:7px;row-gap:4px;width:100%;min-width:0;padding:8px;border:1px solid transparent;border-radius:9px;background:transparent;color:inherit;text-align:left;font-family:inherit;cursor:pointer;transition:background .16s,border-color .16s}
    .composition__legend-item:hover,.composition__legend-item.is-active{background:var(--app-surface-soft);border-color:var(--app-border)}
    .composition__legend-item:focus-visible,.composition__reset:focus-visible{outline:2px solid var(--app-focus);outline-offset:2px}
    .composition__dot{height:7px;width:7px;border-radius:2px}.composition__name{font-size:10px;color:var(--app-text-muted);min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;text-transform:capitalize}
    .composition__legend strong{font-size:11px;font-weight:790;font-variant-numeric:tabular-nums}.composition__percent{grid-column:2/-1;font-size:9px;color:var(--app-text-muted)}
    .composition__empty{padding:16px 4px;text-align:center}.composition__empty span{color:var(--app-primary);font-size:23px}
    .composition footer{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:23px;margin-top:auto;padding-top:10px;border-top:1px solid var(--app-border);color:var(--app-text-muted);font-size:10px}
    .composition__reset{border:0;background:transparent;color:var(--app-primary);font-size:10px;font-weight:760;cursor:pointer}.composition__foot-dot{width:7px;height:7px;background:var(--app-success-text);border-radius:50%}
    @media(max-width:450px){.composition__body{grid-template-columns:1fr}.composition__graphic{max-width:200px}.composition__legend{grid-template-columns:1fr 1fr}}
    @media(prefers-reduced-motion:reduce){.composition,.composition__segment,.composition__legend-item{animation:none!important;transition:none!important}.composition:hover{transform:none}}

    /* V6 · premium segmented explorer: dual-depth rings and editorial labels */
    .composition{min-height:328px;padding:23px;gap:18px;border-radius:21px;background:radial-gradient(circle at 100% 0%,color-mix(in srgb,var(--app-primary) 6%,transparent),transparent 55%),var(--app-surface)}
    .composition::before{content:'';position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,color-mix(in srgb,var(--app-primary) 55%,transparent),transparent 63%);opacity:.7}
    .composition__head h3{font-size:18px;font-weight:790}.composition__eyebrow{font-size:9px;letter-spacing:.16em}
    .composition__mark{border-radius:12px;font-size:15px;transform:rotate(0deg)}
    .composition__body{grid-template-columns:minmax(150px,.91fr) minmax(150px,1.1fr);gap:17px}
    .composition__graphic{max-width:222px}
    .composition__graphic::after{content:'';position:absolute;inset:16%;border-radius:50%;border:1px solid color-mix(in srgb,var(--app-border) 63%,transparent);pointer-events:none}
    .composition__graphic svg{filter:drop-shadow(0 8px 7px rgb(0 0 0 / 6%))}
    .composition__track{stroke:color-mix(in srgb,var(--app-border) 59%,var(--app-surface-soft))}
    .composition__segment{stroke-linecap:butt;transition:opacity .25s,stroke-width .25s,filter .25s}
    .composition__segment:hover{stroke-width:21;filter:brightness(1.1)}
    .composition__center{gap:5px}.composition__center span{font-size:9px;letter-spacing:.16em}.composition__center strong{font-size:clamp(32px,3vw,46px)}
    .composition__legend{gap:6px}
    .composition__legend-item{grid-template-columns:9px minmax(0,1fr) auto auto;column-gap:8px;padding:9px 8px;border-radius:10px}
    .composition__legend-item:focus-visible{outline-offset:1px}.composition__legend-item.is-active{border-color:color-mix(in srgb,var(--app-primary) 26%,var(--app-border))}
    .composition__dot{height:8px;width:8px;border-radius:3px}.composition__name{font-size:11px;font-weight:620}.composition__legend strong{font-size:12px}
    .composition__percent{grid-column:auto;font-size:10px;min-width:37px;text-align:right}
    .composition__bar{height:3px;grid-column:2/-1;display:block;overflow:hidden;border-radius:5px;background:var(--app-surface-soft)}
    .composition__bar i{display:block;height:100%;min-width:2px;border-radius:5px;transition:width .6s cubic-bezier(.2,.8,.2,1);animation:docux-grow-bar .8s cubic-bezier(.19,.8,.2,1) both;transform-origin:left center}
    @keyframes docux-grow-bar{from{transform:scaleX(.08);opacity:.45}to{transform:scaleX(1);opacity:1}}
    /* One full clockwise revolution, then the exact original -90deg orientation.
       The class is applied once when verified data first becomes visible. */
    .composition__graphic svg.is-revolving{
      animation:docux-ring-one-turn 1.5s cubic-bezier(.2,.74,.24,1) 0s 1 both;
    }
    @keyframes docux-ring-one-turn{
      from{transform:rotate(-450deg)}
      to{transform:rotate(-90deg)}
    }
    .composition__center strong{font-variant-numeric:tabular-nums;transition:color .2s ease}
    .composition__graphic:hover .composition__center strong{color:var(--readiness-highlight,var(--app-primary))}
    .composition footer{padding-top:13px;font-size:10px}
    @media(max-width:550px){.composition__body{grid-template-columns: minmax(120px,.8fr) minmax(135px,1fr);gap:7px}.composition{padding:16px}}
    @media(max-width:390px){.composition__body{grid-template-columns:1fr}.composition__graphic{max-width:205px}.composition__legend{grid-template-columns:1fr}}
    @media(prefers-reduced-motion:reduce){.composition__bar i,.composition__segment,.composition__graphic svg.is-revolving{transition:none!important;animation:none!important}}
    @media(prefers-reduced-motion:reduce){.composition__bar i{animation:none!important}}
  `]
})
export class DashboardRadialCardComponent implements AfterViewInit, OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  private observer: IntersectionObserver | null = null;
  private readonly visible = signal(false);
  private hasStarted = false;
  readonly spinStarted = signal(false);

  /** Counts always match the authorized snapshot, including while the ring rotates. */
  readonly displayCount = computed(() => this.activeSegment()?.value ?? this.total());

  constructor() {
    effect(() => {
      // Only begin when the card enters the viewport AND has actual segments.
      // Never replay on filter selection, server refresh, or clearing the dataset.
      if (this.visible() && this.segments().length > 0 && !this.hasStarted) {
        this.hasStarted = true;
        this.spinStarted.set(true);
      }
    });
  }

  ngAfterViewInit(): void {
    if (typeof IntersectionObserver === 'undefined') {
      this.visible.set(true);
      return;
    }
    this.zone.runOutsideAngular(() => {
      this.observer = new IntersectionObserver((entries) => {
        if (entries.some(entry => entry.isIntersecting)) {
          this.observer?.disconnect();
          this.observer = null;
          this.zone.run(() => this.visible.set(true));
        }
      }, { threshold: 0.15 });
      this.observer.observe(this.host.nativeElement);
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  readonly title = input.required<string>();
  readonly eyebrow = input<string>('PORTFOLIO');
  readonly description = input<string>('Current categorized records');
  readonly items = input<Record<string,number>|null|undefined>({});
  readonly selectedKey = signal<string|null>(null);
  private readonly palette=['var(--docux-chart-1)','var(--docux-chart-2)','var(--docux-chart-3)','var(--docux-chart-4)','var(--docux-chart-5)','var(--docux-chart-6)'];
  readonly rows=computed(()=>Object.entries(this.items()??{})
    .filter(([,v])=>Number.isFinite(v)&&v>0)
    .sort(([ka,a],[kb,b])=>b-a||ka.localeCompare(kb)));
  readonly total=computed(()=>this.rows().reduce((sum,[,v])=>sum+v,0));
  readonly segments=computed<RadialSegment[]>(()=>{
    const source=this.rows();
    const shown=source.slice(0,5).map(([key,value])=>({key,label:key.replaceAll('_',' '),value}));
    if(source.length>5)shown.push({key:'other-grouped',label:'Other categories',value:source.slice(5).reduce((sum,[,v])=>sum+v,0)});
    let start=0;
    return shown.map((r,i)=>{const length=this.total()?r.value/this.total()*100:0;
      const seg={...r,length,start,color:this.palette[i%this.palette.length]};start+=length;return seg;});
  });
  readonly activeSegment=computed(()=>this.segments().find(s=>s.key===this.selectedKey())??null);
  readonly descriptionText=computed(()=>this.segments().length ? this.segments().map(s=>`${s.label}: ${s.value}`).join(', ') : 'No records reported');
  toggle(key:string):void{this.selectedKey.update(prev=>prev===key?null:key);}
}
