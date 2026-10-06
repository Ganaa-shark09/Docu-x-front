import {
  HttpErrorResponse,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';

import {
  inject,
} from '@angular/core';

import {
  BehaviorSubject,
  catchError,
  filter,
  finalize,
  switchMap,
  take,
  throwError,
} from 'rxjs';

import {
  AuthService,
} from '../auth/auth.service';

import {
  environment,
} from '../../../environments/environment';


let isRefreshing = false;

const refreshTokenSubject =
  new BehaviorSubject<string | null>(
    null,
  );


export const authInterceptor:
  HttpInterceptorFn = (
    request: HttpRequest<unknown>,
    next: HttpHandlerFn,
  ) => {
    const authService =
      inject(AuthService);

    let preparedRequest =
      isDocuXApiRequest(request)
        ? request.clone({
            withCredentials: true,
          })
        : request;

    if (
      shouldAttachAccessToken(
        preparedRequest
      )
    ) {
      preparedRequest =
        addAccessToken(
          preparedRequest,
          authService.getAccessToken(),
        );
    }

    return next(
      preparedRequest,
    ).pipe(
      catchError(
        (error: unknown) => {
          if (
            error instanceof
              HttpErrorResponse
            &&
            error.status === 401
            &&
            shouldAttemptRefresh(
              preparedRequest
            )
          ) {
            return handle401Error(
              preparedRequest,
              next,
              authService,
            );
          }

          return throwError(
            () => error,
          );
        },
      ),
    );
  };


function isDocuXApiRequest(
  request: HttpRequest<unknown>,
): boolean {
  const configuredBase =
    environment.apiBaseUrl.replace(
      /\/+$/,
      '',
    );

  const requestUrl =
    request.url;

  const isAbsoluteHttpUrl = (
    value: string,
  ): boolean =>
    /^https?:\/\//i.test(value);

  let apiOrigin:
    string | null = null;

  let apiPath =
    configuredBase;

  if (
    isAbsoluteHttpUrl(
      configuredBase,
    )
  ) {
    const parsedBase =
      new URL(
        configuredBase,
      );

    apiOrigin =
      parsedBase.origin;

    apiPath =
      parsedBase.pathname.replace(
        /\/+$/,
        '',
      ) || '/';
  } else {
    apiPath =
      configuredBase.startsWith('/')
        ? configuredBase
        : `/${configuredBase}`;
  }

  /*
   * Absolute requests must match the configured
   * DocuX API origin exactly.
   */
  if (
    isAbsoluteHttpUrl(
      requestUrl,
    )
  ) {
    if (!apiOrigin) {
      return false;
    }

    const parsedRequest =
      new URL(
        requestUrl,
      );

    return (
      parsedRequest.origin ===
        apiOrigin
      &&
      matchesApiPath(
        parsedRequest.pathname,
        apiPath,
      )
    );
  }

  /*
   * Relative URLs are same-origin browser requests.
   * Only the configured API path is credentialed.
   */
  const requestPath =
    requestUrl.split(
      /[?#]/,
      1,
    )[0] || '';

  return matchesApiPath(
    requestPath,
    apiPath,
  );
}


function matchesApiPath(
  requestPath: string,
  apiPath: string,
): boolean {
  if (apiPath === '/') {
    return requestPath.startsWith(
      '/',
    );
  }

  return (
    requestPath === apiPath
    ||
    requestPath.startsWith(
      `${apiPath}/`,
    )
  );
}


function shouldAttachAccessToken(
  request: HttpRequest<unknown>,
): boolean {
  if (!isDocuXApiRequest(request)) {
    return false;
  }

  const url = request.url;

  return !(
    url.includes('/auth/login/')
    ||
    url.includes('/auth/refresh/')
    ||
    url.includes('/auth/token/refresh/')
    ||
    url.includes('/auth/logout/')
    ||
    url.includes('/auth/csrf/')
  );
}


function addAccessToken(
  request: HttpRequest<unknown>,
  accessToken: string | null,
  replaceExisting = false,
): HttpRequest<unknown> {
  if (!accessToken) {
    return request;
  }

  if (
    request.headers.has(
      'Authorization',
    )
    &&
    !replaceExisting
  ) {
    return request;
  }

  return request.clone({
    setHeaders: {
      Authorization:
        `Bearer ${accessToken}`,
    },
  });
}


function shouldAttemptRefresh(
  request: HttpRequest<unknown>,
): boolean {
  if (!isDocuXApiRequest(request)) {
    return false;
  }

  const url = request.url;

  if (
    url.includes('/auth/login/')
    ||
    url.includes('/auth/refresh/')
    ||
    url.includes('/auth/token/refresh/')
    ||
    url.includes('/auth/logout/')
    ||
    url.includes('/auth/csrf/')
  ) {
    return false;
  }

  return true;
}


function handle401Error(
  request: HttpRequest<unknown>,
  next: HttpHandlerFn,
  authService: AuthService,
) {
  if (!isRefreshing) {
    isRefreshing = true;

    refreshTokenSubject.next(
      null,
    );

    return authService
      .refreshAccessToken()
      .pipe(
        switchMap(
          (newAccessToken) => {
            refreshTokenSubject.next(
              newAccessToken,
            );

            return next(
              addAccessToken(
                request,
                newAccessToken,
                true,
              ),
            );
          },
        ),

        catchError(
          (refreshError) => {
            authService.forceLogout();

            return throwError(
              () => refreshError,
            );
          },
        ),

        finalize(() => {
          isRefreshing = false;
        }),
      );
  }

  return refreshTokenSubject.pipe(
    filter(
      (token): token is string =>
        token !== null,
    ),

    take(1),

    switchMap(
      (token) =>
        next(
          addAccessToken(
            request,
            token,
            true,
          ),
        ),
    ),
  );
}
