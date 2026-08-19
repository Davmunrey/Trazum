import type { WebMessages } from './types';

/** English dictionary — the source of truth. */
export const en: WebMessages = {
  locale: 'en',
  numberLocale: 'en-US',
  endonym: 'English',

  meta: {
    title: 'Trazum — where your prompt spend goes',
    tagline: 'prompt cost analyser',
    description:
      'Cut the cost of your AI calls: shorten the prompt without changing what it asks for, and see what that is worth per month. Or read your usage log — entirely in the browser, nothing uploaded — and see where the money actually went.',
    ogLocale: 'en_US',
  },

  page: {
    lede: 'Prices every way this prompt costs more than it needs to — caching, model tier, the Batch API — and shortens the text itself without changing what it asks for. Code, URLs and template placeholders stay exactly as they were. The Your bill tab reads a usage log instead, entirely in this browser, and says where the money actually went.',
    footerLead: (pricingReviewed) =>
      `Pricing reviewed on ${pricingReviewed}. Token counts are estimates (±10%); for exact figures use the official counting endpoint from the CLI with `,
    footerTail:
      '. Savings are projections over the scenario you describe, not billing.',
    localeSwitchLabel: 'Language',
  },

  input: {
    promptHeading: 'Prompt',
    promptAriaLabel: 'Prompt to optimise',
    scenarioHeading: 'Usage scenario',
    model: 'Model',
    ruleLevel: 'Rule level',
    levelSafe: 'Safe',
    levelAggressive: 'Aggressive',
    callsPerMonth: 'Calls per month',
    avgOutputTokens: 'Average output tokens',
    cacheHitRate: 'Cache hit rate',
    batchLabel: 'The work tolerates latency (Batch API, 50% off)',
    optimize: 'Optimise',
    reorderLabel: 'Reorder for caching',
    reorderHint:
      'Moves stable instructions in front of the first placeholder so prompt caching can reach them. This moves text rather than deleting it — read the diff and decide whether the order mattered.',
    optimizing: 'Optimising…',
  },

  llm: {
    summary: 'Optional LLM pass',
    enable: 'Add semantic compression with an LLM',
    endpointFormat: 'Endpoint format',
    formatOpenAi: 'OpenAI-compatible (/chat/completions)',
    formatAnthropic: 'Claude API (/v1/messages)',
    baseUrl: 'Base URL',
    baseUrlPlaceholder: 'https://your-llm.example.com/v1',
    baseUrlServerDefault: "the server's own endpoint",
    suggest: 'Suggest phrase-level rewrites',
    suggestHint:
      'Asks the model which exact phrases say something in more words than they need, and '
      + 'lists them. Each one is checked against your prompt before you see it. Nothing is '
      + 'changed unless you also turn on "Apply them".',
    applySuggestions: 'Apply them',
    applySuggestionsHint:
      'Rewrites the prompt with every surviving suggestion. Read the diff afterwards — these '
      + 'came from a model.',
    baseUrlNotOffered:
      'This server calls only the LLM its operator configured. Run Trazum yourself — the CLI, or '
      + 'your own deployment — to point it at any endpoint you like.',
    model: 'Model',
    modelPlaceholder: 'model identifier',
    apiKey: 'API key',
    apiKeyOnServer: 'configured on the server — leave empty',
    apiKeyPlaceholder: 'your key',
    keyNote:
      'The key travels to this server to make the call and is discarded afterwards: it is never stored or logged. If you would rather not type it here, set the environment variables on the server and leave the fields empty.',
    safetyNote:
      'The LLM result is only accepted when it is shorter and leaves code, URLs and template placeholders intact. Otherwise it is discarded and you keep the deterministic version.',
  },

  history: {
    heading: 'History',
    clear: 'Clear',
    noText: '(no text)',
    perMonth: (amount) => `${amount}/month`,
    restoreTitle: 'Restore this prompt and its scenario',
    tooLongTitle: 'Prompt too long to store; only the summary is kept.',
    privacyNote: 'History is stored in this browser only; nothing leaves your machine.',
  },

  account: {
    signIn: 'Sign in',
    signOut: 'Sign out',
    signingOut: 'Signing out…',
    ephemeral: 'temporary session',
    ephemeralHint:
      'This deployment keeps sessions in memory, so you will be signed out when the server restarts. Set TRAZUM_DATABASE_URL to keep them.',
  },

  library: {
    tab: 'Library',
    lede: 'Prompts you have saved, and every version of each. Saving keeps the old text — the history is the record of what changed and what it cost.',
    loading: 'Loading your library…',
    empty: 'Nothing saved yet. Write a prompt on the Optimise tab and save it here.',
    saveCurrent: 'Save current prompt',
    nothingToSave: 'Write a prompt on the Optimise tab first.',
    namePrompt: 'Name this prompt',
    saveVersion: 'Save as new version',
    saved: 'Saved as a new version.',
    unchanged: 'No changes to save — the text is identical to the latest version.',
    showHistory: 'History',
    hideHistory: 'Hide history',
    restore: 'Load',
    delete: 'Delete',
    confirmDelete: (name: string) => `Delete “${name}” and its whole history? This cannot be undone.`,
    meta: (tokens: string, versions: number, updated: string) =>
      `${tokens} tokens · ${versions} ${versions === 1 ? 'version' : 'versions'} · updated ${updated}`,
    versionLabel: (version: number) => `v${version}`,
    versionTokens: (tokens: string, when: string) => `${tokens} tokens · ${when}`,
  },

  share: {
    sharedBy: (login: string, when: string) => `Shared by ${login} on ${when}. Anyone with this link can read it.`,
    footer:
      'Figures are recomputed from the prompts every time this page is opened, so they reflect today’s rules and prices rather than a snapshot.',
    button: 'Create share link',
    working: 'Creating…',
    heading: 'Share this comparison',
    expiryLabel: 'Link expires',
    expiry7: 'in 7 days',
    expiry30: 'in 30 days',
    expiry90: 'in 90 days',
    expiryNever: 'never',
    warning:
      'A share link publishes both prompts to anyone who has the URL — no sign-in required. Do not share a prompt containing secrets, customer data or anything you would not paste into a public page.',
    created: (url: string) => `Link created: ${url}`,
    copy: 'Copy link',
    copied: 'Copied',
    revoke: 'Revoke',
    existing: 'Links you have created',
    expiresOn: (when: string) => `expires ${when}`,
    neverExpires: 'never expires',
    badge: 'Badge',
    badgeHint:
      'Markdown for a README. The badge shows the token change and is recomputed each time it loads, so it follows the prompts rather than freezing a number.',
    copyBadge: 'Copy badge markdown',
  },

  admin: {
    heading: 'Deployment overview',
    lede: 'Every prompt saved on this deployment, and what the rules would recover from it.',
    notSpend:
      'These are token counts, not spending. Trazum has never seen a bill or an API call — it reads the prompts in this library and measures them. What a prompt actually costs depends on how often you call it, which only you know. There is deliberately no score here: every number on this page can be reproduced by running trazum on the same prompt.',
    loginWarning:
      'You are on the admin list by GitHub username. Usernames can be renamed and, once released, claimed by someone else — listing numeric GitHub IDs in TRAZUM_ADMINS keeps the list meaning what it meant.',
    accounts: 'Accounts',
    prompts: 'Prompts',
    prompt: 'Prompt',
    account: 'Account',
    tokens: 'Input tokens',
    recoverable: 'Recoverable',
    byAccount: 'By account',
    topHeading: 'Worth an afternoon',
    truncated: (measured: string, total: string) =>
      `Showing ${measured} of ${total} prompts. The totals above cover only those ${measured} — this deployment has more prompts than one overview reads.`,
    footer:
      'Names and totals only: this page never shows the text of anyone’s prompt. Recoverable tokens are measured by running the rules, not estimated.',
  },

  compare: {
    tab: 'Compare',
    optimiseTab: 'Optimise',
    lede:
      'Two versions of the same prompt. What the edit did to the token count, what '
      + 'that costs, and which problems it introduced or resolved.',
    beforeLabel: 'Before',
    beforeHint: 'The version you are replacing.',
    afterLabel: 'After',
    afterHint: 'The version you are proposing.',
    optimizeBoth: 'Compare what the rules would leave',
    optimizeBothHint:
      'Off by default, on purpose. Your edit changed the text as written, so the text '
      + 'as written is what you are being asked about. Trimming both sides first hides '
      + 'a prompt that doubled in length and happened to double in courtesy.',
    submit: 'Compare',
    working: 'Comparing…',
    convention:
      'Every figure below is after minus before, so positive means worse. That is the '
      + 'opposite of the rest of Trazum, where every figure is a saving.',
    tokens: (before, after) => `${before} → ${after} input tokens`,
    delta: (delta, pct) => `${delta} tokens (${pct})`,
    monthly: (amount, calls, model) => `${amount} a month at ${calls} calls with ${model}`,
    perCall: (amount) => `${amount} per call`,
    unchanged: 'The token count did not move.',
    advisoriesAppeared: 'Problems this edit introduced',
    advisoriesResolved: 'Problems this edit resolved',
    rulesNewlyFiring: 'Rules that now find something',
    rulesNoLongerFiring: 'Rules that no longer find anything',
    measuringOptimised: 'Measuring what the rules would leave, not what is written.',
    advisoryLabel: {
      'context-overflow': 'The prompt does not fit the context window',
      'context-near-limit': 'The prompt may not fit the context window',
      'prompt-caching': 'Prompt caching would pay for itself',
      'prompt-caching-not-worth-it': 'Prompt caching would cost more than it saves',
      'below-cache-minimum': 'Too short to cache on this model',
      'cache-prefix-reorder': 'Stable instructions sit after the first placeholder',
      'batch-api': 'The batch API applies to this workload',
      'model-downgrade': 'A cheaper model in the same family may do',
      'output-dominated': 'The cost is in the output, not the prompt',
      'promo-pricing': 'The price used here is promotional',
      'contradictory-instructions': 'Two instructions contradict each other',
      'redundant-examples': 'Some examples repeat what others already show',
      'restated-output-format': 'The output format is stated more than once',
      'movable-output-schema': 'The output schema could travel in the request',
    },
  },

  results: {
    empty: 'Paste your prompt and press Optimise to see what can go and what it costs.',
    heading: 'Result',
    inputTokens: (before, after) => `${before} → ${after} input tokens`,
    perMonth: (amount) => `${amount} / month`,
    costCaption: (before, after, model, calls) =>
      `${before} → ${after} with ${model}, ${calls} calls/month`,
    promoSuffix: ' (introductory pricing)',
    llmApplied: (provider, model, before, after) =>
      `Pass through ${provider}/${model} applied: ${before} → ${after} tokens.`,
    llmRejected: (reason) => `LLM pass discarded: ${reason}`,
    optimizedHeading: 'Optimised prompt',
    diffHeading: 'What changed',
    showDiff: 'Show diff',
    showResult: 'Show result',
    copy: 'Copy',
    copied: 'Copied',
    diffTooLong: 'The prompt is too long to diff in the browser. Use the CLI with ',
    rulesHeading: 'Rules applied',
    ruleHits: (hits, tokensSaved) => `(${hits}×, ~${tokensSaved} tokens)`,
    moreChanges: (count) => `+${count} more not shown`,
    badgeSafe: 'safe',
    badgeAggressive: 'aggressive',
    advisoriesHeading: 'Beyond shortening the prompt',
    advisoryPerMonth: (amount) => `~${amount}/month`,
    reorderMoved: (blocks, tokens) =>
      `Moved ${blocks} ${blocks === 1 ? 'block' : 'blocks'} (~${tokens} tokens) ahead of the first placeholder.`,
    reorderPrefix: (before, after) => `Cacheable prefix ${before} → ${after} tokens.`,
    reorderNothing: 'Nothing could safely move.',
    reorderReview:
      'Read the diff: this moved text rather than deleting it, so the question is whether the order mattered.',
    reorderDeclinedRef: (phrase, excerpt) => `refers back ("${phrase}"): ${excerpt}`,
    reorderDeclinedAfter: (excerpt) => `after a block that had to stay: ${excerpt}`,
    suggestOffered: (count, tokens) =>
      `${count} ${count === 1 ? 'phrase' : 'phrases'} could say the same in ~${tokens} fewer tokens:`,
    suggestApplied: (count, tokens) =>
      `Applied ${count} ${count === 1 ? 'rewrite' : 'rewrites'} (~${tokens} tokens) — read the diff.`,
    suggestNothing: (provider, model) =>
      `${provider} (${model}) found nothing worth rewriting that the rules had not taken.`,
    suggestRejected: (count) =>
      `${count} ${count === 1 ? 'proposal' : 'proposals'} did not survive checking against your prompt.`,
    suggestRemoved: '(removed)',
    suggestNotApplied: 'Nothing was changed. Turn on "Apply them" to take these.',
    reorderDeclinedScript: (script) =>
      `this prompt is written in ${script}, and Trazum has no backward-reference phrases ` +
      `for it — it cannot tell an instruction that is safe to move from one that points ` +
      `backwards, so it moved nothing.`,
    reorderDeclinedMore: (count) => `…and ${count} more.`,
  },

  bill: {
    tab: 'Your bill',
    lede:
      'Reads a usage log — one JSON object per line, each with a "model" and the "usage" object '
      + 'the API returned — and says where the money went: which workload, which model, whether '
      + 'caching paid for itself, and which levers would actually move the bill.',
    privacy:
      'The log is read entirely in this browser tab. Nothing is uploaded, stored or sent '
      + 'anywhere — close the page and it is gone.',
    dropLabel: 'Drop a usage log here',
    chooseFile: 'Choose a file',
    orPaste: 'or paste the log below',
    pasteAriaLabel: 'Usage log to analyse',
    analyze: 'Read the bill',
    recipe:
      'Recording the log is three lines in your own code: after each API call, append one JSON '
      + 'line with the model, the usage object the response carried, a "label" naming the '
      + 'workload and a "session" naming the conversation. It never contains prompt text, and '
      + 'the session key is grouped by and never shown.',
    empty: 'No usage records in that log.',
    nothingPriced:
      'None of the models in that log are in the pricing catalogue, so there is no bill to '
      + 'report. The CLI can price unknown models with a pricing overlay: trazum profile '
      + '--pricing.',
    heading: 'Where the money went',
    headline: (calls, total) =>
      `${calls.toLocaleString('en-US')} ${calls === 1 ? 'call' : 'calls'} · ${total}`,
    partInput: 'Input',
    partCacheRead: 'Cache reads',
    partCacheWrite: 'Cache writes',
    partOutput: 'Output',
    spendColumn: 'Spend',
    shareColumn: 'Share',
    tokensColumn: 'Tokens',
    callsColumn: 'Calls',
    cacheHeading: 'Did caching pay for itself?',
    cacheHit: (pct) => `Cache hit rate ${pct} of billable input.`,
    cacheNever:
      'Caching was never used on these calls. If any prefix repeats, that is the largest saving '
      + 'available.',
    cachePaidOff: (usd) => `Caching took ${usd} off this bill, against the same tokens uncached.`,
    cacheLost: (usd) =>
      `Caching added ${usd} to this bill instead of taking it off. A cache write costs more than `
      + 'plain input — 1.25x, or 2x at the 1-hour TTL — so a prefix that changes faster than it '
      + 'is reused pays that premium for nothing. Either cache a prefix that holds still, or '
      + 'turn caching off here.',
    cacheNoDifference:
      'Caching came out level on this bill: what it charged for these tokens is what they would '
      + 'have cost as ordinary input.',
    cacheUnpriced:
      'Tokens went through the cache on models the pricing catalogue does not know, so there is '
      + 'no comparison to make.',
    cacheUnsettled: (calls, asRecorded, atLongTtl) =>
      `This log cannot say whether caching paid for itself. ${calls.toLocaleString('en-US')} `
      + `${calls === 1 ? 'call' : 'calls'} did not record which cache-write TTL was used: at `
      + `the 5-minute rate caching took ${asRecorded} off this bill, and at the 1-hour rate `
      + `the same calls added ${atLongTtl} to it. Neither is reported as the answer. Record `
      + 'the "cache_creation" object the API returns and this settles itself.',
    cacheTtlBound: (calls, atLongTtl) =>
      `That figure is a bound, not a measurement: ${calls.toLocaleString('en-US')} `
      + `${calls === 1 ? 'call' : 'calls'} did not record a cache-write TTL, and at the `
      + `1-hour rate it is ${atLongTtl}.`,
    cacheHiddenLoss: (usd, labels) =>
      `The total hides a loss: caching costs ${usd} across ${labels}.`,
    leversHeading: 'What would actually move this bill',
    leverSlice: (label, model, usd, pct) => `${label} on ${model} — up to ${usd} (${pct})`,
    leverRoute: (candidate, usd) => `route it to ${candidate}: ${usd}`,
    leverBatch: (usd) => `send it through the Batch API: ${usd}`,
    leverCalls: (calls, spent) =>
      `${calls.toLocaleString('en-US')} ${calls === 1 ? 'call' : 'calls'}, ${spent} spent`,
    routeVerify:
      'Whether a route holds is an evaluation question, not an arithmetic one — nothing here '
      + 'has seen a single answer. The CLI measures it: trazum route <log> --prompt-file '
      + '<prompt> --cases <cases>.',
    leverPromptCeiling: (usd, pct) =>
      `For comparison: shortening the prompt text can touch ${usd} at the very most — ${pct} of `
      + 'this bill, and only if you deleted every input token. The real figure is far below '
      + 'that, because most of those tokens are retrieved context, conversation history and '
      + 'tool results that no prompt file contains.',
    leversNone:
      'Nothing here clears 1% of the bill: these calls are already on the cheapest model of '
      + 'their family, or their provider has no batch API. That is a real answer, not an empty '
      + 'section.',
    leversUnlabelled:
      'None of these calls carried a label, so this is every workload in one row — a classifier '
      + 'and a RAG pipeline merged into a single figure, with one route suggested for both. Add '
      + '"label" to the record and the levers split by workload, which is the grouping a '
      + 'decision is actually made at.',
    whatIfHeading: 'These same calls on another model',
    whatIfPick: 'Price this bill on…',
    whatIfNone: 'No model chosen.',
    whatIfAssumption:
      'This is multiplication, not advice: the same token counts at another rate card. It says '
      + 'nothing about whether that model could do the work, and a model that answers at greater '
      + 'length or gets retried would not send these counts at all.',
    whatIfTotal: (current, target, delta) =>
      `${current} of movable spend would have been ${target} — a difference of ${delta}.`,
    whatIfCheaper:
      'Verify before moving anything: the CLI measures one prompt against both models on your '
      + 'own examples with trazum route.',
    whatIfDearer: 'That direction costs more. The arithmetic is here so the number is not a guess.',
    whatIfSlice: (label, model, current, target) => `${label} on ${model}: ${current} → ${target}`,
    whatIfOverContext: (label, tokens, window, usd) =>
      `${label} cannot move: its largest call carries ${tokens} input tokens and that model's `
      + `window is ${window}. Those calls would fail, not cost less, so their ${usd} is excluded `
      + 'from the figures above.',
    whatIfAlreadyThere: (calls, usd) =>
      `Already on that model: ${calls.toLocaleString('en-US')} `
      + `${calls === 1 ? 'call' : 'calls'} worth ${usd}, left out of the figures above — money `
      + 'that cannot move would make the difference look smaller than it is.',
    whatIfUnpriced: (calls, models) =>
      `Excluded: ${calls.toLocaleString('en-US')} ${calls === 1 ? 'call' : 'calls'} whose model `
      + `has no price here (${models}). Their cost on the target is knowable; the difference is `
      + 'not, because there is no current figure to subtract from.',
    whatIfNothingToMove:
      'Nothing to compare: every priced call in this log is already on that model, or too large '
      + 'for its context window.',
    historyHeading: 'What re-sending the conversation costs',
    historyGrowth: (label, model, first, last, turns) =>
      `${label} on ${model}: input ranges from ${first} tokens on the smallest turn to ${last} `
      + `on the largest, over conversations of up to ${turns} turns.`,
    historyCeiling: (usd, pct, flat, spent) =>
      `If every turn had been the size of its smallest one, that input would have cost ${flat} `
      + `instead of ${spent} — so at most ${usd} of this bill is conversation growth (${pct}). `
      + "It is a ceiling and not a saving: some of that is the user's own new messages, which "
      + 'nothing can truncate away. What moves it is capping the history you replay, or '
      + 'summarising it.',
    historyNoSessions:
      'No call in this log carried a session, so what re-sending the conversation costs could '
      + 'not be measured — usually the largest line on a chat or agent bill. Add "session" (or '
      + '"conversation_id") to the record. Trazum groups by it and never shows it.',
    inputShapeHeading: 'How big these calls are',
    inputSkewed: (label, model, p50, p95, ratio, usd) =>
      `${label} on ${model} is uneven: half its calls fit within ${p50} input tokens and 95% within ${p95} — about ${ratio}x the ordinary call, over ${usd} of input spend.`,
    inputSkewedAdvice:
      'Past four times the median, the ordinary call is fine and something is growing on top of '
      + 'it: a conversation nobody truncates, a retrieval with no cap, a tool result pasted in '
      + 'whole. The fix is a limit on the large calls, not a rewrite of the prompt every call sends.',
    inputEven: (label, model, p50, p95, usd) =>
      `${label} on ${model} is even: half its calls fit within ${p50} input tokens and 95% within ${p95}, over ${usd} of input spend.`,
    inputEvenAdvice:
      'The large calls are not much larger than the ordinary one, so there is no tail to cap — the '
      + 'prompt is simply big. The levers are fewer retrieved documents, a shorter system block, '
      + 'and caching if the prefix repeats.',
    inputHuge: (label, model, calls, usd) =>
      `${label} on ${model}: every one of its ${calls.toLocaleString('en-US')} `
      + `${calls === 1 ? 'call' : 'calls'} is larger than this tool measures precisely, over ${usd} `
      + 'of input spend. No ceiling is named because there is none to name honestly — that size is '
      + 'itself the finding.',
    inputMostlyCached: (share) =>
      `${share} of those tokens were cache reads, billed at a tenth of the input rate — the size is real and most of it is cheap.`,
    inputFullRate:
      'Almost none of that was a cache read, so every one of those tokens was billed at the full '
      + 'input rate. If any prefix repeats across these calls, caching is the lever with the '
      + 'largest ceiling here.',
    outputHeading: 'Where the output spend concentrates',
    outputTail: (label, model, callPct, spendPct, above, usd) =>
      `${label} on ${model}: ${callPct} of calls hold ${spendPct} of the output spend — the `
      + `ones answering with more than ${above} tokens, out of ${usd} of output on this slice. `
      + 'That is a tail, and a tail has a cause: a path through the prompt that invites an '
      + 'essay, a call with no max_tokens, a retrieval that returned a book.',
    outputFlat: (label, model, callPct, spendPct, usd) =>
      `${label} on ${model}: the output spend sits where the calls are — ${callPct} of them `
      + `hold ${spendPct} of ${usd}. There is no tail to hunt; ask for shorter answers and cap `
      + 'max_tokens.',
    outputPercentiles: (p50, p95) =>
      `Half the measured answers fit within ${p50} output tokens, and 95% within ${p95} — the `
      + 'number a max_tokens cap actually wants. Measured on these calls, promised for nothing.',
    truncatedHeading: 'Answers cut off mid-generation',
    truncatedWaste: (calls, usd, pct) =>
      `${calls.toLocaleString('en-US')} ${calls === 1 ? 'call' : 'calls'} hit the max_tokens `
      + `ceiling: ${usd} of the output spend (${pct}) bought `
      + `${calls === 1 ? 'an answer that was' : 'answers that were'} cut off mid-generation — `
      + 'paid in full, frequently retried and billed again. Where the answer genuinely needs '
      + 'the room, raise max_tokens; where it does not, ask for less.',
    truncatedNone: 'Stop reasons were recorded, and no answer hit the max_tokens ceiling.',
    truncatedNotRecorded:
      'Whether any answers were cut off could not be measured — no call in this log carries a '
      + 'stop reason. Add "stop_reason" (Anthropic) or "finish_reason" (OpenAI) to the record; '
      + 'the API already returns it beside "usage".',
    span: (from, to, days) =>
      `This log covers ${from} → ${to} (${days} days). The span is stated, never `
      + 'extrapolated — the monthly arithmetic is yours to do, and now it is valid.',
    spanPartial: (withTs, total) =>
      `Only ${withTs.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} calls carry `
      + 'a timestamp; the span describes those.',
    dayPeak: (day, usd, xMedian) =>
      `The most expensive day in this log was ${day}: ${usd}, ${xMedian}x the median day.`,
    dayPeakLabel: (label, usd) => `Most of it was ${label} (${usd}).`,
    dayChartLabel: (days) =>
      `Spend per day across ${days.toLocaleString('en-US')} days; the tallest bar is the most `
      + 'expensive day.',
    ttlExpires: (label, model, gap) =>
      `${label} on ${model}: turns arrive a median of ${gap} apart and the 5-minute entry is `
      + 'gone by then — writes expire before the next turn reads them, which from the bill is '
      + 'a cache that only writes. The 1-hour TTL costs 2x input to write and would survive '
      + 'these gaps; the other honest option is caching switched off here.',
    ttlExpiresBoth: (label, model, gap) =>
      `${label} on ${model}: turns arrive a median of ${gap} apart, and no cache entry lives `
      + 'that long — even the 1-hour TTL is gone by the next turn. Caching cannot work at this '
      + 'pace; turn it off here and stop paying the write premium.',
    ttlOverlong: (label, model, gap, usd) =>
      `${label} on ${model}: turns arrive a median of ${gap} apart — comfortably inside the `
      + '5-minute window — and these writes pay the 1-hour rate, 2x input against 1.25x, for '
      + `endurance the gaps never use. The same writes at the 5-minute TTL are ${usd} cheaper `
      + 'on this log, and that figure is exact: the same tokens at the other published rate.',
    ttlUnsettled: (label, model, gap) =>
      `${label} on ${model}: turns arrive a median of ${gap} apart — a 5-minute entry is gone `
      + 'by then and a 1-hour one survives — and the log did not record which these writes '
      + 'were. Record the "cache_creation" object the API returns and this settles itself.',
    ttlFits: (label, model, gap) =>
      `${label} on ${model}: turns arrive a median of ${gap} apart, inside the lifetime these `
      + 'writes use. The TTL is not the problem here.',
    ttlUnmeasured:
      'Whether the cache TTL fits how fast the turns arrive could not be measured — it needs '
      + 'both "session" and "ts" on the record. A 5-minute entry on turns nine minutes apart '
      + 'expires unread on every write, and only the clock can see it.',
    singleTurnConfirmed: (label, model, single, sessions, usd) =>
      `${label} on ${model}: ${single} of ${sessions} conversations ended after their first turn `
      + `and spent ${usd} writing a cache that nothing in this log ever read. Those writes bought `
      + 'nothing — stop marking one-shot calls with cache_control.',
    singleTurnCeiling: (label, model, single, sessions, usd) =>
      `${label} on ${model}: ${single} of ${sessions} conversations ended after their first turn, `
      + `and their cache writes — ${usd} — paid for reuse their own conversation never made. `
      + 'Another conversation sharing the same prefix within the TTL could have read them; the '
      + 'log cannot see whose write a read hit, so that figure is a ceiling on the waste, not a bill.',
    windowLabel: 'Only between',
    windowSinceAria: 'Profile only calls on or after this UTC day',
    windowUntilAria: 'Profile only calls up to and including this UTC day',
    windowClear: 'Clear the window',
    windowHint: 'UTC days, both ends included. Applies to the previous log too.',
    windowLine:
      'Everything below describes this window, not the whole log.',
    windowUndated: (calls) =>
      `${calls === 1 ? '1 call carries' : `${calls} calls carry`} no timestamp and cannot be placed `
      + `inside or outside this window, so ${calls === 1 ? 'it was' : 'they were'} left out. `
      + "Their spend is in the log and not in this report — the window's figures are a floor on the period.",
    windowMatchesNothing: (from, to) =>
      `No record falls inside this window. The log covers ${from} → ${to}. A window matching `
      + 'nothing must not become a $0 report.',
    windowNeedsClock:
      'No record in this log carries a timestamp, so the window has nothing to filter by. '
      + 'Add "ts" to the records — the recipe below shows where.',
    windowOrder: 'The window starts after it ends. Check the two dates.',
    pricesStale: (date, days) =>
      `The price table behind every dollar here was last reviewed ${date} — ${days} days ago, `
      + 'past the 45 this tool considers current. If the provider changed prices since, this '
      + 'report is wrong by exactly that change. The CLI can fetch current prices '
      + '(trazum profile --pricing-live).',
    coverageHeading: 'What this log cannot answer yet',
    needsLabel: (seen) =>
      `"label" on ${seen} records: without it every workload is one row — no per-workload spend, no drill-down.`,
    needsSession: (seen) =>
      `"session" on ${seen} records: without it there is no conversation growth, no per-conversation cost and no cache-TTL fit. It is grouped by and never shown.`,
    needsTs: (seen) =>
      `"ts" on ${seen} records: without it the log has no period, no per-day or per-hour shape, and the cache-TTL question cannot be asked.`,
    needsStopReason: (seen) =>
      `"stop_reason" or "finish_reason" on ${seen} records: without it, answers cut off at max_tokens are invisible — and silence is not the same as none.`,
    needsCacheTtl: (seen) =>
      `the "cache_creation" object on ${seen} of the records that wrote to the cache: without it the cheaper rate is assumed, so those totals are a floor.`,
    hourChartLabel: 'Spend per hour of the UTC day, midnight to midnight',
    hoursConcentrated: (hours) =>
      `80% of this spend lands in ${hours} hours of the UTC day — interactive traffic somebody is `
      + "waiting on, where the Batch API's 24-hour turnaround does not fit. Hours are UTC.",
    hoursFlat: (hours) =>
      `It takes ${hours} hours of the UTC day to cover 80% of this spend. That is the shape `
      + 'background work has, and background work is what the Batch API halves the price of. '
      + 'Whether these calls can wait is yours to say; the log only shows when they happened.',
    truncatedBy: (label, calls, measured, rate, usd) =>
      `${label}: ${calls} of ${measured} calls that recorded a stop reason were cut off (${rate}), `
      + `${usd} of output. The denominator is the calls that measured, not every call.`,
    drillActive: (label) =>
      `Showing ${label} alone. Every share below is a share of this workload's bill, not of the whole log, and the comparison — if there is one — filters both logs the same way.`,
    drillClear: 'Show the whole log',
    sessionCost: (label, model, sessions, median, medianTurns, p95, max) =>
      `${label} on ${model}: across ${sessions} conversations, the median one costs ${median} `
      + `over ${medianTurns} turns, 95% come in under ${p95}, and the dearest was ${max}. Exact `
      + 'billed counts per conversation; one that started before this log or continues after it '
      + 'counts only for the turns recorded here.',
    sessionCostTail: (ratio) =>
      `The 95th percentile is ${ratio}x the median: most conversations are cheap and a few are `
      + 'not, which is a tail a quota can catch rather than a workload that is uniformly expensive.',
    byLabelHeading: 'By label',
    byModelHeading: 'By model',
    unlabelled: '(no label)',
    moreRows: (count) => `…and ${count} more.`,
    unpriced: (models, calls) =>
      `${calls.toLocaleString('en-US')} ${calls === 1 ? 'call is' : 'calls are'} not in these `
      + `totals — the pricing catalogue does not know: ${models}. The CLI can price `
      + `${calls === 1 ? 'it' : 'them'} with a pricing overlay (trazum profile --pricing).`,
    skipped: (count, lines) =>
      `${count.toLocaleString('en-US')} ${count === 1 ? 'line' : 'lines'} could not be read `
      + `and ${count === 1 ? 'was' : 'were'} left out `
      + `(${count === 1 ? 'line' : 'lines'} ${lines}).`,
    againstLabel: 'Compare against a previous log (optional)',
    againstHint:
      'A second usage log — last week\'s, yesterday\'s — read in this browser tab like the '
      + 'first one. Nothing is uploaded.',
    againstClear: 'Remove the previous log',
    againstHeading: 'Against the previous log',
    againstConvention:
      'Positive means the bill grew. Both figures are exactly what each log holds — no period '
      + 'is assumed, so judge the call counts before judging the money.',
    againstTotals: (before, after, delta, pct) => `${before} → ${after}   ${delta} (${pct})`,
    againstCalls: (before, after) =>
      `${before.toLocaleString('en-US')} → ${after.toLocaleString('en-US')} calls.`,
    againstDriver: (delta, label, before, after) => `${delta}  ${label}  (${before} → ${after})`,
    againstDriverNew: (delta, label) => `${delta}  ${label}  (new since the previous log)`,
    againstDriverGone: (delta, label) => `${delta}  ${label}  (gone since the previous log)`,
    againstNothingPriced:
      'The previous log has nothing the pricing catalogue knows, so there is no comparison to '
      + 'make.',
    againstByModel: 'The same change, by model — where the mix moved:',
  },

  errors: {
    requestFailed: 'The prompt could not be optimised.',
    unreachable: 'Could not reach the server.',
  },

  api: {
    rateLimited: 'Too many requests. Wait a minute and try again.',
    invalidJson: 'The request body is not valid JSON.',
    missingPrompt: 'The prompt is missing.',
    missingBefore: 'The "before" version is missing.',
    missingAfter: 'The "after" version is missing.',
    promptTooLong: (limit) => `The prompt exceeds the limit of ${limit} characters.`,
    unknownRule: (id) => `Unknown rule: "${id}".`,
    unknownModel: (id) => `Unknown model: "${id}".`,
    invalidEndpointUrl: 'The endpoint URL is not valid.',
    endpointMustBeHttps: 'The LLM endpoint must use https.',
    endpointMustBePublic: 'The LLM endpoint cannot point at an internal address.',
    endpointNotOffered:
      'This server does not call endpoints chosen by the caller. It uses the LLM its operator '
      + 'configured, or none. To allow a choice, set TRAZUM_ALLOWED_LLM_ENDPOINTS on the server.',
    endpointNotAllowed: (allowed: readonly string[]) =>
      `That endpoint is not one this server offers. Allowed: ${allowed.join(', ')}.`,
    applyNeedsSuggest:
      '"applySuggestions" has nothing to apply without "suggest". On its own it would have '
      + 'returned silently and changed nothing, which is not an answer.',
    llmNotConfigured:
      'You enabled the LLM pass but no provider is configured. Fill in the endpoint and model, or set TRAZUM_LLM_BASE_URL and TRAZUM_LLM_MODEL on the server.',
    unexpected: 'Unexpected error.',
  },
};
