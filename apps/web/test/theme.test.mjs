import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runInNewContext } from 'node:vm';
import { applyTheme, saveTheme, storedTheme, THEME_BOOTSTRAP } from '../lib/theme.ts';

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
