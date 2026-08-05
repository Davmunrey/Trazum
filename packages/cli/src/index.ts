#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';

import {
  DEFAULT_USAGE,
  PRICING_LAST_REVIEWED,
  RULES,
  countTokensAnthropic,
  estimateTokens,
  formatUsd,
  listModels,
  optimize,
  providerFromEnv,
  refineWithLlm,
  withExactTokenCounts,
} from '@trazum/core';
import type { OptimizationResult, RuleLevel, UsageProfile } from '@trazum/core';

// --------------------------------------------------------------------------
// Presentación
// --------------------------------------------------------------------------

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = {
  bold: (s: string) => (useColor ? `\u001b[1m${s}\u001b[22m` : s),
  dim: (s: string) => (useColor ? `\u001b[2m${s}\u001b[22m` : s),
  green: (s: string) => (useColor ? `\u001b[32m${s}\u001b[39m` : s),
  red: (s: string) => (useColor ? `\u001b[31m${s}\u001b[39m` : s),
  yellow: (s: string) => (useColor ? `\u001b[33m${s}\u001b[39m` : s),
  cyan: (s: string) => (useColor ? `\u001b[36m${s}\u001b[39m` : s),
};

const HELP = `${c.bold('trazum')} — reduce el coste de tus prompts sin perder lo que piden.

${c.bold('USO')}
  trazum optimize <fichero|-> [opciones]
  trazum check <fichero|-> --max-tokens <n> [opciones]
  trazum models
  trazum rules

${c.bold('OPCIONES DE optimize')}
  --level <safe|aggressive>   Agresividad de las reglas. Por defecto: safe.
  --model <id>                Modelo para calcular el coste. Por defecto: ${DEFAULT_USAGE.model}.
  --calls <n>                 Llamadas al mes. Por defecto: ${DEFAULT_USAGE.callsPerMonth}.
  --output-tokens <n>         Tokens de salida medios. Por defecto: ${DEFAULT_USAGE.avgOutputTokens}.
  --cache-hit-rate <0-1>      Tasa de acierto de caché estimada. Por defecto: ${DEFAULT_USAGE.cacheHitRate}.
  --batch                     El trabajo tolera latencia (Batch API, 50% menos).
  --disable <id,id>           Desactiva reglas concretas (ver "trazum rules").
  --llm                       Añade una pasada por el LLM configurado por entorno.
  --exact-tokens              Cuenta tokens con la API oficial en vez de la heurística.
  --diff                      Muestra el diff línea a línea.
  --json                      Vuelca el informe completo en JSON.
  -o, --out <fichero>         Escribe el prompt optimizado a un fichero.
  -h, --help                  Esta ayuda.

${c.bold('OPCIONES DE check')}
  --max-tokens <n>            Presupuesto de tokens de entrada. Obligatorio.
  --level <safe|aggressive>   Nivel al calcular si optimizado cabría.
  --exact-tokens              Recuento exacto (necesita ANTHROPIC_API_KEY).
  --json                      Resultado en JSON.

  Pensado para CI: sale con código 1 si el prompt supera el presupuesto,
  así una plantilla que crece sin control rompe la build en vez de la factura.

${c.bold('LLM OPCIONAL')}
  El núcleo es determinista y gratis. Con --llm se añade una pasada de
  compresión semántica usando el proveedor que configures por entorno:

    TRAZUM_LLM_PROVIDER   openai | anthropic          (por defecto: openai)
    TRAZUM_LLM_BASE_URL   https://tu-llm/v1
    TRAZUM_LLM_API_KEY    tu clave
    TRAZUM_LLM_MODEL      identificador del modelo

  El resultado del LLM solo se acepta si es más corto y conserva intacto
  el código, las URLs y los marcadores de plantilla.

${c.bold('EJEMPLOS')}
  trazum optimize prompt.txt --calls 50000 --diff
  cat prompt.md | trazum optimize - --level aggressive --json
  trazum optimize prompt.txt --llm -o prompt.optimizado.txt
`;

// --------------------------------------------------------------------------
// Parseo de argumentos
// --------------------------------------------------------------------------

interface Args {
  command: string;
  positional: string[];
  flags: Map<string, string | boolean>;
}

function parseArgs(argv: string[]): Args {
  const flags = new Map<string, string | boolean>();
  const positional: string[] = [];
  const takesValue = new Set([
    'level',
    'model',
    'calls',
    'output-tokens',
    'cache-hit-rate',
    'disable',
    'max-tokens',
    'out',
    'o',
  ]);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith('-') || arg === '-') {
      positional.push(arg);
      continue;
    }
    const name = arg.replace(/^--?/, '');
    if (takesValue.has(name)) {
      const value = argv[++i];
      if (value === undefined) throw new Error(`La opción --${name} necesita un valor.`);
      flags.set(name === 'o' ? 'out' : name, value);
    } else {
      flags.set(name, true);
    }
  }

  return { command: positional[0] ?? '', positional: positional.slice(1), flags };
}

function numberFlag(args: Args, name: string, fallback: number): number {
  const raw = args.flags.get(name);
  if (raw === undefined || typeof raw === 'boolean') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`--${name} debe ser un número no negativo (recibido: "${raw}").`);
  }
  return value;
}

// --------------------------------------------------------------------------
// Diff línea a línea
// --------------------------------------------------------------------------

/** Subsecuencia común más larga, para alinear las dos versiones. */
function lcsTable(a: string[], b: string[]): number[][] {
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i]![j] = a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  return table;
}

function renderDiff(before: string, after: string): string {
  const a = before.split('\n');
  const b = after.split('\n');
  const table = lcsTable(a, b);
  const lines: string[] = [];

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      lines.push(c.dim(`  ${a[i]}`));
      i++;
      j++;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      lines.push(c.red(`- ${a[i]}`));
      i++;
    } else {
      lines.push(c.green(`+ ${b[j]}`));
      j++;
    }
  }
  while (i < a.length) lines.push(c.red(`- ${a[i++]}`));
  while (j < b.length) lines.push(c.green(`+ ${b[j++]}`));

  return lines.join('\n');
}

// --------------------------------------------------------------------------
// Informe
// --------------------------------------------------------------------------

function printReport(result: OptimizationResult, showDiff: boolean): void {
  const { savings } = result;
  const sourceNote =
    result.tokenSource === 'heuristic'
      ? c.dim(' (estimado, ±15%)')
      : c.dim(' (recuento exacto)');

  console.log();
  console.log(c.bold('Tokens de entrada'));
  console.log(
    `  ${result.tokensBefore.toLocaleString('es-ES')} → ${c.green(
      result.tokensAfter.toLocaleString('es-ES'),
    )}   ${c.bold(`-${result.reductionPct.toFixed(1)}%`)}${sourceNote}`,
  );

  if (result.rules.length > 0) {
    console.log();
    console.log(c.bold('Reglas aplicadas'));
    for (const rule of result.rules) {
      const tag = rule.level === 'aggressive' ? c.yellow('[agresiva]') : c.dim('[segura]');
      console.log(
        `  ${tag} ${rule.title} ${c.dim(`(${rule.hits}×, ~${rule.tokensSaved} tokens)`)}`,
      );
    }
  } else {
    console.log();
    console.log(c.dim('  Ninguna regla ha encontrado nada que recortar.'));
  }

  if (result.llm) {
    console.log();
    console.log(c.bold('Pasada por LLM'));
    if (result.llm.applied) {
      console.log(
        `  ${c.green('aplicada')} vía ${result.llm.provider}/${result.llm.model}: ` +
          `${result.llm.tokensBefore} → ${result.llm.tokensAfter} tokens`,
      );
    } else {
      console.log(`  ${c.yellow('descartada')}: ${result.llm.rejectedReason}`);
    }
  }

  console.log();
  console.log(c.bold(`Coste con ${savings.modelDisplayName}`));
  console.log(
    `  ${result.usage.callsPerMonth.toLocaleString('es-ES')} llamadas/mes · ` +
      `${result.usage.avgOutputTokens} tokens de salida por llamada` +
      (result.usage.batchEligible ? ' · Batch API' : ''),
  );
  console.log(
    `  ${formatUsd(savings.perMonth.before.totalUsd)}/mes → ` +
      `${c.green(formatUsd(savings.perMonth.after.totalUsd))}/mes   ` +
      c.bold(`ahorro ${formatUsd(savings.monthlySavingsUsd)}/mes`) +
      c.dim(` (${savings.monthlySavingsPct.toFixed(1)}%)`),
  );

  if (result.advisories.length > 0) {
    console.log();
    console.log(c.bold('Además de acortar el prompt'));
    for (const advisory of result.advisories) {
      const marker =
        advisory.severity === 'warning'
          ? c.yellow('!')
          : advisory.severity === 'opportunity'
            ? c.cyan('→')
            : c.dim('·');
      const money =
        advisory.estimatedMonthlyUsd !== null
          ? c.green(` ~${formatUsd(advisory.estimatedMonthlyUsd)}/mes`)
          : '';
      console.log(`  ${marker} ${c.bold(advisory.title)}${money}`);
      console.log(`    ${c.dim(wrap(advisory.detail, 76, '    '))}`);
    }
  }

  if (showDiff) {
    console.log();
    console.log(c.bold('Diff'));
    console.log(renderDiff(result.original, result.optimized));
  }

  console.log();
}

/** Ajusta un párrafo a un ancho dado. */
function wrap(text: string, width: number, indent: string): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line.length + word.length + 1 > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.join(`\n${indent}`);
}

// --------------------------------------------------------------------------
// Subcomandos
// --------------------------------------------------------------------------

function commandModels(): void {
  console.log();
  console.log(c.bold('Modelos y precios') + c.dim(`  (USD por millón de tokens)`));
  console.log(c.dim(`  Tabla revisada el ${PRICING_LAST_REVIEWED}. Verifica antes de presupuestar.`));
  console.log();
  const rows = listModels().map((m) => ({
    id: m.id,
    entrada: m.promo ? `${m.promo.inputPerMTok} (→${m.inputPerMTok})` : String(m.inputPerMTok),
    salida: m.promo ? `${m.promo.outputPerMTok} (→${m.outputPerMTok})` : String(m.outputPerMTok),
    contexto: `${(m.contextWindow / 1000).toLocaleString('es-ES')}K`,
    caché: m.cacheMinTokens.toLocaleString('es-ES'),
  }));
  const widths = {
    id: Math.max(...rows.map((r) => r.id.length), 'modelo'.length),
    entrada: Math.max(...rows.map((r) => r.entrada.length), 'entrada'.length),
    salida: Math.max(...rows.map((r) => r.salida.length), 'salida'.length),
    contexto: Math.max(...rows.map((r) => r.contexto.length), 'contexto'.length),
    caché: Math.max(...rows.map((r) => r.caché.length), 'mín. caché'.length),
  };
  console.log(
    c.bold(
      `  ${'modelo'.padEnd(widths.id)}  ${'entrada'.padStart(widths.entrada)}  ` +
        `${'salida'.padStart(widths.salida)}  ${'contexto'.padStart(widths.contexto)}  ` +
        `${'mín. caché'.padStart(widths.caché)}`,
    ),
  );
  for (const row of rows) {
    console.log(
      `  ${row.id.padEnd(widths.id)}  ${row.entrada.padStart(widths.entrada)}  ` +
        `${row.salida.padStart(widths.salida)}  ${row.contexto.padStart(widths.contexto)}  ` +
        `${row.caché.padStart(widths.caché)}`,
    );
  }
  console.log();
  console.log(c.dim('  Los precios entre paréntesis son el precio tras acabar la promoción.'));
  console.log(
    c.dim('  Caché: leer cuesta el 10% de la entrada; escribir, el 125% (5 min) o 200% (1 h).'),
  );
  console.log(c.dim('  Batch API: 50% de descuento sobre entrada y salida.'));
  console.log();
}

function commandRules(): void {
  console.log();
  console.log(c.bold('Reglas disponibles'));
  console.log(c.dim('  Desactiva las que no quieras con --disable id1,id2'));
  console.log();
  for (const rule of RULES) {
    const tag = rule.level === 'aggressive' ? c.yellow('[agresiva]') : c.dim('[segura]  ');
    console.log(`  ${tag} ${c.bold(rule.id)} — ${rule.title}`);
    console.log(`    ${c.dim(wrap(rule.rationale, 74, '    '))}`);
    console.log();
  }
}

async function readInput(source: string | undefined): Promise<string> {
  if (!source) {
    throw new Error('Falta el fichero de entrada. Usa "-" para leer de la entrada estándar.');
  }
  if (source === '-') {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString('utf8');
  }
  return readFile(source, 'utf8');
}

async function commandOptimize(args: Args): Promise<void> {
  const prompt = await readInput(args.positional[0]);

  const level = (args.flags.get('level') ?? 'safe') as RuleLevel;
  if (level !== 'safe' && level !== 'aggressive') {
    throw new Error(`--level debe ser "safe" o "aggressive" (recibido: "${level}").`);
  }

  const modelFlag = args.flags.get('model');
  const usage: Partial<UsageProfile> = {
    ...(typeof modelFlag === 'string' ? { model: modelFlag } : {}),
    callsPerMonth: numberFlag(args, 'calls', DEFAULT_USAGE.callsPerMonth),
    avgOutputTokens: numberFlag(args, 'output-tokens', DEFAULT_USAGE.avgOutputTokens),
    cacheHitRate: numberFlag(args, 'cache-hit-rate', DEFAULT_USAGE.cacheHitRate),
    batchEligible: args.flags.has('batch'),
  };

  const disableRaw = args.flags.get('disable');
  const disableRules =
    typeof disableRaw === 'string' ? disableRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];
  for (const id of disableRules) {
    if (!RULES.some((r) => r.id === id)) {
      throw new Error(`Regla desconocida en --disable: "${id}". Lista completa: trazum rules`);
    }
  }

  let result = optimize(prompt, { level, usage, disableRules });

  if (args.flags.has('llm')) {
    const provider = providerFromEnv();
    if (!provider) {
      throw new Error(
        'Has pedido --llm pero no hay proveedor configurado.\n' +
          'Define TRAZUM_LLM_BASE_URL y TRAZUM_LLM_MODEL (endpoint compatible con OpenAI),\n' +
          'o TRAZUM_LLM_PROVIDER=anthropic con TRAZUM_LLM_API_KEY.',
      );
    }
    result = await refineWithLlm(result, provider);
  }

  if (args.flags.has('exact-tokens')) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('--exact-tokens necesita ANTHROPIC_API_KEY en el entorno.');
    }
    result = await withExactTokenCounts(
      result,
      countTokensAnthropic({ apiKey, model: result.usage.model }),
    );
  }

  const outPath = args.flags.get('out');
  if (typeof outPath === 'string') {
    await writeFile(outPath, result.optimized, 'utf8');
  }

  if (args.flags.has('json')) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (!process.stdout.isTTY && typeof outPath !== 'string') {
    // Redirigido a un fichero o a otro proceso: solo el prompt, sin adornos.
    process.stdout.write(result.optimized);
    return;
  }

  printReport(result, args.flags.has('diff'));
  if (typeof outPath === 'string') {
    console.log(c.dim(`Prompt optimizado escrito en ${outPath}`));
    console.log();
  }
}

/**
 * Presupuesto de tokens para CI: falla (código 1) si el prompt lo supera.
 * Así una plantilla que crece sin control rompe la build, no la factura.
 */
async function commandCheck(args: Args): Promise<void> {
  const prompt = await readInput(args.positional[0]);

  const maxTokens = numberFlag(args, 'max-tokens', -1);
  if (maxTokens < 0) {
    throw new Error('trazum check necesita --max-tokens <n>.');
  }

  const level = (args.flags.get('level') ?? 'safe') as RuleLevel;
  if (level !== 'safe' && level !== 'aggressive') {
    throw new Error(`--level debe ser "safe" o "aggressive" (recibido: "${level}").`);
  }

  let count = (text: string): Promise<number> => Promise.resolve(estimateTokens(text));
  let source: 'heuristic' | 'external' = 'heuristic';

  if (args.flags.has('exact-tokens')) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('--exact-tokens necesita ANTHROPIC_API_KEY en el entorno.');
    const exact = countTokensAnthropic({ apiKey });
    count = (text) => exact(text);
    source = 'external';
  }

  const tokens = await count(prompt);
  const ok = tokens <= maxTokens;

  // Si se pasa del presupuesto, calcula si optimizado cabría: convierte el
  // fallo de CI en una acción concreta en vez de un número rojo.
  let optimizedTokens: number | null = null;
  if (!ok) {
    const optimized = optimize(prompt, { level }).optimized;
    optimizedTokens = await count(optimized);
  }

  if (args.flags.has('json')) {
    console.log(
      JSON.stringify({
        ok,
        tokens,
        maxTokens,
        tokenSource: source,
        optimizedTokens,
        wouldFitOptimized: optimizedTokens !== null ? optimizedTokens <= maxTokens : null,
      }),
    );
  } else if (ok) {
    console.log(
      `${c.green('OK')} ${tokens.toLocaleString('es-ES')} tokens dentro del presupuesto de ${maxTokens.toLocaleString('es-ES')}.`,
    );
  } else {
    console.error(
      `${c.red('FALLO')} ${tokens.toLocaleString('es-ES')} tokens supera el presupuesto de ${maxTokens.toLocaleString('es-ES')}.`,
    );
    if (optimizedTokens !== null) {
      console.error(
        optimizedTokens <= maxTokens
          ? `  Optimizado con "trazum optimize --level ${level}" quedaría en ~${optimizedTokens.toLocaleString('es-ES')} tokens y sí cabría.`
          : `  Ni optimizado cabe (~${optimizedTokens.toLocaleString('es-ES')} tokens): hay que recortar contenido a mano.`,
      );
    }
  }

  if (!ok) process.exitCode = 1;
}

// --------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.flags.has('help') || args.flags.has('h') || !args.command) {
    console.log(HELP);
    return;
  }

  switch (args.command) {
    case 'optimize':
      await commandOptimize(args);
      break;
    case 'check':
      await commandCheck(args);
      break;
    case 'models':
      commandModels();
      break;
    case 'rules':
      commandRules();
      break;
    default:
      throw new Error(`Comando desconocido: "${args.command}". Prueba con "trazum --help".`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n${c.red('Error')}: ${message}\n`);
  process.exitCode = 1;
});
