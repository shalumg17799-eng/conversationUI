import { METRIC_REGISTRY } from '../registry/metricRegistry';
import { DIMENSION_REGISTRY } from '../registry/dimensionRegistry';

// Terms that users may say which are NOT physically supported in the schema.
// These must never be silently remapped to another dimension.
const UNSUPPORTED_DIMENSION_TERMS = new Set([
  'region', 'regions',
]);

const UNSUPPORTED_METRIC_TERMS = new Set<string>();

export interface CapabilityResult {
  supported: boolean;
  unsupportedDimension?: string;
  unsupportedMetric?: string;
  message?: string;
}

/**
 * Validates whether the requested logical dimension and metric are physically
 * supported in the schema. Must be called BEFORE the planner runs.
 *
 * A term is unsupported if:
 *   1. It appears in the explicit unsupported block-list, OR
 *   2. It is not a registered logical key in the registry
 */
export function validateCapability(
  requestedDimension: string | undefined,
  requestedMetric: string | undefined,
  rawQuery: string
): CapabilityResult {
  const q = rawQuery.toLowerCase();

  // Check for explicitly unsupported dimension terms in the raw query
  for (const term of UNSUPPORTED_DIMENSION_TERMS) {
    if (q.includes(term)) {
      console.log(`[CapabilityValidation] dimension=${term} supported=false`);
      console.log(`[UnsupportedDimension] ${term}`);
      console.log(`[CapabilityValidationFailed]`);
      return {
        supported: false,
        unsupportedDimension: term,
        message: `Region-level analysis is not currently available in the connected dataset.`,
      };
    }
  }

  // Check for explicitly unsupported metric terms in the raw query
  for (const term of UNSUPPORTED_METRIC_TERMS) {
    if (q.includes(term)) {
      console.log(`[CapabilityValidation] metric=${term} supported=false`);
      console.log(`[UnsupportedMetric] ${term}`);
      console.log(`[CapabilityValidationFailed]`);
      return {
        supported: false,
        unsupportedMetric: term,
        message: `The metric "${term}" is not currently available in the connected dataset.`,
      };
    }
  }

  // Validate resolved logical dimension exists in registry
  if (requestedDimension && requestedDimension !== 'unknown') {
    const isRegistered = requestedDimension in DIMENSION_REGISTRY;
    if (!isRegistered) {
      console.log(`[CapabilityValidation] dimension=${requestedDimension} supported=false`);
      console.log(`[UnsupportedDimension] ${requestedDimension}`);
      console.log(`[CapabilityValidationFailed]`);
      return {
        supported: false,
        unsupportedDimension: requestedDimension,
        message: `"${requestedDimension}" is not currently available as a dimension in the connected dataset.`,
      };
    }
    console.log(`[CapabilityValidation] dimension=${requestedDimension} supported=true`);
  }

  // Validate resolved logical metric exists in registry
  if (requestedMetric && requestedMetric !== 'unknown') {
    const isRegistered = requestedMetric in METRIC_REGISTRY;
    if (!isRegistered) {
      console.log(`[CapabilityValidation] metric=${requestedMetric} supported=false`);
      console.log(`[UnsupportedMetric] ${requestedMetric}`);
      console.log(`[CapabilityValidationFailed]`);
      return {
        supported: false,
        unsupportedMetric: requestedMetric,
        message: `The metric "${requestedMetric}" is not currently available in the connected dataset.`,
      };
    }
    console.log(`[CapabilityValidation] metric=${requestedMetric} supported=true`);
  }

  return { supported: true };
}
