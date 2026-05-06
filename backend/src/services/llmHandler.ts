import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { ShapeSignature } from '../types';
import { runQueryWithMeta, qualifiedTable } from '../lib/bigqueryClient';

dotenv.config();

// ── Data catalog cache ────────────────────────────────────────────────────────

interface DataCatalog {
  domains: string[];
  reports: { name: string; domain: string; kpis: string[] }[];
  datasets: { name: string; domain: string; fields: string[] }[];
  summaryText: string;
}

let catalogCache: { data: DataCatalog; fetchedAt: number } | null = null;
const CATALOG_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function getDataCatalog(): Promise<DataCatalog> {
  if (catalogCache && Date.now() - catalogCache.fetchedAt < CATALOG_TTL_MS) {
    return catalogCache.data;
  }

  try {
    const [reportRows, datasetRows] = await Promise.all([
      runQueryWithMeta(`SELECT report_name, domain, key_kpis FROM \`${qualifiedTable('catalog_reports')}\``).then(r => r.rows),
      runQueryWithMeta(`SELECT dataset_name, domain, key_fields FROM \`${qualifiedTable('catalog_datasets')}\``).then(r => r.rows),
    ]);

    const reports = reportRows.map((r: any) => ({
      name: r.report_name,
      domain: r.domain,
      kpis: (r.key_kpis || []).map((k: any) => k.kpi_name).filter(Boolean),
    }));

    const datasets = datasetRows.map((d: any) => ({
      name: d.dataset_name,
      domain: d.domain,
      fields: (d.key_fields || []).map((f: any) => f.field_name).filter(Boolean),
    }));

    const domains = [...new Set([...reports.map(r => r.domain), ...datasets.map(d => d.domain)])].filter(Boolean);

    const summaryText = [
      `AVAILABLE DOMAINS: ${domains.join(', ')}`,
      '',
      'AVAILABLE REPORTS (use these names and KPIs as options):',
      ...reports.map(r => `- ${r.name} [${r.domain}] — KPIs: ${r.kpis.slice(0, 3).join(', ')}`),
      '',
      'AVAILABLE DATASETS (use these as data source options):',
      ...datasets.map(d => `- ${d.name} [${d.domain}]`),
    ].join('\n');

    const catalog: DataCatalog = { domains, reports, datasets, summaryText };
    catalogCache = { data: catalog, fetchedAt: Date.now() };
    return catalog;
  } catch (err) {
    console.error('getDataCatalog error:', err);
    // Fallback — known domains from actual BQ tables
    const fallback: DataCatalog = {
      domains: ['Sales', 'Customer Experience', 'Network', 'Contact Center'],
      reports: [],
      datasets: [],
      summaryText: 'AVAILABLE DOMAINS: Sales, Customer Experience, Network, Contact Center',
    };
    return fallback;
  }
}

const MODEL = 'gemma-4-31b-it';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ClarifyQuestion {
  question: string;
  options: string[];
}

export interface ClarifyResult {
  action: 'generate' | 'clarify';
  opener: string;
  currentQuestion: ClarifyQuestion | null;
  questions: string[];
}

export interface ReportCard {
  renderType: string;
  props: Record<string, any>;
  children?: ReportCard[];
}

export interface LLMReport {
  template: string;
  message: string;
  title: string;
  description: string;
  cards: ReportCard[];
  followUp: Array<{ label: string; intent: string }>;
}

export interface LLMResponse {
  message: string;
  cards: Array<{ type: string; renderType: string; props: Record<string, any> }>;
  followUp: Array<{ label: string; intent: string }>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

function extractJSON(text: string): string {
  // Grab outermost { ... } block
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) return text.slice(start, end + 1);
  return text;
}

let _ai: GoogleGenAI | null = null;
function getAI() {
  if (!_ai) _ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY || '' });
  return _ai;
}

// ── System prompt ─────────────────────────────────────────────────────────────

const REPORT_SYSTEM_PROMPT = `You are an expert business intelligence analyst and UI architect.
You receive a user query and real data from BigQuery.
Your job is to design a rich, interactive dashboard that best answers the query.

═══════════════════════════════════════════════════
STEP 1 — CHOOSE A TEMPLATE
═══════════════════════════════════════════════════
Pick the ONE template that best fits the query intent:

- "summary"        → High-level overview. Use for "show me X", "what is the status of Y". Lead with KPIGrid + 1-2 charts.
- "deep_dive"      → Full analysis. Use for "analyze X", "give me a full report on Y". Use metrics + charts + table + insights.
- "trend_analysis" → Time-based focus. Use for "how has X changed", "trend of Y over time". Lead with LineChart or AreaChart.
- "comparison"     → Side-by-side. Use for "compare X vs Y", "which region/territory is best/worst". Use TwoColumn layout.
- "qa_answer"      → Direct question. Use for "why is X happening", "what caused Y", "explain Z". Lead with InsightCard + SummaryText, then supporting data.

═══════════════════════════════════════════════════
STEP 2 — CHOOSE COMPONENTS (2–6 total)
═══════════════════════════════════════════════════

METRIC COMPONENTS (embed real values from the data sample):
- KPICard   → Single metric with trend. Props: { title, value, trend?, delta?, deltaLabel?, explanation? }
             Use when: one key number is the answer (e.g. "what is our churn rate")
- KPIGrid   → 2–6 metrics side by side. Props: { metrics: [{title, value, trend?, delta?}], explanation? }
             Use when: multiple KPIs summarise the dataset well
- StatDelta → Current vs previous period. Props: { title, current, previous, currentLabel?, previousLabel?, trend, explanation? }
             Use when: the query is about change between two periods

CHART COMPONENTS (DO NOT include data — the pipeline attaches it):
- BarChart  → Categorical comparison. Props: { title, xKey, yKey, explanation? }
             Use when: comparing values across categories (territories, channels, products)
- LineChart → Time-series trend. Props: { title, xKey, yKey, explanation? }
             Use when: showing change over time with a date/time column
- AreaChart → Volume/cumulative trend. Props: { title, xKey, yKey, explanation? }
             Use when: showing volume, growth, or filled area trends over time
- PieChart  → Distribution / share. Props: { title, nameKey, valueKey, explanation? }
             Use when: showing proportional breakdown (market share, segment split). Max 8 slices.
- RankedList → Ordered top/bottom N. Props: { title, labelKey, valueKey, limit?, explanation? }
             Use when: user asks "top X", "best/worst", "ranked by"

DATA COMPONENTS (DO NOT include data — the pipeline attaches it):
- Table     → Full tabular data. Props: { title, columns: [exact column names from data], explanation? }
             Use when: user needs row-level detail or the dataset is small enough to show fully

NARRATIVE COMPONENTS (embed content directly — no data hydration):
- InsightCard  → Key finding callout. Props: { title, body, type?: "insight"|"warning"|"success", highlight? }
               Use when: there is a critical finding worth surfacing (anomaly, top performer, risk)
- AlertBanner  → Warning or info strip. Props: { message, type: "warning"|"info"|"success"|"error" }
               Use when: data shows a threshold breach, anomaly, or needs user attention
- SummaryText  → Narrative paragraph. Props: { text }
               Use when: a qa_answer template needs a prose explanation before the charts

LAYOUT COMPONENTS (wrap other components — children required):
- TwoColumn → Side-by-side layout. Props: {}. children: EXACTLY 2 component objects — never 1, never 3+.
             Use when: comparison template or showing two small related charts together.
             FORBIDDEN: wrapping a single BarChart, LineChart, AreaChart, RankedList, or Table alone in TwoColumn.
             These components are full-width — place them at the top level, not inside TwoColumn.
- Section   → Titled group of components. Props: { title, description? }. children: 1–4 component objects.
             Use when: deep_dive template with logical groupings (e.g. "Revenue Overview", "Regional Breakdown")

═══════════════════════════════════════════════════
RULES
═══════════════════════════════════════════════════
- ONLY use column names that appear exactly in the data sample. Never invent column names.
- For KPICard / KPIGrid / StatDelta: compute real values from the sample (average, sum, or first row as appropriate).
- trend strings must be like "+4.2%" or "-1.5%". Only include if you can infer from the data; otherwise omit.
- explanation: one sentence, max 20 words, describing what this component shows.
- For nested layout components (TwoColumn, Section), put the child cards in the "children" array of that component.
- followUp: 3–4 short, natural follow-up questions the user might ask next.
- Max 6 top-level cards. Use layout wrappers to group related components.
- BarChart, LineChart, AreaChart, PieChart, RankedList, Table are FULL-WIDTH components. Never nest them alone inside TwoColumn. Only use TwoColumn when you have exactly 2 components to place side by side.

═══════════════════════════════════════════════════
OUTPUT FORMAT — valid JSON only, no markdown, no code fences
═══════════════════════════════════════════════════
{
  "template": "summary|deep_dive|trend_analysis|comparison|qa_answer",
  "title": "Report title (5-8 words)",
  "message": "2-3 sentence narrative summary of the analysis",
  "cards": [
    {
      "renderType": "ComponentName",
      "props": { ...component props... },
      "children": []
    }
  ],
  "followUp": [
    { "label": "Short button label", "intent": "full question this follow-up asks" }
  ]
}`;

// ── Clarification gate ────────────────────────────────────────────────────────

interface ClarificationTurn { question: string; answer: string; }

function buildClarifySystem(catalog: DataCatalog): string {
  return `You are a friendly business intelligence assistant.
Your job is to gather enough context to generate a focused BI report, then generate it.

You have access to the following data — OPTIONS YOU SUGGEST MUST COME ONLY FROM THIS LIST:

${catalog.summaryText}

A query is READY TO GENERATE if, combining the original query and conversation history, you can identify a domain and at least one metric or report from the list above.
Do NOT ask about something the user already answered in the history.

If not ready: ask ONE question about the most important missing piece. Provide 3–4 option chips drawn EXCLUSIVELY from the available domains, report names, or KPIs listed above. Do not invent options that are not in the list.

RESPOND WITH JSON ONLY:
{
  "action": "generate",
  "opener": "",
  "currentQuestion": null
}
OR
{
  "action": "clarify",
  "opener": "One sentence acknowledging the last answer and leading into the next question.",
  "currentQuestion": {
    "question": "One short, specific question?",
    "options": ["Option A", "Option B", "Option C", "Option D"]
  }
}`;
}

function narrowCatalogByHistory(catalog: DataCatalog, history: ClarificationTurn[]): DataCatalog {
  if (history.length === 0) return catalog;

  // Collect all answers so far as lowercase tokens for matching
  const answers = history.map(t => t.answer.toLowerCase());

  // Find if any answer matches a known domain
  const matchedDomain = catalog.domains.find(domain =>
    answers.some(a => a.includes(domain.toLowerCase()) || domain.toLowerCase().includes(a))
  );

  if (!matchedDomain) return catalog;

  // Filter reports and datasets to only the matched domain
  const filteredReports = catalog.reports.filter(r =>
    r.domain.toLowerCase() === matchedDomain.toLowerCase()
  );
  const filteredDatasets = catalog.datasets.filter(d =>
    d.domain.toLowerCase() === matchedDomain.toLowerCase()
  );

  // If no matches found for that domain, return full catalog (fallback)
  if (filteredReports.length === 0 && filteredDatasets.length === 0) return catalog;

  const summaryText = [
    `SELECTED DOMAIN: ${matchedDomain}`,
    '',
    `AVAILABLE REPORTS IN ${matchedDomain.toUpperCase()} (options must come from this list):`,
    ...filteredReports.map(r => `- ${r.name} — KPIs: ${r.kpis.slice(0, 4).join(', ')}`),
    '',
    `AVAILABLE DATASETS IN ${matchedDomain.toUpperCase()}:`,
    ...filteredDatasets.map(d => `- ${d.name}`),
  ].join('\n');

  return {
    domains: [matchedDomain],
    reports: filteredReports,
    datasets: filteredDatasets,
    summaryText,
  };
}

export async function clarifyOrGenerate(
  query: string,
  history: ClarificationTurn[] = [],
): Promise<ClarifyResult> {
  const ai = getAI();
  try {
    const catalog = await getDataCatalog();
    const narrowedCatalog = narrowCatalogByHistory(catalog, history);
    const systemInstruction = buildClarifySystem(narrowedCatalog);

    const historyText = history.length > 0
      ? `\nConversation so far:\n${history.map(t => `Q: ${t.question}\nA: ${t.answer}`).join('\n')}`
      : '';

    const response = await ai.models.generateContent({
      model: MODEL,
      config: {
        temperature: 0,
        maxOutputTokens: 512,
        responseMimeType: 'application/json',
        systemInstruction,
      },
      contents: [{ role: 'user', parts: [{ text: `Original query: "${query}"${historyText}` }] }],
    });

    const raw = stripThinkTags(response.text ?? '');
    const parsed = JSON.parse(extractJSON(raw));

    return {
      action: parsed.action === 'clarify' ? 'clarify' : 'generate',
      opener: parsed.opener ?? '',
      currentQuestion: parsed.currentQuestion ?? null,
      questions: [],
    };
  } catch (err) {
    console.error('clarifyOrGenerate error:', err);
    // On error, default to generating — don't block the user
    return { action: 'generate', opener: '', currentQuestion: null, questions: [] };
  }
}

// ── Main export ──────────────────────────────────────────────────────────────

export async function generateReport(
  query: string,
  shape: ShapeSignature,
  sampleRows: any[],
  priorContext?: string,
): Promise<LLMReport> {
  const ai = getAI();

  const columnSummary = Object.entries(shape.columnTypes)
    .map(([col, type]) => `${col} (${type})`)
    .join(', ');

  const priorSection = priorContext
    ? `\nPRIOR REPORT CONTEXT (already shown to user — your response MUST be different, focused on the new query):\n${priorContext}\n`
    : '';

  const userMessage = `USER QUERY: "${query}"
${priorSection}
DATA SUMMARY:
- Total rows in BigQuery: ${shape.rowCount}
- Columns: ${columnSummary}
- Dimension columns: ${shape.dimensionColumns.join(', ') || 'none'}
- Measure columns: ${shape.measureColumns.join(', ') || 'none'}
- Time series: ${shape.isTimeSeries ? `yes (${shape.timeColumn})` : 'no'}

DATA SAMPLE (first ${sampleRows.length} rows):
${JSON.stringify(sampleRows, null, 2)}

Design the best report to answer the user's query using the real data above.`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      config: {
        temperature: 0.4,
        maxOutputTokens: 6000,
        responseMimeType: 'application/json',
        systemInstruction: REPORT_SYSTEM_PROMPT,
      },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    });

    const raw = response.text ?? '';
    const cleaned = stripThinkTags(raw);
    const jsonStr = extractJSON(cleaned);
    const parsed = JSON.parse(jsonStr);

    return {
      template: parsed.template ?? 'summary',
      message: parsed.message ?? 'Here is your analysis.',
      title: parsed.title ?? 'Data Report',
      description: parsed.description ?? '',
      cards: Array.isArray(parsed.cards) ? parsed.cards : [],
      followUp: Array.isArray(parsed.followUp) ? parsed.followUp : [],
    };
  } catch (err: any) {
    console.error('generateReport error:', err?.message ?? err);
    return {
      template: 'summary',
      message: 'I encountered an error generating the report.',
      title: 'Report',
      description: '',
      cards: [],
      followUp: [],
    };
  }
}

// ── Generic chat (used by /api/chat route) ────────────────────────────────────

const CHAT_JSON_SCHEMA = `
Respond with valid JSON only. No markdown, no code fences.
{
  "message": "string",
  "cards": [],
  "followUp": [{ "label": "string", "intent": "string" }]
}`;

export async function callLLM(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>
): Promise<LLMResponse> {
  const ai = getAI();

  const response = await ai.models.generateContent({
    model: MODEL,
    config: {
      temperature: 0.3,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
      systemInstruction: systemPrompt + '\n\n' + CHAT_JSON_SCHEMA,
    },
    contents: messages,
  });

  const raw = response.text ?? '';
  const cleaned = stripThinkTags(raw);
  const jsonStr = extractJSON(cleaned);

  try {
    const parsed = JSON.parse(jsonStr);
    return {
      message: parsed.message ?? '',
      cards: Array.isArray(parsed.cards) ? parsed.cards : [],
      followUp: Array.isArray(parsed.followUp) ? parsed.followUp : [],
    };
  } catch {
    return { message: cleaned, cards: [], followUp: [] };
  }
}
