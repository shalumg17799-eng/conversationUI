import { validateTree, ValidationViolation, ViolationCategory } from './uiValidator';

// Phase 3: passive observability for shadow validation.
// Nothing here affects rendering. shadowValidateCards() is the single entrypoint the
// pipelines call — it validates, logs per-violation, records metrics, and returns void.

interface ValidationMetrics {
  totalValidated: number;   // reports validated
  totalNodes: number;       // components validated
  totalViolations: number;
  byCategory: Record<ViolationCategory, number>;
  byComponent: Record<string, number>; // violations attributed to each component type
}

const metrics: ValidationMetrics = {
  totalValidated: 0,
  totalNodes: 0,
  totalViolations: 0,
  byCategory: { unknown_render_type: 0, missing_prop: 0, invalid_prop_type: 0, invalid_structure: 0 },
  byComponent: {},
};

export function recordValidation(violations: ValidationViolation[], nodeCount: number): void {
  metrics.totalValidated += 1;
  metrics.totalNodes += nodeCount;
  metrics.totalViolations += violations.length;
  for (const v of violations) {
    metrics.byCategory[v.category] = (metrics.byCategory[v.category] ?? 0) + 1;
    metrics.byComponent[v.component] = (metrics.byComponent[v.component] ?? 0) + 1;
  }
}

// PASSIVE shadow-validation entrypoint. Wrapped so a validation bug can never break a render.
export function shadowValidateCards(cards: any[], provider: string): void {
  try {
    const { violations, nodeCount } = validateTree(cards);
    for (const v of violations) {
      console.log(`[Validation] component=${v.component} result=invalid reason=${v.category}:${v.detail}`);
    }
    if (violations.length === 0) {
      console.log(`[Validation] result=ok nodes=${nodeCount} provider=${provider}`);
    }
    recordValidation(violations, nodeCount);
  } catch (err) {
    console.error('[Validation] shadow validation error (ignored):', err);
  }
}

export function getValidationMetrics(): ValidationMetrics {
  return {
    totalValidated: metrics.totalValidated,
    totalNodes: metrics.totalNodes,
    totalViolations: metrics.totalViolations,
    byCategory: { ...metrics.byCategory },
    byComponent: { ...metrics.byComponent },
  };
}

export function getValidationSummary() {
  const m = getValidationMetrics();
  const topInvalidComponents = Object.entries(m.byComponent)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([component, count]) => ({ component, count }));
  return {
    totalValidated: m.totalValidated,
    totalNodes: m.totalNodes,
    totalViolations: m.totalViolations,
    violationsByCategory: m.byCategory,
    topInvalidComponents,
  };
}

export function resetValidationMetrics(): void {
  metrics.totalValidated = 0;
  metrics.totalNodes = 0;
  metrics.totalViolations = 0;
  metrics.byCategory = { unknown_render_type: 0, missing_prop: 0, invalid_prop_type: 0, invalid_structure: 0 };
  metrics.byComponent = {};
}
