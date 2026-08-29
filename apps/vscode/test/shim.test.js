import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { register } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

/**
 * The wire, run rather than read.
 *
 * `refusals.test.js` asserts textually that this file computes nothing and
 * writes no status text of its own, and that is worth having — but it is an
 * assertion about what the shim *does not* do. Nothing checked that it does the
 * right thing. The relative path it builds for budget matching, the four
 * separate branches that hide the item, the debounce that keeps `optimize` off
 * the keystroke path, and the listener that must ignore a document which is not
 * on screen were all shipped untested, and every one of them is the kind of
 * fault that leaves the extension quietly showing nothing.
 *
 * The editor is faked to exactly the surface `src/vscode.d.ts` declares, and
 * `contract.test.js` holds the fake to it. Everything under the fake is real:
 * the core, the reading module, and a config parsed off a real file on disk.
 */

register('./helpers/loader.mjs', import.meta.url);

/** A prompt the safe rules genuinely trim, so the debounce has something to find. */
const PROMPT = 'Please could you kindly verify the order identifier. Thank you very much.';

let activate;
let read;
let statusText;
let fake;

let root;

before(async () => {
  /*
    Imported dynamically, and after `register`. A static import is hoisted above
    every statement in the file, so `dist/extension.js` would be resolved before
    the loader existed and its bare `vscode` specifier would fail to resolve.
  */
  ({ activate } = await import('../dist/extension.js'));
  ({ read, statusText } = await import('../dist/reading.js'));
  fake = await import('./helpers/vscode.mjs');
});

beforeEach(() => {
  fake.reset();
  root = mkdtempSync(join(tmpdir(), 'trazum-vscode-'));
  mkdirSync(join(root, 'prompts'));
  writeFileSync(
    join(root, 'trazum.config.json'),
    JSON.stringify({ extensions: ['.txt'], budgets: { 'prompts/*.txt': 40 } }),
  );
  fake.openFolder(root);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/**
 * Waits for something the shim did, never for a duration.
 *
 * The refresh is asynchronous because it reads the config off disk, so there is
 * no tick count that is right on every machine. Polling a predicate the shim
 * itself satisfies makes the wait as long as it needs to be and no longer, and
 * makes a timeout a real failure rather than a slow runner.
 */
const until = async (predicate, what, deadlineMs = 5_000) => {
  const stop = Date.now() + deadlineMs;
  while (Date.now() < stop) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(`timed out waiting for ${what}`);
};

/** The one status bar item the shim creates, once it has decided something. */
const decided = async () => {
  const [item] = fake.state.items;
  assert.ok(item !== undefined, 'the shim created no status bar item');
  await until(() => item.calls.length > 0, 'the shim to show or hide the item');
  return item;
};

describe('what the shim wires up', () => {
  it('creates one item, on the right, owned by the editor', async () => {
    const context = fake.context();
    activate(context);

    assert.equal(fake.state.items.length, 1);
    const [item] = fake.state.items;
    assert.equal(item.alignment, fake.StatusBarAlignment.Right);
    assert.equal(item.command, 'trazum.showReading');
    /*
      In `subscriptions`, which VS Code empties on unload. An item left out of it
      survives the extension being disabled and stays on the status bar with
      nothing behind it.
    */
    assert.ok(context.subscriptions.includes(item), 'the item is not disposed with the extension');
    assert.ok(fake.state.commands.has('trazum.showReading'), 'the command is not registered');
  });
});

describe('what the shim shows', () => {
  it('reads the file at the path the project would match, not the one on disk', async () => {
    /*
      The claim under test is one line: `relative(folder.uri.fsPath, fileName)`.
      Proved through the budget rather than by watching the call — the config
      scopes `prompts/*.txt`, which matches the workspace-relative path and
      cannot match the absolute one. A shim that passed `/tmp/.../prompts/
      support.txt` shows a bare token count, and the budget silently stops
      applying in the editor while `trazum check` still enforces it.
    */
    fake.state.activeTextEditor = fake.editor(join(root, 'prompts', 'support.txt'), PROMPT);
    activate(fake.context());

    const item = await decided();
    assert.equal(item.visible, true);
    assert.match(item.text, / \/ 40$/, `no budget in the status bar: ${item.text}`);

    const expected = read(PROMPT, {
      path: 'prompts/support.txt',
      config: { extensions: ['.txt'], budgets: { 'prompts/*.txt': 40 } },
    });
    assert.equal(item.text, statusText(expected.reading));
  });

  it('normalises the separator, which only a Windows machine could see fail', () => {
    /*
      The one assertion here that has to be textual, and it says so. `relative`
      returns `prompts\\support.txt` on Windows while every glob in a config is
      written with forward slashes, so without the conversion the budget stops
      matching for every contributor on that platform. On Linux, where this
      suite runs, `sep` is already `/` and the conversion is a no-op that no
      behaviour can distinguish — so the line is asserted as text, bounded to
      the statement that builds the path, rather than left unheld because the
      runner cannot reach the platform it protects.
    */
    const shim = readFileSync(new URL('../src/extension.ts', import.meta.url), 'utf8');
    /*
      Bound to the binding that is handed to `read`, not to the first one that
      happens to be called `path`. The first version of this assertion matched
      `const path = join(root, 'trazum.config.json')` inside `projectConfig` and
      reported the shim as broken — the neighbour, not the subject, which is
      this repository's most-broken rule and it broke here too.
    */
    const built = [...shim.matchAll(/\bconst path = ([^;]+);/g)]
      .map(([, value]) => value)
      .filter((value) => value.includes('relative('));
    assert.equal(built.length, 1, `expected one path built from \`relative\`, found ${built.length}`);
    assert.match(built[0], /relative\(folder\.uri\.fsPath,/, 'the path is not relative to the workspace folder');
    assert.match(built[0], /\.split\(sep\)\.join\('\/'\)/, 'the path keeps the platform separator');
    assert.match(shim, /read\(text, \{ path,/, 'that path is not the one handed to `read`');
  });
});

describe('when there is nothing to say, the shim says nothing', () => {
  it('hides for a file the project does not treat as a prompt', async () => {
    fake.state.activeTextEditor = fake.editor(join(root, 'prompts', 'notes.md'), PROMPT);
    activate(fake.context());

    const item = await decided();
    assert.deepEqual(item.calls, ['hide']);
    assert.equal(item.text, '', 'the shim wrote a reading for a file it then hid');
  });

  it('hides with no editor open at all', async () => {
    activate(fake.context());
    const item = await decided();
    assert.deepEqual(item.calls, ['hide']);
  });

  it('hides outside a workspace, where a relative path has no meaning', async () => {
    /*
      Not a refusal to be tidy about. Without a folder there is nothing to make
      the path relative to, so budget matching would run against an absolute
      path and quietly report no budget where the project has one.
    */
    fake.state.workspaceFolders = undefined;
    fake.state.activeTextEditor = fake.editor(join(root, 'prompts', 'support.txt'), PROMPT);
    activate(fake.context());

    const item = await decided();
    assert.deepEqual(item.calls, ['hide']);
  });

  it('hides when the setting is off, and shows when it is merely unset', async () => {
    fake.setSetting('trazum', 'enabled', false);
    fake.state.activeTextEditor = fake.editor(join(root, 'prompts', 'support.txt'), PROMPT);
    activate(fake.context());

    const off = await decided();
    assert.deepEqual(off.calls, ['hide']);

    /*
      The other half, and the half that breaks. `get('enabled', true)` has to
      answer `true` for a user who never opened the settings page, or the
      extension ships switched off for everybody.
    */
    fake.reset();
    fake.openFolder(root);
    fake.state.activeTextEditor = fake.editor(join(root, 'prompts', 'support.txt'), PROMPT);
    activate(fake.context());

    const unset = await decided();
    assert.deepEqual(unset.calls, ['show']);
  });

  it('hides for an empty buffer rather than reporting nothing as zero', async () => {
    fake.state.activeTextEditor = fake.editor(join(root, 'prompts', 'support.txt'), '   \n');
    activate(fake.context());

    const item = await decided();
    assert.deepEqual(item.calls, ['hide']);
  });
});

describe('a config that does not parse is not a reason to show nothing', () => {
  it('falls back to an empty config and still counts the tokens', async () => {
    writeFileSync(join(root, 'trazum.config.json'), '{ this is not json');
    fake.state.activeTextEditor = fake.editor(join(root, 'prompts', 'support.txt'), PROMPT);
    activate(fake.context());

    const item = await decided();
    assert.equal(item.visible, true);
    /*
      No budget, because the file that declared one is unreadable — but a count,
      because refusing to show a token count over a typo three directories up
      would be worse than the status bar the extension replaces. `trazum check`
      is where a broken config is supposed to stop somebody.
    */
    assert.doesNotMatch(item.text, /\//, `a budget survived an unparseable config: ${item.text}`);
    assert.match(item.text, /tokens$/);
  });
});

describe('the expensive half waits for the typing to stop', () => {
  it('shows the count immediately and the recoverable figure only later', async () => {
    fake.state.activeTextEditor = fake.editor(join(root, 'prompts', 'support.txt'), PROMPT);
    activate(fake.context());

    const item = await decided();
    /*
      Before the settle: the tooltip is the status text, because the rules have
      not run. It must not say "0 recoverable" — telling somebody their prompt
      is already tight when nothing has checked is the failure `reading.ts`
      spends a paragraph on, and `null` is not zero.
    */
    assert.equal(item.tooltip, item.text);
    assert.doesNotMatch(item.tooltip, /recover/i);

    await until(() => /recover/i.test(item.tooltip), 'the rules to run after the settle');
    assert.match(item.tooltip, /would recover about \d/);
    assert.match(item.tooltip, /±\d+%/, 'the tooltip dropped the error band');
  });
});

describe('the command reports what is on screen', () => {
  it('says so plainly when there is no prompt in view', async () => {
    activate(fake.context());
    await decided();

    fake.state.commands.get('trazum.showReading')();
    assert.deepEqual(fake.state.messages, ['No prompt in view.']);
  });

  it('and otherwise shows the same detail the tooltip carries', async () => {
    fake.state.activeTextEditor = fake.editor(join(root, 'prompts', 'support.txt'), PROMPT);
    activate(fake.context());

    const item = await decided();
    await until(() => /recover/i.test(item.tooltip), 'the rules to run after the settle');

    fake.state.commands.get('trazum.showReading')();
    assert.deepEqual(fake.state.messages, [item.tooltip]);
  });
});

describe('the shim listens to the editor it is showing', () => {
  it('follows the active editor from nothing to a prompt', async () => {
    activate(fake.context());
    const item = await decided();
    assert.deepEqual(item.calls, ['hide']);

    fake.fire.activeEditor(fake.editor(join(root, 'prompts', 'support.txt'), PROMPT));
    await until(() => item.visible, 'the item to appear for the newly active editor');
    assert.match(item.text, /tokens/);
  });

  it('ignores a change in a document that is not on screen', async () => {
    /*
      The branch is `event.document === editor.document`, and without it the
      status bar reports the wrong file: a formatter or a language server
      touching a buffer in the background would repaint the item with a reading
      for a document nobody is looking at.
    */
    const onScreen = fake.editor(join(root, 'prompts', 'support.txt'), PROMPT);
    fake.state.activeTextEditor = onScreen;
    activate(fake.context());

    const item = await decided();
    await until(() => /recover/i.test(item.tooltip), 'the first settle');
    const before = { text: item.text, calls: item.calls.length };

    fake.fire.documentChanged(fake.document(join(root, 'prompts', 'other.txt'), 'Something else entirely.'));
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(item.text, before.text, 'a background document repainted the status bar');
    assert.equal(item.calls.length, before.calls, 'a background document caused a refresh');
  });

  it('and repaints for a change in the document that is', async () => {
    const onScreen = fake.editor(join(root, 'prompts', 'support.txt'), PROMPT);
    fake.state.activeTextEditor = onScreen;
    activate(fake.context());

    const item = await decided();
    const before = item.text;

    fake.state.activeTextEditor = fake.editor(join(root, 'prompts', 'support.txt'), `${PROMPT} ${PROMPT}`);
    fake.fire.documentChanged(fake.state.activeTextEditor.document);
    await until(() => item.text !== before, 'the status bar to follow the edit');
    assert.notEqual(item.text, before);
  });
});
