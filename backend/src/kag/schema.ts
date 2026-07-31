// Neo4j schema: constraints and indexes. Idempotent — safe to run on every startup.
//
// Every node also carries the shared :Kag label. The full-text index spans :Kag, so
// seed matching is ONE index hit rather than one per node label.

import { runCypher } from './neo4jClient';

/** Embedding dimensions for Phase 5 (Gemini text-embedding-004 → 768). */
export const EMBEDDING_DIMENSIONS = 768;

const CORE_STATEMENTS: Array<{ name: string; cypher: string }> = [
  {
    name: 'constraint:kag_id',
    cypher: `CREATE CONSTRAINT kag_id IF NOT EXISTS
             FOR (n:Kag) REQUIRE n.id IS UNIQUE`,
  },
  {
    name: 'index:kag_type',
    cypher: `CREATE INDEX kag_type IF NOT EXISTS FOR (n:Kag) ON (n.type)`,
  },
  {
    name: 'index:kag_builtAt',
    cypher: `CREATE INDEX kag_built_at IF NOT EXISTS FOR (n:Kag) ON (n.builtAt)`,
  },
  {
    name: 'fulltext:kag_search',
    // Lucene over display name + joined aliases. This replaces the hand-rolled
    // trigram/Jaro matcher an in-process store would have needed.
    cypher: `CREATE FULLTEXT INDEX kag_search IF NOT EXISTS
             FOR (n:Kag) ON EACH [n.label, n.aliasText]`,
  },
];

// Vector index is Neo4j 5.13+. Kept separate because failure here is non-fatal:
// Phase 5 semantic ranking degrades to full-text only.
const VECTOR_STATEMENT = {
  name: 'vector:kag_embedding',
  cypher: `CREATE VECTOR INDEX kag_embedding IF NOT EXISTS
           FOR (n:Kag) ON (n.embedding)
           OPTIONS { indexConfig: {
             \`vector.dimensions\`: ${EMBEDDING_DIMENSIONS},
             \`vector.similarity_function\`: 'cosine' } }`,
};

export interface SchemaResult {
  applied: string[];
  failed: Array<{ name: string; error: string }>;
  vectorIndexAvailable: boolean;
}

/**
 * Apply constraints and indexes. Statements run one at a time — Neo4j does not
 * accept multiple schema commands in a single query.
 */
export async function applySchema(): Promise<SchemaResult> {
  const applied: string[] = [];
  const failed: Array<{ name: string; error: string }> = [];

  for (const stmt of CORE_STATEMENTS) {
    try {
      await runCypher(stmt.cypher, {}, { access: 'write', timeoutMs: 30_000, quiet: true });
      applied.push(stmt.name);
    } catch (err) {
      failed.push({ name: stmt.name, error: (err as Error).message });
      console.error(`[KAG Schema] FAILED ${stmt.name}:`, (err as Error).message);
    }
  }

  let vectorIndexAvailable = false;
  try {
    await runCypher(VECTOR_STATEMENT.cypher, {}, { access: 'write', timeoutMs: 30_000, quiet: true });
    applied.push(VECTOR_STATEMENT.name);
    vectorIndexAvailable = true;
  } catch (err) {
    // Non-fatal: older Neo4j without vector index support. Phase 5 falls back to
    // full-text-only ranking.
    console.warn('[KAG Schema] Vector index unavailable (Phase 5 will use full-text only):',
      (err as Error).message);
  }

  console.log(`[KAG Schema] applied=${applied.length} failed=${failed.length} vector=${vectorIndexAvailable}`);
  return { applied, failed, vectorIndexAvailable };
}

/** Node/relationship counts by type — powers GET /api/kag/stats. */
export async function getGraphStats(): Promise<{
  nodesByLabel: Record<string, number>;
  relsByType: Record<string, number>;
  totalNodes: number;
  totalRels: number;
  builtAt: string | null;
}> {
  const nodeRows = await runCypher<{ type: string; count: number }>(
    `MATCH (n:Kag) RETURN n.type AS type, count(*) AS count ORDER BY count DESC`,
    {}, { timeoutMs: 10_000, quiet: true },
  );
  const relRows = await runCypher<{ type: string; count: number }>(
    `MATCH (:Kag)-[r]->(:Kag) RETURN type(r) AS type, count(*) AS count ORDER BY count DESC`,
    {}, { timeoutMs: 10_000, quiet: true },
  );
  const builtRows = await runCypher<{ builtAt: string | null }>(
    `MATCH (n:Kag) RETURN max(n.builtAt) AS builtAt`,
    {}, { timeoutMs: 10_000, quiet: true },
  );

  const nodesByLabel: Record<string, number> = {};
  for (const r of nodeRows) nodesByLabel[r.type] = Number(r.count);
  const relsByType: Record<string, number> = {};
  for (const r of relRows) relsByType[r.type] = Number(r.count);

  return {
    nodesByLabel,
    relsByType,
    totalNodes: Object.values(nodesByLabel).reduce((a, b) => a + b, 0),
    totalRels: Object.values(relsByType).reduce((a, b) => a + b, 0),
    builtAt: builtRows[0]?.builtAt ?? null,
  };
}
