'use client';

import Link from 'next/link';

import { LocaleToggle, Reveal, ScrollProgress, useStoredLocale } from '../../components/marketing';

/**
 * The landing — the one Persuade surface in an app that otherwise operates.
 *
 * The copy is local to the page rather than threaded through the app's
 * message catalogue: no component shares these sentences, and a landing
 * iterates at a different rhythm than the product's copy. Both locales are
 * complete by construction — the type below makes a missing key a build
 * error, which is the same guarantee the catalogue gives the app.
 *
 * Every number on this page is one the product itself printed: the -37.4%
 * is `optimize --level aggressive` over the demo prompt with a 1M-call
 * scenario, the 40-80% and 50% are the model-routing and Batch spans the
 * profile report states, and none of it is a testimonial, a logo wall or a
 * projection — the product refuses to forecast, and so does its landing.
 */

interface Copy {
  localeName: string;
  heroEyebrow: string;
  heroTitle: string;
  heroLede: string;
  ctaDemo: string;
  ctaGitHub: string;
  storyEyebrow: string;
  story1Title: string;
  story1Body: string;
  story2Title: string;
  story2Body: string;
  story3Title: string;
  story3Body: string;
  doorsEyebrow: string;
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
  proofEyebrow: string;
  proofTitle: string;
  proofBody: string;
  proofRules: string;
  proofRoute: string;
  proofBatch: string;
  openEyebrow: string;
  openTitle: string;
  openBody: string;
  openCta: string;
  finalTitle: string;
  finalBody: string;
  finalCta: string;
}

const COPY: Record<'en' | 'es', Copy> = {
  en: {
    localeName: 'English',
    heroEyebrow: 'Trazum — prompt cost analyser',
    heroTitle: 'You know what you spend on LLMs. Trazum tells you where.',
    heroLede:
      'Deterministic prompt optimisation, token budgets in CI, a usage-log profiler that names what would actually move the bill, and spend ceilings enforced before a call is made. Measured, never estimated — every figure ships with its denominator.',
    ctaDemo: 'Open the live demo',
    ctaGitHub: 'Star on GitHub',
    storyEyebrow: 'The problem',
    story1Title: 'The bill grows and nobody can say which workload did it.',
    story1Body:
      'A support bot, a RAG pipeline and an agent share one invoice. Without labels on the calls, a 3x spike has no owner — and the tools that promise answers estimate instead of measuring.',
    story2Title: 'Estimates are how the wrong thing gets fixed.',
    story2Body:
      'Trazum prices the usage records your provider already returns, record by record, and refuses to print a forecast. A stale month is "cannot tell", a quiet day is a measured $0, and unpriced models are named instead of hidden in the total.',
    story3Title: 'The savings that matter are rarely in the prompt.',
    story3Body:
      'Shortening recovers about 1%. Which model a call goes to moves 40–80%, the Batch API moves 50% flat, and a cache whose TTL outlives its reuse loses money quietly. Trazum prices all of it from your own tokens.',
    doorsEyebrow: 'One policy, every door',
    doorsTitle: 'The same answer at the CLI, the gateway, the browser and the agent.',
    doorsLede:
      'One core does the measuring; four surfaces carry it. They cannot disagree, because they are the same functions.',
    doorCliTitle: 'CLI + CI',
    doorCliBody:
      '39 commands. Token budgets and drift baselines that exit 1, a pre-commit hook that is one pipe, and a GitHub Action that comments the report on your PR.',
    doorGatewayTitle: 'Gateway',
    doorGatewayBody:
      'Stands in front of the provider and refuses a call that breaks your spend policy — per day, per session, per label — with waivers that carry an author and an expiry.',
    doorBrowserTitle: 'Browser',
    doorBrowserBody:
      'Paste a usage log and read your bill, the what-if, and where the month stands against your ceilings. Nothing you paste leaves the page — there is no fetch, and a test holds it.',
    doorAgentTitle: 'Agents',
    doorAgentBody:
      'An MCP server with a spend guard your agent consults before it spends, and a converter that prices your Claude Code sessions from the transcripts already on disk — numbers only, never the words.',
    proofEyebrow: 'Measured on the demo prompt',
    proofTitle: 'What one wordy support prompt gave back',
    proofBody:
      'The bundled demo prompt, aggressive level, one million calls a month — the product’s own output, not a projection:',
    proofRules: 'recovered by the rules, semantics intact',
    proofRoute: 'moving eligible calls to a cheaper model',
    proofBatch: 'flat, when the work tolerates a batch window',
    openEyebrow: 'Open source',
    openTitle: 'The core is MIT, and stays MIT.',
    openBody:
      'The engine, the CLI, the MCP server, the format and its nineteen contracts are open source — adopt the format without adopting the tool. What will be paid, when it exists, is the hosted convenience around it: teams, a managed gateway, org-wide policy. The measuring never goes behind a paywall.',
    openCta: 'Read the code',
    finalTitle: 'Try it on your own bill.',
    finalBody:
      'The demo runs in your browser with your data staying in it, and the CLI is one npx away from your usage log.',
    finalCta: 'Open the demo',
  },
  es: {
    localeName: 'Español',
    heroEyebrow: 'Trazum — analizador de costes de prompts',
    heroTitle: 'Sabes lo que gastas en LLMs. Trazum te dice dónde.',
    heroLede:
      'Optimización determinista de prompts, presupuestos de tokens en CI, un perfilador de logs de uso que nombra lo que de verdad movería la factura, y techos de gasto aplicados antes de hacer la llamada. Medido, nunca estimado — cada cifra viaja con su denominador.',
    ctaDemo: 'Abrir la demo',
    ctaGitHub: 'Estrella en GitHub',
    storyEyebrow: 'El problema',
    story1Title: 'La factura crece y nadie sabe qué workload fue.',
    story1Body:
      'Un bot de soporte, un pipeline RAG y un agente comparten una factura. Sin etiquetas en las llamadas, un pico de 3x no tiene dueño — y las herramientas que prometen respuestas estiman en vez de medir.',
    story2Title: 'Las estimaciones son cómo se arregla lo que no era.',
    story2Body:
      'Trazum tasa los registros de uso que tu proveedor ya devuelve, registro a registro, y se niega a imprimir un pronóstico. Un mes rancio es «no se puede saber», un día tranquilo es un $0 medido, y los modelos sin precio se nombran en vez de esconderse en el total.',
    story3Title: 'El ahorro que importa casi nunca está en el prompt.',
    story3Body:
      'Acortar recupera ~1%. A qué modelo va cada llamada mueve un 40–80%, el Batch API un 50% plano, y una caché cuyo TTL sobrevive a su reuso pierde dinero en silencio. Trazum lo tasa todo desde tus propios tokens.',
    doorsEyebrow: 'Una política, todas las puertas',
    doorsTitle: 'La misma respuesta en el CLI, el gateway, el navegador y el agente.',
    doorsLede:
      'Un solo núcleo mide; cuatro superficies lo llevan. No pueden estar en desacuerdo, porque son las mismas funciones.',
    doorCliTitle: 'CLI + CI',
    doorCliBody:
      '39 comandos. Presupuestos de tokens y baselines de deriva que salen con 1, un hook de pre-commit que es una tubería, y una GitHub Action que comenta el informe en tu PR.',
    doorGatewayTitle: 'Gateway',
    doorGatewayBody:
      'Se pone delante del proveedor y rechaza la llamada que rompe tu política de gasto — por día, por sesión, por etiqueta — con waivers que llevan autor y caducidad.',
    doorBrowserTitle: 'Navegador',
    doorBrowserBody:
      'Pega un log de uso y lee tu factura, el what-if y dónde está el mes contra tus techos. Nada de lo que pegas sale de la página — no hay ningún fetch, y un test lo vigila.',
    doorAgentTitle: 'Agentes',
    doorAgentBody:
      'Un servidor MCP con un guardián de gasto que tu agente consulta antes de gastar, y un conversor que tasa tus sesiones de Claude Code desde los transcripts que ya tienes en disco — solo los números, jamás las palabras.',
    proofEyebrow: 'Medido sobre el prompt de demo',
    proofTitle: 'Lo que devolvió un prompt de soporte verborreico',
    proofBody:
      'El prompt de demo incluido, nivel agresivo, un millón de llamadas al mes — la salida del propio producto, no una proyección:',
    proofRules: 'recuperado por las reglas, semántica intacta',
    proofRoute: 'moviendo llamadas elegibles a un modelo más barato',
    proofBatch: 'plano, cuando el trabajo tolera una ventana de batch',
    openEyebrow: 'Open source',
    openTitle: 'El núcleo es MIT, y seguirá siendo MIT.',
    openBody:
      'El motor, el CLI, el servidor MCP, el formato y sus diecinueve contratos son open source — adopta el formato sin adoptar la herramienta. Lo que será de pago, cuando exista, es la comodidad alojada alrededor: equipos, gateway gestionado, política a escala de organización. La medición nunca irá detrás de un muro de pago.',
    openCta: 'Leer el código',
    finalTitle: 'Pruébalo con tu propia factura.',
    finalBody:
      'La demo corre en tu navegador con tus datos sin salir de él, y el CLI está a un npx de tu log de uso.',
    finalCta: 'Abrir la demo',
  },
};

const GITHUB = 'https://github.com/Davmunrey/Trazum';

export default function Landing() {
  const [locale, setLocale] = useStoredLocale();
  const t = COPY[locale];
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <ScrollProgress />

      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 pt-6">
        <Link href="/" className="font-display text-xl font-bold">
          Trazum
        </Link>
        <LocaleToggle locale={locale} onChange={setLocale} />
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 pb-20 pt-16 sm:pt-24">
        <Reveal>
          <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-terracotta">
            {t.heroEyebrow}
          </p>
        </Reveal>
        <Reveal delay={80}>
          <h1 className="mt-4 max-w-[24ch] font-display text-[clamp(34px,6vw,58px)] font-bold leading-[1.05] [text-wrap:balance]">
            {t.heroTitle}
          </h1>
        </Reveal>
        <Reveal delay={160}>
          <p className="mt-6 max-w-[62ch] text-[17px] leading-relaxed text-muted-foreground">
            {t.heroLede}
          </p>
        </Reveal>
        <Reveal delay={240}>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/"
              className="rounded-lg bg-terracotta px-5 py-2.5 text-[15px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              {t.ctaDemo}
            </Link>
            <a
              href={GITHUB}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-lg border px-5 py-2.5 text-[15px] font-semibold transition-colors hover:bg-layer-hover"
            >
              {t.ctaGitHub}
            </a>
          </div>
        </Reveal>
      </section>

      {/* Scrollytelling: the story, three beats with a sticky rail */}
      <section className="border-t bg-layer">
        <div className="mx-auto grid max-w-5xl gap-10 px-6 py-20 lg:grid-cols-[240px_1fr]">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-terracotta">
              {t.storyEyebrow}
            </p>
          </div>
          <div className="flex flex-col gap-16">
            {[
              [t.story1Title, t.story1Body],
              [t.story2Title, t.story2Body],
              [t.story3Title, t.story3Body],
            ].map(([title, body], index) => (
              <Reveal key={title} delay={index * 60}>
                <h2 className="max-w-[28ch] font-display text-[clamp(24px,3.4vw,34px)] font-bold leading-tight [text-wrap:balance]">
                  {title}
                </h2>
                <p className="mt-4 max-w-[62ch] text-[16px] leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* The four doors */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <Reveal>
          <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-terracotta">
            {t.doorsEyebrow}
          </p>
          <h2 className="mt-3 max-w-[30ch] font-display text-[clamp(24px,3.4vw,34px)] font-bold leading-tight [text-wrap:balance]">
            {t.doorsTitle}
          </h2>
          <p className="mt-3 max-w-[62ch] text-[16px] text-muted-foreground">{t.doorsLede}</p>
        </Reveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {[
            [t.doorCliTitle, t.doorCliBody],
            [t.doorGatewayTitle, t.doorGatewayBody],
            [t.doorBrowserTitle, t.doorBrowserBody],
            [t.doorAgentTitle, t.doorAgentBody],
          ].map(([title, body], index) => (
            <Reveal key={title} delay={index * 70}>
              <div className="h-full rounded-xl border bg-card p-6">
                <h3 className="font-display text-[19px] font-bold">{title}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Measured proof */}
      <section className="border-t bg-layer">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <Reveal>
            <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-terracotta">
              {t.proofEyebrow}
            </p>
            <h2 className="mt-3 font-display text-[clamp(24px,3.4vw,34px)] font-bold [text-wrap:balance]">
              {t.proofTitle}
            </h2>
            <p className="mt-3 max-w-[62ch] text-[16px] text-muted-foreground">{t.proofBody}</p>
          </Reveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              ['−37.4%', t.proofRules],
              ['40–80%', t.proofRoute],
              ['−50%', t.proofBatch],
            ].map(([figure, caption], index) => (
              <Reveal key={figure} delay={index * 70}>
                <div className="rounded-xl border bg-card p-6">
                  <div className="font-display text-[38px] font-bold text-good tabular-nums">
                    {figure}
                  </div>
                  <p className="mt-1 text-[14px] text-muted-foreground">{caption}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Open source */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <Reveal>
          <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-terracotta">
            {t.openEyebrow}
          </p>
          <h2 className="mt-3 max-w-[26ch] font-display text-[clamp(24px,3.4vw,34px)] font-bold [text-wrap:balance]">
            {t.openTitle}
          </h2>
          <p className="mt-4 max-w-[62ch] text-[16px] leading-relaxed text-muted-foreground">
            {t.openBody}
          </p>
          <a
            href={GITHUB}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-6 inline-block rounded-lg border px-5 py-2.5 text-[15px] font-semibold transition-colors hover:bg-layer-hover"
          >
            {t.openCta}
          </a>
        </Reveal>
      </section>

      {/* Final CTA */}
      <section className="border-t bg-layer">
        <div className="mx-auto max-w-5xl px-6 py-24 text-center">
          <Reveal>
            <h2 className="mx-auto max-w-[22ch] font-display text-[clamp(28px,4.5vw,44px)] font-bold [text-wrap:balance]">
              {t.finalTitle}
            </h2>
            <p className="mx-auto mt-4 max-w-[52ch] text-[16px] text-muted-foreground">
              {t.finalBody}
            </p>
            <Link
              href="/"
              className="mt-8 inline-block rounded-lg bg-terracotta px-6 py-3 text-[16px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              {t.finalCta}
            </Link>
          </Reveal>
        </div>
      </section>
    </main>
  );
}
