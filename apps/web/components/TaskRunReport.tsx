import { taskPolicy, type TaskReport } from '@trazum/core';
import { Button } from './ui/button';
import type { WebMessages } from '../lib/i18n';

export function TaskRunSummary({ report, t }: { report: TaskReport; t: WebMessages }) {
  const c = t.tasks;
  return (
    <dl className="space-y-2 break-words text-sm [overflow-wrap:anywhere]">
      <div><dt className="text-muted-foreground">{c.taskId} / {c.taskType}</dt><dd>{report.task.id} / {report.task.type}</dd></div>
      <div><dt className="text-muted-foreground">{c.criterion}</dt><dd>{report.task.criterion}</dd></div>
      <div><dt className="text-muted-foreground">{c.declared}</dt><dd>{c.outcomes[report.task.outcome]}{report.task.assessor && ` · ${report.task.assessor}`}</dd></div>
      <div><dt className="text-muted-foreground">{c.policy}</dt><dd>{report.task.policyId === 'baseline' ? c.baseline : c.repeat}</dd></div>
      <div><dt className="text-muted-foreground">{c.coverage}</dt><dd>{report.coverage.harnesses.join(' · ')}{report.coverage.models.length > 0 && ` / ${report.coverage.models.join(' · ')}`}</dd></div>
    </dl>
  );
}

export function TaskRunReport({ report, t, onExport, onUse, onPolicy }: {
  report: TaskReport; t: WebMessages; onExport: () => void; onUse: () => void; onPolicy: (instructions: string) => void;
}) {
  const c = t.tasks;
  const number = (value: number) => value.toLocaleString(t.numberLocale);
  let instructions: string | null = null;
  try { instructions = taskPolicy(report).instructions; } catch { /* No actionable evidence. */ }
  return (
    <section aria-label={c.reportHeading} className="min-w-0 space-y-6 border-t-2 border-foreground pt-5">
      <div>
        <h2 className="text-lg font-semibold">{c.reportHeading}</h2>
        <p className="mt-4 text-sm text-muted-foreground">{c.tokens}</p>
        <p className="break-words text-4xl font-semibold tabular-nums tracking-tight sm:text-5xl">{report.usage.records ? number(report.usage.totalTokens) : '—'}</p>
        <dl className="mt-5 grid grid-cols-3 gap-3 border-y py-3 text-sm">
          {[[c.records, report.usage.records], [c.calls, report.tools.calls], [c.findings, report.tools.findings.length]].map(([label, value]) => (
            <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{number(Number(value))}</dd></div>
          ))}
        </dl>
      </div>
      <TaskRunSummary report={report} t={t} />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onExport}>{c.export}</Button>
        <Button onClick={onUse}>{report.task.policyId === 'baseline' ? c.useBaseline : c.useAfter}</Button>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{c.metadataWarning}</p>
      <section className="border-t pt-4">
        <h3 className="font-semibold">{c.evidence}</h3>
        {report.tools.findings.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{c.noFindings}</p> : (
          <ul className="mt-2 divide-y">
            {report.tools.findings.map((finding, index) => (
              <li key={index} className="py-3 text-sm">
                <div className="flex justify-between gap-3"><strong>{c.categories[finding.category]}</strong><span className="tabular-nums">×{number(finding.count)}</span></div>
                <p className="text-muted-foreground">{finding.kind === 'repeated-failure' ? c.repeatedFailure : c.repeatedResult}</p>
                <details className="mt-2">
                  <summary className="cursor-pointer underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">{c.occurrences}</summary>
                  <ul className="mt-2 space-y-1 text-xs tabular-nums">
                    {finding.occurrences.map((occurrence, n) => <li key={n}>{c.source} {number(occurrence.source)} · {c.line} {number(occurrence.line)} → {c.resultLine} {number(occurrence.resultLine)}</li>)}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{c.limitations}</p>
      </section>
      <section className="border-t pt-4">
        <h3 className="font-semibold">{c.coverage}</h3>
        {report.coverage.gaps.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{report.coverage.gaps.map((gap) => <li key={gap}>{c.gaps[gap as keyof typeof c.gaps] ?? gap}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">{c.noGaps}</p>}
      </section>
      <section className="border-t pt-4 text-sm">
        <h3 className="font-semibold">{c.price}</h3>
        <p className="mt-1 tabular-nums">{report.usage.apiEquivalentUsd === null ? c.unknownPrice : new Intl.NumberFormat(t.numberLocale, { style: 'currency', currency: 'USD', maximumFractionDigits: 6 }).format(report.usage.apiEquivalentUsd)}</p>
        <p className="mt-1 text-xs text-muted-foreground">{c.priceHint} {report.usage.pricing.lastReviewed}. {c.priceTail}</p>
      </section>
      <section className="border-t-2 border-foreground pt-4">
        <h3 className="font-semibold">{c.policyHeading}</h3>
        {instructions ? <>
          <p className="mt-2 text-sm text-muted-foreground">{c.policyBody}</p>
          <p className="mt-2 text-xs text-muted-foreground">{c.policyLanguage}</p>
          <pre lang="en" className="my-4 whitespace-pre-wrap break-words border-l-2 border-foreground pl-4 font-mono text-xs leading-relaxed">{instructions}</pre>
          <Button variant="outline" onClick={() => onPolicy(instructions!)}>{c.exportPolicy}</Button>
        </> : <p className="mt-2 text-sm text-muted-foreground">{c.noPolicy}</p>}
      </section>
    </section>
  );
}
