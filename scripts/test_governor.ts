import assert from 'node:assert/strict';
import { deriveConstraints } from '../backend/src/services/componentSelector';
import {
  governReport, governorMode, applyGovernance, generateGovernedFallback,
} from '../backend/src/services/governor';
import {
  recordGovernor, getGovernorSummary, resetGovernorMetrics,
} from '../backend/src/services/governorTelemetry';

let passed = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e: any) { console.error(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
}

const shape = (o: Partial<any> = {}): any => ({
  rowCount: 20, columnCount: 3, columnTypes: {}, dimensionColumns: ['territory'],
  measureColumns: ['revenue'], isTimeSeries: false, cardinality: {}, data: [], ...o,
});
const timeSeries = shape({ isTimeSeries: true, timeColumn: 'month', dimensionColumns: ['month'] });
const single = shape({ rowCount: 1, columnCount: 2 });
const categorical = shape({ measureColumns: ['revenue', 'take_rate'] });
const wide = shape({ columnCount: 10, measureColumns: ['a','b','c','d','e','f','g','h'] });

const C = {
  singleChart: deriveConstraints('single_chart', timeSeries),
  singleMetric: deriveConstraints('single_metric', single),
  table: deriveConstraints('table', wide),
  narrative: deriveConstraints('narrative', categorical),
  comparison: deriveConstraints('comparison_dashboard', categorical),
  full: deriveConstraints('full_dashboard', categorical),
};

const types = (cards: any[]) => cards.map(c => c.renderType);

async function main() {
  console.log('governorMode (env flag)');
  await t('default off', () => { delete process.env.ENABLE_GOVERNOR; assert.equal(governorMode(), 'off'); });
  await t('shadow', () => { process.env.ENABLE_GOVERNOR = 'shadow'; assert.equal(governorMode(), 'shadow'); });
  await t('enforce', () => { process.env.ENABLE_GOVERNOR = 'enforce'; assert.equal(governorMode(), 'enforce'); });
  await t('invalid -> off', () => { process.env.ENABLE_GOVERNOR = 'garbage'; assert.equal(governorMode(), 'off'); });
  delete process.env.ENABLE_GOVERNOR;

  console.log('applyGovernance — trimming logic');
  await t('single_chart: caps to 1 chart, keeps KPI', () => {
    const { kept, decisions } = applyGovernance([
      { renderType: 'LineChart', props: { xKey: 'month', yKey: 'revenue' } },
      { renderType: 'AreaChart', props: { xKey: 'month', yKey: 'revenue' } },
      { renderType: 'KPICard', props: { title: 'R', value: 1 } },
    ] as any, C.singleChart);
    assert.deepEqual(types(kept), ['LineChart', 'KPICard']);
    assert.ok(decisions.some(d => d.action === 'primary_cap' && d.component === 'AreaChart'));
  });
  await t('single_chart: drops table (component_not_allowed)', () => {
    const { kept } = applyGovernance([
      { renderType: 'LineChart', props: { xKey: 'month', yKey: 'revenue' } },
      { renderType: 'Table', props: { columns: ['a'] } },
    ] as any, C.singleChart);
    assert.deepEqual(types(kept), ['LineChart']);
  });
  await t('single_metric: exactly 1 metric', () => {
    const { kept } = applyGovernance([
      { renderType: 'KPICard', props: { title: 'R', value: 1 } },
      { renderType: 'StatDelta', props: { title: 'R', current: 1, previous: 0 } },
    ] as any, C.singleMetric);
    assert.deepEqual(types(kept), ['KPICard']);
  });
  await t('table: table components only', () => {
    const { kept } = applyGovernance([
      { renderType: 'Table', props: { columns: ['a'] } },
      { renderType: 'BarChart', props: { xKey: 'a', yKey: 'b' } },
    ] as any, C.table);
    assert.deepEqual(types(kept), ['Table']);
  });
  await t('comparison_dashboard: trims to maxCards 5', () => {
    const six = Array.from({ length: 6 }, () => ({ renderType: 'KPICard', props: { title: 'x', value: 1 } }));
    const { kept, decisions } = applyGovernance(six as any, C.comparison);
    assert.equal(kept.length, 5);
    assert.ok(decisions.some(d => d.action === 'trim_budget'));
  });
  await t('full_dashboard: passthrough (no restrictions)', () => {
    const seven = Array.from({ length: 7 }, () => ({ renderType: 'BarChart', props: { xKey: 'a', yKey: 'b' } }));
    const { kept, decisions } = applyGovernance(seven as any, C.full);
    assert.equal(kept.length, 7);
    assert.equal(decisions.length, 0);
  });

  console.log('generateGovernedFallback — obeys outputMode');
  await t('single_chart -> a chart', () => {
    const fb = generateGovernedFallback(timeSeries, C.singleChart);
    assert.ok(['LineChart', 'AreaChart'].includes(fb[0].renderType));
  });
  await t('single_metric -> KPICard', () => assert.equal(generateGovernedFallback(single, C.singleMetric)[0].renderType, 'KPICard'));
  await t('table -> Table', () => assert.equal(generateGovernedFallback(wide, C.table)[0].renderType, 'Table'));
  await t('narrative -> SummaryText', () => assert.equal(generateGovernedFallback(categorical, C.narrative)[0].renderType, 'SummaryText'));

  console.log('governReport — modes');
  const twoCharts = [
    { renderType: 'LineChart', props: { xKey: 'month', yKey: 'revenue' } },
    { renderType: 'AreaChart', props: { xKey: 'month', yKey: 'revenue' } },
  ];
  const noop = { regenerate: async () => [], fallback: () => [] };
  await t('off: output unchanged', async () => {
    const o = await governReport({ cards: twoCharts as any, constraints: C.singleChart, shape: timeSeries, provider: 'gemma', mode: 'off', ...noop });
    assert.deepEqual(types(o.cards), ['LineChart', 'AreaChart']);
    assert.equal(o.changed, false);
  });
  await t('shadow: logs decisions but output unchanged', async () => {
    const o = await governReport({ cards: twoCharts as any, constraints: C.singleChart, shape: timeSeries, provider: 'gemma', mode: 'shadow', ...noop });
    assert.deepEqual(types(o.cards), ['LineChart', 'AreaChart']); // untouched
    assert.equal(o.changed, true);                                 // would have capped
    assert.ok(o.decisions.some(d => d.action === 'primary_cap'));
  });
  await t('enforce: modifies output', async () => {
    const o = await governReport({ cards: twoCharts as any, constraints: C.singleChart, shape: timeSeries, provider: 'gemma', mode: 'enforce', ...noop });
    assert.deepEqual(types(o.cards), ['LineChart']);
    assert.equal(o.changed, true);
  });

  console.log('governReport — retry + fallback');
  await t('enforce: structural failure retries once, uses valid retry', async () => {
    let called = 0;
    const o = await governReport({
      cards: [{ renderType: 'BarChart', props: { xKey: 'a' } }] as any, // missing yKey
      constraints: C.comparison, shape: categorical, provider: 'gemma', mode: 'enforce',
      regenerate: async () => { called++; return [{ renderType: 'BarChart', props: { xKey: 'a', yKey: 'b' } }] as any; },
      fallback: () => generateGovernedFallback(categorical, C.comparison),
    });
    assert.equal(called, 1);
    assert.equal(o.retried, true);
    assert.equal(o.usedFallback, false);
    assert.deepEqual(types(o.cards), ['BarChart']);
  });
  await t('enforce: retry still invalid -> fallback', async () => {
    const o = await governReport({
      cards: [{ renderType: 'BarChart', props: { xKey: 'a' } }] as any,
      constraints: C.comparison, shape: categorical, provider: 'gemma', mode: 'enforce',
      regenerate: async () => [{ renderType: 'BarChart', props: { xKey: 'a' } }] as any, // still missing yKey
      fallback: () => generateGovernedFallback(categorical, C.comparison),
    });
    assert.equal(o.usedFallback, true);
    assert.ok(o.cards.length > 0);
  });
  await t('enforce: governance empties -> fallback', async () => {
    const o = await governReport({
      cards: [{ renderType: 'BarChart', props: { xKey: 'a', yKey: 'b' } }] as any, // valid but wrong family for single_metric
      constraints: C.singleMetric, shape: single, provider: 'gemma', mode: 'enforce',
      regenerate: async () => [], fallback: () => generateGovernedFallback(single, C.singleMetric),
    });
    assert.equal(o.usedFallback, true);
    assert.equal(o.cards[0].renderType, 'KPICard');
  });

  console.log('applyGovernance — layout wrapper transparency');
  const childTypes = (card: any) => (card.children ?? []).map((ch: any) => ch.renderType);
  await t('single_chart: TwoColumn[KPICard, LineChart] → wrapper kept, both children kept', () => {
    const { kept, decisions } = applyGovernance([
      { renderType: 'TwoColumn', props: {}, children: [
        { renderType: 'KPICard', props: { title: 'R', value: 1 } },
        { renderType: 'LineChart', props: { xKey: 'month', yKey: 'revenue' } },
      ] },
    ] as any, C.singleChart);
    assert.equal(kept.length, 1);
    assert.equal(kept[0].renderType, 'TwoColumn');
    assert.deepEqual(childTypes(kept[0]), ['KPICard', 'LineChart']);
    assert.ok(decisions.some(d => d.action === 'layout_passthrough' && d.component === 'TwoColumn'));
  });
  await t('single_chart: TwoColumn[RankedList] (not allowed) → wrapper dropped, 0 children survive', () => {
    const { kept, decisions } = applyGovernance([
      { renderType: 'TwoColumn', props: {}, children: [
        { renderType: 'RankedList', props: { labelKey: 'territory', valueKey: 'revenue' } },
      ] },
    ] as any, C.singleChart);
    assert.equal(kept.length, 0);
    assert.ok(decisions.some(d => d.action === 'drop_card' && d.component === 'TwoColumn' && d.detail === 'layout_wrapper_empty'));
  });
  await t('Section behaves like TwoColumn (transparent)', () => {
    const { kept } = applyGovernance([
      { renderType: 'Section', props: { title: 'S' }, children: [
        { renderType: 'KPICard', props: { title: 'R', value: 1 } },
        { renderType: 'LineChart', props: { xKey: 'month', yKey: 'revenue' } },
      ] },
    ] as any, C.singleChart);
    assert.equal(kept.length, 1);
    assert.equal(kept[0].renderType, 'Section');
    assert.deepEqual(childTypes(kept[0]), ['KPICard', 'LineChart']);
  });
  await t('non-layout components unaffected (own-family evaluation)', () => {
    const { kept, decisions } = applyGovernance([
      { renderType: 'BarChart', props: { xKey: 'a', yKey: 'b' } },
      { renderType: 'KPIGrid', props: { metrics: [] } },
    ] as any, C.comparison);
    assert.deepEqual(types(kept), ['BarChart', 'KPIGrid']);
    assert.ok(!decisions.some(d => d.action === 'layout_passthrough'));
  });
  await t('layout_passthrough is observable in telemetry', async () => {
    resetGovernorMetrics();
    const o = await governReport({
      cards: [{ renderType: 'TwoColumn', props: {}, children: [
        { renderType: 'KPICard', props: { title: 'R', value: 1 } },
        { renderType: 'LineChart', props: { xKey: 'month', yKey: 'revenue' } },
      ] }] as any,
      constraints: C.singleChart, shape: timeSeries, provider: 'gemma', mode: 'enforce',
      regenerate: async () => [], fallback: () => [],
    });
    recordGovernor(o); // the pipeline records the outcome; mirror that here
    assert.equal(o.cards[0].renderType, 'TwoColumn');
    assert.equal((getGovernorSummary().byAction as any).layout_passthrough, 1);
  });

  console.log('telemetry');
  await t('recordGovernor accumulates', () => {
    resetGovernorMetrics();
    recordGovernor({ mode: 'enforce', cards: [], originalCount: 2, finalCount: 1, decisions: [{ action: 'primary_cap', detail: 'x', component: 'AreaChart' }], retried: false, usedFallback: false, changed: true });
    const s = getGovernorSummary();
    assert.equal(s.total, 1);
    assert.equal(s.changed, 1);
    assert.equal(s.byAction.primary_cap, 1);
    assert.ok(s.topDroppedComponents.some((c: any) => c.component === 'AreaChart'));
  });

  console.log(`\n${passed} passed.`);
}

main();
