import type { CliMessages } from './types.js';

/** Counts, grouped. A log with forty thousand torn lines should say so legibly. */
const count = (value: number): string => value.toLocaleString('es-ES');

/** Un contador agrupado y su sustantivo, concordando. Ver `plural` en en.ts. */
const plural = (value: number, one: string, many = `${one}s`): string =>
  `${count(value)} ${value === 1 ? one : many}`;

/** "(hace 46 días)", o nada cuando no se sabe la antigüedad. */
const hace = (days: number | null): string =>
  days === null ? '' : days === 0 ? ' (hoy)' : days === 1 ? ' (hace 1 día)' : ` (hace ${days} días)`;


/** Spanish catalogue. Mirrors `en.ts`; see that file for the contract. */
export const es: CliMessages = {
  locale: 'es',
  numberLocale: 'es-ES',

  help: (d, bold) => `${bold('trazum')} — reduce el coste de tus prompts sin perder lo que piden.

${bold('USO')}
  trazum optimize <fichero|-> [opciones]
  trazum check <fichero|dir|-> --max-tokens <n> [opciones]
  trazum baseline [dir] [opciones]
  trazum eval <fichero> --cases <fichero> [opciones]
  trazum eval <fichero> --cases <fichero> --export promptfoo -o suite.json
  trazum route <log.jsonl> --prompt-file <fichero> --cases <fichero> --yes
  trazum diff <antes> <después> [opciones]
  trazum diff --all <dir> <dir> [opciones]
  trazum rank <dir> [opciones]
  trazum doctor [dir] [opciones]
  trazum blame <fichero> [opciones]
  trazum prune <fichero> --cases <fichero> --yes
  trazum where [fichero]
  trazum models
  trazum rules

${bold('OPCIONES DE prune')}
  --cases <fichero>           Una entrada por línea, o un array JSON. Obligatorio.
  --yes                       Gasta las llamadas de verdad. Sin él se imprime la
                              estimación y no se llama a nada.
  --concurrency <n>           Llamadas en vuelo a la vez. Por defecto: 3.
  --json                      La medición como datos.

  Retira cada ejemplo few-shot por turnos y mide si las respuestas se mueven más
  de lo que el prompt ya se mueve por su cuenta. La factura es
  (2 + ejemplos) x casos, y por eso es el único comando que pregunta antes.

  Informa de "sin efecto en estas entradas", nunca de "bórralo": un ejemplo puede
  existir para un caso que tus entradas no contienen. No se edita nada.

${bold('OPCIONES DE eval')}
  --cases <fichero>           Una entrada por línea, o un array JSON. Obligatorio.
  --level <safe|aggressive>   Qué reescritura juzgar. Por defecto: safe.
  --concurrency <n>           Llamadas simultáneas. Por defecto: 3.
  --export promptfoo          Escribe una suite de promptfoo en vez de ejecutar
                              nada: los dos prompts, todos los casos, sin clave
                              de API y sin gastar ninguna llamada. Las aserciones
                              son tuyas: esto existe para la pregunta que la
                              concordancia no puede contestar.
  -o, --out <fichero>         Dónde escribirla. Por defecto, stdout.

${bold('OPCIONES DE rank')}
  --level <safe|aggressive>   Qué reglas cuentan como recuperables. Por defecto: safe.
  --model, --calls,           Calcula el coste de los tokens recuperables, como
  --output-tokens, --batch    en optimize.
  --prompt <nombre>           Qué prompt marcado tomar de cada fichero de código.
  --markdown-out <fichero>    Escribe además el ranking en Markdown, para el
                              resumen de un job de CI o un comentario de PR.
  --json                      El ranking como datos.

  No hay puntuación. Los prompts se ordenan por lo que las reglas recuperarían
  de verdad, midiéndolo al ejecutarlas; las demás columnas explican esa posición.

${bold('OPCIONES DE doctor')}
  --level <safe|aggressive>   Qué reglas contar. Por defecto: safe.
  --model, --calls,           Calcula el coste de los hallazgos, igual que optimize.
  --output-tokens, --batch
  --prompt <nombre>           Qué prompt marcado tomar de cada fichero de código.
  --otlp-out <fichero>        Escribe el reconocimiento como métricas OpenTelemetry
                              (JSON OTLP/HTTP). Trazum escribe el fichero; tu
                              pipeline lo envía.
  --json                      El reconocimiento como datos.

  Revisa un workspace completo: qué prompts no vigila nada, cuáles ya se pasan del
  presupuesto y cuánto suman los avisos en todos ellos. Cada hallazgo es un aviso
  que trazum optimize da en ese prompt por separado, así que cualquier línea se
  puede comprobar contra un solo fichero. No hay puntuación.

  Sale con 0 aunque encuentre cosas. trazum check es la puerta.

${bold('OPCIONES DE blame')}
  --limit <n>                 Revisiones a recorrer. Por defecto: 20, máximo 500.
  --prompt <nombre>           Sigue un prompt marcado dentro de un fichero fuente,
                              para que refactorizar los imports no cuente como
                              crecimiento del prompt.
  --model, --calls,           Calcula el coste del movimiento, igual que optimize.
  --output-tokens, --batch
  --markdown-out <fichero>    Escribe además el historial en Markdown, para el
                              resumen de un job de CI o un comentario de PR.
  --json                      El historial como datos.

  Después de "--" las rutas se toman literales: trazum blame -- --nombre-raro.txt

${bold('OPCIONES DE optimize')}
  --level <safe|aggressive>   Agresividad de las reglas. Por defecto: safe.
  --model <id>                Modelo para calcular el coste. Por defecto: ${d.model}.
  --calls <n>                 Llamadas al mes. Por defecto: ${d.callsPerMonth}.
  --output-tokens <n>         Tokens de salida medios. Por defecto: ${d.avgOutputTokens}.
  --cache-hit-rate <0-1>      Tasa de acierto de caché estimada. Por defecto: ${d.cacheHitRate}.
  --batch                     El trabajo tolera latencia (Batch API, 50% menos).
  --disable <id,id>           Desactiva reglas concretas (ver "trazum rules").
  --suggest                   Pide al LLM reescrituras a nivel de frase y las lista
                              con lo que ahorra cada una. Por sí solo no cambia
                              nada: cada propuesta se comprueba contra tu prompt y
                              se descarta si no sobrevive.
  --apply-suggestions         Las aplica. Solo con --suggest; a secas es un error,
                              no un flag que se ejecuta sin hacer nada.
  --cache-suggestions         Responde a --suggest desde una caché local cuando ya
                              se preguntó por el mismo prompt, en vez de pagar otra
                              vez la llamada. Desactivado por defecto: un acierto es
                              lo que el modelo dijo la última vez, y eso debe
                              elegirse. En $XDG_CACHE_HOME/trazum, 0600, 7 días.
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
  --clear-suggestion-cache    Vacía la caché de --cache-suggestions y dice cuánto
                              ocupaba. Es un recado, no un modo: no necesita
                              comando ni lee el config.

${bold('OPCIONES DE check')}
  --max-tokens <n>            Presupuesto de tokens de entrada. Obligatorio salvo que el config cubra el fichero.
  --level <safe|aggressive>   Nivel al calcular si el prompt optimizado cabría.
  --exact-tokens              Recuento exacto (necesita ANTHROPIC_API_KEY).
  --json                      Resultado en JSON.
  --markdown-out <fichero>    Escribe además el informe en Markdown, para el resumen
                              de un job de CI o un comentario de pull request.
  --baseline                  Aplica la línea base registrada. Activo por defecto siempre
                              que el config declare una, así CI no necesita argumentos; la
                              forma útil es --no-baseline, que la omite en una ejecución.

  Pensado para CI: sale con código 1 si el prompt supera el presupuesto,
  así una plantilla que crece sin control rompe la build en vez de la factura.

  Si le das un directorio, comprueba todos los prompts que hay dentro contra
  los patrones de "budgets" de ${bold('trazum.config.json')} — un solo paso de CI para
  todo un repositorio de prompts. Un fichero que ningún patrón cubre sale
  listado como sin presupuesto, no omitido en silencio, y una ejecución en la
  que no se ha presupuestado nada es un error: "0 fallos" de una comprobación
  que no ha medido nada es lo más engañoso que podría decirte.

${bold('OPCIONES DE baseline')}
  Registra lo que cuestan ahora mismo los prompts de un directorio, en un fichero
  del que haces commit. Después "check" tumba la build cuando el repositorio se
  desvía de él: la pregunta que los presupuestos no pueden responder, porque un
  repositorio al 95% de todos sus presupuestos pasa siempre mientras un PR añade
  cuatrocientos tokens repartidos en doce ficheros.

  -o, --out <fichero>         Dónde escribirlo. Por defecto: baseline.path del config,
                              o trazum.baseline.json.
  --model, --calls, --output-tokens, --cache-hit-rate, --batch
                              El escenario con el que se registra la cifra mensual. Se
                              registra para que una comparación posterior pueda decir si el
                              dinero es comparable — la puerta va en tokens, así que
                              cambiar el precio de un modelo nunca tumba una build por sí solo.
  --exact-tokens              Recuentos exactos (necesita ANTHROPIC_API_KEY).
  --json                      Resultado en JSON.

  Nunca falla. Registrar no es un veredicto, y un comando que pudiera fallar
  mientras escribe aquello con lo que arreglarías el fallo es un bucle.

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

${bold('OPCIONES DE profile')}
  --against <log.jsonl>       Compara esta factura con un registro anterior.
                              Positivo significa que creció; los drivers van
                              ordenados por su contribución al cambio. No se
                              asume ningún periodo — juzga las llamadas antes
                              que el dinero.
  --label <nombre>            Perfila solo las llamadas con esta etiqueta — el
                              zoom una vez que el informe completo nombró al
                              sospechoso. Una etiqueta sin llamadas es un error
                              que nombra las que existen. Con --against se
                              filtran los dos registros, así que la comparación
                              sigue siendo una sola carga.
  --max-usd <n>               Sale con código 1 si este registro gastó más de n
                              dólares. El presupuesto aplica exactamente al
                              registro entregado: perfila el log de ayer cada
                              noche y tienes presupuesto diario sin que Trazum
                              adivine qué es un día.
  --max-growth-usd <n>        Con --against: sale con 1 si la factura creció
                              más de n dólares sobre el registro anterior. Solo,
                              es un error, no un flag que vigila nada en silencio.
  --max-cache-loss-usd <n>    Sale con 1 si cachear añadió más de n dólares a
                              esta factura. Lee el peor caso cuando el registro
                              no anotó el TTL de escritura — una puerta que
                              leyera la mitad halagadora dejaría pasar las
                              facturas que existe para cazar — y dice qué
                              afirmación disparó.
  --max-day-usd <n>           Falla cuando un solo día UTC dentro del registro
                              gastó más que esto. Un mes dentro de presupuesto
                              puede esconder la tarde en que un bucle se comió
                              una cuarta parte. Un registro sin marcas de
                              tiempo falla: no medido no es dentro de
                              presupuesto.
  --since <cuándo>            Perfila solo llamadas desde/hasta ese momento. Un
  --until <cuándo>            día UTC (2026-08-14), una marca ISO 8601 completa,
                              una ventana relativa (7d, 24h) o "now";
                              --until con fecha sola incluye ese día entero. Las
                              llamadas sin "ts" no se pueden situar y quedan
                              fuera — contadas en voz alta, nunca en silencio.
                              Con --against, ambos registros llevan la misma
                              ventana.
  --what-if <modelo>          Pone precio a estas mismas llamadas en otro
                              modelo. Los mismos recuentos de tokens con otra
                              tarifa — una multiplicación, no un consejo, y lo
                              dice. Las llamadas mayores que la ventana de
                              contexto de ese modelo se nombran como
                              imposibles, no se cobran como baratas.
  --markdown-out <fichero>    Escribe además el informe en Markdown, para el
                              resumen de un job de CI o un comentario de PR.
  --csv-shape <forma>         Qué tabla escribe --csv-out: slice (por defecto),
                              day u hour. Una sola forma de fila por fichero,
                              para que nada haya que filtrar antes de sumarlo.
  --csv-out <fichero>         Escribe además el informe en CSV, una fila por
                              etiqueta y modelo. Sin fila de total, a propósito:
                              un total dentro de un fichero de datos acaba
                              sumado con los datos. Los modelos sin precio
                              conservan sus tokens y dejan las celdas de
                              dólares vacías, nunca a cero.
  --pricing <fichero>         Overlay local de precios, como en el resto.
  --json                      El informe completo como datos, palancas incluidas.

  Acepta un fichero de registro o un directorio de ellos — los registros
  rotados por día se leen en orden de nombre como una sola factura, y se dice
  cuántos se leyeron.

  Lee lo que el proveedor cobró de verdad. Campos opcionales desbloquean
  hallazgos: "label" (qué carga), "session" (qué conversación — se agrupa y
  nunca se imprime), "stop_reason"/"finish_reason" (respuestas cortadas en
  max_tokens).

${bold('OPCIONES DE route')}
  --prompt-file <fichero>     El prompt que mandan esas llamadas. No --prompt,
                              que nombra un prompt marcado dentro de un fuente.
  --cases <fichero>           Una entrada por línea, o un array JSON. Obligatorio.
  --label <nombre>            Mide esta carga en vez de la más cara.
  --concurrency <n>           Llamadas en vuelo a la vez. Por defecto: 3.
  --yes                       Gasta las llamadas de verdad. Sin él se imprime la
                              cuenta y no se llama a nada.
  --json                      La porción y la medición como datos.

  Lee un registro de uso, busca la porción donde llevar las llamadas a un modelo
  más barato vale más, y mide si ese modelo sigue haciendo el trabajo. El mismo
  prompt va a los dos, y el original se ejecuta dos veces por caso — así el
  veredicto se juzga contra la varianza de ese modelo y no contra un umbral
  inventado.

  Cuesta tres llamadas al proveedor por caso y necesita TRAZUM_LLM_* configurado.

${bold('OPCIONES DE diff')}
  --max-growth <n>            Falla si el prompt ha crecido más de n tokens.
  --all                       Compara dos directorios de prompts, emparejados por
                              ruta relativa. Los prompts que solo están en un lado
                              se nombran, nunca se cuentan: una eliminación es una
                              pregunta, no un ahorro. --max-growth se aplica
                              entonces por prompt, no al total.
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
    baseline  { "path": "trazum.baseline.json", "maxGrowthTokens": 0, "maxGrowthPct": 5 }
    pricing   "./prices.json"   — correcciones locales de precios, ver abajo
    labels    { "support-rag": "prompts/soporte.txt" } — qué fichero de prompt
              manda cada label del registro de uso, para que "trazum profile"
              lea el fichero y diga por qué falla una caché que falla
    spend     { "maxUsd": 200, "byLabel": { "chat": 40 } } — presupuestos en
              dólares para "trazum profile". Una etiqueta con presupuesto y sin
              llamadas se informa como no medida, nunca como aprobada

  Las opciones ganan al config; el config gana a los valores por defecto. Los
  presupuestos se resuelven con el patrón más específico que encaje — gana el
  que tenga más caracteres literales. Un booleano que el config haya activado se
  desactiva con --no-<opción>, por ejemplo --no-batch.

  ${bold('budgets')} es un techo; ${bold('baseline')} es una puerta. Uno pregunta si un
  fichero cabe, la otra si el repositorio ha empeorado respecto al commit que
  alguien registró con "trazum baseline". Un repositorio al 95% de todos sus
  presupuestos pasa siempre, mientras un PR añade cuatrocientos tokens
  repartidos en doce ficheros. Con baseline en el config, "check" sobre un
  directorio lo lee y lo aplica sin ninguna opción: una puerta que exige
  acordarse de pasar un argumento se ejecuta en la terminal del autor y no en
  CI. Los umbrales van en tokens, nunca en dólares — si no, cambiar el precio de
  un modelo tumbaría una build por algo que nadie tocó.

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
  --pricing-live              Toma los precios de OpenRouter en vez de la tabla
                              incluida: cifras de hoy para cientos de modelos de
                              docenas de proveedores. Opt-in, porque es una llamada
                              de red — el núcleo determinista no hace ninguna.
                              Un fichero --pricing gana sobre esto.

                              Esa fuente no publica si un modelo tiene caché de
                              prompt ni el mínimo a partir del cual cachea. Así que
                              los modelos que añade no reciben ningún consejo de
                              caché, en vez de una suposición: afirmar que cachea
                              ofrecería un ahorro que nadie puede comprar, y
                              afirmar que no esconde el mayor ahorro que hay.

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

  cache: {
    cleared: (entries: number, bytes: number, dir: string) =>
      entries === 0
        ? `No hay sugerencias en caché que eliminar (${dir}).`
        : `Se eliminaron ${entries} ${entries === 1 ? 'respuesta' : 'respuestas'} en caché (${(bytes / 1024).toFixed(1)} KB) de ${dir}.`,
    used: (hits: number, misses: number) =>
      `Sugerencias: ${hits} desde la caché, ${misses} consultadas. Las respuestas en caché son lo que el modelo dijo la última vez; usa --clear-suggestion-cache para empezar de nuevo.`,
  },

  errors: {
    livePricingFailed: (url: string, detail: string) =>
      `No se han podido cargar los precios en vivo desde ${url}: ${detail}. Los precios incluidos siguen ahí — quita --pricing-live para usarlos.`,
    optionNeedsValue: (name) => `La opción --${name} necesita un valor.`,
    mustBeNonNegative: (name, raw) =>
      `--${name} debe ser un número no negativo (recibido: "${raw}").`,
    badLevel: (received) => `--level debe ser "safe" o "aggressive" (recibido: "${received}").`,
    unknownRuleInDisable: (id) =>
      `Regla desconocida en --disable: "${id}". Lista completa: trazum rules`,
    unknownCommand: (command) => `Comando desconocido: "${command}". Prueba con "trazum --help".`,
    missingInputFile: () =>
      'Falta el fichero de entrada. Usa "-" para leer de la entrada estándar.',
    applyNeedsSuggest: () =>
      '--apply-suggestions no tiene nada que aplicar sin --suggest. Por su cuenta habría '
      + 'funcionado en silencio sin cambiar nada, y eso no es una respuesta.',
    llmNotConfigured: () =>
      'Has pedido --llm pero no hay proveedor configurado.\n' +
      'Define TRAZUM_LLM_BASE_URL y TRAZUM_LLM_MODEL (endpoint compatible con OpenAI),\n' +
      'o TRAZUM_LLM_PROVIDER=anthropic con TRAZUM_LLM_API_KEY.',
    exactTokensNeedsKey: () => '--exact-tokens necesita ANTHROPIC_API_KEY en el entorno.',
    checkNeedsMaxTokens: () => 'trazum check necesita --max-tokens <n>.',
    evalNeedsCases: () => 'trazum eval necesita --cases <fichero>.',
    unknownExportFormat: (received, allowed) =>
      `Formato de exportación desconocido "${received}". Disponibles: ${allowed}.`,
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
    baselineMissing: (path) =>
      `El config declara una l\u00ednea base en "${path}" y no est\u00e1. Registra una con "trazum baseline" y hazle commit. Es un error y no una comprobaci\u00f3n omitida: una puerta que el config ha pedido y no se ha podido ejecutar no es un aprobado.`,
    baselineTooBig: (path, limit) =>
      `"${path}" supera el l\u00edmite de ${limit} bytes para una l\u00ednea base. En esa ruta hay algo que no es una l\u00ednea base.`,
    errorLabel: () => 'Error',
  },

  report: {
    inputTokens: () => 'Tokens de entrada',
    estimated: (offFamily) =>
      offFamily === null
        ? ' (estimado, ±10%)'
        : ` (estimado — el contador está calibrado sobre Claude, no sobre ${offFamily})`,
    exactCount: () => ' (recuento exacto)',
    rulesApplied: () => 'Reglas aplicadas',
    nothingToTrim: () => '  Ninguna regla ha encontrado nada que recortar.',
    dictionaryCoverage: (languages) =>
      `  Los diccionarios de frases cubren ${languages}. Un prompt en otro idioma `
      + 'no es necesariamente eficiente: puede ser simplemente uno que Trazum '
      + 'todavía no sabe leer.',
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
    windowNegligible: (tokens, model, window) =>
      `${tokens} tokens de la ventana de ${window} de ${model} — menos de una décima de por ciento, así que la ventana no es lo que limita este prompt.`,
    windowUnmoved: (share, model, window) =>
      `${share} de la ventana de ${window} de ${model}, antes y después: este cambio es demasiado pequeño para moverla.`,
    beyondThisPromptTokensOnly: () =>
      'Acortar un prompt es la palanca más pequeña que hay: medido en un prompt de soporte corriente, las reglas recuperan alrededor del 1% de una factura mensual. Si alguno de tus prompts va a una API de pago por uso, "trazum profile <usage.jsonl>" lee lo que el proveedor cobró de verdad y calcula las palancas que no son el prompt. Grabar ese registro son unas pocas líneas y nunca contiene texto del prompt.',
    beyondThisPrompt: () =>
      'Acortar un prompt es la palanca más pequeña que hay: medido en un prompt de soporte corriente, las reglas recuperan alrededor del 1% de una factura mensual. En una API de pago por uso, lo que mueve del 40% al 80% es a qué modelo va la llamada, la Batch API, la caché de prompts, y lo que cuesta reenviar la conversación — y "trazum profile <usage.jsonl>" calcula las cuatro a partir de lo que el proveedor cobró de verdad. Grabar ese registro son unas pocas líneas y nunca contiene texto del prompt.',
    windowUse: (before, after, model, window) =>
      `Ventana de contexto: ${before} → ${after} de los ${window} tokens de ${model} — sitio que se lleva la conversación.`,
    tokensOnlyAskedFor: () =>
      'Has nombrado un escenario y no se ha calculado su coste: Trazum se está ejecutando en un sitio que factura por suscripción, así que aquí no hay factura que reducir. Añade --cost para calcularlo igualmente — el host dice dónde se ejecuta Trazum, no a dónde va tu prompt.',
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
    suggestHeading: () => 'Reescrituras sugeridas',
    suggestOffered: (count, tokens) =>
      `${count} ${count === 1 ? 'frase podría decir' : 'frases podrían decir'} lo mismo con ~${tokens} tokens menos:`,
    suggestApplied: (count, tokens) =>
      `Aplicadas ${count} ${count === 1 ? 'reescritura' : 'reescrituras'} (~${tokens} tokens). Lee el diff.`,
    suggestNothing: (provider, model) =>
      `${provider} (${model}) no ha encontrado nada que reescribir que las reglas no hubieran cogido ya.`,
    suggestRejected: (count) =>
      `${count} ${count === 1 ? 'propuesta no ha superado' : 'propuestas no han superado'} la comprobación contra tu prompt.`,
    suggestRemoved: () => '(eliminado)',
    suggestHowToApply: () => 'No se ha cambiado nada. Añade --apply-suggestions para aplicarlas.',
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

  pricing: {
    liveLoaded: (added: number, refreshed: number, skipped: number) =>
      `Precios en vivo: ${refreshed} actualizados, ${added} modelos añadidos, ${skipped} descartados por no traer precio o ventana de contexto utilizables. Esta fuente no publica los mínimos de caché, así que el consejo de caché se omite para los modelos añadidos.`,
  },

  models: {
    title: () => 'Modelos y precios',
    unit: () => '  (USD por millón de tokens)',
    reviewedOn: (date, days) =>
      `  Tabla revisada el ${date}${hace(days)}. Verifica antes de presupuestar.`,
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

  rank: {
    heading: (root, count) =>
      `${count} ${count === 1 ? 'prompt' : 'prompts'} en ${root}, primero los más recuperables`,
    subheading: (model, calls) => `Calculado con ${model} y ${calls} llamadas al mes.`,
    columns: {
      recoverable: 'Recupera',
      tokensBack: 'Tokens',
      tokens: 'Tamaño',
      density: 'Tok/fra',
      notes: 'Prompt',
    },
    noteExamples: (count, tokens) => `${count} ejemplos, ~${tokens} tokens`,
    noteFormat: (tokens) => `~${tokens} tokens repitiendo el formato de salida`,
    noteProtected: (pct) => `el ${pct}% es código o URLs, que no se pueden recortar`,
    skipped: (count) =>
      `Se ${count === 1 ? 'ha omitido' : 'han omitido'} ${count} fichero${count === 1 ? '' : 's'} de código sin marcador `
      + '`// trazum:prompt`: sus prompts no están en este ranking.',
    densityNote: () =>
      'Tok/fra son tokens por frase: verbosidad independiente de la longitud. No hay puntuación: cada columna es una medida que puedes comprobar contra el fichero.',
    recoverableNote: () =>
      'Recupera es lo que quitarían las reglas deterministas en este nivel, valorado con el perfil de uso, con el número de tokens al lado: ahorrar un token son veinticinco céntimos y ningún trabajo que merezca la pena. Se obtiene ejecutando las reglas, no con una fórmula.',
  },

  blame: {
    heading: (path, revisions) =>
      `${path} — ${revisions} ${revisions === 1 ? 'revisión' : 'revisiones'}`,
    notARepository: () =>
      'blame lee el historial de un fichero desde git, y este directorio no está dentro de un repositorio.',
    outsideRepository: (path) =>
      `${path} está fuera del repositorio, así que no hay historial que leer.`,
    noHistory: (path) => `git no tiene commits que toquen ${path}.`,
    gitMissing: () => 'git no está en el PATH, y blame no tiene de dónde leer el historial.',
    columns: { when: 'Fecha', tokens: 'Tokens', change: 'Cambio', who: 'Autor', commit: 'Commit' },
    net: (first, last, delta, pct) =>
      `Neto en este historial: ${first} → ${last} tokens (${delta}, ${pct}).`,
    netCost: (amount, model, calls) =>
      `Ese movimiento son ${amount} al mes en ${model} con ${calls} llamadas.`,
    biggestRise: () => 'Mayor subida en un solo commit',
    biggestRiseDetail: (tokens, author, subject, sha) =>
      `+${tokens} tokens — ${author}, "${subject}" (${sha})`,
    addedAt: () => 'añadido',
    goneAt: () => 'no existía',
    truncated: (shown) =>
      `Mostrando las ${shown} más recientes. Usa --limit para ver más.`,
    followedRename: (from) => `Se ha seguido un renombrado: las revisiones anteriores son ${from}.`,
    estimateNote: () =>
      'Los recuentos son estimaciones (±10%). Lo que importa es la tendencia, no las cifras absolutas.',
  },

  languages: {
    and: 'y',
    en: 'inglés',
    es: 'español',
    fr: 'francés',
    de: 'alemán',
    pt: 'portugués',
    it: 'italiano',
    nl: 'neerlandés',
  },

  rules: {
    title: () => 'Reglas disponibles',
    disableHint: () => '  Desactiva las que no quieras con --disable id1,id2',
  },


  doctor: {
    heading: (root, prompts) => `${root} — ${prompts} prompt${prompts === 1 ? '' : 's'}`,
    subheading: (model, calls) => `Con precios de ${model} y ${calls} llamadas al mes.`,
    pricesReviewed: (date, days) => `Precios revisados el ${date}${hace(days)}.`,
    budgetsHeading: () => 'Presupuestos',
    everyPromptBudgeted: (count) =>
      count === 1
        ? 'El prompt tiene presupuesto y está dentro.'
        : `Los ${count} prompts tienen presupuesto y están dentro.`,
    unbudgeted: (count, total) =>
      `${count} de ${total} prompt${count === 1 ? '' : 's'} sin presupuesto, así que nada los vigila`,
    overBudget: (count) =>
      count === 1
        ? '1 prompt ya se pasa de su presupuesto — trazum check fallaría con él'
        : `${count} prompts ya se pasan de su presupuesto — trazum check fallaría con ellos`,
    andMore: (count) => `y ${count} más`,
    findingsHeading: () => 'Qué merecería la pena arreglar',
    acrossPrompts: (count) => `${count} prompt${count === 1 ? '' : 's'}`,
    findingsNote: () =>
      'Cada línea es el mismo aviso que trazum optimize da en esos prompts, sumado. '
      + 'Ejecútalo sobre cualquiera de ellos para ver la cifra por separado.',
    notAGate: () =>
      'Nada de esto hace fallar un build. trazum check es la puerta; esto es el '
      + 'reconocimiento — la recomendación de modelo es una heurística de palabras clave, '
      + 'y un build que dependa de una enseña a repetir hasta que salga verde.',

    sharedPrefixHeading: () => 'Preámbulos que podrían compartir caché y no lo hacen',
    sharedPrefixGroup: (count, tokens, drift) =>
      `${count} prompts empiezan con el mismo preámbulo de ${tokens} tokens, `
      + (drift === 'whitespace'
        ? 'y solo difieren en espaciado'
        : 'y difieren en redacción, mayúsculas o puntuación'),
    sharedPrefixFix: (drift) =>
      drift === 'whitespace'
        ? 'Lo arregla un formateador: el texto ya coincide, el espaciado no.'
        : 'Alguien tiene que elegir una redacción — difiere el texto, no solo su espaciado.',
    sharedPrefixNoFigure: () =>
      'No se adjunta cifra, a propósito. El caché compara bytes, así que estos prompts '
      + 'ocupan una entrada cada uno en lugar de una entre todos — pero lo que eso cuesta '
      + 'depende de cómo se reparten las llamadas dentro del grupo, y Trazum aplica un '
      + 'único --cache-hit-rate a todos. Cifrarlo sería inventarse tu tráfico.',
  },

  prune: {
    needsExamples: () =>
      'Este prompt tiene menos de dos ejemplos few-shot, así que no hay nada que comparar.',
    estimate: (examples, cases, calls) =>
      `${examples} ejemplos × ${cases} casos: ${calls} llamadas al proveedor `
      + `(2 de referencia por caso, y luego una por ejemplo retirado).`,
    needsConsent: () =>
      'No se ha llamado a nada. Añade --yes para gastarlo. Es el único comando que '
      + 'pregunta, porque es el único cuya factura crece con la longitud de tu prompt.',
    heading: (model) => `Qué hace cada ejemplo, medido en ${model}`,
    selfAgreement: (pct) =>
      `El prompt coincide consigo mismo el ${pct} de las veces. Ese es el patrón de medida: `
      + 'una retirada que mueva la respuesta menos que eso no movió nada atribuible al ejemplo.',
    line: (n, tokens, pct) => `ejemplo ${n} — ${tokens} tokens, ${pct} de coincidencia sin él`,
    verdictNeeded: () => 'hace falta aquí',
    verdictRecoverable: () => 'sin efecto en estas entradas',
    verdictUnknown: () => 'no concluyente',
    recoverable: (tokens) =>
      `${tokens} tokens están en ejemplos cuya retirada no cambió nada medible aquí.`,
    caveat: () =>
      'Lo cual no es lo mismo que "bórralos". Un ejemplo puede existir para un caso que '
      + 'estas entradas no contienen — la condición límite que alguien encontró en '
      + 'producción y para la que añadió una demostración. Esto mide las entradas que le '
      + 'diste, y solo tú sabes si cubren lo que importa. No se ha editado nada.',
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
    exportWarnings: (count) =>
      `${count} ${count === 1 ? 'cosa' : 'cosas'} que saber antes de fiarte de la ejecución:`,
    exportWrote: (path, cases, assertions) =>
      `Escrito ${path}: dos prompts, ${cases} ${cases === 1 ? 'caso' : 'casos'}, ` +
      `${assertions === 0 ? 'sin aserciones' : `${assertions} aserción${assertions === 1 ? '' : 'es'} (el prompt pide JSON)`}. ` +
      `Añade las tuyas y ejecuta: npx promptfoo eval -c ${path}`,
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
    someOverLimit: (count, max) =>
      `${count} prompt${count === 1 ? '' : 's'} por encima del límite por prompt de ${max} tokens:`,
    allSubheading: (prompts) => `${prompts} prompt${prompts === 1 ? '' : 's'} en ambos lados.`,
    allTotal: (delta, prompts) =>
      `${delta} tokens en ${prompts} prompt${prompts === 1 ? '' : 's'}`,
    signConvention: () =>
      'Toda cifra es después menos antes, así que positivo significa peor — lo contrario que en el resto de Trazum.',
    onlyBefore: () => 'solo antes ',
    onlyAfter: () => 'solo después',
    onlyOneSideNote: () =>
      'No entran en los totales. Un prompt que desaparece es una pregunta, no un ahorro.',
  },

  markdown: {
    checkHeading: (target) => `Trazum — presupuestos de tokens en ${target}`,
    baselineGrew: (delta, pct) => `Esta rama a\u00f1ade ${delta} tokens (${pct}) a los prompts de aqu\u00ed`,
    baselineShrank: (delta, pct) => `Esta rama quita ${delta} tokens (${pct}) de los prompts de aqu\u00ed`,
    baselineUnchanged: () => 'Sin cambios frente a la l\u00ednea base registrada',
    baselineOverLimit: (limits) => `supera el l\u00edmite de ${limits}`,
    baselineLimitTokens: (limit) => `${limit} tokens`,
    baselineLimitPct: (limit) => `${limit}%`,
    baselineColumnBefore: () => 'L\u00ednea base',
    baselineColumnAfter: () => 'Ahora',
    baselineMoney: (before, after, delta) => `Coste mensual **${before} \u2192 ${after}** (${delta})`,
    baselineMoneyIncomparable: () =>
      'El escenario o el cat\u00e1logo de precios han cambiado desde que se registr\u00f3 la l\u00ednea base, as\u00ed que las dos cifras mensuales no son la misma medida y aqu\u00ed no se restan. La comparaci\u00f3n de tokens de arriba no se ve afectada.',
    baselineReRecord: (command, path) =>
      `Si este crecimiento es intencionado, vuelve a registrar con \`${command}\` y haz commit de \`${path}\`.`,
    diffHeading: (before, after) => `Trazum — ${before} → ${after}`,
    rankHeading: (root, count) =>
      `Trazum — qué arreglar primero en ${root} (${count} ${count === 1 ? "prompt" : "prompts"})`,
    blameHeading: (path) => `Trazum — historial de tokens de ${path}`,
    rankLevel: (level) => `Medido al nivel de reglas \`${level}\`.`,
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
    sourceEstimated: () => 'estimado, ±10%',
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
  profile: {
    noTarget: () =>
      'Apúntalo a un log de uso: trazum profile usage.jsonl — un objeto JSON por línea, cada uno con un "model" y el objeto "usage" que devolvió la API. Añade "label" (qué carga), "session" (qué conversación) y "ts" (cuándo) ya que estás: sin ellos todas las llamadas parecen iguales, y los hallazgos más grandes de este comando — el crecimiento de conversación, y si el TTL de la caché encaja con el ritmo de tus turnos — no se pueden hacer siquiera. Registrarlo son cuatro líneas en tu propio código, nunca contiene el texto del prompt, y la clave de sesión se agrupa y nunca se imprime.',
    heading: () => 'Adónde fue el dinero',
    calls: (n) => plural(n, 'llamada'),
    spent: (calls, total) => `${calls} · ${total}`,
    part: (name, usd, pct, tokens) => `${name.padEnd(15)}${usd.padStart(11)}  ${pct.padStart(5)}   ${tokens} tokens`,
    partInput: () => 'Entrada',
    partCacheRead: () => 'Lecturas caché',
    partCacheWrite: () => 'Escrituras caché',
    partOutput: () => 'Salida',
    byLabelHeading: () => 'Por etiqueta',
    byModelHeading: () => 'Por modelo',
    row: (name, usd, pct, calls) => `${usd.padStart(11)}  ${pct.padStart(5)}   ${name}  (${calls})`,
    unlabelled: () => '(sin label)',
    cacheHit: (pct) => `Tasa de acierto de caché: ${pct} de la entrada facturable.`,
    cacheNever: () => 'No se usó caché en estas llamadas. Si algún prefijo se repite, ese es el mayor ahorro disponible.',
    cacheLost: (usd, writes, reads) =>
      `La caché añadió ${usd} a esta factura en lugar de restarlos. Se escribieron ${writes} tokens en la caché y se leyeron ${reads} — y una escritura cuesta 1,25x la entrada normal, o 2x con el TTL de una hora. Un prefijo que cambia más rápido de lo que se reutiliza paga esa prima a cambio de nada. O cachea un prefijo que no se mueva, o desactiva la caché aquí.`,
    cachePaidOff: (usd) => `La caché quitó ${usd} de esta factura, frente a esos mismos tokens sin cachear.`,
    cacheNoDifference: () =>
      'La caché quedó a cero en esta factura: lo que cobró por estos tokens es lo que habrían costado como entrada normal. Ni se paga a sí misma ni te está costando nada.',
    cacheLostBy: (labels) => `La pérdida está en: ${labels}.`,
    cacheLostHidden: (usd, labels) =>
      `El total de arriba esconde una pérdida: la caché cuesta ${usd} repartidos en ${labels}.`,
    andMoreLabels: (n) => `y ${count(n)} más`,
    cacheTtlUnsettled: (calls, asRecorded, atLongTtl) =>
      `Este registro no puede decir si la caché salió a cuenta. ${count(calls)} ${calls === 1 ? 'llamada no registró' : 'llamadas no registraron'} qué TTL de escritura de caché se usó: con la tarifa de 5 minutos la caché quitó ${asRecorded} de esta factura, y con la de 1 hora esas mismas llamadas le añadieron ${atLongTtl}. No se da ninguna de las dos como respuesta. Registra el objeto "cache_creation" que devuelve la API y esto se resuelve solo.`,
    cacheTtlBound: (calls, atLongTtl) =>
      `Esa cifra es una cota, no una medición: ${count(calls)} ${calls === 1 ? 'llamada no registró' : 'llamadas no registraron'} el TTL de escritura de caché, y con la tarifa de 1 hora es ${atLongTtl}.`,
    cacheTtlUnsettledLabels: (labels) =>
      `Estas estarían perdiendo dinero si sus escrituras sin registrar usaron el TTL de 1 hora: ${labels}.`,
    biggestPart: (name, pct) => `${name} es el ${pct} de esta factura.`,
    outputDominates: (pct) =>
      `La salida es el ${pct} de esta factura, así que acortar prompts tiene un techo bajo aquí. Lo que mueve la aguja es pedir respuestas más cortas y limitar max_tokens.`,
    unpriced: (models, calls) =>
      `${count(calls)} ${calls === 1 ? 'llamada no está' : 'llamadas no están'} en estos totales: el catálogo de precios no conoce ${models}. Añádelos con un overlay de precios (--pricing) para incluirlos.`,
    skipped: (lineCount, lines) =>
      `No se ${lineCount === 1 ? 'pudo leer' : 'pudieron leer'} ${count(lineCount)} ${lineCount === 1 ? 'línea y quedó fuera' : 'líneas y quedaron fuera'} (${lineCount === 1 ? 'línea' : 'líneas'} ${lines}).`,
    empty: () => 'No hay registros de uso en ese archivo.',
    nothingPriced: () =>
      'Ninguno de los modelos de ese log está en el catálogo de precios, así que no hay factura que reportar. Añádelos con un overlay de precios (--pricing) y vuelve a ejecutarlo.',
    leversHeading: () => 'Lo que de verdad movería esta factura',
    leverSlice: (label, model, usd, pct) =>
      `${label} en ${model} — hasta ${usd} de esta factura (${pct})`,
    leverRoute: (candidate, usd) => `llévalo a ${candidate}, ${usd}`,
    leverRouteVerify: (candidate) =>
      `Si eso aguanta es una pregunta de evaluación, no de aritmética, y aquí no se ha visto ni una sola respuesta. Mídelo: trazum route <log> --prompt-file <prompt> --cases <casos> --yes`,
    leverBatch: (usd) => `mándalo por la Batch API, ${usd}`,
    leverCalls: (calls, spent) => `${calls}, ${spent} gastados`,
    leverPromptCeiling: (usd, pct) =>
      `Para comparar: acortar el texto del prompt puede tocar ${usd} como mucho — el ${pct} de esta factura, y solo si borraras hasta el último token de entrada. La cifra real está muy por debajo, porque la mayoría de esos tokens son contexto recuperado, historial de conversación y resultados de herramientas que no están en ningún fichero de prompt.`,
    historyHeading: () => 'Lo que cuesta reenviar la conversación',
    historyGrowth: (label, model, first, last, turns) =>
      `${label} en ${model}: la entrada va de ${first} tokens en el turno más pequeño a ${last} en el más grande, en conversaciones de hasta ${turns} turnos.`,
    historyCeiling: (usd, pct, flat, spent) =>
      `Si cada turno hubiera tenido el tamaño del más pequeño, esa entrada habría costado ${flat} en vez de ${spent} — así que como mucho ${usd} de esta factura es crecimiento de la conversación (${pct}). Es un techo y no un ahorro: parte de eso son los mensajes nuevos del propio usuario, que nada puede truncar, y esto lee cuentas y no contenido, así que no puede separarlos. Lo que lo mueve es limitar el historial que reproduces, o resumirlo.`,
    truncatedWaste: (calls, usd, pct) =>
      `${calls} chocaron con el techo de max_tokens: ${usd} del gasto en salida (${pct}) compró respuestas cortadas a medias — pagadas enteras, a menudo reintentadas y facturadas otra vez. Donde la respuesta de verdad necesite el espacio, sube max_tokens; donde no, pide menos. En cualquier caso este es el único trozo de una factura que es desperdicio sin contrapartida.`,
    againstHeading: () => 'Contra el registro anterior',
    againstTotals: (before, after, delta, pct, callsBefore, callsAfter) =>
      `${before} → ${after}   ${delta} (${pct})   ${callsBefore} → ${callsAfter}. Positivo significa que la factura creció. Las dos cifras son exactamente lo que contiene cada fichero — no se asume ningún periodo, así que juzga las llamadas antes de juzgar el dinero.`,
    againstDriver: (delta, label, before, after) => `${delta}  ${label}  (${before} → ${after})`,
    againstDriverNew: (delta, label) => `${delta}  ${label}  (nuevo desde el registro anterior)`,
    againstDriverGone: (delta, label) => `${delta}  ${label}  (desaparecido desde el registro anterior)`,
    againstByModel: () =>
      'El mismo cambio, por modelo — hacia dónde se movió la mezcla:',
    labelPrefixBelowMinimum: (file, prefix, minimum, model) =>
      `${file} (tal y como está hoy — el registro puede ser anterior): el prefijo estable son ${prefix} tokens y ${model} no cachea nada por debajo de ${minimum}. Poner cache_control ahí no da error, simplemente nunca cachea — que es exactamente el aspecto que tiene en la factura una caché que solo escribe.`,
    labelPrefixMovable: (file, movable, prefix) =>
      `${file} (tal y como está hoy — el registro puede ser anterior): ~${movable} tokens estables están detrás del primer marcador, donde la caché no llega; el prefijo cacheable es ${prefix}. "trazum optimize ${file} --reorder" los mueve delante y enseña el diff.`,
    labelPrefixHealthy: (file, prefix, minimum) =>
      `${file} (tal y como está hoy — el registro puede ser anterior): el prefijo estable son ${prefix} tokens, por encima del mínimo de ${minimum}. El fichero no es el problema; mira si el prefijo es byte a byte idéntico entre llamadas.`,
    labelFileMissing: (label, file) =>
      `labels["${label}"] apunta a ${file}, que no existe — el mapeo se ha saltado.`,
    againstNothingPriced: () =>
      'El registro anterior no tiene nada que el catálogo de precios conozca, así que no hay comparación que hacer.',
    truncatedNotRecorded: () =>
      'No se pudo medir si alguna respuesta quedó cortada — ninguna llamada de este registro lleva stop reason. Añade "stop_reason" (Anthropic) o "finish_reason" (OpenAI) al registro; la API ya lo devuelve junto a "usage".',
    historyNoSessions: () =>
      'Ninguna llamada de este registro llevaba sesión, así que no se pudo medir lo que cuesta reenviar la conversación — normalmente la línea más grande de una factura de chat o de agente. Añade "session" (o "conversation_id") al registro y vuelve a ejecutarlo. Trazum agrupa por ese campo y nunca lo imprime.',
    leversUnlabelled: () =>
      'Ninguna de estas llamadas llevaba label, así que esto es todas las cargas en una fila — un clasificador y un pipeline RAG fundidos en una sola cifra, con una única ruta sugerida para los dos. Añade "label" al registro y las palancas se separan por carga, que es la agrupación en la que de verdad se toma una decisión.',
    outputShapeHeading: () => 'Dónde se concentra el gasto en salida',
    outputTail: (label, model, callPct, spendPct, above, usd) =>
      `${label} en ${model}: el ${callPct} de las llamadas concentra el ${spendPct} del gasto en salida — las que responden con más de ${above} tokens, de ${usd} de salida en esta porción.`,
    outputTailAdvice: () =>
      'Eso es una cola, y una cola tiene una causa: un camino del prompt que invita a una redacción, una llamada sin max_tokens, una recuperación que devolvió un libro. Encontrarla es una mañana; no es "acorta todo".',
    outputFlat: (label, model, callPct, spendPct, usd) =>
      `${label} en ${model}: el gasto en salida está donde están las llamadas — el ${callPct} concentra el ${spendPct} de ${usd}. No hay cola que cazar.`,
    outputFlatAdvice: () =>
      'Aquí la longitud de la respuesta es la tarea, así que las palancas son las bastas: pide respuestas más cortas en el prompt, y limita max_tokens.',
    outputPercentiles: (p50, p95) =>
      `La mitad de las respuestas medidas caben en ${p50} tokens de salida, y el 95% en ${p95} — el número que un límite de max_tokens quiere de verdad. Medido en estas llamadas, prometido para ninguna.`,
    inputShapeHeading: () => 'Cómo de grandes son estas llamadas',
    inputSkewed: (label, model, p50, p95, ratio, usd) =>
      `${label} en ${model} es desigual: la mitad de sus llamadas caben en ${p50} tokens de entrada y el 95% en ${p95} — unas ${ratio} veces la llamada normal, sobre ${usd} de gasto de entrada.`,
    inputSkewedAdvice: () =>
      'Por encima de cuatro veces la mediana, la llamada normal está bien y algo crece encima: una conversación que nadie corta, una recuperación sin tope, un resultado de herramienta pegado entero. El arreglo es un límite en las llamadas grandes, no reescribir el prompt que mandan todas.',
    inputEven: (label, model, p50, p95, usd) =>
      `${label} en ${model} es pareja: la mitad de sus llamadas caben en ${p50} tokens de entrada y el 95% en ${p95}, sobre ${usd} de gasto de entrada.`,
    inputEvenAdvice: () =>
      'Las llamadas grandes no son mucho mayores que la normal, así que no hay cola que capar — el prompt simplemente es grande. Las palancas son menos documentos recuperados, un bloque de sistema más corto y caché si el prefijo se repite.',
    inputHuge: (label, model, calls, usd) =>
      `${label} en ${model}: cada una de sus ${calls} es mayor de lo que esta herramienta mide con precisión, sobre ${usd} de gasto de entrada. No se nombra techo porque no hay ninguno que nombrar con honestidad — ese tamaño es ya el hallazgo.`,
    inputMostlyCached: (share) =>
      `El ${share} de esos tokens fueron lecturas de caché, facturadas a una décima parte de la tarifa de entrada — el tamaño es real y la mayor parte es barata.`,
    inputFullRate: () =>
      'Casi nada de eso fue lectura de caché, así que cada uno de esos tokens se facturó a tarifa de entrada completa. Si algún prefijo se repite entre estas llamadas, la caché es la palanca con el techo más alto aquí.',
    leversNone: () =>
      'Aquí no hay nada que llegue al 1% de la factura: estas llamadas ya van al modelo más barato de su familia, o su proveedor no tiene Batch API. Eso es una respuesta de verdad, no una sección vacía.',
    assumedWriteTtl: (calls) =>
      `${count(calls)} ${calls === 1 ? 'llamada no dijo' : 'llamadas no dijeron'} qué TTL de escritura de caché se usó, así que se asumió la tarifa más barata, la de 5 minutos. Una entrada de 1 hora cuesta 2x la entrada en vez de 1.25x, así que este total es un suelo para esas llamadas. Registra el objeto "cache_creation" que devuelve la API para quitar la suposición.`,
    spanLine: (from, to, days) =>
      `Este registro abarca ${from} → ${to} (${days} días). El periodo se declara, nunca se extrapola: la aritmética mensual es tuya, y ahora es válida.`,
    spanPartial: (withTs, total) =>
      `Solo ${withTs} de ${total} llamadas llevan marca de tiempo; el periodo describe esas.`,
    ttlFitExpires: (label, model, gap) =>
      `${label} en ${model}: los turnos llegan con una mediana de ${gap} entre sí y la entrada de 5 minutos ya no existe para entonces — las escrituras caducan antes de que el siguiente turno las lea, que visto desde la factura es una caché que solo escribe. El TTL de 1 hora cuesta 2x la entrada al escribir y sobreviviría a estos huecos; la otra opción honesta es apagar la caché aquí.`,
    ttlFitExpiresBoth: (label, model, gap) =>
      `${label} en ${model}: los turnos llegan con una mediana de ${gap} entre sí, y ninguna entrada de caché vive tanto — hasta el TTL de 1 hora ha caducado para el siguiente turno. La caché no puede funcionar a este ritmo; apágala aquí y deja de pagar la prima de escritura.`,
    ttlFitOverlong: (label, model, gap, usd) =>
      `${label} en ${model}: los turnos llegan con una mediana de ${gap} entre sí — de sobra dentro de la ventana de 5 minutos — y estas escrituras pagan la tarifa de 1 hora, 2x la entrada frente a 1.25x, por una resistencia que los huecos nunca usan. Las mismas escrituras con el TTL de 5 minutos salen ${usd} más baratas en este registro, y esa cifra es exacta: los mismos tokens a la otra tarifa publicada.`,
    ttlFitUnsettledGap: (label, model, gap) =>
      `${label} en ${model}: los turnos llegan con una mediana de ${gap} entre sí — una entrada de 5 minutos ya no existe para entonces y una de 1 hora sobrevive — y el registro no anotó cuáles eran estas escrituras, así que no se puede resolver si alguna vez se leen de vuelta. Registra el objeto "cache_creation" que devuelve la API y se resuelve solo.`,
    ttlFitFits: (label, model, gap) =>
      `${label} en ${model}: los turnos llegan con una mediana de ${gap} entre sí, dentro de la vida útil que usan estas escrituras. El TTL no es el problema aquí.`,
    ttlFitUnmeasured: () =>
      'No se pudo medir si el TTL de la caché encaja con el ritmo de los turnos: hacen falta "session" y "ts" en el registro. Una entrada de 5 minutos en una carga cuyos turnos llegan cada nueve caduca sin leerse en cada escritura, y solo el reloj puede verlo. Trazum agrupa por la sesión y nunca la muestra.',
    dayPeak: (day, usd, xMedian) =>
      `El día más caro de este registro fue ${day}: ${usd}, ${xMedian}x el día mediano.`,
    dayPeakLabel: (label, usd) => `Casi todo fue ${label} (${usd}).`,
    maxUsdOk: (total, max) => `Dentro del presupuesto: ${total} gastados contra --max-usd ${max}.`,
    maxUsdFailed: (total, max) =>
      `FALLO — este registro gastó ${total} contra un --max-usd de ${max}. Las cifras son los recuentos facturados por el proveedor sobre exactamente este registro; no se asumió ningún periodo.`,
    maxGrowthUsdFailed: (delta, max) =>
      `FALLO — la factura creció ${delta} respecto al registro anterior, por encima del límite --max-growth-usd de ${max}.`,
    maxGrowthNeedsAgainst: () =>
      '--max-growth-usd no tiene con qué comparar sin --against <anterior.jsonl>. Por sí solo habría corrido en silencio sin vigilar nada, y eso no es una respuesta.',
    maxCacheLossOk: (worst, max) =>
      `Caché dentro del presupuesto: cachear costó como mucho ${worst} contra --max-cache-loss-usd ${max}, peor caso incluido.`,
    maxCacheLossFailed: (delta, max) =>
      `FALLO — cachear añadió ${delta} a esta factura (los mismos tokens como entrada normal habrían costado menos), por encima del límite --max-cache-loss-usd de ${max}. El contrafactual es exacto: los mismos tokens a la tarifa de entrada publicada.`,
    maxDayOk: (day, usd, max) =>
      `Ningún día por encima del presupuesto: el peor fue ${day} con ${usd}, contra --max-day-usd ${max}.`,
    maxDayFailed: (day, usd, max) =>
      `FALLO — ${day} gastó ${usd}, por encima del límite --max-day-usd de ${max}. Un total dentro de presupuesto puede esconder un solo día desbocado, que es justo lo que vigila esta puerta.`,
    maxDayNoClock: () =>
      'FALLO — se pidió --max-day-usd y ningún registro de este fichero lleva marca de tiempo, así que no hay días que juzgar. Eso no es un aprobado: una factura que nadie pudo medir por días no es una factura que se mantuvo bajo un presupuesto diario. Añade "ts" al registro y la puerta se arma.',
    maxDayUndated: (calls) =>
      `${calls} llamadas no llevan marca de tiempo, así que están en la factura y en ninguno de los días de arriba — el peor día es un suelo por lo que valieran esas llamadas. Un fallo se sostendría igual; este aprobado cubre la parte que se pudo fechar.`,
    maxCacheLossWorstCase: (calls, worst, max) =>
      `FALLO — ${count(calls)} ${calls === 1 ? 'llamada no registró' : 'llamadas no registraron'} qué TTL de escritura se pagó, y a la tarifa de 1 hora cachear añadió hasta ${worst}, por encima del límite --max-cache-loss-usd de ${max}. La puerta lee el peor caso a propósito: una puerta que leyera la mitad halagadora dejaría pasar exactamente las facturas que existe para cazar. Registra el objeto "cache_creation" que devuelve la API y el techo se vuelve una cifra.`,
    pricesStale: (date, days) =>
      `La tabla de precios detrás de cada dólar de aquí se revisó por última vez el ${date} — hace ${count(days)} días, más de los 45 que esta herramienta considera vigentes. Si el proveedor cambió precios desde entonces, este informe se equivoca exactamente en ese cambio. --pricing-live trae los precios de hoy; --pricing superpone los tuyos.`,
    dayTableDay: () => 'Día (UTC)',
    dayTableCalls: () => 'llamadas',
    dayTableTop: () => 'lo más caro del día',
    dayTableEarlier: (days) =>
      `…y ${count(days)} ${days === 1 ? 'día anterior que no se muestra' : 'días anteriores que no se muestran'} aquí. La serie completa va en --json como spendByDay.`,
    gateOnFloor: (reasons) =>
      `Aviso: la cifra vigilada es un suelo, no la factura — ${reasons}. Lo que costaran esas llamadas no está en el número que la puerta acaba de juzgar, así que pasar aquí significa "cabe la parte que pude leer", nunca "cabe la factura".`,
    floorSkipped: (lines) =>
      `${count(lines)} ${lines === 1 ? 'línea resultó ilegible y quedó fuera' : 'líneas resultaron ilegibles y quedaron fuera'}`,
    floorUnpriced: (calls) =>
      `${count(calls)} ${calls === 1 ? 'llamada usa un modelo' : 'llamadas usan modelos'} que la tabla de precios no conoce`,
    floorUndated: (calls) =>
      `${count(calls)} ${calls === 1 ? 'llamada no lleva marca de tiempo y cayó' : 'llamadas no llevan marca de tiempo y cayeron'} fuera de la ventana`,
    sessionCost: (label, model, sessions, median, medianTurns, p95, max) =>
      `${label} en ${model}: en ${sessions} conversaciones, la mediana cuesta ${median} a lo largo de ${medianTurns} turnos, el 95% queda por debajo de ${p95} y la más cara fue ${max}. Recuentos facturados exactos, por conversación — la cifra con la que se fija un precio por asiento o una cuota. Una conversación que empezó antes de este registro o sigue después solo cuenta por los turnos aquí registrados.`,
    labelBudgetOk: (label, usd, max) =>
      `Dentro del presupuesto: ${label} gastó ${usd} contra ${max}.`,
    labelBudgetFailed: (label, usd, max) =>
      `FALLO — ${label} gastó ${usd} contra su presupuesto de ${max} en trazum.config.json.`,
    labelBudgetMissing: (label) =>
      `${label} tiene presupuesto en trazum.config.json y ninguna llamada en este registro, así que no se midió nada para esa carga. No es un aprobado: una carga que no apareció no es una carga que quedó por debajo del presupuesto.`,
    labelBudgetWindowed: () =>
      'Los presupuestos por etiqueta de trazum.config.json no se aplicaron: --since/--until hacen que "lo que gastó esta etiqueta" signifique una porción, y un presupuesto escrito para el periodo completo estaría vigilando algo que no describe.',
    duplicateLines: (calls, usd) =>
      `${plural(calls, 'línea es un duplicado exacto', 'líneas son duplicados exactos')} de una línea anterior — mismos recuentos, misma etiqueta y sesión, mismo milisegundo — y eso suma ${usd} al total de arriba. Si un registro se exportó dos veces o dos ficheros del directorio se solapan, esta factura está inflada en esa cantidad. Que dos llamadas reales coincidan en todo eso es posible; solo que improbable.`,
    budgetVsWire: (label, file, budget, perCall, share) =>
      `El presupuesto de ${file} son ${budget} tokens, y las llamadas con etiqueta ${label} llevan unos ${perCall} tokens de entrada cada una — así que esa puerta vigila alrededor del ${share} de lo que realmente sale por el cable. El resto es contexto recuperado, historial de conversación y resultados de herramientas, que ningún fichero de prompt contiene y ningún presupuesto sobre uno puede ver. El presupuesto no está mal; simplemente es más pequeño que la factura.`,
    badCsvShape: (value) =>
      `--csv-shape no conoce "${value}". Acepta "slice" (una fila por etiqueta y modelo, el valor por defecto), "day" u "hour".`,
    whatIfHeading: (model) => `Estas mismas llamadas en ${model}`,
    whatIfAssumption: () =>
      'Esto es una multiplicación, no un consejo: los mismos recuentos de tokens con otra tarifa. No dice nada sobre si ese modelo podría hacer el trabajo, y un modelo que responda más largo o al que haya que reintentar no enviaría estos recuentos.',
    whatIfTotal: (current, target, delta) =>
      `${current} de gasto movible habrían sido ${target} — una diferencia de ${delta}.`,
    whatIfCheaper: () =>
      'Compruébalo antes de mover nada: trazum route mide un prompt contra ambos modelos con tus propios ejemplos.',
    whatIfDearer: () => 'Esa dirección cuesta más. La aritmética está aquí para que el número no sea una suposición.',
    whatIfSlice: (label, model, current, target) => `${label} en ${model}: ${current} → ${target}`,
    whatIfOverContext: (label, tokens, window, usd) =>
      `${label} no puede moverse: su llamada más grande lleva ${tokens} tokens de entrada y la ventana de ese modelo es de ${window}. Esas llamadas fallarían, no costarían menos, así que sus ${usd} quedan fuera de las cifras de arriba.`,
    whatIfAlreadyThere: (calls, usd) =>
      `Ya en ese modelo: ${calls} por valor de ${usd}, fuera de las cifras de arriba — dinero que no puede moverse haría que la diferencia pareciera menor de lo que es.`,
    whatIfUnpriced: (calls, models) =>
      `Fuera de la comparación: ${calls} cuyo modelo no tiene precio aquí (${models}). Su coste en el modelo destino sí se puede calcular; la diferencia no, porque no hay cifra actual de la que restar.`,
    whatIfNothingToMove: () =>
      'Nada que comparar: todas las llamadas con precio de este registro ya están en ese modelo, o son demasiado grandes para su ventana de contexto.',
    whatIfUnknown: (value, available) =>
      `--what-if no conoce "${value}". Modelos con precio: ${available}. Añádelo con --pricing si tienes sus tarifas.`,
    coverageHeading: () => 'Lo que este registro todavía no puede responder',
    needsLabel: (seen) =>
      `"label" en ${seen} registros: sin él todas las cargas son una sola fila, así que no hay gasto por carga, ni zoom, y las palancas describen una mezcla en vez de una decisión.`,
    needsSession: (seen) =>
      `"session" en ${seen} registros: sin él no hay crecimiento de conversación, ni coste por conversación, ni encaje del TTL de caché. Se agrupa por él y nunca se imprime.`,
    needsTs: (seen) =>
      `"ts" en ${seen} registros: sin él el registro no tiene periodo, ni forma por día o por hora, y la pregunta del TTL de caché no se puede ni plantear.`,
    needsStopReason: (seen) =>
      `"stop_reason" (Anthropic) o "finish_reason" (OpenAI) en ${seen} registros: sin él las respuestas cortadas en max_tokens son invisibles — y el silencio ahí no es lo mismo que ninguna.`,
    needsCacheTtl: (seen) =>
      `el objeto "cache_creation" en ${seen} de los registros que escribieron en caché: sin él se asume la tarifa de 5 minutos, así que esos totales son un suelo y algunos veredictos de caché no se pueden cerrar.`,
    hoursConcentrated: (hours, list) =>
      `El 80% de este gasto cae en ${hours} horas del día UTC (${list}) — tráfico interactivo con alguien esperando, donde las 24 horas de la Batch API no encajan. Las horas son UTC; desplázalas tú si tu tráfico está en una sola región.`,
    hoursFlat: (hours) =>
      `El gasto está repartido por el día: hacen falta ${hours} horas del día UTC para cubrir el 80%. Esa es la forma del trabajo de fondo, y el trabajo de fondo es justo lo que la Batch API abarata a la mitad — mira las palancas de arriba para ver cuánto valdría aquí. Si estas llamadas pueden esperar lo dices tú; el registro solo enseña cuándo ocurrieron.`,
    truncatedBy: (label, calls, measured, rate, usd) =>
      `${label}: ${calls} de ${measured} llamadas que registraron motivo de parada quedaron cortadas (${rate}), ${usd} de salida. El denominador son las llamadas que midieron, no todas — una carga que registra el campo la mitad de las veces no es una carga cuya otra mitad terminó.`,
    truncatedCeiling: (p95) =>
      `El 95% de las respuestas que sí terminaron cabe en ${p95} tokens de salida, así que un tope por ahí dejaría de cortarlas. Medido en estas llamadas, prometido para ninguna.`,
    readFiles: (files, directory) =>
      `Leídos ${count(files)} ficheros de registro de ${directory}, en orden de nombre, como una sola factura. Todas las cifras de abajo los cubren todos.`,
    noLogsInDirectory: (directory, extensions) =>
      `No hay registros de uso en "${directory}". Se buscaron ficheros terminados en ${extensions}. Un directorio sin nada legible es un error, no un informe vacío, que se leería como "no has gastado nada".`,
    sessionCostTail: (ratio) =>
      `El percentil 95 es ${ratio}x la mediana ahí: casi todas las conversaciones son baratas y unas pocas no, y esa es una cola que una cuota puede cazar. Cuando mediana y p95 quedan cerca, la carga es cara sin más y no hay cola que perseguir.`,
    againstOverlap: (from, to) =>
      `Estos dos registros cubren ambos ${from} → ${to}, así que algunas de las mismas llamadas están a los dos lados de esta resta y parte del cambio es el mismo dinero contado dos veces. Compara periodos que no se solapen — o acota ambos registros con --since/--until.`,
    windowLine: (since, until) =>
      `Filtrado con --since ${since} --until ${until}. Todo lo de abajo describe esta ventana, no el registro completo; una fecha sola significa ese día UTC entero.`,
    windowUndated: (calls) =>
      `${count(calls)} ${calls === 1 ? 'llamada no lleva' : 'llamadas no llevan'} marca de tiempo y no se ${calls === 1 ? 'puede situar' : 'pueden situar'} dentro o fuera de esta ventana, así que ${calls === 1 ? 'quedó fuera' : 'quedaron fuera'}. Su gasto está en el registro y no en este informe — las cifras de la ventana son un suelo del periodo.`,
    windowRelative: () =>
      'Esa ventana es relativa al reloj de esta máquina, no al último registro del log — un registro exportado hace un mes responderá "los últimos 7 días" con nada.',
    windowRelativeEmpty: () =>
      'Una ventana relativa se mide desde el reloj de esta máquina: si este registro se exportó antes, pide las fechas que cubre.',
    windowNeedsClock: () =>
      'Ningún registro lleva marca de tiempo, así que --since/--until no tienen por qué filtrar. Una ventana temporal sobre un registro sin reloj no vigilaría nada, y eso no es una respuesta. Añade "ts" a los registros — la receta del README dice dónde.',
    windowMatchesNothing: (from, to) =>
      `Ningún registro cae dentro de esta ventana. El registro cubre ${from} → ${to}. Una ventana que no encuentra nada no debe volverse un informe de $0 — bajo --max-usd pasaría una puerta de presupuesto sobre un periodo que el registro no cubre.`,
    sinceAfterUntil: () =>
      '--since es igual o posterior a --until, así que la ventana no contiene tiempo alguno. Revisa las dos fechas.',
    badWhen: (flag, value) =>
      `--${flag} no pudo leer "${value}". Acepta un día UTC (2026-08-14) o una marca ISO 8601 completa (2026-08-14T09:30:00Z).`,
    singleTurnCeiling: (label, model, single, sessions, usd) =>
      `${label} en ${model}: ${single} de ${sessions} conversaciones terminaron tras su primer turno, y sus escrituras de caché — ${usd} — pagaron una reutilización que su propia conversación nunca hizo. Otra conversación con el mismo prefijo dentro del TTL pudo haberlas leído; el registro no puede ver de quién era la escritura que una lectura encontró, así que esa cifra es un techo del desperdicio, no una factura.`,
    singleTurnConfirmed: (label, model, single, sessions, usd) =>
      `${label} en ${model}: ${single} de ${sessions} conversaciones terminaron tras su primer turno y gastaron ${usd} escribiendo una caché que nada en este registro leyó jamás. Dentro de la conversación, entre conversaciones — ninguna lectura en ningún sitio, así que esas escrituras no compraron nada. Cachear una llamada de un solo uso es puro sobreprecio de escritura; deja de marcar estas llamadas con cache_control.`,
  },

  route: {
    noTarget: () =>
      'Apunta esto a un registro de uso y a un prompt: trazum route usage.jsonl --prompt-file prompts/soporte.txt --cases casos.txt --yes. Busca la porción que más vale y mide si el modelo más barato sigue haciendo el trabajo. El flag es --prompt-file y no --prompt, porque en el resto de la herramienta --prompt nombra un prompt marcado dentro de un fichero fuente.',
    needsPrompt: () =>
      '--prompt y --cases son los dos obligatorios. El registro dice qué ruta vale dinero; solo el prompt y los casos pueden decir si funciona.',
    labelNotFound: (label, available) =>
      `Ninguna llamada de este registro lleva el label "${label}". Los labels que hay son: ${available}.`,
    noRoute: () =>
      'Ninguna ruta de este registro llega al 1% de la factura. Estas llamadas ya van al modelo más barato de su familia, o el catálogo no tiene nada por debajo.',
    picked: (label, model, candidate, usd, pct) =>
      `${label} en ${model} → ${candidate}, vale ${usd} de esta factura (${pct}).`,
    willSpend: (calls, model, candidate) =>
      `Esto hará ${count(calls)} llamadas al proveedor: dos por caso en ${model} para medir su propia varianza, una por caso en ${candidate}. Todavía no se ha gastado nada — añade --yes para ejecutarlo.`,
    dryRun: () => 'No se llamó a nada.',
    running: (cases) => `Ejecutando ${count(cases)} casos...`,
    agreement: (cross, self) =>
      `El modelo más barato coincide con el original el ${cross} de las veces. El original coincide consigo mismo el ${self} — esa es la vara de medir, no el 100%.`,
    holds: (usd) =>
      `AGUANTA — la diferencia está dentro del propio ruido del modelo original. En esta factura esa ruta vale ${usd}.`,
    diverges: (usd) =>
      `DIVERGE — el modelo más barato da respuestas materialmente distintas. Los ${usd} son reales y el cambio de comportamiento también; esto no es dinero gratis.`,
    inconclusive: () =>
      'NO CONCLUYENTE — el modelo original fue demasiado inconsistente consigo mismo en estos casos como para juzgar nada contra eso. Añade casos, o elige unos con menos margen para que el modelo divague.',
    unlabelledSlice: () =>
      'Estas llamadas no llevan label, así que Trazum no puede saber si son todas este prompt. Si no lo son, la cifra de arriba cubre llamadas que esta medición no tocó — añade "label" al registro y la porción pasa a ser una sola carga, que es lo que hace la cifra atribuible.',
    yours: () =>
      'Coincidir no es acertar. Esto mide si las respuestas se movieron, no si alguna vez fueron correctas — la decisión sigue siendo tuya.',
  },

  baseline: {
    recorded: (path, files, tokens) =>
      `Registrados ${files} prompts, ${tokens} tokens, en ${path}. Haz commit: la puerta compara el \u00e1rbol con lo que est\u00e9 commiteado.`,
    recordedMoney: (monthly, model, calls) =>
      `Son ${monthly} al mes con ${model} y ${calls} llamadas. Es informativo, no la puerta: los umbrales van en tokens, as\u00ed que cambiar el precio de un modelo nunca tumba una build por s\u00ed solo.`,
    heading: () => 'Frente a la l\u00ednea base',
    unchanged: (tokens) => `sin cambios, ${tokens} tokens`,
    grew: (delta, pct, tokens) => `ha crecido ${delta} tokens (${pct}) hasta ${tokens}`,
    shrank: (delta, pct, tokens) => `ha bajado ${delta} tokens (${pct}) hasta ${tokens}`,
    entry: (path, before, after, delta) => `${path}  ${before} \u2192 ${after}  (${delta})`,
    addedHeading: (count) => `Nuevos desde la l\u00ednea base (${count})`,
    removedHeading: (count) => `Desaparecidos desde la l\u00ednea base (${count})`,
    grownHeading: (count) => `Han crecido (${count})`,
    breachTokens: (actual, limit) =>
      `un crecimiento de ${actual} tokens supera el l\u00edmite de ${limit}`,
    breachPct: (actual, limit) => `un crecimiento de ${actual} supera el l\u00edmite de ${limit}`,
    reRecord: (path) =>
      `Si el crecimiento es intencionado, vuelve a registrar con "trazum baseline" y haz commit de ${path}.`,
    money: (before, after, delta) => `Coste mensual ${before} \u2192 ${after} (${delta})`,
    moneyIncomparableScenario: () =>
      'El escenario de uso ha cambiado desde que se registr\u00f3 la l\u00ednea base, as\u00ed que las dos cifras mensuales no son la misma medida. La comparaci\u00f3n de tokens no se ve afectada.',
    moneyIncomparablePricing: (was, now) =>
      `Los precios se revisaron el ${was} cuando se registr\u00f3 la l\u00ednea base y el ${now} ahora, as\u00ed que las cifras mensuales no son la misma medida. La comparaci\u00f3n de tokens no se ve afectada.`,
  },
};
