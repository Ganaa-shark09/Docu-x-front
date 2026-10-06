import { Injectable } from '@angular/core';


@Injectable({
  providedIn: 'root',
})
export class TokenStorageService {
  private accessToken: string | null = null;

  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  clearTokens(): void {
    this.accessToken = null;

    /*
     * Clean up credentials left by older DocuX builds.
     * New authentication never writes tokens to localStorage.
     */
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(
        'docux_access_token',
      );

      localStorage.removeItem(
        'docux_refresh_token',
      );
    }
  }

  isAuthenticated(): boolean {
    return !!this.accessToken;
  }
}
