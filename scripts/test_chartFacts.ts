// Guard for the chart fact-checker.
//
// The bug this pins: a report component carries BOTH authored prose
// (props.explanation) and a data array (props.data) describing the same numbers,
// and they can disagree. The video renders the ARRAY — the bars, the peak
// spotlight, the bullets and the narration all come from it — while the prose was
// shown verbatim as the slide's sub-heading AND fed to the narration writer. When
// the two disagreed the viewer read "T-003 carries the heaviest churn" on screen
// while hearing "territory twenty carries the steepest churn burden", and the
// writer blended both sources into single self-contradicting lines.
//
// auditChartProse drops prose the rendered data disproves. This test pins:
//   1. the frontend and backend copies stay logically identical,
//   2. the real desyncs observed in shipped renders are caught, and
//   3. honest copy (generic captions, truthful claims, rounding) is NOT dropped —
//      a fact-checker that flags everything would silently strip every slide.
//
// Run: npm run test:chartfacts   (from repo root)

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  auditChartProse, chartFacts, factLines, parseClaimNumber, findLabel,
  splitSentences, claimedValueFor, CLAIM_TOLERANCE, type FactChart,
} from '../backend/src/services/chartFacts';

const ROOT = join(__dirname, '..');

let passed = 0;
function t(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e: any) { console.error(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
}

// Same stripper test_timing.ts uses: drop // comments and blank lines, trim.
const logic = (src: string) =>
  src.replace(/\/\/.*$/gm, '').split('\n').map((l) => l.trim()).filter(Boolean).join('\n');

t('frontend and backend copies are logically identical', () => {
  const front = logic(readFileSync(join(ROOT, 'src/lib/chartFacts.ts'), 'utf8'));
  const back = logic(readFileSync(join(ROOT, 'backend/src/services/chartFacts.ts'), 'utf8'));
  assert.equal(
    front, back,
    'src/lib/chartFacts.ts and backend/src/services/chartFacts.ts have diverged.\n' +
    'Edit BOTH copies identically.',
  );
});

// ── the real charts, from shipped renders (backend/data/videos/*.script.json) ──

const AARD: FactChart = {
  labels: ['T-001', 'T-002', 'T-003', 'T-004', 'T-005', 'T-006', 'T-007', 'T-008', 'T-009', 'T-010',
           'T-011', 'T-012', 'T-013', 'T-014', 'T-015', 'T-016', 'T-017', 'T-018', 'T-019', 'T-020'],
  series: [{ name: 'aard_pct', values: [24.2, 26.48, 30.72, 25.28, 27.19, 27.57, 30.04, 30.23, 20.13, 24.6,
                                        27.35, 28.26, 22.68, 26.33, 27.2, 25.81, 26.03, 27.13, 26.85, 31.87] }],
};

const RETURN_RATE: FactChart = {
  labels: ['T-001', 'T-009', 'T-010', 'T-013', 'T-016', 'T-020'],
  series: [{ name: 'return_rate_pct', values: [3.23, 2.76, 3.16, 3.22, 3.38, 5.0] }],
};

const RUN_RATE: FactChart = {
  labels: ['T-002', 'T-008', 'T-010', 'T-017'],
  series: [{ name: 'run_rate', values: [12_500_000, 11_900_000, 9_500_000, 9_800_000] }],
};

const REVENUE: FactChart = {
  labels: ['T-014', 'T-016', 'T-017'],
  series: [{ name: 'suggested_revenue', values: [987_600, 512_300, 803_100] }],
};

t('chartFacts measures the peak/low the bullets and spotlight use', () => {
  const f = chartFacts(AARD)!;
  assert.equal(f.peakLabel, 'T-020');
  assert.equal(f.peakValue, 31.87);
  assert.equal(f.lowLabel, 'T-009');
  assert.equal(f.lowValue, 20.13);
  assert.equal(f.points, 20);
});

t('REGRESSION vid_mrc5k2pa_0 scene[2]: churn sub naming the wrong leader is caught', () => {
  const sub = 'T-003 (30.78%) and T-008 (30.7%) carry the heaviest churn burden. ' +
              'T-009 (21.61%) and T-001 (22.63%) are the strongest performers.';
  const audit = auditChartProse(sub, AARD);
  assert.equal(audit.ok, false, 'chart peaks at T-020; the sub credits T-003');
  assert.ok(audit.conflicts.some((c) => c.includes('T-020')), `expected a T-020 conflict, got ${JSON.stringify(audit.conflicts)}`);
});

t('REGRESSION vid_mrc5k2pa_0 scene[3]: "T-001 and T-016 are the healthiest" is caught by figures', () => {
  // "healthiest" is deliberately NOT a superlative keyword (direction-ambiguous),
  // so this one has to be caught by the attributed figures: the sub says T-001 is
  // 2.94 and T-016 is 3.08, but the chart renders 3.23 and 3.38. This is the line
  // that made the narration contradict itself in a single breath.
  const sub = 'T-003 (4.84%) and T-007 (4.66%) post the highest return rates. ' +
              'T-001 (2.94%) and T-016 (3.08%) are the healthiest.';
  const audit = auditChartProse(sub, RETURN_RATE);
  assert.equal(audit.ok, false);
  assert.ok(audit.conflicts.some((c) => c.includes('T-001')), `expected a T-001 figure conflict, got ${JSON.stringify(audit.conflicts)}`);
});

t('REGRESSION vid_mrxkepb5_3 scene[2]: "$12.9M" magnitude claim is compared correctly', () => {
  const audit = auditChartProse('T-008 leads at $12.9M; T-010 and T-017 are lowest at ~$9.5M–$9.8M.', RUN_RATE);
  assert.equal(audit.ok, false, 'chart peaks at T-002 (12.5M), not T-008');
});

t('REGRESSION vid_mrxj3rag_0 scene[2]: "T-017 leads; T-016 is lowest." is caught', () => {
  const audit = auditChartProse('All territories ranked by suggested revenue. T-017 leads; T-016 is lowest.', REVENUE);
  assert.equal(audit.ok, false, 'chart peaks at T-014, not T-017');
});

// ── false-positive guards: honest copy must survive ──────────────────────────

t('generic caption with superlatives but no labels is kept', () => {
  const audit = auditChartProse('All territories sorted from highest to lowest take rate percentage for April 2026.', AARD);
  assert.deepEqual(audit, { ok: true, conflicts: [] });
});

t('caption naming labels as a RANGE (not a claim) is kept', () => {
  const audit = auditChartProse(
    "Each bar represents a territory's contribution to total April suggested revenue, sorted T-001 through T-020.",
    AARD,
  );
  assert.equal(audit.ok, true, JSON.stringify(audit.conflicts));
});

t('truthful sub naming the real peak is kept', () => {
  const audit = auditChartProse('T-020 (31.87%) carries the heaviest churn burden; T-009 (20.13%) the lightest.', AARD);
  assert.equal(audit.ok, true, JSON.stringify(audit.conflicts));
});

t('rounding within tolerance is not a contradiction', () => {
  // 30.78 claimed vs 30.72 rendered = 0.2% — rounding, not a different number.
  const audit = auditChartProse('T-003 sits at 30.78%.', AARD);
  assert.equal(audit.ok, true, JSON.stringify(audit.conflicts));
  assert.equal(CLAIM_TOLERANCE, 0.02);
});

t('a figure beyond tolerance IS a contradiction', () => {
  // 21.61 claimed vs 20.13 rendered = 7.4%.
  const audit = auditChartProse('T-009 sits at 21.61%.', AARD);
  assert.equal(audit.ok, false);
});

t('multi-series charts are lenient — agreeing with ANY series passes', () => {
  const combo: FactChart = {
    labels: ['T-001', 'T-009'],
    series: [{ name: 'take', values: [60, 73.8] }, { name: 'ris', values: [80, 93.8] }],
  };
  assert.equal(auditChartProse('T-009 leads at 93.8%.', combo).ok, true);
  assert.equal(auditChartProse('T-001 leads at 60%.', combo).ok, false);
});

t('empty / missing prose or chart is never flagged', () => {
  assert.equal(auditChartProse('', AARD).ok, true);
  assert.equal(auditChartProse(undefined, AARD).ok, true);
  assert.equal(auditChartProse('T-003 leads.', null).ok, true);
  assert.equal(auditChartProse('T-003 leads.', { labels: [], series: [] }).ok, true);
  assert.equal(chartFacts(null), null);
  assert.deepEqual(factLines(null), []);
});

// ── primitives ────────────────────────────────────────────────────────────────

t('parseClaimNumber handles magnitude suffixes and units', () => {
  assert.equal(parseClaimNumber('30.78%'), 30.78);
  assert.equal(parseClaimNumber('$12.9M'), 12_900_000);
  assert.equal(parseClaimNumber('987.6K'), 987_600);
  assert.equal(parseClaimNumber('1.1B'), 1_100_000_000);
  assert.equal(parseClaimNumber('3 million'), 3_000_000);
  assert.equal(parseClaimNumber('-4.5'), -4.5);
  assert.ok(Number.isNaN(parseClaimNumber('none')));
});

t('findLabel respects token boundaries', () => {
  assert.equal(findLabel('T-009 leads', 'T-009'), 0);
  assert.ok(findLabel("T-009's advantage", 'T-009') >= 0);
  assert.ok(findLabel('(T-009)', 'T-009') >= 0);
  assert.equal(findLabel('T-0091 leads', 'T-009'), -1, 'must not match inside a longer id');
  assert.ok(findLabel('danielle wright leads', 'Danielle Wright') >= 0, 'case-insensitive');
});

t('splitSentences does not break decimals', () => {
  assert.deepEqual(
    splitSentences('T-003 (30.78%) is high. T-009 (20.13%) is low.'),
    ['T-003 (30.78%) is high', 'T-009 (20.13%) is low'],
  );
});

t('claimedValueFor does not cross-attribute figures between labels', () => {
  const s = 'T-003 (30.78%) and T-008 (30.7%) carry the heaviest burden';
  assert.equal(claimedValueFor(s, 'T-003', AARD.labels), 30.78);
  assert.equal(claimedValueFor(s, 'T-008', AARD.labels), 30.7);
  // A bare year is not a data claim.
  assert.equal(claimedValueFor('Top 3 and bottom 3 territories in T-001 April 2024', 'T-001', AARD.labels), null);
});

t('factLines states the peak and low the chart actually draws', () => {
  const lines = factLines(AARD);
  assert.ok(lines[0].includes('T-020') && lines[0].includes('31.87'), lines[0]);
  assert.ok(lines[1].includes('T-009') && lines[1].includes('20.13'), lines[1]);
});

console.log(`\n${passed} passed`);
if (process.exitCode) console.error('FAILURES — see above');
