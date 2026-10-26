export type Appearance = 'system' | 'light' | 'dark';
const key = 'docux_appearance';
export function appearance(): Appearance {
  try {
    const saved = localStorage.getItem(key);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}
export function setAppearance(value: string): void {
  if (!['system', 'light', 'dark'].includes(value)) return;
  try {
    localStorage.setItem(key, value);
  } catch {}
  window.dispatchEvent(new CustomEvent('docux:appearance', { detail: value }));
}
/** System appearance is the default; the account menu offers an explicit override. */
export function initializeTheme(): () => void {
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = appearance();
  const update = () => {
    const theme = preference === 'system' ? (query.matches ? 'dark' : 'light') : preference;
    document.documentElement.dataset['theme'] = theme;
    document.documentElement.style.colorScheme = theme;
  };
  const changed = (event: Event) => {
    const value = (event as CustomEvent).detail;
    if (['system', 'light', 'dark'].includes(value)) {
      preference = value;
      update();
    }
  };
  update();
  query.addEventListener('change', update);
  window.addEventListener('docux:appearance', changed);
  return () => {
    query.removeEventListener('change', update);
    window.removeEventListener('docux:appearance', changed);
  };
}
