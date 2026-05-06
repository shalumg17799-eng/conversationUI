import dotenv from 'dotenv';
import { classifyIntent } from '../services/intentClassifier';
import { executeQuery } from '../services/queryEngine';
import { analyzeDataShape } from '../services/dataShapeAnalyzer';
import { generateReport, clarifyOrGenerate, ReportCard } from '../services/llmHandler';
import { UITypeTree } from '../types';
import { cacheService, generateKey, generateDecisionKey } from '../services/cacheService';
import { selectComponent } from '../services/componentSelector';
import { validateUITypeTree } from '../services/uiValidator';
import { filterFollowUps } from '../services/followUpFilter';
import { generateStaticReport } from '../services/reportHelper';

dotenv.config();

type SendFn = (event: string, data: unknown) => void;

// How many sample rows Gemma sees (keeps tokens low while giving enough context)
const SAMPLE_SIZE = 20;

// After Gemma picks column mappings, attach the full dataset to chart/table components
function hydrate(card: ReportCard, allRows: any[]): UITypeTree {
  const { renderType, props } = card;

  switch (renderType) {
    case 'BarChart':
    case 'LineChart':
      return {
        renderType,
        props: { ...props, data: allRows },
        children: [],
      };

    case 'GenerativeTable': {
      const columns = props.columns ?? (allRows[0] ? Object.keys(allRows[0]) : []);
      return {
        renderType,
        props: { ...props, columns, data: allRows, rows: allRows },
        children: [],
      };
    }

    case 'KPI':
    case 'KPIGrid':
      // Gemma already embedded the values — no hydration needed
      return { renderType, props, children: [] };

    default:
      return { renderType, props, children: [] };
  }
}

export async function runStreamingPipeline(query: string, send: SendFn, skipClarification = false): Promise<void> {
  console.log('--- NEW PIPELINE REQUEST ---');
  console.log(`[Pipeline] RAW QUERY: "${query}"`);
  
  const cacheKey = generateKey({ query, stream: true, v: 2 });
  const cached = cacheService.get<{ components: UITypeTree[]; title: string; message: string }>(cacheKey);

  if (cached) {
    send('meta', { title: cached.title, description: cached.message, cached: true });
    for (const component of cached.components) send('component', component);
    return;
  }

  const start = Date.now();

  // Step 0 — clarification gate: skip if user is answering a previous clarification
  if (!skipClarification) {
    send('status', { message: 'Understanding your query...' });
    const clarification = await clarifyOrGenerate(query);

    if (clarification.action === 'clarify') {
      send('clarification', { questions: clarification.questions });
      return;
    }
  }

  // Step 1 — route intent to the right BQ table
  const intent = await classifyIntent(query);

  // Step 2 — fetch real BigQuery data
  send('status', { message: 'Querying BigQuery...' });
  const allRows = await executeQuery(intent, (meta) => send('bq_debug', meta));

  if (allRows.length === 0) {
    send('error', { message: 'No data returned from BigQuery for this query. Try rephrasing with a specific metric (e.g. "show revenue by territory").' });
    return;
  }

  // Step 3 — shape analysis (gives Gemma column types)
  const dataShape = await analyzeDataShape(allRows);
  const sampleRows = allRows.slice(0, SAMPLE_SIZE);

  // Step 3.5 — Rule-based selection (Deterministic guideline)
  const decisionKey = generateDecisionKey(intent, dataShape);
  const cachedDecision = cacheService.get<string>(decisionKey);
  
  let preferredType: string;
  let report: any;
  let selection: any;

  if (cachedDecision) {
    console.log(`[Cache] Decision hit: Using cached component ${cachedDecision}`);
    preferredType = cachedDecision;
  } else {
    selection = selectComponent(dataShape);
    preferredType = selection.type;
  }

  // NEW: High-Confidence Bypass
  if (!cachedDecision && selection?.confidence === 'high') {
    console.log(`[Pipeline] High confidence (${selection.type}). Bypassing LLM...`);
    report = generateStaticReport(query, intent, dataShape, selection);
  } else {
    // Step 4 — single Gemma call: decides everything (respecting guideline)
    send('status', { message: `Analysing ${allRows.length} rows with Gemma...` });
    report = await generateReport(query, dataShape, sampleRows, preferredType);
  }

  // Step 4.5 — Strict Validation with Retry
  let attempts = 0;
  let isValid = false;

  while (attempts < 2 && !isValid) {
    attempts++;
    // Test hydrate all cards to check validity
    const testNodes = report.cards.map((c: ReportCard) => hydrate(c, allRows));
    const validations = await Promise.all(testNodes.map((n: UITypeTree) => validateUITypeTree(n)));
    
    if (validations.every(v => v.isValid)) {
      isValid = true;
      // Store the decision if it was a cache miss
      if (!cachedDecision && report.cards[0]) {
        cacheService.set(decisionKey, report.cards[0].renderType);
      }
    } else if (attempts < 2) {
      console.warn(`Layer 4 - Validation failed on attempt ${attempts}. Retrying LLM...`);
      report = await generateReport(query, dataShape, sampleRows, selection.type);
    }
  }

  if (report.cards.length === 0) {
    send('error', { message: 'Gemma could not determine a suitable report structure. Try a more specific query.' });
    return;
  }

  // Step 5 — stream report metadata
  send('meta', {
    title: report.title,
    description: report.message,
    rowCount: allRows.length,
  });

  // Step 6 — Final Hydration + Streaming with Fallback
  const validComponents: UITypeTree[] = [];

  for (const card of report.cards) {
    let node = hydrate(card, allRows);
    
    // Final check for this specific node
    const validation = await validateUITypeTree(node);
    if (!validation.isValid) {
      console.error(`Layer 4 - CRITICAL: Component ${node.renderType} still invalid after retry. Falling back to GenerativeTable.`);
      // Safe fallback
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

    send('component', node);
    validComponents.push(node);
  }

  // Step 7 — stream follow-up suggestions (grounded in DB capabilities)
  if (report.followUp.length > 0) {
    const groundedFollowUps = filterFollowUps(report.followUp);
    if (groundedFollowUps.length > 0) {
      send('followUp', groundedFollowUps);
    }
  }

  send('status', { message: `Done in ${Date.now() - start}ms` });

  cacheService.set(cacheKey, {
    components: validComponents,
    title: report.title,
    message: report.message,
  }, 5 * 60 * 1000);
}
