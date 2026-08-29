import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { before, describe, it } from 'node:test';

/**
 * `vscode.d.ts` is a hand-written contract, and two things can drift from it.
 *
 * **The fake.** `test/helpers/vscode.mjs` is the editor `shim.test.js` runs
 * against, and it is the only editor this repository ever runs against — no
 * copy of VS Code is downloaded, by design. A fake that grew a member the real
 * API does not have, or lost one it does, would leave the whole shim suite
 * green while proving something about an editor nobody ships. Nothing in the
 * toolchain notices: the fake is plain JavaScript reached through a loader, so
 * `tsc` never sees it against the declaration file at all.
 *
 * **The contract itself.** The declaration says it is *"exactly as wide as what
 * `extension.ts` touches"*, and a surface that is wider than that is a surface
 * somebody widened without meaning to — the install-only dependency this file
 * exists to avoid, growing back one member at a time.
 *
 * The direction this file does **not** hold is the shim reaching for a member
 * that is not declared: `tsc` already fails on that, and a second copy of the
 * compiler's job written in regular expressions would be worse than none.
 */

register('./helpers/loader.mjs', import.meta.url);

const declared = readFileSync(new URL('../src/vscode.d.ts', import.meta.url), 'utf8');
const shim = readFileSync(new URL('../src/extension.ts', import.meta.url), 'utf8');

/** The declaration with its prose removed, so a name in a comment is not a use. */
const withoutProse = declared.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

/** Every top-level thing the module declares. */
const TOP_LEVEL = [...withoutProse.matchAll(/^ {2}export (?:interface|const enum|namespace) (\w+)/gm)].map(
  ([, name]) => name,
);

/** The body of one `export namespace`, or a throw. */
const namespaceBody = (name) => {
  const found = new RegExp(`export namespace ${name} \\{\\n([\\s\\S]*?)\\n {2}\\}`).exec(withoutProse);
  if (found === null) throw new Error(`no namespace ${name} in vscode.d.ts`);
  return found[1];
};

/** The body of one `export interface`, or a throw. */
const interfaceBody = (name) => {
  const found = new RegExp(`export interface ${name}(?: extends \\w+)? \\{\\n([\\s\\S]*?)\\n {2}\\}`).exec(
    withoutProse,
  );
  if (found === null) throw new Error(`no interface ${name} in vscode.d.ts`);
  return found[1];
};

/** What a namespace declares: `const` names, and functions with their parameters. */
const membersOf = (name) => {
  const body = namespaceBody(name);
  const constants = [...body.matchAll(/^\s*const (\w+):/gm)].map(([, member]) => ({
    name: member,
    kind: 'const',
  }));
  const functions = [...body.matchAll(/^\s*function (\w+)\(([^)]*)\)/gm)].map(([, member, params]) => {
    const parts = params.trim() === '' ? [] : params.split(/,(?![^<]*>)/);
    return { name: member, kind: 'function', total: parts.length };
  });
  return [...constants, ...functions];
};

/** Names declared on an interface, `readonly` and method alike. */
const propertiesOf = (name) =>
  [...interfaceBody(name).matchAll(/^\s*(?:readonly )?(\w+)[?]?(?:<[^>]*>)?\s*[(:]/gm)].map(
    ([, member]) => member,
  );

const NAMESPACES = ['window', 'workspace', 'commands'];

let fake;

before(async () => {
  fake = await import('./helpers/vscode.mjs');
});

describe('the declaration parses to something, or none of this checks anything', () => {
  it('finds the declarations it is about to check', () => {
    /*
      The whole file reads a `.d.ts` with regular expressions. A reformat that
      broke the parse would turn every assertion below into a loop over an empty
      list, which passes. This is the guard on the guards.
    */
    assert.ok(TOP_LEVEL.length >= 8, `only ${TOP_LEVEL.length} declarations parsed — has the layout moved?`);
    for (const name of NAMESPACES) {
      assert.ok(membersOf(name).length > 0, `namespace ${name} parsed to no members`);
    }
    /*
      Named members rather than a count. A count is a number nobody can check
      and one that has to be edited every time the contract legitimately grows;
      a member that must be there is a fact about the interface.
    */
    assert.ok(propertiesOf('StatusBarItem').includes('text'), 'StatusBarItem parsed without its text');
    assert.ok(propertiesOf('WorkspaceConfiguration').includes('get'), 'WorkspaceConfiguration parsed empty');
  });
});

describe('the fake is the editor the declaration describes', () => {
  for (const namespace of NAMESPACES) {
    it(`implements every member of ${namespace}`, () => {
      const actual = fake[namespace];
      assert.ok(actual !== undefined, `the fake exports no ${namespace}`);

      for (const member of membersOf(namespace)) {
        assert.ok(member.name in actual, `the fake's ${namespace} is missing ${member.name}`);
        if (member.kind !== 'function') continue;

        const implementation = actual[member.name];
        assert.equal(
          typeof implementation,
          'function',
          `the fake's ${namespace}.${member.name} is not a function`,
        );
        /*
          Exactly the declared count, optional parameters included. A looser
          rule — anything from the required count up — was the first version,
          and it accepted a `createStatusBarItem(alignment)` that silently
          dropped the priority the shim passes: the fake cannot observe an
          argument it does not take, so no test could ever check that the item
          goes where the shim puts it. Writing a default (`priority = 0`) would
          fail this too, because a JavaScript function's `length` stops at the
          first parameter that has one; take the argument and ignore it.
        */
        assert.equal(
          implementation.length,
          member.total,
          `the fake's ${namespace}.${member.name} takes ${implementation.length} arguments, ` +
            `the declaration passes ${member.total}`,
        );
      }
    });

    it(`and adds nothing to ${namespace} that VS Code would not have`, () => {
      /*
        The other direction, and the one that actually bites. A helper added to
        the fake for a test's convenience is a member the shim could then be
        written against, and it would work here and be undefined in the editor.
      */
      const names = membersOf(namespace).map((member) => member.name);
      for (const key of Object.keys(fake[namespace])) {
        assert.ok(names.includes(key), `the fake's ${namespace} has ${key}, which VS Code does not`);
      }
    });
  }

  it('creates a status bar item with every member declared on one', () => {
    const item = fake.window.createStatusBarItem(fake.StatusBarAlignment.Right, 100);
    for (const property of propertiesOf('StatusBarItem')) {
      assert.ok(property in item, `the fake's status bar item is missing ${property}`);
    }
    /*
      `dispose` comes from `Disposable`, which `StatusBarItem` extends, so it is
      not in that interface's own body and has to be asked for by name.
    */
    assert.equal(typeof item.dispose, 'function', 'the fake\'s status bar item cannot be disposed');
  });

  it('answers getConfiguration with something shaped like a configuration', () => {
    const configuration = fake.workspace.getConfiguration('trazum');
    for (const property of propertiesOf('WorkspaceConfiguration')) {
      assert.ok(property in configuration, `the fake's configuration is missing ${property}`);
    }
  });

  it('returns something disposable from every listener it registers', () => {
    /*
      The declaration says these return a `Disposable`, and the shim pushes each
      into `context.subscriptions` for VS Code to empty. A fake returning
      `undefined` would make that push succeed and the disposal throw, which is
      a fault only the editor would ever see.
    */
    const registered = [
      fake.window.onDidChangeActiveTextEditor(() => {}),
      fake.workspace.onDidChangeTextDocument(() => {}),
      fake.commands.registerCommand('trazum.nothing', () => {}),
    ];
    for (const disposable of registered) {
      assert.equal(typeof disposable?.dispose, 'function', 'a listener returned nothing to dispose');
      disposable.dispose();
    }
  });
});

describe('the declaration is no wider than the shim', () => {
  it('declares nothing the shim and the declaration both leave unused', () => {
    const unused = TOP_LEVEL.filter((name) => {
      if (new RegExp(`\\bvscode\\.${name}\\b`).test(shim)) return false;
      // Referenced by another declaration — `Disposable` is named by
      // `ExtensionContext` and extended by `StatusBarItem`, and is used for
      // exactly that reason rather than by the shim directly.
      const mentions = withoutProse.match(new RegExp(`\\b${name}\\b`, 'g')) ?? [];
      return mentions.length <= 1;
    });
    assert.deepEqual(
      unused,
      [],
      `vscode.d.ts declares a surface nothing uses — narrow it: ${unused.join(', ')}`,
    );
  });
});
