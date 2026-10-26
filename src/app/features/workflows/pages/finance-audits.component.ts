import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FinanceWorkspaceStore } from '../services/finance-workspace.store';
import { FinanceScopeComponent } from '../components/finance-scope.component';
import { FinanceValueComponent } from '../components/finance-value.component';
import { FinancePagerComponent } from '../components/finance-pager.component';
import { FinanceDatasetsComponent } from '../components/finance-datasets.component';
import { FinanceTransactionsComponent } from '../components/finance-transactions.component';
import { FinanceTestsComponent } from '../components/finance-tests.component';
import { FinanceFindingsComponent } from '../components/finance-findings.component';
import { FinanceOutputsComponent } from '../components/finance-outputs.component';
import { WorkflowAssignmentComponent } from '../components/workflow-assignment.component';
import { FinancePolicy, FinanceScope } from '../models/finance.model';
import { Json, Principal } from '../models/workflow.model';
@Component({
  standalone: true,
  providers: [FinanceWorkspaceStore],
  imports: [
    FormsModule,
    RouterLink,
    FinanceScopeComponent,
    FinanceValueComponent,
    FinancePagerComponent,
    FinanceDatasetsComponent,
    FinanceTransactionsComponent,
    FinanceTestsComponent,
    FinanceFindingsComponent,
    FinanceOutputsComponent,
    WorkflowAssignmentComponent,
  ],
  styleUrls: ['../workflow.scss', '../components/finance.scss'],
  templateUrl: './finance-audits.component.html',
})
export class FinanceAuditsComponent {
  readonly s = inject(FinanceWorkspaceStore);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  readonly tab = signal('Overview');
  readonly tabs = [
    'Overview',
    'Datasets',
    'Transactions',
    'Sampling / tests',
    'Reconciliation',
    'Findings / remediation',
    'Review / approval',
    'Final output',
  ];
  showCreate = false;
  editing = false;
  title = '';
  department: number | null = null;
  reviewer: Principal | null = null;
  approver: Principal | null = null;
  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      this.reset();
      this.tab.set('Overview');
      this.s.reload(p.get('uuid') || '');
    });
    this.s.refreshed$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.editing = false;
    });
    this.s.cancel$.pipe(takeUntilDestroyed()).subscribe(() => {
      if (!this.s.audit()) this.reset();
    });
  }
  json(v: unknown) {
    return v as Json;
  }
  reset() {
    this.showCreate = false;
    this.editing = false;
    this.title = '';
    this.department = null;
    this.reviewer = null;
    this.approver = null;
  }
  create(value: { scope: FinanceScope; policy: FinancePolicy }) {
    if (!this.s.canManage(this.department) || !this.title.trim()) return;
    this.s.mutate(
      () => this.s.api.create({ title: this.title.trim(), department: this.department, ...value }),
      (a) => {
        this.reset();
        void this.router.navigate(['/workflows/finance-audits', a.uuid]);
      },
    );
  }
  configure(value: { scope: FinanceScope; policy: FinancePolicy }) {
    if (!this.s.canConfigure()) return;
    this.s.mutate(
      () => this.s.api.configure(this.s.id, this.s.revision(), value.scope, value.policy),
      () => (this.editing = false),
    );
  }
  submit() {
    if (!this.s.canConfigure() || !this.reviewer || !this.approver) return;
    const value = { revision: this.s.revision(), reviewer: this.reviewer, approver: this.approver };
    this.s.mutate(() =>
      this.s.api.submit(
        this.s.id,
        value.revision,
        value.reviewer,
        value.approver,
        this.s.key('submit', value),
      ),
    );
  }
}
