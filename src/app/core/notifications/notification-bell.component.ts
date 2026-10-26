import { LucideBell } from '@lucide/angular';
import { Component, DestroyRef, Injector, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [LucideBell],
  template: `<button type="button" aria-label="Open notifications" (click)="open()">
    <svg lucideBell [size]="20" aria-hidden="true"></svg>
    @if (count() > 0) {
      <span class="notification-count">{{ count() > 99 ? '99+' : count() }}</span>
    }
  </button>`,
  styles: [
    `
      button {
        position: relative;
      }
      .notification-count {
        position: absolute;
        right: 0;
        top: 0;
        background: var(--app-primary);
        color: var(--app-on-primary);
        border-radius: 12px;
        font-size: 10px;
        min-width: 16px;
        line-height: 16px;
      }
    `,
  ],
})
export class NotificationBellComponent {
  private http = inject(HttpClient);
  private injector = inject(Injector);
  private opened = false;
  private destroy = inject(DestroyRef);
  readonly count = signal(0);
  private base = environment.apiBaseUrl + '/notifications/';
  constructor() {
    this.refresh();
  }
  refresh() {
    this.http
      .get<{ unread_count: number }>(this.base + 'unread-count/')
      .pipe(timeout(15000), takeUntilDestroyed(this.destroy))
      .subscribe({ next: (r) => this.count.set(r.unread_count), error: () => this.count.set(0) });
  }
  async open() {
    if (this.opened) return;
    this.opened = true;
    try {
      const [{ MatDialog }, { NotificationDrawerComponent }] = await Promise.all([
        import('@angular/material/dialog'),
        import('./notification-drawer.component'),
      ]);
      this.injector
        .get(MatDialog)
        .open(NotificationDrawerComponent, {
          position: { right: '0', top: '0' },
          height: '100dvh',
          width: '440px',
          maxWidth: '100vw',
          panelClass: 'notification-drawer',
          autoFocus: 'first-tabbable',
          restoreFocus: true,
          ariaLabel: 'Notifications',
        })
        .afterClosed()
        .pipe(takeUntilDestroyed(this.destroy))
        .subscribe(() => {
          this.opened = false;
          this.refresh();
        });
    } catch {
      this.opened = false;
    }
  }
}
