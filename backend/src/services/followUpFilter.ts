import { METRIC_MAP, DIMENSION_MAP } from './intentClassifier';

interface FollowUp {
  label: string;
  intent: string;
}

/**
 * Filters follow-up questions to ensure they are grounded in the database's capabilities.
 * A follow-up is kept if it contains at least one known metric or dimension.
 */
export const filterFollowUps = (followUps: FollowUp[]): FollowUp[] => {
  const allowedMetrics = Object.keys(METRIC_MAP);
  const allowedDimensions = Object.keys(DIMENSION_MAP);
  
  const filtered = followUps.filter(f => {
    const text = (f.label + ' ' + f.intent).toLowerCase();
    
    const hasMetric = allowedMetrics.some(m => text.includes(m));
    const hasDimension = allowedDimensions.some(d => text.includes(d));
    
    return hasMetric || hasDimension;
  });

  if (filtered.length !== followUps.length) {
    console.log(`[Grounding] Filtered out ${followUps.length - filtered.length} hallucinated follow-up questions.`);
  }

  return filtered;
};
