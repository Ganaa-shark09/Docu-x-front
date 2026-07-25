import { Routes } from '@angular/router';

import { PlaceholderPageComponent } from '../../shared/components/placeholder-page.component';

export const WORKFLOWS_ROUTES: Routes = [
  {
    path: '',
    component: PlaceholderPageComponent,
    data: { title: 'Workflows' },
  },
];
