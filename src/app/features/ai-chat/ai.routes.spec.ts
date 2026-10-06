import {
  UrlSegment,
  UrlSegmentGroup,
} from '@angular/router';

import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  AI_ROUTES,
} from './ai.routes';


function matchExternal(
  paths: string[],
) {
  const segments =
    paths.map(
      (path) =>
        new UrlSegment(
          path,
          {},
        ),
    );

  const group =
    new UrlSegmentGroup(
      segments,
      {},
    );

  for (
    const route
    of AI_ROUTES
  ) {
    if (!route.matcher) {
      continue;
    }

    const result =
      route.matcher(
        segments,
        group,
        route,
      );

    if (result) {
      return {
        route,
        result,
      };
    }
  }

  return null;
}


describe(
  'External AI route stability',
  () => {
    it('uses the same matcher route for new and existing external conversations', () => {
      const newChat =
        matchExternal([
          'external',
        ]);

      const conversation =
        matchExternal([
          'external',
          'conversation-123',
        ]);


      expect(
        newChat,
      ).not.toBeNull();

      expect(
        conversation,
      ).not.toBeNull();


      expect(
        newChat?.route,
      ).toBe(
        conversation?.route,
      );


      expect(
        newChat?.result
          .consumed.length,
      ).toBe(
        1,
      );


      expect(
        conversation?.result
          .consumed.length,
      ).toBe(
        2,
      );


      expect(
        conversation?.result
          .posParams?.[
            'conversationUuid'
          ]?.path,
      ).toBe(
        'conversation-123',
      );
    });


    it('does not keep separate external path routes that recreate the component', () => {
      const legacyRoutes =
        AI_ROUTES.filter(
          (route) =>
            route.path ===
              'external'
            ||
            route.path ===
              'external/:conversationUuid',
        );


      expect(
        legacyRoutes,
      ).toEqual([]);
    });
  },
);
