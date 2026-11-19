/**
 * A desktop notification for the person at the machine, through what the
 * platform already has.
 *
 * `trazum watch` has three transports (an exit code, a JSON event, a webhook),
 * and all three assume somebody already has a place alerts go. A person at
 * their own machine has a screen. This is the fourth: off unless `--notify`
 * asks, and it says what the terminal says.
 *
 * The spawn itself is `runNotifier` in `git.ts`, the one module that runs
 * another program: the security suite holds that to one file, and a second
 * caller would get none of its rules. This module only decides what to run and
 * what to hand it.
 *
 * **Nothing is installed and nothing is added.** macOS has `osascript`, a
 * Linux desktop has `notify-send` where it has a notification daemon, and
 * Windows has PowerShell and the toast API in it. Where the platform has none
 * of them the answer is `unavailable`, which the caller says out loud and then
 * carries on with the other transports: a notifier that cannot notify must not
 * take the alert down with it, and must not look as if it had.
 *
 * **The text never reaches a shell, and never becomes code.** The program is
 * started with an argument array and `shell: false`, so there is no shell to
 * break out of. The text itself is handed over as data and never spliced into a
 * script: as arguments to a fixed AppleScript handler on macOS, as environment
 * variables read by a fixed script on Windows (sent as `-EncodedCommand`, so
 * no quoting rule applies to it either), and after `--` on Linux so it cannot
 * be read as an option. A quote, a backtick or a newline in a sentence is a
 * character in the sentence and nothing else.
 *
 * **What it carries is decided by the one function that builds it.** The
 * sentence is the one the terminal prints for a crossing: figures, the limit,
 * the day a day gate means. Never a prompt, never a path, never a project's
 * name. `notificationFor` takes the sentences and nothing else, so there is no
 * way to hand it a path by accident.
 */

import { runNotifier } from './git.js';
import type { NotifierRun } from './git.js';

/** The title is fixed and not translated: it names the sender, not the news. */
export const NOTIFICATION_TITLE = 'Trazum';

export type NotifierName = 'osascript' | 'notify-send' | 'powershell.exe';

export interface Notification {
  title: string;
  body: string;
}

/**
 * The notification for a cycle's new crossings: the sentences the terminal
 * printed for them, one to a line, and a fixed title. Nothing else goes in.
 */
export function notificationFor(sentences: readonly string[]): Notification {
  return { title: NOTIFICATION_TITLE, body: sentences.join('\n') };
}

/** What to run, and what to hand it, to show one notification on this platform. */
export interface NotifierCall {
  command: NotifierName;
  args: string[];
  /** Variables added to the environment, for the one platform that reads its text from there. */
  env: Record<string, string>;
}

/**
 * The AppleScript is a constant. The text arrives as `argv`, so it is a value
 * the script displays and never a part of the script's own text.
 */
const APPLESCRIPT = [
  'on run argv',
  'display notification (item 1 of argv) with title (item 2 of argv)',
  'end run',
];

/**
 * The PowerShell script is a constant too, and reads its text from two
 * variables. It builds the toast with the XML document's own `InnerText`, which
 * escapes what it is given, rather than by joining the text into markup. The
 * application id is the one Windows PowerShell is registered under, because a
 * toast from an id nothing registered is dropped silently.
 */
const POWERSHELL = [
  "$ErrorActionPreference = 'Stop'",
  '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null',
  '[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null',
  '$xml = New-Object Windows.Data.Xml.Dom.XmlDocument',
  "$xml.LoadXml('<toast><visual><binding template=\"ToastGeneric\"><text/><text/></binding></visual></toast>')",
  "$texts = $xml.GetElementsByTagName('text')",
  '$texts.Item(0).InnerText = $env:TRAZUM_NOTIFY_TITLE',
  '$texts.Item(1).InnerText = $env:TRAZUM_NOTIFY_BODY',
  '$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)',
  "$id = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'",
  '[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($id).Show($toast)',
].join('\n');

export function notifierCall(platform: NodeJS.Platform, notification: Notification): NotifierCall {
  if (platform === 'darwin') {
    return {
      command: 'osascript',
      args: [...APPLESCRIPT.flatMap((line) => ['-e', line]), notification.body, notification.title],
      env: {},
    };
  }
  if (platform === 'win32') {
    return {
      command: 'powershell.exe',
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-EncodedCommand',
        Buffer.from(POWERSHELL, 'utf16le').toString('base64'),
      ],
      env: { TRAZUM_NOTIFY_TITLE: notification.title, TRAZUM_NOTIFY_BODY: notification.body },
    };
  }
  // Linux and the other desktops that follow freedesktop.org: the `--` ends
  // the options, so a sentence that began with a dash would still be a sentence.
  return {
    command: 'notify-send',
    args: ['--app-name=Trazum', '--', notification.title, notification.body],
    env: {},
  };
}

export type NotifyOutcome =
  /** The platform's notifier accepted it. Not a promise that a screen showed it. */
  | { outcome: 'sent'; command: NotifierName }
  /** The platform has no such program: said, and the other transports carry on. */
  | { outcome: 'unavailable'; command: NotifierName }
  /** The program is there and refused, usually because there is no desktop session. */
  | { outcome: 'failed'; command: NotifierName; error: string };

/** The part of the spawn this uses, so a test can stand in for the notifier. */
export type NotifierRunner = (command: NotifierName, args: readonly string[], env: NodeJS.ProcessEnv) => NotifierRun;

export function sendNotification(
  notification: Notification,
  options: { platform?: NodeJS.Platform; run?: NotifierRunner; env?: NodeJS.ProcessEnv } = {},
): NotifyOutcome {
  const call = notifierCall(options.platform ?? process.platform, notification);
  const run = options.run ?? runNotifier;
  const result = run(call.command, call.args, { ...(options.env ?? process.env), ...call.env });
  if (result.errorCode === 'ENOENT') return { outcome: 'unavailable', command: call.command };
  if (result.errorCode === null && result.status === 0) return { outcome: 'sent', command: call.command };
  const said = result.stderr.trim().split('\n')[0] ?? '';
  const why = said !== '' ? said : (result.errorCode ?? `exited with ${String(result.status)}`);
  return { outcome: 'failed', command: call.command, error: why };
}
