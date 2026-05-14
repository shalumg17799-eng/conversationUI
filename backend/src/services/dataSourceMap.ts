export interface DataSource {
  table: string;
  domain: string;
  reportName: string;
  description: string;
  kpis: string[];
  orderBy: string;
  limit?: number;
}

// Single source of truth: every entry here represents a real BQ table with data.
// Clarification options and query routing both derive from this list — nothing else.
export const DATA_SOURCES: DataSource[] = [
  {
    table: 'fact_sug_monthly_rollup',
    domain: 'Sales',
    reportName: 'Monthly Revenue & Take Rate',
    description: 'Monthly territory revenue, take rate, run rate and return rate',
    kpis: ['SUG Revenue', 'Run Rate', 'Take Rate %', 'Return Rate %', 'AARD %', 'RIS %'],
    orderBy: 'month_id DESC',
    limit: 50,
  },
  {
    table: 'v_monthly_territory_performance',
    domain: 'Sales',
    reportName: 'Territory Performance Scorecard',
    description: 'Monthly performance scores and rankings by territory',
    kpis: ['Performance Score', 'Territory Rank', 'Revenue', 'Month'],
    orderBy: 'month_id DESC, territory_name',
    limit: 50,
  },
  {
    table: 'v_daily_sales_detail',
    domain: 'Sales',
    reportName: 'Daily Sales Detail',
    description: 'Day-level sales units and revenue by outlet',
    kpis: ['Units Sold', 'Revenue', 'Outlet', 'Date'],
    orderBy: 'date DESC, outlet_name',
    limit: 100,
  },
  {
    table: 'fact_sug_monthly_rollup',
    domain: 'Network',
    reportName: 'Churn & Retention Metrics',
    description: 'Monthly churn signals: return rate, RIS, AARD by territory',
    kpis: ['Return Rate %', 'RIS %', 'AARD %', 'Retention Index'],
    orderBy: 'month_id DESC',
    limit: 50,
  },
  {
    table: 'fact_network_kpi_points',
    domain: 'Network',
    reportName: 'Network KPI Trends',
    description: 'Time-series network performance KPI data points',
    kpis: ['Network KPI Score', 'Signal Strength', 'Outage Count', 'Latency'],
    orderBy: 'timestamp DESC',
    limit: 100,
  },
  {
    table: 'fact_dynamic_scores',
    domain: 'Network',
    reportName: 'Dynamic Score Rankings',
    description: 'Ranked performance scores across territories or outlets',
    kpis: ['Score', 'Rank', 'Performance Index'],
    orderBy: 'rank',
  },
  {
    table: 'fact_contact_center_metrics',
    domain: 'Contact Center',
    reportName: 'Agent Performance Report',
    description: 'Contact center agent metrics: handle time, close rate, transfers',
    kpis: ['Box Close %', 'AHT (sec)', 'Transfer %', 'Sales Time %', 'Status'],
    orderBy: 'status',
  },
  {
    table: 'fact_sug_monthly_rollup',
    domain: 'Customer Experience',
    reportName: 'Customer Retention Analysis',
    description: 'Monthly retention signals derived from return rate and RIS by territory',
    kpis: ['Return Rate %', 'RIS %', 'AARD %', 'Territory Revenue'],
    orderBy: 'month_id DESC',
    limit: 50,
  },
];

export const ALL_DOMAINS = [...new Set(DATA_SOURCES.map(ds => ds.domain))];

export const ALL_TABLES = [...new Set(DATA_SOURCES.map(ds => ds.table))];

export function getSourcesByDomain(domain: string): DataSource[] {
  return DATA_SOURCES.filter(ds => ds.domain.toLowerCase() === domain.toLowerCase());
}

export function getSourceByTable(table: string): DataSource | undefined {
  return DATA_SOURCES.find(ds => ds.table === table);
}

export function buildQuerySQL(source: DataSource, qualifyFn: (t: string) => string): string {
  let sql = `SELECT * FROM ${qualifyFn(source.table)} ORDER BY ${source.orderBy}`;
  if (source.limit) sql += ` LIMIT ${source.limit}`;
  return sql;
}

// Dimension columns to probe for entity matches per table.
// Only string-typed ID/name columns that users would reference in queries.
const TABLE_DIMENSION_COLS: Record<string, string[]> = {
  fact_sug_monthly_rollup:          ['territory_id'],
  fact_contact_center_metrics:      ['employee_id', 'employee_name', 'team', 'territory_id'],
  fact_dynamic_scores:              ['employee_id', 'employee_name'],
  fact_network_kpi_points:          ['site_id', 'region', 'status'],
  v_monthly_territory_performance:  ['territory_id', 'territory_name'],
  v_daily_sales_detail:             ['outlet_id', 'outlet_name'],
};

// Extract entity tokens from the query that match known dimension values.
// Returns { col, values[] } pairs ready for a WHERE clause.
export function extractQueryFilters(
  query: string,
  table: string,
): { col: string; values: string[] }[] {
  const cols = TABLE_DIMENSION_COLS[table];
  if (!cols?.length) return [];

  // Match patterns like: T-007, T007, agent names, region codes
  // Captures: hyphenated IDs (T-007), alphanumeric codes (T007), quoted strings
  const tokens = [
    ...query.matchAll(/["']([^"']+)["']/g),   // quoted strings
    ...query.matchAll(/\b([A-Z][A-Z0-9]*-[A-Z0-9]+)\b/gi), // hyphenated IDs: T-007, CC-01
    ...query.matchAll(/\b([A-Z]{1,3}[0-9]{2,4})\b/g),      // compact codes: T007, CC01
  ].map(m => m[1].trim()).filter(Boolean);

  if (!tokens.length) return [];

  // Group tokens by which column they likely belong to (heuristic: territory_id for T-xxx)
  const filters: { col: string; values: string[] }[] = [];
  for (const col of cols) {
    const matched = tokens.filter(t => {
      // territory_id / site_id: match T-xxx or T-xxx style
      if (col.includes('territory') || col.includes('site')) return /^[A-Z]-?\d+/i.test(t);
      // employee_id: match numeric or short alpha-numeric
      if (col.includes('employee_id')) return /^\d+$/.test(t);
      // name columns: match multi-word tokens (quoted)
      if (col.includes('name')) return t.includes(' ');
      return true;
    });
    if (matched.length) filters.push({ col, values: matched });
  }
  return filters;
}

// Build a filtered SQL query. Falls back to full table if no filters extracted.
export function buildFilteredSQL(
  source: DataSource,
  qualifyFn: (t: string) => string,
  query: string,
): { sql: string; isFiltered: boolean } {
  const filters = extractQueryFilters(query, source.table);

  if (!filters.length) {
    return { sql: buildQuerySQL(source, qualifyFn), isFiltered: false };
  }

  const whereClauses = filters.map(({ col, values }) => {
    const inList = values.map(v => `'${v.replace(/'/g, "''")}'`).join(', ');
    return `UPPER(${col}) IN (${inList.toUpperCase()})`;
  });

  const sql = `SELECT * FROM ${qualifyFn(source.table)} WHERE ${whereClauses.join(' OR ')} ORDER BY ${source.orderBy}`;
  return { sql, isFiltered: true };
}
