import { ArrowUpRight } from 'lucide-react';

import { FOOTER_GROUPS, HOME_PATH, SITE_LINKS } from '../../lib/site';
import type { SiteCopy } from '../../lib/site-copy';
import { GitHubButton } from './GitHub';

/**
 * The one footer of the public site: the header's destinations, then the
 * project's own papers (its licence, its changelog, its security policy) and
 * the package on npm. Every entry comes from `FOOTER_GROUPS` in `site.ts`.
 */
export function SiteFooter({ copy }: { copy: SiteCopy }) {
  return (
    <footer data-site-footer="" className="border-t-2 border-foreground bg-background">
      <div className="mx-auto grid max-w-[1440px] gap-10 px-4 py-14 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr] lg:px-12 lg:py-16">
        <div className="flex flex-col items-start gap-5">
          <a
            href={HOME_PATH}
            aria-label={copy.home}
            className="font-display text-[44px] leading-none font-bold tracking-[-0.045em] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          >
            Trazum
          </a>
          <p className="max-w-[38ch] text-[14px] leading-relaxed text-muted-foreground">{copy.footerLine}</p>
          <GitHubButton label={copy.links.github} opensExternal={copy.opensExternal} />
        </div>
        {FOOTER_GROUPS.map((group) => (
          <nav key={group.id} aria-label={copy.footerGroups[group.id]}>
            <h2 className="border-b-2 border-foreground pb-2 font-mono text-[12px] font-semibold tracking-[0.08em] uppercase">
              {copy.footerGroups[group.id]}
            </h2>
            <ul className="mt-2 flex flex-col">
              {group.links.map((id) => {
                const link = SITE_LINKS[id];
                const label = copy.links[id];
                return (
                  <li key={id}>
                    <a
                      href={link.href}
                      {...(link.external
                        ? { target: '_blank', rel: 'noreferrer noopener', 'aria-label': `${label}, ${copy.opensExternal}` }
                        : {})}
                      className="group inline-flex min-h-10 items-center gap-1.5 text-[15px] font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
                    >
                      {label}
                      {link.external && <ArrowUpRight className="size-3.5 text-muted-foreground" aria-hidden="true" />}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
        ))}
      </div>
    </footer>
  );
}
