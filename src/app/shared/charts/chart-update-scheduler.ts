/**
 * Coalesce chart updates and resize requests outside Angular lifecycle hooks,
 * ResizeObserver deliveries, and ECharts' synchronous render cycle.
 *
 * Render and resize deliberately run in DIFFERENT animation frames. A resize
 * notification caused by setOption therefore cannot recursively re-enter it.
 */
export class ChartUpdateScheduler {
  private frame: number | null = null;
  private renderPending = false;
  private resizePending = false;
  private disposed = false;

  constructor(
    private readonly renderChart: () => void,
    private readonly resizeChart: () => void,
  ) {}

  requestRender(): void {
    if (this.disposed) return;
    this.renderPending = true;
    this.schedule();
  }

  requestResize(): void {
    if (this.disposed) return;
    this.resizePending = true;
    this.schedule();
  }

  private schedule(): void {
    if (this.disposed || this.frame !== null) return;
    this.frame = requestAnimationFrame(() => this.flush());
  }

  private flush(): void {
    this.frame = null;
    if (this.disposed) return;
    if (this.renderPending) {
      this.renderPending = false;
      this.renderChart();
    } else if (this.resizePending) {
      this.resizePending = false;
      this.resizeChart();
    }
    if (this.renderPending || this.resizePending) this.schedule();
  }

  destroy(): void {
    this.disposed = true;
    this.renderPending = false;
    this.resizePending = false;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }
}
