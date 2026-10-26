import { Injectable, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, Subject, forkJoin, takeUntil, timeout, finalize } from 'rxjs';
import { FinanceAuditService } from './finance-audit.service';
import { WorkflowService } from './workflow.service';
import { DocumentGovernanceService } from '../../documents/services/document-governance.service';
import { DocumentRealtimeService } from '../../../core/realtime/document-realtime.service';
import { FinanceAudit, FinanceDetail, FinanceLibrary } from '../models/finance.model';
import { Page, Run, closed } from '../models/workflow.model';
import { Membership } from '../../documents/models/governance.model';
import { ToastService } from '../../../core/notifications/toast.service';
@Injectable()
export class FinanceWorkspaceStore {
  readonly api = inject(FinanceAuditService);
  readonly workflow = inject(WorkflowService);
  private governance = inject(DocumentGovernanceService);
  readonly realtime = inject(DocumentRealtimeService);
  readonly destroy = inject(DestroyRef);
  private readonly toasts = inject(ToastService);
  readonly cancel$ = new Subject<void>();
  readonly refreshed$ = new Subject<void>();
  readonly audit = signal<FinanceDetail | null>(null);
  readonly run = signal<Run | null>(null);
  readonly audits = signal<FinanceAudit[]>([]);
  readonly members = signal<Membership[]>([]);
  readonly library = signal<FinanceLibrary | null>(null);
  readonly pending = signal(false);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly admin = signal(false);
  readonly user = signal(0);
  id = '';
  page = 1;
  next = false;
  previous = false;
  private epoch = 0;
  private keys = new Map<string, { signature: string; key: string }>();
  private focus = () => {
    if (this.audit() && !this.pending()) this.verify();
  };
  private timer: ReturnType<typeof setInterval>;
  constructor() {
    for (const event of [this.governance.changes$, this.realtime.revoked$])
      event
        .pipe(takeUntilDestroyed(this.destroy))
        .subscribe(() =>
          this.clear(
            'Access changed. Protected finance content was cleared. Reload to verify access.',
          ),
        );
    window.addEventListener('focus', this.focus);
    this.timer = setInterval(() => {
      if (document.visibilityState === 'visible') this.focus();
    }, 60000);
    this.destroy.onDestroy(() => {
      window.removeEventListener('focus', this.focus);
      clearInterval(this.timer);
      this.clear();
      this.cancel$.complete();
      this.refreshed$.complete();
    });
  }
  clear(message = '') {
    this.epoch++;
    this.audit.set(null);
    this.cancel$.next();
    this.run.set(null);
    this.audits.set([]);
    this.members.set([]);
    this.library.set(null);
    this.keys.clear();
    this.admin.set(false);
    this.user.set(0);
    this.pending.set(false);
    this.loading.set(false);
    this.error.set(message);
  }
  read<T>(request: Observable<T>, accept: (value: T) => void, finish?: () => void) {
    const epoch = this.epoch;
    return request
      .pipe(
        timeout(30000),
        takeUntil(this.cancel$),
        takeUntilDestroyed(this.destroy),
        finalize(() => {
          if (epoch === this.epoch) finish?.();
        }),
      )
      .subscribe({
        next: (v) => {
          if (epoch === this.epoch) accept(v);
        },
        error: (e) => {
          if (epoch === this.epoch) this.fail(e);
        },
      });
  }
  fail(error: unknown) {
    const message = this.api.message(error);
    if (error instanceof HttpErrorResponse && [401, 403, 404].includes(error.status))
      this.clear(message);
    else if (error instanceof HttpErrorResponse && error.status === 409) {
      this.pending.set(false);
      this.keys.clear();
      this.refresh();
      this.error.set(message);
    } else {
      this.error.set(message);
      this.loading.set(false);
    }
  }
  reload(id = this.id) {
    if (this.pending() && id === this.id) return;
    this.id = id;
    this.clear();
    this.loading.set(true);
    this.read(
      forkJoin({
        profile: this.workflow.profile(),
        members: this.governance.memberships(),
        library: this.api.library(),
      }),
      (v) => {
        this.user.set(v.profile.id);
        this.admin.set(!!v.profile.is_superuser || ['company_admin', 'platform_admin'].includes(v.profile.role));
        this.members.set(v.members.filter((m) => m.is_active));
        this.library.set(v.library);
        if (this.id) this.refresh();
        else this.list();
      },
    );
  }
  list(page = this.page) {
    this.page = page;
    this.loading.set(true);
    this.read(this.api.list(page), (p) => {
      this.audits.set(p.results);
      this.next = !!p.next;
      this.previous = !!p.previous;
      this.loading.set(false);
    });
  }
  refresh() {
    if (!this.id) return;
    this.epoch++;
    this.cancel$.next();
    this.loading.set(true);
    this.read(this.api.detail(this.id), (a) => {
      this.audit.set(a);
      if (a.run_uuid)
        this.read(this.workflow.run(a.run_uuid), (r) => {
          this.run.set(r);
          this.realtime.subscribeDocuments(r.documents);
          this.loading.set(false);
          this.refreshed$.next();
        });
      else {
        this.run.set(null);
        this.loading.set(false);
        this.refreshed$.next();
      }
    });
  }
  private verify() {
    this.read(this.api.detail(this.id), (a) => {
      if (a.revision !== this.audit()?.revision || a.status !== this.audit()?.status) {
        this.toasts.warning('The audit changed. Current server state was refreshed.');
        this.refresh();
      }
    });
  }
  departments(managed = false) {
    return this.members().filter(
      (m, i, a) =>
        a.findIndex((x) => x.department === m.department) === i &&
        (!managed || this.canManage(m.department)),
    );
  }
  canManage(department: number | null) {
    return (
      this.admin() ||
      (!!department &&
        this.members().some(
          (m) =>
            m.user === this.user() && m.department === department && m.role === 'department_admin',
        ))
    );
  }
  canCreate() {
    return (
      this.admin() ||
      this.members().some((m) => m.user === this.user() && m.role === 'department_admin')
    );
  }
  inactive() {
    const a = this.audit(),
      r = this.run();
    return !!a && (a.status === 'draft' || !r || closed(r));
  }
  canConfigure() {
    const a = this.audit();
    return !!a && this.inactive() && this.canManage(a.department);
  }
  canReview() {
    const r = this.run();
    return (
      !!r &&
      r.status === 'review_required' &&
      r.current_step === 'review_audit' &&
      r.capabilities.review
    );
  }
  canEdit() {
    return this.canConfigure() || this.canReview();
  }
  revision() {
    return this.audit()?.revision ?? 0;
  }
  key(operation: string, payload: unknown) {
    const signature = JSON.stringify(payload);
    let current = this.keys.get(operation);
    if (!current || current.signature !== signature) {
      current = { signature, key: crypto.randomUUID() };
      this.keys.set(operation, current);
    }
    return current.key;
  }
  mutate<T>(request: () => Observable<T>, done?: (v: T) => void) {
    if (this.pending() || this.loading()) return;
    this.pending.set(true);
    this.error.set('');
    this.read(
      request(),
      (v) => {
        this.keys.clear();
        this.pending.set(false);
        done?.(v);
        if (this.id) this.refresh();
        else this.list();
      },
      () => this.pending.set(false),
    );
  }
}
export class FinanceCollection<T> {
  private readonly destroy = inject(DestroyRef);
  readonly rows = signal<T[]>([]);
  readonly loading = signal(false);
  page = 1;
  next = false;
  previous = false;
  count = 0;
  private sequence = 0;
  constructor(
    readonly store: FinanceWorkspaceStore,
    public path: string,
  ) {
    this.destroy.onDestroy(() => this.rows.set([]));
  }
  load(page = 1, filters: Record<string, string> = {}) {
    const sequence = ++this.sequence;
    this.page = page;
    this.rows.set([]);
    this.loading.set(true);
    this.store.read(
      this.store.api
        .page<T>(this.store.id, this.path, page, filters)
        .pipe(takeUntilDestroyed(this.destroy)),
      (p) => {
        if (sequence !== this.sequence) return;
        this.rows.set(p.results);
        this.next = !!p.next;
        this.previous = !!p.previous;
        this.count = p.count;
        this.loading.set(false);
      },
      () => this.loading.set(false),
    );
  }
}
