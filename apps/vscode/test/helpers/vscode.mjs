/**
 * The editor, faked to exactly the surface `src/vscode.d.ts` declares.
 *
 * The real `vscode` module is injected by the editor at runtime and exists
 * nowhere on disk, so a test that wants to run `activate()` has to supply one.
 * The usual answer is `@vscode/test-electron`: it downloads a copy of VS Code,
 * launches it, and drives the extension inside it — a network dependency, a
 * version to track, and a suite that cannot run on a machine with no display.
 * This repository's whole reason for splitting `reading.ts` out of
 * `extension.ts` was to avoid needing that for the judgement. What was left was
 * a wire, and the wire was tested by reading it rather than running it.
 *
 * **A wire can be wrong in ways reading does not show.** The relative path it
 * builds, the four branches that hide the item, the debounce, the listener it
 * registers for a document that is not the active one: every one of those is a
 * behaviour, and none of them was exercised until this file existed.
 *
 * The fidelity of this fake is not a matter of care. `contract.test.js` asserts
 * that it implements every member `vscode.d.ts` declares, with the arity
 * declared, so a fake that drifted from the contract fails rather than quietly
 * letting `shim.test.js` pass against an editor VS Code does not have.
 */

/**
 * Not an enum, because the compiler already inlined it.
 *
 * `vscode.d.ts` declares `StatusBarAlignment` as a `const enum`, so `tsc` emits
 * the literal `2` into `dist/extension.js` and the shim never reads this at
 * runtime. It is exported anyway: the assertion that the item was put on the
 * right belongs against a name, not against a bare number nobody can check.
 */
export const StatusBarAlignment = { Left: 1, Right: 2 };

/** Everything a test sets, and everything the shim did. */
export const state = {
  /** What `window.activeTextEditor` answers. */
  activeTextEditor: undefined,
  /** What `workspace.workspaceFolders` answers. */
  workspaceFolders: undefined,
  /** section -> key -> value, for `workspace.getConfiguration`. */
  settings: new Map(),
  /** Every status bar item the shim created, in order. */
  items: [],
  /** command id -> callback, as registered. */
  commands: new Map(),
  /** Every message `showInformationMessage` was handed. */
  messages: [],
  editorListeners: [],
  documentListeners: [],
};

/** Back to a fresh editor. Called before each test, never inside one. */
export function reset() {
  state.activeTextEditor = undefined;
  state.workspaceFolders = undefined;
  state.settings = new Map();
  state.items = [];
  state.commands = new Map();
  state.messages = [];
  state.editorListeners = [];
  state.documentListeners = [];
}

/** A document, as the shim reads one: an absolute path and its text. */
export function document(fileName, text) {
  return { fileName, getText: () => text };
}

/** An editor over a document. */
export function editor(fileName, text) {
  return { document: document(fileName, text) };
}

/** What VS Code hands `activate`. Emptied by the editor, never by the shim. */
export function context() {
  return { subscriptions: [] };
}

/** Set a workspace root, as one folder, the way a single-root window has it. */
export function openFolder(fsPath) {
  state.workspaceFolders = [{ uri: { fsPath } }];
}

/** Set one setting, so `getConfiguration(section).get(key, fallback)` sees it. */
export function setSetting(section, key, value) {
  const values = state.settings.get(section) ?? new Map();
  values.set(key, value);
  state.settings.set(section, values);
}

/** What the editor does when the user switches tabs, or when a buffer changes. */
export const fire = {
  activeEditor(next) {
    state.activeTextEditor = next;
    for (const listener of state.editorListeners) listener(next);
  },
  /*
    Deliberately takes the document rather than the editor. The shim's own
    listener has to decide whether the changed document is the one on screen,
    and a helper that only ever fired for the active editor would make that
    branch untestable.
  */
  documentChanged(changed) {
    for (const listener of state.documentListeners) listener({ document: changed });
  },
};

const forget = (list, listener) => ({
  dispose() {
    const at = list.indexOf(listener);
    if (at !== -1) list.splice(at, 1);
  },
});

export const window = {
  /*
    A getter, because `vscode.d.ts` declares `activeTextEditor` as a `const` in
    a namespace — a live binding the shim reads at call time, not a value it is
    handed once. A plain property would freeze whatever the editor was when
    `activate` ran, and the test for "typing in a background document changes
    nothing" would pass for the wrong reason.
  */
  get activeTextEditor() {
    return state.activeTextEditor;
  },
  createStatusBarItem(alignment, priority) {
    const item = {
      alignment,
      priority,
      text: '',
      tooltip: '',
      command: undefined,
      /**
       * Not in the declared surface: what a test needs to see, kept apart.
       *
       * `calls` records every `show`/`hide` in order, and it exists because
       * "the item stayed hidden" is not something a test can wait for. The
       * shim's refresh is asynchronous — it reads the config off disk — so a
       * suite that asserted `visible === false` straight after `activate()`
       * would pass before the shim had done anything at all, and go on passing
       * if the shim were deleted. Waiting for the first entry in `calls` waits
       * for the decision rather than for a clock.
       */
      visible: false,
      disposed: false,
      calls: [],
      show() {
        item.visible = true;
        item.calls.push('show');
      },
      hide() {
        item.visible = false;
        item.calls.push('hide');
      },
      dispose() {
        item.disposed = true;
      },
    };
    state.items.push(item);
    return item;
  },
  onDidChangeActiveTextEditor(listener) {
    state.editorListeners.push(listener);
    return forget(state.editorListeners, listener);
  },
  showInformationMessage(message) {
    state.messages.push(message);
    return Promise.resolve(undefined);
  },
};

export const workspace = {
  get workspaceFolders() {
    return state.workspaceFolders;
  },
  getConfiguration(section) {
    const values = state.settings.get(section);
    return {
      /*
        The fallback is returned for a key nobody set, which is how VS Code
        answers a setting left at its default. Returning `undefined` instead
        would make `get('enabled', true)` falsy and hide the status bar on every
        machine that never opened the settings page.
      */
      get: (key, fallback) => (values?.has(key) === true ? values.get(key) : fallback),
    };
  },
  onDidChangeTextDocument(listener) {
    state.documentListeners.push(listener);
    return forget(state.documentListeners, listener);
  },
};

export const commands = {
  registerCommand(command, callback) {
    state.commands.set(command, callback);
    return { dispose: () => state.commands.delete(command) };
  },
};
