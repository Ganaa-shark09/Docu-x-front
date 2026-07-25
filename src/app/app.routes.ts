import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';
import { MainLayoutComponent } from './core/layout/main-layout.component';

export const routes: Routes = [
  {
    path: 'login',
    loadChildren: () =>
      import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadChildren: () =>
          import('./features/dashboard/dashboard.routes').then(
            (m) => m.DASHBOARD_ROUTES,
          ),
      },
      {
        path: 'documents',
        loadChildren: () =>
          import('./features/documents/documents.routes').then(
            (m) => m.DOCUMENTS_ROUTES,
          ),
      },
      {
        path: 'ai-chat',
        loadChildren: () =>
          import('./features/ai-chat/ai-chat.routes').then(
            (m) => m.AI_CHAT_ROUTES,
          ),
      },
      {
        path: 'approvals',
        loadChildren: () =>
          import('./features/approvals/approvals.routes').then(
            (m) => m.APPROVALS_ROUTES,
          ),
      },
      {
        path: 'workflows',
        loadChildren: () =>
          import('./features/workflows/workflows.routes').then(
            (m) => m.WORKFLOWS_ROUTES,
          ),
      },
      {
        path: 'notifications',
        loadChildren: () =>
          import('./features/notifications/notifications.routes').then(
            (m) => m.NOTIFICATIONS_ROUTES,
          ),
      },
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard',
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
