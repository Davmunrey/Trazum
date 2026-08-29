/**
 * Providers whose tokens an optional package can count exactly, by provider id.
 *
 * Its own module rather than a constant inside the command, because two
 * different readers need it: the CLI, to decide whether to try loading one, and
 * `band-family.test.js`, which walks every priced provider and asserts that the
 * ones this tool cannot count are refused by name. That suite's whole design is
 * that a family leaves its assertions by *becoming countable* rather than by
 * anybody editing the test -- which only works if there is one place that says
 * which families those are.
 *
 * A map rather than a list, so the refusal for a family that is not installed
 * can name the package that would fix it.
 */
export const OPTIONAL_COUNTERS: Readonly<Record<string, string>> = Object.freeze({
  openai: '@trazum/tokenizer-openai',
});

/** Whether some optional package exists that counts this provider exactly. */
export const countableLocally = (provider: string | null | undefined): boolean =>
  provider !== null && provider !== undefined && provider in OPTIONAL_COUNTERS;
