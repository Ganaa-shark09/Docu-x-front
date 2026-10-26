import { Routes } from '@angular/router';

export const DOCUMENTS_ROUTES: Routes = [
  {
    path: 'policies',
    loadComponent: () =>
      import('./pages/governance-policy-page.component').then(
        (m) => m.GovernancePolicyPageComponent,
      ),
  },
  {
    path: '',
    redirectTo: 'internal',
    pathMatch: 'full',
  },
  {
    path: 'detail/:uuid',
    loadComponent: () =>
      import('./pages/document-detail-page.component').then((m) => m.DocumentDetailPageComponent),
  },
  {
    path: 'internal',
    loadComponent: () =>
      import('./pages/document-list-page.component').then((m) => m.DocumentListPageComponent),
    data: {
      scope: 'internal',
    },
  },
  {
    path: 'external',
    loadComponent: () =>
      import('./pages/document-list-page.component').then((m) => m.DocumentListPageComponent),
    data: {
      scope: 'external',
    },
  },
];
