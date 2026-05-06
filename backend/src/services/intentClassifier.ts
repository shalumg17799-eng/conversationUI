import { IntentResult } from '../types';

const STOP_WORDS = new Set(['show', 'me', 'the', 'a', 'an', 'for', 'of', 'and', 'with', 'in', 'on', 'at', 'by', 'please', 'create', 'report']);

/**
 * Normalizes the query by lowercasing and removing common stop words.
 */
function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[?.,!]/g, '')
    .split(/\s+/)
    .filter(word => !STOP_WORDS.has(word))
    .join(' ');
}

export const METRIC_MAP: Record<string, string> = {
  revenue: 'revenue', income: 'revenue', earnings: 'revenue', turnover: 'revenue',
  sales: 'sales', units: 'sales', transactions: 'sales', volume: 'sales',
  'take rate': 'take_rate', takerate: 'take_rate', 'take_rate': 'take_rate',
  churn: 'churn', retention: 'churn', attrition: 'churn',
  performance: 'performance', score: 'performance', kpi: 'performance',
  device: 'device', product: 'device', handset: 'device', model: 'device',
  agent: 'employee', employee: 'employee', rep: 'employee', contact: 'employee', staff: 'employee',
  rank: 'rank', ranking: 'rank',
  growth: 'growth', profit: 'profit', traffic: 'traffic',
  market: 'market', territory: 'territory', outlet: 'outlet', store: 'outlet',
};

export const DIMENSION_MAP: Record<string, string> = {
  region: 'region', area: 'region', zone: 'region', territory: 'region',
  territory_id: 'territory', territories: 'territory',
  market: 'market', markets: 'market',
  city: 'city', cities: 'city',
  outlet: 'outlet', store: 'outlet', location: 'outlet', shop: 'outlet',
  device: 'device', product: 'device', handset: 'device',
  employee: 'employee', agent: 'employee', rep: 'employee',
  channel: 'channel', department: 'department', category: 'category',
  country: 'country', state: 'country',
};

const TIME_RANGES = ['q1', 'q2', 'q3', 'q4', 'last month', 'last quarter', 'this year', 'today', 'yesterday', 'monthly', 'weekly', 'daily', 'ytd'];

export const classifyIntent = async (query: string): Promise<IntentResult> => {
  const q = query.toLowerCase();
  const normalized = normalizeQuery(query);

  // Metric — match longest phrase first
  let metric = 'unknown';
  for (const [kw, val] of Object.entries(METRIC_MAP).sort((a, b) => b[0].length - a[0].length)) {
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    if (regex.test(q) || regex.test(normalized)) { 
      metric = val; 
      console.log(`[Intent] Metric MATCH: keyword="${kw}" -> metric="${val}"`);
      break; 
    }
  }

  // Dimension
  let dimension = 'unknown';
  for (const [kw, val] of Object.entries(DIMENSION_MAP).sort((a, b) => b[0].length - a[0].length)) {
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    if (regex.test(q) || regex.test(normalized)) { 
      dimension = val; 
      console.log(`[Intent] Dimension MATCH: keyword="${kw}" -> dimension="${val}"`);
      break; 
    }
  }

  // Time range
  const timeRange = TIME_RANGES.find(t => q.includes(t) || normalized.includes(t));

  // Intent type
  let intent: IntentResult['intent'] = 'metric_by_dimension';
  if (q.includes('over time') || q.includes('trend') || q.includes('monthly') || q.includes('weekly') || q.includes('daily') || q.includes('history')) {
    intent = 'trend';
  } else if (q.includes('compare') || q.includes(' vs ') || q.includes('versus') || q.includes('difference')) {
    intent = 'comparison';
  }

  console.log(`[Intent] query="${query}" -> normalized="${normalized}"`);
  console.log(`[Intent] result: intent=${intent} metric=${metric} dimension=${dimension} time=${timeRange}`);
  
  return { intent, metric, dimension, timeRange };
};
