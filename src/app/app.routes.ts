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
        component: PlaceholderPageComponent,
        data: { title: 'Documents' },
      },
      {
        path: 'ai-chat',
        component: PlaceholderPageComponent,
        data: { title: 'AI Chat' },
      },
      {
        path: 'approvals',
        component: PlaceholderPageComponent,
        data: { title: 'Approvals' },
      },
      {
        path: 'workflows',
        component: PlaceholderPageComponent,
        data: { title: 'Workflows' },
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
