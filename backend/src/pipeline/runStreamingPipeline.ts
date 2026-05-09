import dotenv from 'dotenv';
import { classifyIntent } from '../services/intentClassifier';
import { executeQuery } from '../services/queryEngine';
import { analyzeDataShape } from '../services/dataShapeAnalyzer';
import { generateReport, getDataCatalog, ReportCard } from '../services/llmHandler';
import { UITypeTree } from '../types';
import { cacheService, generateKey } from '../services/cacheService';
import { selectComponent } from '../services/componentSelector';
import { validateUITypeTree } from '../services/uiValidator';
import { hydrateTree } from '../lib/hydrator';
import { getMetadataContext } from '../services/metadataService';
import { mapProps } from '../services/propMapper';

dotenv.config();

type SendFn = (event: string, data: unknown) => void;

// How many sample rows Gemma sees (keeps tokens low while giving enough context)
const SAMPLE_SIZE = 20;


export interface ClarificationTurn {
  question: string;
  answer: string;
}

export async function runStreamingPipeline(
  query: string,
  send: SendFn,
  skipClarification = false,
  clarificationHistory: ClarificationTurn[] = [],
  priorContext?: string,
): Promise<void> {
  const cacheKey = generateKey({ query, stream: true, v: 2, history: clarificationHistory, prior: priorContext });
  const cached = cacheService.get<{ components: UITypeTree[]; title: string; message: string }>(cacheKey);

  console.log(`[Pipeline] query="${query}" skipClarification=${skipClarification} history=${clarificationHistory.length} cacheHit=${!!cached}`);

  if (cached) {
    send('meta', { title: cached.title, description: cached.message, cached: true });
    for (const component of cached.components) send('component', component);
    return;
  }

  const start = Date.now();

  // Build enriched query from original + clarification history
  const enrichedQuery = clarificationHistory.length > 0
    ? `${query}. Context: ${clarificationHistory.map(t => `${t.question} → ${t.answer}`).join('; ')}`
    : query;

  // Step 1 — route intent to the right BQ table (use enriched query for better routing)
  const intent = await classifyIntent(enrichedQuery);

  // Safety Override: Ensure metric-only queries are explicitly typed, but DON'T hijack trends
  if (intent.metric !== 'unknown' && intent.dimension === 'unknown' && intent.intent !== 'trend') {
    intent.intent = "metric_only";
  }

  console.log(`[Pipeline] Precedence Check: intent=${intent.intent} metric=${intent.metric} dimension=${intent.dimension}`);

  // PRD Rule 2: Single clarification gate — trigger ONLY when both metric and dimension are unknown
  if (intent.metric === 'unknown' && intent.dimension === 'unknown') {
    send('clarification', {
      opener: "I need a bit more context to generate the right report.",
      currentQuestion: {
        question: 'What would you like to analyze?',
        options: ['Sales Revenue', 'Customer Churn', 'Network Performance', 'Contact Center Efficiency']
      }
    });
    return;
  }

  // Step 2 — fetch real BigQuery data
  send('status', { message: 'Querying BigQuery...' });
  const allRows = await executeQuery(intent, (meta) => send('bq_debug', meta));

  if (allRows.length === 0) {
    // Recovery — use grounded metadata context for better suggestions
    const metadata = getMetadataContext();
    const recoveryOptions = metadata && metadata.tables.length > 0
      ? metadata.tables.slice(0, 4).map(t => t.table_name.replace(/_/g, ' '))
      : ['Sales Revenue', 'Customer Churn', 'Network Performance', 'Contact Center Efficiency'];

    send('clarification', {
      opener: `I couldn't find data matching that combination in the current dataset. Here are some areas I have data for:`,
      currentQuestion: {
        question: 'Which would you like to explore?',
        options: recoveryOptions,
      },
      isRecovery: true,
    });
    return;
  }

  // Step 3 — shape analysis (gives Gemma column types)
  const dataShape = await analyzeDataShape(allRows);
  const sampleRows = allRows.slice(0, SAMPLE_SIZE);

  // PRD Rule 4: Rule-based component selection is primary
  const components = selectComponent(dataShape, intent);

  // Step 4 — single Gemma call: decides narrative ONLY (summary, insights, follow-up)
  send('status', { message: `Generating insights for ${allRows.length} rows...` });
  
  let reportNarrative;
  try {
    reportNarrative = await generateReport(enrichedQuery, dataShape, sampleRows, priorContext, components);
  } catch (err) {
    console.error('[Pipeline] LLM Insight generation failed, falling back to default narrative:', err);
    reportNarrative = {
      title: `Analysis of ${intent.metric}`,
      message: `Showing analytical results generated from available dataset.`,
      cards: components.map(() => ({ insight: 'Data analysis provided in the visualization.' })),
      followUp: []
    };
  }

  // Step 5 — stream report metadata (PRD: Remove duplicate summary in description)
  send('meta', {
    title: reportNarrative.title,
    description: '', // PRD: message appears ONLY ONCE (at top)
    message: reportNarrative?.message || 'Showing analytical results.',
    rowCount: allRows.length,
    template: 'summary',
  });

  // Step 6 — hydrate + stream each card (merged deterministic type + LLM narrative)
  const validComponents: UITypeTree[] = [];

  for (let i = 0; i < components.length; i++) {
    const renderType = components[i];
    const narrative = reportNarrative.cards[i] || { insight: 'Data visualization' };

    // Card title derived from renderType or query context, NOT repeated summary
    const cardTitle = renderType === 'InsightCard' ? 'Key Insights' : `${intent.metric} Analysis`;

    const baseProps = mapProps(renderType, dataShape);

    let card: ReportCard = {
      renderType,
      props: { 
        ...baseProps,
        title: baseProps.title || cardTitle, 
        insight: narrative.insight,
        metric: intent.metric, 
      },
      children: []
    };

    let node = hydrateTree(card, allRows);

    // PRD Rule 5: Validation must enforce valid UI output (fallback if invalid)
    const validation = await validateUITypeTree(node);
    console.log(`[Pipeline] Diagnostic: selectedComponent=${renderType} validationPassed=${validation.isValid} fallbackTriggered=${!validation.isValid}`);
    if (!validation.isValid) {
      console.warn(`[Pipeline] Invalid component ${node.renderType}, falling back to Table`, validation.errors);
      node = hydrateTree({
        renderType: 'GenerativeTable',
        props: { title: 'Raw Data View', insight: narrative.insight },
        children: []
      }, allRows);
    }

    send('component', node);
    validComponents.push(node);
  }

  // Step 7 — stream grounded follow-up suggestions
  if (reportNarrative.followUp.length > 0) {
    send('followUp', reportNarrative.followUp);
  }

  send('status', { message: `Done in ${Date.now() - start}ms` });

  cacheService.set(cacheKey, {
    components: validComponents,
    title: reportNarrative.title,
    message: reportNarrative.message,
  }, 5 * 60 * 1000);
}
