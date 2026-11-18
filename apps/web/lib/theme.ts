export const THEME_STORAGE_KEY = 'trazum:theme';
export const THEMES = ['light', 'dark', 'system'] as const;
export type Theme = (typeof THEMES)[number];

/**
 * The choice stored, or the surface's default when there is none: System in
 * the application, Light on the public site (`<html data-surface="site">`),
 * which is paper first by the owner's decision of 2026-11-18.
 */
export function storedTheme(fallback: Theme = 'system'): Theme {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return THEMES.includes(value as Theme) ? value as Theme : fallback;
  } catch {
    return fallback;
  }
}

/** What a page of this surface shows before a visitor chooses. */
export function surfaceDefault(): Theme {
  return typeof document !== 'undefined' && document.documentElement.dataset.surface === 'site' ? 'light' : 'system';
}

export function applyTheme(theme: Theme): void {
  const resolved = theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

export function saveTheme(theme: Theme): void {
  applyTheme(theme);
  try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* Current choice still works. */ }
}

/**
 * Runs before paint under the request nonce.
 *
 * Two decisions, both before the first frame so neither moves anything:
 *
 * - The theme. An explicit choice wins everywhere. With none, the
 *   application follows the system and the public site (`data-surface` is
 *   `site`) is light. When storage throws, the application keeps the CSS
 *   system default and the site stays light.
 * - Whether the landing tells its story by scroll: `data-motion="scroll"`
 *   unless the reader asked for reduced motion. Without this script (no
 *   JavaScript) the attribute is absent and the landing is a still page.
 */
export const THEME_BOOTSTRAP = `(function(){var r=document.documentElement,s=r.dataset.surface==='site';try{if(!matchMedia('(prefers-reduced-motion: reduce)').matches)r.dataset.motion='scroll'}catch(e){}try{var t=localStorage.getItem('trazum:theme');var d=t==='dark'||(t!=='light'&&!(s&&t!=='system')&&matchMedia('(prefers-color-scheme: dark)').matches);r.dataset.theme=d?'dark':'light';r.style.colorScheme=d?'dark':'light'}catch(e){if(s){r.dataset.theme='light';r.style.colorScheme='light'}}})()`;
