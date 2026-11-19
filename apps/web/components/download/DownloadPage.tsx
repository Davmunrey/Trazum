'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, Check, Copy, Download } from 'lucide-react';

import { docHref } from '../../lib/docs/manifest';
import { ACTION_LINE, CLI_COMMANDS, DOWNLOAD, SUMS_COMMAND_LINUX, SUMS_COMMAND_MAC, VSIX_COMMAND } from '../../lib/download';
import { DOWNLOAD_COPY } from '../../lib/download-copy';
import type { MarketingLocale } from '../../lib/marketing-locales';
import type { InstallClient } from '../../lib/history/types';
import { cn } from '../../lib/utils';
import { CommandLine } from '../site/CommandLine';
import { SiteFrame } from '../site/SiteFrame';

/**
 * `/download`: what to run or fetch to have Trazum, in every way this
 * repository offers it, and how to check what was fetched.
 *
 * Nothing on it is typed here. The commands, the addresses, the names of the
 * files and the version come from `lib/download.ts`, which reads what the build
 * wrote from the repository's own sources, so the page and `docs/agents.md`
 * are one source. No listing is claimed: there is no store account behind any
 * of it, and `download-page.test.mjs` fails on a sentence that says a store has
 * it.
 *
 * It sends nothing. The links leave the site when somebody follows them, and
 * the copy buttons write to the clipboard from a click; the end-to-end flow
 * watches the network while it reads the page.
 */

const WRAP = 'mx-auto w-full max-w-[1440px] px-4 sm:px-8 lg:px-12';
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground';
const MONO_HEAD = 'font-mono text-[11.5px] font-semibold tracking-[0.07em] uppercase';
const SECTION_TITLE = 'font-display text-[clamp(28px,3.2vw,44px)] leading-[1.06] font-bold tracking-[-0.035em]';
const SPLIT = 'grid gap-6 py-10 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-14 lg:py-14';
const QUIET_BUTTON = 'inline-flex min-h-10 items-center gap-2 border-2 border-foreground bg-background px-4 text-[14px] font-semibold hover:bg-layer-hover';
const PRIMARY_BUTTON =
  'inline-flex min-h-11 items-center justify-center gap-3 border-2 border-foreground bg-primary px-5 text-[15px] font-bold text-primary-foreground shadow-[3px_3px_0_var(--foreground)] transition-[transform,box-shadow] active:translate-x-px active:translate-y-px active:shadow-none';
const TEXT_LINK = 'font-semibold text-terracotta underline underline-offset-4';

/** A sentence whose names in backticks are code: a command, a file, a package. */
function Prose({ text }: { text: string }) {
  return (
    <>
      {text.split('`').map((part, at) =>
        at % 2 === 1 ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one fixed sentence, in their order
          <code key={at} className="font-mono text-[0.92em]">
            {part}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** More than one line, with a control that copies it: a file's content, in a box that scrolls inside itself. */
function CodeBlock({ id, code, language, copy, copied }: { id: string; code: string; language: string; copy: string; copied: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => setDone(false), 1800);
    return () => window.clearTimeout(timer);
  }, [done]);

  async function write() {
    try {
      await navigator.clipboard.writeText(code);
      setDone(true);
    } catch {
      // Refused: the text is still there to select by hand.
    }
  }

  return (
    <div data-snippet={id} className="flex min-w-0 items-stretch border-2 border-foreground bg-background">
      <pre
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a snippet wider than a phone scrolls inside this box, and the box has to be reachable by keyboard
        tabIndex={0}
        className="min-w-0 flex-1 overflow-x-auto px-4 py-3 font-mono text-[14px] leading-relaxed focus-visible:outline-[3px] focus-visible:-outline-offset-3 focus-visible:outline-terracotta"
      >
        <code data-language={language}>{code}</code>
      </pre>
      <button
        type="button"
        onClick={write}
        aria-label={copy}
        title={copy}
        className="flex w-12 shrink-0 items-start justify-center border-l-2 border-foreground pt-3.5 transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-foreground"
      >
        {done ? <Check className="size-[18px]" aria-hidden="true" /> : <Copy className="size-[18px]" aria-hidden="true" />}
      </button>
      <span role="status" className="sr-only">
        {done ? copied : ''}
      </span>
    </div>
  );
}

export function DownloadPage({ initialLocale }: { initialLocale: MarketingLocale }) {
  return (
    <SiteFrame initialLocale={initialLocale} current="download">
      {(locale, site) => {
        const t = DOWNLOAD_COPY[locale];
        const { files, version } = DOWNLOAD;
        const external = (label: string) => `${label}, ${site.opensExternal}`;
        const clientLine = (client: InstallClient) => {
          if (client.id === 'claude-desktop-bundle') {
            return (
              <div className="flex flex-col items-start gap-3">
                <a href={files.mcpb.url} target="_blank" rel="noreferrer noopener" data-download-file="mcpb" aria-label={external(t.mcpBundleButton(files.mcpb.name))} className={cn(PRIMARY_BUTTON, FOCUS)}>
                  <Download className="size-[18px]" aria-hidden="true" />
                  <span>{t.mcpBundleButton(files.mcpb.name)}</span>
                </a>
                <p className="max-w-[68ch] text-[14.5px] leading-relaxed text-muted-foreground">{t.mcpBundleNote}</p>
              </div>
            );
          }
          if (client.command) {
            return (
              <div className="flex flex-col gap-2">
                <CommandLine command={client.code} copyLabel={site.copyCommand} copiedLabel={site.copied} size="small" />
                {client.pinnedBy !== undefined && <p className="max-w-[68ch] text-[14.5px] leading-relaxed text-muted-foreground">{t.mcpGeminiNote}</p>}
              </div>
            );
          }
          return <CodeBlock id={client.id} code={client.code} language={client.language} copy={site.copyCommand} copied={site.copied} />;
        };

        return (
          <>
            <section aria-labelledby="download-title" className={`${WRAP} py-12 lg:py-20`}>
              <p className="font-mono text-[12px] font-semibold tracking-[0.1em] text-terracotta uppercase" data-download-version="">
                {t.versionLine(version)}
              </p>
              <h1 id="download-title" className="mt-3 font-display text-[clamp(44px,8vw,104px)] leading-[0.98] font-bold tracking-[-0.045em]">
                {t.title}
              </h1>
              <p className="mt-5 max-w-[62ch] text-[18px] leading-[1.6] text-muted-foreground">{t.lede}</p>
              <p className="mt-4 max-w-[68ch] text-[14.5px] leading-relaxed text-muted-foreground" data-download-availability="">
                {t.availability}{' '}
                <a href={DOWNLOAD.releaseUrl} target="_blank" rel="noreferrer noopener" aria-label={external(t.releasePage)} className={cn(TEXT_LINK, FOCUS)}>
                  {t.releasePage}
                </a>
              </p>
            </section>

            <section id="command-line" aria-labelledby="download-cli" data-download-section="cli" className="border-t-2 border-foreground bg-layer">
              <div className={`${WRAP} ${SPLIT}`}>
                <div>
                  <h2 id="download-cli" className={SECTION_TITLE}>
                    {t.cliTitle}
                  </h2>
                  <p className="mt-3 max-w-[38ch] text-[15px] leading-relaxed text-muted-foreground">
                    <Prose text={t.cliLede} />
                  </p>
                </div>
                <ul className="flex flex-col gap-6">
                  {CLI_COMMANDS.map((entry) => (
                    <li key={entry.id} data-cli={entry.id} className="flex flex-col gap-2">
                      <h3 className={MONO_HEAD}>{entry.id === 'npx' ? t.cliOnce : entry.id === 'npm' ? t.cliGlobal : t.cliBrew}</h3>
                      <CommandLine command={entry.command} copyLabel={site.copyCommand} copiedLabel={site.copied} size="small" />
                      {entry.id === 'brew' && (
                        <p className="max-w-[68ch] text-[14.5px] leading-relaxed text-muted-foreground">
                          <Prose text={t.cliBrewNote} />
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section id="mcp" aria-labelledby="download-mcp" data-download-section="mcp" className="border-t-2 border-foreground">
              <div className={`${WRAP} ${SPLIT}`}>
                <div>
                  <h2 id="download-mcp" className={SECTION_TITLE}>
                    {t.mcpTitle}
                  </h2>
                  <p className="mt-3 max-w-[38ch] text-[15px] leading-relaxed text-muted-foreground">
                    <Prose text={t.mcpLede} />
                  </p>
                  <p className="mt-4">
                    <a href={docHref('agents', 'install-the-mcp-server-in-a-client')} className={cn('inline-flex min-h-10 items-center text-[15px]', TEXT_LINK, FOCUS)}>
                      {t.mcpDocs}
                    </a>
                  </p>
                </div>
                <ul className="flex flex-col gap-8">
                  {DOWNLOAD.clients.map((client) => (
                    <li key={client.id} data-client={client.id} className="flex flex-col gap-2">
                      <h3 className="font-display text-[22px] leading-tight font-bold tracking-[-0.02em]">{client.label}</h3>
                      {client.file !== undefined && (
                        <p className="text-[14px] text-muted-foreground">
                          {t.mcpWhere}: <code className="font-mono text-[0.95em] text-foreground">{client.file}</code>
                        </p>
                      )}
                      {clientLine(client)}
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section id="extension" aria-labelledby="download-extension" data-download-section="extension" className="border-t-2 border-foreground bg-layer">
              <div className={`${WRAP} ${SPLIT}`}>
                <div>
                  <h2 id="download-extension" className={SECTION_TITLE}>
                    {t.extTitle}
                  </h2>
                  <p className="mt-3 max-w-[38ch] text-[15px] leading-relaxed text-muted-foreground">{t.extLede}</p>
                </div>
                <div className="flex flex-col gap-6">
                  <div>
                    <a href={files.vsix.url} target="_blank" rel="noreferrer noopener" data-download-file="vsix" aria-label={external(t.extButton(files.vsix.name))} className={cn(PRIMARY_BUTTON, FOCUS)}>
                      <Download className="size-[18px]" aria-hidden="true" />
                      <span>{t.extButton(files.vsix.name)}</span>
                    </a>
                  </div>
                  <ol className="max-w-[68ch] list-decimal pl-6 text-[15.5px] leading-relaxed">
                    {t.extSteps.map((step) => (
                      <li key={step} className="py-1">
                        {step}
                      </li>
                    ))}
                  </ol>
                  <div className="flex flex-col gap-2">
                    <h3 className={MONO_HEAD}>{t.extTerminal}</h3>
                    <CommandLine command={VSIX_COMMAND} copyLabel={site.copyCommand} copiedLabel={site.copied} size="small" />
                  </div>
                  <p className="max-w-[68ch] text-[14.5px] leading-relaxed text-muted-foreground">{t.extNote}</p>
                </div>
              </div>
            </section>

            <section id="action" aria-labelledby="download-action" data-download-section="action" className="border-t-2 border-foreground">
              <div className={`${WRAP} ${SPLIT}`}>
                <div>
                  <h2 id="download-action" className={SECTION_TITLE}>
                    {t.actionTitle}
                  </h2>
                </div>
                <div className="flex flex-col gap-4">
                  <p className="max-w-[68ch] text-[15.5px] leading-relaxed">{t.actionLede}</p>
                  <CodeBlock id="action" code={ACTION_LINE} language="yaml" copy={site.copyCommand} copied={site.copied} />
                  <p className="max-w-[68ch] text-[14.5px] leading-relaxed text-muted-foreground">{t.actionNote}</p>
                  <p>
                    <a href={docHref('setup')} className={cn('inline-flex min-h-10 items-center text-[15px]', TEXT_LINK, FOCUS)}>
                      {t.actionDocs}
                    </a>
                  </p>
                </div>
              </div>
            </section>

            <section id="checksums" aria-labelledby="download-sums" data-download-section="checksums" className="border-t-2 border-foreground bg-layer">
              <div className={`${WRAP} ${SPLIT}`}>
                <div>
                  <h2 id="download-sums" className={SECTION_TITLE}>
                    {t.sumsTitle}
                  </h2>
                  <p className="mt-3 max-w-[38ch] text-[15px] leading-relaxed text-muted-foreground">
                    <Prose text={t.sumsLede} />
                  </p>
                </div>
                <div className="flex flex-col gap-5">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                    <a href={files.sums.url} target="_blank" rel="noreferrer noopener" data-download-file="sums" aria-label={external(t.sumsLink)} className={cn(QUIET_BUTTON, FOCUS)}>
                      <Download className="size-4" aria-hidden="true" />
                      {t.sumsLink}
                      <ArrowUpRight className="size-4" aria-hidden="true" />
                    </a>
                    <a href={files.sbom.url} target="_blank" rel="noreferrer noopener" data-download-file="sbom" aria-label={external(t.sbomLink)} className={cn('inline-flex min-h-10 items-center text-[15px]', TEXT_LINK, FOCUS)}>
                      {t.sbomLink}
                    </a>
                  </div>
                  <div className="flex flex-col gap-2">
                    <p className="max-w-[68ch] text-[15.5px] leading-relaxed">{t.sumsLinux}</p>
                    <CommandLine command={SUMS_COMMAND_LINUX} copyLabel={site.copyCommand} copiedLabel={site.copied} size="small" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <p className="max-w-[68ch] text-[15.5px] leading-relaxed">{t.sumsMac}</p>
                    <CommandLine command={SUMS_COMMAND_MAC} copyLabel={site.copyCommand} copiedLabel={site.copied} size="small" />
                  </div>
                  <p className="max-w-[68ch] border-l-4 border-foreground pl-4 text-[15px] leading-relaxed" data-download-sums-note="">
                    {t.sumsNote}
                  </p>
                </div>
              </div>
            </section>
          </>
        );
      }}
    </SiteFrame>
  );
}
