import assert from 'node:assert/strict';
import { resolveOutputMode } from '../backend/src/services/outputMode';
import {
  recordOutputMode, getOutputModeMetrics, getOutputModeSummary, resetOutputModeMetrics,
} from '../backend/src/services/outputModeTelemetry';

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
