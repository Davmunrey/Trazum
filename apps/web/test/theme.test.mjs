import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { describe, it } from 'node:test';
import { runInNewContext } from 'node:vm';
import { applyTheme, saveTheme, storedTheme, surfaceDefault, THEME_BOOTSTRAP } from '../lib/theme.ts';

register('./helpers/loader.mjs', import.meta.url);

function environment({ stored = null, dark = false, blocked = false } = {}) {
  const root = { dataset: {}, style: {} };
  let saved = stored;
  const storage = {
    getItem: () => { if (blocked) throw new Error('blocked'); return saved; },
    setItem: (_key, value) => { if (blocked) throw new Error('blocked'); saved = value; },
  };
  const media = () => ({ matches: dark });
  return { root, storage, media, saved: () => saved };
}

describe('theme choice', () => {
  it('restores an explicit choice before paint, independently of the OS', () => {
    for (const [stored, dark, expected] of [['light', true, 'light'], ['dark', false, 'dark'], ['system', true, 'dark'], ['invalid', false, 'light']]) {
      const env = environment({ stored, dark });
      runInNewContext(THEME_BOOTSTRAP, { localStorage: env.storage, matchMedia: env.media, document: { documentElement: env.root } });
      assert.equal(env.root.dataset.theme, expected);
      assert.equal(env.root.style.colorScheme, expected);
    }
  });
  it('does not break the initial document when storage is blocked', () => {
    const env = environment({ blocked: true });
    assert.doesNotThrow(() => runInNewContext(THEME_BOOTSTRAP, { localStorage: env.storage, document: { documentElement: env.root } }));
    assert.equal(env.root.dataset.theme, undefined);
  });
  it('persists selection and resolves system preferences', () => {
    const env = environment({ dark: true });
    const previous = { localStorage: globalThis.localStorage, window: globalThis.window, document: globalThis.document };
    try {
      globalThis.localStorage = env.storage;
      globalThis.window = { matchMedia: env.media };
      globalThis.document = { documentElement: env.root };
      assert.equal(storedTheme(), 'system');
      saveTheme('light');
      assert.equal(env.saved(), 'light');
      assert.equal(storedTheme(), 'light');
      assert.equal(env.root.dataset.theme, 'light');
      applyTheme('system');
      assert.equal(env.root.dataset.theme, 'dark');
    } finally {
      Object.assign(globalThis, previous);
    }
  });
  it('still applies a user choice if persistence is unavailable', () => {
    const env = environment({ blocked: true });
    const previous = { localStorage: globalThis.localStorage, window: globalThis.window, document: globalThis.document };
    try {
      globalThis.localStorage = env.storage;
      globalThis.window = { matchMedia: env.media };
      globalThis.document = { documentElement: env.root };
      assert.equal(storedTheme(), 'system');
      saveTheme('dark');
      assert.equal(env.root.dataset.theme, 'dark');
    } finally { Object.assign(globalThis, previous); }
  });
});

/**
 * The public site is paper first (#744, the owner's decision of 2026-11-18):
 * with nothing chosen, a visitor whose system is dark still gets the light
 * landing, and only an explicit Dark (or System) in the header changes that.
 * The application keeps System as its default. `<html data-surface>` says
 * which surface a page is; the middleware decides it from the address.
 */
describe('the public site is light until a visitor chooses', () => {
  function run({ surface, stored = null, dark = false, reduce = false, blocked = false }) {
    const root = { dataset: surface === undefined ? {} : { surface }, style: {} };
    const storage = { getItem: () => { if (blocked) throw new Error('blocked'); return stored; } };
    const matchMedia = (query) => ({ matches: query.includes('reduced-motion') ? reduce : dark });
    runInNewContext(THEME_BOOTSTRAP, { localStorage: storage, matchMedia, document: { documentElement: root } });
    return root;
  }

  it('site: light on a dark system with nothing stored, dark when Dark was chosen, the system when System was', () => {
    for (const [stored, dark, expected] of [[null, true, 'light'], [null, false, 'light'], ['invalid', true, 'light'], ['dark', false, 'dark'], ['dark', true, 'dark'], ['light', true, 'light'], ['system', true, 'dark'], ['system', false, 'light']]) {
      const root = run({ surface: 'site', stored, dark });
      assert.equal(root.dataset.theme, expected, `site, stored ${stored}, dark system ${dark}`);
      assert.equal(root.style.colorScheme, expected);
    }
  });

  it('site: light when storage is blocked; the application keeps the system default', () => {
    assert.equal(run({ surface: 'site', blocked: true, dark: true }).dataset.theme, 'light');
    assert.equal(run({ surface: 'app', blocked: true, dark: true }).dataset.theme, undefined);
  });

  it('the application is unchanged: the system decides until a choice is stored', () => {
    for (const [stored, dark, expected] of [[null, true, 'dark'], [null, false, 'light'], ['light', true, 'light'], ['dark', false, 'dark']]) {
      assert.equal(run({ surface: 'app', stored, dark }).dataset.theme, expected, `app, stored ${stored}, dark system ${dark}`);
    }
  });

  it('the story mode is set before paint, and never for a reader who asked for less motion', () => {
    assert.equal(run({ surface: 'site' }).dataset.motion, 'scroll');
    assert.equal(run({ surface: 'site', reduce: true }).dataset.motion, undefined);
  });

  it('the header shows Light as the site’s default and System as the application’s', () => {
    const previous = { localStorage: globalThis.localStorage, document: globalThis.document };
    try {
      globalThis.localStorage = { getItem: () => null };
      globalThis.document = { documentElement: { dataset: { surface: 'site' } } };
      assert.equal(storedTheme(surfaceDefault()), 'light');
      globalThis.document = { documentElement: { dataset: { surface: 'app' } } };
      assert.equal(storedTheme(surfaceDefault()), 'system');
    } finally {
      Object.assign(globalThis, previous);
    }
    // And the site's header asks for that default; the application's rail keeps System.
    const header = readFileSync(new URL('../components/site/SiteHeader.tsx', import.meta.url), 'utf8');
    assert.match(header, /setTheme\(storedTheme\(surfaceDefault\(\)\)\);/);
    assert.match(readFileSync(new URL('../components/App.tsx', import.meta.url), 'utf8'), /setTheme\(storedTheme\(\)\);/);
  });

  it('without JavaScript the stylesheet keeps the site light on a dark system', () => {
    const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
    assert.match(css, /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme='light'\]\):not\(\[data-surface='site'\]\) \{/);
    const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');
    assert.match(layout, /data-surface=\{surface\}/);
    assert.match(layout, /requestHeaders\.get\('x-trazum-surface'\) === 'site' \? 'site' : 'app'/);
  });

  it('which addresses are the site, and the middleware says so over anything the request carried', async () => {
    const { surfaceOf } = await import('../lib/site.ts');
    for (const path of ['/', '/landing', '/docs', '/anything-unknown', '/applesauce', '/compare']) assert.equal(surfaceOf(path), 'site', path);
    for (const path of ['/app', '/app/x', '/admin', '/c/abc', '/api/optimize', '/badge/x.svg']) assert.equal(surfaceOf(path), 'app', path);
    // The request half of `NextResponse.next` is not observable outside Next
    // (`helpers/next-server.mjs` says why), so the line is read: set, not
    // appended, from the address, on the headers the page is rendered with.
    const source = readFileSync(new URL('../middleware.ts', import.meta.url), 'utf8');
    assert.match(source, /\n  headers\.set\('x-trazum-surface', surfaceOf\(request\.nextUrl\.pathname\)\);/);
    assert.ok(source.indexOf("headers.set('x-trazum-surface'") < source.indexOf('NextResponse.next({ request: { headers } })'));
  });
});
