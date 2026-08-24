import { BUNDLED_CATALOGUE, profileUsage } from '../../dist/index.js';

/**
 * The heap-line probe's child half: build a 25MB usage log and profile it,
 * inside whatever old-space ceiling the parent started this process with.
 *
 * Deterministic — the fuzzer's LCG, a fixed clock — so the only variable
 * between two runs is the machine, and the machine is exactly what the
 * ceiling is there to overrule. Success is printing the verdict; failure is
 * the V8 out-of-memory crash the parent reads as a broken promise.
 */

const generator = (seed) => {
  let state = seed;
  return () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
};

const TARGET_BYTES = 25 * 1024 * 1024;
const rnd = generator(29);
const models = ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'];
const labels = ['support-rag', 'classify', 'agent'];
const startMs = Date.parse('2026-01-01T00:00:00Z');

const lines = [];
let bytes = 0;
for (let i = 0; bytes < TARGET_BYTES; i += 1) {
  const line = JSON.stringify({
    timestamp: new Date(startMs + i * 5000).toISOString(),
    model: models[Math.floor(rnd() * models.length)],
    label: labels[Math.floor(rnd() * labels.length)],
    session: `conv-${Math.floor(rnd() * 500)}`,
    stop_reason: rnd() < 0.05 ? 'max_tokens' : 'end_turn',
    usage: {
      input_tokens: 200 + Math.floor(rnd() * 4000),
      output_tokens: 50 + Math.floor(rnd() * 800),
      cache_read_input_tokens: rnd() < 0.6 ? Math.floor(rnd() * 16000) : 0,
      cache_creation_input_tokens: rnd() < 0.2 ? Math.floor(rnd() * 4000) : 0,
    },
  });
  lines.push(line);
  bytes += line.length + 1;
}
const text = lines.join('\n');

const report = profileUsage(text, {
  catalogue: BUNDLED_CATALOGUE,
  on: new Date('2026-01-01T00:00:00Z'),
});

console.log(
  JSON.stringify({
    logBytes: text.length,
    lines: lines.length,
    calls: report.total.calls,
    skipped: report.skippedLines.length,
    maxRssBytes: process.resourceUsage().maxRSS * 1024,
  }),
);
