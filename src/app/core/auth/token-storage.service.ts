import { Injectable } from '@angular/core';

import { AuthTokens, UserProfile } from '../models/auth.model';

@Injectable({
  providedIn: 'root',
})
export class TokenStorageService {
  private readonly accessTokenKey = 'docux_access_token';
  private readonly refreshTokenKey = 'docux_refresh_token';
  private readonly userKey = 'docux_user';

  getAccessToken(): string | null {
    return this.storage?.getItem(this.accessTokenKey) ?? null;
  }

  getRefreshToken(): string | null {
    return this.storage?.getItem(this.refreshTokenKey) ?? null;
  }

  saveTokens(tokens: AuthTokens): void {
    this.storage?.setItem(this.accessTokenKey, tokens.access);
    this.storage?.setItem(this.refreshTokenKey, tokens.refresh);
  }

  saveUser(user: UserProfile): void {
    this.storage?.setItem(this.userKey, JSON.stringify(user));
  }

  getUser(): UserProfile | null {
    const value = this.storage?.getItem(this.userKey);

    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value) as UserProfile;
    } catch {
      this.clear();
      return null;
    }
  }

  hasAccessToken(): boolean {
    return Boolean(this.getAccessToken());
  }

  clear(): void {
    this.storage?.removeItem(this.accessTokenKey);
    this.storage?.removeItem(this.refreshTokenKey);
    this.storage?.removeItem(this.userKey);
  }

  private get storage(): Storage | null {
    if (typeof window === 'undefined') {
      return null;
    }

    return window.localStorage;
  }
}
