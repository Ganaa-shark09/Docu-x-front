import { Routes } from '@angular/router';

export const APPROVALS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/approval-list-page/approval-list-page.component').then(
        (m) => m.ApprovalListPageComponent,
      ),
  },
  {
    path: ':uuid',
    loadComponent: () =>
      import('./pages/approval-detail-page/approval-detail-page.component').then(
        (m) => m.ApprovalDetailPageComponent,
      ),
  },
];
