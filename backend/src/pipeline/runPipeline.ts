import { classifyIntent } from '../services/intentClassifier';
import { executeQuery } from '../services/queryEngine';
import { analyzeDataShape } from '../services/dataShapeAnalyzer';
import { generateReport } from '../services/llmHandler';
import { UITypeTree } from '../types';
import { cacheService, generateKey, generateDecisionKey } from '../services/cacheService';
import { selectComponent } from '../services/componentSelector';
import { validateUITypeTree } from '../services/uiValidator';
import { filterFollowUps } from '../services/followUpFilter';
import { generateStaticReport } from '../services/reportHelper';

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
  const allRows = await executeQuery(intent);
  const dataShape = await analyzeDataShape(allRows);
  const sampleRows = allRows.slice(0, SAMPLE_SIZE);

  // Decision Cache logic
  const decisionKey = generateDecisionKey(intent, dataShape);
  const cachedDecision = cacheService.get<string>(decisionKey);
  
  let preferredType: string;
  let selection: any;
  if (cachedDecision) {
    console.log(`[Cache] Decision hit: Using cached component ${cachedDecision}`);
    preferredType = cachedDecision;
  } else {
    selection = selectComponent(dataShape);
    preferredType = selection.type;
  }

  let report: any;
  // NEW: High-Confidence Bypass
  if (!cachedDecision && selection?.confidence === 'high') {
    console.log(`[Pipeline] High confidence (${selection.type}). Bypassing LLM...`);
    report = generateStaticReport(query, intent, dataShape, selection);
  } else {
    report = await generateReport(query, dataShape, sampleRows, preferredType);
  }

  // Layer 4 — Strict Validation with Retry
  let attempts = 0;
  let isValid = false;

  while (attempts < 2 && !isValid) {
    attempts++;
    // Test hydrate all cards to check validity
    const testNodes = report.cards.map((c: any) => {
      const { renderType, props } = c;
      if (renderType === 'BarChart' || renderType === 'LineChart') {
        return { renderType, props: { ...props, data: allRows }, children: [] };
      }
      if (renderType === 'GenerativeTable') {
        const columns = props.columns ?? (allRows[0] ? Object.keys(allRows[0]) : []);
        return { renderType, props: { ...props, columns, data: allRows, rows: allRows }, children: [] };
      }
      return { renderType, props, children: [] };
    });

    const validations = await Promise.all(testNodes.map((n: UITypeTree) => validateUITypeTree(n)));
    
    if (validations.every(v => v.isValid)) {
      isValid = true;
      // Store the decision if it was a cache miss
      if (!cachedDecision && report.cards[0]) {
        cacheService.set(decisionKey, report.cards[0].renderType);
      }
    } else if (attempts < 2) {
      console.warn(`Layer 4 - Validation failed on attempt ${attempts}. Retrying LLM...`);
      report = await generateReport(query, dataShape, sampleRows, preferredType);
    }
  }

  const children: UITypeTree[] = [];
  for (const card of report.cards) {
    let node: UITypeTree;
    const { renderType, props } = card;

    if (renderType === 'BarChart' || renderType === 'LineChart') {
      node = { renderType, props: { ...props, data: allRows }, children: [] };
    } else if (renderType === 'GenerativeTable') {
      const columns = props.columns ?? (allRows[0] ? Object.keys(allRows[0]) : []);
      node = { renderType, props: { ...props, columns, data: allRows, rows: allRows }, children: [] };
    } else {
      node = { renderType, props, children: [] };
    }

    // Final validation check for fallback
    const validation = await validateUITypeTree(node);
    if (!validation.isValid) {
      console.error(`Layer 4 - CRITICAL: Component ${node.renderType} still invalid. Falling back.`);
      node = {
        renderType: 'GenerativeTable',
        props: { 
          title: `Raw Data: ${node.props.title || 'Details'}`,
          columns: allRows[0] ? Object.keys(allRows[0]) : [],
          data: allRows,
          rows: allRows,
          explanation: 'This table was generated as a fallback because the requested chart was invalid.'
        },
        children: []
      };
    }
    children.push(node);
  }

  const groundedFollowUps = filterFollowUps(report.followUp);

  const uiTree: UITypeTree = {
    renderType: 'Report',
    props: { 
      title: report.title, 
      description: report.message,
      followUp: groundedFollowUps 
    },
    children,
  };

  // Layer 4 Validation
  const validation = await validateUITypeTree(uiTree);
  if (!validation.isValid) {
    console.error('Pipeline validation failed:', validation.errors);
  }

  const result = { uiTree, wasShortCircuited: false, durationMs: Date.now() - start };
  cacheService.set(cacheKey, result, 5 * 60 * 1000);
  return result;
}
