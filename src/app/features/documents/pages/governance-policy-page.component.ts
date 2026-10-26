import { Component, ChangeDetectorRef, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, Observable, finalize } from 'rxjs';
import { DocumentGovernanceService } from '../services/document-governance.service';
import {
  SensitivityPolicy,
  RetentionPolicy,
  SecurityClass,
  AccessLevel,
} from '../models/governance.model';
import { AiApiErrorMessageService } from '../../ai-chat/services/ai-api-error-message.service';
@Component({
  selector: 'app-governance-policy-page',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './governance-policy-page.component.html',
  styleUrl: '../components/document-governance.component.scss',
})
export class GovernancePolicyPageComponent {
  private readonly service = inject(DocumentGovernanceService);
  private readonly errors = inject(AiApiErrorMessageService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy = inject(DestroyRef);
  sensitivity: SensitivityPolicy[] = [];
  retention: RetentionPolicy[] = [];
  allowed = false;
  loading = false;
  busy = false;
  error = '';
  success = '';
  sensitivityId?: string;
  retentionId?: string;
  classes: SecurityClass[] = [
    'public',
    'internal',
    'confidential',
    'highly_confidential',
    'restricted',
  ];
  levels: AccessLevel[] = ['view', 'comment', 'edit', 'review', 'approve', 'admin'];
  sensitivityDraft: Omit<SensitivityPolicy, 'uuid'> = this.emptySensitivity();
  retentionDraft: Omit<RetentionPolicy, 'uuid'> = { name: '', duration_days: 365, is_active: true };
  constructor() {
    this.load();
  }
  load(): void {
    this.loading = true;
    this.allowed = false;
    forkJoin({ sensitivity: this.service.sensitivity(), retention: this.service.retention() })
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (data) => {
          this.sensitivity = data.sensitivity;
          this.retention = data.retention;
          this.allowed = true;
        },
        error: (e: unknown) => {
          this.sensitivity = [];
          this.retention = [];
          this.error = this.errors.getMessage(e, 'Policy management is unavailable.');
        },
      });
  }
  editSensitivity(p?: SensitivityPolicy): void {
    this.sensitivityId = p?.uuid;
    this.sensitivityDraft = p ? { ...p } : this.emptySensitivity();
  }
  editRetention(p?: RetentionPolicy): void {
    this.retentionId = p?.uuid;
    this.retentionDraft = p ? { ...p } : { name: '', duration_days: 365, is_active: true };
  }
  saveSensitivity(): void {
    this.mutate(this.service.saveSensitivity(this.sensitivityDraft, this.sensitivityId), () =>
      this.editSensitivity(),
    );
  }
  saveRetention(): void {
    this.mutate(this.service.saveRetention(this.retentionDraft, this.retentionId), () =>
      this.editRetention(),
    );
  }
  remove(uuid: string, kind: 'sensitivity' | 'retention'): void {
    if (window.confirm('Delete this policy? Assigned retention snapshots remain unchanged.'))
      this.mutate(this.service.deletePolicy(uuid, kind), () => {});
  }
  private mutate(request: Observable<unknown>, reset: () => void): void {
    if (!this.allowed || this.busy) return;
    this.busy = true;
    this.error = '';
    this.success = '';
    request
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => {
          this.busy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.service.invalidate('*');
          reset();
          this.success =
            'Policy saved. Existing retention snapshots change only through document governance.';
          this.load();
        },
        error: (e: unknown) => {
          this.error = this.errors.getMessage(e, 'Unable to save policy.');
        },
      });
  }
  private emptySensitivity(): Omit<SensitivityPolicy, 'uuid'> {
    return {
      code: '',
      name: '',
      security_class: 'internal',
      minimum_access: 'view',
      allow_ai: true,
      allow_export: true,
      allow_cloud: false,
      is_active: true,
    };
  }
}
