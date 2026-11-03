import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';
import { publicGuard } from './core/guards/public.guard';
import { MainLayoutComponent } from './core/layout/main-layout.component';

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
    canActivate: [authGuard],
    loadChildren: () => import('./features/ai-chat/ai.routes').then((m) => m.AI_ROUTES),
  },
  {
    path: 'ai-chat',
    canActivate: [authGuard],
    loadChildren: () => import('./features/ai-chat/ai-chat.routes').then((m) => m.AI_CHAT_ROUTES),
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
        path: 'contracts',
        loadChildren: () =>
          import('./features/contracts/contracts.routes').then((m) => m.CONTRACTS_ROUTES),
      },
      {
        path: 'notifications',
        loadComponent: () =>
          import('./features/workflows/pages/workflow-notifications.component').then(
            (m) => m.WorkflowNotificationsComponent,
          ),
      },
      {
        path: 'administration/platform/ai-models',
        loadComponent: () =>
          import('./features/settings/platform-ai-administration/platform-ai-administration.component').then(
            m => m.PlatformAiAdministrationComponent,
          ),
      },
      {
        path: 'administration/company/ai-models',
        loadComponent: () =>
          import('./features/settings/company-ai-models/company-ai-models.component').then(
            (m) => m.CompanyAiModelsComponent,
          ),
      },
      {
        path: 'settings/company/ai-models',
        pathMatch: 'full',
        redirectTo: 'administration/company/ai-models',
      },
      {
        path: 'administration',
        pathMatch: 'full',
        redirectTo: 'administration/company',
      },
      ...(['organizations', 'company', 'users', 'departments', 'access'] as const).map(
        (section) => ({
          path: `administration/${section}`,
          data: { section },
          loadComponent: () =>
            import('./features/administration/administration.component').then(
              (m) => m.AdministrationComponent,
            ),
        }),
      ),
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
