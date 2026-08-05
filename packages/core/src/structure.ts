import { segment } from './segment.js';
import { jaccard, normalizeForCompare } from './similarity.js';
import type { ContradictionAxisId } from './i18n/types.js';
import type { TokenCounter } from './types.js';

/**
 * Structural analysis.
 *
 * Every rule in `rules.ts` matches a phrase. The waste this module looks for
 * is a relationship between two places in the prompt — an instruction that
 * contradicts another, an example that teaches what an earlier one already
 * taught. No dictionary can see either, because neither is wrong on its own.
 *
 * Everything here is advisory. A contradiction has a right answer only the
 * author knows, and an example that looks redundant may be demonstrating a
 * boundary case on purpose. Trazum points; it does not cut.
 */

// --------------------------------------------------------------------------
// Contradictory instructions
// --------------------------------------------------------------------------

/**
 * Sourced from the i18n contract rather than declared here, so adding an axis
 * fails to compile until every catalogue can name it.
 */
export type ContradictionAxis = ContradictionAxisId;

export interface ContradictionSide {
  /** Which end of the axis this instruction sits on. */
  value: string;
  /** The sentence it was found in, trimmed for display. */
  snippet: string;
}

export interface Contradiction {
  axis: ContradictionAxis;
  a: ContradictionSide;
  b: ContradictionSide;
}

interface AxisDefinition {
  axis: ContradictionAxis;
  values: ReadonlyArray<readonly [value: string, pattern: RegExp]>;
}

/**
 * Verbs that mark a sentence as being about the *response*.
 *
 * Requiring one is what keeps "translate this into English" from being read as
 * "answer in English". Without it the language axis fires on any prompt that
 * merely mentions a language, which is most translation prompts.
 */
const RESPOND = String.raw`(?:respond|reply|answer|write|speak|output|responde|contesta|responder|escribe|redacta)`;

const AXES: readonly AxisDefinition[] = [
  {
    axis: 'response-language',
    values: [
      [
        'a fixed language',
        new RegExp(
          String.raw`\b${RESPOND}\b[^.!?\n]{0,40}?\bin\s+(?:english|spanish|french|german|italian|portuguese|ingl[ée]s|espa[nñ]ol|franc[ée]s|alem[áa]n)\b|\b${RESPOND}\b[^.!?\n]{0,40}?\ben\s+(?:ingl[ée]s|espa[nñ]ol|franc[ée]s|alem[áa]n)\b`,
          'i',
        ),
      ],
      [
        "the user's language",
        new RegExp(
          // The qualifier slot ("own", "native", "preferred") is what makes
          // this survive real prompts: "the customer's own language" is at
          // least as common as the bare form.
          String.raw`\bin\s+the\s+(?:same\s+)?language\s+(?:of|as|the\s+\w+\s+(?:used|wrote|speaks))|\bin\s+(?:the\s+(?:user|customer|client)'?s?|their)\s+(?:own\s+|native\s+|preferred\s+)?language\b|\bmatch\s+the\s+language\b|\ben\s+(?:el\s+)?(?:mismo\s+)?idioma\s+(?:del?\s+|en\s+que\s+)?(?:usuario|cliente|consulta|mensaje|escrib)`,
          'i',
        ),
      ],
    ],
  },
  {
    axis: 'output-format',
    values: [
      [
        'JSON',
        new RegExp(
          String.raw`\b(?:${RESPOND}|return|format|devuelve|formatea)\b[^.!?\n]{0,40}?\b(?:as|in|with|using|only|en|como)\s+(?:valid\s+|solo\s+|válido\s+)?json\b|\bonly\s+json\b|\bsolo\s+json\b`,
          'i',
        ),
      ],
      [
        'Markdown',
        new RegExp(
          String.raw`\b(?:${RESPOND}|return|format|devuelve|formatea)\b[^.!?\n]{0,40}?\b(?:as|in|with|using|en|como)\s+markdown\b|\buse\s+markdown\b|\busa\s+markdown\b`,
          'i',
        ),
      ],
      [
        'plain text',
        new RegExp(
          String.raw`\bplain\s+text\b|\bno\s+markdown\b|\bwithout\s+markdown\b|\btexto\s+plano\b|\bsin\s+markdown\b`,
          'i',
        ),
      ],
    ],
  },
  {
    axis: 'response-length',
    values: [
      [
        'brief',
        new RegExp(
          String.raw`\b(?:be\s+(?:brief|concise|succinct|terse)|keep\s+it\s+(?:short|brief)|as\s+short\s+as\s+possible|in\s+(?:one|a\s+single)\s+sentence|s[ée]\s+(?:breve|conciso)|de\s+forma\s+(?:breve|concisa)|brevemente)\b`,
          'i',
        ),
      ],
      [
        'detailed',
        new RegExp(
          String.raw`\b(?:be\s+(?:detailed|comprehensive|thorough|exhaustive)|in\s+(?:great\s+)?depth|as\s+much\s+detail\s+as\s+possible|s[ée]\s+(?:exhaustivo|detallado)|de\s+forma\s+(?:detallada|exhaustiva)|con\s+todo\s+detalle|detalladamente)\b`,
          'i',
        ),
      ],
    ],
  },
  {
    axis: 'reasoning-visibility',
    values: [
      [
        'show the reasoning',
        new RegExp(
          String.raw`\b(?:explain\s+your\s+(?:reasoning|answer|thinking)|show\s+your\s+(?:work|reasoning|thinking)|think\s+step[\s-]by[\s-]step|justify\s+your\s+answer|explica\s+tu\s+razonamiento|razona\s+paso\s+a\s+paso|justifica\s+tu\s+respuesta)\b`,
          'i',
        ),
      ],
      [
        'hide the reasoning',
        new RegExp(
          String.raw`\b(?:no\s+(?:explanation|commentary|preamble)|without\s+(?:explanation|commentary)|do\s+not\s+explain|don'?t\s+explain|no\s+expliques|sin\s+(?:explicaciones|comentarios)|sin\s+preámbulo)\b`,
          'i',
        ),
      ],
    ],
  },
];

/**
 * Text the analysis is allowed to read.
 *
 * Protected segments are replaced by a space rather than kept: a JSON schema
 * inside a code fence is the *specification* of the output format, not a
 * second instruction about it, and reading it as one would report a
 * contradiction in every well-written prompt that shows its schema.
 */
function analysableText(prompt: string): string {
  return segment(prompt)
    .map((s) => (s.kind === 'mutable' ? s.text : ' '))
    .join('');
}

/** Splits into sentences, keeping line breaks as boundaries. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;:])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function trimSnippet(sentence: string, max = 90): string {
  const clean = sentence.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

/**
 * Finds instructions that pull in opposite directions on the same axis.
 *
 * Only the first occurrence of each value is kept, and an axis reports at most
 * one contradiction: a prompt that says "be concise" four times and "be
 * thorough" once has one problem, not four.
 *
 * Two matches inside the same sentence are ignored. "Be concise but complete"
 * is a deliberate trade-off an author wrote on purpose; flagging it would
 * train people to ignore the advisory.
 */
export function findContradictions(prompt: string): Contradiction[] {
  const found: Contradiction[] = [];
  const lines = sentences(analysableText(prompt));

  for (const { axis, values } of AXES) {
    const hits = new Map<string, { snippet: string; sentence: number }>();

    lines.forEach((sentence, index) => {
      for (const [value, pattern] of values) {
        if (!hits.has(value) && pattern.test(sentence)) {
          hits.set(value, { snippet: trimSnippet(sentence), sentence: index });
        }
      }
    });

    if (hits.size < 2) continue;

    const [first, second] = [...hits.entries()];
    if (!first || !second) continue;
    if (first[1].sentence === second[1].sentence) continue;

    found.push({
      axis,
      a: { value: first[0], snippet: first[1].snippet },
      b: { value: second[0], snippet: second[1].snippet },
    });
  }

  return found;
}

// --------------------------------------------------------------------------
// Redundant few-shot examples
// --------------------------------------------------------------------------

/**
 * Header styles that open a new example, most explicit first.
 *
 * Tiered rather than combined because they nest: a prompt using "Example 1:"
 * almost always puts "Input:"/"Output:" *inside* each example, so matching
 * both at once would cut every example in half and compare the halves. The
 * first tier that finds at least two blocks wins.
 *
 * Deliberately conservative overall: an unlabelled example is
 * indistinguishable from ordinary prose, and guessing would make the advisory
 * fire on prompts containing no examples at all.
 */
const EXAMPLE_HEADER_TIERS: readonly RegExp[] = [
  /^\s*(?:#{1,6}\s*)?(?:[-*]\s*)?(?:example|ejemplo)\s*\d*\s*[:.)]/i,
  /^\s*(?:#{1,6}\s*)?(?:[-*]\s*)?(?:input|entrada)\s*\d*\s*[:.)]/i,
  /^\s*(?:#{1,6}\s*)?(?:[-*]\s*)?(?:user|usuario|q)\s*\d*\s*[:.)]/i,
];

/**
 * A labelled field inside a few-shot example — `Input:`, `Output:`, `A:`…
 *
 * Exported because the duplicate-line rule needs it: two examples that share
 * an output line are demonstrating that two different inputs map to the *same*
 * answer, which is often the whole point of including both. Deduplicating
 * those lines leaves an example with no output at all — worse than the
 * repetition it removed.
 */
export const EXAMPLE_FIELD_LINE =
  /^\s*(?:#{1,6}\s*)?(?:[-*]\s*)?(?:input|output|entrada|salida|example|ejemplo|user|usuario|assistant|asistente|q|a|question|answer|pregunta|respuesta)\s*\d*\s*[:.)]/i;

export interface ExampleBlock {
  text: string;
  tokens: number;
}

export interface RedundantExample {
  /** Index of the earlier example that already teaches this. */
  duplicateOf: number;
  index: number;
  similarity: number;
  tokens: number;
}

export interface ExampleAnalysis {
  examples: ExampleBlock[];
  redundant: RedundantExample[];
  /** Tokens held by examples that repeat an earlier one. */
  redundantTokens: number;
}

/**
 * Similarity at which two examples are treated as repeating each other.
 *
 * Lower than the 0.92 the near-duplicate *rule* uses, because that rule
 * deletes and this only reports.
 *
 * What this threshold actually catches, measured on realistic pairs: a
 * copy-pasted example with one field changed scores ~0.89, a lightly edited
 * copy ~0.80, two genuinely different examples ~0.20. A *paraphrase* — the
 * same lesson taught in different words — scores ~0.54 and is deliberately
 * NOT caught, because it sits close enough to the distinct case that catching
 * it would mean flagging examples that teach different things.
 *
 * So this finds copy-paste accumulation, which is how few-shot blocks actually
 * grow, and not semantic redundancy. Recognising that "arrived quickly" and
 * "arrived fast" teach the same thing needs a model, not a word-set overlap;
 * that belongs to the optional LLM pass, not here.
 */
const EXAMPLE_SIMILARITY = 0.7;

/** Splits the prompt on one header style. */
function splitOnHeader(lines: readonly string[], header: RegExp): string[] {
  const blocks: string[][] = [];
  let current: string[] | null = null;
  let inFence = false;

  for (const line of lines) {
    // A header inside a fenced block is part of the example, not a new one.
    if (/^\s*(?:```|~~~)/.test(line)) inFence = !inFence;

    if (!inFence && header.test(line)) {
      current = [line];
      blocks.push(current);
      continue;
    }
    if (current) current.push(line);
  }

  return blocks.map((block) => block.join('\n').trim()).filter(Boolean);
}

/** Splits the prompt into labelled example blocks. */
export function findExamples(prompt: string, count: TokenCounter): ExampleBlock[] {
  const lines = prompt.split('\n');

  for (const header of EXAMPLE_HEADER_TIERS) {
    const blocks = splitOnHeader(lines, header);
    if (blocks.length >= 2) {
      return blocks.map((text) => ({ text, tokens: count(text) }));
    }
  }

  return [];
}

/**
 * Reports examples that repeat what an earlier example already demonstrates.
 *
 * Each example is compared against every earlier one, and blamed on the first
 * match: in a run of three near-identical examples the second and third are
 * both reported against the first, rather than chaining.
 */
export function analyzeExamples(prompt: string, count: TokenCounter): ExampleAnalysis {
  const examples = findExamples(prompt, count);
  const normalized = examples.map((e) => normalizeForCompare(e.text));
  const redundant: RedundantExample[] = [];

  for (let i = 1; i < examples.length; i++) {
    for (let j = 0; j < i; j++) {
      const similarity = jaccard(normalized[i]!, normalized[j]!);
      if (similarity >= EXAMPLE_SIMILARITY) {
        redundant.push({
          duplicateOf: j,
          index: i,
          similarity,
          tokens: examples[i]!.tokens,
        });
        break;
      }
    }
  }

  return {
    examples,
    redundant,
    redundantTokens: redundant.reduce((sum, r) => sum + r.tokens, 0),
  };
}
