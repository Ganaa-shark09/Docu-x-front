import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
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
  templateUrl: './notification-drawer.component.html',
  styleUrls: ['./notification-drawer.component.scss'],
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
  readonly visibleUnread = computed(() => this.rows().filter(row => row.status === 'unread').length);
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
  close(): void { this.ref.close(); }
  openInbox(): void {
    this.ref.close();
    void this.router.navigateByUrl('/notifications');
  }
  navigate(n: WorkflowNotification) {
    const target = this.path(n);
    if (target) {
      this.ref.close();
      void this.router.navigateByUrl(target);
    }
  }
}
