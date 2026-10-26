import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, takeUntil, timeout } from 'rxjs';
import { Page, Run, RunStatus, RUN_STATUSES, label } from '../models/workflow.model';
import { WorkflowService } from '../services/workflow.service';
import { WorkflowStatusComponent } from '../components/workflow-status.component';
import { AiApiErrorMessageService } from '../../ai-chat/services/ai-api-error-message.service';
import { DocumentGovernanceService } from '../../documents/services/document-governance.service';
import { DocumentRealtimeService } from '../../../core/realtime/document-realtime.service';
@Component({
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, WorkflowStatusComponent],
  templateUrl: './workflow-runs.component.html',
  styleUrls: ['../workflow.scss'],
})
export class WorkflowRunsComponent {
  private readonly api = inject(WorkflowService);
  private readonly errors = inject(AiApiErrorMessageService);
  private readonly destroy = inject(DestroyRef);
  private readonly governance = inject(DocumentGovernanceService);
  private readonly realtime = inject(DocumentRealtimeService);
  readonly result = signal<Page<Run> | null>(null);
  readonly names = signal<Record<string, string>>({});
  readonly loading = signal(false);
  readonly error = signal('');
  readonly statuses = RUN_STATUSES;
  readonly label = label;
  status: RunStatus | '' = '';
  page = 1;
  private generation = 0;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly loadCancel = new Subject<void>();
  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroy)).subscribe((params) => {
      const status = params.get('status') || '';
      this.status = RUN_STATUSES.includes(status as RunStatus) ? (status as RunStatus) : '';
      const page = Number(params.get('page') || 1);
      this.load(Number.isSafeInteger(page) && page > 0 ? page : 1);
    });
    for (const event of [this.governance.changes$, this.realtime.revoked$])
      event.pipe(takeUntilDestroyed(this.destroy)).subscribe(() => {
        this.names.set({});
        this.load(this.page);
      });
  }
  filterChanged(status: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { status: status || null, page: null },
      queryParamsHandling: 'merge',
    });
  }
  changePage(page: number): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: page === 1 ? null : page },
      queryParamsHandling: 'merge',
    });
  }
  load(page = 1): void {
    this.loadCancel.next();
    const gen = ++this.generation;
    this.page = page;
    this.result.set(null);
    this.loading.set(true);
    this.error.set('');
    this.api
      .runs(page, this.status)
      .pipe(timeout(15000), takeUntil(this.loadCancel), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (r) => {
          if (gen !== this.generation) return;
          this.result.set(r);
          this.loading.set(false);
          this.realtime.subscribeDocuments(r.results.flatMap((x) => x.documents));
          for (const uuid of new Set(r.results.map((x) => x.definition_uuid)))
            this.api
              .definition(uuid)
              .pipe(timeout(15000), takeUntil(this.loadCancel), takeUntilDestroyed(this.destroy))
              .subscribe({
                next: (d) => {
                  if (gen === this.generation) this.names.update((n) => ({ ...n, [uuid]: d.name }));
                },
                error: () => {},
              });
        },
        error: (e) => {
          if (gen === this.generation) {
            this.error.set(this.errors.getMessage(e, 'Unable to load workflow runs.'));
            this.loading.set(false);
          }
        },
      });
  }
}
