import type { UsageProfileReport } from '@trazum/core';

/** Zero is meaningful only when at least one model behind the row was priced. */
export function billBreakdownRows(report: UsageProfileReport, dimension: 'label' | 'model') {
  const unpriced = new Set(report.unpricedModels);
  if (dimension === 'model') {
    return report.byModel.map((row) => ({ key: row.model, breakdown: row.breakdown, priced: !unpriced.has(row.model) }));
  }
  const pricedLabels = new Set(report.byLabelAndModel.filter((row) => !unpriced.has(row.model)).map((row) => row.label));
  return report.byLabel.map((row) => ({ key: row.label, breakdown: row.breakdown, priced: pricedLabels.has(row.label) }));
}
