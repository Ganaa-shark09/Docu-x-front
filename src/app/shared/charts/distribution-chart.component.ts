import {
  AfterViewInit,
  Component,
  ElementRef,
  OnChanges,
  OnDestroy,
  ViewChild,
  computed,
  input,
  signal,
} from '@angular/core';
import type { EChartsType } from 'echarts/core';
import { ChartUpdateScheduler } from './chart-update-scheduler';
@Component({
  selector: 'app-distribution-chart',
  standalone: true,
  template: `<section>
    <header>
      <span class="chart-kind">{{
        kind() === 'line' ? 'ACTIVITY OVER TIME' : 'DISTRIBUTION'
      }}</span>
      <h3>{{ title() }}</h3>
      <p>{{ description() }}</p>
    </header>
    <div class="chart-layout" [class.is-donut]="kind() === 'donut'">
      <div class="plot-frame">
        <div #plot class="distribution-plot" aria-hidden="true"></div>
        @if (kind() === 'donut') {
          <div class="donut-total">
            <strong>{{ total() }}</strong
            ><span>{{ total() ? 'Total' : 'No records' }}</span>
          </div>
        }
      </div>
      @if (kind() === 'donut' && rows().length) {
        <ul class="donut-legend" aria-label="Chart categories">
          @for (row of rows(); track row.key; let i = $index) {
            <li>
              <span
                class="legend-dot"
                [style.background]="colors[i % colors.length]"
                aria-hidden="true"
              ></span
              ><span class="legend-label">{{ row.label }}</span
              ><strong>{{ row.value }}</strong
              ><span class="legend-percent">{{ percentage(row.value) }}%</span>
            </li>
          }
        </ul>
      }
    </div>
    @if (chartUnavailable()) {
      <p role="status">Chart unavailable. View the source values below.</p>
    }
    <details>
      <summary>View source values</summary>
      <table>
        <caption class="sr-only">
          {{
            title()
          }}
          counts
        </caption>
        <tbody>
          @for (row of rows(); track row.key) {
            <tr>
              <th scope="row">{{ row.label }}</th>
              <td>{{ row.value }}</td>
            </tr>
          } @empty {
            <tr>
              <td>No data available yet.</td>
            </tr>
          }
        </tbody>
      </table>
    </details>
  </section>`,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .chart-kind {
        display: block;
        font-size: 10px;
        letter-spacing: 0.08em;
        color: var(--app-text-muted);
        margin-bottom: 6px;
        font-weight: 600;
      }
      details {
        margin-top: 8px;
        border-top: 1px solid var(--app-border);
      }
      summary {
        cursor: pointer;
        padding: 10px 0 0;
        font-size: 11px;
        color: var(--app-text-muted);
      }
      summary:focus-visible {
        outline: 2px solid var(--app-focus);
        outline-offset: 3px;
      }
      section {
        container-type: inline-size;
        height: 100%;
        padding: 20px;
        background: var(--app-surface);
        border: 1px solid var(--app-border);
        border-radius: 8px;
      }
      h3 {
        font-size: 14px;
        font-weight: 600;
        margin: 0 0 4px;
      }
      p {
        font-size: 12px;
        color: var(--app-text-muted);
        margin: 0;
      }
      header {
        margin-bottom: 12px;
      }
      .plot-frame {
        position: relative;
        min-width: 0;
      }
      .chart-layout {
        min-width: 0;
      }
      .is-donut {
        display: grid;
        grid-template-columns: minmax(130px, 1fr) minmax(130px, 1fr);
        align-items: center;
        gap: 12px;
      }
      .donut-total {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        pointer-events: none;
      }
      .donut-total strong {
        font-size: 25px;
        font-weight: 650;
        letter-spacing: -0.03em;
        color: var(--app-text);
      }
      .donut-total span {
        font-size: 11px;
        color: var(--app-text-muted);
        margin-top: 2px;
      }
      .donut-legend {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        gap: 13px;
        min-width: 0;
      }
      .donut-legend li {
        display: grid;
        grid-template-columns: 8px minmax(0, 1fr) auto auto;
        align-items: center;
        gap: 7px;
        font-size: 11px;
      }
      .legend-dot {
        height: 7px;
        width: 7px;
        border-radius: 50%;
      }
      .legend-label {
        color: var(--app-text-muted);
        overflow-wrap: anywhere;
      }
      .donut-legend strong {
        font-weight: 600;
        color: var(--app-text);
        font-variant-numeric: tabular-nums;
      }
      .legend-percent {
        color: var(--app-text-muted);
        font-size: 10px;
        min-width: 32px;
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
      @container (max-width: 330px) {
        .is-donut {
          grid-template-columns: minmax(0, 1fr);
          gap: 0;
        }
        .is-donut .distribution-plot {
          height: 200px;
        }
        .donut-legend {
          margin-bottom: 12px;
        }
      }
      @media (max-width: 480px) {
        .is-donut {
          grid-template-columns: minmax(0, 1fr);
          gap: 0;
        }
        .is-donut .distribution-plot {
          height: 220px;
        }
        .donut-legend {
          gap: 10px;
          margin-bottom: 12px;
        }
        .donut-legend li {
          font-size: 12px;
        }
      }
      .distribution-plot {
        height: 280px;
        max-width: 100%;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th,
      td {
        padding: 7px 0;
        border-top: 1px solid var(--app-border);
        font-size: 12px;
      }
      th {
        text-align: left;
        font-weight: 450;
        color: var(--app-text-muted);
      }
      td {
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
      }
    `,
  ],
})
export class DistributionChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  readonly chartUnavailable = signal(false);
  readonly kind = input<'donut' | 'line'>('donut');
  readonly colors = ['#ed8055', '#72ad93', '#e1bd72', '#818fba', '#b88a9f', '#73a7af', '#888b91'];
  readonly total = computed(() => this.rows().reduce((sum, row) => sum + row.value, 0));
  percentage(value: number) {
    return this.total() ? Math.round((value / this.total()) * 1000) / 10 : 0;
  }
  readonly title = input('Distribution');
  readonly description = input('Current workspace records');
  readonly items = input<Record<string, number> | null | undefined>({});
  readonly rows = computed(() =>
    Object.entries(this.items() || {})
      .filter(([, v]) => Number.isFinite(v) && v >= 0)
      .map(([key, value]) => ({
        key,
        value,
        label:
          this.kind() === 'line'
            ? new Date(key + 'T00:00:00').toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })
            : key.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      }))
      .sort((a, b) => (this.kind() === 'line' ? a.key.localeCompare(b.key) : b.value - a.value)),
  );
  @ViewChild('plot') plot!: ElementRef<HTMLElement>;
  private chart?: EChartsType;
  private resize?: ResizeObserver;
  private observer?: MutationObserver;
  private updates?: ChartUpdateScheduler;
  private destroyed = false;
  async ngAfterViewInit() {
    if (!this.plot.nativeElement.clientWidth) return;
    try {
      const { createPlot } = await import('./chart-runtime');
      if (this.destroyed) return;
      this.chart = createPlot(this.plot.nativeElement);
      this.updates = new ChartUpdateScheduler(() => this.draw(), () => this.chart?.resize());
      this.updates.requestRender();
      this.resize = new ResizeObserver(() => this.updates?.requestResize());
      this.resize.observe(this.plot.nativeElement);
      this.observer = new MutationObserver(() => this.updates?.requestRender());
      this.observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme'],
      });
    } catch {
      this.chartUnavailable.set(true);
      this.plot.nativeElement.hidden = true;
    }
  }
  ngOnChanges() {
    this.updates?.requestRender();
  }
  private draw() {
    if (!this.chart) return;
    const style = getComputedStyle(document.documentElement),
      rows = this.rows();
    if (this.kind() === 'donut') {
      this.chart.setOption(
        {
          animation: false,
          stateAnimation: { duration: 0 },
          tooltip: { trigger: 'item', renderMode: 'richText', confine: true },
          series: [
            {
              name: this.title(),
              type: 'pie',
              radius: ['56%', '78%'],
              center: ['50%', '50%'],
              avoidLabelOverlap: true,
              stillShowZeroSum: false,
              showEmptyCircle: true,
              emptyCircleStyle: { color: style.getPropertyValue('--app-surface-soft') },
              label: { show: false },
              labelLine: { show: false },
              emphasis: { scaleSize: 5 },
              itemStyle: {
                borderColor: style.getPropertyValue('--app-surface'),
                borderWidth: 2,
                borderRadius: 4,
              },
              data: rows.map((row, i) => ({
                name: row.label,
                value: row.value,
                itemStyle: { color: this.colors[i % this.colors.length] },
              })),
            },
          ],
        },
        true,
      );
      return;
    }
    this.chart.setOption(
      {
        animation: false,
        stateAnimation: { duration: 0 },
        tooltip: { trigger: 'axis', renderMode: 'richText', confine: true },
        grid: { left: 8, right: 18, top: 24, bottom: 20, containLabel: true },
        xAxis: {
          type: 'category',
          data: rows.map((r) => r.label),
          axisLabel: {
            color: style.getPropertyValue('--app-text-muted'),
            fontSize: 11,
            hideOverlap: true,
            interval: this.kind() === 'line' ? Math.max(0, Math.ceil(rows.length / 6) - 1) : 'auto',
          },
          axisLine: { lineStyle: { color: style.getPropertyValue('--app-border') } },
          axisTick: { show: false },
        },
        yAxis: {
          type: 'value',
          minInterval: 1,
          axisLabel: { color: style.getPropertyValue('--app-text-muted'), fontSize: 11 },
          splitLine: {
            lineStyle: { color: style.getPropertyValue('--app-border'), type: 'dashed' },
          },
        },
        series: [
          {
            type: 'line',
            smooth: false,
            symbol: 'circle',
            symbolSize: 5,
            showSymbol: this.kind() === 'line',
            lineStyle: { width: 2.5, color: style.getPropertyValue('--app-primary') },
            areaStyle:
              this.kind() === 'line'
                ? { color: style.getPropertyValue('--app-primary'), opacity: 0.09 }
                : undefined,
            itemStyle: {
              color: style.getPropertyValue('--app-primary'),
              borderRadius: [4, 4, 0, 0],
            },
            data: rows.map((r) => r.value),
          },
        ],
      },
      true,
    );
  }
  ngOnDestroy() {
    this.destroyed = true;
    this.updates?.destroy();
    this.resize?.disconnect();
    this.observer?.disconnect();
    this.chart?.dispose();
  }
}
