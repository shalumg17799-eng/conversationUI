// Phase 0 connectivity smoke test. Run from the repo root:
//   npm run kag:ping
//
// Verifies, in order: credentials present → driver connects → schema applies →
// APOC path expansion available → current graph contents. Every one of these has
// been a real first-deploy blocker, so each is reported separately.

import { KAG_CONFIG, isKagConfigured } from '../backend/src/kag/config';
import { verifyConnectivity, hasApocPathExpand, closeDriver } from '../backend/src/kag/neo4jClient';
import { applySchema, getGraphStats } from '../backend/src/kag/schema';

async function main() {
  console.log('── KAG connectivity check ───────────────────────────────');
  console.log(`URI:      ${KAG_CONFIG.uri || '(not set)'}`);
  console.log(`Database: ${KAG_CONFIG.database}`);
  console.log(`Enabled:  ${KAG_CONFIG.enabled}  Shadow: ${KAG_CONFIG.shadow}`);
  console.log('');

  if (!isKagConfigured()) {
    console.error('❌ NEO4J_URI / NEO4J_PASSWORD not set in backend/.env');
    console.error('');
    console.error('   Local:  docker compose -f docker-compose.kag.yml up -d');
    console.error('           NEO4J_URI=bolt://localhost:7687');
    console.error('           NEO4J_USER=neo4j');
    console.error('           NEO4J_PASSWORD=localdevpassword');
    console.error('   Shared: create a free AuraDB at https://console.neo4j.io');
    process.exit(1);
  }

  const conn = await verifyConnectivity();
  if (!conn.ok) {
    console.error(`❌ Connection failed: ${conn.error}`);
    console.error('   If this is Azure → Aura, confirm outbound bolt+s (7687) is permitted.');
    await closeDriver();
    process.exit(1);
  }
  console.log(`✅ Connected — ${conn.version}`);

  const schema = await applySchema();
  console.log(`✅ Schema applied: ${schema.applied.join(', ')}`);
  if (schema.failed.length) {
    console.error(`❌ Schema failures: ${schema.failed.map(f => `${f.name} (${f.error})`).join('; ')}`);
  }
  console.log(`${schema.vectorIndexAvailable ? '✅' : '⚠️ '} Vector index ${schema.vectorIndexAvailable ? 'available' : 'unavailable — Phase 5 will use full-text only'}`);

  const apoc = await hasApocPathExpand();
  console.log(`${apoc ? '✅' : '⚠️ '} APOC path expansion ${apoc ? 'available' : 'NOT available — retriever will use the plain-Cypher fallback'}`);

  const stats = await getGraphStats();
  console.log('');
  console.log(`Graph: ${stats.totalNodes} nodes, ${stats.totalRels} relationships`);
  console.log(`Built: ${stats.builtAt ?? '(never — run npm run kag:build)'}`);
  if (stats.totalNodes > 0) {
    console.log(`Nodes: ${Object.entries(stats.nodesByLabel).map(([k, v]) => `${k}=${v}`).join(' ')}`);
    console.log(`Rels:  ${Object.entries(stats.relsByType).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  }

  await closeDriver();
  console.log('');
  console.log('── OK ───────────────────────────────────────────────────');
}

main().catch(async err => {
  console.error('💥 kag:ping failed:', err);
  await closeDriver().catch(() => {});
  process.exit(1);
});
