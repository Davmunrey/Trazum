/**
 * The refusal ceiling, written down exactly once.
 *
 * Above this many characters, a prompt door refuses with the size and the
 * limit named rather than grinding. The number started life in the web
 * routes, where a request body has to be bounded before anything reads it;
 * the CLI and the MCP server now hold the same line, because two doors to
 * the same pipeline that disagree about what fits through is the defect the
 * 1.62 arc spent a chapter closing.
 *
 * The value is a policy with a rationale, not a measurement: 400,000
 * characters is roughly a 100,000-token prompt — smaller than nothing real,
 * far past every context window's worth of prompt anyone should be paying
 * for, and an order of magnitude below where the optimiser's wall time gets
 * interesting. A door that needs to accept more raises its own limit
 * deliberately (the CLI's `--max-input`), and nothing raises it by accident.
 *
 * Usage **logs** are not held to this: a 200,000-line export is ordinary and
 * its economics are the product's whole subject. The ceiling is for inputs
 * that claim to be a prompt.
 */
export const MAX_INPUT_CHARS = 400_000;
