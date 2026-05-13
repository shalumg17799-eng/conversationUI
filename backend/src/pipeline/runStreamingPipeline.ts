import dotenv from 'dotenv';
import { executeQuery } from '../services/queryEngine';
import { analyzeDataShape } from '../services/dataShapeAnalyzer';
import {
  generateReport, analyzeQuery,
  classifyAndEditReport, buildHydrationMap, rehydrateEditedCards,
  ReportCard,
} from '../services/llmHandler';
import { DATA_SOURCES, ALL_DOMAINS, getSourcesByDomain } from '../services/dataSourceMap';
import { UITypeTree, ShapeSignature } from '../types';
import { cacheService, generateKey } from '../services/cacheService';
import { classifyInteraction } from '../services/interactionClassifier';
import { generateNarrativeResponse } from '../services/llmHandler';

// Fixes column name casing in LLM-generated cards.
// BQ returns columns in their original case (e.g. TEAM, CSAT_SCORE) but the LLM
// often lowercases them (team, csat_score), causing Recharts to find nothing.
function fixColumnCasing(cards: ReportCard[], actualColumns: string[]): ReportCard[] {
  const caseMap = new Map<string, string>();
  actualColumns.forEach(col => caseMap.set(col.toLowerCase(), col));

  const fixProps = (props: Record<string, any>): Record<string, any> => {
    const out = { ...props };
    for (const key of ['xKey', 'yKey', 'nameKey', 'valueKey', 'labelKey', 'timeColumn']) {
      if (typeof out[key] === 'string') {
        out[key] = caseMap.get(out[key].toLowerCase()) ?? out[key];
      }
    }
    if (Array.isArray(out.columns)) {
      out.columns = out.columns.map((c: string) => caseMap.get(c.toLowerCase()) ?? c);
    }
    if (Array.isArray(out.metrics)) {
      out.metrics = out.metrics.map((m: any) => typeof m === 'object' ? m : m);
    }
    return out;
  };

  const fixCard = (card: ReportCard): ReportCard => ({
    ...card,
    props: fixProps(card.props),
    children: card.children?.map(fixCard),
  });

  return cards.map(fixCard);
}

// Guaranteed fallback: always produces at least one renderable card from the data shape.
// Used when the LLM returns cards:[] for any reason.
function generateFallbackCards(shape: ShapeSignature): ReportCard[] {
  const cards: ReportCard[] = [];

  // Pick best dimension: prefer short string columns (territory, name) over numeric IDs
  const bestDimension = shape.dimensionColumns.find(c => !/(_id|_key|_code|_num)$/i.test(c))
    ?? shape.dimensionColumns[0];

  // Pick best measures: up to 4, prefer revenue/rate/score columns
  const preferredOrder = ['revenue', 'rate', 'score', 'pct', 'percent', 'count', 'total', 'avg'];
  const sortedMeasures = [...shape.measureColumns].sort((a, b) => {
    const aScore = preferredOrder.findIndex(p => a.toLowerCase().includes(p));
    const bScore = preferredOrder.findIndex(p => b.toLowerCase().includes(p));
    return (aScore === -1 ? 99 : aScore) - (bScore === -1 ? 99 : bScore);
  });
  const topMeasures = sortedMeasures.slice(0, 4);

  if (topMeasures.length > 0) {
    cards.push({
      renderType: 'KPIGrid',
      props: {
        metrics: topMeasures.map(col => ({ title: col, value: '—' })),
        explanation: 'Key metrics from the dataset.',
      },
    });
  }

  if (shape.isTimeSeries && shape.timeColumn && topMeasures.length > 0) {
    cards.push({
      renderType: 'LineChart',
      props: {
        title: `${topMeasures[0]} Over Time`,
        xKey: shape.timeColumn,
        yKey: topMeasures[0],
        explanation: `Trend of ${topMeasures[0]} over time.`,
      },
    });
  } else if (bestDimension && topMeasures.length > 0) {
    cards.push({
      renderType: 'BarChart',
      props: {
        title: `${topMeasures[0]} by ${bestDimension}`,
        xKey: bestDimension,
        yKey: topMeasures[0],
        explanation: `${topMeasures[0]} broken down by ${bestDimension}.`,
      },
    });
  }

  const columns = [bestDimension, ...topMeasures].filter(Boolean).slice(0, 8) as string[];
  if (columns.length > 0) {
    cards.push({
      renderType: 'Table',
      props: { title: 'Data Detail', columns, explanation: 'Full dataset view.' },
    });
  }

  return cards;
}

dotenv.config();

type SendFn = (event: string, data: unknown) => void;

// How many sample rows Gemma sees (keeps tokens low while giving enough context)
const SAMPLE_SIZE = 20;

// Recursively attach real BigQuery data to components that need it.
// Layout wrappers (TwoColumn, Section) are hydrated by recursing into their children.
// Narrative components (InsightCard, AlertBanner, SummaryText, StatDelta) have
// values embedded by the LLM and need no hydration.
function hydrateTree(card: ReportCard, allRows: any[]): UITypeTree {
  const { renderType, props } = card;

  // Recurse into children first (handles TwoColumn, Section, etc.)
  const hydratedChildren: UITypeTree[] = (card.children ?? []).map(child =>
    hydrateTree(child, allRows)
  );

  switch (renderType) {
    // ── Charts — attach dataset; aggregate time-series charts by xKey ────────
    case 'LineChart':
    case 'AreaChart': {
      const { xKey, yKey } = props;
      if (xKey && yKey) {
        // Aggregate: group by xKey, average yKey — prevents duplicate x-axis labels
        const grouped = new Map<string, { sum: number; count: number }>();
        for (const row of allRows) {
          const x = String(row[xKey] ?? '');
          const y = Number(row[yKey]) || 0;
          const entry = grouped.get(x) ?? { sum: 0, count: 0 };
          entry.sum += y;
          entry.count += 1;
          grouped.set(x, entry);
        }
        const aggregated = Array.from(grouped.entries()).map(([x, { sum, count }]) => ({
          ...Object.fromEntries(Object.entries(allRows.find(r => String(r[xKey]) === x) ?? {})),
          [xKey]: x,
          [yKey]: Math.round((sum / count) * 100) / 100,
        }));
        return { renderType, props: { ...props, data: aggregated }, children: hydratedChildren };
      }
      return { renderType, props: { ...props, data: allRows }, children: hydratedChildren };
    }

    case 'BarChart':
    case 'PieChart':
      return { renderType, props: { ...props, data: allRows }, children: hydratedChildren };

    // ── RankedList — deduplicate by labelKey, aggregate valueKey ─────────────
    case 'RankedList': {
      const { labelKey, valueKey, limit = 10 } = props;
      const grouped = new Map<string, { sum: number; count: number }>();
      for (const row of allRows) {
        const label = String(row[labelKey] ?? '');
        const val = Number(row[valueKey]) || 0;
        const entry = grouped.get(label) ?? { sum: 0, count: 0 };
        entry.sum += val;
        entry.count += 1;
        grouped.set(label, entry);
      }
      const items = Array.from(grouped.entries())
        .map(([label, { sum, count }]) => ({ label, value: Math.round((sum / count) * 100) / 100 }))
        .sort((a, b) => b.value - a.value)
        .slice(0, limit)
        .map((item, i) => ({ rank: i + 1, label: item.label, value: item.value }));
      return { renderType, props: { ...props, items }, children: hydratedChildren };
    }

    // ── Tables — attach full dataset ─────────────────────────────────────────
    case 'Table':
    case 'GenerativeTable': {
      const columns = props.columns ?? (allRows[0] ? Object.keys(allRows[0]) : []);
      return {
        renderType,
        props: { ...props, columns, data: allRows, rows: allRows },
        children: hydratedChildren,
      };
    }

    // ── Layout wrappers — pass through with hydrated children ─────────────────
    case 'TwoColumn':
    case 'Section':
      return { renderType, props, children: hydratedChildren };

    // ── Metric / Narrative — LLM already embedded values, no hydration needed ─
    default:
      return { renderType, props, children: hydratedChildren };
  }
}

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
  activeTable?: string,
  currentCards?: ReportCard[],
): Promise<void> {
  const cacheKey = generateKey({ query, stream: true, v: 2, history: clarificationHistory, prior: priorContext });
  const cached = cacheService.get<{ components: UITypeTree[]; title: string; message: string; activeTable?: string }>(cacheKey);

  console.log(`[Pipeline] query="${query}" skipClarification=${skipClarification} history=${clarificationHistory.length} activeTable=${activeTable ?? 'none'} cacheHit=${!!cached}`);

  if (cached) {
    send('meta', { title: cached.title, description: cached.message, cached: true, activeTable: cached.activeTable });
    for (const component of cached.components) send('component', component);
    return;
  }

  // ── GLOBAL DATASOURCE GATE ──────────────────────────────────────────────
  console.log(`[GlobalDatasourceGate]`);
  const { validateDatasourceHealth } = await import('../services/datasourceHealthValidator');
  const datasourceHealth = await validateDatasourceHealth();
  if (!datasourceHealth.isHealthy) {
    console.log(`[DatasourceGateBlocked]`);
    console.log(`[InteractionRoutingSkipped]`);
    console.log(`[ModificationFlowSkipped]`);
    console.log(`[ConversationFlowBlocked]`);
    console.log(`[ClarificationSkipped]`);
    console.log(`[PlannerSkipped]`);
    console.log(`[PipelineShortCircuited]`);
    send('meta', {
      title: 'Datasource Unavailable',
      description: datasourceHealth.message!,
      template: 'summary',
      rowCount: 0,
    });
    return;
  }

  // ── Orchestration State ──────────────────────────────────────────────────
  const start = Date.now();
  const hasContext = !!priorContext && !!currentCards && currentCards.length > 0;
  const inClarificationFlow = clarificationHistory.length > 0;
  
  // Deterministic Orchestration Decision
  const interactionType = await classifyInteraction(query, hasContext);
  let routingLayer: 'NARRATIVE' | 'ANALYTICAL_DIRECT' | 'WORKSPACE_TRANSFORM' | 'GUIDED_ASSISTANT' | 'NEW_REPORT_FALLBACK' = 'NEW_REPORT_FALLBACK';
  let bypassedAssistant = false;

  const logOrchestration = () => {
    console.log(`[Orchestration] interactionType=${interactionType} routingLayer=${routingLayer} bypassedAssistant=${bypassedAssistant} usedExistingContext=${hasContext}`);
  };

  // 1. Layer: Narrative Interaction (High Priority Bypass)
  if (interactionType === 'summarize_report' || interactionType === 'analyze_report') {
    routingLayer = 'NARRATIVE';
    logOrchestration();
    send('status', { message: interactionType === 'summarize_report' ? 'Summarizing report...' : 'Analyzing report context...' });
    
    try {
      const narrative = await generateNarrativeResponse(query, currentCards!, priorContext!);
      send('meta', { 
        title: 'Report Analysis', 
        description: narrative.message,
        rowCount: null,
        template: 'qa_answer',
        activeTable,
        skippedAnalyticalPipeline: true
      });
      if (narrative.followUp.length > 0) send('followUp', narrative.followUp);
      return;
    } catch (err) {
      console.error('[Pipeline] Narrative generation failed, falling back:', err);
    }
  }

  // 2. Layer: Analytical Direct Bypass
  // If the query matches high-confidence analytical keywords, skip guided assistant flow entirely.
  if (interactionType === 'analytical_intent' && !inClarificationFlow) {
    routingLayer = 'ANALYTICAL_DIRECT';
    bypassedAssistant = true;
    // We fall through to Step 2, but we will set skipClarification = true for this turn.
    skipClarification = true;
  }

  // 3. Layer: Workspace Transformation (Follow-ups on existing report)
  const hasExistingReport = !!priorContext && !!activeTable && hasContext;
  if (hasExistingReport && !inClarificationFlow && !skipClarification && interactionType !== 'analytical_intent') {
    routingLayer = 'WORKSPACE_TRANSFORM';
    logOrchestration();
    send('status', { message: 'Understanding your request...' });

    // Single fused LLM call: classifies intent AND applies structural edits in one shot.
    // Replaces the previous two-call flow (classifyFollowUpIntent → editReport).
    let fusedResult: Awaited<ReturnType<typeof classifyAndEditReport>> | null = null;
    try {
      fusedResult = await classifyAndEditReport(query, currentCards!, priorContext!);
    } catch (err) {
      console.error('[Pipeline] classifyAndEditReport failed after retries:', err);
      // Fall through to new-report flow as safe default
    }

    if (fusedResult) {
      console.log(`[Pipeline] Fused intent: ${fusedResult.action}`);

      // ── Structural edit: LLM already returned modified cards ──────────────
      if (fusedResult.action === 'edit_structural') {
        const hydrationMap = buildHydrationMap(currentCards!);
        const rehydrated = rehydrateEditedCards(fusedResult.cards, hydrationMap);

        send('acknowledgment', { message: fusedResult.acknowledgment });
        send('meta', {
          title: fusedResult.title || (priorContext!.match(/Title: "([^"]+)"/)?.[1] ?? 'Updated Report'),
          description: fusedResult.message,
          rowCount: null,
          template: 'summary',
          activeTable,
        });
        for (const card of rehydrated) send('component', card);
        if (fusedResult.followUp.length > 0) send('followUp', fusedResult.followUp);
        return;
      }

      // ── Data-change edit: re-query BQ, then regenerate with edit context ──
      if (fusedResult.action === 'edit_data_change') {
        send('status', { message: 'Fetching updated data...' });

        const { classifyIntent: classifyTable } = await import('../services/intentClassifier');
        const tableIntent = await classifyTable(query);
        let allRows: any[];
        try {
          allRows = await executeQuery(tableIntent, (meta) => send('bq_debug', meta), activeTable);
        } catch (execErr: any) {
          console.log(`[ExecutionFailureTerminal] ${execErr.message}`);
          console.log(`[PipelineTerminated]`);
          send('meta', {
            title: 'Datasource Unavailable',
            description: 'Unable to retrieve data because the analytical datasource is currently unavailable.',
            template: 'summary',
            rowCount: 0,
          });
          return;
        }

        if (allRows.length === 0) {
          send('acknowledgment', { message: "I couldn't find data matching that filter. The original report is unchanged." });
          for (const card of currentCards!) send('component', card);
          return;
        }

        const dataShape = await analyzeDataShape(allRows);
        const sampleRows = allRows.slice(0, SAMPLE_SIZE);
        const editEnrichedQuery = `EDIT REQUEST: ${query}. Prior report: ${priorContext}`;

        send('status', { message: 'Updating report...' });
        const report = await generateReport(editEnrichedQuery, dataShape, sampleRows, priorContext);
        const actualColumns = Object.keys(dataShape.columnTypes);
        report.cards = fixColumnCasing(report.cards, actualColumns);
        if (report.cards.length === 0) report.cards = generateFallbackCards(dataShape);

        send('acknowledgment', { message: "Here's the updated report with your changes applied." });
        send('meta', { title: report.title, description: report.message, rowCount: allRows.length, template: report.template, activeTable });
        const validComponents: UITypeTree[] = [];
        for (const card of report.cards) {
          const node = hydrateTree(card, allRows);
          send('component', node);
          validComponents.push(node);
        }
        if (report.followUp.length > 0) send('followUp', report.followUp);
        cacheService.set(cacheKey, { components: validComponents, title: report.title, message: report.message, activeTable }, 5 * 60 * 1000);
        return;
      }

      // ── Ambiguous: ask user to clarify ────────────────────────────────────
      if (fusedResult.action === 'clarify_intent') {
        send('clarification', {
          opener: 'I want to make sure I understand what you need.',
          currentQuestion: {
            question: 'Are you looking to modify the current report, or would you like to start a new one?',
            options: ['Modify the current report', 'Start a new report'],
          },
        });
        return;
      }

      // fusedResult.action === 'new_report' → fall through to normal flow
    }
  }

  // Final check for log consistency
  if (routingLayer === 'NEW_REPORT_FALLBACK' && interactionType === 'assistant_intent') {
    routingLayer = 'GUIDED_ASSISTANT';
  }
  logOrchestration();

  // Build enriched query from clarification history if present
  const enrichedQuery = clarificationHistory.length > 0
    ? `${query}. Context: ${clarificationHistory.map(t => `${t.question} \u2192 ${t.answer}`).join('; ')}`
    : query;

  // \u2500\u2500 Step 0 \u2014 Conversational State Management & Semantic Merge \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const { getConversationState, updateConversationState, incrementClarificationDepth, clearClarificationState } = await import('../services/conversationStateManager');
  const { checkAmbiguity } = await import('../services/ambiguityGuard');
  const sessionId = 'default_session';
  let state = getConversationState(sessionId);

  // If clarification depth > 2, fail gracefully
  if (state.clarificationDepth! > 2) {
     clearClarificationState(sessionId);
     send('clarification', {
        opener: 'I need a bit more detail to determine the analytical metric.',
        currentQuestion: { question: 'Could you rephrase your request entirely?', options: ['Yes', 'No'] },
     });
     return;
  }

  // Explicit Semantic Extraction (from pure query to avoid history bleed)
  const { resolveSemantics } = await import('../services/semanticResolver');
  const explicitSemantics = resolveSemantics(query);
  
  // Comparative Intent Detection
  const qLower = query.toLowerCase();
  const isCompare = qLower.includes('compare') || qLower.includes(' vs ') || qLower.includes('against') || qLower.includes('with ');
  if (isCompare) {
     console.log(`[CompareIntentDetected] query=${query}`);
  }

  // Field-level context merge
  let explicitMetric = explicitSemantics.metric?.logical;
  let explicitDimension = explicitSemantics.dimension?.logical;
  
  // Awaiting field logic
  if (state.awaitingField === 'metric' && explicitMetric) {
     // User is answering a clarification
     // Keep explicit metric
  } else if (state.awaitingField === 'metric') {
     // Try to see if intent classifier caught it (fallback)
     const { classifyIntent } = await import('../services/intentClassifier');
     const rawIntent = await classifyIntent(enrichedQuery);
     if (rawIntent.metric !== 'unknown') explicitMetric = rawIntent.metric;
  }

  const resolvedMetric = explicitMetric ?? state.resolvedContext?.metric;
  const resolvedDimension = explicitDimension ?? state.resolvedContext?.dimension;
  // Domain/Report is usually maintained unless explicitly changed by a major route
  const resolvedDomain = state.resolvedContext?.domain || state.resolvedContext?.report;

  if (explicitMetric && explicitMetric !== state.resolvedContext?.metric) {
      console.log(`[ExplicitMetricOverride] metric=${explicitMetric}`);
  }
  if (explicitDimension && explicitDimension !== state.resolvedContext?.dimension) {
      console.log(`[ExplicitDimensionOverride] dimension=${explicitDimension}`);
  }

  console.log(`[ContextMergeResult] metric=${resolvedMetric} dimension=${resolvedDimension} domain=${resolvedDomain}`);

  // Update State with the completely merged context
  state = updateConversationState(sessionId, {
     resolvedContext: {
        metric: resolvedMetric,
        dimension: resolvedDimension,
        report: state.resolvedContext?.report,
        domain: state.resolvedContext?.domain
     }
  });

  // Prepare intent object for downstream (planner and bigquery)
  let intent = { 
     metric: resolvedMetric || 'unknown', 
     dimension: resolvedDimension || 'unknown', 
     intent: isCompare ? 'comparison' : 'metric_by_dimension' 
  } as { metric: string; dimension: string; intent: 'trend' | 'comparison' | 'metric_by_dimension' };

  // For ranking intents, the planner will correctly override the base intent type


  // \u2500\u2500 Step 1 \u2014 decide clarify vs route \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const forceGenerate = skipClarification || clarificationHistory.length >= 3;
  let tableOverride: string | undefined;

  // Context Completeness Validation
  const hasResolvedDomain = !!resolvedDomain;
  const isContextComplete = hasResolvedDomain && !!resolvedMetric;

  if (!forceGenerate) {
    if (isContextComplete) {
       // Skip onboarding/report clarification entirely because context is already complete
       tableOverride = state.resolvedContext?.report;
    } else {
       send('status', { message: 'Understanding your query...' });
       const analysis = await analyzeQuery(query, clarificationHistory);

       if (analysis.action === 'clarify') {
         send('clarification', {
           opener: analysis.opener,
           currentQuestion: { question: analysis.question, options: analysis.options },
         });
         return;
       }
       tableOverride = analysis.table;
       intent.metric = analysis.table;
       state = updateConversationState(sessionId, { resolvedContext: { report: analysis.table } });
    }
  }

  // ── Capability Validation — MUST run before planner, SQL generation, or rendering ──
  const { validateCapability } = await import('../services/capabilityValidator');
  const capability = validateCapability(resolvedDimension, resolvedMetric, query);
  if (!capability.supported) {
    send('meta', {
      title: 'Analysis Unavailable',
      description: capability.message,
      template: 'summary',
      rowCount: 0,
    });
    return;
  }

  const { generateAnalyticalPlan } = await import('../services/queryPlanner');
  const analyticalPlan = generateAnalyticalPlan(enrichedQuery, intent);
  console.log(`[Orchestration] AnalyticalPlan: `, JSON.stringify(analyticalPlan));

  // Check ambiguity guard deterministically
  const ambiguity = checkAmbiguity(enrichedQuery, analyticalPlan, state);
  if (ambiguity.isAmbiguous) {
     incrementClarificationDepth(sessionId);
     updateConversationState(sessionId, {
        awaitingClarification: true,
        awaitingField: ambiguity.missingField || null
     });
     send('clarification', {
        opener: 'I want to make sure I get this right.',
        currentQuestion: { 
           question: ambiguity.clarificationMessage || 'What would you like to analyze?', 
           options: ambiguity.clarificationOptions || ['Revenue', 'Other'] 
        },
     });
     return;
  }

  const { validateAnalyticalPlan } = await import('../services/validateAnalyticalPlan');
  const validation = validateAnalyticalPlan(analyticalPlan);

  if (!validation.isValid && analyticalPlan.intent !== 'raw') {
    send('meta', {
      title: 'Validation Error',
      description: 'I could not confidently identify the requested analytical metric.',
      template: 'summary',
      rowCount: 0
    });
    send('clarification', {
      opener: 'I could not confidently identify the requested analytical metric.',
      currentQuestion: { question: 'Could you please rephrase your request?', options: ['Yes', 'No'] },
    });
    return;
  }

  if (analyticalPlan.confidenceScore < 0.5 && !forceGenerate && analyticalPlan.intent !== 'raw') {
    incrementClarificationDepth(sessionId);
    send('clarification', {
      opener: 'I understand you want an analysis, but I need more details.',
      currentQuestion: { question: 'Could you specify which metric (like revenue, sales) you want to use?', options: ['Revenue', 'Units', 'Other'] },
    });
    return;
  }
  
  // If we made it here, clear any pending clarification state
  clearClarificationState(sessionId);

  // Step 2 — fetch real BigQuery data
  send('status', { message: 'Querying BigQuery...' });
  let allRows: any[];
  try {
    allRows = await executeQuery(intent, (meta) => send('bq_debug', meta), tableOverride, analyticalPlan);
  } catch (execErr: any) {
    console.log(`[ExecutionFailureTerminal] ${execErr.message}`);
    console.log(`[PipelineTerminated]`);
    send('meta', {
      title: 'Datasource Unavailable',
      description: 'Unable to retrieve data because the analytical datasource is currently unavailable.',
      template: 'summary',
      rowCount: 0,
    });
    return;
  }

  // Track which table ultimately produced data (for follow-up routing)
  const resolvedTable = tableOverride ?? activeTable;

  if (allRows.length === 0) {
    // Recovery — derive options from DATA_SOURCES (guaranteed real data), grouped by domain
    const answeredDomain = clarificationHistory
      .map(t => t.answer)
      .find(a => ALL_DOMAINS.some(d => d.toLowerCase() === a.toLowerCase()));

    let recoveryOptions: string[];
    let recoveryQuestion: string;

    if (answeredDomain) {
      const sources = getSourcesByDomain(answeredDomain);
      recoveryOptions = sources.map(s => s.reportName);
      recoveryQuestion = `Which ${answeredDomain} report would you like to explore?`;
    } else {
      recoveryOptions = ALL_DOMAINS;
      recoveryQuestion = 'Which domain would you like to explore?';
    }

    send('clarification', {
      opener: `I couldn't retrieve data for that selection. Here are reports I have data for:`,
      currentQuestion: { question: recoveryQuestion, options: recoveryOptions },
      isRecovery: true,
    });
    return;
  }

  // Step 3 — shape analysis (gives Gemma column types)
  const dataShape = await analyzeDataShape(allRows);
  const sampleRows = allRows.slice(0, SAMPLE_SIZE);

  // Step 4 — single Gemma call: decides everything (enriched query gives Gemma full context)
  send('status', { message: `Analysing ${allRows.length} rows with Gemma...` });
  const report = await generateReport(enrichedQuery, dataShape, sampleRows, priorContext);

  // Fix column casing: LLM often lowercases BQ column names which breaks charts
  const actualColumns = Object.keys(dataShape.columnTypes);
  report.cards = fixColumnCasing(report.cards, actualColumns);

  if (report.cards.length === 0) {
    console.warn('generateReport returned empty cards — using deterministic fallback');
    console.log(`[RenderingFallback] LLM returned empty cards, datasource was available and query succeeded`);
    report.cards = generateFallbackCards(dataShape);
    if (report.cards.length === 0) {
      send('error', { message: 'No data could be rendered. Try a more specific query.' });
      return;
    }
  }

  // Step 5 — stream report metadata (includes template so frontend can adapt layout)
  send('meta', {
    title: report.title,
    description: report.message,
    rowCount: allRows.length,
    template: report.template,
    activeTable: resolvedTable,
  });

  // Step 6 — hydrate + stream each card (recursive for layout wrappers)
  const validComponents: UITypeTree[] = [];

  for (const card of report.cards) {
    const node = hydrateTree(card, allRows);
    send('component', node);
    validComponents.push(node);
  }

  // Step 7 — stream follow-up suggestions
  if (report.followUp.length > 0) {
    send('followUp', report.followUp);
  }

  send('status', { message: `Done in ${Date.now() - start}ms` });

  cacheService.set(cacheKey, {
    components: validComponents,
    title: report.title,
    message: report.message,
    activeTable: resolvedTable,
  }, 5 * 60 * 1000);
}
