import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  authGuard,
} from './core/guards/auth.guard';

import {
  routes,
} from './app.routes';


describe('application route security', () => {
  it('protects the full-screen AI workspace with authGuard', () => {
    const aiRoute =
      routes.find(
        (route) =>
          route.path === 'ai',
      );


    expect(
      aiRoute,
    ).toBeDefined();

    expect(
      aiRoute?.canActivate,
    ).toContain(
      authGuard,
    );
  });


  it('protects the main application shell with authGuard', () => {
    const mainRoute =
      routes.find(
        (route) =>
          route.path === '',
      );


    expect(
      mainRoute?.canActivate,
    ).toContain(
      authGuard,
    );
  });
});
