/**
 * The slice of the VS Code API this extension uses, written out.
 *
 * Not `@types/vscode`. The editor supplies the `vscode` module at runtime and
 * never installs it, so the dependency would exist only to compile — and this
 * repository already learned what an install-only dependency costs: at 1.85.0
 * the CLI typed an optional package with `typeof import(...)`, `tsc` resolved
 * it while type-checking, and a package somebody chooses to install became one
 * the repository could not compile without.
 *
 * So the contract is here, it is exactly as wide as what `extension.ts`
 * touches, and widening it is a deliberate edit rather than an inherited
 * surface — which is the point.
 *
 * `contract.test.js` holds the two things the toolchain does not. **The fake**
 * in `test/helpers/vscode.mjs` is the only editor this repository ever runs
 * against, and it is plain JavaScript reached through a loader, so nothing
 * checks it against this file; a fake that lost a member, took fewer arguments
 * than the editor passes, or grew one VS Code does not have would leave the
 * whole shim suite green about an editor nobody ships. **And the width**: a
 * declaration nothing uses is the install-only dependency this file exists to
 * avoid, growing back one member at a time.
 *
 * The direction it does not hold is the shim reaching for something undeclared.
 * `tsc` already fails on that, and a second copy of the compiler's job written
 * in regular expressions would be worse than none.
 *
 * The types are deliberately loose where the real API is elaborate. This
 * extension does not need `ThemeColor` to be anything more than a name it
 * hands straight back.
 */

declare module 'vscode' {
  export interface Disposable {
    dispose(): void;
  }

  export interface ExtensionContext {
    readonly subscriptions: Disposable[];
  }

  export interface TextDocument {
    /** Absolute path on this machine. Never leaves it. */
    readonly fileName: string;
    getText(): string;
  }

  export interface TextEditor {
    readonly document: TextDocument;
  }

  export interface StatusBarItem extends Disposable {
    text: string;
    tooltip: string;
    command: string | undefined;
    show(): void;
    hide(): void;
  }

  export interface WorkspaceFolder {
    readonly uri: { readonly fsPath: string };
  }

  export interface WorkspaceConfiguration {
    get<T>(section: string, fallback: T): T;
  }

  export const enum StatusBarAlignment {
    Left = 1,
    Right = 2,
  }

  export namespace window {
    const activeTextEditor: TextEditor | undefined;
    function createStatusBarItem(alignment: StatusBarAlignment, priority?: number): StatusBarItem;
    function onDidChangeActiveTextEditor(listener: (editor: TextEditor | undefined) => void): Disposable;
    function showInformationMessage(message: string): Thenable<string | undefined>;
  }

  export namespace workspace {
    const workspaceFolders: readonly WorkspaceFolder[] | undefined;
    function getConfiguration(section: string): WorkspaceConfiguration;
    function onDidChangeTextDocument(listener: (event: { document: TextDocument }) => void): Disposable;
  }

  export namespace commands {
    function registerCommand(command: string, callback: () => void): Disposable;
  }
}
