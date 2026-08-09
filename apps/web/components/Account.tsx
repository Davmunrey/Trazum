'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import type { WebMessages } from '../lib/i18n';

/**
 * The sign-in control in the header.
 *
 * Renders nothing at all when the deployment has no GitHub app configured,
 * which is the default and the case most self-hosters are in. A disabled button
 * would advertise a feature that answers 503; absence is the honest rendering.
 *
 * It also renders nothing on the first pass, before `/api/auth/session` has
 * answered. Guessing and correcting would flash "Sign in" at somebody who is
 * already signed in, and the header is not important enough to be wrong quickly.
 */

interface SessionResponse {
  enabled: boolean;
  user: { login: string; name: string | null; avatarUrl: string | null } | null;
  ephemeralSessions: boolean;
}

export function Account({ t }: { t: WebMessages }) {
  const [state, setState] = useState<SessionResponse | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/auth/session', { credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: SessionResponse | null) => {
        if (!cancelled && body) setState(body);
      })
      .catch(() => {
        // A header that cannot tell you who you are should say nothing, not
        // claim you are signed out.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!state?.enabled) return null;

  async function signOut() {
    setBusy(true);
    try {
      await fetch('/api/auth/signout', { method: 'POST', credentials: 'same-origin' });
      // A full reload rather than clearing the state locally: signing out has
      // to drop anything the page is holding about the account, and the only
      // way to be sure it did is to stop holding anything.
      window.location.assign('/');
    } catch {
      setBusy(false);
    }
  }

  if (!state.user) {
    // The current path travels in the query so the round trip through GitHub
    // comes back where it started. The server filters it; this only proposes it.
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    return (
      <a
        href={`/api/auth/github?next=${next}`}
        className="inline-flex h-7 items-center rounded-md border px-2.5 text-[13px] font-normal text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        {t.account.signIn}
      </a>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {state.ephemeralSessions && (
        // Said out loud, in the one place the reader will be surprised. On a
        // memory store behind more than one instance this session ends without
        // warning, and a documented limitation beats a bug report.
        <span className="text-[11px] text-muted-foreground" title={t.account.ephemeralHint}>
          {t.account.ephemeral}
        </span>
      )}

      {state.user.avatarUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- one 20px avatar
        <img
          src={state.user.avatarUrl}
          alt=""
          width={20}
          height={20}
          className="rounded-full"
          // The URL comes from GitHub, but the page should not leak which
          // Trazum page you were on to whoever serves it.
          referrerPolicy="no-referrer"
        />
      )}

      <span className="text-[13px] text-muted-foreground">{state.user.login}</span>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={signOut}
        disabled={busy}
        className="h-7 px-2.5 text-[13px] font-normal text-muted-foreground"
      >
        {busy ? t.account.signingOut : t.account.signOut}
      </Button>
    </div>
  );
}
