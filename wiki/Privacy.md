> Generated from [`README.md`](https://github.com/Davmunrey/Trazum/blob/main/README.md) by `scripts/build-wiki.mjs`.
> Edit that file, not this page: an edit here is overwritten by the next build,
> and a wiki that has drifted from the repository is worse than no wiki.

## Analytics and privacy

**There are two configurations and they have different answers.** Both are stated
here because the short version was wrong: this section said prompts are never
stored on any server, without qualification, for several releases after the
prompt library shipped and made that conditional.

- **Signed out — the default.** Nothing about a prompt is written server-side.
  Optimisation is synchronous: the response carries the result, and history lives
  in the browser's localStorage. This is what a deployment does with no
  `TRAZUM_GITHUB_CLIENT_ID` configured, and signing in cannot be switched on by a
  visitor.
- **Signed in, with the prompt library.** Saving a prompt writes its text to
  Postgres — `trazum_prompt_versions.text`, one row per version, because a library
  that cannot show you yesterday's wording is not a library. Nothing is written
  until you save, and the database is the operator's rather than ours.
  [docs/accounts.md](https://github.com/Davmunrey/Trazum/blob/main/docs/accounts.md) is the full account, including the row
  level security the schema turns on and why it uses `ENABLE` and not `FORCE`.
- Analytics (PostHog) is **off by default** and never sends prompt content —
  only aggregate metrics (reduction percentage, level, model, locale). It
  switches on only when the operator sets `NEXT_PUBLIC_POSTHOG_KEY`, which also
  adds the analytics origin to the Content-Security-Policy; with no key the
  policy stays `connect-src 'self'`. When it is on, the only events sent are
  the ones the app names: autocapture, automatic pageviews, session
  recordings, heatmaps and surveys are switched off by name, nothing is kept
  in a cookie, and every URL an event carries has its share token replaced
  (`/c/:token`) and its query dropped before it leaves the browser.
- Vercel Speed Insights is **off by default**, and is a separate switch from
  PostHog. It measures page performance and is not one of the aggregate metrics
  above. It switches on only when the operator builds the web app with
  `NEXT_PUBLIC_VERCEL_SPEED_INSIGHTS=1`; any other value, including `0` and
  `true`, leaves it off. Off, the package is not loaded and no script is added
  to the page. On, the page adds a script that Vercel serves at
  `/_vercel/speed-insights/script.js`, so it works only on a Vercel
  deployment. That script is not in the package and was not read when this was
  written, so what it sends is known only from the hook the package offers: a
  measurement carries the page's URL and route. Both pass through the rule
  PostHog events use (share token replaced with `:token`, query and fragment
  dropped), and a measurement whose URL cannot be parsed is dropped, not sent.
  The Content-Security-Policy is the same with it on and off.
- LLM keys entered in the UI are used for that request and discarded; they are
  neither logged nor persisted.
