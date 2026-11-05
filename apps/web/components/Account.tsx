'use client';

import { useState } from 'react';
import { ChevronsUpDown, Download, LogOut, MonitorSmartphone, Trash2, X } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { WebMessages } from '../lib/i18n';

/**
 * The account control at the foot of the rail.
 *
 * It was a row: a badge, an avatar, a name and a Sign out button, laid out
 * side by side. That fitted a full-width header and fits neither of the two
 * widths the rail actually has — 236px cramps it, and at 60px there is room
 * for the avatar and nothing else. So the identity is the control and the
 * things you can do with it live behind it, which is also the honest shape:
 * signing out is a rare, destructive act and does not belong one stray click
 * from the navigation.
 *
 * Renders nothing at all when the deployment has no GitHub app configured,
 * which is the default and the case most self-hosters are in. A disabled button
 * would advertise a feature that answers 503; absence is the honest rendering.
 *
 * It also renders nothing on the first pass, before `/api/auth/session` has
 * answered. Guessing and correcting would flash "Sign in" at somebody who is
 * already signed in, and the header is not important enough to be wrong quickly.
 */

export interface SessionResponse {
  enabled: boolean;
  user: { login: string; name: string | null; avatarUrl: string | null } | null;
  ephemeralSessions: boolean;
}

/** One row of `GET /api/auth/sessions`. */
interface SessionRow {
  id: string;
  startedAt: string;
  lastActiveAt: string;
  current: boolean;
}

type SessionList = { rows: SessionRow[]; endOthersUntil: string | null } | 'loading' | 'failed';

/**
 * The session arrives as a prop; this component does not ask for it.
 *
 * It used to fetch `/api/auth/session` itself, which meant two round trips per
 * page load — measured, two requests for one answer — because the page above
 * fetches the same endpoint to decide whether the Library tab exists. Two
 * answers to one question is two answers that can differ: a session that
 * expires between them puts a tab on the page for a reader the account control
 * has already decided is signed out. One fetch, one answer, passed down.
 *
 * `null` still means "not answered yet" and still renders nothing, which is
 * the guarantee the guard below is protecting — the mechanism changed, the
 * promise did not.
 */
export function Account({
  t,
  session,
  collapsed = false,
}: {
  t: WebMessages;
  session: SessionResponse | null;
  collapsed?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<SessionList>('loading');
  const state = session;

  if (!state?.enabled) return null;

  /**
   * Ending another session, or all of them, needs a sign-in in the last
   * fifteen minutes (OWASP ASVS 3.3.4). Signing in again goes through GitHub
   * and comes back here, and replaces this browser's session rather than
   * adding one, so the list it returns to is the same list less nothing.
   */
  function signInAgain() {
    if (!window.confirm(t.account.reauthConfirm)) return;
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.assign(`/api/auth/github?next=${next}`);
  }

  async function signOut(everywhere = false) {
    setBusy(true);
    try {
      const response = await fetch(`/api/auth/signout${everywhere ? '?all=1' : ''}`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (everywhere && response.status === 403) {
        // Nothing was ended: the server wants a recent sign-in first.
        setBusy(false);
        signInAgain();
        return;
      }
      // A full reload rather than clearing the state locally: signing out has
      // to drop anything the page is holding about the account, and the only
      // way to be sure it did is to stop holding anything.
      window.location.assign('/');
    } catch {
      setBusy(false);
    }
  }

  async function loadSessions() {
    setSessions('loading');
    try {
      const response = await fetch('/api/auth/sessions', { credentials: 'same-origin' });
      if (!response.ok) {
        setSessions('failed');
        return;
      }
      const body = (await response.json()) as { sessions: SessionRow[]; endOthersUntil: string | null };
      setSessions({ rows: body.sessions, endOthersUntil: body.endOthersUntil });
    } catch {
      setSessions('failed');
    }
  }

  const when = (iso: string) =>
    new Intl.DateTimeFormat(t.numberLocale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

  /** "5 minutes ago", in the reader's language, to the nearest unit worth saying. */
  const ago = (iso: string) => {
    const seconds = (Date.parse(iso) - Date.now()) / 1000;
    const relative = new Intl.RelativeTimeFormat(t.numberLocale, { numeric: 'auto' });
    const size = Math.abs(seconds);
    if (size < 60) return relative.format(0, 'second');
    if (size < 3600) return relative.format(Math.round(seconds / 60), 'minute');
    if (size < 2 * 86400) return relative.format(Math.round(seconds / 3600), 'hour');
    return relative.format(Math.round(seconds / 86400), 'day');
  };

  async function endSession(row: SessionRow, endOthersUntil: string | null) {
    // Asked here first, so a stale session is sent to sign in again before
    // the server has to refuse; the server's refusal is handled below too.
    if (!endOthersUntil || Date.parse(endOthersUntil) <= Date.now()) {
      signInAgain();
      return;
    }
    if (!window.confirm(t.account.sessionEndConfirm(when(row.startedAt)))) return;
    setBusy(true);
    try {
      const response = await fetch('/api/auth/sessions', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: row.id }),
      });
      setBusy(false);
      if (response.status === 403) {
        signInAgain();
        return;
      }
      if (!response.ok) {
        window.alert(t.account.sessionEndFailed);
        return;
      }
      await loadSessions();
    } catch {
      setBusy(false);
    }
  }

  async function deleteAccount(login: string) {
    /**
     * `window.prompt` rather than a styled dialog, and that is a deliberate
     * stop rather than a shortcut taken. It cannot be dismissed by a stray
     * click, and typing a login exactly is work somebody has to mean to do.
     * The server checks the same string against the session it resolved, so
     * this is the friendly half of a rule rather than the rule itself.
     */
    const typed = window.prompt(t.account.deleteConfirm(login));
    if (typed !== login) return;

    setBusy(true);
    try {
      const response = await fetch('/api/account', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: typed }),
      });
      if (!response.ok) {
        // Said out loud rather than swallowed. A failed deletion that looks
        // like a successful one is somebody believing their data is gone.
        window.alert(t.account.deleteFailed);
        setBusy(false);
        return;
      }
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
        title={collapsed ? t.account.signIn : undefined}
        className={cn(
          'inline-flex h-8 items-center justify-center rounded-md border text-[13px] font-normal text-muted-foreground hover:bg-layer-hover hover:text-foreground',
          collapsed ? 'w-8 px-0' : 'justify-start px-2.5',
        )}
      >
        {/* Collapsed, the border and the icon are the whole control; the label
            would not fit and half a word is worse than none. */}
        {collapsed ? <LogOut className="size-[15px] rotate-180" aria-hidden="true" /> : t.account.signIn}
        {collapsed && <span className="sr-only">{t.account.signIn}</span>}
      </a>
    );
  }


  /**
   * Captured once, past the guard above.
   *
   * `state.user` is narrowed to non-null by that early return everywhere the
   * JSX reads it directly, and not inside the `onSelect` closure: a callback
   * runs later, so the compiler will not carry a property narrowing into it.
   * Reaching for a non-null assertion there would silence the compiler about
   * the one call in this file that deletes somebody's account.
   */
  const login = state.user.login;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          /*
            The nav rows' geometry, copied on purpose: a transparent 1px border
            and 10px of side padding, which is what puts a mode's icon 19px in
            from the rail's edge. Without it this sat at 6px and the avatar
            stood five pixels left of the column of icons directly above it —
            two stacks of glyphs in one narrow rail, not lining up.
          */
          /*
            The gap is 5px, not 10, and the number is derived rather than
            chosen: a nav row is a 17px icon and a 10px gap, and this row's
            glyph is 22px. Shrinking the gap by exactly the 5px the avatar is
            wider keeps BOTH columns — the glyphs share a left edge and the
            labels share one too. At 10px the login sat three pixels right of
            every label above it.
          */
          'group/account flex w-full items-center gap-[5px] rounded-md border border-transparent px-2.5 py-1.5 text-left',
          /*
            `outline-hidden` and nothing in its place is how this shipped: the
            one control in the rail with NO focus indicator at all, measured at
            1.05:1 against the rail while focused. A tint is not an indicator.
            A ring at full strength is, and it sits outside the row so it
            cannot be mistaken for the open state's own surface.

            A ring rather than an outline, because `outline-none` sets
            `outline-style: none` and `outline-2` only sets a width — measured
            under real keyboard focus, the pair produced `outline: none 0px`
            and no indicator at all, which is the same defect wearing the
            classes that were meant to fix it.
          */
          'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-muted',
          'hover:bg-layer-hover data-[state=open]:bg-layer-active',
          collapsed && 'justify-center px-0',
        )}
        aria-label={t.account.menuLabel(state.user.login)}
      >
        {state.user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- one 22px avatar
          <img
            src={state.user.avatarUrl}
            alt=""
            width={22}
            height={22}
            className="size-[22px] shrink-0 rounded-full"
            // The URL comes from GitHub, but the page should not leak which
            // Trazum page you were on to whoever serves it.
            referrerPolicy="no-referrer"
          />
        ) : (
          // No avatar is a real case — GitHub does not promise one. An initial
          // keeps the trigger the same size either way, so the rail's foot does
          // not shift when one reader has a picture and the next does not.
          <span
            aria-hidden="true"
            className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-layer-active text-[11px] font-medium"
          >
            {state.user.login.slice(0, 1).toUpperCase()}
          </span>
        )}
        {!collapsed && (
          <>
            {/*
              `text-foreground` once the menu is open. On the closed rail the
              muted grey measures 4.92:1; on `--layer-active`, which is what the
              open state paints underneath it, the same grey drops to 4.30 —
              below the floor, and only in the state the reader is looking at.
              The `title` is for the other failure: a long login truncates here
              with nowhere else in the interface to read it in full.
            */}
            <span
              className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground group-data-[state=open]/account:text-foreground"
              title={state.user.login}
            >
              {state.user.login}
            </span>
            <ChevronsUpDown className="size-[14px] shrink-0 text-faint" aria-hidden="true" />
          </>
        )}
      </DropdownMenuTrigger>

      {/*
        Upwards, and to the side when the rail is narrow: the trigger sits at
        the bottom of a full-height column, so a menu opening downwards would
        open off the screen.
      */}
      <DropdownMenuContent
        side={collapsed ? 'right' : 'top'}
        align={collapsed ? 'end' : 'start'}
        /*
          The offset is measured from the TRIGGER, which sits 9px inside the
          collapsed rail — so the default 6 opened the menu 3px *inside* the
          rail, cutting across its right border. 16 clears the edge and leaves
          the same 7px gap the expanded menu has.
        */
        sideOffset={collapsed ? 16 : 6}
        className="w-[204px]"
      >
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          {/* Both carry a `title`: this menu is the only place either string is
              written out, so truncating one here loses it from the interface
              entirely. */}
          <span className="truncate" title={state.user.name ?? state.user.login}>
            {state.user.name ?? state.user.login}
          </span>
          {state.user.name && (
            <span className="truncate text-[12px] font-normal text-faint" title={state.user.login}>
              {state.user.login}
            </span>
          )}
        </DropdownMenuLabel>

        {state.ephemeralSessions && (
          <>
            <DropdownMenuSeparator />
            {/*
              Said out loud, in the one place the reader will be surprised. On a
              memory store behind more than one instance this session ends
              without warning, and a documented limitation beats a bug report.
              It moved out of the rail and into here because it is a sentence,
              not a badge, and it was being shown at a width that could hold
              neither.
            */}
            <div className="px-2 py-1.5 text-[12px] leading-snug text-muted-foreground">
              {/*
                Two lines, not one sentence. Run together they read "temporary
                session This deployment keeps sessions in memory" — the badge
                is a label for what follows, and it does not decline into the
                sentence after it in either language.
              */}
              <span className="block font-medium text-foreground">{t.account.ephemeral}</span>
              <span className="mt-0.5 block">{t.account.ephemeralHint}</span>
            </div>
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(event) => {
            // The sign-out is a round trip ending in a reload; letting the menu
            // close first would unmount the component mid-request.
            event.preventDefault();
            void signOut();
          }}
          disabled={busy}
          className="text-muted-foreground focus:text-foreground"
        >
          <LogOut aria-hidden="true" />
          {busy ? t.account.signingOut : t.account.signOut}
        </DropdownMenuItem>
        {/*
          Second, and below, because it is the rarer and the heavier of the two.
          Somebody reaching for this has decided a session is somewhere it
          should not be, so the label says what it ends rather than dressing it
          up: every device, this one included.
        */}
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            void signOut(true);
          }}
          disabled={busy}
          className="text-muted-foreground focus:text-foreground"
        >
          <LogOut aria-hidden="true" />
          <span className="flex flex-col">
            <span>{busy ? t.account.signingOut : t.account.signOutEverywhere}</span>
            <span className="text-xs text-muted-foreground">
              {t.account.signOutEverywhereHint}
            </span>
          </span>
        </DropdownMenuItem>

        {/*
          Every session, to see and end one at a time. Loaded when opened
          rather than with the page: it is a rarer question than who is signed
          in, and the answer should be as fresh as the moment it is asked.
          This device is listed without an action, because ending it is what
          *Sign out* above already does.
        */}
        <DropdownMenuSub
          onOpenChange={(open) => {
            if (open) void loadSessions();
          }}
        >
          <DropdownMenuSubTrigger disabled={busy} className="text-muted-foreground focus:text-foreground">
            <MonitorSmartphone aria-hidden="true" />
            {t.account.sessions}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-[260px]">
            {sessions === 'loading' || sessions === 'failed' ? (
              <div className="px-2 py-1.5 text-[12px] text-muted-foreground" role="status">
                {sessions === 'loading' ? t.account.sessionsLoading : t.account.sessionsFailed}
              </div>
            ) : (
              sessions.rows.map((row) =>
                row.current ? (
                  <div key={row.id} className="flex flex-col gap-0.5 px-2 py-1.5">
                    <span className="text-[13px] font-medium text-foreground">{t.account.sessionThisDevice}</span>
                    <span className="text-[12px] text-muted-foreground">{t.account.sessionStarted(when(row.startedAt))}</span>
                  </div>
                ) : (
                  <DropdownMenuItem
                    key={row.id}
                    disabled={busy}
                    onSelect={(event) => {
                      event.preventDefault();
                      void endSession(row, sessions.endOthersUntil);
                    }}
                    aria-label={t.account.sessionEnd(when(row.startedAt))}
                    title={t.account.sessionEnd(when(row.startedAt))}
                    className="justify-between text-muted-foreground focus:text-foreground"
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-[13px] text-foreground">{t.account.sessionStarted(when(row.startedAt))}</span>
                      <span className="truncate text-[12px]">{t.account.sessionLastActive(ago(row.lastActiveAt))}</span>
                    </span>
                    <X aria-hidden="true" />
                  </DropdownMenuItem>
                ),
              )
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuItem asChild>
          {/*
            A plain link the browser downloads, not a fetch: the file is the
            account, and the browser's own download is the one place it should
            land. Same origin, so the session cookie goes with it.
          */}
          <a href="/api/account" download>
            <Download aria-hidden="true" />
            <span>{t.account.exportData}</span>
          </a>
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        {/*
          Last, separated, and the only destructive colour in this menu. Both
          items above it are undone by signing in again; this one is not, and
          the menu should not read as though the three are variations on a
          theme.
        */}
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            void deleteAccount(login);
          }}
          disabled={busy}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 aria-hidden="true" />
          {t.account.deleteAccount}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
