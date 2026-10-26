import { Injectable, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, Subject, forkJoin, finalize, takeUntil, timeout } from 'rxjs';
import { ComplianceService } from './compliance.service';
import { WorkflowService } from './workflow.service';
import { DocumentGovernanceService } from '../../documents/services/document-governance.service';
import { DocumentRealtimeService } from '../../../core/realtime/document-realtime.service';
import { Membership } from '../../documents/models/governance.model';
import { Detail, Framework, Control, Assessment } from '../models/compliance.model';
import { Run, CommandInput, Finding, Exception } from '../models/workflow.model';
@Injectable()
export class ComplianceWorkspaceStore {
  readonly api = inject(ComplianceService);
  readonly workflow = inject(WorkflowService);
  readonly realtime = inject(DocumentRealtimeService);
  private gov = inject(DocumentGovernanceService);
  private destroy = inject(DestroyRef);
  readonly detail = signal<Detail | null>(null);
  readonly run = signal<Run | null>(null);
  readonly frameworks = signal<Framework[]>([]);
  readonly controls = signal<Control[]>([]);
  readonly assessments = signal<Assessment[]>([]);
  readonly findings = signal<Finding[]>([]);
  readonly exceptions = signal<Exception[]>([]);
  readonly members = signal<Membership[]>([]);
  readonly admin = signal(false);
  readonly user = signal(0);
  readonly pending = signal(false);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly cancel$ = new Subject<void>();
  readonly cleared$ = new Subject<void>();
  readonly refreshed$ = new Subject<void>();
  id = '';
  mode = 'assessments';
  page = 1;
  next = false;
  previous = false;
  count = 0;
  private epoch = 0;
  private keys = new Map<string, { signature: string; key: string }>();
  private focus = () => {
    if (this.id && this.mode === 'assessments' && !this.pending() && !this.loading())
      this.refresh();
  };
  private timer: ReturnType<typeof setInterval>;
  constructor() {
    for (const event of [this.gov.changes$, this.realtime.revoked$])
      event
        .pipe(takeUntilDestroyed(this.destroy))
        .subscribe(() =>
          this.clear(
            'Access changed. Protected Compliance content was cleared. Reload to verify access.',
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
      this.cleared$.complete();
      this.refreshed$.complete();
    });
  }
  clear(message = '') {
    this.epoch++;
    this.cancel$.next();
    this.detail.set(null);
    this.run.set(null);
    this.frameworks.set([]);
    this.controls.set([]);
    this.assessments.set([]);
    this.findings.set([]);
    this.exceptions.set([]);
    this.members.set([]);
    this.admin.set(false);
    this.user.set(0);
    this.keys.clear();
    this.pending.set(false);
    this.loading.set(false);
    this.notice.set('');
    this.error.set(message);
    this.cleared$.next();
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
  fail(e: unknown) {
    const message = this.api.message(e);
    if (e instanceof HttpErrorResponse && [401, 403, 404].includes(e.status)) {
      this.clear(message);
      return;
    }
    if (e instanceof HttpErrorResponse && e.status === 409) {
      this.keys.clear();
      this.pending.set(false);
      this.reload(this.mode, this.id);
      this.error.set(message);
      return;
    }
    this.error.set(message);
    this.pending.set(false);
    this.loading.set(false);
  }
  reload(mode = this.mode, id = this.id) {
    this.mode = mode;
    this.id = id;
    this.clear();
    this.loading.set(true);
    this.read(
      forkJoin({ profile: this.workflow.profile(), members: this.gov.memberships() }),
      (v) => {
        this.admin.set(!!v.profile.is_superuser || ['company_admin', 'platform_admin'].includes(v.profile.role));
        this.user.set(v.profile.id);
        this.members.set(v.members.filter((m) => m.is_active));
        if (mode === 'assessments' && id) this.refresh();
        else if (!id) this.list();
        else {
          this.loading.set(false);
          this.refreshed$.next();
        }
      },
    );
  }
  list(page = 1) {
    this.page = page;
    this.loading.set(true);
    if (this.mode === 'frameworks')
      this.read(this.api.frameworks(page), (v) => {
        this.frameworks.set(v.results);
        this.paging(v);
      });
    else if (this.mode === 'controls')
      this.read(this.api.controls(page), (v) => {
        this.controls.set(v.results);
        this.paging(v);
      });
    else
      this.read(this.api.assessments(page), (v) => {
        this.assessments.set(v.results);
        this.paging(v);
      });
  }
  private paging(v: { next: string | null; previous: string | null; count: number }) {
    this.next = !!v.next;
    this.previous = !!v.previous;
    this.count = v.count;
    this.loading.set(false);
    this.refreshed$.next();
  }
  refresh() {
    if (!this.id) return;
    this.epoch++;
    this.cancel$.next();
    this.detail.set(null);
    this.run.set(null);
    this.findings.set([]);
    this.exceptions.set([]);
    this.cleared$.next();
    this.loading.set(true);
    this.read(this.api.assessment(this.id), (a) => {
      this.detail.set(a);
      this.realtime.subscribeDocuments(a.scope.document_uuids);
      if (a.run_uuid)
        this.read(
          forkJoin({
            run: this.workflow.run(a.run_uuid),
            findings: this.workflow.findings(a.run_uuid),
            exceptions: this.workflow.exceptions(a.run_uuid),
          }),
          (v) => {
            this.run.set(v.run);
            this.findings.set(v.findings);
            this.exceptions.set(v.exceptions);
            this.loading.set(false);
            this.refreshed$.next();
          },
        );
      else {
        this.loading.set(false);
        this.refreshed$.next();
      }
    });
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
  canReview() {
    const r = this.run();
    return (
      !!r &&
      r.status === 'review_required' &&
      r.current_step === 'review_assessment' &&
      r.capabilities.review
    );
  }
  canLink() {
    const a = this.detail();
    return !!a && (!a.run_uuid ? this.canManage(a.department) : this.canReview());
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
  mutate<T>(request: () => Observable<T>, done?: (v: T) => void, refresh = true) {
    if (this.pending() || this.loading()) return;
    this.pending.set(true);
    this.error.set('');
    this.read(
      request(),
      (v) => {
        this.pending.set(false);
        this.keys.clear();
        done?.(v);
        if (refresh) {
          if (this.mode === 'assessments' && this.id) this.refresh();
          else if (!this.id) this.list(this.page);
          else this.refreshed$.next();
        }
      },
      () => this.pending.set(false),
    );
  }
  command(input: CommandInput) {
    const run = this.run();
    if (!run) return;
    const capability = input.action === 'accept' ? 'review' : input.action;
    if (!run.capabilities[capability as keyof Run['capabilities']]) return;
    const payload = { ...input, expected_revision: run.revision };
    this.mutate(() =>
      this.workflow.command(run.uuid, {
        ...payload,
        idempotency_key: this.key('workflow', payload),
      }),
    );
  }
}
