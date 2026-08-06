import type { CliMessages } from './types.js';

/** Spanish catalogue. Mirrors `en.ts`; see that file for the contract. */
export const es: CliMessages = {
  locale: 'es',
  numberLocale: 'es-ES',

  help: (d, bold) => `${bold('trazum')} — reduce el coste de tus prompts sin perder lo que piden.

${bold('USO')}
  trazum optimize <fichero|-> [opciones]
  trazum check <fichero|dir|-> --max-tokens <n> [opciones]
  trazum eval <fichero> --cases <fichero> [opciones]
  trazum diff <antes> <después> [opciones]
  trazum where [fichero]
  trazum models
  trazum rules

${bold('OPCIONES DE optimize')}
  --level <safe|aggressive>   Agresividad de las reglas. Por defecto: safe.
  --model <id>                Modelo para calcular el coste. Por defecto: ${d.model}.
  --calls <n>                 Llamadas al mes. Por defecto: ${d.callsPerMonth}.
  --output-tokens <n>         Tokens de salida medios. Por defecto: ${d.avgOutputTokens}.
  --cache-hit-rate <0-1>      Tasa de acierto de caché estimada. Por defecto: ${d.cacheHitRate}.
  --batch                     El trabajo tolera latencia (Batch API, 50% menos).
  --disable <id,id>           Desactiva reglas concretas (ver "trazum rules").
  --reorder                   Mueve las instrucciones estables delante del primer
                              marcador, para que la caché de prompts las alcance. Esto
                              MUEVE texto en vez de borrarlo: lee el diff y decide si
                              el orden importaba. Se niega con cualquier bloque que
                              haga referencia hacia atrás ("el texto anterior"), y
                              dice qué frase lo ha impedido.
  --llm                       Añade una pasada por el LLM configurado por entorno.
  --exact-tokens              Cuenta tokens con la API oficial en vez de la heurística.
  --tokens-only               Informa del ahorro de tokens y de ningún importe. Es
                              lo que hace por defecto dentro de Claude Code, Codex
                              o Cursor, donde una suscripción significa que no hay
                              factura que reducir.
  --cost                      Muestra el dinero también ahí: el host dice dónde se
                              ejecuta Trazum, no a dónde va tu prompt.
  --prompt <nombre>           Qué prompt marcado optimizar, cuando un fichero
                              fuente tiene más de uno. Ver "trazum where".
  --diff                      Muestra el diff línea a línea.
  --json                      Vuelca el informe completo en JSON.
  --locale <${d.locales.join('|')}>            Idioma del informe. Por defecto: el del sistema.
  -o, --out <fichero>         Escribe el prompt optimizado a un fichero.
  -h, --help                  Esta ayuda.

${bold('OPCIONES DE check')}
  --max-tokens <n>            Presupuesto de tokens de entrada. Obligatorio salvo que el config cubra el fichero.
  --level <safe|aggressive>   Nivel al calcular si el prompt optimizado cabría.
  --exact-tokens              Recuento exacto (necesita ANTHROPIC_API_KEY).
  --json                      Resultado en JSON.
  --markdown-out <fichero>    Escribe además el informe en Markdown, para el resumen
                              de un job de CI o un comentario de pull request.

  Pensado para CI: sale con código 1 si el prompt supera el presupuesto,
  así una plantilla que crece sin control rompe la build en vez de la factura.

  Si le das un directorio, comprueba todos los prompts que hay dentro contra
  los patrones de "budgets" de ${bold('trazum.config.json')} — un solo paso de CI para
  todo un repositorio de prompts. Un fichero que ningún patrón cubre sale
  listado como sin presupuesto, no omitido en silencio, y una ejecución en la
  que no se ha presupuestado nada es un error: "0 fallos" de una comprobación
  que no ha medido nada es lo más engañoso que podría decirte.

${bold('OPCIONES DE eval')}
  --cases <fichero>           Entradas a probar, una por línea o array JSON. Obligatorio.
  --level <safe|aggressive>   Nivel con el que optimizar antes de comparar.
  --concurrency <n>           Casos en paralelo. Por defecto: 3.
  --json                      Resultado en JSON.

  Ejecuta las dos versiones del prompt sobre tus casos y dice si la
  optimización ha cambiado las respuestas. Cuesta TRES llamadas por caso: el
  original dos veces, para medir la varianza propia del modelo, y el optimizado
  una. Esa base es la vara de medir: sin ella, un porcentaje de divergencia no
  significa nada. Sale con código 1 cuando las respuestas divergen de verdad.

${bold('OPCIONES DE diff')}
  --max-growth <n>            Falla si el prompt ha crecido más de n tokens.
  --optimized                 Mide lo que dejarían las reglas, no lo escrito.
  --level <safe|aggressive>   Nivel para las reglas y los avisos.
  --model <id>                Modelo con el que calcular el coste.
  --calls <n>                 Llamadas al mes, para la cifra de coste.
  --json                      Resultado en JSON.
  --markdown-out <fichero>    Escribe además el informe en Markdown, para el resumen
                              de un job de CI o un comentario de pull request.

  Compara dos versiones de un prompt: cómo se ha movido el recuento de tokens,
  cuánto cuesta eso, qué avisos ha introducido o resuelto la edición. Toda
  cifra es un delta y positivo significa peor. Informa y sale con 0 salvo que
  des --max-growth: decidir que crecer es inaceptable es cosa tuya, no nuestra.

${bold('trazum where')}
  Dice a qué proveedor van de verdad los prompts de un fichero, y cómo lo sabe:
  un import del SDK, una base URL, un id de modelo entrecomillado, o "model=" en
  un marcador trazum:prompt. Toda respuesta nombra la línea de la que sale.

  Se niega cuando un fichero nombra dos proveedores en vez de elegir uno. Dos
  respuestas no son una versión débil de una, y elegir en silencio es como
  alguien acaba presupuestando contra el proveedor equivocado durante un mes.

  Una base URL gana al SDK al que apunta: Moonshot, DeepSeek, xAI y Groq se
  llaman con el SDK de OpenAI y otra base_url, así que tratarlo como
  contradicción sería negarse a preciar un cliente perfectamente normal.

  Sin fichero, informa solo de dentro de qué herramienta se ejecuta Trazum — y
  avisa cuando esa herramienta cobra por suscripción, porque ahí un ahorro
  mensual es aritmética sobre tokens, no dinero que recuperes.

${bold('FICHERO DE CONFIGURACIÓN')}
  ${bold('trazum.config.json')}, que se busca subiendo desde el directorio de trabajo
  y parando en la raíz del repositorio. Todas las claves son opcionales:

    level, locale, disable, maxGrowth, extensions
    usage     { model, callsPerMonth, avgOutputTokens, cacheHitRate, batchEligible }
    budgets   { "prompts/**": 2000, "prompts/system.txt": 4000 }
    pricing   "./prices.json"   — correcciones locales de precios, ver abajo

  Las opciones ganan al config; el config gana a los valores por defecto. Los
  presupuestos se resuelven con el patrón más específico que encaje — gana el
  que tenga más caracteres literales. Un booleano que el config haya activado se
  desactiva con --no-<opción>, por ejemplo --no-batch.

  Un config que no valide es un error, incluida una clave desconocida. Un
  parser permisivo restauraría los valores por defecto en silencio, y para un
  presupuesto el valor por defecto es "sin presupuesto": una build en verde de
  un prompt que nadie ha medido.

  --config <fichero>          Usa este config en vez de buscar uno.

${bold('PRECIOS')}
  Los precios cambian en el calendario de otros, así que corregir uno no exige
  actualizar Trazum. Un overlay de precios es un JSON que se superpone al
  catálogo incluido:

    { "lastReviewed": "2027-01-15",
      "models": { "claude-opus-5": { "inputPerMTok": 6 } } }

  Solo cambian los campos que nombres. Un modelo que no esté en el catálogo
  incluido tiene que venir completo: uno definido a medias costaría cero por
  algún lado y anunciaría un ahorro que no existe. "promo": null retira una
  promoción.

  Todo informe dice cuándo se han usado precios de overlay y qué modelos cubren:
  una cifra del catálogo incluido y una de tu JSON son indistinguibles si no.

  --pricing <fichero>         Usa este overlay, por delante del del config.

${bold('LLM OPCIONAL')}
  El núcleo es determinista y gratis. Con --llm se añade una pasada de
  compresión semántica usando el proveedor que configures por entorno:

    TRAZUM_LLM_PROVIDER   openai | anthropic          (por defecto: openai)
    TRAZUM_LLM_BASE_URL   https://tu-llm/v1
    TRAZUM_LLM_API_KEY    tu clave
    TRAZUM_LLM_MODEL      identificador del modelo

  El resultado del LLM solo se acepta si es más corto y conserva intacto
  el código, las URLs y los marcadores de plantilla.

${bold('IDIOMA')}
  El idioma del informe sale de --locale, luego TRAZUM_LOCALE, luego LANG, y por
  último del fichero de configuración — así un proyecto puede fijar el idioma en
  el que se leen sus logs de CI sin pisar el idioma de quien está al teclado.
  Solo cambia el informe: el mismo prompt se optimiza siempre igual.

${bold('EJEMPLOS')}
  trazum optimize prompt.txt --calls 50000 --diff
  cat prompt.md | trazum optimize - --level aggressive --json
  trazum optimize prompt.txt --reorder --diff
  trazum optimize prompt.txt --llm -o prompt.optimizado.txt
  trazum eval prompt.txt --cases casos.txt --level aggressive
  trazum diff prompts/system.txt prompts/system.new.txt --max-growth 10
  trazum check prompts/
`,

  errors: {
    optionNeedsValue: (name) => `La opción --${name} necesita un valor.`,
    mustBeNonNegative: (name, raw) =>
      `--${name} debe ser un número no negativo (recibido: "${raw}").`,
    badLevel: (received) => `--level debe ser "safe" o "aggressive" (recibido: "${received}").`,
    unknownRuleInDisable: (id) =>
      `Regla desconocida en --disable: "${id}". Lista completa: trazum rules`,
    unknownCommand: (command) => `Comando desconocido: "${command}". Prueba con "trazum --help".`,
    missingInputFile: () =>
      'Falta el fichero de entrada. Usa "-" para leer de la entrada estándar.',
    llmNotConfigured: () =>
      'Has pedido --llm pero no hay proveedor configurado.\n' +
      'Define TRAZUM_LLM_BASE_URL y TRAZUM_LLM_MODEL (endpoint compatible con OpenAI),\n' +
      'o TRAZUM_LLM_PROVIDER=anthropic con TRAZUM_LLM_API_KEY.',
    exactTokensNeedsKey: () => '--exact-tokens necesita ANTHROPIC_API_KEY en el entorno.',
    checkNeedsMaxTokens: () => 'trazum check necesita --max-tokens <n>.',
    evalNeedsCases: () => 'trazum eval necesita --cases <fichero>.',
    evalNoCases: (path) => `No se ha encontrado ningún caso en "${path}".`,
    unknownFlag: (name, allowed) =>
      `Opción desconocida --${name}. Este comando acepta: ${allowed}.`,
    unknownFlagDidYouMean: (name, suggestion) =>
      `Opción desconocida --${name}. ¿Querías decir --${suggestion}?`,
    diffNeedsTwoFiles: () =>
      'trazum diff necesita dos ficheros: trazum diff <antes> <después>.',
    cannotNegate: (name) => `--no-${name} no tiene sentido: --${name} lleva un valor.`,
    noPromptsFound: (directory, extensions) =>
      `No hay ficheros de prompt en "${directory}". Se han buscado: ${extensions}.`,
    noBudgetsApply: (directory, configFile) =>
      `Ningún presupuesto cubre nada dentro de "${directory}". Añade uno en ${configFile}, en "budgets", o pasa --max-tokens. ` +
      'Decir "0 fallos" de unos ficheros que nadie ha medido sería peor que este error.',
    errorLabel: () => 'Error',
  },

  report: {
    inputTokens: () => 'Tokens de entrada',
    estimated: (offFamily) =>
      offFamily === null
        ? ' (estimado, ±15%)'
        : ` (estimado — el contador está calibrado sobre Claude, no sobre ${offFamily})`,
    exactCount: () => ' (recuento exacto)',
    rulesApplied: () => 'Reglas aplicadas',
    nothingToTrim: () => '  Ninguna regla ha encontrado nada que recortar.',
    levelAggressive: () => '[agresiva]',
    levelSafe: () => '[segura]',
    ruleHits: (hits, tokensSaved) => `(${hits}×, ~${tokensSaved} tokens)`,
    moreChanges: (count) => `+${count} más sin mostrar`,
    llmPass: () => 'Pasada por LLM',
    examplesReview: () => 'Ejemplos que el modelo considera redundantes',
    examplesReviewNote: (provider, model, count) =>
      `${count} ejemplos revisados por ${provider}/${model}. Es una sugerencia que leer, no un cambio hecho.`,
    exampleRedundant: (redundant, keep) =>
      `El ejemplo ${redundant.map((i) => i + 1).join(', ')} repite el ejemplo ${keep + 1}`,
    llmApplied: (provider, model, before, after) =>
      `aplicada vía ${provider}/${model}: ${before} → ${after} tokens`,
    llmRejected: (reason) => `descartada: ${reason}`,
    costWith: (modelName) => `Coste con ${modelName}`,
    usageLine: (calls, outputTokens, batch) =>
      `${calls} llamadas/mes · ${outputTokens} tokens de salida por llamada${
        batch ? ' · Batch API' : ''
      }`,
    perMonthSaving: (saving, pct) => `ahorro ${saving}/mes (${pct}%)`,
    beyondShortening: () => 'Además de acortar el prompt',
    biggestLever: () => 'Empieza por aquí:',
    biggestLeverDetail: (title, amount, times) =>
      // El título conserva sus mayúsculas: pasarlo a minúsculas convertía
      // "Claude Opus 5" en "claude opus 5", un nombre de producto destrozado.
      `"${title}" — ${amount}/mes` +
      (times !== null && times >= 2 ? `, ${times}× lo que han ahorrado las reglas.` : '.'),
    perMonthSuffix: (amount) => ` ~${amount}/mes`,
    diff: () => 'Diff',
    tokensOnlyHeading: (host) => `Qué ganas con esto en ${host}`,
    tokensOnlyWhy: (host) =>
      `${host} cobra por suscripción, así que no hay factura que reducir ni cifra mensual que imprimir.`,
    tokensOnlyAsked: () => 'Costes ocultos porque has pedido solo tokens.',
    tokensSaved: (tokens) =>
      `${tokens} token${tokens === '1' ? '' : 's'} de vuelta, en cada llamada.`,
    windowUse: (before, after, model, window) =>
      `Ventana de contexto: ${before} → ${after} de los ${window} tokens de ${model} — sitio que se lleva la conversación.`,
    tokensOnlyCost: () => 'Usa --cost si este prompt va a una API de pago por uso.',
    pricingOverlaid: (models, lastReviewed) =>
      `Los precios de ${models} vienen de un overlay local revisado el ${lastReviewed}, no del catálogo incluido.`,
    reorderHeading: () => 'Reordenado para la caché',
    reorderMoved: (blocks, tokens) =>
      `Se ${
        blocks === 1 ? 'ha movido 1 bloque' : `han movido ${blocks} bloques`
      } (~${tokens} tokens) delante del primer marcador.`,
    reorderPrefix: (before, after) => `Prefijo cacheable ${before} → ${after} tokens.`,
    reorderDeclined: (count) =>
      `Se ${
        count === 1 ? 'ha dejado 1 bloque donde estaba' : `han dejado ${count} bloques donde estaban`
      }:`,
    reorderDeclinedRef: (phrase, excerpt) => `hace referencia hacia atrás ("${phrase}"): ${excerpt}`,
    reorderDeclinedAfter: (excerpt) => `va después de un bloque que tenía que quedarse: ${excerpt}`,
    reorderDeclinedScript: (script) =>
      `este prompt está escrito en ${script}, y Trazum no tiene frases de referencia hacia ` +
      `atrás para ese alfabeto. No puede distinguir "resume el texto de arriba" de una ` +
      `instrucción que sí se puede mover, así que no ha movido nada. Añadir un idioma es ` +
      `añadir un array a phrases.ts.`,
    reorderDeclinedMore: (count) => `…y ${count} más, en el fichero de salida.`,
    reorderPiped: (moved, tokens, declined) => {
      const head =
        moved === 0
          ? 'no se ha podido mover nada con seguridad'
          : `se ${
              moved === 1 ? 'ha movido 1 bloque' : `han movido ${moved} bloques`
            } (~${tokens} tokens) al prefijo cacheable`;
      const tail =
        declined === 0
          ? ''
          : `; ${
              declined === 1 ? 'se ha dejado 1 bloque' : `se han dejado ${declined} bloques`
            } en su sitio`;
      return `trazum: ${head}${tail}. Ejecuta sin redirigir la salida para ver los motivos.`;
    },
    reorderNothing: () => 'No se ha podido mover nada con seguridad.',
    reorderReview: () =>
      'Lee el diff: esto ha movido texto en vez de borrarlo, así que la pregunta es si el orden importaba.',
    diffTooLarge: (lines, max) =>
      `  Diff omitido: ${lines} líneas supera el límite de ${max}, y alinearlas costaría más memoria de lo que vale la respuesta.`,
    wroteTo: (path) => `Prompt optimizado escrito en ${path}`,
  },

  where: {
    hostHeading: () => 'Ejecutándose dentro de',
    subscription: (host) =>
      `${host} cobra por suscripción, no por token. Un ahorro mensual de los de abajo es aritmética sobre tokens, no dinero que recuperes: lo que ganas es margen de ventana de contexto y de rate limit.`,
    noTarget: () => 'Pasa un fichero fuente para ver a qué proveedor van sus prompts.',
    sourceHeading: (path) => `Los prompts de ${path} van a`,
    conflict: () => 'No se puede saber: el fichero nombra más de un proveedor.',
    conflictFallback: () =>
      'No se ha asumido nada. Define "usage.model" en trazum.config.json, o pasa --model.',
    nothingFound: () => 'Nada en este fichero dice a qué proveedor llama.',
    providerOnly: () => ' (solo el proveedor — nada nombra un modelo)',
    evidenceLine: (line, kind, detail) => `línea ${line}  ${kind}: ${detail}`,
    pricedAs: () => 'Se cobra como',
    fromConfig: () => '(de trazum.config.json)',
    fromDetection: () => '(leído del código)',
    fromProviderDefault: (provider) =>
      `(${provider} se ha leído del código; nada nombra un modelo, así que este es el suyo)`,
    fromDefault: () => '(el valor por defecto — nada dijo otra cosa)',
  },

  models: {
    title: () => 'Modelos y precios',
    unit: () => '  (USD por millón de tokens)',
    reviewedOn: (date) => `  Tabla revisada el ${date}. Verifica antes de presupuestar.`,
    columns: {
      model: 'modelo',
      input: 'entrada',
      output: 'salida',
      context: 'contexto',
      cacheMin: 'mín. caché',
    },
    promoNote: () => '  Los precios entre paréntesis son el precio tras acabar la promoción.',
    cacheNote: () =>
      '  Caché: leer cuesta el 10% de la entrada; escribir, el 125% (5 min) o 200% (1 h).',
    batchNote: () => '  Batch API: 50% de descuento sobre entrada y salida.',
  },

  rules: {
    title: () => 'Reglas disponibles',
    disableHint: () => '  Desactiva las que no quieras con --disable id1,id2',
  },


  eval: {
    nothingToCompare: () =>
      'Las reglas no han cambiado nada en este prompt, así que no hay nada que comparar. Prueba con --level aggressive.',
    starting: (cases, calls, model) =>
      `Ejecutando ${cases} casos con ${model}: ${calls} llamadas (el original dos veces por caso, para medir su propia varianza, y el optimizado una).`,
    heading: () => 'Coincidencia',
    selfAgreement: (pct) => `${pct}  del prompt original consigo mismo  ${'\u2190'} la vara de medir`,
    crossAgreement: (pct) => `${pct}  del prompt optimizado con el original`,
    verdict: (kind) =>
      ({
        indistinguishable: {
          label: 'Indistinguible',
          detail: 'Todas las respuestas coinciden. Sobre este conjunto, la optimización no ha cambiado nada.',
        },
        'within-noise': {
          label: 'Dentro del propio ruido del modelo',
          detail:
            'El prompt optimizado discrepa del original más o menos tanto como el original discrepa de sí mismo, así que la diferencia no es atribuible a la reescritura. Amplía el conjunto antes de fiarte.',
        },
        diverges: {
          label: 'Diverge',
          detail:
            'El modelo es consistente consigo mismo y bastante menos con la reescritura, así que la optimización ha cambiado lo que pide el prompt. Lee los casos de abajo y el diff antes de subir esto.',
        },
        inconclusive: {
          label: 'No concluyente',
          detail:
            'El prompt original no coincide consigo mismo lo suficiente como para juzgar nada contra él. Baja la temperatura, o puede que la tarea sea demasiado abierta para esta prueba.',
        },
      })[kind],
    mostChanged: () => 'Casos que más han cambiado',
    caseAgreement: (cross, self) => `${cross} de coincidencia con el original (que consigo mismo dio ${self})`,
    callsMade: (count) => `${count} llamadas al proveedor.`,
  },


  diff: {
    heading: (before, after) => `${before} → ${after}`,
    measuringOptimised: () =>
      'Midiendo lo que dejarían las reglas, no lo que está escrito.',
    monthly: (delta, calls, model) =>
      `${delta}/mes con ${calls} llamadas y ${model}`,
    advisoriesAppeared: () => 'Problemas nuevos',
    advisoriesResolved: () => 'Resueltos',
    rulesNewlyFiring: () => 'Reglas que ahora encuentran algo:',
    rulesNoLongerFiring: () => 'Reglas que ya no encuentran nada:',
    overLimit: (delta, max) =>
      `Ha crecido ${delta} tokens, por encima del límite de ${max}.`,
  },

  markdown: {
    checkHeading: (target) => `Trazum — presupuestos de tokens en ${target}`,
    diffHeading: (before, after) => `Trazum — ${before} → ${after}`,
    columnFile: () => 'Prompt',
    columnTokens: () => 'Tokens',
    columnBudget: () => 'Presupuesto',
    columnMetric: () => 'Métrica',
    columnChange: () => 'Cambio',
    allWithin: (budgeted) =>
      budgeted === 1
        ? 'El prompt está dentro de presupuesto.'
        : `Los ${budgeted} prompts con presupuesto están dentro de presupuesto.`,
    overBudget: (failures, budgeted) => `${failures} de ${budgeted} por encima del presupuesto`,
    noBudget: () => '—',
    unbudgetedNote: (count) =>
      count === 1
        ? 'Hay 1 prompt que ningún patrón de presupuesto cubre, así que nadie lo está vigilando.'
        : `Hay ${count} prompts que ningún patrón de presupuesto cubre, así que nadie los está vigilando.`,
    whatWouldHelp: () => 'Qué ayudaría',
    wouldFit: (level, optimizedTokens) =>
      `optimizar con \`${level}\` lo dejaría en ~${optimizedTokens} tokens, y sí cabría`,
    stillTooBig: (optimizedTokens) =>
      `ni optimizado cabe (~${optimizedTokens} tokens): hay que recortar contenido a mano`,
    truncated: () =>
      'Se ha parado antes de tiempo: el directorio supera el límite de recorrido, así que esto no es el cuadro completo.',
    footer: (source, level) => `Recuento de tokens ${source} · nivel de reglas \`${level}\``,
    pricingOverlaid: (count, lastReviewed) =>
      `Los precios de ${count} ${count === 1 ? 'modelo' : 'modelos'} vienen de un overlay local revisado el ${lastReviewed}.`,
    sourceEstimated: () => 'estimado, ±15%',
    sourceExact: () => 'exacto',
    measuringOptimised: () =>
      'Se mide lo que dejarían las reglas, no lo que está escrito en el fichero.',
    metricTokens: (before, after) => `Tokens de entrada (${before} → ${after})`,
    metricMonthly: (calls, model) => `Coste al mes con ${calls} llamadas y ${model}`,
    deltaConvention: () =>
      'Toda cifra es un delta: después menos antes, así que <strong>positivo significa peor</strong>. ' +
      'Es lo contrario que en el resto de Trazum, donde toda cifra es un ahorro.',
    advisoriesAppeared: () => 'Problemas que ha introducido esta edición',
    advisoriesResolved: () => 'Problemas que ha resuelto esta edición',
    rulesNewlyFiring: () => 'Reglas que ahora encuentran algo',
    rulesNoLongerFiring: () => 'Reglas que ya no encuentran nada',
    collapsedNote: () => 'nada por encima del presupuesto, despliega para ver las cifras',
    trimNotice: () =>
      '_Recortado para que quepa en un comentario. El informe completo está en el resumen de la ejecución._',
    commentTitle: () => 'Trazum',
  },

  check: {
    okLabel: () => 'OK',
    embeddedHeading: (path, count) =>
      `${path} — ${count} ${count === 1 ? 'prompt marcado' : 'prompts marcados'}`,
    declinedHeading: (count) =>
      `No se ${count === 1 ? 'ha podido leer 1 marcador' : `han podido leer ${count} marcadores`}:`,
    declinedAt: (line, detail) => `línea ${line}: ${detail}`,
    failedLabel: () => 'FALLO',
    ok: (tokens, budget) => `${tokens} tokens dentro del presupuesto de ${budget}.`,
    failed: (tokens, budget) => `${tokens} tokens supera el presupuesto de ${budget}.`,
    wouldFit: (level, optimizedTokens) =>
      `  Optimizado con "trazum optimize --level ${level}" quedaría en ~${optimizedTokens} tokens y sí cabría.`,
    stillTooBig: (optimizedTokens) =>
      `  Ni optimizado cabe (~${optimizedTokens} tokens): hay que recortar contenido a mano.`,
    directoryHeading: (directory, files) =>
      `${directory} — ${files} ${files === 1 ? 'prompt' : 'prompts'}`,
    directorySummary: (failures, files) =>
      failures === 0
        ? `Los ${files} dentro de presupuesto.`
        : `${failures} de ${files} por encima del presupuesto.`,
    noBudget: () => '(sin presupuesto)',
    walkTruncated: () =>
      'Se ha parado antes de tiempo: el directorio supera el límite de recorrido, así que esto no es el cuadro completo.',
    exactCountsCost: (files) =>
      `Contando ${files} ${files === 1 ? 'fichero' : 'ficheros'} con la API, una llamada por cada uno. Esto tarda un momento.`,
  },
};
