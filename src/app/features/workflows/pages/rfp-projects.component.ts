import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe, JsonPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, Subject, finalize, forkJoin, takeUntil, timeout } from 'rxjs';
import { RFPWorkflowService } from '../services/rfp-workflow.service';
import { WorkflowService } from '../services/workflow.service';
import { DocumentGovernanceService } from '../../documents/services/document-governance.service';
import { DocumentsService } from '../../documents/services/documents.service';
import { DocumentRealtimeService } from '../../../core/realtime/document-realtime.service';
import { Membership } from '../../documents/models/governance.model';
import { DocumentListRecord } from '../../documents/models/document.model';
import { Json, Principal, Run, closed } from '../models/workflow.model';
import {
  RFPAttachment,
  RFPCompliance,
  RFPCorrection,
  RFPCorrectionInput,
  RFPDeadline,
  RFPDetail,
  RFPExport,
  RFPOutput,
  RFPProject,
  RFPRequirement,
  RFPResponse,
  RFPSource,
  RFPSourceEvidence,
  RFPRole,
  RFP_ROLES,
  RFP_COMPLIANCE,
  rfpLabel,
} from '../models/rfp.model';
import { RFPLegalReferenceComponent } from '../components/rfp-legal-reference.component';
import { WorkflowAssignmentComponent } from '../components/workflow-assignment.component';
import { WorkflowStatusComponent } from '../components/workflow-status.component';
import { RFPEvidenceComponent } from '../components/rfp-evidence.component';
import { ToastService } from '../../../core/notifications/toast.service';
type Tab =
  | 'Overview'
  | 'Requirements'
  | 'Compliance matrix'
  | 'Attachments'
  | 'Corrections'
  | 'Review / approval'
  | 'Proposal output';
@Component({
  standalone: true,
  imports: [
    RFPLegalReferenceComponent,
    FormsModule,
    RouterLink,
    DatePipe,
    JsonPipe,
    WorkflowAssignmentComponent,
    WorkflowStatusComponent,
    RFPEvidenceComponent,
  ],
  templateUrl: './rfp-projects.component.html',
  styleUrls: ['../workflow.scss', '../components/rfp.scss'],
})
export class RFPProjectsComponent {
  readonly api = inject(RFPWorkflowService);
  private workflow = inject(WorkflowService);
  private governance = inject(DocumentGovernanceService);
  private documents = inject(DocumentsService);
  private realtime = inject(DocumentRealtimeService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroy = inject(DestroyRef);
  private readonly toasts = inject(ToastService);
  readonly projects = signal<RFPProject[]>([]);
  readonly project = signal<RFPDetail | null>(null);
  readonly run = signal<Run | null>(null);
  readonly memberships = signal<Membership[]>([]);
  readonly docs = signal<DocumentListRecord[]>([]);
  readonly items = signal<RFPRequirement[]>([]);
  readonly attachments = signal<RFPAttachment[]>([]);
  readonly corrections = signal<RFPCorrection[]>([]);
  readonly outputs = signal<RFPOutput[]>([]);
  readonly selected = signal<RFPRequirement | null>(null);
  readonly history = signal<RFPResponse[]>([]);
  readonly proposal = signal<RFPExport | null>(null);
  readonly loading = signal(false);
  readonly pending = signal(false);
  readonly docLoading = signal(false);
  readonly error = signal('');
  readonly manager = signal(false);
  readonly companyAdmin = signal(false);
  readonly tab = signal<Tab>('Overview');
  readonly tabs: Tab[] = [
    'Overview',
    'Requirements',
    'Compliance matrix',
    'Attachments',
    'Corrections',
    'Review / approval',
    'Proposal output',
  ];
  readonly roles = RFP_ROLES;
  readonly complianceStates = RFP_COMPLIANCE;
  readonly label = rfpLabel;
  page = 1;
  next = false;
  previous = false;
  itemPage = 1;
  itemNext = false;
  itemPrevious = false;
  itemCount = 0;
  kind = '';
  docPage = 1;
  docNext = false;
  docPrevious = false;
  attachmentPage = 1;
  attachmentNext = false;
  attachmentPrevious = false;
  correctionPage = 1;
  correctionNext = false;
  correctionPrevious = false;
  outputPage = 1;
  outputNext = false;
  outputPrevious = false;
  historyPage = 1;
  historyNext = false;
  historyPrevious = false;
  title = '';
  department: number | null = null;
  packageDocs: { document_uuid: string; role: RFPRole }[] = [];
  knowledge: string[] = [];
  reviewer: Principal | null = null;
  approver: Principal | null = null;
  requireOwners = false;
  requireDisclosure = false;
  requireAll = false;
  showCreate = false;
  pickerRole: RFPRole = 'rfp_main';
  responseText = '';
  responseReason = '';
  responseCompliance: RFPCompliance = 'unanswered';
  responseAssignment: Principal | null = null;
  responseCategory = 'unclassified';
  shareable = false;
  selectedProof: number[] = [];
  correctionTarget: {
    source: RFPSource;
    evidence: RFPSourceEvidence;
    kind: RFPCorrectionInput['kind'];
    key: string;
  } | null = null;
  correctionReason = '';
  correctionDate = '';
  correctedSection = '';
  correctedKind: 'question' | 'requirement' = 'requirement';
  correctedMandatory = false;
  correctedResponse = true;
  correctedCategory = 'unclassified';
  analysisUuid = '';
  attachmentDoc = '';
  attachmentAssignment: Principal | null = null;
  private historyRequest = 0;
  private itemRequest = 0;
  private uuid = '';
  private epoch = 0;
  private cancel = new Subject<void>();
  private submission: { signature: string; key: string } | null = null;
  private timer?: ReturnType<typeof setInterval>;
  private verifyFocus = () => this.verify();
  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroy)).subscribe((p) => {
      this.uuid = p.get('uuid') || '';
      this.itemPage = 1;
      this.attachmentPage = 1;
      this.correctionPage = 1;
      this.outputPage = 1;
      this.kind = '';
      this.reload();
    });
    for (const event of [this.governance.changes$, this.realtime.revoked$, this.api.revoked$])
      event
        .pipe(takeUntilDestroyed(this.destroy))
        .subscribe(() =>
          this.clear(
            'Access changed. Protected content was cleared. Reload to verify permissions.',
          ),
        );
    window.addEventListener('focus', this.verifyFocus);
    this.timer = setInterval(() => {
      if (document.visibilityState === 'visible') this.verify();
    }, 60000);
    this.destroy.onDestroy(() => {
      window.removeEventListener('focus', this.verifyFocus);
      clearInterval(this.timer);
      this.clear();
      this.cancel.complete();
    });
  }
  clear(message = '') {
    this.epoch++;
    this.cancel.next();
    this.project.set(null);
    this.projects.set([]);
    this.run.set(null);
    this.memberships.set([]);
    this.docs.set([]);
    this.items.set([]);
    this.attachments.set([]);
    this.corrections.set([]);
    this.outputs.set([]);
    this.selected.set(null);
    this.history.set([]);
    this.proposal.set(null);
    this.resetEditor();
    this.packageDocs = [];
    this.knowledge = [];
    this.title = '';
    this.department = null;
    this.reviewer = null;
    this.approver = null;
    this.correctionTarget = null;
    this.correctionReason = '';
    this.correctionDate = '';
    this.analysisUuid = '';
    this.correctedSection = '';
    this.correctedCategory = 'unclassified';
    this.correctedKind = 'requirement';
    this.correctedMandatory = false;
    this.correctedResponse = true;
    this.userId = 0;
    this.attachmentDoc = '';
    this.attachmentAssignment = null;
    this.submission = null;
    this.manager.set(false);
    this.companyAdmin.set(false);
    this.loading.set(false);
    this.pending.set(false);
    this.docLoading.set(false);
    this.showCreate = false;
    this.error.set(message);
  }
  private read<T>(request: Observable<T>, accept: (v: T) => void, settled?: () => void) {
    const epoch = this.epoch;
    request
      .pipe(
        timeout(20000),
        takeUntil(this.cancel),
        takeUntilDestroyed(this.destroy),
        finalize(() => {
          if (epoch === this.epoch) settled?.();
        }),
      )
      .subscribe({
        next: (v) => {
          if (epoch === this.epoch) accept(v);
        },
        error: (e) => {
          if (epoch === this.epoch) {
            this.loading.set(false);
            this.fail(e);
          }
        },
      });
  }
  private fail(e: unknown) {
    if (e instanceof HttpErrorResponse && [401, 403, 404].includes(e.status)) {
      const message = this.api.message(e);
      this.clear(message);
    } else if (e instanceof HttpErrorResponse && e.status === 409) {
      this.pending.set(false);
      this.loadProject();
      this.error.set(this.api.message(e));
    } else this.error.set(this.api.message(e));
  }
  reload() {
    if (this.pending()) return;
    this.clear();
    this.loading.set(true);
    this.read(
      forkJoin({ profile: this.workflow.profile(), members: this.governance.memberships() }),
      (v) => {
        this.userId = v.profile.id;
        this.memberships.set(v.members.filter((m) => m.is_active));
        this.companyAdmin.set(!!v.profile.is_superuser || ['company_admin', 'platform_admin'].includes(v.profile.role));
        this.manager.set(
          this.companyAdmin() ||
            v.members.some(
              (m) => m.is_active && m.user === v.profile.id && m.role === 'department_admin',
            ),
        );
        if (this.uuid) this.loadProject();
        else this.loadProjects();
      },
    );
  }
  departments() {
    return this.memberships().filter(
      (m, i, a) => a.findIndex((x) => x.department === m.department) === i,
    );
  }
  managedDepartments() {
    return this.departments().filter(
      (m) =>
        this.companyAdmin() ||
        this.memberships().some(
          (x) =>
            x.department === m.department &&
            x.user === this.userId &&
            x.role === 'department_admin',
        ),
    );
  }
  private userId = 0;
  canStart() {
    const p = this.project();
    return (
      this.manager() &&
      (!p ||
        this.companyAdmin() ||
        this.memberships().some(
          (m) =>
            m.user === this.userId &&
            m.role === 'department_admin' &&
            m.department === p.department,
        ))
    );
  }
  editable() {
    const r = this.run();
    return (
      !!r &&
      r.status === 'review_required' &&
      r.current_step === 'review_proposal' &&
      r.capabilities.review
    );
  }
  loadProjects() {
    this.loading.set(true);
    this.read(this.api.projects(this.page), (p) => {
      this.projects.set(p.results);
      this.next = !!p.next;
      this.previous = !!p.previous;
      this.loading.set(false);
    });
  }
  loadProject() {
    if (!this.uuid) return;
    this.loading.set(true);
    this.run.set(null);
    this.selected.set(null);
    this.resetEditor();
    this.history.set([]);
    this.proposal.set(null);
    this.correctionTarget = null;
    this.read(this.api.project(this.uuid), (p) => {
      this.project.set(p);
      this.realtime.subscribeDocuments([
        ...p.sources.map((s) => s.document_uuid),
        ...p.knowledge_document_uuids,
      ]);
      if (p.run_uuid) this.read(this.workflow.run(p.run_uuid), (r) => this.run.set(r));
      else this.run.set(null);
      this.loading.set(false);
      this.loadTab();
    });
  }
  verify() {
    if (this.pending() || !this.project()) return;
    this.read(this.api.project(this.uuid), (p) => {
      if (p.revision !== this.project()?.revision || p.status !== this.project()?.status) {
        this.loadProject();
        this.toasts.warning('The RFP changed. Current state was refreshed.');
      } else {
        if (p.run_uuid)
          this.read(this.workflow.run(p.run_uuid), (r) => {
            if (r.revision !== this.run()?.revision) this.loadProject();
          });
        if (this.items().length) {
          const page = this.itemPage,
            kind = this.kind;
          this.read(this.api.requirements(this.uuid, page, kind), (rows) => {
            if (page !== this.itemPage || kind !== this.kind) return;
            this.items.set(rows.results);
            const selected = this.selected();
            if (selected) {
              const current = rows.results.find((i) => i.uuid === selected.uuid);
              if (
                !current ||
                current.response?.grounding === 'evidence_invalid' ||
                current.revision !== selected.revision
              ) {
                this.selected.set(null);
                this.resetEditor();
                this.history.set([]);
                this.toasts.warning(
                  'Response authorization or revision changed. Reopen the current response to review.',
                );
              }
            }
          });
        }
        if (this.history().length) this.loadHistory(this.historyPage);
        const output = this.proposal();
        if (output) {
          this.proposal.set(null);
          this.read(this.api.export(this.uuid, output.output_uuid, output.external), (data) =>
            this.proposal.set(data),
          );
        }
      }
    });
  }
  setTab(tab: Tab) {
    if (this.pending()) return;
    this.historyRequest++;
    this.itemRequest++;
    this.tab.set(tab);
    this.selected.set(null);
    this.history.set([]);
    this.proposal.set(null);
    this.correctionTarget = null;
    this.resetEditor();
    this.loadTab();
  }
  loadTab() {
    if (!this.project()) return;
    switch (this.tab()) {
      case 'Overview':
        this.loadCorrections();
        break;
      case 'Requirements':
      case 'Compliance matrix':
        this.loadItems();
        break;
      case 'Attachments':
        this.loadAttachments();
        break;
      case 'Corrections':
        this.loadCorrections();
        break;
      case 'Proposal output':
        this.loadOutputs();
        break;
    }
  }
  loadItems() {
    const request = ++this.itemRequest;
    this.items.set([]);
    this.selected.set(null);
    this.history.set([]);
    this.resetEditor();
    this.loading.set(true);
    this.read(this.api.requirements(this.uuid, this.itemPage, this.kind), (p) => {
      if (request !== this.itemRequest) return;
      this.items.set(p.results);
      this.itemCount = p.count;
      this.itemNext = !!p.next;
      this.itemPrevious = !!p.previous;
      this.realtime.subscribeDocuments(
        p.results.flatMap((i) => i.response?.evidence.map((e) => e.document_uuid) || []),
      );
      this.loading.set(false);
    });
  }
  filterKind() {
    this.itemPage = 1;
    this.loadItems();
  }
  loadAttachments() {
    this.loading.set(true);
    this.read(this.api.attachments(this.uuid, this.attachmentPage), (p) => {
      this.attachments.set(p.results);
      this.attachmentNext = !!p.next;
      this.attachmentPrevious = !!p.previous;
      this.loading.set(false);
    });
  }
  loadCorrections() {
    this.loading.set(true);
    this.read(this.api.corrections(this.uuid, this.correctionPage), (p) => {
      this.corrections.set(p.results);
      this.correctionNext = !!p.next;
      this.correctionPrevious = !!p.previous;
      this.loading.set(false);
    });
  }
  loadOutputs() {
    this.loading.set(true);
    this.read(this.api.outputs(this.uuid, this.outputPage), (p) => {
      this.outputs.set(p.results);
      this.outputNext = !!p.next;
      this.outputPrevious = !!p.previous;
      this.loading.set(false);
    });
  }
  loadDocs(page = 1) {
    if (this.pending() || this.docLoading()) return;
    this.docPage = page;
    this.docLoading.set(true);
    this.read(
      this.documents.getInternalDocumentPage(page),
      (p) => {
        this.docs.set(p.results);
        this.docNext = !!p.next;
        this.docPrevious = !!p.previous;
      },
      () => this.docLoading.set(false),
    );
  }
  addPackage(doc: DocumentListRecord) {
    if (
      this.pending() ||
      this.packageDocs.length >= 20 ||
      this.knowledge.includes(doc.uuid) ||
      this.packageDocs.some((s) => s.document_uuid === doc.uuid)
    )
      return;
    this.packageDocs = [...this.packageDocs, { document_uuid: doc.uuid, role: this.pickerRole }];
  }
  addKnowledge(doc: DocumentListRecord) {
    if (
      this.pending() ||
      this.knowledge.length >= 20 ||
      this.packageDocs.some((s) => s.document_uuid === doc.uuid) ||
      this.knowledge.includes(doc.uuid)
    )
      return;
    this.knowledge = [...this.knowledge, doc.uuid];
  }
  removePackage(uuid: string) {
    if (!this.pending())
      this.packageDocs = this.packageDocs.filter((d) => d.document_uuid !== uuid);
  }
  removeKnowledge(uuid: string) {
    if (!this.pending()) this.knowledge = this.knowledge.filter((d) => d !== uuid);
  }
  private mutate<T>(request: Observable<T>, accept?: (v: T) => void) {
    if (this.pending()) return;
    this.pending.set(true);
    this.error.set('');
    const epoch = this.epoch;
    this.read(
      request,
      (v) => {
        this.pending.set(false);
        if (accept) accept(v);
        else this.loadProject();
      },
      () => {
        if (epoch === this.epoch) this.pending.set(false);
      },
    );
  }
  create() {
    if (
      !this.manager() ||
      !this.title.trim() ||
      this.packageDocs.filter((s) => s.role === 'rfp_main').length !== 1 ||
      (!this.companyAdmin() &&
        !this.managedDepartments().some((m) => m.department === this.department)) ||
      this.pending()
    )
      return;
    this.mutate(
      this.api.create({
        title: this.title.trim(),
        department: this.department,
        sources: this.packageDocs,
        knowledge_document_uuids: this.knowledge,
        finalization: {
          require_all_responses: this.requireAll,
          require_owners: this.requireOwners,
          require_external_disclosure: this.requireDisclosure,
        },
      }),
      (p) => void this.router.navigate(['/workflows/rfp-projects', p.uuid]),
    );
  }
  start() {
    const p = this.project();
    if (
      !p ||
      !this.canStart() ||
      !this.reviewer ||
      !this.approver ||
      this.pending() ||
      (this.run() && !closed(this.run()!))
    )
      return;
    const signature = JSON.stringify([p.uuid, p.revision, this.reviewer, this.approver]);
    if (this.submission?.signature !== signature)
      this.submission = { signature, key: crypto.randomUUID() };
    this.mutate(
      this.api.submit(p.uuid, {
        revision: p.revision,
        reviewer: this.reviewer,
        approver: this.approver,
        idempotency_key: this.submission.key,
      }),
      () => this.loadProject(),
    );
  }
  draft() {
    const p = this.project();
    if (!p || !this.editable() || this.pending()) return;
    this.mutate(this.api.draft(p.uuid, p.revision), (v) => {
      this.loadProject();
      this.toasts.success(
        `Drafted ${v.drafted}; remaining ${v.remaining}. ${v.abstained ? 'Insufficient authorized evidence: ' + v.abstained + '.' : ''} All draft responses require human review.`,
      );
    });
  }
  confirm() {
    const p = this.project();
    if (p && this.editable() && !this.pending()) this.mutate(this.api.confirm(p.uuid, p.revision));
  }
  resetEditor() {
    this.responseText = '';
    this.responseReason = '';
    this.responseCompliance = 'unanswered';
    this.responseAssignment = null;
    this.shareable = false;
    this.selectedProof = [];
    this.responseCategory = 'unclassified';
  }
  selectItem(item: RFPRequirement) {
    if (this.pending()) return;
    this.historyRequest++;
    this.resetEditor();
    this.selected.set(item);
    this.history.set([]);
    this.historyPage = 1;
    this.responseText = item.response?.text || '';
    this.responseCompliance = item.compliance;
    this.responseCategory = item.category;
    this.shareable = item.response?.externally_shareable || false;
    this.selectedProof = item.response?.evidence.map((_, i) => i) || [];
  }
  toggleProof(index: number, checked: boolean) {
    this.selectedProof = checked
      ? [...new Set([...this.selectedProof, index])]
      : this.selectedProof.filter((i) => i !== index);
  }
  saveResponse() {
    const item = this.selected();
    if (!item || !this.editable() || !this.responseReason.trim() || this.pending()) return;
    const evidence = (item.response?.evidence || []).filter((_, i) =>
      this.selectedProof.includes(i),
    );
    this.mutate(
      this.api.saveResponse(this.uuid, item.uuid, {
        revision: item.revision,
        text: this.responseText,
        evidence,
        compliance: this.responseCompliance,
        reason: this.responseReason.trim(),
        externally_shareable: this.shareable,
        category: this.responseCategory,
        ...(this.responseAssignment ? { assignment: this.responseAssignment } : {}),
      }),
    );
  }
  loadHistory(page = 1) {
    const request = ++this.historyRequest;
    const item = this.selected();
    if (!item) return;
    this.historyPage = page;
    this.history.set([]);
    this.read(this.api.history(this.uuid, item.uuid, page), (p) => {
      if (request !== this.historyRequest || this.selected()?.uuid !== item.uuid) return;
      this.history.set(p.results);
      this.historyNext = !!p.next;
      this.historyPrevious = !!p.previous;
    });
  }
  correctRequirement(item: RFPRequirement) {
    const source = this.project()?.sources.find(
      (s) => s.document_uuid === item.evidence.document_uuid,
    );
    if (!source || !this.editable()) return;
    this.correctionTarget = { source, evidence: item.evidence, kind: 'requirement', key: item.key };
    this.correctedSection = item.section;
    this.correctedKind = item.kind;
    this.correctedMandatory = item.mandatory;
    this.correctedResponse = item.response_required;
    this.correctedCategory = item.category;
    this.correctionReason = '';
  }
  correctDeadline(source: RFPSource, d: RFPDeadline, index: number) {
    if (!this.editable()) return;
    this.correctionTarget = { source, evidence: d.evidence, kind: 'deadline', key: String(index) };
    this.correctionDate = d.date || '';
    this.correctionReason = '';
  }
  classify(source: RFPSource, evidence: RFPSourceEvidence) {
    if (!this.editable()) return;
    this.correctionTarget = { source, evidence, kind: 'classification', key: 'classification' };
    this.correctionReason = '';
  }
  linkLegal(source: RFPSource, evidence: RFPSourceEvidence) {
    if (!this.editable() || source.role !== 'rfp_terms') return;
    this.correctionTarget = { source, evidence, kind: 'legal_analysis', key: 'legal_analysis' };
    this.analysisUuid = '';
    this.correctionReason = '';
  }
  saveCorrection() {
    const target = this.correctionTarget,
      p = this.project();
    if (!target || !p || !this.editable() || !this.correctionReason.trim() || this.pending())
      return;
    const value: Json =
      target.kind === 'deadline'
        ? { date: this.correctionDate }
        : target.kind === 'classification'
          ? { classified: true }
          : target.kind === 'legal_analysis'
            ? { analysis_uuid: this.analysisUuid }
            : {
                section: this.correctedSection,
                kind: this.correctedKind,
                mandatory: this.correctedMandatory,
                response_required: this.correctedResponse,
                category: this.correctedCategory,
              };
    this.mutate(
      this.api.correct(this.uuid, {
        revision: p.revision,
        source_uuid: target.source.uuid,
        kind: target.kind,
        key: target.key,
        value,
        evidence: target.evidence,
        reason: this.correctionReason.trim(),
      }),
    );
  }
  attach(a: RFPAttachment) {
    if (
      !this.editable() ||
      this.pending() ||
      !this.docs().some((d) => d.uuid === this.attachmentDoc)
    )
      return;
    this.mutate(
      this.api.attach(this.uuid, a.uuid, {
        revision: a.revision,
        document_uuid: this.attachmentDoc,
        ...(this.attachmentAssignment ? { assignment: this.attachmentAssignment } : {}),
      }),
    );
  }
  inspectOutput(output: RFPOutput, external: boolean, download = false) {
    if (this.pending()) return;
    this.proposal.set(null);
    this.mutate(this.api.export(this.uuid, output.uuid, external), (data) => {
      this.proposal.set(data);
      if (download) {
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
        );
        try {
          const a = document.createElement('a');
          a.href = url;
          a.download = `proposal-v${data.version}-${external ? 'external' : 'internal'}.json`;
          a.click();
        } finally {
          URL.revokeObjectURL(url);
        }
      }
    });
  }
  deadlineWarning(deadline: RFPDeadline): string {
    if (deadline.datetime && deadline.timezone && Date.parse(deadline.datetime) < Date.now())
      return 'Source deadline has passed. Confirm submission status.';
    const now = new Date();
    const today = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
    if (deadline.date && deadline.date < today)
      return 'Source date precedes today on this device. Confirm the submission timezone and status.';
    return '';
  }
  deadlineCorrection(source: RFPSource, index: number) {
    return this.corrections().find(
      (c) => c.source_uuid === source.uuid && c.kind === 'deadline' && c.key === String(index),
    );
  }
  sourceMetadata(source: RFPSource) {
    return this.project()?.metadata[source.document_uuid];
  }
  metadataEntries(source: RFPSource) {
    return Object.entries(this.sourceMetadata(source)?.metadata || {});
  }
  owner(value: Principal | Record<string, never>) {
    if ('user' in value && value.user)
      return this.memberships().find((m) => m.user === value.user)?.user_email || 'Assigned user';
    if (value.department)
      return (
        (this.memberships().find((m) => m.department === value.department)?.department_name ||
          'Assigned department') + (value.role ? ' · ' + value.role : '')
      );
    return 'Unassigned';
  }
  responseState(item: RFPRequirement) {
    return item.response
      ? this.label(item.response.grounding)
      : 'Insufficient authorized evidence — subject-matter expert input required';
  }
}
