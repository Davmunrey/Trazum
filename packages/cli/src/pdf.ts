import { PdfDocument, UNLABELLED, formatUsd, pdfFit, pdfWrap, sharesOf } from '@trazum/core';
import type { PdfColor, PdfFont, UsageBreakdown } from '@trazum/core';
import { tierCeilingCaveat } from './markdown.js';
import type { ProfileMarkdownInput } from './markdown.js';
import { dayOf, spanDays } from './time.js';

/**
 * The profile as a PDF, for the person who signs the bill off.
 *
 * The same input object the HTML and Markdown doors take, and the same
 * sentences from the same message catalogue, so the three files are one
 * report in three envelopes: a figure that differed between them would be a
 * second computation, and there is none. The rules the HTML door applies are
 * applied here, for the same reasons:
 *
 * - **The caveats are furniture.** What the report cannot say renders in a
 *   bordered block ahead of every table, at the weight of the totals it
 *   qualifies. A PDF is the format most likely to be forwarded without the
 *   terminal it came from, which makes it the one where a caveat that can be
 *   cropped out matters most.
 * - **Every page carries the footer** that says where the figures came from,
 *   because a printed page gets separated from its first one.
 *
 * Written with core's `PdfDocument`: no dependency, no embedded font, the
 * same bytes for the same report.
 */

const INK: PdfColor = '#1f2328';
const MUTED: PdfColor = '#59606a';
const RULE: PdfColor = '#d9d5cc';
const ZEBRA: PdfColor = '#f7f6f3';
const CAVEAT_EDGE: PdfColor = '#8a6d1a';
const CAVEAT_FILL: PdfColor = '#fbf6e9';
const CAVEAT_INK: PdfColor = '#6d5510';
const FAIL_EDGE: PdfColor = '#b42318';
const FAIL_FILL: PdfColor = '#fdf1f0';
const FAIL_INK: PdfColor = '#7a1a12';
const PASS_INK: PdfColor = '#365f37';

const MARGIN = 48;
const TOP = 56;
/** Below this the footer lives; content that would cross it starts a page. */
const FOOTER_SPACE = 70;

export interface ProfilePdfOptions {
  /** Written into the file's metadata only when given, so tests can compare bytes. */
  createdAt?: Date;
}

/** The profile as one PDF. Same input as the HTML and Markdown doors. */
export function renderProfilePdf(input: ProfileMarkdownInput, options: ProfilePdfOptions = {}): Uint8Array {
  const { report, levers, cache, t, gates, window, stalePricing, apiEquivalent } = input;
  const n = (value: number): string => value.toLocaleString(t.numberLocale);
  const pct = (share: number): string => `${(share * 100).toFixed(1)}%`;
  const showLabel = (label: string): string => (label === UNLABELLED ? t.profile.unlabelled() : label);

  const doc = new PdfDocument();
  const width = doc.width - MARGIN * 2;
  const bottom = doc.height - FOOTER_SPACE;
  let y = TOP;

  const need = (height: number): boolean => {
    if (y + height <= bottom) return false;
    doc.addPage();
    y = TOP;
    return true;
  };

  /** A wrapped paragraph; returns nothing, moves the cursor. */
  const paragraph = (text: string, font: PdfFont, size: number, color: PdfColor, after = 4): void => {
    const leading = size * 1.35;
    for (const line of pdfWrap(text, font, size, width)) {
      need(leading);
      doc.text(MARGIN, y + size, line, { font, size, color });
      y += leading;
    }
    y += after;
  };

  const heading = (text: string): void => {
    need(40);
    y += 14;
    doc.text(MARGIN, y + 11, text, { font: 'bold', size: 11.5, color: INK });
    y += 17;
    doc.line(MARGIN, y, MARGIN + width, y, { color: RULE, width: 0.75 });
    y += 8;
  };

  /**
   * A box of sentences: the caveats and the gate verdict. Measured before it
   * is drawn so the border fits what is inside it, and moved whole to the
   * next page rather than split, because half a caveat is a different claim.
   */
  const box = (
    title: string | null,
    lines: string[],
    colors: { edge: PdfColor; fill: PdfColor; ink: PdfColor },
    bullet: boolean,
  ): void => {
    const size = 9;
    const leading = size * 1.4;
    const pad = 10;
    const indent = bullet ? 10 : 0;
    const wrapped = lines.map((line) => pdfWrap(line, bullet ? 'regular' : 'bold', size, width - pad * 2 - indent));
    const titleHeight = title === null ? 0 : 18;
    const height = pad * 2 + titleHeight + wrapped.reduce((sum, w) => sum + w.length * leading + 2, 0);
    need(height + 8);
    doc.rect(MARGIN, y, width, height, { fill: colors.fill, stroke: colors.edge, lineWidth: 1.5 });
    let inner = y + pad;
    if (title !== null) {
      doc.text(MARGIN + pad, inner + 10, title, { font: 'bold', size: 10.5, color: colors.ink });
      inner += titleHeight;
    }
    for (const lineSet of wrapped) {
      lineSet.forEach((line, i) => {
        if (bullet && i === 0) doc.text(MARGIN + pad, inner + size, '•', { size, color: colors.ink });
        doc.text(MARGIN + pad + indent, inner + size, line, { font: bullet ? 'regular' : 'bold', size, color: colors.ink });
        inner += leading;
      });
      inner += 2;
    }
    y += height + 10;
  };

  interface Row {
    name: string;
    breakdown: UsageBreakdown;
    /** Money as a dash, never `$0`, as in the HTML door: zero claims the calls were free. */
    unpriced?: boolean;
  }

  /** The breakdown table, its header repeated on every page it crosses. */
  const table = (rows: Row[], nameHeading: string): void => {
    const size = 7.5;
    const rowHeight = 13;
    const figureColumns = [
      t.html.colCalls(),
      t.html.colInput(),
      t.html.colCacheRead(),
      t.html.colCacheWrite(),
      t.html.colOutput(),
      'USD',
      '%',
    ];
    const figureWidth = 54;
    const nameWidth = width - figureWidth * figureColumns.length;
    const right = (column: number): number => MARGIN + nameWidth + figureWidth * (column + 1) - 4;

    /* A heading wraps to two lines rather than being cut: "lecturas de
       caché" cut to "lecturas de…" no longer says which column it is. */
    const headings = figureColumns.map((column) => pdfWrap(column, 'bold', size, figureWidth - 6).slice(0, 2));
    const headerLines = Math.max(1, ...headings.map((lines) => lines.length));
    const header = (): void => {
      const base = y + 9 + (headerLines - 1) * (size + 1.5);
      doc.text(MARGIN + 4, base, pdfFit(nameHeading, 'bold', size, nameWidth - 8), { font: 'bold', size, color: INK });
      headings.forEach((lines, i) => {
        lines.forEach((line, j) => {
          const lineY = base - (lines.length - 1 - j) * (size + 1.5);
          doc.textRight(right(i), lineY, pdfFit(line, 'bold', size, figureWidth - 6), { font: 'bold', size, color: INK });
        });
      });
      y += rowHeight + (headerLines - 1) * (size + 1.5);
      doc.line(MARGIN, y, MARGIN + width, y, { color: RULE, width: 1.25 });
      y += 2;
    };

    need(rowHeight * 3);
    header();
    rows.forEach(({ name, breakdown: b, unpriced }, index) => {
      if (need(rowHeight)) header();
      if (index % 2 === 1) doc.rect(MARGIN, y, width, rowHeight, { fill: ZEBRA });
      const share = report.total.totalUsd > 0 && !unpriced ? pct(b.totalUsd / report.total.totalUsd) : '—';
      const cells = [
        n(b.calls),
        n(b.inputTokens),
        n(b.cacheReadTokens),
        n(b.cacheWriteTokens),
        n(b.outputTokens),
        unpriced ? '—' : formatUsd(b.totalUsd),
        share,
      ];
      doc.text(MARGIN + 4, y + 9, pdfFit(name, 'regular', size, nameWidth - 8), { size, color: INK });
      cells.forEach((cell, i) => {
        doc.textRight(right(i), y + 9, pdfFit(cell, 'regular', size, figureWidth - 6), { size, color: INK });
      });
      y += rowHeight;
    });
    y += 6;
  };

  // The masthead: what this is and the one figure a reader came for.
  doc.text(MARGIN, y + 9, 'trazum', { font: 'bold', size: 9, color: MUTED });
  y += 16;
  doc.line(MARGIN, y, MARGIN + width, y, { color: RULE, width: 0.75 });
  y += 14;
  paragraph(t.profile.heading(), 'bold', 19, INK, 2);
  paragraph(t.profile.spent(t.profile.calls(report.total.calls), formatUsd(report.total.totalUsd)), 'bold', 14, INK, 4);
  if (report.span !== null) {
    paragraph(
      t.profile.spanLine(dayOf(report.span.fromMs), dayOf(report.span.toMs), spanDays(report.span.fromMs, report.span.toMs)),
      'regular',
      9.5,
      MUTED,
      0,
    );
  }
  if (window !== undefined) paragraph(t.profile.windowLine(window.since, window.until), 'regular', 9.5, MUTED, 0);
  y += 8;

  if (gates !== undefined && gates.lines.length > 0) {
    if (gates.failed) {
      box(null, gates.lines, { edge: FAIL_EDGE, fill: FAIL_FILL, ink: FAIL_INK }, false);
    } else {
      for (const line of gates.lines) paragraph(line, 'regular', 9.5, PASS_INK, 0);
      y += 6;
    }
  }

  // The caveats, ahead of every table, as in the HTML door.
  const caveats: string[] = [];
  if (report.unpricedModels.length > 0) {
    caveats.push(t.profile.unpriced(report.unpricedModels.join(', '), report.unpriced.calls));
  }
  if (report.skippedLines.length > 0) {
    const shown = report.skippedLines.slice(0, 5).join(', ');
    caveats.push(t.profile.skipped(report.skippedLines.length, report.skippedLines.length > 5 ? `${shown}…` : shown));
  }
  if (report.span === null) caveats.push(t.html.noClock());
  if (!report.hasSessions) caveats.push(t.html.noSessions());
  if (report.total.assumedWriteTtlCalls > 0) {
    caveats.push(
      t.profile.cacheTtlUnsettled(
        report.total.assumedWriteTtlCalls,
        formatUsd(-cache.deltaUsd),
        formatUsd(cache.worstCaseDeltaUsd),
      ),
    );
  }
  if (report.total.tierCeilingCalls > 0) caveats.push(tierCeilingCaveat(report, t));
  if (stalePricing !== undefined) caveats.push(t.profile.pricesStale(stalePricing.date, stalePricing.days));
  if (apiEquivalent === true) caveats.push(t.bill.apiEquivalent());
  if (caveats.length > 0) {
    box(t.html.caveatsHeading(), caveats, { edge: CAVEAT_EDGE, fill: CAVEAT_FILL, ink: CAVEAT_INK }, true);
  }

  heading(t.html.byLabelHeading());
  table(
    report.byLabel.map((row) => ({ name: showLabel(row.label), breakdown: row.breakdown })),
    t.html.colLabel(),
  );

  heading(t.html.byModelHeading());
  table(
    report.byModel.map((row) => ({
      name: row.model,
      breakdown: row.breakdown,
      unpriced: report.unpricedModels.includes(row.model),
    })),
    t.html.colModel(),
  );

  // The findings, as the sentences the terminal says.
  const findings: string[] = [];
  for (const lever of levers.slices.slice(0, 5)) {
    findings.push(
      t.profile.leverSlice(showLabel(lever.label), lever.modelName, formatUsd(lever.combinedUsd), pct(lever.shareOfBill)),
    );
  }
  if (report.total.cacheReadTokens + report.total.cacheWriteTokens > 0) {
    findings.push(
      cache.deltaUsd > 0
        ? t.profile.cacheLost(formatUsd(cache.deltaUsd), n(report.total.cacheWriteTokens), n(report.total.cacheReadTokens))
        : t.profile.cachePaidOff(formatUsd(-cache.deltaUsd)),
    );
  }
  if (findings.length > 0) {
    heading(t.html.findingsHeading());
    const size = 9.5;
    const leading = size * 1.4;
    for (const finding of findings) {
      const lines = pdfWrap(finding, 'regular', size, width - 12);
      need(lines.length * leading);
      doc.text(MARGIN, y + size, '•', { size, color: INK });
      for (const line of lines) {
        doc.text(MARGIN + 12, y + size, line, { size, color: INK });
        y += leading;
      }
      y += 3;
    }
  }

  const shares = sharesOf(report.total);
  y += 6;
  paragraph(
    t.html.sharesLine(pct(shares.input), pct(shares.cacheRead), pct(shares.cacheWrite), pct(shares.output)),
    'regular',
    9,
    MUTED,
  );

  // The footer on every page, now that the page count is known.
  const footerSize = 7.5;
  const pageLabelWidth = 70;
  const footerLines = pdfWrap(t.html.footer(), 'regular', footerSize, width - pageLabelWidth);
  for (let page = 0; page < doc.pageCount; page += 1) {
    doc.setPage(page);
    const top = doc.height - FOOTER_SPACE + 22;
    doc.line(MARGIN, top, MARGIN + width, top, { color: RULE, width: 0.75 });
    footerLines.forEach((line, i) => {
      doc.text(MARGIN, top + 11 + i * footerSize * 1.35, line, { size: footerSize, color: MUTED });
    });
    doc.textRight(MARGIN + width, top + 11, t.pdf.page(page + 1, doc.pageCount), { size: footerSize, color: MUTED });
  }

  return doc.toBytes({
    title: t.profile.heading(),
    subject: t.profile.spent(t.profile.calls(report.total.calls), formatUsd(report.total.totalUsd)),
    ...(options.createdAt !== undefined ? { createdAt: options.createdAt } : {}),
  });
}

