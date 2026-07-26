import { Routes } from '@angular/router';

export const AI_CHAT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/ai-chat-page/ai-chat-page.component').then(
        (m) => m.AiChatPageComponent,
      ),
  },
];
