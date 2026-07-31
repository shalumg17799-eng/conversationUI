// Phase 2 shadow mode — run retrieval alongside the live path, record everything,
// change nothing (plan §Phase 2).
//
// Two hard rules, both of which this file exists to enforce:
//
//   1. NOTHING here may affect the response. The return value is deliberately void.
//      If a caller cannot use the result, a bug here cannot corrupt a user's answer.
//   2. NOTHING here may add latency. Callers invoke it fire-and-forget (`void
//      runShadow(...)`), so retrieval overlaps the LLM call already in flight rather
//      than sitting in front of it.
//
// Shadow stays on until /api/metrics/kag reports shadow.agreementRate >= 0.90; only
// then does Phase 3 flip KAG_ENABLED and start *using* the pack.

import { KAG_CONFIG, isKagConfigured } from './config';
import { retrieve } from './kagRetriever';
import { buildGroundingPack } from './groundingPack';
import { recordRetrieval, recordAgreement, recordTokens } from './kagTelemetry';
import { loadCatalogContext } from '../services/catalogRefresher';

/**
 * Record what KAG *would* have retrieved for `query`, and whether its top candidate
 * table matches what the live pipeline actually routed to.
 *
 * `liveTable` is the live routing decision — null when the pipeline chose to clarify
 * rather than route, in which case there is nothing to agree or disagree with and
 * recordAgreement skips the comparison.
 *
 * Never throws. Never returns anything a caller could act on.
 */
export async function runShadow(query: string, liveTable: string | null): Promise<void> {
  if (!KAG_CONFIG.shadow || !isKagConfigured()) return;

  try {
    const subgraph = await retrieve(query);
    recordRetrieval(subgraph, query);

    const pack = buildGroundingPack(subgraph);

    // The token comparison is the whole economic argument for KAG, so measure it
    // against what the live path actually injects rather than asserting a saving.
    // Only compare when there IS a pack — an empty pack against a full catalog would
    // flatter the numbers by counting fallbacks as a 100% saving.
    if (pack.text) {
      const catalogContext = await loadCatalogContext().catch(() => '');
      recordTokens(pack.text, catalogContext || null);
    }

    recordAgreement(subgraph.candidateTables[0]?.table ?? null, liveTable, query);
  } catch (err) {
    // Shadow mode failing must be invisible to the request. Telemetry inside
    // retrieve() already recorded the failure and tripped the breaker if needed.
    console.warn('[KAG SHADOW] suppressed error:', (err as Error).message?.slice(0, 200));
  }
}
