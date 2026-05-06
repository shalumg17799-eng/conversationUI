import dotenv from 'dotenv';
import { classifyIntent } from '../services/intentClassifier';
import { executeQuery } from '../services/queryEngine';
import { analyzeDataShape } from '../services/dataShapeAnalyzer';
import { generateReport, clarifyOrGenerate, getDataCatalog, ReportCard } from '../services/llmHandler';
import { UITypeTree } from '../types';
import { cacheService, generateKey } from '../services/cacheService';

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

  // Step 0 — clarification gate: force generate after 3 Q&A turns, otherwise ask LLM
  const forceGenerate = skipClarification || clarificationHistory.length >= 3;
  if (!forceGenerate) {
    send('status', { message: 'Understanding your query...' });
    const clarification = await clarifyOrGenerate(query, clarificationHistory);

    if (clarification.action === 'clarify') {
      send('clarification', {
        opener: clarification.opener,
        currentQuestion: clarification.currentQuestion,
      });
      return;
    }
  }

  // Step 1 — route intent to the right BQ table (use enriched query for better routing)
  const intent = await classifyIntent(enrichedQuery);

  // Step 2 — fetch real BigQuery data
  send('status', { message: 'Querying BigQuery...' });
  const allRows = await executeQuery(intent, (meta) => send('bq_debug', meta));

  if (allRows.length === 0) {
    // Recovery — show options grounded in real catalog data, not hardcoded guesses
    const catalog = await getDataCatalog();
    const recoveryOptions = catalog.reports.length > 0
      ? catalog.reports.slice(0, 4).map(r => r.name)
      : catalog.domains.slice(0, 4);
    send('clarification', {
      opener: `I couldn't find data matching that combination. Here are reports I have data for:`,
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

  // Step 4 — single Gemma call: decides everything (enriched query gives Gemma full context)
  send('status', { message: `Analysing ${allRows.length} rows with Gemma...` });
  const report = await generateReport(enrichedQuery, dataShape, sampleRows, priorContext);

  if (report.cards.length === 0) {
    send('error', { message: 'Gemma could not determine a suitable report structure. Try a more specific query.' });
    return;
  }

  // Step 5 — stream report metadata (includes template so frontend can adapt layout)
  send('meta', {
    title: report.title,
    description: report.message,
    rowCount: allRows.length,
    template: report.template,
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
  }, 5 * 60 * 1000);
}
