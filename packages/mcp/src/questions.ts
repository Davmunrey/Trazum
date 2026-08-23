/**
 * The interview's wording, for an agent.
 *
 * `@trazum/core` knows a question exists; the CLI and the web app each know how
 * to ask it in a locale. This server has no locale — an agent is not reading a
 * report, it is being asked something — so the wording lives here, in English,
 * and is held to the catalogue in both directions by `writer.test.js`.
 *
 * A question with no wording is not a cosmetic gap: an agent handed a bare id
 * would either invent the question or skip it, and a question nobody asks is a
 * slot nobody fills.
 */
export const SLOT_QUESTIONS: Readonly<Record<string, string>> = {
  task: 'What should the model do, in one sentence?',
  role: 'Who is the model being while it does that?',
  inputs: 'What changes from one call to the next?',
  'output-shape': 'What should come back: prose, json, list or table?',
  'output-schema': 'Which fields or columns, and which are always present?',
  'output-length': 'How long should the answer be, at most?',
  audience: 'Who reads the output?',
  constraints: 'What must it never do?',
  refusal: 'What should it do when it cannot answer?',
  examples: 'Is there an example of a good answer?',
  'example-inputs': 'What input produced that example?',
  'failure-modes': 'What has gone wrong with this before?',
  model: 'Which model is this for? This changes the estimate, never the prompt.',
  budget: 'What is the monthly ceiling for this prompt? This changes the estimate, never the prompt.',
};
