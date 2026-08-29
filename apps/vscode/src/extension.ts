/**
 * The wire between VS Code and `reading.ts`, and nothing else.
 *
 * Every number this file puts on screen was computed in `reading.ts` and is
 * passed through untouched. That is checked rather than intended: `shim.test.js`
 * asserts this file performs no arithmetic and formats no figure, because a
 * status bar that computed its own percentage would be a second implementation
 * of the thing the rest of the repository holds to one.
 *
 * It reads files and it reads the editor. It opens no socket, and the guard in
 * `refusals.test.js` is what keeps that true.
 */

import { readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

import { parseConfig } from '@trazum/core/node';
import type { TrazumConfig } from '@trazum/core';
import * as vscode from 'vscode';

import { detailText, measureRecoverable, read, statusText } from './reading.js';

/** How long the editor must be still before the expensive half runs. */
const SETTLE_MS = 400;

/**
 * The project config, read from disk.
 *
 * Returns an empty config rather than throwing when there is none or when it
 * does not parse. An editor extension that refused to show a token count
 * because a config file three directories up has a typo would be a worse
 * experience than the one it replaces, and `trazum check` is where a broken
 * config is supposed to stop somebody.
 */
async function projectConfig(root: string): Promise<TrazumConfig> {
  try {
    const path = join(root, 'trazum.config.json');
    return parseConfig(await readFile(path, 'utf8'), path);
  } catch {
    return {};
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.command = 'trazum.showReading';
  context.subscriptions.push(item);

  let detail = '';
  let settling: ReturnType<typeof setTimeout> | undefined;

  const refresh = async (editor: vscode.TextEditor | undefined): Promise<void> => {
    if (editor === undefined || !vscode.workspace.getConfiguration('trazum').get('enabled', true)) {
      item.hide();
      return;
    }

    const folder = vscode.workspace.workspaceFolders?.[0];
    if (folder === undefined) {
      item.hide();
      return;
    }

    const text = editor.document.getText();
    const path = relative(folder.uri.fsPath, editor.document.fileName).split(sep).join('/');
    const result = read(text, { path, config: await projectConfig(folder.uri.fsPath) });

    if (result.kind === 'none') {
      item.hide();
      return;
    }

    item.text = statusText(result.reading);
    item.tooltip = detail === '' ? statusText(result.reading) : detail;
    item.show();

    /*
      The rules run once the typing stops, never on the keystroke. `read` is
      cheap enough for every change; `optimize` walks every rule over the whole
      document and is not, and an editor that stutters while somebody writes is
      an editor they turn the extension off in.
    */
    if (settling !== undefined) clearTimeout(settling);
    settling = setTimeout(() => {
      const recoverable = measureRecoverable(text);
      detail = detailText({ ...result.reading, recoverable });
      item.tooltip = detail;
    }, SETTLE_MS);
  };

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => void refresh(editor)),
    vscode.workspace.onDidChangeTextDocument((event) => {
      const editor = vscode.window.activeTextEditor;
      if (editor !== undefined && event.document === editor.document) void refresh(editor);
    }),
    vscode.commands.registerCommand('trazum.showReading', () => {
      void vscode.window.showInformationMessage(detail === '' ? 'No prompt in view.' : detail);
    }),
  );

  void refresh(vscode.window.activeTextEditor);
}

export function deactivate(): void {
  // Every disposable went into `context.subscriptions`, which VS Code empties.
}
