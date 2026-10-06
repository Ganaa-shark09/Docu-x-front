import {
  TestBed,
} from '@angular/core/testing';

import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';

import {
  firstValueFrom,
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
  authGuard,
} from './auth.guard';

import {
  publicGuard,
} from './public.guard';


describe('authentication guards', () => {
  const loginTree =
    {} as UrlTree;

  const dashboardTree =
    {} as UrlTree;


  const authService = {
    ensureSession:
      vi.fn(),
  };


  const router = {
    createUrlTree:
      vi.fn(),
  };


  beforeEach(() => {
    vi.clearAllMocks();

    TestBed.configureTestingModule({
      providers: [
        {
          provide:
            AuthService,

          useValue:
            authService,
        },

        {
          provide:
            Router,

          useValue:
            router,
        },
      ],
    });
  });


  it('allows protected routes when the refresh-cookie session is valid', async () => {
    authService
      .ensureSession
      .mockReturnValue(
        of(true),
      );


    const result =
      await TestBed.runInInjectionContext(
        async () =>
          firstValueFrom(
            authGuard(
              {} as ActivatedRouteSnapshot,

              {
                url:
                  '/ai/internal',
              } as RouterStateSnapshot,
            ) as any,
          ),
      );


    expect(
      result,
    ).toBe(true);
  });


  it('redirects protected routes to login when session restoration fails', async () => {
    authService
      .ensureSession
      .mockReturnValue(
        of(false),
      );

    router
      .createUrlTree
      .mockReturnValue(
        loginTree,
      );


    const result =
      await TestBed.runInInjectionContext(
        async () =>
          firstValueFrom(
            authGuard(
              {} as ActivatedRouteSnapshot,

              {
                url:
                  '/ai/internal',
              } as RouterStateSnapshot,
            ) as any,
          ),
      );


    expect(
      router.createUrlTree,
    ).toHaveBeenCalledWith(
      ['/login'],
      {
        queryParams: {
          returnUrl:
            '/ai/internal',
        },
      },
    );

    expect(
      result,
    ).toBe(
      loginTree,
    );
  });


  it('allows the login page when no valid session exists', async () => {
    authService
      .ensureSession
      .mockReturnValue(
        of(false),
      );


    const result =
      await TestBed.runInInjectionContext(
        async () =>
          firstValueFrom(
            publicGuard(
              {} as ActivatedRouteSnapshot,

              {
                url:
                  '/login',
              } as RouterStateSnapshot,
            ) as any,
          ),
      );


    expect(
      result,
    ).toBe(true);
  });


  it('redirects an authenticated user away from the login page', async () => {
    authService
      .ensureSession
      .mockReturnValue(
        of(true),
      );

    router
      .createUrlTree
      .mockReturnValue(
        dashboardTree,
      );


    const result =
      await TestBed.runInInjectionContext(
        async () =>
          firstValueFrom(
            publicGuard(
              {} as ActivatedRouteSnapshot,

              {
                url:
                  '/login',
              } as RouterStateSnapshot,
            ) as any,
          ),
      );


    expect(
      router.createUrlTree,
    ).toHaveBeenCalledWith(
      ['/dashboard'],
    );

    expect(
      result,
    ).toBe(
      dashboardTree,
    );
  });
});
