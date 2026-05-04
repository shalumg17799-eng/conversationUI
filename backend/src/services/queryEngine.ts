import { runQueryWithMeta, qualifiedTable } from '../lib/bigqueryClient';
import { IntentResult } from '../types';

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

export const executeQuery = async (
  intent: IntentResult,
  onMeta?: (meta: BQQueryMeta) => void,
): Promise<any[]> => {
  const { metric, dimension, timeRange, intent: intentType } = intent;
  const m = metric.toLowerCase();
  const d = dimension.toLowerCase();

  console.log(`BQ Query — intent: ${intentType}, metric: ${m}, dimension: ${d}, time: ${timeRange}`);

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
    if (m === 'revenue' || m === 'sales' || intentType === 'trend') {
      return await withMeta(`SELECT * FROM ${qualifiedTable('fact_sug_monthly_rollup')} ORDER BY month_id DESC`, 50);
    }
    if (m === 'take_rate' || m === 'takerate' || m.includes('take')) {
      return await withMeta(`SELECT * FROM ${qualifiedTable('fact_sug_monthly_rollup')} ORDER BY month_id DESC`);
    }
    if (m === 'churn' || m.includes('churn')) {
      return await withMeta(`SELECT * FROM ${qualifiedTable('churn_monthly')} ORDER BY month_date DESC`);
    }
    if (d === 'region' || m === 'performance' || m === 'score') {
      return await withMeta(`SELECT * FROM ${qualifiedTable('performance_by_region')} ORDER BY performance_score DESC`);
    }
    if (d === 'device' || d === 'product' || m === 'device') {
      return await withMeta(`SELECT * FROM ${qualifiedTable('revenue_by_device_group')} ORDER BY revenue DESC`);
    }
    if (m === 'contact' || m === 'agent' || m === 'employee' || d === 'employee') {
      return await withMeta(`SELECT * FROM ${qualifiedTable('fact_contact_center_metrics')} ORDER BY status`);
    }
    if (m === 'rank' || m === 'score' || m === 'dynamic') {
      return await withMeta(`SELECT * FROM ${qualifiedTable('fact_dynamic_scores')} ORDER BY rank`);
    }
    if (d === 'market' || m === 'market') {
      return await withMeta(`SELECT * FROM ${qualifiedTable('dim_markets')} ORDER BY market_name`);
    }
    if (d === 'territory') {
      return await withMeta(`SELECT * FROM ${qualifiedTable('dim_territories')} ORDER BY territory_name`);
    }
    if (d === 'outlet' || d === 'store' || d === 'city') {
      return await withMeta(`SELECT * FROM ${qualifiedTable('dim_outlets')} ORDER BY outlet_name`);
    }
    if (m === 'report' || d === 'report') {
      return await withMeta(`SELECT * FROM ${qualifiedTable('catalog_reports')} ORDER BY last_updated_ts DESC`);
    }
    if (m === 'dataset' || d === 'dataset') {
      return await withMeta(`SELECT * FROM ${qualifiedTable('catalog_datasets')} ORDER BY last_refresh_ts DESC`);
    }
    if (m === 'units' || intentType === 'comparison') {
      return await withMeta(`SELECT * FROM ${qualifiedTable('v_daily_sales_detail')} ORDER BY date DESC, outlet_name`, 100);
    }
    return await withMeta(`SELECT * FROM ${qualifiedTable('v_monthly_territory_performance')} ORDER BY month_id DESC, territory_name`, 50);

  } catch (err: any) {
    console.error('BigQuery executeQuery error:', err.message);
    return [];
  }
};
