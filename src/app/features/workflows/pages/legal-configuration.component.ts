import { ContractAreaNavComponent } from '../../contracts/components/contract-area-nav.component';
import { KeyValuePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable, Subject, forkJoin, takeUntil, timeout } from 'rxjs';
import { LegalClauseService } from '../services/legal-clause.service';
import { WorkflowService } from '../services/workflow.service';
import { DocumentGovernanceService } from '../../documents/services/document-governance.service';
import { DocumentRealtimeService } from '../../../core/realtime/document-realtime.service';
import { Membership } from '../../documents/models/governance.model';
import {
  ClauseType,
  TaxonomyInput,
  Playbook,
  PlaybookVersion,
  ClauseRule,
  FactKind,
  FactSpec,
  validRules,
} from '../models/legal-clause.model';
import { Page } from '../models/workflow.model';
import { LegalRuleEditorComponent } from '../components/legal-rule-editor.component';
import { ToastService } from '../../../core/notifications/toast.service';

@Component({
  standalone: true,
  imports: [ContractAreaNavComponent, FormsModule, RouterLink, LegalRuleEditorComponent, KeyValuePipe],
  templateUrl: './legal-configuration.component.html',
  styleUrls: ['../workflow.scss', '../components/legal.scss', './legal-playbook-editor.component.scss', './legal-operations-layout.scss'],
})
export class LegalConfigurationComponent {
  readonly api = inject(LegalClauseService);
  private readonly workflow = inject(WorkflowService);
  private readonly governance = inject(DocumentGovernanceService);
  private readonly realtime = inject(DocumentRealtimeService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy = inject(DestroyRef);
  private readonly toasts = inject(ToastService);
  readonly types = signal<ClauseType[]>([]);
  readonly books = signal<Playbook[]>([]);
  readonly book = signal<Playbook | null>(null);
  readonly history = signal<PlaybookVersion[]>([]);
  readonly selected = signal<PlaybookVersion | null>(null);
  readonly loading = signal(false);
  readonly pending = signal(false);
  readonly error = signal('');
  readonly memberships = signal<Membership[]>([]);
  readonly admin = signal(false);
  readonly canCreate = signal(false);
  readonly kinds: FactKind[] = ['text', 'decimal', 'date', 'boolean', 'enum'];
  page = 1;
  next = false;
  previous = false;
  versionPage = 1;
  versionNext = false;
  versionPrevious = false;
  mode = 'playbooks';
  uuid = '';
  name = '';
  description = '';
  department: number | null = null;
  documentTypes = 'contract';
  effectiveFrom = '';
  effectiveUntil = '';
  rules: ClauseRule[] = [];
  publishConfirmed = false;
  activationConfirmed = false;
  /** Explicit selection of a published version; active_version_uuid is only assigned on activation. */
  activationVersionUuid = '';
  taxonomyReady = false;
  taxonomyNext = false;
  taxonomyPage = 1;
  typeEditor: TaxonomyInput | null = null;
  typeUuid = '';
  aliases = '';
  typeDocuments = 'contract';
  facts: { key: string; type: FactKind; values: string }[] = [];
  /** Retain publish confirmation across the immediate server refresh, even if
   * the server normalizes values when freezing the version. */
  private recentPublish: { bookUuid: string; fingerprint: string; version: PlaybookVersion } | null = null;
  private generation = 0;
  private readonly cancel = new Subject<void>();
  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroy)).subscribe((p) => {
      this.uuid = p.get('uuid') || '';
      this.mode = this.route.snapshot.data['mode'] || 'playbooks';
      this.page = 1;
      this.reload();
    });
    for (const events of [this.governance.changes$, this.realtime.revoked$, this.api.revoked$])
      events
        .pipe(takeUntilDestroyed(this.destroy))
        .subscribe(() =>
          this.clear(
            'Access changed. Configuration and drafts were cleared. Reload to check permissions.',
          ),
        );
    this.destroy.onDestroy(() => {
      this.clear();
      this.cancel.complete();
    });
  }
  clear(message = ''): void {
    this.generation++;
    this.cancel.next();
    this.types.set([]);
    this.books.set([]);
    this.book.set(null);
    this.history.set([]);
    this.selected.set(null);
    this.memberships.set([]);
    this.admin.set(false);
    this.canCreate.set(false);
    this.typeEditor = null;
    this.facts = [];
    this.aliases = '';
    this.typeDocuments = 'contract';
    this.department = null;
    this.name = '';
    this.description = '';
    this.rules = [];
    this.effectiveFrom = '';
    this.effectiveUntil = '';
    this.publishConfirmed = false;
    this.activationConfirmed = false;
    this.activationVersionUuid = '';
    this.recentPublish = null;
    this.taxonomyReady = false;
    this.loading.set(false);
    this.pending.set(false);
    this.error.set(message);
  }
  reload(): void {
    this.clear();
    this.loading.set(true);
    const g = this.generation;
    forkJoin({ profile: this.workflow.profile(), memberships: this.governance.memberships() })
      .pipe(timeout(15000), takeUntil(this.cancel), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (v) => {
          if (g !== this.generation) return;
          this.admin.set(!!v.profile.is_superuser || ['company_admin', 'platform_admin'].includes(v.profile.role));
          this.memberships.set(
            v.memberships.filter(
              (m) =>
                m.is_active &&
                (this.admin() || (m.user === v.profile.id && m.role === 'department_admin')),
            ),
          );
          this.canCreate.set(
            this.admin() || this.memberships().some((m) => m.role === 'department_admin'),
          );
          this.loadContent();
        },
        error: (e) => this.fail(e),
      });
  }
  loadContent(): void {
    if (this.uuid) {
      forkJoin({
        book: this.api.playbook(this.uuid),
        history: this.api.versions(this.uuid, this.versionPage),
        types: this.api.taxonomy(),
      })
        .pipe(timeout(15000), takeUntil(this.cancel), takeUntilDestroyed(this.destroy))
        .subscribe({
          next: (v) => {
            this.book.set(v.book);
            this.applyDraft(v.book);
            this.history.set(v.history.results);
            // Publishing returns a version but does not activate it. Choose an actual
            // published version rather than relying on active_version_uuid.
            this.activationVersionUuid = this.chooseActivationVersion(v.book, this.availableVersions());
            this.versionNext = !!v.history.next;
            this.versionPrevious = !!v.history.previous;
            this.types.set(v.types.results);
            this.taxonomyNext = !!v.types.next;
            this.taxonomyReady = !v.types.next;
            this.taxonomyPage = 1;
            this.loading.set(false);
          },
          error: (e) => this.fail(e),
        });
    } else if (this.mode === 'taxonomy') {
      this.read(this.api.taxonomy(this.page), (v) => {
        this.types.set(v.results);
        this.next = !!v.next;
        this.previous = !!v.previous;
      });
    } else
      this.read(this.api.playbooks(this.page), (v) => {
        this.books.set(v.results);
        this.next = !!v.next;
        this.previous = !!v.previous;
      });
  }
  private read<T>(request: Observable<T>, accept: (v: T) => void): void {
    this.loading.set(true);
    request
      .pipe(timeout(15000), takeUntil(this.cancel), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (v) => {
          accept(v);
          this.loading.set(false);
        },
        error: (e) => this.fail(e),
      });
  }
  loadMoreTypes(): void {
    if (!this.taxonomyNext || this.loading()) return;
    this.read(this.api.taxonomy(++this.taxonomyPage), (v) => {
      this.types.update((rows) => [...rows, ...v.results]);
      this.taxonomyNext = !!v.next;
      this.taxonomyReady = !v.next;
    });
  }
  applyDraft(book: Playbook): void {
    this.name = book.name;
    this.description = book.description;
    this.rules = structuredClone(book.draft.rules || []);
    this.documentTypes = (book.draft.document_types || ['contract']).join(', ');
    this.effectiveFrom = book.draft.effective_from?.slice(0, 10) || '';
    this.effectiveUntil = book.draft.effective_until?.slice(0, 10) || '';
    this.publishConfirmed = false;
    this.activationConfirmed = false;
    this.selected.set(null);
  }
  manage(): boolean {
    const b = this.book();
    return (
      this.admin() ||
      (!!b &&
        b.department_id !== null &&
        this.memberships().some(
          (m) => m.department === b.department_id && m.role === 'department_admin',
        ))
    );
  }
  private mutate<T>(request: Observable<T>, accept: (v: T) => void): void {
    if (this.pending()) return;
    this.pending.set(true);
    this.error.set('');
    request
      .pipe(timeout(15000), takeUntil(this.cancel), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (v) => {
          this.pending.set(false);
          accept(v);
        },
        error: (e) => {
          this.pending.set(false);
          this.fail(e);
        },
      });
  }
  fail(error: unknown): void {
    const message = this.api.message(error);
    this.loading.set(false);
    if (error instanceof HttpErrorResponse && [401, 403, 404].includes(error.status)) {
      this.clear(message);
      return;
    }
    if (error instanceof HttpErrorResponse && error.status === 409) {
      this.typeEditor = null;
      this.loadContent();
    }
    this.error.set(message);
  }
  move(delta: number): void {
    if (this.pending() || this.loading()) return;
    this.page += delta;
    this.loadContent();
  }
  versions(delta: number): void {
    if (this.pending() || this.loading()) return;
    this.versionPage += delta;
    this.read(this.api.versions(this.uuid, this.versionPage), (v) => {
      this.history.set(v.results);
      this.activationVersionUuid = this.chooseActivationVersion(this.book(), this.availableVersions());
      this.activationConfirmed = false;
      this.versionNext = !!v.next;
      this.versionPrevious = !!v.previous;
    });
  }
  createBook(): void {
    if (!this.canCreate() || !this.name.trim() || this.pending()) return;
    if (
      !this.admin() &&
      (!this.department ||
        !this.memberships().some(
          (m) => m.department === this.department && m.role === 'department_admin',
        ))
    )
      return;
    this.mutate(
      this.api.createPlaybook({
        name: this.name.trim(),
        description: this.description.trim(),
        department: this.department,
        draft: {},
      }),
      () => {
        this.name = '';
        this.description = '';
        this.toasts.success('Playbook created. Open it to configure and publish its draft.');
        this.loadContent();
      },
    );
  }
  save(): void {
    const b = this.book();
    if (!b || !this.manage() || this.selected() || this.pending() || !this.draftDirty()) return;
    const blockers = this.draftIssues();
    if (blockers.length) {
      this.error.set('Resolve the draft validation issues below before saving.');
      return;
    }
    const from = this.effectiveFrom || undefined;
    const until = this.effectiveUntil || null;
    if (from && until && until <= from) {
      this.error.set('The effective end must follow the effective start.');
      return;
    }
    this.mutate(
      this.api.editDraft(b.uuid, {
        expected_revision: b.revision,
        name: this.name.trim(),
        description: this.description.trim(),
        draft: {
          rules: this.rules,
          document_types: this.csv(this.documentTypes),
          ...(from ? { effective_from: from } : {}),
          effective_until: until,
        },
      }),
      (v) => {
        this.book.set(v);
        this.applyDraft(v);
        this.toasts.success('Draft saved. Publication creates an immutable version.');
      },
    );
  }
  publish(): void {
    const b = this.book();
    if (!b || !this.manage() || this.selected() || this.pending() || this.matchingPublishedVersion()) return;
    const blockers = this.publishIssues();
    if (blockers.length) {
      this.error.set('Finish the publish checklist before publishing this playbook.');
      return;
    }
    this.mutate(this.api.publish(b.uuid, b.revision), (published) => {
      this.recentPublish = { bookUuid: b.uuid, fingerprint: this.draftFingerprint(), version: published };
      this.toasts.success('Immutable version published. Select a published version below to activate it.');
      this.versionPage = 1;
      this.activationConfirmed = false;
      this.loadContent();
    });
  }
  activate(active: boolean, version?: string): void {
    const b = this.book();
    if (!b || !this.manage() || this.selected() || this.pending() || !this.activationConfirmed) return;
    // The published version must be explicit on initial activation. The active
    // version field is null before the first activation, even after publishing.
    const chosen = version || this.activationVersionUuid;
    if (active) {
      if (!chosen || !this.availableVersions().some((item) => item.uuid === chosen)) {
        this.error.set('Choose a published version before activating the playbook.');
        return;
      }
      if (b.is_active && b.active_version_uuid === chosen) return;
    } else if (!b.is_active) {
      return;
    }
    this.mutate(this.api.activate(b.uuid, b.revision, active, active ? chosen : undefined), (updated) => {
      this.book.set(updated);
      this.activationVersionUuid = active ? (updated.active_version_uuid || chosen) : this.activationVersionUuid;
      this.activationConfirmed = false;
      this.toasts.success(active
        ? 'Published version activated for future analysis. Existing reviews keep their pinned versions.'
        : 'Playbook deactivated. Existing reviews keep their pinned policy versions.');
    });
  }

  private chooseActivationVersion(book: Playbook | null, versions: PlaybookVersion[]): string {
    if (!versions.length) return '';
    // Prefer the already-active version, otherwise default to the newest
    // published version present on this page.
    if (book?.is_active && versions.some((v) => v.uuid === book.active_version_uuid)) {
      return book.active_version_uuid || '';
    }
    return [...versions].sort((a, b) => b.number - a.number)[0].uuid;
  }

  /** A published version is not necessarily the active version. */
  matchingPublishedVersion(): PlaybookVersion | null {
    const b = this.book();
    if (!b || this.draftDirty() || this.selected()) return null;
    const docs = this.csv(this.documentTypes);
    const end = this.effectiveUntil || null;
    if (this.recentPublish?.bookUuid === b.uuid && this.recentPublish.fingerprint === this.draftFingerprint()) {
      return this.recentPublish.version;
    }
    return this.history().find((v) =>
      JSON.stringify(v.rules) === JSON.stringify(this.rules) &&
      JSON.stringify(v.document_types) === JSON.stringify(docs) &&
      (!this.effectiveFrom || v.effective_from?.slice(0, 10) === this.effectiveFrom) &&
      (v.effective_until?.slice(0, 10) || null) === end,
    ) || null;
  }

  private draftFingerprint(): string {
    return JSON.stringify({
      name: this.name,
      description: this.description,
      rules: this.rules,
      documentTypes: this.csv(this.documentTypes),
      effectiveFrom: this.effectiveFrom,
      effectiveUntil: this.effectiveUntil,
    });
  }

  activationVersion(): PlaybookVersion | null {
    return this.availableVersions().find((v) => v.uuid === this.activationVersionUuid) || null;
  }

  availableVersions(): PlaybookVersion[] {
    const versions = this.history();
    const recent = this.recentPublish;
    if (recent && recent.bookUuid === this.book()?.uuid && !versions.some((v) => v.uuid === recent.version.uuid)) {
      return [recent.version, ...versions];
    }
    return versions;
  }

  alreadyActive(): boolean {
    const b = this.book();
    return !!b?.is_active && !!b.active_version_uuid && b.active_version_uuid === this.activationVersionUuid;
  }
  inspect(v: PlaybookVersion): void {
    this.selected.set(v);
    this.rules = structuredClone(v.rules);
    this.publishConfirmed = false;
    this.activationConfirmed = false;
  }
  draft(): void {
    const b = this.book();
    if (b) this.applyDraft(b);
  }
  newType(type?: ClauseType): void {
    if (!this.admin() || type?.scope === 'system') return;
    this.typeUuid = type?.uuid || '';
    this.typeEditor = type
      ? structuredClone(type)
      : {
          code: '',
          name: '',
          category: '',
          description: '',
          aliases: [],
          document_types: ['contract'],
          fact_schema: {},
          is_active: true,
        };
    this.aliases = (type?.aliases || []).join(', ');
    this.typeDocuments = (type?.document_types || ['contract']).join(', ');
    this.facts = Object.entries(type?.fact_schema || {}).map(([key, s]) => ({
      key,
      type: s.type,
      values: (s.values || []).join(', '),
    }));
  }
  saveType(): void {
    const t = this.typeEditor;
    if (
      !t ||
      !this.admin() ||
      !t.name.trim() ||
      !t.category.trim() ||
      !/^[a-z][a-z0-9_]{0,79}$/.test(t.code)
    )
      return;
    const schema: Record<string, FactSpec> = {};
    for (const f of this.facts) {
      if (
        !/^[a-z][a-z0-9_]{0,79}$/.test(f.key) ||
        schema[f.key] ||
        (f.type === 'enum' && !this.csv(f.values).length)
      ) {
        this.error.set('Fact names must be unique stable codes. Enum fields need allowed values.');
        return;
      }
      schema[f.key] = {
        type: f.type,
        ...(f.type === 'enum' ? { values: this.csv(f.values) } : {}),
      };
    }
    const value: TaxonomyInput = {
      code: t.code,
      name: t.name.trim(),
      category: t.category.trim(),
      description: t.description,
      aliases: this.csv(this.aliases),
      document_types: this.csv(this.typeDocuments),
      fact_schema: schema,
      is_active: t.is_active,
    };
    this.mutate(
      this.typeUuid ? this.api.updateType(this.typeUuid, value) : this.api.createType(value),
      () => {
        this.typeEditor = null;
        this.facts = [];
        this.toasts.success(
          'Company clause type saved. Published taxonomy snapshots remain immutable.',
        );
        this.loadContent();
      },
    );
  }
  csv(value: string): string[] {
    return [
      ...new Set(
        value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ];
  }
  /** Actionable validation, without changing the server's governance checks. */
  draftIssues(): string[] {
    if (!this.book() || this.selected()) return [];
    const issues: string[] = [];
    if (!this.manage()) issues.push('You do not have permission to edit this playbook.');
    if (!this.taxonomyReady) issues.push('Load the remaining clause taxonomy before saving.');
    if (!this.name.trim()) issues.push('Enter a playbook name.');
    if (!this.csv(this.documentTypes).length) issues.push('Specify at least one document type, such as contract.');
    if (this.effectiveFrom && this.effectiveUntil && this.effectiveUntil <= this.effectiveFrom) {
      issues.push('The effective end date must be after the effective start date.');
    }
    if (!this.rules.length) issues.push('Add at least one clause rule.');
    if (this.rules.length > 64) issues.push('A playbook can contain at most 64 clause rules.');
    const seen = new Set<string>();
    this.rules.forEach((rule, index) => {
      const prefix = `Rule ${index + 1}`;
      if (!/^[a-z][a-z0-9_]{0,79}$/.test(rule.code)) {
        issues.push(`${prefix}: stable rule code must start with a lowercase letter and contain only lowercase letters, numbers or underscores (example: demo_001).`);
      } else if (seen.has(rule.code)) {
        issues.push(`${prefix}: the stable rule code is already used by another rule.`);
      }
      seen.add(rule.code);
      const type = this.types().find((t) => t.uuid === rule.clause_type && t.is_active);
      if (!type) issues.push(`${prefix}: choose an active clause type from the available taxonomy.`);
      if (rule.fallback?.length && !rule.preferred?.length) {
        issues.push(`${prefix}: add a preferred position before defining a fallback.`);
      }
      const equivalent = (a?: unknown[], b?: unknown[]) =>
        !!a?.length && !!b?.length && JSON.stringify(a) === JSON.stringify(b);
      if (equivalent(rule.preferred, rule.prohibited) || equivalent(rule.fallback, rule.prohibited)) {
        issues.push(`${prefix}: preferred/fallback and prohibited positions must not be identical.`);
      }
      for (const group of ['when', 'preferred', 'fallback', 'prohibited'] as const) {
        if ((rule[group] || []).length > 16) issues.push(`${prefix}: ${group} may contain at most 16 conditions.`);
      }
    });
    if (this.rules.length && this.taxonomyReady && !validRules(this.rules, this.types()) && !issues.some((x) => x.includes('Rule '))) {
      issues.push('One or more rule conditions have an invalid fact, operator, or value. Review the rule sections below.');
    }
    return issues;
  }

  publishIssues(): string[] {
    const issues = this.draftIssues();
    if (this.draftDirty()) issues.push('Save the latest draft edits before publishing.');
    if (this.matchingPublishedVersion()) issues.push('This draft is already published. Change and save the draft to publish a new version.');
    if (!this.publishConfirmed) issues.push('Confirm that you reviewed the saved draft.');
    return issues;
  }

  ruleUpdated(rules: ClauseRule[]): void {
    this.rules = rules;
    this.publishConfirmed = false;
    this.error.set('');
  }

  /** Stable rule codes are deliberately not silently rewritten; they identify immutable policies. */
  suggestedCode(code: string): string {
    return code.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^[^a-z]+/, '');
  }

  applySuggestedCode(index: number): void {
    if (!this.manage() || !!this.selected()) return;
    const rows = structuredClone(this.rules);
    const suggestion = this.suggestedCode(rows[index]?.code || '');
    if (!suggestion || suggestion.length > 80) return;
    rows[index] = { ...rows[index], code: suggestion };
    this.ruleUpdated(rows);
  }

  draftDirty(): boolean {
    const b = this.book();
    return (
      !!b &&
      (this.name !== b.name ||
        this.description !== b.description ||
        JSON.stringify(this.rules) !== JSON.stringify(b.draft.rules || []) ||
        this.documentTypes !== (b.draft.document_types || ['contract']).join(', ') ||
        this.effectiveFrom !== (b.draft.effective_from?.slice(0, 10) || '') ||
        this.effectiveUntil !== (b.draft.effective_until?.slice(0, 10) || ''))
    );
  }
  editorTaxonomy(): ClauseType[] {
    const v = this.selected();
    return v
      ? Object.entries(v.taxonomy).map(([uuid, t]) => ({
          ...t,
          uuid,
          scope: 'system',
          description: 'Frozen published snapshot',
          is_active: true,
        }))
      : this.types();
  }
  readonly validRules = validRules;
}
