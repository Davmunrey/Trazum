import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { LOCALES } from '@trazum/core';

import { detectLocale, en, es, getCliMessages } from '../dist/i18n/index.js';

describe('locale detection', () => {
  it('the flag wins over everything else', () => {
    const env = { TRAZUM_LOCALE: 'en', LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8' };
    assert.equal(detectLocale('es', env), 'es');
    assert.equal(detectLocale('es-ES', env), 'es');
  });

  it('TRAZUM_LOCALE wins over the POSIX variables', () => {
    assert.equal(detectLocale(undefined, { TRAZUM_LOCALE: 'es', LANG: 'en_US.UTF-8' }), 'es');
  });

  it('LC_ALL wins over LANG', () => {
    assert.equal(detectLocale(undefined, { LC_ALL: 'es_ES.UTF-8', LANG: 'en_US.UTF-8' }), 'es');
  });

  it('reads a POSIX LANG value', () => {
    assert.equal(detectLocale(undefined, { LANG: 'es_ES.UTF-8' }), 'es');
    assert.equal(detectLocale(undefined, { LANG: 'en_GB.UTF-8' }), 'en');
  });

  it('an unrecognised source does not stop the search', () => {
    // The point of matchLocale returning null: LANG=fr must not be mistaken
    // for an explicit choice that ends the lookup.
    assert.equal(detectLocale(undefined, { LANG: 'fr_FR.UTF-8', TRAZUM_LOCALE: 'es' }), 'es');
    assert.equal(detectLocale('fr', { TRAZUM_LOCALE: 'es' }), 'es');
  });

  it('falls back to English when nothing names a locale we ship', () => {
    assert.equal(detectLocale(undefined, {}), 'en');
    assert.equal(detectLocale(undefined, { LANG: 'C' }), 'en');
    assert.equal(detectLocale(undefined, { LANG: 'POSIX' }), 'en');
    assert.equal(detectLocale('nonsense', {}), 'en');
  });
});

describe('catalogue parity', () => {
  it('a catalogue exists for every locale the core ships', () => {
    for (const locale of LOCALES) {
      assert.equal(getCliMessages(locale).locale, locale);
    }
  });

  it('an unknown locale falls back rather than returning undefined', () => {
    assert.equal(getCliMessages('fr').locale, 'en');
  });

  it('all catalogues expose the same keys', () => {
    const sections = ['errors', 'report', 'models', 'rules', 'check'];
    for (const section of sections) {
      assert.deepEqual(
        Object.keys(es[section]).sort(),
        Object.keys(en[section]).sort(),
        `section "${section}" differs between catalogues`,
      );
    }
    assert.deepEqual(Object.keys(es.models.columns).sort(), Object.keys(en.models.columns).sort());
  });

  it('every catalogue renders a non-empty help screen', () => {
    const defaults = {
      model: 'claude-opus-5',
      callsPerMonth: 1000,
      avgOutputTokens: 500,
      cacheHitRate: 0.9,
      locales: LOCALES,
    };
    for (const locale of LOCALES) {
      const help = getCliMessages(locale).help(defaults, (s) => s);
      assert.ok(help.includes('trazum optimize'), `${locale}: help lost the usage block`);
      assert.ok(help.includes('--locale'), `${locale}: help does not document --locale`);
      assert.ok(help.includes(defaults.model), `${locale}: help does not show the default model`);
    }
  });

  it('every message renders a non-empty string in every locale', () => {
    // Catches a catalogue entry left as an empty string, which type-checks
    // fine and reads as a missing label at runtime.
    const samples = {
      errors: {
        optionNeedsValue: ['level'],
        mustBeNonNegative: ['calls', 'x'],
        badLevel: ['nope'],
        unknownRuleInDisable: ['nope'],
        unknownCommand: ['nope'],
        missingInputFile: [],
        llmNotConfigured: [],
        exactTokensNeedsKey: [],
        checkNeedsMaxTokens: [],
        errorLabel: [],
      },
      report: {
        inputTokens: [],
        estimated: [],
        exactCount: [],
        rulesApplied: [],
        nothingToTrim: [],
        levelAggressive: [],
        levelSafe: [],
        ruleHits: [2, 10],
        llmPass: [],
        llmApplied: ['p', 'm', 10, 5],
        llmRejected: ['reason'],
        costWith: ['Claude Opus 5'],
        usageLine: ['1,000', 500, true],
        perMonthSaving: ['$1.00', '2.0'],
        beyondShortening: [],
        perMonthSuffix: ['$1.00'],
        diff: [],
        wroteTo: ['out.txt'],
      },
      check: {
        okLabel: [],
        failedLabel: [],
        ok: ['10', '20'],
        failed: ['30', '20'],
        wouldFit: ['safe', '15'],
        stillTooBig: ['25'],
      },
    };

    for (const locale of LOCALES) {
      const t = getCliMessages(locale);
      for (const [section, entries] of Object.entries(samples)) {
        for (const [key, args] of Object.entries(entries)) {
          const value = t[section][key](...args);
          assert.ok(
            typeof value === 'string' && value.trim().length > 0,
            `${locale}/${section}.${key} rendered empty`,
          );
        }
      }
    }
  });
});
