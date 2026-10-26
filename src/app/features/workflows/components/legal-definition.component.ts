import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { timeout } from 'rxjs';
import { Membership } from '../../documents/models/governance.model';
import { Definition, Principal } from '../models/workflow.model';
import { LegalClauseService } from '../services/legal-clause.service';
import { WorkflowAssignmentComponent } from './workflow-assignment.component';
import { LegalPlaybookPickerComponent } from './legal-playbook-picker.component';
@Component({
  selector: 'app-legal-definition',
  standalone: true,
  imports: [FormsModule, WorkflowAssignmentComponent, LegalPlaybookPickerComponent],
  styleUrls: ['../workflow.scss', './legal.scss'],
  template: ` <form class="card" (ngSubmit)="create()">
    <h2>Create legal clause workflow</h2>
    <p class="muted">
      Install the server legal lifecycle with review, approval and protected output.
    </p>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    <fieldset [disabled]="pending()">
      <div class="grid">
        <label>Name<input name="legalName" [(ngModel)]="name" required maxlength="150" /></label
        ><label
          >Stable code<input
            name="legalCode"
            [(ngModel)]="code"
            required
            maxlength="80"
            pattern="[-a-zA-Z0-9_]+" /></label
        ><label
          >Department<select name="legalDepartment" [(ngModel)]="department">
            <option [ngValue]="null" [disabled]="!companyAdmin()">Company wide</option>
            @for (m of departments(); track m.department) {
              <option [ngValue]="m.department">{{ m.department_name }}</option>
            }
          </select></label
        >
      </div>
      <h3>Reviewer</h3>
      <app-workflow-assignment
        [memberships]="memberships()"
        [disabled]="pending()"
        (changed)="reviewer = $event"
      />
      <h3>Approver (optional)</h3>
      <app-workflow-assignment
        [memberships]="memberships()"
        [disabled]="pending()"
        (changed)="approver = $event"
      />
      <label class="check"
        ><input type="checkbox" name="legalAi" [(ngModel)]="useAi" />Use authorized AI for ambiguity
        support</label
      >
      <label class="check"
        ><input
          type="checkbox"
          name="pinPlaybook"
          [(ngModel)]="pin"
          (ngModelChange)="version = null"
        />Pin a specific published playbook</label
      >
      @if (pin) {
        <app-legal-playbook-picker
          [disabled]="pending()"
          (changed)="version = $event"
          (denied)="accessDenied.emit()"
        />
      } @else {
        <p class="notice">
          The backend selects an applicable active playbook by company, department, document type
          and effective dates. Missing or ambiguous policy requires review.
        </p>
      }
      <button type="submit" [disabled]="!authorized() || !reviewer || (pin && !version)">
        Create and publish legal workflow
      </button>
    </fieldset>
  </form>`,
})
export class LegalDefinitionComponent {
  readonly memberships = input<Membership[]>([]);
  readonly companyAdmin = input(false);
  readonly authorized = input(false);
  readonly created = output<Definition>();
  readonly accessDenied = output<void>();
  readonly busyChange = output<boolean>();
  private readonly api = inject(LegalClauseService);
  private readonly destroy = inject(DestroyRef);
  readonly pending = signal(false);
  readonly error = signal('');
  name = 'Legal clause intelligence';
  code = '';
  department: number | null = null;
  reviewer: Principal | null = null;
  approver: Principal | null = null;
  useAi = false;
  pin = false;
  version: string | null = null;
  departments(): Membership[] {
    return this.memberships().filter(
      (m, i, all) =>
        m.is_active &&
        m.department !== null &&
        all.findIndex((x) => x.department === m.department) === i,
    );
  }
  create(): void {
    if (
      this.pending() ||
      !this.authorized() ||
      !this.reviewer ||
      !this.name.trim() ||
      !/^[-a-zA-Z0-9_]{1,80}$/.test(this.code) ||
      (this.pin && !this.version)
    )
      return;
    const department = this.companyAdmin()
      ? this.department
      : (this.department ?? this.departments()[0]?.department ?? null);
    if (!this.companyAdmin() && !this.departments().some((m) => m.department === department)) {
      this.error.set('Choose an authorized department.');
      return;
    }
    this.pending.set(true);
    this.busyChange.emit(true);
    this.api
      .createDefinition({
        name: this.name.trim(),
        code: this.code,
        department,
        reviewer: this.reviewer,
        ...(this.approver ? { approver: this.approver } : {}),
        policy: { use_ai: this.useAi, playbook_version: this.pin ? this.version : null },
      })
      .pipe(timeout(15000), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (r) => {
          this.pending.set(false);
          this.busyChange.emit(false);
          if (this.authorized()) this.created.emit(r.definition);
        },
        error: (e) => {
          this.pending.set(false);
          this.busyChange.emit(false);
          this.error.set(this.api.message(e));
          if (e instanceof HttpErrorResponse && [401, 403, 404].includes(e.status))
            this.accessDenied.emit();
        },
      });
  }
}
