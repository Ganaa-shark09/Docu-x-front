import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastService } from './toast.service';
import { ToastOutletComponent } from './toast-outlet.component';

describe('Toast notifications', () => {
  beforeEach(() => { vi.useFakeTimers(); TestBed.configureTestingModule({ imports: [ToastOutletComponent] }); });
  afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); });

  it('fades out after 2.5 seconds and is removed by 2.85 seconds', () => {
    const fixture = TestBed.createComponent(ToastOutletComponent);
    const toasts = TestBed.inject(ToastService);
    toasts.success('User created.');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain('User created.');
    vi.advanceTimersByTime(2499);
    expect(toasts.messages()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.toast--exiting')).not.toBeNull();
    vi.advanceTimersByTime(350);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.toast')).toBeNull();
  });

  it('announces errors, limits the stack, and allows manual dismissal', () => {
    const fixture = TestBed.createComponent(ToastOutletComponent);
    const toasts = TestBed.inject(ToastService);
    for (let index = 0; index < 4; index++) toasts.error(`Failure ${index}`);
    fixture.detectChanges();
    expect(toasts.messages()).toHaveLength(3);
    expect(fixture.nativeElement.querySelectorAll('[role="alert"]')).toHaveLength(3);
    fixture.nativeElement.querySelector('.toast__close').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.toast--exiting')).not.toBeNull();
    vi.advanceTimersByTime(350);
    expect(toasts.messages()).toHaveLength(2);
  });

  it('replaces a generic workflow result with its specific confirmation', () => {
    const toasts = TestBed.inject(ToastService);
    toasts.success('Workflow action completed.');
    toasts.success('Playbook created.');
    expect(toasts.messages().map((message) => message.message)).toEqual(['Playbook created.']);
    vi.advanceTimersByTime(2850);
    expect(toasts.messages()).toEqual([]);
  });
});
