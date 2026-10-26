import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeTheme } from './theme.service';

describe('System theme', () => {
  let changed: (() => void) | undefined;
  const query = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  beforeEach(() => {
    changed = undefined;
    query.matches = false;
    query.addEventListener.mockImplementation((_, listener) => {
      changed = listener;
    });
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => query),
    );
  });
  afterEach(() => {
    localStorage.removeItem('docux_theme_preference');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.removeProperty('color-scheme');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });
  it.each([false, true])('initializes from system dark preference %s', (dark) => {
    query.matches = dark;
    initializeTheme();
    expect(document.documentElement.dataset['theme']).toBe(dark ? 'dark' : 'light');
    expect(document.documentElement.style.colorScheme).toBe(dark ? 'dark' : 'light');
  });
  it.each(['light', 'dark'])('ignores a previous saved %s override', (saved) => {
    localStorage.setItem('docux_theme_preference', saved);
    query.matches = saved === 'light';
    initializeTheme();
    expect(document.documentElement.dataset['theme']).toBe(query.matches ? 'dark' : 'light');
  });
  it('follows system appearance changes in both directions and disposes the listener', () => {
    const dispose = initializeTheme();
    query.matches = true;
    changed?.();
    expect(document.documentElement.dataset['theme']).toBe('dark');
    query.matches = false;
    changed?.();
    expect(document.documentElement.dataset['theme']).toBe('light');
    dispose();
    expect(query.removeEventListener).toHaveBeenCalledWith('change', changed);
  });
  it('does not depend on browser storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw Error('Unavailable');
    });
    expect(() => initializeTheme()).not.toThrow();
  });
});
