import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
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
  templateUrl: './workflow-notifications.component.html',
  styleUrls: ['./workflow-notifications.component.scss'],
})
export class WorkflowNotificationsComponent {
  private readonly api = inject(WorkflowNotificationsService);
  private readonly destroy = inject(DestroyRef);
  private readonly errors = inject(AiApiErrorMessageService);
  readonly result = signal<Page<WorkflowNotification> | null>(null);
  readonly error = signal('');
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly status = signal('');
  readonly path = notificationPath;
  readonly query = signal('');
  readonly visibleCount = computed(() => this.result()?.results.length ?? 0);
  // Search is deliberately limited to the server-authorized current page.
  readonly searchedRows = computed(() => {
    const phrase=this.query().trim().toLocaleLowerCase();
    const rows=this.result()?.results ?? [];
    return phrase ? rows.filter(row=>[row.title,row.message,row.notification_type].some(value=>value.toLocaleLowerCase().includes(phrase))) : rows;
  });
  readonly groups = computed(() => {
    const result: {key:string;label:string;rows:WorkflowNotification[]}[]=[];
    for (const row of this.searchedRows()) {
      const date = new Date(row.created_at);
      const key=Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-CA') : 'unknown';
      const label=Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : 'Other updates';
      const found=result.find(group=>group.key===key);
      if (found) found.rows.push(row);
      else result.push({key,label,rows:[row]});
    }
    return result;
  });
  setQuery(value:string):void{this.query.set(value);}
  readonly visibleUnread = computed(() => (this.result()?.results ?? []).filter(row => row.status === 'unread').length);
  page = 1;
  private generation = 0;

  constructor() { this.load(); }

  filter(status: string): void {
    if (this.status() === status) return;
    this.status.set(status);
    this.load(1);
  }
  load(page = 1): void {
    const gen = ++this.generation;
    this.page = page;
    this.result.set(null); // Avoid displaying protected data after a failed refresh.
    this.error.set('');
    this.loading.set(true);
    this.api.list(page, this.status()).pipe(timeout(15000), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (r) => {
          if (gen === this.generation) { this.result.set(r); this.loading.set(false); }
        },
        error: (e) => {
          if (gen === this.generation) {
            this.loading.set(false);
            this.error.set(this.errors.getMessage(e, 'Unable to load notifications.'));
          }
        },
      });
  }
  mark(n: WorkflowNotification): void {
    if (this.busy() || n.status !== 'unread') return;
    this.runAction(this.api.markRead(n.uuid));
  }
  markAll(): void {
    if (this.busy()) return;
    this.runAction(this.api.markAllRead());
  }
  private runAction(request: ReturnType<WorkflowNotificationsService['markAllRead']>): void {
    this.busy.set(true);
    this.error.set('');
    request.pipe(timeout(15000), takeUntilDestroyed(this.destroy)).subscribe({
      next: () => { this.busy.set(false); this.load(this.page); },
      error: (e) => {
        this.busy.set(false);
        this.error.set(this.errors.getMessage(e, 'Unable to update notification. Please retry.'));
      },
    });
  }
}
