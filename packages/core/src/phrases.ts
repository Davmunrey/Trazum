/**
 * Diccionarios de frases. Español e inglés, porque los prompts reales mezclan
 * los dos. Cada entrada se ha elegido porque la sustitución conserva el
 * significado; si una sustitución puede cambiar lo que pide el prompt, va en
 * nivel `aggressive` o directamente no está.
 */

/** Frases largas y su equivalente corto. */
export const VERBOSE_PHRASES: ReadonlyArray<readonly [string, string]> = [
  // Español
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

  // Inglés
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
];

/** Cortesía: no aporta nada al modelo y ocupa tokens en cada llamada. */
export const POLITENESS: readonly string[] = [
  'por favor',
  'muchas gracias',
  'gracias de antemano',
  'te lo agradezco',
  'te agradecería',
  'si eres tan amable',
  'si no te importa',
  'gracias',
  'please',
  'thanks in advance',
  'thank you very much',
  'thank you',
  'thanks',
  'kindly',
  "if you don't mind",
  'if you would be so kind',
  'much appreciated',
];

/** Muletillas y rodeos sin contenido. */
export const FILLER: readonly string[] = [
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
];

/** Intensificadores: rara vez cambian la tarea, casi siempre suman tokens. */
export const INTENSIFIERS: readonly string[] = [
  'muy',
  'realmente',
  'sumamente',
  'extremadamente',
  'increíblemente',
  'absolutamente',
  'totalmente',
  'very',
  'really',
  'extremely',
  'incredibly',
  'absolutely',
  'totally',
  'quite',
];

/** Coletillas de duda que debilitan la instrucción sin aportar información. */
export const HEDGES: readonly string[] = [
  'creo que',
  'me parece que',
  'diría que',
  'en mi opinión',
  'i think',
  'i believe',
  'it seems that',
  'in my opinion',
  'arguably',
];

/**
 * Instrucciones de auto-verificación.
 *
 * En los modelos actuales estas frases provocan verificación de más: el modelo
 * ya verifica su trabajo por defecto, y pedírselo explícitamente dispara pasos
 * extra que se pagan en tokens de salida. Nivel `aggressive` porque en algunos
 * flujos la verificación explícita sí se quiere.
 */
export const SELF_CHECK: readonly string[] = [
  // Formas completas primero: si solo se quita el núcleo, queda un fragmento
  // suelto del tipo "Antes de contestar." que es peor que no tocar nada.
  'verifica tu respuesta antes de contestar',
  'verifica tu respuesta antes de responder',
  'revisa tu respuesta antes de contestar',
  'revisa tu respuesta antes de responder',
  'comprueba tu trabajo antes de responder',
  'double-check your answer before responding',
  'double check your answer before responding',
  'double-check your work before responding',
  'verify your answer before responding',
  'verifica tu respuesta',
  'revisa tu respuesta',
  'comprueba tu trabajo',
  'revisa dos veces',
  'vuelve a comprobarlo',
  'asegúrate de revisar tu trabajo',
  'double-check your answer',
  'double check your answer',
  'double-check your work',
  'double check your work',
  'verify your answer',
  're-verify before responding',
  'check your work twice',
];

/** Palabras que se gritan en mayúsculas y que en minúscula cuestan menos tokens. */
export const SHOUTED_WORDS: readonly string[] = [
  'MUST',
  'NEVER',
  'ALWAYS',
  'CRITICAL',
  'IMPORTANT',
  'REQUIRED',
  'MANDATORY',
  'SHOULD',
  'DO NOT',
  'DEBES',
  'NUNCA',
  'SIEMPRE',
  'OBLIGATORIO',
  'IMPRESCINDIBLE',
  'IMPORTANTE',
  'CRÍTICO',
];

/** Prefijos de énfasis al principio de línea. */
export const EMPHASIS_PREFIXES: readonly string[] = [
  'CRITICAL',
  'IMPORTANT',
  'WARNING',
  'NOTE',
  'ATENCIÓN',
  'ATENCION',
  'IMPORTANTE',
  'CRÍTICO',
  'CRITICO',
  'AVISO',
  'NOTA',
];
