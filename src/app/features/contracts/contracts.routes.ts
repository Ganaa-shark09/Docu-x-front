import { Routes } from '@angular/router';

export const CONTRACTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/contract-register-page/contract-register-page.component')
      .then(m => m.ContractRegisterPageComponent),
  },
  {
    // DOCUX_NAV_V12 contract-only review runs. Specific route before :uuid.
    path: 'runs',
    loadComponent: () => import('./pages/contract-runs-page/contract-runs-page.component')
      .then(m => m.ContractRunsPageComponent),
  },
  {
    path: ':uuid',
    loadComponent: () => import('./pages/contract-detail-page/contract-detail-page.component')
      .then(m => m.ContractDetailPageComponent),
  },
];
