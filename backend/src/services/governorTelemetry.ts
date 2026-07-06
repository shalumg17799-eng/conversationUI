import { GovernorOutcome, GovernorMode, GovernorAction } from './governor';

// Phase 5: governor observability. Aggregates outcomes across requests.

interface GovernorMetrics {
  total: number;
  byMode: Record<GovernorMode, number>;
  changed: number;       // reports modified (enforce) or that would be (shadow)
  retried: number;
  fallbacks: number;
  byAction: Record<GovernorAction, number>;
  droppedByComponent: Record<string, number>;
}

const metrics: GovernorMetrics = {
  total: 0,
  byMode: { off: 0, shadow: 0, enforce: 0 },
  changed: 0,
  retried: 0,
  fallbacks: 0,
  byAction: { structural_retry: 0, drop_card: 0, primary_cap: 0, trim_budget: 0, fallback: 0 },
  droppedByComponent: {},
};

export function recordGovernor(o: GovernorOutcome): void {
  try {
    metrics.total += 1;
    metrics.byMode[o.mode] += 1;
    if (o.changed) metrics.changed += 1;
    if (o.retried) metrics.retried += 1;
    if (o.usedFallback) metrics.fallbacks += 1;
    for (const d of o.decisions) {
      metrics.byAction[d.action] = (metrics.byAction[d.action] ?? 0) + 1;
      if ((d.action === 'drop_card' || d.action === 'primary_cap' || d.action === 'trim_budget') && d.component) {
        metrics.droppedByComponent[d.component] = (metrics.droppedByComponent[d.component] ?? 0) + 1;
      }
    }
  } catch (err) {
    console.error('[Governor] telemetry error (ignored):', err);
  }
}

export function getGovernorMetrics(): GovernorMetrics {
  return {
    total: metrics.total,
    byMode: { ...metrics.byMode },
    changed: metrics.changed,
    retried: metrics.retried,
    fallbacks: metrics.fallbacks,
    byAction: { ...metrics.byAction },
    droppedByComponent: { ...metrics.droppedByComponent },
  };
}

export function getGovernorSummary() {
  const m = getGovernorMetrics();
  const topDropped = Object.entries(m.droppedByComponent)
    .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([component, count]) => ({ component, count }));
  return {
    total: m.total,
    byMode: m.byMode,
    changed: m.changed,
    changeRate: m.total ? +(m.changed / m.total).toFixed(4) : 0,
    retried: m.retried,
    fallbacks: m.fallbacks,
    byAction: m.byAction,
    topDroppedComponents: topDropped,
  };
}

export function resetGovernorMetrics(): void {
  metrics.total = 0;
  metrics.byMode = { off: 0, shadow: 0, enforce: 0 };
  metrics.changed = 0;
  metrics.retried = 0;
  metrics.fallbacks = 0;
  metrics.byAction = { structural_retry: 0, drop_card: 0, primary_cap: 0, trim_budget: 0, fallback: 0 };
  metrics.droppedByComponent = {};
}
