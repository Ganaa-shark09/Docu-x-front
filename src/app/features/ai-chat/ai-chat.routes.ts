import { Routes } from '@angular/router';

import { PlaceholderPageComponent } from '../../shared/components/placeholder-page.component';

export const AI_CHAT_ROUTES: Routes = [
  {
    path: '',
    component: PlaceholderPageComponent,
    data: { title: 'AI Chat' },
  },
];
