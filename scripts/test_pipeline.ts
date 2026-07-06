// test_pipeline.ts
// Runs the FULL streaming pipeline (BigQuery + LLM) for a set of queries through
// BOTH providers (gemma + sonnet) and reports what UI the model produced:
// KPI cards, charts, tables, and follow-up prompts — and whether each carries real data.

import { runStreamingPipeline } from '../backend/src/pipeline/runStreamingPipeline';
import { LLMProvider } from '../backend/src/services/llmHandler';
import { UITypeTree } from '../backend/src/types';
import { cacheService } from '../backend/src/services/cacheService';

interface Captured { event: string; data: any; }

// Card render types grouped by family so we can verify each UI surface.
const KPI_TYPES = new Set(['KPICard', 'KPIGrid', 'StatDelta', 'GaugeChart', 'ProgressBar']);
const CHART_TYPES = new Set(['BarChart', 'LineChart', 'AreaChart', 'PieChart', 'ScatterPlot',
  'FunnelChart', 'HeatMap', 'ComboChart', 'Sparkline', 'RankedList']);
const TABLE_TYPES = new Set(['Table', 'GenerativeTable', 'PivotTable']);

// Flatten the card tree (TwoColumn/Section wrap children).
function flatten(node: any, out: any[] = []): any[] {
  if (!node) return out;
  out.push(node);
  (node.children ?? []).forEach((c: any) => flatten(c, out));
  return out;
}

// Does this card carry real rendered data?
function hasData(card: any): boolean {
  const p = card.props ?? {};
  if (CHART_TYPES.has(card.renderType)) {
    if (Array.isArray(p.data)) return p.data.length > 0;
    if (Array.isArray(p.items)) return p.items.length > 0;   // RankedList
    return false;
  }
  if (TABLE_TYPES.has(card.renderType)) {
    return Array.isArray(p.data ?? p.rows) && (p.data ?? p.rows).length > 0;
  }
  if (KPI_TYPES.has(card.renderType)) {
    return p.value !== undefined || Array.isArray(p.metrics) || p.current !== undefined || Array.isArray(p.items);
  }
  return true; // narrative cards embed their own content
}

async function runOne(query: string, provider: LLMProvider): Promise<Captured[]> {
  // Clear cache first: the pipeline cache key does NOT include the provider, so
  // without this the second provider would replay the first provider's cached output.
  cacheService.clear();
  const events: Captured[] = [];
  const send = (event: string, data: unknown) => events.push({ event, data });
  // skipClarification=true → force a report instead of a clarify question.
  await runStreamingPipeline(query, send, true, [], undefined, undefined, undefined, [], provider);
  return events;
}

function summarize(events: Captured[]) {
  const meta = events.find(e => e.event === 'meta')?.data;
  const qa = events.find(e => e.event === 'qa_answer')?.data;
  const clar = events.find(e => e.event === 'clarification')?.data;
  const followUp = events.find(e => e.event === 'followUp')?.data as any[] | undefined;
  const components = events.filter(e => e.event === 'component').map(e => e.data as UITypeTree);

  const allCards = components.flatMap(c => flatten(c));
  const kpis = allCards.filter(c => KPI_TYPES.has((c as any).renderType));
  const charts = allCards.filter(c => CHART_TYPES.has((c as any).renderType));
  const tables = allCards.filter(c => TABLE_TYPES.has((c as any).renderType));

  return {
    kind: qa ? 'qa_answer' : clar ? 'clarification' : meta ? 'report' : 'unknown',
    title: meta?.title,
    rowCount: meta?.rowCount,
    kpis: { count: kpis.length, withData: kpis.filter(hasData).length },
    charts: { count: charts.length, withData: charts.filter(hasData).length,
              types: charts.map(c => (c as any).renderType) },
    tables: { count: tables.length, withData: tables.filter(hasData).length },
    followUps: followUp?.length ?? 0,
  };
}

const QUERIES = [
  'show me the sales revenue trend over time',
  'compare territories by take rate',
  'agent performance overview',
  'show me churn over time',
];

const PROVIDERS: LLMProvider[] = ['gemma', 'sonnet'];

async function main() {
  for (const query of QUERIES) {
    console.log('\n' + '='.repeat(78));
    console.log(`QUERY: "${query}"`);
    console.log('='.repeat(78));
    for (const provider of PROVIDERS) {
      const label = provider.toUpperCase().padEnd(7);
      try {
        const events = await runOne(query, provider);
        const s = summarize(events);
        console.log(`\n  [${label}] kind=${s.kind}  title="${s.title ?? '-'}"  rows=${s.rowCount ?? '-'}`);
        console.log(`           KPI cards : ${s.kpis.count} (with data: ${s.kpis.withData})`);
        console.log(`           Charts    : ${s.charts.count} (with data: ${s.charts.withData})  ${s.charts.types.join(', ')}`);
        console.log(`           Tables    : ${s.tables.count} (with data: ${s.tables.withData})`);
        console.log(`           Follow-ups: ${s.followUps}`);
      } catch (e: any) {
        console.log(`\n  [${label}] ERROR -> ${e?.message ?? e}`);
      }
    }
  }
  console.log('\nDone.');
}

main().catch(err => console.error('Fatal error', err));
