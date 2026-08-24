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
  trazum connect <provider> [opciones]
  trazum store [--prune] [opciones]
  trazum watch [--once | --interval 15m] [opciones]
  trazum serve [--port <n> | --socket <ruta>]
  trazum diff <antes> <después> [opciones]
  trazum diff --all <dir> <dir> [opciones]
  trazum rank <dir> [opciones]
  trazum doctor [dir] [opciones]
  trazum blame <fichero> [opciones]
  trazum prune <fichero> --cases <fichero> --yes
  trazum where [fichero]
  trazum conform <fichero|-> [--contract <nombre>]
  trazum rollup <documento...|dir> [--json] [--html-out <fichero>]
  trazum pulse [--max-stale-hours <n>]
  trazum bench [--workload <id>] [--record <fichero>] [--against <fichero> --max-ratio <n>] [--json]
  trazum write [--answers <fichero>] [--json] [-o <fichero>]
  trazum models
  trazum rules [--measure <dir>] [--level <safe|aggressive>]
  trazum gateway <provider> --on-cannot-tell <fail-open|fail-closed>
  trazum experiment <log> --a <label> --b <label> --min-outcomes <n>
  trazum quality <log> --label <name> --at <iso> [--gate]
  trazum semantic <prompt> [--yes]
  trazum commitment <log> --floor <usd> --discount <pct> [--months 12]
  trazum report <log> --year <yyyy>
  trazum owners <log>
  trazum ladder <log>
  trazum feedback
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
  cifra medida y te deja el límite a ti — una configuración generada llena de
  números adivinados no se la cree nadie.

${bold('OPCIONES DE conform')}
  --contract <nombre>         Comprueba contra un contrato concreto en vez de
                              detectarlo: ${d.contracts.join(', ')}.
  --json                      El informe como datos.

  Responde dos preguntas y las mantiene separadas. ¿Cumple este documento —
  campos obligatorios, presentes y del tipo correcto; sale con 1 si no. Y qué no
  puede responder un documento válido de esta forma, con el campo que lo
  desbloquearía.

  La segunda nunca hace fallar nada. Decidir no registrar sesiones es una
  decisión, no un defecto. Ver docs/format.md.

${bold('OPCIONES DE rollup')}
  --json                      El documento de agregación como datos. Ver
                              docs/format.md.

  Las facturas de varias personas, una sola agregación. Cada contribuyente
  ejecuta \`trazum profile --json\` donde ya está su tráfico; esto fusiona los
  documentos. Un formato y una fusión, no un servicio: no se sube nada y no hay
  cuenta — los documentos llegan como tu equipo ya mueve ficheros.

  Casi toda la salida es lo que la fusión no pudo hacer. Los huecos de cada
  contribuyente se quedan con ese contribuyente en vez de promediarse en una
  sola cifra, los hallazgos que necesitan llamadas individuales se nombran en
  vez de desaparecer, y toda agregación de más de un documento dice que el
  solapamiento entre contribuyentes no se puede medir: dos personas exportando
  el mismo tráfico duplican la factura y ninguna fusión de resúmenes lo ve.

  Sale con 1 cuando una contribución se entregó y no se pudo agregar.

${bold('OPCIONES DE write')}
  --answers <fichero>         Un objeto JSON de ids de slot y respuestas. Sin
                              esto, las preguntas se hacen una a una; una línea
                              vacía declina una, que también es una respuesta.
  --json                      El documento prompt-draft, negativas incluidas.
  -o, --out <fichero>         Dónde escribir el prompt. Por defecto stdout, con
                              todo lo demás en stderr.
  --calls <n>                 Llamadas al mes, para la estimación.
  --avg-output <n>            Tokens de salida por llamada, para la estimación.

${bold('OPCIONES DE rollup')}
  --html-out <fichero>        Escribe además el roll-up como un único HTML
                              autocontenido — el informe de equipo, para quien
                              paga la factura. Los huecos de cada contribuyente
                              se quedan bajo ese contribuyente, y lo que ninguna
                              fusión puede medir va en la caja de salvedades,
                              imposible de recortar.
  --json                      El documento de roll-up como datos.

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

  Nunca falla por una primera ejecución que nunca ocurrió — no hay cadencia
  contra la que ir tarde — ni por hasta dónde llegan las mediciones, que es un
  proveedor informando a su ritmo y no un trabajo que falló.

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
                              los flags del gate — el veredicto es el código de
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

${bold('OPCIONES DE feedback')}
  (ninguna)

  Imprime dónde reportar una optimización incorrecta, un fallo, una pregunta o
  un problema de seguridad — y una incidencia en blanco con la versión, el
  runtime y la plataforma ya puestos, mostrados enteros antes para que no viaje
  nada que no hayas leído.

  No envía nada. Trazum no tiene telemetría: ni ping, ni hook de instalación, ni
  contador anónimo, y una prueba hace fallar la compilación si este comando
  llega a tocar la red.

${bold('OPCIONES DE gateway')}
  --on-cannot-tell <política> Obligatorio, sin valor por defecto: fail-open o
                              fail-closed. Qué pasa cuando la pasarela no puede
                              juzgar una llamada — sin presupuesto, sin nada
                              medido, un modelo sin precio.
  --port <n> | --socket <p>   Dónde escuchar. Solo loopback, siempre.

  Se pone entre tu SDK y el proveedor, hablando su formato, así que no hay
  cambios de código. El consumo se mide desde la propia respuesta del proveedor
  según llega — sin exportación, sin retraso, sin días que falten.

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
  o no separables — con cuántos resultados por brazo lo zanjarían, para que
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
  través de la frontera — el prompt no es la única variable y lo dice.

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
  costó el suelo en los meses que se quedaron cortos — como cifra aparte,
  porque metida en el ahorro desaparece. Un cálculo sobre el pasado, nunca una
  previsión.

${bold('OPCIONES DE report')}
  --year <yyyy>               Obligatorio. Qué año montar.
  --json                      El registro como datos.

  Todo sale del almacén y de los planes que ya guardas — no se calcula nada
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
                              el cambio — más los desajustes en ambos sentidos
                              (prompts mapeados sin tráfico, tráfico sin
                              prompt mapeado).
  --from-log <usage.jsonl>    Mide las tres cifras de arriba desde un registro
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
  --max-session-usd <n>       Falla cuando una sola conversación del registro
                              costó más que esto — la unidad en la que revienta
                              un producto de agentes. Un registro sin sesiones
                              falla: no medido no es dentro de presupuesto.
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
  --html-out <fichero>        Escribe además el informe como un único HTML
                              autocontenido — el que se envía por correo a
                              quien paga la factura. Las mismas cifras que
                              --json, con las salvedades tan visibles como
                              los totales a los que acompañan.
  --csv-shape <forma>         Qué tabla escribe --csv-out: slice (por defecto),
                              day, hour o model-day (una fila por día y
                              modelo — dibuja la mezcla moviéndose). Una sola
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

  Acepta un fichero de registro o un directorio de ellos — los registros
  rotados por día se leen en orden de nombre como una sola factura, y se dice
  cuántos se leyeron. También lee los comprimidos (.jsonl.gz y los demás),
  porque es lo que es un registro rotado un día después; uno que no se pueda
  descomprimir es un error que nombra el fichero, nunca una factura a la que
  le falta un día en silencio.

  Lee lo que el proveedor cobró de verdad. Campos opcionales desbloquean
  hallazgos: "label" (qué carga), "session" (qué conversación — se agrupa y
  nunca se imprime), "stop_reason"/"finish_reason" (respuestas cortadas en
  max_tokens).

${bold('OPCIONES DE plan')}
  --min-usd <n>               Deja fuera las acciones que valen menos de n
                              dólares. Cuántas quedaron fuera se dice, nunca
                              en silencio.
  -o, --out <fichero>         Guarda el plan como JSON fechado — el fichero al
                              que "trazum verify" lo atará después.
  --markdown-out <fichero>    Escribe además el plan como Markdown, para un
                              resumen de CI o un comentario de pull request.
  --pricing <fichero>         Tarifas locales superpuestas, como en el resto.
  --json                      El plan como datos.

  Lee un registro de uso y convierte los hallazgos del informe en un plan
  ordenado: enruta esto, agrupa aquello, arregla el par de truncados, mira la
  caché. El dinero está compuesto correctamente — ruta y batch sobre la misma
  porción llegan combinados, nunca sumados — y cada acción nombra lo que el
  registro no puede confirmar, porque un plan que esconde sus supuestos es un
  consejo haciéndose pasar por aritmética. El ahorro proyectado y el dinero ya
  gastado son totales separados en todas partes.

${bold('OPCIONES DE serve')}
  --port <n>                  Puerto en 127.0.0.1. Por defecto: 7317.
  --socket <ruta>             Escucha en un socket Unix en vez de un puerto.

  Responde las dos preguntas que importan en el momento de la llamada — cuánto
  va a costar esto y si queda presupuesto — en milisegundos de un solo dígito,
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
  hay autenticación por la misma razón por la que no hay --host — un token
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
  --json                      La vuelta como datos: cruces, abstenciones, hueco.

  Evalúa los gates de gasto de tu configuración — maxUsd, maxDayUsd,
  maxCacheLossUsd — contra lo que se ha medido, y te lo dice la tarde en que
  pasa en vez de tres semanas después. Sale con 1 cuando algo cruzó, así que
  cron te lo manda y CI falla.

  Una alerta salta por un cruce medido y nunca por una proyección: "has
  gastado $412 de un presupuesto de $400" es un hecho y "vas a excederte" es un
  pronóstico, que esta herramienta no hace a ninguna escala de ventana. Un día
  que todavía se está midiendo se reporta como aún no juzgable en vez de
  aprobarse — pero un día que ya se pasó del presupuesto salta a cualquier
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
  de facturación — nunca texto de prompt, nunca texto de respuesta, nunca una
  credencial — así que es un fichero que un equipo puede respaldar sin una
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
                              descargar uno. Sin credencial y sin red — la misma
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
  disponibles, y los hallazgos por llamada — formas de entrada, reintentos por
  truncado, conversaciones, presión de contexto — se listan como no disponibles
  con lo que los desbloquearía. Un límite de tasa, un tope de páginas o un
  cursor caducado devuelven lo que llegó con el hueco nombrado, nunca un total
  que describe en silencio menos tráfico del que pediste.

${bold('OPCIONES DE history')}
  --store                     Construye la serie desde el almacén local en vez
                              de un directorio de informes guardados. Las
                              fuentes agregadas no llevan label, así que la
                              serie por label está ausente y se dice — las de
                              cuota de modelo y de caché son para lo que existe
                              una serie, y funcionan enteras.
  --markdown-out <fichero>    Escribe además la serie como Markdown, para un
                              resumen de CI o un comentario de pull request.
  --json                      La historia como datos.

  Toma un directorio de informes guardados — los documentos --json que
  profile ya escribe — más los planes guardados que haya al lado, y construye
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
                              registrarse — "no registrado" no puede leerse
                              como "arreglado". Una carga de trabajo
                              desaparecida no suspende nada.
  --markdown-out <fichero>    Escribe además los veredictos como Markdown, para
                              un resumen de CI o un comentario de pull request.
  --pricing <fichero>         Tarifas locales superpuestas, como en el resto.
  --json                      La verificación como datos.

  Somete un plan guardado al registro que vino después, con tres resultados y
  nunca dos: el cambio llegó, no llegó, o no se puede saber — porque la carga
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

    level, locale, disable, maxGrowth, extensions, ignore
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
    owners    { "patterns": { "payments": ["billing-*"] },
              "shared": { "search": { "payments": 0.6, "support": 0.4 } },
              "budgets": { "payments": 400 } } — de quién es el presupuesto de
              cada carga. El gasto sin propietario es su propia línea y NUNCA se
              reparte entre los demás; un reparto compartido debe sumar 1, y la
              regla viaja con el informe para que se discuta la regla
    ladders   { "support": { "tiers": ["claude-haiku-4-5", "claude-opus-5"],
              "escalateOn": ["escalated"] } } — modelo barato primero, escalar
              un fallo registrado a uno más caro. Los dos campos obligatorios.
              "trazum ladder <log>" imprime la tasa de escalado de equilibrio
              junto a la medida: un escalado paga dos veces, así que por encima
              de esa tasa la escalera cuesta más que no haberla construido
    outcomes  { "values": ["resolved", "escalated"], "success": ["resolved"] } —
              tu propio vocabulario para lo que pasó, y cuál de él cuenta como
              acierto. Los dos son obligatorios: qué palabras significan éxito
              es un juicio sobre tu producto y no sobre tu factura, y esta
              herramienta no tiene potestad para hacerlo. Usa [] si ninguna lo
              es. Un valor en un log que "values" no declare se nombra como
              sin declarar, nunca se cuenta como fallo
    waive     [{ "gate": "maxUsd", "reason": "migración de agosto", "until":
              "2026-09-15" }] — un fallo de gate sobre el que se ha decidido,
              registrado. Los tres campos son obligatorios: un waiver sin
              fecha de fin es un hallazgo borrado con pasos extra. Los fallos
              waived se siguen imprimiendo, y el día que caduca el gate
              vuelve a fallar

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
    inputTooLarge: (source, size, limit) =>
      `${source} tiene ${count(size)} caracteres, por encima del techo de ${count(limit)} para un prompt. Súbelo deliberadamente con --max-input <caracteres> si esta entrada de verdad lo es.`,
    badMaxInput: (raw) => `--max-input debe ser un número positivo de caracteres (recibido: "${raw}").`,
    fractionFlag: (name, raw) =>
      `--${name} es una fracción entre 0 y 1 (recibido: ${raw}). La configuración rechaza el mismo valor de la misma forma.`,
    badLevel: (received) => `--level debe ser "safe" o "aggressive" (recibido: "${received}").`,
    allLabelsNeedsLog: () =>
      '--all-labels ordena los prompts por tráfico medido, así que necesita --from-log <usage.jsonl>. Sin registro cada ahorro se multiplicaría por la misma suposición tecleada, lo que ordena los prompts por longitud y lo llama prioridad.',
    allLabelsNeedsMap: () =>
      '--all-labels lee el mapa "labels" de trazum.config.json — etiqueta a fichero de prompt — y esta config no tiene ninguno. Mapea al menos una carga a su prompt.',
    fromLogConflict: (flag) =>
      `--from-log mide la cifra que --${flag} teclea, y mezclar una medición con una suposición produce un número que no es ninguna de las dos. Pasa una u otra.`,
    fromLogNeedsLabel: (available) =>
      `--from-log necesita saber qué carga es este prompt: pasa --label, o mapea el fichero bajo "labels" en trazum.config.json. Etiquetas con tráfico en este registro: ${available}.`,
    fromLogAmbiguousLabel: (target, labels) =>
      `${target} está mapeado a más de una etiqueta en trazum.config.json (${labels}), así que --from-log no puede elegir una en silencio. Pasa --label.`,
    fromLogLabelEmpty: (label, available) =>
      `Ninguna llamada valorada de este registro lleva la etiqueta "${label}", así que no hay nada que medir — un perfil de cero llamadas valoraría este cambio como inútil en vez de como no medido. Etiquetas con tráfico: ${available}.`,
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
      }. Contarlo ahí sería rechazado arriba o devolvería un número de otro tokenizador, y esta herramienta no va a llamar exacto a eso. Quita --exact-tokens y quédate con la estimación —que es honesta sobre serlo— o cuenta con las herramientas de ${
        provider === null ? 'ese modelo' : provider
      }.`,
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
    allLabelsHeading: (count) => `Cada prompt mapeado contra su propio tráfico medido — ${count} ordenados por lo que vale el cambio`,
    allLabelsRow: (saving) => `${saving}/mes si se optimiza`,
    allLabelsRowPeriod: (saving) => `${saving} en el periodo medido si se optimiza`,
    allLabelsFooter: () =>
      'Ordenado por tráfico medido, no por longitud del prompt: un prompt grande en una carga muerta vale menos que uno pequeño en una ocupada. Cada cifra es el delta de tokens de este prompt al ritmo medido de su propia etiqueta.',
    allLabelsUnmapped: (label, usd) =>
      `${label} lleva ${usd} de gasto medido y ningún fichero de prompt está mapeado a ella — la carga que nadie puede optimizar porque nadie dijo dónde vive. Mapéala en "labels" de trazum.config.json.`,
    allLabelsDead: (label, path) =>
      `${label} está mapeada a ${path} y no tiene tráfico en este registro — una carga retirada, una etiqueta renombrada, o una errata que lleva sin hacer nada en silencio.`,
    allLabelsUnreadable: (label, path) =>
      `${label} está mapeada a ${path}, que no se pudo leer. El mapeo existe; el fichero no.`,
    usageLineMeasured: (calls, days, scaled, outputTokens, batch) =>
      `${calls} llamadas medidas en ${days} días — ${scaled}/mes a ese ritmo · ${outputTokens} tokens de salida por llamada, medidos${batch ? ' · Batch API' : ''}`,
    usageLineMeasuredPeriod: (calls, days, outputTokens, batch) =>
      `${calls} llamadas medidas${days === null ? ' (el registro no tiene reloj)' : ` en ${days} días`} · ${outputTokens} tokens de salida por llamada, medidos${batch ? ' · Batch API' : ''}`,
    measuredModelShare: (model, share, count) =>
      `Esta etiqueta corrió en ${count} modelos; las cifras usan ${model}, que llevó el ${share} de su gasto.`,
    measuredNoOutput: () =>
      'Ninguna llamada de este corte registró tokens de salida, así que la mitad de salida de cada cifra de abajo es $0 medido — no $0 supuesto.',
    perPeriodSaving: (saving, pct) => `ahorro de ${saving} en el periodo medido (${pct}%)`,
    periodNotScaled: (days) =>
      days === null
        ? 'Sin escalar a un mes: el registro no tiene reloj, así que no hay ritmo que escalar. Estas cifras cubren exactamente las llamadas medidas.'
        : `Sin escalar a un mes: ${days} días queda por debajo de la semana que un escalado necesita — menos de un ciclo semanal multiplica la parte del ciclo que pilló. Estas cifras cubren exactamente el periodo medido.`,
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

  init: {
    heading: () => 'Lo que hay aquí',
    host: (name) => `Ejecutándose dentro de ${name}.`,
    prompts: (count) =>
      `${count} ${count === 1 ? 'archivo de prompt encontrado' : 'archivos de prompt encontrados'}.`,
    noPrompts: () =>
      'No se encontraron prompts. El modo directorio lee .txt, .md, .prompt y .tmpl por defecto — define "extensions" si los tuyos se llaman de otra forma.',
    sourcesTruncated: (cap) =>
      `Se paró tras ${cap} archivos de código, así que un proveedor nombrado más abajo no se vio.`,
    usageFound: (kind, where) =>
      kind === 'connector-credential'
        ? `El consumo se puede descargar: hay una credencial en ${where}. Ejecuta trazum connect.`
        : kind === 'store'
          ? `Hay un almacén local de mediciones pasadas en ${where}.`
          : `Registro de consumo encontrado: ${where}.`,
    noUsage: () =>
      'No se encontró consumo. Apunta trazum a un registro (trazum profile <log.jsonl>) o descárgalo (trazum connect anthropic) — toda cifra en dinero de esta herramienta sale de uno.',
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
      `${file} nombra ${provider} y ningún modelo — el modelo por defecto del proveedor se leería como decisión tuya dentro de seis semanas`,
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
      `un presupuesto es una política, así que es tuyo — la cifra medida es $${usd} en ${days} días`,

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
      'trazum plan <tu registro> ordena todas las acciones, no solo esta. Si alguna cifra de aquí parece mal, trazum feedback dice dónde contarlo — no envía nada por su cuenta.',

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
      `${planned} acciones planeadas. ${arrived} llegaron, ${notArrived} no, y ${cannotTell} no se pudieron juzgar. Tres resultados, nunca dos \u2014 el tercero es el que un informe anual normal mete dentro del que favorece.`,
    projected: (usd) => `Los planes proyectaron ${usd} de ahorro.`,
    noArrivedFigure: () =>
      'A prop\u00f3sito no hay una cifra al lado de lo que lleg\u00f3. Una verificaci\u00f3n dice SI cada acci\u00f3n aterriz\u00f3; nunca ha llevado una cifra en d\u00f3lares por acci\u00f3n del ahorro. Montarla aqu\u00ed significar\u00eda decidir cu\u00e1l de varios n\u00fameros observados es "el ahorro" \u2014 un juicio que la verificaci\u00f3n se neg\u00f3 a hacer, y justo la aritm\u00e9tica de informe anual que este documento sustituye.',
    outcomes: (recorded, parsed, unrecordedUsd) =>
      `${recorded} de ${parsed} llamadas registraron un resultado; ${unrecordedUsd} del gasto del a\u00f1o no.`,
    noOutcomes: () =>
      'No se registr\u00f3 ning\u00fan resultado este a\u00f1o, as\u00ed que nada de esto dice qu\u00e9 compr\u00f3 el dinero. Eso no es una tasa de \u00e9xito de cero \u2014 un a\u00f1o sin instrumentar y un a\u00f1o que falla son frases distintas.',
    cannotSayHeading: () => 'Lo que este registro no puede decir',
    cannotSay: (kind) =>
      kind === 'months-missing'
        ? 'qu\u00e9 pas\u00f3 en los meses sin registro'
        : kind === 'nothing-was-planned'
          ? 'si se prometi\u00f3 algo, porque no se hizo ning\u00fan plan'
          : kind === 'nothing-was-verified'
            ? 'si se cumplieron las promesas, porque no se verific\u00f3 ning\u00fan plan'
            : kind === 'some-promises-unjudgeable'
              ? 'si algunas promesas se cumplieron \u2014 no se pudieron juzgar con los logs que existen'
              : kind === 'arrived-savings-not-quantified'
                ? 'cu\u00e1ntos d\u00f3lares val\u00edan las promesas cumplidas'
                : kind === 'no-outcomes-recorded'
                  ? 'qu\u00e9 compr\u00f3 nada de ese dinero'
                  : 'qu\u00e9 hizo la parte del tr\u00e1fico sin instrumentar',
    noNewData: () =>
      'Todas las cifras de arriba salen del almac\u00e9n y de los planes que ya guardas. Aqu\u00ed no se ha calculado nada que no se pueda comprobar contra un documento que ya existe \u2014 que es la \u00fanica raz\u00f3n por la que un informe anual merece confianza, siendo el documento con m\u00e1s probabilidad de acabar citado fuera de la sala donde se escribi\u00f3.',
  },

  commitment: {
    heading: (floor, discount, months) =>
      `Un compromiso de ${months} meses: ${floor} al mes con ${discount} de descuento`,
    needsTerms: () =>
      '--floor y --discount son obligatorios, y --months son 12 por defecto. S\u00e1calos del contrato que te ofrecen: el suelo es lo que te comprometes a gastar cada mes despu\u00e9s del descuento, y el descuento es lo que te quitan de tarifa.',
    asIf: () =>
      'Esto es lo que el acuerdo HABR\u00cdA hecho sobre el tr\u00e1fico que realmente tuviste. Es una medici\u00f3n del pasado, no una predicci\u00f3n \u2014 todos los meses de abajo ocurrieron.',
    columns: { month: 'mes', list: 'tarifa', paid: 'pagar\u00edas', saving: 'ahorro' },
    net: (usd, months) => `Neto sobre ${months} meses medidos: ${usd}.`,
    good: (usd) => `Los meses que superaron el suelo ahorraron ${usd}.`,
    lost: (usd, months) =>
      `${months} de ellos se quedaron cortos, y el suelo que habr\u00edas pagado por capacidad que nadie us\u00f3 suma ${usd}. Esa cifra se mantiene aparte a prop\u00f3sito: metida en la l\u00ednea de arriba desaparece, y esa desaparici\u00f3n es de lo que vive la diapositiva de un comercial.`,
    noShortfall: () => 'Ning\u00fan mes medido se habr\u00eda quedado por debajo del suelo.',
    breakEven: (usd) =>
      `El equilibrio est\u00e1 en ${usd} de gasto mensual. Por debajo pagas el suelo por menos uso del que compra; por encima el ahorro crece.`,
    spread: (low, high, median) =>
      `Dispersi\u00f3n medida: de ${low} a ${high}, mediana ${median}. Ese es el riesgo de quedarse corto en la \u00fanica forma en que un log puede expresarlo \u2014 un recuento de meses reales y el rango que cubrieron, no una probabilidad de una distribuci\u00f3n que nadie ajust\u00f3.`,
    shortTerm: (covered, term) =>
      `Esto replica ${covered} meses contra un compromiso de ${term} meses. Es una respuesta real sobre ${covered} meses y no sobre ${term}.`,
    cannotTell: (why, needed) =>
      why === 'no-history'
        ? 'Nada que replicar: este log no tiene meses completos.'
        : `No se puede juzgar con ${needed === '0' ? 'lo que hay' : `lo que hay \u2014 ${needed} mes(es) completo(s) m\u00e1s lo zanjar\u00edan`}. Un compromiso se firma por un a\u00f1o, y una respuesta de un mes es una decisi\u00f3n anual tomada con quince d\u00edas de evidencia.`,
    neverAForecast: () =>
      'Aqu\u00ed nada se anualiza, se extrapola ni se ajusta a una tendencia. Si el pr\u00f3ximo trimestre no se parece al anterior, esta aritm\u00e9tica no dice nada sobre \u00e9l \u2014 que es el l\u00edmite honesto de lo que un log puede contarte sobre un contrato.',
  },

  owners: {
    heading: () => 'De qui\u00e9n es el dinero',
    noOwners: () =>
      'No hay propietarios configurados. A\u00f1ade "owners" a trazum.config.json para atribuir gasto, por ejemplo {"patterns": {"payments": ["billing-*"]}, "budgets": {"payments": 400}}.',
    columns: { owner: 'propietario', spend: 'gasto', budget: 'presupuesto', calls: 'llamadas' },
    verdict: (kind) =>
      kind === 'over' ? 'pasado' : kind === 'within' ? 'dentro' : kind === 'not-measured' ? 'sin medir' : '\u2014',
    unallocated: (usd, share, labels) =>
      `Sin asignar: ${usd} (${share} de la factura), de ${labels}.`,
    neverSpread: () =>
      'No se reparte entre los propietarios de arriba, y nunca se har\u00e1. Repartir el gasto sin atribuir de forma proporcional es la mentira m\u00e1s com\u00fan en informes de coste: hace que todas las l\u00edneas cuadren y que el n\u00famero de cada equipo est\u00e9 mal en una cantidad que nadie puede ver \u2014 y castiga m\u00e1s a quien mejor instrumenta, porque su gasto conocido es el mayor y absorbe la mayor parte del misterio ajeno. Recl\u00e1malo con un patr\u00f3n.',
    nothingUnallocated: () => 'Todas las cargas de este log tienen propietario.',
    sharedHeading: () => 'Compartido, por una regla que escribi\u00f3 alguien',
    sharedRule: (label, rule) => `${label}: ${rule}`,
    problemsHeading: () => 'Esta configuraci\u00f3n de propiedad no va a hacer lo que parece',
    problem: (kind, detail) =>
      kind === 'split-does-not-sum'
        ? `${detail} \u2014 un reparto que no suma 1 pierde dinero o lo inventa, en silencio. Esa carga se deja entera en la l\u00ednea sin asignar hasta que se arregle.`
        : kind === 'split-names-unknown-owner'
          ? `${detail} nombra un propietario que "owners.patterns" no declara.`
          : kind === 'split-has-one-owner'
            ? `${detail} est\u00e1 "compartido" con un solo propietario \u2014 eso es un patr\u00f3n escrito largo, y leerlo como reparto invita a a\u00f1adir un segundo sin ajustar el primero.`
            : kind === 'negative-share'
              ? `${detail} tiene un reparto negativo.`
              : `${detail} tiene presupuesto pero no patrones, as\u00ed que nunca podr\u00e1 caerle nada.`,
    notMeasured: (owner) =>
      `${owner} tiene presupuesto y ninguna llamada medida. Eso NO es estar dentro del presupuesto \u2014 un equipo cuyos logs nunca llegaron pasa todos sus presupuestos, siempre, y un tic verde junto a su nombre dice lo contrario de la verdad.`,
  },

  semantic: {
    heading: (path) => `Pase sem\u00e1ntico sobre ${path}`,
    willCost: (usd, input, output, model) =>
      `Esto enviar\u00e1 el prompt a ${model}: unos ${input} tokens de entrada y ${output} de salida, aproximadamente ${usd}. Estimado, no medido \u2014 una herramienta que gasta tu dinero para decirte c\u00f3mo gastar menos deber\u00eda ser lo primero que audite su propia aritm\u00e9tica. Pasa --yes para ejecutarlo.`,
    needsYes: () => 'No se envi\u00f3 nada. A\u00f1ade --yes cuando hayas le\u00eddo el precio de arriba.',
    finding: (kind, because) =>
      `${kind === 'contradiction' ? 'Contradicci\u00f3n' : kind === 'restated-instruction' ? 'Repetido' : 'Lo mismo con otras palabras'}: ${because}`,
    span: (line, text) => `l\u00ednea ${line}: ${text}`,
    ceiling: (tokens) =>
      `Como mucho ${tokens} tokens \u2014 un techo, no un ahorro. Fundir los dos significa escribir un pasaje que haga el trabajo de ambos, y nadie sabe todav\u00eda cu\u00e1nto ocupa.`,
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
      'Este pase es opcional y siempre lo ser\u00e1. Trazum funciona sin clave, sin red y sin modelo \u2014 eso es cierto desde 0.1.0 y esto no lo cambia.',
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
      `La tasa de resoluci\u00f3n pas\u00f3 de ${from} a ${to} sobre ${outcomes} resultados medidos \u2014 arriba, de forma medible.`,
    cannotTell: (why, need) =>
      why === 'too-few-before'
        ? `No se puede decir: solo ${need} resultados antes del cambio, y esta puerta necesita 100 por lado. Falla builds, as\u00ed que el umbral no es el que usa una tasa en otros sitios.`
        : why === 'too-few-after'
          ? `A\u00fan no se puede decir: solo ${need} resultados desde el cambio, y esta puerta necesita 100 por lado. Vuelve a correrlo cuando el tr\u00e1fico se ponga al d\u00eda.`
          : why === 'not-separable'
            ? 'No se puede decir: la tasa no se movi\u00f3 de forma medible. Eso NO es lo mismo que "se mantuvo" \u2014 una puerta que las escribiera igual dejar\u00eda pasar una regresi\u00f3n real que simplemente no tuvo potencia para ver.'
            : why === 'no-vocabulary'
              ? 'No se puede decir: "outcomes.success" no declara nada, as\u00ed que no hay tasa de resoluci\u00f3n que comparar.'
              : 'No se puede decir: algo que no es el prompt se movi\u00f3 a trav\u00e9s de la frontera. Ver abajo.',
    confoundersHeading: () => 'El prompt no es lo \u00fanico que cambi\u00f3',
    confounder: (kind, detail) =>
      kind === 'model-mix-moved'
        ? `La mezcla de modelos se movi\u00f3 un ${detail}. La ca\u00edda puede ser enteramente la migraci\u00f3n de otra persona, y esta herramienta no puede separarlas.`
        : kind === 'volume-moved'
          ? `El volumen de llamadas se movi\u00f3 ${detail}. Una carga cuyo tr\u00e1fico se mueve tanto suele ser una carga cuya poblaci\u00f3n cambi\u00f3 \u2014 una superficie nueva, un cliente nuevo, una campa\u00f1a \u2014 y las preguntas que se hacen no son las de antes.`
          : `La cobertura de resultados pas\u00f3 de ${detail}. Las dos tasas describen poblaciones distintas: un equipo que empieza a instrumentar sus casos dif\u00edciles ve caer su tasa medida sin que nada haya empeorado.`,
    notRandomised: () =>
      'Esto es un antes y despu\u00e9s, no un experimento. Parte el tr\u00e1fico por tiempo y no al azar, as\u00ed que todo lo dem\u00e1s que cambi\u00f3 a la vez est\u00e1 tambi\u00e9n en la diferencia \u2014 por eso dice "no se puede decir" mucho m\u00e1s f\u00e1cilmente que un A/B.',
    cannotSee: () =>
      'No puede ver nada m\u00e1s que desplegaras ese d\u00eda. Un veredicto de "ca\u00edda" dice que la tasa baj\u00f3 y que las tres cosas que puede comprobar no se movieron. Es una afirmaci\u00f3n m\u00e1s peque\u00f1a que "lo hizo el prompt", y es la mayor que sostiene la evidencia.',
    gateFailed: () => 'Puerta fallada: una ca\u00edda medida sin nada m\u00e1s que la explique.',
    gateHeldOpen: () =>
      'Puerta ni pasada ni fallada. "No se puede decir" mantiene la afirmaci\u00f3n abierta en vez de salir en verde \u2014 la postura de verify desde 1.39.',
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
      `Gana ${name}. La diferencia est\u00e1 entre ${low} y ${high} con un 95% de confianza \u2014 el intervalo entero est\u00e1 a un lado del cero, que es lo que significa "gana" aqu\u00ed.`,
    notSeparable: (why, needed) =>
      why === 'no-difference-observed'
        ? 'No separables: los dos brazos registraron la misma tasa. Ning\u00fan tama\u00f1o de muestra separa una diferencia de cero, as\u00ed que no hay ning\u00fan "d\u00e9jalo correr m\u00e1s" que ofrecer \u2014 no hay nada que encontrar.'
        : why === 'nothing-recorded'
          ? 'No separables: un brazo no registr\u00f3 ning\u00fan resultado, as\u00ed que no hay tasa que comparar.'
          : `No separables con este tr\u00e1fico: el intervalo del 95% sobre la diferencia incluye el cero. Un n\u00famero es mayor, y eso no es un hallazgo. Unos ${needed} resultados por brazo zanjar\u00edan la diferencia observada hasta ahora.`,
    peeked: (short, declared, recorded) =>
      `Le\u00eddo antes de tiempo. La regla declarada eran ${declared} resultados por brazo y ${short} tiene ${recorded}. Nada puede impedir que se lea un n\u00famero antes de tiempo; esta l\u00ednea existe para que quien lea el resultado despu\u00e9s vea que se hizo.`,
    honoured: (declared) => `Regla de parada respetada: los dos brazos superaron ${declared} resultados registrados.`,
    marginalDearer: (better, usd) =>
      `${better} resuelve m\u00e1s y cuesta m\u00e1s. Un acierto extra cuesta ${usd} \u2014 esa cifra, y no la tasa, es de lo que depende la decisi\u00f3n.`,
    marginalCheaper: (better) => `${better} resuelve m\u00e1s Y cuesta menos por llamada. No se est\u00e1 cambiando nada por nada.`,
    neverPromotes: () =>
      'No se cambi\u00f3 nada. Un ganador es un hallazgo; tomarlo es una decisi\u00f3n con un nombre detr\u00e1s, y va en el plan como todo lo dem\u00e1s.',
  },

  ladder: {
    heading: () => 'Escaleras de escalado',
    noLadders: () =>
      'No hay escaleras configuradas. Una escalera manda una carga a un modelo barato primero y escala un fallo registrado a uno m\u00e1s caro — a\u00f1ade "ladders" a trazum.config.json, por ejemplo {"support": {"tiers": ["claude-haiku-4-5", "claude-opus-5"], "escalateOn": ["escalated"]}}.',
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
    problemsHeading: (label) => `${label} — esta escalera no va a hacer lo que parece`,
    problem: (kind, detail) =>
      kind === 'escalate-on-a-success'
        ? `escalateOn nombra "${detail}", que "outcomes.success" declara como \u00c9XITO. Esta escalera paga dos veces por trabajo que ya funcion\u00f3, en cada llamada, con el aspecto exacto de una medida de ahorro.`
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
      'Un escalado paga dos veces: el intento barato no se devuelve. As\u00ed que una escalera solo ahorra por debajo de su tasa de escalado de equilibrio, y por encima cuesta m\u00e1s que no haberla construido — por eso la tasa se imprime junto a la medici\u00f3n en vez de dejarla para calcularla de cabeza.',
    notExecuted: () =>
      'Trazum no ejecuta el escalado. Una escalera escala despu\u00e9s de conocer un fallo, que es despu\u00e9s de que llegue la respuesta y normalmente despu\u00e9s de que algo la juzgue, as\u00ed que el reintento va en tu propio bucle. Lo que hay aqu\u00ed es la pol\u00edtica y la aritm\u00e9tica que dice si merece la pena.',
  },

  gateway: {
    badProvider: (given, known) =>
      given === ''
        ? `Nombra el proveedor delante del que ponerse. Conocidos: ${known}.`
        : `"${given}" no es un proveedor por el que hable esta pasarela. Conocidos: ${known}.`,
    pricedNotFronted: (given, known) =>
      `Trazum tarifa ${given} pero esta pasarela todavía no se pone delante de él — cubre ${known}. Es un hueco real y está en la hoja de ruta, no una errata tuya. Mientras tanto: "trazum profile" tarifa un registro de ${given} que exportes, y su gate --max-usd tumba una build por la factura ya gastada. Lo que no tienes es un rechazo antes de gastar el dinero, que es justo el sentido de la pasarela y la razón de decir esto en vez de listar ${given} como desconocido.`,
    needsPolicy: (policies) =>
      `--on-cannot-tell es obligatorio, y no hay valor por defecto: ${policies}. Cuando la pasarela no puede juzgar una llamada — sin presupuesto, sin nada medido, un modelo sin precio — pasa una de las dos, y solo tú sabes qué fallo puede sobrevivir tu producto. fail-open lo mantiene funcionando y deja correr la factura; fail-closed para la factura y se lo lleva por delante. Elegir por ti sería tomar la decisión más consecuente de tu arquitectura, en silencio, al instalar.`,
    listening: (where, provider) => `Pasarela en ${where}, delante de ${provider}`,
    unmeasured: (cause, sofar) => {
      if (cause === 'stream-broke') {
        return `sin medir: el stream se rompió antes de su evento de uso — el proveedor facturó esta llamada y esta sesión no puede verla (${sofar} sin medir hasta ahora)`;
      }
      if (cause === 'no-usage-event') {
        return `sin medir: el stream no llevó evento de uso — en OpenAI eso es toda llamada en streaming sin stream_options.include_usage, así que el total de abajo se queda corto (${sofar} sin medir hasta ahora)`;
      }
      return `sin medir: el proveedor respondió sin uso alguno en el cuerpo — la llamada se hizo y su coste no es deducible de la respuesta, así que el total de abajo se queda corto (${sofar} sin medir hasta ahora)`;
    },
    pointYourSdk: (where) =>
      `Apunta la URL base de tu SDK a ${where} y no cambies nada más. Habla el formato del propio proveedor, así que no hay cambios de código ni cliente nuevo.`,
    credential: () =>
      'Tu credencial se reenvía intacta y nunca se lee, ni se guarda, ni se registra, ni se pone en una URL. Trazum no tiene ninguna clave aquí y no puede hacer una llamada propia a través de esto.',
    neverSubstitutes: () =>
      'Una llamada por encima del presupuesto se rechaza con HTTP 402 y las alternativas más baratas nombradas — nunca se cambia, recorta ni degrada en silencio. 402 y no 429 a propósito: todos los SDK de proveedor reintentan un 429, lo que convertiría un rechazo en una tormenta de reintentos.',
    standing: (consumed, limit) =>
      `Juzgando contra ${consumed} de ${limit}, medido, leído una vez al arrancar — leer un fichero en el camino de la petición pondría la latencia de esta herramienta entre tú y tu proveedor en cada llamada.`,
    noStanding: () =>
      'Nada medido para este periodo, así que ninguna llamada se juzga y decide la política de abajo. Configura spend.monthlyUsd y descarga con trazum connect.',
    policy: (policy) =>
      policy === 'fail-open'
        ? 'Cuando no puede juzgar: la llamada pasa, y el registro dice que no se juzgó, no que estaba dentro del presupuesto.'
        : 'Cuando no puede juzgar: la llamada se rechaza. Nada pasa sin medir.',
    measured: (model, label, input, output, substituted) =>
      `  ${model}${label === null ? '' : ` [${label}]`}: ${input} entrada, ${output} salida${substituted ? ' (sustituida — marcada, y nunca contada como la llamada que se pidió)' : ''}`,
  },

  feedback: {
    heading: () => 'Contarnos algo',
    sendsNothing: () =>
      'Este comando no envía nada, y nada más aquí lo hace tampoco. Trazum no tiene telemetría: ni ping, ni hook de instalación, ni contador anónimo. Una herramienta cuyo argumento entero es que lee tu factura sin subirla no puede a la vez estar informando sobre ti en silencio, y una prueba hace fallar la compilación si este comando llega a tocar la red.',
    whereHeading: () => 'Dónde',
    wrongOptimisation: () =>
      'Una regla cambió lo que pedía un prompt — el informe que más importa, y el fallo que este producto existe para evitar:',
    bug: () => 'Cualquier otra cosa que esté mal:',
    question: () => 'Una pregunta, o una idea de la que no estás seguro:',
    security: () => 'Un problema de seguridad — en privado, nunca en una incidencia pública:',
    environmentHeading: () => 'Lo que te va a preguntar quien mantiene esto',
    environmentOnly: () =>
      'Y eso es todo. Aquí no hay nada de tu trabajo — ni la configuración, ni un prompt, ni una etiqueta, ni una cifra. Eso es lo que necesita un buen informe y lo que solo tú puedes decidir compartir.',
    linkHeading: () => 'Una incidencia en blanco con lo de arriba ya puesto',
  },

  conform: {
    noTarget: () =>
      'Pasa un archivo para comprobar — un registro de consumo, o cualquier documento que emita Trazum. Usa "-" para leer de la entrada estándar.',
    badContract: (given, known) => `"${given}" no es un contrato. Contratos conocidos: ${known}.`,
    unrecognised: (path) => `${path} no encaja con ningún contrato que Trazum conozca.`,
    heading: (path, contract) => `${path} se lee como un documento ${contract}`,
    headingLog: (path, contract, records) =>
      `${path} se lee como ${contract}: ${records} ${records === 1 ? 'registro' : 'registros'}`,
    conforms: () => 'Cumple. Todos los campos obligatorios están y son del tipo correcto.',
    problem: (at, kind, detail) => `${at}: ${detail} (${kind})`,
    moreProblems: (count) => `…y ${count} más. Arregla estos primero; suelen ser el mismo error.`,
    unavailableHeading: () => 'Lo que esto no puede responder, y qué lo desbloquearía',
    unavailable: (finding, because, unlockedBy) => `${finding} — ${because}. Añade ${unlockedBy}.`,
    unavailableNeverGates: () =>
      'Nada de eso ha hecho fallar nada. Decidir no registrar un campo es una decisión, no un defecto, y una puerta que fallara por ello sería esta herramienta diciéndote qué registrar.',
  },

  rollup: {
    noTargets: () =>
      'Pasa los documentos de perfil que quieres agregar — cada uno escrito por `trazum profile --json` — o un directorio con ellos.',
    noSuchTarget: (path) =>
      `${path} no está. Una agregación nunca adivina una contribución que no pudo leer.`,
    emptyDirectory: (path) =>
      `${path} no contiene documentos .json. Una carpeta vacía agregada en silencio diría que el equipo no gastó nada.`,
    heading: (contributors, usd, calls) =>
      `Agregación de ${plural(contributors, 'contribuyente')} — ${usd} en ${plural(calls, 'llamada')}`,
    span: (from, to) => `Cubre del ${from} al ${to}, declarado y nunca extrapolado.`,
    noSpan: () => 'Ningún contribuyente traía reloj, así que esta agregación no cubre ningún período declarado.',
    contributorsHeading: () => 'Contribuyentes, y lo que cada uno no pudo ver',
    contributor: (name, usd, calls, spanDays) =>
      `${name} — ${usd}, ${plural(calls, 'llamada')}${spanDays === null ? ', sin reloj' : `, ${plural(spanDays, 'día')}`}`,
    claimedSpan: (from, to, contributors) =>
      `Pidió del ${from} al ${to} ${plural(contributors, 'contribuyente')} — una afirmación sobre lo que se fue a buscar, separada de lo que mostraron los registros.`,
    claimedRow: (from, to) => `pidió del ${from} al ${to}`,
    silentRuns: (runs) => runs,
    undated: (count) =>
      `${plural(count, 'registro')} que la propia ventana de este contribuyente no pudo situar, porque no traían reloj`,
    rejectedHeading: () => 'Entregado y no agregado',
    rejected: (name, because) => `${name} — ${because}`,
    via: (rollup) => `vía ${rollup}`,
    rejectedVia: (name, via, because) => `${name}, vía ${via} — ${because}`,
    repeated: (names) =>
      `Entregado más de una vez, por nombre: ${names}. Su dinero se cuenta cada vez. Que dos máquinas compartan nombre es posible, así que no se ha restado nada — comprueba si se entregaron a la vez una agregación y una de las máquinas que contiene.`,
    identical: (names) => `El mismo documento llegó más de una vez: ${names}.`,
    identicalUsd: (usd) =>
      `${usd} del total de arriba es la repetición. Se cuenta, no se descarta: si es una exportación entregada dos veces o dos máquinas que coincidieron exactamente es cosa tuya saberlo.`,
    byLabelHeading: () => 'La factura agregada, por carga de trabajo',
    labelRow: (label, usd, calls) => `${label} — ${usd}, ${plural(calls, 'llamada')}`,
    notMergedHeading: () => 'Hallazgos que no se agregan',
    notMerged: (finding, because) => `${finding} — ${because}.`,
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
          return 'Un contribuyente no declaró ninguna ventana, así que su tramo es todo lo que se sabe de él — y un registro cuya última línea es del día 5 puede ser una semana tranquila o un registro que dejó de escribirse el día 5.';
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
      `${name}: nunca aquí. No va tarde — no hay cadencia contra la que ir tarde.`,
    age: (name, when, hours) => `${name}: ${when}Z, hace ${plural(hours, 'hora')}`,
    noThreshold: () =>
      'No se juzgó nada. Pasa --max-stale-hours <n> para que algo que dejó de correr sea un código de salida en rojo; cuánto es demasiado es una política, y esta herramienta no escribe la tuya.',
    within: (hours) => `Todo lo que corre aquí corrió dentro de ${plural(hours, 'hora')}.`,
    stale: (hours) =>
      `Algo que corre aquí lleva más de ${plural(hours, 'hora')} sin correr. El silencio de un trabajo programado y el de un trabajo sin nada que decir son iguales; esto dice cuál es.`,
    notAService: () =>
      'Este comando no ejecuta nada y no aloja nada. Algo tiene que darse cuenta, y ese algo es tu CI: un paso que ejecute esto con el horario que ya tienes convierte un cron muerto en una build roja, sin que Trazum guarde las métricas de nadie. Hasta dónde llegan las mediciones se informa y nunca se juzga — eso es un proveedor informando a su ritmo, no un trabajo que falló.',
  },

  html: {
    caveatsHeading: () => 'Lo que este informe no puede decir',
    noClock: () => 'Ningún registro traía marca de tiempo, así que días, ritmos y deriva no están en este informe — un total sigue siendo un total.',
    noSessions: () => 'Ningún registro traía sesión, así que el crecimiento de conversación y los costes por conversación no están en este informe.',
    byLabelHeading: () => 'Por carga de trabajo',
    byModelHeading: () => 'Por modelo',
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

  bench: {
    heading: () => 'Esta máquina, medida',
    machine: (node, platform, cpuCount, cpuModel) =>
      `node ${node} en ${platform}, ${plural(cpuCount, 'CPU')}${cpuModel === null ? '' : ` (${cpuModel})`}`,
    colWorkload: () => 'carga',
    colWall: () => 'ms de pared',
    colRatio: () => 'ratio',
    colPeakRss: () => 'RSS pico',
    note: () =>
      'Una pasada cada una, esta máquina, hoy. El reloj de pared es para una persona leyendo dos tablas lado a lado; el ratio — carga entre un bucle de calibración en el mismo proceso — es el número que un gate puede sostener, porque la máquina se cancela en él. Graba uno con --record y sujeta una build con --against y un --max-ratio declarado.',
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
    measureHeading: (root, prompts, level) =>
      `Qué recupera cada regla en ${root} — ${plural(prompts, 'prompt')}, nivel ${level}`,
    measureTotals: (before, saved, floor) =>
      `${before} tokens antes. Las reglas recuperan ${saved}; la normalización recupera ${floor} haya reglas activas o no, y eso no es obra de las reglas.`,
    measureRow: (id, marginal, alone, prompts) =>
      `${id.padEnd(22)} se pierde si se quita ${marginal.padStart(6)}   sola ${alone.padStart(6)}   ${plural(prompts, 'prompt')}`,
    measureOverlap: (sumOfAlone, saved) =>
      `Las reglas recuperan ${sumOfAlone} entre todas de una en una y ${saved} juntas. La diferencia es el solapamiento — dos reglas encontrando los mismos tokens — y se declara en vez de resolverse en un total, porque una sola cifra aquí es el único número que no puede ser cierto.`,
    measureRedundant: (ids) =>
      `Cada token que encuentran estas lo encuentra algo más, aquí: ${ids}. Un solapamiento, no un defecto — y no una razón para borrar una sin decidir cuál conviene conservar.`,
    measureFiredWithoutSaving: (ids) =>
      `Estas cambiaron el prompt y no recuperaron ningún token: ${ids}. No es lo mismo que inerte — sí se ejercitaron, y están alterando la instrucción de alguien sin beneficio medido.`,
    measureInert: (ids) =>
      `Estas no cambiaron nada en este corpus: ${ids}. Es un hecho sobre estos ficheros, no sobre las reglas: una regla que no encuentra nada aquí no ha demostrado no encontrar nada en ninguna parte.`,
    measureBand: (source) =>
      source === 'heuristic'
        ? 'Contado con el estimador incorporado, así que toda cifra de arriba lleva su banda documentada. Una regla cuyo rendimiento son unos pocos tokens está dentro del ruido.'
        : 'Contado con un tokenizador externo.',
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
    repeatsHeading: () => 'La misma petición, otra vez',
    repeatsFound: (label, model, repeats, checked, seconds, usd) =>
      `${label} en ${model}: ${repeats} de ${checked} llamadas reenviaron el tamaño de entrada exacto de la llamada anterior en menos de ${seconds} segundos, en la misma conversación, costando ${usd}.`,
    pressureHeading: () => 'Acercándose a la ventana de contexto',
    pressureLine: (label, model, tokens, window, share) =>
      `${label} en ${model}: la llamada más grande llevó ${tokens} tokens de entrada contra una ventana de ${window} — el ${share} del techo.`,
    mixDriftHeading: () => 'La mezcla se movió dentro de este registro',
    mixDriftLine: (model, firstShare, lastShare, firstDays, lastDays, lastUsd) =>
      `${model} pasó del ${firstShare} del gasto en los primeros ${firstDays} días al ${lastShare} en los últimos ${lastDays} — ${lastUsd} de la mitad reciente.`,
    truncationRetryLine: (label, model, retried, truncated, seconds, wasted, retry) =>
      `${label} en ${model}: ${retried} de ${truncated} respuestas cortadas tuvieron otra llamada en la misma conversación en menos de ${seconds} segundos — ${wasted} gastados en los intentos cortados, más ${retry} en las llamadas siguientes.`,
    truncationRetryNote: () =>
      'La pareja tiene la forma de un reintento; el registro no ve el contenido, así que si cada una lo fue es cosa tuya. Los dos lados son dinero real, y el arreglo es el mismo en ambos casos: un max_tokens en el que las respuestas quepan de verdad.',
    mixDriftNote: () =>
      'Una factura puede crecer sin que crezca ninguna carga: tráfico migrando entre modelos, un deploy que cambió un valor por defecto, un fallback convertido en camino principal. Se muestra a partir de quince puntos de movimiento. Hacia dónde va la mezcla después no está en este registro, así que aquí no se dice.',
    pressureAdvice: () =>
      'Al 100% la llamada falla sin más, y nada en la factura cambia hasta ese día. Las palancas son un tope al contexto recuperado, truncar el historial de conversación o un modelo con ventana mayor. Cuándo se cruza no se predice aquí: la proporción es un hecho; la trayectoria es tuya.',
    repeatsAdvice: () =>
      'La entrada de una conversación crece en cada turno, así que el mismo tamaño dos veces seguidas con segundos de diferencia suele ser un reintento tras un timeout, un paso de agente que se repite o un bucle — esto lee recuentos y no puede ver el contenido, así que nombra el patrón y para. Sea lo que sea, ese dinero no compró nada que la llamada anterior no hubiera pagado ya.',
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
    maxSessionOk: (worst, max, sessions) =>
      `Ninguna conversación por encima del presupuesto: la más cara de ${sessions} costó ${worst}, contra --max-session-usd ${max}. Una conversación que empezó antes de este registro solo cuenta los turnos grabados aquí, así que esto es un suelo.`,
    maxSessionFailed: (worst, max, sessions) =>
      `FALLO — la más cara de ${sessions} conversaciones costó ${worst}, por encima del límite --max-session-usd de ${max}. El presupuesto del mes y el del día aprueban mientras una conversación en bucle se come esto; la cifra por conversación es la que lo caza.`,
    maxSessionNoSessions: () =>
      'FALLO — se pidió --max-session-usd y ningún registro lleva sesión, así que no hay conversaciones que juzgar. Eso no es un aprobado. Añade "session" (o "conversation_id") al registro y la puerta se arma; Trazum agrupa por ella y nunca la imprime.',
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
      `--csv-shape no conoce "${value}". Acepta "slice" (una fila por etiqueta y modelo, el valor por defecto), "day", "hour" o "model-day" (una fila por día y modelo — el formato largo que quiere una tabla dinámica).`,
    whatIfHeading: (model) => `Estas mismas llamadas en ${model}`,
    whatIfAssumption: () =>
      'Esto es una multiplicación, no un consejo: los mismos recuentos de tokens con otra tarifa. No dice nada sobre si ese modelo podría hacer el trabajo, y un modelo que responda más largo o al que haya que reintentar no enviaría estos recuentos.',
    whatIfTotal: (current, target, delta) =>
      `${current} de gasto movible habrían sido ${target} — una diferencia de ${delta}.`,
    whatIfCheaper: () =>
      'Compruébalo antes de mover nada: trazum route mide un prompt contra ambos modelos con tus propios ejemplos.',
    whatIfDearer: () => 'Esa dirección cuesta más. La aritmética está aquí para que el número no sea una suposición.',
    whatIfBatchOnTarget: (batched, moved) =>
      `Si esas llamadas además pueden esperar, la Batch API del destino deja la factura trasladada de ${moved} en ${batched} — el descuento aplica a las tarifas del destino, no a las que dejas. Si pueden esperar no está en el registro; esa mitad de la decisión es tuya.`,
    whatIfCacheBeyond: (largest, min, noCache) =>
      `Su tráfico de caché no podría existir allí: la llamada más grande tiene ${largest} tokens frente al mínimo de caché de ${min} tokens del destino, así que ninguna llamada de este slice podría crear una entrada. Sin la caché los mismos tokens cuestan ${noCache} — esa es la cifra que el destino facturaría de verdad, y la fila de arriba favorece el traslado.`,
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
    badGzip: (file, detail) =>
      `${file} está comprimido con gzip y no se ha podido descomprimir: ${detail}. Leer el resto y no decir nada daría una factura a la que le falta lo que hubiera en ese fichero, así que se para aquí. Revisa el fichero, o sácalo del directorio.`,
    dryRunHeading: () => 'Qué puede responder este registro — no se ha producido factura',
    dryRunParsed: (parsed, skipped) =>
      `${parsed} registros se leen; ${skipped} líneas no se pudieron leer. Un dry run no valora nada: el punto es sobre qué se apoyarían los gates que vas a cablear.`,
    dryRunUnpriced: (models) =>
      `Modelos que la tabla de precios no conoce: ${models}. Sus tokens se leen; sus dólares necesitan un overlay --pricing.`,
    dryRunTotals: () => 'La factura en sí: totales, desglose por modelo, economía de caché, las palancas.',
    dryRunLabels: (share) =>
      `Hallazgos por carga y presupuestos por etiqueta — "label" en el ${share} de los registros.`,
    dryRunClock: (share) =>
      `El periodo, la forma por día y por hora, --max-day-usd, --since/--until — marca de tiempo en el ${share} de los registros.`,
    dryRunSessions: (share) =>
      `Crecimiento de conversación, coste por conversación, --max-session-usd — sesión en el ${share} de los registros. Se agrupa por ella, nunca se imprime.`,
    dryRunStopReason: (share) =>
      `Respuestas truncadas y su factura de reintentos — razón de parada en el ${share} de los registros.`,
    dryRunCacheTtl: (ttl, writes) =>
      `Veredictos de caché resueltos — el desglose "cache_creation" en ${ttl} de ${writes} registros que escriben caché.`,
    dryRunNoCacheTraffic: () =>
      'Veredictos de caché: nada escribió en la caché en este registro, así que no hay nada que resolver — no es un campo ausente.',
    dryRunFooter: () =>
      'Una ✗ no es un defecto del registro; es un hallazgo que este registro aún no puede sostener. La receta de registro del README lleva todos los campos de arriba.',
    dryRunNoGates: () =>
      '--dry-run no produce factura, así que un gate a su lado saldría en verde sin haber juzgado nada. Corre los gates sin --dry-run.',
    bySourceNeedsConfig: () =>
      '--by-source lee el bloque "sources" de trazum.config.json — un nombre por servicio, cada uno con patrones glob sobre rutas de registros — y esta config no tiene ninguno. Nombra al menos una fuente.',
    bySourceNothingMatched: (sources) =>
      'Ningún fichero de registro coincidió con ningún patrón de fuente. Las fuentes configuradas: ${sources}. Los patrones casan con las rutas tal como se dan en la línea de comandos.'.replace('${sources}', sources),
    fleetHeading: (count, total, calls) => `La flota: ${count} fuentes · ${total} · ${calls}`,
    fleetRow: (name, usd, share, calls, span) => `${name}  ${usd}  ${share} de la flota · ${calls} · ${span}`,
    fleetSpan: (days) => `${days} días`,
    fleetNoClock: () => 'sin reloj',
    fleetWorst: (name, usd, share) =>
      `${name} es donde está el dinero: ${usd}, el ${share} del total de la flota.`,
    fleetMismatchedSpans: () =>
      'Estas fuentes cubren periodos distintos, así que los porcentajes de arriba comparan totales, no ritmos — un registro de 3 días parece barato junto a uno de 30 por motivos que nada tienen que ver con el coste. Cada fila indica su propio periodo.',
    fleetSplitBrain: (label, detail) =>
      `La misma carga corre en modelos distintos en fuentes distintas — ${label}: ${detail}. Mismo trabajo, tarifas distintas; si es una decisión o un accidente no está en los registros.`,
    fleetCacheUnderwater: (name, usd) =>
      `La caché es rentable para la flota en conjunto pero pierde ${usd} en ${name} — el veredicto agregado lo escondía.`,
    fleetUnmatched: (file) =>
      `${file} no coincidió con ningún patrón de fuente, así que no está en ningún informe de arriba — gasto ausente de todas las facturas hasta que un patrón lo cubra.`,
    fleetFooter: () =>
      'Resúmenes por fuente; el informe completo de un servicio es "trazum profile <sus registros>". Mismos umbrales, mismos hallazgos, una fuente cada vez.',
    fleetBudgetOk: (name, usd, max) => `Dentro de presupuesto: ${name} gastó ${usd} contra su ${max} en spend.bySource.`,
    fleetBudgetFailed: (name, usd, max) =>
      `FALLÓ — ${name} gastó ${usd} contra su presupuesto de ${max} en spend.bySource. El total de la flota puede estar bien mientras un servicio sangra; este gate nombra cuál.`,
    fleetBudgetMissing: (name) =>
      `${name} tiene presupuesto en spend.bySource y ningún registro coincidió con él en esta ejecución, así que no se midió nada. No es un aprobado: un servicio que no apareció no es un servicio dentro de presupuesto.`,
    coverageHeading: () => 'Lo que este registro todavía no puede responder',
    needsLabel: (seen) =>
      `"label" en ${seen} registros: sin él todas las cargas son una sola fila, así que no hay gasto por carga, ni zoom, y las palancas describen una mezcla en vez de una decisión.`,
    needsOutcome: (seen) =>
      `un "outcome" \u2014 ${seen}. El \u00fanico campo que cambia lo que significa cualquier otra cifra de aqu\u00ed: sin \u00e9l esta herramienta puede decir que una carga baj\u00f3 un 40% y no puede decir si dej\u00f3 de funcionar. Registra tu propia palabra para lo que pas\u00f3 y declara el vocabulario en "outcomes".`,
    dryRunOutcomes: (share) =>
      `coste por resultado y una tasa de \u00e9xito (${share} de los registros llevan "outcome")`,
    outcomeHeading: () => 'Resultados',
    outcomeRate: (rate, ofUsd) =>
      `${rate} de ${ofUsd} en resultados declarados tuvo \u00e9xito \u2014 por gasto y no por llamada, porque las dos cifras divergen justo cuando la mitad cara es la que falla.`,
    outcomeNoRate: (why) =>
      why === 'nothing-recorded'
        ? 'Sin tasa de \u00e9xito: nada en este log registr\u00f3 un resultado. Eso no es una tasa de cero \u2014 una tasa de cero es una medici\u00f3n real y p\u00e9sima, y esto es que nadie nos lo ha dicho.'
        : 'Sin tasa de \u00e9xito: "outcomes.success" no declara ning\u00fan valor, as\u00ed que aqu\u00ed nada cuenta como \u00e9xito. Es leg\u00edtimo declararlo as\u00ed, y significa que la tasa no le corresponde calcularla a esta herramienta.',
    outcomeUnrecorded: (share, usd) =>
      `${share} de la factura (${usd}) no llev\u00f3 resultado, y no est\u00e1 en ninguna de las dos mitades de la tasa de arriba.`,
    outcomeUndeclared: (values) =>
      `No declarados en "outcomes.values": ${values}. Nombrados en vez de contados como fallos \u2014 una errata en un exportador debe parecer una errata, no una regresi\u00f3n del producto.`,
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
      'Por acierto divide el gasto de las llamadas que registraron un resultado, nunca la factura entera \u2014 dividirlo todo cargar\u00eda tu tr\u00e1fico sin instrumentar a tus aciertos medidos y dar\u00eda una cifra alta por exactamente la parte no cubierta, en silencio, en la direcci\u00f3n que mata una funci\u00f3n que s\u00ed funciona. "cubierto" es qu\u00e9 parte del gasto de cada carga cubre la cifra.',
    perOutcomeDisagreement: (key, callRank, outcomeRank) =>
      `${key} es el #${callRank} por coste por llamada y el #${outcomeRank} por coste por acierto.`,
    perOutcomeBothOrders: () =>
      'M\u00e1s barato por llamada y m\u00e1s barato por acierto son \u00f3rdenes distintos, y se imprimen los dos en vez de elegir uno. Una carga puede subir en uno mientras baja en el otro, y quien optimice por el primer n\u00famero estar\u00eda moviendo el equivocado.',
    outcomeColumns: { outcome: 'resultado', calls: 'llamadas', spend: 'gasto' },
    verdictSuccess: () => '\u00e9xito',
    verdictOther: () => '\u2014',
    verdictUndeclared: () => 'sin declarar',
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
    sessionSpendOnly: (sessions, max) =>
      `${sessions} ${sessions === '1' ? 'conversación' : 'conversaciones'} en este registro; la más cara costó ${max}. Demasiado pocas por carga para un percentil — un máximo es un hecho con cualquier recuento, y es la cifra que juzga --max-session-usd.`,
    waiveActive: (gate, reason, until, daysLeft) =>
      `WAIVED — el fallo de ${gate} de arriba queda registrado y silenciado hasta ${until} (${daysLeft} días restantes): "${reason}". La factura lo sigue contando; solo el código de salida calla, y el día que caduque el waiver este gate vuelve a fallar.`,
    waiveExpired: (gate, until, reason) =>
      `El waiver de ${gate} caducó el ${until} y ya no silencia nada. Se escribió por: "${reason}". Renuévalo con fecha nueva y razón vigente, o arregla lo que cubría — un waiver caducado dejado ahí es un hallazgo borrado con pasos extra.`,
    waiveNotRecorded: (path, because) =>
      `  (Este waiver no se pudo escribir en ${path}: ${because}. El veredicto de la puerta de arriba no cambia.)`,
    summaryNoComparison: () =>
      'No se dio un registro anterior, así que nada de aquí dice si la factura se movió — un resumen sin comparación indica la factura, no su estabilidad.',
    summaryFooter: () =>
      'La forma corta: qué cambió y la mayor palanca, nada más. Corre trazum profile para el informe completo — todas las cifras de aquí salen de él.',
    gateLargest: (label, model, usd, share) =>
      `La mayor parte es ${label} en ${model}: ${usd}, el ${share} de la factura. Ahí está el dinero, no necesariamente el arreglo.`,
    gateLever: (label, action, saving, overage, covers) =>
      `La mayor palanca que el informe ha valorado ahorraría ${saving} en ${label} ${action} — ${covers ? `suficiente para cubrir los ${overage} de exceso` : `menos que los ${overage} de exceso, así que es parte de la respuesta y no toda`}. Si es la decisión correcta para esta carga lo juzgas tú; la cifra es aritmética, no consejo.`,
    gateLeverRoute: (model) => `moviéndola a ${model}`,
    gateLeverBatch: () => 'pasándola por la Batch API',
    gateLeverBoth: (model) => `moviéndola a ${model} y pasándola por la Batch API`,
    gateMarginTight: (margin, room) =>
      `Aprobado con el ${margin} del presupuesto libre — ${room}. Por debajo de una décima es lo bastante justo como para que una semana normal lo cruce; un aprobado así conviene saberlo antes de que sea un fallo.`,
    maxGrowthCoverageLost: (fields, was, now) =>
      `FALLÓ — este registro dejó de grabar ${fields} (${was} de los registros antes, ${now} ahora), así que la comparación no se puede hacer. Eso no es un aprobado: una factura cuyo crecimiento nadie pudo medir no es una factura que se mantuvo plana, y todo hallazgo que necesitaba ese campo se calló por un motivo que nada tiene que ver con el gasto.`,
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
      'Un campo que el registro dejó de grabar no es un hallazgo arreglado — todo hallazgo que lo necesitaba se ha callado por un motivo que nada tiene que ver con la factura. Se informa a partir de 20 puntos de movimiento en cualquier dirección; un campo que aparece significa que este informe ve lo que el anterior no podía.',
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

  plan: {
    noTarget: () =>
      'Apunta esto a un registro de uso o a un directorio de ellos: trazum plan usage.jsonl. Convierte el informe en un plan ordenado — qué hacer primero, cuánto vale cada acción y qué no puede confirmar el registro sobre ella.',
    nothingPriced: () =>
      'Este registro no tasó nada — ninguna llamada coincide con un modelo del catálogo. Un plan sobre cero dólares sería un consejo sobre nada; revisa el registro primero con "trazum profile".',
    heading: (actions, total) => `El plan: ${actions} acciones contra una factura de ${total}`,
    totals: (projected, staked) =>
      `${projected} de ahorro proyectado, sobre los supuestos listados abajo. ${staked} ya gastados en problemas que este plan nombra — medido, no proyectado.`,
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
                : 'Mira la caché de';
      return `${verb} ${label} (${model})`;
    },
    routeTo: (model) => `a ${model} — combinado con el batch donde aplican los dos, nunca sumado`,
    assume: (assumption) => {
      switch (assumption.kind) {
        case 'model-capability':
          return `supone que ${assumption.model} puede hacer este trabajo — el registro tasa el cambio, no puede juzgar las respuestas`;
        case 'batch-window':
          return 'supone que estas llamadas pueden esperar una ventana de batch';
        case 'retry-pattern-real':
          return 'supone que el patrón de reintentos es real — el registro ve formas, no contenido';
        case 'max-tokens-fits':
          return 'supone que un max_tokens en el que quepan las respuestas elimina el par';
        case 'traffic-pattern-holds':
          return 'supone que el patrón de tráfico se mantiene — una caché que perdió dinero en este registro puede rendir con otro tráfico';
      }
    },
    check: (command) => `compruébalo: ${command}`,
    filtered: (count, minUsd, worth) =>
      `${count} acciones por debajo de ${minUsd}, que juntas valen ${worth}, quedaron fuera por --min-usd — fuera de este documento por completo, no refutadas.`,
    footer: () =>
      'Ordenado por dinero, proyectado o ya gastado por igual. Los supuestos los respondes tú: este plan es aritmética sobre el registro, no conocimiento de tu producto.',
    wrote: (path) =>
      `Plan escrito en ${path}, con fecha. Guárdalo: una predicción que nadie apuntó es una predicción que no se le puede exigir a nadie.`,
  },

  serve: {
    listening: (where) => `Respondiendo en ${where}`,
    loopbackOnly: () =>
      'Solo loopback, y no hay flag para cambiarlo: esto guarda tu gasto, tu mezcla de modelos y tus presupuestos, y le respondería a quien preguntara. No hay autenticación por la misma razón — un token comprobado sobre loopback es teatro.',
    measuredFrom: (usd) =>
      `Las respuestas de presupuesto se miden contra ${usd} del almacén, leídos una vez al arrancar. Cada respuesta lleva el período que cubre esa cifra en vez de insinuar que está al segundo — reinicia para refrescarla.`,
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
      'Vigilar necesita algo que vigilar. Define spend.maxUsd, spend.maxDayUsd o spend.maxCacheLossUsd en trazum.config.json — un vigilante sin umbral es una luz verde que nadie se ha ganado.',
    nothingToWatch: (dir) =>
      `Todavía no se ha medido nada: el almacén de ${dir} está vacío. Llénalo primero con "trazum connect <proveedor> --store" — vigilar la nada reportaría que todo está bien.`,
    intervalTooTight: () =>
      '--interval tiene que ser de al menos 5m. Las APIs de uso están limitadas por tasa, y un bucle apretado es una forma de que una herramienta que existe para ahorrarte dinero acabe estrangulando tu propia clave.',
    badWebhook: (reason) =>
      reason === 'credentials-in-url'
        ? 'Esa URL de webhook lleva credenciales. Las URLs acaban en logs, historiales de shell y mensajes de error, así que se rechaza — pon el secreto en una cabecera que tu receptor compruebe, o en el propio receptor.'
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
      return `CRUZADO — ${what} es ${measured} contra un límite de ${limit}. Medido, no proyectado.`;
    },
    stillOver: (gate, measured, limit, day) => {
      const what =
        gate === 'maxUsd'
          ? 'El gasto total'
          : gate === 'maxDayUsd'
            ? `El gasto del ${day}`
            : 'El dinero perdido con la caché';
      return `SIGUE POR ENCIMA — ${what} es ${measured} contra un límite de ${limit}, y ya se avisó. Callado no es limpio.`;
    },
    notJudgeable: (gate, reason, covered) =>
      reason === 'window-too-short'
        ? `${gate} todavía no se puede juzgar: este período está medido al ${covered ?? 'parcialmente'}, y un umbral sobre parte de un día es un umbral sobre otra cosa. No es un aprobado — se juzgará cuando el día esté completo.`
        : `${gate} no se puede juzgar en esta fuente, que no sirve aquello sobre lo que está escrito el gate. No es un aprobado: un gate saltado en silencio se lee exactamente igual que un gate que lleva tiempo pasando.`,
    gap: (from, to) =>
      `Nada estuvo vigilando entre ${from} y ${to}. Lo que cruzara en ese tramo no se vio, y esta línea existe para que un vigilante reanudado no insinúe una cobertura que no tuvo.`,
    allWithin: (gates) => `Dentro de todos los umbrales: ${gates} gates evaluados contra gasto medido.`,
    webhookFailed: (status) =>
      `El webhook no se entregó (${status}). El cruce sigue en el código de salida y en la salida de arriba — que un receptor esté caído no puede ser el fallo más silencioso de la sala.`,
    watching: (minutes) => `Vigilando cada ${minutes} minutos. Ctrl-C lo para.`,
  },

  store: {
    appended: (count, dir) => `Guardadas ${count} mediciones en ${dir}.`,
    empty: (dir) =>
      `El almacén de ${dir} está vacío. Llénalo con "trazum connect <proveedor> --store" — eso es un estado, no un error.`,
    heading: (records, usd, from, to) =>
      `El almacén: ${records} mediciones · ${usd} · ${from} → ${to}`,
    providerRow: (provider, records, span, models) =>
      `${provider}  ${records} mediciones · ${span} · ${models} modelos`,
    holds: (files) =>
      `Guardado en ${files} ficheros: recuentos de tokens, dólares facturados y los identificadores de workspace y clave de la propia cuenta. Nunca texto de prompt, nunca texto de respuesta, nunca una credencial — esto es un fichero que puedes respaldar sin una revisión de privacidad.`,
    possiblyDouble: (count) =>
      `${count} registros no se pudieron distinguir de otro — una ventana de longitud cero, o un registro que no nombra modelo. Se guardan enteros en vez de fundirse, así que un total construido sobre ellos puede contar el mismo gasto dos veces. Decirlo es mejor que un número más pequeño que nadie puede comprobar.`,
    unknownVersion: (count) =>
      `${count} registros vienen de un esquema más nuevo del que esta versión conoce, así que se conservan y quedan fuera de las cifras de arriba en vez de adivinarse. Actualiza para leerlos.`,
    unreadable: (file, line) =>
      `${file} línea ${line} no se pudo parsear, así que no está en las cifras de arriba. El resto del fichero sí se leyó — una línea rota no puede costar un mes.`,
    retention: (days) => `Retención: ${days} días, de "store.keepDays". Ejecuta "trazum store --prune" para aplicarla.`,
    noRetention: () =>
      'No hay política de retención configurada, así que nunca se borra nada por su cuenta. Pon "store": {"keepDays": 90} cuando quieras una.',
    pruneNeedsPolicy: () =>
      'Podar necesita una política de retención: pon "store": {"keepDays": 90} en trazum.config.json, o pasa --keep 90d para esta ejecución. Borrar mediciones con una política que nadie escribió no es un valor por defecto que debas recibir por accidente.',
    pruneDryRun: (count, days, span, usd) =>
      span === null
        ? `Nada es más antiguo que ${days} días, así que una poda no borraría nada.`
        : `Una poda borraría ${count} mediciones de más de ${days} días, que cubren ${span} y ${usd} de gasto medido. No se borró nada — esto era --dry-run.`,
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
      `No se ha medido nada este mes, en ${elapsedDays} ${elapsedDays === 1 ? 'día transcurrido' : 'días transcurridos'}. Eso no es un presupuesto bajo control — es un presupuesto que nadie está mirando. Ejecuta trazum connect para descargar lo que tenga el proveedor.`,
    budgetPartial: (measuredDays, elapsedDays, days) =>
      `Solo ${measuredDays} de ${elapsedDays} días transcurridos tienen alguna medición, así que la cifra de abajo es un suelo del mes y no el mes. Faltan: ${days}.`,
    budgetScopesUnmeasured: (count) =>
      `${count} ${count === 1 ? 'ámbito presupuestado' : 'ámbitos presupuestados'} (por etiqueta o por servicio) no se pueden responder desde el almacén: un registro del almacén lleva un proveedor y un modelo, no una etiqueta de flujo. Contrólalos con trazum profile contra un registro por llamada.`,
  },

  connect: {
    noTarget: (providers) =>
      `Nombra un proveedor del que leer tu factura: trazum connect anthropic. Disponibles: ${providers}. La credencial sale del entorno y nunca se guarda — añade --dry-run para ver exactamente qué se llamaría y de qué variable saldría.`,
    unknownProvider: (id, providers) =>
      `No hay conector para "${id}". Los que existen son: ${providers}.`,
    pricedNoConnector: (id, providers) =>
      `Trazum tarifa ${id} pero todavía no tiene conector para él — conecta con ${providers}. O ese proveedor no publica una API de uso, o nadie ha escrito el conector; ambos son huecos, no errores tuyos. Mientras tanto, exporta un registro y pásale "trazum profile": funciona todo salvo lo que solo una API de uso podría aportar.`,
    dryRun: (provider, from, to, envVars, keyKind) =>
      `Leería el uso de ${provider} del ${from} al ${to}, usando ${keyKind} tomada de ${envVars}. No se envió nada y no hizo falta ninguna credencial para imprimir esto.`,
    heading: (provider, from, to, usd, calls) =>
      calls === null
        ? `${provider} · ${from} → ${to} · ${usd}`
        : `${provider} · ${from} → ${to} · ${usd} · ${calls} llamadas`,
    modelRow: (model, usd, share, calls) =>
      calls === null ? `${model}  ${usd}  ${share}` : `${model}  ${usd}  ${share} · ${calls} llamadas`,
    nothingBilled: () =>
      'El proveedor no facturó nada en esta ventana. Eso es una medición, no un error — ensánchala con --since si esperabas tráfico.',
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
      `Hallazgos que esta fuente no puede sostener: ${findings}. Necesitan una fila por llamada, y una suma ha perdido las filas — un registro por llamada sí los responde.`,
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
      `La cuota de caché lleva ${periods} períodos consecutivos decayendo desde ${sinceName}: ${from} → ${to} — tan despacio que ningún informe suelto lo llamó hallazgo, que es exactamente para lo que existe una serie.`,
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
                : `Arreglar la caché de ${label} (${model})`;
      const span = first !== null && last !== null ? ` (${first} → ${last})` : '';
      return `${what} se ha planificado ${appearances} veces${span} y sigue en el plan más reciente — una decisión que nadie está revisando.`;
    },
    storeNoLabels: () =>
      'Esta serie viene del almacén, y una API de uso agrupa por modelo y workspace, no por carga de trabajo — así que aquí no hay serie por label en absoluto. Ausente, no vacía: nada de lo de arriba dice que una carga se moviera o dejara de moverse.',
    unmeasured: (days, from, to, after, before) =>
      `Nada cubre del ${from} al ${to} — ${plural(days, 'día')} entre ${after} y ${before}.`,
    unmeasuredTotal: (days) =>
      `${plural(days, 'día')} de este tramo no los cubre ningún informe. Una serie con un agujero y una serie más corta se leen igual; esto dice cuál es.`,
    overlap: (a, b, days) =>
      `${a} y ${b} cubren ambos ${plural(days, 'día')}. Nombrado, nunca fusionado — cuál es la mejor medición no se sabe desde aquí, y sumar los dos totales cuenta esos días dos veces.`,
    runHole: (days) => ` — ${plural(days, 'día')} de esta racha no los cubre ningún informe`,
    undated: (name) => `${name} no lleva período, así que no está en ninguna línea de tiempo de arriba — nombrado, nunca absorbido en silencio.`,
    unrecognized: (name) => `${name} no es ni un informe guardado ni un plan guardado, así que no está en ninguna serie de arriba.`,
    footer: () =>
      'Una serie nombra formas, no futuros. Veinte puntos hacen visible una tendencia; no hacen conocible el mes que viene — adónde van estas líneas después lo juzgas tú.',
    waiverHeading: () => 'Con lo que este repositorio ha estado conviviendo',
    waiverSince: (day, uses) =>
      `${uses} ${uses === 1 ? 'uso registrado' : 'usos registrados'} desde el ${day}, cuando empezó el registro.`,
    waiverNoneRecorded: () =>
      'Ningún waiver ha silenciado una puerta desde que empezó el registro. Nada de aquí se deduce de la configuración — un waiver escrito y nunca usado no es una decisión con la que nadie conviva.',
    waiverHabit: (gate, uses, days, firstDay, lastDay) =>
      `${gate}: ${uses} ${uses === 1 ? 'uso' : 'usos'} en ${days} ${days === 1 ? 'día' : 'días'}, del ${firstDay} al ${lastDay}`,
    waiverVerdict: (verdict) =>
      verdict === 'used-once'
        ? 'Usado una vez. Todavía no hay nada que leer en ello.'
        : verdict === 'recurring'
          ? 'La misma decisión, sosteniéndose. La puerta sigue saltando y el motivo no ha cambiado.'
          : verdict === 'renewed-without-revisiting'
            ? 'La fecha de caducidad se ha movido y el motivo no. Esa es la forma que toma una decisión que nadie está revisando — a veces es exactamente lo correcto, y merece decirse en voz alta igualmente.'
            : 'El motivo cambió entre usos. Alguien volvió a mirarlo.',
    waiverReasonNow: (reason) => `Motivo: ${reason}`,
    waiverReasonsChanged: (count) => `${count} motivos distintos dados en ese tiempo.`,
    waiverExpiriesMoved: (from, to, count) =>
      `La caducidad se movió ${count} ${count === 1 ? 'vez' : 'veces'}: ${from} → ${to}.`,
    waiverNoLongerConfigured: () =>
      'Ya no está en la configuración. La decisión se revirtió; el registro la conserva.',
    waiverNeverUsed: (gates) =>
      `Con waiver en la configuración y nunca usados por una ejecución registrada: ${gates}. O la puerta dejó de fallar — buenas noticias que nadie anotó — o el waiver nombra una situación que no ocurre. Ambos merecen borrarse.`,
    waiverUnreadable: (count, path) =>
      `${count} ${count === 1 ? 'línea' : 'líneas'} de ${path} no se pudieron leer y no cuentan arriba.`,
    waiverStartsHere: () =>
      'Nada anterior a ese día existe. Este registro empezó cuando empezó a registrarse, y no se reconstruyó ningún pasado a partir de la configuración actual.',
  },

  verify: {
    noTarget: () =>
      'Apunta esto a un plan guardado y a un registro posterior: trazum verify plan.json --against usage.jsonl. Dice, por acción, si el cambio llegó, no llegó o no se puede saber — y nunca menos de esos tres.',
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
      `Las tarifas se revisaron el ${planReviewed} cuando se hizo el plan y el ${nowReviewed} ahora, así que cada comparación en dólares aquí son dos listas de precios, no una medición — no se puede culpar a un equipo por un ahorro que la aritmética revocó.`,
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
                : `Arreglar la caché de ${label} (${model})`;
      const verdict =
        outcome === 'arrived' ? 'LLEGÓ' : outcome === 'not-arrived' ? 'NO LLEGÓ' : 'NO SE PUEDE SABER';
      return `${what} — ${verdict}`;
    },
    reason: (reason) =>
      reason === 'workload-vanished'
        ? 'el label no lleva tráfico tasado en este registro — una carga desaparecida no está arreglada, y tampoco rota'
        : reason === 'fields-stopped'
          ? 'los campos que la detección necesita no están en este registro — "no registrado" no puede leerse como "arreglado", así que con --gate esto suspende'
          : 'el registro guarda tokens, y los tokens no dicen con qué tarifa se facturaron — el Batch API no se puede ver desde aquí',
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
    attribution: (callsBefore, callsAfter, outBefore, outAfter) =>
      `el mundo también se movió: llamadas ${callsBefore} → ${callsAfter}, salida/llamada ${outBefore} → ${outAfter} tokens — dicho para que el veredicto no se lea como toda la historia`,
    gateFailed: (failures, total) =>
      `GATE SUSPENDIDO — ${failures} de ${total} acciones no produjeron lo que el plan prometió, o dejaron de poder medirse por el propio registro del equipo.`,
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

  write: {
    slots: {
      task: {
        question: '¿Qué debe hacer el modelo, en una frase?',
        unlocks: 'el prompt entero — sin esto no hay nada que escribir',
      },
      role: {
        question: '¿Quién es el modelo mientras lo hace?',
        unlocks: 'la postura de la respuesta; si falta, el modelo elige una por ti',
      },
      inputs: {
        question: '¿Qué cambia de una llamada a otra?',
        unlocks: 'la parte variable — sin ella el prompt fija un solo caso y hay que reescribirlo para el siguiente',
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
        unlocks: 'el registro — una respuesta para un ingeniero y otra para un cliente no son la misma respuesta',
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
        unlocks: 'el emparejamiento — un ejemplo sin su entrada enseña la forma, no la correspondencia',
      },
      'failure-modes': {
        question: '¿Qué ha salido mal con esto antes?',
        unlocks: 'las correcciones que merecen decirse, que son justo las que un prompt genérico nunca tiene',
      },
      model: {
        question: '¿Para qué modelo es esto?',
        unlocks: 'la estimación de coste — esto cambia el informe, nunca el prompt',
      },
      budget: {
        question: '¿Cuál es el techo mensual de este prompt?',
        unlocks: 'la comprobación de presupuesto — esto cambia el informe, nunca el prompt',
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
    monthly: (usd) => `${usd} al mes, estimado — nadie ha enviado este prompt todavía`,
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
      `trazum optimize aún recuperaría ${tokens} tokens aquí (${rules}) — de tus respuestas, no de la estructura.`,
    declined: (ids) => `Declinados, y fuera: ${ids}`,
  },
};
