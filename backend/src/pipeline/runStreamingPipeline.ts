import dotenv from 'dotenv';
import { classifyIntent } from '../services/intentClassifier';
import { executeQuery } from '../services/queryEngine';
import { analyzeDataShape } from '../services/dataShapeAnalyzer';
import { generateReport, ReportCard } from '../services/llmHandler';
import { UITypeTree } from '../types';
import { cacheService, generateKey } from '../services/cacheService';

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

export async function runStreamingPipeline(query: string, send: SendFn): Promise<void> {
  const cacheKey = generateKey({ query, stream: true, v: 2 });
  const cached = cacheService.get<{ components: UITypeTree[]; title: string; message: string }>(cacheKey);

  if (cached) {
    send('meta', { title: cached.title, description: cached.message, cached: true });
    for (const component of cached.components) send('component', component);
    return;
  }

  const start = Date.now();

  // Step 1 — route intent to the right BQ table
  send('status', { message: 'Understanding your query...' });
  const intent = await classifyIntent(query);

  // Step 2 — fetch real BigQuery data
  send('status', { message: 'Querying BigQuery...' });
  const allRows = await executeQuery(intent);

  if (allRows.length === 0) {
    send('error', { message: 'No data returned from BigQuery for this query. Try rephrasing with a specific metric (e.g. "show revenue by territory").' });
    return;
  }

  // Step 3 — shape analysis (gives Gemma column types)
  const dataShape = await analyzeDataShape(allRows);
  const sampleRows = allRows.slice(0, SAMPLE_SIZE);

  // Step 4 — single Gemma call: decides everything
  send('status', { message: `Analysing ${allRows.length} rows with Gemma...` });
  const report = await generateReport(query, dataShape, sampleRows);

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

  // Step 6 — hydrate + stream each card
  const validComponents: UITypeTree[] = [];

  for (const card of report.cards) {
    const node = hydrate(card, allRows);
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
