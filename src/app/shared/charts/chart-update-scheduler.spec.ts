import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChartUpdateScheduler } from './chart-update-scheduler';

describe('ECharts update scheduler', () => {
  const scheduled = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  const nextFrame = () => {
    const callbacks = Array.from(scheduled.values());
    scheduled.clear();
    callbacks.forEach((callback) => callback(0));
  };

  beforeEach(() => {
    scheduled.clear();
    sequence = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      const id = ++sequence;
      scheduled.set(id, cb);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      scheduled.delete(id);
    });
  });
  afterEach(() => {
    scheduled.clear();
    vi.unstubAllGlobals();
  });

  it('coalesces repeated option updates without synchronously calling ECharts', () => {
    const render = vi.fn();
    const resize = vi.fn();
    const scheduler = new ChartUpdateScheduler(render, resize);
    scheduler.requestRender();
    scheduler.requestRender();
    scheduler.requestRender();
    expect(render).not.toHaveBeenCalled();
    expect(scheduled.size).toBe(1);
    nextFrame();
    expect(render).toHaveBeenCalledTimes(1);
    expect(resize).not.toHaveBeenCalled();
    scheduler.destroy();
  });

  it('runs resize in a separate frame after setOption', () => {
    const events: string[] = [];
    const scheduler = new ChartUpdateScheduler(
      () => events.push('setOption'),
      () => events.push('resize'),
    );
    scheduler.requestResize();
    scheduler.requestRender();
    nextFrame();
    expect(events).toEqual(['setOption']);
    nextFrame();
    expect(events).toEqual(['setOption', 'resize']);
    scheduler.destroy();
  });

  it('handles resize requested inside render without re-entrant processing', () => {
    const events: string[] = [];
    let scheduler!: ChartUpdateScheduler;
    scheduler = new ChartUpdateScheduler(
      () => { events.push('render'); scheduler.requestResize(); },
      () => events.push('resize'),
    );
    scheduler.requestRender();
    nextFrame();
    expect(events).toEqual(['render']);
    nextFrame();
    expect(events).toEqual(['render', 'resize']);
    scheduler.destroy();
  });

  it('cancels queued operations when chart is destroyed', () => {
    const render = vi.fn();
    const resize = vi.fn();
    const scheduler = new ChartUpdateScheduler(render, resize);
    scheduler.requestRender();
    scheduler.requestResize();
    scheduler.destroy();
    scheduler.requestRender();
    nextFrame();
    expect(render).not.toHaveBeenCalled();
    expect(resize).not.toHaveBeenCalled();
  });
});
