// Phase 5 — semantic seed matching via Neo4j's native vector index.
//
// Embeddings are stored as a node property and queried through the `kag_embedding`
// index created in schema.ts. This is the concrete payoff of choosing Neo4j: there is
// no separate embeddings file and no in-process cosine loop — the database does it.
//
// Degrades cleanly. No GOOGLE_AI_API_KEY, no vector index, or an embedding call that
// fails ⇒ retrieval keeps working on full-text alone. Semantic matching is a ranking
// improvement, never a dependency.

import { GoogleGenAI } from '@google/genai';
import { runCypher } from './neo4jClient';
import { EMBEDDING_DIMENSIONS } from './schema';
import { KAG_CONFIG } from './config';

// gemini-embedding-001 natively returns 3072 dims. `text-embedding-004` is NOT
// available on the v1beta endpoint this SDK targets — it 404s. Verify with:
//   GET https://generativelanguage.googleapis.com/v1beta/models?key=…
// and look for models advertising `embedContent`.
const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_BATCH = 50;

let _ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI | null {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return null;
  if (!_ai) _ai = new GoogleGenAI({ apiKey });
  return _ai;
}

export function embeddingsAvailable(): boolean {
  return Boolean(process.env.GOOGLE_AI_API_KEY);
}

/** Scale to unit length. A zero vector is returned unchanged rather than NaN-ing. */
function normalize(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const n = Math.sqrt(sum);
  return n > 0 ? v.map(x => x / n) : v;
}

/**
 * Embed a batch of texts. Returns null when embeddings are unavailable or the call
 * fails — callers must treat null as "skip semantic ranking", not as an error.
 */
export async function embed(texts: string[]): Promise<number[][] | null> {
  const ai = getAI();
  if (!ai || texts.length === 0) return null;

  try {
    const res: any = await ai.models.embedContent({
      model: EMBED_MODEL,
      contents: texts,
      // Matryoshka truncation down to the index width. NOTE the nesting: passing
      // outputDimensionality at the top level is silently ignored and you get 3072
      // back, which the 768-wide index rejects.
      config: { outputDimensionality: EMBEDDING_DIMENSIONS },
    });
    // The SDK has moved this field around across versions; accept both shapes rather
    // than pinning to one and breaking silently on upgrade.
    const raw: any[] = res?.embeddings ?? res?.embedding ?? [];
    const vectors = raw
      .map(e => (Array.isArray(e) ? e : e?.values ?? e?.value))
      .filter((v: unknown): v is number[] => Array.isArray(v));

    if (vectors.length !== texts.length) {
      console.warn(`[KAG Embeddings] expected ${texts.length} vectors, got ${vectors.length} — skipping batch`);
      return null;
    }
    const dim = vectors[0]?.length ?? 0;
    if (dim !== EMBEDDING_DIMENSIONS) {
      // A dimension mismatch would be silently rejected by the index, so fail loudly.
      console.error(`[KAG Embeddings] model returned ${dim}-dim vectors but the index expects ${EMBEDDING_DIMENSIONS}. ` +
        `Fix EMBEDDING_DIMENSIONS in schema.ts and recreate the index.`);
      return null;
    }
    // Matryoshka-truncated vectors are NOT unit length (observed L2 ≈ 0.59 at 768 of
    // 3072). Cosine similarity in the index assumes normalised input, so renormalise
    // here — skipping this does not error, it just quietly degrades ranking.
    return vectors.map(normalize);
  } catch (err) {
    console.warn('[KAG Embeddings] embed failed:', (err as Error).message?.slice(0, 160));
    return null;
  }
}

export interface EmbedGraphResult {
  attempted: number;
  embedded: number;
  skipped: string;
}

/**
 * Embed each node's label + aliases and store the vector on the node.
 * Safe and cheap to re-run: already-embedded nodes are skipped unless `force`.
 */
export async function embedGraph(force = false): Promise<EmbedGraphResult> {
  if (!embeddingsAvailable()) {
    return { attempted: 0, embedded: 0, skipped: 'GOOGLE_AI_API_KEY not set' };
  }

  // Entities are excluded: there can be thousands of them, they are matched exactly by
  // name via full-text, and embedding them would dominate cost for no ranking gain.
  //
  // Nodes that already carry an embedding are skipped unless `force` is set. Free-tier
  // quotas cut a full run short (observed: 100 of 187 before a 429), and without this
  // a re-run would burn the fresh quota re-embedding what already succeeded and stall
  // in the same place forever.
  const nodes = await runCypher<{ id: string; text: string }>(
    `MATCH (n:Kag)
     WHERE n.type <> 'Entity' AND ($force OR n.embedding IS NULL)
     RETURN n.id AS id,
            n.label + CASE WHEN n.aliasText IS NULL OR n.aliasText = '' THEN '' ELSE ' | ' + n.aliasText END AS text
     ORDER BY n.id`,
    { force }, { timeoutMs: 30_000, quiet: true },
  );

  if (nodes.length === 0) {
    return { attempted: 0, embedded: 0, skipped: 'all nodes already embedded (use --embed-force to redo)' };
  }

  let embedded = 0;
  for (let i = 0; i < nodes.length; i += EMBED_BATCH) {
    const batch = nodes.slice(i, i + EMBED_BATCH);
    const vectors = await embed(batch.map(n => n.text));
    if (!vectors) {
      // Almost always a 429. Stop rather than hammer the remaining batches into the
      // same wall — progress so far is persisted, so a later re-run resumes.
      console.warn(`[KAG Embeddings] batch failed at ${embedded}/${nodes.length} — stopping; re-run to resume`);
      break;
    }

    await runCypher(
      `UNWIND $rows AS row
       MATCH (n:Kag {id: row.id})
       CALL db.create.setNodeVectorProperty(n, 'embedding', row.vector)`,
      { rows: batch.map((n, j) => ({ id: n.id, vector: vectors[j] })) },
      { access: 'write', timeoutMs: 60_000, quiet: true },
    );
    embedded += batch.length;
    console.log(`[KAG Embeddings] ${embedded}/${nodes.length}`);
  }

  return { attempted: nodes.length, embedded, skipped: '' };
}

export interface VectorSeed {
  id: string;
  score: number;
}

/**
 * Semantic seeds for a query. Returns [] (never throws) when unavailable, so the
 * retriever can blend unconditionally.
 */
export async function vectorSeeds(query: string, limit = KAG_CONFIG.maxSeeds): Promise<VectorSeed[]> {
  if (!embeddingsAvailable()) return [];

  try {
    const vectors = await embed([query]);
    if (!vectors) return [];

    const rows = await runCypher<{ id: string; score: number }>(
      // toInteger: disableLosslessIntegers means a JS number arrives as a float, and
      // the procedure's arity argument must be an integer.
      `CALL db.index.vector.queryNodes('kag_embedding', toInteger($limit), $vector)
       YIELD node, score
       RETURN node.id AS id, score`,
      { limit, vector: vectors[0] },
      { quiet: true },
    );
    return rows.map(r => ({ id: r.id, score: Number(r.score) }));
  } catch (err) {
    console.warn('[KAG Embeddings] vector search failed:', (err as Error).message?.slice(0, 160));
    return [];
  }
}
