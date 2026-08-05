import type { WebMessages } from './types';

/** English dictionary — the source of truth. */
export const en: WebMessages = {
  locale: 'en',
  numberLocale: 'en-US',
  endonym: 'English',

  meta: {
    title: 'Trazum — prompt optimiser',
    tagline: 'prompt optimiser',
    description:
      'Cut the cost of your AI calls: shorten the prompt without changing what it asks for, and see what that is worth per month. Code, URLs and templates stay untouched.',
    ogLocale: 'en_US',
  },

  page: {
    lede: 'Shortens the prompt without changing what it asks for, and tells you what that is worth per month. Code, URLs and template placeholders stay exactly as they were.',
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
    badgeSafe: 'safe',
    badgeAggressive: 'aggressive',
    advisoriesHeading: 'Beyond shortening the prompt',
    advisoryPerMonth: (amount) => `~${amount}/month`,
  },

  errors: {
    requestFailed: 'The prompt could not be optimised.',
    unreachable: 'Could not reach the server.',
  },

  api: {
    rateLimited: 'Too many requests. Wait a minute and try again.',
    invalidJson: 'The request body is not valid JSON.',
    missingPrompt: 'The prompt is missing.',
    promptTooLong: (limit) => `The prompt exceeds the limit of ${limit} characters.`,
    unknownRule: (id) => `Unknown rule: "${id}".`,
    unknownModel: (id) => `Unknown model: "${id}".`,
    invalidEndpointUrl: 'The endpoint URL is not valid.',
    endpointMustBeHttps: 'The LLM endpoint must use https.',
    endpointMustBePublic: 'The LLM endpoint cannot point at an internal address.',
    llmNotConfigured:
      'You enabled the LLM pass but no provider is configured. Fill in the endpoint and model, or set TRAZUM_LLM_BASE_URL and TRAZUM_LLM_MODEL on the server.',
    unexpected: 'Unexpected error.',
  },
};
