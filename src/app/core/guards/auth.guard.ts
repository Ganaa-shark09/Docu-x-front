import {
  inject,
} from '@angular/core';

import {
  CanActivateFn,
  Router,
} from '@angular/router';

import {
  map,
} from 'rxjs';

import {
  AuthService,
} from '../auth/auth.service';


export const authGuard:
  CanActivateFn = (
    route,
    state,
  ) => {
    const authService =
      inject(AuthService);

    const router =
      inject(Router);

    return authService
      .ensureSession()
      .pipe(
        map((authenticated) => {
          if (authenticated) {
            return true;
          }

          return router.createUrlTree(
            ['/login'],
            {
              queryParams: {
                returnUrl:
                  state.url,
              },
            },
          );
        }),
      );
  };
