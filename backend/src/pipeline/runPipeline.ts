import { executeQuery } from '../services/queryEngine';
import { analyzeDataShape } from '../services/dataShapeAnalyzer';
import { generateReport, analyzeQuery, LLMProvider } from '../services/llmHandler';
import { UITypeTree } from '../types';
import { cacheService, generateKey } from '../services/cacheService';
import { resolveOutputMode } from '../services/outputMode';
import { recordOutputMode } from '../services/outputModeTelemetry';
import { shadowValidateCards } from '../services/validationTelemetry';
import { deriveConstraints } from '../services/componentSelector';
import { recordConstraints } from '../services/constraintTelemetry';
import { OutputMode } from '../registry/componentRegistry';
// KAG. The non-streaming pipeline had NO KAG at all, which mattered more than it
// looks: runEvaluation.ts drives this path, so the eval harness was reporting on a
// pipeline that never touched the graph. Same wiring as runStreamingPipeline.
import { runShadow } from '../kag/kagShadow';
import { resolveEntityFilters } from '../kag/kagGrounding';
import { validateCardGrounding } from '../kag/kagValidator';

export interface PipelineResult {
  uiTree: UITypeTree;
  wasShortCircuited: boolean;
  durationMs: number;
  outputMode: OutputMode;
}

const SAMPLE_SIZE = 20;

export async function runPipeline(query: string, provider: LLMProvider = 'gemma'): Promise<PipelineResult> {
  const cacheKey = generateKey({ query, v: 3, provider });
  const cached = cacheService.get<PipelineResult>(cacheKey);
  if (cached) return cached;

  const start = Date.now();

  const analysis = await analyzeQuery(query, [], provider);
  const tableOverride = analysis.action === 'route' ? analysis.table : undefined;
  const resolvedIntent = analysis.action === 'route' ? analysis.intent : 'metric_by_dimension';
  const llmProposedMode = analysis.action === 'route' ? analysis.outputMode : undefined;
  const outputModeDecision = resolveOutputMode({ query, intent: resolvedIntent, llmProposed: llmProposedMode });
  recordOutputMode(outputModeDecision, { query, provider });
  const outputMode = outputModeDecision.outputMode;
  const intent = { metric: tableOverride ?? 'unknown', dimension: 'unknown', intent: 'metric_by_dimension' as const };

  // Shadow comparison. runPipeline has no conversation state, so every request here is
  // a fresh routing decision — no follow-up filtering needed, unlike the streaming path.
  void runShadow(query, tableOverride ?? null);

  const entityFilters = await resolveEntityFilters(query, tableOverride ?? '');
  const allRows = await executeQuery(intent, undefined, tableOverride, entityFilters);
  const dataShape = await analyzeDataShape(allRows);

  // Phase 4: derive advisory constraints — passive, never fed into generation.
  recordConstraints(deriveConstraints(outputMode, dataShape), provider);

  const sampleRows = allRows.slice(0, SAMPLE_SIZE);

  const report = await generateReport(query, dataShape, sampleRows, undefined, provider, outputMode);

  // Phase 3: shadow validation — passive, never blocks render.
  shadowValidateCards(report.cards, provider);

  // KAG grounding validation against the graph schema.
  const grounded = await validateCardGrounding(report.cards, tableOverride ?? '');
  report.cards = grounded.cards;

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

  const result = { uiTree, wasShortCircuited: false, durationMs: Date.now() - start, outputMode };
  cacheService.set(cacheKey, result, 5 * 60 * 1000);
  return result;
}
