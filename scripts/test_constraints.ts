import assert from 'node:assert/strict';
import { deriveConstraints, classifyShape } from '../backend/src/services/componentSelector';
import { COMPONENT_REGISTRY } from '../backend/src/registry/componentRegistry';
import {
  recordConstraints, getConstraintMetrics, getConstraintSummary, resetConstraintMetrics,
} from '../backend/src/services/constraintTelemetry';

let passed = 0;
const t = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e: any) { console.error(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
};

const shape = (o: Partial<any>): any => ({
  rowCount: 20, columnCount: 3, columnTypes: {}, dimensionColumns: ['territory'],
  measureColumns: ['revenue'], isTimeSeries: false, cardinality: {}, data: [], ...o,
});
const timeSeries   = shape({ isTimeSeries: true, timeColumn: 'month', dimensionColumns: ['month'], columnCount: 3 });
const singleValue  = shape({ rowCount: 1, columnCount: 2 });
const categorical  = shape({ rowCount: 20, measureColumns: ['revenue', 'take_rate'] });
const wide         = shape({ rowCount: 30, columnCount: 10, measureColumns: ['a','b','c','d','e','f','g','h'] });
const allTypes = new Set(COMPONENT_REGISTRY.map(c => c.type));

console.log('classifyShape');
t('time series -> time_series', () => assert.equal(classifyShape(timeSeries), 'time_series'));
t('one row -> single_value', () => assert.equal(classifyShape(singleValue), 'single_value'));
t('dim+measure -> categorical', () => assert.equal(classifyShape(categorical), 'categorical'));
t('many columns -> wide_table', () => assert.equal(classifyShape(wide), 'wide_table'));
t('empty -> unknown', () => assert.equal(classifyShape(shape({ rowCount: 0 })), 'unknown'));

console.log('deriveConstraints — mapping rules');
t('single_chart + time_series -> LineChart/AreaChart, not BarChart', () => {
  const c = deriveConstraints('single_chart', timeSeries);
  assert.ok(c.allowedComponents.includes('LineChart'));
  assert.ok(c.allowedComponents.includes('AreaChart'));
  assert.ok(!c.allowedComponents.includes('BarChart'));
  assert.equal(c.maxCards, 3);
  assert.deepEqual(c.primaryRequirement, { family: 'chart', min: 1, max: 1 });
  assert.equal(c.shapeKind, 'time_series');
});
t('single_metric + single_value -> KPI/StatDelta', () => {
  const c = deriveConstraints('single_metric', singleValue);
  assert.ok(c.allowedComponents.includes('KPI'));
  assert.ok(c.allowedComponents.includes('StatDelta'));
  assert.equal(c.maxCards, 1);
  assert.equal(c.primaryRequirement.family, 'metric');
});
t('comparison_dashboard + categorical -> BarChart/RankedList, not LineChart', () => {
  const c = deriveConstraints('comparison_dashboard', categorical);
  assert.ok(c.allowedComponents.includes('BarChart'));
  assert.ok(c.allowedComponents.includes('RankedList'));
  assert.ok(!c.allowedComponents.includes('LineChart')); // requiresTimeSeries + not categorical chart
  assert.equal(c.maxCards, 5);
});
t('table mode -> only table family', () => {
  const c = deriveConstraints('table', wide);
  assert.deepEqual(c.allowedFamilies, ['table']);
  assert.ok(c.allowedComponents.every(x => ['Table', 'GenerativeTable', 'PivotTable'].includes(x)));
  assert.equal(c.maxCards, 1);
});
t('narrative mode -> narrative + metric families, no charts', () => {
  const c = deriveConstraints('narrative', categorical);
  assert.deepEqual(c.allowedFamilies, ['narrative', 'metric']);
  assert.ok(!c.allowedComponents.includes('BarChart'));
});
t('qa_answer -> empty, maxCards 0', () => {
  const c = deriveConstraints('qa_answer', categorical);
  assert.deepEqual(c.allowedComponents, []);
  assert.equal(c.maxCards, 0);
});
t('full_dashboard -> spans families, maxCards 5, no primary', () => {
  const c = deriveConstraints('full_dashboard', categorical);
  assert.equal(c.maxCards, 5);
  assert.equal(c.primaryRequirement.family, null);
  assert.ok(c.allowedComponents.length > 3);
});

console.log('deriveConstraints — invariants');
t('allowedComponents are always real registry types', () => {
  for (const mode of ['single_metric','single_chart','table','narrative','comparison_dashboard','full_dashboard','qa_answer'] as const) {
    for (const s of [timeSeries, singleValue, categorical, wide]) {
      deriveConstraints(mode, s).allowedComponents.forEach(x => assert.ok(allTypes.has(x), `${x} not in registry`));
    }
  }
});
t('LineChart excluded whenever shape is not time series', () => {
  for (const s of [singleValue, categorical, wide]) {
    assert.ok(!deriveConstraints('full_dashboard', s).allowedComponents.includes('LineChart'));
  }
});
t('unknown shape is permissive for charts', () => {
  const c = deriveConstraints('comparison_dashboard', shape({ rowCount: 5, dimensionColumns: [], measureColumns: [] }));
  assert.equal(c.shapeKind, 'unknown');
  assert.ok(c.allowedComponents.includes('BarChart'));
});

console.log('telemetry');
t('recordConstraints accumulates + summarizes', () => {
  resetConstraintMetrics();
  recordConstraints(deriveConstraints('single_chart', timeSeries), 'gemma');
  recordConstraints(deriveConstraints('comparison_dashboard', categorical), 'sonnet');
  const m = getConstraintMetrics();
  assert.equal(m.total, 2);
  assert.equal(m.byShapeKind['time_series'], 1);
  assert.equal(m.byShapeKind['categorical'], 1);
  assert.equal(m.byMaxCards['3'], 1);
  assert.equal(m.byMaxCards['5'], 1);
  const s = getConstraintSummary();
  assert.ok(s.avgAllowedComponents > 0);
});
t('reset clears everything', () => {
  resetConstraintMetrics();
  assert.equal(getConstraintMetrics().total, 0);
});

console.log(`\n${passed} passed.`);
