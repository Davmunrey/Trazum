import { analyzeTask, compareTasks, evaluateTasks, parseTaskEvaluationPlan, parseTaskReport, taskPolicy, MAX_EVALUATION_PAIRS, MAX_INPUT_CHARS } from '@trazum/core';
import type { CliMessages } from './i18n/types.js';
import { changeTaskInstructions, readTaskText, writeTaskText } from './task-files.js';


type Parsed = { flags: Map<string, string>; paths: string[]; sources: { format: 'claude-code' | 'codex'; path: string }[] };
const ALLOWED: Record<string, readonly string[]> = {
  analyze: ['id', 'type', 'criterion', 'outcome', 'assessor', 'policy', 'claude-code', 'codex', 'out', 'json'],
  policy: ['out'],
  apply: ['instructions'],
  revert: ['instructions'],
  compare: ['out', 'json'],
  evaluate: ['plan', 'out', 'json'],
};

function parse(action: string, args: string[]): Parsed {
  const allowed = ALLOWED[action];
  if (!allowed) throw new Error('Unknown task action. Run trazum task --help.');
  const flags = new Map<string, string>();
  const sources: Parsed['sources'] = [];
  const paths: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (!arg.startsWith('-')) { paths.push(arg); continue; }
    const name = arg === '-o' ? 'out' : arg.startsWith('--') ? arg.slice(2) : '';
    if (!allowed.includes(name)) throw new Error('Unsupported task option. Run trazum task --help.');
    if (flags.has(name)) throw new Error('Task options cannot be repeated except source flags.');
    if (name === 'json') { flags.set(name, 'true'); continue; }
    const value = args[++index];
    if (value === undefined || value.trim() === '' || value.startsWith('-')) throw new Error('A task option is missing its value.');
    if (name === 'claude-code' || name === 'codex') {
      sources.push({ format: name, path: value });
      if (sources.length > 16) throw new Error('At most 16 task sources are accepted.');
    } else flags.set(name, value);
  }
  return { flags, sources, paths };
}

function required(flags: Map<string, string>, name: string): string {
  const value = flags.get(name);
  if (value === undefined) throw new Error(`Missing --${name}. Run trazum task --help.`);
  return value;
}

async function emit(value: string | object, output?: string): Promise<void> {
  let text = `${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`;
  if (text.length > MAX_INPUT_CHARS && typeof value !== 'string') text = `${JSON.stringify(value)}\n`;
  if (text.length > MAX_INPUT_CHARS) throw new Error('Task output exceeds the report limit; use a smaller complete task source.');
  if (output !== undefined) await writeTaskText(output, text);
  else process.stdout.write(text);
}

/**
 * `trazum task`. Its help comes from the reader's catalogue; its errors are
 * raised in English and said in the reader's language where `main` reports
 * them (#871).
 */
export async function runTask(args: string[], messages: CliMessages['taskFilter']): Promise<void> {
  if (args.length === 0 || (args.length === 1 && ['--help', '-h'].includes(args[0]!)) ||
      (args.length === 2 && Object.hasOwn(ALLOWED, args[0]!) && ['--help', '-h'].includes(args[1]!))) {
    process.stdout.write(messages.taskHelp(MAX_INPUT_CHARS));
    return;
  }
  const action = args[0]!;
  const { flags, sources, paths } = parse(action, args.slice(1));
  if (action === 'evaluate') {
    // Reports come in pairs, baseline then policy, so the count is even.
    if (paths.length < 2 || paths.length % 2 !== 0 || paths.length > MAX_EVALUATION_PAIRS * 2) throw new Error('Wrong number of task input files. Run trazum task --help.');
  } else {
    const expectedPaths = action === 'compare' ? 2 : action === 'policy' || action === 'apply' ? 1 : 0;
    if (paths.length !== expectedPaths) throw new Error('Wrong number of task input files. Run trazum task --help.');
  }
  if (action === 'analyze') {
    const taskId = required(flags, 'id');
    const taskType = required(flags, 'type');
    const criterion = required(flags, 'criterion');
    if (sources.length === 0) throw new Error('Provide at least one --claude-code or --codex file.');
    const contents: { format: 'claude-code' | 'codex'; text: string }[] = [];
    let total = 0;
    for (const source of sources) {
      const text = await readTaskText(source.path, MAX_INPUT_CHARS - total);
      total += text.length;
      contents.push({ format: source.format, text });
    }
    const report = analyzeTask({ taskId, taskType, criterion, sources: contents,
      ...(flags.has('outcome') ? { outcome: flags.get('outcome') } : {}),
      ...(flags.has('assessor') ? { assessor: flags.get('assessor') } : {}),
      ...(flags.has('policy') ? { policyId: flags.get('policy') } : {}),
    });
    await emit(report, flags.get('out'));
  } else if (action === 'compare') {
    const before = parseTaskReport(await readTaskText(paths[0]!));
    const after = parseTaskReport(await readTaskText(paths[1]!));
    await emit(compareTasks(before, after), flags.get('out'));
  } else if (action === 'evaluate') {
    const plan = parseTaskEvaluationPlan(await readTaskText(required(flags, 'plan')));
    const pairs = [];
    for (let index = 0; index < paths.length; index += 2) {
      pairs.push({ before: parseTaskReport(await readTaskText(paths[index]!)), after: parseTaskReport(await readTaskText(paths[index + 1]!)) });
    }
    await emit(evaluateTasks(plan, pairs), flags.get('out'));
  } else if (action === 'policy' || action === 'apply') {
    const report = parseTaskReport(await readTaskText(paths[0]!));
    const policy = taskPolicy(report);
    if (action === 'policy') await emit(policy.instructions, flags.get('out'));
    else {
      const changed = await changeTaskInstructions(required(flags, 'instructions'), 'apply');
      await emit({ version: 1, kind: 'trazum-task-policy', policyId: policy.id, applied: true, changed });
    }
  } else if (action === 'revert') {
    const changed = await changeTaskInstructions(required(flags, 'instructions'), 'revert');
    await emit({ version: 1, kind: 'trazum-task-policy', policyId: 'repeat-review-v1', applied: false, changed });
  }
}
