import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { timeout } from 'rxjs';
import { WorkflowNotificationsService } from '../services/workflow-notifications.service';
import { WorkflowNotification, notificationPath } from '../models/notification.model';
import { Page } from '../models/workflow.model';
import { AiApiErrorMessageService } from '../../ai-chat/services/ai-api-error-message.service';
@Component({
  standalone: true,
  imports: [DatePipe, RouterLink],
  styleUrls: ['../workflow.scss'],
  template: `<section class="page">
    <header>
      <h1>Notifications</h1>
      <button (click)="load(page)" [disabled]="loading()">Refresh</button>
    </header>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @if (loading()) {
      <p role="status">Loading notifications...</p>
    }
    @if (result(); as rows) {
      @for (n of rows.results; track n.uuid) {
        <article class="card">
          <h2>{{ n.title }}</h2>
          <p>{{ n.message }}</p>
          <p class="muted">{{ n.status }} | {{ n.created_at | date: 'medium' }}</p>
          @if (path(n); as target) {
            <a [routerLink]="target"
              >Open {{ n.resource_type === 'workflow_run' ? 'workflow run' : 'resource' }}</a
            >
          }
        </article>
      } @empty {
        <p class="empty">No notifications available.</p>
      }
      <nav class="pager" aria-label="Notification pages">
        <button [disabled]="!rows.previous" (click)="load(page - 1)">Previous</button
        ><span>Page {{ page }}</span
        ><button [disabled]="!rows.next" (click)="load(page + 1)">Next</button>
      </nav>
    }
  </section>`,
})
export class WorkflowNotificationsComponent {
  private readonly api = inject(WorkflowNotificationsService);
  private readonly destroy = inject(DestroyRef);
  private readonly errors = inject(AiApiErrorMessageService);
  readonly result = signal<Page<WorkflowNotification> | null>(null);
  readonly error = signal('');
  readonly loading = signal(false);
  readonly path = notificationPath;
  page = 1;
  private generation = 0;
  constructor() {
    this.load();
  }
  load(page = 1): void {
    const gen = ++this.generation;
    this.page = page;
    this.result.set(null);
    this.error.set('');
    this.loading.set(true);
    this.api
      .list(page)
      .pipe(timeout(15000), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (r) => {
          if (gen === this.generation) {
            this.result.set(r);
            this.loading.set(false);
          }
        },
        error: (e) => {
          if (gen === this.generation) {
            this.loading.set(false);
            this.error.set(this.errors.getMessage(e, 'Unable to load notifications.'));
          }
        },
      });
  }
}
