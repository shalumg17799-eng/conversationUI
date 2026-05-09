import { runQueryWithMeta, qualifiedTable } from '../lib/bigqueryClient';
import { IntentResult } from '../types';
import { resolveAlias } from './metadataService';

export interface BQQueryMeta {
  project: string;
  dataset: string;
  table: string;
  rowCount: number;
  durationMs: number;
  intent: string;
  metric: string;
  dimension: string;
}

/**
 * Deterministically generates analytical SQL based on intent.
 */
const buildAnalyticalSQL = (intent: IntentResult, table: string): string => {
  const metricCol = resolveAlias(intent.metric);
  const dimCol = resolveAlias(intent.dimension);
  const tableRef = qualifiedTable(table);

  let sqlType = 'raw';
  let sql = '';

  switch (intent.intent) {
    case 'metric_only':
      sqlType = 'aggregated_kpi';
      sql = `SELECT SUM(${metricCol}) as total_${intent.metric} FROM ${tableRef}`;
      break;
      
    case 'metric_by_dimension':
    case 'comparison' as any: // Treat comparison as a grouped aggregation
      sqlType = 'grouped_aggregation';
      sql = `SELECT ${dimCol}, SUM(${metricCol}) as total_${intent.metric} FROM ${tableRef} GROUP BY ${dimCol} ORDER BY total_${intent.metric} DESC LIMIT 15`;
      break;

    case 'trend':
      sqlType = 'time_series_aggregation';
      // Optimized for fact_sug_monthly_rollup structure
      const timeCol = 'month_name';
      const sortCol = 'month_id';
      sql = `SELECT ${timeCol}, ${sortCol}, SUM(${metricCol}) as total_${intent.metric} FROM ${tableRef} GROUP BY ${timeCol}, ${sortCol} ORDER BY ${sortCol} ASC`;
      break;

    default:
      sqlType = 'raw_fallback';
      sql = `SELECT * FROM ${tableRef} LIMIT 100`;
  }

  console.log(`[QueryEngine] Generated SQL Type: ${sqlType}`);
  return sql;
};

export const executeQuery = async (
  intent: IntentResult,
  onMeta?: (meta: BQQueryMeta) => void,
): Promise<any[]> => {
  const { metric, dimension, timeRange, intent: intentType } = intent;
  const m = metric.toLowerCase();
  const d = dimension.toLowerCase();

  console.log(`[QueryEngine] Routing Intent: intent=${intentType} metric=${m} dimension=${d}`);

  const withMeta = async (sql: string, slice?: number): Promise<any[]> => {
    const result = await runQueryWithMeta(sql);
    onMeta?.({
      project: result.project,
      dataset: result.dataset,
      table: result.table,
      rowCount: result.rows.length,
      durationMs: result.durationMs,
      intent: intentType,
      metric: m,
      dimension: d,
    });
    return slice ? result.rows.slice(0, slice) : result.rows;
  };

  try {
    // 1. Analytical Fact Tables (Preferred for charts/KPIs)
    if (m === 'revenue' || m === 'sales' || intentType === 'trend' || m === 'take_rate') {
      const sql = buildAnalyticalSQL(intent, 'fact_sug_monthly_rollup');
      return await withMeta(sql);
    }
    
    if (m === 'churn') {
      const sql = buildAnalyticalSQL(intent, 'churn_monthly');
      return await withMeta(sql);
    }

    if (d === 'region' || m === 'performance' || m === 'score') {
      const sql = buildAnalyticalSQL(intent, 'performance_by_region');
      return await withMeta(sql);
    }

    if (d === 'device' || d === 'product' || m === 'device') {
      const sql = buildAnalyticalSQL(intent, 'revenue_by_device_group');
      return await withMeta(sql);
    }

    // 2. Dimensional Lookups (Only for explicit browsing)
    if (d === 'market' || m === 'market') {
      return await withMeta(`SELECT * FROM ${qualifiedTable('dim_markets')} ORDER BY market_name`);
    }
    if (d === 'territory') {
      return await withMeta(`SELECT * FROM ${qualifiedTable('dim_territories')} ORDER BY territory_name`);
    }

    // 3. Detailed Views
    if (m === 'units' || intentType === 'comparison' as any) {
      // If it's a comparison but we don't have a specific fact table, use the detailed view with aggregation
      const sql = buildAnalyticalSQL(intent, 'v_daily_sales_detail');
      return await withMeta(sql);
    }

    // Default Analytical Fallback
    const fallbackSql = buildAnalyticalSQL(intent, 'v_monthly_territory_performance');
    return await withMeta(fallbackSql);

  } catch (err: any) {
    console.error('BigQuery executeQuery error:', err.message);
    return [];
  }
};
