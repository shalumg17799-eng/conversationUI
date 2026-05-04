import { IntentResult } from '../types';

const METRIC_MAP: Record<string, string> = {
  revenue: 'revenue', sales: 'sales', units: 'sales', transactions: 'sales',
  'take rate': 'take_rate', takerate: 'take_rate', 'take_rate': 'take_rate',
  churn: 'churn', retention: 'churn', attrition: 'churn',
  performance: 'performance', score: 'performance', kpi: 'performance',
  device: 'device', product: 'device', handset: 'device',
  agent: 'employee', employee: 'employee', rep: 'employee', contact: 'employee',
  rank: 'rank', ranking: 'rank',
  report: 'report', dataset: 'dataset',
  growth: 'growth', profit: 'profit', traffic: 'traffic',
  market: 'market', territory: 'territory', outlet: 'outlet', store: 'outlet',
};

const DIMENSION_MAP: Record<string, string> = {
  region: 'region', area: 'region', zone: 'region',
  territory: 'territory', territories: 'territory',
  market: 'market', markets: 'market',
  city: 'city', cities: 'city',
  outlet: 'outlet', store: 'outlet', location: 'outlet',
  device: 'device', product: 'device', handset: 'device',
  employee: 'employee', agent: 'employee', rep: 'employee',
  channel: 'channel', department: 'department', category: 'category',
  country: 'country',
};

const TIME_RANGES = ['q1', 'q2', 'q3', 'q4', 'last month', 'last quarter', 'this year', 'today', 'yesterday', 'monthly', 'weekly', 'daily', 'ytd'];

export const classifyIntent = async (query: string): Promise<IntentResult> => {
  const q = query.toLowerCase();

  // Metric — match longest phrase first
  let metric = 'unknown';
  for (const [kw, val] of Object.entries(METRIC_MAP).sort((a, b) => b[0].length - a[0].length)) {
    if (q.includes(kw)) { metric = val; break; }
  }

  // Dimension
  let dimension = 'unknown';
  for (const [kw, val] of Object.entries(DIMENSION_MAP).sort((a, b) => b[0].length - a[0].length)) {
    if (q.includes(kw)) { dimension = val; break; }
  }

  // Time range
  const timeRange = TIME_RANGES.find(t => q.includes(t));

  // Intent type
  let intent: IntentResult['intent'] = 'metric_by_dimension';
  if (q.includes('over time') || q.includes('trend') || q.includes('monthly') || q.includes('weekly') || q.includes('daily') || q.includes('history')) {
    intent = 'trend';
  } else if (q.includes('compare') || q.includes(' vs ') || q.includes('versus') || q.includes('difference')) {
    intent = 'comparison';
  }

  console.log(`Intent: ${intent} | metric: ${metric} | dimension: ${dimension} | time: ${timeRange}`);
  return { intent, metric, dimension, timeRange };
};
