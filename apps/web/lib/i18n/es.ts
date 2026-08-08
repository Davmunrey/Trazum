import type { WebMessages } from './types';

/** Spanish dictionary. Mirrors `en.ts`; see that file for the contract. */
export const es: WebMessages = {
  locale: 'es',
  numberLocale: 'es-ES',
  endonym: 'Español',

  meta: {
    title: 'Trazum — optimizador de prompts',
    tagline: 'optimizador de prompts',
    description:
      'Reduce el coste de tus llamadas a la IA: acorta el prompt sin cambiar lo que pide y ve cuánto dinero supone al mes. Código, URLs y plantillas quedan intactos.',
    ogLocale: 'es_ES',
  },

  page: {
    lede: 'Acorta el prompt sin cambiar lo que pide, y te dice cuánto dinero supone al mes. El código, las URLs y los marcadores de plantilla se quedan intactos.',
    footerLead: (pricingReviewed) =>
      `Precios revisados el ${pricingReviewed}. El recuento de tokens es una estimación (±15%); para cifras exactas usa el endpoint oficial de recuento desde la CLI con `,
    footerTail: '. Los ahorros son proyecciones sobre el escenario que indiques, no facturación.',
    localeSwitchLabel: 'Idioma',
  },

  input: {
    promptHeading: 'Prompt',
    promptAriaLabel: 'Prompt a optimizar',
    scenarioHeading: 'Escenario de uso',
    model: 'Modelo',
    ruleLevel: 'Nivel de las reglas',
    levelSafe: 'Seguro',
    levelAggressive: 'Agresivo',
    callsPerMonth: 'Llamadas al mes',
    avgOutputTokens: 'Tokens de salida medios',
    cacheHitRate: 'Acierto de caché',
    batchLabel: 'El trabajo tolera latencia (Batch API, 50% de descuento)',
    optimize: 'Optimizar',
    reorderLabel: 'Reordenar para la caché',
    reorderHint:
      'Mueve las instrucciones estables delante del primer marcador para que la caché de prompts las alcance. Esto mueve texto en vez de borrarlo: lee el diff y decide si el orden importaba.',
    optimizing: 'Optimizando…',
  },

  llm: {
    summary: 'Pasada opcional por un LLM',
    enable: 'Añadir compresión semántica con un LLM',
    endpointFormat: 'Formato del endpoint',
    formatOpenAi: 'Compatible con OpenAI (/chat/completions)',
    formatAnthropic: 'Claude API (/v1/messages)',
    baseUrl: 'URL base',
    baseUrlPlaceholder: 'https://tu-llm.ejemplo.com/v1',
    baseUrlServerDefault: 'el endpoint del propio servidor',
    suggest: 'Sugerir reescrituras frase a frase',
    suggestHint:
      'Pregunta al modelo qué frases concretas dicen algo con más palabras de las necesarias '
      + 'y las lista. Cada una se comprueba contra tu prompt antes de que la veas. No se '
      + 'cambia nada salvo que actives también «Aplicarlas».',
    applySuggestions: 'Aplicarlas',
    applySuggestionsHint:
      'Reescribe el prompt con todas las sugerencias que hayan sobrevivido. Lee el diff '
      + 'después: vienen de un modelo.',
    baseUrlNotOffered:
      'Este servidor solo llama al LLM que configuró su operador. Ejecuta Trazum tú mismo — la '
      + 'CLI, o tu propio despliegue — para apuntarlo al endpoint que quieras.',
    model: 'Modelo',
    modelPlaceholder: 'identificador del modelo',
    apiKey: 'Clave de API',
    apiKeyOnServer: 'configurada en el servidor — déjalo vacío',
    apiKeyPlaceholder: 'tu clave',
    keyNote:
      'La clave viaja a este servidor para hacer la llamada y se descarta al terminar: no se guarda ni se registra. Si prefieres no escribirla aquí, define las variables de entorno en el servidor y deja los campos vacíos.',
    safetyNote:
      'El resultado del LLM solo se acepta si es más corto y conserva intactos el código, las URLs y los marcadores de plantilla. Si no, se descarta y te quedas con la versión determinista.',
  },

  history: {
    heading: 'Historial',
    clear: 'Borrar',
    noText: '(sin texto)',
    perMonth: (amount) => `${amount}/mes`,
    restoreTitle: 'Restaurar este prompt y su escenario',
    tooLongTitle: 'Prompt demasiado largo para guardarlo; solo se conserva el resumen.',
    privacyNote: 'El historial se guarda solo en este navegador; nada sale de tu máquina.',
  },

  results: {
    empty: 'Pega tu prompt y pulsa Optimizar para ver qué sobra y cuánto cuesta.',
    heading: 'Resultado',
    inputTokens: (before, after) => `${before} → ${after} tokens de entrada`,
    perMonth: (amount) => `${amount} / mes`,
    costCaption: (before, after, model, calls) =>
      `${before} → ${after} con ${model}, ${calls} llamadas/mes`,
    promoSuffix: ' (precio de lanzamiento)',
    llmApplied: (provider, model, before, after) =>
      `Pasada por ${provider}/${model} aplicada: ${before} → ${after} tokens.`,
    llmRejected: (reason) => `Pasada por LLM descartada: ${reason}`,
    optimizedHeading: 'Prompt optimizado',
    diffHeading: 'Qué ha cambiado',
    showDiff: 'Ver diff',
    showResult: 'Ver resultado',
    copy: 'Copiar',
    copied: 'Copiado',
    diffTooLong:
      'El prompt es demasiado largo para calcular el diff en el navegador. Usa la CLI con ',
    rulesHeading: 'Reglas aplicadas',
    ruleHits: (hits, tokensSaved) => `(${hits}×, ~${tokensSaved} tokens)`,
    moreChanges: (count) => `+${count} más sin mostrar`,
    badgeSafe: 'segura',
    badgeAggressive: 'agresiva',
    advisoriesHeading: 'Además de acortar el prompt',
    advisoryPerMonth: (amount) => `~${amount}/mes`,
    reorderMoved: (blocks, tokens) =>
      `Se ${
        blocks === 1 ? 'ha movido 1 bloque' : `han movido ${blocks} bloques`
      } (~${tokens} tokens) delante del primer marcador.`,
    reorderPrefix: (before, after) => `Prefijo cacheable ${before} → ${after} tokens.`,
    reorderNothing: 'No se ha podido mover nada con seguridad.',
    reorderReview:
      'Lee el diff: esto ha movido texto en vez de borrarlo, así que la pregunta es si el orden importaba.',
    reorderDeclinedRef: (phrase, excerpt) => `hace referencia hacia atrás ("${phrase}"): ${excerpt}`,
    reorderDeclinedAfter: (excerpt) => `va después de un bloque que tenía que quedarse: ${excerpt}`,
    suggestOffered: (count, tokens) =>
      `${count} ${count === 1 ? 'frase podría decir' : 'frases podrían decir'} lo mismo con ~${tokens} tokens menos:`,
    suggestApplied: (count, tokens) =>
      `Aplicadas ${count} ${count === 1 ? 'reescritura' : 'reescrituras'} (~${tokens} tokens) — lee el diff.`,
    suggestNothing: (provider, model) =>
      `${provider} (${model}) no ha encontrado nada que reescribir que las reglas no hubieran cogido ya.`,
    suggestRejected: (count) =>
      `${count} ${count === 1 ? 'propuesta no ha superado' : 'propuestas no han superado'} la comprobación contra tu prompt.`,
    suggestRemoved: '(eliminado)',
    suggestNotApplied: 'No se ha cambiado nada. Activa «Aplicarlas» para tomarlas.',
    reorderDeclinedScript: (script) =>
      `este prompt está escrito en ${script}, y Trazum no tiene frases de referencia hacia ` +
      `atrás para ese alfabeto: no puede distinguir una instrucción que se puede mover de ` +
      `una que apunta hacia atrás, así que no ha movido nada.`,
    reorderDeclinedMore: (count) => `…y ${count} más.`,
  },

  errors: {
    requestFailed: 'No se ha podido optimizar el prompt.',
    unreachable: 'No se ha podido contactar con el servidor.',
  },

  api: {
    rateLimited: 'Demasiadas peticiones. Espera un minuto y vuelve a intentarlo.',
    invalidJson: 'El cuerpo de la petición no es JSON válido.',
    missingPrompt: 'Falta el prompt.',
    promptTooLong: (limit) => `El prompt supera el límite de ${limit} caracteres.`,
    unknownRule: (id) => `Regla desconocida: "${id}".`,
    unknownModel: (id) => `Modelo desconocido: "${id}".`,
    invalidEndpointUrl: 'La URL del endpoint no es válida.',
    endpointMustBeHttps: 'El endpoint del LLM debe usar https.',
    endpointMustBePublic: 'El endpoint del LLM no puede apuntar a una dirección interna.',
    endpointNotOffered:
      'Este servidor no llama a endpoints elegidos por quien hace la petición. Usa el LLM que '
      + 'configuró su operador, o ninguno. Para permitir elegir, define '
      + 'TRAZUM_ALLOWED_LLM_ENDPOINTS en el servidor.',
    endpointNotAllowed: (allowed: readonly string[]) =>
      `Ese endpoint no es uno de los que ofrece este servidor. Permitidos: ${allowed.join(', ')}.`,
    applyNeedsSuggest:
      '"applySuggestions" no tiene nada que aplicar sin "suggest". Por su cuenta habría '
      + 'respondido en silencio sin cambiar nada, y eso no es una respuesta.',
    llmNotConfigured:
      'Has activado la pasada por LLM pero no hay proveedor configurado. Rellena endpoint y modelo, o define TRAZUM_LLM_BASE_URL y TRAZUM_LLM_MODEL en el servidor.',
    unexpected: 'Error inesperado.',
  },
};
