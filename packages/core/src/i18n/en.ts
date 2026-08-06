import type { CoreMessages } from './types.js';

const n = (value: number): string => value.toLocaleString('en-US');

/** English catalogue. This is the source of truth every other locale mirrors. */
export const en: CoreMessages = {
  locale: 'en',
  numberLocale: 'en-US',

  rules: {
    'duplicate-blocks': {
      title: 'Repeated paragraphs',
      rationale:
        'Removes whole paragraphs that already appear earlier in the prompt. Common when prompts are assembled by concatenating templates: the same block of instructions goes in twice and is paid for twice.',
    },
    'near-duplicate-blocks': {
      title: 'Near-identical paragraphs',
      rationale:
        'Removes paragraphs sharing 92% or more of their words with an earlier one, catching instructions reworded to say the same thing twice. Aggressive level: read the diff, because the 8% that differs may be exactly the nuance you cared about.',
    },
    'duplicate-lines': {
      title: 'Repeated lines',
      rationale:
        'Removes lines identical to one that appeared earlier, ignoring case, accents and punctuation. Only touches lines of 25 characters or more, so bullets and legitimate separators survive.',
    },
    'verbose-phrases': {
      title: 'Wordy phrasing',
      rationale:
        'Replaces long constructions with their short equivalent ("in order to" → "to", "con el fin de" → "para"). The meaning is identical; only the token count changes.',
    },
    politeness: {
      title: 'Politeness formulas',
      rationale:
        'Strips "please", "thank you", "kindly", "por favor"... The model does not answer better for being asked nicely, and every formula is paid for on every call.',
    },
    filler: {
      title: 'Filler and throat-clearing',
      rationale:
        'Removes empty openers such as "basically", "it is important to note that" or "cabe destacar que", which carry no instruction.',
    },
    hedges: {
      title: 'Hedging',
      rationale:
        'Removes "I think", "in my opinion", "creo que". Inside an instruction they weaken the request without adding information.',
    },
    intensifiers: {
      title: 'Intensifiers',
      rationale:
        'Strips "very", "really", "extremely", "muy"... They rarely change the task. Aggressive level because in a specific prompt the nuance can matter.',
    },
    'self-check': {
      title: 'Self-verification instructions',
      rationale:
        'Removes "double-check your work", "verifica tu respuesta". Current models already verify their own output; asking explicitly triggers extra steps paid for in output tokens. Disable this rule if your workflow depends on that verification.',
    },
    emphasis: {
      title: 'Shouted emphasis',
      rationale:
        'Lowercases shouted words (MUST, NEVER, CRITICAL) and drops prefixes like "IMPORTANT:". Uppercase splits into more tokens than lowercase, and on current models excessive emphasis makes the instruction over-trigger.',
    },
    decoration: {
      title: 'Decorative separators',
      rationale:
        'Removes lines made only of repeated characters (====, ----, ****) and runs of exclamation marks. They add no structure the model uses and cost tokens on every call.',
    },
    whitespace: {
      title: 'Stray whitespace',
      rationale:
        'Trims trailing spaces, collapses repeated spaces inside a line and reduces consecutive blank lines to one. Leading indentation is preserved so lists and nested markdown keep working.',
    },
  },

  llm: {
    emptyResponse: () => 'The model returned an empty response.',
    protectedContentAltered: (count) =>
      `The model altered ${count} protected fragment(s) (code, URL or template placeholder). Discarded so the prompt is not broken.`,
    notShorter: (after, before) =>
      `The result is not shorter (${after} vs ${before} tokens). Keeping the deterministic version.`,
    suspiciousShrink: (retainedPct) =>
      `The result keeps only ${retainedPct}% of the tokens. That looks like a summary rather than compression: review it by hand before using it.`,
  },

  suggest: {
    'not-found': () =>
      'the quoted phrase is not in the prompt — the model paraphrased what it was copying',
    'touches-protected': () =>
      'it would edit code, a URL, a placeholder or a tag, which are copied verbatim',
    'introduces-protected': () => 'the replacement adds a placeholder or URL that was not there',
    'no-saving': () => 'it is no shorter than what it replaces',
    overlaps: () => 'it shares text with a suggestion already accepted',
  },

  advisories: {
    contextOverflow: ({ tokens, modelName, contextWindow }) => ({
      title: 'The prompt does not fit in the context window',
      detail: `The optimised prompt is ~${n(tokens)} tokens and ${modelName} accepts ${n(contextWindow)}. The call will fail: split the content or move to a model with a larger window.`,
    }),

    promptCaching: ({
      placeholder,
      prefixTokens,
      totalTokens,
      minTokens,
      modelName,
      hitRatePct,
      readPct,
      writePct,
      explicit,
    }) => {
      const scope = placeholder
        ? `The stable prefix — everything before the first placeholder ${placeholder} — is ~${n(prefixTokens)} of the prompt's ${n(totalTokens)} tokens, and clears ${modelName}'s ${n(minTokens)}-token cacheable minimum.`
        : `The prompt has no variable placeholders, so the whole thing is a cacheable prefix and it clears ${modelName}'s ${n(minTokens)}-token minimum.`;
      const how = explicit
        ? 'Put the cache marker at the end of the stable prefix: any byte that changes before the cut invalidates everything after it.'
        : `${modelName} caches automatically above its minimum, so there is nothing to set — but the same rule applies: any byte that changes before the cut invalidates everything after it.`;
      return {
        title: 'Turn on prompt caching for the stable prefix',
        detail: `${scope} At a ${hitRatePct}% hit rate, a cache read costs ${readPct}% of the input price and a write costs ${writePct}%. ${how}`,
      };
    },

    promptCachingNotWorthIt: () => ({
      title: 'At that hit rate, caching does not pay off',
      detail:
        'A cache write costs 125% of the input price and a read costs 10%. Below roughly a 28% hit rate you pay more than you save. Either raise prefix reuse or leave caching off.',
    }),

    belowCacheMinimum: ({
      modelName,
      minTokens,
      placeholder,
      prefixTokens,
      totalTokens,
      mentionLowerMinimum,
    }) => {
      const reason = placeholder
        ? `here the first variable placeholder (${placeholder}) shows up at ~${n(prefixTokens)} tokens and only what precedes it can be cached`
        : `this prompt has ~${n(totalTokens)}`;
      return {
        title: 'Below the cacheable minimum',
        detail:
          `${modelName} needs at least ${n(minTokens)} prefix tokens to cache; ${reason}. Setting cache_control will not error, it simply will not cache.` +
          (mentionLowerMinimum
            ? ' Claude Opus 5 lowers that minimum to 512 tokens, so short prompts that miss here would cache there.'
            : ''),
      };
    },

    cachePrefixReorder: ({ staticTokensAfter, sharePct, placeholder }) => ({
      title: 'Move the stable instructions ahead of the first placeholder',
      detail: `About ~${n(staticTokensAfter)} tokens of stable content (${sharePct}% of the prompt) sit after the first variable placeholder ${placeholder}, so today they never get cached. Reorder the template — fixed instructions and context first, placeholders last — and that content starts being read from cache at 10% of the price. Check that reordering does not change what the prompt asks for.`,
    }),

    batchApi: () => ({
      title: 'If the work tolerates latency, use the Batch API',
      detail:
        'The Batch API applies a 50% discount on both input and output. Most batches finish in under an hour, with a 24-hour maximum. It fits bulk classification, data enrichment or evaluations: anything that is not answering a user in real time.',
    }),

    modelDowngrade: ({ modelName, tier, candidateName, currentUsd, candidateUsd }) => ({
      title: `This task may not need ${modelName}`,
      detail: `By length and vocabulary the prompt looks like "${tier}" complexity. On ${candidateName} you would go from ${currentUsd} to ${candidateUsd} per month. This is a keyword heuristic, not a judgement about answer quality: measure the difference with your own evaluations before switching in production.`,
    }),

    outputDominated: ({ outputUsd, inputUsd }) => ({
      title: 'Your cost is in the output, not the prompt',
      detail: `Output accounts for ${outputUsd} per month against ${inputUsd} of input. Shortening the prompt has a low ceiling here. The two controls that move the needle are the effort parameter (lower it when the task is not reasoning-heavy) and explicitly asking for concise answers.`,
    }),

    promoPricing: ({ modelName, promoInput, promoOutput, until, listInput, listOutput }) => ({
      title: 'You are costing this with promotional pricing',
      detail: `${modelName} has introductory pricing of ${promoInput}/${promoOutput} per million tokens until ${until}. After that date it moves to ${listInput}/${listOutput}: your bill goes up even if you change nothing.`,
    }),

    contradictoryInstructions: ({
      axis,
      firstValue,
      firstSnippet,
      secondValue,
      secondSnippet,
      otherCount,
    }) => ({
      title: `Two instructions disagree about ${axis}`,
      detail:
        `One says ${firstValue} ("${firstSnippet}") and another says ${secondValue} ("${secondSnippet}"). ` +
        'The model has to pick one, and which one it picks can change between calls — so this is a correctness problem before it is a cost one. ' +
        'Deleting the instruction you did not mean also shortens the prompt.' +
        (otherCount > 0
          ? ` ${otherCount} other ${otherCount === 1 ? 'pair' : 'pairs'} of instructions disagree too.`
          : ''),
    }),

    redundantExamples: ({ redundantCount, totalCount, redundantTokens, topSimilarityPct }) => ({
      title: `${redundantCount} of ${totalCount} examples repeat an earlier one`,
      detail:
        `They share ${topSimilarityPct}% or more of their wording with an example that comes before them, and account for about ${n(redundantTokens)} tokens paid for on every call. ` +
        'Few-shot examples earn their cost by teaching something new; two that demonstrate the same pattern teach it once. ' +
        'Read them before deleting: an example that looks redundant may be showing a boundary case on purpose.',
    }),

    restatedOutputFormat: ({ restatedCount, totalCount, restatedTokens, keyList }) => ({
      title: 'The output format is specified twice',
      detail:
        `The prose describes ${restatedCount} of the ${totalCount} fields your schema already defines (${keyList}), costing about ${n(restatedTokens)} tokens on every call. ` +
        'The code block is the version worth keeping: it is unambiguous, and Trazum never edits it. ' +
        'Check the two agree before deleting either — when a prompt says one thing in prose and another in its schema, the prose is usually the one that went stale.',
    }),
  },

  contradictionAxes: {
    'response-language': 'the language of the answer',
    'output-format': 'the output format',
    'response-length': 'how long the answer should be',
    'reasoning-visibility': 'whether to show the reasoning',
  },

  contradictionValues: {
    'fixed-language': 'always the same language',
    'mirror-language': "the reader's own language",
    'format-json': 'JSON',
    'format-markdown': 'Markdown',
    'format-plain-text': 'plain text',
    'length-brief': 'keep it brief',
    'length-detailed': 'go into detail',
    'reasoning-shown': 'show the reasoning',
    'reasoning-hidden': 'hide the reasoning',
  },
};
