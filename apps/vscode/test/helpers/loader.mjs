/**
 * One redirection: the bare specifier `vscode`, which resolves nowhere.
 *
 * VS Code injects that module into the extension host at runtime. It is not on
 * npm as a runtime package, it is not in `node_modules`, and `dist/extension.js`
 * imports it at the top of the file — so plain `node --test` cannot load the
 * shim at all without this. Pointed at `vscode.mjs`, which implements exactly
 * the surface `src/vscode.d.ts` declares.
 *
 * Registered with `module.register`, which is stable, rather than
 * `--experimental-test-module-mocks`: this suite should not depend on a flag a
 * Node minor release can rename. The same choice `apps/web/test/helpers` made,
 * for the same reason.
 *
 * Nothing else is faked. `@trazum/core` is the real core, `reading.js` is the
 * real reading module, and the config is parsed off a real file on disk, so
 * what `shim.test.js` exercises is the actual wiring against the actual
 * measurements.
 */

const FAKE = new URL('./vscode.mjs', import.meta.url).href;

export function resolve(specifier, context, nextResolve) {
  if (specifier === 'vscode') return { url: FAKE, shortCircuit: true };
  return nextResolve(specifier, context);
}
