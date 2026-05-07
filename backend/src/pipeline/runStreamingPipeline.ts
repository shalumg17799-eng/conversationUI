import dotenv from 'dotenv';
import { executeQuery } from '../services/queryEngine';
import { analyzeDataShape } from '../services/dataShapeAnalyzer';
import { generateReport, analyzeQuery, ReportCard } from '../services/llmHandler';
import { DATA_SOURCES, ALL_DOMAINS, getSourcesByDomain } from '../services/dataSourceMap';
import { UITypeTree, ShapeSignature } from '../types';
import { cacheService, generateKey } from '../services/cacheService';

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

  // KPIGrid from the first 4 numeric columns
  if (shape.measureColumns.length > 0) {
    cards.push({
      renderType: 'KPIGrid',
      props: {
        metrics: shape.measureColumns.slice(0, 4).map(col => ({ title: col, value: '—' })),
        explanation: 'Key metrics from the dataset.',
      },
    });
  }

  // Time-series chart
  if (shape.isTimeSeries && shape.timeColumn && shape.measureColumns.length > 0) {
    cards.push({
      renderType: 'LineChart',
      props: {
        title: `${shape.measureColumns[0]} Over Time`,
        xKey: shape.timeColumn,
        yKey: shape.measureColumns[0],
        explanation: `Trend of ${shape.measureColumns[0]} over time.`,
      },
    });
  } else if (shape.dimensionColumns.length > 0 && shape.measureColumns.length > 0) {
    cards.push({
      renderType: 'BarChart',
      props: {
        title: `${shape.measureColumns[0]} by ${shape.dimensionColumns[0]}`,
        xKey: shape.dimensionColumns[0],
        yKey: shape.measureColumns[0],
        explanation: `${shape.measureColumns[0]} broken down by ${shape.dimensionColumns[0]}.`,
      },
    });
  }

  // Always include a table as last resort
  const columns = [...shape.dimensionColumns, ...shape.measureColumns].slice(0, 8);
  if (columns.length > 0) {
    cards.push({
      renderType: 'Table',
      props: {
        title: 'Data Detail',
        columns,
        explanation: 'Full dataset view.',
      },
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

// Modification-intent keywords — signals the user wants to change an existing report
const FOLLOW_UP_KEYWORDS = [
  'remove', 'add', 'show only', 'hide', 'filter', 'sort', 'exclude', 'include',
  'change', 'without', 'with only', 'limit to', 'top ', 'only show', 'group by',
  'drill down', 'break down', 'update', 'replace', 'swap',
];

function isFollowUpCommand(query: string): boolean {
  const q = query.toLowerCase();
  return FOLLOW_UP_KEYWORDS.some(kw => q.includes(kw));
}

export async function runStreamingPipeline(
  query: string,
  send: SendFn,
  skipClarification = false,
  clarificationHistory: ClarificationTurn[] = [],
  priorContext?: string,
  activeTable?: string,
): Promise<void> {
  const cacheKey = generateKey({ query, stream: true, v: 2, history: clarificationHistory, prior: priorContext });
  const cached = cacheService.get<{ components: UITypeTree[]; title: string; message: string; activeTable?: string }>(cacheKey);

  console.log(`[Pipeline] query="${query}" skipClarification=${skipClarification} history=${clarificationHistory.length} activeTable=${activeTable ?? 'none'} cacheHit=${!!cached}`);

  if (cached) {
    send('meta', { title: cached.title, description: cached.message, cached: true, activeTable: cached.activeTable });
    for (const component of cached.components) send('component', component);
    return;
  }

  // Follow-up command detection: if we know the active table and this looks like a
  // modification request (not a new domain/report selection), skip clarification and
  // reuse the same table. The LLM still handles the full report generation.
  const isFollowUp = !!activeTable && !!priorContext && clarificationHistory.length === 0 && isFollowUpCommand(query);
  if (isFollowUp) {
    console.log(`[Pipeline] Follow-up command detected — reusing table: ${activeTable}`);
    skipClarification = true;
  }

  const start = Date.now();

  // Build enriched query from original + clarification history (or follow-up modification)
  const enrichedQuery = clarificationHistory.length > 0
    ? `${query}. Context: ${clarificationHistory.map(t => `${t.question} → ${t.answer}`).join('; ')}`
    : isFollowUp
      ? `MODIFICATION REQUEST: ${query}` // signal to LLM this is an update, not a new report
      : query;

  // Step 0+1 — single LLM call: decide clarify vs route
  const forceGenerate = skipClarification || clarificationHistory.length >= 3;
  let tableOverride: string | undefined;
  let intent: { metric: string; dimension: string; intent: 'trend' | 'comparison' | 'metric_by_dimension' };

  if (isFollowUp && activeTable) {
    // Follow-up path — skip all routing, use the same table as the prior report
    tableOverride = activeTable;
    intent = { metric: activeTable, dimension: 'unknown', intent: 'metric_by_dimension' };
  } else if (!forceGenerate) {
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
    intent = { metric: analysis.table, dimension: 'unknown', intent: analysis.intent };
  } else {
    const { classifyIntent } = await import('../services/intentClassifier');
    intent = await classifyIntent(enrichedQuery);
  }

  // Step 2 — fetch real BigQuery data
  send('status', { message: 'Querying BigQuery...' });
  const allRows = await executeQuery(intent, (meta) => send('bq_debug', meta), tableOverride);

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
