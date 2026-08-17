import assert from 'node:assert/strict';
import { resolveOutputMode } from '../backend/src/services/outputMode';
import {
  recordOutputMode, getOutputModeMetrics, getOutputModeSummary, resetOutputModeMetrics,
} from '../backend/src/services/outputModeTelemetry';
import { deriveConstraints } from '../backend/src/services/componentSelector';
import { ShapeSignature } from '../backend/src/types';

let passed = 0;
const t = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e: any) { console.error(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
};

console.log('resolveOutputMode — deterministic fallback');
t('trend -> single_chart', () => {
  const d = resolveOutputMode({ query: 'revenue by month', intent: 'trend' });
  assert.equal(d.outputMode, 'single_chart'); assert.equal(d.source, 'fallback');
});
t('comparison -> comparison_dashboard', () => {
  assert.equal(resolveOutputMode({ query: 'x', intent: 'comparison' }).outputMode, 'comparison_dashboard');
});
t('metric_by_dimension -> comparison_dashboard', () => {
  assert.equal(resolveOutputMode({ query: 'x', intent: 'metric_by_dimension' }).outputMode, 'comparison_dashboard');
});
t('unknown intent -> full_dashboard (permissive default)', () => {
  assert.equal(resolveOutputMode({ query: 'x', intent: 'weird' }).outputMode, 'full_dashboard');
});

console.log('resolveOutputMode — keyword overrides');
t('summarize -> narrative', () => {
  const d = resolveOutputMode({ query: 'summarize churn', intent: 'trend' });
  assert.equal(d.outputMode, 'narrative'); assert.equal(d.source, 'override');
});
t('why -> narrative', () => {
  assert.equal(resolveOutputMode({ query: 'why did revenue drop', intent: 'trend' }).outputMode, 'narrative');
});
t('list/table/rows -> table', () => {
  assert.equal(resolveOutputMode({ query: 'show me the list of outlets', intent: 'comparison' }).outputMode, 'table');
  assert.equal(resolveOutputMode({ query: 'raw rows please', intent: 'trend' }).outputMode, 'table');
});
t('full report -> full_dashboard', () => {
  assert.equal(resolveOutputMode({ query: 'give me a full report', intent: 'trend' }).outputMode, 'full_dashboard');
});

console.log('resolveOutputMode — precedence + llm');
t('override BEATS a valid llm proposal', () => {
  const d = resolveOutputMode({ query: 'explain revenue', intent: 'trend', llmProposed: 'single_chart' });
  assert.equal(d.outputMode, 'narrative'); assert.equal(d.source, 'override');
});
t('valid llm proposal wins over fallback', () => {
  const d = resolveOutputMode({ query: 'revenue by region', intent: 'trend', llmProposed: 'single_metric' });
  assert.equal(d.outputMode, 'single_metric'); assert.equal(d.source, 'llm');
});
t('invalid llm value -> fallback + invalid flag', () => {
  const d = resolveOutputMode({ query: 'revenue by region', intent: 'trend', llmProposed: 'mega_chart' });
  assert.equal(d.outputMode, 'single_chart'); assert.equal(d.source, 'fallback');
  assert.equal(d.invalid, true); assert.equal(d.llmRaw, 'mega_chart');
});

console.log('resolveOutputMode — edge cases');
t('decision object is frozen (immutable token)', () => {
  const d = resolveOutputMode({ query: 'x', intent: 'trend' });
  assert.throws(() => { (d as any).outputMode = 'table'; });
});
t('empty query + unknown intent -> default, no throw', () => {
  const d = resolveOutputMode({ query: '', intent: '' });
  assert.equal(d.outputMode, 'full_dashboard'); assert.equal(d.source, 'fallback');
});
t('null/undefined llmProposed -> fallback (not invalid)', () => {
  const d = resolveOutputMode({ query: 'x', intent: 'trend', llmProposed: null });
  assert.equal(d.source, 'fallback'); assert.notEqual(d.invalid, true);
});

console.log('drawing intent — artifact modes');
t('an explicit draw request resolves to narrative, not the data-intent default', () => {
  // REGRESSION. A drawing request routes to a table, so it inherits a DATA intent
  // (metric_by_dimension → comparison_dashboard). That mode's families are
  // metric/chart/table, so deriveConstraints stripped mermaid-artifact out of
  // allowedComponents and the model answered "show me the data lineage for take rate"
  // with a PARAGRAPH DESCRIBING a diagram. narrative is the mode that admits artifacts.
  const d = resolveOutputMode({ query: 'show me the data lineage for take rate', intent: 'metric_by_dimension', drawIntent: 'svg' });
  assert.equal(d.outputMode, 'narrative');
  assert.equal(d.source, 'override');
});

t('draw intent outranks an incidental keyword override', () => {
  // "list"/"table" elsewhere in the sentence must not demote an explicit draw request
  // to table mode, which allows no artifact at all.
  const d = resolveOutputMode({ query: 'draw the escalation flow and list the teams', intent: 'metric_by_dimension', drawIntent: 'svg' });
  assert.equal(d.outputMode, 'narrative', 'keyword override beat the draw intent');
});

t('draw intent outranks even a valid LLM proposal', () => {
  const d = resolveOutputMode({ query: 'draw the lineage', intent: 'trend', llmProposed: 'single_chart', drawIntent: 'svg' });
  assert.equal(d.outputMode, 'narrative');
});

t('a document request also takes the artifact-capable mode', () => {
  assert.equal(resolveOutputMode({ query: 'write me a one-pager', intent: 'trend', drawIntent: 'html' }).outputMode, 'narrative');
});

t('absent draw intent leaves the existing precedence untouched', () => {
  // The guard that keeps this change additive: every pre-existing path must be
  // byte-identical when drawIntent is null/undefined.
  for (const draw of [null, undefined]) {
    assert.equal(resolveOutputMode({ query: 'revenue by region', intent: 'metric_by_dimension', drawIntent: draw }).outputMode, 'comparison_dashboard');
    assert.equal(resolveOutputMode({ query: 'summarize revenue', intent: 'trend', drawIntent: draw }).outputMode, 'narrative');
    assert.equal(resolveOutputMode({ query: 'revenue trend', intent: 'trend', drawIntent: draw }).outputMode, 'single_chart');
    assert.equal(resolveOutputMode({ query: 'show rows', intent: 'trend', drawIntent: draw }).outputMode, 'table');
  }
});

t('narrative mode actually admits the artifact components', () => {
  // The other half of the bug: resolving to narrative is only useful if the
  // constraint layer then offers mermaid-artifact to the model.
  const shape: ShapeSignature = {
    rowCount: 100, columnCount: 5, isTimeSeries: true, timeColumn: 'date',
    dimensionColumns: ['territory_id'], measureColumns: ['units_sold'],
  } as ShapeSignature;
  const c = deriveConstraints('narrative', shape);
  assert.ok(c.allowedComponents.includes('mermaid-artifact'), c.allowedComponents.join(','));
  // ...and the mode that a drawing request used to land in still does NOT, which is
  // precisely why the override above is required rather than cosmetic.
  const bad = deriveConstraints('comparison_dashboard', shape);
  assert.ok(!bad.allowedComponents.includes('mermaid-artifact'), 'comparison_dashboard unexpectedly allows mermaid-artifact');
});

console.log('telemetry');
t('counts distribution, sources, invalid', () => {
  resetOutputModeMetrics();
  recordOutputMode(resolveOutputMode({ query: 'summarize x', intent: 'trend' }), { query: 'summarize x', provider: 'gemma' });
  recordOutputMode(resolveOutputMode({ query: 'trend x', intent: 'trend' }), { query: 'trend x', provider: 'sonnet' });
  recordOutputMode(resolveOutputMode({ query: 'x', intent: 'trend', llmProposed: 'bad' }), { query: 'x', provider: 'gemma' });
  const m = getOutputModeMetrics();
  assert.equal(m.total, 3);
  assert.equal(m.bySource.override, 1);
  assert.equal(m.bySource.fallback, 2);
  assert.equal(m.invalid, 1);
  assert.equal(m.byMode['narrative'], 1);
  assert.equal(m.byMode['single_chart'], 2);
  assert.equal(m.invalidValues['bad'], 1);
});
t('summary derives rates', () => {
  const s = getOutputModeSummary();
  assert.equal(s.total, 3);
  assert.equal(s.overrideRate, +(1 / 3).toFixed(4));
  assert.equal(s.fallbackRate, +(2 / 3).toFixed(4));
  assert.equal(s.invalidRate, +(1 / 3).toFixed(4));
});
t('reset clears everything', () => {
  resetOutputModeMetrics();
  const m = getOutputModeMetrics();
  assert.equal(m.total, 0);
  assert.deepEqual(m.bySource, { llm: 0, override: 0, fallback: 0 });
});

console.log(`\n${passed} passed.`);
