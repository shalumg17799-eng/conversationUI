// KAG Phase 2 tests — sanitizer and scoring are pure and run without a database;
// the retrieval/pack checks are skipped when Neo4j is not configured.
//
//   npm run test:kag

import { buildLuceneQuery, escapeLuceneTerm } from '../backend/src/kag/luceneEscape';
import { scoreCandidates, retrieve, normalizeQuery, resetBreaker } from '../backend/src/kag/kagRetriever';
import { buildGroundingPack, estimateTokens } from '../backend/src/kag/groundingPack';
import { isKagConfigured } from '../backend/src/kag/config';
import { closeDriver } from '../backend/src/kag/neo4jClient';
import type { KagNode, KagEdge, KagSeed, RetrievedSubgraph } from '../backend/src/kag/types';

let passed = 0;
let failed = 0;

function ok(name: string, cond: boolean, detail = ''): void {
  if (cond) { passed++; console.log(`  ok  ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}

function eq(name: string, actual: unknown, expected: unknown): void {
  ok(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ── Lucene sanitizer (plan §4.2, §8) ─────────────────────────────────────────
console.log('\n── luceneEscape ─────────────────────────────────────────');

// Every Lucene special character must come back escaped. An unescaped one is both a
// parse error that kills the route and an injection surface.
for (const ch of ['+', '-', '&', '|', '!', '(', ')', '{', '}', '[', ']', '^', '"', '~', '*', '?', ':', '\\', '/']) {
  eq(`escapes ${JSON.stringify(ch)}`, escapeLuceneTerm(`a${ch}b`), `a\\${ch}b`);
}

eq('drops stopwords', buildLuceneQuery('show me the revenue'), 'revenue~1');
eq('keeps underscores', buildLuceneQuery('take_rate_pct'), 'take_rate_pct~1');
eq('no fuzziness on short terms', buildLuceneQuery('aht ris'), 'aht OR ris');
eq('dedupes repeats', buildLuceneQuery('revenue revenue'), 'revenue~1');
eq('all-stopwords yields empty', buildLuceneQuery('show me the'), '');
eq('empty input yields empty', buildLuceneQuery(''), '');
ok('quote cannot escape the query', !buildLuceneQuery('churn" OR *:*').includes('"'),
  buildLuceneQuery('churn" OR *:*'));
ok('caps term count', buildLuceneQuery(Array.from({ length: 50 }, (_, i) => `term${i}`).join(' ')).split(' OR ').length <= 12);

eq('normalizeQuery collapses case + space', normalizeQuery('  Show   REVENUE '), 'show revenue');

// ── Scoring (pure — no database) ─────────────────────────────────────────────
console.log('\n── scoreCandidates ──────────────────────────────────────');

const nodes: KagNode[] = [
  { id: 'Metric:take-rate-pct', type: 'Metric', label: 'Take Rate %', aliases: [], props: {}, provenance: 'glossary' },
  { id: 'Metric:aht-sec', type: 'Metric', label: 'AHT (sec)', aliases: [], props: {}, provenance: 'glossary' },
  { id: 'Report:sales-take-rate', type: 'Report', label: 'Take Rate by Territory', aliases: [], props: { domain: 'Sales' }, provenance: 'catalog' },
  { id: 'Report:cc-perf', type: 'Report', label: 'Contact Centre', aliases: [], props: { domain: 'Contact Center' }, provenance: 'catalog' },
  { id: 'Table:fact_sug_monthly_rollup', type: 'Table', label: 'fact_sug_monthly_rollup', aliases: [], props: { table: 'fact_sug_monthly_rollup' }, provenance: 'catalog' },
  { id: 'Table:fact_contact_center_metrics', type: 'Table', label: 'fact_contact_center_metrics', aliases: [], props: { table: 'fact_contact_center_metrics' }, provenance: 'catalog' },
];
const edges: KagEdge[] = [
  { from: 'Report:sales-take-rate', to: 'Metric:take-rate-pct', type: 'REPORTS_ON', weight: 0.9, provenance: 'catalog' },
  { from: 'Report:sales-take-rate', to: 'Table:fact_sug_monthly_rollup', type: 'SOURCED_FROM', weight: 1.0, provenance: 'catalog' },
  { from: 'Report:cc-perf', to: 'Metric:aht-sec', type: 'REPORTS_ON', weight: 0.9, provenance: 'catalog' },
  { from: 'Report:cc-perf', to: 'Table:fact_contact_center_metrics', type: 'SOURCED_FROM', weight: 1.0, provenance: 'catalog' },
];

const oneSeed = scoreCandidates(nodes, edges, [{ nodeId: 'Metric:take-rate-pct', score: 1, matchedOn: 'fulltext' }]);
eq('routes metric seed to its table', oneSeed[0]?.table, 'fact_sug_monthly_rollup');
ok('scores are 0..1', oneSeed.every(c => c.score > 0 && c.score <= 1), JSON.stringify(oneSeed));
ok('records via (explains ranking)', oneSeed[0]?.via.includes('Metric:take-rate-pct'));

const twoSeeds = scoreCandidates(nodes, edges, [
  { nodeId: 'Metric:take-rate-pct', score: 1, matchedOn: 'fulltext' },
  { nodeId: 'Report:sales-take-rate', score: 1, matchedOn: 'fulltext' },
]);
ok('two converging seeds outscore one',
  (twoSeeds.find(c => c.table === 'fact_sug_monthly_rollup')?.score ?? 0) >
  (oneSeed.find(c => c.table === 'fact_sug_monthly_rollup')?.score ?? 0));

const unrelated = scoreCandidates(nodes, edges, [{ nodeId: 'Metric:aht-sec', score: 1, matchedOn: 'fulltext' }]);
eq('unrelated seed picks the other table', unrelated[0]?.table, 'fact_contact_center_metrics');
ok('no seeds → no candidates', scoreCandidates(nodes, edges, []).length === 0);
ok('empty graph never throws', scoreCandidates([], [], [{ nodeId: 'x', score: 1, matchedOn: 'fulltext' }]).length === 0);

// ── Grounding pack (pure) ────────────────────────────────────────────────────
console.log('\n── groundingPack ────────────────────────────────────────');

const packNodes: KagNode[] = [
  ...nodes,
  { id: 'Column:fact_sug_monthly_rollup.take_rate_pct', type: 'Column', label: 'take_rate_pct', aliases: [], props: { table: 'fact_sug_monthly_rollup', dataType: 'FLOAT64', role: 'measure' }, provenance: 'bigquery' },
  { id: 'Column:fact_sug_monthly_rollup.territory_id', type: 'Column', label: 'territory_id', aliases: [], props: { table: 'fact_sug_monthly_rollup', dataType: 'STRING', role: 'dimension' }, provenance: 'bigquery' },
];
const packEdges: KagEdge[] = [
  ...edges,
  { from: 'Table:fact_sug_monthly_rollup', to: 'Column:fact_sug_monthly_rollup.take_rate_pct', type: 'HAS_COLUMN', weight: 1, provenance: 'bigquery' },
  { from: 'Table:fact_sug_monthly_rollup', to: 'Column:fact_sug_monthly_rollup.territory_id', type: 'HAS_COLUMN', weight: 1, provenance: 'bigquery' },
  { from: 'Metric:take-rate-pct', to: 'Column:fact_sug_monthly_rollup.take_rate_pct', type: 'MEASURED_BY', weight: 1, provenance: 'glossary' },
];

const sub: RetrievedSubgraph = {
  nodes: packNodes,
  edges: packEdges,
  seeds: [{ nodeId: 'Metric:take-rate-pct', score: 1, matchedOn: 'fulltext' }],
  candidateTables: [{ table: 'fact_sug_monthly_rollup', score: 0.91, via: ['Metric:take-rate-pct'] }],
  truncated: false,
  source: 'neo4j',
  latencyMs: 12,
};

const pack = buildGroundingPack(sub);
ok('pack names the table', pack.text.includes('fact_sug_monthly_rollup'));
ok('pack maps metric → column', pack.text.includes('Take Rate % → take_rate_pct (FLOAT64)'));
ok('pack lists dimensions', pack.text.includes('territory_id (STRING)'));
ok('pack carries the verbatim rule', pack.text.includes('RULES: use ONLY'));
ok('pack is within the 600-token target', pack.tokens <= 600, `${pack.tokens} tokens`);
ok('pack is deterministic', buildGroundingPack(sub).text === pack.text);
eq('empty subgraph → empty pack', buildGroundingPack({ ...sub, candidateTables: [], nodes: [], edges: [] }).text, '');
ok('token estimate is monotonic', estimateTokens('aaaa') <= estimateTokens('aaaaaaaa'));

// ── Live retrieval (requires Neo4j) ──────────────────────────────────────────
(async () => {
  if (!isKagConfigured()) {
    console.log('\n── live retrieval: SKIPPED (NEO4J_URI not set) ──────────');
  } else {
    console.log('\n── live retrieval ───────────────────────────────────────');
    resetBreaker();

    const r = await retrieve('Show revenue by territory');
    ok('retrieval reports a source', ['neo4j', 'cache', 'fallback-catalog'].includes(r.source), r.source);
    ok('retrieval found seeds', r.seeds.length > 0, `seeds=${r.seeds.length} source=${r.source}`);
    ok('retrieval found candidate tables', r.candidateTables.length > 0,
      `candidates=${JSON.stringify(r.candidateTables.slice(0, 3))}`);
    ok('latency within the 800ms budget', r.latencyMs < 800, `${r.latencyMs}ms`);
    console.log(`     top=${r.candidateTables[0] ? `${r.candidateTables[0].table}@${r.candidateTables[0].score}` : 'none'} nodes=${r.nodes.length} ${r.latencyMs}ms`);

    const cached = await retrieve('Show revenue by territory');
    eq('second identical query hits cache', cached.source, 'cache');

    // Semantic routing the current codebase cannot do: "churn" is not a column name.
    const churn = await retrieve('churn');
    ok('semantic alias "churn" routes somewhere', churn.candidateTables.length > 0,
      JSON.stringify(churn.candidateTables.slice(0, 2)));

    // Hostile input must not throw or take out the route.
    const nasty = await retrieve('revenue" OR *:* ~~ [[');
    ok('hostile Lucene input degrades safely', nasty.source !== undefined && !!nasty);

    const livePack = buildGroundingPack(r);
    ok('live pack is non-empty', livePack.text.length > 0, `tables=${livePack.tablesIncluded.join(',')}`);
    console.log(`     pack: ${livePack.tokens} tokens, tables=[${livePack.tablesIncluded.join(', ')}]`);

    await closeDriver();
  }

  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed > 0 ? 1 : 0);
})();
