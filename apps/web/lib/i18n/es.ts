import type { WebMessages } from './types';

/** Spanish dictionary. Mirrors `en.ts`; see that file for the contract. */
export const es: WebMessages = {
  locale: 'es',
  numberLocale: 'es-ES',
  endonym: 'Español',

  meta: {
    title: 'Trazum — a dónde va el gasto de tus prompts',
    tagline: 'analizador de coste de prompts',
    description:
      'Reduce el coste de tus llamadas a la IA: acorta el prompt sin cambiar lo que pide y ve cuánto dinero supone al mes. O lee tu registro de uso — por completo en el navegador, sin subir nada — y ve adónde fue el dinero de verdad.',
    ogLocale: 'es_ES',
  },

  page: {
    lede: 'Calcula todo lo que hace que este prompt cueste más de lo necesario —el caching, la gama de modelo, la Batch API— y acorta el texto sin cambiar lo que pide. El código, las URLs y los marcadores de plantilla se quedan intactos. La pestaña Tu factura lee en cambio un registro de uso, por completo en este navegador, y dice adónde fue el dinero de verdad.',
    footerLead: (pricingReviewed) =>
      `Precios revisados el ${pricingReviewed}. El recuento de tokens es una estimación (±10%); para cifras exactas usa el endpoint oficial de recuento desde la CLI con `,
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
      'context-near-limit': 'El prompt puede no caber en la ventana de contexto',
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

  bill: {
    tab: 'Tu factura',
    lede:
      'Lee un registro de uso — un objeto JSON por línea, cada uno con un "model" y el objeto '
      + '"usage" que devolvió la API — y dice adónde fue el dinero: qué carga de trabajo, qué '
      + 'modelo, si la caché se pagó sola y qué palancas moverían la factura de verdad.',
    privacy:
      'El registro se lee por completo en esta pestaña del navegador. No se sube, no se guarda '
      + 'ni se envía a ninguna parte: cierra la página y desaparece.',
    dropLabel: 'Suelta aquí un registro de uso',
    chooseFile: 'Elegir un archivo',
    orPaste: 'o pega el registro debajo',
    pasteAriaLabel: 'Registro de uso a analizar',
    analyze: 'Leer la factura',
    recipe:
      'Registrar el log son tres líneas en tu propio código: tras cada llamada a la API, añade '
      + 'una línea JSON con el modelo, el objeto de uso que trajo la respuesta, un "label" que '
      + 'nombre la carga de trabajo y un "session" que nombre la conversación. Nunca contiene '
      + 'texto de prompts, y la clave de sesión se usa para agrupar y jamás se muestra.',
    empty: 'No hay registros de uso en ese log.',
    nothingPriced:
      'Ninguno de los modelos de ese registro está en el catálogo de precios, así que no hay '
      + 'factura que mostrar. La CLI puede ponerles precio con un overlay: trazum profile '
      + '--pricing.',
    heading: 'Adónde fue el dinero',
    headline: (calls, total) =>
      `${calls.toLocaleString('es-ES')} ${calls === 1 ? 'llamada' : 'llamadas'} · ${total}`,
    partInput: 'Entrada',
    partCacheRead: 'Lecturas de caché',
    partCacheWrite: 'Escrituras de caché',
    partOutput: 'Salida',
    spendColumn: 'Gasto',
    shareColumn: 'Parte',
    tokensColumn: 'Tokens',
    callsColumn: 'Llamadas',
    cacheHeading: '¿Se pagó sola la caché?',
    cacheHit: (pct) => `Tasa de acierto de caché: ${pct} de la entrada facturable.`,
    cacheNever:
      'La caché no se usó nunca en estas llamadas. Si algún prefijo se repite, ese es el mayor '
      + 'ahorro disponible.',
    cachePaidOff: (usd) =>
      `La caché quitó ${usd} de esta factura, frente a los mismos tokens sin caché.`,
    cacheLost: (usd) =>
      `La caché añadió ${usd} a esta factura en lugar de quitarlo. Una escritura de caché `
      + 'cuesta más que la entrada normal — 1,25x, o 2x con el TTL de 1 hora — así que un '
      + 'prefijo que cambia más rápido de lo que se reutiliza paga esa prima a cambio de nada. '
      + 'O cachea un prefijo que se quede quieto, o apaga la caché aquí.',
    cacheNoDifference:
      'La caché quedó en tablas en esta factura: lo que cobró por estos tokens es lo que '
      + 'habrían costado como entrada normal.',
    cacheUnpriced:
      'Pasaron tokens por la caché en modelos que el catálogo de precios no conoce, así que no '
      + 'hay comparación posible.',
    cacheUnsettled: (calls, asRecorded, atLongTtl) =>
      `Este registro no puede decir si la caché se pagó sola. ${calls.toLocaleString('es-ES')} `
      + `${calls === 1 ? 'llamada no anotó' : 'llamadas no anotaron'} qué TTL de escritura `
      + `${calls === 1 ? 'usó' : 'usaron'}: a la tarifa de 5 minutos la caché quitó `
      + `${asRecorded} de esta factura, y a la de 1 hora las mismas llamadas le añadieron `
      + `${atLongTtl}. Ninguna de las dos se presenta como la respuesta. Registra el objeto `
      + '"cache_creation" que devuelve la API y esto se resuelve solo.',
    cacheTtlBound: (calls, atLongTtl) =>
      `Esa cifra es una cota, no una medición: ${calls.toLocaleString('es-ES')} `
      + `${calls === 1 ? 'llamada no anotó' : 'llamadas no anotaron'} el TTL de escritura, y a `
      + `la tarifa de 1 hora sale ${atLongTtl}.`,
    cacheHiddenLoss: (usd, labels) =>
      `El total esconde una pérdida: la caché cuesta ${usd} en ${labels}.`,
    leversHeading: 'Qué movería esta factura de verdad',
    leverSlice: (label, model, usd, pct) => `${label} en ${model} — hasta ${usd} (${pct})`,
    leverRoute: (candidate, usd) => `enrutarlo a ${candidate}: ${usd}`,
    leverBatch: (usd) => `enviarlo por la Batch API: ${usd}`,
    leverCalls: (calls, spent) =>
      `${calls.toLocaleString('es-ES')} ${calls === 1 ? 'llamada' : 'llamadas'}, ${spent} gastados`,
    routeVerify:
      'Que una ruta aguante es una pregunta de evaluación, no de aritmética: nada aquí ha visto '
      + 'una sola respuesta. La CLI lo mide: trazum route <log> --prompt-file <prompt> --cases '
      + '<cases>.',
    leverPromptCeiling: (usd, pct) =>
      `Como referencia: acortar el texto del prompt puede tocar como muchísimo ${usd} — ${pct} `
      + 'de esta factura, y solo si borraras todos los tokens de entrada. La cifra real queda '
      + 'muy por debajo, porque la mayoría de esos tokens son contexto recuperado, historial de '
      + 'conversación y resultados de herramientas que no están en ningún archivo de prompt.',
    leversNone:
      'Nada aquí supera el 1% de la factura: estas llamadas ya van al modelo más barato de su '
      + 'familia, o su proveedor no tiene Batch API. Es una respuesta real, no una sección '
      + 'vacía.',
    leversUnlabelled:
      'Ninguna de estas llamadas llevaba etiqueta, así que esto es todas las cargas de trabajo '
      + 'en una sola fila — un clasificador y un pipeline RAG fundidos en una cifra, con una '
      + 'única ruta sugerida para ambos. Añade "label" al registro y las palancas se separan '
      + 'por carga de trabajo, que es el nivel al que se decide de verdad.',
    historyHeading: 'Qué cuesta reenviar la conversación',
    historyGrowth: (label, model, first, last, turns) =>
      `${label} en ${model}: la entrada va de ${first} tokens en el turno más pequeño a ${last} `
      + `en el más grande, en conversaciones de hasta ${turns} turnos.`,
    historyCeiling: (usd, pct, flat, spent) =>
      `Si cada turno hubiera tenido el tamaño del más pequeño, esa entrada habría costado `
      + `${flat} en vez de ${spent} — así que como mucho ${usd} de esta factura es crecimiento `
      + `de conversación (${pct}). Es un techo y no un ahorro: parte son los mensajes nuevos `
      + 'del propio usuario, que nada puede recortar. Lo que lo mueve es limitar el historial '
      + 'que reenvías, o resumirlo.',
    historyNoSessions:
      'Ninguna llamada de este registro llevaba sesión, así que no se pudo medir qué cuesta '
      + 'reenviar la conversación — normalmente la mayor línea de una factura de chat o de '
      + 'agentes. Añade "session" (o "conversation_id") al registro. Trazum agrupa por esa '
      + 'clave y nunca la muestra.',
    outputHeading: 'Dónde se concentra el gasto de salida',
    outputTail: (label, model, callPct, spendPct, above, usd) =>
      `${label} en ${model}: el ${callPct} de las llamadas concentra el ${spendPct} del gasto `
      + `de salida — las que responden con más de ${above} tokens, de ${usd} de salida en este `
      + 'segmento. Eso es una cola, y una cola tiene una causa: un camino del prompt que invita '
      + 'a un ensayo, una llamada sin max_tokens, una recuperación que devolvió un libro.',
    outputFlat: (label, model, callPct, spendPct, usd) =>
      `${label} en ${model}: el gasto de salida está donde están las llamadas — el ${callPct} `
      + `concentra el ${spendPct} de ${usd}. No hay cola que cazar; pide respuestas más cortas `
      + 'y limita max_tokens.',
    outputPercentiles: (p50, p95) =>
      `La mitad de las respuestas medidas caben en ${p50} tokens de salida, y el 95% en ${p95} `
      + '— el número que un límite de max_tokens quiere de verdad. Medido en estas llamadas, '
      + 'prometido para ninguna.',
    truncatedHeading: 'Respuestas cortadas a medias',
    truncatedWaste: (calls, usd, pct) =>
      `${calls.toLocaleString('es-ES')} ${calls === 1 ? 'llamada chocó' : 'llamadas chocaron'} `
      + `con el techo de max_tokens: ${usd} del gasto de salida (${pct}) compró `
      + `${calls === 1 ? 'una respuesta cortada' : 'respuestas cortadas'} a media generación — `
      + `${calls === 1 ? 'pagada entera, a menudo reintentada y facturada' : 'pagadas enteras, a menudo reintentadas y facturadas'} `
      + 'otra vez. Donde la respuesta necesite el espacio de verdad, sube max_tokens; donde '
      + 'no, pide menos.',
    truncatedNone: 'Se registraron los motivos de parada y ninguna respuesta chocó con el techo de max_tokens.',
    truncatedNotRecorded:
      'No se pudo medir si alguna respuesta quedó cortada: ninguna llamada de este registro '
      + 'lleva motivo de parada. Añade "stop_reason" (Anthropic) o "finish_reason" (OpenAI) al '
      + 'registro; la API ya lo devuelve junto a "usage".',
    span: (from, to, days) =>
      `Este registro abarca ${from} → ${to} (${days} días). El periodo se declara, nunca se `
      + 'extrapola: la aritmética mensual es tuya, y ahora es válida.',
    spanPartial: (withTs, total) =>
      `Solo ${withTs.toLocaleString('es-ES')} de ${total.toLocaleString('es-ES')} llamadas `
      + 'llevan marca de tiempo; el periodo describe esas.',
    dayPeak: (day, usd, xMedian) =>
      `El día más caro de este registro fue ${day}: ${usd}, ${xMedian}x el día mediano.`,
    dayPeakLabel: (label, usd) => `Casi todo fue ${label} (${usd}).`,
    dayChartLabel: (days) =>
      `Gasto por día a lo largo de ${days.toLocaleString('es-ES')} días; la barra más alta es `
      + 'el día más caro.',
    ttlExpires: (label, model, gap) =>
      `${label} en ${model}: los turnos llegan con una mediana de ${gap} entre sí y la entrada `
      + 'de 5 minutos ya no existe para entonces — las escrituras caducan antes de que el '
      + 'siguiente turno las lea, que visto desde la factura es una caché que solo escribe. El '
      + 'TTL de 1 hora cuesta 2x la entrada al escribir y sobreviviría a estos huecos; la otra '
      + 'opción honesta es apagar la caché aquí.',
    ttlExpiresBoth: (label, model, gap) =>
      `${label} en ${model}: los turnos llegan con una mediana de ${gap} entre sí, y ninguna `
      + 'entrada de caché vive tanto — hasta el TTL de 1 hora ha caducado para el siguiente '
      + 'turno. La caché no puede funcionar a este ritmo; apágala aquí y deja de pagar la '
      + 'prima de escritura.',
    ttlOverlong: (label, model, gap, usd) =>
      `${label} en ${model}: los turnos llegan con una mediana de ${gap} entre sí — de sobra `
      + 'dentro de la ventana de 5 minutos — y estas escrituras pagan la tarifa de 1 hora, 2x '
      + 'la entrada frente a 1.25x, por una resistencia que los huecos nunca usan. Las mismas '
      + `escrituras con el TTL de 5 minutos salen ${usd} más baratas en este registro, y esa `
      + 'cifra es exacta: los mismos tokens a la otra tarifa publicada.',
    ttlUnsettled: (label, model, gap) =>
      `${label} en ${model}: los turnos llegan con una mediana de ${gap} entre sí — una entrada `
      + 'de 5 minutos ya no existe para entonces y una de 1 hora sobrevive — y el registro no '
      + 'anotó cuáles eran estas escrituras. Registra el objeto "cache_creation" que devuelve '
      + 'la API y esto se resuelve solo.',
    ttlFits: (label, model, gap) =>
      `${label} en ${model}: los turnos llegan con una mediana de ${gap} entre sí, dentro de la `
      + 'vida útil que usan estas escrituras. El TTL no es el problema aquí.',
    ttlUnmeasured:
      'No se pudo medir si el TTL de la caché encaja con el ritmo de los turnos: hacen falta '
      + '"session" y "ts" en el registro. Una entrada de 5 minutos con turnos cada nueve '
      + 'minutos caduca sin leerse en cada escritura, y solo el reloj puede verlo.',
    singleTurnConfirmed: (label, model, single, sessions, usd) =>
      `${label} en ${model}: ${single} de ${sessions} conversaciones terminaron tras su primer `
      + `turno y gastaron ${usd} escribiendo una caché que nada en este registro leyó jamás. `
      + 'Esas escrituras no compraron nada — deja de marcar llamadas de un solo uso con cache_control.',
    singleTurnCeiling: (label, model, single, sessions, usd) =>
      `${label} en ${model}: ${single} de ${sessions} conversaciones terminaron tras su primer `
      + `turno, y sus escrituras de caché — ${usd} — pagaron una reutilización que su propia `
      + 'conversación nunca hizo. Otra conversación con el mismo prefijo dentro del TTL pudo '
      + 'haberlas leído; el registro no puede ver de quién era la escritura que una lectura '
      + 'encontró, así que esa cifra es un techo del desperdicio, no una factura.',
    byLabelHeading: 'Por etiqueta',
    byModelHeading: 'Por modelo',
    unlabelled: '(sin etiqueta)',
    moreRows: (count) => `…y ${count} más.`,
    unpriced: (models, calls) =>
      `${calls.toLocaleString('es-ES')} ${calls === 1 ? 'llamada no está' : 'llamadas no están'} `
      + `en estos totales — el catálogo de precios no conoce: ${models}. La CLI puede `
      + `${calls === 1 ? 'ponerle' : 'ponerles'} precio con un overlay (trazum profile --pricing).`,
    skipped: (count, lines) =>
      `${count.toLocaleString('es-ES')} ${count === 1 ? 'línea no se pudo leer y quedó' : 'líneas no se pudieron leer y quedaron'} `
      + `fuera (${count === 1 ? 'línea' : 'líneas'} ${lines}).`,
    againstLabel: 'Comparar con un registro anterior (opcional)',
    againstHint:
      'Un segundo registro de uso — el de la semana pasada, el de ayer — leído en esta pestaña '
      + 'como el primero. No se sube nada.',
    againstClear: 'Quitar el registro anterior',
    againstHeading: 'Contra el registro anterior',
    againstConvention:
      'Positivo significa que la factura creció. Ambas cifras son exactamente lo que contiene '
      + 'cada registro — no se asume ningún periodo, así que juzga las llamadas antes que el '
      + 'dinero.',
    againstTotals: (before, after, delta, pct) => `${before} → ${after}   ${delta} (${pct})`,
    againstCalls: (before, after) =>
      `${before.toLocaleString('es-ES')} → ${after.toLocaleString('es-ES')} llamadas.`,
    againstDriver: (delta, label, before, after) => `${delta}  ${label}  (${before} → ${after})`,
    againstDriverNew: (delta, label) => `${delta}  ${label}  (nueva desde el registro anterior)`,
    againstDriverGone: (delta, label) => `${delta}  ${label}  (desaparecida desde el registro anterior)`,
    againstNothingPriced:
      'El registro anterior no tiene nada que el catálogo de precios conozca, así que no hay '
      + 'comparación posible.',
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
