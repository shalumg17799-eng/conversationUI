import { classifyIntent } from '../services/intentClassifier';
import { executeQuery } from '../services/queryEngine';
import { analyzeDataShape } from '../services/dataShapeAnalyzer';
import { generateReport } from '../services/llmHandler';
import { UITypeTree } from '../types';
import { cacheService, generateKey } from '../services/cacheService';
import { hydrateTree } from '../lib/hydrator';
import { validateUITypeTree } from '../services/uiValidator';
import { selectComponent } from '../services/componentSelector';
import { mapProps } from '../services/propMapper';

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

  const intent = await classifyIntent(query);

  // Safety Override: Ensure metric-only queries are explicitly typed, but DON'T hijack trends
  if (intent.metric !== 'unknown' && intent.dimension === 'unknown' && intent.intent !== 'trend') {
    intent.intent = "metric_only";
  }

  console.log(`[Pipeline] Precedence Check: intent=${intent.intent} metric=${intent.metric} dimension=${intent.dimension}`);

  // PRD Rule 2: Single clarification gate
  if (intent.metric === 'unknown' && intent.dimension === 'unknown') {
    throw new Error('I need a bit more context to generate the right report. What would you like to analyze?');
  }

  const allRows = await executeQuery(intent);
  const dataShape = await analyzeDataShape(allRows);
  const sampleRows = allRows.slice(0, SAMPLE_SIZE);

  const components = selectComponent(dataShape, intent);
  
  let reportNarrative;
  try {
    reportNarrative = await generateReport(query, dataShape, sampleRows, undefined, components);
  } catch (err) {
    console.error('[Pipeline] LLM Insight generation failed:', err);
    reportNarrative = {
      title: `Analysis of ${intent.metric}`,
      message: `Showing analytical results generated from available dataset.`,
      cards: components.map(() => ({ insight: 'Data visualization' })),
      followUp: []
    };
  }

  const children: UITypeTree[] = [];
  for (let i = 0; i < components.length; i++) {
    const renderType = components[i];
    const narrative = reportNarrative.cards[i] || { insight: 'Data visualization' };
    
    // PRD: Card titles derived from renderType or intent
    const cardTitle = renderType === 'InsightCard' ? 'Key Insights' : `${intent.metric} Analysis`;
    const baseProps = mapProps(renderType, dataShape);

    let node = hydrateTree({
      renderType,
      props: { 
        ...baseProps,
        title: baseProps.title || cardTitle, 
        insight: narrative.insight,
        metric: intent.metric, 
      },
      children: []
    }, allRows);

    const validation = await validateUITypeTree(node);
    if (!validation.isValid) {
      console.warn(`[Pipeline] Invalid component ${node.renderType}, falling back to Table`, validation.errors);
      node = hydrateTree({
        renderType: 'GenerativeTable',
        props: { title: 'Raw Data View', insight: narrative.insight },
        children: []
      }, allRows);
    }
    children.push(node);
  }

  const uiTree: UITypeTree = {
    renderType: 'Report',
    props: { 
      title: reportNarrative.title, 
      description: '', 
      message: reportNarrative?.message || 'Showing analytical results.' 
    },
    children,
  };

  const result = { uiTree, wasShortCircuited: false, durationMs: Date.now() - start };
  cacheService.set(cacheKey, result, 5 * 60 * 1000);
  return result;
}
