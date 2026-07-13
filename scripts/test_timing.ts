// Parity guard for the scene-duration formula.
//
// The in-app preview (src/remotion/timing.ts) and the backend render
// (backend/src/services/sceneTiming.ts) each own a copy of sceneDurationFrames,
// because the two tsconfig roots can't share one module without reshaping the
// build output. This test fails the build if those copies ever drift apart —
// the exact desync class this whole fix addressed (preview and render disagreeing
// on how long a scene lasts).
//
// The frontend copy is ESM ("type":"module") and the backend copy is CJS, so a
// single ts-node process can't import both. Instead we:
//   1. value-pin the backend copy against a frozen reference table + sweep, and
//   2. assert the two SOURCE files are logically identical (comments/whitespace
//      stripped). Source-identity is stronger than sampled value comparison — it
//      proves the two produce the same frames for every input, not just the ones
//      we happened to test.
//
// Run: npm run test:timing   (from repo root)

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sceneDurationFrames, TAIL_PAD_SEC, MIN_SCENE_SEC } from '../backend/src/services/sceneTiming';

const ROOT = join(__dirname, '..');

let passed = 0;
function t(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e: any) { console.error(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
}

// Reduce a copy to just its executable logic: drop // comments (line + inline)
// and blank lines, trim each remaining line. The two files carry different header
// comments but must share identical code.
const logic = (src: string) =>
  src.replace(/\/\/.*$/gm, '').split('\n').map((l) => l.trim()).filter(Boolean).join('\n');

t('frontend and backend copies are logically identical', () => {
  const front = logic(readFileSync(join(ROOT, 'src/remotion/timing.ts'), 'utf8'));
  const back = logic(readFileSync(join(ROOT, 'backend/src/services/sceneTiming.ts'), 'utf8'));
  assert.equal(
    front, back,
    'src/remotion/timing.ts and backend/src/services/sceneTiming.ts have diverged.\n' +
    'Edit BOTH copies identically (constants + sceneDurationFrames).',
  );
});

t('constants are the expected values', () => {
  assert.equal(TAIL_PAD_SEC, 0.6);
  assert.equal(MIN_SCENE_SEC, 1.8);
});

// Frozen reference table @30fps — pins the actual output so a formula change
// (even applied to both copies) is a deliberate, reviewed edit, not a silent one.
t('reference table @30fps holds', () => {
  const expected: Array<[number, number]> = [
    [0, 54],       // floor (1.8s) dominates
    [500, 54],     // still under the floor
    [2000, 78],    // (2.0 + 0.6) * 30
    [3200, 114],   // (3.2 + 0.6) * 30
    [5000, 168],   // (5.0 + 0.6) * 30
    [9000, 288],   // (9.0 + 0.6) * 30
  ];
  for (const [ms, frames] of expected) {
    assert.equal(sceneDurationFrames(ms, 30), frames, `ms=${ms} expected ${frames} got ${sceneDurationFrames(ms, 30)}`);
  }
});

// Never below the floor, monotonic non-decreasing in audio length.
t('floor holds and output is monotonic', () => {
  const floor = Math.round(MIN_SCENE_SEC * 30);
  let prev = -1;
  for (let ms = 0; ms <= 20000; ms += 137) {
    const f = sceneDurationFrames(ms, 30);
    assert.ok(f >= floor, `below floor at ms=${ms}: ${f} < ${floor}`);
    assert.ok(f >= prev, `not monotonic at ms=${ms}: ${f} < ${prev}`);
    prev = f;
  }
});

console.log(`\n${passed} timing check(s) passed`);
if (process.exitCode) console.error('timing parity FAILED — the two sceneDurationFrames copies have diverged');
