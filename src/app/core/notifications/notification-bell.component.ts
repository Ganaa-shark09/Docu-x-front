import { LucideBell } from '@lucide/angular';
import { Component, DestroyRef, Injector, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter, interval, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [LucideBell],
  template: `
    <button type="button" class="notification-trigger"
      [attr.aria-label]="count() ? 'Notifications, ' + count() + ' unread' : 'Open notifications'"
      title="Notifications" (click)="open()">
      <svg lucideBell [size]="19" aria-hidden="true"></svg>
      @if (count() > 0) {
        <span class="notification-count" aria-hidden="true">{{ count() > 99 ? '99+' : count() }}</span>
      }
    </button>`,
  styles: [`
    :host { display:inline-flex; }
    .notification-trigger { position:relative; display:grid; place-items:center; width:38px; height:38px; padding:0; border:1px solid transparent; border-radius:10px; color:var(--app-text-muted); background:transparent; cursor:pointer; transition:background .18s ease,color .18s ease,border-color .18s ease; }
    .notification-trigger:hover { color:var(--app-primary); background:var(--app-hover); border-color:var(--app-border); }
    .notification-trigger:focus-visible { outline:2px solid var(--app-focus); outline-offset:2px; }
    .notification-count { position:absolute; top:-4px; right:-5px; display:grid; place-items:center; min-width:18px; height:18px; padding:0 4px; border-radius:20px; background:var(--app-primary); color:var(--app-on-primary); border:2px solid var(--app-surface); font-weight:750; font-size:9px; font-variant-numeric:tabular-nums; line-height:1; }
    @media (prefers-reduced-motion:reduce) { .notification-trigger { transition:none; } }
  `],
})
export class NotificationBellComponent {
  private readonly http = inject(HttpClient);
  private readonly injector = inject(Injector);
  private readonly destroy = inject(DestroyRef);
  private readonly base = environment.apiBaseUrl + '/notifications/';
  private opened = false;
  readonly count = signal(0);

  constructor() {
    this.refresh();
    interval(60_000).pipe(filter(() => typeof document === 'undefined' || document.visibilityState === 'visible'), takeUntilDestroyed(this.destroy))
      .subscribe(() => this.refresh());
  }

  refresh(): void {
    this.http.get<{ unread_count: number }>(this.base + 'unread-count/')
      .pipe(timeout(15000), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (r) => this.count.set(Math.max(0, Number(r.unread_count) || 0)),
        // Do not show a fake zero if the server temporarily cannot be reached.
        error: () => {},
      });
  }

  async open(): Promise<void> {
    if (this.opened) return;
    this.opened = true;
    try {
      const [{ MatDialog }, { NotificationDrawerComponent }] = await Promise.all([
        import('@angular/material/dialog'),
        import('./notification-drawer.component'),
      ]);
      const mobile = window.matchMedia('(max-width: 600px)').matches;
      this.injector.get(MatDialog).open(NotificationDrawerComponent, {
        position: mobile ? { right: '0', top: '0' } : { right: '14px', top: '14px' },
        height: mobile ? '100dvh' : 'calc(100dvh - 28px)',
        width: mobile ? '100vw' : '462px',
        maxWidth: mobile ? '100vw' : 'calc(100vw - 28px)',
        panelClass: 'notification-drawer',
        backdropClass: 'docux-notification-backdrop',
        autoFocus: 'first-tabbable',
        restoreFocus: true,
        ariaLabel: 'Notifications',
      }).afterClosed().pipe(takeUntilDestroyed(this.destroy)).subscribe(() => {
        this.opened = false;
        this.refresh();
      });
    } catch { this.opened = false; }
  }
}
