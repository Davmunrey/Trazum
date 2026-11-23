import type { CliMessages } from './types.js';

/** Counts, grouped. A log with forty thousand torn lines should say so legibly. */
const count = (value: number): string => value.toLocaleString('es-ES');

/** Un contador agrupado y su sustantivo, concordando. Ver `plural` en en.ts. */
/** Un informe de ccusage de este tipo, y de qué es total cada una de sus filas. */
const ccusageUnitEs = (report: 'daily' | 'weekly' | 'monthly' | 'session'): { report: string; whole: string } =>
  report === 'daily' ? { report: 'diario', whole: 'un día entero' }
  : report === 'weekly' ? { report: 'semanal', whole: 'una semana entera' }
  : report === 'monthly' ? { report: 'mensual', whole: 'un mes entero' }
  : { report: 'de sesiones', whole: 'una sesión entera' };

const plural = (value: number, one: string, many = `${one}s`): string =>
  `${count(value)} ${value === 1 ? one : many}`;

/** "(hace 46 días)", o nada cuando no se sabe la antigüedad. */
const hace = (days: number | null): string =>
  days === null ? '' : days === 0 ? ' (hoy)' : days === 1 ? ' (hace 1 día)' : ` (hace ${days} días)`;


/** Spanish catalogue. Mirrors `en.ts`; see that file for the contract. */
/**
 * What `trazum task`, `trazum filter` and the core's task analysis raise, in
 * Spanish (#871). Keyed by the English text they are raised with, because the
 * core has no locale; `i18n.test.js` reads every such text from the sources and
 * fails on one with no entry here.
 */
const TASK_FILTER_ES: ReadonlyMap<string, string> = new Map(Object.entries({
  // packages/cli/src/task.ts
  'Unknown task action. Run trazum task --help.': 'Acción de task desconocida. Prueba con "trazum task --help".',
  'Unsupported task option. Run trazum task --help.': 'Opción de task no admitida. Prueba con "trazum task --help".',
  'Task options cannot be repeated except source flags.': 'Las opciones de task no se pueden repetir, salvo las de fuente.',
  'A task option is missing its value.': 'A una opción de task le falta su valor.',
  'At most 16 task sources are accepted.': 'Se aceptan como mucho 16 fuentes de tarea.',
  'Task output exceeds the report limit; use a smaller complete task source.':
    'La salida de task supera el límite del informe; usa una fuente de tarea completa más pequeña.',
  'Wrong number of task input files. Run trazum task --help.':
    'Número de ficheros de entrada de task equivocado. Prueba con "trazum task --help".',
  'Provide at least one --claude-code or --codex file.': 'Indica al menos un fichero con --claude-code o --codex.',
  // packages/cli/src/task-files.ts
  'Input must be a bounded regular file, not a symlink or stream.':
    'La entrada debe ser un fichero normal de tamaño acotado, no un enlace simbólico ni un flujo.',
  'Input must be a regular file, not a symlink or stream.': 'La entrada debe ser un fichero normal, no un enlace simbólico ni un flujo.',
  'Input changed while opening; retry after other edits finish.':
    'La entrada cambió mientras se abría; vuelve a intentarlo cuando terminen las otras ediciones.',
  'Input changed while reading; finish the task and retry with a stable transcript.':
    'La entrada cambió mientras se leía; termina la tarea y vuelve a intentarlo con una transcripción estable.',
  'Input was replaced while reading; retry after other edits finish.':
    'La entrada se sustituyó mientras se leía; vuelve a intentarlo cuando terminen las otras ediciones.',
  'Input must be UTF-8 text without NUL bytes.': 'La entrada debe ser texto UTF-8 sin bytes NUL.',
  'Cannot read input; provide an existing, readable regular file without a symlink.':
    'No se puede leer la entrada; indica un fichero normal que exista y se pueda leer, sin enlace simbólico.',
  'Cannot create output; choose a new file in an existing writable directory.':
    'No se puede crear la salida; elige un fichero nuevo en un directorio que exista y admita escritura.',
  'Instructions must be a regular file owned by you, without symlinks or hard links.':
    'Las instrucciones deben ser un fichero normal tuyo, sin enlaces simbólicos ni enlaces duros.',
  'The managed policy block was edited or is malformed; review it manually before retrying.':
    'El bloque de política gestionado se editó o está mal formado; revísalo a mano antes de volver a intentarlo.',
  'Instructions would exceed the input limit.': 'Las instrucciones superarían el límite de entrada.',
  'Instructions changed while preparing the policy; retry after other edits finish.':
    'Las instrucciones cambiaron mientras se preparaba la política; vuelve a intentarlo cuando terminen las otras ediciones.',
  'Cannot update instructions; choose an existing writable file in a writable directory.':
    'No se pueden actualizar las instrucciones; elige un fichero que exista y admita escritura, en un directorio que también la admita.',
  // packages/cli/src/filter.ts
  'Store must be a real directory.': 'El almacén debe ser un directorio real.',
  'Store must be owned by you and have mode 0700.': 'El almacén debe ser tuyo y tener el modo 0700.',
  'Invalid recovery file.': 'Fichero de recuperación no válido.',
  'Recovery integrity check failed.': 'Ha fallado la comprobación de integridad de la recuperación.',
  'Invalid arguments. Run trazum filter --help.': 'Argumentos no válidos. Prueba con "trazum filter --help".',
  'Expected a SHA-256 recovery identifier.': 'Se esperaba un identificador de recuperación SHA-256.',
  'Pipe a tool log into stdin; interactive tools are not supported.':
    'Pasa el log de una herramienta por la entrada estándar; las herramientas interactivas no se admiten.',
  'Trazum: original could not be retained; passing log through unchanged.':
    'Trazum: no se pudo guardar el original; el log pasa sin cambios.',
  // packages/core/src/task-analysis.ts and task.ts
  'Invalid task data. See the task workflow schema and limits.':
    'Datos de tarea no válidos. Consulta el esquema y los límites del flujo de task.',
  'Ambiguous Claude request identifiers across sessions. Supply separate session sources.':
    'Identificadores de petición de Claude ambiguos entre sesiones. Indica fuentes de sesión separadas.',
  'Duplicate task sources are not supported. Supply each session once.':
    'No se admiten fuentes de tarea duplicadas. Indica cada sesión una sola vez.',
  'Multiple sources from the same harness require explicit, disjoint sessions.':
    'Varias fuentes del mismo agente necesitan sesiones explícitas y sin solapes.',
  'Overlapping task sessions are not supported. Supply each session once.':
    'No se admiten sesiones de tarea solapadas. Indica cada sesión una sola vez.',
  'Task usage exceeds safe numeric limits.': 'El uso de la tarea supera los límites numéricos seguros.',
  'No actionable repeated read, search or explicit failure evidence was found.':
    'No se encontró ninguna prueba accionable de lecturas o búsquedas repetidas, ni de fallos explícitos.',
}));

export const es: CliMessages = {
  locale: 'es',
  numberLocale: 'es-ES',

  commandHelpMore: 'Todos los comandos, el fichero de configuración, los precios y los ejemplos: trazum --help',
  taskFilter: {
    taskHelp: (maxChars) => `Uso:
  trazum task analyze --id <id> --type <tipo> --criterion <texto>
    --claude-code <fichero> [--codex <fichero>] [--claude-code <fichero> ...]
    [--outcome accepted|rejected|unknown --assessor <etiqueta>]
    [--policy baseline|repeat-review-v1] [-o <informe-nuevo.json>]
  trazum task policy <informe.json> [-o <politica-nueva.md>]
  trazum task apply <informe.json> --instructions <fichero-existente>
  trazum task revert --instructions <fichero-existente>
  trazum task compare <antes.json> <despues.json> [-o <comparacion-nueva.json>]
  trazum task evaluate --plan <plan.json> <antes.json> <despues.json>
    [<antes.json> <despues.json> ...] [-o <evaluacion-nueva.json>]

Analiza en local fuentes de tareas explícitas y completas de Claude Code y Codex.
Repite las opciones de fuente para incluir sesiones de los dos agentes. No se
recorre la carpeta personal, ni se usa la red, ni se llama a un proveedor, ni se
instalan hooks, ni se ejecutan comandos. Hasta 16 fuentes y ${maxChars} caracteres
en total. No partas una sesión entre varias fuentes ni importes la misma sesión
más de una vez.
Los informes y las comparaciones son JSON por defecto (también se acepta --json).
El resultado y quien lo evalúa los declara quien llama; nunca se deducen del uso.
Aplicar la política añade un bloque gestionado, pequeño y opcional, al fichero que elijas.
Revisa el diff y haz tú una tarea comparable antes de comparar informes.
Revertir quita solo el bloque exacto y sin cambios. Cierra otros editores mientras
aplicas o reviertes. Los informes de salida que ya existen nunca se sobrescriben; los
ficheros nuevos se crean con 0600.
Evaluate mide pares emparejados, primero la línea base y luego la política, contra
el listón del plan: cuántos pares como mínimo, cuánto deben bajar como mínimo los
tokens por tarea aceptada y cuánto puede bajar como mucho la tasa de aceptación.
Escribe el plan antes de las ejecuciones. Un par que no encaja se conserva en la
salida con sus motivos y queda fuera de los totales.
Los resultados de herramientas repetidos pueden ser intencionados. Una comparación
por pares es una observación, no prueba de un ahorro causal, de la calidad de la tarea
ni del margen de suscripción que queda.
`,
    filterHelp: `Uso:
  trazum filter compact --recovery-dir <directorio-privado> [--stats]
  trazum filter restore <sha256> --recovery-dir <directorio-privado>
  trazum filter instructions                          imprime una guía de salida opcional

Filtro de visualización experimental y opcional. Solo se compactan las líneas de
log repetidas seguidas. Los errores y las líneas únicas se conservan. No es para
ficheros de código ni para tuberías de datos.
Usa pipefail de Bash para conservar el fallo del comando que produce el log.
Los logs originales pueden contener datos sensibles: --recovery-dir acepta de forma
explícita guardarlos en local. Borra ese directorio cuando ya no necesites los originales.
Los recuentos de tokens son estimaciones, no medidas de facturación ni de cuota de suscripción.
--stats escribe un registro JSON en stderr, sin contenido del log ni rutas de recuperación.
`,
    say: (message) => {
      const fixed = TASK_FILTER_ES.get(message);
      if (fixed !== undefined) return fixed;
      const missing = /^Missing --([a-z-]+)\. Run trazum task --help\.$/.exec(message);
      if (missing) return `Falta --${missing[1]}. Prueba con "trazum task --help".`;
      const tooLong = /^Input exceeds (\d+) characters; use a smaller complete task source\.$/.exec(message);
      if (tooLong) return `La entrada supera los ${tooLong[1]} caracteres; usa una fuente de tarea completa más pequeña.`;
      return message;
    },
  },
  help: (d, bold) => `${bold('trazum')}: lo que cuestan tus agentes de IA y tus llamadas a la API, leído de los logs de esta máquina.

${bold('EMPIEZA AQUÍ')}
  trazum bill                 Cada sesión de Claude Code, Codex y Gemini CLI de
                              esta máquina, por agente, proyecto y modelo
  trazum bill <log|dir>       Cualquier log de uso o export de proveedor que reconozca
  trazum bill --by month      La misma factura, mes a mes (o día, semana)

${bold('USO')}
  trazum init [dir] [--dry-run | --yes]
  trazum optimize <fichero|-> [opciones]
  trazum check <fichero|dir|-> --max-tokens <n> [opciones]
  trazum baseline [dir] [opciones]
  trazum eval <fichero> --cases <fichero> [opciones]
  trazum eval <fichero> --cases <fichero> --export promptfoo -o suite.json
  trazum route <log.jsonl> --prompt-file <fichero> --cases <fichero> --yes
  trazum plan <log.jsonl|dir> [opciones]
  trazum verify <plan.json> --against <nuevo.jsonl|dir> [opciones]
  trazum profile <log.jsonl|dir> [opciones]
  trazum history <dir-de-informes-guardados> [opciones]
  trazum connect <proveedor> [opciones]
  trazum store [--prune] [opciones]
  trazum watch [--once | --interval 15m] [--sessions] [--notify] [opciones]
  trazum serve [--port <n> | --socket <ruta>]
  trazum diff <antes> <después> [opciones]
  trazum diff --all <dir> <dir> [opciones]
  trazum rank <dir> [opciones]
  trazum doctor [dir] [opciones]
  trazum blame <fichero> [opciones]
  trazum prune <fichero> --cases <fichero> --yes
  trazum where [fichero]
  trazum conform <fichero|-> [--contract <nombre>]
  trazum schema <contrato>
  trazum rollup <documento...|dir> [--json] [--html-out <fichero>]
  trazum position <uso.jsonl>
  trazum receipt <uso.jsonl> [--stamp] [--since <cuándo>] [--until <cuándo>] [-o <fichero>]
  trazum bill [<fichero|dir>...] [--label <nombre>] [--no-label-from-project] [--receipt|--table] [--stamp] [-o <fichero>]
              [--since <cuándo>] [--until <cuándo>] [--by day|week|month] [--pdf-out|--html-out|--markdown-out|--csv-out|--otlp-out|--prom-out <fichero>]
              [--agent <nombre>] [--timezone <zona>] [--git-range <rango> [--delivery]]
  trazum weekly [<fichero|dir>...] [--until <cuándo>] [--label <nombre>] [--notify] [-o <fichero>]
  trazum from-claude-code <fichero|dir> [--label <nombre>] [-o <fichero>]
  trazum from-codex <fichero|dir> [--label <nombre>] [-o <fichero>]
  trazum from-gemini-cli <fichero|dir> [--label <nombre>] [-o <fichero>]
  trazum from-otel <fichero|dir> [--label-from-service] [-o <fichero>]
  trazum from-litellm <fichero|dir> [-o <fichero>]
  trazum from-anthropic <usage.json> [--label <nombre>] [--label-by-workspace <fichero>] [-o <fichero>]
  trazum from-openai <usage.json> [--label <nombre>] [--label-by-project <fichero>] [-o <fichero>]
  trazum from-openrouter <activity.json> [--label <nombre>] [--label-by-workspace <fichero>] [-o <fichero>]
  trazum from-ccusage <ccusage.json> [--label <nombre>] [--label-by-project <fichero>] [-o <fichero>]
  trazum reconcile <receipt.json> --against <cost.json> [-o <fichero>]
  trazum from-helicone <fichero|dir> [-o <fichero>]
  trazum from-langsmith <fichero|dir> [-o <fichero>]
  trazum switch <uso.jsonl> --to <modelo> [--migration-usd <n>] [--cases <n>]
  trazum ownrate --gpu-usd-hour <n> --tokens-per-second <n> [--utilization <0-1>]
  trazum model-pricing <managed-settings.json> --reviewed <AAAA-MM-DD> [-o <fichero>]
  trazum pulse [--max-stale-hours <n>]
  trazum proactive [status|on|off] [--only <elemento,...>] [--dry-run | --yes] [--json]
  trazum session-guard [status|install|uninstall] --warn <usd> --stop <usd> --on-cannot-tell <fail-open|fail-closed> [--dry-run | --yes]
  trazum waste <transcripcion.jsonl> [--min-reads <n>] [--claude-md <fichero>] [--mcp-servers <a,b>] [--json]
  trazum bench [--workload <id>] [--record <fichero>] [--against <fichero> --max-ratio <n>] [--json]
  trazum write [--answers <fichero>] [--json] [-o <fichero>]
  trazum models
  trazum rules [--measure <dir>] [--level <safe|aggressive>]
  trazum gateway <proveedor> --on-cannot-tell <fail-open|fail-closed> [--metrics-port <n>]
  trazum experiment <log> --a <etiqueta> --b <etiqueta> --min-outcomes <n>
  trazum quality <log> --label <nombre> --at <iso> [--gate]
  trazum semantic <prompt> [--yes]
  trazum commitment <log> --floor <usd> --discount <pct> [--months 12]
  trazum report <log> --year <aaaa>
  trazum owners <log>
  trazum ladder <log>
  trazum feedback
  trazum filter compact|restore|instructions [--recovery-dir <directorio>]
  trazum task analyze|policy|apply|revert|compare [--help]
  trazum --version

${bold('OPCIONES DE init')}
  --dry-run                   Imprime la configuración que escribiría y no escribe nada.
  --yes                       Reemplaza un trazum.config.json que ya exista. Sin
                              esto, una configuración existente se deja intacta.
  --json                      La propuesta como datos, incluida cada clave que
                              descartó y por qué. No escribe nada.

  Los primeros cinco minutos: encuentra tus prompts, lee tu código para saber a
  qué proveedor llama, busca un registro de consumo o una credencial para uno, y
  escribe una configuración con lo que puede justificar de verdad. Después imprime
  lo más valioso que encontró, con la aritmética delante.

  Nunca se inventa un umbral. Un presupuesto es una política, así que init te da la
  cifra medida y te deja el límite a ti: una configuración generada llena de
  números adivinados no se la cree nadie.

${bold('OPCIONES DE conform')}
  --contract <nombre>         Comprueba contra un contrato concreto en vez de
                              detectarlo: ${d.contracts.join(', ')}.
  --json                      El informe como datos.

  Responde dos preguntas y las mantiene separadas. ¿Cumple este documento:
  campos obligatorios, presentes y del tipo correcto; sale con 1 si no. Y qué no
  puede responder un documento válido de esta forma, con el campo que lo
  desbloquearía.

  La segunda nunca hace fallar nada. Decidir no registrar sesiones es una
  decisión, no un defecto. Ver docs/format.md.

${bold('OPCIONES DE rollup')}
  --json                      El documento de agregación como datos. Ver
                              docs/format.md.
  --html-out <fichero>        Escribe además el roll-up como un único HTML
                              autocontenido, el informe de equipo, para quien
                              paga la factura. Los huecos de cada contribuyente
                              se quedan bajo ese contribuyente, y lo que ninguna
                              fusión puede medir va en la caja de salvedades,
                              imposible de recortar.

  Las facturas de varias personas, una sola agregación. Cada contribuyente
  ejecuta \`trazum profile --json\` donde ya está su tráfico; esto fusiona los
  documentos. Un formato y una fusión, no un servicio: no se sube nada y no hay
  cuenta: los documentos llegan como tu equipo ya mueve ficheros.

  Casi toda la salida es lo que la fusión no pudo hacer. Los huecos de cada
  contribuyente se quedan con ese contribuyente en vez de promediarse en una
  sola cifra, los hallazgos que necesitan llamadas individuales se nombran en
  vez de desaparecer, y toda agregación de más de un documento dice que el
  solapamiento entre contribuyentes no se puede medir: dos personas exportando
  el mismo tráfico duplican la factura y ninguna fusión de resúmenes lo ve.

  Sale con 1 cuando una contribución se entregó y no se pudo agregar.

${bold('OPCIONES DE receipt')}
  --stamp                     Registra la hora de emisión en el documento.
                              Desactivado por defecto para que dos ejecuciones
                              sobre un log den los mismos bytes: el periodo que
                              cubren las cifras ya está dentro, leído del reloj
                              del propio log.
  -o, --out <fichero>         Escribe el recibo ahí en vez de en la salida
                              estándar. El resumen siempre va al error
                              estándar, así que una redirección escribe un
                              documento y no un documento con un resumen
                              pegado delante.
  --since <cuándo>            El periodo que cubre el recibo, como lo toma
  --until <cuándo>            bill: un día UTC, una marca de tiempo, 30d o
                              "now". Las llamadas sin marca de tiempo quedan
                              fuera y se nombran como hueco undated-excluded.
  --pricing <fichero>         Lo precia con tu propia tarjeta de precios en
                              vez de con el catálogo incluido.
  --pricing-live              Lo precia con tarifas en vivo vía OpenRouter.

  Un perfil responde donde se ejecutó. Un recibo son las mismas cifras con la
  forma que las deja seguir respondiendo en otro sitio: cada línea lleva las
  tarifas que produjeron su dinero y la fecha en que las de ese proveedor se
  leyeron por última vez de su propia página. Lo que no lleva es texto del
  prompt, respuestas, rutas de fichero, nombres de rama, credenciales ni
  sesiones: no censurados, ausentes, porque la forma de la que se construye no
  tiene campo donde meterlos. No envía nada a ningún sitio.

${bold('OPCIONES DE write')}
  --answers <fichero>         Un objeto JSON de ids de slot y respuestas. Sin
                              esto, las preguntas se hacen una a una; una línea
                              vacía declina una, que también es una respuesta.
  --json                      El documento prompt-draft, negativas incluidas.
  -o, --out <fichero>         Dónde escribir el prompt. Por defecto stdout, con
                              todo lo demás en stderr.
  --calls <n>                 Llamadas al mes, para la estimación.
  --avg-output <n>            Tokens de salida por llamada, para la estimación.

${bold('OPCIONES DE position')}
  --html-out <fichero>        La posición como una página autocontenida, las
                              mismas frases que imprime el terminal, caveats
                              primero, para quien no ejecuta CLIs.
  --json                      El documento de posición, verificado por
                              contrato como todo (\`--contract position\`).

  Dónde está el mes frente a cada techo configurado, medido solo desde el
  log nombrado y con el denominador en cada cifra. La línea de distancia es
  división sobre el pasado, etiquetada como tal, y ausente bajo el suelo de
  siete días, con un techo superado o con tasa cero: nunca un pronóstico, y
  ningún campo del documento nombra una fecha.

${bold('OPCIONES DE switch')}
  --to <modelo>               El modelo candidato, por id del catálogo.
  --migration-usd <n>         Lo que costaría la migración en sí, declarado
                              por ti. Desbloquea la línea de break-even.
  --cases <n>                 Cuántos casos de evaluación correrías.
                              Desbloquea la línea que tasa esa evaluación.

  La decisión a la que sirve cada what-if, tasada: qué cuesta este mix medido
  en el candidato, el ahorro con su signo dicho, y, con un coste de
  migración declarado, el break-even como división sobre el pasado medido,
  con los días de ventana adjuntos, nunca un pronóstico. La evaluación que el
  cambio exige se tasa a la llamada media de este log: dos llamadas al
  titular y una al candidato por caso. Lo que se niega a decir: nada sobre
  calidad: ese veredicto es de trazum route, y el informe termina
  imprimiéndolo.

${bold('OPCIONES DE ownrate')}
  --gpu-usd-hour <n>          Lo que te cuesta una hora de tu hardware.
  --tokens-per-second <n>     Rendimiento que mediste en tu propio serving.
  --utilization <0-1>         Fracción de la hora realmente sirviendo.
                              Por defecto 1.

  El $/MTok de tu modelo self-hosted, derivado de tus dos números, división
  y nada más: sin amortización, sin modelo de energía, sin eficiencia
  supuesta. Imprime la cifra y el snippet de overlay de precios para pegar
  en trazum.config.json, de modo que el modelo que tú mismo sirves sea una
  fila de primera en cada informe, tasado por ti y marcado como tal.

${bold('OPCIONES DE model-pricing')}
  --reviewed <AAAA-MM-DD>     Cuándo se comprobaron las tarifas contra el
                              contrato por última vez. Obligatorio.
  -o, --out <fichero>         Escribe el overlay ahí en vez de en stdout.

  Las tarifas contratadas que tu organización dio a Claude Code en su ajuste
  gestionado modelPricing, como overlay para --pricing, para que las cifras
  de Trazum coincidan con las que muestra Claude Code. Lo que la tabla no
  puede decir, lotes y modo rápido, conserva la cifra del catálogo y se
  nombra por modelo.

${bold('OPCIONES DE reconcile')}
  --against <fichero>         El informe de costes del proveedor: el
                              GET /v1/organizations/cost_report de Anthropic o
                              el GET /v1/organization/costs de OpenAI, que se
                              distinguen por su forma.
  -o, --out <fichero>         Escribe la comparación ahí en vez de en stdout.

  Lo que Trazum calculo junto a lo que el proveedor facturó, nunca sumado:
  dos tablas de precios en una sola cifra es como un informe se vuelve
  silenciosamente falso. Descarga el de Anthropic con group_by[]=description
  y el de OpenAI con group_by[]=line_item, y la diferencia queda atribuida -
  lo que ninguna tarifa por token cubre, y en Anthropic lo que fue batch -
  dejando un resto que es la única cifra que merece discusión. El informe de
  OpenAI nunca nombra batch, así que ahí se queda dentro del resto y la
  ejecución lo dice. Las ventanas deben coincidir o no se compara nada, y una
  moneda sin tipo de cambio se rechaza en vez de convertirse.

${bold('OPCIONES DE from-anthropic')}
  --label <nombre>            El proyecto al que pertenece este uso. El
                              proveedor no conoce tus nombres de proyecto.
  -o, --out <fichero>         Escribe el log de uso ahí en vez de en stdout.

  El informe de uso de Anthropic, leído como log. Lo descargas tú con tu propia
  credencial de admin; esto lee la respuesta, así que Trazum nunca sostiene una
  clave de proveedor. Pide group_by[]=model, porque una fila sin modelo no se
  puede cobrar, y group_by[]=service_tier, porque batch se factura con
  descuento y cobrarlo a tarifa de catálogo inflaría la factura. Las filas de
  cualquier otro tramo se quedan fuera y se cuentan, las búsquedas web se
  cuentan y nunca se cobran por token, y has_more avisa de que falta página.

${bold('OPCIONES DE from-openai')}
  --label <nombre>            El proyecto al que pertenece este uso. El
                              proveedor no conoce tus nombres de proyecto.
  --label-by-project <fichero> Una etiqueta por id de proyecto, como array JSON
                              de {"project": "proj_…", "label": "nombre"}.
                              Coincidencia exacta; --label es el respaldo.
  -o, --out <fichero>         Escribe el log de uso ahí en vez de en stdout.

  El informe de uso de OpenAI, leído como log, con el mismo arreglo que
  from-anthropic: tu curl, tu clave de admin, y esto lee la respuesta. Pide
  group_by[]=model, porque una fila sin modelo no se puede cobrar, y
  group_by[]=batch, porque un trabajo por lotes se factura con descuento y
  cobrarlo a tarifa de catálogo inflaría la factura. Cualquier tramo de
  servicio que no sea default se queda fuera y se nombra. Los tokens de audio
  e imagen nunca se cobran a tarifa de texto: una fila que los trae se reduce
  a su parte de texto y el resto se cuenta donde puedas verlo.

${bold('OPCIONES DE bill')}
  --label <nombre>            El proyecto al que pertenece este uso, para las
                              formas que lo admiten.
  --since <cuándo>            Factura solo las llamadas de este periodo: un día
  --until <cuándo>            UTC (2026-10-01), una marca ISO 8601 completa,
                              una ventana relativa (30d, 24h) o "now". Un día
                              solo significa el día entero. Las llamadas sin
                              marca de tiempo no se pueden situar y quedan
                              fuera, contadas en el recibo como hueco, nunca
                              tiradas en silencio.
  --by <day|week|month>       Reparte el extracto por día UTC, semana ISO (de
                              lunes a domingo) o mes. Sin él, una factura que
                              abarca dos meses o más se reparte por mes.
  --timezone <zona>           Corta esos días, y un día suelto de --since/--until,
                              en esta zona IANA (Europe/Madrid) en vez de UTC. El
                              extracto dice cuál. No con --otlp-out,
                              --prom-out, --markdown-out, --html-out, --pdf-out ni un
                              --csv-shape distinto de slice: cortan los días en UTC.
  --agent <nombre>            Factura solo los registros de un agente de código:
                              claude-code, codex o gemini-cli. Un log suelto o una
                              exportación de proveedor no pertenece a ningún agente
                              y queda fuera, contado.
  --git-range <rango>         En vez de una factura, dice qué se registró en las
                              sesiones de Claude Code de este repositorio entre la
                              primera hora de autor y la última de commit del
                              rango (main..HEAD), ejecutado desde el repositorio.
                              Solo entran en la cifra las sesiones que empezaron y
                              terminaron dentro del periodo; las que cruzaron un
                              extremo se nombran y cuentan aparte. Es todo lo
                              gastado entonces en este repositorio, no el coste
                              del cambio. No con --since, --until, --label ni salida.
  --delivery                  Con --git-range, dice además qué muestra git local que
                              llegó en el mismo rango (commits, pull requests con
                              número en un asunto, días con un commit) y divide la
                              cifra por cada uno. Solo recuentos: no se lee ningún
                              nombre, mensaje ni hash. Un promedio del periodo, no
                              lo que costó un commit o una pull request.
  --otlp-out <fichero>        Escribe además la factura como métricas OpenTelemetry
                              (JSON OTLP/HTTP): por día UTC cerrado, coste, tokens
                              y llamadas por proyecto, modelo y agente, y lo que no
                              se pudo cobrar como métrica aparte. Cada punto de coste
                              dice que es equivalente a API, no lo que pagó un plan.
                              Hoy, y un día que corta la ventana --since/--until, no
                              son puntos: el recurso dice cuáles y qué contenían.
                              Trazum escribe el fichero; tu pipeline lo envía.
  --prom-out <fichero>        Escribe además las mismas métricas en el formato de
                              texto de Prometheus, para el textfile collector del
                              node exporter: una serie por día UTC cerrado (su
                              etiqueta trazum_day), sin timestamps, sin enviar nada.
  --stamp                     Sella el recibo con la hora en que se escribió.
  -o, --out <fichero>         Escribe el recibo ahí en vez de en stdout.

  Sin ruta, lee las carpetas de sesiones de cada agente que encuentra:
  Claude Code (~/.claude/projects), Codex ($CODEX_HOME/sessions y
  archived_sessions) y Gemini CLI (~/.gemini/tmp/*/chats), cada una nombrada
  en stderr, y añade una tabla por agente cuando gastó más de uno.

  Una sola puerta. Lee un archivo o un directorio, reconoce la forma de cada
  archivo por su propio texto - una sesión de Claude Code, Codex o Gemini CLI, spans OTel,
  un export de LiteLLM, Helicone o LangSmith, un informe de Anthropic, OpenAI
  u OpenRouter, o un log de uso plano - lo convierte con el mismo conversor
  que usa el comando dedicado, lo cobra y termina en el recibo. Un archivo
  que ninguna forma reclama se nombra, no se adivina; uno que reclaman dos se
  nombra como ambiguo y se deja en paz; un informe de costes de proveedor se
  remite a reconcile. La línea de cada archivo dice cuántas filas quedaron
  fuera, y el comando from-<forma> dedicado dice por qué.

${bold('OPCIONES DE weekly')}
  --until <cuándo>            Dónde termina la semana: un día UTC (2026-11-19,
                              el día entero), una marca de tiempo, una ventana
                              relativa o "now", el valor por defecto. La semana
                              son los siete días anteriores, y se compara con
                              la semana anterior a esa.
  --label <nombre>            El proyecto al que pertenece este uso, para las
                              formas que lo admiten.
  --notify                    Muestra además una notificación de escritorio con
                              una línea del resumen, la factura y su movimiento,
                              con lo que tenga la plataforma (como watch
                              --notify). Se dice, no es fatal, si no hay.
  -o, --out <fichero>         Escribe el resumen ahí en vez de en stdout.

  La semana en Markdown: la factura, qué se movió respecto a la semana
  anterior y los tres cambios que conviene hacer primero. Lee lo que lee
  bill y, sin ruta, las carpetas de sesiones de cada agente. Las dos semanas
  son medidas, de los mismos logs y con la misma lista de precios. Los
  cambios son proyecciones y lo dicen, cada uno junto a lo que costó su
  carga de trabajo esta semana; trazum verify es lo que los mide después.
  Cada importe en dólares y cada porcentaje se comprueba contra las facturas
  de las dos semanas antes de escribir nada, y se rechaza un resumen con uno
  que no esté ahí. No envía nada a ningún sitio: el archivo es la salida, y
  la GitHub Action es la que lo publica.

${bold('OPCIONES DE from-openrouter')}
  --label <nombre>            El proyecto al que pertenece este uso.
  --label-by-workspace <fichero> Una etiqueta por id de workspace, como array
                              JSON de {"workspace": "…", "label": "nombre"}.
                              Coincidencia exacta; --label es el respaldo.
                              Requiere el informe pedido con group_by=workspace.
  -o, --out <fichero>         Escribe el log de uso ahí en vez de en stdout.

  El informe de actividad de OpenRouter (GET /api/v1/activity, clave de
  gestión, los últimos treinta días), leído como log de uso con los mismos
  slugs de modelo que usa el overlay de precios de OpenRouter, así que cientos
  de modelos se pueden cobrar de golpe. Lo que OpenRouter cobró se imprime
  junto a la cifra de Trazum y nunca se suma a ella. Los tokens de razonamiento
  se cuentan y no se añaden, porque el esquema no dice si el recuento de
  completado ya los incluye.

${bold('OPCIONES DE from-ccusage')}
  --label <nombre>            El proyecto al que pertenece este uso.
  --label-by-project <fichero> Una etiqueta por proyecto tal como lo nombra
                              ccusage, como array JSON de {"project": "…",
                              "label": "nombre"}. Coincidencia exacta; --label
                              es el respaldo. ccusage nombra proyectos en
                              claude daily --instances y en claude session.
  -o, --out <fichero>         Escribe el log de uso ahí en vez de en stdout.

  El JSON que escribe ccusage --json (sus informes daily, weekly, monthly y
  session, solo de Claude Code o de todos los agentes que encontró), leído como
  log de uso: un registro por cada modelo de cada fila, valorado con el
  catálogo. Lo que ccusage cobró por las mismas cuentas se imprime al lado,
  modelo a modelo, y nunca se usa para valorar. Una fila es el total de un
  día, una semana, un mes o una sesión, no una llamada. El nombre de un
  proyecto, que es una ruta, solo se escribe como la etiqueta que tú le des.
  Lee el archivo que recibe: no ejecuta ccusage. bill lee el mismo archivo y
  cuenta sus filas como filas; el log que se escribe aquí se lee como
  cualquier otro, y sus registros se cuentan como llamadas.

${bold('OPCIONES DE from-helicone')}
  -o, --out <fichero>         Escribe el log de uso ahí en vez de en stdout.

  Un export de peticiones de Helicone, leído como un log de uso: modelo, marca
  de tiempo, etiqueta y los recuentos de tokens de cada fila, y nada más. El
  cuerpo de la petición, el de la respuesta y el id de usuario se quedan en la
  fila. Se pone precio al modelo que respondió, y las filas respondidas por un
  modelo distinto del pedido se cuentan. cache_enabled es una bandera y nunca
  un reparto de tokens, así que los veredictos de caché dicen "no se puede
  saber". Un request id es una llamada y nunca una conversación, así que los
  registros no llevan sesión y los hallazgos de conversación no se pueden
  responder desde este registro; se dice en cada ejecución.

${bold('OPCIONES DE from-langsmith')}
  -o, --out <fichero>         Escribe el log de uso ahí en vez de en stdout.

  Un export de runs de LangSmith, leído como un log de uso: modelo, marca de
  tiempo, etiqueta, la traza como sesión y los recuentos de tokens, y nada más.
  Los inputs y los outputs se quedan en el run, y de los metadatos se leen
  claves con nombre y nunca se copian enteros. Solo run_type "llm" es una
  llamada: cadenas, herramientas y retrievers se saltan y se cuentan, porque la
  cadena que envuelve una llamada repite los tokens de su hijo. Un run cuyos
  metadatos no nombran modelo se rechaza en lugar de tarifarlo por el nombre
  del run, que es una clase cliente. El coste propio de LangSmith se informa
  aparte y nunca se mezcla con el de Trazum.

${bold('OPCIONES DE from-litellm')}
  -o, --out <fichero>         Escribe el log de uso ahí en vez de en stdout.

  Un spend log de LiteLLM, leído como un log de uso: modelo, marca de tiempo,
  etiqueta, sesión y los recuentos de tokens de cada fila, y nada más. Los
  mensajes, la respuesta, la clave con hash, la dirección del solicitante y el
  usuario final se quedan en la fila. cache_hit es una bandera y nunca un
  reparto de tokens, así que los veredictos de caché dicen "no se puede saber"
  en vez de uno inventado. Las filas que no nombran modelo se cuentan y se
  dejan fuera: model_group es una ruta, no un modelo. La cifra de gasto propia
  de LiteLLM se imprime al lado de la de Trazum y nunca se funde con ella.

${bold('OPCIONES DE from-otel')}
  --label-from-service        Etiqueta cada registro con el nombre de servicio
                              de su span, para que salga una factura por
                              servicio.
  -o, --out <fichero>         Escribe el log de uso ahí en vez de en stdout.

  Spans GenAI de OpenTelemetry, leídos como un log de uso: modelo, marca de
  tiempo, etiqueta y los recuentos de tokens de cada span gen_ai.*, y nada
  más. El contenido del prompt y los trace ids se quedan en el span. OTel no
  tiene reparto de TTL de caché, así que los veredictos de caché dicen "no se
  puede saber" en vez de uno inventado. Los spans que no son de LLM se cuentan
  y se omiten, dicho en stderr.

${bold('OPCIONES DE from-codex')}
  --label <nombre>            Marca cada registro con una etiqueta.
  -o, --out <fichero>         Escribe el uso normalizado en vez de stdout.

  Lee un archivo o directorio de Codex indicado explícitamente, en local.
  Solo contadores corroborados: colapsa duplicados y excluye uso ambiguo.
  Los huecos se indican en stderr. Los precios son equivalentes API,
  nunca tu factura de suscripción. El contenido de prompts se descarta.

${bold('OPCIONES DE from-gemini-cli')}
  --label <nombre>            Marca cada registro con una etiqueta.
  -o, --out <fichero>         Escribe el uso normalizado en vez de stdout.

  Lee archivos de sesión de Gemini CLI (~/.gemini/tmp/<proyecto>/chats, .jsonl,
  y el .json antiguo de un solo documento), en local. Un registro por
  respuesta que traía tokens; una respuesta reescrita se lee una vez. Los
  tokens de razonamiento se valoran como salida y los resultados de
  herramientas como entrada, como los factura Google. Los precios son
  equivalentes API, no la factura de un nivel gratuito o un plan. Prompts,
  respuestas, razonamientos y contenido de herramientas se descartan.

${bold('OPCIONES DE from-claude-code')}
  --label <nombre>            Marca cada registro con una etiqueta.
  --label-from-project        Etiqueta cada registro con el nombre del
                              directorio de proyecto de su transcript, tal
                              cual; mapéalo a un nombre de workload con el
                              bloque \`labels\` de la config.
  -o, --out <fichero>         Escribe el log de uso ahí en vez de en stdout.

  Los transcripts de Claude Code, leídos como un log de uso: modelo, marca de
  tiempo, sesión y el propio objeto usage de la API, con el reparto de TTL de
  caché incluido, y nada más. Ni texto de mensajes, ni rutas, ni ramas cruzan
  la conversión. Una llamada a la API se escribe como una línea por bloque de
  contenido, así que las líneas se colapsan por id de petición; lo colapsado o
  descartado se dice en stderr, nunca en silencio.

${bold('OPCIONES DE proactive')}
  status                      Qué habla primero, activo o apagado: la línea de
                              estado y su hook Stop, un watch programado, el
                              servidor MCP. Una línea cada uno. Es lo
                              predeterminado y no escribe nada.
  on                          Ofrece cada uno que esté apagado, dice qué archivos
                              tocaría y cada línea que añadiría, y solo escribe
                              tras un sí para ese elemento.
  off                         Quita exactamente las líneas que añadió. Nada más
                              cambia en esos archivos.
  --only <elemento,...>       Limita a statusline, watch o mcp.
  --dry-run                   Imprime cada archivo y cada línea, no escribe nada.
                              Es lo que hace hasta que alguien dice que sí: sin
                              terminal y sin --yes es un simulacro.
  --yes                       Dice que sí a todos, sin preguntar.
  --json                      El informe como datos. Ver docs/json-output.md.

  Las tres cosas que Trazum puede decir sin que se lo pidan, apagadas hasta que
  alguien las conecta a mano. Edita ~/.claude/settings.json, tu crontab y la
  configuración MCP del proyecto donde se ejecuta (.mcp.json,
  .cursor/mcp.json), y nada más. Un archivo que no puede leer, o un enlace
  simbólico, se deja como está y se nombra. Una línea de estado ya configurada
  nunca se reemplaza. No envía nada a ningún sitio: las tres leen archivos que
  ya están en esta máquina.

  Nunca inventa un presupuesto ni llena el almacén. Un watch sin almacén o sin
  límite de gasto está "no listo", con el comando o la clave que lo dejaría
  listo.

${bold('OPCIONES DE pulse')}
  --max-stale-hours <n>       Sale con 1 cuando algo que corre aquí lleva más
                              de n horas sin correr. Sin esto, se informan las
                              edades y no se juzga nada.
  --json                      El informe como datos.

  ¿Corrieron las cosas que tienen que correr? \`watch --once\` está hecho para un
  planificador, y su fichero de estado lo lee exactamente una cosa: el siguiente
  ciclo. Así que nada podía decirte que el vigilante se había parado, porque lo
  que te lo diría era lo que se había parado.

  No ejecuta nada y no aloja nada. Algo tiene que darse cuenta, y ese algo es tu
  CI: un paso que ejecute esto con el horario que ya tienes convierte un cron
  muerto en una build roja, sin que Trazum guarde las métricas de nadie.

  Nunca falla por una primera ejecución que nunca ocurrió (no hay cadencia
  contra la que ir tarde) ni por hasta dónde llegan las mediciones, que es un
  proveedor informando a su ritmo y no un trabajo que falló.

${bold('OPCIONES DE session-guard')}
  status                      Si el hook está en ~/.claude/settings.json, y con
                              qué cifras. Es lo predeterminado; no escribe nada.
  install                     Añade el hook a los eventos UserPromptSubmit y
                              PreToolUse. Dice el archivo y cada línea antes, y
                              solo escribe tras un sí.
  uninstall                   Quita exactamente el hook que añadió.
  check                       Lo que ejecuta el hook: lee la transcripción de la
                              sesión, le pone precio con el catálogo incluido y
                              avisa una vez, detiene (código de salida 2) o
                              calla. No es para escribirlo a mano.
  --warn <usd>                Avisa una vez por sesión con este coste equivalente
                              en API.
  --stop <usd>                Detiene la sesión con este coste. Mayor que --warn.
  --on-cannot-tell <política> fail-open o fail-closed: qué pasa cuando no se
                              puede saber el coste (sin transcripción, un modelo
                              sin precio). Nunca cuenta el coste como cero.
  --dry-run, --yes            Como en proactive.

  No hay valor por defecto para los umbrales ni para la política: si falta uno,
  el comando se niega y lo nombra. Toda cifra es coste equivalente en API, lo que
  costaría el uso a los precios de lista de la API del proveedor, no lo que te
  cobraron. Nada sale de esta máquina.

${bold('OPCIONES DE waste')}
  <transcripcion.jsonl>       La transcripción de una sesión de Claude Code. Se
                              leen también las de sus subagentes, en la carpeta
                              de al lado.
  --min-reads <n>             Lista un fichero solo si se leyó al menos n veces
                              (2 o más; por defecto 3). Elige lo que se lista,
                              no lo que se cuenta.
  --claude-md <fichero>       El CLAUDE.md que medir. Sin él, el CLAUDE.md del
                              directorio donde corrió la sesión, si lo hay. Solo
                              se lee su tamaño en bytes, nunca su contenido.
  --mcp-servers <a,b>         Los servidores MCP que estaban cargados, cuando la
                              transcripción no lo dice. Solo nombres.

  Nombra un coste y lo valora al catálogo incluido, con los recuentos de esta
  sesión: un fichero leído otra vez, un servidor MCP cargado y nunca llamado, un
  CLAUDE.md que se paga en cada turno. Recomienda y no edita ningún fichero. Un
  coste que no se puede calcular con lo que registra la transcripción se nombra
  y no se valora. Toda cifra es coste equivalente en API, no lo que te cobraron.

${bold('OPCIONES DE bench')}
  --workload <id>             Ejecuta una sola carga estándar en vez de todas.
                              Un id desconocido se rechaza nombrando los conocidos.
  --record <fichero>          Escribe además los ratios medidos como baseline,
                              para commitear. El fichero que --against lee.
  --against <fichero>         Juzga los ratios de esta pasada contra un baseline
                              grabado. Sale con 1 cuando alguna carga medida
                              supera su ratio grabado por --max-ratio.
  --max-ratio <n>             El factor declarado, al menos 1. Obligatorio con
                              --against: cuánta regresión es demasiada es una
                              política, y esta herramienta no escribe la tuya.
  --json                      Las mediciones como datos. La forma no cambia con
                              los flags del gate: el veredicto es el código de
                              salida y frases en stderr, como hace check.

  Mide esta máquina: las cargas estándar, una pasada cada una, tiempo de pared y
  RSS pico. El reloj de pared es para una persona con un cambio entre manos; el
  gate sostiene el ratio entre la carga y un bucle de calibración en el mismo
  proceso, porque un runner de CI miente sobre el tiempo a ambos por igual y la
  mentira se cancela. Cada carga corre en su propio proceso hijo, así que cada
  pico es solo suyo; las entradas se generan, son deterministas y nunca se
  escriben en tu proyecto.

${bold('OPCIONES DE rules')}
  --measure <dir>             Mide lo que recupera realmente cada regla sobre
                              los prompts de ese directorio, en vez de listar
                              qué hace cada una.
  --level <safe|aggressive>   Qué reglas medir. Por defecto: safe.
  --json                      La medición como datos.

  Sin --measure lista las reglas y para qué sirve cada una. Con él, el
  optimizador se ejecuta una vez con cada regla sola y una vez con cada regla
  quitada, y se imprimen ambas cifras: donde dos reglas encuentran los mismos
  tokens divergen, y cualquiera de las dos por separado se equivocaría en una
  dirección distinta.

  El suelo se separa. El optimizador normaliza espacios haya reglas activas o
  no, y atribuir eso a las reglas es como sobrevive un porcentaje de titular en
  un corpus donde las reglas no recuperan nada.

  "Inerte" se dice siempre sobre el corpus. Una regla que no encuentra nada en
  estos ficheros no ha demostrado no encontrar nada en ninguna parte.

${bold('OPCIONES DE task')}
  --id <id> --type <tipo>     Identifica una tarea y su tipo comparable.
  --criterion <texto>        Declara el criterio de aceptación antes del cambio.
  --claude-code <fichero>    Añade una sesión explícita de Claude Code; repetible.
  --codex <fichero>          Añade una sesión explícita de Codex; repetible.
  --outcome <valor>          accepted, rejected o unknown (por defecto unknown).
  --assessor <etiqueta>      Obligatorio para un resultado accepted o rejected.
  --policy <id>             baseline (por defecto) o repeat-review-v1.
  --instructions <fichero>  Archivo local existente para apply o revert.
  -o, --out <fichero-nuevo>  Crea un informe o política privados; no sobrescribe.
  --json                    Los informes y comparaciones ya usan JSON por defecto.
  Consulta task --help para analyze, policy, apply, revert y compare.
  Máximo 400.000 caracteres entre fuentes. Nunca se infiere el éxito de la tarea.

${bold('OPCIONES DE filter')}
  --recovery-dir <directorio> Directorio privado; obligatorio para compact/restore.
  --stats                    Solo compact: emite ahorro neto estimado en JSON por stderr.
  trazum filter --help explica el filtro opcional (ayuda en inglés).

${bold('OPCIONES DE feedback')}
  (ninguna)

  Imprime dónde reportar una optimización incorrecta, un fallo, una pregunta o
  un problema de seguridad, y una incidencia en blanco con la versión, el
  runtime y la plataforma ya puestos, mostrados enteros antes para que no viaje
  nada que no hayas leído.

  No envía nada. Trazum no tiene telemetría: ni ping, ni hook de instalación, ni
  contador anónimo, y una prueba hace fallar la compilación si este comando
  llega a tocar la red.

${bold('OPCIONES DE gateway')}
  --on-cannot-tell <política> Obligatorio, sin valor por defecto: fail-open o
                              fail-closed. Qué pasa cuando la pasarela no puede
                              juzgar una llamada: sin presupuesto, sin nada
                              medido, un modelo sin precio.
  --port <n> | --socket <p>   Dónde escuchar. Solo loopback, siempre.
  --metrics-port <n>          Sirve lo que la pasarela ha contado desde que
                              arrancó, en texto de Prometheus, en GET /metrics
                              de este segundo puerto loopback. Apagado si no se
                              da. Solo recuentos y coste a tarifa de lista,
                              nunca un prompt.
  --log <uso.jsonl>           El log de uso contra el que se mide la política
                              de limits, leído una vez al arrancar, el mismo
                              flag que en serve, por la misma razón: el gasto
                              por etiqueta y sesión vive en un log de uso, no
                              en el almacén.

  Se pone entre tu SDK y el proveedor, hablando su formato, así que no hay
  cambios de código. El consumo se mide desde la propia respuesta del proveedor
  según llega: sin exportación, sin retraso, sin días que falten.

  Rechaza y nunca sustituye: una llamada por encima del presupuesto recibe un
  HTTP 402 con las alternativas más baratas nombradas. La sustitución solo
  ocurre donde la escribiste en spend.substitute, con tu motivo, y toda llamada
  sustituida queda marcada.

  Tu credencial se reenvía intacta y nunca se lee. Ver docs/gateway.md.

${bold('OPCIONES DE experiment')}
  --a <etiqueta>, --b <etiqueta>  Las dos cargas a comparar.
  --min-outcomes <n>          Obligatorio: cuántos resultados debe registrar
                              cada brazo antes de poder leer el resultado. Una
                              regla de parada declarada después de mirar los
                              números no es una regla de parada, y el informe
                              dice si se respetó.

  Juzga resultados registrados y coste a la vez. Tres valores: gana A, gana B,
  o no separables, con cuántos resultados por brazo lo zanjarían, para que
  "déjalo correr más" sea una instrucción y no un encogimiento de hombros.

${bold('OPCIONES DE quality')}
  --label <nombre>            La carga a juzgar. Obligatorio: una mezcla
                              promediaría una regresión hasta hacerla
                              desaparecer.
  --at <iso>                  Cuándo aterrizó el cambio. Obligatorio: sin
                              frontera no hay nada que comparar, y elegir una
                              sería que esta herramienta decida a qué culpar.
  --gate                      Sale con 1 si hay caída medida, 2 si no se puede
                              decir. Tres resultados, nunca dos.

  Un antes y después, no un experimento, así que dice "no se puede decir"
  siempre que la mezcla de modelos, el volumen o la cobertura se movieran a
  través de la frontera: el prompt no es la única variable y lo dice.

${bold('OPCIONES DE semantic')}
  --yes                       Obligatorio para enviar nada. Sin él, el comando
                              imprime lo que costaría la llamada y para.
  --model <id>                Qué modelo preguntar. Se tarifa del catálogo.

  Encuentra lo que un diccionario no puede: la misma regla enseñada dos veces
  con otras palabras, una instrucción repetida lejos, una política que una
  cláusula posterior contradice. Cada pasaje citado se comprueba carácter a
  carácter contra el prompt, los pares que el motor de reglas ya caza se
  descartan, y toda cifra de tokens se cuenta en vez de creérsela.

${bold('OPCIONES DE commitment')}
  --floor <usd>               Lo que te comprometes a gastar cada mes, después
                              del descuento. Obligatorio.
  --discount <pct>            Lo que te quitan de tarifa. Vale 20 y vale 0.2.
  --months <n>                Cuánto dura el acuerdo. Por defecto 12.

  Replica los meses completos medidos contra las condiciones del acuerdo. Se
  tarifan las dos direcciones: los meses que superaron el suelo, y lo que
  costó el suelo en los meses que se quedaron cortos, como cifra aparte,
  porque metida en el ahorro desaparece. Un cálculo sobre el pasado, nunca una
  previsión.

${bold('OPCIONES DE report')}
  --year <aaaa>               Obligatorio. Qué año montar.
  --json                      El registro como datos.

  Todo sale del almacén y de los planes que ya guardas: no se calcula nada
  que no se pueda comprobar contra un documento que ya existe. Los meses sin
  registro se nombran en vez de rellenarse, las promesas se cuentan en tres
  resultados y no en dos, y el informe lista lo que no puede decir.

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

  Ejecuta las dos versiones del prompt sobre tus casos y dice si la
  optimización ha cambiado las respuestas. Cuesta TRES llamadas por caso: el
  original dos veces, para medir la varianza propia del modelo, y el optimizado
  una. Esa base es la vara de medir: sin ella, un porcentaje de divergencia no
  significa nada. Sale con código 1 cuando las respuestas divergen de verdad.

${bold('OPCIONES DE rank')}
  --level <safe|aggressive>   Qué reglas cuentan como recuperables. Por defecto: safe.
  --model, --calls,           Calcula el coste de los tokens recuperables, como
  --output-tokens, --batch    en optimize.
  --prompt <nombre>           Qué prompt marcado tomar de cada fichero de código.
  --by-source                 La flota: un resumen por servicio desde el
                              bloque "sources" de la config (nombre → patrones
                              glob sobre rutas de registros), más un rollup
                              que nombra la fuente donde está el dinero. Los
                              porcentajes comparan totales, y cuando los
                              registros cubren periodos distintos el informe
                              lo dice en vez de dejar que un registro de 3
                              días parezca barato junto a uno de 30. Los
                              presupuestos por servicio viven en
                              spend.bySource y hacen fallar la ejecución
                              nombrando el servicio. Los ficheros sin patrón
                              se nombran, nunca se descartan en silencio.
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
  --all-labels                Con --from-log: cada prompt del mapa "labels"
                              de la config, optimizado y valorado contra su
                              propio tráfico medido, ordenado por lo que vale
                              el cambio, más los desajustes en ambos sentidos
                              (prompts mapeados sin tráfico, tráfico sin
                              prompt mapeado).
  --from-log <uso.jsonl>      Mide las tres cifras de arriba desde un registro
                              de uso en vez de teclearlas: llamadas reales,
                              tamaño de salida real, cuota de caché real y el
                              modelo al que fueron las llamadas. Rechaza los
                              flags tecleados a su lado, escala a un mes solo
                              con una semana completa de datos, y dice qué
                              cifras están medidas. Combínalo con --label, o
                              mapea el prompt en "labels" de trazum.config.json.
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
  --max-input <caracteres>    Sube (o baja) el techo de entrada de prompts, por
                              ejecución. Por encima, una puerta de prompt rechaza
                              nombrando el tamaño y el límite en vez de arrastrarse.
                              Los logs y documentos nunca se sujetan a él.
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
  --files-from <fichero|->    Comprueba solo los ficheros listados, una ruta por línea,
                              la forma que produce git diff --name-only, así que un hook
                              de pre-commit es una tubería:
                              git diff --cached --name-only | trazum check --files-from -
                              Las rutas que no son prompts y las eliminaciones se
                              descartan y se cuentan en voz alta; una lista sin nada
                              comprobable pasa. Los presupuestos aplican por fichero como
                              siempre; el baseline necesita el repositorio entero y se
                              omite, diciéndolo.
  --base <ref>                Pone además precio a cada prompt cambiado en ese commit y
                              aquí: tokens, y su coste de entrada al mes con las
                              llamadas al mes que "volumes" indica para su label, o por
                              llamada si no indica ninguna. Cada cifra nombra su precio
                              y el día en que se leyó. El commit se lee de esta copia
                              con git y nunca se descarga; si no está, se dice.
  --max-monthly-increase-usd <usd>
                              Con --base: falla si los prompts con volumen indicado
                              cuestan al mes más de estos dólares por encima de la
                              base. Desactivado salvo que se pase.

  Pensado para CI: sale con código 1 si el prompt supera el presupuesto,
  así una plantilla que crece sin control rompe la build en vez de la factura.

  Si le das un directorio, comprueba todos los prompts que hay dentro contra
  los patrones de "budgets" de ${bold('trazum.config.json')}: un solo paso de CI para
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
                              dinero es comparable: la puerta va en tokens, así que
                              cambiar el precio de un modelo nunca tumba una build por sí solo.
  --exact-tokens              Recuentos exactos (necesita ANTHROPIC_API_KEY).
  --json                      Resultado en JSON.

  Nunca falla. Registrar no es un veredicto, y un comando que pudiera fallar
  mientras escribe aquello con lo que arreglarías el fallo es un bucle.

${bold('OPCIONES DE ladder')}
  --since <cuándo>            Lee solo las llamadas de esta ventana. Un día UTC
  --until <cuándo>            (2026-08-14), una marca ISO 8601 completa, una
                              ventana relativa (7d, 24h) o "now". Las llamadas
                              sin "ts" no se pueden situar y quedan fuera: se
                              cuentan en voz alta, nunca se tiran en silencio.
  --label <nombre>            Juzga la escalera de un solo workload en vez de
                              todo el registro. Una etiqueta que no casa con
                              nada es un error que nombra las que existen.

${bold('OPCIONES DE owners')}
  --since <cuándo>            Lee solo las llamadas de esta ventana, en las
  --until <cuándo>            mismas formas que aceptan los demás comandos. Lo
                              que no reclama ningún dueño se reporta como sin
                              asignar y nunca se reparte entre los conocidos.

${bold('OPCIONES DE profile')}
  --against <log.jsonl>       Compara esta factura con un registro anterior.
                              Positivo significa que creció; los drivers van
                              ordenados por su contribución al cambio. No se
                              asume ningún periodo: juzga las llamadas antes
                              que el dinero.
  --label <nombre>            Perfila solo las llamadas con esta etiqueta, el
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
                              no anotó el TTL de escritura (una puerta que
                              leyera la mitad halagadora dejaría pasar las
                              facturas que existe para cazar) y dice qué
                              afirmación disparó.
  --max-day-usd <n>           Falla cuando un solo día UTC dentro del registro
                              gastó más que esto. Un mes dentro de presupuesto
                              puede esconder la tarde en que un bucle se comió
                              una cuarta parte. Un registro sin marcas de
                              tiempo falla: no medido no es dentro de
                              presupuesto.
  --max-session-usd <n>       Falla cuando una sola conversación del registro
                              costó más que esto, la unidad en la que revienta
                              un producto de agentes. Un registro sin sesiones
                              falla: no medido no es dentro de presupuesto.
  --since <cuándo>            Perfila solo llamadas desde/hasta ese momento. Un
  --until <cuándo>            día UTC (2026-08-14), una marca ISO 8601 completa,
                              una ventana relativa (7d, 24h) o "now";
                              --until con fecha sola incluye ese día entero. Las
                              llamadas sin "ts" no se pueden situar y quedan
                              fuera, contadas en voz alta, nunca en silencio.
                              Con --against, ambos registros llevan la misma
                              ventana.
  --what-if <modelo>          Pone precio a estas mismas llamadas en otro
                              modelo. Los mismos recuentos de tokens con otra
                              tarifa, una multiplicación, no un consejo, y lo
                              dice. Las llamadas mayores que la ventana de
                              contexto de ese modelo se nombran como
                              imposibles, no se cobran como baratas.
  --markdown-out <fichero>    Escribe además el informe en Markdown, para el
                              resumen de un job de CI o un comentario de PR.
  --html-out <fichero>        Escribe además el informe como un único HTML
                              autocontenido, el que se envía por correo a
                              quien paga la factura. Las mismas cifras que
                              --json, con las salvedades tan visibles como
                              los totales a los que acompañan.
  --pdf-out <fichero>         Escribe además el informe como PDF, para quien
                              aprueba la factura y lee adjuntos, no
                              terminales. Las cifras y salvedades del informe
                              HTML, un pie en cada página, sin fuentes
                              incrustadas, unos pocos kilobytes. bill también
                              lo acepta.
  --csv-shape <forma>         Qué tabla escribe --csv-out: slice (por defecto),
                              day, hour o model-day (una fila por día y
                              modelo: dibuja la mezcla moviéndose). Una sola
                              forma de fila por fichero, para que nada haya
                              que filtrar antes de sumarlo.
  --csv-out <fichero>         Escribe además el informe en CSV, una fila por
                              etiqueta y modelo. Sin fila de total, a propósito:
                              un total dentro de un fichero de datos acaba
                              sumado con los datos. Los modelos sin precio
                              conservan sus tokens y dejan las celdas de
                              dólares vacías, nunca a cero.
  --pricing <fichero>         Overlay local de precios, como en el resto.
  --json                      El informe completo como datos, palancas incluidas.

  Acepta un fichero de registro o un directorio de ellos: los registros
  rotados por día se leen en orden de nombre como una sola factura, y se dice
  cuántos se leyeron. También lee los comprimidos (.jsonl.gz y los demás),
  porque es lo que es un registro rotado un día después; uno que no se pueda
  descomprimir es un error que nombra el fichero, nunca una factura a la que
  le falta un día en silencio.

  Lee lo que el proveedor cobró de verdad. Campos opcionales desbloquean
  hallazgos: "label" (qué carga), "session" (qué conversación; se agrupa y
  nunca se imprime), "stop_reason"/"finish_reason" (respuestas cortadas en
  max_tokens).

${bold('OPCIONES DE plan')}
  --min-usd <n>               Deja fuera las acciones que valen menos de n
                              dólares. Cuántas quedaron fuera se dice, nunca
                              en silencio.
  --edits                     Añade una edición a cada fichero de prompt que
                              "labels" en trazum.config.json asigna a un
                              label: el texto de las reglas safe, guardado por
                              hash, sin escribirse. Solo ficheros que git
                              sigue. No se proyecta ningún ahorro.
  --reorder                   Con --edits: mueve los bloques estables delante
                              del primer marcador antes de recortar.
  -o, --out <fichero>         Guarda el plan como JSON fechado, el fichero al
                              que "trazum verify" lo atará después.
  --markdown-out <fichero>    Escribe además el plan como Markdown, para un
                              resumen de CI o un comentario de pull request.
  --pricing <fichero>         Tarifas locales superpuestas, como en el resto.
  --json                      El plan como datos.

  Lee un registro de uso y convierte los hallazgos del informe en un plan
  ordenado: enruta esto, agrupa aquello, arregla el par de truncados, mira la
  caché. El dinero está compuesto correctamente (ruta y batch sobre la misma
  porción llegan combinados, nunca sumados) y cada acción nombra lo que el
  registro no puede confirmar, porque un plan que esconde sus supuestos es un
  consejo haciéndose pasar por aritmética. El ahorro proyectado y el dinero ya
  gastado son totales separados en todas partes.

${bold('OPCIONES DE serve')}
  --port <n>                  Puerto en 127.0.0.1. Por defecto: 7317.
  --socket <ruta>             Escucha en un socket Unix en vez de un puerto.
  --log <uso.jsonl>           El log de uso contra el que se mide la política
                              de limits, leído una vez al arrancar. El gasto
                              por etiqueta y por sesión vive en un log de uso,
                              no en el almacén; sin esto, cada techo de
                              "limits" responde cannot-tell.

  Responde las dos preguntas que importan en el momento de la llamada (cuánto
  va a costar esto y si queda presupuesto) en milisegundos de un solo dígito,
  para que un agente o un envoltorio pueda preguntar antes de gastar en vez de
  leer un informe después.

  POST /cost con {"model": "...", "inputTokens": n, "outputTokens": n};
  GET /health dice que está en pie. Cada respuesta mantiene separada la mitad
  medida de la estimada: el presupuesto consumido viene de los recuentos que
  facturó el proveedor, el coste de la llamada por la que preguntas es una
  estimación de algo que no ha pasado, y el veredicto dice en cuál de las dos
  se apoya.

  Escucha en 127.0.0.1 y en ningún otro sitio, y no hay flag para cambiarlo:
  un oráculo de costes en una interfaz de red guarda el gasto de una empresa,
  su mezcla de modelos y sus presupuestos, y le responde a quien pregunte. No
  hay autenticación por la misma razón por la que no hay --host: un token
  comprobado sobre loopback es teatro, y la postura honesta es una superficie
  lo bastante pequeña como para no necesitarlo.

  Sin almacén y sin presupuesto sigue tasando la llamada y dice que la mitad
  del presupuesto es desconocida. Sin conexión es un modo, no un fallo.

${bold('OPCIONES DE watch')}
  --once                      Una vuelta: medir, guardar, evaluar, emitir,
                              recordar. Lo que ejecuta una entrada de cron. Es
                              lo que se hace por defecto.
  --interval <n>m|h           Se queda en primer plano y repite. Mínimo cinco
                              minutos: las APIs de uso están limitadas por
                              tasa, y un bucle apretado es una forma de que te
                              estrangulen tu propia clave.
  --webhook <url>             Envía los cruces por POST. Solo https, salvo en
                              loopback; una URL con credenciales se rechaza,
                              porque las URLs acaban en logs e historiales.
  --payload <fichero>         Evalúa un payload de uso que ya tengas, en vez
                              del almacén.
  --sessions                  Vigila las sesiones que Claude Code, Codex y
                              Gemini CLI guardan en esta máquina, las que
                              \`bill\` lee sin ruta, en vez del almacén. No
                              necesita configuración. Repite \`--sessions\` en
                              cada ejecución: lleva su propio registro de lo
                              que ya se reportó.
  --notify                    Muestra además una notificación de escritorio de
                              lo que acaba de cruzar: osascript en macOS,
                              notify-send en Linux, un aviso de PowerShell en
                              Windows, sin instalar nada. Lleva la frase que se
                              imprime aquí y nada más. Desactivada salvo que la
                              pidas; si la máquina no tiene ninguna, lo dice y
                              los demás transportes siguen.
  --json                      La vuelta como datos: cruces, abstenciones, hueco.

  Evalúa los gates de gasto de tu configuración (maxUsd, maxDayUsd,
  maxCacheLossUsd) contra lo que se ha medido, y te lo dice la tarde en que
  pasa en vez de tres semanas después. Sale con 1 cuando algo cruzó, así que
  cron te lo manda y CI falla.

  Una alerta salta por un cruce medido y nunca por una proyección: "has
  gastado $412 de un presupuesto de $400" es un hecho y "vas a excederte" es un
  pronóstico, que esta herramienta no hace a ninguna escala de ventana. Un día
  que todavía se está midiendo se reporta como aún no juzgable en vez de
  aprobarse, pero un día que ya se pasó del presupuesto salta a cualquier
  hora, porque no se pasa menos a medianoche.

  Un reinicio no vuelve a avisar de un cruce ya reportado, y nombra el tramo
  que no estuvo vigilando, porque un vigilante que se reanuda en silencio
  insinúa una cobertura que no tuvo.

${bold('OPCIONES DE store')}
  --prune                     Borra las mediciones más antiguas que la política
                              de retención y compacta el log a lo que el
                              almacén ya resuelve. Dice qué se fue.
  --keep <n>d                 Retención para esta ejecución, si la config no
                              tiene ninguna.
  --dry-run                   Con --prune: dice qué se iría y no borra nada.
  --json                      El inventario como datos.

  Dice qué guarda el almacén local: cuántas mediciones, sobre qué período, por
  proveedor, y qué se llevaría una poda. El almacén guarda agregados y campos
  de facturación (nunca texto de prompt, nunca texto de respuesta, nunca una
  credencial) así que es un fichero que un equipo puede respaldar sin una
  revisión de privacidad.

  La poda es la única operación de aquí que destruye algo, así que se niega a
  correr sin política de retención: pon "store": {"keepDays": 90} en la config
  o pasa --keep. Borrar mediciones con una política que nadie escribió no es un
  valor por defecto que nadie deba recibir por accidente.

${bold('OPCIONES DE connect')}
  --since <cuándo>            La ventana que se descarga. Un día UTC, una marca
  --until <cuándo>            ISO, una ventana relativa (7d, 24h) o "now". Por
                              defecto, los últimos 30 días.
  --dry-run                   Dice qué se llamaría y de qué variable de entorno
                              saldría la clave. No envía nada y no necesita
                              credencial.
  --payload <fichero>         Tasa un payload de uso que ya tengas, en vez de
                              descargar uno. Sin credencial y sin red: la misma
                              aritmética sobre la misma forma.
  --store                     Guarda lo descargado en el almacén local, para que
                              la próxima vez no haya que bajarlo otra vez y
                              "trazum history --store" tenga una serie.
  -o, --out <fichero>         Guarda el informe tasado como JSON.
  --markdown-out <fichero>    Lo escribe además como Markdown, para CI.
  --json                      El informe como datos.

  Lee tu factura desde la API de uso del proveedor, para que nadie tenga que
  exportar nada a mano. La credencial se lee del entorno en el momento de la
  llamada y nunca se guarda, nunca se imprime y nunca se escribe en un fichero
  de configuración: define TRAZUM_ANTHROPIC_ADMIN_KEY o TRAZUM_OPENAI_ADMIN_KEY.
  Cada proveedor necesita la clave más estrecha que pueda leer un informe de
  uso, y una clave de API normal no puede.

  Estas APIs sirven sumas sobre una ventana, no una fila por llamada, así que
  un informe conectado es un informe restringido y lo dice: los totales, el
  reparto por modelo, la serie por día y el veredicto de caché están todos
  disponibles, y los hallazgos por llamada (formas de entrada, reintentos por
  truncado, conversaciones, presión de contexto) se listan como no disponibles
  con lo que los desbloquearía. Un límite de tasa, un tope de páginas o un
  cursor caducado devuelven lo que llegó con el hueco nombrado, nunca un total
  que describe en silencio menos tráfico del que pediste.

${bold('OPCIONES DE history')}
  --store                     Construye la serie desde el almacén local en vez
                              de un directorio de informes guardados. Las
                              fuentes agregadas no llevan label, así que la
                              serie por label está ausente y se dice: las de
                              cuota de modelo y de caché son para lo que existe
                              una serie, y funcionan enteras.
  --markdown-out <fichero>    Escribe además la serie como Markdown, para un
                              resumen de CI o un comentario de pull request.
  --json                      La historia como datos.

  Toma un directorio de informes guardados (los documentos --json que
  profile ya escribe) más los planes guardados que haya al lado, y construye
  la serie que ninguna comparación por pares puede ver: una carga que sube un
  poco cada período, una cuota de modelo creciendo desde una fecha, una cuota
  de caché decayendo tan despacio que ningún informe semanal lo llamó
  hallazgo, y la misma acción planificada una y otra vez sin que nadie la
  ejecute. Derivada de informes guardados, nunca de registros re-parseados:
  un año de JSON basta y los registros crudos pueden tirarse. Las formas se
  nombran; nada se pronostica.

${bold('OPCIONES DE verify')}
  --against <log|dir>         El registro de uso posterior al que se somete el
                              plan. Obligatorio.
  --gate                      Sale con 1 cuando una acción no produjo lo que el
                              plan prometió, o sus campos dejaron de
                              registrarse: "no registrado" no puede leerse
                              como "arreglado". Una carga de trabajo
                              desaparecida no suspende nada.
  --markdown-out <fichero>    Escribe además los veredictos como Markdown, para
                              un resumen de CI o un comentario de pull request.
  --pricing <fichero>         Tarifas locales superpuestas, como en el resto.
  --json                      La verificación como datos.

  Somete un plan guardado al registro que vino después, con tres resultados y
  nunca dos: el cambio llegó, no llegó, o no se puede saber: porque la carga
  desapareció, los campos que la detección necesita dejaron de registrarse, o
  los tokens no dicen con qué tarifa se facturaron. Las diferencias llevan el
  movimiento medido del mundo (llamadas, salida por llamada) desde la línea
  base del propio plan, y un plan tasado con otro catálogo lo dice en vez de
  culpar a un equipo por un ahorro que la aritmética revocó.

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
  prompt va a los dos, y el original se ejecuta dos veces por caso: así el
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

  Sin fichero, informa solo de dentro de qué herramienta se ejecuta Trazum, y
  avisa cuando esa herramienta cobra por suscripción, porque ahí un ahorro
  mensual es aritmética sobre tokens, no dinero que recuperes.

${bold('FICHERO DE CONFIGURACIÓN')}
  ${bold('trazum.config.json')}, que se busca subiendo desde el directorio de trabajo
  y parando en la raíz del repositorio. Todas las claves son opcionales:

    level, locale, disable, maxGrowth, extensions, ignore
    usage     { model, callsPerMonth, avgOutputTokens, cacheHitRate, batchEligible }
    budgets   { "prompts/**": 2000, "prompts/system.txt": 4000 }
    baseline  { "path": "trazum.baseline.json", "maxGrowthTokens": 0, "maxGrowthPct": 5 }
    pricing   "./prices.json": correcciones locales de precios, ver abajo
    labels    { "support-rag": "prompts/soporte.txt" }: qué fichero de prompt
              manda cada label del registro de uso, para que "trazum profile"
              lea el fichero y diga por qué falla una caché que falla
    volumes   { "support-rag": 30000 }: llamadas al mes de una label que
              "labels" asocia, para que "check --base" ponga precio a ese
              prompt por meses. Un prompt sin volumen va por llamada, y se dice
    spend     { "maxUsd": 200, "byLabel": { "chat": 40 } }: presupuestos en
              dólares para "trazum profile". Una etiqueta con presupuesto y sin
              llamadas se informa como no medida, nunca como aprobada
    limits    { "dayUsd": 25, "sessionUsd": 1.5, "byLabel": { "chat": 5 } }:
              la política de aplicación, con techos en USD juzgados antes de hacer
              una llamada, en la puerta a la que llegue (el 402 del gateway,
              "serve", spend_guard por MCP). Separado de "spend" porque una
              puerta de informe y un rechazo de llamada se leen en momentos
              distintos; cada techo debe ser un número positivo, porque un
              techo de 0 es una caída escrita como política
    owners    { "patterns": { "payments": ["billing-*"] },
              "shared": { "search": { "payments": 0.6, "support": 0.4 } },
              "budgets": { "payments": 400 } }: de quién es el presupuesto de
              cada carga. El gasto sin propietario es su propia línea y NUNCA se
              reparte entre los demás; un reparto compartido debe sumar 1, y la
              regla viaja con el informe para que se discuta la regla
    ladders   { "support": { "tiers": ["claude-haiku-4-5", "claude-opus-5"],
              "escalateOn": ["escalated"] } }: modelo barato primero, escalar
              un fallo registrado a uno más caro. Los dos campos obligatorios.
              "trazum ladder <log>" imprime la tasa de escalado de equilibrio
              junto a la medida: un escalado paga dos veces, así que por encima
              de esa tasa la escalera cuesta más que no haberla construido
    outcomes  { "values": ["resolved", "escalated"], "success": ["resolved"] }:
              tu propio vocabulario para lo que pasó, y cuál de él cuenta como
              acierto. Los dos son obligatorios: qué palabras significan éxito
              es un juicio sobre tu producto y no sobre tu factura, y esta
              herramienta no tiene potestad para hacerlo. Usa [] si ninguna lo
              es. Un valor en un log que "values" no declare se nombra como
              sin declarar, nunca se cuenta como fallo
    waive     [{ "gate": "maxUsd", "reason": "migración de agosto", "until":
              "2026-09-15" }]: un fallo de gate sobre el que se ha decidido,
              registrado. Los tres campos son obligatorios: un waiver sin
              fecha de fin es un hallazgo borrado con pasos extra. Los fallos
              waived se siguen imprimiendo, y el día que caduca el gate
              vuelve a fallar

  Las opciones ganan al config; el config gana a los valores por defecto. Los
  presupuestos se resuelven con el patrón más específico que encaje: gana el
  que tenga más caracteres literales. Un booleano que el config haya activado se
  desactiva con --no-<opción>, por ejemplo --no-batch.

  ${bold('budgets')} es un techo; ${bold('baseline')} es una puerta. Uno pregunta si un
  fichero cabe, la otra si el repositorio ha empeorado respecto al commit que
  alguien registró con "trazum baseline". Un repositorio al 95% de todos sus
  presupuestos pasa siempre, mientras un PR añade cuatrocientos tokens
  repartidos en doce ficheros. Con baseline en el config, "check" sobre un
  directorio lo lee y lo aplica sin ninguna opción: una puerta que exige
  acordarse de pasar un argumento se ejecuta en la terminal del autor y no en
  CI. Los umbrales van en tokens, nunca en dólares: si no, cambiar el precio de
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
                              de red: el núcleo determinista no hace ninguna.
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
  último del fichero de configuración: así un proyecto puede fijar el idioma en
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
    fileNotFound: (path) =>
      `${path}: no encontrado. Revisa la ruta, o apunta esto al directorio que lo contiene.`,
    fileIsDirectory: (path) =>
      `${path} es un directorio, y este comando lee un fichero. Nombra el fichero de dentro, o usa un comando que recorra una carpeta.`,
    fileIsDirectoryUnnamed: () =>
      'esa ruta es un directorio, y este comando lee un fichero. Nombra el fichero de dentro, o usa un comando que recorra una carpeta.',
    fileNotReadable: (path) =>
      `${path}: sin permiso de lectura. Revisa el dueño y los permisos del fichero, y vuelve a ejecutarlo.`,
    logIsDirectory: (path) =>
      `${path} es un directorio, y este comando lee un registro de uso. trazum bill ${path} lee todos los registros de uso y sesiones de agentes de código que hay dentro.`,
    logIsOtherShape: (path, shape, command, billPath) =>
      `${path} son datos de ${shape}, no un registro de uso, así que este comando no encontraría ninguna llamada en él. trazum bill ${billPath} lo lee tal cual${command === null ? '.' : `, y trazum ${command} ${path} -o uso.jsonl escribe un registro de uso que este comando lee.`}`,
    logIsAmbiguous: (path, shapes) =>
      `${path} no es un registro de uso, y lo reclama más de una forma (${shapes}). Conviértelo con el comando from- de la que sea, y apunta este comando al registro de uso que escriba.`,
    logIsCostReport: (path) =>
      `${path} es un informe de costes de un proveedor, una factura y no uso, así que este comando no encontraría ninguna llamada en él. Ponlo junto a un recibo con trazum reconcile.`,
    livePricingFailed: (url: string, detail: string) =>
      `No se han podido cargar los precios en vivo desde ${url}: ${detail}. Los precios incluidos siguen ahí: quita --pricing-live para usarlos.`,
    optionNeedsValue: (name) => `La opción --${name} necesita un valor.`,
    mustBeNonNegative: (name, raw) =>
      `--${name} debe ser un número no negativo (recibido: "${raw}").`,
    inputTooLarge: (source, size, limit) =>
      `${source} tiene ${count(size)} caracteres, por encima del techo de ${count(limit)} para un prompt. Súbelo deliberadamente con --max-input <caracteres> si esta entrada de verdad lo es.`,
    badMaxInput: (raw) => `--max-input debe ser un número positivo de caracteres (recibido: "${raw}").`,
    fractionFlag: (name, raw) =>
      `--${name} es una fracción entre 0 y 1 (recibido: ${raw}). La configuración rechaza el mismo valor de la misma forma.`,
    badLevel: (received) => `--level debe ser "safe" o "aggressive" (recibido: "${received}").`,
    allLabelsNeedsLog: () =>
      '--all-labels ordena los prompts por tráfico medido, así que necesita --from-log <uso.jsonl>. Sin registro cada ahorro se multiplicaría por la misma suposición tecleada, lo que ordena los prompts por longitud y lo llama prioridad.',
    allLabelsNeedsMap: () =>
      '--all-labels lee el mapa "labels" de trazum.config.json (etiqueta a fichero de prompt) y esta config no tiene ninguno. Mapea al menos una carga a su prompt.',
    fromLogConflict: (flag) =>
      `--from-log mide la cifra que --${flag} teclea, y mezclar una medición con una suposición produce un número que no es ninguna de las dos. Pasa una u otra.`,
    fromLogNeedsLabel: (available) =>
      `--from-log necesita saber qué carga es este prompt: pasa --label, o mapea el fichero bajo "labels" en trazum.config.json. Etiquetas con tráfico en este registro: ${available}.`,
    fromLogAmbiguousLabel: (target, labels) =>
      `${target} está mapeado a más de una etiqueta en trazum.config.json (${labels}), así que --from-log no puede elegir una en silencio. Pasa --label.`,
    fromLogLabelEmpty: (label, available) =>
      `Ninguna llamada valorada de este registro lleva la etiqueta "${label}", así que no hay nada que medir: un perfil de cero llamadas valoraría este cambio como inútil en vez de como no medido. Etiquetas con tráfico: ${available}.`,
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
    exactTokensWrongFamily: (model, provider) =>
      `--exact-tokens cuenta con el endpoint de Anthropic, que cuenta el tokenizador de Claude${
        provider === null
          ? `, y el catálogo no registra proveedor para "${model}": qué tokenizador usa no es algo que Trazum sepa`
          : `, y ${model} es un modelo de ${provider}`
      }. Contarlo ahí sería rechazado arriba o devolvería un número de otro tokenizador, y esta herramienta no va a llamar exacto a eso. Quita --exact-tokens y quédate con la estimación (que es honesta sobre serlo) o cuenta con las herramientas de ${
        provider === null ? 'ese modelo' : provider
      }.`,
    exactTokensNoEncoding: (model, packageName, known) =>
      `--exact-tokens no puede contar ${model} con exactitud: ${packageName} está instalado y no tiene tabla de rangos para él (tiene ${known}). ` +
      'Contarlo con la tabla más parecida pondría la palabra exacto sobre una suposición. Quita --exact-tokens para la estimación, que dice cuánto se desvía.',
    exactTokensNeedsPackage: (model, packageName) =>
      `--exact-tokens puede contar ${model} de forma exacta, sin conexión y sin clave, pero ` +
      `necesita ${packageName}, que no está instalado. Es un paquete aparte porque sus tablas ` +
      'de rangos ocupan veintidós megabytes y @trazum/core no depende de nada.\n' +
      `  npm install ${packageName}\n` +
      'O quita --exact-tokens y quédate con la estimación, que dice cuánto se desvía.',
    checkNeedsMaxTokens: () => 'trazum check necesita --max-tokens <n>.',
    evalNeedsCases: () => 'trazum eval necesita --cases <fichero>.',
    unknownExportFormat: (received, allowed) =>
      `Formato de exportación desconocido "${received}". Disponibles: ${allowed}.`,
    evalNoCases: (path) => `No se ha encontrado ningún caso en "${path}".`,
    unknownFlag: (name, allowed) =>
      `Opción desconocida --${name}. Este comando acepta: ${allowed}.`,
    unknownFlagDidYouMean: (name, suggestion) =>
      `Opción desconocida --${name}. ¿Querías decir --${suggestion}?`,
    extraPositional: (command, limit, given, first) =>
      `${command} lee ${limit === 1 ? 'una ruta' : `${limit} rutas`} y ha recibido ${given}, así que ${first} y`
      + ' todo lo que va detrás se ignoraría. Un comodín del shell se expande en muchas rutas: pasa la'
      + ` carpeta (trazum ${command} logs/) o ejecútalo una vez por fichero.`,
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
    estimated: (offFamily, band, measuredOff) => {
      if (offFamily === null) return ` (estimado, ±${band}%)`;
      return measuredOff === null
        ? ` (estimado: el contador está calibrado sobre Claude, no sobre ${offFamily}, y nadie ha`
          + ' medido cuánto se desvía ahí)'
        : ` (estimado: el contador está calibrado sobre Claude, no sobre ${offFamily}, donde se ha`
          + ` medido hasta un ${measuredOff}% de desviación)`;
    },
    exactCount: () => ' (recuento exacto)',
    rulesApplied: () => 'Reglas aplicadas',
    nothingToTrim: () => '  Ninguna regla ha encontrado nada que recortar.',
    dictionaryCoverage: (languages) =>
      `  Los diccionarios de frases cubren ${languages}. Un prompt en otro idioma `
      + 'no es necesariamente eficiente: puede ser simplemente uno que Trazum '
      + 'todavía no sabe leer.',
    dictionaryUnreviewed: (languages) =>
      `  De esos, ${languages} llevan entradas que nadie aquí lee: escritas por el `
      + 'mismo proceso que escribió las reglas, nunca aprobadas por alguien que '
      + 'hable el idioma.',
    dictionaryAppliedUnreviewed: (language) =>
      `  Estos cambios vienen del diccionario de ${language}, que nadie aquí lee. `
      + 'Sus entradas las escribió el mismo proceso que escribió las reglas y nunca '
      + 'las aprobó alguien que hable el idioma: revisa el diff antes de fiarte.',
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
    allLabelsHeading: (count) => `Cada prompt mapeado contra su propio tráfico medido: ${count} ordenados por lo que vale el cambio`,
    allLabelsRow: (saving) => `${saving}/mes si se optimiza`,
    allLabelsRowPeriod: (saving) => `${saving} en el periodo medido si se optimiza`,
    allLabelsFooter: () =>
      'Ordenado por tráfico medido, no por longitud del prompt: un prompt grande en una carga muerta vale menos que uno pequeño en una ocupada. Cada cifra es el delta de tokens de este prompt al ritmo medido de su propia etiqueta.',
    allLabelsUnmapped: (label, usd) =>
      `${label} lleva ${usd} de gasto medido y ningún fichero de prompt está mapeado a ella: la carga que nadie puede optimizar porque nadie dijo dónde vive. Mapéala en "labels" de trazum.config.json.`,
    allLabelsDead: (label, path) =>
      `${label} está mapeada a ${path} y no tiene tráfico en este registro: una carga retirada, una etiqueta renombrada, o una errata que lleva sin hacer nada en silencio.`,
    allLabelsUnreadable: (label, path) =>
      `${label} está mapeada a ${path}, que no se pudo leer. El mapeo existe; el fichero no.`,
    usageLineMeasured: (calls, days, scaled, outputTokens, batch) =>
      `${calls} llamadas medidas en ${days} días, ${scaled}/mes a ese ritmo · ${outputTokens} tokens de salida por llamada, medidos${batch ? ' · Batch API' : ''}`,
    usageLineMeasuredPeriod: (calls, days, outputTokens, batch) =>
      `${calls} llamadas medidas${days === null ? ' (el registro no tiene reloj)' : ` en ${days} días`} · ${outputTokens} tokens de salida por llamada, medidos${batch ? ' · Batch API' : ''}`,
    measuredModelShare: (model, share, count) =>
      `Esta etiqueta corrió en ${count} modelos; las cifras usan ${model}, que llevó el ${share} de su gasto.`,
    measuredNoOutput: () =>
      'Ninguna llamada de este corte registró tokens de salida, así que la mitad de salida de cada cifra de abajo es $0 medido, no $0 supuesto.',
    perPeriodSaving: (saving, pct) => `ahorro de ${saving} en el periodo medido (${pct}%)`,
    periodNotScaled: (days) =>
      days === null
        ? 'Sin escalar a un mes: el registro no tiene reloj, así que no hay ritmo que escalar. Estas cifras cubren exactamente las llamadas medidas.'
        : `Sin escalar a un mes: ${days} días queda por debajo de la semana que un escalado necesita: menos de un ciclo semanal multiplica la parte del ciclo que pilló. Estas cifras cubren exactamente el periodo medido.`,
    perMonthSaving: (saving, pct) => `ahorro ${saving}/mes (${pct}%)`,
    beyondShortening: () => 'Además de acortar el prompt',
    biggestLever: () => 'Empieza por aquí',
    biggestLeverDetail: (title, amount, times) =>
      // El título conserva sus mayúsculas: pasarlo a minúsculas convertía
      // "Claude Opus 5" en "claude opus 5", un nombre de producto destrozado.
      `"${title}", ${amount}/mes` +
      (times !== null && times >= 2 ? `, ${times}× lo que han ahorrado las reglas.` : '.'),
    perMonthSuffix: (amount) => ` ~${amount}/mes`,
    diff: () => 'Diff',
    tokensOnlyHeading: (host) => `Qué ganas con esto en ${host}`,
    tokensOnlyWhy: (host) =>
      `${host} identifica la herramienta, no tu forma de pago. Se muestran tokens por defecto; el ahorro en factura es desconocido.`,
    tokensOnlyAsked: () => 'Costes ocultos porque has pedido solo tokens.',
    tokensSaved: (tokens) =>
      `${tokens} token${tokens === '1' ? '' : 's'} de vuelta, en cada llamada.`,
    windowNegligible: (tokens, model, window) =>
      `${tokens} tokens de la ventana de ${window} de ${model}: menos de una décima de por ciento, así que la ventana no es lo que limita este prompt.`,
    windowUnmoved: (share, model, window) =>
      `${share} de la ventana de ${window} de ${model}, antes y después: este cambio es demasiado pequeño para moverla.`,
    beyondThisPromptTokensOnly: () =>
      'Acortar un prompt es la palanca más pequeña que hay: medido en un prompt de soporte corriente, las reglas recuperan alrededor del 1% de una factura mensual. Si alguno de tus prompts va a una API de pago por uso, "trazum profile <uso.jsonl>" lee lo que el proveedor cobró de verdad y calcula las palancas que no son el prompt. Grabar ese registro son unas pocas líneas y nunca contiene texto del prompt.',
    beyondThisPrompt: () =>
      'Acortar un prompt es la palanca más pequeña que hay: medido en un prompt de soporte corriente, las reglas recuperan alrededor del 1% de una factura mensual. En una API de pago por uso, lo que mueve del 60% al 80% es a qué modelo va la llamada, la Batch API, la caché de prompts, y lo que cuesta reenviar la conversación, y "trazum profile <uso.jsonl>" calcula las cuatro a partir de lo que el proveedor cobró de verdad. Grabar ese registro son unas pocas líneas y nunca contiene texto del prompt.',
    windowUse: (before, after, model, window) =>
      `Ventana de contexto: ${before} → ${after} de los ${window} tokens de ${model}, sitio que se lleva la conversación.`,
    tokensOnlyAskedFor: () =>
      'Has nombrado un escenario y no se ha calculado su coste: Trazum se está ejecutando en un sitio que factura por suscripción, así que aquí no hay factura que reducir. Añade --cost para calcularlo igualmente: el host dice dónde se ejecuta Trazum, no a dónde va tu prompt.',
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
    reportWritten: (path) => `Informe escrito en ${path}.`,
  },

  init: {
    heading: () => 'Lo que hay aquí',
    host: (name) => `Ejecutándose dentro de ${name}.`,
    prompts: (count) =>
      `${count} ${count === 1 ? 'archivo de prompt encontrado' : 'archivos de prompt encontrados'}.`,
    noPrompts: () =>
      'No se encontraron prompts. El modo directorio lee .txt, .md, .prompt y .tmpl por defecto: define "extensions" si los tuyos se llaman de otra forma.',
    sourcesTruncated: (cap) =>
      `Se paró tras ${cap} archivos de código, así que un proveedor nombrado más abajo no se vio.`,
    usageFound: (kind, where) =>
      kind === 'connector-credential'
        ? `El consumo se puede descargar: hay una credencial en ${where}. Ejecuta trazum connect.`
        : kind === 'store'
          ? `Hay un almacén local de mediciones pasadas en ${where}.`
          : `Registro de consumo encontrado: ${where}.`,
    noUsage: () =>
      'No se encontró consumo. Apunta trazum a un registro (trazum profile <log.jsonl>) o descárgalo (trazum connect anthropic): toda cifra en dinero de esta herramienta sale de uno.',
    usageUnreadable: (where, because) =>
      `${where} está ahí y no se pudo leer: ${because}. Ese es un problema distinto de no tener consumo, y es el primero que hay que arreglar.`,

    configHeading: () => 'Lo que diría la configuración',
    nothingJustified: () =>
      'Nada. Cada clave de abajo necesita pruebas que esta ejecución no encontró, y una configuración adivinada es peor que ninguna.',
    whyLocale: (locale) => `tu entorno pide ${locale}`,
    whyExtensions: (extensions, files) => `${files} prompts usan ${extensions}`,
    whyModelMeasured: (model, sharePct) => `el ${sharePct}% de la factura medida fue a ${model}`,
    whyModelSource: (model, file, line) => `${file}:${line} nombra ${model}`,
    whyCalls: (perMonth, calls, days) =>
      `${calls} llamadas en ${days} días, expresadas como ${perMonth} al mes`,
    whyOutput: (average, outputTokens, calls) =>
      `${outputTokens} tokens de salida en ${calls} llamadas dan una media de ${average}`,
    whyCache: (rate, cacheReadTokens, inputTokens) =>
      `${cacheReadTokens} en caché frente a ${inputTokens} de entrada nueva dan una tasa de ${rate}`,

    noModelEvidence: () => 'nada medido ni escrito en el código nombra un único modelo',
    modelConflict: (files) => `estos archivos nombran más de un proveedor: ${files}`,
    modelProviderOnly: (provider, file) =>
      `${file} nombra ${provider} y ningún modelo: el modelo por defecto del proveedor se leería como decisión tuya dentro de seis semanas`,
    nothingMeasured: () => 'todavía no se ha medido nada',
    windowTooShort: (days, minimum) =>
      `${days} días medidos; hacen falta ${minimum} antes de que eso sea un ritmo mensual y no un pronóstico`,
    undatedCalls: (undated, calls) =>
      `${undated} de ${calls} llamadas no llevan fecha, así que no se pueden situar dentro de la ventana por la que dividiría un ritmo`,
    cacheNotRecorded: () =>
      'este registro no tiene columnas de caché en absoluto, que no es lo mismo que una tasa de cero',
    batchOnlyYouKnow: () =>
      'si el trabajo puede esperar a una ventana de lote es una decisión de producto, y ningún registro la anota',
    labelsUnprovable: (labels) =>
      `${labels} ${labels === 1 ? 'etiqueta' : 'etiquetas'} en el registro, y nada aquí demuestra qué prompt envía cuál`,
    budgetIsPolicy: () => 'un presupuesto es una política, y todavía no hay cifra medida contra la que escribir una',
    budgetIsPolicyMeasured: (usd, days) =>
      `un presupuesto es una política, así que es tuyo: la cifra medida es $${usd} en ${days} días`,

    findingHeading: () => 'Lo más valioso encontrado',
    noFinding: (why) =>
      why === 'nothing-measured'
        ? 'Nada, porque no se ha medido nada. Toda cifra que esta herramienta imprime como dinero sale de un registro de consumo.'
        : why === 'nothing-could-be-priced'
          ? 'Nada: el registro se leyó y ningún modelo suyo está en el catálogo de precios. Ejecuta trazum models para ver cuáles lo están.'
          : 'Nada que merezca una línea: ninguna porción de esta factura se puede mover más de un uno por ciento del total.',
    findingCalls: (calls, label, model, days) =>
      `${calls} llamadas con la etiqueta "${label}" fueron a ${model} en ${days} días.`,
    findingSpent: (usd) => `Costaron $${usd}.`,
    findingRoute: (model) => `El mismo trabajo cabe en ${model}, más barato por token.`,
    findingBatch: () => 'La API de lotes reduce a la mitad ambas mitades de la factura, para trabajo que puede esperar.',
    findingTotal: (usd, days) => `Juntas: $${usd} en esos mismos ${days} días.`,
    findingNext: () =>
      'trazum plan <tu registro> ordena todas las acciones, no solo esta. Si alguna cifra de aquí parece mal, trazum feedback dice dónde contarlo, no envía nada por su cuenta.',

    wouldOverwrite: (keys) => `Esto reemplaza claves que ya tenías: ${keys}. Pasa --yes para escribir igualmente.`,
    nothingToWrite: () => 'No se escribió configuración: nada de lo anterior se pudo justificar con lo que hay aquí.',
    wouldWrite: (path) => `Escribiría ${path}:`,
    wrote: (path) => `Escrito en ${path}.`,
    existingRefused: (path) =>
      `${path} ya existe y se dejó intacto. Pasa --dry-run para ver qué iría dentro, o --yes para reemplazarlo.`,
    existingUnparseable: (path) =>
      `${path} existe y no se pudo interpretar, así que no se escribió nada encima. Arréglalo o muévelo primero.`,
  },

  annual: {
    heading: (year) => `El a\u00f1o ${year}, a partir de lo que ya estaba escrito`,
    needsYear: () => '--year es obligatorio, con cuatro d\u00edgitos: trazum report <log> --year 2026.',
    spent: (usd, calls, months) => `${usd} en ${calls} llamadas, sobre ${months} meses registrados.`,
    missing: (months) =>
      `Sin ning\u00fan registro de ${months}. Esos meses se nombran en vez de rellenarse: un a\u00f1o que cubre parte de s\u00ed mismo en silencio e imprime un total anual est\u00e1 equivocado en el resto y no dice nada al respecto.`,
    promises: (planned, arrived, notArrived, cannotTell) =>
      `${planned} acciones planeadas. ${arrived} llegaron, ${notArrived} no, y ${cannotTell} no se pudieron juzgar. Tres resultados, nunca dos: el tercero es el que un informe anual normal mete dentro del que favorece.`,
    projected: (usd) => `Los planes proyectaron ${usd} de ahorro.`,
    noArrivedFigure: () =>
      'A prop\u00f3sito no hay una cifra al lado de lo que lleg\u00f3. Una verificaci\u00f3n dice SI cada acci\u00f3n aterriz\u00f3; nunca ha llevado una cifra en d\u00f3lares por acci\u00f3n del ahorro. Montarla aqu\u00ed significar\u00eda decidir cu\u00e1l de varios n\u00fameros observados es "el ahorro": un juicio que la verificaci\u00f3n se neg\u00f3 a hacer, y justo la aritm\u00e9tica de informe anual que este documento sustituye.',
    outcomes: (recorded, parsed, unrecordedUsd) =>
      `${recorded} de ${parsed} llamadas registraron un resultado; ${unrecordedUsd} del gasto del a\u00f1o no.`,
    noOutcomes: () =>
      'No se registr\u00f3 ning\u00fan resultado este a\u00f1o, as\u00ed que nada de esto dice qu\u00e9 compr\u00f3 el dinero. Eso no es una tasa de \u00e9xito de cero: un a\u00f1o sin instrumentar y un a\u00f1o que falla son frases distintas.',
    cannotSayHeading: () => 'Lo que este registro no puede decir',
    cannotSay: (kind) =>
      kind === 'months-missing'
        ? 'qu\u00e9 pas\u00f3 en los meses sin registro'
        : kind === 'nothing-was-planned'
          ? 'si se prometi\u00f3 algo, porque no se hizo ning\u00fan plan'
          : kind === 'nothing-was-verified'
            ? 'si se cumplieron las promesas, porque no se verific\u00f3 ning\u00fan plan'
            : kind === 'some-promises-unjudgeable'
              ? 'si algunas promesas se cumplieron, no se pudieron juzgar con los logs que existen'
              : kind === 'arrived-savings-not-quantified'
                ? 'cu\u00e1ntos d\u00f3lares val\u00edan las promesas cumplidas'
                : kind === 'no-outcomes-recorded'
                  ? 'qu\u00e9 compr\u00f3 nada de ese dinero'
                  : 'qu\u00e9 hizo la parte del tr\u00e1fico sin instrumentar',
    noNewData: () =>
      'Todas las cifras de arriba salen del almac\u00e9n y de los planes que ya guardas. Aqu\u00ed no se ha calculado nada que no se pueda comprobar contra un documento que ya existe, que es la \u00fanica raz\u00f3n por la que un informe anual merece confianza, siendo el documento con m\u00e1s probabilidad de acabar citado fuera de la sala donde se escribi\u00f3.',
  },

  commitment: {
    heading: (floor, discount, months) =>
      `Un compromiso de ${months} meses: ${floor} al mes con ${discount} de descuento`,
    needsTerms: () =>
      '--floor y --discount son obligatorios, y --months son 12 por defecto. S\u00e1calos del contrato que te ofrecen: el suelo es lo que te comprometes a gastar cada mes despu\u00e9s del descuento, y el descuento es lo que te quitan de tarifa.',
    asIf: () =>
      'Esto es lo que el acuerdo HABR\u00cdA hecho sobre el tr\u00e1fico que realmente tuviste. Es una medici\u00f3n del pasado, no una predicci\u00f3n: todos los meses de abajo ocurrieron.',
    columns: { month: 'mes', list: 'tarifa', paid: 'pagar\u00edas', saving: 'ahorro' },
    net: (usd, months) => `Neto sobre ${months} meses medidos: ${usd}.`,
    good: (usd) => `Los meses que superaron el suelo ahorraron ${usd}.`,
    lost: (usd, months) =>
      `${months} de ellos se quedaron cortos, y el suelo que habr\u00edas pagado por capacidad que nadie us\u00f3 suma ${usd}. Esa cifra se mantiene aparte a prop\u00f3sito: metida en la l\u00ednea de arriba desaparece, y esa desaparici\u00f3n es de lo que vive la diapositiva de un comercial.`,
    noShortfall: () => 'Ning\u00fan mes medido se habr\u00eda quedado por debajo del suelo.',
    breakEven: (usd) =>
      `El equilibrio est\u00e1 en ${usd} de gasto mensual. Por debajo pagas el suelo por menos uso del que compra; por encima el ahorro crece.`,
    spread: (low, high, median) =>
      `Dispersi\u00f3n medida: de ${low} a ${high}, mediana ${median}. Ese es el riesgo de quedarse corto en la \u00fanica forma en que un log puede expresarlo: un recuento de meses reales y el rango que cubrieron, no una probabilidad de una distribuci\u00f3n que nadie ajust\u00f3.`,
    shortTerm: (covered, term) =>
      `Esto replica ${covered} meses contra un compromiso de ${term} meses. Es una respuesta real sobre ${covered} meses y no sobre ${term}.`,
    cannotTell: (why, needed) =>
      why === 'no-history'
        ? 'Nada que replicar: este log no tiene meses completos.'
        : `No se puede juzgar con ${needed === '0' ? 'lo que hay' : `lo que hay: ${needed} mes(es) completo(s) m\u00e1s lo zanjar\u00edan`}. Un compromiso se firma por un a\u00f1o, y una respuesta de un mes es una decisi\u00f3n anual tomada con quince d\u00edas de evidencia.`,
    neverAForecast: () =>
      'Aqu\u00ed nada se anualiza, se extrapola ni se ajusta a una tendencia. Si el pr\u00f3ximo trimestre no se parece al anterior, esta aritm\u00e9tica no dice nada sobre \u00e9l, que es el l\u00edmite honesto de lo que un log puede contarte sobre un contrato.',
  },

  owners: {
    heading: () => 'De qui\u00e9n es el dinero',
    noOwners: () =>
      'No hay propietarios configurados. A\u00f1ade "owners" a trazum.config.json para atribuir gasto, por ejemplo {"patterns": {"payments": ["billing-*"]}, "budgets": {"payments": 400}}.',
    columns: { owner: 'propietario', spend: 'gasto', budget: 'presupuesto', calls: 'llamadas' },
    verdict: (kind) =>
      kind === 'over' ? 'pasado' : kind === 'within' ? 'dentro' : kind === 'not-measured' ? 'sin medir' : 'sin veredicto',
    unallocated: (usd, share, labels) =>
      `Sin asignar: ${usd} (${share} de la factura), de ${labels}.`,
    neverSpread: () =>
      'No se reparte entre los propietarios de arriba, y nunca se har\u00e1. Repartir el gasto sin atribuir de forma proporcional es la mentira m\u00e1s com\u00fan en informes de coste: hace que todas las l\u00edneas cuadren y que el n\u00famero de cada equipo est\u00e9 mal en una cantidad que nadie puede ver, y castiga m\u00e1s a quien mejor instrumenta, porque su gasto conocido es el mayor y absorbe la mayor parte del misterio ajeno. Recl\u00e1malo con un patr\u00f3n.',
    nothingUnallocated: () => 'Todas las cargas de este log tienen propietario.',
    sharedHeading: () => 'Compartido, por una regla que escribi\u00f3 alguien',
    sharedRule: (label, rule) => `${label}: ${rule}`,
    problemsHeading: () => 'Esta configuraci\u00f3n de propiedad no va a hacer lo que parece',
    problem: (kind, detail) =>
      kind === 'split-does-not-sum'
        ? `${detail}: un reparto que no suma 1 pierde dinero o lo inventa, en silencio. Esa carga se deja entera en la l\u00ednea sin asignar hasta que se arregle.`
        : kind === 'split-names-unknown-owner'
          ? `${detail} nombra un propietario que "owners.patterns" no declara.`
          : kind === 'split-has-one-owner'
            ? `${detail} est\u00e1 "compartido" con un solo propietario: eso es un patr\u00f3n escrito largo, y leerlo como reparto invita a a\u00f1adir un segundo sin ajustar el primero.`
            : kind === 'negative-share'
              ? `${detail} tiene un reparto negativo.`
              : `${detail} tiene presupuesto pero no patrones, as\u00ed que nunca podr\u00e1 caerle nada.`,
    notMeasured: (owner) =>
      `${owner} tiene presupuesto y ninguna llamada medida. Eso NO es estar dentro del presupuesto: un equipo cuyos logs nunca llegaron pasa todos sus presupuestos, siempre, y un tic verde junto a su nombre dice lo contrario de la verdad.`,
  },

  semantic: {
    heading: (path) => `Pase sem\u00e1ntico sobre ${path}`,
    willCost: (usd, input, output, model) =>
      `Esto enviar\u00e1 el prompt a ${model}: unos ${input} tokens de entrada y ${output} de salida, aproximadamente ${usd}. Estimado, no medido: una herramienta que gasta tu dinero para decirte c\u00f3mo gastar menos deber\u00eda ser lo primero que audite su propia aritm\u00e9tica. Pasa --yes para ejecutarlo.`,
    needsYes: () => 'No se envi\u00f3 nada. A\u00f1ade --yes cuando hayas le\u00eddo el precio de arriba.',
    finding: (kind, because) =>
      `${kind === 'contradiction' ? 'Contradicci\u00f3n' : kind === 'restated-instruction' ? 'Repetido' : 'Lo mismo con otras palabras'}: ${because}`,
    span: (line, text) => `l\u00ednea ${line}: ${text}`,
    ceiling: (tokens) =>
      `Como mucho ${tokens} tokens: un techo, no un ahorro. Fundir los dos significa escribir un pasaje que haga el trabajo de ambos, y nadie sabe todav\u00eda cu\u00e1nto ocupa.`,
    noCeiling: () =>
      'Sin tokens asociados. Una contradicci\u00f3n merece arreglarse porque el prompt est\u00e1 mal, no porque sea largo, y ponerle una cifra vender\u00eda el motivo equivocado.',
    nothingFound: () => 'Nada sobrevivi\u00f3 a la comprobaci\u00f3n. Esa es una respuesta real.',
    rejected: (count) => `${count} propuestas no sobrevivieron a la comprobaci\u00f3n contra el prompt.`,
    rejectedLine: (reason, span) =>
      reason === 'span-not-found'
        ? `parafrase\u00f3 su propia evidencia: ${span}`
        : reason === 'already-detected'
          ? `ya se encuentra sin modelo: ${span}`
          : reason === 'contradiction-of-a-copy'
            ? `llam\u00f3 contradicci\u00f3n a una casi copia: ${span}`
            : reason === 'spans-identical' || reason === 'spans-overlap'
              ? `cit\u00f3 el mismo pasaje dos veces: ${span}`
              : `cubre terreno que ya cubre un hallazgo aceptado: ${span}`,
    disposes: () =>
      'El modelo propone y la capa determinista dispone: cada pasaje citado se comprueba car\u00e1cter a car\u00e1cter contra el prompt, los pares que el motor de reglas ya caza se descartan, y toda cifra de tokens se cuenta aqu\u00ed en vez de cre\u00e9rsela.',
    optIn: () =>
      'Este pase es opcional y siempre lo ser\u00e1. Trazum funciona sin clave, sin red y sin modelo: eso es cierto desde 0.1.0 y esto no lo cambia.',
  },

  quality: {
    heading: (label) => `Calidad a trav\u00e9s del cambio: ${label}`,
    needsLabel: () => 'Nombra la carga con --label: esto compara una etiqueta antes y despu\u00e9s de un cambio, y una mezcla de cargas promediar\u00eda una regresi\u00f3n hasta hacerla desaparecer.',
    needsAt: () =>
      '--at es obligatorio: da el momento en que aterriz\u00f3 el cambio, como marca ISO. Sin \u00e9l no hay frontera que comparar, y elegir una del log ser\u00eda que esta herramienta decida a qu\u00e9 cambio culpar.',
    sides: (beforeRate, afterRate, before, after) =>
      `antes ${beforeRate} (${before} resultados)   despu\u00e9s ${afterRate} (${after} resultados)`,
    dropped: (from, to, outcomes, cost) =>
      `La tasa de resoluci\u00f3n pas\u00f3 de ${from} a ${to} sobre ${outcomes} resultados medidos, y este cambio ${cost}. Las dos mitades son medidas; ninguna es una estimaci\u00f3n.`,
    held: (from, to, outcomes) =>
      `La tasa de resoluci\u00f3n pas\u00f3 de ${from} a ${to} sobre ${outcomes} resultados medidos, arriba, de forma medible.`,
    cannotTell: (why, need) =>
      why === 'too-few-before'
        ? `No se puede decir: solo ${need} resultados antes del cambio, y esta puerta necesita 100 por lado. Falla builds, as\u00ed que el umbral no es el que usa una tasa en otros sitios.`
        : why === 'too-few-after'
          ? `A\u00fan no se puede decir: solo ${need} resultados desde el cambio, y esta puerta necesita 100 por lado. Vuelve a correrlo cuando el tr\u00e1fico se ponga al d\u00eda.`
          : why === 'not-separable'
            ? 'No se puede decir: la tasa no se movi\u00f3 de forma medible. Eso NO es lo mismo que "se mantuvo": una puerta que las escribiera igual dejar\u00eda pasar una regresi\u00f3n real que simplemente no tuvo potencia para ver.'
            : why === 'no-vocabulary'
              ? 'No se puede decir: "outcomes.success" no declara nada, as\u00ed que no hay tasa de resoluci\u00f3n que comparar.'
              : 'No se puede decir: algo que no es el prompt se movi\u00f3 a trav\u00e9s de la frontera. Ver abajo.',
    confoundersHeading: () => 'El prompt no es lo \u00fanico que cambi\u00f3',
    confounder: (kind, detail) =>
      kind === 'model-mix-moved'
        ? `La mezcla de modelos se movi\u00f3 un ${detail}. La ca\u00edda puede ser enteramente la migraci\u00f3n de otra persona, y esta herramienta no puede separarlas.`
        : kind === 'volume-moved'
          ? `El volumen de llamadas se movi\u00f3 ${detail}. Una carga cuyo tr\u00e1fico se mueve tanto suele ser una carga cuya poblaci\u00f3n cambi\u00f3 (una superficie nueva, un cliente nuevo, una campa\u00f1a) y las preguntas que se hacen no son las de antes.`
          : `La cobertura de resultados pas\u00f3 de ${detail}. Las dos tasas describen poblaciones distintas: un equipo que empieza a instrumentar sus casos dif\u00edciles ve caer su tasa medida sin que nada haya empeorado.`,
    notRandomised: () =>
      'Esto es un antes y despu\u00e9s, no un experimento. Parte el tr\u00e1fico por tiempo y no al azar, as\u00ed que todo lo dem\u00e1s que cambi\u00f3 a la vez est\u00e1 tambi\u00e9n en la diferencia: por eso dice "no se puede decir" mucho m\u00e1s f\u00e1cilmente que un A/B.',
    cannotSee: () =>
      'No puede ver nada m\u00e1s que desplegaras ese d\u00eda. Un veredicto de "ca\u00edda" dice que la tasa baj\u00f3 y que las tres cosas que puede comprobar no se movieron. Es una afirmaci\u00f3n m\u00e1s peque\u00f1a que "lo hizo el prompt", y es la mayor que sostiene la evidencia.',
    gateFailed: () => 'Puerta fallada: una ca\u00edda medida sin nada m\u00e1s que la explique.',
    gateHeldOpen: () =>
      'Puerta ni pasada ni fallada. "No se puede decir" mantiene la afirmaci\u00f3n abierta en vez de salir en verde: la postura de verify desde 1.39.',
  },

  experiment: {
    heading: (a, b) => `Experimento: ${a} contra ${b}`,
    needsTwo: () =>
      'Nombra dos etiquetas a comparar, por ejemplo: trazum experiment <log> --a prompt-v1 --b prompt-v2',
    needsRule: () =>
      '--min-outcomes es obligatorio, y ese es justo el punto: una regla de parada declarada despu\u00e9s de mirar los n\u00fameros no es una regla de parada. Di cu\u00e1ntos resultados debe registrar cada brazo antes de poder leer el resultado.',
    arm: (name, rate, successes, recorded, interval) =>
      `${name}  ${rate}  (${successes} de ${recorded} registrados)  95% ${interval}`,
    wins: (name, low, high) =>
      `Gana ${name}. La diferencia est\u00e1 entre ${low} y ${high} con un 95% de confianza: el intervalo entero est\u00e1 a un lado del cero, que es lo que significa "gana" aqu\u00ed.`,
    notSeparable: (why, needed) =>
      why === 'no-difference-observed'
        ? 'No separables: los dos brazos registraron la misma tasa. Ning\u00fan tama\u00f1o de muestra separa una diferencia de cero, as\u00ed que no hay ning\u00fan "d\u00e9jalo correr m\u00e1s" que ofrecer: no hay nada que encontrar.'
        : why === 'nothing-recorded'
          ? 'No separables: un brazo no registr\u00f3 ning\u00fan resultado, as\u00ed que no hay tasa que comparar.'
          : `No separables con este tr\u00e1fico: el intervalo del 95% sobre la diferencia incluye el cero. Un n\u00famero es mayor, y eso no es un hallazgo. Unos ${needed} resultados por brazo zanjar\u00edan la diferencia observada hasta ahora.`,
    peeked: (short, declared, recorded) =>
      `Le\u00eddo antes de tiempo. La regla declarada eran ${declared} resultados por brazo y ${short} tiene ${recorded}. Nada puede impedir que se lea un n\u00famero antes de tiempo; esta l\u00ednea existe para que quien lea el resultado despu\u00e9s vea que se hizo.`,
    honoured: (declared) => `Regla de parada respetada: los dos brazos superaron ${declared} resultados registrados.`,
    marginalDearer: (better, usd) =>
      `${better} resuelve m\u00e1s y cuesta m\u00e1s. Un acierto extra cuesta ${usd}: esa cifra, y no la tasa, es de lo que depende la decisi\u00f3n.`,
    marginalCheaper: (better) => `${better} resuelve m\u00e1s Y cuesta menos por llamada. No se est\u00e1 cambiando nada por nada.`,
    neverPromotes: () =>
      'No se cambi\u00f3 nada. Un ganador es un hallazgo; tomarlo es una decisi\u00f3n con un nombre detr\u00e1s, y va en el plan como todo lo dem\u00e1s.',
  },

  ladder: {
    heading: () => 'Escaleras de escalado',
    noLadders: () =>
      'No hay escaleras configuradas. Una escalera manda una carga a un modelo barato primero y escala un fallo registrado a uno m\u00e1s caro: a\u00f1ade "ladders" a trazum.config.json, por ejemplo {"support": {"tiers": ["claude-haiku-4-5", "claude-opus-5"], "escalateOn": ["escalated"]}}.',
    workload: (label) => label,
    arithmetic: (cheap, dear, breakEven) =>
      `${cheap} por llamada barata, ${dear} cara. Tasa de escalado de equilibrio: ${breakEven}.`,
    measured: (rate, escalations, calls) =>
      `Medido: ${rate} (${escalations} de ${calls} llamadas escalaron).`,
    saving: (delta) => `Ahorra ${delta} por llamada frente a no haberla construido.`,
    costing: (delta) =>
      `Cuesta ${delta} por llamada M\u00c1S que no haberla construido. Escalar por encima de la tasa de equilibrio significa pagar el intento barato y el caro en la mayor\u00eda de las llamadas.`,
    atBreakEven: (band) =>
      `A menos de ${band} del equilibrio, as\u00ed que no se afirma ning\u00fan signo. Dentro de esa banda la respuesta cambia con la variaci\u00f3n normal de una semana a otra, y decir "ahorra" el lunes y "cuesta" el jueves con la misma pol\u00edtica ense\u00f1a a ignorar la cifra.`,
    cannotTell: (why, calls) =>
      why === 'too-few-calls'
        ? `A\u00fan no se puede decir: ${calls} llamadas llevaron un resultado declarado, y una tasa sobre tan pocas se mueve m\u00e1s con una llamada m\u00e1s que con nada que pudieras hacer.`
        : why === 'no-outcomes-recorded'
          ? 'No se puede decir: nada en este log registr\u00f3 un resultado para esta carga, as\u00ed que no hay tasa de escalado con la que comparar.'
          : why === 'tier-unpriced'
            ? 'No se puede decir: uno de los pelda\u00f1os no est\u00e1 en la tabla de precios, as\u00ed que la tasa de equilibrio no se puede calcular.'
            : 'No se puede decir: esta escalera no declara valores de escalado.',
    problemsHeading: (label) => `${label}: esta escalera no va a hacer lo que parece`,
    problem: (kind, detail) =>
      kind === 'escalate-on-a-success'
        ? `escalateOn nombra "${detail}", que "outcomes.success" declara como \u00c9XITO. Esta escalera paga dos veces por trabajo que ya función\u00f3, en cada llamada, con el aspecto exacto de una medida de ahorro.`
        : kind === 'escalate-on-undeclared'
          ? `escalateOn nombra "${detail}", que "outcomes.values" no declara. Esta escalera no se dispara nunca, en silencio.`
          : kind === 'tiers-not-cheapest-first'
            ? `"${detail}" es m\u00e1s barato que el pelda\u00f1o anterior. Eso no es una escalera; es una regla de enrutado que escala a algo m\u00e1s barato y lo reporta como ahorro.`
            : kind === 'duplicate-tier'
              ? `"${detail}" aparece dos veces en tiers.`
              : kind === 'unknown-model'
                ? `"${detail}" no est\u00e1 en la tabla de precios.`
                : `una escalera necesita al menos dos pelda\u00f1os; esta tiene ${detail}.`,
    theDoubleSpend: () =>
      'Un escalado paga dos veces: el intento barato no se devuelve. As\u00ed que una escalera solo ahorra por debajo de su tasa de escalado de equilibrio, y por encima cuesta m\u00e1s que no haberla construido: por eso la tasa se imprime junto a la medici\u00f3n en vez de dejarla para calcularla de cabeza.',
    notExecuted: () =>
      'Trazum no ejecuta el escalado. Una escalera escala despu\u00e9s de conocer un fallo, que es despu\u00e9s de que llegue la respuesta y normalmente despu\u00e9s de que algo la juzgue, as\u00ed que el reintento va en tu propio bucle. Lo que hay aqu\u00ed es la pol\u00edtica y la aritm\u00e9tica que dice si merece la pena.',
  },

  gateway: {
    badProvider: (given, known) =>
      given === ''
        ? `Nombra el proveedor delante del que ponerse. Conocidos: ${known}.`
        : `"${given}" no es un proveedor por el que hable esta pasarela. Conocidos: ${known}.`,
    pricedNotFronted: (given, known) =>
      `Trazum tarifa ${given} pero esta pasarela todavía no se pone delante de él: cubre ${known}. Es un hueco real y está en la hoja de ruta, no una errata tuya. Mientras tanto: "trazum profile" tarifa un registro de ${given} que exportes, y su gate --max-usd tumba una build por la factura ya gastada. Lo que no tienes es un rechazo antes de gastar el dinero, que es justo el sentido de la pasarela y la razón de decir esto en vez de listar ${given} como desconocido.`,
    needsPolicy: (policies) =>
      `--on-cannot-tell es obligatorio, y no hay valor por defecto: ${policies}. Cuando la pasarela no puede juzgar una llamada (sin presupuesto, sin nada medido, un modelo sin precio) pasa una de las dos, y solo tú sabes qué fallo puede sobrevivir tu producto. fail-open lo mantiene funcionando y deja correr la factura; fail-closed para la factura y se lo lleva por delante. Elegir por ti sería tomar la decisión más consecuente de tu arquitectura, en silencio, al instalar.`,
    listening: (where, provider) => `Pasarela en ${where}, delante de ${provider}`,
    unmeasured: (cause, sofar) => {
      if (cause === 'stream-broke') {
        return `sin medir: el stream se rompió antes de su evento de uso: el proveedor facturó esta llamada y esta sesión no puede verla (${sofar} sin medir hasta ahora)`;
      }
      if (cause === 'no-usage-event') {
        return `sin medir: el stream no llevó evento de uso: en OpenAI eso es toda llamada en streaming sin stream_options.include_usage, así que el total de abajo se queda corto (${sofar} sin medir hasta ahora)`;
      }
      return `sin medir: el proveedor respondió sin uso alguno en el cuerpo: la llamada se hizo y su coste no es deducible de la respuesta, así que el total de abajo se queda corto (${sofar} sin medir hasta ahora)`;
    },
    pointYourSdk: (where) =>
      `Apunta la URL base de tu SDK a ${where} y no cambies nada más. Habla el formato del propio proveedor, así que no hay cambios de código ni cliente nuevo.`,
    badMetricsPort: (given) => `--metrics-port es "${given}". Da un número entero de 0 a 65535: el puerto loopback del que lee Prometheus.`,
    metrics: (where) =>
      `Recuentos para Prometheus en ${where}/metrics, desde que arrancó este proceso: llamadas, tokens, coste a tarifa de lista, rechazos y lo que no se pudo medir. No se envía nada y no lleva ningún prompt.`,
    credential: () =>
      'Tu credencial se reenvía intacta y nunca se lee, ni se guarda, ni se registra, ni se pone en una URL. Trazum no tiene ninguna clave aquí y no puede hacer una llamada propia a través de esto.',
    neverSubstitutes: () =>
      'Una llamada por encima del presupuesto se rechaza con HTTP 402 y las alternativas más baratas nombradas, nunca se cambia, recorta ni degrada en silencio. 402 y no 429 a propósito: todos los SDK de proveedor reintentan un 429, lo que convertiría un rechazo en una tormenta de reintentos.',
    standing: (consumed, limit) =>
      `Juzgando contra ${consumed} de ${limit}, medido, leído una vez al arrancar: leer un fichero en el camino de la petición pondría la latencia de esta herramienta entre tú y tu proveedor en cada llamada.`,
    noStanding: () =>
      'Nada medido para este periodo, así que ninguna llamada se juzga y decide la política de abajo. Configura spend.monthlyUsd y descarga con trazum connect.',
    policy: (policy) =>
      policy === 'fail-open'
        ? 'Cuando no puede juzgar: la llamada pasa, y el registro dice que no se juzgó, no que estaba dentro del presupuesto.'
        : 'Cuando no puede juzgar: la llamada se rechaza. Nada pasa sin medir.',
    measured: (model, label, input, output, substituted) =>
      `  ${model}${label === null ? '' : ` [${label}]`}: ${input} entrada, ${output} salida${substituted ? ' (sustituida: marcada, y nunca contada como la llamada que se pidió)' : ''}`,
  },

  feedback: {
    heading: () => 'Contarnos algo',
    sendsNothing: () =>
      'Este comando no envía nada, y nada más aquí lo hace tampoco. Trazum no tiene telemetría: ni ping, ni hook de instalación, ni contador anónimo. Una herramienta cuyo argumento entero es que lee tu factura sin subirla no puede a la vez estar informando sobre ti en silencio, y una prueba hace fallar la compilación si este comando llega a tocar la red.',
    whereHeading: () => 'Dónde',
    wrongOptimisation: () =>
      'Una regla cambió lo que pedía un prompt, el informe que más importa, y el fallo que este producto existe para evitar:',
    bug: () => 'Cualquier otra cosa que esté mal:',
    question: () => 'Una pregunta, o una idea de la que no estás seguro:',
    security: () => 'Un problema de seguridad, en privado, nunca en una incidencia pública:',
    environmentHeading: () => 'Lo que te va a preguntar quien mantiene esto',
    environmentOnly: () =>
      'Y eso es todo. Aquí no hay nada de tu trabajo: ni la configuración, ni un prompt, ni una etiqueta, ni una cifra. Eso es lo que necesita un buen informe y lo que solo tú puedes decidir compartir.',
    linkHeading: () => 'Una incidencia en blanco con lo de arriba ya puesto',
  },

  conform: {
    noTarget: () =>
      'Pasa un archivo para comprobar: un registro de consumo, o cualquier documento que emita Trazum. Usa "-" para leer de la entrada estándar.',
    badContract: (given, known) => `"${given}" no es un contrato. Contratos conocidos: ${known}.`,
    unrecognised: (path) => `${path} no encaja con ningún contrato que Trazum conozca.`,
    heading: (path, contract) => `${path} se lee como un documento ${contract}`,
    headingLog: (path, contract, records) =>
      `${path} se lee como ${contract}: ${records} ${records === 1 ? 'registro' : 'registros'}`,
    conforms: () => 'Cumple. Todos los campos obligatorios están y son del tipo correcto.',
    problem: (at, kind, detail) => `${at}: ${detail} (${kind})`,
    moreProblems: (count) => `…y ${count} más. Arregla estos primero; suelen ser el mismo error.`,
    unavailableHeading: () => 'Lo que esto no puede responder, y qué lo desbloquearía',
    unavailable: (finding, because, unlockedBy) => `${finding}: ${because}. Añade ${unlockedBy}.`,
    unavailableNeverGates: () =>
      'Nada de eso ha hecho fallar nada. Decidir no registrar un campo es una decisión, no un defecto, y una puerta que fallara por ello sería esta herramienta diciéndote qué registrar.',
  },

  rollup: {
    noTargets: () =>
      'Pasa los documentos de perfil que quieres agregar (cada uno escrito por `trazum profile --json`) o un directorio con ellos.',
    noSuchTarget: (path) =>
      `${path} no está. Una agregación nunca adivina una contribución que no pudo leer.`,
    emptyDirectory: (path) =>
      `${path} no contiene documentos .json. Una carpeta vacía agregada en silencio diría que el equipo no gastó nada.`,
    heading: (contributors, usd, calls) =>
      `Agregación de ${plural(contributors, 'contribuyente')}, ${usd} en ${plural(calls, 'llamada')}`,
    span: (from, to) => `Cubre del ${from} al ${to}, declarado y nunca extrapolado.`,
    noSpan: () => 'Ningún contribuyente traía reloj, así que esta agregación no cubre ningún período declarado.',
    contributorsHeading: () => 'Contribuyentes, y lo que cada uno no pudo ver',
    contributor: (name, usd, calls, spanDays) =>
      `${name}: ${usd}, ${plural(calls, 'llamada')}${spanDays === null ? ', sin reloj' : `, ${plural(spanDays, 'día')}`}`,
    claimedSpan: (from, to, contributors) =>
      `Pidió del ${from} al ${to} ${plural(contributors, 'contribuyente')}, una afirmación sobre lo que se fue a buscar, separada de lo que mostraron los registros.`,
    claimedRow: (from, to) => `pidió del ${from} al ${to}`,
    silentRuns: (runs) => runs,
    undated: (count) =>
      `${plural(count, 'registro')} que la propia ventana de este contribuyente no pudo situar, porque no traían reloj`,
    rejectedHeading: () => 'Entregado y no agregado',
    rejected: (name, because) => `${name}: ${because}`,
    via: (rollup) => `vía ${rollup}`,
    rejectedVia: (name, via, because) => `${name}, vía ${via}: ${because}`,
    repeated: (names) =>
      `Entregado más de una vez, por nombre: ${names}. Su dinero se cuenta cada vez. Que dos máquinas compartan nombre es posible, así que no se ha restado nada: comprueba si se entregaron a la vez una agregación y una de las máquinas que contiene.`,
    identical: (names) => `El mismo documento llegó más de una vez: ${names}.`,
    identicalUsd: (usd) =>
      `${usd} del total de arriba es la repetición. Se cuenta, no se descarta: si es una exportación entregada dos veces o dos máquinas que coincidieron exactamente es cosa tuya saberlo.`,
    byLabelHeading: () => 'La factura agregada, por carga de trabajo',
    labelRow: (label, usd, calls) => `${label}: ${usd}, ${plural(calls, 'llamada')}`,
    notMergedHeading: () => 'Hallazgos que no se agregan',
    notMerged: (finding, because) => `${finding}: ${because}.`,
    presentIn: (names) => `Presente en: ${names}. Léelo ahí.`,
    cannotSayHeading: () => 'Lo que esta agregación no puede decir sobre sí misma',
    caveat: (code) => {
      switch (code) {
        case 'overlap-invisible':
          return 'El solapamiento entre contribuyentes aquí no se puede medir. Dos personas exportando el mismo tráfico duplican la factura, y una fusión de resúmenes no lo ve: las líneas en bruto que necesita una comprobación de duplicados no están en ningún documento.';
        case 'mismatched-spans':
          return 'Los contribuyentes cubren períodos claramente distintos. La suma es una suma; leer una parte de ella como comparación de ritmos es el error que esto señala.';
        case 'contributor-without-clock':
          return 'Un contribuyente no traía ninguna marca de tiempo, así que nada de su gasto está en los días de arriba.';
        case 'day-top-label-unknown':
          return 'Un día vino de más de un contribuyente, así que su etiqueta más cara se desconoce: cada contribuyente conoce la suya, y la respuesta agregada necesita el gasto por etiqueta y día que ningún documento lleva.';
        case 'no-claimed-period':
          return 'Un contribuyente no declaró ninguna ventana, así que su tramo es todo lo que se sabe de él, y un registro cuya última línea es del día 5 puede ser una semana tranquila o un registro que dejó de escribirse el día 5.';
        case 'silence-inside-a-claim':
          return 'Un contribuyente no registró nada en días que pidió. Si es un tramo tranquilo o una exportación que se paró es cosa tuya saberlo; los días están nombrados arriba.';
        case 'claim-not-bounded':
          return 'Un contribuyente declaró un extremo de la ventana y no el otro, así que su silencio no se puede medir contra ella.';
        case 'claim-too-long-to-enumerate':
          return 'Una ventana declarada era demasiado larga para recorrerla día a día y no se recorrió. La afirmación se conserva; solo su silencio queda sin medir.';
        case 'contributor-named-twice':
          return 'Un nombre de contribuyente aparece más de una vez, así que su dinero puede estar contado dos veces. Entregar una agregación y una de las máquinas que contiene hace justo eso, y los documentos difieren, así que la comprobación de documento idéntico no lo ve.';
        case 'identical-contributions':
          return 'Dos contribuciones eran el mismo documento.';
        case 'contribution-rejected':
          return 'Una contribución no se agregó. Esa máquina no aportó nada, que no es lo mismo que no haber gastado nada.';
        case 'unknown-fields-dropped':
          return 'Una contribución traía un campo numérico que esta versión no sabe clasificar, así que se dejó fuera en vez de combinarlo mal.';
        default:
          return code;
      }
    },
  },

  switchCmd: {
    noLog: () => 'Nombra un log de uso: trazum switch <uso.jsonl> --to <modelo>',
    noTarget: () => 'Nombra el candidato: --to <modelo>. trazum models lista el catálogo.',
    unknownModel: (id) =>
      `El catálogo no tiene precio para «${id}», y una comparación contra un precio que nadie tiene es peor que ninguna. trazum models lista lo que conoce; un overlay de precios añade lo que no.`,
    heading: (target) => `Cambiar este tráfico a ${target}, medido`,
    saves: (current, target, saving) =>
      `${current} en este log se vuelven ${target} en el candidato, ${saving} menos, sobre los mismos tokens.`,
    costs: (current, target, extra) =>
      `${current} en este log se vuelven ${target} en el candidato, ${extra} MÁS. Este cambio pierde dinero antes siquiera de preguntar por la calidad.`,
    nothingMovable: () => 'Aquí no puede moverse nada: cada porción ya está en el candidato o excede su ventana de contexto.',
    movable: (calls, slices) => `${calls} llamada(s) en ${slices} porción(es) podrían moverse.`,
    overContext: (slices, usd) =>
      `${slices} porción(es) por valor de ${usd} no pueden moverse: al menos una llamada excede la ventana de contexto del candidato. Su dinero no está en ninguna cifra de arriba.`,
    alreadyOnTarget: (calls, usd) => `${calls} llamada(s) por valor de ${usd} ya están en el candidato.`,
    window: (days) => `Medido sobre ${days} día(s) de este log: cada cifra de arriba es aritmética sobre esa ventana.`,
    noWindow: () => 'Ningún registro lleva marca de tiempo, así que este log no tiene tasa medida.',
    breakEvenDays: (migration, days, measuredDays) =>
      `Un coste de migración declarado de ${migration} se recupera tras ~${days} día(s) al ahorro medido sobre ${measuredDays} día(s). División sobre el pasado: lo que haga el mes que viene es asunto del mes que viene.`,
    breakEvenNoSaving: (migration) =>
      `Break-even rechazado: el cambio no ahorra nada, así que los ${migration} declarados no tienen nada que recuperar.`,
    breakEvenNoClock: (migration) =>
      `Break-even rechazado para ${migration}: ningún registro lleva marca de tiempo, así que no hay tasa medida por la que dividir.`,
    evalCost: (cases, total) =>
      `Saber si el candidato vale también cuesta dinero: ${cases} caso(s) por trazum route son ~${total} a la llamada media de este log (dos llamadas al titular y una al candidato por caso).`,
    evalCostHint: () => 'Pasa --cases <n> para tasar la evaluación que el cambio exige.',
    quality: (routeCommand) =>
      `Nada de lo de arriba dice si el candidato puede hacer el trabajo. Eso es una evaluación, no aritmética: ${routeCommand}`,
  },

  modelPricing: {
    noFile: () =>
      'Nombra el fichero de ajustes que contiene modelPricing: trazum model-pricing <managed-settings.json> --reviewed AAAA-MM-DD',
    noReviewed: () =>
      '--reviewed AAAA-MM-DD es obligatorio: la fecha en que alguien comprobó estas tarifas contra el contrato por última vez. Un overlay de edad desconocida es peor que el catálogo incluido, cuya edad imprime cada informe.',
    notFound: (file) => `${file} no es un fichero.`,
    tooLarge: (file, bytes) => `${file} pasa de ${bytes} bytes, más de lo que cabe en un fichero de ajustes.`,
    notJson: (file, detail) => `${file} no es JSON: ${detail}`,
    skipped: (key, reason, detail) => {
      switch (reason) {
        case 'invalid':
          return `"${key}" queda fuera: ${detail}. Claude Code también la descarta y conserva el resto.`;
        case 'zero':
          return `"${key}" queda fuera: tiene una tarifa de cero, y Trazum no tasa nada a cero. Sus llamadas siguen a precio de lista aquí.`;
        case 'unknown-model':
          return `"${key}" no es un modelo que el catálogo conozca, así que no se tasa nada con él. Si es un id de proveedor o de pasarela de un modelo Claude, añade la fila de ese modelo con el id del catálogo.`;
        case 'duplicate':
          return `"${key}" queda fuera: es el mismo modelo que "${detail}", cuya fila se usa. Trazum no puede tasar un modelo de dos maneras.`;
      }
    },
    empty: () => 'Nada de la tabla llega a un modelo que Trazum tase, así que no se escribió ningún overlay.',
    summary: (fromRows, fromMultiplier, multiplier) =>
      `${fromRows} modelo(s) a las tarifas de tu tabla${multiplier === undefined ? '' : `, por ${multiplier}`}` +
      (fromMultiplier > 0 ? `; ${fromMultiplier} modelo(s) Claude más a precio de lista por ${multiplier}.` : '.'),
    batch: (models) =>
      `Lotes: la tabla no tiene tarifa de lotes, así que ${models} modelo(s) conservan el descuento de lotes del catálogo sobre la nueva tarifa de entrada.`,
    fastKept: (models) =>
      `Modo rápido: un overlay no puede llevar una tarifa de modo rápido, así que estos conservan la publicada, sin tu tabla ni tu multiplicador: ${models}. Claude Code sí los aplica a los turnos rápidos.`,
    usOnly: (models) =>
      `Inferencia solo en EE. UU.: sin recargo sobre una fila, como lo aplica Claude Code: ${models}.`,
    written: (file, models) => `Escrito un overlay de ${models} modelo(s) en ${file}. Úsalo con --pricing ${file}.`,
  },

  ownrate: {
    missing: () =>
      'Los dos números los declaras tú: trazum ownrate --gpu-usd-hour <n> --tokens-per-second <n> [--utilization <0-1>]',
    invalid: (flag) => `--${flag} debe ser un número positivo (utilization: mayor que 0, como mucho 1).`,
    result: (usdPerMTok, tokensPerSecond, gpuUsdPerHour, utilizationPct) =>
      `${usdPerMTok} por millón de tokens: ${gpuUsdPerHour}/hora entre ${tokensPerSecond} tokens/segundo al ${utilizationPct}% de servicio.`,
    declared: () =>
      'Derivado de tu declaración, honesto solo si el rendimiento se midió. Cada informe que tase este modelo descansará sobre estos dos números.',
    snippetHeading: () => 'Pega en trazum.config.json (el fichero de overlay «pricing»):',
  },

  receipt: {
    noLog: () => 'Nombra un log de uso del que hacer el recibo.',
    written: (file, lines) => `Recibo de ${lines} línea(s) escrito en ${file}.`,
    summary: (lines, usd) =>
      `${lines} línea(s), ${usd} con precio. Cada cifra lleva la tarifa que la produjo y la fecha en que se revisó esa tarifa.`,
    unpriced: (models, calls) =>
      `${models} modelo(s) que el catálogo no precia, con ${calls} llamada(s): nombrados en los huecos del recibo y fuera del total, en vez de costados a cero.`,
    unpricedRecords: (models, records) =>
      `${models} modelo(s) que el catálogo no precia, con ${records} registro(s): nombrados en los huecos del recibo y fuera del total, en vez de costados a cero.`,
    unread: (count) => `${count} línea(s) del log no se pudieron leer, y el recibo lo dice.`,
    noClock: () =>
      'El log no lleva reloj, así que el recibo no está acotado en el tiempo y lo declara en vez de inventarse un periodo.',
    undatedExcluded: (calls) =>
      `${count(calls)} ${calls === 1 ? 'llamada no trae' : 'llamadas no traen'} marca de tiempo y no se ${calls === 1 ? 'puede' : 'pueden'} situar en este periodo, así que no ${calls === 1 ? 'está' : 'están'} en esta factura: el total es un suelo del periodo.`,
    webSearch: (requests, usd) =>
      `${count(requests)} ${requests === 1 ? 'búsqueda web, cobrada' : 'búsquedas web, cobradas'} por búsqueda además de los tokens: ${usd} del total.`,
    unpricedWebSearch: (requests, models) =>
      `${count(requests)} ${requests === 1 ? 'búsqueda web' : 'búsquedas web'} en ${models}, cuya lista de precios no publica una tarifa por búsqueda: fuera del total, que es un suelo para ${requests === 1 ? 'ella' : 'ellas'}.`,
    nothingToBill: () => 'Nada de este log se pudo precificar, así que el recibo no tiene líneas.',
  },

  fromCodex: {
    noPath: () => 'from-codex necesita una ruta explícita: trazum from-codex ./sesiones',
    notFound: (path) => `No se puede leer ${path}`,
    noFiles: (path) => `No hay archivos JSONL en ${path}`,
    noUsage: () => 'No hay uso de Codex atribuible. Revisa los huecos indicados; no se escribió un registro de coste cero.',
    summary: (files, records, duplicates) => `${files} archivo(s) Codex, ${records} registro(s) corroborados, ${duplicates} instantáneas repetidas descartadas.`,
    gaps: (missingModel, unsupported, unparseable) => `Huecos Codex: ${missingModel} sin contexto de modelo, ${unsupported} instantáneas no admitidas o sin corroborar, ${unparseable} líneas ilegibles. No son llamadas de coste cero.`,
    caveat: () => 'La telemetría Codex se valora a tarifas API del catálogo, no como factura de suscripción. Totales restaurados, reinicios y deltas ambiguos quedan excluidos.',
    written: (file) => `Registro normalizado escrito en ${file}`,
  },

  fromGeminiCli: {
    noPath: () => 'from-gemini-cli necesita un archivo de sesión o un directorio: trazum from-gemini-cli ~/.gemini/tmp',
    notFound: (path) => `No se puede leer ${path}`,
    noFiles: (path) => `No hay archivos de sesión de Gemini CLI (.jsonl o .json) en ${path}`,
    noUsage: () => 'Ninguna respuesta de Gemini CLI traía recuento de tokens. Revisa los huecos indicados; no se escribió un registro a coste cero.',
    summary: (files, records, repeats) =>
      `${files} archivo(s) de Gemini CLI, ${records} registro(s) de respuesta con tokens, ${repeats} línea(s) reescrita(s) leída(s) una sola vez.`,
    gaps: (missingModel, unsupported, unparseable) =>
      `Huecos de Gemini CLI: ${missingModel} respuesta(s) sin modelo, ${unsupported} con recuentos imposibles, ${unparseable} línea(s) ilegible(s). No son llamadas a coste cero.`,
    remainder: (replies) =>
      `${replies} respuesta(s) de Gemini CLI de un grabador antiguo guardaban un total mayor que sus partes; el resto se valora como salida, el lado más caro, en vez de descartarse.`,
    caveat: () =>
      'Las sesiones de Gemini CLI se valoran a tarifas API del catálogo. Con el nivel gratuito o un plan de Code Assist es un equivalente, no lo que pagaste. Los tokens de razonamiento se valoran como salida y los resultados de herramientas como entrada, como los factura Google.',
    written: (file) => `Registro de uso normalizado escrito en ${file}`,
  },

  fromOtel: {
    noPath: () => 'from-otel necesita un archivo o directorio OTLP: trazum from-otel spans.json',
    notFound: (path) => `${path}: no existe`,
    noExports: (path) => `${path}: no hay exports OTLP .json/.jsonl/.ndjson debajo.`,
    summary: (files, llmSpans) => `${files} archivo(s), ${llmSpans} span(s) LLM tasados.`,
    skipped: (otherSpans) => `${otherSpans} span(s) no-LLM omitidos: el resto del trabajo de la traza, no una factura.`,
    noCache: (count) => `${count} span(s) sin datos de caché. OpenTelemetry no ha estandarizado el reparto del TTL de caché, así que los veredictos de caché dicen «no se puede saber» en este log en vez de uno inventado.`,
    unparseable: (count) => `${count} línea(s) no se pudieron parsear como JSON.`,
    written: (file) => `Escrito ${file}.`,
  },

  reconcile: {
    noReceipt: () =>
      'reconcile necesita un recibo y un informe de costes: trazum reconcile receipt.json --against cost.json',
    noReport: () =>
      'reconcile necesita --against <informe de costes>: el JSON del GET /v1/organizations/cost_report de Anthropic o del GET /v1/organization/costs de OpenAI.',
    receiptUnreadable: (file) => `${file}: no se puede leer como JSON.`,
    notAReceipt: (file) =>
      `${file}: no es un recibo. Necesita total.usd y span.fromMs/toMs, que es lo que escribe «trazum receipt».`,
    reportUnreadable: (file) => `${file}: no encontrado.`,
    notAReport: (file) =>
      `${file}: no es el JSON que devuelve un endpoint de costes, ni el de Anthropic ni el de OpenAI. Pasa el cuerpo de la respuesta entero.`,
    summary: (computed, billed, difference) =>
      `Trazum calculó $${computed.toFixed(2)}; el proveedor facturó $${billed.toFixed(2)}. Diferencia: $${difference.toFixed(2)}.`,
    notTokens: (billed, computed) =>
      `Se facturaron $${billed.toFixed(2)} por algo que no son tokens: búsqueda web, ejecución de código, uso de sesiones. La cifra de Trazum incluye $${computed.toFixed(2)} de búsquedas web y nada más de esto, así que $${(billed - computed).toFixed(2)} de la diferencia son cargos que nunca dijo cubrir.`,
    batch: (billed, computed) =>
      `Se facturaron $${billed.toFixed(2)} en el nivel batch; la cifra de Trazum incluye $${computed.toFixed(2)} de llamadas batch, cobradas a la tarifa batch de cada modelo. Los $${(billed - computed).toFixed(2)} que las separan salen de la diferencia.`,
    splitUnknown: () =>
      'Este recibo no dice cuánto costaron sus llamadas batch y sus búsquedas web (ningún recibo anterior a 2.7.5 lo dice), así que los cargos batch y no de tokens del proveedor se restaron enteros, como si Trazum no hubiera cobrado ninguno. Un recibo hecho con 2.7.4 sí cobró las llamadas batch, y entonces el resto se queda corto en ellas: vuelve a ejecutar trazum receipt y concilia ese.',
    remainder: (usd) =>
      `Quedan $${usd.toFixed(2)}, y es la única cifra aquí que merece discusión: los mismos tokens estándar cobrados de dos maneras, o uso que tu log nunca vio. Si es negativa, Trazum cobró más de lo que te facturaron, que es una tarifa desactualizada en la dirección que te cuesta dinero.`,
    notAttributable: () =>
      'La diferencia no se puede atribuir: este informe no se agrupó por descripción, así que ninguna fila dice si fue tokens, una búsqueda web o un batch. Añade group_by[]=description.',
    notAttributableByLineItem: () =>
      'La diferencia no se puede atribuir: este informe no se agrupó por line item, así que ninguna fila dice a qué fue el dinero. Añade group_by[]=line_item.',
    batchNotSeparable: () =>
      'Este informe nunca dice si una línea fue un trabajo por lotes, así que el descuento de batch, si lo hay, está dentro de ese resto y no fuera de él.',
    unknownUnit: (usd) =>
      `$${usd.toFixed(2)} del resto está en line items cuya unidad es null: el informe dice que ninguna unidad aplica, así que ni se cuenta como tokens ni como lo contrario. Se nombra aquí para que el resto no descanse sobre una unidad que nadie declaró.`,
    windowNotCovered: (fromComputed, toComputed, fromBilled, toBilled) =>
      `No son la misma ventana. El recibo cubre de ${fromComputed} a ${toComputed}; el informe cubre de ${fromBilled} a ${toBilled}. Un recibo comparado con una factura de otros días es una cifra equivocada bajo un título correcto, así que no se comparó nada.`,
    noBilledWindow: () => 'El informe de costes no tiene intervalos, así que no hay ventana contra la que comparar.',
    otherCurrency: (list) =>
      `El informe trae ${list} además de USD. Sumar dos monedas en un total necesita un tipo de cambio, e inventarlo es justo lo que este producto existe para no hacer. No se comparó nada.`,
    truncated: () =>
      'El informe dice has_more: true, así que la cifra facturada se queda una página corta y la diferencia sale menor de lo que es.',
    unreadableAmount: (count) =>
      `${count} fila(s) traían un importe que no es un número. Se cuentan, nunca se leen como cero: un cero encogería la factura en silencio.`,
    written: (file) => `Escrito ${file}.`,
  },

  fromAnthropic: {
    noPath: () =>
      'from-anthropic necesita el informe de uso que produjo tu propio curl: trazum from-anthropic usage.json --label facturación',
    notFound: (path) => `${path}: no encontrado`,
    summary: (buckets, rows) => `${buckets} intervalo(s), ${rows} fila(s) de uso leída(s).`,
    unnamedModel: (count) =>
      `${count} fila(s) no nombraron modelo y no están en la salida: el informe no se agrupó por modelo, así que nada en la fila dice qué respondió. Añade group_by[]=model a la petición.`,
    nonStandardTier: (count) =>
      `${count} fila(s) se facturaron en un tramo que ninguna tarifa publicada aquí cubre (priority, flex, o batch en un modelo sin tarifa batch) y no están en la salida. Cobrarlas a la tarifa estándar sería adivinar sin forma de comprobarlo.`,
    batchPriced: (count) =>
      `${count} fila(s) corrieron en la Batch API y se cobran a la tarifa batch del modelo, la mitad de la estándar, como la publica la página de precios.`,
    tierUnknown: () =>
      'El informe no nombró ningún tramo de servicio, así que una fila batch y una estándar son indistinguibles aquí. Todo se leyó como estándar. Añade group_by[]=service_tier si parte de este uso va por lotes.',
    fastPriced: (count) =>
      `${count} fila(s) corrieron en modo rápido y se cobran con la tarifa rápida del propio modelo, como se cobraría una respuesta registrada con usage.speed "fast".`,
    fastUnpriced: (count, models) =>
      `${count} fila(s) corrieron en modo rápido en un modelo para el que Trazum no tiene tarifa rápida (${models}) y no están en la salida. La tarifa estándar queda muy por debajo de la del modo rápido, así que cobrarlas con ella dejaría la factura corta.`,
    speedUnknown: (count) =>
      `El informe no nombró ninguna velocidad, y ${count} fila(s) son de un modelo con modo rápido, que se factura más caro. Se leyeron como estándar. Añade group_by[]=speed si parte de este uso corrió en modo rápido.`,
    usOnly: (count) =>
      `${count} fila(s) corrieron con inference_geo "us" y se cobran al 1,1x publicado que la inferencia solo en EE. UU. factura en Claude 4.6 y posteriores.`,
    usOnlyFloor: (count) =>
      `${count} fila(s) corrieron con inference_geo "us" en un modelo para el que Trazum no tiene multiplicador de EE. UU. Se cobran a la tarifa global, así que su cifra es un suelo.`,
    geoUnknown: (count) =>
      `El informe no nombró ninguna geografía de inferencia, y ${count} fila(s) son de un modelo que factura la inferencia solo en EE. UU. a 1,1x. Se leyeron como globales. Añade group_by[]=inference_geo si algún workspace fija la inferencia en EE. UU.`,
    webSearch: (count) =>
      `${count} búsqueda(s) web van con sus filas y se cobran por búsqueda, $10 por cada 1.000 en Claude, además de los tokens.`,
    webSearchLeftOut: (count) =>
      `${count} búsqueda(s) web estaban en filas que quedaron fuera arriba, así que tampoco están en ninguna factura.`,
    truncated: () =>
      'El informe dice has_more: true. Esto es una página de varias y una factura hecha con ella se queda corta. Sigue next_page hasta que has_more sea false, y convierte cada página.',
    unparseable: () =>
      'Eso no es el JSON que devuelve GET /v1/organizations/usage_report/messages. Pasa el cuerpo de la respuesta entero, no un campo suyo.',
    labelledByWorkspace: (count) =>
      `${count} fila(s) tomaron su etiqueta del mapeo de workspaces.`,
    unruledWorkspace: (count) =>
      `${count} fila(s) traían un workspace que ninguna regla nombra. Conservan --label si lo diste y quedan sin atribuir si no: un workspace para el que nadie escribió una regla está mejor sin atribuir que atribuido al vecino.`,
    workspaceNotGrouped: () =>
      'Diste un mapeo de workspaces y ninguna fila traía id de workspace, así que el reparto que pediste no se hizo. O el informe no se agrupó por workspace o esta organización solo usa el de por defecto, y nada aquí puede distinguirlo. Añade group_by[]=workspace_id.',
    rulesUnreadable: (file) =>
      `${file}: no se puede leer como mapeo de workspaces. Es un array JSON de {"workspace": "wrkspc_…" | null, "label": "nombre"}.`,
    ruleBad: (file, at) =>
      `${file}: la entrada ${at} no es una regla. Cada una necesita "label" y "workspace", que puede ser null para el workspace por defecto pero no puede faltar: un campo que falta es una errata y null es una decisión.`,
    rulesEmpty: (file) =>
      `${file}: no hay reglas dentro. Pasaste --label-by-workspace para repartir algo, y un archivo vacío repartiría nada en silencio.`,
    written: (file) => `Escrito ${file}.`,
  },

  fromOpenai: {
    noPath: () =>
      'from-openai necesita el informe de uso que produjo tu propio curl: trazum from-openai usage.json --label facturación',
    notFound: (path) => `${path}: no encontrado`,
    summary: (buckets, rows, requests) =>
      `${buckets} intervalo(s), ${rows} fila(s) de uso leída(s), que cubren ${requests} petición(es).`,
    unnamedModel: (count) =>
      `${count} fila(s) no nombraron modelo y no están en la salida: el informe no se agrupó por modelo, así que nada en la fila dice qué respondió. Añade group_by[]=model a la petición.`,
    batch: (count) =>
      `${count} fila(s) eran trabajos por lotes en un modelo para el que Trazum no tiene tarifa batch, y no están en la salida: batch se factura con descuento, y cobrarlo a la tarifa estándar inflaría la factura y parecería correcto.`,
    batchPriced: (count) =>
      `${count} fila(s) eran trabajos por lotes y se cobran a la tarifa batch del modelo, la mitad de la estándar, como la publica la página de precios.`,
    batchUnknown: () =>
      'El informe nunca dijo si algo fue batch, así que una fila por lotes y una estándar son indistinguibles aquí. Todo se leyó como estándar. Añade group_by[]=batch si parte de este uso va por lotes.',
    nonDefaultTier: (count, tiers) =>
      `${count} fila(s) estaban en un tramo de servicio para el que Trazum no tiene tabla en ese modelo (${tiers}) y no están en la salida. La tarifa estándar no es la de ese tramo, y el esquema no lista los tramos, así que se nombran en vez de adivinarse.`,
    serviceTierPriced: (count, tiers) =>
      `${count} fila(s) corrieron en otro tramo de servicio (${tiers}) y se cobran con la tabla propia de ese tramo, como se cobraría una respuesta registrada que lo nombre.`,
    tierUnknown: () =>
      'El informe no nombró ningún tramo de servicio. Todo se leyó como el tramo por defecto. Añade group_by[]=service_tier si parte de este uso corre en otro.',
    mixed: (rows, tokens, cacheWrites) =>
      `${rows} fila(s) traían tokens de audio o imagen, para los que una tarifa de texto no es la tarifa. Cada una se redujo a su parte de texto; ${tokens} token(s) de audio e imagen no están en ninguna línea de la salida${cacheWrites > 0 ? `, y ${cacheWrites} token(s) de escritura de caché de esas filas se quedaron fuera también, porque el informe no les da modalidad` : ''}.`,
    cacheWrite12h: (tokens) =>
      `${tokens} token(s) se escribieron en la caché de 12 horas. Esa escritura no tiene un precio publicado donde Trazum pueda leerlo, así que se quedan en el total del prompt a la tarifa de entrada normal: la cifra de esos tokens es un suelo.`,
    unsplit: (count) =>
      `${count} fila(s) traían tokens de audio o imagen y ningún desglose de texto por el que reducirlas, y no están en la salida. Cobrarlas a tarifa de texto sería adivinar.`,
    truncated: () =>
      'El informe dice has_more: true. Esto es una página de varias y una factura hecha con ella se queda corta. Sigue next_page hasta que has_more sea false, y convierte cada página.',
    unparseable: () =>
      'Eso no es el JSON que devuelve GET /v1/organization/usage/completions. Pasa el cuerpo de la respuesta entero, no un campo suyo.',
    labelledByProject: (count) => `${count} fila(s) tomaron su etiqueta del mapeo de proyectos.`,
    unruledProject: (count) =>
      `${count} fila(s) traían un proyecto que ninguna regla nombra. Conservan --label si lo diste y quedan sin atribuir si no: un proyecto para el que nadie escribió una regla está mejor sin atribuir que atribuido al vecino.`,
    projectNotGrouped: () =>
      'Diste un mapeo de proyectos y ninguna fila traía id de proyecto, así que el reparto que pediste no se hizo. Añade group_by[]=project_id.',
    rulesUnreadable: (file) =>
      `${file}: no se puede leer como mapeo de proyectos. Es un array JSON de {"project": "proj_…", "label": "nombre"}.`,
    ruleBad: (file, at) =>
      `${file}: la entrada ${at} no es una regla. Cada una necesita un id en "project" y una "label", ambos cadenas no vacías.`,
    rulesEmpty: (file) =>
      `${file}: no hay reglas dentro. Pasaste --label-by-project para repartir algo, y un archivo vacío repartiría nada en silencio.`,
    written: (file) => `Escrito ${file}.`,
  },

  bill: {
    noPath: (tried) =>
      `bill necesita un archivo o un directorio que leer, y no encontró sesiones de Claude Code, Codex ni Gemini CLI en ${tried}. Indica una: trazum bill ~/.claude/projects, o trazum bill uso.jsonl.`,
    defaultPathFor: (agent, dir) => `Sin ruta, así que leo la carpeta propia de ${agent}: ${dir}`,
    labelledByProject: (files) =>
      `${files} archivo(s) de sesión etiquetado(s) por su carpeta de proyecto. --label pone una sola etiqueta, --no-label-from-project los deja sin etiqueta.`,
    unknownMore: (count) => `${count} archivo(s) más que ninguna forma reclama, sin adivinar y fuera de la factura.`,
    sessionSideFiles: (count) =>
      `${count} archivo(s) que Claude Code guarda dentro de las carpetas de sus sesiones (metadatos de subagentes, diarios de workflows, salidas largas de herramientas) no son uso, y se han pasado por alto.`,
    shapeSummary: (shape, files, records, leftOut, command) =>
      `${files} archivo(s): ${shape}${records === null ? ', leídos tal cual' : `, ${records} registro(s)`}${leftOut > 0 ? `, ${leftOut} fila(s) fuera${command === null ? '.' : `. trazum ${command} sobre un archivo dice por qué.`}` : '.'}`,
    statementHeading: () => 'Tu factura',
    statementTotal: (usd, calls) => `${usd} en ${calls.toLocaleString('es-ES')} llamada(s) con precio`,
    statementTotalRows: (usd, rows) =>
      `${usd} en ${rows.toLocaleString('es-ES')} fila(s) con precio de un informe de ccusage, cada una el total de un periodo para un modelo y no una llamada`,
    statementTotalMixed: (usd, records) =>
      `${usd} en ${records.toLocaleString('es-ES')} registro(s) con precio, llamadas y filas de ccusage juntas`,
    statementMixedRows: () =>
      'Algunos de estos registros son filas de un informe de ccusage, cada una el total de un día, una semana, un mes o una sesión para un modelo, así que estas cuentas suman llamadas y filas. ccusage no cuenta peticiones.',
    colProject: () => 'proyecto',
    colWorkload: () => 'carga',
    colModel: () => 'modelo',
    colAgent: () => 'agente',
    colPeriod: (unit) => (unit === 'day' ? 'día' : unit === 'week' ? 'semana' : 'mes'),
    earlierPeriods: (count, unit) =>
      `… y ${count} ${unit === 'day' ? 'día(s)' : unit === 'week' ? 'semana(s)' : 'mes(es)'} anterior(es)`,
    periodsUndated: (calls, usd, unit) =>
      `${usd} de ${calls} llamada(s) sin marca de tiempo está en el total y en ${unit === 'day' ? 'ningún día' : unit === 'week' ? 'ninguna semana' : 'ningún mes'}.`,
    periodHint: (since, until, unit) =>
      `${unit === 'day' ? 'Un día' : unit === 'week' ? 'Una semana' : 'Un mes'} por separado: --since ${since} --until ${until}.`,
    badBy: (value) => `--by admite day, week o month, no "${value}".`,
    badAgent: (value, known) => `--agent no conoce "${value}". Los agentes que nombra son ${known}.`,
    agentNoRecords: (name, known) =>
      `--agent ${name} no encontró ningún registro de ese agente entre lo leído. Los agentes que nombra son ${known}; un log suelto o una exportación de proveedor no pertenece a ninguno.`,
    agentOnly: (name, kept, leftOut) =>
      `--agent: solo se factura ${kept} registro(s) de ${name}; ${leftOut} registro(s) de otros agentes u orígenes quedan fuera.`,
    badTimezone: (value) => `--timezone no conoce "${value}". Indica una zona horaria IANA como Europe/Madrid o America/New_York.`,
    timezoneConflict: (flag) =>
      `--timezone corta los días del extracto en esa zona y ${flag} corta los suyos en UTC, así que los dos imprimirían días que no coinciden. Quita uno de los dos.`,
    zoneLine: (zone) => `Los días se cortan en ${zone}, no en UTC: un día suelto de --since/--until es un día de esa zona, y también cada fila de arriba.`,
    periodHintZone: (zone) => `Añade --timezone ${zone} para facturarlo con los mismos días.`,
    zoneReceiptNote: (zone) =>
      `--timezone ${zone}: el recibo guarda instantes y ningún día, así que la zona solo decide qué significa un día suelto de --since/--until.`,
    colCalls: () => 'llamadas',
    colRows: () => 'filas',
    colRecords: () => 'registros',
    colShare: () => 'parte',
    moreRows: (count) => `… y ${count} más`,
    colMonth: () => 'mes',
    earlierMonths: (count) => `… y ${count} mes(es) anterior(es)`,
    monthsUndated: (calls, usd) =>
      `${usd} de ${calls} llamada(s) sin marca de tiempo está en el total y en ningún mes.`,
    monthHint: (since, until) => `Un mes por separado: --since ${since} --until ${until}.`,
    statementUnpriced: (models, calls) =>
      `Fuera del total: ${calls} llamada(s) a ${models}, que el catálogo no tiene con precio. Se nombran, nunca se cuentan como $0.`,
    statementUnpricedRecords: (models, records) =>
      `Fuera del total: ${records} registro(s) de ${models}, que el catálogo no tiene con precio. Se nombran, nunca se cuentan como $0 y nunca se valoran con la cifra de ccusage.`,
    ccusageWindowed: () =>
      'Las cifras propias de ccusage cubren el informe entero, no el periodo pedido, así que no se ponen junto a esta factura. trazum from-ccusage sobre el archivo las pone junto a las del catálogo, modelo a modelo.',
    ccusageTimezone: () =>
      '--timezone corta los días de la factura en esa zona, y una fila de un informe de ccusage ya es el total de un día, una semana, un mes o una sesión enteros, con los días cortados por ccusage en la zona en que se ejecutó, que su JSON no dice. Llevada a otra zona, una fila entera caería en otro día o en otro mes. Ejecuta ccusage con su propio --timezone y factura su archivo sin esta opción.',
    ccusageSideFile: (flag) =>
      `${flag} cuenta lo que factura como llamadas y lo reparte por día, y una fila de un informe de ccusage es el total de un periodo, no una llamada: escrito a partir de una, imprimiría el total de un día o de un mes como una llamada en un solo día. Así que no se escribe para un informe de ccusage. El extracto (--table) lo factura, y también el recibo (--receipt), cuyos campos calls cuentan registros.`,
    ccusageWindowCuts: (rows, startUnknown, report) =>
      `--since/--until cae dentro de ${rows} fila(s) de este informe ${ccusageUnitEs(report).report} de ccusage. Cada fila es el total de ${ccusageUnitEs(report).whole} y no dice cómo se repartió dentro, así que no se puede facturar una parte, y facturarla entera o nada pasaría por el periodo pedido. Pon --since y --until en los bordes de las filas, o factura un informe más fino (ccusage daily --json).${startUnknown > 0 ? ` ${startUnknown} de ellas son sesiones cuyo informe solo nombra su última actividad, así que no se puede saber si empezaron antes del borde; ccusage claude session --json nombra también la primera.` : ''}`,
    ccusageByCuts: (unit, rows, startUnknown, report) =>
      `--by ${unit} repartiría ${rows} fila(s) de este informe ${ccusageUnitEs(report).report} de ccusage entre ${unit === 'day' ? 'días' : unit === 'week' ? 'semanas' : 'meses'}. Cada fila es el total de ${ccusageUnitEs(report).whole} y no dice cómo se repartió dentro, así que no se puede poner en ${unit === 'day' ? 'un solo día' : unit === 'week' ? 'una sola semana' : 'un solo mes'}. Factúralo por una unidad dentro de la que quepan sus filas, o factura un informe más fino (ccusage daily --json).${startUnknown > 0 ? ` ${startUnknown} de ellas son sesiones cuyo informe solo nombra su última actividad, así que no se puede saber en qué ${unit === 'day' ? 'día' : unit === 'week' ? 'semana' : 'mes'} empezaron.` : ''}`,
    ccusageMonthsCut: (rows) =>
      `Sin reparto por mes: ${rows} fila(s) del informe de ccusage cruzan el borde de un mes, o son sesiones cuyo inicio no se conoce, y una fila no dice cómo se repartió dentro de su periodo.`,
    statementUnread: (lines) => `${lines} línea(s) no se pudieron leer como uso y no están en el total.`,
    statementNext: () =>
      'El recibo como datos: --receipt, o -o recibo.json. El documento para quien paga: --pdf-out factura.pdf.',
    statementNextReceipt: () => 'El recibo como datos: --receipt, o -o recibo.json.',
    notFound: (path) => `${path}: no encontrado`,
    noFiles: (path) => `${path}: no hay archivos .json, .jsonl, .ndjson ni .log dentro, ni sin comprimir ni en .gz.`,
    file: (path, shape, records, leftOut, command) =>
      `${path}: ${shape}${records === null ? ', leído tal cual' : `, ${records} registro(s)`}${leftOut > 0 ? `, ${leftOut} fila(s) fuera${command === null ? '.' : `. Ejecuta trazum ${command} sobre él para ver por qué.`}` : '.'}`,
    unknown: (path) =>
      `${path}: ninguna forma que esta herramienta lee lo reclama, así que no se adivinó y no está en la factura.`,
    ambiguous: (path, shapes) =>
      `${path}: lo reclama más de una forma (${shapes}), así que no se convirtió. Ejecuta el comando from-<forma> dedicado y di cuál.`,
    costReport: (path) =>
      `${path}: un informe de costes de proveedor, que es una factura y no uso. Ponlo junto a un recibo con trazum reconcile.`,
    nothingRead: () => 'Nada de esto era una fuente de uso que esta herramienta lea, así que no hay nada que facturar.',
    sources: (read, seen) => `${read} de ${seen} archivo(s) leído(s) como uso.`,
    sendNeedsReceipt: () =>
      '--send envía el recibo, así que necesita --receipt: bill --receipt --send <url>. No se envía nada más.',
    badSendTarget: (reason, keyVariable) =>
      reason === 'credentials-in-url'
        ? '--send: esa URL lleva credenciales. Las URL acaban en registros, en el historial del shell y en mensajes de error, así que se rechaza. La clave va en la variable de entorno ' + keyVariable + ', y se envía como cabecera bearer.'
        : reason === 'insecure-scheme'
          ? '--send: la URL debe ser https, salvo en loopback. Un recibo lleva tus cifras de gasto, y enviarlas en claro por una red es una fuga que no pediste.'
          : reason === 'bad-key'
            ? `--send: ${keyVariable} contiene espacios, caracteres de control o bytes no ASCII, que no pueden enviarse como token bearer. Su valor no se muestra.`
            : '--send: eso no es una URL que esta herramienta pueda interpretar.',
    sendDelivered: (where, status) => `Recibo enviado a ${where} (HTTP ${status}). No se envió nada más.`,
    sendFailed: (where, status) =>
      status === null
        ? `El recibo no llegó a ${where}. Queda escrito aquí como siempre; esta ejecución sale con 3 porque el envío falló. El error va debajo, sin las cabeceras de la petición.`
        : `${where} respondió HTTP ${status}, así que el recibo no se entregó. Queda escrito aquí como siempre; esta ejecución sale con 3 porque el envío falló. El cuerpo de la respuesta va debajo, sin las cabeceras de la petición.`,
    pricingLiveHint: (count) =>
      `${count} id(s) de modelo sin precio llevan prefijo de proveedor, como nombran los modelos OpenRouter y LiteLLM, y el catálogo incluido no los trae. Vuelve a ejecutar con --pricing-live para cobrar los slugs de OpenRouter desde su propia lista.`,
    apiEquivalent: () =>
      'Las sesiones de agentes (Claude Code, Codex, Gemini CLI) se valoran a tarifas API del catálogo. Si pagas una suscripción, pagaste el plan, no esta estimación equivalente; los datos ausentes y las tarifas propias pueden cambiar el resultado.',
    partnerUnpriced: (ids) =>
      `Modelos Claude como los nombran Amazon Bedrock o Vertex AI: ${ids}. Esas plataformas fijan sus propios precios, que este catálogo no lleva, así que las llamadas quedan sin tasar en vez de cobrarse a las tarifas de Anthropic. Para tasarlas, da a cada id su propia fila en un overlay --pricing con las tarifas de la página de la plataforma.`,
    partnerModel: (platform, model) =>
      `${platform === 'bedrock' ? 'Amazon Bedrock' : 'Vertex AI'}, ${model ?? 'un modelo que este catálogo no conoce'}`,
    prefixedKnown: (ids) =>
      `${ids}: el modelo tras la barra tiene precio aquí con su propio nombre. El prefijo no se quita por ti, porque el mismo modelo a través de un router puede facturarse distinto. Si esas llamadas fueron directas al proveedor, registra el modelo sin el prefijo.`,
    windowMatchesNothing: (from, to) =>
      `Ninguna llamada cae dentro de este periodo. Lo leído cubre ${from} → ${to}. Un periodo sin nada dentro no es una factura de $0: revisa las fechas, o quita --since/--until para facturarlo todo.`,
    windowMatchesNothingRows: (from, to, mixed) =>
      `${mixed ? 'Ninguna llamada ni ninguna fila del informe de ccusage cae' : 'Ninguna fila del informe de ccusage cae'} dentro de este periodo. Lo leído cubre ${from} → ${to}. Un periodo sin nada dentro no es una factura de $0: revisa las fechas, o quita --since/--until para facturarlo todo.`,
    written: (file) => `Escrito ${file}.`,
    rangeConflict: (flag) =>
      `--git-range fija el periodo por sí mismo, a partir de los commits, e imprime su propio extracto: no se puede combinar con ${flag}.`,
    rangeNoGit: () => 'no se pudo ejecutar git, del que --git-range lee las horas de los commits.',
    rangeNoRepository: () => 'Este directorio no está dentro de un repositorio git, así que --git-range no tiene repositorio que leer.',
    rangeBad: (range) => `git no conoce el rango "${range}". Indica uno como main..HEAD.`,
    rangeEmpty: (range) => `El rango "${range}" no contiene ningún commit, así que no tiene periodo que sumar.`,
    rangeHeading: (range) => `Registrado en las sesiones de este repositorio mientras se escribía ${range}`,
    rangeWindow: (from, to, commits) =>
      `Periodo: ${from} a ${to}, según las horas de autor y de commit de ${commits} commit(s).`,
    rangeInside: (usd, calls, sessions) =>
      `${usd} en ${calls.toLocaleString('es-ES')} llamada(s) valorada(s) de ${sessions.toLocaleString('es-ES')} sesión(es) que empezaron y terminaron dentro del periodo.`,
    rangeNothingInside: () => 'Ninguna sesión de este proyecto empezó y terminó dentro del periodo.',
    rangeStraddleHeading: (count) =>
      `${count} sesión(es) empezaron antes del periodo o siguieron después. Contadas aparte, no en la cifra de arriba:`,
    rangeStraddleRow: (session, from, to, insideUsd, insideCalls, outsideUsd, outsideCalls) =>
      `  ${session}  ${from} a ${to}: ${insideUsd} (${insideCalls} llamada(s)) dentro del periodo, ${outsideUsd} (${outsideCalls} llamada(s)) fuera.`,
    rangeNoStraddle: () => 'Ninguna sesión cruzó un extremo del periodo.',
    rangeMeaning: () =>
      'Esto es todo lo registrado en este repositorio durante ese periodo. No es el coste del cambio: incluye otro trabajo del mismo repositorio, y no incluye el trabajo del cambio hecho en otro sitio.',
    rangeLeftOut: (outsideCalls, otherProjects, otherSources, undated) =>
      `Fuera: ${outsideCalls} llamada(s) de sesiones por completo fuera del periodo, ${otherProjects} registro(s) de otros proyectos, ${otherSources} registro(s) de fuentes sin carpeta de proyecto que comparar (Codex, Gemini CLI, logs), ${undated} llamada(s) sin marca de tiempo.`,
    rangeUnpriced: (calls) =>
      `No está en la cifra: ${calls} llamada(s) a modelos que el catálogo no valora. Nombradas, nunca contadas como $0.`,
    deliveryNeedsRange: () => '--delivery pone el gasto de un rango de commits junto a lo que git muestra que llegó en él, así que necesita --git-range.',
    rangeDelivered: (commits, merges, pullRequests, days) =>
      `Llegó en el mismo rango, según git local: ${commits.toLocaleString('es-ES')} commit(s), ${merges.toLocaleString('es-ES')} de ellos commits de fusión; ${pullRequests.toLocaleString('es-ES')} pull request(s) con número en un asunto; ${days.toLocaleString('es-ES')} día(s) UTC con un commit. Una pull request fusionada con rebase no lleva número, así que esa cuenta puede quedarse corta.`,
    rangeDividedBy: (perCommit, perPullRequest, perDay) =>
      `La cifra de arriba dividida por cada cuenta: ${perCommit ?? 'sin cifra'} por commit, ${perPullRequest ?? 'sin cifra (no se nombra ninguna pull request)'} por pull request, ${perDay ?? 'sin cifra'} por día. Dos números sobre un mismo periodo, no lo que costó un commit, una pull request o un día.`,
    rangeDividedNothing: () => 'Ninguna sesión empezó y terminó dentro del periodo, así que no hay cifra que dividir por estas cuentas.',
    rangeNoProject: () =>
      'Ninguna sesión leída pertenece a la carpeta de proyecto de este repositorio. Claude Code nombra esa carpeta con la ruta absoluta del repositorio, así que lee la carpeta que la contiene (trazum bill ~/.claude/projects --git-range main..HEAD) desde la raíz del repositorio. Una sesión iniciada en un subdirectorio o en un worktree está en una carpeta de otro nombre y no se reconoce.',
  },

  fromOpenrouter: {
    noPath: () =>
      'from-openrouter necesita el informe de actividad que produjo tu propio curl: trazum from-openrouter activity.json --label facturación',
    notFound: (path) => `${path}: no encontrado`,
    summary: (rows, days, requests) =>
      `${rows} fila(s) de actividad leída(s) en ${days} día(s), que cubren ${requests} petición(es).`,
    reportedUsage: (usd, byokUsd) =>
      `OpenRouter dice que cobró $${usd.toFixed(4)}${byokUsd > 0 ? ` más $${byokUsd.toFixed(4)} facturados aguas arriba con tus propias claves` : ''}. Esa cifra es de OpenRouter, impresa junto a la de Trazum y nunca sumada a ella: dos tablas de precios en una sola cifra es como un informe se vuelve silenciosamente falso.`,
    reasoning: (tokens) =>
      `${tokens} token(s) de razonamiento están en este informe y no se añadieron a ningún registro: el esquema no dice si completion_tokens ya los incluye, y añadirlos si es así cobraría el razonamiento dos veces.`,
    unnamedModel: (count) =>
      `${count} fila(s) no nombraron modelo y no están en la salida: nada en la fila dice qué respondió.`,
    undated: (count) =>
      `${count} fila(s) traían una fecha que no es un día YYYY-MM-DD y no están en la salida.`,
    unparseable: () =>
      'Eso no es el JSON que devuelve GET /api/v1/activity. Pasa el cuerpo de la respuesta entero, no un campo suyo.',
    labelledByWorkspace: (count) => `${count} fila(s) tomaron su etiqueta del mapeo de workspaces.`,
    unruledWorkspace: (count) =>
      `${count} fila(s) traían un workspace que ninguna regla nombra. Conservan --label si lo diste y quedan sin atribuir si no.`,
    workspaceNotGrouped: () =>
      'Diste un mapeo de workspaces y ninguna fila traía id de workspace, así que el reparto que pediste no se hizo. Pide el informe con group_by=workspace.',
    rulesUnreadable: (file) =>
      `${file}: no se puede leer como mapeo de workspaces. Es un array JSON de {"workspace": "…", "label": "nombre"}.`,
    ruleBad: (file, at) =>
      `${file}: la entrada ${at} no es una regla. Cada una necesita un id en "workspace" y una "label", ambos cadenas no vacías.`,
    rulesEmpty: (file) =>
      `${file}: no hay reglas dentro. Pasaste --label-by-workspace para repartir algo, y un archivo vacío repartiría nada en silencio.`,
    written: (file) => `Escrito ${file}.`,
  },

  fromCcusage: {
    noPath: () =>
      'from-ccusage necesita el JSON que escribió ccusage: ccusage daily --json > ccusage.json, y luego trazum from-ccusage ccusage.json. No ejecuta ccusage.',
    notFound: (path) => `${path}: no encontrado`,
    unparseable: () =>
      'Eso no es un informe de los que escribe ccusage --json: no tiene filas daily, weekly, monthly, session ni projects. Pasa el archivo entero que imprimió ccusage.',
    written: (file) => `Escrito ${file}.`,
    summary: (report, rows, records) =>
      `${rows} fila(s) de ${report === 'session' ? 'sesión' : report === 'daily' ? 'día' : report === 'weekly' ? 'semana' : 'mes'} leída(s) del informe ${report} de ccusage, ${records} registro(s) escrito(s), uno por cada modelo de cada fila. Una fila es un total, no una llamada: el informe de ccusage no cuenta peticiones, así que cada registro dice requests: null.`,
    unified: (agents) =>
      `El informe es el de ccusage para todos los agentes que encontró (${agents === '' ? 'ninguno nombrado' : agents}). Sus filas se leen tal cual, y un modelo se valora por su propio nombre lo haya ejecutado el agente que sea.`,
    sectionsLeftAside: (report, others) =>
      `El archivo trae también los informes ${others} de ccusage. Solo se leyó el ${report}: son el mismo uso cortado de otra manera, y sumarlos lo contaría dos veces.`,
    sessionsAcrossDays: (count) =>
      `${count} fila(s) de sesión duraron más de un día UTC. Cada una se fecha en su última actividad, así que un día o un mes se parte en ella donde terminó; el informe diario de ccusage es el que sirve para facturar por días.`,
    unnamedModel: (count) =>
      `${count} desglose(s) por modelo no nombraron modelo y no están en la salida: nada en ellos dice qué respondió.`,
    unreadable: (count) =>
      `${count} desglose(s) por modelo traían una cuenta de tokens que no es un número entero y no están en la salida.`,
    noBreakdown: (count) =>
      `${count} fila(s) traían tokens y ningún modelBreakdowns, así que nada dice de qué modelo son. No están en la salida.`,
    undated: (count) =>
      `${count} fila(s) no traían un día, una semana, un mes ni una última actividad legibles y no están en la salida.`,
    fastUnpriced: (count, models) =>
      `${count} desglose(s) se ejecutaron en modo rápido (${models}) con un modelo para el que el catálogo no tiene tarifa rápida. Quedan fuera en vez de valorarse a la tarifa estándar, que los dejaría muy por debajo de su coste.`,
    unsplitTokens: (tokens) =>
      `${tokens} token(s) están en el totalTokens de ccusage y en ninguna de las cuatro cuentas, así que no se sabe de qué tipo son. Se cuentan aquí y no se valoran.`,
    writeTtlUnsplit: (count) =>
      `${count} registro(s) traen escrituras de caché sin cacheCreation1hTokens, así que no se sabe su vida y se supone la tarifa de 5 minutos. La factura dice cuáles.`,
    labelledByProject: (count) => `${count} fila(s) tomaron su etiqueta del mapeo de proyectos.`,
    unruledProject: (count) =>
      `${count} fila(s) nombraban un proyecto que ninguna regla nombra. Conservan --label si lo diste y quedan sin etiqueta si no; el nombre del proyecto no se escribe.`,
    projectNotGrouped: () =>
      'Diste un mapeo de proyectos y ninguna fila nombraba un proyecto, así que el reparto que pediste no se hizo. ccusage nombra proyectos en claude daily --instances y en claude session.',
    notCarried: () =>
      'El informe de ccusage no trae la inferencia solo en EE. UU. ni las búsquedas web, que las sesiones de Claude Code sí registran y Anthropic sí cobra. Valorado desde este informe, eso es un mínimo; trazum bill sobre las sesiones mismas sí lo tiene.',
    logCountsCalls: () =>
      'Todos los comandos leen el log escrito aquí como cualquier otro log de uso: sus registros se valoran como filas que suman peticiones, y se cuentan como llamadas, igual que las filas del informe de uso de Anthropic. Tampoco se rechaza sobre él --timezone, --since, --until ni --by, así que pueden mover una fila a otro día o cortarla en el borde de una ventana. trazum bill sobre el archivo de ccusage mismo las cuenta como filas y rechaza lo que movería o cortaría una.',
    comparisonHeading: () => 'La cifra de ccusage y la del catálogo, para las mismas cuentas:',
    colModel: () => 'modelo, como lo nombra ccusage',
    colCcusage: () => 'ccusage',
    colTrazum: (reviewed) => (reviewed === '' ? 'catálogo de Trazum' : `catálogo de Trazum, leído ${reviewed}`),
    colDifference: () => 'diferencia',
    noFigure: () => 'sin cifra',
    unpriced: () => 'sin precio',
    same: () => 'igual',
    ceiling: (model, ceiling, floor) =>
      `${model}: ${ceiling} es la más cara de dos tarifas. Sus filas suman peticiones y el modelo se cobra según la longitud del prompt de cada petición, que un total no da; a la tarifa barata los mismos tokens salen a ${floor}, y ccusage, que leyó cada petición, las valoró una a una.`,
    trazumUnpriced: (models) =>
      `${models}: no está en el catálogo, porque ninguna página de proveedor leída le da precio. Fuera de la factura y nombrado, nunca valorado con la cifra de ccusage.`,
    ccusageUnpriced: (models) => `${models}: ccusage dice que no tenía precio para algunas de estas filas.`,
    allAgree: (models, reviewed) =>
      `La cifra de ccusage y la del catálogo${reviewed === '' ? '' : ` (leído ${reviewed})`} coinciden en los ${models} modelo(s) del informe.`,
    othersAgree: (models) => `Los otros ${models} modelo(s) coinciden.`,
    sources: () =>
      'Las cifras de ccusage son de ccusage, de los precios que trae o descarga: primero el archivo de LiteLLM, luego su propia tabla y la de models.dev, y cualquier ajuste de tu configuración de ccusage. Las del catálogo se leen de la página de cada proveedor en la fecha indicada, y son las que imprime una factura de este archivo. Las de ccusage se ponen al lado y nunca se usan para valorar.',
    rulesUnreadable: (file) =>
      `${file}: no se puede leer como mapeo de proyectos. Es un array JSON de {"project": "<el proyecto como lo nombra ccusage>", "label": "nombre"}.`,
    ruleBad: (file, at) =>
      `${file}: la entrada ${at} no es una regla. Cada una necesita un "project" y una "label", ambos cadenas no vacías.`,
    rulesEmpty: (file) =>
      `${file}: no hay reglas dentro. Pasaste --label-by-project para repartir algo, y un archivo vacío repartiría nada en silencio.`,
  },

  fromHelicone: {
    noPath: () =>
      'from-helicone necesita un export de peticiones o un directorio: trazum from-helicone requests.json',
    notFound: (path) => `${path}: no encontrado`,
    noExports: (path) =>
      `${path}: no hay exports .json/.jsonl/.ndjson dentro. Las peticiones de Helicone salen de su endpoint POST /v1/request/query, o del botón de exportar de la tabla de peticiones.`,
    summary: (files, rows) => `${files} archivo(s), ${rows} petición(es) leída(s).`,
    unnamedModel: (count) =>
      `${count} fila(s) no nombran modelo en ninguna de las tres columnas y no están en la salida: nada en la fila dice qué respondió, así que nada puede ponerle precio.`,
    disagreements: (count) =>
      `${count} fila(s) las respondió un modelo distinto del pedido. Se pone precio al que respondió, porque una factura va de lo que se facturó; el recuento está aquí para que una sustitución sea algo que ves y no algo que encuentras dentro de un total.`,
    noTokens: (count) =>
      `${count} fila(s) traían cero tokens en ambos lados: peticiones registradas a las que nadie puede poner precio. Se cuentan aquí y merecen un vistazo a Helicone.`,
    cacheFlagged: (count) =>
      `${count} fila(s) las sirvió la caché de Helicone. Eso es una bandera en la fila y nunca un reparto de tokens, así que los veredictos de caché dicen "no se puede saber" en este registro en vez de uno inventado.`,
    noSessions: () =>
      'Sin identidad de sesión: un request id de Helicone nombra una llamada, no una conversación, así que los hallazgos de conversación (caché desperdiciada en un solo turno, presión de contexto) no se pueden responder desde este registro. Hacer pasar un id por llamada como conversación reportaría cada llamada como una conversación de una.',
    unparseable: (count) => `${count} línea(s) no se pudieron leer como JSON.`,
    written: (file) => `Escrito ${file}.`,
  },

  fromLangsmith: {
    noPath: () =>
      'from-langsmith necesita un export de runs o un directorio: trazum from-langsmith runs.json',
    notFound: (path) => `${path}: no encontrado`,
    noExports: (path) =>
      `${path}: no hay exports .json/.jsonl/.ndjson dentro. Los runs de LangSmith salen de su endpoint de listado, del list_runs() del SDK o del botón de exportar en la tabla de runs de un proyecto.`,
    summary: (files, rows) => `${files} archivo(s), ${rows} llamada(s) al modelo leídas.`,
    notModelCalls: (count) =>
      `${count} run(s) no eran llamadas al modelo y no están en la salida: cadenas, herramientas, retrievers y prompts. Una traza de LangSmith es un árbol y la cadena que envuelve una llamada repite los tokens de su hijo, así que sumar el árbol facturaría los mismos tokens una vez por nivel.`,
    unnamedModel: (count) =>
      `${count} llamada(s) no nombran modelo en sus metadatos y no están en la salida. El nombre del run es una clase cliente: «ChatAnthropic» no es un modelo que nadie pueda tarifar, así que se rechaza en lugar de adivinarlo. Pon ls_model_name o registra los invocation params.`,
    noTokens: (count) =>
      `${count} llamada(s) no traían recuento de tokens y no están en la salida: runs registrados que nadie puede tarifar. Se cuentan aquí y merecen una mirada en el tracer.`,
    reportedCost: (usd) =>
      `LangSmith tarifó estas mismas llamadas en ${usd} con su propia tabla. Esa cifra no se mezcla con nada que calcule Trazum: sumar dos tablas de precios en un total es como un informe se vuelve silenciosamente falso. Compáralas a propósito o no las compares.`,
    unparseable: (count) => `${count} línea(s) no se han podido leer como JSON.`,
    written: (file) => `Escrito ${file}.`,
  },

  fromLiteLlm: {
    noPath: () =>
      'from-litellm necesita un export de spend log o un directorio: trazum from-litellm spend.json',
    notFound: (path) => `${path}: no encontrado`,
    noExports: (path) =>
      `${path}: no hay exports .json/.jsonl/.ndjson dentro. Los spend logs de LiteLLM salen de la tabla LiteLLM_SpendLogs, o de los endpoints /spend del propio proxy.`,
    summary: (files, rows) => `${files} archivo(s), ${rows} llamada(s) registrada(s) leída(s).`,
    unnamedModel: (count) =>
      `${count} fila(s) no nombran modelo y no están en la salida. "model_group" es el nombre de una ruta del proxy y detrás pueden ir varios modelos, así que poner precio a esas llamadas por la ruta que tomaron sería atribuir una cifra a algo que no describe.`,
    noTokens: (count) =>
      `${count} fila(s) traían cero tokens en ambos lados: llamadas registradas a las que nadie puede poner precio. Se cuentan aquí y merecen un vistazo al proxy.`,
    cacheFlagged: (count) =>
      `${count} fila(s) están marcadas como acierto de caché. LiteLLM lo registra como una bandera y nunca como un reparto de tokens, así que los veredictos de caché dicen "no se puede saber" en este registro en vez de uno inventado.`,
    reportedSpend: (usd) =>
      `LiteLLM puso precio a estas mismas llamadas en ${usd} con su propia tabla. Esa cifra no se funde con nada que calcule Trazum: sumar dos tablas de precios en un total es como un informe se vuelve callado y equivocado. Compáralas a propósito o no las compares.`,
    unparseable: (count) => `${count} línea(s) no se pudieron leer como JSON.`,
    written: (file) => `Escrito ${file}.`,
  },

  fromClaudeCode: {
    noPath: () => 'from-claude-code necesita un archivo o directorio de transcripts: trazum from-claude-code ~/.claude/projects',
    notFound: (path) => `${path}: no existe`,
    noTranscripts: (path) => `${path}: no hay transcripts .jsonl debajo. Claude Code los escribe por sesión en ~/.claude/projects/<proyecto>/.`,
    summary: (files, records) => `${files} transcript(s), ${records} llamada(s) tasadas.`,
    collapsed: (lines) => `${lines} línea(s) extra de llamadas ya contadas colapsadas: una llamada a la API se escribe como una línea por bloque de contenido, y contar cada línea sobrefacturaría.`,
    streamed: (count) => `${count} llamada(s) se escribieron aún en streaming; quedaron los recuentos de la línea final.`,
    disagreements: (count) => `${count} llamada(s) tenían líneas en desacuerdo más allá del crecimiento del streaming: un recuento encogió, u otro campo cambió. Se quedó la última línea, pero es un hallazgo: merece un vistazo al transcript.`,
    noRequestId: (count) => `${count} llamada(s) sin id de petición ni id de mensaje, así que nada pudo colapsarse contra ellas; cada una se tasa tal como quedó registrada.`,
    synthetic: (count) => `${count} turno(s) que Claude Code escribió por su cuenta (modelo «<synthetic>») quedan fuera de la salida: ningún proveedor los facturó, así que no son llamadas.`,
    labelled: () => 'Etiquetado por carpeta de proyecto. Usa --no-label-from-project para dejarlo sin etiqueta, o --label <nombre> para poner una.',
    skipped: (other, unparseable, withoutUsage) => `Omitidas: ${other} línea(s) no-assistant (el resto del negocio del transcript), ${unparseable} imparseables, ${withoutUsage} línea(s) assistant sin usage.`,
    written: (file) => `Escrito ${file}.`,
    stateNeedsFile: () =>
      '--state lee un transcript, no una carpeta: el estado ata un desplazamiento del transcript a una longitud del fichero de salida, y varios transcripts escribiendo en una sola salida no tienen una longitud así. Apúntalo al fichero .jsonl.',
    stateNeedsOut: () => '--state necesita --out: sin fichero de salida no hay nada contra lo que reanudar.',
    cwdRulesUnreadable: (file) => `${file}: --label-by-cwd espera un JSON con una lista, del estilo [{"prefix": "/trabajo/api", "label": "api"}].`,
    cwdRuleBad: (file, at) => `${file}: la entrada ${at} necesita "prefix" y "label", ambos cadenas y no vacíos. Aquí no se adivina nada a partir de una ruta, así que una entrada que no es una regla se rechaza en vez de saltarse.`,
    cwdRulesEmpty: (file) => `${file}: no tiene reglas, así que cada línea acabaría en --label o sin etiqueta. Escribe una regla o quita la opción.`,
    labelledByCwd: (rules) => `Etiquetado por directorio de trabajo, ${rules} regla(s). El directorio decide cuál de tus etiquetas se aplica y nunca llega a la salida.`,
    resumed: (skipped, offset) =>
      skipped === 0
        ? `Transcript leído entero; punto de reanudación anotado en el byte ${offset}.`
        : `Reanudado en el byte ${skipped}, así que ${skipped} byte(s) no se releyeron. Siguiente punto de reanudación: byte ${offset}.`,
  },

  position: {
    heading: (month) => `Dónde está ${month}, medido`,
    scopeMonth: () => 'el mes',
    scopeDay: () => 'hoy',
    scopeLabel: (label) => `«${label}»`,
    within: (scope, measured, limit, remaining, days, elapsed) =>
      `${scope}: ${measured} de ${limit} medidos, quedan ${remaining} (${days} de ${elapsed} días transcurridos con medición)`,
    over: (scope, measured, limit, overBy) =>
      `${scope}: superado, ${measured} medidos contra ${limit}, ${overBy} por encima del techo`,
    cannotTell: (scope) => `${scope}: no se puede saber, nada medido en esta ventana`,
    distance: (days, rate, overDays) =>
      `a ${rate}/día sobre ${overDays} días medidos, el techo queda a ${days} días, división sobre el pasado, no un pronóstico`,
    unmeasuredHeading: () => 'Configurado y no medible desde este log',
    unmeasured: (scope, why) => `${scope}: ${why}`,
    why: (reason) =>
      reason === 'no-clock'
        ? 'ningún registro lleva marca de tiempo, así que no se puede medir ninguna ventana'
        : reason === 'no-labels'
          ? 'ningún registro lleva etiqueta, así que el gasto por etiqueta es incognoscible aquí'
          : reason === 'nothing-recorded'
            ? 'el log está vacío: no se registró nada'
            : 'el log registra etiquetas y no ha visto esta en todo el mes: quizá renombrada, quizá parada, y ninguna de las dos es «dentro del presupuesto»',
    cannotSayHeading: () => 'Lo que deliberadamente no responde',
    cannotSay: (code) => {
      switch (code) {
        case 'session-limit-at-the-doors':
          return 'limits.sessionUsd se juzga llamada a llamada en las puertas. Una sesión no es un ámbito de calendario, y una «posición de sesión para el mes» sería una media disfrazada de límite.';
        case 'no-ceiling-configured':
          return 'No hay presupuesto mensual ni límites configurados, así que no existe techo contra el que declarar una posición. Los techos viven en spend.monthlyUsd y en el bloque limits.';
        default:
          return code;
      }
    },
    unpriced: (count) =>
      `${count} registro(s) nombran un modelo que el catálogo no puede tasar. No aportan nada a ninguna cifra de arriba: dinero que nadie ve, dicho aquí en vez de escondido.`,
    source: () =>
      'Medido solo desde este log, registro a registro. La posición mensual facturada por el proveedor que guarda el almacén es otra medición (la imprime «trazum store») y las dos nunca se funden en una cifra.',
    noLog: () => 'position necesita un log de uso: trazum position uso.jsonl',
  },
  weekly: {
    heading: (firstDay, lastDay) => `Trazum, la semana del ${firstDay} al ${lastDay}`,
    billHeading: () => 'La factura',
    billTotal: (usd, calls) => `**${usd}** en ${calls} ${calls === '1' ? 'llamada' : 'llamadas'}, ${calls === '1' ? 'medida' : 'medidas'} de los logs y ${calls === '1' ? 'cobrada' : 'cobradas'} con las tarifas del propio catálogo.`,
    noCalls: (firstDay, lastDay) =>
      `Ninguna llamada de los logs cae entre el ${firstDay} y el ${lastDay}, así que no hay factura que declarar. Eso no es una factura de cero: o no se ejecutó nada, o lo que se ejecutó no quedó en un log de los entregados.`,
    colModel: () => 'Modelo',
    colCalls: () => 'Llamadas',
    colUsd: () => 'USD',
    moreModels: (count) => `${count} modelos más, más pequeños que estos.`,
    unpriced: (models, calls) =>
      `Llamadas con modelos que el catálogo no sabe cobrar: ${calls} (${models}). No están en la factura de arriba, que por tanto es un mínimo.`,
    undated: (count) =>
      `Llamadas sin marca de tiempo: ${count}. No se pueden situar en ninguna semana y quedan fuera, no adivinadas dentro de esta.`,
    movedHeading: (firstDay, lastDay) => `Frente a la semana anterior (${firstDay} a ${lastDay})`,
    noWeekBefore: () =>
      'Ninguna llamada de los logs cae en la semana anterior, así que no hay con qué comparar. No se imprime un porcentaje de nada.',
    ccusageRows: () =>
      'weekly factura los siete días anteriores a --until y cuenta llamadas, y una fila de un informe de ccusage es el total de un día, una semana, un mes o una sesión enteros, no una llamada: la semana cortaría filas por sus bordes y las contaría como llamadas. Así que weekly no lee un informe de ccusage. trazum bill sobre el archivo lo factura.',
    moved: (delta, pct, now, before, calls) =>
      `La factura se movió ${delta}${pct === null ? '' : ` (${pct})`} frente a la anterior: ${now} ahora, ${before} entonces en ${calls} ${calls === '1' ? 'llamada' : 'llamadas'}. Las dos son medidas.`,
    unchanged: (now, before) => `La semana costó lo mismo que la anterior: ${now} ahora, ${before} entonces. Las dos son medidas.`,
    moversHeading: () => 'Lo que más se movió, por modelo:',
    mover: (model, before, now, delta) => `${model}: ${before} entonces, ${now} ahora (${delta})`,
    changesHeading: () => 'Tres cambios para hacer primero',
    noChanges: () =>
      'Nada de las llamadas de esta semana da un cambio que proponer: ningún modelo más barato que encaje, ninguna llamada que pueda ir por lotes, ninguna pérdida de caché confirmada ni reintento por truncado.',
    projected: (usd) => `${usd} de ahorro proyectado sobre las llamadas de esta semana. Proyectado, no medido: aún no ha ocurrido.`,
    stake: (usd) => `${usd} ya gastados en este problema esta semana. Medido, no proyectado.`,
    measuredBefore: (usd, calls) => `Medido antes del cambio: esta carga de trabajo en este modelo costó ${usd} en ${calls} ${calls === '1' ? 'llamada' : 'llamadas'} esta semana.`,
    moreChanges: (count) => `${count} cambios más están en el plan y son más pequeños que estos.`,
    verifyHow: () =>
      'Cómo se comprobará cada uno: `trazum plan <log> --out plan.json` antes de cambiar nada, y después `trazum verify plan.json --against <el log más nuevo>`. Dice por cada acción si el cambio llegó, no llegó o no se puede saber, y qué hizo la factura. Hasta entonces un ahorro proyectado es una proyección.',
    footer: () =>
      'Escrito por `trazum weekly` a partir de logs de la máquina que lo ejecutó. No se envió nada a ningún sitio para producirlo y no se llamó a ningún modelo.',
    strayFigures: (figures) =>
      `No se escribió el resumen: contiene ${figures}, que no está en la factura de ninguna de las dos semanas. Una cifra que nadie encuentra en la factura no se imprime.`,
    wrote: (path) => `Resumen semanal escrito en ${path}.`,
    notifyUnavailable: (command) => `--notify pidió una notificación de escritorio y esta máquina no tiene ${command}, así que no se envió ninguna. El resumen se escribió igualmente.`,
    notifyFailed: (command, why) => `--notify: ${command} la rechazó (${why}), así que no se mostró ninguna notificación. El resumen se escribió igualmente.`,
    headline: (usd, calls, delta, pct) =>
      `Trazum, esta semana: ${usd} en ${calls} ${calls === '1' ? 'llamada' : 'llamadas'}${delta === null ? '' : `, ${delta}${pct === null ? '' : ` (${pct})`} frente a la semana anterior`}.`,
  },
  proactive: {
    heading: () => 'Trazum, hablando primero',
    item: { statusline: 'línea de estado', watch: 'watch', mcp: 'servidor MCP' },
    verdict: { on: 'activo', off: 'apagado', 'not-ready': 'no está listo', 'not-available': 'no disponible', 'could-not-tell': 'no se sabe' },
    reason: {
      'statusline.on': (p) => `La línea de estado y su hook Stop están en ${p.file}.`,
      'statusline.off': (p) => `No está en ${p.file}. Activarlo añade una línea de estado y un hook Stop que la refresca tras cada turno.`,
      'statusline.partial': (p) =>
        `${p.file} tiene una parte: falta ${p.missing === 'hook' ? 'el hook Stop' : 'la línea de estado'}. Activarlo añade esa parte.`,
      'statusline.stale': (p) => `Las entradas de ${p.file} apuntan a un script o a una CLI que ya no está. Activarlo las repara.`,
      'statusline.windows': () => 'La línea de estado es un script de bash, y todavía no existe una versión para Windows.',
      'statusline.noClaude': (p) => `${p.dir} no existe: Claude Code no se ha ejecutado en esta máquina, así que no hay un archivo de ajustes al que añadir.`,
      'statusline.foreign': (p) =>
        `${p.file} ya tiene una línea de estado (${p.command}). Se deja como está. Para cambiarla a mano, sigue plugin/README.md.`,
      'watch.on': (p) => `Programado en tu crontab para ${p.project} (${p.schedule}), leyendo allí el almacén y el presupuesto.`,
      'watch.off': (p) => `No está programado para ${p.project}. Activarlo añade una línea al crontab que ejecuta "trazum watch --once" allí cada hora.`,
      'watch.stale': (p) => `La línea del crontab para ${p.project} apunta a una CLI que ya no está. Activarlo la repara.`,
      'watch.windows': () => 'Aquí programar es cron, y Windows no lo tiene. docs/running.md trae la línea del Programador de tareas para ejecutar a mano.',
      'watch.noCrontab': () => 'No hay programa crontab en esta máquina, así que aquí no se puede programar nada.',
      'watch.crontabError': (p) => `"crontab -l" falló: ${p.why}`,
      'watch.configError': (p) => `No se pudo leer trazum.config.json: ${p.why}`,
      'watch.noStore': () => 'El almacén está vacío. Llénalo antes con "trazum connect <proveedor> --store".',
      'watch.noBudget': (p) =>
        `Un presupuesto es una decisión, así que no se escribe ninguno por ti.${p.measured === '' ? '' : ` El almacén tiene ${p.measured} medidos.`} Pon spend.maxUsd, spend.maxDayUsd o spend.maxCacheLossUsd en trazum.config.json con un límite que elijas.`,
      'watch.noStoreNoBudget': () =>
        'Necesita un almacén con algo dentro ("trazum connect <proveedor> --store") y un límite que elijas (spend.maxUsd, spend.maxDayUsd o spend.maxCacheLossUsd en trazum.config.json).',
      'watch.scheduledNotReady': (p) =>
        `Programado para ${p.project}, pero cada ejecución se negará hasta que el almacén tenga algo y trazum.config.json tenga un límite de gasto. Todavía no vigila.`,
      'watch.otherProjects': (p) => `Quedan ${p.count} línea(s) gestionadas del crontab para otros proyectos. Ejecuta esto en cada uno para quitarlas.`,
      'mcp.on': (p) => `El servidor trazum está en ${p.files}.`,
      'mcp.off': (p) => `Activarlo añade el servidor trazum a ${p.files}.`,
      'mcp.noClient': (p) => `No hay .mcp.json ni carpeta .cursor en ${p.dir}, así que no hay configuración de cliente a la que añadir.`,
      'mcp.noClientClaude': (p) =>
        `No hay .mcp.json en ${p.dir}. Claude Code recibe el servidor por su plugin; ejecuta tú estos comandos: claude plugin marketplace add TrazumAPP/Trazum, y luego claude plugin install trazum@trazum.`,
      'mcp.other': (p) => `${p.file} ya tiene una entrada trazum distinta de la que esto escribe. Se deja como está.`,
      'mcp.changed': (p) => `${p.file} tiene una entrada trazum que añadió este comando y alguien ha cambiado después. Se deja como está.`,
      'mcp.notAdded': (p) => `${p.file} ya tiene exactamente esta entrada, puesta a mano. Se queda al apagar esto.`,
      'cli.unstable': (p) =>
        `La CLI en ${p.path} no estará mañana: una ejecución puntual de npx, o el archivo ya no existe. Instálala donde se quede (npm install -g @trazum/cli) y vuelve a ejecutar esto.`,
      'cli.unsafe': (p) => `La ruta ${p.path} tiene una comilla, un signo de porcentaje o un salto de línea, y no se puede escribir con seguridad en una línea de shell ni en un crontab.`,
      'cli.notExecutable': (p) =>
        `La CLI en ${p.path} no es ejecutable, y el hook Stop la arranca por su ruta: la línea de estado nunca tendría una cifra. Hazla ejecutable (chmod +x) o instala la CLI (npm install -g @trazum/cli), y vuelve a ejecutar esto.`,
      'file.unparseable': (p) => `${p.file} no se pudo leer como JSON (${p.why}). Se deja como está.`,
      'file.symlink': (p) => `${p.file} es un enlace simbólico. Se deja como está: edita a mano el archivo al que apunta.`,
      'file.shape': (p) => `${p.file} tiene un ${p.key} que no es del tipo esperado. Se deja como está.`,
      'file.notExact': (p) =>
        `${p.file} es JSON, pero volver a escribirlo cambiaría un valor, una clave o un escape (una clave duplicada, por ejemplo). Se deja como está, para que nada más cambie.`,
      'file.reformat': (p) => `${p.file} dispone algunas líneas de otro modo que lo que esto escribe (arrays en línea, por ejemplo). Su espaciado y sus saltos de línea se normalizan al escribirlo; todas las claves y valores se conservan.`,
      'file.unreadable': (p) => `No se pudo leer ${p.file}: ${p.why}.`,
      'file.outside': (p) => `${p.file} resuelve fuera del directorio al que pertenece. Se deja como está.`,
      'write.not-allowed': (p) => `Se rechazó escribir ${p.file}: no es uno de los archivos que este comando puede tocar (${p.allowed}).`,
      'write.symlink': (p) => `Se rechazó escribir ${p.file}: es un enlace simbólico.`,
      'write.outside': (p) => `Se rechazó escribir ${p.file}: resuelve fuera del directorio al que pertenece.`,
      'write.changed': (p) => `${p.file} cambió mientras esto se ejecutaba. No se escribió nada en él. Vuelve a ejecutarlo.`,
      'write.unreadable': (p) => `No se pudo volver a leer ${p.file} justo antes de escribir, así que no se escribió nada en él. Vuelve a ejecutarlo.`,
      'write.partial': (p) =>
        `Una escritura falló a medias, y lo que ya se había escrito no se pudo devolver a como estaba: ${p.files}. Nada los registra como escritos por este comando, así que revísalos a mano.`,
      'write.failed': (p) => `No se pudo escribir: ${p.why}.`,
      'statusline.scriptChanged': (p) =>
        `El archivo en ${p.script} no es el script que escribió este comando: se cambió, o es de otra persona. Se deja como está y no se escribe nada encima. Apártalo y vuelve a ejecutar esto para instalar la línea de estado.`,
    },
    unknownAction: (given) => `Acción desconocida "${given}". Usa: trazum proactive [status|on|off].`,
    unknownItem: (given, allowed) => `Elemento desconocido "${given}" en --only. Los elementos son: ${allowed}.`,
    wouldTurnOn: (item) => `${item}: escribiría`,
    wouldTurnOff: (item) => `${item}: quitaría`,
    nothingToChange: (item) => `${item}: nada que cambiar.`,
    dryRunAsked: () => 'Simulacro: no se escribió nada.',
    dryRunNoTerminal: () =>
      'Esto no es una terminal y no se pasó --yes, así que es un simulacro: no se escribió nada. Ejecútalo en una terminal para que te pregunte por cada elemento, o pasa --yes para decir que sí a todos.',
    askOn: (item, files) => `¿Escribir ${item} (${files})? [s/N] `,
    askOff: (item, files) => `¿Quitar ${item} (${files})? [s/N] `,
    didTurnOn: (item) => `${item}: escrito`,
    didTurnOff: (item) => `${item}: quitado`,
    declined: (item) => `${item}: no se escribió, dijiste que no.`,
    failed: (item, reason) => `${item}: no se escribió. ${reason}`,
    backupNote: (suffix) =>
      `La primera vez que cambia un archivo tuyo, se guarda una copia al lado como <nombre>${suffix}. Nunca se reemplaza.`,
    crontab: () => 'tu crontab',
  },

  sessionGuard: {
    unknownAction: (given) => `Acción desconocida "${given}". Usa: trazum session-guard [status|install|uninstall].`,
    refusedMissing: (flags) =>
      `Falta: ${flags}. No hay valor por defecto para los dos umbrales en dólares ni para lo que se hace cuando no se puede saber el coste: cada uno es decisión tuya, y una guarda que eligiera uno lo habría decidido por ti. Ejemplo: trazum session-guard install --warn 5 --stop 15 --on-cannot-tell fail-open`,
    refusedAmount: (flag, given) => `${flag} necesita un importe en dólares mayor que cero, y "${given}" no lo es.`,
    refusedPolicy: (given, allowed) => `--on-cannot-tell es "${given}". Tiene que ser uno de: ${allowed}. fail-open deja seguir el trabajo cuando no se puede saber el coste, y fail-closed lo detiene.`,
    refusedWarnNotBelowStop: () => '--warn tiene que ser menor que --stop, o el aviso nunca se vería antes de la parada.',
    refusedFlag: (flag) =>
      `${flag} no se acepta aquí. La guarda pone precio a la sesión con el catálogo incluido en esta versión y solo lee archivos que ya están en esta máquina.`,
    warn: (usd, warnUsd, stopUsd, atLeast) =>
      `Trazum: esta sesión ha llegado a ${atLeast ? 'al menos ' : ''}${usd} de coste equivalente en API. Tu cifra de aviso es ${warnUsd} y se detiene en ${stopUsd}. Equivalente en API es lo que costaría este uso a los precios de lista de la API del proveedor, no lo que te cobraron.${atLeast ? ' Algunas llamadas son de un modelo para el que Trazum no tiene precio, así que la cifra real es mayor.' : ''} Esto se dice una vez por sesión.`,
    block: (usd, stopUsd, atLeast) =>
      `Trazum: detenida. Esta sesión ha llegado a ${atLeast ? 'al menos ' : ''}${usd} de coste equivalente en API, igual o por encima de tu cifra de parada de ${stopUsd}. Equivalente en API es lo que costaría este uso a los precios de lista de la API del proveedor, no lo que te cobraron. Para seguir, sube la cifra: trazum session-guard install --warn <usd> --stop <usd> --on-cannot-tell <fail-open|fail-closed>.`,
    cannotTellOpen: (why) =>
      `Trazum no pudo saber cuánto cuesta esta sesión: ${why}. Tu política es fail-open, así que el trabajo sigue y esta guarda no detiene nada. No contó el coste como cero. Esto se dice una vez por sesión.`,
    cannotTellClosed: (why) =>
      `Trazum: detenida, porque no pudo saber cuánto cuesta esta sesión: ${why}. Tu política es fail-closed. No contó el coste como cero. Para seguir, arregla la causa o cambia la política con trazum session-guard install.`,
    cause: {
      'no-transcript': () => 'Claude Code no dio ninguna transcripción que leer',
      unreadable: () => 'no se pudo leer la transcripción',
      unparseable: () => 'la transcripción tiene líneas y ninguna se pudo leer como uso',
      skipped: () => 'una parte de la transcripción no se pudo leer como registro de uso',
    },
    unpriced: (models) => `el catálogo no tiene precio para ${models}`,
    settingsShape: (file, key) => `${file} tiene un "${key}" que no tiene la forma que lee Claude Code, así que se deja como está.`,
    wouldInstall: () => 'guarda de sesión: escribiría',
    wouldUninstall: () => 'guarda de sesión: quitaría',
    askInstall: (file) => `¿Escribir el hook de la guarda de sesión (${file})? [s/N] `,
    askUninstall: (file) => `¿Quitar el hook de la guarda de sesión (${file})? [s/N] `,
    didInstall: (file) => `guarda de sesión: escrito en ${file}`,
    didUninstall: (file) => `guarda de sesión: quitado de ${file}`,
    declined: () => 'guarda de sesión: no se escribió, dijiste que no.',
    nothingToUninstall: () => 'guarda de sesión: nada que quitar.',
    alreadyInstalled: (file) => `guarda de sesión: ya está como pediste en ${file}, nada que cambiar.`,
    dryRun: () => 'Simulacro: no se escribió nada.',
    dryRunNoTerminal: () =>
      'Esto no es una terminal y no se pasó --yes, así que es un simulacro: no se escribió nada. Ejecútalo en una terminal para que te pregunte, o pasa --yes.',
    failed: (reason) => `guarda de sesión: no se escribió. ${reason}`,
    statusOn: (file, warnUsd, stopUsd, policy) =>
      `activa en ${file}: avisa en ${warnUsd}, detiene en ${stopUsd} de coste equivalente en API, y cuando no se puede saber el coste es ${policy}.`,
    statusOff: (file) => `desactivada: no hay hook de la guarda de sesión en ${file}.`,
    statusPartial: (file) => `activa a medias: ${file} tiene el hook en uno de los dos eventos y no en el otro. Ejecuta install otra vez para completarla.`,
    apiEquivalent: () => 'Toda cifra es coste equivalente en API: el uso a los precios de lista de la API del proveedor, no lo que te cobraron.',
    windows: () => 'El hook de la guarda de sesión se escribe como comando de shell y no está disponible en Windows.',
    noClaude: (dir) => `${dir} no existe, así que Claude Code no parece instalado para este usuario. No se escribió nada.`,
  },

  waste: {
    refusedFlag: (flag) =>
      `${flag} no se acepta aquí. waste valora al catálogo incluido en esta versión y lee solo ficheros que ya están en esta máquina.`,
    noPath: () => 'Indica la transcripción de la sesión que leer. Ejemplo: trazum waste <sesion>.jsonl',
    notFound: (path) => `${path} no es un fichero.`,
    unreadable: (path) => `No se pudo leer ${path}, o una transcripción de sus subagentes.`,
    minReadsBad: (given) => `--min-reads necesita un número entero de 2 o más, y "${given}" no lo es: un fichero leído una vez no se ha leído otra vez.`,
    cannotTell: () =>
      'No se puede saber: la transcripción no se pudo emparejar línea a línea con su uso, y emparejar una llamada a herramienta con el prompt equivocado valoraría lo que no es. No se calculó nada. Ejecuta trazum from-claude-code sobre ella para ver cómo se lee.',
    heading: (calls, threads) => `Desperdicio en esta sesión: ${plural(calls, 'llamada')} en ${plural(threads, 'hilo')}`,
    apiEquivalent: (reviewed) =>
      `Toda cifra es coste equivalente en API al catálogo incluido, revisado por última vez el ${reviewed}: no lo que te cobraron. Un ahorro es una cota inferior calculada con los recuentos de esta sesión.`,
    unpriced: (models) => `El catálogo no tiene precio para ${models}: esas llamadas quedan fuera de toda cifra, así que cada una es un mínimo.`,
    readsHeading: () => 'El mismo fichero leído otra vez',
    readsNone: (minReads) => `Ningún fichero se leyó ${minReads} o más veces sin que nada lo cambiara entre medias.`,
    readLine: (reads, repeats, measured, tokens, usd) =>
      `leído ${reads} veces, ${plural(repeats, 'repetición', 'repeticiones')} del mismo tramo sin edición entre medias. ${
        usd === null
          ? 'Sin valorar: las llamadas que lo repitieron hicieron también otras llamadas a herramientas, así que el crecimiento no se puede repartir.'
          : `${measured} medidas, ${tokens.toLocaleString('es-ES')} tokens añadidos al contexto y arrastrados en cada llamada posterior: ${usd}.`
      }`,
    readsOmitted: (count) => `${plural(count, 'fichero más', 'ficheros más')} leído${count === 1 ? '' : 's'} otra vez y sin listar (por debajo de --min-reads, o pasadas las 20 listadas).`,
    readsTotal: (usd, measured, repeats) =>
      `En conjunto: ${usd} por las ${measured} de ${repeats} repeticiones que se pudieron medir.`,
    readsUnmeasured: (repeats) => `${plural(repeats, 'repetición', 'repeticiones')} encontradas y ninguna se pudo valorar con los recuentos.`,
    mcpHeading: () => 'Servidores MCP cargados y nunca llamados',
    mcpNoList: () =>
      'No se puede saber qué servidores estaban cargados: esta transcripción no registra una lista. Nómbralos con --mcp-servers <a,b> y dirá cuáles no se llamaron nunca.',
    mcpAllCalled: (loaded) => `${plural(loaded, 'servidor', 'servidores')} cargado${loaded === 1 ? '' : 's'}, y todos se llamaron al menos una vez.`,
    mcpSummary: (loaded, called, source) =>
      `${plural(loaded, 'servidor', 'servidores')} cargado${loaded === 1 ? '' : 's'}${source === 'flag' ? ' (como los nombraste)' : ''}, ${called} llamado${called === 1 ? '' : 's'}.`,
    mcpUnused: (server, tools) => `${server}: nunca llamado${tools === null ? '' : `, ${plural(tools, 'herramienta')} cargada${tools === 1 ? '' : 's'}`}`,
    mcpNotPriced: () =>
      'Sin valorar: lo que cuestan las definiciones de herramientas de un servidor no está en la transcripción, y donde las herramientas se difieren sus definiciones no se envían hasta que se piden. Una cifra aquí sería inventada.',
    claudeHeading: () => 'Un CLAUDE.md que se paga en cada turno',
    claudeNone: (path) =>
      path === ''
        ? 'No hay CLAUDE.md que medir: la transcripción no nombra ningún directorio. Pasa --claude-md <fichero>.'
        : `No hay CLAUDE.md en ${path}. Pasa --claude-md <fichero> para medir otro.`,
    claudeLine: (bytes, tokens, calls, usd, low, high, bandPct) =>
      `${plural(bytes, 'byte')}, unos ${tokens.toLocaleString('es-ES')} tokens, en ${plural(calls, 'llamada')} del hilo principal: ${usd} (${low} a ${high}). Estimado: la transcripción no registra su tamaño, así que los tokens son los bytes entre el divisor del estimador, dentro de su banda publicada de ${bandPct}%. Solo se leyó el tamaño del fichero.`,
    nothingChanged: () => 'No se cambió nada. Este comando recomienda y no edita ningún fichero.',
  },

  pulse: {
    heading: () => '¿Corrieron las cosas que tienen que correr?',
    kind: (kind) => {
      switch (kind) {
        case 'watch-cycle':
          return 'último ciclo de watch';
        case 'store-pull':
          return 'última descarga al almacén';
        case 'store-coverage':
          return 'las mediciones llegan hasta';
        default:
          return kind;
      }
    },
    neverRun: (name) =>
      `${name}: nunca aquí. No va tarde: no hay cadencia contra la que ir tarde.`,
    age: (name, when, hours) => `${name}: ${when}Z, hace ${plural(hours, 'hora')}`,
    noThreshold: () =>
      'No se juzgó nada. Pasa --max-stale-hours <n> para que algo que dejó de correr sea un código de salida en rojo; cuánto es demasiado es una política, y esta herramienta no escribe la tuya.',
    within: (hours) => `Todo lo que corre aquí corrió dentro de ${plural(hours, 'hora')}.`,
    stale: (hours) =>
      `Algo que corre aquí lleva más de ${plural(hours, 'hora')} sin correr. El silencio de un trabajo programado y el de un trabajo sin nada que decir son iguales; esto dice cuál es.`,
    notAService: () =>
      'Este comando no ejecuta nada y no aloja nada. Algo tiene que darse cuenta, y ese algo es tu CI: un paso que ejecute esto con el horario que ya tienes convierte un cron muerto en una build roja, sin que Trazum guarde las métricas de nadie. Hasta dónde llegan las mediciones se informa y nunca se juzga: eso es un proveedor informando a su ritmo, no un trabajo que falló.',
  },

  html: {
    caveatsHeading: () => 'Lo que este informe no puede decir',
    noClock: () => 'Ningún registro traía marca de tiempo, así que días, ritmos y deriva no están en este informe: un total sigue siendo un total.',
    noSessions: () => 'Ningún registro traía sesión, así que el crecimiento de conversación y los costes por conversación no están en este informe.',
    byLabelHeading: () => 'Por carga de trabajo',
    byModelHeading: () => 'Por modelo',
    byMonthHeading: () => 'Por mes',
    findingsHeading: () => 'Qué movería esta factura',
    colLabel: () => 'carga',
    colModel: () => 'modelo',
    colContributor: () => 'contribuyente',
    colSpanDays: () => 'días',
    colCalls: () => 'llamadas',
    colInput: () => 'entrada',
    colCacheRead: () => 'lecturas de caché',
    colCacheWrite: () => 'escrituras de caché',
    colOutput: () => 'salida',
    sharesLine: (input, cacheRead, cacheWrite, output) =>
      `A dónde va el dinero: ${input} entrada normal, ${cacheRead} lecturas de caché, ${cacheWrite} escrituras de caché, ${output} salida.`,
    footer: () =>
      'Generado por trazum a partir de un log de uso, sin conexión. Cada cifra deriva de ese log y de la tabla de precios que la ejecución nombró; nada de esto se envió a ninguna parte para calcularse.',
    written: (path) => `Informe HTML escrito en ${path}.`,
  },

  pdf: {
    page: (current, total) => `página ${current} de ${total}`,
    written: (path) => `Informe PDF escrito en ${path}.`,
  },

  schema: {
    noTarget: (known) =>
      `Nombra un contrato para imprimir su JSON Schema. Conocidos: ${known}. El esquema valida con cualquier validador draft 2020-12, sin Trazum.`,
    unknown: (name, known) => `"${name}" no es un contrato. Conocidos: ${known}.`,
  },

  bench: {
    heading: () => 'Esta máquina, medida',
    machine: (node, platform, cpuCount, cpuModel) =>
      `node ${node} en ${platform}, ${plural(cpuCount, 'CPU')}${cpuModel === null ? '' : ` (${cpuModel})`}`,
    colWorkload: () => 'carga',
    colWall: () => 'ms de pared',
    colRatio: () => 'ratio',
    colPeakRss: () => 'RSS pico',
    note: () =>
      'Una pasada cada una, esta máquina, hoy. El reloj de pared es para una persona leyendo dos tablas lado a lado; el ratio (carga entre un bucle de calibración en el mismo proceso) es el número que un gate puede sostener, porque la máquina se cancela en él. Graba uno con --record y sujeta una build con --against y un --max-ratio declarado.',
    unknownWorkload: (id, known) => `Carga desconocida "${id}". Conocidas: ${known}.`,
    recorded: (path) => `Baseline escrito en ${path}. Commitéalo; --against lo lee.`,
    needsMaxRatio: () =>
      '--against necesita --max-ratio <n>. Cuánta regresión es demasiada es una política, y esta herramienta no escribe la tuya.',
    maxRatioNeedsAgainst: () => '--max-ratio juzga contra un baseline; pasa también --against <fichero>.',
    badMaxRatio: (raw) =>
      `--max-ratio debe ser un número finito de al menos 1 (recibido: ${raw}). Multiplica el ratio grabado; por debajo de 1 exigiría que el código se hubiera vuelto más rápido.`,
    recordAndAgainst: () =>
      '--record y --against juntos evaluarían una pasada contra el baseline que ella misma escribe. Graba, commitea, y luego evalúa.',
    unreadableBaseline: (path) => `No se pudo leer un baseline de ${path}. Vuelve a grabarlo con --record.`,
    badBaseline: (path, version) =>
      `${path} no es un baseline que esta versión conozca (schemaVersion: ${version}). Vuelve a grabarlo con --record antes que dejar que un número mal leído bloquee la build.`,
    notInBaseline: (id, path) =>
      `${path} no graba ratio para "${id}", y aprobar en silencio una carga sin grabar se leería como cobertura. Vuelve a grabar con --record.`,
    gateOver: (id, ratio, allowed) =>
      `✗ ${id}: el ratio ${ratio} supera el permitido ${allowed} (baseline × --max-ratio).`,
    gateWithin: (factor) => `Cada carga medida está dentro de ${factor}× su ratio grabado.`,
  },

  where: {
    hostHeading: () => 'Ejecutándose dentro de',
    billingUnknown: (host) =>
      `${host} solo identifica el entorno de ejecución. La forma de pago es desconocida; los precios por token no demuestran ahorro en factura.`,
    noTarget: () => 'Pasa un fichero fuente para ver a qué proveedor van sus prompts.',
    sourceHeading: (path) => `Los prompts de ${path} van a`,
    conflict: () => 'No se puede saber: el fichero nombra más de un proveedor.',
    conflictFallback: () =>
      'No se ha asumido nada. Define "usage.model" en trazum.config.json, o pasa --model.',
    nothingFound: () => 'Nada en este fichero dice a qué proveedor llama.',
    providerOnly: () => ' (solo el proveedor: nada nombra un modelo)',
    evidenceLine: (line, kind, detail) => `línea ${line}  ${kind}: ${detail}`,
    pricedAs: () => 'Se cobra como',
    fromConfig: () => '(de trazum.config.json)',
    fromDetection: () => '(leído del código)',
    fromProviderDefault: (provider) =>
      `(${provider} se ha leído del código; nada nombra un modelo, así que este es el suyo)`,
    fromDefault: () => '(el valor por defecto: nada dijo otra cosa)',
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
    reviewedByProvider: (rows) => `  Por proveedor: ${rows}`,
    reviewedGroup: (date, days, providers) => `${date}${hace(days)} ${providers}`,
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
      `${path}: ${revisions} ${revisions === 1 ? 'revisión' : 'revisiones'}`,
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
      `+${tokens} tokens: ${author}, "${subject}" (${sha})`,
    addedAt: () => 'añadido',
    goneAt: () => 'no existía',
    truncated: (shown) =>
      `Mostrando las ${shown} más recientes. Usa --limit para ver más.`,
    followedRename: (from) => `Se ha seguido un renombrado: las revisiones anteriores son ${from}.`,
    estimateNote: (band) =>
      `Los recuentos son estimaciones (±${band}% para texto de este tipo). Lo que importa es la tendencia, no las cifras absolutas.`,
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
    measureHeading: (root, prompts, level) =>
      `Qué recupera cada regla en ${root}: ${plural(prompts, 'prompt')}, nivel ${level}`,
    measureTotals: (before, saved, floor) =>
      `${before} tokens antes. Las reglas recuperan ${saved}; la normalización recupera ${floor} haya reglas activas o no, y eso no es obra de las reglas.`,
    measureRow: (id, marginal, alone, prompts) =>
      `${id.padEnd(22)} se pierde si se quita ${marginal.padStart(6)}   sola ${alone.padStart(6)}   ${plural(prompts, 'prompt')}`,
    measureOverlap: (sumOfAlone, saved) =>
      `Las reglas recuperan ${sumOfAlone} entre todas de una en una y ${saved} juntas. La diferencia es el solapamiento (dos reglas encontrando los mismos tokens) y se declara en vez de resolverse en un total, porque una sola cifra aquí es el único número que no puede ser cierto.`,
    measureRedundant: (ids) =>
      `Cada token que encuentran estas lo encuentra algo más, aquí: ${ids}. Un solapamiento, no un defecto, y no una razón para borrar una sin decidir cuál conviene conservar.`,
    measureFiredWithoutSaving: (ids) =>
      `Estas cambiaron el prompt y no recuperaron ningún token: ${ids}. No es lo mismo que inerte: sí se ejercitaron, y están alterando la instrucción de alguien sin beneficio medido.`,
    measureInert: (ids) =>
      `Estas no cambiaron nada en este corpus: ${ids}. Es un hecho sobre estos ficheros, no sobre las reglas: una regla que no encuentra nada aquí no ha demostrado no encontrar nada en ninguna parte.`,
    measureBand: (source) =>
      source === 'heuristic'
        ? 'Contado con el estimador incorporado, así que toda cifra de arriba lleva su banda documentada. Una regla cuyo rendimiento son unos pocos tokens está dentro del ruido.'
        : 'Contado con un tokenizador externo.',
  },


  doctor: {
    heading: (root, prompts) => `${root}: ${prompts} prompt${prompts === 1 ? '' : 's'}`,
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
        ? '1 prompt ya se pasa de su presupuesto: trazum check fallaría con él'
        : `${count} prompts ya se pasan de su presupuesto: trazum check fallaría con ellos`,
    andMore: (count) => `y ${count} más`,
    findingsHeading: () => 'Qué merecería la pena arreglar',
    acrossPrompts: (count) => `${count} prompt${count === 1 ? '' : 's'}`,
    findingsNote: () =>
      'Cada línea es el mismo aviso que trazum optimize da en esos prompts, sumado. '
      + 'Ejecútalo sobre cualquiera de ellos para ver la cifra por separado.',
    notAGate: () =>
      'Nada de esto hace fallar un build. trazum check es la puerta; esto es el '
      + 'reconocimiento: la recomendación de modelo es una heurística de palabras clave, '
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
        : 'Alguien tiene que elegir una redacción: difiere el texto, no solo su espaciado.',
    sharedPrefixNoFigure: () =>
      'No se adjunta cifra, a propósito. El caché compara bytes, así que estos prompts '
      + 'ocupan una entrada cada uno en lugar de una entre todos, pero lo que eso cuesta '
      + 'depende de cómo se reparten las llamadas dentro del grupo, y Trazum aplica un '
      + 'único --cache-hit-rate a todos. Cifrarlo sería inventarse tu tráfico.',
  },

  prune: {
    needsExamples: () =>
      'Encontrados menos de dos ejemplos few-shot que comparar. Se reconocen por una '
      + 'etiqueta <example> o por turnos etiquetados como "Ejemplo:", "Entrada:" o "Cliente:". '
      + 'Si los tuyos van de otra forma, no se han visto, que no es lo mismo que no estar.',
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
    line: (n, tokens, pct) => `ejemplo ${n}: ${tokens} tokens, ${pct} de coincidencia sin él`,
    verdictNeeded: () => 'hace falta aquí',
    verdictRecoverable: () => 'sin efecto en estas entradas',
    verdictUnknown: () => 'no concluyente',
    recoverable: (tokens) =>
      `${tokens} tokens están en ejemplos cuya retirada no cambió nada medible aquí.`,
    caveat: () =>
      'Lo cual no es lo mismo que "bórralos". Un ejemplo puede existir para un caso que '
      + 'estas entradas no contienen: la condición límite que alguien encontró en '
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
      'Toda cifra es después menos antes, así que positivo significa peor, lo contrario que en el resto de Trazum.',
    onlyBefore: () => 'solo antes ',
    onlyAfter: () => 'solo después',
    onlyOneSideNote: () =>
      'No entran en los totales. Un prompt que desaparece es una pregunta, no un ahorro.',
  },

  markdown: {
    checkHeading: (target) => `Trazum: presupuestos de tokens en ${target}`,
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
    diffHeading: (before, after) => `Trazum: ${before} → ${after}`,
    rankHeading: (root, count) =>
      `Trazum: qué arreglar primero en ${root} (${count} ${count === 1 ? "prompt" : "prompts"})`,
    blameHeading: (path) => `Trazum: historial de tokens de ${path}`,
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
    noBudget: () => 'ninguno',
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
    sourceEstimated: (band) => `estimado, ±${band}%`,
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
      `${path}: ${count} ${count === 1 ? 'prompt marcado' : 'prompts marcados'}`,
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
      `${directory}: ${files} ${files === 1 ? 'prompt' : 'prompts'}`,
    directorySummary: (failures, files) =>
      failures === 0
        ? `Los ${files} dentro de presupuesto.`
        : `${failures} de ${files} por encima del presupuesto.`,
    noBudget: () => '(sin presupuesto)',
    walkTruncated: () =>
      'Se ha parado antes de tiempo: el directorio supera el límite de recorrido, así que esto no es el cuadro completo.',
    filesFromSummary: (checked, listed, dropped) =>
      `Comprobando ${checked} de ${listed} fichero(s) listados, ${dropped} descartados: sin extensión de prompt, ignorados por la config, o ya no están en disco.`,
    filesFromNoBaseline: () =>
      'La puerta de baseline se omite con --files-from: compara el repositorio entero contra el registro comprometido, y una lista parcial se leería como eliminaciones. Los presupuestos se comprueban por fichero como siempre; ejecuta «trazum check .» para el baseline.',
    exactCountsCost: (files) =>
      `Contando ${files} ${files === 1 ? 'fichero' : 'ficheros'} con la API, una llamada por cada uno. Esto tarda un momento.`,
  },
  againstBase: {
    heading: (ref, sha) => `Frente a la base, ${ref} en ${sha}`,
    columnTokens: () => 'Tokens, base → cabeza',
    columnCalls: () => 'Llamadas al mes',
    columnBase: () => 'Base',
    columnHead: () => 'Cabeza',
    columnPrice: () => 'Precio',
    notStated: () => 'sin indicar',
    perMonth: (usd) => `${usd} al mes`,
    perCall: (usd) => `${usd} por llamada`,
    price: (perMTok, model, provider, readOn) =>
      `${perMTok} por millón de tokens de entrada, ${model}, precios de ${provider} leídos el ${readOn}`,
    priceOverlay: (perMTok, model, readOn) =>
      `${perMTok} por millón de tokens de entrada, ${model}, capa local de precios fechada el ${readOn}`,
    promo: (until) => `precio promocional hasta el ${until}`,
    totals: (base, head, change) =>
      `Los prompts con volumen indicado: ${base} al mes en la base, ${head} en la cabeza (${change}).`,
    perCallNote: (count) =>
      `${count} ${count === 1 ? 'prompt cambiado no tiene' : 'prompts cambiados no tienen'} volumen indicado, así que su coste es solo por llamada. Para ponerle precio a un mes, asocia el fichero del prompt en "labels" e indica sus llamadas al mes en "volumes" de trazum.config.json.`,
    inputOnly: () =>
      'Tokens de entrada al precio de entrada, los dos lados a los mismos precios. La salida queda fuera: editar un prompt no fija cuánto escribe el modelo.',
    modelDefault: (model) =>
      `Con el modelo por defecto de Trazum, ${model}, porque la config no fija usage.model. Fíjalo para poner precio al modelo al que se envían los prompts.`,
    unchanged: (count) =>
      `${count} ${count === 1 ? 'prompt es igual' : 'prompts son iguales'} en los dos lados.`,
    nothingChanged: () => 'Ningún prompt de aquí cambió frente a la base.',
    gateWithin: (change, limit) => `El aumento mensual, ${change}, está dentro del límite de ${limit}.`,
    gateBreached: (change, limit) => `El aumento mensual, ${change}, supera el límite de ${limit}.`,
    gateNotJudged: (count) =>
      `El límite juzga solo los prompts con volumen indicado: ${count} ${count === 1 ? 'prompt cambiado no se juzgó' : 'prompts cambiados no se juzgaron'}.`,
    unavailable: (why, ref) =>
      why === 'no-commit'
        ? `La base, ${ref}, no está en esta copia, así que no se comparó nada. No se descarga nada para buscarla. En GitHub Actions, pon fetch-depth: 0 en actions/checkout.`
        : why === 'not-a-repository'
          ? `Esto no es un repositorio git, así que no hay base con la que comparar ${ref}.`
          : `No se pudo ejecutar git, así que la base, ${ref}, no se leyó.`,
    gateUnavailable: (limit) =>
      `El límite de aumento mensual de ${limit} no juzgó nada, porque la base no se pudo leer, y una puerta que no juzga nada falla.`,
    gateNeedsBase: () =>
      '--max-monthly-increase-usd limita lo que un cambio añade al coste mensual frente a una base, así que necesita --base <ref>.',
    noStdin: () =>
      '--base lee de git el lado base de un fichero, y la entrada estándar no tiene lado base. Nombra el fichero.',
  },
  profile: {
    noTarget: () =>
      'Apúntalo a un log de uso: trazum profile usage.jsonl: un objeto JSON por línea, cada uno con un "model" y el objeto "usage" que devolvió la API. Añade "label" (qué carga), "session" (qué conversación) y "ts" (cuándo) ya que estás: sin ellos todas las llamadas parecen iguales, y los hallazgos más grandes de este comando (el crecimiento de conversación, y si el TTL de la caché encaja con el ritmo de tus turnos) no se pueden hacer siquiera. Registrarlo son cuatro líneas en tu propio código, nunca contiene el texto del prompt, y la clave de sesión se agrupa y nunca se imprime.',
    heading: () => 'Adónde fue el dinero',
    calls: (n) => plural(n, 'llamada'),
    spent: (calls, total) => `${calls} · ${total}`,
    part: (name, usd, pct, tokens) => `${name.padEnd(15)}${usd.padStart(11)}  ${pct.padStart(5)}   ${tokens} tokens`,
    partInput: () => 'Entrada',
    partCacheRead: () => 'Lecturas caché',
    partCacheWrite: () => 'Escrituras caché',
    partOutput: () => 'Salida',
    partWebSearch: () => 'Búsqueda web',
    partSearches: (name, usd, pct, searches) =>
      `${name.padEnd(15)}${usd.padStart(11)}  ${pct.padStart(5)}   ${plural(searches, 'búsqueda')}`,
    byLabelHeading: () => 'Por etiqueta',
    byModelHeading: () => 'Por modelo',
    row: (name, usd, pct, calls) => `${usd.padStart(11)}  ${pct.padStart(5)}   ${name}  (${calls})`,
    unlabelled: () => '(sin label)',
    cacheHit: (pct) => `Tasa de acierto de caché: ${pct} de la entrada facturable.`,
    cacheNever: () => 'No se usó caché en estas llamadas. Si algún prefijo se repite, ese es el mayor ahorro disponible.',
    cacheLost: (usd, writes, reads) =>
      `La caché añadió ${usd} a esta factura en lugar de restarlos. Se escribieron ${writes} tokens en la caché y se leyeron ${reads}, y una escritura cuesta 1,25x la entrada normal, o 2x con el TTL de una hora. Un prefijo que cambia más rápido de lo que se reutiliza paga esa prima a cambio de nada. O cachea un prefijo que no se mueva, o desactiva la caché aquí.`,
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
      `${label} en ${model}: hasta ${usd} de esta factura (${pct})`,
    leverRoute: (candidate, usd) => `llévalo a ${candidate}, ${usd}`,
    leverRouteVerify: () =>
      `Si eso aguanta es una pregunta de evaluación, no de aritmética, y aquí no se ha visto ni una sola respuesta. Mídelo: trazum route <log> --prompt-file <prompt> --cases <casos> --yes`,
    leverBatch: (usd) => `mándalo por la Batch API, ${usd}`,
    leverCalls: (calls, spent) => `${calls}, ${spent} gastados`,
    leverPromptCeiling: (usd, pct) =>
      `Para comparar: acortar el texto del prompt puede tocar ${usd} como mucho, el ${pct} de esta factura, y solo si borraras hasta el último token de entrada. La cifra real está muy por debajo, porque la mayoría de esos tokens son contexto recuperado, historial de conversación y resultados de herramientas que no están en ningún fichero de prompt.`,
    historyHeading: () => 'Lo que cuesta reenviar la conversación',
    historyGrowth: (label, model, first, last, turns, conversations) =>
      conversations > 1
        ? `${label} en ${model}: en ${count(conversations)} conversaciones, el turno más pequeño tiene de media ${first} tokens y el más grande ${last}, en conversaciones de hasta ${turns} turnos.`
        : `${label} en ${model}: la entrada va de ${first} tokens en el turno más pequeño a ${last} en el más grande, en ${turns} turnos.`,
    historyCeiling: (usd, pct, flat, spent) =>
      `Si cada turno hubiera tenido el tamaño del más pequeño, esa entrada habría costado ${flat} en vez de ${spent}, así que como mucho ${usd} de esta factura es crecimiento de la conversación (${pct}). Es un techo y no un ahorro: parte de eso son los mensajes nuevos del propio usuario, que nada puede truncar, y esto lee cuentas y no contenido, así que no puede separarlos. Lo que lo mueve es limitar el historial que reproduces, o resumirlo.`,
    truncatedWaste: (calls, usd, pct) =>
      `${calls} chocaron con el techo de max_tokens: ${usd} del gasto en salida (${pct}) compró respuestas cortadas a medias: pagadas enteras, a menudo reintentadas y facturadas otra vez. Donde la respuesta de verdad necesite el espacio, sube max_tokens; donde no, pide menos. En cualquier caso este es el único trozo de una factura que es desperdicio sin contrapartida.`,
    againstHeading: () => 'Contra el registro anterior',
    againstTotals: (before, after, delta, pct, callsBefore, callsAfter) =>
      `${before} → ${after}   ${delta} (${pct})   ${callsBefore} → ${callsAfter}. Positivo significa que la factura creció. Las dos cifras son exactamente lo que contiene cada fichero: no se asume ningún periodo, así que juzga las llamadas antes de juzgar el dinero.`,
    againstDriver: (delta, label, before, after) => `${delta}  ${label}  (${before} → ${after})`,
    againstDriverNew: (delta, label) => `${delta}  ${label}  (nuevo desde el registro anterior)`,
    againstDriverGone: (delta, label) => `${delta}  ${label}  (desaparecido desde el registro anterior)`,
    againstByModel: () =>
      'El mismo cambio, por modelo, hacia dónde se movió la mezcla:',
    labelPrefixBelowMinimum: (file, prefix, minimum, model) =>
      `${file} (tal y como está hoy: el registro puede ser anterior): el prefijo estable son ${prefix} tokens y ${model} no cachea nada por debajo de ${minimum}. Poner cache_control ahí no da error, simplemente nunca cachea, que es exactamente el aspecto que tiene en la factura una caché que solo escribe.`,
    labelPrefixMovable: (file, movable, prefix) =>
      `${file} (tal y como está hoy: el registro puede ser anterior): ~${movable} tokens estables están detrás del primer marcador, donde la caché no llega; el prefijo cacheable es ${prefix}. "trazum optimize ${file} --reorder" los mueve delante y enseña el diff.`,
    labelPrefixHealthy: (file, prefix, minimum) =>
      `${file} (tal y como está hoy: el registro puede ser anterior): el prefijo estable son ${prefix} tokens, por encima del mínimo de ${minimum}. El fichero no es el problema; mira si el prefijo es byte a byte idéntico entre llamadas.`,
    labelFileMissing: (label, file) =>
      `labels["${label}"] apunta a ${file}, que no existe: el mapeo se ha saltado.`,
    againstNothingPriced: () =>
      'El registro anterior no tiene nada que el catálogo de precios conozca, así que no hay comparación que hacer.',
    truncatedNotRecorded: () =>
      'No se pudo medir si alguna respuesta quedó cortada: ninguna llamada de este registro lleva stop reason. Añade "stop_reason" (Anthropic) o "finish_reason" (OpenAI) al registro; la API ya lo devuelve junto a "usage".',
    historyNoSessions: () =>
      'Ninguna llamada de este registro llevaba sesión, así que no se pudo medir lo que cuesta reenviar la conversación, normalmente la línea más grande de una factura de chat o de agente. Añade "session" (o "conversation_id") al registro y vuelve a ejecutarlo. Trazum agrupa por ese campo y nunca lo imprime.',
    leversUnlabelled: () =>
      'Ninguna de estas llamadas llevaba label, así que esto es todas las cargas en una fila: un clasificador y un pipeline RAG fundidos en una sola cifra, con una única ruta sugerida para los dos. Añade "label" al registro y las palancas se separan por carga, que es la agrupación en la que de verdad se toma una decisión.',
    outputShapeHeading: () => 'Dónde se concentra el gasto en salida',
    outputTail: (label, model, callPct, spendPct, above, usd) =>
      `${label} en ${model}: el ${callPct} de las llamadas concentra el ${spendPct} del gasto en salida: las que responden con más de ${above} tokens, de ${usd} de salida en esta porción.`,
    outputTailAdvice: () =>
      'Eso es una cola, y una cola tiene una causa: un camino del prompt que invita a una redacción, una llamada sin max_tokens, una recuperación que devolvió un libro. Encontrarla es una mañana; no es "acorta todo".',
    outputFlat: (label, model, callPct, spendPct, usd) =>
      `${label} en ${model}: el gasto en salida está donde están las llamadas: el ${callPct} concentra el ${spendPct} de ${usd}. No hay cola que cazar.`,
    outputFlatAdvice: () =>
      'Aquí la longitud de la respuesta es la tarea, así que las palancas son las bastas: pide respuestas más cortas en el prompt, y limita max_tokens.',
    outputPercentiles: (p50, p95) =>
      `La mitad de las respuestas medidas caben en ${p50} tokens de salida, y el 95% en ${p95}, el número que un límite de max_tokens quiere de verdad. Medido en estas llamadas, prometido para ninguna.`,
    inputShapeHeading: () => 'Cómo de grandes son estas llamadas',
    inputSkewed: (label, model, p50, p95, ratio, usd) =>
      `${label} en ${model} es desigual: la mitad de sus llamadas caben en ${p50} tokens de entrada y el 95% en ${p95}, unas ${ratio} veces la llamada normal, sobre ${usd} de gasto de entrada.`,
    inputSkewedAdvice: () =>
      'Por encima de cuatro veces la mediana, la llamada normal está bien y algo crece encima: una conversación que nadie corta, una recuperación sin tope, un resultado de herramienta pegado entero. El arreglo es un límite en las llamadas grandes, no reescribir el prompt que mandan todas.',
    inputEven: (label, model, p50, p95, usd) =>
      `${label} en ${model} es pareja: la mitad de sus llamadas caben en ${p50} tokens de entrada y el 95% en ${p95}, sobre ${usd} de gasto de entrada.`,
    inputEvenAdvice: () =>
      'Las llamadas grandes no son mucho mayores que la normal, así que no hay cola que capar: el prompt simplemente es grande. Las palancas son menos documentos recuperados, un bloque de sistema más corto y caché si el prefijo se repite.',
    inputHuge: (label, model, calls, usd) =>
      `${label} en ${model}: cada una de sus ${calls} es mayor de lo que esta herramienta mide con precisión, sobre ${usd} de gasto de entrada. No se nombra techo porque no hay ninguno que nombrar con honestidad: ese tamaño es ya el hallazgo.`,
    repeatsHeading: () => 'La misma petición, otra vez',
    repeatsFound: (label, model, repeats, checked, seconds, usd) =>
      `${label} en ${model}: ${repeats} de ${checked} llamadas reenviaron el tamaño de entrada exacto de la llamada anterior en menos de ${seconds} segundos, en la misma conversación, costando ${usd}.`,
    pressureHeading: () => 'Acercándose a la ventana de contexto',
    pressureLine: (label, model, tokens, window, share) =>
      `${label} en ${model}: la llamada más grande llevó ${tokens} tokens de entrada contra una ventana de ${window}, el ${share} del techo.`,
    mixDriftHeading: () => 'La mezcla se movió dentro de este registro',
    mixDriftLine: (model, firstShare, lastShare, firstDays, lastDays, lastUsd) =>
      `${model} pasó del ${firstShare} del gasto en los primeros ${firstDays} días al ${lastShare} en los últimos ${lastDays}, ${lastUsd} de la mitad reciente.`,
    truncationRetryLine: (label, model, retried, truncated, seconds, wasted, retry) =>
      `${label} en ${model}: ${retried} de ${truncated} respuestas cortadas tuvieron otra llamada en la misma conversación en menos de ${seconds} segundos: ${wasted} gastados en los intentos cortados, más ${retry} en las llamadas siguientes.`,
    truncationRetryNote: () =>
      'La pareja tiene la forma de un reintento; el registro no ve el contenido, así que si cada una lo fue es cosa tuya. Los dos lados son dinero real, y el arreglo es el mismo en ambos casos: un max_tokens en el que las respuestas quepan de verdad.',
    mixDriftNote: () =>
      'Una factura puede crecer sin que crezca ninguna carga: tráfico migrando entre modelos, un deploy que cambió un valor por defecto, un fallback convertido en camino principal. Se muestra a partir de quince puntos de movimiento. Hacia dónde va la mezcla después no está en este registro, así que aquí no se dice.',
    pressureAdvice: () =>
      'Al 100% la llamada falla sin más, y nada en la factura cambia hasta ese día. Las palancas son un tope al contexto recuperado, truncar el historial de conversación o un modelo con ventana mayor. Cuándo se cruza no se predice aquí: la proporción es un hecho; la trayectoria es tuya.',
    repeatsAdvice: () =>
      'La entrada de una conversación crece en cada turno, así que el mismo tamaño dos veces seguidas con segundos de diferencia suele ser un reintento tras un timeout, un paso de agente que se repite o un bucle: esto lee recuentos y no puede ver el contenido, así que nombra el patrón y para. Sea lo que sea, ese dinero no compró nada que la llamada anterior no hubiera pagado ya.',
    inputMostlyCached: (share) =>
      `El ${share} de esos tokens fueron lecturas de caché, facturadas a una décima parte de la tarifa de entrada: el tamaño es real y la mayor parte es barata.`,
    inputFullRate: () =>
      'Casi nada de eso fue lectura de caché, así que cada uno de esos tokens se facturó a tarifa de entrada completa. Si algún prefijo se repite entre estas llamadas, la caché es la palanca con el techo más alto aquí.',
    leversNone: () =>
      'Aquí no hay nada que llegue al 1% de la factura: estas llamadas ya van al modelo más barato de su familia, o su proveedor no tiene Batch API. Eso es una respuesta de verdad, no una sección vacía.',
    assumedWriteTtl: (calls) =>
      `${count(calls)} ${calls === 1 ? 'llamada no dijo' : 'llamadas no dijeron'} qué TTL de escritura de caché se usó, así que se asumió la tarifa más barata, la de 5 minutos. Una entrada de 1 hora cuesta 2x la entrada en vez de 1.25x, así que este total es un suelo para esas llamadas. Registra el objeto "cache_creation" que devuelve la API para quitar la suposición.`,
    tierCeiling: (rows, models, ceiling, floor) =>
      `${count(rows)} ${rows === 1 ? 'fila' : 'filas'} de ${models} ${rows === 1 ? 'suma' : 'suman'} peticiones sin dar la longitud de ningún prompt, y ese modelo se cobra por longitud de prompt, así que ${rows === 1 ? 'se factura' : 'se facturan'} a la tarifa más cara: ${ceiling} de este total. A la tarifa más barata los mismos tokens suman ${floor}; la cifra real está entre las dos. Un registro con una línea por llamada lo resuelve.`,
    spanLine: (from, to, days) =>
      `Este registro abarca ${from} → ${to} (${days} días): declarado, nunca extrapolado. Escálalo tú a un mes, ahora que sabes qué cubre.`,
    spanPartial: (withTs, total) =>
      `Solo ${withTs} de ${total} llamadas llevan marca de tiempo; el periodo describe esas.`,
    ttlFitExpires: (label, model, gap) =>
      `${label} en ${model}: los turnos llegan con una mediana de ${gap} entre sí y la entrada de 5 minutos ya no existe para entonces: las escrituras caducan antes de que el siguiente turno las lea, que visto desde la factura es una caché que solo escribe. El TTL de 1 hora cuesta 2x la entrada al escribir y sobreviviría a estos huecos; la otra opción honesta es apagar la caché aquí.`,
    ttlFitExpiresBoth: (label, model, gap) =>
      `${label} en ${model}: los turnos llegan con una mediana de ${gap} entre sí, y ninguna entrada de caché vive tanto: hasta el TTL de 1 hora ha caducado para el siguiente turno. La caché no puede funcionar a este ritmo; apágala aquí y deja de pagar la prima de escritura.`,
    ttlFitExpiresOnly: (label, model, gap, ttl) =>
      `${label} en ${model}: los turnos llegan con una mediana de ${gap} entre sí, y la entrada de caché de este modelo vive ${ttl}, sin otra más larga que comprar. Las escrituras caducan antes de que el siguiente turno las lea, así que la caché no puede funcionar a este ritmo; apágala aquí y deja de pagar la prima de escritura.`,
    ttlFitOverlong: (label, model, gap, usd) =>
      `${label} en ${model}: los turnos llegan con una mediana de ${gap} entre sí (de sobra dentro de la ventana de 5 minutos) y estas escrituras pagan la tarifa de 1 hora, 2x la entrada frente a 1.25x, por una resistencia que los huecos nunca usan. Las mismas escrituras con el TTL de 5 minutos salen ${usd} más baratas en este registro, y esa cifra es exacta: los mismos tokens a la otra tarifa publicada.`,
    ttlFitUnsettledGap: (label, model, gap) =>
      `${label} en ${model}: los turnos llegan con una mediana de ${gap} entre sí (una entrada de 5 minutos ya no existe para entonces y una de 1 hora sobrevive) y el registro no anotó cuáles eran estas escrituras, así que no se puede resolver si alguna vez se leen de vuelta. Registra el objeto "cache_creation" que devuelve la API y se resuelve solo.`,
    ttlFitFits: (label, model, gap) =>
      `${label} en ${model}: los turnos llegan con una mediana de ${gap} entre sí, dentro de la vida útil que usan estas escrituras. El TTL no es el problema aquí.`,
    ttlFitUnmeasured: () =>
      'No se pudo medir si el TTL de la caché encaja con el ritmo de los turnos: hacen falta "session" y "ts" en el registro. Una entrada de 5 minutos en una carga cuyos turnos llegan cada nueve caduca sin leerse en cada escritura, y solo el reloj puede verlo. Trazum agrupa por la sesión y nunca la muestra.',
    dayPeak: (day, usd, xMedian) =>
      `El día más caro de este registro fue ${day}: ${usd}, ${xMedian}x el día mediano.`,
    dayPeakLabel: (label, usd) => `Casi todo fue ${label} (${usd}).`,
    maxUsdOk: (total, max) => `Dentro del presupuesto: ${total} gastados contra --max-usd ${max}.`,
    maxUsdFailed: (total, max) =>
      `FALLO: este registro gastó ${total} contra un --max-usd de ${max}. Las cifras son los recuentos facturados por el proveedor sobre exactamente este registro; no se asumió ningún periodo.`,
    maxGrowthUsdFailed: (delta, max) =>
      `FALLO: la factura creció ${delta} respecto al registro anterior, por encima del límite --max-growth-usd de ${max}.`,
    maxGrowthNeedsAgainst: () =>
      '--max-growth-usd no tiene con qué comparar sin --against <anterior.jsonl>. Por sí solo habría corrido en silencio sin vigilar nada, y eso no es una respuesta.',
    maxCacheLossOk: (worst, max) =>
      `Caché dentro del presupuesto: cachear costó como mucho ${worst} contra --max-cache-loss-usd ${max}, peor caso incluido.`,
    maxCacheLossFailed: (delta, max) =>
      `FALLO: cachear añadió ${delta} a esta factura (los mismos tokens como entrada normal habrían costado menos), por encima del límite --max-cache-loss-usd de ${max}. El contrafactual es exacto: los mismos tokens a la tarifa de entrada publicada.`,
    maxDayOk: (day, usd, max) =>
      `Ningún día por encima del presupuesto: el peor fue ${day} con ${usd}, contra --max-day-usd ${max}.`,
    maxDayFailed: (day, usd, max) =>
      `FALLO: ${day} gastó ${usd}, por encima del límite --max-day-usd de ${max}. Un total dentro de presupuesto puede esconder un solo día desbocado, que es justo lo que vigila esta puerta.`,
    maxDayNoClock: () =>
      'FALLO: se pidió --max-day-usd y ningún registro de este fichero lleva marca de tiempo, así que no hay días que juzgar. Eso no es un aprobado: una factura que nadie pudo medir por días no es una factura que se mantuvo bajo un presupuesto diario. Añade "ts" al registro y la puerta se arma.',
    maxSessionOk: (worst, max, sessions) =>
      `Ninguna conversación por encima del presupuesto: la más cara de ${sessions} costó ${worst}, contra --max-session-usd ${max}. Una conversación que empezó antes de este registro solo cuenta los turnos grabados aquí, así que esto es un suelo.`,
    maxSessionFailed: (worst, max, sessions) =>
      `FALLO: la más cara de ${sessions} conversaciones costó ${worst}, por encima del límite --max-session-usd de ${max}. El presupuesto del mes y el del día aprueban mientras una conversación en bucle se come esto; la cifra por conversación es la que lo caza.`,
    maxSessionNoSessions: () =>
      'FALLO: se pidió --max-session-usd y ningún registro lleva sesión, así que no hay conversaciones que juzgar. Eso no es un aprobado. Añade "session" (o "conversation_id") al registro y la puerta se arma; Trazum agrupa por ella y nunca la imprime.',
    maxDayUndated: (calls) =>
      `${calls} llamadas no llevan marca de tiempo, así que están en la factura y en ninguno de los días de arriba: el peor día es un suelo por lo que valieran esas llamadas. Un fallo se sostendría igual; este aprobado cubre la parte que se pudo fechar.`,
    maxCacheLossWorstCase: (calls, worst, max) =>
      `FALLO: ${count(calls)} ${calls === 1 ? 'llamada no registró' : 'llamadas no registraron'} qué TTL de escritura se pagó, y a la tarifa de 1 hora cachear añadió hasta ${worst}, por encima del límite --max-cache-loss-usd de ${max}. La puerta lee el peor caso a propósito: una puerta que leyera la mitad halagadora dejaría pasar exactamente las facturas que existe para cazar. Registra el objeto "cache_creation" que devuelve la API y el techo se vuelve una cifra.`,
    pricesStale: (date, days) =>
      `La tabla de precios detrás de cada dólar de aquí se revisó por última vez el ${date}, hace ${count(days)} días, más de los 45 que esta herramienta considera vigentes. Si el proveedor cambió precios desde entonces, este informe se equivoca exactamente en ese cambio. --pricing-live trae los precios de hoy; --pricing superpone los tuyos.`,
    dayTableDay: () => 'Día (UTC)',
    dayTableCalls: () => 'llamadas',
    dayTableTop: () => 'lo más caro del día',
    dayTableEarlier: (days) =>
      `…y ${count(days)} ${days === 1 ? 'día anterior que no se muestra' : 'días anteriores que no se muestran'} aquí. La serie completa va en --json como spendByDay.`,
    gateOnFloor: (reasons) =>
      `Aviso: la cifra vigilada es un suelo, no la factura: ${reasons}. Lo que costaran esas llamadas no está en el número que la puerta acaba de juzgar, así que pasar aquí significa "cabe la parte que pude leer", nunca "cabe la factura".`,
    floorSkipped: (lines) =>
      `${count(lines)} ${lines === 1 ? 'línea resultó ilegible y quedó fuera' : 'líneas resultaron ilegibles y quedaron fuera'}`,
    floorUnpriced: (calls) =>
      `${count(calls)} ${calls === 1 ? 'llamada usa un modelo' : 'llamadas usan modelos'} que la tabla de precios no conoce`,
    floorUndated: (calls) =>
      `${count(calls)} ${calls === 1 ? 'llamada no lleva marca de tiempo y cayó' : 'llamadas no llevan marca de tiempo y cayeron'} fuera de la ventana`,
    sessionCost: (label, model, sessions, median, medianTurns, p95, max) =>
      `${label} en ${model}: en ${sessions} sesiones, la mediana cuesta ${median} a lo largo de ${medianTurns} turnos, el 95% queda por debajo de ${p95} y la más cara fue ${max}. Recuentos facturados exactos, por sesión con sus subagentes: la cifra con la que se fija un precio por asiento o una cuota. Una sesión que empezó antes de este registro o sigue después solo cuenta por los turnos aquí registrados.`,
    labelBudgetOk: (label, usd, max) =>
      `Dentro del presupuesto: ${label} gastó ${usd} contra ${max}.`,
    labelBudgetFailed: (label, usd, max) =>
      `FALLO: ${label} gastó ${usd} contra su presupuesto de ${max} en trazum.config.json.`,
    labelBudgetMissing: (label) =>
      `${label} tiene presupuesto en trazum.config.json y ninguna llamada en este registro, así que no se midió nada para esa carga. No es un aprobado: una carga que no apareció no es una carga que quedó por debajo del presupuesto.`,
    labelBudgetWindowed: () =>
      'Los presupuestos por etiqueta de trazum.config.json no se aplicaron: --since/--until hacen que "lo que gastó esta etiqueta" signifique una porción, y un presupuesto escrito para el periodo completo estaría vigilando algo que no describe.',
    duplicateLines: (calls, usd) =>
      `${plural(calls, 'línea es un duplicado exacto', 'líneas son duplicados exactos')} de una línea anterior (mismos recuentos, misma etiqueta y sesión, mismo milisegundo) y eso suma ${usd} al total de arriba. Si un registro se exportó dos veces o dos ficheros del directorio se solapan, esta factura está inflada en esa cantidad. Que dos llamadas reales coincidan en todo eso es posible; solo que improbable.`,
    budgetVsWire: (label, file, budget, perCall, share) =>
      `El presupuesto de ${file} son ${budget} tokens, y las llamadas con etiqueta ${label} llevan unos ${perCall} tokens de entrada cada una, así que esa puerta vigila alrededor del ${share} de lo que realmente sale por el cable. El resto es contexto recuperado, historial de conversación y resultados de herramientas, que ningún fichero de prompt contiene y ningún presupuesto sobre uno puede ver. El presupuesto no está mal; simplemente es más pequeño que la factura.`,
    badCsvShape: (value) =>
      `--csv-shape no conoce "${value}". Acepta "slice" (una fila por etiqueta y modelo, el valor por defecto), "day", "hour" o "model-day" (una fila por día y modelo: el formato largo que quiere una tabla dinámica).`,
    whatIfHeading: (model) => `Estas mismas llamadas en ${model}`,
    whatIfAssumption: () =>
      'Esto es una multiplicación, no un consejo: los mismos recuentos de tokens con otra tarifa. No dice nada sobre si ese modelo podría hacer el trabajo, y un modelo que responda más largo o al que haya que reintentar no enviaría estos recuentos.',
    whatIfTotal: (current, target, delta) =>
      `${current} de gasto movible habrían sido ${target}, una diferencia de ${delta}.`,
    whatIfCheaper: () =>
      'Compruébalo antes de mover nada: trazum route mide un prompt contra ambos modelos con tus propios ejemplos.',
    whatIfDearer: () => 'Esa dirección cuesta más. La aritmética está aquí para que el número no sea una suposición.',
    whatIfTierCeiling: (slices, target, floor) =>
      `${target} se cobra por longitud de prompt, y ${count(slices)} ${slices === 1 ? 'tramo tiene' : 'tramos tienen'} una llamada por encima de su umbral, así que ${slices === 1 ? 'se cobra' : 'se cobran'} a la banda más cara: la cifra de arriba es un techo. Con todas las llamadas por debajo del umbral sería ${floor}.`,
    whatIfBatchOnTarget: (batched, moved) =>
      `Si esas llamadas además pueden esperar, la Batch API del destino deja la factura trasladada de ${moved} en ${batched}: el descuento aplica a las tarifas del destino, no a las que dejas. Si pueden esperar no está en el registro; esa mitad de la decisión es tuya.`,
    whatIfCacheBeyond: (largest, min, noCache) =>
      `Su tráfico de caché no podría existir allí: la llamada más grande tiene ${largest} tokens frente al mínimo de caché de ${min} tokens del destino, así que ninguna llamada de este slice podría crear una entrada. Sin la caché los mismos tokens cuestan ${noCache}: esa es la cifra que el destino facturaría de verdad, y la fila de arriba favorece el traslado.`,
    whatIfSlice: (label, model, current, target) => `${label} en ${model}: ${current} → ${target}`,
    whatIfOverContext: (label, tokens, window, usd) =>
      `${label} no puede moverse: su llamada más grande lleva ${tokens} tokens de entrada y la ventana de ese modelo es de ${window}. Esas llamadas fallarían, no costarían menos, así que sus ${usd} quedan fuera de las cifras de arriba.`,
    whatIfAlreadyThere: (calls, usd) =>
      `Ya en ese modelo: ${calls} por valor de ${usd}, fuera de las cifras de arriba: dinero que no puede moverse haría que la diferencia pareciera menor de lo que es.`,
    whatIfUnpriced: (calls, models) =>
      `Fuera de la comparación: ${calls} cuyo modelo no tiene precio aquí (${models}). Su coste en el modelo destino sí se puede calcular; la diferencia no, porque no hay cifra actual de la que restar.`,
    whatIfNothingToMove: () =>
      'Nada que comparar: todas las llamadas con precio de este registro ya están en ese modelo, o son demasiado grandes para su ventana de contexto.',
    whatIfUnknown: (value, available) =>
      `--what-if no conoce "${value}". Modelos con precio: ${available}. Añádelo con --pricing si tienes sus tarifas.`,
    badGzip: (file, detail) =>
      `${file} está comprimido con gzip y no se ha podido descomprimir: ${detail}. Leer el resto y no decir nada daría una factura a la que le falta lo que hubiera en ese fichero, así que se para aquí. Revisa el fichero, o sácalo del directorio.`,
    readInParts: (file, megabytes, slimmed) =>
      `${file}: ${megabytes} MB, demasiado grande para leerlo entero, así que se ha leído línea a línea; el texto de los mensajes de ${slimmed} línea(s) se ha dejado aparte. Los tokens y los modelos se leen como siempre: aquí ninguna llamada se factura por su texto.`,
    tooLargeToRead: (file, megabytes) =>
      `${file} ocupa ${megabytes} MB, y ni dejando aparte el texto de los mensajes cabe en una sola lectura. Divídelo en ficheros más pequeños (por ejemplo \`split -l 500000\`) y pásalos.`,
    dryRunHeading: () => 'Qué puede responder este registro, no se ha producido factura',
    dryRunParsed: (parsed, skipped) =>
      `${parsed} registros se leen; ${skipped} líneas no se pudieron leer. Un dry run no valora nada: el punto es sobre qué se apoyarían los gates que vas a cablear.`,
    dryRunUnpriced: (models) =>
      `Modelos que la tabla de precios no conoce: ${models}. Sus tokens se leen; sus dólares necesitan un overlay --pricing.`,
    dryRunTotals: () => 'La factura en sí: totales, desglose por modelo, economía de caché, las palancas.',
    dryRunLabels: (share) =>
      `Hallazgos por carga y presupuestos por etiqueta: "label" en el ${share} de los registros.`,
    dryRunClock: (share) =>
      `El periodo, la forma por día y por hora, --max-day-usd, --since/--until: marca de tiempo en el ${share} de los registros.`,
    dryRunSessions: (share) =>
      `Crecimiento de conversación, coste por conversación, --max-session-usd: sesión en el ${share} de los registros. Se agrupa por ella, nunca se imprime.`,
    dryRunStopReason: (share) =>
      `Respuestas truncadas y su factura de reintentos: razón de parada en el ${share} de los registros.`,
    dryRunCacheTtl: (ttl, writes) =>
      `Veredictos de caché resueltos: el desglose "cache_creation" en ${ttl} de ${writes} registros que escriben caché.`,
    dryRunNoCacheTraffic: () =>
      'Veredictos de caché: nada escribió en la caché en este registro, así que no hay nada que resolver, no es un campo ausente.',
    dryRunFooter: () =>
      'Una ✗ no es un defecto del registro; es un hallazgo que este registro aún no puede sostener. La receta de registro del README lleva todos los campos de arriba.',
    dryRunNoGates: () =>
      '--dry-run no produce factura, así que un gate a su lado saldría en verde sin haber juzgado nada. Corre los gates sin --dry-run.',
    bySourceNeedsConfig: () =>
      '--by-source lee el bloque "sources" de trazum.config.json (un nombre por servicio, cada uno con patrones glob sobre rutas de registros) y esta config no tiene ninguno. Nombra al menos una fuente.',
    bySourceNothingMatched: (sources) =>
      'Ningún fichero de registro coincidió con ningún patrón de fuente. Las fuentes configuradas: ${sources}. Los patrones casan con las rutas tal como se dan en la línea de comandos.'.replace('${sources}', sources),
    fleetHeading: (count, total, calls) => `La flota: ${count} fuentes · ${total} · ${calls}`,
    fleetRow: (name, usd, share, calls, span) => `${name}  ${usd}  ${share} de la flota · ${calls} · ${span}`,
    fleetSpan: (days) => `${days} días`,
    fleetNoClock: () => 'sin reloj',
    fleetWorst: (name, usd, share) =>
      `${name} es donde está el dinero: ${usd}, el ${share} del total de la flota.`,
    fleetMismatchedSpans: () =>
      'Estas fuentes cubren periodos distintos, así que los porcentajes de arriba comparan totales, no ritmos: un registro de 3 días parece barato junto a uno de 30 por motivos que nada tienen que ver con el coste. Cada fila indica su propio periodo.',
    fleetSplitBrain: (label, detail) =>
      `La misma carga corre en modelos distintos en fuentes distintas, ${label}: ${detail}. Mismo trabajo, tarifas distintas; si es una decisión o un accidente no está en los registros.`,
    fleetCacheUnderwater: (name, usd) =>
      `La caché es rentable para la flota en conjunto pero pierde ${usd} en ${name}: el veredicto agregado lo escondía.`,
    fleetUnmatched: (file) =>
      `${file} no coincidió con ningún patrón de fuente, así que no está en ningún informe de arriba: gasto ausente de todas las facturas hasta que un patrón lo cubra.`,
    fleetFooter: () =>
      'Resúmenes por fuente; el informe completo de un servicio es "trazum profile <sus registros>". Mismos umbrales, mismos hallazgos, una fuente cada vez.',
    fleetBudgetOk: (name, usd, max) => `Dentro de presupuesto: ${name} gastó ${usd} contra su ${max} en spend.bySource.`,
    fleetBudgetFailed: (name, usd, max) =>
      `FALLÓ: ${name} gastó ${usd} contra su presupuesto de ${max} en spend.bySource. El total de la flota puede estar bien mientras un servicio sangra; este gate nombra cuál.`,
    fleetBudgetMissing: (name) =>
      `${name} tiene presupuesto en spend.bySource y ningún registro coincidió con él en esta ejecución, así que no se midió nada. No es un aprobado: un servicio que no apareció no es un servicio dentro de presupuesto.`,
    coverageHeading: () => 'Lo que este registro todavía no puede responder',
    needsLabel: (seen) =>
      `"label" en ${seen} registros: sin él todas las cargas son una sola fila, así que no hay gasto por carga, ni zoom, y las palancas describen una mezcla en vez de una decisión.`,
    needsOutcome: (seen) =>
      `un "outcome": ${seen}. El \u00fanico campo que cambia lo que significa cualquier otra cifra de aqu\u00ed: sin \u00e9l esta herramienta puede decir que una carga baj\u00f3 un 40% y no puede decir si dej\u00f3 de funcionar. Registra tu propia palabra para lo que pas\u00f3 y declara el vocabulario en "outcomes".`,
    dryRunOutcomes: (share) =>
      `coste por resultado y una tasa de \u00e9xito (${share} de los registros llevan "outcome")`,
    outcomeHeading: () => 'Resultados',
    outcomeRate: (rate, ofUsd) =>
      `${rate} de ${ofUsd} en resultados declarados tuvo \u00e9xito: por gasto y no por llamada, porque las dos cifras divergen justo cuando la mitad cara es la que falla.`,
    outcomeNoRate: (why) =>
      why === 'nothing-recorded'
        ? 'Sin tasa de \u00e9xito: nada en este log registr\u00f3 un resultado. Eso no es una tasa de cero: una tasa de cero es una medici\u00f3n real y p\u00e9sima, y esto es que nadie nos lo ha dicho.'
        : 'Sin tasa de \u00e9xito: "outcomes.success" no declara ning\u00fan valor, as\u00ed que aqu\u00ed nada cuenta como \u00e9xito. Es leg\u00edtimo declararlo as\u00ed, y significa que la tasa no le corresponde calcularla a esta herramienta.',
    outcomeUnrecorded: (share, usd) =>
      `${share} de la factura (${usd}) no llev\u00f3 resultado, y no est\u00e1 en ninguna de las dos mitades de la tasa de arriba.`,
    outcomeUndeclared: (values) =>
      `No declarados en "outcomes.values": ${values}. Nombrados en vez de contados como fallos: una errata en un exportador debe parecer una errata, no una regresi\u00f3n del producto.`,
    perOutcomeHeading: () => 'Lo que cuesta un resultado',
    perOutcomeRow: (key, perCall, perOutcome, coverage) => `${key} ${perCall} ${perOutcome} ${coverage}`,
    perOutcomeColumns: {
      workload: 'carga',
      perCall: 'por llamada',
      perOutcome: 'por acierto',
      recorded: 'cubierto',
    },
    perOutcomeWithheld: (why, successes, coverage) =>
      why === 'too-few-outcomes'
        ? `${successes} hasta ahora`
        : why === 'too-little-coverage'
          ? `${coverage} cubierto`
          : why === 'no-successes-recorded'
            ? 'ninguno acert\u00f3'
            : why === 'nothing-recorded'
              ? 'sin registrar'
              : 'sin vocabulario',
    perOutcomeNumerator: () =>
      'Por acierto divide el gasto de las llamadas que registraron un resultado, nunca la factura entera: dividirlo todo cargar\u00eda tu tr\u00e1fico sin instrumentar a tus aciertos medidos y dar\u00eda una cifra alta por exactamente la parte no cubierta, en silencio, en la direcci\u00f3n que mata una funci\u00f3n que s\u00ed funciona. "cubierto" es qu\u00e9 parte del gasto de cada carga cubre la cifra.',
    perOutcomeDisagreement: (key, callRank, outcomeRank) =>
      `${key} es el #${callRank} por coste por llamada y el #${outcomeRank} por coste por acierto.`,
    perOutcomeBothOrders: () =>
      'M\u00e1s barato por llamada y m\u00e1s barato por acierto son \u00f3rdenes distintos, y se imprimen los dos en vez de elegir uno. Una carga puede subir en uno mientras baja en el otro, y quien optimice por el primer n\u00famero estar\u00eda moviendo el equivocado.',
    outcomeColumns: { outcome: 'resultado', calls: 'llamadas', spend: 'gasto' },
    verdictSuccess: () => '\u00e9xito',
    verdictOther: () => 'otro',
    verdictUndeclared: () => 'sin declarar',
    needsSession: (seen) =>
      `"session" en ${seen} registros: sin él no hay crecimiento de conversación, ni coste por conversación, ni encaje del TTL de caché. Se agrupa por él y nunca se imprime.`,
    needsTs: (seen) =>
      `"ts" en ${seen} registros: sin él el registro no tiene periodo, ni forma por día o por hora, y la pregunta del TTL de caché no se puede ni plantear.`,
    needsStopReason: (seen) =>
      `"stop_reason" (Anthropic) o "finish_reason" (OpenAI) en ${seen} registros: sin él las respuestas cortadas en max_tokens son invisibles, y el silencio ahí no es lo mismo que ninguna.`,
    needsCacheTtl: (seen) =>
      `el objeto "cache_creation" en ${seen} de los registros que escribieron en caché: sin él se asume la tarifa de 5 minutos, así que esos totales son un suelo y algunos veredictos de caché no se pueden cerrar.`,
    hoursConcentrated: (hours, list) =>
      `El 80% de este gasto cae en ${hours} horas del día UTC (${list}): tráfico interactivo con alguien esperando, donde las 24 horas de la Batch API no encajan. Las horas son UTC; desplázalas tú si tu tráfico está en una sola región.`,
    hoursFlat: (hours) =>
      `El gasto está repartido por el día: hacen falta ${hours} horas del día UTC para cubrir el 80%. Esa es la forma del trabajo de fondo, y el trabajo de fondo es justo lo que la Batch API abarata a la mitad: mira las palancas de arriba para ver cuánto valdría aquí. Si estas llamadas pueden esperar lo dices tú; el registro solo enseña cuándo ocurrieron.`,
    truncatedBy: (label, calls, measured, rate, usd) =>
      `${label}: ${calls} de ${measured} llamadas que registraron motivo de parada quedaron cortadas (${rate}), ${usd} de salida. El denominador son las llamadas que midieron, no todas: una carga que registra el campo la mitad de las veces no es una carga cuya otra mitad terminó.`,
    truncatedCeiling: (p95) =>
      `El 95% de las respuestas que sí terminaron cabe en ${p95} tokens de salida, así que un tope por ahí dejaría de cortarlas. Medido en estas llamadas, prometido para ninguna.`,
    readFiles: (files, directory) =>
      `Leídos ${count(files)} ficheros de registro de ${directory}, en orden de nombre, como una sola factura. Todas las cifras de abajo los cubren todos.`,
    noLogsInDirectory: (directory, extensions, folders) =>
      `No hay registros de uso en "${directory}". Se buscaron ficheros terminados en ${extensions}. Un directorio sin nada legible es un error, no un informe vacío, que se leería como "no has gastado nada".${folders ? ` Contiene carpetas, en las que este comando no entra: trazum bill "${directory}" lee todos los registros de uso y sesiones de agentes de código que hay dentro.` : ''}`,
    sessionCostTail: (ratio) =>
      `El percentil 95 es ${ratio}x la mediana ahí: casi todas las sesiones son baratas y unas pocas no, y esa es una cola que una cuota puede cazar. Cuando mediana y p95 quedan cerca, la carga es cara sin más y no hay cola que perseguir.`,
    sessionSpendOnly: (sessions, max) =>
      `${sessions} ${sessions === '1' ? 'sesión' : 'sesiones'} en este registro, subagentes incluidos; la más cara costó ${max}. Demasiado pocas por carga para un percentil: un máximo es un hecho con cualquier recuento, y es la cifra que juzga --max-session-usd.`,
    waiveActive: (gate, reason, until, daysLeft) =>
      `WAIVED: el fallo de ${gate} de arriba queda registrado y silenciado hasta ${until} (${daysLeft} días restantes): "${reason}". La factura lo sigue contando; solo el código de salida calla, y el día que caduque el waiver este gate vuelve a fallar.`,
    waiveExpired: (gate, until, reason) =>
      `El waiver de ${gate} caducó el ${until} y ya no silencia nada. Se escribió por: "${reason}". Renuévalo con fecha nueva y razón vigente, o arregla lo que cubría: un waiver caducado dejado ahí es un hallazgo borrado con pasos extra.`,
    waiveNotRecorded: (path, because) =>
      `  (Este waiver no se pudo escribir en ${path}: ${because}. El veredicto de la puerta de arriba no cambia.)`,
    summaryNoComparison: () =>
      'No se dio un registro anterior, así que nada de aquí dice si la factura se movió: un resumen sin comparación indica la factura, no su estabilidad.',
    summaryFooter: () =>
      'La forma corta: qué cambió y la mayor palanca, nada más. Corre trazum profile para el informe completo: todas las cifras de aquí salen de él.',
    gateLargest: (label, model, usd, share) =>
      `La mayor parte es ${label} en ${model}: ${usd}, el ${share} de la factura. Ahí está el dinero, no necesariamente el arreglo.`,
    gateLever: (label, action, saving, overage, covers) =>
      `La mayor palanca que el informe ha valorado ahorraría ${saving} en ${label} ${action}: ${covers ? `suficiente para cubrir los ${overage} de exceso` : `menos que los ${overage} de exceso, así que es parte de la respuesta y no toda`}. Si es la decisión correcta para esta carga lo juzgas tú; la cifra es aritmética, no consejo.`,
    gateLeverRoute: (model) => `moviéndola a ${model}`,
    gateLeverBatch: () => 'pasándola por la Batch API',
    gateLeverBoth: (model) => `moviéndola a ${model} y pasándola por la Batch API`,
    gateMarginTight: (margin, room) =>
      `Aprobado con el ${margin} del presupuesto libre: ${room}. Por debajo de una décima es lo bastante justo como para que una semana normal lo cruce; un aprobado así conviene saberlo antes de que sea un fallo.`,
    maxGrowthCoverageLost: (fields, was, now) =>
      `FALLÓ: este registro dejó de grabar ${fields} (${was} de los registros antes, ${now} ahora), así que la comparación no se puede hacer. Eso no es un aprobado: una factura cuyo crecimiento nadie pudo medir no es una factura que se mantuvo plana, y todo hallazgo que necesitaba ese campo se calló por un motivo que nada tiene que ver con el gasto.`,
    coverageField: (field) =>
      ({ label: 'etiqueta', session: 'sesión', ts: 'marca de tiempo', stopReason: 'razón de parada' })[field] ?? field,
    coverageSilenced: (field) =>
      ({
        label: 'Se callaron con él: el gasto por carga, el desglose y unas palancas que describan una decisión y no una mezcla.',
        session: 'Se callaron con él: el crecimiento de conversación, el coste por conversación, los turnos repetidos, los reintentos por truncado y el ajuste del TTL de caché.',
        ts: 'Se callaron con él: el periodo, la forma por día y por hora, la deriva de mezcla de modelos y la pregunta del TTL de caché por completo.',
        stopReason: 'Se callaron con él: las respuestas cortadas en max_tokens y los reintentos facturados después.',
      })[field] ?? '',
    coverageDrift: (field, was, now) =>
      `La cobertura se movió: ${field} estaba en el ${was} de los registros y ahora está en el ${now}.`,
    coverageDriftWhy: () =>
      'Un campo que el registro dejó de grabar no es un hallazgo arreglado: todo hallazgo que lo necesitaba se ha callado por un motivo que nada tiene que ver con la factura. Se informa a partir de 20 puntos de movimiento en cualquier dirección; un campo que aparece significa que este informe ve lo que el anterior no podía.',
    againstOverlap: (from, to) =>
      `Estos dos registros cubren ambos ${from} → ${to}, así que algunas de las mismas llamadas están a los dos lados de esta resta y parte del cambio es el mismo dinero contado dos veces. Compara periodos que no se solapen, o acota ambos registros con --since/--until.`,
    windowLine: (since, until) =>
      `Filtrado con --since ${since} --until ${until}. Todo lo de abajo describe esta ventana, no el registro completo; una fecha sola significa ese día UTC entero.`,
    windowUndated: (calls) =>
      `${count(calls)} ${calls === 1 ? 'llamada no lleva' : 'llamadas no llevan'} marca de tiempo y no se ${calls === 1 ? 'puede situar' : 'pueden situar'} dentro o fuera de esta ventana, así que ${calls === 1 ? 'quedó fuera' : 'quedaron fuera'}. Su gasto está en el registro y no en este informe: las cifras de la ventana son un suelo del periodo.`,
    windowRelative: () =>
      'Esa ventana es relativa al reloj de esta máquina, no al último registro del log: un registro exportado hace un mes responderá "los últimos 7 días" con nada.',
    windowRelativeEmpty: () =>
      'Una ventana relativa se mide desde el reloj de esta máquina: si este registro se exportó antes, pide las fechas que cubre.',
    windowNeedsClock: () =>
      'Ningún registro lleva marca de tiempo, así que --since/--until no tienen por qué filtrar. Una ventana temporal sobre un registro sin reloj no vigilaría nada, y eso no es una respuesta. Añade "ts" a los registros: la receta del README dice dónde.',
    windowMatchesNothing: (from, to) =>
      `Ningún registro cae dentro de esta ventana. El registro cubre ${from} → ${to}. Una ventana que no encuentra nada no debe volverse un informe de $0: bajo --max-usd pasaría una puerta de presupuesto sobre un periodo que el registro no cubre.`,
    gateNothingMeasured: (reason) =>
      `Hay una puerta de gasto armada y no había nada que juzgar: ${reason}. Una ausencia no es un aprobado, así que esto sale con 1 en vez de reportar $0 contra tu presupuesto. Arregla el registro, o pasa --allow-empty si un periodo sin llamadas es la respuesta esperada.`,
    nothingUnreadable: (lines) =>
      `las ${count(lines)} ${lines === 1 ? 'línea del fichero era ilegible' : 'líneas del fichero eran ilegibles'}`,
    nothingUnpriced: (calls) =>
      `se ${count(calls) && calls === 1 ? 'registró 1 llamada' : `registraron ${count(calls)} llamadas`} y ninguno de sus modelos está en la tabla de precios`,
    nothingEmpty: () => 'el registro no tiene ni un solo apunte',
    sinceAfterUntil: () =>
      '--since es igual o posterior a --until, así que la ventana no contiene tiempo alguno. Revisa las dos fechas.',
    badWhen: (flag, value) =>
      `--${flag} no pudo leer "${value}". Acepta un día UTC (2026-08-14), una marca ISO 8601 completa (2026-08-14T09:30:00Z), una ventana relativa (7d, 24h) o "now".`,
    singleTurnCeiling: (label, model, single, sessions, usd) =>
      `${label} en ${model}: ${single} de ${sessions} conversaciones terminaron tras su primer turno, y sus escrituras de caché (${usd}) pagaron una reutilización que su propia conversación nunca hizo. Otra conversación con el mismo prefijo dentro del TTL pudo haberlas leído; el registro no puede ver de quién era la escritura que una lectura encontró, así que esa cifra es un techo del desperdicio, no una factura.`,
    singleTurnConfirmed: (label, model, single, sessions, usd) =>
      `${label} en ${model}: ${single} de ${sessions} conversaciones terminaron tras su primer turno y gastaron ${usd} escribiendo una caché que nada en este registro leyó jamás. Dentro de la conversación, entre conversaciones: ninguna lectura en ningún sitio, así que esas escrituras no compraron nada. Cachear una llamada de un solo uso es puro sobreprecio de escritura; deja de marcar estas llamadas con cache_control.`,
  },

  plan: {
    noTarget: () =>
      'Apunta esto a un registro de uso o a un directorio de ellos: trazum plan usage.jsonl. Convierte el informe en un plan ordenado: qué hacer primero, cuánto vale cada acción y qué no puede confirmar el registro sobre ella.',
    nothingPriced: () =>
      'Este registro no tasó nada: ninguna llamada coincide con un modelo del catálogo. Un plan sobre cero dólares sería un consejo sobre nada; revisa el registro primero con "trazum profile".',
    heading: (actions, total) => `El plan: ${actions} acciones contra una factura de ${total}`,
    totals: (projected, staked) =>
      `${projected} de ahorro proyectado, sobre los supuestos listados abajo. ${staked} ya gastados en problemas que este plan nombra, medido, no proyectado.`,
    noClock: () =>
      'Este registro no tiene marcas de tiempo, así que cada cifra es por este registro, no por ningún período.',
    projected: (usd) => `${usd} proyectados`,
    staked: (usd) => `${usd} ya gastados`,
    action: (kind, label, model) => {
      const verb =
        kind === 'route'
          ? 'Enruta'
          : kind === 'batch'
            ? 'Agrupa en batch'
            : kind === 'route+batch'
              ? 'Enruta y agrupa'
              : kind === 'fix-truncation'
                ? 'Arregla los reintentos por truncado de'
                : kind === 'edit-file'
                  ? 'Edita el fichero de prompt de'
                  : 'Mira la caché de';
      return `${verb} ${label} (${model})`;
    },
    routeTo: (model, withBatch) =>
      withBatch ? `a ${model}, combinado con el batch donde aplican los dos, nunca sumado` : `a ${model}`,
    assume: (assumption) => {
      switch (assumption.kind) {
        case 'model-capability':
          return `supone que ${assumption.model} puede hacer este trabajo: el registro tasa el cambio, no puede juzgar las respuestas`;
        case 'batch-window':
          return 'supone que estas llamadas pueden esperar una ventana de batch';
        case 'retry-pattern-real':
          return 'supone que el patrón de reintentos es real: el registro ve formas, no contenido';
        case 'max-tokens-fits':
          return 'supone que un max_tokens en el que quepan las respuestas elimina el par';
        case 'traffic-pattern-holds':
          return 'supone que el patrón de tráfico se mantiene: una caché que perdió dinero en este registro puede rendir con otro tráfico';
        case 'file-is-what-label-sends':
          return `supone que ${assumption.path} es lo que envía esta carga: trazum.config.json lo dice, el registro guarda tokens, no ficheros`;
      }
    },
    check: (command) => `compruébalo: ${command}`,
    filtered: (count, minUsd, worth) =>
      `${count} acciones por debajo de ${minUsd}, que juntas valen ${worth}, quedaron fuera por --min-usd: fuera de este documento por completo, no refutadas.`,
    batchExcluded: (usd) =>
      `No se proyecta ahorro por batch sobre ${usd} de entrada y salida: esas llamadas ya pasaron por la Batch API, o algo esperaba su respuesta (marcadas como interactivas, como lo es cada turno de un agente de código).`,
    footer: () =>
      'Ordenado por dinero, proyectado o ya gastado por igual. Los supuestos los respondes tú: este plan es aritmética sobre el registro, no conocimiento de tu producto.',
    wrote: (path) =>
      `Plan escrito en ${path}, con fecha. Guárdalo: una predicción que nadie apuntó es una predicción que no se le puede exigir a nadie.`,
    editsNeedLabels: () =>
      '--edits lee el fichero de prompt que envía cada label, y trazum.config.json no asigna ninguno: añade "labels", por ejemplo {"labels": {"soporte": "prompts/soporte.txt"}}.',
    reorderNeedsEdits: () => '--reorder es un paso de una edición: añade --edits.',
    editMeasured: (usd, calls, inputPerCall) =>
      `se espera contra ${usd} en ${calls} llamadas a ${inputPerCall} tokens de entrada por llamada, medido`,
    editChange: (path, reordered, tokensBefore, tokensAfter) =>
      `${path}: ${reordered ? 'bloques estables movidos delante del primer marcador, y luego recortado' : 'recortado'} por las reglas safe, ${tokensBefore} → ${tokensAfter} tokens según el estimador, estimado, no medido; no se proyecta ningún ahorro`,
    editCheck: () =>
      'trazum verify lee el fichero, que debe tener el texto que este plan prometió, y el registro más nuevo, donde la entrada por llamada debe bajar de la cifra de arriba',
    editSkipped: (why, label, path) =>
      why === 'no-traffic'
        ? `Sin edición para ${label} (${path}): el registro no tiene ninguna llamada tasada con ese label, así que no hay cifra medida contra la que esperarla.`
        : why === 'unreadable'
          ? `Sin edición para ${label}: no se pudo leer ${path}.`
          : why === 'not-tracked'
            ? `Sin edición para ${label}: git no sigue ${path}, y una edición se propone al repositorio.`
            : why === 'source-file'
              ? `Sin edición para ${label}: ${path} es código fuente, y una edición reescribe el fichero entero.`
              : `Sin edición para ${label}: las reglas safe dejan ${path} como está.`,
  },

  serve: {
    listening: (where) => `Respondiendo en ${where}`,
    limitsNoLog: () =>
      'Hay una política de limits configurada y no se dio --log, así que cada techo responderá cannot-tell: el gasto por etiqueta y por sesión vive en un log de uso, no en el almacén. Apunta --log a tu log de uso para que los techos sean juzgables.',
    limitsUnpriced: (count) =>
      `${count} registro(s) del --log nombran un modelo que el catálogo no puede tasar. No aportan nada a ninguna cifra medida: dinero que la política de limits no puede ver, dicho aquí en vez de escondido.`,
    loopbackOnly: () =>
      'Solo loopback, y no hay flag para cambiarlo: esto guarda tu gasto, tu mezcla de modelos y tus presupuestos, y le respondería a quien preguntara. No hay autenticación por la misma razón: un token comprobado sobre loopback es teatro.',
    measuredFrom: (usd) =>
      `Las respuestas de presupuesto se miden contra ${usd} del almacén, leídos una vez al arrancar. Cada respuesta lleva el período que cubre esa cifra en vez de insinuar que está al segundo: reinicia para refrescarla.`,
    nothingMeasured: (dir) =>
      `Todavía no hay nada medido (el almacén de ${dir} está vacío), así que la mitad de presupuesto de cada respuesta lo dirá. La mitad del coste sigue respondiendo desde el catálogo: sin conexión es un modo, no un fallo.`,
    noBudget: () =>
      'No hay spend.monthlyUsd configurado, así que "queda presupuesto" no tiene sujeto y cada respuesta lo dice en vez de inventarse uno. spend.maxUsd no se lee aquí a propósito: ese controla el periodo que cubra un registro, y leerlo como límite mensual es justo como dos superficies de esta herramienta acaban en desacuerdo.',
    partialCoverage: (measuredDays, elapsedDays, period) =>
      `Solo ${measuredDays} de los ${elapsedDays} días transcurridos de ${period} tienen alguna medición, así que la cifra consumida es un suelo del periodo y no el periodo. Descarga los días que faltan con trazum connect antes de tratar lo que queda como margen.`,
    badPort: (value) => `"${value}" no es un puerto. Da un número entero de 0 a 65535, o usa --socket.`,
  },

  watch: {
    noThresholds: () =>
      'Vigilar necesita algo que vigilar. Define spend.maxUsd, spend.maxDayUsd o spend.maxCacheLossUsd en trazum.config.json: un vigilante sin umbral es una luz verde que nadie se ha ganado.',
    nothingToWatch: (dir) =>
      `Todavía no se ha medido nada: el almacén de ${dir} está vacío. Llénalo primero con "trazum connect <proveedor> --store": vigilar la nada reportaría que todo está bien.`,
    intervalTooTight: () =>
      '--interval tiene que ser de al menos 5m. Las APIs de uso están limitadas por tasa, y un bucle apretado es una forma de que una herramienta que existe para ahorrarte dinero acabe estrangulando tu propia clave.',
    badWebhook: (reason) =>
      reason === 'credentials-in-url'
        ? 'Esa URL de webhook lleva credenciales. Las URLs acaban en logs, historiales de shell y mensajes de error, así que se rechaza: pon el secreto en una cabecera que tu receptor compruebe, o en el propio receptor.'
        : reason === 'insecure-scheme'
          ? 'Un webhook tiene que ser https, salvo en loopback. Una alerta lleva tus cifras de gasto, y mandarlas en claro por una red es una fuga que no pediste.'
          : 'Ese webhook no es una URL que esta herramienta pueda parsear.',
    crossed: (gate, measured, limit, day) => {
      const what =
        gate === 'maxUsd'
          ? 'El gasto total'
          : gate === 'maxDayUsd'
            ? `El gasto del ${day}`
            : 'El dinero perdido con la caché';
      return `CRUZADO: ${what} es ${measured} contra un límite de ${limit}. Medido, no proyectado.`;
    },
    stillOver: (gate, measured, limit, day) => {
      const what =
        gate === 'maxUsd'
          ? 'El gasto total'
          : gate === 'maxDayUsd'
            ? `El gasto del ${day}`
            : 'El dinero perdido con la caché';
      return `SIGUE POR ENCIMA: ${what} es ${measured} contra un límite de ${limit}, y ya se avisó. Callado no es limpio.`;
    },
    notJudgeable: (gate, reason, covered) =>
      reason === 'window-too-short'
        ? `${gate} todavía no se puede juzgar: este período está medido al ${covered ?? 'parcialmente'}, y un umbral sobre parte de un día es un umbral sobre otra cosa. No es un aprobado: se juzgará cuando el día esté completo.`
        : `${gate} no se puede juzgar en esta fuente, que no sirve aquello sobre lo que está escrito el gate. No es un aprobado: un gate saltado en silencio se lee exactamente igual que un gate que lleva tiempo pasando.`,
    gap: (from, to) =>
      `Nada estuvo vigilando entre ${from} y ${to}. Lo que cruzara en ese tramo no se vio, y esta línea existe para que un vigilante reanudado no insinúe una cobertura que no tuvo.`,
    allWithin: (gates) => `Dentro de todos los umbrales: ${gates} gates evaluados contra gasto medido.`,
    webhookFailed: (status) =>
      `El webhook no se entregó (${status}). El cruce sigue en el código de salida y en la salida de arriba: que un receptor esté caído no puede ser el fallo más silencioso de la sala.`,
    watching: (minutes) => `Vigilando cada ${minutes} minutos. Ctrl-C lo para.`,
    readingSessions: (agent, dir) => `Vigilando las sesiones de ${agent} en ${dir}`,
    sessionsAndPayload: () =>
      '--sessions lee las sesiones de esta máquina y --payload lee el fichero que nombras. Una vuelta tiene una sola fuente: da una de las dos.',
    noSessionUsage: () =>
      'Las sesiones encontradas todavía no tienen un uso al que ponerle precio. Vigilar la nada reportaría que todo está bien, así que se rechaza en vez de aprobarse.',
    notifyUnavailable: (command) =>
      `--notify pidió una notificación de escritorio, y esta máquina no tiene ${command}, así que no se envió ninguna. El código de salida, la salida de arriba y --webhook siguen llevando el cruce.`,
    notifyFailed: (command, why) =>
      `${command} no quiso mostrar la notificación (${why}), normalmente porque nadie ha iniciado sesión en un escritorio. El cruce sigue en el código de salida y en la salida de arriba.`,
  },

  store: {
    appended: (count, dir) => `Guardadas ${count} mediciones en ${dir}.`,
    empty: (dir) =>
      `El almacén de ${dir} está vacío. Llénalo con "trazum connect <proveedor> --store": eso es un estado, no un error.`,
    heading: (records, usd, from, to) =>
      `El almacén: ${records} mediciones · ${usd} · ${from} → ${to}`,
    providerRow: (provider, records, span, models) =>
      `${provider}  ${records} mediciones · ${span} · ${models} modelos`,
    holds: (files) =>
      `Guardado en ${files} ficheros: recuentos de tokens, dólares facturados y los identificadores de workspace y clave de la propia cuenta. Nunca texto de prompt, nunca texto de respuesta, nunca una credencial: esto es un fichero que puedes respaldar sin una revisión de privacidad.`,
    possiblyDouble: (count) =>
      `${count} registros no se pudieron distinguir de otro: una ventana de longitud cero, o un registro que no nombra modelo. Se guardan enteros en vez de fundirse, así que un total construido sobre ellos puede contar el mismo gasto dos veces. Decirlo es mejor que un número más pequeño que nadie puede comprobar.`,
    unknownVersion: (count) =>
      `${count} registros vienen de un esquema más nuevo del que esta versión conoce, así que se conservan y quedan fuera de las cifras de arriba en vez de adivinarse. Actualiza para leerlos.`,
    unreadable: (file, line) =>
      `${file} línea ${line} no se pudo parsear, así que no está en las cifras de arriba. El resto del fichero sí se leyó: una línea rota no puede costar un mes.`,
    retention: (days) => `Retención: ${days} días, de "store.keepDays". Ejecuta "trazum store --prune" para aplicarla.`,
    noRetention: () =>
      'No hay política de retención configurada, así que nunca se borra nada por su cuenta. Pon "store": {"keepDays": 90} cuando quieras una.',
    pruneNeedsPolicy: () =>
      'Podar necesita una política de retención: pon "store": {"keepDays": 90} en trazum.config.json, o pasa --keep 90d para esta ejecución. Borrar mediciones con una política que nadie escribió no es un valor por defecto que debas recibir por accidente.',
    pruneDryRun: (count, days, span, usd) =>
      span === null
        ? `Nada es más antiguo que ${days} días, así que una poda no borraría nada.`
        : `Una poda borraría ${count} mediciones de más de ${days} días, que cubren ${span} y ${usd} de gasto medido. No se borró nada: esto era --dry-run.`,
    pruned: (count, days, span, usd, kept) =>
      span === null
        ? `Nada era más antiguo que ${days} días. ${kept} mediciones conservadas, y el log compactado.`
        : `Borradas ${count} mediciones de más de ${days} días, que cubren ${span} y ${usd} de gasto medido. ${kept} conservadas, y el log compactado a lo que el almacén ya resolvía.`,
    budgetHeading: (period) => `Presupuesto de ${period}`,
    budgetStanding: (consumed, limit, share, measuredDays, periodDays) =>
      `${consumed} de ${limit} (${share}), medido sobre ${measuredDays} de los ${periodDays} días del mes.`,
    budgetShape: (shape, elapsedPct, coverage) =>
      shape === 'ahead'
        ? `El dinero va más rápido que el calendario: ha transcurrido el ${elapsedPct}% del mes.`
        : shape === 'behind'
          ? `El dinero va más lento que el calendario: ha transcurrido el ${elapsedPct}% del mes.`
          : shape === 'on-pace'
            ? `Al ritmo del calendario: ha transcurrido el ${elapsedPct}% del mes.`
            : coverage === 'partial'
              ? 'Si eso es rápido o lento para el mes no se puede saber desde un suelo: los días sin medir gastaron algo, y solo un exceso sería incontestable.'
              : 'Todavía no hay nada con lo que comparar el gasto.',
    budgetNeverForecast: () =>
      'Eso es una forma, no un pronóstico. A dónde va esto después depende de lo que hagas después, y ninguna aritmética de aquí lo sabe.',
    budgetNothingMeasured: (elapsedDays) =>
      `No se ha medido nada este mes, en ${elapsedDays} ${elapsedDays === 1 ? 'día transcurrido' : 'días transcurridos'}. Eso no es un presupuesto bajo control, es un presupuesto que nadie está mirando. Ejecuta trazum connect para descargar lo que tenga el proveedor.`,
    budgetPartial: (measuredDays, elapsedDays, days) =>
      `Solo ${measuredDays} de ${elapsedDays} días transcurridos tienen alguna medición, así que la cifra de abajo es un suelo del mes y no el mes. Faltan: ${days}.`,
    budgetScopesUnmeasured: (count) =>
      `${count} ${count === 1 ? 'ámbito presupuestado' : 'ámbitos presupuestados'} (por etiqueta o por servicio) no se pueden responder desde el almacén: un registro del almacén lleva un proveedor y un modelo, no una etiqueta de flujo. Contrólalos con trazum profile contra un registro por llamada.`,
  },

  connect: {
    noTarget: (providers) =>
      `Nombra un proveedor del que leer tu factura: trazum connect anthropic. Disponibles: ${providers}. La credencial sale del entorno y nunca se guarda: añade --dry-run para ver exactamente qué se llamaría y de qué variable saldría.`,
    unknownProvider: (id, providers) =>
      `No hay conector para "${id}". Los que existen son: ${providers}.`,
    pricedNoConnector: (id, providers) =>
      `Trazum tarifa ${id} pero todavía no tiene conector para él: conecta con ${providers}. O ese proveedor no publica una API de uso, o nadie ha escrito el conector; ambos son huecos, no errores tuyos. Mientras tanto, exporta un registro y pásale "trazum profile": funciona todo salvo lo que solo una API de uso podría aportar.`,
    dryRun: (provider, from, to, envVars, keyKind) =>
      `Leería el uso de ${provider} del ${from} al ${to}, usando ${keyKind} tomada de ${envVars}. No se envió nada y no hizo falta ninguna credencial para imprimir esto.`,
    heading: (provider, from, to, usd, calls) =>
      calls === null
        ? `${provider} · ${from} → ${to} · ${usd}`
        : `${provider} · ${from} → ${to} · ${usd} · ${calls} llamadas`,
    modelRow: (model, usd, share, calls) =>
      calls === null ? `${model}  ${usd}  ${share}` : `${model}  ${usd}  ${share} · ${calls} llamadas`,
    nothingBilled: () =>
      'El proveedor no facturó nada en esta ventana. Eso es una medición, no un error: ensánchala con --since si esperabas tráfico.',
    cachePaid: (saved) => `La caché se pagó sola: ${saved} menos de lo que estos tokens habrían costado como entrada normal.`,
    cacheLost: (added) => `La caché añadió ${added} a esta factura frente a lo que los mismos tokens habrían costado como entrada normal.`,
    cacheUnsettled: () =>
      'Esta fuente no dijo con qué TTL se escribió la caché, así que se asumió la tarifa barata y el veredicto cambia con la otra. Sin resolver, no resuelto a tu favor.',
    noCallCount: (provider) =>
      `El informe de uso de ${provider} sirve sumas de tokens y ningún recuento de peticiones, así que aquí no hay número de llamadas ni media por llamada. Un cero se leería como "sin tráfico", así que no se imprime nada en su lugar.`,
    unpriced: (model, tokens) =>
      `${model} no está en el catálogo de precios, así que sus ${tokens} tokens se cuentan y su dinero no. Añádelo con --pricing en vez de leer el total como completo.`,
    gap: (detail) => `Esta ventana está incompleta: ${detail}.`,
    unavailable: (findings) =>
      `Hallazgos que esta fuente no puede sostener: ${findings}. Necesitan una fila por llamada, y una suma ha perdido las filas: un registro por llamada sí los responde.`,
    wrote: (path) => `Informe escrito en ${path}.`,
    footer: () =>
      'Cada cifra de aquí es el recuento de tokens que el proveedor facturó, a las tarifas del catálogo. No se estimó nada, y no se rellenó nada que el proveedor no sirviera.',
  },

  history: {
    noTarget: () =>
      'Apunta esto a un directorio de informes guardados: trazum history informes/. Lee los documentos --json que escribe "trazum profile" (y los planes guardados que haya al lado) y construye la serie que ninguna comparación por pares puede ver.',
    needsThree: (count) =>
      `Una serie necesita al menos tres informes con fecha, y este directorio tiene ${count}. Dos informes son una comparación, y "trazum profile --against" ya la hace mejor.`,
    heading: (periods, from, to) => `La larga distancia: ${periods} períodos, ${from} → ${to}`,
    periodRow: (name, usd, calls, days) =>
      calls === null ? `${name}  ${usd} · ${days} días` : `${name}  ${usd} · ${calls} llamadas · ${days} días`,
    runLabel: (label, periods, sinceName, from, to) =>
      `${label} lleva ${periods} períodos consecutivos subiendo desde ${sinceName}: ${from} → ${to}. Una forma, no un pronóstico.`,
    runModel: (model, periods, sinceName, from, to) =>
      `La cuota de ${model} en la factura lleva ${periods} períodos consecutivos subiendo desde ${sinceName}: ${from} → ${to}. Los totales pueden parecer planos mientras la mezcla se mueve debajo.`,
    runCache: (periods, sinceName, from, to) =>
      `La cuota de caché lleva ${periods} períodos consecutivos decayendo desde ${sinceName}: ${from} → ${to}, tan despacio que ningún informe suelto lo llamó hallazgo, que es exactamente para lo que existe una serie.`,
    repeated: (kind, label, model, appearances, first, last) => {
      const what =
        kind === 'route'
          ? `Enrutar ${label} (${model})`
          : kind === 'batch'
            ? `Agrupar en batch ${label} (${model})`
            : kind === 'route+batch'
              ? `Enrutar y agrupar ${label} (${model})`
              : kind === 'fix-truncation'
                ? `Arreglar los reintentos por truncado de ${label} (${model})`
                : kind === 'edit-file'
                  ? `Editar el fichero de prompt de ${label} (${model})`
                  : `Arreglar la caché de ${label} (${model})`;
      const span = first !== null && last !== null ? ` (${first} → ${last})` : '';
      return `${what} se ha planificado ${appearances} veces${span} y sigue en el plan más reciente: una decisión que nadie está revisando.`;
    },
    storeNoLabels: () =>
      'Esta serie viene del almacén, y una API de uso agrupa por modelo y workspace, no por carga de trabajo, así que aquí no hay serie por label en absoluto. Ausente, no vacía: nada de lo de arriba dice que una carga se moviera o dejara de moverse.',
    unmeasured: (days, from, to, after, before) =>
      `Nada cubre del ${from} al ${to}: ${plural(days, 'día')} entre ${after} y ${before}.`,
    unmeasuredTotal: (days) =>
      `${plural(days, 'día')} de este tramo no los cubre ningún informe. Una serie con un agujero y una serie más corta se leen igual; esto dice cuál es.`,
    overlap: (a, b, days) =>
      `${a} y ${b} cubren ambos ${plural(days, 'día')}. Nombrado, nunca fusionado: cuál es la mejor medición no se sabe desde aquí, y sumar los dos totales cuenta esos días dos veces.`,
    runHole: (days) => `, ${plural(days, 'día')} de esta racha no los cubre ningún informe`,
    undated: (name) => `${name} no lleva período, así que no está en ninguna línea de tiempo de arriba: nombrado, nunca absorbido en silencio.`,
    unrecognized: (name) => `${name} no es ni un informe guardado ni un plan guardado, así que no está en ninguna serie de arriba.`,
    footer: () =>
      'Una serie nombra formas, no futuros. Veinte puntos hacen visible una tendencia; no hacen conocible el mes que viene: adónde van estas líneas después lo juzgas tú.',
    waiverHeading: () => 'Con lo que este repositorio ha estado conviviendo',
    waiverSince: (day, uses) =>
      `${uses} ${uses === 1 ? 'uso registrado' : 'usos registrados'} desde el ${day}, cuando empezó el registro.`,
    waiverNoneRecorded: () =>
      'Ningún waiver ha silenciado una puerta desde que empezó el registro. Nada de aquí se deduce de la configuración: un waiver escrito y nunca usado no es una decisión con la que nadie conviva.',
    waiverHabit: (gate, uses, days, firstDay, lastDay) =>
      `${gate}: ${uses} ${uses === 1 ? 'uso' : 'usos'} en ${days} ${days === 1 ? 'día' : 'días'}, del ${firstDay} al ${lastDay}`,
    waiverVerdict: (verdict) =>
      verdict === 'used-once'
        ? 'Usado una vez. Todavía no hay nada que leer en ello.'
        : verdict === 'recurring'
          ? 'La misma decisión, sosteniéndose. La puerta sigue saltando y el motivo no ha cambiado.'
          : verdict === 'renewed-without-revisiting'
            ? 'La fecha de caducidad se ha movido y el motivo no. Esa es la forma que toma una decisión que nadie está revisando: a veces es exactamente lo correcto, y merece decirse en voz alta igualmente.'
            : 'El motivo cambió entre usos. Alguien volvió a mirarlo.',
    waiverReasonNow: (reason) => `Motivo: ${reason}`,
    waiverReasonsChanged: (count) => `${count} motivos distintos dados en ese tiempo.`,
    waiverExpiriesMoved: (from, to, count) =>
      `La caducidad se movió ${count} ${count === 1 ? 'vez' : 'veces'}: ${from} → ${to}.`,
    waiverNoLongerConfigured: () =>
      'Ya no está en la configuración. La decisión se revirtió; el registro la conserva.',
    waiverNeverUsed: (gates) =>
      `Con waiver en la configuración y nunca usados por una ejecución registrada: ${gates}. O la puerta dejó de fallar (buenas noticias que nadie anotó) o el waiver nombra una situación que no ocurre. Ambos merecen borrarse.`,
    waiverUnreadable: (count, path) =>
      `${count} ${count === 1 ? 'línea' : 'líneas'} de ${path} no se pudieron leer y no cuentan arriba.`,
    waiverStartsHere: () =>
      'Nada anterior a ese día existe. Este registro empezó cuando empezó a registrarse, y no se reconstruyó ningún pasado a partir de la configuración actual.',
  },

  verify: {
    noTarget: () =>
      'Apunta esto a un plan guardado y a un registro posterior: trazum verify plan.json --against usage.jsonl. Dice, por acción, si el cambio llegó, no llegó o no se puede saber, y nunca menos de esos tres.',
    needsAgainst: () =>
      '--against <nuevo.jsonl|dir> es obligatorio. Un plan solo puede verificarse contra un registro posterior; sin uno no hay nada a lo que someter la predicción.',
    badPlan: (path, why) =>
      `${path} no es un documento de plan que esta herramienta pueda verificar: ${why}. Se esperaba el JSON que escribe "trazum plan -o".`,
    planRefusal: (why) =>
      why.kind === 'not-json'
        ? 'no es JSON válido'
        : why.kind === 'not-an-object'
          ? 'el nivel superior no es un objeto JSON'
          : why.kind === 'wrong-schema-version'
            ? `schemaVersion es ${JSON.stringify(why.found)} en vez de 1`
            : why.kind === 'actions-not-a-list'
              ? 'no hay un array actions'
              : `la acción ${why.index + 1} está mal formada (${why.because})`,
    heading: (actions, planDate) =>
      planDate === null
        ? `¿Funcionó? ${actions} acciones de un plan sin fecha, contra este registro`
        : `¿Funcionó? ${actions} acciones del plan del ${planDate}, contra este registro`,
    counts: (arrived, notArrived, cannotTell) =>
      `${arrived} llegaron · ${notArrived} no llegaron · ${cannotTell} no se puede saber. Lo tercero no es una versión suave de lo segundo: significa que este registro no puede responder, y eso es un hallazgo en sí.`,
    pricesChanged: (planReviewed, nowReviewed) =>
      `Las tarifas se revisaron el ${planReviewed} cuando se hizo el plan y el ${nowReviewed} ahora, así que cada comparación en dólares aquí son dos listas de precios, no una medición: no se puede culpar a un equipo por un ahorro que la aritmética revocó.`,
    action: (kind, label, model, outcome) => {
      const what =
        kind === 'route'
          ? `Enrutar ${label} (${model})`
          : kind === 'batch'
            ? `Agrupar en batch ${label} (${model})`
            : kind === 'route+batch'
              ? `Enrutar y agrupar ${label} (${model})`
              : kind === 'fix-truncation'
                ? `Arreglar los reintentos por truncado de ${label} (${model})`
                : kind === 'edit-file'
                  ? `Editar el fichero de prompt de ${label} (${model})`
                  : `Arreglar la caché de ${label} (${model})`;
      const verdict =
        outcome === 'arrived' ? 'LLEGÓ' : outcome === 'not-arrived' ? 'NO LLEGÓ' : 'NO SE PUEDE SABER';
      return `${what}: ${verdict}`;
    },
    reason: (reason) =>
      reason === 'workload-vanished'
        ? 'el label no lleva tráfico tasado en este registro: una carga desaparecida no está arreglada, y tampoco rota'
        : reason === 'fields-stopped'
          ? 'los campos que la detección necesita no están en este registro: "no registrado" no puede leerse como "arreglado", así que con --gate esto suspende'
          : reason === 'file-not-read'
            ? 'el fichero no se pudo leer desde aquí, así que no se puede saber si se hizo la edición'
            : reason === 'file-changed'
              ? 'el fichero no tiene ni el texto del que partió el plan ni el que prometió: siguió cambiando, y con --gate esto suspende'
              : 'el registro guarda tokens, y los tokens no dicen con qué tarifa se facturaron: el Batch API no se puede ver desde aquí',
    routeObserved: (dearestModel, onTargetUsd, onOldUsd) =>
      `el modelo más caro del label ahora es ${dearestModel} · ${onTargetUsd} en el destino, ${onOldUsd} todavía en el modelo antiguo`,
    batchUnobservable: () =>
      'la mitad batch de esta acción no se puede ver en los recuentos de tokens; el veredicto de arriba es solo la mitad de la ruta',
    truncationObserved: (retryBillUsd) =>
      `este registro todavía muestra ${retryBillUsd} de desperdicio y reintentos por truncado`,
    cacheObserved: (deltaUsd, outcome) =>
      outcome === 'arrived'
        ? `la caché ahora se paga sola en esta porción (${deltaUsd} contra la factura sin caché)`
        : `la caché todavía añade ${deltaUsd} a la factura de esta porción`,
    editObserved: (before, after) =>
      `el fichero tiene el texto planeado; entrada por llamada ${before} → ${after} tokens, medido`,
    editNotMade: (path) => `${path} todavía tiene el texto del que partió el plan: la edición no se hizo`,
    attribution: (callsBefore, callsAfter, outBefore, outAfter) =>
      `el mundo también se movió: llamadas ${callsBefore} → ${callsAfter}, salida/llamada ${outBefore} → ${outAfter} tokens, dicho para que el veredicto no se lea como toda la historia`,
    gateFailed: (failures, total) =>
      `GATE SUSPENDIDO: ${failures} de ${total} acciones no produjeron lo que el plan prometió, o dejaron de poder medirse por el propio registro del equipo.`,
    gateOk: () => 'Gate superado: toda acción verificable llegó, y nada se volvió inverificable.',
    footer: () =>
      'Llegó y no-llegó son mediciones; no-se-puede-saber es el registro negándose a adivinar. Los tres son la verificación funcionando, no fallando.',
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
      `Esto hará ${count(calls)} llamadas al proveedor: dos por caso en ${model} para medir su propia varianza, una por caso en ${candidate}. Todavía no se ha gastado nada: añade --yes para ejecutarlo.`,
    dryRun: () => 'No se llamó a nada.',
    running: (cases) => `Ejecutando ${count(cases)} casos...`,
    agreement: (cross, self) =>
      `El modelo más barato coincide con el original el ${cross} de las veces. El original coincide consigo mismo el ${self}: esa es la vara de medir, no el 100%.`,
    holds: (usd) =>
      `AGUANTA: la diferencia está dentro del propio ruido del modelo original. En esta factura esa ruta vale ${usd}.`,
    diverges: (usd) =>
      `DIVERGE: el modelo más barato da respuestas materialmente distintas. Los ${usd} son reales y el cambio de comportamiento también; esto no es dinero gratis.`,
    inconclusive: () =>
      'NO CONCLUYENTE: el modelo original fue demasiado inconsistente consigo mismo en estos casos como para juzgar nada contra eso. Añade casos, o elige unos con menos margen para que el modelo divague.',
    unlabelledSlice: () =>
      'Estas llamadas no llevan label, así que Trazum no puede saber si son todas este prompt. Si no lo son, la cifra de arriba cubre llamadas que esta medición no tocó: añade "label" al registro y la porción pasa a ser una sola carga, que es lo que hace la cifra atribuible.',
    yours: () =>
      'Coincidir no es acertar. Esto mide si las respuestas se movieron, no si alguna vez fueron correctas: la decisión sigue siendo tuya.',
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

  write: {
    slots: {
      task: {
        question: '¿Qué debe hacer el modelo, en una frase?',
        unlocks: 'el prompt entero: sin esto no hay nada que escribir',
      },
      role: {
        question: '¿Quién es el modelo mientras lo hace?',
        unlocks: 'la postura de la respuesta; si falta, el modelo elige una por ti',
      },
      inputs: {
        question: '¿Qué cambia de una llamada a otra?',
        unlocks: 'la parte variable: sin ella el prompt fija un solo caso y hay que reescribirlo para el siguiente',
      },
      'output-shape': {
        question: '¿Qué debe volver: prosa, json, lista o tabla?',
        unlocks: 'el contrato de salida, y si un consumidor puede parsear la respuesta siquiera',
      },
      'output-schema': {
        question: '¿Qué campos o columnas, y cuáles están siempre?',
        unlocks: 'nombres de campo en los que un consumidor puede confiar en vez de inferirlos de una muestra',
      },
      'output-length': {
        question: '¿Cuánto debe ocupar la respuesta, como máximo?',
        unlocks: 'el techo que evita pagar por texto que nadie lee',
      },
      audience: {
        question: '¿Quién lee la salida?',
        unlocks: 'el registro: una respuesta para un ingeniero y otra para un cliente no son la misma respuesta',
      },
      constraints: {
        question: '¿Qué no debe hacer nunca?',
        unlocks: 'las prohibiciones, dichas una vez aquí en vez de descubiertas incidente a incidente',
      },
      refusal: {
        question: '¿Qué debe hacer cuando no pueda responder?',
        unlocks: 'una negativa que llega con su motivo en vez de una conjetura segura de sí misma',
      },
      examples: {
        question: '¿Hay algún ejemplo de respuesta buena?',
        unlocks: 'la guía few-shot, y la ocasión de comprobar que no se repite',
      },
      'example-inputs': {
        question: '¿Qué entrada produjo ese ejemplo?',
        unlocks: 'el emparejamiento: un ejemplo sin su entrada enseña la forma, no la correspondencia',
      },
      'failure-modes': {
        question: '¿Qué ha salido mal con esto antes?',
        unlocks: 'las correcciones que merecen decirse, que son justo las que un prompt genérico nunca tiene',
      },
      model: {
        question: '¿Para qué modelo es esto?',
        unlocks: 'la estimación de coste: esto cambia el informe, nunca el prompt',
      },
      budget: {
        question: '¿Cuál es el techo mensual de este prompt?',
        unlocks: 'la comprobación de presupuesto: esto cambia el informe, nunca el prompt',
      },
    },
    missing: (count) =>
      count === 1
        ? 'Falta una respuesta antes de poder escribir un prompt:'
        : `Faltan ${count} respuestas antes de poder escribir un prompt:`,
    done: () => 'No queda nada que merezca preguntarse.',
    answersNotAnObject: (path) =>
      `${path} debe contener un objeto JSON de ids de slot y respuestas.`,
    unknownSlot: (id, nearest) =>
      nearest === null
        ? `"${id}" no es un slot. Ejecuta "trazum write" sin --answers para que te los pregunte.`
        : `"${id}" no es un slot. ¿Querías decir "${nearest}"?`,
    answerNotText: (id) => `"${id}" debe ser una cadena, o null para declinarlo.`,
    tokens: (count) => `${count} tokens`,
    monthly: (usd) => `${usd} al mes, estimado: nadie ha enviado este prompt todavía`,
    budget: (verdict, limit) =>
      verdict === 'over' ? `por encima del presupuesto de ${limit}` : `dentro del presupuesto de ${limit}`,
    noVerdict: (reason) =>
      reason === 'no-budget'
        ? 'No hay presupuesto respondido, así que no hay contra qué comprobarlo.'
        : reason === 'no-model'
          ? 'No hay modelo respondido, así que no se puede tasar.'
          : 'Ese modelo no está en el catálogo de precios, así que no se puede tasar.',
    clean: () => 'trazum optimize no recupera nada de esto.',
    notClean: (rules, tokens) =>
      `trazum optimize aún recuperaría ${tokens} tokens aquí (${rules}): de tus respuestas, no de la estructura.`,
    declined: (ids) => `Declinados, y fuera: ${ids}`,
  },
};
