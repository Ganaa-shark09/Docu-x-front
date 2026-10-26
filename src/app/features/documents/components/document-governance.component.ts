import { DocumentScope } from '../services/documents.service';
import { DatePipe } from '@angular/common';
import {
  Component,
  Input,
  OnChanges,
  Output,
  EventEmitter,
  inject,
  ChangeDetectorRef,
  DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin, catchError, of, finalize, Subscription } from 'rxjs';
import { DocumentDetail } from '../models/document.model';
import {
  DocumentGovernance,
  GovernancePatch,
  FieldPolicy,
  SensitivityPolicy,
  RetentionPolicy,
  Membership,
} from '../models/governance.model';
import { DocumentGovernanceService } from '../services/document-governance.service';
import { AiApiErrorMessageService } from '../../ai-chat/services/ai-api-error-message.service';

@Component({
  selector: 'app-document-governance',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink],
  templateUrl: './document-governance.component.html',
  styleUrl: './document-governance.component.scss',
})
export class DocumentGovernanceComponent implements OnChanges {
  @Output() failure = new EventEmitter<string>();
  @Output() administration = new EventEmitter<boolean>();
  @Input() scope: DocumentScope = 'internal';
  @Input({ required: true }) document!: DocumentDetail;
  private readonly service = inject(DocumentGovernanceService);
  private readonly errors = inject(AiApiErrorMessageService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy = inject(DestroyRef);
  governance: DocumentGovernance | null = null;
  draft: GovernancePatch = { expected_revision: 1 };
  roles = ['platform_admin', 'company_admin', 'department_admin', 'reviewer', 'member', 'viewer'];
  fields: FieldPolicy[] = [];
  sensitivity: SensitivityPolicy[] = [];
  retention: RetentionPolicy[] = [];
  members: Membership[] = [];
  canAdminister = false;
  canManagePolicies = false;
  busy = false;
  editing = false;
  error = '';
  private loadSubscription?: Subscription;
  rule: Omit<FieldPolicy, 'uuid'> = this.emptyRule();
  get startInput(): string {
    const value = this.draft.retention_start;
    if (!value) return '';
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  get expired(): boolean {
    return (
      !!this.governance?.retention_expires_at &&
      Date.parse(this.governance.retention_expires_at) <= Date.now()
    );
  }
  get now(): string {
    return new Date().toISOString();
  }
  setStart(value: string): void {
    this.draft.retention_start = value ? new Date(value).toISOString() : null;
  }
  ngOnChanges(): void {
    this.reload();
  }
  reload(): void {
    this.governance = this.document.governance || null;
    this.canAdminister = false;
    this.canManagePolicies = false;
    this.administration.emit(false);
    this.fields = [];
    this.editing = false;
    const uuid = this.document.uuid;
    this.loadSubscription?.unsubscribe();
    this.loadSubscription = forkJoin({
      governance: this.service.get(uuid, this.scope),
      fields: this.service.fields(uuid, this.scope).pipe(catchError(() => of(null))),
      sensitivity: this.service.sensitivity().pipe(catchError(() => of(null))),
      retention: this.service.retention().pipe(catchError(() => of([]))),
      members: this.service.memberships().pipe(catchError(() => of([]))),
    })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (data) => {
          if (this.document.uuid !== uuid) return;
          this.governance = data.governance;
          // Field-policy reads require administer permission on the backend.
          this.canAdminister = data.fields !== null;
          this.canManagePolicies = data.sensitivity !== null;
          this.administration.emit(this.canAdminister && this.canManagePolicies);
          this.fields = data.fields || [];
          this.sensitivity = data.sensitivity || [];
          this.retention = data.retention;
          this.members = data.members.filter((member) => member.is_active);
          this.cdr.markForCheck();
        },
        error: (error: unknown) => {
          this.error = this.errors.getMessage(error, 'Governance is unavailable.');
          this.cdr.markForCheck();
        },
      });
  }
  get sensitivityOptions(): { code: string; name: string }[] {
    const defaults = ['public', 'internal', 'confidential', 'highly_confidential', 'restricted'];
    const codes = new Map(
      defaults.map((code) => [code, { code, name: code.replaceAll('_', ' ') }]),
    );
    for (const policy of this.sensitivity) {
      if (policy.is_active) codes.set(policy.code, { code: policy.code, name: policy.name });
      else codes.delete(policy.code);
    }
    const current = this.governance?.sensitivity_label;
    if (current && !codes.has(current)) codes.set(current, { code: current, name: current });
    return [...codes.values()];
  }
  get users(): { id: number; name: string }[] {
    const users = new Map(
      this.members.map((m) => [m.user, { id: m.user, name: m.user_email || m.username }]),
    );
    for (const id of [this.governance?.owner_user, this.governance?.custodian])
      if (id != null && !users.has(id)) users.set(id, { id, name: `User ${id}` });
    return [...users.values()];
  }
  get departments(): { id: number; name: string }[] {
    return [
      ...new Map(
        this.members.map((m) => [m.department, { id: m.department, name: m.department_name }]),
      ).values(),
    ];
  }
  userLabel(id: number | null): string {
    return id === null
      ? 'Not assigned'
      : this.users.find((user) => user.id === id)?.name || `User ${id}`;
  }
  policyLabel(uuid: string | null): string {
    return (
      this.retention.find((policy) => policy.uuid === uuid)?.name ||
      (uuid ? 'Assigned policy' : 'Company default')
    );
  }
  beginEdit(): void {
    if (!this.governance || !this.canAdminister) return;
    const g = this.governance;
    this.draft = {
      expected_revision: g.governance_revision,
      owner_user: g.owner_user,
      custodian: g.custodian,
    };
    if (this.canManagePolicies)
      Object.assign(this.draft, {
        department: g.department,
        sensitivity_label: g.sensitivity_label,
        retention_policy: g.retention_policy,
        retention_start: g.retention_start,
        legal_hold: g.legal_hold,
      });
    this.editing = true;
    this.error = '';
    this.cdr.markForCheck();
  }
  save(): void {
    if (!this.canAdminister || this.busy) return;
    this.mutate(this.service.update(this.document.uuid, this.changedPatch(), this.scope), () => {
      this.editing = false;
      this.reload();
    });
  }
  addField(): void {
    if (!this.canAdminister || !this.rule.field_key.trim() || this.busy) return;
    this.mutate(this.service.addField(this.document.uuid, { ...this.rule }, this.scope), () => {
      this.rule = this.emptyRule();
      this.reload();
    });
  }
  revoke(uuid: string, kind: 'field' | 'access'): void {
    if (
      !this.canAdminister ||
      this.busy ||
      !window.confirm('Remove this permission rule? Access will be recalculated by the server.')
    )
      return;
    this.mutate(this.service.revoke(this.document.uuid, uuid, kind, this.scope), () =>
      this.reload(),
    );
  }
  private changedPatch(): GovernancePatch {
    const keys = [
      'owner_user',
      'custodian',
      'department',
      'sensitivity_label',
      'retention_policy',
      'retention_start',
      'legal_hold',
    ] as const;
    const changes = Object.fromEntries(
      keys
        .filter((key) => key in this.draft && this.draft[key] !== this.governance?.[key])
        .map((key) => [key, this.draft[key]]),
    );
    return { ...changes, expected_revision: this.draft.expected_revision };
  }
  private mutate(request: import('rxjs').Observable<unknown>, success: () => void): void {
    this.busy = true;
    this.error = '';
    request
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => {
          this.busy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: success,
        error: (error: unknown) => {
          this.error = this.errors.getMessage(error, 'Unable to save governance changes.');
          if (error instanceof HttpErrorResponse && [401, 403, 404, 409].includes(error.status)) {
            this.editing = false;
            this.service.invalidate(this.document.uuid);
            this.reload();
          }
          this.failure.emit(this.error);
        },
      });
  }
  private emptyRule(): Omit<FieldPolicy, 'uuid'> {
    return {
      field_key: '',
      user: null,
      role: '',
      can_view: false,
      can_use_ai: false,
      can_export: false,
      masked_view: true,
    };
  }
}
