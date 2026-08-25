import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

register('./helpers/loader.mjs', import.meta.url);

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');

const { createPlaygroundFiles, runPlayground, tokenize, PLAYGROUND_COMMANDS, SAMPLE_INVOCATIONS } =
  await import('../lib/playground.ts');
const { en } = await import('../lib/i18n/en.ts');
const { es } = await import('../lib/i18n/es.ts');

/**
 * The 1.72 playground: the CLI's pure subset, run in the page. What these
 * hold: the dispatcher runs every advertised command against the samples in
 * both locales without throwing, the 1.71 pipe works end to end inside it,
 * nothing private crosses a conversion, the no-fetch invariant covers the new
 * files, and the honest gap — the commands that need a terminal — is said out
 * loud rather than hidden.
 */
describe('the playground runs the pure subset in the page', () => {
  const codeOf = (rel) =>
    readFileSync(join(web, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

  it('still never fetches, with the terminal inside the same app', () => {
    for (const rel of ['components/Playground.tsx', 'lib/playground.ts']) {
      const source = codeOf(rel);
      assert.equal(/\bfetch\s*\(/.test(source), false, `${rel} contains a fetch call`);
      assert.equal(/XMLHttpRequest|sendBeacon|WebSocket|FormData/.test(source), false, rel);
    }
  });

  it('tokenizes the way a shell would, quotes included', () => {
    assert.deepEqual(tokenize('trazum profile usage.jsonl'), ['trazum', 'profile', 'usage.jsonl']);
    assert.deepEqual(tokenize('cat "a file.txt"'), ['cat', 'a file.txt']);
    assert.deepEqual(tokenize("cat 'one two'"), ['cat', 'one two']);
    assert.deepEqual(tokenize('echo "a \\"quoted\\" word"'), ['echo', 'a "quoted" word']);
    assert.deepEqual(tokenize('  spaced   out  '), ['spaced', 'out']);
    assert.deepEqual(tokenize(''), []);
  });

  for (const [name, t] of [
    ['en', en],
    ['es', es],
  ]) {
    it(`every advertised command runs against the samples and says something (${name})`, () => {
      const locale = name;
      for (const command of PLAYGROUND_COMMANDS) {
        const files = createPlaygroundFiles();
        const result = runPlayground(SAMPLE_INVOCATIONS[command], files, t, locale);
        assert.ok(
          result.lines.length > 0,
          `"${SAMPLE_INVOCATIONS[command]}" printed nothing in ${name}`,
        );
      }
    });
  }

  it('the 1.71 pipe runs end to end inside the tab', () => {
    // from-otel writes a usage log beside the samples; profile prices it. The
    // whole reason the virtual files exist.
    const files = createPlaygroundFiles();
    const converted = runPlayground(
      'trazum from-otel spans.otlp.json -o converted.jsonl',
      files,
      en,
      'en',
    );
    assert.match(converted.lines.join('\n'), /2 LLM span/);
    assert.ok(files.has('converted.jsonl'), 'the -o write never landed');
    const profiled = runPlayground('trazum profile converted.jsonl', files, en, 'en');
    assert.match(profiled.lines.join('\n'), /2 calls priced/);
    // And the new file shows up where a visitor would look for it.
    const listed = runPlayground('ls', files, en, 'en');
    assert.match(listed.lines.join('\n'), /converted\.jsonl/);
  });

  it('nothing private crosses a conversion — grepped, not trusted', () => {
    // The OTLP sample plants a prompt attribute. `cat` legitimately shows the
    // file's own text; the *conversions* and everything priced from them must
    // not carry it.
    const planted = 'sample-prompt-content-never-crosses-9a1c';
    const files = createPlaygroundFiles();
    assert.ok(files.get('spans.otlp.json').includes(planted), 'the fixture lost its planted prompt');
    const outputs = [
      runPlayground('trazum from-otel spans.otlp.json', files, en, 'en'),
      runPlayground('trazum from-otel spans.otlp.json -o c.jsonl', files, en, 'en'),
      runPlayground('trazum profile c.jsonl', files, en, 'en'),
      runPlayground('trazum from-claude-code transcript.jsonl -o s.jsonl', files, en, 'en'),
      runPlayground('trazum profile s.jsonl', files, en, 'en'),
    ];
    for (const output of outputs) {
      assert.equal(output.lines.join('\n').includes(planted), false, 'the prompt crossed');
    }
    assert.equal(
      (files.get('c.jsonl') ?? '').includes(planted),
      false,
      'the prompt crossed into the converted log',
    );
    assert.equal(
      (files.get('s.jsonl') ?? '').includes('the words of the session'),
      false,
      'transcript words crossed into the converted log',
    );
  });

  it('names the commands that need a terminal instead of hiding them', () => {
    // The honest gap. The playground is a subset of the forty, and `help` says
    // where the rest live; a CLI-only command typed here gets the same answer.
    const files = createPlaygroundFiles();
    const help = runPlayground('help', files, en, 'en').lines.join('\n');
    assert.match(help, /@trazum\/cli/);
    const gateway = runPlayground('trazum gateway', files, en, 'en').lines.join('\n');
    assert.match(gateway, /CLI-only/);
    // And a command that exists nowhere is told apart from one that exists
    // in the CLI.
    const unknown = runPlayground('frobnicate', files, en, 'en').lines.join('\n');
    assert.match(unknown, /Unknown command/);
  });

  it('the terminal furniture works: ls, cat, clear, missing files', () => {
    const files = createPlaygroundFiles();
    assert.ok(runPlayground('ls', files, en, 'en').lines.length >= 5);
    assert.ok(runPlayground('cat prompt.txt', files, en, 'en').lines.length > 3);
    assert.equal(runPlayground('clear', files, en, 'en').clear, true);
    assert.match(runPlayground('cat nope.txt', files, en, 'en').lines[0], /No such file/);
    assert.match(runPlayground('trazum profile nope.jsonl', files, en, 'en').lines[0], /No such file/);
  });

  it('position measures the sample month against the sample ceiling', () => {
    // PLAYGROUND_NOW pins the clock inside the sample month, so the demo does
    // not decay with the calendar — a within verdict today is a within verdict
    // next year.
    const files = createPlaygroundFiles();
    const result = runPlayground('trazum position usage.jsonl', files, en, 'en');
    assert.match(result.lines.join('\n'), /within/);
  });

  it('optimize finds waste in the sample prompt in both locales', () => {
    for (const [locale, t] of [
      ['en', en],
      ['es', es],
    ]) {
      const files = createPlaygroundFiles();
      const result = runPlayground('trazum optimize prompt.txt', files, t, locale);
      const text = result.lines.join('\n');
      // The sample prompt is written to be wasteful; a run that saves nothing
      // means the sample and the rules drifted apart.
      assert.match(text, /tokens/);
      assert.ok(result.lines.length >= 2, `no rules fired in ${locale}`);
    }
  });
});
