import { IntentResult } from '../types';

const METRICS = ['performance', 'revenue', 'sales', 'users', 'growth', 'traffic', 'profit'];
const DIMENSIONS = ['region', 'country', 'product', 'category', 'department', 'channel', 'city'];
const TIME_RANGES = ['q1', 'q2', 'q3', 'q4', 'last month', 'last quarter', 'this year', 'today', 'yesterday'];

export const classifyIntent = async (query: string): Promise<IntentResult> => {
  const lowercaseQuery = query.toLowerCase();

  // 1. Extract Metric
  const metric = METRICS.find(m => lowercaseQuery.includes(m)) || 'unknown';

  // 2. Extract Dimension
  const dimension = DIMENSIONS.find(d => lowercaseQuery.includes(d)) || 'unknown';

  // 3. Extract Time Range
  const timeRange = TIME_RANGES.find(t => lowercaseQuery.includes(t));

  // 4. Determine Intent
  let intent: IntentResult['intent'] = 'metric_by_dimension';
  
  if (lowercaseQuery.includes('over time') || lowercaseQuery.includes('trend') || lowercaseQuery.includes('monthly')) {
    intent = 'trend';
  } else if (lowercaseQuery.includes('compare') || lowercaseQuery.includes(' vs ')) {
    intent = 'comparison';
  }

  console.log(`Layer 1 - Parsed Query: "${query}" -> Intent: ${intent}, Metric: ${metric}, Dimension: ${dimension}, Time: ${timeRange}`);

  return {
    intent,
    metric,
    dimension,
    timeRange
  };
};
