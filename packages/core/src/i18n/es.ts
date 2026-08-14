import type { CoreMessages } from './types.js';

const n = (value: number): string => value.toLocaleString('es-ES');

/** Spanish catalogue. Mirrors `en.ts`, which is the source of truth. */
export const es: CoreMessages = {
  locale: 'es',
  numberLocale: 'es-ES',

  rules: {
    'duplicate-blocks': {
      title: 'Párrafos repetidos',
      rationale:
        'Elimina párrafos enteros que ya aparecen antes en el prompt. Es habitual al montar prompts por concatenación de plantillas: el mismo bloque de instrucciones entra dos veces y se paga dos veces.',
    },
    'near-duplicate-blocks': {
      title: 'Párrafos casi idénticos',
      rationale:
        'Elimina párrafos con un 92% o más de palabras en común con otro anterior. Detecta instrucciones reformuladas que dicen lo mismo dos veces. Nivel agresivo: revisa el diff, porque el 8% que difiere puede ser justo el matiz que te importa.',
    },
    'duplicate-lines': {
      title: 'Líneas repetidas',
      rationale:
        'Elimina líneas que ya aparecen idénticas antes en el prompt, ignorando mayúsculas, acentos y puntuación. Solo actúa sobre líneas de 25 caracteres o más, para no tocar viñetas ni separadores legítimos.',
    },
    'verbose-phrases': {
      title: 'Perífrasis largas',
      rationale:
        'Sustituye construcciones largas por su equivalente corto ("con el fin de" → "para", "in order to" → "to"). El significado es idéntico; solo cambia el número de tokens.',
    },
    politeness: {
      title: 'Fórmulas de cortesía',
      rationale:
        'Quita "por favor", "gracias", "please", "kindly"... El modelo no responde mejor por pedírselo con cortesía, y cada fórmula se paga en todas las llamadas.',
    },
    filler: {
      title: 'Muletillas y rodeos',
      rationale:
        'Elimina arranques vacíos como "básicamente", "cabe destacar que" o "it is important to note that", que no aportan instrucción.',
    },
    hedges: {
      title: 'Coletillas de duda',
      rationale:
        'Elimina "creo que", "I think", "en mi opinión". En una instrucción debilitan la orden sin añadir información.',
    },
    intensifiers: {
      title: 'Intensificadores',
      rationale:
        'Quita "muy", "realmente", "extremely"... Rara vez cambian la tarea. Nivel agresivo porque en algún prompt concreto el matiz sí importa.',
    },
    'self-check': {
      title: 'Instrucciones de auto-verificación',
      rationale:
        'Quita "verifica tu respuesta", "double-check your work". Los modelos actuales ya verifican su trabajo; pedirlo explícitamente dispara pasos extra que se pagan en tokens de salida. Desactívala si tu flujo depende de esa verificación.',
    },
    emphasis: {
      title: 'Énfasis en mayúsculas',
      rationale:
        'Pasa a minúscula palabras gritadas (MUST, NUNCA, CRITICAL) y quita prefijos tipo "IMPORTANTE:". Las mayúsculas se parten en más tokens que las minúsculas, y en los modelos actuales el énfasis excesivo hace que la instrucción se dispare de más.',
    },
    decoration: {
      title: 'Separadores decorativos',
      rationale:
        'Elimina líneas hechas solo de caracteres repetidos (====, ----, ****) y las secuencias de signos de exclamación. No aportan estructura que el modelo aproveche y cuestan tokens en cada llamada.',
    },
    whitespace: {
      title: 'Espacios y líneas en blanco sobrantes',
      rationale:
        'Quita espacios al final de línea, colapsa espacios repetidos dentro de la línea y reduce las líneas en blanco consecutivas a una. Respeta la sangría inicial para no romper listas ni markdown anidado.',
    },
  },

  llm: {
    emptyResponse: () => 'El modelo devolvió una respuesta vacía.',
    protectedContentAltered: (count) =>
      `El modelo alteró ${count} fragmento(s) protegido(s) (código, URL o marcador de plantilla). Descartado para no romper el prompt.`,
    notShorter: (after, before) =>
      `El resultado no es más corto (${after} vs ${before} tokens). Se mantiene la versión determinista.`,
    suspiciousShrink: (retainedPct) =>
      `El resultado conserva solo el ${retainedPct}% de los tokens. Eso parece un resumen, no una compresión: revísalo a mano antes de usarlo.`,
  },

  suggest: {
    'not-found': () =>
      'la frase citada no está en el prompt — el modelo parafraseó lo que estaba copiando',
    'touches-protected': () =>
      'editaría código, una URL, un marcador o una etiqueta, que se copian literalmente',
    'introduces-protected': () => 'el reemplazo añade un marcador o una URL que no estaba',
    'no-saving': () => 'no es más corto que lo que reemplaza',
    overlaps: () => 'comparte texto con una sugerencia ya aceptada',
  },

  advisories: {
    contextOverflow: ({ tokens, modelName, contextWindow }) => ({
      title: 'El prompt no cabe en la ventana de contexto',
      detail: `El prompt optimizado ocupa ~${n(tokens)} tokens y ${modelName} admite ${n(contextWindow)}. La llamada fallará: divide el contenido o cambia a un modelo con ventana mayor.`,
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
        ? `El prefijo estable —lo anterior al primer marcador ${placeholder}— son ~${n(prefixTokens)} de los ${n(totalTokens)} tokens del prompt, y supera el mínimo cacheable de ${n(minTokens)} de ${modelName}.`
        : `El prompt no tiene marcadores variables, así que el prefijo cacheable es entero y supera el mínimo de ${n(minTokens)} tokens de ${modelName}.`;
      const how = explicit
        ? 'Coloca el marcador de caché al final del prefijo estable: cualquier byte que cambie antes del corte invalida todo lo que va detrás.'
        : `${modelName} cachea automáticamente por encima de su mínimo, así que no hay nada que activar; pero la regla es la misma: cualquier byte que cambie antes del corte invalida todo lo que va detrás.`;
      const hedge = nearMinimum
        ? ` Un aviso sobre la cifra: ese recuento del prefijo es una estimación y está cerca del límite, así que el real puede quedar por debajo del mínimo de ${n(minTokens)} tokens —y entonces no se cachea nada y este ahorro no existe. Confírmalo con --exact-tokens antes de presupuestar sobre él. El endpoint de conteo es gratis.`
        : '';
      return {
        title: 'Activa prompt caching en el prefijo estable',
        detail: `${scope} Con una tasa de acierto del ${hitRatePct}%, la lectura de caché cuesta un ${readPct}% del precio de entrada y la escritura un ${writePct}%. ${how}${hedge}`,
      };
    },

    promptCachingNotWorthIt: () => ({
      title: 'Con esa tasa de acierto, la caché no compensa',
      detail:
        'Escribir en caché cuesta un 125% del precio de entrada y leer un 10%. Por debajo de un ~28% de aciertos pagas más de lo que ahorras. Sube la reutilización del prefijo o deja la caché desactivada.',
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
        ? `aquí el primer marcador variable (${placeholder}) aparece a los ~${n(prefixTokens)} tokens y solo lo anterior puede cachearse`
        : `este prompt tiene ~${n(totalTokens)}`;
      return {
        title: 'Por debajo del mínimo cacheable',
        detail:
          `${modelName} necesita al menos ${n(minTokens)} tokens de prefijo para cachear; ${reason}. Marcar cache_control no dará error, simplemente no cacheará.` +
          (mentionLowerMinimum
            ? ' Claude Opus 5 baja ese mínimo a 512 tokens, así que prompts cortos que aquí no cachean, allí sí.'
            : '') +
          (couldReachMinimum
            ? ' Ese recuento del prefijo es una estimación y está cerca del límite, así que el real puede estar ya por encima: compruébalo con --exact-tokens antes de dar esto por perdido. El endpoint de conteo es gratis.'
            : ''),
      };
    },

    cachePrefixReorder: ({ staticTokensAfter, sharePct, placeholder, command }) => ({
      title: 'Mueve las instrucciones estables antes del primer marcador',
      detail: `Unos ~${n(staticTokensAfter)} tokens de contenido estable (el ${sharePct}% del prompt) están después del primer marcador variable ${placeholder}, así que hoy no se cachean nunca. Instrucciones y contexto fijos primero, marcadores al final, y ese contenido empieza a leerse de caché al 10% del precio. Ejecuta \`${command}\` para intentarlo: solo mueve bloques completos y se niega a mover cualquiera que se refiera a texto anterior. Lee el diff —el orden significa algo, y «resume el texto de arriba» no tiene sentido delante del texto al que apunta.`,
    }),

    batchApi: () => ({
      title: 'Si el trabajo tolera latencia, usa la Batch API',
      detail:
        'La Batch API aplica un 50% de descuento sobre entrada y salida. La mayoría de lotes terminan en menos de una hora, con un máximo de 24. Sirve para clasificación masiva, enriquecimiento de datos o evaluaciones: cualquier cosa que no responda a un usuario en tiempo real.',
    }),

    modelDowngrade: ({ modelName, tier, candidateName, currentUsd, candidateUsd }) => ({
      title: `Esta tarea quizá no necesite ${modelName}`,
      detail: `Por longitud y vocabulario, el prompt parece de complejidad "${tier}". Con ${candidateName} pasarías de ${currentUsd} a ${candidateUsd} al mes. Es una heurística por palabras clave, no un juicio de calidad: mide la diferencia con tus propias evaluaciones antes de cambiar en producción.`,
    }),

    outputDominated: ({ outputUsd, inputUsd }) => ({
      title: 'Tu coste está en la salida, no en el prompt',
      detail: `La salida supone ${outputUsd} al mes frente a ${inputUsd} de entrada. Acortar el prompt tiene un techo bajo aquí. Los dos controles que mueven la aguja son el parámetro effort (bájalo si la tarea no es intensiva en razonamiento) y pedir respuestas concisas de forma explícita.`,
    }),

    promoPricing: ({ modelName, promoInput, promoOutput, until, listInput, listOutput }) => ({
      title: 'Estás calculando con precio promocional',
      detail: `${modelName} tiene precio de lanzamiento ${promoInput}/${promoOutput} por millón de tokens hasta el ${until}. A partir de esa fecha pasa a ${listInput}/${listOutput}: tu factura subirá aunque no cambies nada.`,
    }),

    contradictoryInstructions: ({
      axis,
      firstValue,
      firstSnippet,
      secondValue,
      secondSnippet,
      otherCount,
    }) => ({
      title: `Dos instrucciones se contradicen sobre ${axis}`,
      detail:
        `Una dice ${firstValue} ("${firstSnippet}") y otra dice ${secondValue} ("${secondSnippet}"). ` +
        'El modelo tiene que elegir una, y cuál elige puede cambiar entre llamadas: esto es un problema de corrección antes que de coste. ' +
        'Borrar la instrucción que no querías además acorta el prompt.' +
        (otherCount > 0
          ? ` Hay ${otherCount} ${otherCount === 1 ? 'pareja más' : 'parejas más'} de instrucciones que se contradicen.`
          : ''),
    }),

    redundantExamples: ({ redundantCount, totalCount, redundantTokens, topSimilarityPct }) => ({
      title: `${redundantCount} de ${totalCount} ejemplos repiten uno anterior`,
      detail:
        `Comparten el ${topSimilarityPct}% o más de su redacción con un ejemplo previo y suponen unos ${n(redundantTokens)} tokens que pagas en cada llamada. ` +
        'Un ejemplo few-shot se paga a sí mismo enseñando algo nuevo; dos que demuestran el mismo patrón lo enseñan una vez. ' +
        'Léelos antes de borrar: un ejemplo que parece redundante puede estar mostrando un caso límite a propósito.',
    }),

    movableSchema: ({ blocks, tokens, keyList, cue }) => ({
      title: 'El esquema de salida podría ir en la petición y no en el prompt',
      detail:
        `${blocks === 1 ? 'Un bloque de esquema' : `${blocks} bloques de esquema`} introducido por "${cue}" define ${keyList}, y cuesta unos ${n(tokens)} tokens en cada llamada. ` +
        'Toda API relevante acepta ya un esquema de respuesta como parámetro de la petición — output_config.format, response_format, responseSchema — y moverlo allí es el cambio raro que sale más barato y además más estricto: la prosa le pide al modelo que cumpla, un parámetro obliga al decodificador. ' +
        'Trazum no puede hacer esta edición, porque cambia la llamada y no el prompt, y no comprueba si tu proveedor ofrece el parámetro — si no lo ofrece, esto no está disponible para ti.',
    }),

    restatedOutputFormat: ({ restatedCount, totalCount, restatedTokens, keyList }) => ({
      title: 'El formato de salida está especificado dos veces',
      detail:
        `La prosa describe ${restatedCount} de los ${totalCount} campos que tu esquema ya define (${keyList}), y cuesta unos ${n(restatedTokens)} tokens en cada llamada. ` +
        'El bloque de código es la versión que merece la pena conservar: no es ambiguo y Trazum nunca lo toca. ' +
        'Comprueba que ambos dicen lo mismo antes de borrar ninguno: cuando un prompt dice una cosa en prosa y otra en el esquema, lo que suele haberse quedado obsoleto es la prosa.',
    }),
  },

  contradictionAxes: {
    'response-language': 'el idioma de la respuesta',
    'output-format': 'el formato de salida',
    'response-length': 'la longitud de la respuesta',
    'reasoning-visibility': 'si mostrar el razonamiento',
  },

  contradictionValues: {
    'fixed-language': 'siempre el mismo idioma',
    'mirror-language': 'el idioma de quien escribe',
    'format-json': 'JSON',
    'format-markdown': 'Markdown',
    'format-plain-text': 'texto plano',
    'length-brief': 'que sea breve',
    'length-detailed': 'que entre en detalle',
    'reasoning-shown': 'mostrar el razonamiento',
    'reasoning-hidden': 'ocultar el razonamiento',
  },
};
