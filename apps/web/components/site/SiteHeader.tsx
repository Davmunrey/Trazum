'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Menu, Monitor, Moon, Sun, X } from 'lucide-react';

import { MARKETING_LOCALES, MARKETING_LOCALE_META, type MarketingLocale } from '../../lib/marketing-locales';
import { HEADER_ENTRIES, HOME_PATH, SITE_LINKS, type SiteLinkId } from '../../lib/site';
import type { SiteCopy } from '../../lib/site-copy';
import { THEMES, applyTheme, saveTheme, storedTheme, type Theme } from '../../lib/theme';
import { cn } from '../../lib/utils';
import { GitHubButton } from './GitHub';

/**
 * The one header of the public site.
 *
 * The full wordmark leads and links home. Then the entries in `site.ts`, the
 * language and appearance controls the site already had, the button to the
 * repository and the one primary action, into the dashboard.
 *
 * Below 1280px the entries and the two controls move into a menu. It is a
 * disclosure, not a dialog: a button that says whether it is open, a panel in
 * the page's own flow beneath the bar, Escape to close it with focus back on
 * the button, and nothing that holds the keyboard inside it. Tab walks out of
 * it into the page like out of any other list of links, because nothing
 * behind it is covered.
 */

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground';

/** The primary action, drawn the one way the design system draws one. */
export function DashboardAction({
  label,
  className = '',
  inverse = false,
}: {
  label: string;
  className?: string;
  /** On an ink band, where the offset shadow has to be paper to be seen. */
  inverse?: boolean;
}) {
  return (
    <a
      href={SITE_LINKS.dashboard.href}
      data-dashboard-action=""
      className={cn(
        'inline-flex min-h-11 shrink-0 items-center justify-center gap-3 border-2 bg-primary px-5 text-[15px] font-bold text-primary-foreground transition-[transform,box-shadow] active:translate-x-px active:translate-y-px active:shadow-none',
        inverse
          ? 'border-background shadow-[3px_3px_0_var(--background)]'
          : 'border-foreground shadow-[3px_3px_0_var(--foreground)]',
        FOCUS,
        className,
      )}
    >
      <span>{label}</span>
      <ArrowRight className="size-[18px]" aria-hidden="true" />
    </a>
  );
}

export function LanguageControl({
  copy,
  locale,
  onChange,
  className = '',
}: {
  copy: SiteCopy;
  locale: MarketingLocale;
  onChange: (next: MarketingLocale) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`relative ${className}`}>
      <label htmlFor={id} className="sr-only">
        {copy.language}
      </label>
      <select
        id={id}
        value={locale}
        onChange={(event) => onChange(event.target.value as MarketingLocale)}
        className={`h-10 w-full cursor-pointer appearance-none border-2 border-foreground bg-background py-0 pr-9 pl-3 text-[14px] font-medium text-foreground hover:bg-layer-hover ${FOCUS}`}
      >
        {MARKETING_LOCALES.map((code) => (
          <option key={code} value={code}>
            {MARKETING_LOCALE_META[code].name}
          </option>
        ))}
      </select>
      <svg
        viewBox="0 0 12 12"
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-3 -translate-y-1/2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M2 4.5 6 8.5l4-4" />
      </svg>
    </div>
  );
}

const THEME_ICON = { light: Sun, dark: Moon, system: Monitor } as const;

/**
 * Light, dark or system: the same three the application's rail offers,
 * stored under the same key, so a choice made on one page holds on all of
 * them. The page is painted in the stored theme before this hydrates, by the
 * bootstrap script in the layout; this only reflects it and changes it.
 */
export function ThemeControl({ copy, className = '' }: { copy: SiteCopy; className?: string }) {
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => {
    setTheme(storedTheme());
  }, []);
  useEffect(() => {
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const follow = () => applyTheme('system');
    media.addEventListener('change', follow);
    return () => media.removeEventListener('change', follow);
  }, [theme]);
  const label = { light: copy.themeLight, dark: copy.themeDark, system: copy.themeSystem };
  return (
    <div role="group" aria-label={copy.appearance} className={cn('flex border-2 border-foreground', className)}>
      {THEMES.map((value, index) => {
        const Icon = THEME_ICON[value];
        const pressed = theme === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={pressed}
            aria-label={label[value]}
            title={label[value]}
            onClick={() => {
              saveTheme(value);
              setTheme(value);
            }}
            className={`flex h-9 min-w-9 flex-1 items-center justify-center ${index > 0 ? 'border-l-2 border-foreground' : ''} ${
              pressed ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-layer-hover'
            } ${FOCUS} focus-visible:-outline-offset-4`}
          >
            <Icon className="size-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

/** The entry for the section the reader is in: acid fill, the way active navigation is drawn everywhere. */
const CURRENT = 'border-2 border-foreground bg-primary px-3 text-primary-foreground';

function EntryLink({
  id,
  copy,
  className,
  current = false,
  onNavigate,
}: {
  id: (typeof HEADER_ENTRIES)[number];
  copy: SiteCopy;
  className: string;
  current?: boolean;
  onNavigate?: () => void;
}) {
  const link = SITE_LINKS[id];
  const label = copy.links[id];
  return (
    <a
      href={link.href}
      onClick={onNavigate}
      {...(current ? { 'aria-current': 'page' as const } : {})}
      {...(link.external
        ? { target: '_blank', rel: 'noreferrer noopener', 'aria-label': `${label}, ${copy.opensExternal}` }
        : {})}
      className={className}
    >
      <span>{label}</span>
      {link.external && <ArrowUpRight className="size-4 shrink-0" aria-hidden="true" />}
    </a>
  );
}

export function SiteHeader({
  copy,
  locale,
  onLocaleChange,
  current,
}: {
  copy: SiteCopy;
  locale: MarketingLocale;
  onLocaleChange: (next: MarketingLocale) => void;
  /** The entry of the section this page belongs to, drawn as active navigation. */
  current?: SiteLinkId;
}) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  /*
    Escape closes the menu and puts the keyboard back on the button that
    opened it. A window that grows past the breakpoint closes it too: the
    entries are in the bar there, and a menu left open would show them twice.
    The 1280px is Tailwind's `xl`, written out because a stylesheet cannot be
    asked; change one and change the other.
  */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      toggle.current?.focus();
    };
    const wide = window.matchMedia('(min-width: 1280px)');
    const settle = () => {
      if (wide.matches) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    wide.addEventListener('change', settle);
    return () => {
      window.removeEventListener('keydown', onKey);
      wide.removeEventListener('change', settle);
    };
  }, [open]);

  return (
    <header data-site-header="" className="border-b-2 border-foreground bg-background">
      <div className="mx-auto flex h-[72px] max-w-[1440px] items-center gap-3 px-4 sm:px-8 lg:px-12 xl:gap-4">
        <a
          href={HOME_PATH}
          aria-label={copy.home}
          className={`mr-auto font-display text-[30px] leading-none font-bold tracking-[-0.04em] xl:mr-0 ${FOCUS}`}
        >
          Trazum
        </a>

        <nav aria-label={copy.nav} className="hidden xl:ml-10 xl:mr-auto xl:block">
          <ul className="flex items-center gap-7">
            {HEADER_ENTRIES.map((id) => (
              <li key={id}>
                <EntryLink
                  id={id}
                  copy={copy}
                  current={id === current}
                  className={`inline-flex items-center gap-1 py-1 text-[15px] font-semibold transition-colors ${
                    id === current ? CURRENT : 'border-b-2 border-transparent hover:border-foreground'
                  } ${FOCUS}`}
                />
              </li>
            ))}
          </ul>
        </nav>

        <LanguageControl copy={copy} locale={locale} onChange={onLocaleChange} className="hidden w-[136px] xl:block" />
        <ThemeControl copy={copy} className="hidden xl:flex" />
        <GitHubButton label={copy.links.github} opensExternal={copy.opensExternal} className="hidden xl:inline-flex" />
        <GitHubButton label={copy.links.github} opensExternal={copy.opensExternal} compact className="xl:hidden" />
        <DashboardAction label={copy.dashboardCta} className="hidden sm:inline-flex" />

        <button
          ref={toggle}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className={`inline-flex h-10 items-center gap-2 border-2 border-foreground bg-background px-3 text-[14px] font-semibold hover:bg-layer-hover xl:hidden ${FOCUS}`}
        >
          {open ? <X className="size-[18px]" aria-hidden="true" /> : <Menu className="size-[18px]" aria-hidden="true" />}
          <span>{open ? copy.menuClose : copy.menuOpen}</span>
        </button>
      </div>

      {open && (
        <div id={panelId} className="border-t-2 border-foreground xl:hidden">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-6 sm:px-8 lg:px-12">
            <nav aria-label={copy.nav}>
              <ul className="flex flex-col">
                {HEADER_ENTRIES.map((id) => (
                  <li key={id} className="border-b border-rule">
                    <EntryLink
                      id={id}
                      copy={copy}
                      current={id === current}
                      onNavigate={() => setOpen(false)}
                      className={`flex min-h-12 items-center justify-between font-display text-[22px] font-bold tracking-[-0.02em] ${
                        id === current ? 'bg-primary px-3 text-primary-foreground' : ''
                      } ${FOCUS}`}
                    />
                  </li>
                ))}
              </ul>
            </nav>
            <DashboardAction label={copy.dashboardCta} className="w-full sm:hidden" />
            <div className="grid gap-3 sm:grid-cols-[minmax(0,240px)_auto] sm:items-center">
              <LanguageControl copy={copy} locale={locale} onChange={onLocaleChange} />
              <ThemeControl copy={copy} className="sm:w-[180px]" />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
