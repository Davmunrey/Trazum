'use client';

import { ArrowUpRight, Check, Copy, Download } from 'lucide-react';
import { useEffect, useState } from 'react';

import { docHref } from '../../lib/docs/manifest';
import type { BrandData, BrandFile, BrandToken } from '../../lib/history/types';
import type { MarketingLocale } from '../../lib/marketing-locales';
import { BRAND_COPY, type BrandCopy } from '../../lib/pages-copy';
import { COMMAND, GITHUB_URL } from '../../lib/site';
import { cn } from '../../lib/utils';
import { SiteFrame } from '../site/SiteFrame';

/**
 * `/brand`: the wordmark and the plain T to download, the colours, the
 * typeface, the voice and what not to do.
 *
 * A page for somebody who needs an asset or a rule and leaves, so it is made of
 * what they came for and nothing that persuades. Nothing on it is typed: the
 * colour values come from `globals.css`, the voice and the rules from
 * `DESIGN.md`, the files from the list the script that writes them uses, and
 * `scripts/build-site-pages.mjs` reads all of it when the site is built.
 * `site-pages.test.mjs` and `brand.test.js` hold each to its source.
 *
 * The files are previewed as the files themselves, so what is shown is what is
 * downloaded. The grounds a preview sits on are the two themes' canvas tokens,
 * whatever theme the visitor is in, because a wordmark for a dark ground has to
 * be seen on one.
 *
 * The copy buttons write to the clipboard from the click and send nothing.
 * There is no symbol on the page but the two marks the design document names,
 * and no claim about the name: the licensing page says what there is to say.
 */

const WRAP = 'mx-auto w-full max-w-[1440px] px-4 sm:px-8 lg:px-12';
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground';
const MONO_HEAD = 'font-mono text-[11.5px] font-semibold tracking-[0.07em] uppercase';
const SECTION_TITLE = 'font-display text-[clamp(28px,3.2vw,44px)] leading-[1.06] font-bold tracking-[-0.035em]';
const DESIGN_URL = `${GITHUB_URL}/blob/main/DESIGN.md`;

const kilobytes = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

/** A token by its role, which the table names; `null` when the table has no such row. */
const roleOf = (tokens: readonly BrandToken[], role: string) => tokens.find((token) => token.role === role) ?? null;

function Download_({ file, t, what }: { file: BrandFile; t: BrandCopy; what: string }) {
  const ground = t.ground[file.ground].toLowerCase();
  return (
    <a
      href={file.href}
      download={file.name}
      data-download={file.name}
      aria-label={`${t.downloadLabel(what, file.format.toUpperCase(), ground)}, ${kilobytes(file.bytes)}`}
      className={cn(
        'group inline-flex min-h-12 items-center gap-3 border-2 border-foreground bg-background px-4 py-2 transition-colors hover:bg-primary hover:text-primary-foreground',
        FOCUS,
      )}
    >
      <Download className="size-[18px] shrink-0" aria-hidden="true" />
      <span className="flex flex-col leading-tight">
        <span className="font-mono text-[15px] font-bold tracking-[0.04em]">{file.format.toUpperCase()}</span>
        <span className="font-mono text-[12px] tabular-nums text-muted-foreground group-hover:text-primary-foreground">
          {t.ground[file.ground]} · {file.width === null ? '' : `${file.width} × ${file.height} px · `}
          {kilobytes(file.bytes)}
        </span>
      </span>
    </a>
  );
}

/** One mark on one ground: the file itself on that theme's canvas, and the two downloads under it. */
function Ground({
  mark,
  ground,
  files,
  canvas,
  t,
  tile,
}: {
  mark: 'wordmark' | 't';
  ground: 'light' | 'dark';
  files: readonly BrandFile[];
  canvas: string;
  t: BrandCopy;
  tile?: boolean;
}) {
  const own = files.filter((file) => file.mark === mark && file.ground === ground);
  const preview = own.find((file) => file.format === 'svg');
  const what = mark === 'wordmark' ? t.wordmarkName : t.tName;
  return (
    <figure data-mark={mark} data-ground={ground} className="flex min-w-0 flex-col border-2 border-foreground">
      <div
        style={{ background: canvas }}
        className={cn('flex items-center justify-center', tile ? 'px-6 py-10 lg:py-12' : 'px-6 py-12 sm:px-10 sm:py-16 lg:px-14 lg:py-20')}
      >
        {preview !== undefined && (
          // biome-ignore lint/performance/noImgElement: the file itself, so what is shown is what is downloaded
          <img
            src={preview.href}
            alt={t.previewLabel(what, t.ground[ground].toLowerCase())}
            className={cn('block h-auto max-w-full', tile ? 'w-[132px] sm:w-[156px]' : 'w-full max-w-[560px]')}
          />
        )}
      </div>
      <figcaption className="flex flex-col gap-3 border-t-2 border-foreground bg-background p-4">
        <p>
          <span className="font-display text-[20px] font-bold tracking-[-0.02em]">{t.ground[ground]}</span>
          <span className="ml-3 text-[14px] text-muted-foreground">{t.groundNote[ground]}</span>
        </p>
        <div className="flex flex-wrap gap-3">
          {own.map((file) => (
            <Download_ key={file.name} file={file} t={t} what={what} />
          ))}
        </div>
      </figcaption>
    </figure>
  );
}

/** A value and the control that copies it: the clipboard is written from the click, and nothing is sent. */
function Copy_({ value, t }: { value: string; t: BrandCopy }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Refused: the value is on the page to select by hand.
    }
  }
  return (
    <>
      <button
        type="button"
        onClick={copy}
        data-copy={value}
        aria-label={t.copyValue(value)}
        className={cn('inline-flex min-h-10 items-center gap-1.5 border-2 border-foreground bg-background px-2.5 text-[13px] font-semibold hover:bg-primary hover:text-primary-foreground', FOCUS)}
      >
        {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
        <span>{copied ? t.copied : t.copyText}</span>
      </button>
      <span role="status" className="sr-only">
        {copied ? `${t.copied}: ${value}` : ''}
      </span>
    </>
  );
}

function Swatch({ value, ground, t }: { value: string; ground: 'light' | 'dark'; t: BrandCopy }) {
  return (
    <div data-swatch={ground} className="flex min-w-0 items-center gap-3">
      <span aria-hidden="true" style={{ background: value }} className="size-12 shrink-0 border-2 border-foreground" />
      <code className="min-w-[7ch] font-mono text-[15px] font-medium tabular-nums">{value}</code>
      <Copy_ value={value} t={t} />
    </div>
  );
}

export function BrandPage({ initialLocale, brand }: { initialLocale: MarketingLocale; brand: BrandData }) {
  const canvas = roleOf(brand.tokens, 'Canvas');
  const fill = roleOf(brand.tokens, 'Primary fill');
  const weights = brand.typeface.weights;
  const weightList = weights === null ? [] : [weights.min, Math.round((weights.min + weights.max) / 2), weights.max];
  return (
    <SiteFrame initialLocale={initialLocale}>
      {(locale, site) => {
        const t = BRAND_COPY[locale];
        return (
          <>
            <section aria-labelledby="brand-title" className={`${WRAP} py-12 lg:py-20`}>
              <p className="font-mono text-[12px] font-semibold tracking-[0.1em] text-terracotta uppercase">Trazum</p>
              <h1 id="brand-title" className="mt-3 font-display text-[clamp(44px,8vw,104px)] leading-[0.98] font-bold tracking-[-0.045em]">
                {t.title}
              </h1>
              <p className="mt-5 max-w-[60ch] text-[18px] leading-[1.6] text-muted-foreground">{t.lede}</p>
              {locale !== 'en' && <p className="mt-4 max-w-[60ch] text-[14px] leading-relaxed">{t.englishNote}</p>}
              <p className="mt-6 max-w-[78ch] border-l-4 border-foreground pl-4 text-[14.5px] leading-relaxed" data-licence="">
                {t.licence}{' '}
                <a href={docHref('licensing')} className={cn('font-semibold text-terracotta underline underline-offset-4', FOCUS)}>
                  {t.licenceLink}
                </a>
              </p>
            </section>

            <section id="wordmark" aria-labelledby="brand-wordmark" className="scroll-mt-6 border-t-2 border-foreground">
              <div className={`${WRAP} py-10 lg:py-14`}>
                <h2 id="brand-wordmark" className={SECTION_TITLE}>
                  {t.wordmarkTitle}
                </h2>
                <p className="mt-3 max-w-[68ch] text-[15.5px] leading-relaxed text-muted-foreground">{t.wordmarkLede}</p>
                <div className="mt-8 grid gap-6 lg:grid-cols-2">
                  {(['light', 'dark'] as const).map((ground) => (
                    <Ground key={ground} mark="wordmark" ground={ground} files={brand.files} canvas={canvas?.[ground] ?? 'transparent'} t={t} />
                  ))}
                </div>
              </div>
            </section>

            <section id="t" aria-labelledby="brand-t" className="scroll-mt-6 border-t-2 border-foreground bg-layer">
              <div className={`${WRAP} py-10 lg:py-14`}>
                <h2 id="brand-t" className={SECTION_TITLE}>
                  {t.tTitle}
                </h2>
                <p className="mt-3 max-w-[68ch] text-[15.5px] leading-relaxed text-muted-foreground">{t.tLede}</p>
                <div className="mt-8 grid gap-6 lg:grid-cols-2">
                  {(['light', 'dark'] as const).map((ground) => (
                    <Ground key={ground} mark="t" ground={ground} files={brand.files} canvas={canvas?.[ground] ?? 'transparent'} t={t} tile />
                  ))}
                </div>
              </div>
            </section>

            <section id="colours" aria-labelledby="brand-colours" className="scroll-mt-6 border-t-2 border-foreground">
              <div className={`${WRAP} py-10 lg:py-14`}>
                <h2 id="brand-colours" className={SECTION_TITLE}>
                  {t.coloursTitle}
                </h2>
                <p className="mt-3 max-w-[68ch] text-[15.5px] leading-relaxed text-muted-foreground">{t.coloursLede}</p>
                <div className="mt-8 border-t-2 border-foreground">
                  <div aria-hidden="true" className={cn(MONO_HEAD, 'hidden gap-6 border-b border-rule py-2 text-muted-foreground lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)]')}>
                    <span>
                      {t.columns.role} · {t.columns.property}
                    </span>
                    <span>{t.columns.light}</span>
                    <span>{t.columns.dark}</span>
                  </div>
                  <ul>
                    {brand.tokens.map((token) => (
                      <li
                        key={token.variable}
                        data-token={token.variable}
                        className="grid gap-x-6 gap-y-3 border-b border-rule py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)] lg:items-center"
                      >
                        <div className="min-w-0">
                          <p lang="en" className="font-display text-[19px] leading-tight font-bold tracking-[-0.02em]">
                            {token.role}
                          </p>
                          <code className="mt-0.5 block font-mono text-[13px] text-muted-foreground [overflow-wrap:anywhere]">{token.variable}</code>
                        </div>
                        <div>
                          <p className={cn(MONO_HEAD, 'mb-1.5 text-muted-foreground lg:hidden')}>{t.columns.light}</p>
                          <Swatch value={token.light} ground="light" t={t} />
                        </div>
                        <div>
                          <p className={cn(MONO_HEAD, 'mb-1.5 text-muted-foreground lg:hidden')}>{t.columns.dark}</p>
                          <Swatch value={token.dark} ground="dark" t={t} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>

            <section id="typeface" aria-labelledby="brand-type" className="scroll-mt-6 border-t-2 border-foreground bg-layer">
              <div className={`${WRAP} py-10 lg:py-14`}>
                <h2 id="brand-type" className={SECTION_TITLE}>
                  {t.typeTitle}
                </h2>
                <p className="mt-3 max-w-[68ch] text-[15.5px] leading-relaxed text-muted-foreground">{t.typeLede}</p>
                <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-14">
                  <dl className="flex flex-col gap-4" data-typeface={brand.typeface.name}>
                    <div>
                      <dt className={cn(MONO_HEAD, 'text-muted-foreground')}>{t.typeFacts.family}</dt>
                      <dd className="mt-1 font-display text-[26px] leading-tight font-bold tracking-[-0.025em]">{brand.typeface.name}</dd>
                    </div>
                    {weights !== null && (
                      <div>
                        <dt className={cn(MONO_HEAD, 'text-muted-foreground')}>{t.typeFacts.weights}</dt>
                        <dd className="mt-1 text-[15px]">{t.weightsValue(String(weights.min), String(weights.max))}</dd>
                      </div>
                    )}
                    <div>
                      <dt className={cn(MONO_HEAD, 'text-muted-foreground')}>{t.typeFacts.mono}</dt>
                      <dd className="mt-1 font-mono text-[13px] leading-relaxed [overflow-wrap:anywhere]">{brand.typeface.mono}</dd>
                    </div>
                    {brand.typeface.packageName !== null && (
                      <div>
                        <dt className={cn(MONO_HEAD, 'text-muted-foreground')}>{t.typeFacts.package}</dt>
                        <dd className="mt-1 font-mono text-[13px] [overflow-wrap:anywhere]">{brand.typeface.packageName}</dd>
                      </div>
                    )}
                    {brand.typeface.license !== null && (
                      <div>
                        <dt className={cn(MONO_HEAD, 'text-muted-foreground')}>{t.typeFacts.licence}</dt>
                        <dd className="mt-1 font-mono text-[13px]">{brand.typeface.license}</dd>
                      </div>
                    )}
                  </dl>
                  <div className="min-w-0">
                    <p className={cn(MONO_HEAD, 'text-muted-foreground')}>{t.specimen}</p>
                    <p
                      lang="en"
                      aria-hidden="true"
                      data-specimen="name"
                      className="mt-2 font-display text-[clamp(64px,14vw,176px)] leading-[0.95] font-bold tracking-[-0.045em]"
                    >
                      Trazum
                    </p>
                    <ul className="mt-6 flex flex-col border-t-2 border-foreground">
                      {weightList.map((weight) => (
                        <li key={weight} data-weight={weight} className="flex items-baseline gap-4 border-b border-rule py-3">
                          <span className="w-10 shrink-0 font-mono text-[13px] tabular-nums text-muted-foreground">{weight}</span>
                          <span lang="en" style={{ fontWeight: weight }} className="font-display min-w-0 text-[clamp(18px,3.4vw,30px)] leading-tight [overflow-wrap:anywhere]">
                            ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className={cn(MONO_HEAD, 'mt-6 text-muted-foreground')}>{t.tabular}</p>
                    <p lang="en" className="mt-2 font-display text-[clamp(24px,4vw,40px)] leading-tight font-bold tracking-[-0.02em] tabular-nums">
                      0123456789
                    </p>
                    <p className="mt-3 font-mono text-[15px]">
                      <span aria-hidden="true" className="mr-2 text-muted-foreground select-none">
                        $
                      </span>
                      {COMMAND}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section id="voice" aria-labelledby="brand-voice" className="scroll-mt-6 border-t-2 border-foreground">
              <div className={`${WRAP} grid gap-6 py-10 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-14 lg:py-14`}>
                <div>
                  <h2 id="brand-voice" className={SECTION_TITLE}>
                    {t.voiceTitle}
                  </h2>
                  <p className="mt-3 max-w-[34ch] text-[15px] leading-relaxed text-muted-foreground">{t.voiceLede}</p>
                </div>
                <ol className="border-t-2 border-foreground" data-voice="">
                  {brand.voice.map((sentence, at) => (
                    <li key={sentence} lang="en" className="grid grid-cols-[40px_minmax(0,1fr)] gap-3 border-b border-rule py-5">
                      <span className="font-mono text-[14px] font-semibold tabular-nums text-muted-foreground">{String(at + 1).padStart(2, '0')}</span>
                      <p className="font-display text-[clamp(20px,2.4vw,28px)] leading-[1.25] font-semibold tracking-[-0.02em]">{sentence}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </section>

            <section id="dont" aria-labelledby="brand-dont" className="scroll-mt-6 border-t-2 border-foreground bg-layer">
              <div className={`${WRAP} grid gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:gap-14 lg:py-14`}>
                <div>
                  <h2 id="brand-dont" className={SECTION_TITLE}>
                    {t.dontTitle}
                  </h2>
                  <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-muted-foreground">{t.dontLede}</p>
                  <ol className="mt-6 border-t-2 border-foreground" data-dont="">
                    {brand.dont.map((rule, at) => (
                      <li key={rule} lang="en" className="grid grid-cols-[40px_minmax(0,1fr)] gap-3 border-b border-rule py-4">
                        <span className="font-mono text-[14px] font-semibold tabular-nums text-muted-foreground">{String(at + 1).padStart(2, '0')}</span>
                        <p className="max-w-[68ch] text-[16.5px] leading-[1.55]">{rule}</p>
                      </li>
                    ))}
                  </ol>
                </div>
                {canvas !== null && fill !== null && (
                  <figure data-wrong="" className="self-start">
                    <div
                      aria-hidden="true"
                      style={{ background: canvas.light, color: fill.light }}
                      className="relative border-2 border-dashed border-foreground px-6 py-12"
                    >
                      <span className="absolute top-0 left-0 bg-foreground px-2 py-1 font-mono text-[11px] font-bold tracking-[0.06em] text-background uppercase">{t.wrongTag}</span>
                      <p lang="en" className="font-display text-[56px] leading-none font-bold tracking-[-0.045em] sm:text-[72px]">
                        Trazum
                      </p>
                    </div>
                    <figcaption className="mt-3 max-w-[48ch] text-[14px] leading-relaxed text-muted-foreground">{t.wrongCaption}</figcaption>
                  </figure>
                )}
              </div>
            </section>

            <section aria-label={t.sourceLine} className="border-t-2 border-foreground">
              <div className={`${WRAP} flex flex-wrap items-center gap-x-6 gap-y-3 py-8`}>
                <p className="text-[15px]">{t.sourceLine}</p>
                <a
                  href={DESIGN_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={`${t.sourceLink}, ${site.opensExternal}`}
                  className={cn('inline-flex min-h-10 items-center gap-1.5 text-[15px] font-semibold text-terracotta underline underline-offset-4', FOCUS)}
                >
                  {t.sourceLink}
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </a>
              </div>
            </section>
          </>
        );
      }}
    </SiteFrame>
  );
}
