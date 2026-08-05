import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  analyzeCachePrefix,
  estimateTokens,
  extractPrompts,
  hasMarker,
  optimize,
  promptId,
} from '../dist/index.js';

/**
 * Reading prompts out of source files.
 *
 * The risk here is the opposite of `reorder.ts`. That module could change what a
 * prompt asks for; this one can only pick up the wrong string — but it feeds a
 * command used as a **CI gate**, so picking up the wrong string means failing
 * somebody's build over a log message, and missing the right one means a green
 * build for a prompt nobody measured.
 *
 * So the tests are weighted toward what it must not pick up, and toward the
 * refusals being visible rather than silent.
 */

describe('what it extracts', () => {
  it('takes the template literal after the marker', () => {
    const source = `
const other = \`not this one\`;

// trazum:prompt
const SYSTEM = \`You are a support agent.

Always answer in the customer's language.\`;
`;
    const { prompts } = extractPrompts(source);
    assert.equal(prompts.length, 1);
    assert.match(prompts[0].text, /^You are a support agent\./);
    assert.match(prompts[0].text, /customer's language\.$/);
  });

  it('keeps interpolation exactly as written, because the masking pass wants it', () => {
    // `${x}` is the placeholder shape segment.ts already protects. If this
    // stripped or resolved it, an embedded prompt would lose the cache-prefix
    // analysis that a {{x}} template gets — the one case that must not be special.
    const source = '// trazum:prompt\nconst P = `Agent.\n\nMessage: ${message}\n\nBe brief.`;\n';
    const { prompts } = extractPrompts(source);

    assert.match(prompts[0].text, /\$\{message\}/);
    const analysis = analyzeCachePrefix(prompts[0].text, estimateTokens);
    assert.ok(analysis.stablePrefixTokens > 0, 'the interpolation was not seen as a placeholder');
    assert.ok(analysis.staticTokensAfter > 0, 'nothing was found after the placeholder');
  });

  it('reads a Python triple-quoted string', () => {
    const source = `
# trazum:prompt
SYSTEM = """You are a support agent.

Answer in the customer's language.
"""
`;
    const { prompts } = extractPrompts(source);
    assert.equal(prompts.length, 1);
    assert.equal(prompts[0].quote, '"""');
    assert.match(prompts[0].text, /^You are a support agent\./);
  });

  it('resolves escapes in a quoted string but not in a raw one', () => {
    // `"a\nb"` is one newline written as two characters; `` `a\nb` `` is a
    // backslash followed by an n. Counting them the same way would be wrong for
    // one of them, and it is the token count that pays for it.
    const quoted = extractPrompts('// trazum:prompt\nconst A = "line\\nline";\n');
    assert.equal(quoted.prompts[0].text, 'line\nline');

    const raw = extractPrompts('// trazum:prompt\nconst B = `line\\nline`;\n');
    assert.equal(raw.prompts[0].text, 'line\\nline');
  });

  it('takes a name from the marker when one is given', () => {
    const source = '// trazum:prompt support-system\nconst P = `Be helpful.`;\n';
    const { prompts } = extractPrompts(source);
    assert.equal(prompts[0].name, 'support-system');
    assert.equal(promptId('src/prompts.ts', prompts[0]), 'src/prompts.ts#support-system');
  });

  it('falls back to file and line when the marker is bare', () => {
    // Budgets are glob patterns over paths, so an embedded prompt needs an id
    // that `src/**` matches without the config learning a new syntax.
    const source = '\n\n// trazum:prompt\nconst P = `Be helpful.`;\n';
    const { prompts } = extractPrompts(source);
    assert.equal(prompts[0].name, undefined);
    assert.equal(promptId('src/prompts.ts', prompts[0]), 'src/prompts.ts:3');
  });

  it('finds every marked prompt in one file', () => {
    const source = `
// trazum:prompt first
const A = \`Prompt one.\`;

const unmarked = \`Not a prompt.\`;

// trazum:prompt second
const B = \`Prompt two.\`;
`;
    const { prompts } = extractPrompts(source);
    assert.deepEqual(prompts.map((p) => p.name), ['first', 'second']);
    assert.ok(!prompts.some((p) => p.text.includes('Not a prompt')));
  });

  it('reads markers in the comment syntax of the language it is in', () => {
    for (const [label, source] of [
      ['js', '// trazum:prompt\nconst P = `Be brief.`;'],
      ['python', '# trazum:prompt\nP = """Be brief."""'],
      ['sql', '-- trazum:prompt\nSET p = \'Be brief.\';'],
      ['html', '<!-- trazum:prompt -->\n<x>`Be brief.`</x>'],
    ]) {
      const { prompts } = extractPrompts(source);
      assert.equal(prompts.length, 1, `${label}: nothing extracted`);
      assert.match(prompts[0].text, /Be brief\./, `${label}: wrong text`);
    }
  });

  it('hands the extracted text to optimize unchanged', () => {
    // The point of the whole module: an embedded prompt gets exactly what a
    // standalone one gets, with no second code path to drift.
    const source =
      '// trazum:prompt\nconst P = `Please kindly note that you should be brief.\n\nInput: ${x}`;\n';
    const { prompts } = extractPrompts(source);
    const result = optimize(prompts[0].text, { level: 'aggressive' });

    assert.ok(result.rules.length > 0, 'no rule fired on an obviously trimmable prompt');
    assert.ok(result.tokensAfter < result.tokensBefore);
    assert.match(result.optimized, /\$\{x\}/, 'the interpolation was not protected');
  });
});

describe('what it refuses', () => {
  it('declines a prompt built by concatenation, and says why', () => {
    // The honest limit. The text does not exist until it runs, so governing the
    // half that is visible would be a budget enforced against a fragment.
    const source = '// trazum:prompt\nconst P = `You are ${role}.` + rules.join("\\n");\n';
    const { prompts, declined } = extractPrompts(source);

    assert.equal(prompts.length, 0, 'a fragment was extracted as if it were the prompt');
    assert.equal(declined[0].reason, 'concatenated');
    assert.equal(declined[0].line, 1);
  });

  it('sees concatenation that was wrapped onto the next line', () => {
    const source = '// trazum:prompt\nconst P = `You are helpful.`\n  + extra;\n';
    const { prompts, declined } = extractPrompts(source);
    assert.equal(prompts.length, 0);
    assert.equal(declined[0].reason, 'concatenated');
  });

  it('is not fooled by a semicolon or a comma into thinking it concatenated', () => {
    for (const tail of [';', ',', ')', ');']) {
      const { prompts, declined } = extractPrompts(
        `// trazum:prompt\nconst P = \`Be brief.\`${tail}\n`,
      );
      assert.equal(prompts.length, 1, `refused on a trailing ${JSON.stringify(tail)}`);
      assert.equal(declined.length, 0);
    }
  });

  it('declines a marker with no literal after it', () => {
    const source = '// trazum:prompt\nconst n = 42;\nconst m = 43;\n';
    const { prompts, declined } = extractPrompts(source);
    assert.equal(prompts.length, 0);
    assert.equal(declined[0].reason, 'no-literal');
  });

  it('will not reach past a few lines to adopt an unrelated string', () => {
    // Without the bound, a marker on a deleted prompt would silently attach
    // itself to whatever string appeared next — a log line, a SQL query.
    const source = `// trazum:prompt
${'\n'.repeat(8)}
logger.info("this is not the prompt");
`;
    const { prompts, declined } = extractPrompts(source);
    assert.equal(prompts.length, 0);
    assert.equal(declined[0].reason, 'no-literal');
  });

  it('declines an unterminated literal instead of swallowing the file', () => {
    const source = '// trazum:prompt\nconst P = `Be brief.\nconst Q = 1;\n';
    const { declined } = extractPrompts(source);
    assert.equal(declined[0].reason, 'unterminated');
  });

  it('stops a single-quoted literal at the end of its line', () => {
    // A missing closing quote must not run to the end of the file and return
    // half the source as a prompt.
    const source = "// trazum:prompt\nconst P = 'Be brief.\nconst Q = 'x';\n";
    const { prompts, declined } = extractPrompts(source);
    assert.equal(prompts.length, 0);
    assert.equal(declined[0].reason, 'unterminated');
  });

  it('ignores the tag when it is not in a comment', () => {
    // A prompt that happens to talk about Trazum must not mark the next string.
    const source = 'const doc = `Write trazum:prompt above the literal.`;\nconst P = `not this`;\n';
    const { prompts, declined } = extractPrompts(source);
    assert.equal(prompts.length, 0);
    assert.equal(declined.length, 0);
  });

  it('extracts nothing from a file with no marker at all', () => {
    const source = 'const a = `hello`;\nconst b = "world";\n';
    assert.equal(hasMarker(source), false);
    assert.deepEqual(extractPrompts(source), { prompts: [], declined: [] });
  });
});

describe('it does not fall over on hostile input', () => {
  // Delimiter matching over untrusted source is the shape that goes quadratic,
  // and the module this most resembles shipped two such patterns this week.
  const BUDGET_MS = 5000;

  const cases = [
    ['unterminated literal, huge file', `// trazum:prompt\nconst P = \`${'x'.repeat(400_000)}`],
    ['marker storm', '// trazum:prompt\n'.repeat(20_000)],
    ['backslash run', `// trazum:prompt\nconst P = "${'\\'.repeat(200_000)}"`],
    ['quote storm', `// trazum:prompt\n${'`'.repeat(100_000)}`],
    ['tag inside a giant literal', `const P = \`${'trazum:prompt '.repeat(20_000)}\`;`],
    ['no marker, large file', 'const x = `a`;\n'.repeat(40_000)],
    ['newline run after marker', `// trazum:prompt${'\n'.repeat(200_000)}\`x\``],
  ];

  for (const [name, source] of cases) {
    it(`survives ${name}`, () => {
      const started = Date.now();
      extractPrompts(source);
      const elapsed = Date.now() - started;
      assert.ok(elapsed < BUDGET_MS, `took ${elapsed}ms on ${source.length} chars`);
    });
  }
});
