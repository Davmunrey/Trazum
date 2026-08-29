/**
 * The packages allowed a runtime dependency, and the only place that is said.
 *
 * Two tests hold the no-dependency invariant -- `security.test.js`, which owns
 * it, and `publish.test.js`, which checks it again on what npm would actually
 * upload. A whitelist maintained in two files is a whitelist with a hole in it,
 * so it lives here and both read it.
 *
 * The rule itself is not being softened. `@trazum/core` declares nothing and is
 * asserted separately never to appear here; every other workspace stays at
 * zero. The one exception is a package built to carry the cost so that nothing
 * else has to: a real tokenizer is twenty-two megabytes of byte-pair ranks, and
 * a gate that pulls that into every build is a gate teams turn off.
 *
 * `security.test.js` also holds the dependency to the property the rule is
 * really about -- MIT, no network, no filesystem, no subprocess -- read out of
 * the installed source rather than asserted once and trusted.
 */
export const DEPENDENCY_EXCEPTIONS = Object.freeze({
  'packages/tokenizer-openai': Object.freeze(['js-tiktoken']),
});

/** The same allowance, keyed by published package name for manifest checks. */
export const DEPENDENCY_EXCEPTIONS_BY_NAME = Object.freeze({
  '@trazum/tokenizer-openai': Object.freeze(['js-tiktoken']),
});
