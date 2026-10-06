import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import {
  provideHttpClient,
} from '@angular/common/http';

import {
  TestBed,
} from '@angular/core/testing';

import {
  Router,
} from '@angular/router';

import {
  firstValueFrom,
} from 'rxjs';

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  environment,
} from '../../../environments/environment';

import {
  AuthService,
} from './auth.service';

import {
  TokenStorageService,
} from './token-storage.service';


describe('AuthService', () => {
  let service: AuthService;
  let tokenStorage:
    TokenStorageService;

  let httpMock:
    HttpTestingController;

  const router = {
    navigate: vi.fn(),
  };


  beforeEach(() => {
    vi.clearAllMocks();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),

        {
          provide: Router,
          useValue: router,
        },
      ],
    });

    service =
      TestBed.inject(
        AuthService,
      );

    tokenStorage =
      TestBed.inject(
        TokenStorageService,
      );

    httpMock =
      TestBed.inject(
        HttpTestingController,
      );

    localStorage.clear();
  });


  it('logs in using CSRF and stores only the access token in memory', async () => {
    const loginPromise =
      firstValueFrom(
        service.login({
          email_or_username:
            'user@example.com',

          password:
            'password123',
        }),
      );


    const csrfRequest =
      httpMock.expectOne(
        `${environment.apiBaseUrl}/auth/csrf/`,
      );

    expect(
      csrfRequest.request.method,
    ).toBe('GET');

    expect(
      csrfRequest.request.withCredentials,
    ).toBe(true);

    csrfRequest.flush({
      csrfToken:
        'csrf-token',
    });


    const loginRequest =
      httpMock.expectOne(
        `${environment.apiBaseUrl}/auth/login/`,
      );

    expect(
      loginRequest.request.method,
    ).toBe('POST');

    expect(
      loginRequest.request.withCredentials,
    ).toBe(true);

    expect(
      loginRequest.request.headers.get(
        'X-CSRFToken',
      ),
    ).toBe(
      'csrf-token',
    );

    expect(
      loginRequest.request.body,
    ).toEqual({
      email_or_username:
        'user@example.com',

      password:
        'password123',
    });


    loginRequest.flush({
      access:
        'access-token',

      user: {
        id: 1,
      },
    });


    await loginPromise;


    expect(
      tokenStorage.getAccessToken(),
    ).toBe(
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

    httpMock.verify();
  });


  it('restores the session using the HttpOnly refresh cookie', async () => {
    const sessionPromise =
      firstValueFrom(
        service.ensureSession(),
      );


    const csrfRequest =
      httpMock.expectOne(
        `${environment.apiBaseUrl}/auth/csrf/`,
      );

    csrfRequest.flush({
      csrfToken:
        'csrf-token',
    });


    const refreshRequest =
      httpMock.expectOne(
        `${environment.apiBaseUrl}/auth/refresh/`,
      );

    expect(
      refreshRequest.request.method,
    ).toBe('POST');

    expect(
      refreshRequest.request.body,
    ).toEqual({});

    expect(
      refreshRequest.request.withCredentials,
    ).toBe(true);

    expect(
      refreshRequest.request.headers.get(
        'X-CSRFToken',
      ),
    ).toBe(
      'csrf-token',
    );


    refreshRequest.flush({
      access:
        'restored-access-token',
    });


    expect(
      await sessionPromise,
    ).toBe(true);

    expect(
      tokenStorage.getAccessToken(),
    ).toBe(
      'restored-access-token',
    );

    httpMock.verify();
  });


  it('returns false when session restoration fails', async () => {
    const sessionPromise =
      firstValueFrom(
        service.ensureSession(),
      );


    const csrfRequest =
      httpMock.expectOne(
        `${environment.apiBaseUrl}/auth/csrf/`,
      );

    csrfRequest.flush({
      csrfToken:
        'csrf-token',
    });


    const refreshRequest =
      httpMock.expectOne(
        `${environment.apiBaseUrl}/auth/refresh/`,
      );

    refreshRequest.flush(
      {
        detail:
          'Expired session',
      },
      {
        status: 401,
        statusText:
          'Unauthorized',
      },
    );


    expect(
      await sessionPromise,
    ).toBe(false);

    expect(
      tokenStorage.getAccessToken(),
    ).toBeNull();

    httpMock.verify();
  });


  it('calls server logout before clearing client authentication state', () => {
    tokenStorage.setAccessToken(
      'access-token',
    );

    service.logout();


    const csrfRequest =
      httpMock.expectOne(
        `${environment.apiBaseUrl}/auth/csrf/`,
      );

    csrfRequest.flush({
      csrfToken:
        'csrf-token',
    });


    const logoutRequest =
      httpMock.expectOne(
        `${environment.apiBaseUrl}/auth/logout/`,
      );

    expect(
      logoutRequest.request.method,
    ).toBe('POST');

    expect(
      logoutRequest.request.withCredentials,
    ).toBe(true);

    expect(
      logoutRequest.request.headers.get(
        'X-CSRFToken',
      ),
    ).toBe(
      'csrf-token',
    );


    logoutRequest.flush({
      detail:
        'Logged out successfully.',
    });


    expect(
      tokenStorage.getAccessToken(),
    ).toBeNull();

    expect(
      router.navigate,
    ).toHaveBeenCalledWith(
      ['/login'],
    );

    httpMock.verify();
  });
});
