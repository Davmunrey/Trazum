/**
 * Which tool Trazum is running inside.
 *
 * On the Node entry point rather than the browser-safe one, because it reads the
 * process environment. Nothing about the optimisation changes with the answer —
 * the same prompt optimises the same way everywhere, as it must, and that is a
 * standing constraint rather than a coincidence.
 *
 * Environment markers identify the execution host, not its payment mode. The
 * same host can use a subscription, API credentials, credits or a local model.
 * Never infer invoice savings from the terminal running the command.
 */

export interface HostEnvironment {
  id: string;
  displayName: string;
  /**
   * Verified payment mode, if known. Host identity alone cannot establish it.
   *
   * `unknown` is honest rather than lazy: a VS Code terminal says nothing about
   * whether the prompts written in it go to a metered API or a subscription, and
   * guessing either way would be worse than saying so.
   */
  billing: 'per-token' | 'subscription' | 'unknown';
  /** The variable that gave it away, so the answer is checkable rather than magic. */
  evidence: string | null;
}

/**
 * Hosts recognised by an environment variable they set.
 *
 * A miss is harmless: it falls through to `terminal` and nothing changes. That
 * asymmetry is why the list can include entries verified only by documentation
 * rather than by running under them — the cost of a wrong row is a detection
 * that never fires, not a wrong report.
 *
 * Ordered most-specific first. Cursor is a VS Code fork and sets
 * `TERM_PROGRAM=vscode` as well, so a VS Code row above it would swallow every
 * Cursor session.
 */
const HOSTS: Array<{
  id: string;
  displayName: string;
  test: (env: NodeJS.ProcessEnv) => string | null;
}> = [
  {
    id: 'claude-code',
    displayName: 'Claude Code',
    test: (e) => (e.CLAUDECODE ? 'CLAUDECODE' : null),
  },
  {
    id: 'codex',
    displayName: 'Codex',
    test: (e) => (e.CODEX_SANDBOX ? 'CODEX_SANDBOX' : e.CODEX_HOME ? 'CODEX_HOME' : null),
  },
  {
    id: 'cursor',
    displayName: 'Cursor',
    test: (e) => (e.CURSOR_TRACE_ID ? 'CURSOR_TRACE_ID' : null),
  },
  {
    id: 'github-actions',
    displayName: 'GitHub Actions',
    test: (e) => (e.GITHUB_ACTIONS ? 'GITHUB_ACTIONS' : null),
  },
  { id: 'ci', displayName: 'CI', test: (e) => (e.CI ? 'CI' : null) },
  {
    id: 'vscode',
    displayName: 'VS Code',
    test: (e) => (e.TERM_PROGRAM === 'vscode' ? 'TERM_PROGRAM' : null),
  },
];

/** The host, or a plain terminal when nothing identifies itself. */
export function detectHost(env: NodeJS.ProcessEnv = process.env): HostEnvironment {
  for (const host of HOSTS) {
    const evidence = host.test(env);
    if (evidence !== null) {
      return { id: host.id, displayName: host.displayName, billing: 'unknown', evidence };
    }
  }
  return { id: 'terminal', displayName: 'terminal', billing: 'unknown', evidence: null };
}
