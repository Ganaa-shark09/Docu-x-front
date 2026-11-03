import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { timeout } from 'rxjs';
import { Membership } from '../../documents/models/governance.model';
import { Principal, Definition } from '../models/workflow.model';
import { ContractPolicy } from '../models/contract.model';
import { ContractReviewService } from '../services/contract-review.service';
import { LegalPlaybookPickerComponent } from './legal-playbook-picker.component';
import { WorkflowAssignmentComponent } from './workflow-assignment.component';
@Component({
  selector: 'app-contract-definition',
  standalone: true,
  imports: [FormsModule, WorkflowAssignmentComponent, LegalPlaybookPickerComponent],
  templateUrl: './contract-definition.component.html',
  styleUrls: ['../workflow.scss', './contract.scss', './contract-definition.component.scss'],
})
export class ContractDefinitionComponent {
  readonly memberships = input<Membership[]>([]);
  readonly companyAdmin = input(false);
  readonly authorized = input(false);
  readonly created = output<Definition>();
  readonly accessDenied = output<void>();
  readonly busyChange = output<boolean>();
  private readonly api = inject(ContractReviewService);
  private readonly destroy = inject(DestroyRef);
  readonly pending = signal(false);
  readonly error = signal('');
  readonly definitionConflict = signal(false);
  step = 1;
  stepError = '';

  nextStep(): void {
    if (this.pending()) return;
    this.stepError = '';
    if (this.step === 1 && (!this.name.trim() || !/^[-a-zA-Z0-9_]{1,80}$/.test(this.code))) {
      this.stepError = 'Enter a workflow name and a valid workflow code before continuing.';
      return;
    }
    if (this.step === 2 && !this.reviewer) {
      this.stepError = 'Choose a reviewer before continuing.';
      return;
    }
    if (this.step === 3 && !/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(this.threshold)) {
      this.stepError = 'Confidence must be a decimal between 0 and 1.';
      return;
    }
    this.step = Math.min(4, this.step + 1);
  }

  previousStep(): void {
    if (this.pending()) return;
    this.stepError = '';
    this.step = Math.max(1, this.step - 1);
  }
  name = 'Contract review';
  code = '';
  department: number | null = null;
  reviewer: Principal | null = null;
  approver: Principal | null = null;
  threshold = '0.85';
  legalEnabled = false;
  legalVersion: string | null = null;
  policy: ContractPolicy = {
    require_approval: true,
    force_review: false,
    use_ai: false,
    decimal_separator: null,
    date_order: null,
  };
  departments(): Membership[] {
    return this.memberships().filter(
      (m, i, all) => m.is_active && all.findIndex((x) => x.department === m.department) === i,
    );
  }
  create(): void {
    if (
      this.pending() ||
      !this.authorized() ||
      !this.reviewer ||
      (this.legalEnabled && !this.legalVersion) ||
      !this.name.trim() ||
      !/^[-a-zA-Z0-9_]{1,80}$/.test(this.code)
    )
      return;
    const decimal = /^(?:0(?:\.\d+)?|1(?:\.0+)?)$/;
    if (!decimal.test(this.threshold)) {
      this.error.set('Confidence must be decimal values from 0 to 1.');
      return;
    }
    const department = this.companyAdmin()
      ? this.department
      : (this.department ?? this.departments()[0]?.department);
    if (!this.companyAdmin() && !this.departments().some((m) => m.department === department)) {
      this.error.set('Choose an authorized department.');
      return;
    }
    this.stepError = '';
    this.definitionConflict.set(false);
    this.pending.set(true);
    this.busyChange.emit(true);
    this.error.set('');
    this.api
      .create({
        name: this.name.trim(),
        code: this.code,
        department,
        reviewer: this.reviewer,
        ...(this.approver ? { approver: this.approver } : {}),
        policy: {
          ...this.policy,
          ...(this.legalEnabled && this.legalVersion
            ? { clause_playbook_version: this.legalVersion }
            : {}),
          confidence_threshold: this.threshold,
        },
      })
      .pipe(timeout(15000), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (result) => {
          this.pending.set(false);
          this.busyChange.emit(false);
          if (this.authorized()) this.created.emit(result.definition);
        },
        error: (e) => {
          this.pending.set(false);
          this.busyChange.emit(false);
          const serverMessage = this.api.message(e, 'create');
          // A conflict is not a missing field in step 4. Keep the typed values,
          // return to workflow identity and explain the server's decision.
          const isConflict = e instanceof HttpErrorResponse && (
            e.status === 409 || /conflict|existing definition|already exists|ownership/i.test(serverMessage)
          );
          if (isConflict) {
            this.definitionConflict.set(true);
            this.step = 1;
            this.error.set('The server rejected this workflow because its definition or ownership scope conflicts with an existing workflow. Review the stable code and department, or open the existing definition. No new workflow was published.');
          } else {
            this.error.set(serverMessage);
          }
          if (e instanceof HttpErrorResponse && [401, 403, 404].includes(e.status))
            this.accessDenied.emit();
        },
      });
  }
}
