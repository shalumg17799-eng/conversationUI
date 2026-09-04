// Phase 2 shadow measurement run.
//
// Drives analyzeQuery over a realistic query set. Each call routes exactly as it
// would for a user, and the shadow hook records what KAG *would* have chosen. The
// output is the Phase 2 gate: agreement between KAG's top candidate and live routing
// must reach 0.90 before KAG_ENABLED is turned on.
//
//   npm run kag:shadow

import { analyzeQuery } from '../backend/src/services/llmHandler';
import { getKagSummary, resetKagMetrics } from '../backend/src/kag/kagTelemetry';
import { getBreakerState } from '../backend/src/kag/kagRetriever';
import { isKagConfigured } from '../backend/src/kag/config';
import { closeDriver } from '../backend/src/kag/neo4jClient';
import { probeTableAvailability } from '../backend/src/services/llmHandler';

// Queries a real user would type, spread across every domain in the catalog and
// deliberately including vocabulary that is NOT a column name ("churn", "attrition",
// "handle time") — that semantic routing is the whole point of the graph.
const QUERIES: string[] = [
  // Sales — revenue / take rate
  'Show revenue by territory',
  'What is our SUG revenue this month',
  'Compare territories by take rate',
  'Show me take rate trends',
  'Which territory has the highest revenue',
  'Monthly revenue and take rate',
  'Show run rate by territory',
  'What is the return rate by territory',
  'Give me the AARD percentage',
  'Show RIS scores',
  'Territory revenue breakdown',
  'Sales performance by month',
  'Revenue trend over time',
  'How is take rate changing',
  'Show monthly rollup data',

  // Churn / retention — semantic, no matching column name
  'Show me churn by territory',
  'What is our attrition rate',
  'Churn and retention metrics',
  'Retention trends by territory',
  'Which territories are losing customers',
  'Show customer churn signals',
  'Monthly churn variation',

  // Network
  'Show network KPI trends',
  'What is our signal strength',
  'Network performance by region',
  'Show me site scores',
  'Network health overview',
  'Signal quality across regions',
  'Show RSRP by site',
  'Network KPI points over time',
  'Which sites have poor network scores',

  // Contact centre — includes the AHT alias
  'Show contact center metrics',
  'What is our average handle time',
  'Show AHT by employee',
  'Contact centre performance',
  'Show transfer percentage',
  'Box close rate by team',
  'Which agents have the best sales time',
  'Show call center KPIs',
  'Average handle time trends',
  'Show CSAT scores',

  // Dynamic scores
  'Show dynamic scores',
  'Employee performance rankings',
  'Show me overall scores by employee',
  'Who ranks highest',
  'Performance score breakdown',

  // Vaguer / harder — these are where disagreement is expected and informative
  'How are we doing this quarter',
  'Show me the numbers',
  'What should I look at',
  'Give me a performance overview',
  'Compare regions',
  'Show me trends',
  'What is underperforming',
  'Best and worst performers',
  'Show me sales data',
];

async function main(): Promise<void> {
  if (!isKagConfigured()) {
    console.error('❌ NEO4J_URI / NEO4J_PASSWORD not set — nothing to measure.');
    process.exit(1);
  }

  console.log(`── KAG shadow run: ${QUERIES.length} queries ──────────────────`);

  // Routing filters against tables that actually have data, so probe first —
  // otherwise every query routes against an empty availability set.
  await probeTableAvailability().catch(() => { /* non-fatal */ });

  resetKagMetrics();

  let routed = 0;
  let clarified = 0;

  for (let i = 0; i < QUERIES.length; i++) {
    const q = QUERIES[i];
    try {
      const result = await analyzeQuery(q, [], 'sonnet');
      if (result.action === 'route') routed++; else clarified++;
      process.stdout.write(`  [${String(i + 1).padStart(2)}/${QUERIES.length}] ${result.action.padEnd(8)} ${q}\n`);
    } catch (err) {
      console.warn(`  [${i + 1}] ERROR ${q}: ${(err as Error).message.slice(0, 80)}`);
    }
  }

  // Shadow calls are fire-and-forget; give the in-flight ones a moment to land
  // before reading the counters.
  await new Promise(r => setTimeout(r, 3000));

  const s = getKagSummary();
  console.log('\n── Results ──────────────────────────────────────────────');
  console.log(`Live routing:      ${routed} routed, ${clarified} clarified`);
  console.log(`Retrievals:        ${s.retrievals} (neo4j=${s.bySource.neo4j} cache=${s.bySource.cache} fallback=${s.bySource['fallback-catalog']})`);
  console.log(`Failures:          ${s.failures} errors, ${s.timeouts} timeouts, ${s.breakerOpens} breaker opens`);
  console.log(`Latency:           avg ${s.latency.avgMs}ms  p50 ${s.latency.p50Ms}ms  p95 ${s.latency.p95Ms}ms  max ${s.latency.maxMs}ms`);
  console.log(`Subgraph:          avg ${s.avgSeeds} seeds, ${s.avgNodes} nodes, ${s.truncated} truncated`);
  console.log(`Low confidence:    ${s.lowConfidence}`);
  console.log(`Tokens:            pack ${s.tokens.avgPackTokens} vs catalog ${s.tokens.avgCatalogTokens} (saved ${s.tokens.avgSavedTokens}/query over ${s.tokens.samples} samples)`);
  console.log(`Breaker:           ${JSON.stringify(getBreakerState())}`);
  console.log('');
  console.log(`Comparisons:       ${s.shadow.comparisons}`);
  console.log(`Agreements:        ${s.shadow.agreements}`);
  console.log(`AGREEMENT RATE:    ${s.shadow.agreementRate === null ? 'n/a' : s.shadow.agreementRate.toFixed(3)}`);
  console.log('');
  const rate = s.shadow.agreementRate ?? 0;
  console.log(rate >= 0.9
    ? '✅ GATE PASSED (>= 0.90) — Phase 3 may proceed.'
    : `❌ GATE NOT MET (${rate.toFixed(3)} < 0.90) — KAG_ENABLED must stay false. Triage the DISAGREE lines above.`);

  await closeDriver();
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
