// KAG observability — mirrors the existing passive telemetry modules
// (constraintTelemetry, outputModeTelemetry): record everything, break nothing.
//
// The metric that matters during Phase 2 is `agreementRate`: how often the top KAG
// candidate table matches what the live routing path actually chose. That number is
// the gate for turning KAG on (plan §5, Phase 2).

import { RetrievedSubgraph, KagRetrievalSource } from './types';

interface KagMetrics {
  retrievals: number;
  bySource: Record<KagRetrievalSource, number>;
  failures: number;
  timeouts: number;
  breakerOpens: number;
  truncated: number;
  lowConfidence: number;

  latencySumMs: number;
  latencyMaxMs: number;
  latencies: number[];        // bounded ring for percentiles

  seedsSum: number;
  nodesSum: number;

  // Shadow comparison — Phase 2 gate.
  comparisons: number;
  agreements: number;

  // Token accounting: is the pack actually smaller than the full catalog?
  packTokensSum: number;
  catalogTokensSum: number;
  tokenSamples: number;

  // Phase 4 grounding validation.
  validated: number;
  repaired: number;
  violations: number;
}

const LATENCY_RING = 500;

const metrics: KagMetrics = {
  retrievals: 0,
  bySource: { neo4j: 0, cache: 0, 'fallback-catalog': 0 },
  failures: 0,
  timeouts: 0,
  breakerOpens: 0,
  truncated: 0,
  lowConfidence: 0,
  latencySumMs: 0,
  latencyMaxMs: 0,
  latencies: [],
  seedsSum: 0,
  nodesSum: 0,
  comparisons: 0,
  agreements: 0,
  packTokensSum: 0,
  catalogTokensSum: 0,
  tokenSamples: 0,
  validated: 0,
  repaired: 0,
  violations: 0,
};

/** PASSIVE — wrapped so a telemetry bug can never break a request. */
export function recordRetrieval(sub: RetrievedSubgraph, query: string): void {
  try {
    metrics.retrievals += 1;
    metrics.bySource[sub.source] += 1;
    metrics.latencySumMs += sub.latencyMs;
    metrics.latencyMaxMs = Math.max(metrics.latencyMaxMs, sub.latencyMs);
    metrics.latencies.push(sub.latencyMs);
    if (metrics.latencies.length > LATENCY_RING) metrics.latencies.shift();
    metrics.seedsSum += sub.seeds.length;
    metrics.nodesSum += sub.nodes.length;
    if (sub.truncated) metrics.truncated += 1;

    const top = sub.candidateTables[0];
    console.log(
      `[KAG] source=${sub.source} ${sub.latencyMs}ms seeds=${sub.seeds.length} ` +
      `nodes=${sub.nodes.length} top=${top ? `${top.table}@${top.score.toFixed(2)}` : 'none'} ` +
      `truncated=${sub.truncated} q="${query.slice(0, 60)}"`,
    );
  } catch (err) {
    console.error('[KAG] telemetry error (ignored):', err);
  }
}

export function recordFailure(kind: 'error' | 'timeout' | 'breaker-open', detail: string): void {
  try {
    if (kind === 'timeout') metrics.timeouts += 1;
    else if (kind === 'breaker-open') metrics.breakerOpens += 1;
    else metrics.failures += 1;
    console.warn(`[KAG] ${kind}: ${detail}`);
  } catch { /* ignore */ }
}

export function recordLowConfidence(): void {
  try { metrics.lowConfidence += 1; } catch { /* ignore */ }
}

/**
 * Phase 2 shadow comparison. `liveTable` is what the existing pipeline actually
 * routed to; `kagTable` is what KAG would have chosen. Disagreements need triage —
 * some of them will be KAG being right.
 */
export function recordAgreement(kagTable: string | null, liveTable: string | null, query: string): void {
  try {
    if (!liveTable) return;
    metrics.comparisons += 1;
    if (kagTable === liveTable) {
      metrics.agreements += 1;
    } else {
      console.log(`[KAG SHADOW] DISAGREE kag=${kagTable ?? 'none'} live=${liveTable} q="${query.slice(0, 60)}"`);
    }
  } catch { /* ignore */ }
}

/** Rough token estimate (~4 chars/token). Good enough for a relative comparison. */
export function recordTokens(packText: string, catalogText: string | null): void {
  try {
    metrics.packTokensSum += Math.ceil(packText.length / 4);
    metrics.catalogTokensSum += Math.ceil((catalogText?.length ?? 0) / 4);
    metrics.tokenSamples += 1;
  } catch { /* ignore */ }
}

export function recordValidation(repaired: number, violations: number): void {
  try {
    metrics.validated += 1;
    metrics.repaired += repaired;
    metrics.violations += violations;
  } catch { /* ignore */ }
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export function getKagSummary() {
  const n = metrics.retrievals || 1;
  return {
    retrievals: metrics.retrievals,
    bySource: { ...metrics.bySource },
    failures: metrics.failures,
    timeouts: metrics.timeouts,
    breakerOpens: metrics.breakerOpens,
    truncated: metrics.truncated,
    lowConfidence: metrics.lowConfidence,
    latency: {
      avgMs: +(metrics.latencySumMs / n).toFixed(1),
      p50Ms: percentile(metrics.latencies, 50),
      p95Ms: percentile(metrics.latencies, 95),
      maxMs: metrics.latencyMaxMs,
    },
    avgSeeds: +(metrics.seedsSum / n).toFixed(2),
    avgNodes: +(metrics.nodesSum / n).toFixed(2),
    shadow: {
      comparisons: metrics.comparisons,
      agreements: metrics.agreements,
      // The Phase 2 gate: must reach 0.90 before KAG_ENABLED goes true.
      agreementRate: metrics.comparisons ? +(metrics.agreements / metrics.comparisons).toFixed(3) : null,
    },
    tokens: {
      samples: metrics.tokenSamples,
      avgPackTokens: metrics.tokenSamples ? Math.round(metrics.packTokensSum / metrics.tokenSamples) : 0,
      avgCatalogTokens: metrics.tokenSamples ? Math.round(metrics.catalogTokensSum / metrics.tokenSamples) : 0,
      avgSavedTokens: metrics.tokenSamples
        ? Math.round((metrics.catalogTokensSum - metrics.packTokensSum) / metrics.tokenSamples)
        : 0,
    },
    grounding: {
      validated: metrics.validated,
      repaired: metrics.repaired,
      violations: metrics.violations,
    },
  };
}

export function resetKagMetrics(): void {
  metrics.retrievals = 0;
  metrics.bySource = { neo4j: 0, cache: 0, 'fallback-catalog': 0 };
  metrics.failures = 0;
  metrics.timeouts = 0;
  metrics.breakerOpens = 0;
  metrics.truncated = 0;
  metrics.lowConfidence = 0;
  metrics.latencySumMs = 0;
  metrics.latencyMaxMs = 0;
  metrics.latencies = [];
  metrics.seedsSum = 0;
  metrics.nodesSum = 0;
  metrics.comparisons = 0;
  metrics.agreements = 0;
  metrics.packTokensSum = 0;
  metrics.catalogTokensSum = 0;
  metrics.tokenSamples = 0;
  metrics.validated = 0;
  metrics.repaired = 0;
  metrics.violations = 0;
}
