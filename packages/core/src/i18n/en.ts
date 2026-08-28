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
      'the quoted phrase is not in the prompt: the model paraphrased what it was copying',
    'touches-protected': () =>
      'it would edit code, a URL, a placeholder or a tag, which are copied verbatim',
    'introduces-protected': () => 'the replacement adds a placeholder or URL that was not there',
    'no-saving': () => 'it is no shorter than what it replaces',
    overlaps: () => 'it shares text with a suggestion already accepted',
  },

  advisories: {
    /**
     * Three shapes, not two, because *"how wrong might this estimate be"* has
     * three answers and only two were written down.
     *
     * The count is exact, and then the window verdict is a fact. The count is an
     * estimate on the family the estimator was measured against, and then the
     * margin is known and the verdict is a probability. Or the count is an
     * estimate on a family nobody has measured, and then the margin itself is
     * the unknown, which is neither of the first two and used to be told as the
     * second.
     *
     * `--exact-tokens` is named only in the branch where it would help. It
     * counts with Anthropic's endpoint, so recommending it to somebody on
     * another family was sending them to a counter for a different tokenizer
     * and calling the result exact.
     */
    contextOverflow: ({ tokens, modelName, contextWindow, uncertain, bandApplies }) => ({
      title: uncertain
        ? bandApplies
          ? 'The prompt probably does not fit in the context window'
          : 'The prompt may not fit in the context window, and by how much is not knowable here'
        : 'The prompt does not fit in the context window',
      detail: !uncertain
        ? `The optimised prompt is ~${n(tokens)} tokens and ${modelName} accepts ${n(contextWindow)}. The call will fail: split the content or move to a model with a larger window.`
        : bandApplies
          ? `The optimised prompt is ~${n(tokens)} tokens against ${modelName}'s ${n(contextWindow)}. That count is an estimate and it is close to the line, so the call will probably fail but might not. Settle it with --exact-tokens before rewriting anything. The counting endpoint is free. If it does exceed the window, split the content or move to a model with a larger one.`
          : `The optimised prompt is ~${n(tokens)} tokens against ${modelName}'s ${n(contextWindow)}, which is over. That count is an estimate, and the estimator's error was measured against Claude's tokenizer rather than ${modelName}'s, so how far over it really is cannot be said from here. Trazum will not tell you the call fails on a number it has not measured for this family. Count with your provider's own tooling before rewriting anything.`,
    }),

    contextNearLimit: ({ tokens, modelName, contextWindow, bandApplies }) => ({
      title: 'The prompt may not fit in the context window',
      detail: bandApplies
        ? `The optimised prompt is ~${n(tokens)} tokens against ${modelName}'s ${n(contextWindow)}, which fits, but that count is an estimate and its error range reaches past the window, so the real prompt may not. A call that exceeds the window fails outright rather than degrading, and nothing else here warns about it. Confirm with --exact-tokens; the counting endpoint is free.`
        : `The optimised prompt is ~${n(tokens)} tokens against ${modelName}'s ${n(contextWindow)}, which fits on the estimate. This warning is raised because the estimator's measured error, against Claude's tokenizer rather than ${modelName}'s, would reach past the window, and nobody has measured what that error is on this family. A call that exceeds the window fails outright rather than degrading. Count with your provider's own tooling before relying on the margin.`,
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
      nearMinimum,
    }) => {
      const scope = placeholder
        ? `The stable prefix (everything before the first placeholder ${placeholder}) is ~${n(prefixTokens)} of the prompt's ${n(totalTokens)} tokens, and clears ${modelName}'s ${n(minTokens)}-token cacheable minimum.`
        : `The prompt has no variable placeholders, so the whole thing is a cacheable prefix and it clears ${modelName}'s ${n(minTokens)}-token minimum.`;
      const how = explicit
        ? 'Put the cache marker at the end of the stable prefix: any byte that changes before the cut invalidates everything after it.'
        : `${modelName} caches automatically above its minimum, so there is nothing to set, but the same rule applies: any byte that changes before the cut invalidates everything after it.`;
      const hedge = nearMinimum
        ? ` One caveat on the figure: that prefix count is an estimate and it is close to the line, so the real one may be below the ${n(minTokens)}-token minimum, in which case nothing caches and this saving is not there. Settle it with --exact-tokens before budgeting from it. The counting endpoint is free.`
        : '';
      return {
        title: 'Turn on prompt caching for the stable prefix',
        detail: `${scope} At a ${hitRatePct}% hit rate, a cache read costs ${readPct}% of the input price and a write costs ${writePct}%. ${how}${hedge}`,
      };
    },

    promptCachingNotWorthIt: ({ readPct, writePct, breakEvenPct }) => ({
      title: 'At that hit rate, caching does not pay off',
      detail:
        breakEvenPct === null
          ? `A cache write costs ${writePct}% of the input price on this model, the same as not caching, and a read costs ${readPct}%. So caching cannot lose you money here: at this hit rate it simply buys nothing. Raise prefix reuse and it starts paying immediately.`
          : `A cache write costs ${writePct}% of the input price on this model and a read costs ${readPct}%. Below a ${breakEvenPct}% hit rate you pay more than you save. Either raise prefix reuse or leave caching off.`,
    }),

    belowCacheMinimum: ({
      modelName,
      minTokens,
      placeholder,
      prefixTokens,
      totalTokens,
      mentionLowerMinimum,
      couldReachMinimum,
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
            : '') +
          (couldReachMinimum
            ? ' That prefix count is an estimate and it is close to the line, so the real one may already be above it. Check with --exact-tokens before deciding this is not available to you. The counting endpoint is free.'
            : ''),
      };
    },

    cachePrefixReorder: ({ staticTokensAfter, sharePct, placeholder, command }) => ({
      title: 'Move the stable instructions ahead of the first placeholder',
      detail: `About ~${n(staticTokensAfter)} tokens of stable content (${sharePct}% of the prompt) sit after the first variable placeholder ${placeholder}, so today they never get cached. Fixed instructions and context first, placeholders last, and that content starts being read from cache at 10% of the price. Run \`${command}\` to attempt it: whole blocks only, and it refuses to move anything that refers back to earlier text. Read the diff: order carries meaning, and "summarise the text above" is nonsense in front of the text it points at.`,
    }),

    batchApi: () => ({
      title: 'If the work tolerates latency, use the Batch API',
      detail:
        'The Batch API applies a 50% discount on both input and output. Most batches finish in under an hour, with a 24-hour maximum. It fits bulk classification, data enrichment or evaluations: anything that is not answering a user in real time.',
    }),

    modelDowngrade: ({ modelName, tier, candidateName, currentUsd, candidateUsd }) => ({
      title: `This task may not need ${modelName}`,
      detail: `By length and vocabulary the prompt looks like "${tier}" complexity. On ${candidateName} you would go from ${currentUsd} to ${candidateUsd} per month. This is a keyword heuristic, not a judgement about answer quality. Measure it before switching in production: \`trazum route <log.jsonl> --prompt-file <prompt> --cases <cases> --yes\` sends the same cases to both models and reports whether the cheaper one still does the job.`,
    }),

    tierSignalsConflict: ({ complexSignals, simpleSignals }) => ({
      title: 'The prompt asks for depth and for brevity at once',
      detail: `It carries ${complexSignals} signal${complexSignals === 1 ? '' : 's'} of a hard task and ${simpleSignals} of an easy one, and this heuristic scores those against each other, so they cancel. No tier is recommended here: a number produced by two opposite readings cancelling out looks exactly like a prompt with no signals at all, and they are not the same thing. Decide it by measurement rather than by vocabulary: \`trazum route <log.jsonl> --prompt-file <prompt> --cases <cases> --yes\`.`,
    }),

    outputDominated: ({ outputUsd, inputUsd }) => ({
      title: 'Your cost is in the output, not the prompt',
      detail: `Output accounts for ${outputUsd} per month against ${inputUsd} of input. Shortening the prompt has a low ceiling here. The two controls that move the needle are the effort parameter (lower it when the task is not reasoning-heavy) and explicitly asking for concise answers.`,
    }),

    promoPricing: ({ modelName, promoInput, promoOutput, until, listInput, listOutput }) => ({
      title: 'You are costing this with promotional pricing',
      detail: `${modelName} has introductory pricing of ${promoInput}/${promoOutput} per million tokens until ${until}. After that date it moves to ${listInput}/${listOutput}: your bill goes up even if you change nothing.`,
    }),

    modelRetired: ({ modelName, modelId, on, because }) => ({
      title: `${modelName} is priced here and refused by its provider`,
      detail:
        `A real request for \`${modelId}\` was answered with an error on ${on}: "${because}" `
        + 'The price above is still the right one for calls already in your log, because that '
        + 'money was spent. A new call on this id will not run. Nothing here proposes what the '
        + 'replacement costs: that figure comes off the provider\'s own pricing page or not at all.',
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
        'The model has to pick one, and which one it picks can change between calls, so this is a correctness problem before it is a cost one. ' +
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

    movableSchema: ({ blocks, tokens, keyList, cue }) => ({
      title: 'The output schema could travel in the request instead of the prompt',
      detail:
        `${blocks === 1 ? 'A schema block' : `${blocks} schema blocks`} introduced by "${cue}" defines ${keyList}, costing about ${n(tokens)} tokens on every call. ` +
        'Every major API now takes a response schema as a request parameter (output_config.format, response_format, responseSchema), and moving it there is the rare change that is both cheaper and stricter: prose asks the model to comply, a parameter makes the decoder comply. ' +
        'Trazum cannot make this edit, because it changes the call rather than the prompt, and it does not check whether your provider offers the parameter; if it does not, this is not available to you.',
    }),

    restatedOutputFormat: ({ restatedCount, totalCount, restatedTokens, keyList }) => ({
      title: 'The output format is specified twice',
      detail:
        `The prose describes ${restatedCount} of the ${totalCount} fields your schema already defines (${keyList}), costing about ${n(restatedTokens)} tokens on every call. ` +
        'The code block is the version worth keeping: it is unambiguous, and Trazum never edits it. ' +
        'Check the two agree before deleting either: when a prompt says one thing in prose and another in its schema, the prose is usually the one that went stale.',
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
