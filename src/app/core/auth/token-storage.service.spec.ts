import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  TokenStorageService,
} from './token-storage.service';


describe('TokenStorageService', () => {
  let service: TokenStorageService;

  beforeEach(() => {
    localStorage.clear();

    service =
      new TokenStorageService();
  });


  it('stores the access token only in memory', () => {
    const setItemSpy =
      vi.spyOn(
        Storage.prototype,
        'setItem',
      );

    service.setAccessToken(
      'access-token',
    );

    expect(
      service.getAccessToken(),
    ).toBe(
      'access-token',
    );

    expect(
      setItemSpy,
    ).not.toHaveBeenCalled();
  });


  it('does not persist authentication tokens to localStorage', () => {
    service.setAccessToken(
      'access-token',
    );

    expect(
      localStorage.getItem(
        'docux_access_token',
      ),
    ).toBeNull();

    expect(
      localStorage.getItem(
        'docux_refresh_token',
      ),
    ).toBeNull();
  });


  it('clears the in-memory token and removes legacy stored tokens', () => {
    localStorage.setItem(
      'docux_access_token',
      'legacy-access',
    );

    localStorage.setItem(
      'docux_refresh_token',
      'legacy-refresh',
    );

    service.setAccessToken(
      'current-access',
    );

    service.clearTokens();

    expect(
      service.getAccessToken(),
    ).toBeNull();

    expect(
      service.isAuthenticated(),
    ).toBe(false);

    expect(
      localStorage.getItem(
        'docux_access_token',
      ),
    ).toBeNull();

    expect(
      localStorage.getItem(
        'docux_refresh_token',
      ),
    ).toBeNull();
  });


  it('reports authenticated only while an access token is held in memory', () => {
    expect(
      service.isAuthenticated(),
    ).toBe(false);

    service.setAccessToken(
      'access-token',
    );

    expect(
      service.isAuthenticated(),
    ).toBe(true);

    service.clearTokens();

    expect(
      service.isAuthenticated(),
    ).toBe(false);
  });
});
