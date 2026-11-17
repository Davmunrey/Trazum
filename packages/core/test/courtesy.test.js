import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { optimize, segment } from '../dist/index.js';

/**
 * Courtesy, at the level that promises not to change what a prompt asks for.
 *
 * The `politeness` rule deleted each courtesy phrase wherever it stood, and
 * every case below was measured doing damage on 2026-11-17, with the safe
 * level and nothing else. It was found by drawing the README's picture from a
 * real run: the shortened support prompt came out containing "So much for your
 * help with this." and "In advance.", and looking for more turned up three
 * kinds of fault, in rising order:
 *
 *   a fragment where a sentence was     "Thanks a lot for doing this." -> "A lot for doing this."
 *   a broken instruction                "Tell the customer: thank you for your order." -> "...: for your order."
 *   a changed instruction               "Speak kindly to the customer." -> "Speak to the customer."
 *
 * and the same inside quotation marks, where the words are the point:
 * `Reply "Please hold on"` became `Reply " hold on"`.
 *
 * Each table is one of those, input beside what the level must return. Left
 * alone means returned exactly, to the character.
 */
const safe = (text) => optimize(text, { level: 'safe' }).optimized;

describe('a sentence that only thanks is removed whole', () => {
  const GONE = [
    'Thank you so much for your help with this.',
    'Thank you very much in advance.',
    'Thanks a lot for doing this.',
    'Thank you for your patience while we look into it.',
    'Thanks for the quick reply!',
    'Many thanks for your help.',
    'Much appreciated.',
    'Muchas gracias por tu ayuda con esto.',
    'Gracias por adelantado.',
    '¡Muchas gracias!',
    'Merci beaucoup pour votre aide.',
    "Merci d'avance.",
    'Vielen Dank für Ihre Hilfe.',
    'Danke im Voraus.',
    'Muito obrigado pela ajuda.',
    'Grazie mille per il tuo aiuto.',
    'Hartelijk dank voor je hulp.',
  ];

  for (const thanks of GONE) {
    it(`after an instruction: ${thanks}`, () => {
      assert.equal(safe(`Answer in one sentence. ${thanks}`), 'Answer in one sentence.');
    });
  }

  it('and on a line of its own, at the end', () => {
    assert.equal(safe('Answer in one sentence.\n\nThank you so much for your help with this.'), 'Answer in one sentence.');
  });

  it('and at the start, before the instruction', () => {
    assert.equal(safe('Thanks for doing this. Answer in one sentence.'), 'Answer in one sentence.');
  });

  it('counts each one as a hit of the rule that owns it', () => {
    const result = optimize('Answer in one sentence. Thank you so much for your help with this.', { level: 'safe' });
    const rule = result.rules.find((entry) => entry.id === 'politeness');
    assert.ok(rule, 'the removal is not attributed to politeness');
    assert.equal(rule.hits, 1);
    assert.ok(rule.tokensSaved > 5, 'the whole sentence went, so more than the phrase was saved');
  });
});

describe('a thanks that is part of what the prompt says is left alone', () => {
  const KEPT = [
    // The thing to tell somebody.
    'Tell the customer: thank you for your order.',
    // The word the condition tests for.
    'If the user says thanks, reply politely.',
    // Not a thanks at all: a cause.
    'Thanks to the new policy refunds take five days.',
    'Gracias a la nueva norma los reembolsos tardan cinco días.',
    'Grazie alla nuova politica i rimborsi sono rapidi.',
    // About the phrase.
    'Thank you for your order is the subject line of the email.',
    'Thank you messages should be short.',
    // The object of another verb.
    'Your help is much appreciated.',
    // Followed by something that is not the end of a thanks.
    'Thanks, John will pick this up from here.',
    'Thank you for contacting Acme support, how can I help?',
    // What follows the comma is content, and has no verb that gives it away.
    'Thank you for your order, your parcel ships tomorrow.',
    // Hung on the end of a clause by a comma. Almost always a courtesy, and
    // not told apart from the last item of a list of things to say, which is
    // the line below it. Four tokens kept, against an instruction changed.
    'Summarise the text for me, thank you very much.',
    'Use phrases like sorry, excuse me, thank you.',
    // Opens a request rather than closing one.
    'Te agradecería que respondas en inglés.',
    // After an abbreviation, not after a sentence.
    'Close warmly, e.g. thanks for your time.',
    // An item in a list.
    'Send these lines in order:\n1. Thank you for your order.\n2. It ships tomorrow.',
    '- Thank you for your order.',
    // What the line above introduced.
    'Reply with exactly this text:\nThank you for your order.',
    'Reply with exactly this text:\n\nThank you for your order.',
    // A turn in a transcript.
    'Assistant: Thank you for your patience.',
  ];

  for (const text of KEPT) {
    it(JSON.stringify(text), () => assert.equal(safe(text), text));
  }
});

describe('three courtesy words that are also ordinary words', () => {
  const KEPT = [
    'Aim to please the customer.',
    'Speak kindly to the customer.',
    'Treat every caller kindly.',
    'Die Bitte des Kunden steht im Betreff.',
    'Eine Bitte um Rückruf ist kein Notfall.',
  ];
  for (const text of KEPT) {
    it(`leaves the ordinary word: ${text}`, () => assert.equal(safe(text), text));
  }

  const SHORTENED = [
    ['Please summarise the text.', 'Summarise the text.'],
    ['Could you please summarise the text?', 'Could you summarise the text?'],
    ['Kindly note that refunds take five days.', 'Note that refunds take five days.'],
    ['Please kindly check the order number.', 'Check the order number.'],
    ['Read the order, and kindly confirm the address.', 'Read the order, and confirm the address.'],
    ['Bitte fasse den Text zusammen.', 'Fasse den Text zusammen.'],
    ['Fasse den Text bitte zusammen.', 'Fasse den Text zusammen.'],
    ['Por favor, resume el texto.', 'Resume el texto.'],
  ];
  for (const [input, expected] of SHORTENED) {
    it(`still removes the courtesy: ${input}`, () => assert.equal(safe(input), expected));
  }
});

describe('text inside quotation marks is not prose to shorten', () => {
  const KEPT = [
    'Reply "Please hold on" when the line is busy.',
    'If the customer writes "basically nothing works", escalate.',
    'Start every reply with "Thank you for contacting us".',
    'End with “Thanks for your patience”.',
    'Reply “please hold” when the line is busy.',
    'Say «por favor espere» while loading.',
    'Antworte mit „Bitte warten“ und sonst nichts.',
    "Reply 'please wait' when busy.",
    'Each element is {"before": "...", "after": "..."}.',
    'Greet with "Hello {{name}}, please hold" and wait.',
  ];
  for (const text of KEPT) {
    it(JSON.stringify(text), () => {
      assert.equal(safe(text), text);
      assert.equal(optimize(text, { level: 'aggressive' }).optimized, text, 'the aggressive level edited it');
    });
  }

  it('still shortens the prose around a quotation', () => {
    assert.equal(
      safe('Please reply "Please hold on" in order to buy time.'),
      'Reply "Please hold on" to buy time.',
    );
  });

  it('does not read an apostrophe as the start of a quotation', () => {
    // Filler between two apostrophes: protected if they are taken for a pair.
    assert.equal(
      safe("Don't make the user basically wait for the customers' data."),
      "Don't make the user wait for the customers' data.",
    );
  });

  it('does not let a quotation cross a protected block that spans lines', () => {
    // The fence holds a line end, so the two marks are not on one line and
    // what stands between them is still prose.
    assert.equal(
      safe('Say "x please ```a\nb``` y" now.'),
      'Say "x ```a\nb``` y" now.',
    );
  });

  it('leaves a thanks alone when what it is for is a protected span', () => {
    /*
      And still does the rest of its work. Deleting a sentence that holds a
      placeholder trips the pipeline's own safety net, which discards
      everything the rule did in that pass, so the "Please" would stay too.
    */
    assert.equal(
      safe('Please summarise it. Thank you for sending {{document}}.'),
      'Summarise it. Thank you for sending {{document}}.',
    );
  });

  it('does not pair a quotation mark with one on another line', () => {
    assert.equal(safe('The screen is 27" wide.\nPlease measure it.\nThe stand is 9" deep.'), 'The screen is 27" wide.\nMeasure it.\nThe stand is 9" deep.');
  });

  it('reports the span as protected, with what is inside it', () => {
    const kinds = segment('Greet with "Hello {{name}}, please hold" and wait.').filter((part) => part.kind === 'protected');
    assert.deepEqual(kinds.map((part) => [part.protection, part.text]), [['quoted', '"Hello {{name}}, please hold"']]);
  });

  it('leaves a quotation mark inside code or a tag to the protection that owns it', () => {
    const parts = segment('Use `say("please")` inside <ctx note="please wait"> here.').filter((part) => part.kind === 'protected');
    assert.deepEqual(parts.map((part) => part.protection), ['inline-code', 'xml-tag']);
  });
});

describe('none of it costs time on hostile input', () => {
  const within = (label, text, ms = 1500) => {
    const started = performance.now();
    optimize(text, { level: 'aggressive' });
    const took = performance.now() - started;
    assert.ok(took < ms, `${label}: ${took.toFixed(0)}ms on ${text.length} characters`);
  };

  it('a long run of spaces in front of each positional word', () => {
    /*
      The first version of the positional checks ran a lookbehind at every
      position, each walking back over the spaces before it: 47 seconds on
      200,000 characters. They sit behind the word now and run only there.
    */
    for (const word of ['kindly', 'please', 'bitte', 'thanks', 'Thank you']) {
      within(word, `Label: ${' '.repeat(200_000)}${word} x`);
      within(`${word}, repeated`, `${`${word}${' '.repeat(400)}`.repeat(500)}`);
    }
  });

  it('unclosed quotation marks, many to a line', () => {
    within('double', `${'"a '.repeat(60_000)}`);
    within('single', `${" 'a".repeat(60_000)}`);
    within('guillemet', `${'«a '.repeat(60_000)}`);
  });

  it('a thanks with a long tail that never ends', () => {
    within('for', `Thank you for ${'a '.repeat(100_000)}`);
    within('degree', `Thank you ${'so much '.repeat(40_000)}x`);
  });
});

describe('and the result settles', () => {
  it('a second pass changes nothing', () => {
    for (const text of [
      'Please kindly note that\nThank you so much. Answer "please" and thanks for reading.\n\nThanks!',
      '"\nPlease kindly note that \nRun this:\n\n    const label = "please keep";\n    // "',
      'Gracias. Por favor, resume «por favor» y gracias por todo.',
    ]) {
      const once = safe(text);
      assert.equal(safe(once), once, `not settled: ${JSON.stringify(text)}`);
    }
  });
});

/**
 * The list a maintainer edits, held to the split the rule depends on.
 *
 * `POLITENESS` is where a contributor adds a language's courtesy phrases, and
 * `THANKS` says which of them thank. An entry that thanks and is missing from
 * `THANKS` goes back to being deleted wherever it stands, which is the whole
 * fault above, for that language only and with nothing failing. Read from the
 * source, because the lists are not part of the package's surface.
 */
describe('every phrase that thanks is listed as one', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/phrases.ts', import.meta.url), 'utf8');
  const list = (name) => {
    const start = source.indexOf(`export const ${name}: readonly string[] = [`);
    assert.notEqual(start, -1, `${name} is no longer declared the way this test reads it`);
    const body = source.slice(start, source.indexOf('\n];', start));
    return [...body.matchAll(/^\s+(?:'((?:[^'\\]|\\.)*)'|"([^"]*)"),/gm)].map((match) =>
      (match[1] ?? match[2]).replace(/\\'/g, "'"),
    );
  };
  const politeness = list('POLITENESS');
  const thanks = list('THANKS');
  /** The stems a thanks is built on, in the seven languages the list covers. */
  const THANKING = /thank|appreciat|gracias|agrade[zcç]|merci|remerci|dank|obrigad|grazie|ringrazi/i;

  it('reads both lists', () => {
    assert.ok(politeness.length >= 40, `only ${politeness.length} courtesy phrases parsed`);
    assert.ok(thanks.length >= 25, `only ${thanks.length} thanks parsed`);
  });

  it('lists no thanks that the courtesy list does not carry', () => {
    assert.deepEqual(thanks.filter((phrase) => !politeness.includes(phrase)), []);
  });

  it('leaves no thanks in the courtesy list unclassified', () => {
    const unclassified = politeness.filter((phrase) => THANKING.test(phrase) && !thanks.includes(phrase));
    assert.deepEqual(
      unclassified,
      [],
      `these thank, and would be deleted out of the middle of a sentence: ${unclassified.join(', ')}`,
    );
  });

  it('and classifies no softener as a thanks', () => {
    assert.deepEqual(thanks.filter((phrase) => !THANKING.test(phrase)), []);
  });
});
