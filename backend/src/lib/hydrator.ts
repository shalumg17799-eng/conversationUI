import { UITypeTree } from '../types';
import { ReportCard } from '../services/llmHandler';
import { resolveAlias } from '../services/metadataService';

/**
 * Recursively attaches real BigQuery data to components that need it.
 */
export function hydrateTree(card: ReportCard, allRows: any[]): UITypeTree {
  const { renderType, props } = card;

  // Recurse into children first
  const hydratedChildren: UITypeTree[] = (card.children ?? []).map(child =>
    hydrateTree(child, allRows)
  );

  switch (renderType) {
    case 'LineChart':
    case 'AreaChart': {
      const { xKey, yKey } = props;
      if (xKey && yKey) {
        const grouped = new Map<string, { sum: number; count: number }>();
        for (const row of allRows) {
          const x = String(row[xKey] ?? '');
          const y = Number(row[yKey]) || 0;
          const entry = grouped.get(x) ?? { sum: 0, count: 0 };
          entry.sum += y;
          entry.count += 1;
          grouped.set(x, entry);
        }
        const aggregated = Array.from(grouped.entries()).map(([x, { sum, count }]) => ({
          ...Object.fromEntries(Object.entries(allRows.find(r => String(r[xKey]) === x) ?? {})),
          [xKey]: x,
          [yKey]: Math.round((sum / count) * 100) / 100,
        }));
        return { renderType, props: { ...props, data: aggregated }, children: hydratedChildren };
      }
      return { renderType, props: { ...props, data: allRows }, children: hydratedChildren };
    }

    case 'BarChart':
    case 'PieChart':
      return { renderType, props: { ...props, data: allRows }, children: hydratedChildren };

    case 'RankedList': {
      const { labelKey, valueKey, limit = 10 } = props;
      const grouped = new Map<string, { sum: number; count: number }>();
      for (const row of allRows) {
        const label = String(row[labelKey] ?? '');
        const val = Number(row[valueKey]) || 0;
        const entry = grouped.get(label) ?? { sum: 0, count: 0 };
        entry.sum += val;
        entry.count += 1;
        grouped.set(label, entry);
      }
      const items = Array.from(grouped.entries())
        .map(([label, { sum, count }]) => ({ label, value: Math.round((sum / count) * 100) / 100 }))
        .sort((a, b) => b.value - a.value)
        .slice(0, limit)
        .map((item, i) => ({ rank: i + 1, label: item.label, value: item.value }));
      return { renderType, props: { ...props, items }, children: hydratedChildren };
    }

    case 'Table':
    case 'GenerativeTable': {
      const columns = props.columns ?? (allRows[0] ? Object.keys(allRows[0]) : []);
      return {
        renderType,
        props: { ...props, columns, data: allRows, rows: allRows },
        children: hydratedChildren,
      };
    }

    case 'KPI': {
      const METRIC_TO_COLUMN: Record<string, string> = {
        revenue: 'sug_revenue',
        sales: 'sales',
        churn: 'churn',
        take_rate: 'take_rate',
        performance: 'performance_score'
      };

      // Try to find the measure column based on metric alias, then mapping, then fallback
      const targetMetric = (props.metric || '').toLowerCase();
      const measureCol = Object.keys(allRows[0] || {}).find(k => 
        resolveAlias(k) === targetMetric || k === METRIC_TO_COLUMN[targetMetric]
      ) || Object.keys(allRows[0] || {}).find(k => typeof allRows[0][k] === 'number');

      if (!measureCol) {
        return { renderType, props: { ...props, value: 0 }, children: hydratedChildren };
      }

      const totalValue = allRows.reduce((sum, row) => sum + (Number(row[measureCol]) || 0), 0);
      
      return { 
        renderType, 
        props: { 
          ...props, 
          value: Math.round(totalValue * 100) / 100,
          title: `Total ${targetMetric || 'Value'}` 
        }, 
        children: hydratedChildren 
      };
    }

    case 'TwoColumn':
    case 'Section':
      return { renderType, props, children: hydratedChildren };

    default:
      return { renderType, props, children: hydratedChildren };
  }
}
