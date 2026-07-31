// Phase 1 graph build. Run from the repo root:
//   npm run kag:build        # assemble + write to Neo4j
//   npm run kag:build:dry    # assemble only, no Neo4j required
//
// Requires both BigQuery credentials (physical schema) and Neo4j credentials (store).
// Idempotent: two consecutive runs must report identical node/edge counts.
//
// Pass --dry to assemble the graph and write unmapped.json WITHOUT touching Neo4j —
// useful for reviewing what would be built, and it needs no graph database at all.

import { assembleGraph, buildKagGraph, writeUnmappedReport } from '../backend/src/kag/kagBuilder';
import { embedGraph, embeddingsAvailable } from '../backend/src/kag/kagEmbeddings';
import { closeDriver } from '../backend/src/kag/neo4jClient';
import { isKagConfigured } from '../backend/src/kag/config';

const dry = process.argv.includes('--dry');
// Phase 5 entity scan costs one BigQuery query per STRING dimension column.
const includeEntities = !process.argv.includes('--no-entities');
// Embeddings are opt-in: they cost Gemini API calls and only improve ranking.
const withEmbeddings = process.argv.includes('--embed') || process.argv.includes('--embed-force');
// --embed-force re-embeds nodes that already have a vector (model or dimension change).
const forceEmbed = process.argv.includes('--embed-force');

async function main() {
  if (dry) {
    console.log('── KAG build (DRY RUN — Neo4j not written) ──────────────');
    const g = await assembleGraph(includeEntities);
    const byType: Record<string, number> = {};
    for (const n of g.nodes) byType[n.type] = (byType[n.type] ?? 0) + 1;
    const byRel: Record<string, number> = {};
    for (const e of g.edges) byRel[e.type] = (byRel[e.type] ?? 0) + 1;

    console.log(`Nodes: ${g.nodes.length} — ${Object.entries(byType).map(([k, v]) => `${k}=${v}`).join(' ')}`);
    console.log(`Edges: ${g.edges.length} — ${Object.entries(byRel).map(([k, v]) => `${k}=${v}`).join(' ')}`);
    console.log(`Schema OK:      ${g.tablesWithSchema.join(', ') || '(none)'}`);
    console.log(`Schema MISSING: ${g.tablesWithoutSchema.join(', ') || '(none)'}`);
    console.log(`Unmapped metrics: ${g.unmapped.length}`);
    for (const u of g.unmapped.slice(0, 10)) {
      const top = u.candidates[0];
      console.log(`  • ${u.metric} → ${top ? `${top.column} (${top.similarity})` : 'no candidate'}`);
    }
    if (g.unmapped.length > 10) console.log(`  … and ${g.unmapped.length - 10} more`);

    await writeUnmappedReport(new Date().toISOString(), g.tablesWithoutSchema, g.unmapped);

    // Distinguish "BigQuery is unreachable" (nothing resolved) from "some tables are
    // missing" (most resolved). The old single message claimed total failure whenever
    // one table was absent, printed directly beneath output proving Columns were built.
    if (g.tablesWithSchema.length === 0) {
      console.log('');
      console.log('⚠️  BigQuery schema was unavailable for EVERY table — the graph has NO Column');
      console.log('    or Dimension nodes, and no column candidates could be proposed. Routing-');
      console.log('    level nodes (Domain/Report/Metric/Term) are complete and usable.');
    } else if (g.tablesWithoutSchema.length > 0) {
      console.log('');
      console.log(`⚠️  ${g.tablesWithoutSchema.length} of ${g.tablesWithSchema.length + g.tablesWithoutSchema.length} tables have no schema in BigQuery:`);
      console.log(`    ${g.tablesWithoutSchema.join(', ')}`);
      console.log('    They are declared in DATA_SOURCES but do not exist. No :Table node, and no');
      console.log('    Report node backed by them, was created — retrieval cannot route to a table');
      console.log('    the query engine would fail on. Create the views or remove the entries.');
    }
    return;
  }

  if (!isKagConfigured()) {
    console.error('❌ NEO4J_URI / NEO4J_PASSWORD not set. Run with --dry to assemble without Neo4j.');
    process.exit(1);
  }

  const report = await buildKagGraph(includeEntities);
  console.log('');
  console.log('── Build report ─────────────────────────────────────────');
  console.log(`Nodes: ${report.nodeCount} — ${Object.entries(report.nodesByType).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  console.log(`Edges: ${report.edgeCount} — ${Object.entries(report.edgesByType).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  console.log(`Swept stale nodes: ${report.sweptNodes}`);
  console.log(`Unmapped metrics:  ${report.unmapped.length} (see backend/data/kag/unmapped.json)`);
  if (report.entityStats) {
    const e = report.entityStats;
    console.log(`Entities: ${e.entitiesAdded} from ${e.columnsScanned} column(s), ${e.columnsSkipped.length} skipped${e.capped ? ' (TOTAL CAP HIT)' : ''}`);
    for (const s of e.columnsSkipped) console.log(`  skipped ${s}`);
  }
  console.log(`Duration: ${report.durationMs}ms`);

  if (withEmbeddings) {
    if (!embeddingsAvailable()) {
      console.warn('\n⚠️  --embed requested but GOOGLE_AI_API_KEY is not set — skipping.');
    } else {
      console.log('\n── Embedding nodes (Phase 5 vector index) ──────────────');
      const emb = await embedGraph(forceEmbed);
      console.log(`Embedded ${emb.embedded}/${emb.attempted} nodes${emb.skipped ? ' — ' + emb.skipped : ''}`);
    }
  }

  await closeDriver();
}

main().catch(async err => {
  console.error('💥 kag:build failed:', err);
  await closeDriver().catch(() => {});
  process.exit(1);
});
