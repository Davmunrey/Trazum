import type { MarketingLocale } from './marketing-locales';
import { docHref } from './docs/manifest';
import { GITHUB_URL } from './site';

/**
 * The landing's words and its one worked example.
 *
 * **Every sentence here is one README.md already makes**, translated where
 * the locale is not English, and every figure is one the CLI printed. The
 * README is the product's own account of itself and it is held to the code
 * by tests; a landing that wrote its own claims would be a second account
 * nothing holds. So the headline is the README's first line, the reasons are
 * its "Why the number holds up", what never leaves the machine is the line
 * its boundary picture draws, and the three other things Trazum does are
 * stated the way its command table and agent section state them.
 *
 * No testimonial, no user count, no logo wall, no comparison with anybody
 * else's tool, and no price: `marketing.test.mjs` fails on each.
 *
 * Kept apart from the component because the server reads it too: the page's
 * title and description come from here, in the language `Accept-Language`
 * asked for, before any script runs.
 */

export interface LandingCopy {
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  heroTitle: string;
  heroLede: string;
  /** Above the command: the README's own heading for it. */
  commandLabel: string;
  billKicker: string;
  billTitle: string;
  billBody: string;
  billCaveat: string;
  /** The receipt's own words, around the figures the CLI printed. */
  billHeading: string;
  billTotal: (calls: number) => string;
  billPeriod: (from: string, to: string, days: string) => string;
  billProject: string;
  billModel: string;
  billCalls: string;
  billShare: string;
  billNote: string;
  billSource: string;
  reasonsTitle: string;
  reasons: readonly (readonly [title: string, body: string])[];
  neverTitle: string;
  neverLede: string;
  neverLabel: string;
  neverItems: readonly string[];
  leavesLabel: string;
  leaves: string;
  moreTitle: string;
  more: Record<'ci' | 'mcp' | 'trim', { title: string; body: string; link: string }>;
  closeTitle: string;
  closeBody: string;
  /** The desk: one object per capability around the laptop, and the plate that says what the pressed one does. */
  desk: DeskCopy;
}

/** A capability on the desk: the object's name, and its plate's title, sentence and what it does not do. */
export interface DeskCapability {
  object: string;
  title: string;
  body: string;
  not: readonly string[];
}

export interface DeskCopy {
  kicker: string;
  title: string;
  sub: string;
  /** The name of the group of objects, read aloud. */
  objects: string;
  /** The name of the laptop's screen, read aloud. */
  screen: string;
  notLabel: string;
  receipt: { heading: string; calls: (calls: number) => string; rateRead: (date: string) => string; total: string };
  caps: Record<DeskCommand, DeskCapability>;
  /** The lid's object; its plate is what never leaves the machine. */
  lid: string;
  /** The tag on the screen while it runs the example log, which is not anybody's real usage. */
  example: string;
  /** The chapter on a model with no published price: what the example log is, with the model and the calls the CLI named. */
  unpricedNote: (file: string, model: string, calls: number) => string;
}

/** The six objects whose press runs a command, in the order they lie on the desk; the lid comes after them. */
export const DESK_COMMANDS = ['bill', 'check', 'guard', 'clock', 'optimize', 'models'] as const;
export type DeskCommand = (typeof DESK_COMMANDS)[number];

/** What each object runs, as the plate's eyebrow and the object's second line: the command, not a translation. */
export const DESK_COMMAND_NAMES: Record<DeskCommand, string> = {
  bill: 'trazum bill',
  check: 'trazum check',
  guard: 'trazum session-guard',
  clock: 'trazum bill --agent --timezone',
  optimize: 'trazum optimize',
  models: 'trazum models',
};

/**
 * The README's illustrative bill: what `trazum bill examples/claude-projects`
 * prints, row by row. Two Claude Code projects whose transcripts are in this
 * repository, with no real prompt or answer in them.
 *
 * Copied, not computed in the page: the page cannot run the CLI. So
 * `marketing.test.mjs` runs it, through the same `scripts/draw-bill.mjs` that
 * draws the README's picture, and fails when any figure here is not the one
 * it prints. A price change redraws the picture and fails here until this
 * is redrawn too.
 */
export const ILLUSTRATIVE_BILL = {
  command: 'trazum bill examples/claude-projects',
  total: '$12.70',
  calls: 126,
  from: '2026-09-01',
  to: '2026-09-14',
  days: '13.3',
  projects: [
    { name: 'home-me-etl-pipeline', calls: 42, usd: '$9.05', share: '71.2%' },
    { name: 'home-me-webapp', calls: 84, usd: '$3.66', share: '28.8%' },
  ],
  models: [
    { name: 'claude-fable-5-1', calls: 28, usd: '$9.00', share: '70.9%' },
    { name: 'claude-opus-5-5', calls: 56, usd: '$2.95', share: '23.2%' },
    { name: 'claude-sonnet-5-5', calls: 28, usd: '$0.7077', share: '5.6%' },
    { name: 'claude-haiku-5-5', calls: 14, usd: '$0.0456', share: '0.4%' },
  ],
  source: `${GITHUB_URL}/tree/main/examples/claude-projects`,
} as const;

/** Where each of the three other things Trazum does is explained in full. */
export const MORE_LINKS = {
  ci: { href: docHref('ci'), external: false, command: 'trazum check' },
  mcp: { href: docHref('agents'), external: false, command: 'spend_guard' },
  trim: { href: '/app?tab=optimise', external: false, command: 'trazum optimize' },
} as const;

export const COPY: Record<MarketingLocale, LandingCopy> = {
  en: {
    metaTitle: 'Trazum: know what your AI agents cost',
    metaDescription:
      'Know what your AI agents cost, per project, without your prompts leaving the machine. One command reads the sessions Claude Code, Codex and Gemini CLI already keep on your disk and prints the bill.',
    eyebrow: 'Open source · Local analysis · No provider key needed to get started',
    heroTitle: 'Know what your AI agents cost, per project, without your prompts leaving the machine.',
    heroLede:
      'One command reads the sessions Claude Code, Codex and Gemini CLI already keep on your disk and prints the bill: by project, by model, by day. Then it ranks what to change and checks whether the change arrived.',
    commandLabel: 'Start here: one command, no global install.',
    billKicker: 'The bill',
    billTitle: 'By agent, by project, by model.',
    billBody:
      'With no path, bill reads the local sessions of Claude Code, Codex and Gemini CLI, names each folder it reads, and splits the result by agent, project and model, with each session’s subagents and workflows under the project they ran for.',
    billCaveat:
      'On a subscription, this is API-equivalent cost, not what you paid. Unpriced models are reported as gaps.',
    billHeading: 'Your bill',
    billTotal: (calls) => `across ${calls} priced calls`,
    billPeriod: (from, to, days) => `${from} to ${to}, ${days} days: stated, never extrapolated.`,
    billProject: 'Project',
    billModel: 'Model',
    billCalls: 'Calls',
    billShare: 'Share',
    billNote: 'Illustrative data, not a customer result. Generated from the CLI output.',
    billSource: 'examples/claude-projects',
    reasonsTitle: 'Why the number holds up',
    reasons: [
      [
        'Published rates, checked against the provider every week.',
        'A scheduled job compares every Anthropic and OpenAI price here with the provider’s own pricing page and fails the build when one moves or a model is missing. Every figure on the bill carries the rate behind it and the date that rate was reviewed.',
      ],
      [
        'Billed the way the provider bills.',
        'Cache reads, both cache-write lifetimes, long-prompt bands, fast mode, the Batch API, web searches and US-only inference each get their own published rate, call by call.',
      ],
      [
        'Nothing is guessed.',
        'A model with no published price is named and kept out of the total, never counted as $0. A projected saving is never added to a measured one.',
      ],
      [
        'Your files stay where they are.',
        'The analysis runs on your machine, on logs your tools already wrote. The CLI installs nothing from third parties: its one dependency is Trazum’s own core, which has none.',
      ],
    ],
    neverTitle: 'What never leaves the machine',
    neverLede:
      'Local analysis does not upload your files. The Playground runs the CLI’s pure subset in the page, through the same @trazum/core functions the terminal runs, and nothing you paste leaves your browser.',
    neverLabel: 'Never crosses the line',
    neverItems: ['The prompt text', 'The model’s answer', 'File paths', 'Branch names', 'Credentials'],
    leavesLabel: 'What leaves',
    leaves: 'A receipt, a report, a gate verdict.',
    moreTitle: 'What else it does',
    more: {
      ci: {
        title: 'A gate in CI',
        body: 'Does this prompt fit its token budget, and has the repository drifted past its recorded baseline? It exits 1 when either fails. One binary, two exit codes, in whatever CI you already run.',
        link: 'CI recipes',
      },
      mcp: {
        title: 'A budget check for agents',
        body: 'The MCP server’s first tool asks one question before a call: may I spend this? Yes, no, or cannot-tell, against the ceilings in your trazum.config.json. Nothing is called and nothing is spent to answer.',
        link: 'Agent setup',
      },
      trim: {
        title: 'Prompt trimming',
        body: 'Twelve deterministic rules: courtesy, filler, verbose phrasing, duplicated paragraphs, decorative separators, shouting in capitals. Same input, same output, never touching code, URLs, email addresses or placeholders. It is the smallest lever there is: on a metered API the things that move 60% to 80% are which model the call goes to, the Batch API, prompt caching, and what re-sending the conversation costs.',
        link: 'Try it in the browser',
      },
    },
    closeTitle: 'No provider key needed to get started.',
    closeBody: 'Requires Node.js 20 or newer. npx may download Trazum from npm. Or try sample data in your browser first.',
    desk: {
      kicker: 'Everything on the desk',
      title: 'Scroll, and each object takes its turn. Press one, and the screen shows what it does.',
      sub: 'Every line on the screen is what the CLI printed, on the example files in this repository.',
      objects: 'What Trazum does, one object each',
      screen: 'The laptop’s screen',
      notLabel: 'What it does not do',
      receipt: { heading: 'Receipt', calls: (calls) => `${calls} calls`, rateRead: (date) => `rate read ${date}`, total: 'Total' },
      caps: {
        bill: {
          object: 'The receipt',
          title: 'What your agents cost, by project and by model.',
          body: 'It reads the sessions your agents already keep on disk and prints the bill. Every figure on the bill carries the rate behind it and the date that rate was reviewed.',
          not: [
            'It uploads nothing: it reads files already on this machine.',
            'It does not extrapolate: it says which days the log covers.',
            'It is not what a subscription charged you: agent sessions are priced at API rates.',
          ],
        },
        check: {
          object: 'The CI gate',
          title: 'A gate in CI.',
          body: 'Does this prompt fit its token budget, and has the repository drifted past its recorded baseline? It exits 1 when either fails.',
          not: ['It calls no model and needs no provider key.', 'It does not rewrite your prompts: it measures them.'],
        },
        guard: {
          object: 'The breaker',
          title: 'A spend limit for a Claude Code session.',
          body: 'At the first figure it warns once; at the second it stops the session, with exit code 2.',
          not: [
            'It has no default figures: both are yours to set.',
            'It never counts a cost it cannot tell as $0.',
            'It cannot interrupt a model response already under way.',
          ],
        },
        clock: {
          object: 'The clock',
          title: 'One agent, by week, on your calendar.',
          body: '--agent keeps one coding agent’s records, and --timezone cuts the days and weeks in your zone instead of UTC.',
          not: [
            'Without --timezone, every day and week is a UTC one.',
            'It does not pass a narrower bill off as the whole one: it says how many records it left out.',
          ],
        },
        optimize: {
          object: 'The pencil',
          title: 'Trim a prompt without calling a model.',
          body: 'Twelve deterministic rules: same input, same output, never touching code, URLs, email addresses or placeholders.',
          not: ['It does not send your prompt anywhere.', 'It does not promise a smaller bill: trimming is the smallest lever there is.'],
        },
        models: {
          object: 'The calendar',
          title: 'Rates read, not remembered.',
          body: 'Every price comes from the provider’s own page, and each provider carries the date its page was read.',
          not: ['It never derives or estimates a price.', 'A model with no published price is kept out of the total, never counted as $0.'],
        },
      },
      lid: 'The lid',
      example: 'Example file',
      unpricedNote: (file, model, calls) =>
        `The screen runs bill on ${file}, an example log: ${calls} of its calls went to ${model}, which the catalogue does not price. The bill names it and leaves it out of the total.`,
    },
  },
  es: {
    metaTitle: 'Trazum: lo que cuestan tus agentes de IA',
    metaDescription:
      'Sabe lo que cuestan tus agentes de IA, por proyecto, sin que tus prompts salgan de la máquina. Un comando lee las sesiones que Claude Code, Codex y Gemini CLI ya guardan en tu disco e imprime la factura.',
    eyebrow: 'Código abierto · Análisis local · Sin clave de proveedor para empezar',
    heroTitle: 'Sabe lo que cuestan tus agentes de IA, por proyecto, sin que tus prompts salgan de la máquina.',
    heroLede:
      'Un comando lee las sesiones que Claude Code, Codex y Gemini CLI ya guardan en tu disco e imprime la factura: por proyecto, por modelo, por día. Después ordena qué cambiar y comprueba si el cambio llegó.',
    commandLabel: 'Empieza aquí: un comando, sin instalación global.',
    billKicker: 'La factura',
    billTitle: 'Por agente, por proyecto, por modelo.',
    billBody:
      'Sin ruta, bill lee las sesiones locales de Claude Code, Codex y Gemini CLI, nombra cada carpeta que lee y reparte el resultado por agente, proyecto y modelo, con los subagentes y flujos de cada sesión bajo el proyecto para el que trabajaron.',
    billCaveat:
      'Con una suscripción, esto es el coste equivalente en la API, no lo que pagaste. Los modelos sin precio aparecen como huecos.',
    billHeading: 'Tu factura',
    billTotal: (calls) => `en ${calls} llamadas con precio`,
    billPeriod: (from, to, days) => `Del ${from} al ${to}, ${days} días: dicho, nunca extrapolado.`,
    billProject: 'Proyecto',
    billModel: 'Modelo',
    billCalls: 'Llamadas',
    billShare: 'Parte',
    billNote: 'Datos ilustrativos, no el resultado de un cliente. Generados a partir de la salida del CLI.',
    billSource: 'examples/claude-projects',
    reasonsTitle: 'Por qué la cifra se sostiene',
    reasons: [
      [
        'Tarifas publicadas, comprobadas contra el proveedor cada semana.',
        'Un trabajo programado compara cada precio de Anthropic y OpenAI de aquí con la página de precios del propio proveedor y rompe la build cuando uno cambia o falta un modelo. Cada cifra de la factura lleva la tarifa que hay detrás y la fecha en que se revisó.',
      ],
      [
        'Facturado como factura el proveedor.',
        'Lecturas de caché, las dos duraciones de escritura en caché, tramos de prompt largo, modo rápido, la Batch API, búsquedas web e inferencia solo en EE. UU.: cada cosa con su tarifa publicada, llamada a llamada.',
      ],
      [
        'Nada se adivina.',
        'Un modelo sin precio publicado se nombra y queda fuera del total, nunca contado como $0. Un ahorro proyectado nunca se suma a uno medido.',
      ],
      [
        'Tus archivos se quedan donde están.',
        'El análisis corre en tu máquina, sobre logs que tus herramientas ya escribieron. El CLI no instala nada de terceros: su única dependencia es el núcleo de Trazum, que no tiene ninguna.',
      ],
    ],
    neverTitle: 'Lo que nunca sale de la máquina',
    neverLede:
      'El análisis local no sube tus archivos. El Playground ejecuta el subconjunto puro del CLI en la página, con las mismas funciones de @trazum/core que ejecuta la terminal, y nada de lo que pegas sale de tu navegador.',
    neverLabel: 'Nunca cruza la línea',
    neverItems: ['El texto del prompt', 'La respuesta del modelo', 'Rutas de archivo', 'Nombres de rama', 'Credenciales'],
    leavesLabel: 'Lo que sale',
    leaves: 'Un recibo, un informe, un veredicto de la puerta.',
    moreTitle: 'Qué más hace',
    more: {
      ci: {
        title: 'Una puerta en CI',
        body: '¿Cabe este prompt en su presupuesto de tokens, y se ha desviado el repositorio de su línea base registrada? Sale con 1 cuando falla cualquiera de las dos. Un binario, dos códigos de salida, en el CI que ya uses.',
        link: 'Recetas de CI',
      },
      mcp: {
        title: 'Un control de presupuesto para agentes',
        body: 'La primera herramienta del servidor MCP hace una pregunta antes de una llamada: ¿puedo gastar esto? Sí, no o no se puede saber, contra los techos de tu trazum.config.json. Para responder no se llama a nada ni se gasta nada.',
        link: 'Configurar agentes',
      },
      trim: {
        title: 'Recorte de prompts',
        body: 'Doce reglas deterministas: cortesía, relleno, frases verbosas, párrafos duplicados, separadores decorativos, gritos en mayúsculas. Misma entrada, misma salida, sin tocar nunca código, URLs, direcciones de correo ni marcadores. Es la palanca más pequeña que hay: en una API de pago por uso, lo que mueve del 60% al 80% es a qué modelo va la llamada, la Batch API, la caché de prompts y lo que cuesta reenviar la conversación.',
        link: 'Probarlo en el navegador',
      },
    },
    closeTitle: 'Sin clave de proveedor para empezar.',
    closeBody: 'Requiere Node.js 20 o posterior. npx puede descargar Trazum de npm. O prueba antes con datos de ejemplo en tu navegador.',
    desk: {
      kicker: 'Todo sobre la mesa',
      title: 'Desplázate y cada objeto tiene su turno. Pulsa uno y la pantalla enseña lo que hace.',
      sub: 'Cada línea de la pantalla es lo que imprimió el CLI, sobre los archivos de ejemplo de este repositorio.',
      objects: 'Lo que hace Trazum, un objeto para cada cosa',
      screen: 'La pantalla del portátil',
      notLabel: 'Lo que no hace',
      receipt: { heading: 'Recibo', calls: (calls) => `${calls} llamadas`, rateRead: (date) => `tarifa leída el ${date}`, total: 'Total' },
      caps: {
        bill: {
          object: 'El recibo',
          title: 'Lo que cuestan tus agentes, por proyecto y por modelo.',
          body: 'Lee las sesiones que tus agentes ya guardan en disco e imprime la factura. Cada cifra de la factura lleva la tarifa que hay detrás y la fecha en que se revisó.',
          not: [
            'No sube nada: lee archivos que ya están en esta máquina.',
            'No extrapola: dice qué días cubre el log.',
            'No es lo que te cobró una suscripción: las sesiones de agentes se valoran a tarifas de la API.',
          ],
        },
        check: {
          object: 'La barrera de CI',
          title: 'Una puerta en CI.',
          body: '¿Cabe este prompt en su presupuesto de tokens, y se ha desviado el repositorio de su línea base registrada? Sale con 1 cuando falla cualquiera de las dos.',
          not: ['No llama a ningún modelo ni necesita clave de proveedor.', 'No reescribe tus prompts: los mide.'],
        },
        guard: {
          object: 'El diferencial',
          title: 'Un límite de gasto para una sesión de Claude Code.',
          body: 'Con la primera cifra avisa una vez; con la segunda para la sesión, con código de salida 2.',
          not: [
            'No trae cifras por defecto: las dos las pones tú.',
            'Nunca cuenta como $0 un coste que no puede saber.',
            'No puede cortar una respuesta del modelo que ya está en marcha.',
          ],
        },
        clock: {
          object: 'El reloj',
          title: 'Un agente, por semana, en tu calendario.',
          body: '--agent se queda con los registros de un solo agente, y --timezone corta los días y las semanas en tu zona en vez de en UTC.',
          not: [
            'Sin --timezone, cada día y cada semana son de UTC.',
            'No hace pasar una factura parcial por la completa: dice cuántos registros dejó fuera.',
          ],
        },
        optimize: {
          object: 'El lápiz',
          title: 'Recorta un prompt sin llamar a ningún modelo.',
          body: 'Doce reglas deterministas: misma entrada, misma salida, sin tocar nunca código, URLs, direcciones de correo ni marcadores.',
          not: ['No envía tu prompt a ningún sitio.', 'No promete una factura menor: recortar es la palanca más pequeña que hay.'],
        },
        models: {
          object: 'El calendario',
          title: 'Tarifas leídas, no recordadas.',
          body: 'Cada precio sale de la página del propio proveedor, y cada proveedor lleva la fecha en que se leyó su página.',
          not: ['Nunca deduce ni estima un precio.', 'Un modelo sin precio publicado queda fuera del total, nunca contado como $0.'],
        },
      },
      lid: 'La tapa',
      example: 'Archivo de ejemplo',
      unpricedNote: (file, model, calls) =>
        `La pantalla ejecuta bill sobre ${file}, un log de ejemplo: ${calls} de sus llamadas fueron a ${model}, que el catálogo no tiene con precio. La factura lo nombra y lo deja fuera del total.`,
    },
  },
  fr: {
    metaTitle: 'Trazum : ce que coûtent vos agents IA',
    metaDescription:
      'Sachez ce que coûtent vos agents IA, par projet, sans que vos prompts quittent la machine. Une commande lit les sessions que Claude Code, Codex et Gemini CLI gardent déjà sur votre disque et imprime la facture.',
    eyebrow: 'Open source · Analyse locale · Aucune clé de fournisseur pour commencer',
    heroTitle: 'Sachez ce que coûtent vos agents IA, par projet, sans que vos prompts quittent la machine.',
    heroLede:
      'Une commande lit les sessions que Claude Code, Codex et Gemini CLI gardent déjà sur votre disque et imprime la facture : par projet, par modèle, par jour. Puis elle classe ce qu’il faut changer et vérifie si le changement est arrivé.',
    commandLabel: 'Commencez ici : une commande, aucune installation globale.',
    billKicker: 'La facture',
    billTitle: 'Par agent, par projet, par modèle.',
    billBody:
      'Sans chemin, bill lit les sessions locales de Claude Code, Codex et Gemini CLI, nomme chaque dossier lu et répartit le résultat par agent, projet et modèle, avec les sous-agents et les workflows de chaque session sous le projet pour lequel ils ont tourné.',
    billCaveat:
      'Avec un abonnement, c’est un coût équivalent API, pas ce que vous avez payé. Les modèles sans prix sont signalés comme des lacunes.',
    billHeading: 'Votre facture',
    billTotal: (calls) => `sur ${calls} appels tarifés`,
    billPeriod: (from, to, days) => `Du ${from} au ${to}, ${days} jours : constaté, jamais extrapolé.`,
    billProject: 'Projet',
    billModel: 'Modèle',
    billCalls: 'Appels',
    billShare: 'Part',
    billNote: 'Données illustratives, pas le résultat d’un client. Générées à partir de la sortie du CLI.',
    billSource: 'examples/claude-projects',
    reasonsTitle: 'Pourquoi le chiffre tient',
    reasons: [
      [
        'Des tarifs publiés, vérifiés auprès du fournisseur chaque semaine.',
        'Une tâche planifiée compare chaque prix Anthropic et OpenAI d’ici avec la page de tarifs du fournisseur et fait échouer le build quand l’un bouge ou qu’un modèle manque. Chaque chiffre de la facture porte le tarif qui le fonde et la date de sa vérification.',
      ],
      [
        'Facturé comme le fournisseur facture.',
        'Lectures de cache, les deux durées d’écriture en cache, tranches de prompt long, mode rapide, l’API Batch, recherches web et inférence aux États-Unis seulement : chacun a son tarif publié, appel par appel.',
      ],
      [
        'Rien n’est deviné.',
        'Un modèle sans prix publié est nommé et tenu hors du total, jamais compté à 0 $. Une économie projetée n’est jamais ajoutée à une économie mesurée.',
      ],
      [
        'Vos fichiers restent où ils sont.',
        'L’analyse tourne sur votre machine, sur des journaux que vos outils ont déjà écrits. Le CLI n’installe rien de tiers : sa seule dépendance est le cœur de Trazum, qui n’en a aucune.',
      ],
    ],
    neverTitle: 'Ce qui ne quitte jamais la machine',
    neverLede:
      'L’analyse locale n’envoie pas vos fichiers. Le Playground exécute le sous-ensemble pur du CLI dans la page, avec les mêmes fonctions @trazum/core que le terminal, et rien de ce que vous collez ne quitte votre navigateur.',
    neverLabel: 'Ne franchit jamais la ligne',
    neverItems: ['Le texte du prompt', 'La réponse du modèle', 'Les chemins de fichiers', 'Les noms de branche', 'Les identifiants'],
    leavesLabel: 'Ce qui sort',
    leaves: 'Un reçu, un rapport, un verdict de contrôle.',
    moreTitle: 'Ce qu’il fait d’autre',
    more: {
      ci: {
        title: 'Un contrôle en CI',
        body: 'Ce prompt tient-il dans son budget de tokens, et le dépôt a-t-il dérivé au-delà de sa ligne de base enregistrée ? Il sort en 1 quand l’un des deux échoue. Un binaire, deux codes de sortie, dans la CI que vous utilisez déjà.',
        link: 'Recettes CI',
      },
      mcp: {
        title: 'Un contrôle de budget pour les agents',
        body: 'Le premier outil du serveur MCP pose une question avant un appel : puis-je dépenser ceci ? Oui, non, ou impossible à dire, face aux plafonds de votre trazum.config.json. Rien n’est appelé et rien n’est dépensé pour répondre.',
        link: 'Configurer les agents',
      },
      trim: {
        title: 'Raccourcir les prompts',
        body: 'Douze règles déterministes : politesse, remplissage, tournures verbeuses, paragraphes dupliqués, séparateurs décoratifs, majuscules criées. Même entrée, même sortie, sans jamais toucher au code, aux URL, aux adresses e-mail ni aux espaces réservés. C’est le plus petit levier qui soit : sur une API facturée à l’usage, ce qui déplace de 60 % à 80 %, c’est le modèle de l’appel, l’API Batch, le cache de prompts et le coût du renvoi de la conversation.',
        link: 'L’essayer dans le navigateur',
      },
    },
    closeTitle: 'Aucune clé de fournisseur pour commencer.',
    closeBody: 'Nécessite Node.js 20 ou plus récent. npx peut télécharger Trazum depuis npm. Ou essayez d’abord des données d’exemple dans votre navigateur.',
    desk: {
      kicker: 'Tout sur la table',
      title: 'Faites défiler et chaque objet passe à son tour. Appuyez sur l’un d’eux et l’écran montre ce qu’il fait.',
      sub: 'Chaque ligne de l’écran est ce que le CLI a imprimé, sur les fichiers d’exemple de ce dépôt.',
      objects: 'Ce que fait Trazum, un objet pour chaque chose',
      screen: 'L’écran de l’ordinateur',
      notLabel: 'Ce qu’il ne fait pas',
      receipt: { heading: 'Reçu', calls: (calls) => `${calls} appels`, rateRead: (date) => `tarif lu le ${date}`, total: 'Total' },
      caps: {
        bill: {
          object: 'Le reçu',
          title: 'Ce que coûtent vos agents, par projet et par modèle.',
          body: 'Il lit les sessions que vos agents gardent déjà sur le disque et imprime la facture. Chaque chiffre de la facture porte le tarif qui le fonde et la date de sa vérification.',
          not: [
            'Il n’envoie rien : il lit des fichiers déjà présents sur cette machine.',
            'Il n’extrapole pas : il dit quels jours le journal couvre.',
            'Ce n’est pas ce qu’un abonnement vous a facturé : les sessions d’agents sont tarifées aux prix de l’API.',
          ],
        },
        check: {
          object: 'Le contrôle CI',
          title: 'Un contrôle en CI.',
          body: 'Ce prompt tient-il dans son budget de tokens, et le dépôt a-t-il dérivé au-delà de sa ligne de base enregistrée ? Il sort en 1 quand l’un des deux échoue.',
          not: ['Il n’appelle aucun modèle et ne demande aucune clé de fournisseur.', 'Il ne réécrit pas vos prompts : il les mesure.'],
        },
        guard: {
          object: 'Le disjoncteur',
          title: 'Une limite de dépense pour une session Claude Code.',
          body: 'Au premier chiffre il avertit une fois ; au second il arrête la session, avec le code de sortie 2.',
          not: [
            'Il n’a pas de chiffres par défaut : les deux sont à vous.',
            'Il ne compte jamais à 0 $ un coût qu’il ne peut pas établir.',
            'Il ne peut pas interrompre une réponse du modèle déjà en cours.',
          ],
        },
        clock: {
          object: 'L’horloge',
          title: 'Un agent, par semaine, sur votre calendrier.',
          body: '--agent garde les enregistrements d’un seul agent, et --timezone coupe les jours et les semaines dans votre fuseau au lieu de l’UTC.',
          not: [
            'Sans --timezone, chaque jour et chaque semaine sont en UTC.',
            'Il ne fait pas passer une facture partielle pour la complète : il dit combien d’enregistrements il a laissés de côté.',
          ],
        },
        optimize: {
          object: 'Le crayon',
          title: 'Raccourcir un prompt sans appeler de modèle.',
          body: 'Douze règles déterministes : même entrée, même sortie, sans jamais toucher au code, aux URL, aux adresses e-mail ni aux espaces réservés.',
          not: ['Il n’envoie votre prompt nulle part.', 'Il ne promet pas une facture plus petite : raccourcir est le plus petit levier qui soit.'],
        },
        models: {
          object: 'Le calendrier',
          title: 'Des tarifs lus, pas retenus de mémoire.',
          body: 'Chaque prix vient de la page du fournisseur lui-même, et chaque fournisseur porte la date à laquelle sa page a été lue.',
          not: ['Il ne déduit ni n’estime jamais un prix.', 'Un modèle sans prix publié reste hors du total, jamais compté à 0 $.'],
        },
      },
      lid: 'Le couvercle',
      example: 'Fichier d’exemple',
      unpricedNote: (file, model, calls) =>
        `L’écran lance bill sur ${file}, un journal d’exemple : ${calls} de ses appels sont allés à ${model}, que le catalogue ne tarifie pas. La facture le nomme et le laisse hors du total.`,
    },
  },
  de: {
    metaTitle: 'Trazum: was Ihre KI-Agenten kosten',
    metaDescription:
      'Wissen, was Ihre KI-Agenten kosten, pro Projekt, ohne dass Ihre Prompts die Maschine verlassen. Ein Befehl liest die Sitzungen, die Claude Code, Codex und Gemini CLI ohnehin auf Ihrer Festplatte ablegen, und druckt die Rechnung.',
    eyebrow: 'Open Source · Lokale Analyse · Kein Anbieterschlüssel für den Einstieg',
    heroTitle: 'Wissen, was Ihre KI-Agenten kosten, pro Projekt, ohne dass Ihre Prompts die Maschine verlassen.',
    heroLede:
      'Ein Befehl liest die Sitzungen, die Claude Code, Codex und Gemini CLI ohnehin auf Ihrer Festplatte ablegen, und druckt die Rechnung: pro Projekt, pro Modell, pro Tag. Dann ordnet er, was zu ändern ist, und prüft, ob die Änderung angekommen ist.',
    commandLabel: 'Hier anfangen: ein Befehl, keine globale Installation.',
    billKicker: 'Die Rechnung',
    billTitle: 'Pro Agent, pro Projekt, pro Modell.',
    billBody:
      'Ohne Pfad liest bill die lokalen Sitzungen von Claude Code, Codex und Gemini CLI, nennt jeden gelesenen Ordner und teilt das Ergebnis nach Agent, Projekt und Modell auf, mit den Subagenten und Workflows jeder Sitzung unter dem Projekt, für das sie liefen.',
    billCaveat:
      'Bei einem Abonnement sind das API-äquivalente Kosten, nicht das, was Sie bezahlt haben. Modelle ohne Preis werden als Lücken ausgewiesen.',
    billHeading: 'Ihre Rechnung',
    billTotal: (calls) => `über ${calls} bepreiste Aufrufe`,
    billPeriod: (from, to, days) => `${from} bis ${to}, ${days} Tage: angegeben, nie hochgerechnet.`,
    billProject: 'Projekt',
    billModel: 'Modell',
    billCalls: 'Aufrufe',
    billShare: 'Anteil',
    billNote: 'Beispieldaten, kein Kundenergebnis. Aus der Ausgabe des CLI erzeugt.',
    billSource: 'examples/claude-projects',
    reasonsTitle: 'Warum die Zahl hält',
    reasons: [
      [
        'Veröffentlichte Preise, jede Woche beim Anbieter geprüft.',
        'Ein geplanter Job vergleicht jeden Anthropic- und OpenAI-Preis hier mit der Preisseite des Anbieters und lässt den Build scheitern, wenn sich einer ändert oder ein Modell fehlt. Jede Zahl auf der Rechnung trägt den Preis dahinter und das Datum, an dem er geprüft wurde.',
      ],
      [
        'Abgerechnet, wie der Anbieter abrechnet.',
        'Cache-Lesezugriffe, beide Cache-Schreibdauern, Preisstufen für lange Prompts, der schnelle Modus, die Batch-API, Websuchen und reine US-Inferenz bekommen jeweils ihren veröffentlichten Preis, Aufruf für Aufruf.',
      ],
      [
        'Nichts wird geraten.',
        'Ein Modell ohne veröffentlichten Preis wird benannt und aus der Summe herausgehalten, nie als 0 $ gezählt. Eine prognostizierte Einsparung wird nie zu einer gemessenen addiert.',
      ],
      [
        'Ihre Dateien bleiben, wo sie sind.',
        'Die Analyse läuft auf Ihrer Maschine, auf Protokollen, die Ihre Werkzeuge schon geschrieben haben. Das CLI installiert nichts von Dritten: Seine einzige Abhängigkeit ist der eigene Kern von Trazum, der keine hat.',
      ],
    ],
    neverTitle: 'Was die Maschine nie verlässt',
    neverLede:
      'Die lokale Analyse lädt Ihre Dateien nicht hoch. Der Playground führt den reinen Teil des CLI in der Seite aus, mit denselben @trazum/core-Funktionen wie das Terminal, und nichts, was Sie einfügen, verlässt Ihren Browser.',
    neverLabel: 'Überschreitet nie die Linie',
    neverItems: ['Der Prompt-Text', 'Die Antwort des Modells', 'Dateipfade', 'Branch-Namen', 'Zugangsdaten'],
    leavesLabel: 'Was hinausgeht',
    leaves: 'Ein Beleg, ein Bericht, ein Prüfergebnis.',
    moreTitle: 'Was es noch tut',
    more: {
      ci: {
        title: 'Eine Prüfung in der CI',
        body: 'Passt dieser Prompt in sein Token-Budget, und ist das Repository über seine aufgezeichnete Baseline hinausgedriftet? Es endet mit 1, wenn eines davon scheitert. Ein Binary, zwei Exit-Codes, in der CI, die Sie schon nutzen.',
        link: 'CI-Rezepte',
      },
      mcp: {
        title: 'Eine Budgetprüfung für Agenten',
        body: 'Das erste Werkzeug des MCP-Servers stellt vor einem Aufruf eine Frage: Darf ich das ausgeben? Ja, nein oder nicht feststellbar, gegen die Grenzen in Ihrer trazum.config.json. Für die Antwort wird nichts aufgerufen und nichts ausgegeben.',
        link: 'Agenten einrichten',
      },
      trim: {
        title: 'Prompts kürzen',
        body: 'Zwölf deterministische Regeln: Höflichkeit, Füllwörter, umständliche Formulierungen, doppelte Absätze, dekorative Trenner, Großbuchstaben-Geschrei. Gleiche Eingabe, gleiche Ausgabe, ohne je Code, URLs, E-Mail-Adressen oder Platzhalter anzufassen. Es ist der kleinste Hebel, den es gibt: Bei einer nutzungsbasierten API bewegen 60 bis 80 % das Modell des Aufrufs, die Batch-API, Prompt-Caching und was das erneute Senden des Gesprächs kostet.',
        link: 'Im Browser ausprobieren',
      },
    },
    closeTitle: 'Kein Anbieterschlüssel für den Einstieg nötig.',
    closeBody: 'Benötigt Node.js 20 oder neuer. npx kann Trazum von npm laden. Oder probieren Sie zuerst Beispieldaten in Ihrem Browser.',
    desk: {
      kicker: 'Alles auf dem Tisch',
      title: 'Scrollen Sie, und jeder Gegenstand ist an der Reihe. Drücken Sie auf einen, und der Bildschirm zeigt, was er tut.',
      sub: 'Jede Zeile auf dem Bildschirm ist, was das CLI ausgegeben hat, auf den Beispieldateien dieses Repositorys.',
      objects: 'Was Trazum tut, ein Gegenstand für jede Sache',
      screen: 'Der Bildschirm des Laptops',
      notLabel: 'Was es nicht tut',
      receipt: { heading: 'Beleg', calls: (calls) => `${calls} Aufrufe`, rateRead: (date) => `Preis gelesen am ${date}`, total: 'Summe' },
      caps: {
        bill: {
          object: 'Der Beleg',
          title: 'Was Ihre Agenten kosten, pro Projekt und pro Modell.',
          body: 'Es liest die Sitzungen, die Ihre Agenten ohnehin auf der Festplatte ablegen, und druckt die Rechnung. Jede Zahl auf der Rechnung trägt den Preis dahinter und das Datum, an dem er geprüft wurde.',
          not: [
            'Es lädt nichts hoch: Es liest Dateien, die schon auf dieser Maschine liegen.',
            'Es rechnet nicht hoch: Es sagt, welche Tage das Protokoll abdeckt.',
            'Es ist nicht, was ein Abonnement Ihnen berechnet hat: Agentensitzungen werden zu API-Preisen bewertet.',
          ],
        },
        check: {
          object: 'Die CI-Schranke',
          title: 'Eine Prüfung in der CI.',
          body: 'Passt dieser Prompt in sein Token-Budget, und ist das Repository über seine aufgezeichnete Baseline hinausgedriftet? Es endet mit 1, wenn eines davon scheitert.',
          not: ['Es ruft kein Modell auf und braucht keinen Anbieterschlüssel.', 'Es schreibt Ihre Prompts nicht um: Es misst sie.'],
        },
        guard: {
          object: 'Die Sicherung',
          title: 'Ein Ausgabenlimit für eine Claude-Code-Sitzung.',
          body: 'Bei der ersten Zahl warnt es einmal; bei der zweiten stoppt es die Sitzung, mit Exit-Code 2.',
          not: [
            'Es hat keine voreingestellten Zahlen: Beide legen Sie fest.',
            'Es zählt Kosten, die es nicht feststellen kann, nie als 0 $.',
            'Es kann eine bereits laufende Antwort des Modells nicht unterbrechen.',
          ],
        },
        clock: {
          object: 'Die Uhr',
          title: 'Ein Agent, pro Woche, in Ihrem Kalender.',
          body: '--agent behält die Einträge eines einzigen Agenten, und --timezone schneidet Tage und Wochen in Ihrer Zeitzone statt in UTC.',
          not: [
            'Ohne --timezone ist jeder Tag und jede Woche einer in UTC.',
            'Es gibt eine schmalere Rechnung nie als die ganze aus: Es sagt, wie viele Einträge es weggelassen hat.',
          ],
        },
        optimize: {
          object: 'Der Bleistift',
          title: 'Einen Prompt kürzen, ohne ein Modell aufzurufen.',
          body: 'Zwölf deterministische Regeln: gleiche Eingabe, gleiche Ausgabe, ohne je Code, URLs, E-Mail-Adressen oder Platzhalter anzufassen.',
          not: ['Es schickt Ihren Prompt nirgendwohin.', 'Es verspricht keine kleinere Rechnung: Kürzen ist der kleinste Hebel, den es gibt.'],
        },
        models: {
          object: 'Der Kalender',
          title: 'Gelesene Preise, keine erinnerten.',
          body: 'Jeder Preis stammt von der Seite des Anbieters selbst, und jeder Anbieter trägt das Datum, an dem seine Seite gelesen wurde.',
          not: ['Es leitet nie einen Preis ab und schätzt keinen.', 'Ein Modell ohne veröffentlichten Preis bleibt aus der Summe heraus, nie als 0 $ gezählt.'],
        },
      },
      lid: 'Der Deckel',
      example: 'Beispieldatei',
      unpricedNote: (file, model, calls) =>
        `Der Bildschirm führt bill auf ${file} aus, einem Beispielprotokoll: ${calls} seiner Aufrufe gingen an ${model}, für das der Katalog keinen Preis hat. Die Rechnung nennt es und lässt es aus der Summe.`,
    },
  },
  pt: {
    metaTitle: 'Trazum: quanto custam os seus agentes de IA',
    metaDescription:
      'Saiba quanto custam os seus agentes de IA, por projeto, sem que os seus prompts saiam da máquina. Um comando lê as sessões que o Claude Code, o Codex e o Gemini CLI já guardam no seu disco e imprime a fatura.',
    eyebrow: 'Código aberto · Análise local · Sem chave de fornecedor para começar',
    heroTitle: 'Saiba quanto custam os seus agentes de IA, por projeto, sem que os seus prompts saiam da máquina.',
    heroLede:
      'Um comando lê as sessões que o Claude Code, o Codex e o Gemini CLI já guardam no seu disco e imprime a fatura: por projeto, por modelo, por dia. Depois ordena o que mudar e verifica se a mudança chegou.',
    commandLabel: 'Comece aqui: um comando, sem instalação global.',
    billKicker: 'A fatura',
    billTitle: 'Por agente, por projeto, por modelo.',
    billBody:
      'Sem caminho, o bill lê as sessões locais do Claude Code, do Codex e do Gemini CLI, nomeia cada pasta que lê e divide o resultado por agente, projeto e modelo, com os subagentes e fluxos de cada sessão sob o projeto para que trabalharam.',
    billCaveat:
      'Numa subscrição, isto é custo equivalente na API, não o que pagou. Os modelos sem preço aparecem como lacunas.',
    billHeading: 'A sua fatura',
    billTotal: (calls) => `em ${calls} chamadas com preço`,
    billPeriod: (from, to, days) => `De ${from} a ${to}, ${days} dias: declarado, nunca extrapolado.`,
    billProject: 'Projeto',
    billModel: 'Modelo',
    billCalls: 'Chamadas',
    billShare: 'Parte',
    billNote: 'Dados ilustrativos, não o resultado de um cliente. Gerados a partir da saída do CLI.',
    billSource: 'examples/claude-projects',
    reasonsTitle: 'Porque é que o número se sustenta',
    reasons: [
      [
        'Tarifas publicadas, verificadas junto do fornecedor todas as semanas.',
        'Uma tarefa agendada compara cada preço da Anthropic e da OpenAI daqui com a página de preços do próprio fornecedor e faz falhar a build quando um muda ou falta um modelo. Cada número da fatura leva a tarifa por trás e a data em que foi revista.',
      ],
      [
        'Faturado como o fornecedor fatura.',
        'Leituras de cache, as duas durações de escrita em cache, escalões de prompt longo, modo rápido, a Batch API, pesquisas web e inferência só nos EUA: cada um com a sua tarifa publicada, chamada a chamada.',
      ],
      [
        'Nada é adivinhado.',
        'Um modelo sem preço publicado é nomeado e fica fora do total, nunca contado como 0 $. Uma poupança projetada nunca é somada a uma medida.',
      ],
      [
        'Os seus ficheiros ficam onde estão.',
        'A análise corre na sua máquina, sobre registos que as suas ferramentas já escreveram. O CLI não instala nada de terceiros: a sua única dependência é o núcleo do próprio Trazum, que não tem nenhuma.',
      ],
    ],
    neverTitle: 'O que nunca sai da máquina',
    neverLede:
      'A análise local não envia os seus ficheiros. O Playground executa o subconjunto puro do CLI na página, com as mesmas funções do @trazum/core que o terminal executa, e nada do que cola sai do seu navegador.',
    neverLabel: 'Nunca atravessa a linha',
    neverItems: ['O texto do prompt', 'A resposta do modelo', 'Caminhos de ficheiros', 'Nomes de ramos', 'Credenciais'],
    leavesLabel: 'O que sai',
    leaves: 'Um recibo, um relatório, um veredicto de controlo.',
    moreTitle: 'O que mais faz',
    more: {
      ci: {
        title: 'Um controlo no CI',
        body: 'Este prompt cabe no seu orçamento de tokens, e o repositório desviou-se da sua linha de base registada? Sai com 1 quando qualquer um falha. Um binário, dois códigos de saída, no CI que já usa.',
        link: 'Receitas de CI',
      },
      mcp: {
        title: 'Um controlo de orçamento para agentes',
        body: 'A primeira ferramenta do servidor MCP faz uma pergunta antes de uma chamada: posso gastar isto? Sim, não, ou não dá para saber, face aos tetos do seu trazum.config.json. Para responder nada é chamado e nada é gasto.',
        link: 'Configurar agentes',
      },
      trim: {
        title: 'Encurtar prompts',
        body: 'Doze regras determinísticas: cortesia, enchimento, frases prolixas, parágrafos duplicados, separadores decorativos, gritos em maiúsculas. Mesma entrada, mesma saída, sem nunca tocar em código, URLs, endereços de e-mail ou marcadores. É a alavanca mais pequena que há: numa API paga por uso, o que move 60% a 80% é o modelo para onde vai a chamada, a Batch API, a cache de prompts e o custo de reenviar a conversa.',
        link: 'Experimentar no navegador',
      },
    },
    closeTitle: 'Sem chave de fornecedor para começar.',
    closeBody: 'Requer Node.js 20 ou mais recente. O npx pode descarregar o Trazum do npm. Ou experimente primeiro dados de exemplo no seu navegador.',
    desk: {
      kicker: 'Tudo em cima da mesa',
      title: 'Desloque a página e cada objeto tem a sua vez. Carregue num e o ecrã mostra o que faz.',
      sub: 'Cada linha do ecrã é o que o CLI imprimiu, sobre os ficheiros de exemplo deste repositório.',
      objects: 'O que o Trazum faz, um objeto para cada coisa',
      screen: 'O ecrã do portátil',
      notLabel: 'O que não faz',
      receipt: { heading: 'Recibo', calls: (calls) => `${calls} chamadas`, rateRead: (date) => `tarifa lida a ${date}`, total: 'Total' },
      caps: {
        bill: {
          object: 'O recibo',
          title: 'Quanto custam os seus agentes, por projeto e por modelo.',
          body: 'Lê as sessões que os seus agentes já guardam no disco e imprime a fatura. Cada número da fatura leva a tarifa por trás e a data em que foi revista.',
          not: [
            'Não envia nada: lê ficheiros que já estão nesta máquina.',
            'Não extrapola: diz que dias o registo cobre.',
            'Não é o que uma subscrição lhe cobrou: as sessões de agentes são valorizadas a tarifas da API.',
          ],
        },
        check: {
          object: 'A barreira de CI',
          title: 'Um controlo no CI.',
          body: 'Este prompt cabe no seu orçamento de tokens, e o repositório desviou-se da sua linha de base registada? Sai com 1 quando qualquer um falha.',
          not: ['Não chama nenhum modelo nem precisa de chave de fornecedor.', 'Não reescreve os seus prompts: mede-os.'],
        },
        guard: {
          object: 'O disjuntor',
          title: 'Um limite de gasto para uma sessão do Claude Code.',
          body: 'No primeiro número avisa uma vez; no segundo para a sessão, com código de saída 2.',
          not: [
            'Não tem números por omissão: os dois são seus.',
            'Nunca conta como 0 $ um custo que não consegue saber.',
            'Não consegue interromper uma resposta do modelo já em curso.',
          ],
        },
        clock: {
          object: 'O relógio',
          title: 'Um agente, por semana, no seu calendário.',
          body: '--agent fica com os registos de um só agente, e --timezone corta os dias e as semanas no seu fuso em vez de em UTC.',
          not: [
            'Sem --timezone, cada dia e cada semana são de UTC.',
            'Não faz passar uma fatura parcial pela completa: diz quantos registos deixou de fora.',
          ],
        },
        optimize: {
          object: 'O lápis',
          title: 'Encurtar um prompt sem chamar nenhum modelo.',
          body: 'Doze regras determinísticas: mesma entrada, mesma saída, sem nunca tocar em código, URLs, endereços de e-mail ou marcadores.',
          not: ['Não envia o seu prompt para lado nenhum.', 'Não promete uma fatura menor: encurtar é a alavanca mais pequena que há.'],
        },
        models: {
          object: 'O calendário',
          title: 'Tarifas lidas, não lembradas.',
          body: 'Cada preço vem da página do próprio fornecedor, e cada fornecedor leva a data em que a sua página foi lida.',
          not: ['Nunca deduz nem estima um preço.', 'Um modelo sem preço publicado fica fora do total, nunca contado como 0 $.'],
        },
      },
      lid: 'A tampa',
      example: 'Ficheiro de exemplo',
      unpricedNote: (file, model, calls) =>
        `O ecrã executa bill sobre ${file}, um registo de exemplo: ${calls} das suas chamadas foram para ${model}, que o catálogo não tem com preço. A fatura nomeia-o e deixa-o fora do total.`,
    },
  },
};
