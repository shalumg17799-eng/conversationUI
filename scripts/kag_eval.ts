// KAG routing evaluation — Phase 7.
//   npm run kag:eval
//
// Measures the number the Phase 2 gate is defined on: how often the retriever's top
// candidate table is the right one.
//
// Deliberately does NOT go through runPipeline. The existing evaluation harness calls
// the LLM for every case, which costs API budget and mixes model variance into a
// measurement of retrieval. This exercises retrieval alone, so it is fast, free and
// repeatable — the properties you want when iterating on scoring.

import { retrieve, warmRetrieval } from '../backend/src/kag/kagRetriever';
import { buildGroundingPack } from '../backend/src/kag/groundingPack';
import { closeDriver, warmUpIndexes } from '../backend/src/kag/neo4jClient';
import { isKagConfigured } from '../backend/src/kag/config';

interface Case {
  query: string;
  /**
   * Acceptable table(s), or null when the query SHOULD be too vague to route.
   *
   * A list is not a weakened assertion — some phrasings genuinely have more than one
   * correct answer. "units sold per outlet" is served by both v_daily_sales_detail
   * (day x outlet) and fact_intraday_sales (hour x outlet x device); insisting on one
   * would be encoding a preference as a correctness rule and inviting someone to tune
   * scoring to satisfy the test. Where only one table can be right, keep it a string.
   */
  expect: string | string[] | null;
  note?: string;
}

const CASES: Case[] = [
  // ── Direct metric language ────────────────────────────────────────────────
  { query: 'take rate by territory', expect: 'fact_sug_monthly_rollup' },
  { query: 'monthly revenue trend', expect: 'fact_sug_monthly_rollup' },
  { query: 'return rate analysis', expect: 'fact_sug_monthly_rollup' },
  { query: 'RIS score by territory', expect: 'fact_sug_monthly_rollup' },
  { query: 'run rate by month', expect: 'fact_sug_monthly_rollup' },

  // ── Synonyms the pre-KAG literal matcher could not resolve ────────────────
  { query: 'churn by territory', expect: 'fact_sug_monthly_rollup', note: 'churn → Return Rate %' },
  { query: 'customer attrition trend', expect: 'fact_sug_monthly_rollup', note: 'attrition → Return Rate %' },
  { query: 'agent productivity', expect: 'fact_contact_center_metrics', note: 'concept term' },
  { query: 'average handle time by agent', expect: 'fact_contact_center_metrics' },
  { query: 'box close rate', expect: 'fact_contact_center_metrics' },
  { query: 'call transfer rate', expect: 'fact_contact_center_metrics', note: 'transfers → Transfer %' },

  // ── Contact centre / network ──────────────────────────────────────────────
  { query: 'signal strength by site', expect: 'fact_network_kpi_points', note: 'rsrp' },
  { query: 'network kpi score', expect: 'fact_network_kpi_points' },
  { query: 'dynamic score rankings', expect: 'fact_dynamic_scores' },

  // ── The new views ─────────────────────────────────────────────────────────
  { query: 'territory performance scorecard', expect: 'v_monthly_territory_performance' },
  { query: 'territory rank by month', expect: 'v_monthly_territory_performance' },
  { query: 'daily sales detail by outlet', expect: 'v_daily_sales_detail' },
  { query: 'units sold per outlet', expect: ['v_daily_sales_detail', 'fact_intraday_sales'],
    note: 'both serve units by outlet' },

  // Device group / "platform" — added after the catalog exposed fact_intraday_sales.
  { query: 'break down by platform', expect: 'fact_intraday_sales', note: 'platform -> device_group' },
  { query: 'revenue by device group', expect: 'fact_intraday_sales' },
  { query: 'sales by device type', expect: 'fact_intraday_sales', note: 'alias' },

  // ── Entity seeding (Phase 5) ──────────────────────────────────────────────
  { query: 'how did Dallas do last quarter', expect: 'v_daily_sales_detail', note: 'entity → city' },
  { query: 'show me Chicago outlets', expect: 'v_daily_sales_detail', note: 'entity → city' },

  // ── Should NOT route: too vague, must fall through to clarification ───────
  { query: 'hello there', expect: null },
  { query: 'what can you do', expect: null },
];

async function main() {
  if (!isKagConfigured()) {
    console.error('❌ NEO4J_URI / NEO4J_PASSWORD not set — run `npm run kag:ping` first.');
    process.exit(1);
  }

  // Warm first: this script owns its own pool, and a cold first probe would report
  // a fallback that says nothing about routing quality.
  await warmUpIndexes(); await warmRetrieval();

  console.log('── KAG routing evaluation ───────────────────────────────');
  console.log(`${CASES.length} cases\n`);

  let pass = 0;
  const failures: string[] = [];
  const latencies: number[] = [];
  const packTokens: number[] = [];

  for (const c of CASES) {
    const sub = await retrieve(c.query);
    const pack = buildGroundingPack(sub);
    const top = sub.candidateTables[0]?.table ?? null;
    const score = sub.candidateTables[0]?.score ?? 0;

    latencies.push(sub.latencyMs);
    if (pack.tokens) packTokens.push(pack.tokens);

    const accept = c.expect === null ? [] : (Array.isArray(c.expect) ? c.expect : [c.expect]);
    const ok = c.expect === null ? top === null : (top !== null && accept.includes(top));
    if (ok) pass += 1;
    else failures.push(`  "${c.query}" → expected ${accept.join(' | ') || 'no route'}, got ${top ?? 'no route'} (${score.toFixed(2)})`);

    const mark = ok ? '✅' : '❌';
    console.log(`${mark} ${c.query.padEnd(38)} → ${(top ?? '—').padEnd(32)} ${score.toFixed(2)}${c.note ? `  [${c.note}]` : ''}`);
  }

  const pct = (pass / CASES.length);
  const p = (arr: number[], q: number) => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(q * s.length))];
  };

  console.log('\n── Summary ──────────────────────────────────────────────');
  console.log(`Routing accuracy: ${pass}/${CASES.length} (${(pct * 100).toFixed(1)}%)`);
  console.log(`Latency:  p50 ${p(latencies, 0.5)}ms  p95 ${p(latencies, 0.95)}ms  max ${Math.max(...latencies)}ms`);
  console.log(`Pack:     avg ${packTokens.length ? Math.round(packTokens.reduce((a, b) => a + b, 0) / packTokens.length) : 0} tokens`);

  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(f);
  }

  // 0.90 is the Phase 2 gate from the plan. Reported, not enforced as a hard exit —
  // this is a measurement tool, and a red build on a scoring experiment helps nobody.
  console.log(`\nPhase 2 gate (>=90%): ${pct >= 0.9 ? '✅ MET' : `⚠️  NOT MET (${(pct * 100).toFixed(1)}%)`}`);

  await closeDriver();
}

main().catch(async e => {
  console.error('💥 kag:eval failed:', e);
  await closeDriver().catch(() => {});
  process.exit(1);
});
