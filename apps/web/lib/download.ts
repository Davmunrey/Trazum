import generated from './history/generated/download';

/**
 * What `/download` says to run, copy and fetch, in one module.
 *
 * Nothing here is typed from memory. The version, the names of the files a
 * release carries, the install snippets for each client and the Action's
 * pinned line are written into `history/generated/download.ts` by
 * `scripts/build-site-pages.mjs` from `package.json`, from
 * `scripts/install-snippets.mjs` (which `docs/agents.md` is held to) and from
 * `docs/setup.md`, so the page and the documentation are one source and
 * cannot disagree. What this module adds is the commands made of those parts.
 *
 * **One scheme for the files.** Every address points at the release of the
 * version the site was built at, by a name that carries that version:
 * `releases/download/v3.0.0/trazum-vscode-3.0.0.vsix`. There is no
 * `releases/latest/download/<name>` here, because that form needs a name
 * without a version and a release's files have one. The cost is stated on the
 * page: the files are attached after npm serves the packages, so for a short
 * while after a release merges the address does not answer.
 */

export const DOWNLOAD = generated;

const { version, cliPackage, files, action } = DOWNLOAD;

/** The three ways to start the CLI, each at the version this page is for. */
export const CLI_COMMANDS = [
  { id: 'npx', command: `npx ${cliPackage}@${version} bill` },
  { id: 'npm', command: `npm install -g ${cliPackage}@${version}` },
  // The tap is the repository `Davmunrey/homebrew-trazum`; the formula inside it names one version.
  { id: 'brew', command: 'brew install Davmunrey/trazum/trazum' },
] as const;

/** Installing the extension from a terminal, as VS Code documents it. */
export const VSIX_COMMAND = `code --install-extension ${files.vsix.name}`;

/** The Action's pinned line, as the setup guide writes it. */
export const ACTION_LINE = `- uses: TrazumAPP/Trazum@${action.sha}  # ${action.label}`;

/** Checking the files against `SHA256SUMS`, on Linux and on macOS. */
export const SUMS_COMMAND_LINUX = 'sha256sum --check --ignore-missing SHA256SUMS';
export const SUMS_COMMAND_MAC = `shasum -a 256 ${files.vsix.name}`;
