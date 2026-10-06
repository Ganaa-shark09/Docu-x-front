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


export const publicGuard:
  CanActivateFn = () => {
    const authService =
      inject(AuthService);

    const router =
      inject(Router);

    return authService
      .ensureSession()
      .pipe(
        map((authenticated) => {
          if (!authenticated) {
            return true;
          }

          return router.createUrlTree(
            ['/dashboard'],
          );
        }),
      );
  };
