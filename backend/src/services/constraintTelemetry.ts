import { ConstraintSet } from './componentSelector';

// Phase 4: passive observability for advisory constraint derivation.
// Records the derived constraints per request; nothing here affects generation.

interface ConstraintMetrics {
  total: number;
  byOutputMode: Record<string, number>;
  byShapeKind: Record<string, number>;
  byMaxCards: Record<string, number>;
  byPrimaryFamily: Record<string, number>;
  allowedComponentsSum: number; // for average
}

const metrics: ConstraintMetrics = {
  total: 0,
  byOutputMode: {},
  byShapeKind: {},
  byMaxCards: {},
  byPrimaryFamily: {},
  allowedComponentsSum: 0,
};

// PASSIVE entrypoint — logs the constraint set and records it. Wrapped so a bug here
// can never break a render. Returns void.
export function recordConstraints(c: ConstraintSet, provider: string): void {
  try {
    metrics.total += 1;
    metrics.byOutputMode[c.outputMode] = (metrics.byOutputMode[c.outputMode] ?? 0) + 1;
    metrics.byShapeKind[c.shapeKind] = (metrics.byShapeKind[c.shapeKind] ?? 0) + 1;
    metrics.byMaxCards[String(c.maxCards)] = (metrics.byMaxCards[String(c.maxCards)] ?? 0) + 1;
    const primary = c.primaryRequirement.family ?? 'none';
    metrics.byPrimaryFamily[primary] = (metrics.byPrimaryFamily[primary] ?? 0) + 1;
    metrics.allowedComponentsSum += c.allowedComponents.length;

    console.log(
      `[Constraints] outputMode=${c.outputMode} shape=${c.shapeKind} maxCards=${c.maxCards} ` +
      `allowed=[${c.allowedComponents.join(',')}] primary=${primary}:${c.primaryRequirement.min} provider=${provider}`
    );
  } catch (err) {
    console.error('[Constraints] telemetry error (ignored):', err);
  }
}

export function getConstraintMetrics(): ConstraintMetrics {
  return {
    total: metrics.total,
    byOutputMode: { ...metrics.byOutputMode },
    byShapeKind: { ...metrics.byShapeKind },
    byMaxCards: { ...metrics.byMaxCards },
    byPrimaryFamily: { ...metrics.byPrimaryFamily },
    allowedComponentsSum: metrics.allowedComponentsSum,
  };
}

export function getConstraintSummary() {
  const m = getConstraintMetrics();
  return {
    total: m.total,
    byOutputMode: m.byOutputMode,
    byShapeKind: m.byShapeKind,
    byMaxCards: m.byMaxCards,
    byPrimaryFamily: m.byPrimaryFamily,
    avgAllowedComponents: m.total ? +(m.allowedComponentsSum / m.total).toFixed(2) : 0,
  };
}

export function resetConstraintMetrics(): void {
  metrics.total = 0;
  metrics.byOutputMode = {};
  metrics.byShapeKind = {};
  metrics.byMaxCards = {};
  metrics.byPrimaryFamily = {};
  metrics.allowedComponentsSum = 0;
}
