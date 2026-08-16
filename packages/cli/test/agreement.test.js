import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { en } from '../dist/i18n/en.js';
import { es } from '../dist/i18n/es.js';

/**
 * A count and its noun have to agree, in every language this ships in.
 *
 * `1 calls` was reachable on a one-call log and `1 llamadas` on the same log in
 * Spanish. Two messages in the English catalogue already did the agreement by hand
 * while a dozen did not, so the fault was not that anybody forgot — it was that
 * getting it right was a choice made per message.
 *
 * These are the counts a reader can actually see at one: a log with a single call,
 * a label covering one, a slice of one. Scenario rates like "50,000 calls a month"
 * are deliberately not here — a scenario of one call is not a thing anybody
 * configures, and forcing agreement on it would be grammar for its own sake.
 */

const CATALOGUES = [
  ['en', en, /\b1 (calls|prompts|files|lines|examples|models|cases|revisions|entries)\b/],
  ['es', es, /\b1 (llamadas|prompts|ficheros|líneas|ejemplos|modelos|casos|revisiones|entradas)\b/],
];

describe('a count of one reads as one', () => {
  for (const [name, t, plural] of CATALOGUES) {
    describe(name, () => {
      it('in the totals line of a one-call log', () => {
        const line = t.profile.spent(t.profile.calls(1), '$0.05');
        assert.doesNotMatch(line, plural, line);
        assert.match(line, /\b1 (call|llamada)\b/);
      });

      it('in a breakdown row covering one call', () => {
        const row = t.profile.row('rag', '$0.05', '100%', t.profile.calls(1));
        assert.doesNotMatch(row, plural, row);
      });

      it('in a lever over one call', () => {
        const line = t.profile.leverCalls(t.profile.calls(1), '$0.05');
        assert.doesNotMatch(line, plural, line);
      });

      it('and still agrees in the plural', () => {
        // The other half: a fix that hard-coded the singular would pass every
        // assertion above and be wrong on every real log.
        // Spanish does not group a four-digit number, so the separator is
        // optional here — the noun is what is under test.
        const many = t.profile.calls(2400);
        assert.match(many, /^2[,.]?400 (calls|llamadas)$/, many);
      });
    });
  }
});
