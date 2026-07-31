// Create the two BigQuery views that DATA_SOURCES declares but the dataset lacks.
//   npm run bq:views          # create / replace
//   npm run bq:views -- --check   # report existence only, change nothing
//
// Both are VIEWS over existing base tables — no data is written, no table is dropped,
// and CREATE OR REPLACE VIEW is idempotent. Re-running is safe.
//
// Why these two exist at all: dataSourceMap.ts declares
// `v_monthly_territory_performance` and `v_daily_sales_detail` as routable sources,
// but neither object was ever created in report_hub_demo. The KAG builder therefore
// dropped both tables and the 2 reports backed by them, and 13 of the catalog's KPIs
// had no column to map to.

import { runQueryWithMeta, PROJECT_ID, DATASET } from '../backend/src/lib/bigqueryClient';

const q = (t: string) => `\`${PROJECT_ID}.${DATASET}.${t}\``;
const checkOnly = process.argv.includes('--check');

interface ViewDef { name: string; purpose: string; sql: string }

const VIEWS: ViewDef[] = [
  {
    name: 'v_monthly_territory_performance',
    purpose: 'Monthly performance scores and rankings by territory (Sales → "Territory Performance Scorecard")',
    // performance_score is a COMPOSITE we define here — the source data has no score
    // column at territory level. The formula is written out in full rather than hidden
    // in application code so it can be reviewed and changed by whoever owns the metric.
    //
    // Weights (demo-grade, not a signed-off business definition):
    //   take rate 35% ↑ · RIS 25% ↑ · return rate 25% ↓ · AARD 15% ↓
    // Each input is min-max normalised across the whole table, so the score is
    // relative to the dataset, not an absolute rating.
    sql: `
CREATE OR REPLACE VIEW ${q('v_monthly_territory_performance')} AS
WITH bounds AS (
  SELECT
    MIN(take_rate_pct)   AS min_take, MAX(take_rate_pct)   AS max_take,
    MIN(ris_pct)         AS min_ris,  MAX(ris_pct)         AS max_ris,
    MIN(return_rate_pct) AS min_ret,  MAX(return_rate_pct) AS max_ret,
    MIN(aard_pct)        AS min_aard, MAX(aard_pct)        AS max_aard
  FROM ${q('fact_sug_monthly_rollup')}
),
scored AS (
  SELECT
    f.month_id,
    f.month_name,
    f.territory_id,
    t.territory_name,
    t.market_id,
    f.sug_revenue AS revenue,
    f.run_rate,
    f.take_rate_pct,
    f.return_rate_pct,
    f.ris_pct,
    f.aard_pct,
    ROUND(100 * (
        0.35 *      SAFE_DIVIDE(f.take_rate_pct   - b.min_take, NULLIF(b.max_take - b.min_take, 0))
      + 0.25 *      SAFE_DIVIDE(f.ris_pct         - b.min_ris,  NULLIF(b.max_ris  - b.min_ris,  0))
      + 0.25 * (1 - SAFE_DIVIDE(f.return_rate_pct - b.min_ret,  NULLIF(b.max_ret  - b.min_ret,  0)))
      + 0.15 * (1 - SAFE_DIVIDE(f.aard_pct        - b.min_aard, NULLIF(b.max_aard - b.min_aard, 0)))
    ), 2) AS performance_score
  FROM ${q('fact_sug_monthly_rollup')} f
  LEFT JOIN ${q('dim_territories')} t USING (territory_id)
  CROSS JOIN bounds b
)
SELECT
  month_id,
  month_name,
  territory_id,
  territory_name,
  market_id,
  revenue,
  run_rate,
  take_rate_pct,
  return_rate_pct,
  ris_pct,
  aard_pct,
  performance_score,
  RANK() OVER (PARTITION BY month_id ORDER BY performance_score DESC) AS territory_rank
FROM scored`,
  },
  {
    name: 'v_daily_sales_detail',
    purpose: 'Day-level sales units and revenue by outlet (Sales → "Daily Sales Detail")',
    // Pure aggregation — no invented business logic. fact_sug_sales_daily is at
    // (date, outlet, device) grain; this rolls device up so the grain matches the
    // report's stated "day-level by outlet".
    sql: `
CREATE OR REPLACE VIEW ${q('v_daily_sales_detail')} AS
SELECT
  s.date_id,
  s.date,
  s.outlet_id,
  o.outlet_name,
  o.city,
  o.state,
  o.outlet_type,
  s.territory_id,
  t.territory_name,
  SUM(s.sug_sales_units)                        AS units_sold,
  SUM(s.eligible_device_units)                  AS eligible_device_units,
  SUM(s.sug_sales_revenue)                      AS sug_sales_revenue,
  SUM(s.accessory_revenue)                      AS accessory_revenue,
  SUM(s.sug_sales_revenue + s.accessory_revenue) AS revenue,
  SUM(s.return_units)                           AS return_units,
  ROUND(100 * SAFE_DIVIDE(SUM(s.return_units), NULLIF(SUM(s.sug_sales_units), 0)), 2) AS return_rate_pct
FROM ${q('fact_sug_sales_daily')} s
LEFT JOIN ${q('dim_outlets')}     o ON o.outlet_id    = s.outlet_id
LEFT JOIN ${q('dim_territories')} t ON t.territory_id = s.territory_id
GROUP BY
  s.date_id, s.date, s.outlet_id, o.outlet_name, o.city, o.state, o.outlet_type,
  s.territory_id, t.territory_name`,
  },
];

async function existing(): Promise<Set<string>> {
  const { rows } = await runQueryWithMeta(`
    SELECT table_name FROM \`${PROJECT_ID}.${DATASET}\`.INFORMATION_SCHEMA.TABLES`);
  return new Set(rows.map((r: any) => String(r.table_name)));
}

async function main() {
  console.log(`── BigQuery views — ${PROJECT_ID}.${DATASET} ──────────────`);
  const before = await existing();

  for (const v of VIEWS) {
    const present = before.has(v.name);
    if (checkOnly) {
      console.log(`  ${present ? '✅ exists ' : '❌ MISSING'} ${v.name}`);
      continue;
    }
    console.log(`\n${present ? 'Replacing' : 'Creating'} ${v.name} — ${v.purpose}`);
    await runQueryWithMeta(v.sql);
    console.log(`  ✅ ${v.name}`);
  }

  if (checkOnly) return;

  // Verify: the view must exist AND return rows. A view that parses but yields
  // nothing is as useless to the pipeline as a missing one.
  console.log('\n── Verification ────────────────────────────────────────');
  for (const v of VIEWS) {
    const { rows } = await runQueryWithMeta(`SELECT COUNT(*) AS n FROM ${q(v.name)}`);
    const n = Number(rows[0].n);
    const { rows: cols } = await runQueryWithMeta(`
      SELECT column_name, data_type FROM \`${PROJECT_ID}.${DATASET}\`.INFORMATION_SCHEMA.COLUMNS
      WHERE table_name = '${v.name}' ORDER BY ordinal_position`);
    console.log(`  ${v.name}: ${n} rows, ${cols.length} columns`);
    console.log(`    ${cols.map((c: any) => c.column_name).join(', ')}`);
    if (n === 0) console.warn(`  ⚠️  ${v.name} returned 0 rows — check the base tables`);
  }

  console.log('\nNext: npm run kag:build  (picks up the new columns and mappings)');
}

main().catch(e => { console.error('💥 bq:views failed:', e.message); process.exit(1); });
