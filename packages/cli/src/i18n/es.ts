import type { CliMessages } from './types.js';

/** Spanish catalogue. Mirrors `en.ts`; see that file for the contract. */
export const es: CliMessages = {
  locale: 'es',
  numberLocale: 'es-ES',

  help: (d, bold) => `${bold('trazum')} — reduce el coste de tus prompts sin perder lo que piden.

${bold('USO')}
  trazum optimize <fichero|-> [opciones]
  trazum check <fichero|-> --max-tokens <n> [opciones]
  trazum eval <fichero> --cases <fichero> [opciones]
  trazum diff <antes> <después> [opciones]
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
  --llm                       Añade una pasada por el LLM configurado por entorno.
  --exact-tokens              Cuenta tokens con la API oficial en vez de la heurística.
  --diff                      Muestra el diff línea a línea.
  --json                      Vuelca el informe completo en JSON.
  --locale <${d.locales.join('|')}>            Idioma del informe. Por defecto: el del sistema.
  -o, --out <fichero>         Escribe el prompt optimizado a un fichero.
  -h, --help                  Esta ayuda.

${bold('OPCIONES DE check')}
  --max-tokens <n>            Presupuesto de tokens de entrada. Obligatorio.
  --level <safe|aggressive>   Nivel al calcular si el prompt optimizado cabría.
  --exact-tokens              Recuento exacto (necesita ANTHROPIC_API_KEY).
  --json                      Resultado en JSON.

  Pensado para CI: sale con código 1 si el prompt supera el presupuesto,
  así una plantilla que crece sin control rompe la build en vez de la factura.

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

  Compara dos versiones de un prompt: cómo se ha movido el recuento de tokens,
  cuánto cuesta eso, qué avisos ha introducido o resuelto la edición. Toda
  cifra es un delta y positivo significa peor. Informa y sale con 0 salvo que
  des --max-growth: decidir que crecer es inaceptable es cosa tuya, no nuestra.

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
  El idioma del informe sale de --locale, luego TRAZUM_LOCALE, luego LANG.
  Solo cambia el informe: el mismo prompt se optimiza siempre igual.

${bold('EJEMPLOS')}
  trazum optimize prompt.txt --calls 50000 --diff
  cat prompt.md | trazum optimize - --level aggressive --json
  trazum optimize prompt.txt --llm -o prompt.optimizado.txt
  trazum eval prompt.txt --cases casos.txt --level aggressive
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
    errorLabel: () => 'Error',
  },

  report: {
    inputTokens: () => 'Tokens de entrada',
    estimated: () => ' (estimado, ±15%)',
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
    perMonthSuffix: (amount) => ` ~${amount}/mes`,
    diff: () => 'Diff',
    diffTooLarge: (lines, max) =>
      `  Diff omitido: ${lines} líneas supera el límite de ${max}, y alinearlas costaría más memoria de lo que vale la respuesta.`,
    wroteTo: (path) => `Prompt optimizado escrito en ${path}`,
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

  check: {
    okLabel: () => 'OK',
    failedLabel: () => 'FALLO',
    ok: (tokens, budget) => `${tokens} tokens dentro del presupuesto de ${budget}.`,
    failed: (tokens, budget) => `${tokens} tokens supera el presupuesto de ${budget}.`,
    wouldFit: (level, optimizedTokens) =>
      `  Optimizado con "trazum optimize --level ${level}" quedaría en ~${optimizedTokens} tokens y sí cabría.`,
    stillTooBig: (optimizedTokens) =>
      `  Ni optimizado cabe (~${optimizedTokens} tokens): hay que recortar contenido a mano.`,
  },
};
