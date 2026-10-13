'use client';

import { useEffect, useRef, useState } from 'react';
import { analyzeTask, compareTasks, type TaskComparison, type TaskFormat, type TaskOutcome, type TaskPolicyId, type TaskReport } from '@trazum/core';
import { Button } from './ui/button';
import { TaskRunReport, TaskRunSummary } from './TaskRunReport';
import type { WebMessages } from '../lib/i18n';
import { appendTaskFiles, createTaskReadGate, readTaskReport, taskDocumentJson, TaskFileError, type TaskFile, type TaskFileErrorCode } from '../lib/task-workflow';

const field = 'mt-1 w-full min-w-0 rounded-none border-2 border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';
const guideUrl = 'https://github.com/Davmunrey/Trazum/blob/main/docs/task-efficiency.md#dashboard';
type PanelError = TaskFileErrorCode | 'analyzeError' | 'compareError' | 'downloadError';

export function Tasks({ t }: { t: WebMessages }) {
  const c = t.tasks;
  const [mode, setMode] = useState<'analyze' | 'compare'>('analyze');
  const [files, setFiles] = useState<TaskFile[]>([]);
  const [format, setFormat] = useState<TaskFormat>('claude-code');
  const [taskId, setTaskId] = useState('');
  const [taskType, setTaskType] = useState('');
  const [criterion, setCriterion] = useState('');
  const [outcome, setOutcome] = useState<TaskOutcome>('unknown');
  const [assessor, setAssessor] = useState('');
  const [policyId, setPolicyId] = useState<TaskPolicyId>('baseline');
  const [report, setReport] = useState<TaskReport | null>(null);
  const [before, setBefore] = useState<TaskReport | null>(null);
  const [after, setAfter] = useState<TaskReport | null>(null);
  const [comparison, setComparison] = useState<TaskComparison | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<PanelError | null>(null);
  const gate = useRef(createTaskReadGate());
  const fileInput = useRef<HTMLInputElement>(null);
  const beforeInput = useRef<HTMLInputElement>(null);
  const afterInput = useRef<HTMLInputElement>(null);
  const number = (value: number) => value.toLocaleString(t.numberLocale);

  useEffect(() => { const pending = gate.current; return () => pending.cancel(); }, []);

  function invalidateRun() { setReport(null); setError(null); }
  function clear() {
    gate.current.cancel();
    setReading(false); setFiles([]); setReport(null); setBefore(null); setAfter(null); setComparison(null); setError(null);
    setTaskId(''); setTaskType(''); setCriterion(''); setAssessor(''); setOutcome('unknown'); setPolicyId('baseline'); setFormat('claude-code');
    for (const input of [fileInput, beforeInput, afterInput]) if (input.current) input.current.value = '';
  }
  async function selectFiles(selected: File[]) {
    if (!selected.length) return;
    const ticket = gate.current.begin();
    setReading(true); invalidateRun();
    try {
      const next = await appendTaskFiles(files, selected, format);
      if (gate.current.current(ticket)) setFiles(next);
    } catch (cause) {
      if (gate.current.current(ticket)) setError(cause instanceof TaskFileError ? cause.code : 'read-file');
    } finally { if (gate.current.current(ticket)) setReading(false); }
  }
  async function selectReport(selected: File | undefined, side: 'before' | 'after') {
    if (!selected) return;
    const ticket = gate.current.begin();
    setReading(true); setError(null); setComparison(null);
    const assign = side === 'before' ? setBefore : setAfter;
    assign(null);
    try {
      const next = await readTaskReport(selected);
      if (gate.current.current(ticket)) assign(next);
    } catch (cause) {
      if (gate.current.current(ticket)) setError(cause instanceof TaskFileError ? cause.code : 'invalid-report');
    } finally { if (gate.current.current(ticket)) setReading(false); }
  }
  function download(name: string, content: string, type: string) {
    let url: string | undefined;
    try {
      url = URL.createObjectURL(new Blob([content], { type }));
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = name; anchor.click();
    } catch { setError('downloadError'); }
    finally { if (url) { const captured = url; setTimeout(() => URL.revokeObjectURL(captured), 1000); } }
  }
  function exportDocument(document: TaskReport | TaskComparison) {
    try { download(document.kind === 'trazum-task' ? 'trazum-task.json' : 'trazum-task-comparison.json', taskDocumentJson(document), 'application/json'); }
    catch (cause) { setError(cause instanceof TaskFileError ? cause.code : 'downloadError'); }
  }
  function carryReport() {
    if (!report) return;
    // Explicitly choosing this run supersedes an import still reading in the other view.
    gate.current.cancel();
    setReading(false);
    if (report.task.policyId === 'baseline') setBefore(report); else setAfter(report);
    setComparison(null); setMode('compare'); setError(null);
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label={c.tab}>
          <Button variant={mode === 'analyze' ? 'default' : 'outline'} aria-pressed={mode === 'analyze'} onClick={() => { setMode('analyze'); setError(null); }}>{c.analyzeMode}</Button>
          <Button variant={mode === 'compare' ? 'default' : 'outline'} aria-pressed={mode === 'compare'} onClick={() => { setMode('compare'); setError(null); }}>{c.compareMode}</Button>
        </div>
        <Button variant="ghost" onClick={clear}>{c.clear}</Button>
      </div>
      <p className="max-w-[75ch] border-l-2 border-foreground pl-3 text-sm leading-relaxed text-muted-foreground">{c.privacy}</p>
      <p role="status" className={reading ? 'text-sm' : 'sr-only'}>{reading ? c.reading : ''}</p>
      {error && <p role="alert" className="border-2 border-destructive p-3 text-sm">{error in c.errors ? c.errors[error as TaskFileErrorCode] : c[error as 'analyzeError' | 'compareError' | 'downloadError']}</p>}

      {mode === 'analyze' ? (
        <div className="grid items-start gap-8 xl:grid-cols-2">
          <form className="min-w-0" onChange={invalidateRun} onSubmit={(event) => {
            event.preventDefault(); setError(null);
            try { setReport(analyzeTask({ taskId, taskType, criterion, outcome, policyId, ...(outcome !== 'unknown' ? { assessor } : {}), sources: files.map(({ format, text }) => ({ format, text })) })); }
            catch { setReport(null); setError('analyzeError'); }
          }}>
            <fieldset disabled={reading} className="min-w-0 space-y-5 border-t-2 border-foreground pt-5">
              <legend className="sr-only">{c.analyzeMode}</legend>
              <h2 className="text-lg font-semibold">{c.sourceHeading}</h2>
              <label className="block text-sm font-medium">{c.format}
                <select className={field} value={format} onChange={(event) => setFormat(event.target.value as TaskFormat)}><option value="claude-code">Claude Code</option><option value="codex">Codex</option></select>
              </label>
              <div>
                <input ref={fileInput} type="file" accept=".jsonl,.json,.txt" multiple className="hidden" aria-label={c.files} onChange={(event) => { const selected = Array.from(event.target.files ?? []); event.target.value = ''; void selectFiles(selected); }} />
                <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>{c.files}</Button>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{c.fileHint}</p>
                {!files.length ? <p className="mt-4 text-sm text-muted-foreground">{c.noFiles}</p> : <ol className="mt-3 divide-y">{files.map((file, index) => <li key={index} className="flex min-w-0 items-start justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0 break-words [overflow-wrap:anywhere]"><span className="tabular-nums">{number(index + 1)}.</span> {file.name}<span className="block text-xs text-muted-foreground">{file.format}</span></span>
                  <Button type="button" variant="ghost" size="sm" aria-label={`${c.remove} ${file.name}`} onClick={() => { setFiles(files.filter((_, n) => n !== index)); invalidateRun(); }}>{c.remove}</Button>
                </li>)}</ol>}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium">{c.taskId}<input className={field} required maxLength={80} pattern="[A-Za-z0-9][A-Za-z0-9._\-]{0,79}" aria-describedby="task-id-hint" value={taskId} onChange={(event) => setTaskId(event.target.value)} /></label>
                <label className="text-sm font-medium">{c.taskType}<input className={field} required maxLength={80} pattern="[A-Za-z0-9][A-Za-z0-9._\-]{0,79}" aria-describedby="task-id-hint" value={taskType} onChange={(event) => setTaskType(event.target.value)} /></label>
              </div>
              <p id="task-id-hint" className="text-xs text-muted-foreground">{c.idHint}</p>
              <h2 className="border-t pt-5 text-lg font-semibold">{c.acceptanceHeading}</h2>
              <label className="block text-sm font-medium">{c.criterion}<textarea className={field} required maxLength={500} rows={3} aria-describedby="task-criterion-hint" value={criterion} onChange={(event) => setCriterion(event.target.value)} /></label>
              <p id="task-criterion-hint" className="text-xs text-muted-foreground">{c.criterionHint}</p>
              <label className="block text-sm font-medium">{c.outcome}<select className={field} value={outcome} onChange={(event) => setOutcome(event.target.value as TaskOutcome)}>{Object.entries(c.outcomes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <p className="text-xs leading-relaxed text-muted-foreground">{c.outcomeHint}</p>
              {outcome !== 'unknown' && <label className="block text-sm font-medium">{c.assessor}<input className={field} required maxLength={100} value={assessor} onChange={(event) => setAssessor(event.target.value)} /></label>}
              <label className="block text-sm font-medium">{c.policy}<select className={field} value={policyId} onChange={(event) => setPolicyId(event.target.value as TaskPolicyId)}><option value="baseline">{c.baseline}</option><option value="repeat-review-v1">{c.repeat}</option></select></label>
              <p className="text-xs leading-relaxed text-muted-foreground">{c.policyHint}</p>
              <Button type="submit" disabled={reading || !files.length}>{c.analyze}</Button>
            </fieldset>
          </form>
          {report ? <TaskRunReport report={report} t={t} onExport={() => exportDocument(report)} onUse={carryReport} onPolicy={(instructions) => download('trazum-repeat-review-v1.md', instructions + '\n', 'text/markdown')} /> : <section className="min-w-0 border-t-2 border-foreground py-8 xl:px-4">
            <h2 className="max-w-[18ch] text-3xl font-semibold leading-tight tracking-tight">{c.emptyTitle}</h2>
            <p className="mt-4 max-w-[55ch] text-sm leading-relaxed text-muted-foreground">{c.emptyBody}</p>
            <a className="mt-6 inline-block text-sm font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring" href={guideUrl} target="_blank" rel="noreferrer">{c.guide} ↗</a>
          </section>}
        </div>
      ) : (
        <div className="space-y-6">
          <p className="max-w-[75ch] text-sm leading-relaxed text-muted-foreground">{c.reportHint}</p>
          <div className="grid gap-6 md:grid-cols-2">
            {(['before', 'after'] as const).map((side) => {
              const selected = side === 'before' ? before : after;
              const ref = side === 'before' ? beforeInput : afterInput;
              return <section key={side} className="min-w-0 space-y-4 border-t-2 border-foreground pt-4" aria-label={c[side]}>
                <h2 className="text-lg font-semibold">{c[side]}</h2>
                <input ref={ref} type="file" accept=".json" className="hidden" aria-label={`${c.importReport}: ${c[side]}`} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void selectReport(file, side); }} />
                <Button variant="outline" disabled={reading} onClick={() => ref.current?.click()}>{c.importReport}</Button>
                {selected ? <><TaskRunSummary report={selected} t={t} /><p className="text-sm">{c.tokens}: <strong className="tabular-nums">{selected.usage.records ? number(selected.usage.totalTokens) : '—'}</strong></p><Button variant="ghost" size="sm" disabled={reading} aria-label={`${c.removeReport}: ${c[side]}`} onClick={() => { gate.current.cancel(); if (side === 'before') setBefore(null); else setAfter(null); setComparison(null); setError(null); }}>{c.removeReport}</Button></> : <p className="text-sm text-muted-foreground">{c.noReport}</p>}
              </section>;
            })}
          </div>
          <Button disabled={reading || !before || !after} onClick={() => { if (!before || !after) return; setError(null); try { setComparison(compareTasks(before, after)); } catch { setComparison(null); setError('compareError'); } }}>{c.compare}</Button>
          <section aria-label={c.compareHeading} className="space-y-4 border-t-2 border-foreground py-5" aria-live="polite">
            {comparison ? <>
              <h2 className="text-2xl font-semibold tracking-tight">{c.verdicts[comparison.verdict]}</h2>
              {comparison.tokenChange && <dl className="grid gap-4 sm:grid-cols-2">
                <div><dt className="text-sm text-muted-foreground">{c.delta}</dt><dd className="mt-1 text-4xl font-semibold tabular-nums">{comparison.tokenChange.delta > 0 ? '+' : ''}{number(comparison.tokenChange.delta)}</dd></div>
                <div><dt className="text-sm text-muted-foreground">{c.percent}</dt><dd className="mt-1 text-4xl font-semibold tabular-nums">{comparison.tokenChange.percent === null ? '—' : `${comparison.tokenChange.percent > 0 ? '+' : ''}${comparison.tokenChange.percent.toLocaleString(t.numberLocale, { maximumFractionDigits: 2 })}%`}</dd></div>
              </dl>}
              <ul className="list-disc space-y-1 pl-5 text-sm">{comparison.reasons.map((reason) => <li key={reason}>{c.reasons[reason as keyof typeof c.reasons] ?? reason}</li>)}</ul>
              <p className="text-sm text-muted-foreground">{c.observation}</p>
              <Button variant="outline" onClick={() => exportDocument(comparison)}>{c.exportComparison}</Button>
            </> : <><h2 className="text-2xl font-semibold tracking-tight">{c.compareEmpty}</h2><p className="max-w-[75ch] text-sm leading-relaxed text-muted-foreground">{c.compareBody}</p></>}
          </section>
        </div>
      )}
    </div>
  );
}
