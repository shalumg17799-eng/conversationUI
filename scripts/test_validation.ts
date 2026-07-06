import assert from 'node:assert/strict';
import { validateTree } from '../backend/src/services/uiValidator';
import {
  shadowValidateCards, getValidationSummary, getValidationMetrics, resetValidationMetrics,
} from '../backend/src/services/validationTelemetry';

let passed = 0;
const t = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e: any) { console.error(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
};

const cats = (cards: any[]) => validateTree(cards).violations.map(v => `${v.component}:${v.category}:${v.detail}`);

console.log('validateTree — happy path');
t('valid BarChart -> no violations', () => {
  assert.deepEqual(validateTree([{ renderType: 'BarChart', props: { xKey: 'a', yKey: 'b', data: [] } }]).violations, []);
});
t('valid nested TwoColumn -> no violations', () => {
  const tree = [{ renderType: 'TwoColumn', props: {}, children: [
    { renderType: 'KPICard', props: { title: 'X', value: 5 } },
    { renderType: 'KPICard', props: { title: 'Y', value: '5%' } },
  ] }];
  assert.deepEqual(validateTree(tree).violations, []);
});
t('nodeCount counts nested children', () => {
  const tree = [{ renderType: 'Section', props: {}, children: [{ renderType: 'BarChart', props: { xKey: 'a', yKey: 'b' } }] }];
  assert.equal(validateTree(tree).nodeCount, 2);
});

console.log('validateTree — violations');
t('unknown render type', () => {
  const c = cats([{ renderType: 'Wat', props: {} }]);
  assert.ok(c.includes('Wat:unknown_render_type:Wat'));
});
t('missing required prop', () => {
  const c = cats([{ renderType: 'BarChart', props: { xKey: 'a' } }]);
  assert.ok(c.some(x => x.startsWith('BarChart:missing_prop:yKey')));
});
t('invalid prop type', () => {
  const c = cats([{ renderType: 'BarChart', props: { xKey: 123, yKey: 'b' } }]);
  assert.ok(c.some(x => x.startsWith('BarChart:invalid_prop_type:xKey')));
});
t('invalid structure — props not object', () => {
  const c = cats([{ renderType: 'KPICard', props: 'nope' }]);
  assert.ok(c.some(x => x.startsWith('KPICard:invalid_structure')));
});
t('invalid structure — children not array', () => {
  const c = cats([{ renderType: 'Section', props: {}, children: 'nope' }]);
  assert.ok(c.some(x => x.startsWith('Section:invalid_structure')));
});
t('violation found inside nested child', () => {
  const c = cats([{ renderType: 'Section', props: {}, children: [{ renderType: 'BarChart', props: { xKey: 'a' } }] }]);
  assert.ok(c.some(x => x.startsWith('BarChart:missing_prop:yKey')));
});
t('node missing renderType', () => {
  const c = cats([{ props: {} } as any]);
  assert.ok(c.some(x => x.includes('invalid_structure')));
});

console.log('validateTree — never throws');
t('empty / malformed input returns result, no throw', () => {
  assert.doesNotThrow(() => validateTree([]));
  assert.doesNotThrow(() => validateTree([null as any, undefined as any]));
});

console.log('telemetry');
t('shadowValidateCards records + summarizes', () => {
  resetValidationMetrics();
  shadowValidateCards([{ renderType: 'BarChart', props: { xKey: 'a', yKey: 'b' } }], 'gemma'); // clean
  shadowValidateCards([{ renderType: 'BarChart', props: { xKey: 'a' } }, { renderType: 'Wat', props: {} }], 'sonnet'); // 2 violations
  const m = getValidationMetrics();
  assert.equal(m.totalValidated, 2);
  assert.equal(m.totalNodes, 3);
  assert.equal(m.totalViolations, 2);
  assert.equal(m.byCategory.missing_prop, 1);
  assert.equal(m.byCategory.unknown_render_type, 1);
});
t('summary exposes categories + top invalid components', () => {
  const s = getValidationSummary();
  assert.equal(s.totalValidated, 2);
  assert.equal(s.totalViolations, 2);
  assert.ok(s.topInvalidComponents.some((c: any) => c.component === 'BarChart'));
  assert.ok(s.topInvalidComponents.some((c: any) => c.component === 'Wat'));
});
t('shadowValidateCards never throws on bad input', () => {
  assert.doesNotThrow(() => shadowValidateCards(null as any, 'gemma'));
  assert.doesNotThrow(() => shadowValidateCards([{ bogus: true } as any], 'gemma'));
});
t('reset clears everything', () => {
  resetValidationMetrics();
  const m = getValidationMetrics();
  assert.equal(m.totalValidated, 0);
  assert.equal(m.totalViolations, 0);
});

console.log(`\n${passed} passed.`);
