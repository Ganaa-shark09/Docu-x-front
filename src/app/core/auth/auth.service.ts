import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, map, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { API_ENDPOINTS } from '../config/api-endpoints';
import { AuthTokens, LoginRequest, LoginResponse, UserProfile } from './models/auth.model';
import { TokenStorageService } from './token-storage.service';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly tokenStorage = inject(TokenStorageService);

  private readonly currentUserSubject = new BehaviorSubject<UserProfile | null>(
    this.tokenStorage.getUser(),
  );

  readonly currentUser$ = this.currentUserSubject.asObservable();

  login(request: LoginRequest): Observable<UserProfile> {
    const url = `${environment.apiBaseUrl}${API_ENDPOINTS.auth.login}`;

    return this.http.post<LoginResponse>(url, request).pipe(
      tap((response) => {
        const tokens = this.extractTokens(response);
        const user = this.extractUser(response);

        this.tokenStorage.saveTokens(tokens);
        this.tokenStorage.saveUser(user);
        this.currentUserSubject.next(user);
      }),
      map((response) => this.extractUser(response)),
    );
  }

  fetchProfile(): Observable<UserProfile> {
    const url = `${environment.apiBaseUrl}${API_ENDPOINTS.auth.profile}`;

    return this.http.get<UserProfile>(url).pipe(
      tap((user) => {
        this.tokenStorage.saveUser(user);
        this.currentUserSubject.next(user);
      }),
    );
  }

  refreshToken(): Observable<AuthTokens> {
    const refresh = this.tokenStorage.getRefreshToken();
    const url = `${environment.apiBaseUrl}${API_ENDPOINTS.auth.refresh}`;

    return this.http.post<AuthTokens>(url, { refresh }).pipe(
      tap((tokens) => {
        this.tokenStorage.saveTokens(tokens);
      }),
    );
  }

  logout(): void {
    this.tokenStorage.clear();
    this.currentUserSubject.next(null);
  }

  isAuthenticated(): boolean {
    return this.tokenStorage.hasAccessToken();
  }

  getAccessToken(): string | null {
    return this.tokenStorage.getAccessToken();
  }

  private extractTokens(response: LoginResponse): AuthTokens {
    if (response.tokens?.access && response.tokens?.refresh) {
      return response.tokens;
    }

    if (response.access && response.refresh) {
      return {
        access: response.access,
        refresh: response.refresh,
      };
    }

    throw new Error('Login response does not contain access and refresh tokens.');
  }

  private extractUser(response: LoginResponse): UserProfile {
    const user = response.user ?? response.profile;

    if (!user) {
      throw new Error('Login response does not contain user profile.');
    }

    return user;
  }
}
