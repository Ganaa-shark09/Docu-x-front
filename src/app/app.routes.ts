import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';
import { publicGuard } from './core/guards/public.guard';
import { MainLayoutComponent } from './core/layout/main-layout.component';
import { PlaceholderPageComponent } from './shared/components/placeholder-page.component';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [publicGuard],
    loadComponent: () =>
      import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },

  /**
   * AI Chat is intentionally outside MainLayout.
   * It opens as a full-screen assistant workspace.
   */
  {
    path: 'ai',
    loadChildren: () =>
      import('./features/ai-chat/ai.routes').then((m) => m.AI_ROUTES),
  },
  {
    path: 'ai-chat',
    canActivate: [authGuard],
    loadChildren: () =>
      import('./features/ai-chat/ai-chat.routes').then((m) => m.AI_CHAT_ROUTES),
  },

  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/pages/dashboard-page.component').then(
            (m) => m.DashboardPageComponent,
          ),
      },
      {
        path: 'documents',
        loadChildren: () =>
          import('./features/documents/documents.routes').then((m) => m.DOCUMENTS_ROUTES),
      },
      {
        path: 'approvals',
        loadChildren: () =>
          import('./features/approvals/approvals.routes').then((m) => m.APPROVALS_ROUTES),
      },
      {
        path: 'workflows',
        loadChildren: () =>
          import('./features/workflows/workflows.routes').then((m) => m.WORKFLOWS_ROUTES),
      },
      {
        path: 'notifications',
        component: PlaceholderPageComponent,
        data: { title: 'Notifications' },
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
