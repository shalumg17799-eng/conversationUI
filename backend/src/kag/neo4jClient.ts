// Neo4j driver wrapper — mirrors the shape of lib/bigqueryClient.ts on purpose:
// env-driven construction, a single module-level client, and ENTRY/EXIT logs with
// timings so graph calls are as traceable as BigQuery calls already are.
//
// The driver pools connections internally. NEVER construct a driver per request.

import neo4j, { Driver, Record as Neo4jRecord } from 'neo4j-driver';
import { KAG_CONFIG, isKagConfigured } from './config';

let _driver: Driver | null = null;

/**
 * Lazily construct the shared driver. Returns null when credentials are absent so
 * callers degrade to "KAG unavailable" instead of throwing at import time — an
 * unconfigured Neo4j must never prevent the server from booting.
 */
export function getDriver(): Driver | null {
  if (_driver) return _driver;
  if (!isKagConfigured()) return null;

  _driver = neo4j.driver(
    KAG_CONFIG.uri,
    neo4j.auth.basic(KAG_CONFIG.user, KAG_CONFIG.password),
    {
      maxConnectionPoolSize: 20,
      connectionAcquisitionTimeout: 5_000,
      maxTransactionRetryTime: 5_000,
      // Return plain JS numbers rather than neo4j Integer objects. Our values are
      // counts, weights and scores — all far inside the safe-integer range.
      disableLosslessIntegers: true,
    },
  );
  return _driver;
}

export interface CypherOptions {
  /** READ routes to a replica on Aura; WRITE goes to the leader. Default: read. */
  access?: 'read' | 'write';
  /** Overrides KAG_CONFIG.timeoutMs. Builder writes need much longer than reads. */
  timeoutMs?: number;
  /** Suppresses the ENTRY/EXIT log line for hot-path or high-frequency calls. */
  quiet?: boolean;
}

/**
 * Run a parameterized Cypher statement and return plain objects.
 *
 * All user-derived values MUST arrive via `params` — never interpolated into
 * `query`. The single exception is the relationship type in the builder, which is
 * validated against KAG_REL_TYPES before interpolation.
 */
export async function runCypher<T = Record<string, unknown>>(
  query: string,
  params: Record<string, unknown> = {},
  opts: CypherOptions = {},
): Promise<T[]> {
  const driver = getDriver();
  if (!driver) throw new Error('[Neo4j] Not configured — set NEO4J_URI and NEO4J_PASSWORD');

  const access = opts.access ?? 'read';
  const timeoutMs = opts.timeoutMs ?? KAG_CONFIG.timeoutMs;
  const label = query.trim().split('\n')[0].slice(0, 60);

  if (!opts.quiet) console.log(`[Neo4j ENTRY] access=${access} q="${label}..."`);

  const session = driver.session({
    database: KAG_CONFIG.database,
    defaultAccessMode: access === 'write' ? neo4j.session.WRITE : neo4j.session.READ,
  });

  const t0 = Date.now();
  try {
    const work = (tx: any) => tx.run(query, params);
    const result = access === 'write'
      ? await session.executeWrite(work, { timeout: timeoutMs })
      : await session.executeRead(work, { timeout: timeoutMs });

    const rows = (result.records as Neo4jRecord[]).map(r => r.toObject() as T);
    const durationMs = Date.now() - t0;
    if (!opts.quiet) console.log(`[Neo4j EXIT]  rows=${rows.length} duration=${durationMs}ms`);
    return rows;
  } catch (err) {
    console.error(`[Neo4j ERROR] after ${Date.now() - t0}ms q="${label}...":`, (err as Error).message);
    throw err;
  } finally {
    await session.close();
  }
}

/**
 * Verify connectivity and report server version. Used by `npm run kag:ping` and by
 * the startup warmup — the warmup call also pays the TLS handshake cost so the first
 * real user query does not (plan §6).
 */
export async function verifyConnectivity(): Promise<{ ok: boolean; version?: string; error?: string }> {
  const driver = getDriver();
  if (!driver) return { ok: false, error: 'NEO4J_URI / NEO4J_PASSWORD not set' };

  try {
    const info = await driver.getServerInfo({ database: KAG_CONFIG.database });
    return { ok: true, version: `${info.agent ?? 'neo4j'} @ ${info.address ?? KAG_CONFIG.uri}` };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Probe whether APOC path expansion is callable on this instance. The retriever
 * prefers apoc.path.expandConfig and falls back to plain variable-length Cypher.
 * Aura restricts the procedure allowlist, so this is checked at startup rather than
 * discovered mid-query.
 */
export async function hasApocPathExpand(): Promise<boolean> {
  try {
    const rows = await runCypher<{ name: string }>(
      `SHOW PROCEDURES YIELD name WHERE name = 'apoc.path.expandConfig' RETURN name`,
      {},
      { quiet: true, timeoutMs: 5_000 },
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

/** Close the shared driver. Wired to SIGTERM so Azure restarts drain cleanly. */
export async function closeDriver(): Promise<void> {
  if (!_driver) return;
  await _driver.close();
  _driver = null;
  console.log('[Neo4j] Driver closed');
}
