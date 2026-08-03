import { Routes } from '@angular/router';

export const WORKFLOWS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/extraction-run-list-page/extraction-run-list-page.component').then(
        (m) => m.ExtractionRunListPageComponent,
      ),
  },
  {
    path: ':uuid',
    loadComponent: () =>
      import('./pages/extraction-run-detail-page/extraction-run-detail-page.component').then(
        (m) => m.ExtractionRunDetailPageComponent,
      ),
  },
];
