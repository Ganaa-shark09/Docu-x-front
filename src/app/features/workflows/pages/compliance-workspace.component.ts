import { EntityPickerComponent } from '../../../shared/entity-picker/entity-picker.component';
import { Component, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { DatePipe, JsonPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FinancePagerComponent } from '../components/finance-pager.component';
import { WorkflowAssignmentComponent } from '../components/workflow-assignment.component';
import { WorkflowFindingComponent } from '../components/workflow-finding.component';
import { ComplianceStatusComponent } from '../components/compliance-status.component';
import { ComplianceSourceComponent } from '../components/compliance-source.component';
import { ComplianceWorkspaceStore } from '../services/compliance-workspace.store';
import { Page, Principal, Json } from '../models/workflow.model';
import {
  Framework,
  FrameworkDraft,
  FrameworkVersion,
  Requirement,
  RequirementInput,
  Control,
  ControlDefinition,
  Mapping,
  Scope,
  Decision,
  DecisionKind,
  DecisionData,
  Evidence,
  SourceKind,
  Output,
  Row,
  Evaluation,
  Discovery,
  label,
  outcomes,
  sourceKinds,
  tests,
} from '../models/compliance.model';
const emptyPage = <T>(): Page<T> => ({ count: 0, next: null, previous: null, results: [] });
@Component({
  standalone: true,
  providers: [ComplianceWorkspaceStore],
  imports: [
    FormsModule,
    EntityPickerComponent,
    RouterLink,
    DatePipe,
    JsonPipe,
    FinancePagerComponent,
    WorkflowAssignmentComponent,
    WorkflowFindingComponent,
    ComplianceStatusComponent,
    ComplianceSourceComponent,
  ],
  styleUrls: ['../workflow.scss', '../components/finance.scss', './compliance-workspace.scss'],
  templateUrl: './compliance-workspace.component.html',
})
export class ComplianceWorkspaceComponent {
  readonly s = inject(ComplianceWorkspaceStore);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  readonly label = label;
  readonly outcomes = outcomes;
  readonly sourceKinds = sourceKinds;
  readonly tests = tests;
  readonly entries = Object.entries;
  readonly tab = signal('Overview');
  readonly tabs = [
    'Overview',
    'Requirements / controls',
    'Evidence',
    'Findings / exceptions',
    'Requests / remediation / risk',
    'Review / approval',
    'History',
    'Final output',
  ];
  readonly framework = signal<Framework | null>(null);
  readonly control = signal<Control | null>(null);
  readonly versions = signal(emptyPage<FrameworkVersion>());
  readonly requirements = signal(emptyPage<Requirement>());
  readonly mappings = signal(emptyPage<Mapping>());
  readonly history = signal(emptyPage<Decision>());
  readonly evidence = signal(emptyPage<Evidence>());
  readonly outputs = signal(emptyPage<Output>());
  readonly evaluations = signal(emptyPage<Evaluation>());
  readonly choices = signal(emptyPage<Framework>());
  readonly discovery = signal<Discovery | null>(null);
  draftPage = 1;
  versionPage = 1;
  requirementPage = 1;
  mappingPage = 1;
  historyPage = 1;
  evidencePage = 1;
  outputPage = 1;
  evaluationPage = 1;
  choicePage = 1;
  rowPage = 1;
  selectedVersion = '';
  selectedFramework = '';
  showForm = false;
  editing = false;
  previousId = '';
  name = '';
  code = '';
  description = '';
  source = '';
  jurisdiction = '';
  department: number | null = null;
  owner: Principal | null = null;
  draft: FrameworkDraft = this.newDraft();
  definition: ControlDefinition = this.newDefinition();
  active = true;
  mapRequirement = '';
  title = '';
  start = '';
  end = '';
  documents = '';
  controlScope = '';
  locations = '';
  systems = '';
  businessUnits = '';
  reviewer: Principal | null = null;
  approver: Principal | null = null;
  decisionKind: DecisionKind = 'control';
  target = '';
  outcome = 'review_required';
  reason = '';
  due = '';
  expires = '';
  reviewDue = '';
  requestId = '';
  submitted = '';
  actionOwner: Principal | null = null;
  selectedTarget = '';
  sourceKind: SourceKind = 'document';
  sourceId = '';
  issued = '';
  effective = '';
  evidenceExpires = '';
  evidenceReviewDue = '';
  shareable = false;
  query = '';
  external = false;
  selectedOutput = signal<Output | null>(null);
  private downloads = new Set<string>();
  constructor() {
    this.s.cleared$.pipe(takeUntilDestroyed()).subscribe(() => this.resetProtected());
    this.s.refreshed$.pipe(takeUntilDestroyed()).subscribe(() => {
      if (this.s.id && this.s.mode !== 'assessments') this.loadLibraryDetail();
      else if (this.s.detail()) this.loadTab();
    });
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      this.tab.set('Overview');
      this.s.reload(this.route.snapshot.data['mode'] || 'assessments', p.get('uuid') || '');
    });
  }
  toggleTest(test: string, enabled: boolean) {
    this.definition.tests = enabled
      ? [...new Set([...this.definition.tests, test])]
      : this.definition.tests.filter((v) => v !== test);
  }
  private sequences = new Map<string, number>();
  pageRead<T>(key: string, request: Observable<T>, accept: (value: T) => void) {
    const seq = (this.sequences.get(key) || 0) + 1;
    this.sequences.set(key, seq);
    this.s.read(request, (v) => {
      if (this.sequences.get(key) === seq) accept(v);
    });
  }
  newDraft(): FrameworkDraft {
    return {
      requirements: [this.newRequirement()],
      policy: { severity: 'high', allow_risk_acceptance: false, require_na_approval: true },
    };
  }
  addRequirement() {
    this.draft.requirements.push(this.newRequirement());
    this.draftPage = Math.ceil(this.draft.requirements.length / 10);
  }
  removeRequirement(index: number) {
    this.draft.requirements.splice(index, 1);
    this.draftPage = Math.max(
      1,
      Math.min(this.draftPage, Math.ceil(this.draft.requirements.length / 10)),
    );
  }
  requirementDepth(r: Requirement) {
    let depth = 0,
      parent = r.parent;
    const seen = new Set<string>();
    const rows = this.requirements().results;
    while (parent && depth < 7 && !seen.has(parent)) {
      seen.add(parent);
      depth++;
      parent = rows.find((v) => v.uuid === parent)?.parent || null;
    }
    return depth;
  }
  newRequirement(): RequirementInput {
    return {
      code: '',
      title: '',
      category: 'general',
      type: 'control',
      obligation: 'mandatory',
      parent: null,
      applicability: {},
      source: {},
    };
  }
  newDefinition(): ControlDefinition {
    return {
      description: '',
      objective: '',
      owner: { role: 'reviewer' },
      type: 'preventive',
      frequency: 'annual',
      evidence_expectations: [],
      tests: [...tests],
      status: 'active',
    };
  }
  resetProtected() {
    this.framework.set(null);
    this.control.set(null);
    this.versions.set(emptyPage());
    this.requirements.set(emptyPage());
    this.mappings.set(emptyPage());
    this.history.set(emptyPage());
    this.evidence.set(emptyPage());
    this.outputs.set(emptyPage());
    this.evaluations.set(emptyPage());
    this.choices.set(emptyPage());
    this.discovery.set(null);
    this.selectedOutput.set(null);
    this.showForm = false;
    this.editing = false;
    this.previousId = '';
    this.name = '';
    this.code = '';
    this.description = '';
    this.source = '';
    this.jurisdiction = '';
    this.owner = null;
    this.actionOwner = null;
    this.reviewer = null;
    this.approver = null;
    this.department = null;
    this.draft = this.newDraft();
    this.definition = this.newDefinition();
    this.title = '';
    this.documents = '';
    this.start = '';
    this.end = '';
    this.controlScope = '';
    this.locations = '';
    this.systems = '';
    this.businessUnits = '';
    this.selectedTarget = '';
    this.sourceId = '';
    this.reason = '';
    this.target = '';
    this.query = '';
    this.due = '';
    this.expires = '';
    this.reviewDue = '';
    this.requestId = '';
    this.submitted = '';
    this.issued = '';
    this.effective = '';
    this.evidenceExpires = '';
    this.evidenceReviewDue = '';
    this.shareable = false;
    this.external = false;
    this.selectedFramework = '';
    this.selectedVersion = '';
    this.mapRequirement = '';
    for (const url of this.downloads) URL.revokeObjectURL(url);
    this.downloads.clear();
  }
  loadLibraryDetail() {
    if (this.s.mode === 'frameworks')
      this.s.read(this.s.api.framework(this.s.id), (f) => {
        this.framework.set(f);
        this.selectedVersion = f.active_version_uuid || '';
        this.loadVersions();
        if (this.selectedVersion) this.loadRequirements();
      });
    else
      this.s.read(this.s.api.control(this.s.id), (c) => {
        this.control.set(c);
        this.loadMappings();
      });
  }
  openForm() {
    this.showForm = true;
    this.s.read(this.s.api.frameworks(), (p) => {
      this.choices.set(p);
      if (this.previousId) {
        const code = this.s.detail()?.framework['code'];
        const match = p.results.find((f) => f.code === code);
        if (match) this.chooseFramework(match.uuid);
      }
    });
  }
  loadChoices(page = 1) {
    this.choicePage = page;
    this.s.read(this.s.api.frameworks(page), (p) => this.choices.set(p));
  }
  chooseFramework(id: string) {
    this.selectedFramework = id;
    this.selectedVersion = '';
    this.controlScope = '';
    this.versions.set(emptyPage());
    this.requirements.set(emptyPage());
    if (id) this.loadVersions(1, id);
  }
  loadVersions(page = 1, id = this.s.id) {
    this.versionPage = page;
    this.pageRead('versions', this.s.api.versions(id, page), (p) => {
      this.versions.set(p);
      if (this.previousId)
        this.selectedVersion = p.results.find((v) => v.state === 'active')?.uuid || '';
    });
  }
  loadRequirements(page = 1) {
    this.requirementPage = page;
    const id = this.s.mode === 'frameworks' ? this.s.id : this.selectedFramework;
    if (id && this.selectedVersion)
      this.pageRead('requirements', this.s.api.requirements(id, this.selectedVersion, page), (p) =>
        this.requirements.set(p),
      );
  }
  loadMappings(page = 1) {
    this.mappingPage = page;
    this.pageRead('mappings', this.s.api.mappings(this.s.id, page), (p) => this.mappings.set(p));
  }
  loadTab() {
    if (this.tab() === 'Evidence') this.loadEvidence();
    if (['History', 'Requests / remediation / risk'].includes(this.tab())) this.loadHistory();
    if (this.tab() === 'History') this.loadEvaluations();
    if (this.tab() === 'Final output') this.loadOutputs();
  }
  selectTab(value: string) {
    this.tab.set(value);
    this.rowPage = 1;
    this.loadTab();
  }
  loadEvidence(page = 1) {
    this.evidencePage = page;
    this.evidence.set(emptyPage());
    this.pageRead('evidence', this.s.api.evidence(this.s.id, page), (p) => this.evidence.set(p));
  }
  loadHistory(page = 1) {
    this.historyPage = page;
    this.history.set(emptyPage());
    this.pageRead('history', this.s.api.decisions(this.s.id, page), (p) => this.history.set(p));
  }
  loadOutputs(page = 1) {
    this.outputPage = page;
    this.outputs.set(emptyPage());
    this.selectedOutput.set(null);
    this.pageRead('outputs', this.s.api.outputs(this.s.id, page), (p) => this.outputs.set(p));
  }
  loadEvaluations(page = 1) {
    this.evaluationPage = page;
    this.pageRead('evaluations', this.s.api.evaluations(this.s.id, page), (p) =>
      this.evaluations.set(p),
    );
  }
  riskAllowed() {
    const a = this.s.detail();
    const policy = a?.framework['policy'];
    return (
      !!a &&
      this.s.canManage(a.department) &&
      !!policy &&
      typeof policy === 'object' &&
      !Array.isArray(policy) &&
      policy['allow_risk_acceptance'] === true
    );
  }
  manageFramework() {
    const f = this.framework();
    return !!f && f.scope === 'company' && this.s.admin();
  }
  editFramework() {
    const f = this.framework();
    if (!f || !this.manageFramework()) return;
    this.draft = structuredClone(f.draft);
    this.editing = true;
  }
  saveFramework() {
    if (this.s.id) {
      const f = this.framework();
      if (!f || !this.manageFramework()) return;
      this.s.mutate(
        () => this.s.api.draft(f.uuid, f.revision, this.draft),
        () => (this.editing = false),
      );
      return;
    }
    if (!this.s.admin() || !this.name.trim() || !this.code.trim()) return;
    this.s.mutate(
      () =>
        this.s.api.createFramework({
          code: this.code,
          name: this.name,
          description: this.description,
          source: this.source,
          jurisdiction: this.jurisdiction,
          draft: this.draft,
        }),
      (f) => void this.router.navigate(['/workflows/compliance/frameworks', f.uuid]),
    );
  }
  publish() {
    const f = this.framework();
    if (f && this.manageFramework()) this.s.mutate(() => this.s.api.publish(f.uuid, f.revision));
  }
  activate(version: string | null) {
    const f = this.framework();
    if (f && this.manageFramework())
      this.s.mutate(() => this.s.api.activate(f.uuid, f.revision, version));
  }
  editControl() {
    const c = this.control();
    if (!c || !this.s.canManage(c.department)) return;
    this.code = c.code;
    this.name = c.name;
    this.department = c.department;
    this.definition = structuredClone(c.definition);
    this.owner = c.definition.owner;
    this.active = c.is_active;
    this.editing = true;
  }
  saveControl() {
    if (!this.owner || !this.s.canManage(this.department) || !this.name.trim()) return;
    const definition = { ...this.definition, owner: this.owner };
    const c = this.control();
    this.s.mutate(
      () =>
        c
          ? this.s.api.configureControl(c, this.name, definition, this.active)
          : this.s.api.createControl({
              code: this.code,
              name: this.name,
              department: this.department,
              definition,
            }),
      (v) => {
        this.editing = false;
        if (!c) void this.router.navigate(['/workflows/compliance/controls', v.uuid]);
      },
    );
  }
  map(requirement = this.mapRequirement, active = true) {
    const c = this.control();
    if (c && this.s.canManage(c.department) && requirement)
      this.s.mutate(() => this.s.api.map(c, requirement, active));
  }
  split(value: string) {
    return value
      .split(/[\n,]+/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  scope(): Scope {
    return {
      start: this.start,
      end: this.end,
      document_uuids: this.split(this.documents),
      control_uuids: this.split(this.controlScope),
      locations: this.split(this.locations),
      systems: this.split(this.systems),
      business_units: this.split(this.businessUnits),
    };
  }
  reassess() {
    const a = this.s.detail();
    if (
      !a ||
      !this.s.canManage(a.department) ||
      !['completed', 'rejected', 'failed', 'cancelled'].includes(a.status)
    )
      return;
    this.openForm();
    this.previousId = a.uuid;
    this.title = a.title + ' — reassessment';
    this.department = a.department;
    this.selectedVersion = '';
    this.start = a.scope.start;
    this.end = a.scope.end;
    this.documents = a.scope.document_uuids.join('\n');
    this.controlScope = a.scope.control_uuids.join('\n');
    this.locations = a.scope.locations.join(', ');
    this.systems = a.scope.systems.join(', ');
    this.businessUnits = a.scope.business_units.join(', ');
  }
  private documentCache = { raw: '', ids: [] as string[] };
  documentIds(): string[] {
    if (this.documentCache.raw !== this.documents)
      this.documentCache = { raw: this.documents, ids: this.split(this.documents) };
    return this.documentCache.ids;
  }
  private controlCache = { raw: '', ids: [] as string[] };
  controlIds(): string[] {
    if (this.controlCache.raw !== this.controlScope)
      this.controlCache = { raw: this.controlScope, ids: this.split(this.controlScope) };
    return this.controlCache.ids;
  }
  setDocuments(ids: string[]) {
    this.documents = ids.join('\n');
  }
  setControls(ids: string[]) {
    this.controlScope = ids.join('\n');
  }
  createAssessment() {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (this.s.pending()) return;
    if (
      !this.documentIds().length ||
      this.documentIds().length > 20 ||
      [...this.documentIds(), ...this.controlIds(), this.selectedVersion].some(
        (id) => !uuid.test(id),
      )
    ) {
      this.s.error.set(
        'Select available documents, controls and a published framework version from the lists.',
      );
      return;
    }
    if (!this.start || !this.end || this.start > this.end) {
      this.s.error.set(
        'Choose a valid assessment period. End date must be on or after start date.',
      );
      return;
    }
    if (
      !this.s.canManage(this.department) ||
      !this.title.trim() ||
      !this.selectedVersion ||
      !this.start ||
      !this.end ||
      !this.split(this.documents).length
    )
      return;
    const payload = {
      title: this.title,
      department: this.department,
      framework_version_uuid: this.selectedVersion,
      scope: this.scope(),
      ...(this.previousId ? { previous_uuid: this.previousId } : {}),
    };
    this.s.mutate(
      () =>
        this.s.api.createAssessment({ ...payload, idempotency_key: this.s.key('create', payload) }),
      (a) => void this.router.navigate(['/workflows/compliance/assessments', a.uuid]),
      false,
    );
  }
  submit() {
    const a = this.s.detail();
    if (!a || a.run_uuid || !this.s.canManage(a.department) || !this.reviewer || !this.approver)
      return;
    const reviewer = this.reviewer,
      approver = this.approver,
      p = { revision: a.revision, reviewer, approver };
    this.s.mutate(() =>
      this.s.api.submit(a.uuid, a.revision, reviewer, approver, this.s.key('submit', p)),
    );
  }
  evaluate() {
    const a = this.s.detail();
    if (a && this.s.canReview())
      this.s.mutate(() =>
        this.s.api.evaluate(a.uuid, a.revision, this.s.key('evaluate', { revision: a.revision })),
      );
  }
  prepareDecision(kind: DecisionKind, target: string, outcome = 'review_required') {
    this.decisionKind = kind;
    this.target = target;
    this.outcome = outcome;
    this.reason = '';
    this.requestId = '';
    this.actionOwner = null;
    this.due = '';
    this.expires = '';
    this.reviewDue = '';
    this.submitted = '';
  }
  decide() {
    const a = this.s.detail();
    if (!a || !this.s.canReview() || !this.target || !this.reason.trim()) return;
    if (
      (this.decisionKind === 'risk_acceptance' || this.outcome === 'not_applicable') &&
      !this.s.canManage(a.department)
    )
      return;
    const data: DecisionData = {};
    if (this.actionOwner) data.owner = this.actionOwner;
    if (this.due) data.due = this.due;
    if (this.expires) data.expires = this.expires;
    if (this.reviewDue) data.review_due = this.reviewDue;
    if (this.requestId) data.request_uuid = this.requestId;
    if (this.submitted) data.evidence_uuids = this.split(this.submitted);
    const p = {
      revision: a.revision,
      kind: this.decisionKind,
      target: this.target,
      outcome: this.outcome,
      reason: this.reason,
      data,
    };
    this.s.mutate(() =>
      this.s.api.decide(a.uuid, { ...p, idempotency_key: this.s.key('decision', p) }),
    );
  }
  link() {
    const a = this.s.detail();
    if (!a || !this.s.canLink() || !this.selectedTarget || !this.sourceId) return;
    const m = a.mappings.find(
      (v) => v.requirement_uuid + ':' + v.control_uuid === this.selectedTarget,
    );
    if (!m) return;
    const dates: Evidence['dates'] = {};
    if (this.issued) dates.issued = this.issued;
    if (this.effective) dates.effective = this.effective;
    if (this.evidenceExpires) dates.expires = this.evidenceExpires;
    if (this.evidenceReviewDue) dates.review_due = this.evidenceReviewDue;
    const p = {
      revision: a.revision,
      requirement_uuid: m.requirement_uuid,
      control_uuid: m.control_uuid,
      source_kind: this.sourceKind,
      source_uuid: this.sourceId,
      dates,
      location: {},
      externally_shareable: this.shareable,
    };
    this.s.mutate(() => this.s.api.link(a.uuid, { ...p, idempotency_key: this.s.key('link', p) }));
  }
  discover() {
    if (!this.query.trim() || this.s.pending()) return;
    this.s.mutate(
      () => this.s.api.discover(this.s.id, this.query),
      (d) => this.discovery.set(d),
      false,
    );
  }
  req(id: string) {
    return this.s.detail()?.requirements.find((r) => r.uuid === id);
  }
  mapped(row: Row) {
    return this.s
      .detail()
      ?.mappings.find(
        (m) => m.control_uuid === row.control_uuid && m.requirement_uuid === row.requirement_uuid,
      );
  }
  rows() {
    return (this.s.detail()?.rows || []).slice((this.rowPage - 1) * 20, this.rowPage * 20);
  }
  historyAction(d: Decision) {
    this.prepareDecision(d.kind, d.target, 'in_progress');
    this.requestId = d.data.request_uuid || d.uuid;
  }
  export(output: Output) {
    if (this.s.pending()) return;
    this.s.mutate(
      () => this.s.api.export(this.s.id, output.uuid, this.external),
      (v) => {
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(v, null, 2)], { type: 'application/json' }),
        );
        this.downloads.add(url);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'compliance-assessment-' + output.uuid + '.json';
        anchor.click();
        URL.revokeObjectURL(url);
        this.downloads.delete(url);
      },
      false,
    );
  }
  json(v: unknown) {
    return v as Json;
  }
}
