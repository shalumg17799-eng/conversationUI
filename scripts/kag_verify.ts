// End-to-end KAG verification.
//   npm run kag:verify
//
// Checks every KAG layer independently of the LLM.
//
// Why that separation matters: KAG runs ENTIRELY UPSTREAM of report generation.
// It decides which table to query and what grounding text the prompt carries; the
// model then writes the cards. So a dead LLM (missing ANTHROPIC_API_KEY /
// GOOGLE_AI_API_KEY) produces "I encountered an error generating the report" while
// every KAG layer is perfectly healthy. This script proves which half is broken.
//
// Forces KAG_ENABLED=true / KAG_SHADOW=false for the duration so the active code
// paths are exercised — it does not change your .env. dotenv does not override
// variables already present in process.env, which is why setting them here wins.

process.env.KAG_ENABLED = 'true';
process.env.KAG_SHADOW = 'false';

interface Check { name: string; ok: boolean; detail: string; fatal?: boolean }
const results: Check[] = [];
const add = (name: string, ok: boolean, detail: string, fatal = false) =>
  results.push({ name, ok, detail, fatal });

async function main() {
  // Imported dynamically so the env assignment above lands before config.ts reads it.
  const { KAG_CONFIG, isKagConfigured, isKagActive } = await import('../backend/src/kag/config');
  const { verifyConnectivity, hasApocPathExpand, closeDriver, runCypher } = await import('../backend/src/kag/neo4jClient');
  const { getGraphStats } = await import('../backend/src/kag/schema');
  const { retrieve, getBreakerState } = await import('../backend/src/kag/kagRetriever');
  const { buildGroundingPack } = await import('../backend/src/kag/groundingPack');
  const { resolveGroundingContext, resolveEntityFilters, canonicalColumnsFor } = await import('../backend/src/kag/kagGrounding');
  const { checkCardGrounding } = await import('../backend/src/kag/kagValidator');
  const { affinityFor } = await import('../backend/src/kag/kagAffinity');
  const { buildQuerySQL, DATA_SOURCES, ALL_TABLES } = await import('../backend/src/services/dataSourceMap');
  const { qualifiedTable, runQueryWithMeta } = await import('../backend/src/lib/bigqueryClient');
  const { embeddingsAvailable } = await import('../backend/src/kag/kagEmbeddings');

  console.log('══ KAG end-to-end verification ══════════════════════════');
  console.log(`enabled=${KAG_CONFIG.enabled} shadow=${KAG_CONFIG.shadow} (forced for this run)\n`);

  // ── L1 · Neo4j ────────────────────────────────────────────────────────────
  if (!isKagConfigured()) {
    add('L1 Neo4j configured', false, 'NEO4J_URI / NEO4J_PASSWORD not set', true);
    return report();
  }
  const conn = await verifyConnectivity();
  add('L1 Neo4j reachable', conn.ok, conn.ok ? conn.version! : conn.error!, true);
  if (!conn.ok) return report();

  const apoc = await hasApocPathExpand();
  add('L1 APOC path expansion', true, apoc ? 'available' : 'unavailable — plain-Cypher fallback in use');

  const stats = await getGraphStats();
  add('L1 Graph populated', stats.totalNodes > 0,
    `${stats.totalNodes} nodes / ${stats.totalRels} rels, built ${stats.builtAt}`, true);
  if (stats.totalNodes === 0) return report();

  for (const t of ['Metric', 'Table', 'Column', 'Report', 'Entity'] as const) {
    add(`L1 ${t} nodes`, (stats.nodesByLabel[t] ?? 0) > 0, String(stats.nodesByLabel[t] ?? 0));
  }
  add('L1 MEASURED_BY edges', (stats.relsByType['MEASURED_BY'] ?? 0) > 0,
    `${stats.relsByType['MEASURED_BY'] ?? 0} confirmed metric→column mappings`);

  // ── L2 · BigQuery agreement — the graph must match physical reality ───────
  const { rows: bqTables } = await runQueryWithMeta(
    `SELECT table_name FROM \`${process.env.BQ_PROJECT_ID || 'data-practice-472314'}.${process.env.BQ_DATASET || 'report_hub_demo'}\`.INFORMATION_SCHEMA.TABLES`);
  const bqSet = new Set(bqTables.map((r: any) => String(r.table_name)));
  const missing = ALL_TABLES.filter(t => !bqSet.has(t));
  add('L2 All catalog tables exist in BigQuery', missing.length === 0,
    missing.length ? `MISSING: ${missing.join(', ')} — run npm run bq:views` : `${ALL_TABLES.length}/${ALL_TABLES.length} present`);

  const graphTables = await runCypher<{ label: string }>(`MATCH (t:Table) RETURN t.label AS label`, {}, { quiet: true });
  const drift = graphTables.map(r => r.label).filter(t => !bqSet.has(t));
  add('L2 No graph→BigQuery drift', drift.length === 0,
    drift.length ? `graph has tables BigQuery lacks: ${drift.join(', ')}` : 'graph matches BigQuery');

  // ── L3 · Retrieval ────────────────────────────────────────────────────────
  const PROBES: Array<{ q: string; expect: string | null; why: string }> = [
    { q: 'churn by territory', expect: 'fact_sug_monthly_rollup', why: 'synonym: churn → Return Rate %' },
    { q: 'average handle time by agent', expect: 'fact_contact_center_metrics', why: 'alias: AHT' },
    { q: 'signal strength by site', expect: 'fact_network_kpi_points', why: 'glossary: Signal Strength → rsrp' },
    { q: 'how did Dallas do', expect: 'v_daily_sales_detail', why: 'entity seed → city' },
    { q: 'hello there', expect: null, why: 'must NOT route — falls through to clarification' },
  ];
  let routed = 0;
  for (const p of PROBES) {
    const sub = await retrieve(p.q);
    const top = sub.candidateTables[0]?.table ?? null;
    const ok = p.expect === null ? top === null : top === p.expect;
    if (ok) routed += 1;
    add(`L3 route "${p.q}"`, ok,
      `${top ?? 'no route'}${ok ? '' : ` (expected ${p.expect ?? 'no route'})`} · source=${sub.source} ${sub.latencyMs}ms · ${p.why}`);
    if (p.q === PROBES[0].q) {
      add('L3 retrieval source is Neo4j', sub.source === 'neo4j',
        sub.source === 'neo4j' ? 'live graph' : `${sub.source} — graph NOT being used`);
    }
  }
  add('L3 Routing accuracy', routed === PROBES.length, `${routed}/${PROBES.length}`);

  // ── L4 · Grounding pack replaces the catalog dump ─────────────────────────
  const available = DATA_SOURCES.map(s => s.table);
  const g = await resolveGroundingContext('churn by territory', available);
  add('L4 Pack used instead of markdown', g.source === 'kag-pack',
    `source=${g.source}${g.fallbackReason ? ` reason="${g.fallbackReason}"` : ''} tokens=${g.tokens} tables=[${g.tables.join(',')}]`);

  const sub = await retrieve('churn by territory');
  const pack = buildGroundingPack(sub);
  add('L4 Pack names a real column', /\w+ → \w+ \(/.test(pack.text),
    pack.text.split('\n').find(l => l.includes('metrics:'))?.trim().slice(0, 90) ?? 'no metric line');
  add('L4 Pack carries the verbatim rule', pack.text.includes('use ONLY the table and column names above'), 'present');

  const vague = await resolveGroundingContext('hello there', available);
  add('L4 Low confidence falls back to full catalog', vague.source === 'catalog-markdown',
    `source=${vague.source} reason="${vague.fallbackReason}" — correct: a vague query must see everything`);

  // ── L5 · Entity → parameterized filter ────────────────────────────────────
  const filters = await resolveEntityFilters('how did Dallas do', 'v_daily_sales_detail');
  add('L5 Entity resolves to a filter', filters.length > 0,
    filters.map(f => `${f.column} IN [${f.values.join(', ')}]`).join(' AND ') || 'none resolved');

  if (filters.length) {
    const src = DATA_SOURCES.find(s => s.table === 'v_daily_sales_detail')!;
    const { sql, params } = buildQuerySQL(src, qualifiedTable, filters);
    const parameterized = sql.includes('@f0') && !filters[0].values.some(v => sql.includes(String(v)));
    add('L5 Filter is PARAMETERIZED, not concatenated', parameterized,
      parameterized ? `${sql.match(/WHERE [^O]*/)?.[0]?.trim()} params=${JSON.stringify(params)}` : `LEAK: value inlined → ${sql}`);

    const { rows } = await runQueryWithMeta(sql, params);
    add('L5 Filtered query returns data', rows.length > 0, `${rows.length} rows for ${filters[0].values.join('/')}`);

    // Multi-value: two cities on one column must OR via IN UNNEST, not AND to zero.
    const multi = await resolveEntityFilters('compare Dallas and Chicago', 'v_daily_sales_detail');
    const multiCol = multi.find(f => f.values.length > 1);
    if (multiCol) {
      const built = buildQuerySQL(src, qualifiedTable, [multiCol]);
      const { rows: mrows } = await runQueryWithMeta(built.sql, built.params);
      add('L5 Multi-value entity uses IN UNNEST', built.sql.includes('IN UNNEST(@f0)'),
        `${multiCol.column} IN [${multiCol.values.join(', ')}] → ${mrows.length} rows`);
    } else {
      add('L5 Multi-value entity uses IN UNNEST', false, 'expected 2 cities to resolve on one column');
    }
  }

  const injection = await resolveEntityFilters("Dallas'; DROP TABLE x; --", 'v_daily_sales_detail');
  const safe = injection.every(f => /^[A-Za-z_][A-Za-z0-9_]*$/.test(f.column));
  add('L5 Hostile input yields no unsafe identifier', safe,
    `${injection.length} filter(s), all column names validated`);

  // ── L6 · Grounding validation (Phase 4) ───────────────────────────────────
  const schema = await canonicalColumnsFor('fact_sug_monthly_rollup');
  add('L6 Canonical schema readable from graph', !!schema,
    schema ? `${schema.columns.length} columns, ${schema.metrics.length} metric mappings` : 'null');

  if (schema) {
    const cards = [
      { renderType: 'LineChart', props: { xKey: 'MONTH_ID', yKey: 'Take Rate %' } },   // casing + metric label
      { renderType: 'BarChart', props: { xKey: 'territory_id', yKey: 'not_a_column' } }, // violation
    ];
    const { report: r, cards: fixed } = checkCardGrounding(cards, schema, true);
    add('L6 Repairs wrong casing', (fixed[0].props as any).xKey === 'month_id',
      `MONTH_ID → ${(fixed[0].props as any).xKey}`);
    add('L6 Resolves metric label → column', (fixed[0].props as any).yKey === 'take_rate_pct',
      `"Take Rate %" → ${(fixed[0].props as any).yKey} (fixColumnCasing cannot do this)`);
    add('L6 Flags a genuine violation', r.violations === 1,
      `${r.violations} violation, ${r.repaired} repaired of ${r.checked} checked`);
  }

  // ── L7 · Affinity (advisory) ──────────────────────────────────────────────
  const hints = await affinityFor('fact_sug_monthly_rollup');
  add('L7 Affinity lookup succeeds', hints.length > 0,
    hints.map(h => `${h.component}@${h.weight.toFixed(2)}`).join(', ') || 'none');

  // ── L8 · Degradation ──────────────────────────────────────────────────────
  const breaker = getBreakerState();
  add('L8 Circuit breaker closed', !breaker.open,
    breaker.open ? `OPEN (${breaker.consecutiveFailures} failures)` : 'closed');
  const embedded = await runCypher<{ n: number }>(
    `MATCH (n:Kag) WHERE n.embedding IS NOT NULL RETURN count(n) AS n`, {}, { quiet: true });
  add('L8 Embeddings', true,
    !embeddingsAvailable()
      ? 'GOOGLE_AI_API_KEY empty — full-text only (not a failure)'
      : `${embedded[0]?.n ?? 0} nodes embedded; vector seeds ` +
        `${KAG_CONFIG.vectorSeeds ? 'ON' : 'OFF (default — see config.ts for why)'}`);

  await closeDriver();
  report();
}

function report() {
  console.log('');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : (r.fatal ? '💥' : '❌')} ${r.name.padEnd(46)} ${r.detail}`);
  }
  const failed = results.filter(r => !r.ok);
  console.log('\n══ Result ═══════════════════════════════════════════════');
  console.log(`${results.length - failed.length}/${results.length} checks passed`);

  if (failed.length === 0) {
    console.log('\n✅ KAG is working end to end.');
    console.log('   Note: this proves the KAG layers only. Report GENERATION is the LLM,');
    console.log('   which is downstream — see the note below.');
  } else {
    console.log(`\n❌ ${failed.length} failing:`);
    for (const f of failed) console.log(`   • ${f.name} — ${f.detail}`);
  }

  console.log('\n── What this does NOT cover ─────────────────────────────');
  console.log('Report generation (the card content) is produced by the LLM, downstream of');
  console.log('every check above. "I encountered an error generating the report" with these');
  console.log('checks green means the MODEL is failing, not KAG. Check ANTHROPIC_API_KEY');
  console.log('(sonnet) or GOOGLE_AI_API_KEY (gemma) in backend/.env.');
  process.exit(failed.length ? 1 : 0);
}

main().catch(async e => {
  console.error('💥 verification crashed:', e);
  process.exit(1);
});
