import {
  HttpClient,
  HttpHeaders,
} from '@angular/common/http';

import {
  Injectable,
  inject,
} from '@angular/core';

import { Router } from '@angular/router';

import {
  BehaviorSubject,
  Observable,
  catchError,
  finalize,
  map,
  of,
  shareReplay,
  switchMap,
  tap,
  throwError,
} from 'rxjs';

import {
  API_ENDPOINTS,
} from '../config/api-endpoints';

import {
  environment,
} from '../../../environments/environment';

import {
  TokenStorageService,
} from './token-storage.service';


export interface LoginPayload {
  username?: string;
  email?: string;
  email_or_username?: string;
  password: string;
}


export interface LoginResponse {
  access: string;
  user?: unknown;
}


export interface RefreshTokenResponse {
  access: string;
}


interface CsrfTokenResponse {
  csrfToken: string;
}


@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http =
    inject(HttpClient);

  private readonly router =
    inject(Router);

  private readonly tokenStorage =
    inject(TokenStorageService);

  private readonly apiBaseUrl =
    environment.apiBaseUrl;

  private csrfToken: string | null = null;

  private sessionRequest$:
    Observable<boolean> | null = null;

  private readonly authenticatedSubject =
    new BehaviorSubject<boolean>(
      this.tokenStorage.isAuthenticated(),
    );

  readonly authenticated$ =
    this.authenticatedSubject.asObservable();


  login(
    payload: LoginPayload,
  ): Observable<LoginResponse> {
    return this.ensureCsrfToken().pipe(
      switchMap((csrfToken) =>
        this.http.post<LoginResponse>(
          `${this.apiBaseUrl}${API_ENDPOINTS.auth.login}`,
          payload,
          {
            withCredentials: true,
            headers: this.csrfHeaders(
              csrfToken,
            ),
          },
        ),
      ),

      tap((response) => {
        if (!response.access) {
          throw new Error(
            'Login response did not include an access token.',
          );
        }

        this.tokenStorage.setAccessToken(
          response.access,
        );

        this.authenticatedSubject.next(
          true,
        );
      }),
    );
  }


  refreshAccessToken(): Observable<string> {
    return this.ensureCsrfToken().pipe(
      switchMap((csrfToken) =>
        this.http.post<RefreshTokenResponse>(
          `${this.apiBaseUrl}${API_ENDPOINTS.auth.refresh}`,
          {},
          {
            withCredentials: true,
            headers: this.csrfHeaders(
              csrfToken,
            ),
          },
        ),
      ),

      map((response) => {
        if (!response.access) {
          throw new Error(
            'Refresh response did not include an access token.',
          );
        }

        this.tokenStorage.setAccessToken(
          response.access,
        );

        this.authenticatedSubject.next(
          true,
        );

        return response.access;
      }),
    );
  }


  ensureSession(): Observable<boolean> {
    if (
      this.tokenStorage.getAccessToken()
    ) {
      return of(true);
    }

    if (this.sessionRequest$) {
      return this.sessionRequest$;
    }

    this.sessionRequest$ =
      this.refreshAccessToken().pipe(
        map(() => true),

        catchError(() => {
          this.tokenStorage.clearTokens();

          this.authenticatedSubject.next(
            false,
          );

          return of(false);
        }),

        finalize(() => {
          this.sessionRequest$ = null;
        }),

        shareReplay({
          bufferSize: 1,
          refCount: false,
        }),
      );

    return this.sessionRequest$;
  }


  logout(): void {
    this.ensureCsrfToken()
      .pipe(
        switchMap((csrfToken) =>
          this.http.post(
            `${this.apiBaseUrl}${API_ENDPOINTS.auth.logout}`,
            {},
            {
              withCredentials: true,
              headers: this.csrfHeaders(
                csrfToken,
              ),
            },
          ),
        ),

        catchError(() => of(null)),

        finalize(() => {
          this.forceLogout();
        }),
      )
      .subscribe();
  }


  forceLogout(): void {
    this.tokenStorage.clearTokens();

    this.authenticatedSubject.next(
      false,
    );

    this.router.navigate([
      '/login',
    ]);
  }


  getAccessToken(): string | null {
    return this.tokenStorage.getAccessToken();
  }


  isAuthenticated(): boolean {
    return this.tokenStorage.isAuthenticated();
  }


  private ensureCsrfToken():
    Observable<string> {
    if (this.csrfToken) {
      return of(
        this.csrfToken,
      );
    }

    return this.http
      .get<CsrfTokenResponse>(
        `${this.apiBaseUrl}${API_ENDPOINTS.auth.csrf}`,
        {
          withCredentials: true,
        },
      )
      .pipe(
        map((response) => {
          if (!response.csrfToken) {
            throw new Error(
              'CSRF token was not returned.',
            );
          }

          this.csrfToken =
            response.csrfToken;

          return response.csrfToken;
        }),
      );
  }


  private csrfHeaders(
    token: string,
  ): HttpHeaders {
    return new HttpHeaders({
      'X-CSRFToken': token,
    });
  }
}
