import { Routes } from '@angular/router';
export const WORKFLOWS_ROUTES: Routes = [
  {
    path: 'contract-workspace',
    loadChildren: () => import('../contracts/contracts.routes').then(m => m.CONTRACTS_ROUTES),
  },

  { path: 'compliance', pathMatch: 'full', redirectTo: 'compliance/assessments' },
  ...['frameworks', 'controls', 'assessments'].flatMap((mode) => [
    {
      path: 'compliance/' + mode,
      data: { mode },
      loadComponent: () =>
        import('./pages/compliance-workspace.component').then(
          (m) => m.ComplianceWorkspaceComponent,
        ),
    },
    {
      path: 'compliance/' + mode + '/:uuid',
      data: { mode },
      loadComponent: () =>
        import('./pages/compliance-workspace.component').then(
          (m) => m.ComplianceWorkspaceComponent,
        ),
    },
  ]),
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/workflow-hub.component').then((m) => m.WorkflowHubComponent),
  },
  {
    path: 'definitions',
    loadComponent: () =>
      import('./pages/workflow-definitions.component').then((m) => m.WorkflowDefinitionsComponent),
  },
  {
    path: 'definitions/:uuid',
    loadComponent: () =>
      import('./pages/workflow-definition-detail.component').then(
        (m) => m.WorkflowDefinitionDetailComponent,
      ),
  },
  {
    path: 'runs',
    loadComponent: () =>
      import('./pages/workflow-runs.component').then((m) => m.WorkflowRunsComponent),
  },
  {
    path: 'invoices',
    loadComponent: () => import('./pages/invoice-register.component').then((m) => m.InvoiceRegisterComponent),
  },
  {
    path: 'invoice-batches',
    loadComponent: () => import('./pages/invoice-batches.component').then((m) => m.InvoiceBatchesComponent),
  },
  {
    path: 'invoice-batches/:uuid',
    loadComponent: () => import('./pages/invoice-batches.component').then((m) => m.InvoiceBatchesComponent),
  },
  {
    path: 'runs/:uuid',
    loadComponent: () =>
      import('./pages/workflow-run-detail.component').then((m) => m.WorkflowRunDetailComponent),
  },
  {
    path: 'extractions',
    loadComponent: () =>
      import('./pages/extraction-run-list-page/extraction-run-list-page.component').then(
        (m) => m.ExtractionRunListPageComponent,
      ),
  },
  {
    path: 'extractions/:uuid',
    loadComponent: () =>
      import('./pages/extraction-run-detail-page/extraction-run-detail-page.component').then(
        (m) => m.ExtractionRunDetailPageComponent,
      ),
  },
  {
    path: 'hr-policies',
    loadComponent: () => import('./pages/hr-policies.component').then((m) => m.HRPoliciesComponent),
  },
  {
    path: 'hr-policies/:uuid',
    loadComponent: () => import('./pages/hr-policies.component').then((m) => m.HRPoliciesComponent),
  },
  { path: 'legal', pathMatch: 'full', redirectTo: 'legal/playbooks' },
  {
    path: 'legal/clause-types',
    data: { mode: 'taxonomy' },
    loadComponent: () =>
      import('./pages/legal-configuration.component').then((m) => m.LegalConfigurationComponent),
  },
  {
    path: 'legal/playbooks',
    data: { mode: 'playbooks' },
    loadComponent: () =>
      import('./pages/legal-configuration.component').then((m) => m.LegalConfigurationComponent),
  },
  {
    path: 'legal/playbooks/:uuid',
    data: { mode: 'playbooks' },
    loadComponent: () =>
      import('./pages/legal-configuration.component').then((m) => m.LegalConfigurationComponent),
  },
  {
    path: 'rfp-projects',
    loadComponent: () =>
      import('./pages/rfp-projects.component').then((m) => m.RFPProjectsComponent),
  },
  {
    path: 'rfp-projects/:uuid',
    loadComponent: () =>
      import('./pages/rfp-projects.component').then((m) => m.RFPProjectsComponent),
  },
  {
    path: 'finance-audits',
    loadComponent: () =>
      import('./pages/finance-audits.component').then((m) => m.FinanceAuditsComponent),
  },
  {
    path: 'finance-audits/:uuid',
    loadComponent: () =>
      import('./pages/finance-audits.component').then((m) => m.FinanceAuditsComponent),
  },
  {
    path: ':uuid',
    loadComponent: () =>
      import('./pages/extraction-run-detail-page/extraction-run-detail-page.component').then(
        (m) => m.ExtractionRunDetailPageComponent,
      ),
  },
];
