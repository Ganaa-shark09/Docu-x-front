import {
  HttpErrorResponse,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import {
  BehaviorSubject,
  catchError,
  filter,
  finalize,
  switchMap,
  take,
  throwError,
} from 'rxjs';

import { AuthService } from '../auth/auth.service';

let isRefreshing = false;
const refreshTokenSubject = new BehaviorSubject<string | null>(null);

export const authInterceptor: HttpInterceptorFn = (
  request: HttpRequest<unknown>,
  next: HttpHandlerFn,
) => {
  const authService = inject(AuthService);

  const requestWithToken = addAccessToken(request, authService.getAccessToken());

  return next(requestWithToken).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        shouldAttemptRefresh(request)
      ) {
        return handle401Error(request, next, authService);
      }

      return throwError(() => error);
    }),
  );
};

function addAccessToken(
  request: HttpRequest<unknown>,
  accessToken: string | null,
): HttpRequest<unknown> {
  if (!accessToken || request.headers.has('Authorization')) {
    return request;
  }

  return request.clone({
    setHeaders: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

function shouldAttemptRefresh(request: HttpRequest<unknown>): boolean {
  const url = request.url;

  // Never refresh for login/refresh endpoints.
  if (url.includes('/auth/login/') || url.includes('/auth/token/refresh/')) {
    return false;
  }

  return true;
}

function handle401Error(
  request: HttpRequest<unknown>,
  next: HttpHandlerFn,
  authService: AuthService,
) {
  if (!authService.getRefreshToken()) {
    authService.forceLogout();
    return throwError(() => new Error('Refresh token not available.'));
  }

  if (!isRefreshing) {
    isRefreshing = true;
    refreshTokenSubject.next(null);

    return authService.refreshAccessToken().pipe(
      switchMap((newAccessToken) => {
        refreshTokenSubject.next(newAccessToken);

        return next(addAccessToken(request, newAccessToken));
      }),
      catchError((refreshError) => {
        authService.forceLogout();
        return throwError(() => refreshError);
      }),
      finalize(() => {
        isRefreshing = false;
      }),
    );
  }

  return refreshTokenSubject.pipe(
    filter((token): token is string => token !== null),
    take(1),
    switchMap((token) => next(addAccessToken(request, token))),
  );
}
