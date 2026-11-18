import type { MarketingLocale } from './marketing-locales';
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
}

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
  ci: { href: `${GITHUB_URL}/blob/main/docs/ci.md`, external: true, command: 'trazum check' },
  mcp: { href: `${GITHUB_URL}/blob/main/docs/agents.md`, external: true, command: 'spend_guard' },
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
  },
};
