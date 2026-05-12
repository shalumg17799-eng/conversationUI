import { METRIC_REGISTRY } from '../registry/metricRegistry';
import { DIMENSION_REGISTRY } from '../registry/dimensionRegistry';

export interface SemanticResolution {
  metric: {
    logical: string;
    physical: string;
    aggregation: string;
  } | null;
  dimension: {
    logical: string;
    physical: string;
  } | null;
  confidence: number;
}

export function resolveSemantics(query: string): SemanticResolution {
  const q = query.toLowerCase();
  
  let metricResolution = null;
  let dimensionResolution = null;
  let metricConfidence = 0.0;
  let dimensionConfidence = 0.0;

  // Resolve Metric
  for (const [logical, def] of Object.entries(METRIC_REGISTRY)) {
    if (def.aliases.some(alias => q.includes(alias))) {
      metricResolution = {
        logical,
        physical: def.column,
        aggregation: def.aggregation
      };
      metricConfidence = 0.5; // Base match
      console.log(`[SemanticResolver] metric=${logical} \u2192 ${def.column}`);
      break;
    }
  }

  // Resolve Dimension
  for (const [logical, def] of Object.entries(DIMENSION_REGISTRY)) {
    if (def.aliases.some(alias => q.includes(alias))) {
      dimensionResolution = {
        logical,
        physical: def.column
      };
      dimensionConfidence = 0.42; // Base match
      console.log(`[SemanticResolver] dimension=${logical} \u2192 ${def.column}`);
      break;
    }
  }

  let totalConfidence = metricConfidence + dimensionConfidence;
  
  // Normalizing confidence to range 0.0 -> 1.0
  if (totalConfidence > 1.0) totalConfidence = 1.0;
  if (totalConfidence < 0.0) totalConfidence = 0.0;
  
  // Provide minor boost if specific phrases match strongly
  if (metricResolution && dimensionResolution && q.includes(`by ${dimensionResolution.logical}`)) {
     totalConfidence = Math.min(1.0, totalConfidence + 0.08);
  }

  return {
    metric: metricResolution,
    dimension: dimensionResolution,
    confidence: totalConfidence
  };
}
