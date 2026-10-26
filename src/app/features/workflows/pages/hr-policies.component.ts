import { Component, DestroyRef, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable, Subject, finalize, forkJoin, takeUntil, timeout } from 'rxjs';
import { HRPolicyService } from '../services/hr-policy.service';
import { WorkflowService } from '../services/workflow.service';
import { DocumentGovernanceService } from '../../documents/services/document-governance.service';
import { DocumentRealtimeService } from '../../../core/realtime/document-realtime.service';
import { DocumentsService } from '../../documents/services/documents.service';
import { DocumentListRecord } from '../../documents/models/document.model';
import { Membership } from '../../documents/models/governance.model';
import { Principal, Run, closed } from '../models/workflow.model';
import {
  HRCategory,
  HRCategoryKind,
  HRComparison,
  HRContext,
  HRDraft,
  HRPolicy,
  HRPrecedence,
  HRResolution,
  HRVersion,
  hrLabel,
} from '../models/hr-policy.model';
import { HREvidenceComponent } from '../components/hr-evidence.component';
import { WorkflowAssignmentComponent } from '../components/workflow-assignment.component';
import { ToastService } from '../../../core/notifications/toast.service';

@Component({
  standalone: true,
  imports: [FormsModule, RouterLink, WorkflowAssignmentComponent, HREvidenceComponent],
  templateUrl: './hr-policies.component.html',
  styleUrls: ['../workflow.scss', './hr-policies.component.scss'],
})
export class HRPoliciesComponent {
  readonly api = inject(HRPolicyService);
  private readonly workflow = inject(WorkflowService);
  private readonly governance = inject(DocumentGovernanceService);
  private readonly realtime = inject(DocumentRealtimeService);
  private readonly documents = inject(DocumentsService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy = inject(DestroyRef);
  private readonly toasts = inject(ToastService);
  readonly versions = signal<HRVersion[]>([]);
  readonly policies = signal<HRPolicy[]>([]);
  readonly selected = signal<HRVersion | null>(null);
  readonly policy = signal<HRPolicy | null>(null);
  readonly categories = signal<HRCategory[]>([]);
  readonly sources = signal<DocumentListRecord[]>([]);
  readonly managedDepartments = signal<number[]>([]);
  private versionRequest = 0;
  workflowRevision: number | undefined;
  private submission: { signature: string; key: string } | null = null;
  sourcePage = 1;
  sourceNext = false;
  sourcePrevious = false;
  private readonly verifyFocus = () => this.verifyAccess();
  private verificationTimer?: ReturnType<typeof setInterval>;
  readonly memberships = signal<Membership[]>([]);
  readonly comparison = signal<HRComparison | null>(null);
  readonly resolution = signal<HRResolution | null>(null);
  readonly error = signal('');
  readonly pending = signal(false);
  readonly comparing = signal(false);
  readonly resolving = signal(false);
  readonly reviewRun = signal<Run | null>(null);
  readonly categoryLoading = signal(false);
  readonly sourceLoading = signal(false);
  readonly draftLoading = signal(false);
  private userId = 0;
  readonly loading = signal(false);
  readonly admin = signal(false);
  readonly manager = signal(false);
  readonly precedence = signal<HRPrecedence | null>(null);
  readonly label = hrLabel;
  page = 1;
  next = false;
  previous = false;
  draftPage = 1;
  draftNext = false;
  draftPrevious = false;
  categoryPage = 1;
  categoryNext = false;
  title = '';
  code = '';
  category = '';
  department: number | null = null;
  draft: HRDraft = {};
  reviewer: Principal | null = null;
  approver: Principal | null = null;
  confirmed = false;
  compareUuid = '';
  context: HRContext = {};
  taxonomyName = '';
  taxonomyCode = '';
  taxonomyKind: HRCategoryKind = 'policy';
  private epoch = 0;
  private readonly cancel = new Subject<void>();
  private uuid = '';
  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroy)).subscribe((params) => {
      this.uuid = params.get('uuid') || '';
      this.clear();
      this.reload();
    });
    for (const events of [this.governance.changes$, this.realtime.revoked$, this.api.revoked$])
      events
        .pipe(takeUntilDestroyed(this.destroy))
        .subscribe(() => this.clear('Access changed. Reload to verify permissions.'));
    window.addEventListener('focus', this.verifyFocus);
    this.verificationTimer = setInterval(() => {
      if (document.visibilityState === 'visible') this.verifyAccess();
    }, 60000);
    this.destroy.onDestroy(() => {
      window.removeEventListener('focus', this.verifyFocus);
      clearInterval(this.verificationTimer);
      this.clear();
      this.cancel.complete();
    });
  }
  clear(message = ''): void {
    this.comparing.set(false);
    this.resolving.set(false);
    this.reviewRun.set(null);
    this.categoryLoading.set(false);
    this.sourceLoading.set(false);
    this.draftLoading.set(false);
    this.userId = 0;
    this.epoch++;
    this.versionRequest++;
    this.cancel.next();
    this.sources.set([]);
    this.managedDepartments.set([]);
    this.workflowRevision = undefined;
    this.reviewRun.set(null);
    this.submission = null;
    this.next = false;
    this.previous = false;
    this.draftNext = false;
    this.draftPrevious = false;
    this.categoryNext = false;
    this.sourceNext = false;
    this.sourcePrevious = false;
    this.versions.set([]);
    this.policies.set([]);
    this.selected.set(null);
    this.policy.set(null);
    this.categories.set([]);
    this.memberships.set([]);
    this.comparison.set(null);
    this.resolution.set(null);
    this.admin.set(false);
    this.manager.set(false);
    this.precedence.set(null);
    this.draft = {};
    this.title = '';
    this.code = '';
    this.category = '';
    this.department = null;
    this.context = {};
    this.reviewer = null;
    this.approver = null;
    this.confirmed = false;
    this.compareUuid = '';
    this.taxonomyName = '';
    this.taxonomyCode = '';
    this.error.set(message);
    this.loading.set(false);
    this.pending.set(false);
  }
  private read<T>(request: Observable<T>, accept: (value: T) => void, settled?: () => void): void {
    const epoch = this.epoch;
    request
      .pipe(
        timeout(15000),
        takeUntil(this.cancel),
        takeUntilDestroyed(this.destroy),
        finalize(() => {
          if (epoch === this.epoch) settled?.();
        }),
      )
      .subscribe({
        next: (value) => {
          if (epoch === this.epoch) accept(value);
        },
        error: (error) => {
          if (epoch !== this.epoch) return;
          this.loading.set(false);
          if (error instanceof HttpErrorResponse && [401, 403, 404].includes(error.status))
            this.clear(this.api.message(error));
          else this.error.set(this.api.message(error));
        },
      });
  }
  reload(): void {
    this.clear();
    this.loading.set(true);
    this.read(this.api.versions(this.page, this.uuid || undefined), (result) => {
      this.versions.set(result.results);
      this.next = !!result.next;
      this.previous = !!result.previous;
      this.loading.set(false);
      this.realtime.subscribeDocuments(result.results.map((v) => v.document_uuid));
    });
    this.loadCategories(1);
    this.read(
      forkJoin({ profile: this.workflow.profile(), memberships: this.governance.memberships() }),
      (result) => {
        this.userId = result.profile.id;
        this.memberships.set(result.memberships.filter((m) => m.is_active));
        this.admin.set(!!result.profile.is_superuser || ['company_admin', 'platform_admin'].includes(result.profile.role));
        this.managedDepartments.set(
          result.memberships
            .filter(
              (m) => m.is_active && m.user === result.profile.id && m.role === 'department_admin',
            )
            .map((m) => m.department),
        );
        this.manager.set(this.admin() || this.managedDepartments().length > 0);
        if (this.manager()) {
          this.loadSources(1);
          this.loadDrafts();
          if (this.uuid)
            this.read(this.api.policy(this.uuid), (policy) => this.selectPolicy(policy));
        }
        if (this.admin()) this.read(this.api.precedence(), (value) => this.precedence.set(value));
      },
    );
  }
  loadCategories(page: number): void {
    if (this.categoryLoading()) return;
    this.categoryLoading.set(true);
    this.read(
      this.api.categories(page),
      (result) => {
        this.categories.set(
          page === 1 ? result.results : [...this.categories(), ...result.results],
        );
        this.categoryPage = page;
        this.categoryNext = !!result.next;
      },
      () => this.categoryLoading.set(false),
    );
  }
  loadDrafts(): void {
    if (this.draftLoading()) return;
    this.draftLoading.set(true);
    this.read(
      this.api.policies(this.draftPage),
      (result) => {
        this.policies.set(result.results);
        this.draftNext = !!result.next;
        this.draftPrevious = !!result.previous;
      },
      () => this.draftLoading.set(false),
    );
  }
  sourceChoicePresent(): boolean {
    return this.sources().some((source) => source.uuid === this.draft.document_uuid);
  }
  comparisonChoices(): HRVersion[] {
    const selected = this.selected();
    if (!selected) return [];
    return this.versions().filter(
      (v) => v.policy_uuid === selected.policy_uuid && v.uuid !== selected.uuid,
    );
  }
  supersessionChoices(): HRVersion[] {
    const policy = this.policy();
    return policy ? this.versions().filter((v) => v.policy_uuid === policy.uuid) : [];
  }
  newDraft(): void {
    if (this.pending()) return;
    this.policy.set(null);
    this.reviewRun.set(null);
    this.workflowRevision = undefined;
    this.submission = null;
    this.draft = {};
    this.title = '';
    this.code = '';
    this.category = '';
    this.department = null;
    this.reviewer = null;
    this.approver = null;
    this.confirmed = false;
  }
  selectPolicy(policy: HRPolicy): void {
    this.policy.set(policy);
    this.draft = structuredClone(policy.draft);
    this.workflowRevision = undefined;
    this.reviewRun.set(null);
    if (policy.review_run_uuid)
      this.read(this.workflow.run(policy.review_run_uuid), (run) => {
        if (this.policy()?.uuid === policy.uuid) {
          this.workflowRevision = run.revision;
          this.reviewRun.set(run);
        }
      });
    this.title = policy.title;
    this.code = policy.code;
    this.category = policy.category_uuid;
    this.department = policy.department;
    this.confirmed = false;
    this.reviewer = null;
    this.approver = null;
    if (policy.draft.document_uuid) this.realtime.subscribeDocuments([policy.draft.document_uuid]);
  }
  verifyAccess(): void {
    if (this.pending()) return;
    this.read(
      forkJoin({ profile: this.workflow.profile(), memberships: this.governance.memberships() }),
      (result) => {
        const admin = !!result.profile.is_superuser || ['company_admin', 'platform_admin'].includes(result.profile.role);
        const departments = result.memberships
          .filter(
            (m) => m.is_active && m.user === result.profile.id && m.role === 'department_admin',
          )
          .map((m) => m.department);
        if (
          admin !== this.admin() ||
          JSON.stringify([...departments].sort()) !==
            JSON.stringify([...this.managedDepartments()].sort())
        ) {
          this.clear(
            'Permissions changed. Protected content and drafts were cleared. Refresh access to continue.',
          );
        }
      },
    );
    this.read(this.api.versions(this.page, this.uuid || undefined), (result) => {
      this.versions.set(result.results);
      this.next = !!result.next;
      this.previous = !!result.previous;
    });
    if (this.manager()) this.loadDrafts();
    if (this.resolution())
      this.read(this.api.resolve(this.context), (value) => this.resolution.set(value));
    const comparison = this.comparison();
    if (comparison) this.read(this.api.version(comparison.right_version_uuid), () => {});
    const selected = this.selected();
    if (selected)
      this.read(this.api.version(selected.uuid), (fresh) => {
        if (this.selected()?.uuid === fresh.uuid && fresh.revision !== selected.revision) {
          this.selected.set(fresh);
          this.comparison.set(null);
        }
      });
    const policy = this.policy();
    if (policy)
      this.read(this.api.policy(policy.uuid), (fresh) => {
        if (this.policy()?.uuid === fresh.uuid && fresh.revision !== policy.revision) {
          this.selectPolicy(fresh);
          this.toasts.warning('Policy changed. Latest draft reloaded.');
        }
      });
  }
  loadSources(page: number): void {
    if (this.sourceLoading()) return;
    this.sourceLoading.set(true);
    this.read(
      this.documents.getInternalDocumentPage(page),
      (result) => {
        this.sources.set(result.results);
        this.sourcePage = page;
        this.sourceNext = !!result.next;
        this.sourcePrevious = !!result.previous;
        this.realtime.subscribeDocuments(result.results.map((source) => source.uuid));
      },
      () => this.sourceLoading.set(false),
    );
  }
  canManageDepartment(department: number | null): boolean {
    return this.admin() || (department !== null && this.managedDepartments().includes(department));
  }
  canEditDraft(): boolean {
    const policy = this.policy();
    const run = this.reviewRun();
    if (!policy) return this.canManageDepartment(this.department);
    if (!policy.review_run_uuid) return this.canManageDepartment(policy.department);
    if (!run) return false;
    return closed(run)
      ? this.canManageDepartment(policy.department)
      : !!run.capabilities.review &&
          ['review_required', 'exception'].includes(run.status) &&
          ['review_policy', 'ingest_policy'].includes(run.current_step || '');
  }
  canSubmitDraft(): boolean {
    const policy = this.policy();
    return (
      !!policy && (!policy.review_run_uuid || (!!this.reviewRun() && closed(this.reviewRun()!)))
    );
  }
  scopeDepartments(): Membership[] {
    const seen = new Set<number>();
    return this.memberships().filter((m) => {
      if (seen.has(m.department) || (!this.admin() && m.user !== this.userId)) return false;
      seen.add(m.department);
      return true;
    });
  }
  availableDepartments(): Membership[] {
    const seen = new Set<number>();
    return this.memberships().filter((m) => {
      if (
        seen.has(m.department) ||
        (!this.admin() && !this.managedDepartments().includes(m.department))
      )
        return false;
      seen.add(m.department);
      return true;
    });
  }
  selectVersion(uuid: string): void {
    const request = ++this.versionRequest;
    this.selected.set(null);
    this.comparison.set(null);
    this.compareUuid = '';
    this.read(this.api.version(uuid), (value) => {
      if (request !== this.versionRequest) return;
      this.selected.set(value);
      this.realtime.subscribeDocuments([value.document_uuid]);
    });
  }
  move(delta: number): void {
    if (this.loading() || this.pending()) return;
    this.page = Math.max(1, this.page + delta);
    this.reload();
  }
  private mutate<T>(request: Observable<T>, accept: (value: T) => void): void {
    if (this.pending()) return;
    this.pending.set(true);
    this.error.set('');
    const epoch = this.epoch;
    request
      .pipe(timeout(20000), takeUntil(this.cancel), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (value) => {
          if (epoch !== this.epoch) return;
          this.pending.set(false);
          accept(value);
        },
        error: (error) => {
          if (epoch !== this.epoch) return;
          this.pending.set(false);
          const message = this.api.message(error);
          if (error instanceof HttpErrorResponse && error.status === 409) {
            this.reload();
            this.error.set(message);
          } else if (error instanceof HttpErrorResponse && [401, 403, 404].includes(error.status))
            this.clear(message);
          else this.error.set(message);
        },
      });
  }
  save(): void {
    if (!this.manager() || this.categoryNext || this.categoryLoading() || !this.canEditDraft())
      return;
    const policy = this.policy();
    if (policy)
      this.mutate(
        this.api.edit(policy.uuid, policy.revision, this.draft, this.workflowRevision),
        (value) => {
          this.selectPolicy(value);
          this.loadDrafts();
        },
      );
    else if (this.title.trim() && this.code.trim() && this.category)
      this.mutate(
        this.api.create({
          title: this.title.trim(),
          code: this.code.trim(),
          category_uuid: this.category,
          department: this.department,
          draft: this.draft,
        }),
        (value) => {
          this.selectPolicy(value);
          this.loadDrafts();
        },
      );
  }
  index(): void {
    const policy = this.policy();
    if (!policy) return;
    this.mutate(this.api.index(policy.uuid, policy.revision), (result) =>
      result.indexed ? this.toasts.success('Source indexed for review.') : this.toasts.warning('Source is not indexed.'),
    );
  }
  submit(): void {
    const policy = this.policy();
    if (!policy || !this.canSubmitDraft() || !this.reviewer || !this.approver || !this.confirmed)
      return;
    const signature = JSON.stringify({
      uuid: policy.uuid,
      revision: policy.revision,
      reviewer: this.reviewer,
      approver: this.approver,
    });
    if (this.submission?.signature !== signature)
      this.submission = { signature, key: crypto.randomUUID() };
    this.mutate(
      this.api.submit(policy.uuid, {
        revision: policy.revision,
        reviewer: this.reviewer,
        approver: this.approver,
        idempotency_key: this.submission!.key,
      }),
      (run) => {
        this.policy.set({ ...policy, review_run_uuid: run.uuid });
        this.reviewRun.set(run);
        this.workflowRevision = run.revision;
        this.submission = null;
        this.confirmed = false;
        this.toasts.success('Review started. Complete review and approval in the workflow.');
      },
    );
  }
  retire(): void {
    const version = this.selected();
    if (!version || !this.confirmed || !this.canManageDepartment(version.department)) return;
    this.mutate(this.api.retire(version.uuid, version.revision), (value) => {
      this.selected.set(value);
      this.versions.update((versions) =>
        versions.map((version) => (version.uuid === value.uuid ? value : version)),
      );
      this.comparison.set(null);
      this.resolution.set(null);
      this.confirmed = false;
      this.toasts.success('Version retired. No predecessor has been automatically activated.');
    });
  }
  resolve(): void {
    if (this.resolving() || this.pending()) return;
    this.resolving.set(true);
    this.resolution.set(null);
    this.read(
      this.api.resolve(this.context),
      (value) => this.resolution.set(value),
      () => this.resolving.set(false),
    );
  }
  compare(): void {
    const version = this.selected();
    if (!version || !this.compareUuid || this.comparing() || this.pending()) return;
    this.comparing.set(true);
    const other = this.compareUuid;
    this.comparison.set(null);
    this.read(
      this.api.compare(version.uuid, other),
      (result) => {
        if (this.selected()?.uuid === version.uuid && this.compareUuid === other)
          this.comparison.set(result);
      },
      () => this.comparing.set(false),
    );
  }
  export(): void {
    const version = this.selected();
    if (!version) return;
    this.mutate(this.api.export(version.uuid), (response) => {
      if (!response.body) return;
      const url = URL.createObjectURL(response.body);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'hr-policy-version.json';
      link.click();
      URL.revokeObjectURL(url);
    });
  }
  choices(kind: HRCategoryKind): HRCategory[] {
    return this.categories().filter((c) => c.kind === kind && c.is_active);
  }
  createCategory(): void {
    if (!this.admin() || !this.taxonomyName.trim() || !this.taxonomyCode.trim()) return;
    this.mutate(
      this.api.createCategory({
        kind: this.taxonomyKind,
        name: this.taxonomyName.trim(),
        code: this.taxonomyCode.trim(),
      }),
      () => {
        this.taxonomyName = '';
        this.taxonomyCode = '';
        this.loadCategories(1);
      },
    );
  }
  deactivate(category: HRCategory): void {
    if (!this.admin() || category.scope !== 'company') return;
    this.mutate(this.api.deactivate(category.uuid), () => this.loadCategories(1));
  }
  reorder(index: number, delta: number): void {
    const value = this.precedence();
    if (!value) return;
    const order = [...value.precedence];
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    this.precedence.set({ ...value, precedence: order });
  }
  savePrecedence(): void {
    const value = this.precedence();
    if (!this.admin() || !value) return;
    this.mutate(this.api.savePrecedence(value), (result) => {
      this.precedence.set(result);
      this.toasts.success('Company precedence saved.');
    });
  }
}
