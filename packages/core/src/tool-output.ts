import { estimateTokens } from './tokenizer.js';
import { MAX_INPUT_CHARS } from './limits.js';

/** A display view of a log, never a replacement for machine-readable output. */
export interface ToolOutputView {
  text: string;
  applied: boolean;
  reason: 'compacted' | 'unchanged' | 'unsupported' | 'too-large' | 'not-worthwhile';
  estimatedTokensBefore: number | null;
  estimatedTokensAfter: number | null;
  repeatedLines: number;
}

export const EFFICIENT_OUTPUT_INSTRUCTIONS =
  'Answer the requested task directly. Avoid repeating the request, unchanged code, ' +
  'and redundant explanations. Use only the detail needed for correctness. ' +
  'Preserve errors, evidence, constraints and required checks. Expand compacted tool ' +
  'output when exact lines are needed. Follow the user’s requested format and depth. ' +
  'Never claim token reductions increase a provider’s quota.';

const HEADER = '[Trazum compacted log;';
// Diagnostic repetition may be evidence of frequency and must remain visible.
const DIAGNOSTIC = /error|warn|fail|fatal|exception|traceback|panic|assert|stderr/i;

/**
 * Collapse only consecutive, identical, complete log lines. No semantic rewrite,
 * source-code compression, tail truncation or deduplication across intervening
 * lines. The caller must store the original before emitting an applied view.
 * Counts are heuristic estimates, not provider usage or subscription capacity.
 */
export function compactToolOutput(input: string, recoveryCommand: string): ToolOutputView {
  const unchanged = (reason: ToolOutputView['reason'], before: number | null): ToolOutputView => ({
    text: input, applied: false, reason, estimatedTokensBefore: before,
    estimatedTokensAfter: before, repeatedLines: 0,
  });
  if (input.length > MAX_INPUT_CHARS) return unchanged('too-large', null);
  const before = estimateTokens(input);
  if (!recoveryCommand || /[\r\n]/.test(recoveryCommand)) return unchanged('unsupported', before);
  // Do not reinterpret terminal controls, fenced source or our own output.
  if (/[\x00-\x08\x0b-\x1f\x7f]/.test(input) || /```|~~~/.test(input) || input.startsWith(HEADER)) {
    return unchanged('unsupported', before);
  }
  const lines = input.split('\n');
  const out: string[] = [];
  let removed = 0;
  for (let i = 0; i < lines.length;) {
    const line = lines[i]!;
    let end = i + 1;
    // Leave the final unterminated line untouched.
    while (end < lines.length - 1 && lines[end] === line) end++;
    const count = end - i;
    if (count >= 3 && line.trim() !== '' && !DIAGNOSTIC.test(line)) {
      out.push(line, `[Trazum: previous line repeated ${count - 1} additional times]`);
      removed += count - 1;
    } else {
      for (let j = i; j < end; j++) out.push(lines[j]!);
    }
    i = end;
  }
  if (!removed) return unchanged('unchanged', before);
  const text = `${HEADER} consecutive repetitions only; token counts are estimates]\n` +
    `Recover original: ${recoveryCommand}\n\n` + out.join('\n');
  const after = estimateTokens(text);
  // Include recovery instructions in the comparison; tiny reductions do not
  // justify changing the display. This is a heuristic, not a token guarantee.
  if (before - after < 128 || after > before * 0.8) return unchanged('not-worthwhile', before);
  return { text, applied: true, reason: 'compacted', estimatedTokensBefore: before,
    estimatedTokensAfter: after, repeatedLines: removed };
}
