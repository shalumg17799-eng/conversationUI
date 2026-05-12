import { executeQuery } from '../services/queryEngine';
import { analyzeDataShape } from '../services/dataShapeAnalyzer';
import { generateReport, analyzeQuery } from '../services/llmHandler';
import { UITypeTree } from '../types';
import { cacheService, generateKey } from '../services/cacheService';

export interface PipelineResult {
  uiTree: UITypeTree;
  wasShortCircuited: boolean;
  durationMs: number;
}

const SAMPLE_SIZE = 20;

export async function runPipeline(query: string): Promise<PipelineResult> {
  const cacheKey = generateKey({ query, v: 2 });
  const cached = cacheService.get<PipelineResult>(cacheKey);
  if (cached) return cached;

  const start = Date.now();

  const analysis = await analyzeQuery(query);
  const tableOverride = analysis.action === 'route' ? analysis.table : undefined;
  const intent = { metric: tableOverride ?? 'unknown', dimension: 'unknown', intent: 'metric_by_dimension' as const };
  const allRows = await executeQuery(intent, undefined, tableOverride);
  const dataShape = await analyzeDataShape(allRows);
  const sampleRows = allRows.slice(0, SAMPLE_SIZE);

  const report = await generateReport(query, dataShape, sampleRows);

  const children: UITypeTree[] = report.cards.map(card => {
    const { renderType, props } = card;
    if (renderType === 'BarChart' || renderType === 'LineChart') {
      return { renderType, props: { ...props, data: allRows }, children: [] };
    }
    if (renderType === 'GenerativeTable') {
      const columns = props.columns ?? (allRows[0] ? Object.keys(allRows[0]) : []);
      return { renderType, props: { ...props, columns, data: allRows, rows: allRows }, children: [] };
    }
    return { renderType, props, children: [] };
  });

  const uiTree: UITypeTree = {
    renderType: 'Report',
    props: { title: report.title, description: report.message },
    children,
  };

  const result = { uiTree, wasShortCircuited: false, durationMs: Date.now() - start };
  cacheService.set(cacheKey, result, 5 * 60 * 1000);
  return result;
}
