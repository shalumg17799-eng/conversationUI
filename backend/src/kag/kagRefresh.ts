// Keeping the graph in step with BigQuery.
//
// Gap this closes: buildKagGraph used to be reachable ONLY from `npm run kag:build`.
// The markdown catalog refreshed on startup and every 24h, but the graph did not — so
// a table added or dropped in BigQuery left the graph silently wrong until a human
// remembered to rebuild. Silent staleness is the worst failure mode a grounding layer
// can have, because every answer still looks confident.
//
// Two guards make this safe to call from a request handler and a timer:
//   • single-flight — a rebuild takes ~40s (BigQuery schema + entity scan), and
//     overlapping rebuilds would fight over the same mark-and-sweep stamp.
//   • never throws — a failed rebuild leaves the previous graph in place, which is
//     stale but coherent. Tearing it down on failure would be strictly worse.

import { buildKagGraph } from './kagBuilder';
import { isKagConfigured } from './config';

export interface KagRefreshResult {
  ran: boolean;
  reason?: string;
  nodes?: number;
  edges?: number;
  durationMs?: number;
  builtAt?: string;
}

let inFlight: Promise<KagRefreshResult> | null = null;
let lastRefreshAt = 0;

/** Skip entity re-scan on scheduled runs unless the graph is older than this. */
const FULL_REBUILD_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function lastKagRefresh(): number {
  return lastRefreshAt;
}

/**
 * Rebuild the graph. Concurrent callers share one in-flight rebuild rather than
 * queueing a second.
 *
 * @param trigger label for the log line — 'startup' | 'scheduler' | 'manual'
 * @param withEntities entity scan costs one BigQuery query per STRING dimension, so
 *   scheduled runs skip it unless the graph is a full interval old.
 */
export async function refreshKagGraph(trigger: string, withEntities?: boolean): Promise<KagRefreshResult> {
  if (!isKagConfigured()) return { ran: false, reason: 'neo4j not configured' };
  if (inFlight) return inFlight;

  const includeEntities = withEntities ?? (Date.now() - lastRefreshAt > FULL_REBUILD_INTERVAL_MS);

  inFlight = (async (): Promise<KagRefreshResult> => {
    try {
      console.log(`[KAG Refresh] rebuild triggered by ${trigger} (entities=${includeEntities})`);
      const report = await buildKagGraph(includeEntities);
      lastRefreshAt = Date.now();
      console.log(`[KAG Refresh] done — ${report.nodeCount} nodes, ${report.edgeCount} edges, ` +
        `swept ${report.sweptNodes}, ${report.durationMs}ms`);
      return {
        ran: true,
        nodes: report.nodeCount,
        edges: report.edgeCount,
        durationMs: report.durationMs,
        builtAt: report.builtAt,
      };
    } catch (err) {
      // Deliberately non-fatal: the existing graph stays serving.
      console.error(`[KAG Refresh] FAILED (${trigger}) — previous graph left in place:`,
        (err as Error).message);
      return { ran: false, reason: (err as Error).message };
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
