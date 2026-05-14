import { ShapeSignature } from '../types';
import { AnalyticalIntent, ScopedDataset } from '../lib/renderGovernance';

/**
 * Deterministically maps data shape + scoped rows to component props.
 * Called after component selection — removes LLM responsibility for prop assignment.
 * Returns fully hydrated props ready for UITreeRenderer.
 */
export function mapProps(
  renderType: string,
  shape: ShapeSignature,
  intent: AnalyticalIntent,
  scoped: ScopedDataset,
  overrides: Record<string, any> = {},
): Record<string, any> {

  // Best dimension: prefer human-readable name columns over ID columns
  const bestDim = shape.dimensionColumns.find(c => !/(_id|_key|_code|_num)$/i.test(c))
    ?? shape.dimensionColumns[0]
    ?? '';

  // Best measures: prefer revenue/rate/score columns
  const PREF = ['revenue', 'rate', 'score', 'pct', 'percent', 'count', 'total', 'avg'];
  const sortedMeasures = [...shape.measureColumns].sort((a, b) => {
    const ai = PREF.findIndex(p => a.toLowerCase().includes(p));
    const bi = PREF.findIndex(p => b.toLowerCase().includes(p));
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  const primaryMeasure = sortedMeasures[0] ?? '';
  const timeCol = shape.timeColumn ?? bestDim;

  switch (renderType) {

    // ── Metric components ────────────────────────────────────────────────────
    case 'KPICard': {
      const rows = intent === 'comparison' ? scoped.comparisonRows : scoped.summaryRows;
      const val = rows[0]?.[primaryMeasure] ?? '—';
      return {
        title: overrides.title ?? primaryMeasure,
        value: typeof val === 'number' ? val.toLocaleString() : val,
        ...overrides,
      };
    }

    case 'KPIGrid': {
      const rows = intent === 'comparison' ? scoped.comparisonRows : scoped.summaryRows;
      const row = rows[0] ?? {};
      const metrics = sortedMeasures.slice(0, 4).map(col => ({
        title: col,
        value: row[col] !== undefined ? (typeof row[col] === 'number' ? row[col].toLocaleString() : row[col]) : '—',
      }));
      return { metrics, ...overrides };
    }

    case 'StatDelta': {
      const rows = scoped.comparisonRows.length >= 2 ? scoped.comparisonRows : scoped.summaryRows;
      return {
        title: overrides.title ?? primaryMeasure,
        current: rows[0]?.[primaryMeasure] ?? '—',
        previous: rows[1]?.[primaryMeasure] ?? '—',
        currentLabel: rows[0]?.[bestDim] ?? 'Current',
        previousLabel: rows[1]?.[bestDim] ?? 'Previous',
        ...overrides,
      };
    }

    // ── Chart components ─────────────────────────────────────────────────────
    case 'BarChart': {
      const rows = intent === 'comparison' ? scoped.comparisonRows
        : intent === 'ranking' ? scoped.rankingRows
        : scoped.detailRows;
      return {
        title: overrides.title ?? `${primaryMeasure} by ${bestDim}`,
        xKey: bestDim,
        yKey: primaryMeasure,
        data: rows,
        ...overrides,
      };
    }

    case 'LineChart':
    case 'AreaChart': {
      const rows = scoped.trendRows;
      return {
        title: overrides.title ?? `${primaryMeasure} Over Time`,
        xKey: timeCol,
        yKey: primaryMeasure,
        data: rows,
        ...overrides,
      };
    }

    case 'PieChart': {
      const rows = intent === 'comparison' ? scoped.comparisonRows : scoped.detailRows;
      return {
        title: overrides.title ?? `${primaryMeasure} Distribution`,
        nameKey: bestDim,
        valueKey: primaryMeasure,
        data: rows,
        ...overrides,
      };
    }

    case 'RankedList': {
      const rows = scoped.rankingRows;
      // Build items directly — no downstream aggregation needed
      const seen = new Map<string, number>();
      for (const row of rows) {
        const label = String(row[bestDim] ?? '');
        const val = Number(row[primaryMeasure]) || 0;
        seen.set(label, (seen.get(label) ?? 0) + val);
      }
      const items = Array.from(seen.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, rows.length)
        .map(([label, value], i) => ({ rank: i + 1, label, value: Math.round(value * 100) / 100 }));
      return {
        title: overrides.title ?? `Top ${items.length} by ${primaryMeasure}`,
        labelKey: bestDim,
        valueKey: primaryMeasure,
        items,
        ...overrides,
      };
    }

    // ── Data components ──────────────────────────────────────────────────────
    case 'Table':
    case 'GenerativeTable': {
      const rows = intent === 'comparison' ? scoped.comparisonRows
        : intent === 'ranking' ? scoped.rankingRows
        : intent === 'trend' ? scoped.trendRows
        : scoped.detailRows;
      const columns = [bestDim, ...sortedMeasures].filter(Boolean).slice(0, 8);
      return {
        title: overrides.title ?? 'Data Detail',
        columns,
        data: rows,
        rows,
        ...overrides,
      };
    }

    // ── Narrative components — no data binding needed ────────────────────────
    case 'InsightCard':
      return { title: overrides.title ?? 'Key Insight', body: overrides.body ?? '', ...overrides };

    case 'SummaryText':
      return { text: overrides.text ?? '', ...overrides };

    case 'AlertBanner':
      return { message: overrides.message ?? '', ...overrides };

    case 'TwoColumn':
    case 'Section':
      return { ...overrides };

    default:
      return { ...overrides };
  }
}
