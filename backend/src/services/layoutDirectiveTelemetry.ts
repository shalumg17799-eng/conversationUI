import { ParseResult } from './layoutDirective';

// Adaptive UI: in-memory observability for the layout-directive intent path.
// Passive — no effect on the request path. Mirrors the other governance telemetry
// modules (output-mode, validation, constraints, governor). Reset for tests/ops.

interface LayoutMetrics {
  detected: number;                 // queries classified as UI-personalization
  applied: number;                  // requests that produced ≥1 valid directive
  directivesApplied: number;        // total valid directives emitted
  directivesRejected: number;       // total unsupported/invalid directives
  byOp: Record<string, number>;     // valid directives by op
  bySource: Record<string, number>; // deterministic | llm | none
  rejectionReasons: Record<string, number>;
}

const metrics: LayoutMetrics = {
  detected: 0,
  applied: 0,
  directivesApplied: 0,
  directivesRejected: 0,
  byOp: {},
  bySource: {},
  rejectionReasons: {},
};

export function recordLayoutDirective(result: ParseResult, ctx: { query: string; provider: string }): void {
  metrics.detected += 1;
  if (result.directives.length > 0) metrics.applied += 1;
  metrics.directivesApplied += result.directives.length;
  metrics.directivesRejected += result.rejected.length;
  metrics.bySource[result.source] = (metrics.bySource[result.source] ?? 0) + 1;
  for (const d of result.directives) {
    metrics.byOp[d.op] = (metrics.byOp[d.op] ?? 0) + 1;
  }
  for (const r of result.rejected) {
    metrics.rejectionReasons[r.reason] = (metrics.rejectionReasons[r.reason] ?? 0) + 1;
  }
  console.log(
    `[LayoutDirective] applied=${result.directives.length} rejected=${result.rejected.length}` +
    ` source=${result.source} provider=${ctx.provider} query=${JSON.stringify(ctx.query.slice(0, 80))}`,
  );
}

export function getLayoutMetrics(): LayoutMetrics {
  return {
    detected: metrics.detected,
    applied: metrics.applied,
    directivesApplied: metrics.directivesApplied,
    directivesRejected: metrics.directivesRejected,
    byOp: { ...metrics.byOp },
    bySource: { ...metrics.bySource },
    rejectionReasons: { ...metrics.rejectionReasons },
  };
}

export function getLayoutSummary() {
  const m = getLayoutMetrics();
  const rate = (n: number, d: number) => (d ? +(n / d).toFixed(4) : 0);
  return {
    ...m,
    applyRate: rate(m.applied, m.detected),
    rejectionRate: rate(m.directivesRejected, m.directivesApplied + m.directivesRejected),
  };
}

export function resetLayoutMetrics(): void {
  metrics.detected = 0;
  metrics.applied = 0;
  metrics.directivesApplied = 0;
  metrics.directivesRejected = 0;
  metrics.byOp = {};
  metrics.bySource = {};
  metrics.rejectionReasons = {};
}
