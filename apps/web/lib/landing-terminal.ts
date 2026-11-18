/**
 * Written by scripts/draw-landing-terminal.mjs from what the built CLI prints.
 * Do not edit: run `node scripts/draw-landing-terminal.mjs`. The web suite
 * fails when this stops being that output.
 *
 * Each line is a list of runs, `[text, style]`, where the style letters are
 * the CLI's own: b bold, d dim, g green, y yellow, r red, a cyan (drawn in the
 * acid fill, as the README's pictures draw it).
 */

export type TerminalRun = readonly [text: string, style: string];
export interface TerminalBlock {
  readonly id: 'bill' | 'check' | 'status' | 'optimize';
  readonly command: string;
  readonly lines: readonly (readonly TerminalRun[])[];
}

/** The widest line on the screen, in characters, prompt included. */
export const TERMINAL_COLUMNS = 78;

export const TERMINAL: readonly TerminalBlock[] = [
  {
    id: "bill",
    command: "npx @trazum/cli bill examples/claude-projects",
    lines: [
      [["Your bill","b"],[" ",""],["────────────────────────────────────────────────────────────────","d"]],
      [["  ",""],["$12.70 across 126 priced call(s)","b"]],
      [["  This log covers 2026-09-01 → 2026-09-14 (13.3 days): stated, never","d"]],
      [["  extrapolated. Scale it to a month yourself, now that you know what it","d"]],
      [["  covers.","d"]],
      [["  ",""],["Agent sessions (Claude Code, Codex, Gemini CLI) are priced at catalogue","y"]],
      [["  API rates. On a subscription you paid the plan, not this API-equivalent","y"]],
      [["  estimate; missing telemetry and custom rates can change the result.","y"]],
      [],
      [["  ",""],["project","d"],["               ",""],["calls","d"],["    ",""],["USD","d"],["  ",""],["share","d"]],
      [["  home-me-etl-pipeline     42  $9.05  ",""],["███████","a"],["░░░","d"],[" 71.2%",""]],
      [["  home-me-webapp           84  $3.66  ",""],["███","a"],["░░░░░░░","d"],[" 28.8%",""]],
      [],
      [["  ",""],["model","d"],["              ",""],["calls","d"],["      ",""],["USD","d"],["  ",""],["share","d"]],
      [["  claude-fable-5-1      28    $9.00  ",""],["███████","a"],["░░░","d"],[" 70.9%",""]],
      [["  claude-opus-5-5       56    $2.95  ",""],["██","a"],["░░░░░░░░","d"],[" 23.2%",""]],
      [["  claude-sonnet-5-5     28  $0.7077  ",""],["█","a"],["░░░░░░░░░","d"],[" 5.6%",""]],
      [["  claude-haiku-5-5      14  $0.0456  ",""],["░░░░░░░░░░","d"],[" 0.4%",""]],
      [],
      [["  The receipt as data: --receipt, or -o receipt.json. The document for","d"]],
      [["  whoever pays: --pdf-out bill.pdf.","d"]],
    ],
  },
  {
    id: "check",
    command: "npx @trazum/cli check examples/",
    lines: [
      [["examples/, 3 prompts","b"],[" ",""],["─────────────────────────────────────────────────────","d"]],
      [],
      [["  ",""],["OK","g"],["      235 / 600   examples/sample-prompt.en.txt",""]],
      [["  ",""],["OK","g"],["      316 / 600   examples/sample-prompt.es.txt",""]],
      [["  ",""],["OK","g"],["      326 / 600   examples/support-prompt.txt",""]],
      [],
      [["  ",""],["All 3 within budget.","g"]],
      [],
      [["  ",""],["Against the baseline","b"]],
      [["  ",""],["unchanged at 877 tokens","d"]],
      [["  Monthly cost $11.88 → $11.88 ($0)",""]],
    ],
  },
  {
    id: "status",
    command: "echo $?",
    lines: [
      [["0",""]],
    ],
  },
  {
    id: "optimize",
    command: "npx @trazum/cli optimize examples/support-prompt.txt",
    lines: [
      [["Start here:","b"]],
      [["  ",""],["\"This task may not need Claude Opus 5\", $8.34/month, 13× what the rules","d"]],
      [["  saved.","d"]],
      [],
      [["Input tokens","b"]],
      [["  326 → ",""],["202","g"],["   ",""],["-38.0%","b"],[" (estimated, ±6%)","d"]],
      [],
      [["Rules applied","b"]],
      [["  ",""],["[safe]","d"],[" Repeated paragraphs ",""],["(1×, ~72 tokens)","d"]],
      [["  ",""],["[safe]","d"],[" Wordy phrasing ",""],["(2×, ~6 tokens)","d"]],
      [["  ",""],["[safe]","d"],[" Politeness formulas ",""],["(8×, ~34 tokens)","d"]],
      [["  ",""],["[safe]","d"],[" Filler and throat-clearing ",""],["(2×, ~11 tokens)","d"]],
      [],
      [["Cost with Claude Opus 5","b"]],
      [["  1,000 calls/month · 300 output tokens per call",""]],
      [["  $9.13 → ",""],["$8.51","g"],["   ",""],["saving $0.6200/month (6.8%)","b"]],
      [],
      [["Beyond shortening the prompt","b"]],
      [["  ",""],["→","a"],[" ",""],["$8.34","g"],["  ",""],["This task may not need Claude Opus 5","b"]],
      [["           ",""],["By length and vocabulary the prompt looks like \"haiku\" complexity.","d"]],
      [["           On Claude Haiku 5.5 you would go from $8.51 to $0.1702 per month.","d"]],
      [["           This is a keyword heuristic, not a judgement about answer quality.","d"]],
      [["           Measure it before switching in production: `trazum route","d"]],
      [["           <log.jsonl> --prompt-file <prompt> --cases <cases> --yes` sends the","d"]],
      [["           same cases to both models and reports whether the cheaper one still","d"]],
      [["           does the job.","d"]],
      [["  ",""],["→","a"],[" ",""],["$4.25","g"],["  ",""],["If the work tolerates latency, use the Batch API","b"]],
      [["           ",""],["The Batch API applies a 50% discount on both input and output. Most","d"]],
      [["           batches finish in under an hour, with a 24-hour maximum. It fits","d"]],
      [["           bulk classification, data enrichment or evaluations: anything that","d"]],
      [["           is not answering a user in real time.","d"]],
      [["  ",""],["·","d"],[" ",""],["     ","g"],["  ",""],["Below the cacheable minimum","b"]],
      [["           ",""],["Claude Opus 5 needs at least 512 prefix tokens to cache; here the","d"]],
      [["           first variable placeholder ({{question}}) shows up at ~186 tokens","d"]],
      [["           and only what precedes it can be cached. Setting cache_control will","d"]],
      [["           not error, it simply will not cache.","d"]],
      [["  ",""],["·","d"],[" ",""],["     ","g"],["  ",""],["Your cost is in the output, not the prompt","b"]],
      [["           ",""],["Output accounts for $7.50 per month against $1.01 of input.","d"]],
      [["           Shortening the prompt has a low ceiling here. The two controls that","d"]],
      [["           move the needle are the effort parameter (lower it when the task is","d"]],
      [["           not reasoning-heavy) and explicitly asking for concise answers.","d"]],
      [],
      [],
      [["  ",""],["Shortening a prompt is the smallest lever there is: measured on an","d"]],
      [["  ordinary support prompt, the rules recover about 1% of a monthly bill. On","d"]],
      [["  a metered API the things that move 60% to 80% are which model the call","d"]],
      [["  goes to, the Batch API, prompt caching, and what re-sending the","d"]],
      [["  conversation costs, and \"trazum profile <usage.jsonl>\" prices all four","d"]],
      [["  from what the provider actually charged. Recording that log is a few lines","d"]],
      [["  and it never contains prompt text.","d"]],
    ],
  },
];
