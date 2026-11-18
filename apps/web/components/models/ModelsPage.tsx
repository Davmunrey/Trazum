'use client';

import { ArrowUpRight, Search } from 'lucide-react';
import { useId, useMemo, useState, type ReactNode } from 'react';

import { MODELS_COPY, type ModelsCopy } from '../../lib/pages-copy';
import type { MarketingLocale } from '../../lib/marketing-locales';
import type {
  BandView,
  CatalogueView,
  ModelView,
  PeriodView,
  ProviderView,
  RateView,
  ServiceTierView,
  UnpricedView,
  WhenView,
} from '../../lib/models/view';
import { GITHUB_URL } from '../../lib/site';
import { cn } from '../../lib/utils';
import { GitHubMark } from '../site/GitHub';
import { SiteFrame } from '../site/SiteFrame';

/**
 * `/models`: the catalogue, one table per provider.
 *
 * The server draws every row, so the page is complete with no script, and the
 * two filters only hide what does not match. They run in this page: nothing
 * typed is sent, stored or put in the address. Every figure is a field of the
 * catalogue (`lib/models/view.ts` says how each is formatted) and the words
 * around them are the site's own, in its five languages.
 *
 * State is drawn in form as well as in words, so it does not depend on colour:
 * a retired model is an ink-filled tab and a dashed edge, a promotion is a
 * tab in the acid fill, and a model with no price is a dotted tab and a
 * dash where a rate would be.
 */

const WRAP = 'mx-auto w-full max-w-[1440px] px-4 sm:px-8 lg:px-12';
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground';
const MONO_HEAD = 'font-mono text-[11.5px] font-semibold tracking-[0.07em] uppercase';
const SECTION_TITLE = 'font-display text-[clamp(28px,3.2vw,44px)] leading-[1.06] font-bold tracking-[-0.035em]';

function matches(query: string, ...parts: (string | null | undefined)[]): boolean {
  if (query === '') return true;
  const haystack = parts.filter((part): part is string => typeof part === 'string').join(' ').toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== '')
    .every((word) => haystack.includes(word));
}

function Tab({ children, kind }: { children: ReactNode; kind: 'retired' | 'promo' | 'none' | 'plain' }) {
  return (
    <span
      data-state={kind}
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 font-mono text-[11px] leading-tight font-semibold tracking-[0.04em] uppercase',
        kind === 'retired' && 'bg-foreground text-background',
        kind === 'promo' && 'border-2 border-foreground bg-primary text-primary-foreground',
        kind === 'none' && 'border-2 border-dotted border-foreground',
        kind === 'plain' && 'border border-rule text-muted-foreground',
      )}
    >
      {children}
    </span>
  );
}

function Rates({ rates, t }: { rates: RateView | null; t: ModelsCopy }) {
  return rates === null ? <span className="text-muted-foreground">{t.noPrice}</span> : `${rates.input} / ${rates.output}`;
}

function whenText(when: WhenView, t: ModelsCopy): string {
  switch (when.kind) {
    case 'speed':
      return t.when.speed(when.speed);
    case 'above':
      return t.when.above(when.tokens);
    case 'at-least':
      return t.when.atLeast(when.tokens);
    case 'hours':
      return t.when.hours(when.hours.join(', '), when.weekdaysOnly);
  }
}

function Bands({ bands, t }: { bands: readonly BandView[]; t: ModelsCopy }) {
  if (bands.length === 0) return null;
  return (
    <ul className="mt-1 flex flex-col gap-1">
      {bands.map((band) => (
        <li key={band.id} data-band={band.id}>
          <span>{whenText(band.when, t)}</span>
          <span className="mx-2 text-muted-foreground">·</span>
          <span className="font-mono text-[13px] font-medium">
            <Rates rates={band.rates} t={t} />
          </span>
          <span className="ml-2 font-mono text-[11.5px] text-muted-foreground">{band.id}</span>
        </li>
      ))}
    </ul>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className={cn(MONO_HEAD, 'text-muted-foreground')}>{label}</dt>
      <dd className="mt-1 text-[14px] leading-relaxed [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function Period({ period, t }: { period: PeriodView; t: ModelsCopy }) {
  return (
    <li data-period={period.until}>
      <span>{t.detail.historyUntil(period.until)}</span>
      <span className="mx-2 text-muted-foreground">·</span>
      <span className="font-mono text-[13px] font-medium">
        <Rates rates={period.rates} t={t} />
      </span>
      <Bands bands={period.bands} t={t} />
    </li>
  );
}

function ServiceTier({ tier, t }: { tier: ServiceTierView; t: ModelsCopy }) {
  return (
    <li data-service-tier={tier.name}>
      <span className="font-mono text-[13px] font-semibold">{tier.name}</span>
      <span className="mx-2 text-muted-foreground">·</span>
      <span className="font-mono text-[13px] font-medium">
        <Rates rates={tier.rates} t={t} />
      </span>
      <Bands bands={tier.bands} t={t} />
    </li>
  );
}

function Details({ model, t }: { model: ModelView; t: ModelsCopy }) {
  return (
    <details className="group sticky left-0 w-[min(100%,calc(100vw-2rem))] border-t border-rule sm:w-[min(100%,calc(100vw-4rem))] lg:w-[min(100%,calc(100vw-6rem))]">
      <summary
        className={cn(
          'flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 py-1.5 text-[13.5px] font-semibold marker:hidden hover:bg-layer-hover [&::-webkit-details-marker]:hidden',
          FOCUS,
          'focus-visible:-outline-offset-2',
        )}
      >
        <span aria-hidden="true" className="inline-block w-3 font-mono transition-transform group-open:rotate-90">
          ›
        </span>
        {t.details}
      </summary>
      <dl className="grid gap-x-8 gap-y-4 px-3 pt-2 pb-4 sm:grid-cols-2 lg:grid-cols-3">
        {model.retired !== null && (
          <Fact label={t.states.retired}>
            <p>{t.detail.retiredOn(model.retired.on)}</p>
            <p className="mt-1 text-muted-foreground">
              {t.detail.providerAnswered}: <q lang="en">{model.retired.because}</q>
            </p>
          </Fact>
        )}
        {model.promo !== null && (
          <Fact label={t.detail.promo}>
            <span className="font-mono text-[13px] font-medium">
              <Rates rates={model.promo.rates} t={t} />
            </span>
            <span className="ml-2">{t.detail.promoUntil(model.promo.until)}</span>
            {model.promo.confirmedOn !== null && <p className="mt-1 text-muted-foreground">{t.detail.promoConfirmed(model.promo.confirmedOn)}</p>}
          </Fact>
        )}
        <Fact label={t.detail.cache}>
          <p>{t.caching[model.caching]}</p>
          {model.cacheMinTokens !== null && <p className="text-muted-foreground">{t.cacheMin(model.cacheMinTokens)}</p>}
          {model.cacheWrites.map((write) => (
            <p key={write.minutes} className="font-mono text-[13px]">
              {t.cacheWrite(write.multiplier, write.minutes)}
            </p>
          ))}
        </Fact>
        {model.bands.length > 0 && (
          <Fact label={t.detail.bands}>
            <Bands bands={model.bands} t={t} />
          </Fact>
        )}
        {model.serviceTiers.length > 0 && (
          <Fact label={t.detail.serviceTiers}>
            <ul className="flex flex-col gap-2">
              {model.serviceTiers.map((tier) => (
                <ServiceTier key={tier.name} tier={tier} t={t} />
              ))}
            </ul>
          </Fact>
        )}
        {model.history.length > 0 && (
          <Fact label={t.detail.history}>
            <ul className="flex flex-col gap-2">
              {model.history.map((period) => (
                <Period key={period.until} period={period} t={t} />
              ))}
            </ul>
            <p className="mt-2 text-muted-foreground">{t.detail.rowRates}</p>
          </Fact>
        )}
        {model.geo.length > 0 && (
          <Fact label={t.detail.geo}>
            {model.geo.map((geo) => (
              <p key={geo.name} className="font-mono text-[13px]">
                {geo.name} {geo.multiplier}
              </p>
            ))}
          </Fact>
        )}
        {model.webSearch !== null && (
          <Fact label={t.detail.webSearch}>
            <span className="font-mono text-[13px] font-medium">{model.webSearch}</span> {t.detail.perThousand}
          </Fact>
        )}
        {model.aliases.length > 0 && (
          <Fact label={t.detail.aliases}>
            <ul className="flex flex-wrap gap-x-3 gap-y-1">
              {model.aliases.map((alias) => (
                <li key={alias} className="font-mono text-[13px]">
                  {alias}
                </li>
              ))}
            </ul>
          </Fact>
        )}
        {model.notes !== null && (
          <div className="min-w-0 sm:col-span-2 lg:col-span-3">
            <dt className={cn(MONO_HEAD, 'text-muted-foreground')}>{t.detail.notes}</dt>
            <dd lang="en" className="mt-1 max-w-[100ch] text-[14px] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
              {model.notes}
            </dd>
          </div>
        )}
      </dl>
    </details>
  );
}

function ModelBody({ model, t }: { model: ModelView; t: ModelsCopy }) {
  const priced = model.rates !== null;
  return (
    <tbody
      id={`model-${model.id}`}
      data-model={model.id}
      data-provider={model.provider}
      {...(model.retired !== null ? { 'data-retired': '' } : {})}
      {...(model.promo !== null ? { 'data-promo': '' } : {})}
      {...(priced ? {} : { 'data-unpriced': '' })}
      className="scroll-mt-6 border-b-2 border-foreground"
    >
      <tr className="align-top">
        <th
          scope="row"
          className={cn(
            'min-w-[260px] px-3 py-3 text-left font-normal',
            model.retired !== null && 'border-l-4 border-dashed border-foreground',
            !priced && 'border-l-4 border-dotted border-foreground',
          )}
        >
          <span className={cn('block text-[16px] leading-snug font-semibold', model.retired !== null && 'text-muted-foreground')}>{model.name}</span>
          <code className="mt-0.5 block font-mono text-[12.5px] text-muted-foreground [overflow-wrap:anywhere]">{model.id}</code>
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            {model.retired !== null && <Tab kind="retired">{t.states.retired}</Tab>}
            {model.promo !== null && <Tab kind="promo">{t.states.promo(model.promo.until)}</Tab>}
            {!priced && <Tab kind="none">{t.states.unpriced}</Tab>}
            {model.history.length > 0 && <Tab kind="plain">{t.states.repriced}</Tab>}
            {model.notOffered && <Tab kind="plain">{t.states.notOffered}</Tab>}
          </span>
        </th>
        <td className="px-3 py-3 text-right font-mono text-[15px] font-medium whitespace-nowrap tabular-nums">
          {model.rates === null ? <span className="font-sans text-[13px] text-muted-foreground">{t.noPrice}</span> : model.rates.input}
        </td>
        <td className="px-3 py-3 text-right font-mono text-[15px] font-medium whitespace-nowrap tabular-nums">
          {model.rates === null ? <span className="font-sans text-[13px] text-muted-foreground">{t.noPrice}</span> : model.rates.output}
        </td>
        <td className="px-3 py-3 text-right font-mono text-[14px] whitespace-nowrap tabular-nums">{model.context ?? '-'}</td>
        <td className="px-3 py-3 text-right font-mono text-[14px] whitespace-nowrap tabular-nums">{model.cacheRead ?? '-'}</td>
        <td className="px-3 py-3 text-right font-mono text-[14px] whitespace-nowrap tabular-nums">
          {model.batch === 'none' ? <span className="font-sans text-[13px] text-muted-foreground">{t.noBatch}</span> : (model.batch ?? '-')}
        </td>
      </tr>
      <tr>
        <td colSpan={6} className="p-0">
          <Details model={model} t={t} />
        </td>
      </tr>
    </tbody>
  );
}

function UnpricedList({ items, t }: { items: readonly UnpricedView[]; t: ModelsCopy }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-6">
      <h3 className="font-display text-[20px] leading-tight font-bold tracking-[-0.02em]">{t.unpricedTitle}</h3>
      <p className="mt-1 max-w-[78ch] text-[14.5px] leading-relaxed text-muted-foreground">{t.unpricedLede}</p>
      <ul className="mt-3 border-t-2 border-foreground">
        {items.map((item) => (
          <li key={item.id} data-unpriced-id={item.id} className="grid gap-1 border-b border-rule border-l-4 border-l-foreground border-dotted px-3 py-3 sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)] sm:gap-6">
            <span>
              <code className="font-mono text-[14px] font-semibold [overflow-wrap:anywhere]">{item.id}</code>
              <span className="mt-1.5 flex">
                <Tab kind="none">{t.states.unpriced}</Tab>
              </span>
            </span>
            <span lang="en" className="text-[14px] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
              {item.reason}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SourceLink({ source, label, opens }: { source: { url: string; label: string }; label: string; opens: string }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={`${label}: ${source.label}, ${opens}`}
      className={cn('inline-flex items-center gap-1 font-mono text-[13px] font-medium text-terracotta underline underline-offset-4 [overflow-wrap:anywhere]', FOCUS)}
    >
      {source.label}
      <ArrowUpRight className="size-3.5 shrink-0" aria-hidden="true" />
    </a>
  );
}

function ProviderSection({
  provider,
  shown,
  unpriced,
  t,
  opens,
}: {
  provider: ProviderView;
  shown: readonly ModelView[];
  unpriced: readonly UnpricedView[];
  t: ModelsCopy;
  opens: string;
}) {
  const headId = useId();
  return (
    <section id={provider.id} aria-labelledby={headId} data-provider-section={provider.id} className="scroll-mt-6 border-t-2 border-foreground">
      <div className={`${WRAP} py-8 lg:py-10`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
          <h2 id={headId} className={SECTION_TITLE}>
            {provider.name}
            <span className="ml-3 font-mono text-[14px] font-medium tracking-normal text-muted-foreground">{t.provider.count(provider.models.length)}</span>
          </h2>
          <p className="text-[14px] text-muted-foreground">
            {provider.reviewed === null ? t.provider.notReviewed : <span data-reviewed={provider.reviewed}>{t.provider.reviewed(provider.reviewed)}</span>}
            {provider.source !== null && (
              <>
                <span className="mx-2">·</span>
                <SourceLink source={provider.source} label={t.provider.source} opens={opens} />
              </>
            )}
          </p>
        </div>
        {shown.length > 0 && (
          <div
            role="region"
            aria-label={t.tableLabel(provider.name)}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: a table wider than the page scrolls inside this box, and the box has to be reachable by keyboard
            tabIndex={0}
            className="mt-5 max-w-full overflow-x-auto border-t-2 border-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-terracotta"
          >
            <table className="w-full min-w-[880px] border-collapse text-left">
              <thead>
                <tr className="border-b-2 border-foreground">
                  <th scope="col" className={cn(MONO_HEAD, 'px-3 py-2 text-left align-bottom')}>
                    {t.columns.model}
                  </th>
                  {[t.columns.input, t.columns.output].map((label) => (
                    <th key={label} scope="col" className={cn(MONO_HEAD, 'px-3 py-2 text-right align-bottom whitespace-nowrap')}>
                      {label}
                      <span className="block font-normal tracking-normal text-muted-foreground normal-case">{t.perMTok}</span>
                    </th>
                  ))}
                  {[t.columns.context, t.columns.cacheRead, t.columns.batch].map((label) => (
                    <th key={label} scope="col" className={cn(MONO_HEAD, 'px-3 py-2 text-right align-bottom whitespace-nowrap')}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              {shown.map((model) => (
                <ModelBody key={model.id} model={model} t={t} />
              ))}
            </table>
          </div>
        )}
        <UnpricedList items={unpriced} t={t} />
      </div>
    </section>
  );
}

export function ModelsPage({ initialLocale, catalogue }: { initialLocale: MarketingLocale; catalogue: CatalogueView }) {
  const [provider, setProvider] = useState('all');
  const [query, setQuery] = useState('');
  const filterId = useId();

  const visible = useMemo(() => {
    return catalogue.providers.map((entry) => {
      const inScope = provider === 'all' || provider === entry.id;
      const models = inScope
        ? entry.models.filter((model) => matches(query, model.name, model.id, entry.name, ...model.aliases))
        : [];
      const unpriced = inScope ? entry.unpriced.filter((item) => matches(query, item.id, entry.name, item.reason)) : [];
      return { entry, models, unpriced };
    });
  }, [catalogue, provider, query]);

  // Models the catalogue prices, which is what each provider's count says too.
  // The ids a provider lists and the catalogue leaves unpriced are a list of
  // their own below, and are not counted as models here.
  const total = catalogue.counts.models;
  const shownCount = visible.reduce((n, group) => n + group.models.length, 0);

  return (
    <SiteFrame initialLocale={initialLocale} current="models">
      {(locale, site) => {
        const t = MODELS_COPY[locale];
        return (
          <>
            <section aria-labelledby="models-title" className={`${WRAP} py-12 lg:py-20`}>
              <p className="font-mono text-[12px] font-semibold tracking-[0.1em] text-terracotta uppercase">Trazum</p>
              <h1 id="models-title" className="mt-3 font-display text-[clamp(44px,8vw,104px)] leading-[0.98] font-bold tracking-[-0.045em]">
                {t.title}
              </h1>
              <p className="mt-5 max-w-[60ch] text-[18px] leading-[1.6] text-muted-foreground">{t.lede}</p>
              {locale !== 'en' && <p className="mt-4 max-w-[60ch] text-[14px] leading-relaxed">{t.englishNote}</p>}
              <p className="mt-6 max-w-[78ch] border-l-4 border-foreground pl-4 text-[14.5px] leading-relaxed">{t.rule}</p>
              <p className="mt-4 font-mono text-[13px] font-semibold" data-reviewed-oldest={catalogue.reviewed}>
                {t.reviewedLine(catalogue.reviewed)}
              </p>
            </section>

            <section aria-label={t.textFilter} className="border-t-2 border-foreground bg-layer">
              <div className={`${WRAP} flex flex-col gap-4 py-5 lg:flex-row lg:items-end lg:justify-between lg:gap-8`}>
                <div role="group" aria-label={t.providerFilter} className="flex flex-wrap gap-2">
                  {[{ id: 'all', name: t.allProviders, count: catalogue.counts.models }, ...catalogue.providers.map((entry) => ({ id: entry.id, name: entry.name, count: entry.models.length }))].map((option) => {
                    const pressed = provider === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={pressed}
                        data-provider-filter={option.id}
                        onClick={() => setProvider(option.id)}
                        className={cn(
                          'inline-flex min-h-10 items-center gap-2 border-2 border-foreground px-3 text-[14px] font-semibold',
                          pressed ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-layer-hover',
                          FOCUS,
                        )}
                      >
                        {option.name}
                        <span className="font-mono text-[12px] font-medium">{option.count}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="w-full lg:max-w-[360px]">
                  <label htmlFor={filterId} className="sr-only">
                    {t.textFilter}
                  </label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <input
                      id={filterId}
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={t.textPlaceholder}
                      autoComplete="off"
                      spellCheck={false}
                      className={cn('h-11 w-full border-2 border-foreground bg-background pr-3 pl-10 text-[15px]', FOCUS)}
                    />
                  </div>
                </div>
              </div>
              <p role="status" aria-live="polite" data-filter-status="" className={`${WRAP} pb-4 font-mono text-[12.5px] text-muted-foreground`}>
                {t.status(shownCount, total)}
              </p>
            </section>

            {visible.map(({ entry, models, unpriced }) =>
              models.length === 0 && unpriced.length === 0 ? null : (
                <ProviderSection key={entry.id} provider={entry} shown={models} unpriced={unpriced} t={t} opens={site.opensExternal} />
              ),
            )}
            {shownCount === 0 && (
              <p className={`${WRAP} border-t-2 border-foreground py-12 text-[16px]`} data-no-match="">
                {t.none}
              </p>
            )}

            <section aria-labelledby="models-key" className="border-t-2 border-foreground bg-layer">
              <div className={`${WRAP} grid gap-6 py-10 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-14 lg:py-14`}>
                <h2 id="models-key" className={SECTION_TITLE}>
                  {t.keyTitle}
                </h2>
                <div>
                  <p className="max-w-[78ch] text-[15px] leading-relaxed">{t.keyLede}</p>
                  <p className="mt-5 flex flex-wrap items-center gap-2">
                    <Tab kind="retired">{t.states.retired}</Tab>
                    <Tab kind="promo">{t.states.promo('…')}</Tab>
                    <Tab kind="none">{t.states.unpriced}</Tab>
                    <Tab kind="plain">{t.states.notOffered}</Tab>
                  </p>
                </div>
              </div>
            </section>

            <section aria-labelledby="models-sources" className="border-t-2 border-foreground">
              <div className={`${WRAP} grid gap-6 py-10 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-14 lg:py-14`}>
                <div>
                  <h2 id="models-sources" className={SECTION_TITLE}>
                    {t.sourcesTitle}
                  </h2>
                  <p className="mt-3 max-w-[40ch] text-[15px] leading-relaxed text-muted-foreground">{t.sourcesLede}</p>
                </div>
                <div>
                  <ul className="border-t-2 border-foreground">
                    {catalogue.providers.map((entry) => (
                      <li key={entry.id} data-source-of={entry.id} className="grid gap-1 border-b border-rule px-1 py-3 sm:grid-cols-[160px_minmax(0,1fr)_auto] sm:items-baseline sm:gap-6 sm:px-3">
                        <span className="font-semibold">{entry.name}</span>
                        <span className="min-w-0">
                          {entry.source === null ? (
                            <span className="text-muted-foreground">{t.provider.noSource}</span>
                          ) : (
                            <SourceLink source={entry.source} label={t.provider.source} opens={site.opensExternal} />
                          )}
                        </span>
                        <span className="font-mono text-[13px] text-muted-foreground">{entry.reviewed ?? t.provider.notReviewed}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <a
                      href={`${GITHUB_URL}/blob/main/packages/core/src/pricing.ts`}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label={`${t.catalogueOnGitHub}, ${site.opensExternal}`}
                      className={cn('inline-flex min-h-10 items-center gap-2 border-2 border-foreground bg-background px-4 text-[14px] font-semibold hover:bg-layer-hover', FOCUS)}
                    >
                      <GitHubMark className="size-4" />
                      {t.catalogueOnGitHub}
                    </a>
                    <a
                      href={`${GITHUB_URL}/issues/new?template=price_report.yml`}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label={`${t.reportPrice}, ${site.opensExternal}`}
                      className={cn('inline-flex min-h-10 items-center gap-2 border-2 border-foreground bg-background px-4 text-[14px] font-semibold hover:bg-layer-hover', FOCUS)}
                    >
                      {t.reportPrice}
                      <ArrowUpRight className="size-4" aria-hidden="true" />
                    </a>
                  </div>
                </div>
              </div>
            </section>
          </>
        );
      }}
    </SiteFrame>
  );
}
