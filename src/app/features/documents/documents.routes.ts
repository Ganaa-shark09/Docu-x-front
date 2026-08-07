import { Routes } from '@angular/router';

export const DOCUMENTS_ROUTES: Routes = [
  {
    path: '',
    redirectTo: 'internal',
    pathMatch: 'full',
  },
  {
    path: 'internal',
    loadComponent: () =>
      import('./pages/document-list-page.component').then(
        (m) => m.DocumentListPageComponent,
      ),
    data: {
      scope: 'internal',
    },
  },
  {
    path: 'external',
    loadComponent: () =>
      import('./pages/document-list-page.component').then(
        (m) => m.DocumentListPageComponent,
      ),
    data: {
      scope: 'external',
    },
  },
];
