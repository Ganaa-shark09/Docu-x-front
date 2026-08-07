import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, map, tap } from 'rxjs';

import { API_ENDPOINTS } from '../config/api-endpoints';
import { environment } from '../../../environments/environment';
import { TokenStorageService } from './token-storage.service';

export interface LoginPayload {
  username?: string;
  email?: string;
  email_or_username?: string;
  password: string;
}

export interface LoginResponse {
  access?: string;
  refresh?: string;
  access_token?: string;
  refresh_token?: string;
  tokens?: {
    access?: string;
    refresh?: string;
  };
  user?: unknown;
}

export interface RefreshTokenResponse {
  access?: string;
  refresh?: string;
  tokens?: {
    access?: string;
    refresh?: string;
  };
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly tokenStorage = inject(TokenStorageService);
  private readonly apiBaseUrl = environment.apiBaseUrl;

  private readonly authenticatedSubject = new BehaviorSubject<boolean>(
    this.tokenStorage.isAuthenticated(),
  );

  readonly authenticated$ = this.authenticatedSubject.asObservable();

  login(payload: LoginPayload): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(
        `${this.apiBaseUrl}${API_ENDPOINTS.auth.login}`,
        payload,
      )
      .pipe(
        tap((response) => {
          const accessToken =
            response.access ||
            response.access_token ||
            response.tokens?.access;

          const refreshToken =
            response.refresh ||
            response.refresh_token ||
            response.tokens?.refresh;

          if (!accessToken || !refreshToken) {
            throw new Error('Login response did not include access and refresh tokens.');
          }

          this.tokenStorage.setTokens(accessToken, refreshToken);
          this.authenticatedSubject.next(true);
        }),
      );
  }

  refreshAccessToken(): Observable<string> {
    const refreshToken = this.tokenStorage.getRefreshToken();

    if (!refreshToken) {
      this.forceLogout();
      throw new Error('Refresh token not available.');
    }

    return this.http
      .post<RefreshTokenResponse>(
        `${this.apiBaseUrl}${API_ENDPOINTS.auth.refresh}`,
        {
          refresh: refreshToken,
        },
      )
      .pipe(
        tap((response) => {
          const accessToken = response.access || response.tokens?.access;
          const rotatedRefreshToken = response.refresh || response.tokens?.refresh;

          if (!accessToken) {
            throw new Error('Refresh response did not include access token.');
          }

          this.tokenStorage.setAccessToken(accessToken);

          if (rotatedRefreshToken) {
            this.tokenStorage.setRefreshToken(rotatedRefreshToken);
          }

          this.authenticatedSubject.next(true);
        }),
        map((response) => {
          const accessToken = response.access || response.tokens?.access;

          if (!accessToken) {
            throw new Error('Refresh response did not include access token.');
          }

          return accessToken;
        }),
      );
  }

  logout(): void {
    this.forceLogout();
  }

  forceLogout(): void {
    this.tokenStorage.clearTokens();
    this.authenticatedSubject.next(false);
    this.router.navigate(['/login']);
  }

  getAccessToken(): string | null {
    return this.tokenStorage.getAccessToken();
  }

  getRefreshToken(): string | null {
    return this.tokenStorage.getRefreshToken();
  }

  isAuthenticated(): boolean {
    return this.tokenStorage.isAuthenticated();
  }
}
