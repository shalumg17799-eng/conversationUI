// Run: cd backend && node_modules/.bin/ts-node --transpile-only --project ../scripts/tsconfig.json ../scripts/test_dataShape.ts
import assert from 'node:assert/strict';
import { analyzeDataShape } from '../backend/src/services/dataShapeAnalyzer';
import { classifyShape } from '../backend/src/services/componentSelector'; // read-only import to confirm shapeKind

// NOTE: measures use decimal / repeated values so they are not mistaken for surrogate keys
// by the pre-existing isIdColumn "all-integer & unique-per-row" heuristic (unrelated to this fix).

let passed = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  try { await fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e: any) { console.error(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
}

async function main() {
  console.log('surrogate date keys → datetime + timeColumn');

  await t('month_id (202404) → isTimeSeries, timeColumn=month_id', async () => {
    const s = await analyzeDataShape([
      { month_id: 202401, territory: 'T-1', revenue: 100.5 },
      { month_id: 202402, territory: 'T-1', revenue: 120.25 },
      { month_id: 202403, territory: 'T-1', revenue: 140.75 },
    ]);
    assert.equal(s.isTimeSeries, true);
    assert.equal(s.timeColumn, 'month_id');
    assert.equal(s.columnTypes.month_id, 'datetime');
    assert.ok(!s.measureColumns.includes('month_id'));   // not treated as a metric
    assert.ok(s.measureColumns.includes('revenue'));     // real measure unaffected
  });

  await t('week_id → datetime, timeColumn=week_id', async () => {
    const s = await analyzeDataShape([
      { week_id: 202415, revenue: 10.5 },
      { week_id: 202416, revenue: 12.5 },
    ]);
    assert.equal(s.isTimeSeries, true);
    assert.equal(s.timeColumn, 'week_id');
    assert.equal(s.columnTypes.week_id, 'datetime');
  });

  await t('fiscal_period → datetime, timeColumn=fiscal_period', async () => {
    const s = await analyzeDataShape([
      { fiscal_period: 202401, sales: 5.1 },
      { fiscal_period: 202402, sales: 7.9 },
    ]);
    assert.equal(s.isTimeSeries, true);
    assert.equal(s.timeColumn, 'fiscal_period');
    assert.equal(s.columnTypes.fiscal_period, 'datetime');
  });

  await t('real ISO date string → datetime (unchanged behavior)', async () => {
    const s = await analyzeDataShape([
      { date: '2024-04-01', revenue: 100.5 },
      { date: '2024-04-02', revenue: 110.25 },
    ]);
    assert.equal(s.isTimeSeries, true);
    assert.equal(s.timeColumn, 'date');
    assert.equal(s.columnTypes.date, 'datetime');
    assert.ok(s.measureColumns.includes('revenue'));
  });

  console.log('classifyShape flips wide_table → time_series');
  await t('wide dataset with month_id classifies as time_series', async () => {
    const s = await analyzeDataShape([
      { month_id: 202401, a: 1.1, b: 2.2, c: 3.3, d: 4.4, e: 5.5, f: 6.6, g: 7.7 },
      { month_id: 202402, a: 2.1, b: 3.2, c: 4.3, d: 5.4, e: 6.5, f: 7.6, g: 8.7 },
    ]);
    assert.equal(s.columnCount > 6, true);      // would have been wide_table before
    assert.equal(classifyShape(s), 'time_series');
  });

  console.log('no false positives on plain numeric metrics');
  await t('6-digit metric with invalid month (999999) stays numeric', async () => {
    const s = await analyzeDataShape([
      { territory: 'T-1', big_metric: 999999 },
      { territory: 'T-2', big_metric: 999999 },
      { territory: 'T-3', big_metric: 888888 },
    ]);
    assert.equal(s.isTimeSeries, false);
    assert.equal(s.columnTypes.big_metric, 'numeric');
    assert.ok(s.measureColumns.includes('big_metric'));
  });

  console.log(`\n${passed} passed.`);
}

main();
