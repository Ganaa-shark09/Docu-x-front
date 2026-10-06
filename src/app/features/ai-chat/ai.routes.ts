import { Routes, UrlMatcher } from '@angular/router';

const externalAiMatcher: UrlMatcher = (segments) => {
  if (
    !segments.length ||
    segments[0].path !== 'external' ||
    segments.length > 2
  ) {
    return null;
  }

  if (segments.length === 1) {
    return {
      consumed: segments,
    };
  }

  return {
    consumed: segments,
    posParams: {
      conversationUuid: segments[1],
    },
  };
};

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
    path: 'internal/:conversationUuid',
    loadComponent: () =>
      import('./pages/ai-chat-page/ai-chat-page.component').then(
        (m) => m.AiChatPageComponent,
      ),
  },
  {
    matcher: externalAiMatcher,
    loadComponent: () =>
      import('./pages/external-ai-chat-page/external-ai-chat-page.component').then(
        (m) => m.ExternalAiChatPageComponent,
      ),
  },
];
