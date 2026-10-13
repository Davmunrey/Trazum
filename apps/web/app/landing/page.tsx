'use client';

import Link from 'next/link';

import {
  LocaleToggle,
  MARKETING_LOCALE_META,
  ScrollProgress,
  useMarketingLocale,
} from '../../components/marketing';
import type { MarketingLocale } from '../../components/marketing';

/**
 * The landing — the one Persuade surface in an app that otherwise operates.
 *
 * The copy is local to the page rather than threaded through the app's
 * message catalogue: no component shares these sentences, and a landing
 * iterates at a different rhythm than the product's copy. Both locales are
 * complete by construction — the type below makes a missing key a build
 * error, which is the same guarantee the catalogue gives the app.
 *
 * Every number on this page is one the product itself printed, and the
 * headline one now says which prompt printed it.
 *
 * It read -37.4% and described itself as `optimize --level aggressive` over
 * the demo prompt. No prompt in this repository produces that: the demo
 * prompt — the one the Playground tab loads and the Optimiser fills itself
 * with, so the one a visitor clicking through actually runs — comes out at
 * -20.1%. The figure was a real number from a prompt nobody committed,
 * which is the same thing as a number a reader cannot check, and it would
 * have gone on drifting every time a rule changed.
 *
 * marketing.test.mjs derives it now: it runs the rules over that prompt and
 * fails if the page states anything else. The 60-80% and 50% are the
 * model-routing and Batch spans the profile report states, and none of it
 * is a testimonial, a logo wall or a projection — the product refuses to
 * forecast, and so does its landing.
 */

interface Copy {
  localeName: string;
  heroTitle: string;
  heroLede: string;
  /** The label over the one command that works with nothing installed. */
  heroCommandLabel: string;
  ctaDemo: string;
  ctaGitHub: string;
  /** Labels the story column beside the beats; never sits above a heading. */
  storyLabel: string;
  story1Title: string;
  story1Body: string;
  story2Title: string;
  story2Body: string;
  story3Title: string;
  story3Body: string;
  doorsTitle: string;
  doorsLede: string;
  doorCliTitle: string;
  doorCliBody: string;
  doorGatewayTitle: string;
  doorGatewayBody: string;
  doorBrowserTitle: string;
  doorBrowserBody: string;
  doorAgentTitle: string;
  doorAgentBody: string;
  proofTitle: string;
  proofBody: string;
  proofRules: string;
  proofRoute: string;
  proofBatch: string;
  openTitle: string;
  openBody: string;
  openCta: string;
  finalTitle: string;
  finalBody: string;
  finalCta: string;
}

/** Shown quietly under the header on machine-drafted languages — the same
 *  honesty the trimming dictionaries carry: unreviewed, and saying so, with
 *  an invitation to a native speaker rather than a claim of authority. */
const UNREVIEWED_NOTE: Record<MarketingLocale, string> = {
  en: '',
  es: '',
  fr: 'Traduction automatique, non relue par un locuteur natif. Une correction ? Ouvrez une issue sur GitHub.',
  de: 'Maschinell übersetzt, nicht von Muttersprachlern geprüft. Fehler gefunden? Eröffnen Sie ein GitHub-Issue.',
  pt: 'Tradução automática, sem revisão de falante nativo. Encontrou um erro? Abra uma issue no GitHub.',
};

/** The first line of the README, verbatim: one door, nothing installed. */
const HERO_COMMAND = 'npx @trazum/cli bill usage.jsonl';

const COPY: Record<MarketingLocale, Copy> = {
  en: {
    localeName: 'English',
    heroTitle: 'You know what you spend on LLMs. Trazum tells you where.',
    heroCommandLabel: 'One line, nothing installed. Point it at whatever usage you have:',
    heroLede:
      'Deterministic prompt optimisation, token budgets in CI, a usage-log profiler that names what would actually move the bill, and spend ceilings enforced before a call is made. Measured, never estimated: every figure ships with its denominator.',
    ctaDemo: 'Open the live demo',
    ctaGitHub: 'Star on GitHub',
    storyLabel: 'The problem',
    story1Title: 'The bill grows and nobody can say which workload did it.',
    story1Body:
      'A support bot, a RAG pipeline and an agent share one invoice. Without labels on the calls, a 3x spike has no owner, and the tools that promise answers estimate instead of measuring.',
    story2Title: 'Estimates are how the wrong thing gets fixed.',
    story2Body:
      'Trazum prices the usage records your provider already returns, record by record, and refuses to print a forecast. A stale month is "cannot tell", a quiet day is a measured $0, and unpriced models are named instead of hidden in the total.',
    story3Title: 'The savings that matter are rarely in the prompt.',
    story3Body:
      'Shortening recovers about 1%. Which model a call goes to moves 60–80%, the Batch API moves 50% flat, and a cache whose TTL outlives its reuse loses money quietly. Trazum prices all of it from your own tokens.',
    doorsTitle: 'The same answer at the CLI, the gateway, the browser and the agent.',
    doorsLede:
      'One core does the measuring; four surfaces carry it. They cannot disagree, because they are the same functions.',
    doorCliTitle: 'CLI + CI',
    doorCliBody:
      '54 commands. Token budgets and drift baselines that exit 1, a pre-commit hook that is one pipe, and a GitHub Action that comments the report on your PR.',
    doorGatewayTitle: 'Gateway',
    doorGatewayBody:
      'Stands in front of the provider and refuses a call that breaks your spend policy (per day, per session, per label), with waivers that carry an author and an expiry.',
    doorBrowserTitle: 'Browser',
    doorBrowserBody:
      'Paste a usage log and read your bill, the what-if, and where the month stands against your ceilings. Nothing you paste leaves the page: there is no fetch, and a test holds it.',
    doorAgentTitle: 'Agents',
    doorAgentBody:
      'An MCP server with a spend guard your agent consults before it spends. Read usage from Anthropic, OpenAI, OpenRouter, OpenTelemetry and LiteLLM, plus local Claude Code transcripts: numbers only, never the words.',
    proofTitle: 'What one wordy support prompt gave back',
    proofBody:
      'The bundled demo prompt, aggressive level, one million calls a month. The product’s own output, not a projection:',
    proofRules: 'recovered by the rules, semantics intact',
    proofRoute: 'moving eligible calls to a cheaper model',
    proofBatch: 'flat, when the work tolerates a batch window',
    openTitle: 'The core is MIT, and stays MIT.',
    openBody:
      'The engine, the CLI, the MCP server, the format and its 24 contracts are open source. Adopt the format without adopting the tool. What will be paid, when it exists, is the hosted convenience around it: teams, a managed gateway, org-wide policy. The measuring never goes behind a paywall.',
    openCta: 'Read the code',
    finalTitle: 'Try it on your own bill.',
    finalBody:
      'The demo runs in your browser with your data staying in it, and the CLI is one npx away from your usage log.',
    finalCta: 'Open the demo',
  },
  es: {
    localeName: 'Español',
    heroTitle: 'Sabes lo que gastas en LLMs. Trazum te dice dónde.',
    heroCommandLabel: 'Una línea, sin instalar nada. Apúntala a cualquier uso que tengas:',
    heroLede:
      'Optimización determinista de prompts, presupuestos de tokens en CI, un perfilador de logs de uso que nombra lo que de verdad movería la factura, y techos de gasto aplicados antes de hacer la llamada. Medido, nunca estimado: cada cifra viaja con su denominador.',
    ctaDemo: 'Abrir la demo',
    ctaGitHub: 'Estrella en GitHub',
    storyLabel: 'El problema',
    story1Title: 'La factura crece y nadie sabe qué workload fue.',
    story1Body:
      'Un bot de soporte, un pipeline RAG y un agente comparten una factura. Sin etiquetas en las llamadas, un pico de 3x no tiene dueño, y las herramientas que prometen respuestas estiman en vez de medir.',
    story2Title: 'Las estimaciones son cómo se arregla lo que no era.',
    story2Body:
      'Trazum tasa los registros de uso que tu proveedor ya devuelve, registro a registro, y se niega a imprimir un pronóstico. Un mes rancio es «no se puede saber», un día tranquilo es un $0 medido, y los modelos sin precio se nombran en vez de esconderse en el total.',
    story3Title: 'El ahorro que importa casi nunca está en el prompt.',
    story3Body:
      'Acortar recupera ~1%. A qué modelo va cada llamada mueve un 60–80%, el Batch API un 50% plano, y una caché cuyo TTL sobrevive a su reuso pierde dinero en silencio. Trazum lo tasa todo desde tus propios tokens.',
    doorsTitle: 'La misma respuesta en el CLI, el gateway, el navegador y el agente.',
    doorsLede:
      'Un solo núcleo mide; cuatro superficies lo llevan. No pueden estar en desacuerdo, porque son las mismas funciones.',
    doorCliTitle: 'CLI + CI',
    doorCliBody:
      '53 comandos. Presupuestos de tokens y baselines de deriva que salen con 1, un hook de pre-commit que es una tubería, y una GitHub Action que comenta el informe en tu PR.',
    doorGatewayTitle: 'Gateway',
    doorGatewayBody:
      'Se pone delante del proveedor y rechaza la llamada que rompe tu política de gasto (por día, por sesión, por etiqueta), con waivers que llevan autor y caducidad.',
    doorBrowserTitle: 'Navegador',
    doorBrowserBody:
      'Pega un log de uso y lee tu factura, el what-if y dónde está el mes contra tus techos. Nada de lo que pegas sale de la página: no hay ningún fetch, y un test lo vigila.',
    doorAgentTitle: 'Agentes',
    doorAgentBody:
      'Un servidor MCP con un guardián de gasto que tu agente consulta antes de gastar. Lee uso de Anthropic, OpenAI, OpenRouter, OpenTelemetry y LiteLLM, además de transcripts locales de Claude Code: solo los números, jamás las palabras.',
    proofTitle: 'Lo que devolvió un prompt de soporte verborreico',
    proofBody:
      'El prompt de demo incluido, nivel agresivo, un millón de llamadas al mes. La salida del propio producto, no una proyección:',
    proofRules: 'recuperado por las reglas, semántica intacta',
    proofRoute: 'moviendo llamadas elegibles a un modelo más barato',
    proofBatch: 'plano, cuando el trabajo tolera una ventana de batch',
    openTitle: 'El núcleo es MIT, y seguirá siendo MIT.',
    openBody:
      'El motor, el CLI, el servidor MCP, el formato y sus 24 contratos son open source. Adopta el formato sin adoptar la herramienta. Lo que será de pago, cuando exista, es la comodidad alojada alrededor: equipos, gateway gestionado, política a escala de organización. La medición nunca irá detrás de un muro de pago.',
    openCta: 'Leer el código',
    finalTitle: 'Pruébalo con tu propia factura.',
    finalBody:
      'La demo corre en tu navegador con tus datos sin salir de él, y el CLI está a un npx de tu log de uso.',
    finalCta: 'Abrir la demo',
  },
  fr: {
    localeName: 'Français',
    heroTitle: 'Vous savez ce que vous dépensez en LLM. Trazum vous dit où.',
    heroCommandLabel: 'Une ligne, rien à installer. Pointez-la vers n\'importe quel usage :',
    heroLede:
      'Optimisation déterministe des prompts, budgets de tokens en CI, un profileur de journaux d’usage qui nomme ce qui ferait vraiment bouger la facture, et des plafonds de dépense appliqués avant même l’appel. Mesuré, jamais estimé : chaque chiffre arrive avec son dénominateur.',
    ctaDemo: 'Ouvrir la démo',
    ctaGitHub: 'Star sur GitHub',
    storyLabel: 'Le problème',
    story1Title: 'La facture grimpe et personne ne sait quelle charge l’a fait.',
    story1Body:
      'Un bot de support, un pipeline RAG et un agent partagent une même facture. Sans étiquette sur les appels, un pic de 3× n’a pas de responsable, et les outils qui promettent des réponses estiment au lieu de mesurer.',
    story2Title: 'Les estimations, c’est ainsi qu’on corrige la mauvaise chose.',
    story2Body:
      'Trazum tarifie les enregistrements d’usage que votre fournisseur renvoie déjà, un par un, et refuse d’imprimer une prévision. Un mois périmé est « impossible à dire », une journée calme est un 0 $ mesuré, et les modèles non tarifés sont nommés plutôt que cachés dans le total.',
    story3Title: 'Les économies qui comptent sont rarement dans le prompt.',
    story3Body:
      'Raccourcir récupère environ 1 %. Le modèle vers lequel part un appel déplace 60–80 %, l’API Batch déplace 50 % à plat, et un cache dont le TTL survit à sa réutilisation perd de l’argent en silence. Trazum tarifie tout cela à partir de vos propres tokens.',
    doorsTitle: 'La même réponse au CLI, à la passerelle, au navigateur et à l’agent.',
    doorsLede:
      'Un seul cœur mesure ; quatre surfaces le portent. Ils ne peuvent pas diverger, car ce sont les mêmes fonctions.',
    doorCliTitle: 'CLI + CI',
    doorCliBody:
      '53 commandes. Budgets de tokens et lignes de base de dérive qui sortent en 1, un hook de pré-commit tenant en un pipe, et une GitHub Action qui commente le rapport sur votre PR.',
    doorGatewayTitle: 'Passerelle',
    doorGatewayBody:
      'Se place devant le fournisseur et refuse un appel qui casse votre politique de dépense (par jour, par session, par étiquette), avec des dérogations portant un auteur et une échéance.',
    doorBrowserTitle: 'Navigateur',
    doorBrowserBody:
      'Collez un journal d’usage et lisez votre facture, le what-if, et où en est le mois face à vos plafonds. Rien de ce que vous collez ne quitte la page : aucun fetch, et un test le garantit.',
    doorAgentTitle: 'Agents',
    doorAgentBody:
      'Un serveur MCP avec un garde de dépense que votre agent consulte avant de dépenser. Lisez les usages Anthropic, OpenAI, OpenRouter, OpenTelemetry et LiteLLM, ainsi que les transcriptions locales de Claude Code : les chiffres seulement, jamais les mots.',
    proofTitle: 'Ce qu’un prompt de support verbeux a rendu',
    proofBody:
      'Le prompt de démo fourni, niveau agressif, un million d’appels par mois. La sortie du produit lui-même, pas une projection :',
    proofRules: 'récupéré par les règles, sémantique intacte',
    proofRoute: 'en déplaçant les appels éligibles vers un modèle moins cher',
    proofBatch: 'à plat, quand le travail tolère une fenêtre de batch',
    openTitle: 'Le cœur est MIT, et reste MIT.',
    openBody:
      'Le moteur, le CLI, le serveur MCP, le format et ses 24 contrats sont open source. Adoptez le format sans adopter l’outil. Ce qui sera payant, le jour où cela existera, c’est le confort hébergé autour : équipes, passerelle gérée, politique à l’échelle de l’organisation. La mesure ne passe jamais derrière un péage.',
    openCta: 'Lire le code',
    finalTitle: 'Essayez-le sur votre propre facture.',
    finalBody:
      'La démo tourne dans votre navigateur, vos données y restent, et le CLI est à un npx de votre journal d’usage.',
    finalCta: 'Ouvrir la démo',
  },
  de: {
    localeName: 'Deutsch',
    heroTitle: 'Sie wissen, was Sie für LLMs ausgeben. Trazum sagt Ihnen, wofür.',
    heroCommandLabel: 'Eine Zeile, nichts zu installieren. Auf beliebige Nutzungsdaten richten:',
    heroLede:
      'Deterministische Prompt-Optimierung, Token-Budgets in der CI, ein Nutzungsprotokoll-Profiler, der benennt, was die Rechnung wirklich bewegt, und Ausgabengrenzen, die vor dem Aufruf greifen. Gemessen, nie geschätzt: Jede Zahl kommt mit ihrem Nenner.',
    ctaDemo: 'Live-Demo öffnen',
    ctaGitHub: 'Auf GitHub sternen',
    storyLabel: 'Das Problem',
    story1Title: 'Die Rechnung wächst, und niemand weiß, welche Last es war.',
    story1Body:
      'Ein Support-Bot, eine RAG-Pipeline und ein Agent teilen sich eine Rechnung. Ohne Labels an den Aufrufen hat ein 3×-Ausschlag keinen Verantwortlichen, und die Tools, die Antworten versprechen, schätzen, statt zu messen.',
    story2Title: 'Schätzungen sind der Weg, das Falsche zu beheben.',
    story2Body:
      'Trazum bepreist die Nutzungsdatensätze, die Ihr Anbieter ohnehin zurückgibt, Datensatz für Datensatz, und weigert sich, eine Prognose auszugeben. Ein veralteter Monat ist „nicht feststellbar“, ein ruhiger Tag ein gemessener 0 $, und nicht bepreiste Modelle werden benannt statt in der Summe versteckt.',
    story3Title: 'Die Einsparungen, die zählen, stecken selten im Prompt.',
    story3Body:
      'Kürzen bringt etwa 1 %. Welches Modell einen Aufruf bekommt, bewegt 60–80 %, die Batch-API bewegt glatt 50 %, und ein Cache, dessen TTL seine Wiederverwendung überdauert, verliert still Geld. Trazum bepreist all das aus Ihren eigenen Tokens.',
    doorsTitle: 'Dieselbe Antwort am CLI, am Gateway, im Browser und beim Agenten.',
    doorsLede:
      'Ein Kern misst; vier Oberflächen tragen es. Sie können nicht widersprechen, denn es sind dieselben Funktionen.',
    doorCliTitle: 'CLI + CI',
    doorCliBody:
      '53 Befehle. Token-Budgets und Drift-Baselines, die mit 1 beenden, ein Pre-Commit-Hook aus einer einzigen Pipe, und eine GitHub-Action, die den Bericht an Ihre PR kommentiert.',
    doorGatewayTitle: 'Gateway',
    doorGatewayBody:
      'Stellt sich vor den Anbieter und verweigert einen Aufruf, der Ihre Ausgaben-Richtlinie bricht (pro Tag, pro Sitzung, pro Label), mit Ausnahmen, die Autor und Ablaufdatum tragen.',
    doorBrowserTitle: 'Browser',
    doorBrowserBody:
      'Fügen Sie ein Nutzungsprotokoll ein und lesen Sie Ihre Rechnung, das Was-wäre-wenn und wo der Monat gegen Ihre Grenzen steht. Nichts, was Sie einfügen, verlässt die Seite: kein Fetch, und ein Test hält das fest.',
    doorAgentTitle: 'Agenten',
    doorAgentBody:
      'Ein MCP-Server mit Ausgabenprüfung vor dem Aufruf. Liest Nutzungsdaten von Anthropic, OpenAI, OpenRouter, OpenTelemetry und LiteLLM sowie lokale Claude-Code-Transkripte: nur die Zahlen, nie die Worte.',
    proofTitle: 'Was ein wortreicher Support-Prompt zurückgab',
    proofBody:
      'Der mitgelieferte Demo-Prompt, aggressive Stufe, eine Million Aufrufe im Monat. Die eigene Ausgabe des Produkts, keine Projektion:',
    proofRules: 'von den Regeln zurückgeholt, Semantik intakt',
    proofRoute: 'geeignete Aufrufe auf ein günstigeres Modell verschoben',
    proofBatch: 'glatt, wenn die Arbeit ein Batch-Fenster verträgt',
    openTitle: 'Der Kern ist MIT und bleibt MIT.',
    openBody:
      'Die Engine, das CLI, der MCP-Server, das Format und seine 24 Verträge sind Open Source. Übernehmen Sie das Format, ohne das Tool zu übernehmen. Was kosten wird, sobald es existiert, ist der gehostete Komfort drumherum: Teams, ein verwaltetes Gateway, organisationsweite Richtlinien. Das Messen kommt nie hinter eine Bezahlschranke.',
    openCta: 'Den Code lesen',
    finalTitle: 'Probieren Sie es an Ihrer eigenen Rechnung.',
    finalBody:
      'Die Demo läuft in Ihrem Browser, Ihre Daten bleiben darin, und das CLI ist ein npx von Ihrem Nutzungsprotokoll entfernt.',
    finalCta: 'Demo öffnen',
  },
  pt: {
    localeName: 'Português',
    heroTitle: 'Você sabe quanto gasta em LLMs. O Trazum diz onde.',
    heroCommandLabel: 'Uma linha, nada instalado. Aponte para qualquer uso que você tenha:',
    heroLede:
      'Otimização determinística de prompts, orçamentos de tokens no CI, um analisador de registos de uso que nomeia o que realmente moveria a fatura, e tetos de gasto aplicados antes de fazer a chamada. Medido, nunca estimado: cada número viaja com o seu denominador.',
    ctaDemo: 'Abrir a demo',
    ctaGitHub: 'Estrela no GitHub',
    storyLabel: 'O problema',
    story1Title: 'A fatura cresce e ninguém sabe qual carga a fez.',
    story1Body:
      'Um bot de suporte, um pipeline RAG e um agente partilham uma fatura. Sem rótulos nas chamadas, um pico de 3× não tem dono, e as ferramentas que prometem respostas estimam em vez de medir.',
    story2Title: 'As estimativas são como se corrige a coisa errada.',
    story2Body:
      'O Trazum tarifa os registos de uso que o seu fornecedor já devolve, registo a registo, e recusa imprimir uma previsão. Um mês desatualizado é «não dá para saber», um dia calmo é um 0 $ medido, e os modelos sem preço são nomeados em vez de escondidos no total.',
    story3Title: 'As poupanças que importam raramente estão no prompt.',
    story3Body:
      'Encurtar recupera cerca de 1 %. Para que modelo vai uma chamada move 60–80 %, a API Batch move 50 % fixos, e uma cache cujo TTL sobrevive à sua reutilização perde dinheiro em silêncio. O Trazum tarifa tudo isso a partir dos seus próprios tokens.',
    doorsTitle: 'A mesma resposta no CLI, no gateway, no navegador e no agente.',
    doorsLede:
      'Um só núcleo mede; quatro superfícies levam-no. Não podem discordar, porque são as mesmas funções.',
    doorCliTitle: 'CLI + CI',
    doorCliBody:
      '53 comandos. Orçamentos de tokens e baselines de deriva que saem com 1, um hook de pré-commit que é um só pipe, e uma GitHub Action que comenta o relatório no seu PR.',
    doorGatewayTitle: 'Gateway',
    doorGatewayBody:
      'Coloca-se à frente do fornecedor e recusa uma chamada que quebra a sua política de gasto (por dia, por sessão, por rótulo), com dispensas que trazem autor e validade.',
    doorBrowserTitle: 'Navegador',
    doorBrowserBody:
      'Cole um registo de uso e leia a sua fatura, o what-if, e onde está o mês face aos seus tetos. Nada do que cola sai da página: não há fetch, e um teste garante-o.',
    doorAgentTitle: 'Agentes',
    doorAgentBody:
      'Um servidor MCP com um guarda de gasto que o seu agente consulta antes de gastar. Leia uso de Anthropic, OpenAI, OpenRouter, OpenTelemetry e LiteLLM, além de transcrições locais do Claude Code: só os números, nunca as palavras.',
    proofTitle: 'O que um prompt de suporte prolixo devolveu',
    proofBody:
      'O prompt de demo incluído, nível agressivo, um milhão de chamadas por mês. A saída do próprio produto, não uma projeção:',
    proofRules: 'recuperado pelas regras, semântica intacta',
    proofRoute: 'movendo chamadas elegíveis para um modelo mais barato',
    proofBatch: 'fixo, quando o trabalho tolera uma janela de batch',
    openTitle: 'O núcleo é MIT, e continua MIT.',
    openBody:
      'O motor, o CLI, o servidor MCP, o formato e os seus 24 contratos são open source. Adote o formato sem adotar a ferramenta. O que será pago, quando existir, é a comodidade alojada à volta: equipas, gateway gerido, política à escala da organização. A medição nunca vai para trás de um muro de pagamento.',
    openCta: 'Ler o código',
    finalTitle: 'Experimente na sua própria fatura.',
    finalBody:
      'A demo corre no seu navegador, os seus dados ficam nele, e o CLI está a um npx do seu registo de uso.',
    finalCta: 'Abrir a demo',
  },
};

const GITHUB = 'https://github.com/Davmunrey/Trazum';

/** The bar encodes the verified reduction for the bundled demo prompt. */
function LedgerFigure() {
  return (
    <svg viewBox="0 0 420 92" aria-hidden="true" className="h-auto w-full" role="presentation">
      {[0, 84, 168, 252, 336, 420].map((x) => (
        <line key={x} x1={x} y1="0" x2={x} y2="92" stroke="currentColor" opacity="0.14" />
      ))}
      <rect x="0" y="22" width="420" height="18" className="fill-muted stroke-foreground" strokeWidth="2" />
      <rect x="0" y="54" width="335.58" height="18" className="ledger-bar fill-primary stroke-foreground" strokeWidth="2" />
    </svg>
  );
}

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="h-5 w-5 shrink-0">
      <path d={diagonal ? 'M5 19 19 5M5 5h14v14' : 'M4 12h16m-6-6 6 6-6 6'} />
    </svg>
  );
}

export default function Landing() {
  const [locale, setLocale] = useMarketingLocale();
  const t = COPY[locale];
  const reviewed = MARKETING_LOCALE_META[locale].reviewed;
  const doors = [
    [t.doorCliTitle, t.doorCliBody, '>_'],
    [t.doorGatewayTitle, t.doorGatewayBody, '→|'],
    [t.doorBrowserTitle, t.doorBrowserBody, '[ ]'],
    [t.doorAgentTitle, t.doorAgentBody, '/mcp'],
  ];
  const stories = [
    [t.story1Title, t.story1Body],
    [t.story2Title, t.story2Body],
    [t.story3Title, t.story3Body],
  ];

  return (
    <main className="min-h-dvh overflow-x-clip bg-background text-foreground" lang={locale}>
      <ScrollProgress />
      <header className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-6 gap-y-4 border-b-2 border-foreground px-5 py-6 sm:px-10 lg:px-16">
        <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-75">
          <span className="font-display text-[34px] font-bold tracking-[-0.04em]">Trazum</span>
        </Link>
        <div className="flex flex-wrap items-center gap-4 sm:gap-8">
          <a href={GITHUB} target="_blank" rel="noreferrer noopener" className="hidden items-center gap-2 text-sm font-medium transition-colors hover:text-terracotta sm:inline-flex">
            GitHub <Arrow diagonal />
          </a>
          <LocaleToggle locale={locale} onChange={setLocale} />
        </div>
      </header>

      {!reviewed && (
        <div className="mx-auto max-w-[1440px] px-5 pt-5 sm:px-10 lg:px-16">
          <p className="border-l-2 border-warn bg-warn-wash px-4 py-3 text-sm leading-relaxed text-warn">{UNREVIEWED_NOTE[locale]}</p>
        </div>
      )}

      <section className="mx-auto max-w-[1440px] px-5 pt-14 pb-16 sm:px-10 sm:pt-20 lg:px-16 lg:pt-24 lg:pb-24">
        <h1 className="max-w-[21ch] font-display text-[clamp(43px,7.6vw,110px)] leading-[0.98] font-bold tracking-[-0.04em] [text-wrap:balance]">
          {t.heroTitle}
        </h1>
        <div className="mt-10 grid gap-10 border-t-2 border-foreground pt-8 lg:mt-14 lg:grid-cols-[1.05fr_1fr] lg:gap-20">
          <div>
            <p className="max-w-[60ch] text-[16px] leading-[1.75] text-muted-foreground sm:text-[18px]">{t.heroLede}</p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
              <Link href="/" className="inline-flex min-h-12 items-center gap-7 border-2 border-foreground bg-primary px-6 py-3 text-[15px] font-bold text-primary-foreground shadow-[4px_4px_0_var(--foreground)] transition-colors hover:bg-primary/85">
                {t.ctaDemo} <Arrow />
              </Link>
              <a href={GITHUB} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-12 items-center gap-2 border-b-2 border-current text-sm font-semibold transition-colors hover:text-terracotta">
                {t.ctaGitHub} <Arrow diagonal />
              </a>
            </div>
          </div>
          <div className="min-w-0 border-2 border-foreground bg-layer p-5 sm:p-7">
            <p className="max-w-[50ch] text-sm leading-relaxed text-muted-foreground">{t.heroCommandLabel}</p>
            <pre className="mt-4 overflow-x-auto border-y-2 border-foreground py-5 font-mono text-[12px] leading-[1.7] sm:text-[14px]"><code>{HERO_COMMAND}</code></pre>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 font-mono text-xs text-muted-foreground" aria-hidden="true">
              <span>CLI</span><span>CI</span><span>MCP</span><span>Gateway</span><span>MIT</span>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y-2 border-foreground bg-layer">
        <div className="mx-auto grid max-w-[1440px] gap-12 px-5 py-16 sm:px-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-24 lg:px-16 lg:py-24">
          <div>
            <h2 className="max-w-[20ch] font-display text-[clamp(32px,3.8vw,52px)] leading-[1.13] font-bold tracking-[-0.035em]">{t.proofTitle}</h2>
            <p className="mt-5 max-w-[54ch] text-base leading-[1.75] text-muted-foreground">{t.proofBody}</p>
            <div className="mt-8 max-w-[420px]"><LedgerFigure /></div>
          </div>
          <dl className="border-2 border-foreground">
            {[
              ['−20.1%', t.proofRules],
              ['60–80%', t.proofRoute],
              ['−50%', t.proofBatch],
            ].map(([figure, caption], index) => (
              <div key={figure} className={`grid items-baseline gap-3 px-5 py-6 sm:grid-cols-[1fr_1fr] sm:gap-5 ${index === 0 ? 'bg-primary text-primary-foreground' : 'border-t-2 border-foreground'}`}>
                <dt className="font-display text-[clamp(40px,4.5vw,64px)] leading-none tracking-[-0.05em] font-bold tabular-nums">{figure}</dt>
                <dd className="max-w-[28ch] text-sm leading-[1.65]">{caption}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-5 py-16 sm:px-10 lg:px-16 lg:py-24">
        <div className="flex items-baseline justify-between gap-6 border-b-2 border-foreground pb-5">
          <h2 className="font-display text-3xl font-bold tracking-[-0.03em] sm:text-4xl">{t.storyLabel}</h2>
          <span aria-hidden="true" className="font-mono text-xs text-muted-foreground">01 / 03</span>
        </div>
        {stories.map(([title, body], index) => (
          <article key={title} className="grid gap-5 border-b-2 border-foreground py-9 sm:grid-cols-[40px_1fr] sm:gap-x-7 lg:grid-cols-[64px_1fr_1fr] lg:gap-12 lg:py-12">
            <span aria-hidden="true" className="pt-1 font-mono text-sm text-terracotta">0{index + 1}</span>
            <h3 className="max-w-[25ch] font-display text-[clamp(27px,2.8vw,38px)] leading-[1.18] font-bold tracking-[-0.03em]">{title}</h3>
            <p className="max-w-[60ch] text-base leading-[1.8] text-muted-foreground sm:col-start-2 lg:col-start-auto">{body}</p>
          </article>
        ))}
      </section>

      <section className="border-y-2 border-foreground bg-layer">
        <div className="mx-auto max-w-[1440px] px-5 py-16 sm:px-10 lg:px-16 lg:py-24">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:gap-20">
            <h2 className="max-w-[26ch] font-display text-[clamp(32px,3.8vw,52px)] leading-[1.13] font-bold tracking-[-0.035em]">{t.doorsTitle}</h2>
            <p className="max-w-[54ch] self-end text-base leading-[1.75] text-muted-foreground">{t.doorsLede}</p>
          </div>
          <dl className="mt-12 border-t-2 border-foreground lg:mt-16">
            {doors.map(([title, body, symbol]) => (
              <div key={title} className="grid gap-4 border-b-2 border-foreground py-7 sm:grid-cols-[1fr_2fr] sm:gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:py-9">
                <dt className="flex items-baseline gap-5 font-display text-[25px] font-bold tracking-[-0.025em]">
                  <span aria-hidden="true" className="w-12 shrink-0 font-mono text-base tracking-normal text-terracotta">{symbol}</span>{title}
                </dt>
                <dd className="max-w-[65ch] text-[15px] leading-[1.8] text-muted-foreground">{body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1440px] gap-8 px-5 py-16 sm:px-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-24 lg:px-16 lg:py-24">
        <h2 className="max-w-[18ch] font-display text-[clamp(34px,4vw,56px)] leading-[1.12] font-bold tracking-[-0.035em]">{t.openTitle}</h2>
        <div>
          <p className="max-w-[65ch] text-base leading-[1.8] text-muted-foreground">{t.openBody}</p>
          <a href={GITHUB} target="_blank" rel="noreferrer noopener" className="mt-6 inline-flex min-h-11 items-center gap-8 border-b-2 border-current text-sm font-semibold transition-colors hover:text-terracotta">
            {t.openCta} <Arrow diagonal />
          </a>
        </div>
      </section>

      <section className="bg-foreground text-background">
        <div className="mx-auto max-w-[1440px] px-5 py-16 sm:px-10 lg:px-16 lg:py-24">
          <div className="grid items-end gap-9 lg:grid-cols-[1.2fr_0.8fr] lg:gap-20">
            <h2 className="max-w-[19ch] font-display text-[clamp(44px,6vw,84px)] leading-[1.04] font-bold tracking-[-0.05em]">{t.finalTitle}</h2>
            <div>
              <p className="max-w-[50ch] text-base leading-[1.75]">{t.finalBody}</p>
              <Link href="/" className="mt-7 inline-flex min-h-12 items-center gap-8 border-2 border-background bg-primary px-6 py-3 text-[15px] font-bold text-primary-foreground shadow-[4px_4px_0_var(--background)] transition-opacity hover:opacity-85">
                {t.finalCta} <Arrow />
              </Link>
            </div>
          </div>
          <footer className="mt-16 flex flex-wrap items-center justify-between gap-6 border-t-2 border-background pt-7 lg:mt-24">
            <span className="flex items-center gap-3 font-display text-3xl font-bold tracking-[-0.045em]">Trazum</span>
            <a href={GITHUB} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-3 text-sm transition-opacity hover:opacity-75">GitHub <Arrow diagonal /></a>
          </footer>
        </div>
      </section>
    </main>
  );
}
