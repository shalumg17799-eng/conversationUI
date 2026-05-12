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
  const { intent: intentType } = intent;

  console.log(`BQ Query — table: ${tableOverride ?? 'none'}, intent: ${intentType}`);

  const runTable = async (table: string, sql: string): Promise<any[]> => {
    const result = await runQueryWithMeta(sql);
    onMeta?.({
      project: result.project,
      dataset: result.dataset,
      table: result.table,
      rowCount: result.rows.length,
      durationMs: result.durationMs,
      intent: intentType,
      metric: table,
      dimension: 'unknown',
    });
    return result.rows;
  };

  try {
    // Primary: use the table the LLM selected — always preferred over any fallback.
    if (tableOverride) {
      const source = DATA_SOURCES.find(ds => ds.table === tableOverride);
      if (source) {
        const sql = buildQuerySQL(source, qualifiedTable);
        return await runTable(tableOverride, sql);
      }
      // tableOverride set but not in DATA_SOURCES — run as bare SELECT
      return await runTable(tableOverride,
        `SELECT * FROM ${qualifiedTable(tableOverride)} LIMIT 50`);
    }

    // Last resort: use the first available source from the catalog.
    // This path should rarely be hit now that the pipeline always sets tableOverride
    // via analyzeQuery (LLM) or history-derived catalog lookup.
    const fallbackSource = DATA_SOURCES[0];
    console.warn(`[executeQuery] No tableOverride — falling back to catalog default: ${fallbackSource.table}`);
    return await runTable(fallbackSource.table, buildQuerySQL(fallbackSource, qualifiedTable));

  } catch (err: any) {
    console.error('BigQuery executeQuery error:', err.message);
    return [];
  }
};
