import fs from 'fs/promises';
import path from 'path';
import { runQueryWithMeta, qualifiedTable, PROJECT_ID, DATASET } from '../lib/bigqueryClient';
import { DATA_SOURCES, ALL_TABLES } from './dataSourceMap';

const CATALOG_PATH = path.resolve(__dirname, '../../data/catalog_context.md');
// Trigger background refresh when file is older than 25 hours
const STALE_THRESHOLD_MS = 25 * 60 * 60 * 1000;

// ── Schema fetching ───────────────────────────────────────────────────────────

// Exported so the KAG builder reuses this exact query rather than duplicating it —
// the graph and the markdown catalog must never disagree about physical schema.
export async function fetchTableSchema(table: string): Promise<Array<{ column_name: string; data_type: string }>> {
  const sql = `
    SELECT column_name, data_type
    FROM \`${PROJECT_ID}.${DATASET}\`.INFORMATION_SCHEMA.COLUMNS
    WHERE table_name = '${table}'
    ORDER BY ordinal_position
  `;
  const { rows } = await runQueryWithMeta(sql);
  return rows as Array<{ column_name: string; data_type: string }>;
}

// ── Catalog build ─────────────────────────────────────────────────────────────

export async function refreshCatalog(): Promise<void> {
  console.log('[CatalogRefresher] Starting catalog refresh...');

  const lines: string[] = [
    '# Data Catalog Context',
    `Generated: ${new Date().toISOString()}`,
    `Project: ${PROJECT_ID} | Dataset: ${DATASET}`,
    '',
    '---',
    '',
    '## Domains, Reports & Tables',
    '',
    'Use this section to route user queries and decide clarification questions.',
    '',
  ];

  // Group DATA_SOURCES by domain
  const domainMap = new Map<string, typeof DATA_SOURCES>();
  for (const source of DATA_SOURCES) {
    if (!domainMap.has(source.domain)) domainMap.set(source.domain, []);
    domainMap.get(source.domain)!.push(source);
  }

  for (const [domain, sources] of domainMap) {
    lines.push(`### Domain: ${domain}`);
    lines.push('');
    for (const s of sources) {
      lines.push(`- **Report:** "${s.reportName}"`);
      lines.push(`  - Table: \`${s.table}\``);
      lines.push(`  - Description: ${s.description}`);
      lines.push(`  - Key KPIs: ${s.kpis.join(', ')}`);
    }
    lines.push('');
  }

  // Real BQ column schemas per unique table
  lines.push('---');
  lines.push('');
  lines.push('## Real BigQuery Table Schemas');
  lines.push('');
  lines.push('These are the EXACT column names and types from BigQuery.');
  lines.push('Use these names verbatim when building queries and report layouts.');
  lines.push('');

  for (const table of ALL_TABLES) {
    lines.push(`### Table: \`${table}\``);
    lines.push('');

    // Which reports use this table
    const reports = DATA_SOURCES.filter(s => s.table === table);
    if (reports.length > 0) {
      lines.push(`Used by: ${reports.map(r => `"${r.reportName}" (${r.domain})`).join(', ')}`);
      lines.push('');
    }

    try {
      const cols = await fetchTableSchema(table);
      if (cols.length === 0) {
        lines.push('_No columns found._');
      } else {
        lines.push('| Column | Type |');
        lines.push('|--------|------|');
        for (const col of cols) {
          lines.push(`| ${col.column_name} | ${col.data_type} |`);
        }
      }
    } catch (err) {
      console.warn(`[CatalogRefresher] Schema fetch failed for ${table}:`, (err as Error).message);
      lines.push('_Schema unavailable — using KPI hints only._');
      // Fall back to KPI names from DATA_SOURCES
      const kpis = reports.flatMap(r => r.kpis);
      if (kpis.length > 0) {
        lines.push(`Known KPI fields: ${kpis.join(', ')}`);
      }
    }

    lines.push('');
  }

  // Optional: catalog_reports / catalog_datasets enrichment
  try {
    const [reportRows, datasetRows] = await Promise.all([
      runQueryWithMeta(`SELECT report_name, domain, key_kpis FROM \`${qualifiedTable('catalog_reports')}\``).then(r => r.rows),
      runQueryWithMeta(`SELECT dataset_name, domain, key_fields FROM \`${qualifiedTable('catalog_datasets')}\``).then(r => r.rows),
    ]);

    if (reportRows.length > 0) {
      lines.push('---');
      lines.push('');
      lines.push('## Catalog Reports (BQ metadata)');
      lines.push('');
      for (const r of reportRows) {
        const kpis = (r.key_kpis ?? []).map((k: any) => k.kpi_name).filter(Boolean).join(', ');
        lines.push(`- **${r.report_name}** [${r.domain}]${kpis ? ` — KPIs: ${kpis}` : ''}`);
      }
      lines.push('');
    }

    if (datasetRows.length > 0) {
      lines.push('## Catalog Datasets (BQ metadata)');
      lines.push('');
      for (const d of datasetRows) {
        const fields = (d.key_fields ?? []).map((f: any) => f.field_name).filter(Boolean).join(', ');
        lines.push(`- **${d.dataset_name}** [${d.domain}]${fields ? ` — Fields: ${fields}` : ''}`);
      }
      lines.push('');
    }
  } catch {
    console.warn('[CatalogRefresher] catalog_reports/catalog_datasets unavailable — skipping enrichment');
  }

  const content = lines.join('\n');
  await fs.mkdir(path.dirname(CATALOG_PATH), { recursive: true });
  await fs.writeFile(CATALOG_PATH, content, 'utf-8');
  console.log(`[CatalogRefresher] Written ${content.length} chars to ${CATALOG_PATH}`);
}

// ── Context loader (used by llmHandler) ──────────────────────────────────────

let _cachedContext: string | null = null;
let _cachedAt = 0;

export async function loadCatalogContext(): Promise<string | null> {
  // Return in-memory cache if fresh (< 25 hours)
  if (_cachedContext && Date.now() - _cachedAt < STALE_THRESHOLD_MS) {
    return _cachedContext;
  }

  try {
    const stat = await fs.stat(CATALOG_PATH);
    const ageMs = Date.now() - stat.mtimeMs;

    if (ageMs > STALE_THRESHOLD_MS) {
      console.log('[CatalogRefresher] Catalog stale — triggering background refresh');
      refreshCatalog()
        .then(() => {
          _cachedContext = null; // bust in-memory cache so next call re-reads
        })
        .catch(err => console.error('[CatalogRefresher] Background refresh failed:', err));
    }

    const content = await fs.readFile(CATALOG_PATH, 'utf-8');
    _cachedContext = content;
    _cachedAt = Date.now();
    return content;
  } catch {
    // File doesn't exist yet — kick off first refresh in background
    console.warn('[CatalogRefresher] catalog_context.md not found — triggering initial refresh');
    refreshCatalog().catch(err => console.error('[CatalogRefresher] Initial refresh failed:', err));
    return null;
  }
}
