import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { timeout } from 'rxjs';
import { Membership } from '../../documents/models/governance.model';
import { Principal, Definition } from '../models/workflow.model';
import { InvoicePolicy } from '../models/invoice.model';
import { InvoiceWorkflowService } from '../services/invoice-workflow.service';
import { WorkflowAssignmentComponent } from './workflow-assignment.component';
@Component({
  selector: 'app-invoice-definition',
  standalone: true,
  imports: [FormsModule, WorkflowAssignmentComponent],
  styleUrls: ['../workflow.scss', './invoice.scss'],
  template: ` <form class="card" (ngSubmit)="create()">
    <h2>Create invoice workflow</h2>
    <p class="muted">
      Installs the server-validated invoice lifecycle with a frozen policy. Select authorized review
      and approval assignments.
    </p>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    <div class="grid">
      <label
        >Name<input
          name="invoice-name"
          [(ngModel)]="name"
          required
          maxlength="150"
          [disabled]="pending()"
      /></label>
      <label
        >Code<input
          name="invoice-code"
          [(ngModel)]="code"
          required
          maxlength="80"
          pattern="[-a-zA-Z0-9_]+"
          [disabled]="pending()"
      /></label>
      <label
        >Department<select
          name="invoice-department"
          [(ngModel)]="department"
          [disabled]="pending()"
        >
          @if (companyAdmin()) {
            <option [ngValue]="null">Company wide</option>
          }
          @for (member of departments(); track member.department) {
            <option [ngValue]="member.department">{{ member.department_name }}</option>
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
    <p class="muted">When omitted, the reviewer assignment is used for required approval.</p>
    <app-workflow-assignment
      [memberships]="memberships()"
      [disabled]="pending()"
      (changed)="approver = $event"
    />
    <div class="grid">
      <label class="check"
        ><input
          type="checkbox"
          name="invoice-approval"
          [(ngModel)]="policy.require_approval"
          [disabled]="pending()"
        />Require approval</label
      >
      <label class="check"
        ><input
          type="checkbox"
          name="invoice-review"
          [(ngModel)]="policy.force_review"
          [disabled]="pending()"
        />Always require human review</label
      >
      <label class="check"
        ><input
          type="checkbox"
          name="invoice-vendor"
          [(ngModel)]="policy.require_vendor"
          [disabled]="pending()"
        />Require vendor match or review</label
      >
      <label class="check"
        ><input
          type="checkbox"
          name="invoice-po"
          [(ngModel)]="policy.require_po"
          [disabled]="pending()"
        />Require PO match or review</label
      >
      <label class="check"
        ><input
          type="checkbox"
          name="invoice-duplicates"
          [(ngModel)]="policy.review_duplicates"
          [disabled]="pending()"
        />Review duplicate candidates</label
      >
      <label class="check"
        ><input
          type="checkbox"
          name="invoice-ai"
          [(ngModel)]="policy.use_ai"
          [disabled]="pending()"
        />Use authorized AI extraction</label
      >
      <label
        >Minimum extraction confidence (0–1)<input
          name="invoice-confidence"
          [(ngModel)]="threshold"
          inputmode="decimal"
          maxlength="80"
          [disabled]="pending()"
      /></label>
      <label
        >Financial tolerance (optional, 0–1)<input
          name="invoice-tolerance"
          [(ngModel)]="tolerance"
          inputmode="decimal"
          maxlength="80"
          [disabled]="pending()"
      /></label>
      <label
        >Decimal convention<select
          name="invoice-decimal"
          [(ngModel)]="policy.decimal_separator"
          [disabled]="pending()"
        >
          <option [ngValue]="null">Require review when ambiguous</option>
          <option value=".">Decimal point</option>
          <option value=",">Decimal comma</option>
        </select></label
      >
      <label
        >Numeric date convention<select
          name="invoice-date"
          [(ngModel)]="policy.date_order"
          [disabled]="pending()"
        >
          <option [ngValue]="null">Require review when ambiguous</option>
          <option value="DMY">Day / month / year</option>
          <option value="MDY">Month / day / year</option>
        </select></label
      >
    </div>
    <p class="muted">
      The server enforces permissions, AI routing and validation. Requiring a PO match may require
      review when no connector is configured.
    </p>
    <button class="primary" type="submit" [disabled]="pending() || !authorized() || !reviewer">
      {{ pending() ? 'Creating invoice workflow…' : 'Create and publish invoice workflow' }}
    </button>
  </form>`,
})
export class InvoiceDefinitionComponent {
  readonly memberships = input<Membership[]>([]);
  readonly companyAdmin = input(false);
  readonly authorized = input(false);
  readonly created = output<Definition>();
  readonly accessDenied = output<void>();
  readonly busyChange = output<boolean>();
  private readonly api = inject(InvoiceWorkflowService);
  private readonly destroy = inject(DestroyRef);
  readonly pending = signal(false);
  readonly error = signal('');
  name = 'Invoice extraction';
  code = '';
  department: number | null = null;
  reviewer: Principal | null = null;
  approver: Principal | null = null;
  threshold = '0.85';
  tolerance = '';
  policy: InvoicePolicy = {
    require_approval: true,
    force_review: false,
    require_vendor: false,
    require_po: false,
    review_duplicates: true,
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
      !this.name.trim() ||
      !/^[-a-zA-Z0-9_]{1,80}$/.test(this.code)
    )
      return;
    const decimal = /^(?:0(?:\.\d+)?|1(?:\.0+)?)$/;
    if (!decimal.test(this.threshold) || (this.tolerance && !decimal.test(this.tolerance))) {
      this.error.set('Confidence and tolerance must be decimal values from 0 to 1.');
      return;
    }
    const department = this.companyAdmin()
      ? this.department
      : (this.department ?? this.departments()[0]?.department);
    if (!this.companyAdmin() && !this.departments().some((m) => m.department === department)) {
      this.error.set('Choose an authorized department.');
      return;
    }
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
          confidence_threshold: this.threshold,
          tolerance: this.tolerance || null,
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
          this.error.set(this.api.message(e, 'create'));
          if (e instanceof HttpErrorResponse && [401, 403, 404].includes(e.status))
            this.accessDenied.emit();
        },
      });
  }
}
