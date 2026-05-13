import { runQueryWithMeta, qualifiedTable } from '../lib/bigqueryClient';
import { IntentResult, AnalyticalPlan } from '../types';
import { DATA_SOURCES, buildQuerySQL } from './dataSourceMap';
import { buildAnalyticalQuerySQL } from './sqlBuilder';

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
  analyticalPlan?: AnalyticalPlan
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
    const resolveTableAndExecute = async () => {
      let selectedTable = 'v_monthly_territory_performance';
      let defaultOrder = 'month_id DESC, territory_name';
      let defaultLimit = 50;
      
      if (tableOverride) {
        selectedTable = tableOverride;
        const source = DATA_SOURCES.find(ds => ds.table === tableOverride);
        if (source) {
          defaultOrder = source.orderBy;
          defaultLimit = source.limit || 50;
        }
      } else if (m === 'revenue' || m === 'sales' || m === 'take_rate' || intentType === 'trend') {
        selectedTable = 'fact_sug_monthly_rollup';
        defaultOrder = 'month_id DESC';
      } else if (m === 'churn' || m === 'retention') {
        selectedTable = 'fact_sug_monthly_rollup';
        defaultOrder = 'month_id DESC';
      } else if (m === 'contact' || m === 'agent' || m === 'employee' || d === 'employee') {
        selectedTable = 'fact_contact_center_metrics';
        defaultOrder = 'status';
      } else if (m === 'rank' || m === 'score' || m === 'dynamic') {
        selectedTable = 'fact_dynamic_scores';
        defaultOrder = 'rank';
      } else if (m === 'network' || m === 'kpi') {
        selectedTable = 'fact_network_kpi_points';
        defaultOrder = 'timestamp DESC';
        defaultLimit = 100;
      } else if (d === 'territory' || m === 'performance' || m === 'territory') {
        selectedTable = 'v_monthly_territory_performance';
      } else if (intentType === 'comparison' || d === 'outlet') {
        selectedTable = 'v_daily_sales_detail';
        defaultOrder = 'date DESC, outlet_name';
        defaultLimit = 100;
      }

      let sql = '';
      if (analyticalPlan && analyticalPlan.intent !== 'raw') {
        console.log(`[QueryEngine] Applying analytical plan: ${JSON.stringify(analyticalPlan.operation)}`);
        sql = buildAnalyticalQuerySQL(qualifiedTable(selectedTable), analyticalPlan, defaultOrder, defaultLimit);
      } else {
        const source = DATA_SOURCES.find(ds => ds.table === selectedTable);
        if (source) {
          sql = buildQuerySQL(source, qualifiedTable);
        } else {
          sql = `SELECT * FROM ${qualifiedTable(selectedTable)} ORDER BY ${defaultOrder} LIMIT ${defaultLimit}`;
        }
      }
      
      console.log(`[QueryEngine] Executing SQL: ${sql}`);
      return await runTable(selectedTable, sql);
    };

    return await resolveTableAndExecute();

  } catch (err: any) {
    console.error('BigQuery executeQuery error:', err.message);
    console.log(`[ExecutionFailure] ${err.message}`);
    console.log(`[DatasourceUnavailable]`);
    // Re-throw so the pipeline can distinguish a hard execution failure
    // from a legitimate empty result set. Swallowing here caused the
    // pipeline to treat auth/network errors as "no rows" and re-enter
    // the onboarding clarification loop.
    throw err;
  }
};
