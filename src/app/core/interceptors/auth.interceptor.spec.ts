import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';

import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import {
  TestBed,
} from '@angular/core/testing';

import {
  Observable,
  of,
} from 'rxjs';

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  AuthService,
} from '../auth/auth.service';

import {
  authInterceptor,
} from './auth.interceptor';


describe('authInterceptor', () => {
  let http:
    HttpClient;

  let httpMock:
    HttpTestingController;


  const authService = {
    getAccessToken:
      vi.fn(),

    refreshAccessToken:
      vi.fn(),

    forceLogout:
      vi.fn(),
  };


  beforeEach(() => {
    vi.clearAllMocks();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withInterceptors([
            authInterceptor,
          ]),
        ),

        provideHttpClientTesting(),

        {
          provide: AuthService,
          useValue: authService,
        },
      ],
    });

    http =
      TestBed.inject(
        HttpClient,
      );

    httpMock =
      TestBed.inject(
        HttpTestingController,
      );
  });


  it('adds the bearer token and credentials to protected API requests', () => {
    authService
      .getAccessToken
      .mockReturnValue(
        'access-token',
      );


    http.get(
      '/api/documents/',
    ).subscribe();


    const request =
      httpMock.expectOne(
        '/api/documents/',
      );


    expect(
      request.request.headers.get(
        'Authorization',
      ),
    ).toBe(
      'Bearer access-token',
    );

    expect(
      request.request.withCredentials,
    ).toBe(true);


    request.flush({});

    httpMock.verify();
  });


  it('does not attach Authorization to login requests', () => {
    authService
      .getAccessToken
      .mockReturnValue(
        'access-token',
      );


    http.post(
      '/api/auth/login/',
      {},
    ).subscribe();


    const request =
      httpMock.expectOne(
        '/api/auth/login/',
      );


    expect(
      request.request.headers.has(
        'Authorization',
      ),
    ).toBe(false);

    expect(
      request.request.withCredentials,
    ).toBe(true);


    request.flush({});

    httpMock.verify();
  });


  it('refreshes once and retries a protected request after a 401', () => {
    authService
      .getAccessToken
      .mockReturnValue(
        'expired-access',
      );

    authService
      .refreshAccessToken
      .mockReturnValue(
        of(
          'new-access',
        ),
      );


    http.get(
      '/api/documents/',
    ).subscribe();


    const firstRequest =
      httpMock.expectOne(
        '/api/documents/',
      );


    expect(
      firstRequest.request.headers.get(
        'Authorization',
      ),
    ).toBe(
      'Bearer expired-access',
    );


    firstRequest.flush(
      {
        detail:
          'Token expired',
      },
      {
        status: 401,
        statusText:
          'Unauthorized',
      },
    );


    const retryRequest =
      httpMock.expectOne(
        '/api/documents/',
      );


    expect(
      authService.refreshAccessToken,
    ).toHaveBeenCalledTimes(1);

    expect(
      retryRequest.request.headers.get(
        'Authorization',
      ),
    ).toBe(
      'Bearer new-access',
    );

    expect(
      retryRequest.request.withCredentials,
    ).toBe(true);


    retryRequest.flush({});

    httpMock.verify();
  });


  it('shares one refresh across concurrent 401 responses', () => {
    authService
      .getAccessToken
      .mockReturnValue(
        'expired-access',
      );

    let resolveRefresh:
      ((token: string) => void)
      | undefined;

    authService
      .refreshAccessToken
      .mockReturnValue(
        new Observable<string>(
          (subscriber) => {
            resolveRefresh = (
              token: string,
            ) => {
              subscriber.next(token);
              subscriber.complete();
            };
          },
        ),
      );


    http.get(
      '/api/documents/one/',
    ).subscribe();

    http.get(
      '/api/documents/two/',
    ).subscribe();


    const first =
      httpMock.expectOne(
        '/api/documents/one/',
      );

    const second =
      httpMock.expectOne(
        '/api/documents/two/',
      );


    first.flush(
      {},
      {
        status: 401,
        statusText:
          'Unauthorized',
      },
    );

    second.flush(
      {},
      {
        status: 401,
        statusText:
          'Unauthorized',
      },
    );


    expect(
      authService.refreshAccessToken,
    ).toHaveBeenCalledTimes(1);


    resolveRefresh?.(
      'new-access',
    );


    const retryOne =
      httpMock.expectOne(
        '/api/documents/one/',
      );

    const retryTwo =
      httpMock.expectOne(
        '/api/documents/two/',
      );


    expect(
      retryOne.request.headers.get(
        'Authorization',
      ),
    ).toBe(
      'Bearer new-access',
    );

    expect(
      retryTwo.request.headers.get(
        'Authorization',
      ),
    ).toBe(
      'Bearer new-access',
    );


    retryOne.flush({});
    retryTwo.flush({});

    httpMock.verify();
  });


  it('does not attempt refresh when the refresh endpoint itself returns 401', () => {
    authService
      .getAccessToken
      .mockReturnValue(
        null,
      );


    http.post(
      '/api/auth/refresh/',
      {},
    ).subscribe({
      error: () => undefined,
    });


    const request =
      httpMock.expectOne(
        '/api/auth/refresh/',
      );


    request.flush(
      {
        detail:
          'Expired',
      },
      {
        status: 401,
        statusText:
          'Unauthorized',
      },
    );


    expect(
      authService.refreshAccessToken,
    ).not.toHaveBeenCalled();

    httpMock.verify();
  });

  it(
    'does not send DocuX credentials to external URLs or refresh their 401s',
    () => {
      authService
        .getAccessToken
        .mockReturnValue(
          'access-token',
        );

      authService
        .refreshAccessToken
        .mockClear();

      http
        .get(
          'https://example.com/private',
        )
        .subscribe({
          error: () => undefined,
        });

      const request =
        httpMock.expectOne(
          'https://example.com/private',
        );

      expect(
        request.request.headers.has(
          'Authorization',
        ),
      ).toBe(false);

      expect(
        request.request.withCredentials,
      ).toBe(false);

      request.flush(
        {
          detail: 'Unauthorized',
        },
        {
          status: 401,
          statusText: 'Unauthorized',
        },
      );

      expect(
        authService.refreshAccessToken,
      ).not.toHaveBeenCalled();

      httpMock.verify();
    },
  );

});
