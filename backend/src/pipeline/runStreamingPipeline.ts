import dotenv from 'dotenv';
import { executeQuery } from '../services/queryEngine';
import { analyzeDataShape } from '../services/dataShapeAnalyzer';
import {
  generateReport, analyzeQuery,
  classifyAndEditReport, buildHydrationMap, rehydrateEditedCards,
  ReportCard, ConversationTurn,
  getAvailableDataSources,
} from '../services/llmHandler';
import { runQueryWithMeta, qualifiedTable } from '../lib/bigqueryClient';
import { DATA_SOURCES, buildFilteredSQL, extractQueryFilters } from '../services/dataSourceMap';
import { validateAndFilterCards } from '../services/uiValidator';
import { composeReport } from '../services/reportComposer';
import {
  detectAnalyticalIntent,
  lockTemplate,
  enforceComponentConstraints,
  buildScopedDataset,
  selectRowsForCard,
  buildGovernanceHint,
  buildAnalyticalContext,
  shouldInheritContext,
  buildDeterministicCards,
  AnalyticalContext,
  AnalyticalIntent,
  TemplateId,
} from '../lib/renderGovernance';
import { UITypeTree, ShapeSignature } from '../types';
import { cacheService, generateKey } from '../services/cacheService';

dotenv.config();

type SendFn = (event: string, data: unknown) => void;

const SAMPLE_SIZE = 20;

// ── Column casing fix ─────────────────────────────────────────────────────────
function fixColumnCasing(cards: ReportCard[], actualColumns: string[]): ReportCard[] {
  const caseMap = new Map<string, string>();
  actualColumns.forEach(col => caseMap.set(col.toLowerCase(), col));

  const fixProps = (props: Record<string, any>): Record<string, any> => {
    const out = { ...props };
    for (const key of ['xKey', 'yKey', 'nameKey', 'valueKey', 'labelKey', 'timeColumn']) {
      if (typeof out[key] === 'string') out[key] = caseMap.get(out[key].toLowerCase()) ?? out[key];
    }
    if (Array.isArray(out.columns)) {
      out.columns = out.columns.map((c: string) => caseMap.get(c.toLowerCase()) ?? c);
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

// ── Fallback cards ────────────────────────────────────────────────────────────
function generateFallbackCards(shape: ShapeSignature): ReportCard[] {
  const cards: ReportCard[] = [];
  const bestDimension = shape.dimensionColumns.find(c => !/(_id|_key|_code|_num)$/i.test(c)) ?? shape.dimensionColumns[0];
  const preferredOrder = ['revenue', 'rate', 'score', 'pct', 'percent', 'count', 'total', 'avg'];
  const sortedMeasures = [...shape.measureColumns].sort((a, b) => {
    const aScore = preferredOrder.findIndex(p => a.toLowerCase().includes(p));
    const bScore = preferredOrder.findIndex(p => b.toLowerCase().includes(p));
    return (aScore === -1 ? 99 : aScore) - (bScore === -1 ? 99 : bScore);
  });
  const topMeasures = sortedMeasures.slice(0, 4);

  if (topMeasures.length > 0) {
    cards.push({ renderType: 'KPIGrid', props: { metrics: topMeasures.map(col => ({ title: col, value: '—' })) } });
  }
  if (shape.isTimeSeries && shape.timeColumn && topMeasures.length > 0) {
    cards.push({ renderType: 'LineChart', props: { title: `${topMeasures[0]} Over Time`, xKey: shape.timeColumn, yKey: topMeasures[0] } });
  } else if (bestDimension && topMeasures.length > 0) {
    cards.push({ renderType: 'BarChart', props: { title: `${topMeasures[0]} by ${bestDimension}`, xKey: bestDimension, yKey: topMeasures[0] } });
  }
  const columns = [bestDimension, ...topMeasures].filter(Boolean).slice(0, 8) as string[];
  if (columns.length > 0) {
    cards.push({ renderType: 'Table', props: { title: 'Data Detail', columns } });
  }
  return cards;
}

// ── Scoped hydrateTree ────────────────────────────────────────────────────────
// Each card receives only the rows appropriate for its renderType and intent.
// This replaces the old hydrateTree(card, allRows) which leaked full datasets.
function hydrateTree(
  card: ReportCard,
  intent: AnalyticalIntent,
  scoped: ReturnType<typeof buildScopedDataset>,
): UITypeTree {
  const { renderType, props } = card;

  const hydratedChildren: UITypeTree[] = (card.children ?? []).map(child =>
    hydrateTree(child, intent, scoped)
  );

  // Select the correct scoped row set for this card type + intent
  const rows = selectRowsForCard(renderType, intent, scoped);

  switch (renderType) {
    case 'LineChart':
    case 'AreaChart': {
      const { xKey, yKey } = props;
      if (xKey && yKey) {
        const grouped = new Map<string, { sum: number; count: number }>();
        for (const row of rows) {
          const x = String(row[xKey] ?? '');
          const y = Number(row[yKey]) || 0;
          const entry = grouped.get(x) ?? { sum: 0, count: 0 };
          entry.sum += y; entry.count += 1;
          grouped.set(x, entry);
        }
        const aggregated = Array.from(grouped.entries()).map(([x, { sum, count }]) => ({
          ...Object.fromEntries(Object.entries(rows.find(r => String(r[xKey]) === x) ?? {})),
          [xKey]: x,
          [yKey]: Math.round((sum / count) * 100) / 100,
        }));
        return { renderType, props: { ...props, data: aggregated }, children: hydratedChildren };
      }
      return { renderType, props: { ...props, data: rows }, children: hydratedChildren };
    }

    case 'BarChart':
    case 'PieChart':
      return { renderType, props: { ...props, data: rows }, children: hydratedChildren };

    case 'RankedList': {
      const { labelKey, valueKey, limit = 10 } = props;
      const grouped = new Map<string, { sum: number; count: number }>();
      for (const row of rows) {
        const label = String(row[labelKey] ?? '');
        const val = Number(row[valueKey]) || 0;
        const entry = grouped.get(label) ?? { sum: 0, count: 0 };
        entry.sum += val; entry.count += 1;
        grouped.set(label, entry);
      }
      const items = Array.from(grouped.entries())
        .map(([label, { sum, count }]) => ({ label, value: Math.round((sum / count) * 100) / 100 }))
        .sort((a, b) => b.value - a.value)
        .slice(0, limit)
        .map((item, i) => ({ rank: i + 1, label: item.label, value: item.value }));
      return { renderType, props: { ...props, items }, children: hydratedChildren };
    }

    case 'Table':
    case 'GenerativeTable': {
      const columns = props.columns ?? (rows[0] ? Object.keys(rows[0]) : []);
      return { renderType, props: { ...props, columns, data: rows, rows }, children: hydratedChildren };
    }

    case 'TwoColumn':
    case 'Section':
      return { renderType, props, children: hydratedChildren };

    default:
      return { renderType, props, children: hydratedChildren };
  }
}

// ── Compact data context for follow-up QA ────────────────────────────────────
function buildCompactDataContext(cards: ReportCard[], maxRows = 10): string {
  const lines: string[] = [];
  const extract = (card: ReportCard) => {
    const p = card.props as any;
    switch (card.renderType) {
      case 'KPICard': case 'StatDelta':
        if (p.title && p.value !== undefined) lines.push(`${p.title}: ${p.value}${p.trend ? ` (${p.trend})` : ''}`);
        break;
      case 'KPIGrid':
        if (Array.isArray(p.metrics)) p.metrics.forEach((m: any) => { if (m.title) lines.push(`${m.title}: ${m.value ?? '—'}`); });
        break;
      case 'RankedList':
        if (Array.isArray(p.items) && p.title) {
          lines.push(`${p.title}:`);
          p.items.slice(0, maxRows).forEach((item: any) => lines.push(`  #${item.rank} ${item.label}: ${item.value}`));
        }
        break;
      case 'Table': case 'GenerativeTable': {
        const rows: any[] = p.data ?? p.rows ?? [];
        if (rows.length > 0 && p.title) {
          lines.push(`${p.title} (sample rows):`);
          rows.slice(0, maxRows).forEach((row: any) => lines.push('  ' + Object.entries(row).map(([k, v]) => `${k}=${v}`).join(', ')));
        }
        break;
      }
    }
    card.children?.forEach(extract);
  };
  cards.forEach(extract);
  return lines.join('\n');
}

// ── Extract entities from query using dataSourceMap filters ──────────────────
function extractEntities(query: string, table: string): string[] {
  const filters = extractQueryFilters(query, table);
  return filters.flatMap(f => f.values);
}

export interface ClarificationTurn { question: string; answer: string; }

// ── Main pipeline ─────────────────────────────────────────────────────────────
export async function runStreamingPipeline(
  query: string,
  send: SendFn,
  skipClarification = false,
  clarificationHistory: ClarificationTurn[] = [],
  priorContext?: string,
  activeTable?: string,
  currentCards?: ReportCard[],
  conversationHistory: ConversationTurn[] = [],
  analyticalContext?: AnalyticalContext,
): Promise<void> {
  const cacheKey = generateKey({ query, stream: true, v: 3, history: clarificationHistory, prior: priorContext });
  const cached = cacheService.get<{ components: UITypeTree[]; title: string; message: string; activeTable?: string; analyticalContext?: AnalyticalContext }>(cacheKey);

  console.log(`[Pipeline] query="${query}" activeTable=${activeTable ?? 'none'} cacheHit=${!!cached}`);

  if (cached) {
    send('meta', { title: cached.title, description: cached.message, cached: true, activeTable: cached.activeTable, analyticalContext: cached.analyticalContext });
    for (const component of cached.components) send('component', component);
    return;
  }

  // ── [ContextContinuity] Determine if this is a follow-up ─────────────────
  const hasExistingReport = !!priorContext && !!activeTable && currentCards && currentCards.length > 0;
  const inClarificationFlow = clarificationHistory.length > 0;
  const isFollowUp = hasExistingReport && shouldInheritContext(query, analyticalContext ?? null);

  console.log(`[ContextContinuity] hasExistingReport=${hasExistingReport} isFollowUp=${isFollowUp} analyticalContext=${analyticalContext?.activeTemplate ?? 'none'}`);

  const TEXT_REQUEST_RE = /\b(summar(y|ize|ise)|explain|in\s+(text|points?|pointers?|bullets?)|tell\s+me|what\s+(is|are|does|drives|caused?)|why\s+(is|are|does)|how\s+(many|much|does)|insights?|describe|what\s+does\s+this\s+mean|give\s+(me\s+)?(the\s+)?summary|analyze\s+this)\b/i;
  const isClearTextRequest = TEXT_REQUEST_RE.test(query);

  // ── Follow-up / edit path ─────────────────────────────────────────────────
  if (hasExistingReport && !inClarificationFlow && !skipClarification) {
    send('status', { message: 'Understanding your request...' });
    const dataContext = buildCompactDataContext(currentCards!);
    const classifyQuery = isClearTextRequest
      ? `RESPOND IN TEXT FORMAT ONLY (qa_answer). Do not generate a new report or dashboard. ${query}`
      : query;

    let fusedResult: Awaited<ReturnType<typeof classifyAndEditReport>> | null = null;
    try {
      fusedResult = await classifyAndEditReport(classifyQuery, currentCards!, priorContext!, dataContext, conversationHistory);
    } catch (err) {
      console.error('[Pipeline] classifyAndEditReport failed:', err);
    }

    if (fusedResult) {
      console.log(`[Pipeline] Fused intent: ${fusedResult.action}`);

      if (fusedResult.action === 'edit_structural') {
        const hydrationMap = buildHydrationMap(currentCards!);
        const rehydrated = rehydrateEditedCards(fusedResult.cards, hydrationMap);
        send('acknowledgment', { message: fusedResult.acknowledgment });
        send('meta', {
          title: fusedResult.title || (priorContext!.match(/Title: "([^"]+)"/)?.[1] ?? 'Updated Report'),
          description: fusedResult.message,
          rowCount: null,
          template: analyticalContext?.activeTemplate ?? 'summary',
          activeTable,
          analyticalContext,
        });
        for (const card of rehydrated) send('component', card);
        if (fusedResult.followUp.length > 0) send('followUp', fusedResult.followUp);
        return;
      }

      if (fusedResult.action === 'qa_answer') {
        send('qa_answer', { message: fusedResult.message, followUp: fusedResult.followUp });
        return;
      }

      if (fusedResult.action === 'edit_data_change') {
        send('status', { message: 'Fetching updated data...' });
        let allRows: any[] = [];
        const sqlOverride = fusedResult.sqlOverride;

        if (sqlOverride && activeTable) {
          try {
            const sql = `SELECT * FROM ${qualifiedTable(activeTable)} ${sqlOverride}`;
            console.log(`[Pipeline] edit_data_change sql: ${sql}`);
            const result = await runQueryWithMeta(sql);
            allRows = result.rows;
          } catch (sqlErr: any) {
            console.warn('[Pipeline] sqlOverride failed, falling back:', sqlErr.message);
          }
        }
        if (allRows.length === 0 && activeTable) {
          try {
            const result = await runQueryWithMeta(`SELECT * FROM ${qualifiedTable(activeTable)} LIMIT 50`);
            allRows = result.rows;
          } catch (e: any) {
            console.warn('[Pipeline] edit_data_change fallback failed:', e.message);
          }
        }
        if (allRows.length === 0) {
          send('acknowledgment', { message: "I couldn't find data matching that filter. The original report is unchanged." });
          for (const card of currentCards!) send('component', card);
          return;
        }

        // Re-run governance for the edit query
        const editIntent = detectAnalyticalIntent(query);
        const editShape = await analyzeDataShape(allRows);
        const editEntities = extractEntities(query, activeTable ?? '');
        const editTemplate = lockTemplate(editIntent, editShape);
        const { allowedComponents: editAllowed } = composeReport(editIntent, editShape, query);
        const editScoped = buildScopedDataset(allRows, editIntent, editShape, editEntities, null, 'none');
        const editSample = editIntent === 'comparison' ? editScoped.comparisonRows.slice(0, SAMPLE_SIZE)
          : editIntent === 'ranking' ? editScoped.rankingRows.slice(0, SAMPLE_SIZE)
          : allRows.slice(0, SAMPLE_SIZE);
        const editHint = buildGovernanceHint(editIntent, editTemplate, editAllowed, editEntities, false, analyticalContext ?? null);
        const editQuery = `EDIT REQUEST: ${query}. ${editHint}. Prior report: ${priorContext}`;

        send('status', { message: 'Updating report...' });
        const report = await generateReport(editQuery, editShape, editSample, priorContext);
        report.cards = fixColumnCasing(report.cards, Object.keys(editShape.columnTypes));
        const { cards: constrained } = enforceComponentConstraints(report.cards.length > 0 ? report.cards : generateFallbackCards(editShape), editTemplate);
        const { valid } = validateAndFilterCards(constrained);
        const finalCards = valid.length > 0 ? valid : generateFallbackCards(editShape);

        const newContext = buildAnalyticalContext(query, editIntent, editTemplate, editEntities, editShape, activeTable ?? null, report.title, report.message);
        send('acknowledgment', { message: "Here's the updated report with your changes applied." });
        send('meta', { title: report.title, description: report.message, rowCount: allRows.length, template: editTemplate, activeTable, analyticalContext: newContext });
        const validComponents: UITypeTree[] = [];
        for (const card of finalCards) {
          const node = hydrateTree(card as ReportCard, editIntent, editScoped);
          send('component', node);
          validComponents.push(node);
        }
        if (report.followUp.length > 0) send('followUp', report.followUp);
        cacheService.set(cacheKey, { components: validComponents, title: report.title, message: report.message, activeTable, analyticalContext: newContext }, 5 * 60 * 1000);
        return;
      }

      if (fusedResult.action === 'clarify_intent') {
        send('clarification', {
          opener: 'I want to make sure I understand what you need.',
          currentQuestion: { question: 'Are you looking to modify the current report, or would you like to start a new one?', options: ['Modify the current report', 'Start a new report'] },
        });
        return;
      }

      if (fusedResult.action === 'new_report' && isClearTextRequest && dataContext) {
        try {
          const forced = await classifyAndEditReport(
            `You MUST respond with action="qa_answer". Answer this question directly using the report data: ${query}`,
            currentCards!, priorContext!, dataContext, conversationHistory,
          );
          if (forced.action === 'qa_answer') {
            send('qa_answer', { message: forced.message, followUp: forced.followUp });
            return;
          }
        } catch (e) { console.error('[Pipeline] forced qa_answer failed:', e); }
      }
      // new_report → fall through to full pipeline
    }
  }

  const start = Date.now();

  const enrichedQuery = clarificationHistory.length > 0
    ? `${query}. Context: ${clarificationHistory.map(t => `${t.question} → ${t.answer}`).join('; ')}`
    : query;

  // ── [IntentClassification] Detect analytical intent deterministically ─────
  const analyticalIntent: AnalyticalIntent = detectAnalyticalIntent(enrichedQuery);
  console.log(`[IntentClassification] intent=${analyticalIntent} query="${query}"`);

  // ── Route to table ────────────────────────────────────────────────────────
  const forceGenerate = skipClarification || clarificationHistory.length >= 3;
  let tableOverride: string | undefined;
  const intentStub = { metric: 'unknown', dimension: 'unknown', intent: 'metric_by_dimension' as const };

  send('status', { message: 'Understanding your query...' });
  const analysis = await analyzeQuery(query, clarificationHistory);

  if (analysis.action === 'clarify' && !forceGenerate) {
    send('clarification', { opener: analysis.opener, currentQuestion: { question: analysis.question, options: analysis.options } });
    return;
  }

  if (analysis.action === 'route') {
    tableOverride = analysis.table;
  } else {
    const allTexts = [query, ...clarificationHistory.map(t => t.answer)];
    const availableSources = getAvailableDataSources();
    const matched = availableSources.find(s => allTexts.some(t => t.toLowerCase().includes(s.reportName.toLowerCase())))
      ?? availableSources.find(s => allTexts.some(t => t.toLowerCase().includes(s.domain.toLowerCase())));
    tableOverride = matched?.table ?? availableSources[0]?.table;
  }

  // ── [DatasetFiltering] Build filtered SQL ─────────────────────────────────
  send('status', { message: 'Querying BigQuery...' });
  let filteredSQL: string | undefined;
  let isFiltered = false;

  if (tableOverride) {
    const source = DATA_SOURCES.find(ds => ds.table === tableOverride);
    if (source) {
      const built = buildFilteredSQL(source, qualifiedTable, enrichedQuery);
      if (built.isFiltered) {
        filteredSQL = built.sql;
        isFiltered = true;
        console.log(`[DatasetFiltering] Filtered SQL: ${filteredSQL}`);
      }
    }
  }

  let allRows = await executeQuery(intentStub, (meta) => send('bq_debug', meta), tableOverride, filteredSQL);

  if (isFiltered && allRows.length === 0) {
    console.warn('[DatasetFiltering] Filtered query returned 0 rows — falling back to full table');
    allRows = await executeQuery(intentStub, (meta) => send('bq_debug', meta), tableOverride);
    isFiltered = false;
  }

  const resolvedTable = tableOverride ?? activeTable;

  if (allRows.length === 0) {
    const availableSources = getAvailableDataSources();
    const failedTable = tableOverride;
    const answeredDomain = clarificationHistory.map(t => t.answer)
      .find(a => [...new Set(availableSources.map(s => s.domain))].some(d => d.toLowerCase() === a.toLowerCase()));
    let recoveryOptions: string[];
    let recoveryQuestion: string;
    if (answeredDomain) {
      const sources = availableSources.filter(s => s.domain.toLowerCase() === answeredDomain.toLowerCase() && s.table !== failedTable);
      recoveryOptions = sources.length > 0 ? sources.map(s => s.reportName) : [...new Set(availableSources.map(s => s.domain))];
      recoveryQuestion = sources.length > 0 ? `Which ${answeredDomain} report would you like to explore?` : 'Which domain would you like to explore?';
    } else {
      recoveryOptions = [...new Set(availableSources.map(s => s.domain))];
      recoveryQuestion = 'Which domain would you like to explore?';
    }
    send('clarification', { opener: `I don't have data available for that report right now. Here's what I can show you instead:`, currentQuestion: { question: recoveryQuestion, options: recoveryOptions }, isRecovery: true });
    return;
  }

  // ── [DatasetShapeAnalysis] ────────────────────────────────────────────────
  const dataShape = await analyzeDataShape(allRows);
  console.log(`[DatasetShapeAnalysis] rows=${allRows.length} measures=[${dataShape.measureColumns.join(',')}] dims=[${dataShape.dimensionColumns.join(',')}] timeSeries=${dataShape.isTimeSeries}`);

  // ── [TemplateLocked] Lock template from intent + shape ────────────────────
  const lockedTemplate: TemplateId = lockTemplate(analyticalIntent, dataShape);
  const { allowedComponents } = composeReport(analyticalIntent, dataShape, enrichedQuery);
  console.log(`[TemplateLocked] template=${lockedTemplate} allowed=[${allowedComponents.join(', ')}]`);

  // ── [DatasetScopeEnforced] Build scoped datasets ──────────────────────────
  const entities = extractEntities(enrichedQuery, tableOverride ?? '');
  const rankingMatch = enrichedQuery.match(/\b(top|bottom)\s+(\d+)\b/i);
  const rankingN = rankingMatch ? parseInt(rankingMatch[2], 10) : null;
  const rankingMode = rankingMatch?.[1]?.toLowerCase() === 'bottom' ? 'bottom_n' as const
    : rankingMatch?.[1]?.toLowerCase() === 'top' ? 'top_n' as const : 'none' as const;

  const scoped = buildScopedDataset(allRows, analyticalIntent, dataShape, entities, rankingN, rankingMode);
  console.log(`[DatasetScopeEnforced] entities=[${entities.join(',')}] comparisonRows=${scoped.comparisonRows.length} rankingRows=${scoped.rankingRows.length} trendRows=${scoped.trendRows.length}`);

  // ── [RenderGovernance] Build governance hint for LLM narrative ─────────
  const governanceHint = buildGovernanceHint(analyticalIntent, lockedTemplate, allowedComponents, entities, isFiltered, analyticalContext ?? null);

  // Sample rows: use intent-appropriate scoped set so LLM sees relevant data
  const sampleRows = analyticalIntent === 'comparison' ? scoped.comparisonRows.slice(0, SAMPLE_SIZE)
    : analyticalIntent === 'ranking' ? scoped.rankingRows.slice(0, SAMPLE_SIZE)
    : analyticalIntent === 'trend' ? scoped.trendRows.slice(0, SAMPLE_SIZE)
    : allRows.slice(0, SAMPLE_SIZE);

  // ── [DeterministicComponentSelection] Build render tree deterministically ─
  // Component selection, layout, and prop mapping are now fully deterministic.
  // The LLM is called ONLY for title, message, followUp, and narrative cards.
  const deterministicCards = buildDeterministicCards(
    analyticalIntent, lockedTemplate, dataShape, scoped, entities, rankingN,
  );

  // ── [PlannerGeneration] LLM provides narrative enrichment only ────────────
  // The LLM receives the governance hint and scoped sample.
  // It must NOT choose components — only write title, message, followUp.
  send('status', { message: `Generating narrative with Gemma...` });
  const narrativeQuery = `${enrichedQuery} ${governanceHint} IMPORTANT: The component layout is already determined. You MUST only provide: title (5-8 words), message (2-3 sentence narrative), and followUp questions. Do NOT output cards array — it will be ignored.`;
  const report = await generateReport(narrativeQuery, dataShape, sampleRows, priorContext);

  // ── [TemplateComposition] Merge: deterministic cards + LLM narrative cards ─
  // LLM narrative cards (InsightCard, SummaryText) are allowed through if valid.
  // All chart/table/KPI cards from LLM are discarded — deterministic ones are used.
  const NARRATIVE_TYPES = new Set(['InsightCard', 'SummaryText', 'AlertBanner']);
  const llmNarrativeCards = (report.cards ?? []).filter(c => NARRATIVE_TYPES.has(c.renderType));

  // Combine: deterministic structural cards first, then LLM narrative enrichment
  const mergedCards: ReportCard[] = [
    ...deterministicCards as ReportCard[],
    ...llmNarrativeCards,
  ];

  // ── [ComponentConstraintApplied] Enforce template constraints ────────────
  const actualColumns = Object.keys(dataShape.columnTypes);
  const casingFixed = fixColumnCasing(mergedCards, actualColumns);
  const { cards: constrainedCards, stripped } = enforceComponentConstraints(casingFixed, lockedTemplate);
  if (stripped.length > 0) console.log(`[ComponentConstraintApplied] Stripped: [${stripped.join(', ')}]`);

  // ── [UIValidation] Drop cards with missing required props ─────────────────
  const { valid: validCards, invalid } = validateAndFilterCards(constrainedCards);
  if (invalid.length > 0) console.log(`[UIValidation] Dropped invalid: ${invalid.join(' | ')}`);

  const finalCards = validCards.length > 0 ? validCards : generateFallbackCards(dataShape);

  // ── Build structured analytical context for follow-up continuity ──────────
  const newAnalyticalContext = buildAnalyticalContext(
    enrichedQuery, analyticalIntent, lockedTemplate, entities,
    dataShape, resolvedTable ?? null, report.title, report.message,
  );
  console.log(`[ContextContinuity] Built context: template=${newAnalyticalContext.activeTemplate} entities=[${newAnalyticalContext.entities.join(',')}] metric=${newAnalyticalContext.metric}`);

  // ── Stream metadata ───────────────────────────────────────────────────────
  send('meta', {
    title: report.title,
    description: report.message,
    rowCount: allRows.length,
    template: lockedTemplate,
    activeTable: resolvedTable,
    analyticalContext: newAnalyticalContext,
  });

  // ── [ScopedHydration] Hydrate each card with intent-scoped rows ───────────
  const validComponents: UITypeTree[] = [];
  for (const card of finalCards) {
    const node = hydrateTree(card as ReportCard, analyticalIntent, scoped);
    send('component', node);
    validComponents.push(node);
  }

  if (report.followUp.length > 0) send('followUp', report.followUp);
  send('status', { message: `Done in ${Date.now() - start}ms` });

  cacheService.set(cacheKey, {
    components: validComponents,
    title: report.title,
    message: report.message,
    activeTable: resolvedTable,
    analyticalContext: newAnalyticalContext,
  }, 5 * 60 * 1000);
}
