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
      'Cut the cost of your AI calls: shorten the prompt without changing what it asks for, and see what that is worth per month. Code, URLs and templates stay untouched.',
    ogLocale: 'en_US',
  },

  page: {
    lede: 'Prices every way this prompt costs more than it needs to — caching, model tier, the Batch API — and shortens the text itself without changing what it asks for. Code, URLs and template placeholders stay exactly as they were.',
    footerLead: (pricingReviewed) =>
      `Pricing reviewed on ${pricingReviewed}. Token counts are estimates (±15%); for exact figures use the official counting endpoint from the CLI with `,
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
