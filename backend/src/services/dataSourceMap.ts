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

// ── Report angles ─────────────────────────────────────────────────────────────
// Multiple distinct reports per domain, each built from an available table. A single
// table can power many reports — the descriptive label drives what the LLM generates
// (e.g. "Take Rate by Territory" vs "Revenue Trend Over Time" from the same rows).
// Used by the Sonnet (client) flow to offer a real menu of reports per domain.
export interface ReportAngle {
  domain: string;
  label: string;   // shown as a clarification option AND fed into report generation
  table: string;   // must be an available table at runtime
}

export const REPORT_ANGLES: ReportAngle[] = [
  // Sales — all from the monthly rollup, different lenses
  { domain: 'Sales', label: 'Revenue Trend Over Time', table: 'fact_sug_monthly_rollup' },
  { domain: 'Sales', label: 'Take Rate by Territory', table: 'fact_sug_monthly_rollup' },
  { domain: 'Sales', label: 'Return Rate Analysis', table: 'fact_sug_monthly_rollup' },
  { domain: 'Sales', label: 'Top & Bottom Territories by Revenue', table: 'fact_sug_monthly_rollup' },

  // Network — spans its three tables
  { domain: 'Network', label: 'Churn & Retention Metrics', table: 'fact_sug_monthly_rollup' },
  { domain: 'Network', label: 'Network KPI Trends', table: 'fact_network_kpi_points' },
  { domain: 'Network', label: 'Signal Strength & Latency', table: 'fact_network_kpi_points' },
  { domain: 'Network', label: 'Dynamic Score Rankings', table: 'fact_dynamic_scores' },

  // Contact Center
  { domain: 'Contact Center', label: 'Agent Performance Overview', table: 'fact_contact_center_metrics' },
  { domain: 'Contact Center', label: 'Average Handle Time by Agent', table: 'fact_contact_center_metrics' },
  { domain: 'Contact Center', label: 'Box Close Rate Analysis', table: 'fact_contact_center_metrics' },

  // Customer Experience — retention lenses on the monthly rollup
  { domain: 'Customer Experience', label: 'RIS Score by Territory', table: 'fact_sug_monthly_rollup' },
  { domain: 'Customer Experience', label: 'Return Rate & Retention Trend', table: 'fact_sug_monthly_rollup' },
  { domain: 'Customer Experience', label: 'Customer Experience Health Scorecard', table: 'fact_sug_monthly_rollup' },
];

export function getAnglesByDomain(domain: string): ReportAngle[] {
  return REPORT_ANGLES.filter(a => a.domain.toLowerCase() === domain.toLowerCase());
}

// Find an angle the user explicitly named/selected (exact label match, case-insensitive,
// or the label appearing verbatim in the query). Returns all matches.
export function findAnglesByLabel(texts: string[]): ReportAngle[] {
  const lc = texts.map(t => t.trim().toLowerCase());
  return REPORT_ANGLES.filter(a => {
    const label = a.label.toLowerCase();
    return lc.some(t => t === label || t.includes(label));
  });
}

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
