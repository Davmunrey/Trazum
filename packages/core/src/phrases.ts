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
 */
export const SELF_CHECK: readonly string[] = [
  // English — full forms first
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

  // Spanish — full forms first
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
