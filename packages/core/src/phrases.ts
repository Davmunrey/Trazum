/**
 * Phrase dictionaries.
 *
 * These lists are DATA, not user interface: they are the vocabulary Trazum
 * looks for inside the prompts it optimises. Real prompts mix languages, so
 * the dictionaries deliberately cover English and Spanish at the same time and
 * a single prompt can trigger entries from both.
 *
 * Adding a language here means adding entries to these lists — it is unrelated
 * to the report language, which lives in `src/i18n/`.
 *
 * Every entry earns its place by preserving meaning. Anything whose removal
 * could change what the prompt asks for belongs in the `aggressive` level, or
 * does not belong here at all.
 */

/** Long phrases and their shorter equivalent. */
export const VERBOSE_PHRASES: ReadonlyArray<readonly [string, string]> = [
  // English
  ['in order to', 'to'],
  ['for the purpose of', 'to'],
  ['due to the fact that', 'because'],
  ['owing to the fact that', 'because'],
  ['in view of the fact that', 'because'],
  ['in the event that', 'if'],
  ['at this point in time', 'now'],
  ['at the present time', 'now'],
  ['in the near future', 'soon'],
  ['a large number of', 'many'],
  ['a great deal of', 'much'],
  ['the majority of', 'most'],
  ['make use of', 'use'],
  ['utilize', 'use'],
  ['in spite of the fact that', 'although'],
  ['despite the fact that', 'although'],
  ['with regard to', 'about'],
  ['with respect to', 'about'],
  ['in relation to', 'about'],
  ['each and every', 'every'],
  ['is able to', 'can'],
  ['are able to', 'can'],
  ['has the ability to', 'can'],
  ['have the ability to', 'can'],
  ['prior to', 'before'],
  ['subsequent to', 'after'],
  ['in a timely manner', 'promptly'],
  ['at all times', 'always'],
  ['on a regular basis', 'regularly'],
  ['a sufficient number of', 'enough'],
  ['in the process of', ''],

  // Spanish
  ['con el fin de', 'para'],
  ['con el objetivo de', 'para'],
  ['con el propósito de', 'para'],
  ['a fin de', 'para'],
  ['debido al hecho de que', 'porque'],
  ['dado el hecho de que', 'porque'],
  ['por el hecho de que', 'porque'],
  ['en el caso de que', 'si'],
  ['en caso de que', 'si'],
  ['en el momento en que', 'cuando'],
  ['una gran cantidad de', 'muchos'],
  ['un gran número de', 'muchos'],
  ['la mayor parte de', 'la mayoría de'],
  ['hacer uso de', 'usar'],
  ['llevar a cabo', 'realizar'],
  ['en relación con', 'sobre'],
  ['con respecto a', 'sobre'],
  ['a pesar de que', 'aunque'],
  ['así como también', 'y'],
  ['todos y cada uno de los', 'todos los'],
  ['cada uno de los', 'cada'],
  ['en este momento', 'ahora'],
  ['en la actualidad', 'ahora'],
  ['hoy en día', 'hoy'],
  ['de forma regular', 'regularmente'],
  ['en todo momento', 'siempre'],
  ['tiene la capacidad de', 'puede'],
  ['es capaz de', 'puede'],
  ['con anterioridad a', 'antes de'],
  ['con posterioridad a', 'después de'],
  ['un número suficiente de', 'suficientes'],
];

/** Courtesy: adds nothing for the model and costs tokens on every call. */
export const POLITENESS: readonly string[] = [
  // English
  'please',
  'thanks in advance',
  'thank you very much',
  'thank you',
  'thanks',
  'kindly',
  "if you don't mind",
  'if you would be so kind',
  'much appreciated',

  // Spanish
  'por favor',
  'muchas gracias',
  'gracias de antemano',
  'te lo agradezco',
  'te agradecería',
  'si eres tan amable',
  'si no te importa',
  'gracias',
];

/** Filler and throat-clearing with no content. */
export const FILLER: readonly string[] = [
  // English
  'basically',
  'essentially',
  'as you know',
  'as you may know',
  'it is important to note that',
  "it's important to note that",
  'it is worth noting that',
  "it's worth noting that",
  'needless to say',
  'in essence',
  'at the end of the day',
  'as a matter of fact',

  // Spanish
  'básicamente',
  'basicamente',
  'en realidad',
  'como ya sabes',
  'como sabrás',
  'cabe destacar que',
  'cabe mencionar que',
  'es importante destacar que',
  'es importante mencionar que',
  'vale la pena mencionar que',
  'por así decirlo',
  'dicho esto',
];

/** Intensifiers: they rarely change the task and almost always add tokens. */
export const INTENSIFIERS: readonly string[] = [
  // English
  'very',
  'really',
  'extremely',
  'incredibly',
  'absolutely',
  'totally',
  'quite',

  // Spanish
  'muy',
  'realmente',
  'sumamente',
  'extremadamente',
  'increíblemente',
  'absolutamente',
  'totalmente',
];

/** Hedges that weaken the instruction without adding information. */
export const HEDGES: readonly string[] = [
  // English
  'i think',
  'i believe',
  'it seems that',
  'in my opinion',
  'arguably',

  // Spanish
  'creo que',
  'me parece que',
  'diría que',
  'en mi opinión',
];

/**
 * Self-verification instructions.
 *
 * On current models these trigger over-verification: the model already checks
 * its own work, and asking explicitly fires extra steps paid for in output
 * tokens. Aggressive level because some workflows do want explicit
 * verification.
 *
 * The full forms come first on purpose: removing only the core phrase would
 * leave a dangling fragment such as "Before answering." — worse than leaving
 * the sentence alone.
 *
 * That includes whatever introduces the instruction. "You MUST double-check
 * your answer before responding" reduced to "You must." for exactly this
 * reason: the phrase matched, the subject and modal in front of it did not,
 * and what survived was a sentence that says nothing. Anything that can open
 * one of these instructions belongs in the list, ahead of the bare form.
 */
export const SELF_CHECK: readonly string[] = [
  // English — openers first, so the whole instruction goes rather than
  // leaving the subject and modal stranded in front of the removal.
  'you must double-check your answer before responding',
  'you must double check your answer before responding',
  'you should double-check your answer before responding',
  'you must verify your answer before responding',
  'you should verify your answer before responding',
  'always double-check your answer before responding',
  'always verify your answer before responding',
  'be sure to double-check your answer before responding',
  'make sure to double-check your answer before responding',
  'make sure to verify your answer before responding',
  'you must double-check your answer',
  'you should double-check your answer',
  'you must verify your answer',
  'you should verify your answer',
  'always double-check your work',
  'be sure to double-check your work',
  'make sure to check your work',

  // English — bare forms
  'double-check your answer before responding',
  'double check your answer before responding',
  'double-check your work before responding',
  'verify your answer before responding',
  'double-check your answer',
  'double check your answer',
  'double-check your work',
  'double check your work',
  'verify your answer',
  're-verify before responding',
  'check your work twice',

  // Spanish — openers first, same reason as above
  'debes verificar tu respuesta antes de contestar',
  'debes verificar tu respuesta antes de responder',
  'debes revisar tu respuesta antes de contestar',
  'siempre verifica tu respuesta antes de contestar',
  'asegúrate de verificar tu respuesta antes de contestar',
  'asegúrate de revisar tu respuesta',
  'debes verificar tu respuesta',
  'debes revisar tu respuesta',

  // Spanish — bare forms
  'verifica tu respuesta antes de contestar',
  'verifica tu respuesta antes de responder',
  'revisa tu respuesta antes de contestar',
  'revisa tu respuesta antes de responder',
  'comprueba tu trabajo antes de responder',
  'verifica tu respuesta',
  'revisa tu respuesta',
  'comprueba tu trabajo',
  'revisa dos veces',
  'vuelve a comprobarlo',
  'asegúrate de revisar tu trabajo',
];

/** Words shouted in capitals that cost fewer tokens in lowercase. */
export const SHOUTED_WORDS: readonly string[] = [
  // English
  'MUST',
  'NEVER',
  'ALWAYS',
  'CRITICAL',
  'IMPORTANT',
  'REQUIRED',
  'MANDATORY',
  'SHOULD',
  'DO NOT',

  // Spanish
  'DEBES',
  'NUNCA',
  'SIEMPRE',
  'OBLIGATORIO',
  'IMPRESCINDIBLE',
  'IMPORTANTE',
  'CRÍTICO',
];

/** Emphasis prefixes at the start of a line. */
export const EMPHASIS_PREFIXES: readonly string[] = [
  // English
  'CRITICAL',
  'IMPORTANT',
  'WARNING',
  'NOTE',

  // Spanish
  'ATENCIÓN',
  'ATENCION',
  'IMPORTANTE',
  'CRÍTICO',
  'CRITICO',
  'AVISO',
  'NOTA',
];

/**
 * Vocabulary suggesting the task needs a more capable model.
 * Multilingual for the same reason as the dictionaries above.
 */
export const COMPLEX_SIGNALS: readonly string[] = [
  // English
  'analyze',
  'reason',
  'prove',
  'design',
  'architecture',
  'refactor',
  'debug',
  'agent',
  'tool use',
  'multi-step',
  'step by step',
  'strategy',
  'investigate',
  'audit',
  'migrate',

  // Spanish
  'analiza',
  'razona',
  'demuestra',
  'diseña',
  'arquitectura',
  'refactoriza',
  'depura',
  'optimiza',
  'estrategia',
  'agente',
  'herramienta',
  'paso a paso',
  'investiga',
  'audita',
  'migra',
];

/** Vocabulary suggesting a cheaper model would do. */
export const SIMPLE_SIGNALS: readonly string[] = [
  // English
  'classify',
  'translate',
  'extract',
  'summarize',
  'label',
  'sentiment',
  'format as',
  'yes or no',
  'tag the',

  // Spanish
  'clasifica',
  'traduce',
  'extrae',
  'resume',
  'etiqueta',
  'sentimiento',
  'formatea',
  'corrige la ortografía',
  'sí o no',
];

/**
 * Phrases that refer *backwards* to something earlier in the prompt, by language.
 *
 * These are what makes reordering unsafe. "Summarise the text above" is correct
 * where it sits and nonsense if moved in front of the text it points at, so a
 * block containing one of these must stay where it is — and so must everything
 * after it, because moving a later block past a pinned one changes their order
 * relative to each other.
 *
 * Deliberately generous. A false positive costs a saving that was available; a
 * false negative silently changes what the prompt asks for, which is the one
 * thing this project will not trade for tokens.
 *
 * **Grouped by language rather than kept as one flat list, because the flat list
 * hid a hole.** It held English and Spanish and was applied to every prompt, so
 * a French, German or Japanese author ran `--reorder` with no protection at all:
 * every refusal this module is built on silently did not apply to them, and
 * "Résumez le texte ci-dessus" was hoisted above the text and reported as a
 * saving. A list per language makes the coverage a thing you can look at, and
 * lets `UNCOVERED_SCRIPTS` below refuse what is still missing rather than
 * pretending.
 *
 * Every language is matched against every prompt. Language detection would be
 * one more thing to get wrong, and the cost of checking a French prompt for
 * German phrases is a missed saving, which is the direction this module errs in
 * anyway.
 */
export interface BackwardReferenceSet {
  /**
   * Whether a match must sit on a word boundary.
   *
   * True for anything written with spaces, so "aboveboard" does not pin a block.
   * False for Japanese and Chinese, which have no word boundaries at all — the
   * boundary test asks whether the neighbouring character is a letter, and in
   * 上記のテキスト it always is, so a boundary-matched CJK phrase would never
   * fire. A list that cannot match is worse than no list: it reads like cover.
   */
  wordBoundaries: boolean;
  phrases: readonly string[];
}

export const BACKWARD_REFERENCES_BY_LANGUAGE: Readonly<Record<string, BackwardReferenceSet>> = {
  en: {
    wordBoundaries: true,
    phrases: [
      'above',
      'below',
      'the following',
      'as follows',
      'previous',
      'previously',
      'earlier',
      'aforementioned',
      'that said',
      'given this',
      'given the above',
      'based on this',
      'based on the above',
      'from the text',
      'in the text',
      'the text provided',
      'the input above',
      'the message above',
      'this input',
      'this message',
      'this text',
      'these examples',
      'the examples above',
    ],
  },

  es: {
    wordBoundaries: true,
    phrases: [
      'arriba',
      'anterior',
      'anteriormente',
      'antes',
      'a continuación',
      'lo siguiente',
      'lo anterior',
      'mencionado',
      'dicho esto',
      'segun lo anterior',
      'según lo anterior',
      'del texto',
      'en el texto',
      'el texto anterior',
      'el mensaje anterior',
      'este texto',
      'este mensaje',
      'esta entrada',
      'estos ejemplos',
    ],
  },

  fr: {
    wordBoundaries: true,
    phrases: [
      'ci-dessus',
      'ci-dessous',
      'précédent',
      'précédente',
      'précédemment',
      'susmentionné',
      'mentionné',
      'plus haut',
      'suivant',
      'ce qui suit',
      'cela dit',
      'à partir de ce',
      'du texte',
      'dans le texte',
      'le texte ci-dessus',
      'le message ci-dessus',
      'ce texte',
      'ce message',
      'cette entrée',
      'ces exemples',
    ],
  },

  de: {
    wordBoundaries: true,
    phrases: [
      'oben',
      'unten',
      'obige',
      'obigen',
      'obenstehend',
      'vorherige',
      'vorherigen',
      'vorher',
      'zuvor',
      'genannt',
      'oben genannten',
      'folgendes',
      'wie folgt',
      'aus dem text',
      'im text',
      'der obige text',
      'diese eingabe',
      'dieser text',
      'diese nachricht',
      'diese beispiele',
    ],
  },

  pt: {
    wordBoundaries: true,
    phrases: [
      'acima',
      'abaixo',
      'anterior',
      'anteriormente',
      'antes',
      'mencionado',
      'supracitado',
      'a seguir',
      'o seguinte',
      'dito isto',
      'do texto',
      'no texto',
      'o texto acima',
      'a mensagem acima',
      'este texto',
      'esta mensagem',
      'esta entrada',
      'estes exemplos',
    ],
  },

  it: {
    wordBoundaries: true,
    phrases: [
      'sopra',
      'sotto',
      'precedente',
      'precedentemente',
      'in precedenza',
      'suddetto',
      'menzionato',
      'quanto segue',
      'come segue',
      'detto questo',
      'dal testo',
      'nel testo',
      'il testo sopra',
      'il messaggio sopra',
      'questo testo',
      'questo messaggio',
      'questi esempi',
    ],
  },

  nl: {
    wordBoundaries: true,
    phrases: [
      'hierboven',
      'hieronder',
      'bovenstaande',
      'vorige',
      'eerder',
      'genoemde',
      'het volgende',
      'als volgt',
      'uit de tekst',
      'in de tekst',
      'deze tekst',
      'dit bericht',
      'deze invoer',
      'deze voorbeelden',
    ],
  },

  ja: {
    // No word boundaries: see `wordBoundaries` above.
    wordBoundaries: false,
    phrases: [
      '上記',
      '下記',
      '前述',
      '先ほど',
      '以上の',
      '上のテキスト',
      'このテキスト',
      'このメッセージ',
      'この入力',
      'これらの例',
      '次のとおり',
    ],
  },

  zh: {
    wordBoundaries: false,
    phrases: [
      '上述',
      '上面',
      '前面',
      '以上',
      '前述',
      '如下',
      '下面',
      '上文',
      '该文本',
      '这段文本',
      '这条消息',
      '这些示例',
    ],
  },
};

/**
 * Every phrase, flattened. Kept for callers that only need the words.
 */
export const BACKWARD_REFERENCES: readonly string[] = Object.values(
  BACKWARD_REFERENCES_BY_LANGUAGE,
).flatMap((set) => set.phrases);

/**
 * Scripts this module has no backward-reference phrases for.
 *
 * The point of naming them is that the alternative is what used to happen:
 * rearranging a Russian or Arabic prompt with nothing to stop it, and calling
 * the result a saving. `reorderForCache` refuses when it sees one of these,
 * which turns a silent hazard into a message somebody can act on — and into a
 * short list of pull requests, since adding a language is adding an array.
 *
 * Matched on the script, not the language: the question is not "which language
 * is this" but "is there any chance my phrase lists apply to it".
 */
export const UNCOVERED_SCRIPTS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: 'Cyrillic', pattern: /\p{Script=Cyrillic}/u },
  { name: 'Arabic', pattern: /\p{Script=Arabic}/u },
  { name: 'Hebrew', pattern: /\p{Script=Hebrew}/u },
  { name: 'Hangul', pattern: /\p{Script=Hangul}/u },
  { name: 'Devanagari', pattern: /\p{Script=Devanagari}/u },
  { name: 'Thai', pattern: /\p{Script=Thai}/u },
  { name: 'Greek', pattern: /\p{Script=Greek}/u },
];
