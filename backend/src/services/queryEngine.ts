import { runQueryWithMeta, qualifiedTable } from '../lib/bigqueryClient';
import { IntentResult } from '../types';
import { DATA_SOURCES, buildQuerySQL } from './dataSourceMap';

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
  tableOverride?: string,
): Promise<any[]> => {
  const { metric, dimension, intent: intentType } = intent;
  const m = metric.toLowerCase();
  const d = dimension.toLowerCase();

  console.log(`BQ Query — table: ${tableOverride ?? 'auto'}, intent: ${intentType}, metric: ${m}, dimension: ${d}`);

  const runTable = async (_table: string, sql: string): Promise<any[]> => {
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
    return result.rows;
  };

  try {
    // Direct table routing — used when analyzeQuery returns a specific table
    if (tableOverride) {
      const source = DATA_SOURCES.find(ds => ds.table === tableOverride);
      if (source) {
        const sql = buildQuerySQL(source, qualifiedTable);
        return await runTable(tableOverride, sql);
      }
    }

    // Keyword fallback — used when forceGenerate skips LLM routing
    if (m === 'revenue' || m === 'sales' || m === 'take_rate' || intentType === 'trend') {
      return await runTable('fact_sug_monthly_rollup',
        `SELECT * FROM ${qualifiedTable('fact_sug_monthly_rollup')} ORDER BY month_id DESC LIMIT 50`);
    }
    if (m === 'churn' || m === 'retention') {
      return await runTable('fact_sug_monthly_rollup',
        `SELECT * FROM ${qualifiedTable('fact_sug_monthly_rollup')} ORDER BY month_id DESC LIMIT 50`);
    }
    if (m === 'contact' || m === 'agent' || m === 'employee' || d === 'employee') {
      return await runTable('fact_contact_center_metrics',
        `SELECT * FROM ${qualifiedTable('fact_contact_center_metrics')} ORDER BY status`);
    }
    if (m === 'rank' || m === 'score' || m === 'dynamic') {
      return await runTable('fact_dynamic_scores',
        `SELECT * FROM ${qualifiedTable('fact_dynamic_scores')} ORDER BY rank`);
    }
    if (m === 'network' || m === 'kpi') {
      return await runTable('fact_network_kpi_points',
        `SELECT * FROM ${qualifiedTable('fact_network_kpi_points')} ORDER BY timestamp DESC LIMIT 100`);
    }
    if (d === 'territory' || m === 'performance' || m === 'territory') {
      return await runTable('v_monthly_territory_performance',
        `SELECT * FROM ${qualifiedTable('v_monthly_territory_performance')} ORDER BY month_id DESC, territory_name LIMIT 50`);
    }
    if (intentType === 'comparison' || d === 'outlet') {
      return await runTable('v_daily_sales_detail',
        `SELECT * FROM ${qualifiedTable('v_daily_sales_detail')} ORDER BY date DESC, outlet_name LIMIT 100`);
    }

    // Default — most populated table
    return await runTable('v_monthly_territory_performance',
      `SELECT * FROM ${qualifiedTable('v_monthly_territory_performance')} ORDER BY month_id DESC, territory_name LIMIT 50`);

  } catch (err: any) {
    console.error('BigQuery executeQuery error:', err.message);
    return [];
  }
};
