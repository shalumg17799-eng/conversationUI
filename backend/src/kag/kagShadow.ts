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
import { trace } from './kagTrace';
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

    // Feed the demo trace. Without this the kag_debug panel is blank in shadow mode —
    // the SHIPPED DEFAULT — because kagGrounding only traces retrieval on the active
    // path, and this is the only place retrieval happens while shadowing. The panel
    // built to show KAG working showed least in the configuration it ships with.
    //
    // No double-counting: runShadow returns early unless shadow is on, and
    // kagGrounding traces retrieval only when shadow is off. Mutually exclusive.
    //
    // AsyncLocalStorage propagates through the `void runShadow(...)` call, so this
    // writes to the right request's store. It IS a race against the kag_debug emit,
    // but not a close one: retrieval is ~200ms and the emit happens after the LLM
    // call, seconds later. Telemetry, so a lost race costs a blank panel, not a wrong
    // answer.
    trace({
      retrieval: {
        source: subgraph.source,
        latencyMs: subgraph.latencyMs,
        seeds: subgraph.seeds.slice(0, 4).map(s => ({ id: s.nodeId, score: +s.score.toFixed(3) })),
        candidates: subgraph.candidateTables.slice(0, 4).map(c => ({ table: c.table, score: +c.score.toFixed(3) })),
        nodes: subgraph.nodes.length,
        truncated: subgraph.truncated,
      },
    });

    const pack = buildGroundingPack(subgraph);

    // The token comparison is the whole economic argument for KAG, so measure it
    // against what the live path actually injects rather than asserting a saving.
    // Only compare when there IS a pack — an empty pack against a full catalog would
    // flatter the numbers by counting fallbacks as a 100% saving.
    if (pack.text) {
      const catalogContext = await loadCatalogContext().catch(() => '');
      recordTokens(pack.text, catalogContext || null);
      // Shows the token saving KAG WOULD deliver. Deliberately does not overwrite the
      // `grounding` field: kagGrounding already recorded the markdown fallback that
      // actually went into the prompt, and claiming the pack was used when it was not
      // is exactly the kind of flattering telemetry that makes a demo untrustworthy.
      trace({
        shadowPack: {
          packTokens: pack.tokens,
          catalogTokens: Math.ceil((catalogContext || '').length / 4),
          tables: pack.tablesIncluded,
        },
      });
    }

    recordAgreement(subgraph.candidateTables[0]?.table ?? null, liveTable, query);
  } catch (err) {
    // Shadow mode failing must be invisible to the request. Telemetry inside
    // retrieve() already recorded the failure and tripped the breaker if needed.
    console.warn('[KAG SHADOW] suppressed error:', (err as Error).message?.slice(0, 200));
  }
}
