import { Component, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Subject, switchMap, catchError, of, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  WorkflowNotification,
  notificationPath,
} from '../../features/workflows/models/notification.model';
@Component({
  standalone: true,
  imports: [DatePipe, MatButtonModule, MatDialogModule],
  template: `<header>
      <div>
        <h2 mat-dialog-title>Notifications</h2>
        <p>Updates requiring your attention</p>
      </div>
      <button mat-icon-button mat-dialog-close aria-label="Close notifications">&#215;</button>
    </header>
    <div class="notification-toolbar">
      <button mat-button (click)="filter('')" [attr.aria-pressed]="status() === ''">All</button
      ><button mat-button (click)="filter('unread')" [attr.aria-pressed]="status() === 'unread'">
        Unread</button
      ><button mat-button (click)="filter('read')" [attr.aria-pressed]="status() === 'read'">
        Read</button
      ><button mat-button [disabled]="busy()" (click)="markAll()">Mark all read</button>
    </div>
    <mat-dialog-content>
      @if (error()) {
        <p role="alert">{{ error() }}</p>
        <button mat-button (click)="load()">Retry</button>
      }
      @if (loading()) {
        <p role="status">Loading notifications...</p>
      } @else {
        @for (n of rows(); track n.uuid) {
          <article [class.unread]="n.status === 'unread'">
            <div>
              <h3>{{ n.title }}</h3>
              <time>{{ n.created_at | date: 'medium' }}</time>
            </div>
            <p>{{ n.message }}</p>
            <footer>
              @if (n.status === 'unread') {
                <button mat-button [disabled]="busy()" (click)="mark(n)">Mark read</button>
              }
              @if (path(n)) {
                <button mat-button (click)="navigate(n)">Open record &rarr;</button>
              }
            </footer>
          </article>
        } @empty {
          <div class="notification-empty">
            <h3>You’re up to date</h3>
            <p>No {{ status() }} notifications to show.</p>
          </div>
        }
      }
    </mat-dialog-content>
    <nav aria-label="Notification pagination">
      <button mat-button [disabled]="page === 1 || loading()" (click)="load(page - 1)">
        Previous</button
      ><span>Page {{ page }}</span
      ><button mat-button [disabled]="!next() || loading()" (click)="load(page + 1)">Next</button>
    </nav>`,
  styles: [
    `
      :host {
        height: 100%;
        display: flex;
        flex-direction: column;
        background: var(--app-surface);
        color: var(--app-text);
      }
      header {
        display: flex;
        justify-content: space-between;
        padding: 20px;
        border-bottom: 1px solid var(--app-border);
      }
      h2 {
        padding: 0 !important;
        margin: 0;
      }
      header p,
      time {
        font-size: 12px;
        color: var(--app-text-muted);
      }
      .notification-toolbar {
        display: flex;
        flex-wrap: wrap;
        padding: 8px;
      }
      mat-dialog-content {
        flex: 1;
        max-height: none;
        padding: 0 !important;
      }
      article {
        padding: 20px;
        border-bottom: 1px solid var(--app-border);
      }
      article.unread {
        background: var(--app-selected);
      }
      h3 {
        font-size: 14px;
        font-weight: 600;
      }
      article p {
        font-size: 13px;
        line-height: 1.6;
        margin: 8px 0;
      }
      footer {
        display: flex;
        justify-content: flex-end;
      }
      nav {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px;
        border-top: 1px solid var(--app-border);
      }
      .notification-empty {
        padding: 32px;
        text-align: center;
      }
    `,
  ],
})
export class NotificationDrawerComponent {
  private http = inject(HttpClient);
  private ref = inject(MatDialogRef<NotificationDrawerComponent>);
  private router = inject(Router);
  private destroy = inject(DestroyRef);
  private base = environment.apiBaseUrl + '/notifications/';
  private requests = new Subject<void>();
  readonly rows = signal<WorkflowNotification[]>([]);
  readonly status = signal('');
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly next = signal(false);
  readonly path = notificationPath;
  page = 1;
  constructor() {
    this.requests
      .pipe(
        switchMap(() =>
          this.http
            .get<{ results: WorkflowNotification[]; next: string | null }>(this.base, {
              params: { page: this.page, status: this.status() },
            })
            .pipe(
              timeout(15000),
              catchError(() => {
                this.error.set('Unable to load notifications. Please retry.');
                return of(null);
              }),
            ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((r) => {
        this.loading.set(false);
        if (r) {
          this.rows.set(r.results);
          this.next.set(!!r.next);
        }
      });
    this.load();
  }
  filter(status: string) {
    this.status.set(status);
    this.load(1);
  }
  load(page = this.page) {
    this.page = page;
    this.rows.set([]);
    this.error.set('');
    this.loading.set(true);
    this.requests.next();
  }
  private action(path: string) {
    if (this.busy()) return;
    this.busy.set(true);
    this.http
      .post(this.base + path, {})
      .pipe(timeout(15000), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.load();
        },
        error: () => {
          this.busy.set(false);
          this.error.set('The notification could not be updated. Please retry.');
        },
      });
  }
  mark(n: WorkflowNotification) {
    this.action(n.uuid + '/mark-read/');
  }
  markAll() {
    this.action('mark-all-read/');
  }
  navigate(n: WorkflowNotification) {
    const target = this.path(n);
    if (target) {
      this.ref.close();
      void this.router.navigateByUrl(target);
    }
  }
}
