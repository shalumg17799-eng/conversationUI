// Backend copy of the chart fact-checker. The canonical version lives in the
// frontend at src/lib/chartFacts.ts and drives the in-app preview + script build;
// this copy drives the backend render, where it re-verifies the script the client
// sent (a stale client must not be able to put a contradicted claim on a slide).
// The two tsconfig roots cannot share one module without reshaping the build
// output, so they are kept logically identical and pinned by
// scripts/test_chartFacts.ts, which fails if they ever diverge.
//
// Why this exists: a report carries both authored prose and a data array for the
// same numbers. The video renders the ARRAY, so the array is the single source of
// truth; prose it contradicts is dropped before it can reach a slide or the
// narration writer.

export interface FactSeries { name: string; values: number[]; }
export interface FactChart { labels: string[]; series: FactSeries[]; }

// Authoritative facts for a chart, measured from series[0] — the series the
// bullets, the peak callout and the spotlight all use.
export interface ChartFacts {
  peakLabel: string;
  peakValue: number;
  lowLabel: string;
  lowValue: number;
  total: number;
  points: number;
}

// A claimed figure may differ from the rendered one by rounding without being a
// contradiction. 2% separates "30.78 vs 30.72" (rounding) from "21.61 vs 20.13"
// (a different number entirely).
export const CLAIM_TOLERANCE = 0.02;

// Words that assert a maximum / minimum. Deliberately excludes direction-ambiguous
// judgements (best, worst, strongest, healthiest) — on a lower-is-better metric
// those invert, and guessing wrong would drop good copy.
const MAX_WORDS = /\b(highest|greatest|largest|biggest|most|top|lead|leads|leading|peak|peaks|heaviest|steepest|maximum|max)\b/i;
const MIN_WORDS = /\b(lowest|smallest|least|bottom|minimum|min)\b/i;

const isWordChar = (ch: string): boolean => /[a-z0-9]/.test(ch);

// Index of `label` in `text` on token boundaries, or -1. Case-insensitive.
// Boundary-aware so "T-009" does not match inside "T-0091", while still matching
// "T-009's" and "(T-009)".
export function findLabel(text: string, label: string): number {
  const hay = String(text ?? '').toLowerCase();
  const needle = String(label ?? '').trim().toLowerCase();
  if (!needle) return -1;
  const headIsWord = isWordChar(needle[0]);
  const tailIsWord = isWordChar(needle[needle.length - 1]);
  let i = hay.indexOf(needle);
  while (i >= 0) {
    const before = i === 0 ? '' : hay[i - 1];
    const after = hay[i + needle.length] ?? '';
    const okBefore = !before || !headIsWord || !isWordChar(before);
    const okAfter = !after || !tailIsWord || !isWordChar(after);
    if (okBefore && okAfter) return i;
    i = hay.indexOf(needle, i + 1);
  }
  return -1;
}

// "$12.9M" -> 12900000, "30.78%" -> 30.78, "3 million" -> 3000000.
// Magnitude suffixes are matched right after the digits (there is no word
// boundary between "9" and "M", so \bm\b would never fire).
export function parseClaimNumber(raw: string): number {
  const s = String(raw ?? '');
  const n = parseFloat(s.replace(/[^0-9.\-]/g, ''));
  if (Number.isNaN(n)) return NaN;
  if (/\d\s*(?:b\b|bn\b|billion)/i.test(s)) return n * 1e9;
  if (/\d\s*(?:mm\b|m\b|million)/i.test(s)) return n * 1e6;
  if (/\d\s*(?:k\b|thousand)/i.test(s)) return n * 1e3;
  return n;
}

function closeEnough(claimed: number, actual: number): boolean {
  const scale = Math.max(Math.abs(actual), Math.abs(claimed), 1e-9);
  return Math.abs(claimed - actual) / scale <= CLAIM_TOLERANCE;
}

// Split into sentences WITHOUT breaking decimals: a terminator only ends a
// sentence when whitespace or end-of-string follows it, so "30.78%" stays whole.
export function splitSentences(text: string): string[] {
  return String(text ?? '')
    .split(/(?:[.;!?])(?=\s|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// The figure the prose attributes to `label` within one sentence, or null.
// Only counts a number in an attributing position (parenthesis, "at", "=", ":",
// dash) so incidental numbers like "April 2026" are not read as data claims.
// The search window stops at the next label so figures never cross-attribute.
export function claimedValueFor(sentence: string, label: string, allLabels: string[]): number | null {
  const at = findLabel(sentence, label);
  if (at < 0) return null;
  const from = at + label.length;
  let to = Math.min(sentence.length, from + 48);
  for (const other of allLabels) {
    if (other === label) continue;
    const oi = findLabel(sentence, other);
    if (oi > at && oi < to) to = oi;
  }
  const window = sentence.slice(from, to);
  const m = window.match(/(?:\(|\bat\s+|=\s*|:\s*|[—–-]\s+)\s*~?\s*\$?\s*(-?[\d,]+(?:\.\d+)?)\s*(%|k\b|m\b|b\b|bn\b|mm\b|million|billion|thousand)?/i);
  if (!m) return null;
  const v = parseClaimNumber(m[1] + (m[2] ?? ''));
  return Number.isFinite(v) ? v : null;
}

// Peak / low / total for a chart, from series[0]. null when there is nothing
// finite to measure.
export function chartFacts(chart: FactChart | null | undefined): ChartFacts | null {
  const labels = chart?.labels ?? [];
  const values = chart?.series?.[0]?.values ?? [];
  if (!labels.length || !values.length) return null;
  let hi = -1;
  let lo = -1;
  let total = 0;
  let points = 0;
  for (let i = 0; i < labels.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    if (hi < 0 || v > values[hi]) hi = i;
    if (lo < 0 || v < values[lo]) lo = i;
    total += v;
    points++;
  }
  if (hi < 0) return null;
  return {
    peakLabel: labels[hi], peakValue: values[hi],
    lowLabel: labels[lo], lowValue: values[lo],
    total, points,
  };
}

export interface ProseAudit { ok: boolean; conflicts: string[]; }

// Does `prose` contradict what the chart actually renders?
//
// Two checks, per sentence, and only for sentences that name at least one chart
// label (so generic captions like "sorted highest to lowest" are never flagged):
//   1. superlative — a sentence asserting a max/min must name the real extreme.
//   2. figure      — a value attributed to a label must match that label's value.
// Both are lenient across multi-series charts: agreeing with ANY series passes,
// so a combo chart's second series can't be mistaken for a contradiction.
export function auditChartProse(prose: string | undefined, chart: FactChart | null | undefined): ProseAudit {
  const conflicts: string[] = [];
  const text = String(prose ?? '').trim();
  const labels = chart?.labels ?? [];
  const series = (chart?.series ?? []).filter((s) => Array.isArray(s?.values) && s.values.length);
  if (!text || !labels.length || !series.length) return { ok: true, conflicts };

  const maxLabels = new Set<string>();
  const minLabels = new Set<string>();
  for (const s of series) {
    let hi = -1;
    let lo = -1;
    for (let i = 0; i < labels.length; i++) {
      const v = s.values[i];
      if (!Number.isFinite(v)) continue;
      if (hi < 0 || v > s.values[hi]) hi = i;
      if (lo < 0 || v < s.values[lo]) lo = i;
    }
    if (hi >= 0) maxLabels.add(labels[hi]);
    if (lo >= 0) minLabels.add(labels[lo]);
  }

  for (const sentence of splitSentences(text)) {
    const mentioned = labels.filter((l) => findLabel(sentence, l) >= 0);
    if (!mentioned.length) continue;

    if (MAX_WORDS.test(sentence) && !mentioned.some((l) => maxLabels.has(l))) {
      conflicts.push(`calls ${mentioned.join('/')} the highest, but the chart peaks at ${[...maxLabels].join('/')}`);
    }
    if (MIN_WORDS.test(sentence) && !mentioned.some((l) => minLabels.has(l))) {
      conflicts.push(`calls ${mentioned.join('/')} the lowest, but the chart bottoms out at ${[...minLabels].join('/')}`);
    }

    for (const label of mentioned) {
      const claimed = claimedValueFor(sentence, label, labels);
      if (claimed === null) continue;
      const idx = labels.indexOf(label);
      const actuals = series.map((s) => s.values[idx]).filter((v) => Number.isFinite(v));
      if (!actuals.length) continue;
      if (!actuals.some((a) => closeEnough(claimed, a))) {
        conflicts.push(`says ${label} is ${claimed}, but the chart renders ${actuals.join('/')}`);
      }
    }
  }
  return { ok: conflicts.length === 0, conflicts };
}

// Ground-truth lines handed to the narration writer, so it describes the chart
// that is actually on screen instead of re-reading prose that may contradict it.
export function factLines(chart: FactChart | null | undefined): string[] {
  const f = chartFacts(chart);
  if (!f) return [];
  const round = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));
  return [
    `highest: ${f.peakLabel} at ${round(f.peakValue)}`,
    `lowest: ${f.lowLabel} at ${round(f.lowValue)}`,
    `total across ${f.points} points: ${round(f.total)}`,
  ];
}
