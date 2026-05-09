import { IntentResult } from '../types';

const METRIC_MAP: Record<string, string> = {
  // Revenue metrics
  revenue: 'revenue', income: 'revenue', earnings: 'revenue', turnover: 'revenue',
  'total revenue': 'revenue', 'conversion rate': 'revenue',
  // Sales metrics
  sales: 'sales', units: 'sales', transactions: 'sales', volume: 'sales',
  'sales performance': 'sales',
  // Take rate
  'take rate': 'take_rate', takerate: 'take_rate',
  // Churn
  churn: 'churn', retention: 'churn', attrition: 'churn',
  // Performance
  performance: 'performance', kpi: 'performance',
  // Employee / Contact Center
  agent: 'employee', employee: 'employee', contact: 'employee',
  'customer support': 'contact', 'contact center': 'contact',
  // Misc financials
  rank: 'rank', ranking: 'rank',
  growth: 'growth', profit: 'profit',
};

const DIMENSION_MAP: Record<string, string> = {
  region: 'region', area: 'region', zone: 'region',
  territory: 'territory', territories: 'territory',
  market: 'market', markets: 'market',
  city: 'city', cities: 'city',
  outlet: 'outlet', store: 'outlet', location: 'outlet',
  device: 'device', product: 'device', handset: 'device',
  employee: 'employee', agent: 'employee',
  channel: 'channel', department: 'department', category: 'category',
  country: 'country',
};

const TIME_RANGES = ['q1', 'q2', 'q3', 'q4', 'last month', 'last quarter', 'this year', 'today', 'yesterday', 'monthly', 'weekly', 'daily', 'ytd'];

export const getAvailableMetrics = () => Object.values(METRIC_MAP);
export const getAvailableDimensions = () => Object.values(DIMENSION_MAP);

export const classifyIntent = async (query: string): Promise<IntentResult> => {
  const q = query.toLowerCase().replace(/[?.,!]/g, '');

  // Word-boundary match to prevent substring collisions (e.g. 'rep' in 'report')
  const wb = (text: string, kw: string) => new RegExp(`\\b${kw}\\b`, 'i').test(text);

  // Metric — match longest phrase first
  let metric = 'unknown';
  for (const [kw, val] of Object.entries(METRIC_MAP).sort((a, b) => b[0].length - a[0].length)) {
    if (wb(q, kw)) { metric = val; break; }
  }

  // Dimension
  let dimension = 'unknown';
  for (const [kw, val] of Object.entries(DIMENSION_MAP).sort((a, b) => b[0].length - a[0].length)) {
    if (wb(q, kw)) { dimension = val; break; }
  }

  // Time range
  const timeRange = TIME_RANGES.find(t => q.includes(t));

  // Intent type precedence
  let intent: IntentResult['intent'] = 'metric_by_dimension';

  const isTrend = q.includes('over time') || q.includes('trend') || q.includes('monthly') || 
                  q.includes('weekly') || q.includes('daily') || q.includes('history') ||
                  q.includes('growth') || q.includes('progression') || q.includes('historical');

  if (isTrend) {
    intent = 'trend';
    if (dimension === 'unknown') dimension = 'time'; // Force time dimension for trends
  } else if (q.includes('compare') || q.includes(' vs ') || q.includes('versus') || q.includes('difference')) {
    intent = 'comparison';
  } else if (/total|overall|sum/i.test(q) || (metric !== 'unknown' && dimension === 'unknown')) {
    intent = 'metric_only' as any;
  }

  console.log(`[Intent] query="${query}" -> metric=${metric} dimension=${dimension} intent=${intent}`);
  return { intent, metric, dimension, timeRange };
};
