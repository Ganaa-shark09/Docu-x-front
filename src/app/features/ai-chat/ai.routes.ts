import { Routes } from '@angular/router';

export const AI_ROUTES: Routes = [
  {
    path: '',
    redirectTo: 'internal',
    pathMatch: 'full',
  },
  {
    path: 'internal',
    loadComponent: () =>
      import('./pages/ai-chat-page/ai-chat-page.component').then(
        (m) => m.AiChatPageComponent,
      ),
  },
  {
    path: 'external',
    loadComponent: () =>
      import('./pages/external-ai-chat-page/external-ai-chat-page.component').then(
        (m) => m.ExternalAiChatPageComponent,
      ),
  },
];
