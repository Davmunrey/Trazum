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

  account: {
    signIn: 'Iniciar sesión',
    signOut: 'Cerrar sesión',
    signingOut: 'Cerrando sesión…',
    ephemeral: 'sesión temporal',
    ephemeralHint:
      'Este despliegue guarda las sesiones en memoria, así que se cerrará cuando el servidor se reinicie. Define TRAZUM_DATABASE_URL para conservarlas.',
  },

  library: {
    tab: 'Biblioteca',
    lede: 'Los prompts que has guardado, y todas sus versiones. Al guardar se conserva el texto anterior: el historial es el registro de qué cambió y cuánto costó.',
    loading: 'Cargando tu biblioteca…',
    empty: 'Todavía no hay nada guardado. Escribe un prompt en la pestaña Optimizar y guárdalo aquí.',
    saveCurrent: 'Guardar el prompt actual',
    nothingToSave: 'Escribe primero un prompt en la pestaña Optimizar.',
    namePrompt: 'Nombra este prompt',
    saveVersion: 'Guardar como nueva versión',
    saved: 'Guardado como nueva versión.',
    unchanged: 'No hay cambios que guardar: el texto es idéntico a la última versión.',
    showHistory: 'Historial',
    hideHistory: 'Ocultar historial',
    restore: 'Cargar',
    delete: 'Eliminar',
    confirmDelete: (name: string) => `¿Eliminar «${name}» y todo su historial? Esto no se puede deshacer.`,
    meta: (tokens: string, versions: number, updated: string) =>
      `${tokens} tokens · ${versions} ${versions === 1 ? 'versión' : 'versiones'} · actualizado ${updated}`,
    versionLabel: (version: number) => `v${version}`,
    versionTokens: (tokens: string, when: string) => `${tokens} tokens · ${when}`,
  },

  share: {
    sharedBy: (login: string, when: string) => `Compartido por ${login} el ${when}. Cualquiera con este enlace puede leerlo.`,
    footer:
      'Las cifras se recalculan a partir de los prompts cada vez que se abre esta página, así que reflejan las reglas y precios de hoy y no una instantánea.',
    button: 'Crear enlace para compartir',
    working: 'Creando…',
    heading: 'Compartir esta comparación',
    expiryLabel: 'El enlace caduca',
    expiry7: 'en 7 días',
    expiry30: 'en 30 días',
    expiry90: 'en 90 días',
    expiryNever: 'nunca',
    warning:
      'Un enlace compartido publica ambos prompts para cualquiera que tenga la URL, sin necesidad de iniciar sesión. No compartas un prompt con secretos, datos de clientes ni nada que no pegarías en una página pública.',
    created: (url: string) => `Enlace creado: ${url}`,
    copy: 'Copiar enlace',
    copied: 'Copiado',
    revoke: 'Revocar',
    existing: 'Enlaces que has creado',
    expiresOn: (when: string) => `caduca ${when}`,
    neverExpires: 'no caduca',
    badge: 'Insignia',
    badgeHint:
      'Markdown para un README. La insignia muestra el cambio de tokens y se recalcula cada vez que se carga, así que sigue a los prompts en vez de congelar un número.',
    copyBadge: 'Copiar markdown de la insignia',
  },

  admin: {
    heading: 'Resumen del despliegue',
    lede: 'Todos los prompts guardados en este despliegue y lo que las reglas recuperarían de ellos.',
    notSpend:
      'Esto son recuentos de tokens, no gasto. Trazum nunca ha visto una factura ni una llamada a la API: lee los prompts de esta biblioteca y los mide. Lo que cuesta un prompt depende de con qué frecuencia lo llames, y eso solo lo sabes tú. Aquí no hay ninguna puntuación a propósito: cada número de esta página se puede reproducir ejecutando trazum sobre el mismo prompt.',
    loginWarning:
      'Estás en la lista de administradores por nombre de usuario de GitHub. Los nombres se pueden cambiar y, una vez liberados, los puede reclamar otra persona: usar los IDs numéricos de GitHub en TRAZUM_ADMINS mantiene el significado de la lista.',
    accounts: 'Cuentas',
    prompts: 'Prompts',
    prompt: 'Prompt',
    account: 'Cuenta',
    tokens: 'Tokens de entrada',
    recoverable: 'Recuperables',
    byAccount: 'Por cuenta',
    topHeading: 'Merecen una tarde',
    truncated: (measured: string, total: string) =>
      `Mostrando ${measured} de ${total} prompts. Los totales de arriba cubren solo esos ${measured}: este despliegue tiene más prompts de los que lee un resumen.`,
    footer:
      'Solo nombres y totales: esta página nunca muestra el texto del prompt de nadie. Los tokens recuperables se miden ejecutando las reglas, no se estiman.',
  },

  compare: {
    tab: 'Comparar',
    optimiseTab: 'Optimizar',
    lede:
      'Dos versiones del mismo prompt. Qué le hizo la edición al número de tokens, '
      + 'cuánto cuesta y qué problemas introdujo o resolvió.',
    beforeLabel: 'Antes',
    beforeHint: 'La versión que vas a sustituir.',
    afterLabel: 'Después',
    afterHint: 'La versión que propones.',
    optimizeBoth: 'Comparar lo que dejarían las reglas',
    optimizeBothHint:
      'Desactivado por defecto, a propósito. Tu edición cambió el texto tal cual está, '
      + 'y es ese texto sobre el que se te pregunta. Recortar primero los dos lados '
      + 'oculta un prompt que duplicó su longitud y resultó duplicar su cortesía.',
    submit: 'Comparar',
    working: 'Comparando…',
    convention:
      'Todas las cifras de abajo son después menos antes, así que positivo significa '
      + 'peor. Es lo contrario que en el resto de Trazum, donde toda cifra es un ahorro.',
    tokens: (before, after) => `${before} → ${after} tokens de entrada`,
    delta: (delta, pct) => `${delta} tokens (${pct})`,
    monthly: (amount, calls, model) => `${amount} al mes con ${calls} llamadas en ${model}`,
    perCall: (amount) => `${amount} por llamada`,
    unchanged: 'El número de tokens no se ha movido.',
    advisoriesAppeared: 'Problemas que introdujo esta edición',
    advisoriesResolved: 'Problemas que resolvió esta edición',
    rulesNewlyFiring: 'Reglas que ahora encuentran algo',
    rulesNoLongerFiring: 'Reglas que ya no encuentran nada',
    measuringOptimised: 'Se mide lo que dejarían las reglas, no lo que está escrito.',
    advisoryLabel: {
      'context-overflow': 'El prompt no cabe en la ventana de contexto',
      'prompt-caching': 'La caché de prompts se pagaría sola',
      'prompt-caching-not-worth-it': 'La caché de prompts costaría más de lo que ahorra',
      'below-cache-minimum': 'Demasiado corto para cachear en este modelo',
      'cache-prefix-reorder': 'Hay instrucciones estables tras el primer placeholder',
      'batch-api': 'La API por lotes aplica a esta carga',
      'model-downgrade': 'Puede bastar un modelo más barato de la misma familia',
      'output-dominated': 'El coste está en la salida, no en el prompt',
      'promo-pricing': 'El precio usado aquí es promocional',
      'contradictory-instructions': 'Dos instrucciones se contradicen',
      'redundant-examples': 'Algunos ejemplos repiten lo que ya muestran otros',
      'restated-output-format': 'El formato de salida se repite más de una vez',
      'movable-output-schema': 'El esquema de salida podría ir en la petición',
    },
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
    missingBefore: 'Falta la versión "antes".',
    missingAfter: 'Falta la versión "después".',
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
