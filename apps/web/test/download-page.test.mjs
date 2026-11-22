import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { register } from 'node:module';
import { before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { recordedVersion } from '../../../scripts/npm-channel.mjs';

/**
 * `/download`: a page that tells a visitor what to run and what to fetch,
 * held to the sources it is drawn from and to what the repository says.
 *
 * - Every command, address and name on it is the one `scripts/install-snippets.mjs`
 *   writes, which `docs/agents.md` is held to as well, so the page and the
 *   document cannot differ: this test parses the page's snippets back and
 *   compares them with both.
 * - Every address into a release is built from the version the site was built
 *   at, by the one scheme, and none uses `releases/latest/download`.
 * - Nothing on it says a store has Trazum. There is no store account behind
 *   any of it, and a sentence that said so would be a claim about a listing
 *   that does not exist.
 * - It sends nothing: no script, image, frame or form from anywhere else, and
 *   no call in the code that could.
 */

register('./helpers/loader.mjs', import.meta.url);

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const web = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
/** A code file without its comments: what it does, not what it says. */
const codeOf = (path) =>
  web(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

let download, copyModule, site, siteCopy, locales, metadata, React, server, DownloadPage, sitemap, snippets;

before(async () => {
  download = await import('../lib/download.ts');
  copyModule = await import('../lib/download-copy.ts');
  site = await import('../lib/site.ts');
  siteCopy = await import('../lib/site-copy.ts');
  locales = await import('../lib/marketing-locales.ts');
  metadata = await import('../lib/site-metadata.ts');
  React = await import('react');
  server = await import('react-dom/server');
  ({ DownloadPage } = await import('../components/download/DownloadPage.tsx'));
  ({ default: sitemap } = await import('../app/sitemap.ts'));
  snippets = await import('../../../scripts/install-snippets.mjs');
});

const render = (locale = 'en') => server.renderToStaticMarkup(React.createElement(DownloadPage, { initialLocale: locale }));

const decode = (text) => text.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
/** The text of some markup, tags and entities gone. */
/** Every tag removed, repeated until none is left, so a removal cannot join two halves into a new one. */
const withoutTags = (html) => {
  let before;
  let after = html;
  do {
    before = after;
    after = before.replace(/<[^>]*>/g, '');
  } while (after !== before);
  return after;
};
const textOf = (html) => decode(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ');
/** The markup of the one element `<tag data-attr="value"` opens, to its closing tag. */
const blockOf = (html, tag, attr, value) => {
  const start = html.indexOf(`<${tag} ${attr}="${value}"`);
  assert.notEqual(start, -1, `${attr}="${value}" is not on the page`);
  return html.slice(start, html.indexOf(`</${tag}>`, start));
};

describe('the page and the documentation are one source', () => {
  it('holds the snippets the install-snippets script writes for the package at this version', () => {
    const wanted = snippets.clients(snippets.mcpPackage());
    assert.deepEqual(
      download.DOWNLOAD.clients.map((client) => [client.id, client.code]),
      wanted.map((client) => [client.id, client.code]),
    );
  });

  it('draws each snippet whole, in every language', () => {
    for (const locale of locales.MARKETING_LOCALES) {
      const html = render(locale);
      for (const client of download.DOWNLOAD.clients) {
        const item = blockOf(html, 'li', 'data-client', client.id);
        const text = decode(item);
        if (client.id === 'claude-desktop-bundle') {
          assert.ok(text.includes(`href="${client.code}"`), `${locale}/${client.id}: the button does not go to ${client.code}`);
        } else {
          assert.ok(text.includes(client.code.split('\n')[0]), `${locale}/${client.id}: the first line is not there`);
          assert.ok(decode(withoutTags(item)).includes(client.code), `${locale}/${client.id}: the snippet is not there whole`);
        }
      }
    }
  });

  it('is the snippets docs/agents.md holds, every one of them', () => {
    const agents = read('docs/agents.md');
    for (const client of download.DOWNLOAD.clients) assert.ok(agents.includes(client.code), `docs/agents.md does not hold the ${client.label} snippet the page shows`);
  });

  it('names the package at the exact version in every one that starts it', () => {
    const pinned = `${download.DOWNLOAD.mcpPackage}@${download.DOWNLOAD.version}`;
    for (const client of download.DOWNLOAD.clients) {
      for (const [at] of client.code.matchAll(/@trazum\/mcp(?!@)/g)) assert.fail(`${client.id} names ${at} with no version`);
      if (client.pinnedBy === undefined && client.id !== 'claude-desktop-bundle') assert.ok(client.code.includes(pinned), `${client.id} does not start ${pinned}`);
    }
    const mcp = JSON.parse(read('packages/mcp/package.json'));
    assert.equal(download.DOWNLOAD.mcpPackage, mcp.name);
    assert.equal(download.DOWNLOAD.version, recordedVersion(mcp.version, ROOT));
  });

  it('is at the version the repository is at', () => {
    // The release on latest. On a next's tree the manifests carry the prerelease and the page keeps the release (scripts/npm-channel.mjs).
    assert.equal(download.DOWNLOAD.version, recordedVersion(JSON.parse(read('package.json')).version, ROOT));
    assert.equal(download.DOWNLOAD.version, recordedVersion(JSON.parse(read('apps/web/package.json')).version, ROOT));
  });

  it('shows the Action line the setup guide documents, and every pin the guide documents is that one', () => {
    const pins = [...read('docs/setup.md').matchAll(/uses: (TrazumAPP\/Trazum@[0-9a-f]{40} {2}# \d+\.\d+\.\d+)/g)].map((match) => match[1]);
    assert.ok(pins.length > 0);
    assert.deepEqual([...new Set(pins)], [download.ACTION_LINE.replace('- uses: ', '')]);
    for (const locale of locales.MARKETING_LOCALES) assert.ok(textOf(render(locale)).includes(download.ACTION_LINE.replace(/\s+/g, ' ')), `${locale}: the Action line`);
  });
});

describe('the files are the ones a release carries, by one scheme', () => {
  const files = () => download.DOWNLOAD.files;
  const base = (v) => `https://github.com/TrazumAPP/Trazum/releases/download/v${v}`;

  it('are named from the version, and addressed on the release of that version', () => {
    const v = download.DOWNLOAD.version;
    assert.deepEqual(files(), {
      vsix: { name: `trazum-vscode-${v}.vsix`, url: `${base(v)}/trazum-vscode-${v}.vsix` },
      mcpb: { name: `trazum-mcp-${v}.mcpb`, url: `${base(v)}/trazum-mcp-${v}.mcpb` },
      sums: { name: 'SHA256SUMS', url: `${base(v)}/SHA256SUMS` },
      sbom: { name: `trazum-v${v}.cdx.json`, url: `${base(v)}/trazum-v${v}.cdx.json` },
    });
    assert.equal(download.DOWNLOAD.releaseUrl, `https://github.com/TrazumAPP/Trazum/releases/tag/v${v}`);
  });

  it('are the names the release workflow attaches', () => {
    const workflow = read('.github/workflows/release.yml');
    const v = download.DOWNLOAD.version;
    for (const name of ['trazum-vscode-$version.vsix', 'trazum-mcp-$version.mcpb', 'SHA256SUMS', 'trazum-v$version.cdx.json']) {
      assert.ok(workflow.includes(name), `the release workflow does not mention ${name}`);
    }
    assert.ok(v.length > 0);
  });

  it('are linked from the page at those addresses, in every language, and never through `latest`', () => {
    for (const locale of locales.MARKETING_LOCALES) {
      const html = render(locale);
      for (const [id, file] of [['vsix', files().vsix], ['mcpb', files().mcpb], ['sums', files().sums], ['sbom', files().sbom]]) {
        const link = new RegExp(`<a href="([^"]*)"[^>]*data-download-file="${id}"`).exec(html);
        assert.ok(link, `${locale}: no link for ${id}`);
        assert.equal(link[1], file.url, `${locale}: ${id}`);
      }
      assert.doesNotMatch(html, /releases\/latest/, `${locale}: the page goes through a movable address`);
    }
  });

  it('opens the extension with the command VS Code documents, for the file it names', () => {
    assert.equal(download.VSIX_COMMAND, `code --install-extension ${files().vsix.name}`);
  });
});

describe('the command line', () => {
  it('names the CLI at the exact version for npx and npm, and the tap for Homebrew', () => {
    const { cliPackage, version } = download.DOWNLOAD;
    assert.equal(cliPackage, JSON.parse(read('packages/cli/package.json')).name);
    assert.deepEqual(download.CLI_COMMANDS.map((entry) => entry.command), [
      `npx ${cliPackage}@${version} bill`,
      `npm install -g ${cliPackage}@${version}`,
      'brew install Davmunrey/trazum/trazum',
    ]);
  });

  it('asks Homebrew for the formula this repository keeps, from the tap its documents name', () => {
    const formula = read('packaging/homebrew/trazum.rb');
    assert.match(formula, /^class Trazum < Formula$/m);
    for (const locale of locales.MARKETING_LOCALES) assert.ok(copyModule.DOWNLOAD_COPY[locale].cliBrewNote.includes('Davmunrey/homebrew-trazum'), locale);
  });

  it('draws all three, in every language', () => {
    for (const locale of locales.MARKETING_LOCALES) {
      const html = render(locale);
      for (const entry of download.CLI_COMMANDS) assert.ok(blockOf(html, 'li', 'data-cli', entry.id).includes(entry.command.replace(/&/g, '&amp;')), `${locale}/${entry.id}`);
    }
  });
});

describe('every section is there, in order, in every language', () => {
  it('has the five, and the checksums link to the file', () => {
    for (const locale of locales.MARKETING_LOCALES) {
      const html = render(locale);
      const ids = [...html.matchAll(/data-download-section="([^"]+)"/g)].map((match) => match[1]);
      assert.deepEqual(ids, ['cli', 'mcp', 'extension', 'action', 'checksums'], locale);
      assert.match(html, /<h1[^>]*>[^<]+<\/h1>/);
      assert.equal((html.match(/<h1\b/g) ?? []).length, 1, `${locale}: more than one h1`);
    }
  });

  it('says which version it is for, in the visitor\'s language', () => {
    for (const locale of locales.MARKETING_LOCALES) {
      assert.ok(textOf(render(locale)).includes(copyModule.DOWNLOAD_COPY[locale].versionLine(download.DOWNLOAD.version)), locale);
    }
  });

  it('is in the header, the footer and the sitemap, with a label in every language', () => {
    assert.ok(site.HEADER_ENTRIES.includes('download'));
    assert.equal(site.SITE_LINKS.download.href, '/download');
    assert.equal(site.DOWNLOAD_PATH, '/download');
    assert.ok(site.SITEMAP_PATHS.includes('/download'));
    assert.ok(site.FOOTER_GROUPS.some((group) => group.links.includes('download')), 'the footer lacks it');
    const listed = sitemap().map((entry) => new URL(entry.url).pathname);
    assert.ok(listed.includes('/download'), 'sitemap.xml lacks it');
    assert.deepEqual(listed, [...site.SITEMAP_PATHS], 'the sitemap is not drawn from SITEMAP_PATHS');
    for (const locale of locales.MARKETING_LOCALES) {
      const label = siteCopy.SITE_COPY[locale].links.download;
      assert.ok(typeof label === 'string' && label.trim() !== '', locale);
      const html = render(locale);
      assert.ok((html.match(/href="\/download"/g) ?? []).length >= 2, `${locale}: the header and the footer do not both link it`);
    }
  });

  it('has a title and a description of its own, canonical at /download', () => {
    for (const locale of locales.MARKETING_LOCALES) {
      const meta = metadata.downloadMetadata(locale);
      assert.match(meta.title.absolute, /· Trazum$/);
      assert.ok(meta.description.length > 40);
      assert.equal(meta.alternates?.canonical, '/download');
    }
  });
});

describe('the words', () => {
  const texts = () => copyModule.DOWNLOAD_COPY;
  const flatten = (copy) => Object.entries(copy).flatMap(([key, value]) => (Array.isArray(value) ? value.map((item, at) => [`${key}[${at}]`, item]) : typeof value === 'function' ? [[key, value('X')]] : [[key, value]]));

  it('have the same keys in every language, none empty, and no em-dash', () => {
    const t = texts();
    const keys = Object.keys(t.en).sort();
    for (const locale of locales.MARKETING_LOCALES) {
      assert.deepEqual(Object.keys(t[locale]).sort(), keys, locale);
      for (const [key, text] of flatten(t[locale])) {
        assert.ok(typeof text === 'string' && text.trim() !== '', `${locale}.${key} is empty`);
        assert.doesNotMatch(text, /—/, `${locale}.${key} has an em-dash`);
      }
    }
  });

  it('claim no listing: no store, in any language, in the words or on the page', () => {
    /*
      There is no store account behind any of this and no listing, and a
      sentence that said Trazum was in one would be a claim about something
      that does not exist. The words the claim would need are refused wherever
      they could appear: the copy, the rendered page in every language, the
      metadata, and the page's own source.
    */
    const t = texts();
    const claim = /marketplace|market place|open ?vsx|vscode\.dev|visual studio marketplace|homebrew-core|homebrew\/core|app store|play store|chrome web store|\bppa\b|\bsnap\b|winget|chocolatey/i;
    for (const locale of locales.MARKETING_LOCALES) {
      for (const [key, text] of flatten(t[locale])) assert.doesNotMatch(text, claim, `${locale}.${key}`);
      assert.doesNotMatch(textOf(render(locale)), claim, `${locale}: the rendered page`);
      const meta = metadata.downloadMetadata(locale);
      assert.doesNotMatch(`${meta.title.absolute} ${meta.description}`, claim, `${locale}: the metadata`);
    }
    for (const path of ['components/download/DownloadPage.tsx', 'lib/download.ts', 'lib/download-copy.ts']) assert.doesNotMatch(codeOf(path), claim, path);
  });

  it('say the files carry no signature, rather than imply one', () => {
    const t = texts();
    assert.match(t.en.sumsNote, /no signature and no attestation/);
    assert.match(t.en.mcpBundleNote, /not signed/);
  });
});

describe('the page sends nothing', () => {
  it('has no script, image, frame, form, stylesheet or embed from anywhere, in any language', () => {
    for (const locale of locales.MARKETING_LOCALES) {
      const html = render(locale);
      assert.doesNotMatch(html, /<(script|img|iframe|form|object|embed|video|audio|source)\b/i, `${locale}: an element that fetches`);
      assert.doesNotMatch(html, /<link\b[^>]*rel="(stylesheet|preload|prefetch|preconnect|dns-prefetch)"/i, `${locale}: a link that fetches`);
      assert.doesNotMatch(html, /\ssrc="/, `${locale}: a src`);
    }
  });

  it('leaves the site only by links a visitor follows, all of them into this repository', () => {
    for (const locale of locales.MARKETING_LOCALES) {
      const page = render(locale);
      const main = page.slice(page.indexOf('<main'), page.indexOf('</main>'));
      const hrefs = [...main.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)].map((match) => decode(match[1])).filter((href) => /^https?:/.test(href));
      assert.ok(hrefs.length >= 5, `${locale}: ${hrefs.length} links`);
      for (const href of hrefs) assert.match(href, /^https:\/\/github\.com\/TrazumAPP\/Trazum(\/|$)/, `${locale}: ${href} leaves for somewhere else`);
    }
  });

  it('calls nothing that could: no fetch, request, beacon, socket, image or storage in its code', () => {
    const code = ['components/download/DownloadPage.tsx', 'lib/download.ts', 'lib/download-copy.ts', 'app/download/page.tsx']
      .map((path) => codeOf(path))
      .join('\n');
    assert.doesNotMatch(code, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|new Image\b|localStorage|sessionStorage|document\.cookie|posthog/);
    // The one browser API it uses is the clipboard, from a click.
    assert.match(code, /navigator\.clipboard\.writeText/);
  });
});
