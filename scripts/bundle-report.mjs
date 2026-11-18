#!/usr/bin/env node
/**
 * How much does a visitor's browser download? The web app's built files,
 * measured and sent to Codecov's bundle analysis.
 *
 *   npm run build:web
 *   node scripts/bundle-report.mjs --analyzer <dir> --dry-run   measure, send nothing
 *   node scripts/bundle-report.mjs --analyzer <dir>             measure and upload
 *
 * `--build <dir>` measures another directory than the web app's. The tests
 * use it, so that they need no build; the workflow does not pass it.
 *
 * `<dir>` is where `@codecov/bundle-analyzer` was installed: outside the
 * workspace, pinned, with install scripts off, the way CI installs
 * `playwright-core`. Nothing published and nothing in the lockfile depends on
 * it, so it is handed in and not imported by name.
 *
 * Why this and not Codecov's Next.js plugin. The plugin is for webpack, and
 * the web app builds with Turbopack. The analyzer needs no bundler: it walks a
 * directory and records each file's name, size and compressed size. So nothing
 * is added to the web app's build, and what is measured is what was built.
 *
 * What is sent: file names and sizes, the commit and the branch. No source.
 *
 * What the figure is and is not. It is everything under `.next/static`: the
 * scripts, the styles, the fonts and the icons a browser can be served. It is
 * not what one page loads, since no visitor downloads every chunk. And the
 * chunks are named by a hash of their contents, so between two commits
 * Codecov sees one file gone and another arrive where a person would see one
 * file that changed. The total is the figure to read; the per-file difference
 * is not.
 *
 * The token is read from the environment, by name, and handed to the
 * analyzer as an option. It is never on a command line and never printed. A
 * pull request from a fork has none, and Codecov takes a bundle report
 * without one from a fork.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** What a browser can be served, as the web app's build writes it. */
export const BUILD = 'apps/web/.next/static';

/** The name the bundle goes by on Codecov. Changing it starts a new history. */
export const NAME = 'trazum-web';

/** The one analyzer version CI installs. `bundle.test.js` holds the workflow to it. */
export const ANALYZER = { name: '@codecov/bundle-analyzer', version: '2.0.1' };

/**
 * What the analyzer is told. `telemetry` is the package's own reporting of
 * errors and timings to its maker, on by default; it is off. `gitService` is
 * what lets a fork's pull request upload without a token.
 */
export function options({ token, dryRun }) {
  const core = { bundleName: NAME, enableBundleAnalysis: true, gitService: 'github', telemetry: false, retryCount: 3, dryRun };
  // Left out, not set to an empty string, when there is none: the analyzer
  // then falls back to the tokenless upload a fork is allowed.
  if (typeof token === 'string' && token !== '') core.uploadToken = token;
  return core;
}

/** What a report says in total, and its largest files: the lines a person reads. */
export function summary(report) {
  const assets = [...(report.assets ?? [])].sort((a, b) => b.size - a.size);
  const sum = (key) => assets.reduce((total, asset) => total + (asset[key] ?? 0), 0);
  return { files: assets.length, bytes: sum('size'), gzip: sum('gzipSize'), largest: assets.slice(0, 5).map(({ name, size, gzipSize }) => ({ name, size, gzip: gzipSize ?? 0 })) };
}

/**
 * Whether the directory is a build worth measuring: it exists and has a
 * script in it. An empty directory measured as "0 bytes" would be recorded as
 * the day the web app got infinitely faster.
 */
export function built(dir) {
  if (!existsSync(dir)) return false;
  const scripts = (at) => readdirSync(at, { withFileTypes: true }).some((entry) => (entry.isDirectory() ? scripts(join(at, entry.name)) : entry.name.endsWith('.js')));
  return scripts(dir);
}

const kb = (bytes) => `${(Math.floor(bytes / 102.4) / 10).toFixed(1)} kB`;

async function main(argv) {
  const flag = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const dryRun = argv.includes('--dry-run');
  const at = flag('--analyzer');
  if (at === undefined) throw new Error('say where the analyzer is installed: --analyzer <directory of @codecov/bundle-analyzer>');
  const installed = JSON.parse(readFileSync(join(resolve(at), 'package.json'), 'utf8'));
  if (installed.name !== ANALYZER.name || installed.version !== ANALYZER.version) {
    throw new Error(`${at} holds ${installed.name}@${installed.version}, and this script was written against ${ANALYZER.name}@${ANALYZER.version}`);
  }
  const dir = resolve(ROOT, flag('--build') ?? BUILD);
  if (!built(dir)) throw new Error(`${flag('--build') ?? BUILD} has no built script in it. Run \`npm run build:web\` first.`);

  const token = process.env.CODECOV_TOKEN;
  console.log(dryRun ? 'A dry run: measured, and sent nowhere.' : typeof token === 'string' && token !== '' ? 'An upload token is set.' : "No upload token here. Codecov takes a bundle report without one only from a fork's pull request.");

  const { createAndUploadReport } = createRequire(join(resolve(at), 'package.json'))(resolve(at));
  const report = summary(JSON.parse(await createAndUploadReport([dir], options({ token, dryRun }), { ignorePatterns: ['*.map'] })));
  console.log(`${NAME}: ${report.files} files, ${kb(report.bytes)}, ${kb(report.gzip)} compressed  (${report.bytes.toLocaleString('en-US')} and ${report.gzip.toLocaleString('en-US')} bytes)`);
  for (const asset of report.largest) console.log(`  ${kb(asset.size).padStart(10)}  ${kb(asset.gzip).padStart(10)} compressed  ${asset.name}`);
  if (!dryRun) console.log('Sent to Codecov.');
  return 0;
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(`bundle-report: ${error.message}`);
      process.exit(1);
    },
  );
}
