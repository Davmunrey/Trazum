import { segment } from './segment.js';
import { OUTPUT_CUES } from './phrases.js';
import { jaccard, normalizeForCompare } from './similarity.js';
import type { ContradictionAxisId, ContradictionValueId } from './i18n/types.js';
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
  value: ContradictionValueId;
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
  values: ReadonlyArray<readonly [value: ContradictionValueId, pattern: RegExp]>;
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
        'fixed-language',
        new RegExp(
          String.raw`\b${RESPOND}\b[^.!?\n]{0,40}?\bin\s+(?:english|spanish|french|german|italian|portuguese|ingl[ée]s|espa[nñ]ol|franc[ée]s|alem[áa]n)\b|\b${RESPOND}\b[^.!?\n]{0,40}?\ben\s+(?:ingl[ée]s|espa[nñ]ol|franc[ée]s|alem[áa]n)\b`,
          'i',
        ),
      ],
      [
        'mirror-language',
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
        'format-json',
        new RegExp(
          String.raw`\b(?:${RESPOND}|return|format|devuelve|formatea)\b[^.!?\n]{0,40}?\b(?:as|in|with|using|only|en|como)\s+(?:valid\s+|solo\s+|válido\s+)?json\b|\bonly\s+json\b|\bsolo\s+json\b`,
          'i',
        ),
      ],
      [
        'format-markdown',
        new RegExp(
          String.raw`\b(?:${RESPOND}|return|format|devuelve|formatea)\b[^.!?\n]{0,40}?\b(?:as|in|with|using|en|como)\s+markdown\b|\buse\s+markdown\b|\busa\s+markdown\b`,
          'i',
        ),
      ],
      [
        'format-plain-text',
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
        'length-brief',
        new RegExp(
          String.raw`\b(?:be\s+(?:brief|concise|succinct|terse)|keep\s+it\s+(?:short|brief)|as\s+short\s+as\s+possible|in\s+(?:one|a\s+single)\s+sentence|s[ée]\s+(?:breve|conciso)|de\s+forma\s+(?:breve|concisa)|brevemente)\b`,
          'i',
        ),
      ],
      [
        'length-detailed',
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
        'reasoning-shown',
        new RegExp(
          String.raw`\b(?:explain\s+your\s+(?:reasoning|answer|thinking)|show\s+your\s+(?:work|reasoning|thinking)|think\s+step[\s-]by[\s-]step|justify\s+your\s+answer|explica\s+tu\s+razonamiento|razona\s+paso\s+a\s+paso|justifica\s+tu\s+respuesta)\b`,
          'i',
        ),
      ],
      [
        'reasoning-hidden',
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
    const hits = new Map<ContradictionValueId, { snippet: string; sentence: number }>();

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
 * The two halves of an example label, as bounded fragments.
 *
 * Every quantifier here has an upper bound, and that is load-bearing rather
 * than tidiness. The previous form ended `\s*\d*\s*[:.)]` — three adjacent
 * unbounded quantifiers over overlapping character classes. On a line like
 * `example` followed by 40 000 spaces and no terminator, the engine has to try
 * every way of splitting that whitespace between the two `\s*` groups before
 * it can fail: measured O(n²), 651 ms at 40 000 spaces, roughly a minute at
 * the API's 400 KB cap — a denial of service in one request.
 *
 * Bounding turns the split count into a constant. A label reading
 * `Example 12:` never needs more than a few spaces or six digits, so nothing
 * real is lost.
 *
 * `[ \t]` rather than `\s` because these are matched per line, where `\s`
 * matching newlines is wrong anyway.
 */
const LABEL_PREFIX = String.raw`^[ \t]{0,16}(?:#{1,6}[ \t]{0,4})?(?:[-*][ \t]{0,4})?`;
const LABEL_SUFFIX = String.raw`[ \t]{0,4}\d{0,6}[ \t]{0,4}[:.)]`;

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
/**
 * The label on the side that **asks**, in the wordings prompts actually use.
 *
 * **This list was three entries long and it made six analyses blind.** A
 * support prompt labelled `Customer:` / `Agent:` — the single most common
 * shape there is — found zero examples, so `prune` had nothing to cut,
 * `profile` reported the examples as costing nothing, and the redundant-example
 * advisory never fired. Measured across fourteen labellings real prompts use,
 * nine found nothing: `Customer`, `Human`, `Question`, `Client`, `Prompt`,
 * `Query`, `Cliente`, `Pregunta`, `REQUEST`. `Human:` is Anthropic's own
 * historical convention and `Q:` worked while `Question:` did not, which is
 * the arbitrariness that gives the fault away.
 *
 * The failure was silent, which is what made it survive: an unrecognised label
 * produces no examples, and no examples produces no finding — the same shape
 * as a gate that passes because it is checking nothing.
 *
 * Only openers belong here. `Answer:` and `Assistant:` close a turn, and
 * splitting on those would cut every example between its question and its
 * answer and then compare the halves.
 */
const ASKER_LABELS = [
  'user',
  'usuario',
  'human',
  'humano',
  'customer',
  'cliente',
  'client',
  'q',
  'question',
  'pregunta',
  'query',
  'consulta',
  'request',
  'petición',
  'peticion',
  'prompt',
] as const;

/**
 * The label on the side that **answers**.
 *
 * Never a tier: these appear inside an example rather than opening one. They
 * are here so `EXAMPLE_FIELD_LINE` can be built from the same two lists the
 * splitter uses, which is what stops the pair drifting apart again — the field
 * detector already knew `question` and `answer` while the splitter did not,
 * and that disagreement is precisely how `Q:` came to work and `Question:` not.
 */
const ANSWERER_LABELS = [
  'assistant',
  'asistente',
  'a',
  'answer',
  'respuesta',
  'output',
  'salida',
  'response',
  'reply',
  'agent',
  'agente',
  'support',
  'soporte',
  'bot',
  'result',
  'resultado',
] as const;

/** Labels that name an example as a whole, rather than one side of it. */
const BLOCK_LABELS = ['example', 'ejemplo', 'input', 'entrada'] as const;

const anyOf = (labels: readonly string[]) => labels.join('|');

const EXAMPLE_HEADER_TIERS: readonly RegExp[] = [
  new RegExp(`${LABEL_PREFIX}(?:example|ejemplo)${LABEL_SUFFIX}`, 'i'),
  new RegExp(`${LABEL_PREFIX}(?:input|entrada)${LABEL_SUFFIX}`, 'i'),
  new RegExp(`${LABEL_PREFIX}(?:${anyOf(ASKER_LABELS)})${LABEL_SUFFIX}`, 'i'),
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
export const EXAMPLE_FIELD_LINE = new RegExp(
  `${LABEL_PREFIX}(?:${anyOf([...BLOCK_LABELS, ...ASKER_LABELS, ...ANSWERER_LABELS])})${LABEL_SUFFIX}`,
  'i',
);

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
/**
 * How alike two examples must be before one is called redundant.
 *
 * **Do not lower this hoping to catch paraphrases: it was measured and it does
 * not work.** Four support examples whose answers were *"Let me look that up
 * for you. Could you share your order number?"*, *"I can check that for you.
 * What's your order number?"*, *"Happy to help. May I have your order
 * number?"* and *"Of course. What is your order number?"* are one example
 * wearing four coats — any reader says so instantly. Their word overlap is
 * 0.29–0.43, and comparing only the answers makes it **worse**, 0.21–0.39,
 * because the shared content is three words (`your`, `order`, `number`) while
 * the openers are all different. There is no threshold that separates those
 * from genuinely different examples: at 0.4 this fires on every prompt whose
 * examples share a domain vocabulary.
 *
 * That similarity is a semantic judgement, and this repository has a place for
 * those — `trazum semantic`, which says what it costs and asks first. What
 * word overlap can honestly find is a paragraph somebody pasted twice and
 * edited lightly, which is what 0.7 is for.
 *
 * So the deterministic half reports **what the examples cost**, which is a
 * fact, and leaves *whether one should go* to `prune`, which answers it by
 * running the cases rather than by counting words.
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

  return blocks.map((block) => trimToExample(block.join('\n'))).filter(Boolean);
}

/**
 * Cuts a block off where the example stops and ordinary prose resumes.
 *
 * Without this the final example runs to the end of the prompt and absorbs
 * every instruction that follows it, which inflates its length and drags its
 * similarity to the others below any sensible threshold — so the one block
 * most likely to be a duplicate is the one that never gets reported.
 *
 * A paragraph belongs to the example while it still contains a labelled field;
 * the first that does not ends the block.
 */
function trimToExample(block: string): string {
  const paragraphs = block.split(/\n\s*\n/);
  const kept = [paragraphs[0] ?? ''];

  for (const paragraph of paragraphs.slice(1)) {
    const isExampleContent = paragraph
      .split('\n')
      .some((line) => EXAMPLE_FIELD_LINE.test(line));
    if (!isExampleContent) break;
    kept.push(paragraph);
  }

  return kept.join('\n\n').trim();
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

// --------------------------------------------------------------------------
// Output formats stated twice
// --------------------------------------------------------------------------

/**
 * A prompt that shows its output schema in a code block, and then describes
 * the same fields again in prose, is paying for the schema twice.
 *
 * The block is the version that survives: it is unambiguous, and the
 * protection pass already guarantees Trazum will not touch it. The prose
 * restatement is what can go — but only a human can tell a restatement from a
 * clarification that happens to name the same fields, so this reports and does
 * not cut.
 */
export interface RestatedFormat {
  /** Top-level keys found in the fenced schema. */
  keys: string[];
  /** Those keys that are also named in the prose outside the block. */
  restatedKeys: string[];
  /** Tokens held by the prose sentences that restate them. */
  restatedTokens: number;
}

/** Fenced blocks, with their info string. */
function fencedBlocks(prompt: string): Array<{ lang: string; body: string }> {
  const blocks: Array<{ lang: string; body: string }> = [];
  const fence = /^([ \t]{0,3})(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)^\1\2[ \t]*$/gm;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(prompt)) !== null) {
    blocks.push({ lang: (match[3] ?? '').trim().toLowerCase(), body: match[4] ?? '' });
  }
  return blocks;
}

/**
 * Top-level keys of a JSON-ish block.
 *
 * Deliberately a scan rather than `JSON.parse`: schemas in prompts are
 * routinely illustrative — trailing commas, `...`, comments, a placeholder
 * where a value goes — and refusing to read those would skip exactly the
 * prompts worth checking. Only keys at nesting depth 1 count, so a nested
 * field name cannot be mistaken for a top-level one.
 */
function topLevelKeys(body: string): string[] {
  const keys: string[] = [];
  let depth = 0;
  let inString = false;
  let quote = '';
  let current = '';

  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;

    if (inString) {
      if (ch === '\\') {
        current += body[i + 1] ?? '';
        i++;
        continue;
      }
      if (ch === quote) {
        inString = false;
        // A string is a key only when the next non-space character is a colon.
        const rest = body.slice(i + 1);
        const colon = /^\s*:/.test(rest);
        if (colon && depth === 1 && current) keys.push(current);
        current = '';
        continue;
      }
      current += ch;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      current = '';
      continue;
    }
    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') depth--;
  }

  return [...new Set(keys)];
}

/** Minimum keys that must be restated before this is worth reporting. */
const RESTATED_KEY_MINIMUM = 3;

/**
 * Finds an output schema that the prose repeats.
 *
 * The threshold is deliberately blunt: naming one or two fields in prose is
 * ordinary ("set `escalate` to true when the customer asks for a human"), and
 * flagging that would make the advisory noise. Three or more, and the prose is
 * walking the schema.
 */
export function findRestatedFormat(prompt: string, count: TokenCounter): RestatedFormat | null {
  const blocks = fencedBlocks(prompt);
  const keys = [
    ...new Set(
      blocks
        .filter((b) => b.lang === '' || /json|jsonc|json5|yaml|yml/.test(b.lang))
        .flatMap((b) => topLevelKeys(b.body)),
    ),
  ].filter((k) => k.length >= 3);

  if (keys.length < RESTATED_KEY_MINIMUM) return null;

  // Prose only: the schema naming its own keys is not a restatement.
  const prose = analysableText(prompt);
  const proseSentences = sentences(prose);

  const restatedKeys = new Set<string>();
  const guiltySentences = new Set<number>();

  proseSentences.forEach((sentence, index) => {
    for (const key of keys) {
      // Word boundary that also survives snake_case and kebab-case names.
      const pattern = new RegExp(`(?<![\\p{L}\\p{N}_-])${escapeRegExp(key)}(?![\\p{L}\\p{N}_-])`, 'iu');
      if (pattern.test(sentence)) {
        restatedKeys.add(key);
        guiltySentences.add(index);
      }
    }
  });

  if (restatedKeys.size < RESTATED_KEY_MINIMUM) return null;

  const restatedTokens = count([...guiltySentences].map((i) => proseSentences[i]).join(' '));

  return {
    keys,
    restatedKeys: [...restatedKeys],
    restatedTokens,
  };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --------------------------------------------------------------------------
// An output schema the API could carry instead of the prompt
// --------------------------------------------------------------------------

/**
 * A schema shown in the prompt that the request could carry as a parameter.
 *
 * Every provider worth naming now accepts a response schema alongside the
 * message — `output_config.format`, `response_format`, `responseSchema`,
 * whatever it is called this quarter. A prompt that spells the same shape out in
 * a fenced block pays for it in input tokens on **every call**, and gets a
 * weaker guarantee for the money: prose asks the model to comply, a parameter
 * makes the decoder comply.
 *
 * So this is the rare finding that is not a trade-off. Moving a schema out is
 * cheaper *and* stricter. What stops it being a rule is that Trazum cannot make
 * the change: it edits prompts, and this is a change to the call around the
 * prompt. It reports, names the tokens, and leaves the edit to whoever owns the
 * client code.
 *
 * **The one way this could do harm, and what prevents it.** A fenced JSON block
 * in a prompt is one of two completely different things. `Output format: {...}`
 * is a contract and moving it is free. `Input: {...}` inside a few-shot example
 * is *data the prompt needs*, and moving it breaks the prompt. Nothing here
 * guesses which: a block counts only when a phrase from `OUTPUT_CUES_BY_LANGUAGE`
 * appears in the text immediately before it. A schema with no such phrase is
 * left alone, and a prompt in a language those dictionaries do not cover raises
 * nothing at all — a false negative, stated as one, rather than an English cue
 * matched inside Japanese prose and called a saving.
 */
export interface MovableSchema {
  /** Fenced blocks that an output cue introduces. */
  blocks: number;
  /** Top-level keys across all of them, deduplicated. */
  keys: string[];
  /** Tokens the blocks hold, fences included, since all of it leaves the prompt. */
  tokens: number;
  /** The cue that identified the first block, so the report can quote it. */
  cue: string;
}

/** How far back to look for a cue introducing a block. */
const CUE_WINDOW = 240;

/** Fenced blocks with their offset, needed to read what precedes them. */
function fencedBlocksAt(prompt: string): Array<{ lang: string; body: string; at: number; raw: string }> {
  const blocks: Array<{ lang: string; body: string; at: number; raw: string }> = [];
  const fence = /^([ \t]{0,3})(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)^\1\2[ \t]*$/gm;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(prompt)) !== null) {
    blocks.push({
      lang: (match[3] ?? '').trim().toLowerCase(),
      body: match[4] ?? '',
      at: match.index,
      raw: match[0],
    });
  }
  return blocks;
}

export function findMovableSchema(prompt: string, count: TokenCounter): MovableSchema | null {
  const cued: Array<{ raw: string; keys: string[]; cue: string }> = [];

  for (const block of fencedBlocksAt(prompt)) {
    // Explicitly JSON-ish, or unlabelled but structured enough to be a shape.
    // A labelled `python` block is somebody's code and never an output contract.
    const jsonish = /^(json|jsonc|json5)$/.test(block.lang) || block.lang === '';
    if (!jsonish) continue;

    /**
     * No minimum key *length* here, unlike the restated-format detector.
     * That filter exists there to stop a two-letter key matching a word in
     * prose; nothing is matched against prose here, so all it would do is
     * undercount schemas whose fields are called `id` or `ok`. It was copied
     * across in the first draft and a mutation run found it: deleting it changed
     * no test, which is what a line with no reason looks like.
     */
    const keys = topLevelKeys(block.body);
    // Fewer than three keys is an illustration, not a contract worth moving —
    // the same threshold the restated-format advisory uses, for the same reason.
    if (keys.length < RESTATED_KEY_MINIMUM) continue;

    /**
     * The window before the fence, normalised the way every other comparison in
     * this package normalises: case folded, accents stripped, punctuation
     * flattened. `Formato de salida:` and `FORMATO DE SALIDA —` are the same cue,
     * and a dictionary that only matched one of them would cover Spanish on
     * paper.
     */
    const lead = normalizeForCompare(prompt.slice(Math.max(0, block.at - CUE_WINDOW), block.at));
    const cue = OUTPUT_CUES.find((phrase) => lead.includes(normalizeForCompare(phrase)));
    if (cue === undefined) continue;

    cued.push({ raw: block.raw, keys, cue });
  }

  if (cued.length === 0) return null;

  return {
    blocks: cued.length,
    keys: [...new Set(cued.flatMap((block) => block.keys))],
    tokens: count(cued.map((block) => block.raw).join('\n\n')),
    cue: cued[0]?.cue ?? '',
  };
}
