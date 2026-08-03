// DOCUX_SYSTEM_THEME_START
const applyDocuXSystemTheme = (): void => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const theme = mediaQuery.matches ? 'dark' : 'light';

  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme;
};

if (typeof window !== 'undefined') {
  applyDocuXSystemTheme();

  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', applyDocuXSystemTheme);
}
// DOCUX_SYSTEM_THEME_END

import { bootstrapApplication } from '@angular/platform-browser';

import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

bootstrapApplication(AppComponent, appConfig).catch((error) => {
  console.error(error);
});
