import { Routes } from '@angular/router';

export const DOCUMENTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/document-list-page.component').then(
        (m) => m.DocumentListPageComponent,
      ),
  },
  {
    path: ':uuid',
    loadComponent: () =>
      import('./pages/document-detail-page.component').then(
        (m) => m.DocumentDetailPageComponent,
      ),
  },
];
