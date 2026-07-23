import assert from 'node:assert/strict';
import {
  detectLayoutIntent,
  deterministicParse,
  validateLayoutDirective,
  parseLayoutDirective,
  buildAcknowledgment,
  LayoutDirective,
} from '../backend/src/services/layoutDirective';
import {
  recordLayoutDirective, getLayoutMetrics, resetLayoutMetrics,
} from '../backend/src/services/layoutDirectiveTelemetry';

let passed = 0;
const queue: Array<() => Promise<void>> = [];
const t = (name: string, fn: () => void | Promise<void>) => {
  queue.push(async () => {
    try { await fn(); passed++; console.log(`  ok  ${name}`); }
    catch (e: any) { console.error(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
  });
};

// ── Task 1 acceptance: a layout command is classified as a UI intent, NOT a new
//    report or a data edit. Data queries and report edits must NOT be classified
//    as layout intents. ───────────────────────────────────────────────────────
console.log('detectLayoutIntent — recognizes UI-personalization commands');
const LAYOUT_COMMANDS = [
  'move the right panel to the bottom',
  'put the report panel on the left',
  'hide the sidebar',
  'show the history panel',
  'collapse the left panel',
  'make the panel wider',
  'shrink the report panel',
  'use a compact layout',
  'make it more spacious',
  'increase the density',
  'dock the panel at the bottom',
  'hide the navigation rail',
];
for (const cmd of LAYOUT_COMMANDS) {
  t(`layout: "${cmd}"`, () => {
    assert.equal(detectLayoutIntent(cmd).isLayout, true, `expected layout intent for "${cmd}"`);
  });
}

console.log('detectLayoutIntent — does NOT steal data queries or report edits');
const NON_LAYOUT = [
  'show me revenue by region',
  'what were sales last quarter',
  'compare churn across territories',
  'hide the table',          // structural report edit — no surface noun
  'remove the revenue chart', // structural report edit
  'change to a line chart',   // structural report edit
  'give me a summary',
  'top 5 territories by revenue',
  'show the KPI section only',
];
for (const cmd of NON_LAYOUT) {
  t(`non-layout: "${cmd}"`, () => {
    assert.equal(detectLayoutIntent(cmd).isLayout, false, `"${cmd}" must NOT be a layout intent`);
  });
}

// ── Task 2 acceptance: directives validate against the schema; unsupported
//    operations are rejected with a clear response. ────────────────────────────
console.log('deterministicParse — produces correct typed directives');
t('move right panel to bottom', () => {
  assert.deepEqual(deterministicParse('move the right panel to the bottom'),
    [{ op: 'move', target: 'right_panel', position: 'bottom' }]);
});
t('hide the sidebar → left_panel hide', () => {
  assert.deepEqual(deterministicParse('hide the sidebar'),
    [{ op: 'toggle', target: 'left_panel', visibility: 'hide' }]);
});
t('make the panel wider → resize wide', () => {
  assert.deepEqual(deterministicParse('make the report panel wider'),
    [{ op: 'resize', target: 'right_panel', size: 'wide' }]);
});
t('compact layout → density compact', () => {
  assert.deepEqual(deterministicParse('use a compact layout'),
    [{ op: 'density', density: 'compact' }]);
});
t('hide the nav rail → nav_rail hide', () => {
  assert.deepEqual(deterministicParse('hide the navigation rail'),
    [{ op: 'toggle', target: 'nav_rail', visibility: 'hide' }]);
});

console.log('validateLayoutDirective — accepts valid, rejects unsupported with clear reason');
t('valid move directive passes', () => {
  const r = validateLayoutDirective({ op: 'move', target: 'right_panel', position: 'bottom' });
  assert.equal(r.valid, true);
});
t('unknown op rejected with clear reason', () => {
  const r = validateLayoutDirective({ op: 'rotate', target: 'right_panel' });
  assert.equal(r.valid, false);
  if (!r.valid) assert.match(r.reason, /unsupported operation "rotate"/);
});
t('invalid position value rejected with clear reason', () => {
  const r = validateLayoutDirective({ op: 'move', target: 'right_panel', position: 'diagonal' });
  assert.equal(r.valid, false);
  if (!r.valid) assert.match(r.reason, /invalid position/);
});
t('invalid target rejected with clear reason', () => {
  const r = validateLayoutDirective({ op: 'toggle', target: 'footer', visibility: 'hide' });
  assert.equal(r.valid, false);
  if (!r.valid) assert.match(r.reason, /invalid target/);
});
t('missing required field rejected', () => {
  const r = validateLayoutDirective({ op: 'move', target: 'right_panel' });
  assert.equal(r.valid, false);
  if (!r.valid) assert.match(r.reason, /missing required field "position"/);
});
t('unsupported extra field rejected', () => {
  const r = validateLayoutDirective({ op: 'density', density: 'compact', target: 'right_panel' });
  assert.equal(r.valid, false);
});
t('non-object rejected, never throws', () => {
  assert.doesNotThrow(() => validateLayoutDirective(null));
  assert.equal((validateLayoutDirective(null) as any).valid, false);
  assert.equal((validateLayoutDirective('nope') as any).valid, false);
});

console.log('parseLayoutDirective — deterministic path returns validated directives');
t('parse returns validated directives (no LLM needed)', async () => {
  const r = await parseLayoutDirective('move the right panel to the bottom');
  assert.equal(r.source, 'deterministic');
  assert.equal(r.directives.length, 1);
  assert.equal(r.rejected.length, 0);
  assert.deepEqual(r.directives[0], { op: 'move', target: 'right_panel', position: 'bottom' });
});

console.log('buildAcknowledgment — clear responses');
t('acknowledges applied directives', () => {
  const ack = buildAcknowledgment({
    directives: [{ op: 'move', target: 'right_panel', position: 'bottom' }],
    rejected: [], source: 'deterministic',
  });
  assert.match(ack, /Done/);
  assert.match(ack, /report panel to the bottom/);
});
t('clearly reports unsupported operation', () => {
  const ack = buildAcknowledgment({
    directives: [],
    rejected: [{ raw: { op: 'rotate' }, reason: 'unsupported operation "rotate" — allowed: move, toggle, resize, density' }],
    source: 'none',
  });
  assert.match(ack, /can't do that/i);
  assert.match(ack, /unsupported operation "rotate"/);
});

console.log('telemetry');
t('records applied + rejected', () => {
  resetLayoutMetrics();
  recordLayoutDirective({
    directives: [{ op: 'move', target: 'right_panel', position: 'bottom' } as LayoutDirective],
    rejected: [], source: 'deterministic',
  }, { query: 'move the right panel to the bottom', provider: 'gemma' });
  recordLayoutDirective({
    directives: [],
    rejected: [{ raw: {}, reason: 'unsupported operation "rotate"' }], source: 'none',
  }, { query: 'rotate the panel', provider: 'gemma' });
  const m = getLayoutMetrics();
  assert.equal(m.detected, 2);
  assert.equal(m.applied, 1);
  assert.equal(m.directivesApplied, 1);
  assert.equal(m.directivesRejected, 1);
  assert.equal(m.byOp.move, 1);
});

// Run all tests (sync + async) sequentially, then print the tally.
(async () => {
  for (const run of queue) await run();
  console.log(`\n${passed} passed.`);
})();
