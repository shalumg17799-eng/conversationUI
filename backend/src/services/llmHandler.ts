import { GoogleGenAI, Type, Tool } from '@google/genai';
import dotenv from 'dotenv';
import { ShapeSignature } from '../types';
import { runQueryWithMeta, qualifiedTable } from '../lib/bigqueryClient';
import { DATA_SOURCES, ALL_DOMAINS, ALL_TABLES, getSourcesByDomain } from './dataSourceMap';
import { loadCatalogContext } from './catalogRefresher';

dotenv.config();

// ── Data catalog cache ────────────────────────────────────────────────────────

interface DataCatalog {
  domains: string[];
  reports: { name: string; domain: string; kpis: string[] }[];
  datasets: { name: string; domain: string; fields: string[] }[];
  summaryText: string;
}

let catalogCache: { data: DataCatalog; fetchedAt: number } | null = null;
const CATALOG_TTL_MS = 10 * 60 * 1000;

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
      'AVAILABLE REPORTS:',
      ...reports.map(r => `- ${r.name} [${r.domain}] — KPIs: ${r.kpis.slice(0, 3).join(', ')}`),
      '',
      'AVAILABLE DATASETS:',
      ...datasets.map(d => `- ${d.name} [${d.domain}]`),
    ].join('\n');

    const catalog: DataCatalog = { domains, reports, datasets, summaryText };
    catalogCache = { data: catalog, fetchedAt: Date.now() };
    return catalog;
  } catch (err) {
    console.error('getDataCatalog error:', err);
    return {
      domains: ['Sales', 'Customer Experience', 'Network', 'Contact Center'],
      reports: [],
      datasets: [],
      summaryText: 'AVAILABLE DOMAINS: Sales, Customer Experience, Network, Contact Center',
    };
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

export type AnalyzeResult =
  | { action: 'clarify'; opener: string; question: string; options: string[] }
  | { action: 'route'; table: string; intent: 'trend' | 'comparison' | 'metric_by_dimension' };

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

// Retry wrapper for Gemma/Gemini API calls.
// Retries on 500 (Internal) and 429 (rate limit) with exponential backoff.
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const code: number = err?.error?.code ?? err?.status ?? 0;
      if (code !== 500 && code !== 429) throw err;
      if (attempt < maxAttempts) {
        const delayMs = Math.pow(2, attempt) * 600; // 1.2s, 2.4s
        console.warn(`[LLM] Attempt ${attempt} failed (${code}), retrying in ${delayMs}ms...`);
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr;
}

function getFunctionCall(response: any): { name: string; args: Record<string, any> } | null {
  try {
    const calls = response.functionCalls; // getter, not a method
    if (Array.isArray(calls) && calls.length > 0) return calls[0];
  } catch {}
  try {
    const part = response.candidates?.[0]?.content?.parts?.[0];
    if (part?.functionCall) return part.functionCall;
  } catch {}
  return null;
}

// ── Tool declarations ─────────────────────────────────────────────────────────

const ANALYZE_QUERY_TOOLS: Tool[] = [
  {
    functionDeclarations: [
      {
        name: 'request_clarification',
        description: 'Ask the user a clarifying question when the query lacks enough context to generate a useful report.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            opener: { type: Type.STRING, description: 'One sentence acknowledging the query and leading into the question.' },
            question: { type: Type.STRING, description: 'One short, specific question to ask.' },
            options: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '3–4 answer options for the question.',
            },
          },
          required: ['opener', 'question', 'options'],
        },
      },
      {
        name: 'route_to_data',
        description: 'Route the query to the correct BigQuery table when enough context is available to generate a report.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            table: {
              type: Type.STRING,
              enum: ALL_TABLES,
              description: 'The exact BigQuery table name to query. Pick the one whose description best matches the user intent.',
            },
            intent: {
              type: Type.STRING,
              enum: ['trend', 'comparison', 'metric_by_dimension'],
              description: 'Type of analysis requested.',
            },
          },
          required: ['table', 'intent'],
        },
      },
    ],
  },
];

const DESIGN_REPORT_TOOLS: Tool[] = [
  {
    functionDeclarations: [
      {
        name: 'design_report',
        description: 'Design the BI dashboard layout and components to answer the user query.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            template: {
              type: Type.STRING,
              enum: ['summary', 'deep_dive', 'trend_analysis', 'comparison', 'qa_answer'],
            },
            title: { type: Type.STRING, description: 'Report title, 5–8 words.' },
            message: { type: Type.STRING, description: '2–3 sentence narrative summary of the analysis.' },
            cards: {
              type: Type.ARRAY,
              description: 'Dashboard components to render. Each card has renderType, props, and optional children.',
              items: {
                type: Type.OBJECT,
                properties: {
                  renderType: { type: Type.STRING },
                  props: { type: Type.OBJECT },
                  children: { type: Type.ARRAY, items: { type: Type.OBJECT } },
                },
                required: ['renderType', 'props'],
              },
            },
            followUp: {
              type: Type.ARRAY,
              description: '3–4 follow-up questions the user might ask.',
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING },
                  intent: { type: Type.STRING },
                },
                required: ['label', 'intent'],
              },
            },
          },
          required: ['template', 'title', 'message', 'cards', 'followUp'],
        },
      },
    ],
  },
];

// ── analyzeQuery — replaces clarifyOrGenerate + classifyIntent ────────────────

interface ClarificationTurn { question: string; answer: string; }

function buildAnalyzeSystem(history: ClarificationTurn[]): string {
  const answers = history.map(t => t.answer.toLowerCase());
  const matchedDomain = ALL_DOMAINS.find(d =>
    answers.some(a => a.includes(d.toLowerCase()) || d.toLowerCase().includes(a))
  );

  // Build catalog text from DATA_SOURCES only — guaranteed to have real BQ data
  let catalogText: string;
  if (matchedDomain) {
    const sources = getSourcesByDomain(matchedDomain);
    catalogText = [
      `SELECTED DOMAIN: ${matchedDomain}`,
      '',
      `AVAILABLE REPORTS (all backed by real data):`,
      ...sources.map(s => `- "${s.reportName}" → table: ${s.table} — KPIs: ${s.kpis.slice(0, 4).join(', ')}`),
    ].join('\n');
  } else {
    catalogText = [
      `AVAILABLE DOMAINS: ${ALL_DOMAINS.join(', ')}`,
      '',
      'ALL AVAILABLE REPORTS (all backed by real data):',
      ...DATA_SOURCES.map(s => `- [${s.domain}] "${s.reportName}" → table: ${s.table}`),
    ].join('\n');
  }

  const historyText = history.length > 0
    ? `\nCONVERSATION HISTORY:\n${history.map(t => `Q: ${t.question}\nA: ${t.answer}`).join('\n')}`
    : '';

  return `You are a business intelligence assistant. Decide whether to ask a clarifying question or route directly to data.

IMPORTANT: Only offer options from the list below. Every report listed here is backed by real BigQuery data. Never suggest reports or options not in this list.

${catalogText}
${historyText}

CLARIFICATION RULES:
1. If domain is unknown → call request_clarification. options MUST be exactly: ${JSON.stringify(ALL_DOMAINS)}
2. If domain known but report unknown → call request_clarification. options MUST be the "reportName" values for that domain only (from the list above).
3. Route directly (call route_to_data) if: domain + report are both known from the query or history.

Never re-ask something already answered. Never invent report names not in the list above.`;
}

function sanitizeOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw
    .filter((o): o is string => typeof o === 'string')
    .map(o => o.trim())
    .filter(o => o.length > 0 && !o.includes(']') && !o.includes('{') && !o.includes(':'))
    .filter(o => { if (seen.has(o)) return false; seen.add(o); return true; });
}

// ── Context extraction ────────────────────────────────────────────────────────

// Scan query text AND history answers for a matching domain + report.
// This is the fast path: if the user spelled out enough in their original message,
// skip clarification entirely without making any LLM call.
function extractContextFromText(texts: string[]): { domain?: string; source?: ReturnType<typeof getSourcesByDomain>[0] } {
  const joined = texts.join(' ');
  const q = joined.toLowerCase();

  const domain = ALL_DOMAINS.find(d => q.includes(d.toLowerCase()));
  if (!domain) return {};

  const sources = getSourcesByDomain(domain);
  const source = sources.find(s => q.includes(s.reportName.toLowerCase()));
  return { domain, source };
}

// Deterministic fallback used when LLM call fails.
// Builds the correct next question from whatever context is already known.
function deterministicFallback(query: string, history: ClarificationTurn[]): AnalyzeResult {
  const allTexts = [query, ...history.map(t => t.answer)];
  const { domain, source } = extractContextFromText(allTexts);

  if (source) {
    return { action: 'route', table: source.table, intent: 'metric_by_dimension' };
  }

  if (domain) {
    const sources = getSourcesByDomain(domain);
    return {
      action: 'clarify',
      opener: `I can help with ${domain} reports.`,
      question: 'Which report would you like to see?',
      options: sources.map(s => s.reportName),
    };
  }

  return {
    action: 'clarify',
    opener: 'I can help you create a report.',
    question: 'Which domain would you like to report on?',
    options: ALL_DOMAINS,
  };
}

// ── LLM-driven query analysis ─────────────────────────────────────────────────
//
// The LLM reads the user query + history, then decides:
//   • route   → enough context; pick the exact table from DATA_SOURCES
//   • clarify → ask one specific question (we supply the options deterministically)
//
// Using JSON mode (responseMimeType) — reliable with Gemma, unlike function calling mode:ANY.

async function buildAnalyzePrompt(query: string, history: ClarificationTurn[]): Promise<{ system: string; user: string }> {
  const historyText = history.length > 0
    ? `\nCONVERSATION SO FAR:\n${history.map(t => `Q: ${t.question}\nA: ${t.answer}`).join('\n')}`
    : '';

  const catalogText = DATA_SOURCES.map(s =>
    `- domain="${s.domain}" report="${s.reportName}" table="${s.table}"`
  ).join('\n');

  // Inject pre-built catalog context (real BQ column names, descriptions, KPIs).
  // This gives the LLM field-level knowledge so clarification questions are
  // grounded in what the data actually contains rather than high-level guesses.
  const catalogContext = await loadCatalogContext();
  const catalogContextSection = catalogContext
    ? `\n\nDATASET FIELD REFERENCE (pre-built from BigQuery — use for smarter clarification):\n${catalogContext}`
    : '';

  const system = `You are a business intelligence assistant that decides if a user query has enough context to generate a report.

AVAILABLE DATA (only suggest options from this list):
${catalogText}
${catalogContextSection}

RULES:
1. If the query + history clearly specifies a domain AND a report name → action="route", set table to the exact table string from the list above.
2. If domain is unclear → action="clarify". Set question="Which domain would you like to report on?"
3. If domain is clear but report is unclear → action="clarify". Set question="Which report would you like to see?"
4. opener MUST acknowledge what the user asked. Reference their specific words.
5. Never invent table names. Only use tables from the list above.
6. Use the DATASET FIELD REFERENCE to ask specific, field-aware clarification questions when relevant (e.g. "Do you want to filter by territory_name or market?").

Respond with valid JSON only. No markdown. No code fences.
{
  "action": "route" | "clarify",
  "opener": "...",
  "question": "...",
  "table": "...",
  "intent": "trend" | "comparison" | "metric_by_dimension"
}
(omit "question" if action=route; omit "table"/"intent" if action=clarify)`;

  const user = `USER QUERY: "${query}"${historyText}

Analyze this. Respond with JSON.`;

  return { system, user };
}

export async function analyzeQuery(
  query: string,
  history: ClarificationTurn[] = [],
): Promise<AnalyzeResult> {
  const ai = getAI();
  const allTexts = [query, ...history.map(t => t.answer)];

  // Fast path: query already contains full context → route directly, no LLM needed
  const { source: directSource } = extractContextFromText(allTexts);
  if (directSource) {
    console.log(`[analyzeQuery] Fast-path route → table: ${directSource.table}`);
    return { action: 'route', table: directSource.table, intent: 'metric_by_dimension' };
  }

  // LLM path: ask Gemma to interpret the query and decide what's missing
  try {
    const { system, user } = await buildAnalyzePrompt(query, history);

    const response = await withRetry(() => ai.models.generateContent({
      model: MODEL,
      config: {
        temperature: 0.2,
        maxOutputTokens: 512,
        responseMimeType: 'application/json',
        systemInstruction: system,
      },
      contents: [{ role: 'user', parts: [{ text: user }] }],
    }));

    const raw = response.text ?? '';
    const cleaned = stripThinkTags(raw);
    const jsonStr = extractJSON(cleaned);
    const parsed = JSON.parse(jsonStr);

    if (parsed.action === 'route' && parsed.table) {
      // Validate: table must exist in DATA_SOURCES
      const validSource = DATA_SOURCES.find(s => s.table === parsed.table);
      if (validSource) {
        console.log(`[analyzeQuery] LLM route → table: ${parsed.table}`);
        return {
          action: 'route',
          table: parsed.table,
          intent: parsed.intent ?? 'metric_by_dimension',
        };
      }
      console.warn(`[analyzeQuery] LLM returned unknown table "${parsed.table}" — falling back`);
    }

    if (parsed.action === 'clarify') {
      // LLM determines what to ask; we supply the options from DATA_SOURCES (not LLM)
      const allTextsForDomain = [query, ...history.map(t => t.answer)];
      const { domain } = extractContextFromText(allTextsForDomain);
      const options = domain
        ? getSourcesByDomain(domain).map(s => s.reportName)
        : ALL_DOMAINS;

      return {
        action: 'clarify',
        opener: parsed.opener ?? 'I can help you create a report.',
        question: parsed.question ?? (domain ? 'Which report would you like to see?' : 'Which domain would you like to report on?'),
        options,
      };
    }
  } catch (err) {
    console.error('[analyzeQuery] LLM call failed:', err);
  }

  // Last resort: deterministic fallback
  console.log('[analyzeQuery] Using deterministic fallback');
  return deterministicFallback(query, history);
}

// ── classifyFollowUpIntent — LLM decides: edit existing report vs new request ──

export type FollowUpIntentResult =
  | { action: 'new_report' }
  | { action: 'edit_report'; editType: 'structural' | 'data_change' }
  | { action: 'clarify_intent' };

export async function classifyFollowUpIntent(
  query: string,
  priorContext: string,
): Promise<FollowUpIntentResult> {
  const ai = getAI();

  const system = `You are a BI assistant that classifies user intent. The user has an existing report open.

EXISTING REPORT: ${priorContext}

Classify the user's message into exactly one of:
- "new_report"              — Asking for a completely different topic, domain, or dataset unrelated to the current report.
- "edit_report_structural"  — Wants to change the CURRENT report's layout/visuals only. No new data needed. Examples: hide a section, change bar chart to line chart, remove a KPI, reorder cards, rename a title.
- "edit_report_data"        — Wants to change the CURRENT report but needs fresh/filtered data. Examples: show top 5 territories, filter by a specific value, group by a different dimension, show trend over time.
- "clarify_intent"          — Genuinely ambiguous. Cannot determine if they want to edit or start fresh.

Respond with valid JSON only. No markdown.
{ "action": "new_report" | "edit_report_structural" | "edit_report_data" | "clarify_intent", "reasoning": "one sentence" }`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      config: {
        temperature: 0.1,
        maxOutputTokens: 128,
        responseMimeType: 'application/json',
        systemInstruction: system,
      },
      contents: [{ role: 'user', parts: [{ text: `USER MESSAGE: "${query}"` }] }],
    });

    const raw = response.text ?? '';
    const parsed = JSON.parse(extractJSON(stripThinkTags(raw)));
    console.log(`[classifyFollowUpIntent] action=${parsed.action} — ${parsed.reasoning}`);

    if (parsed.action === 'edit_report_structural') return { action: 'edit_report', editType: 'structural' };
    if (parsed.action === 'edit_report_data') return { action: 'edit_report', editType: 'data_change' };
    if (parsed.action === 'clarify_intent') return { action: 'clarify_intent' };
    return { action: 'new_report' };
  } catch (err) {
    console.error('[classifyFollowUpIntent] LLM call failed:', err);
    // Fallback: if we have cards, assume structural edit; safer than dropping to new_report
    return { action: 'edit_report', editType: 'structural' };
  }
}

// ── classifyAndEditReport — single fused LLM call ────────────────────────────
// Replaces the previous two-call flow (classifyFollowUpIntent → editReport).
// One call classifies intent AND applies structural edits in one shot.

export type FusedIntentResult =
  | { action: 'new_report' }
  | { action: 'edit_data_change' }
  | { action: 'clarify_intent' }
  | {
      action: 'edit_structural';
      acknowledgment: string;
      title: string;
      message: string;
      cards: ReportCard[];
      followUp: Array<{ label: string; intent: string }>;
    };

export async function classifyAndEditReport(
  query: string,
  currentCards: ReportCard[],
  priorContext: string,
): Promise<FusedIntentResult> {
  const ai = getAI();
  const strippedCards = stripCardData(currentCards);

  const system = `You are a BI dashboard assistant. The user has an existing report open.

EXISTING REPORT: ${priorContext}

CURRENT REPORT CARDS (structure only — data arrays omitted):
${JSON.stringify(strippedCards, null, 2)}

Read the user's message and respond with JSON only. Choose exactly one action:

── STRUCTURAL EDIT (hide/remove a section, change chart type, rename title, reorder cards — NO new database query needed):
{
  "action": "edit_structural",
  "acknowledgment": "One sentence confirming what you changed.",
  "title": "Report title (keep existing unless user asked to rename)",
  "message": "2–3 sentence updated narrative.",
  "cards": [ ...full modified card tree... ],
  "followUp": [ { "label": "...", "intent": "..." } ]
}

── DATA CHANGE EDIT (needs fresh filtered data — top N, different grouping, time filter, drill-down):
{ "action": "edit_data_change" }

── NEW REPORT (completely different topic, domain, or dataset):
{ "action": "new_report" }

── AMBIGUOUS (cannot tell if edit or new):
{ "action": "clarify_intent" }

STRUCTURAL EDIT RULES:
- "hide"/"remove" → delete that card from the cards array entirely.
- "change X to line chart" / "show X as Y" → swap renderType, keep all prop keys identical.
- "add a KPI" → append KPICard using only column names already present in the card tree.
- Never invent column names. Only use keys already in the current card tree.
- Return ALL surviving cards, not just the changed one.
- followUp: 3–4 natural follow-up questions.`;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: MODEL,
      config: {
        temperature: 0.2,
        maxOutputTokens: 4000,
        responseMimeType: 'application/json',
        systemInstruction: system,
      },
      contents: [{ role: 'user', parts: [{ text: `USER MESSAGE: "${query}"` }] }],
    });

    const raw = response.text ?? '';
    const parsed = JSON.parse(extractJSON(stripThinkTags(raw)));
    console.log(`[classifyAndEditReport] action=${parsed.action}`);

    if (parsed.action === 'edit_structural') {
      return {
        action: 'edit_structural',
        acknowledgment: typeof parsed.acknowledgment === 'string'
          ? parsed.acknowledgment
          : 'Done — report updated.',
        title: parsed.title ?? '',
        message: parsed.message ?? '',
        cards: Array.isArray(parsed.cards) ? parsed.cards : currentCards,
        followUp: Array.isArray(parsed.followUp) ? parsed.followUp : [],
      };
    }
    if (parsed.action === 'edit_data_change') return { action: 'edit_data_change' };
    if (parsed.action === 'clarify_intent') return { action: 'clarify_intent' };
    return { action: 'new_report' };
  });
}

export async function clarifyOrGenerate(
  query: string,
  history: ClarificationTurn[] = [],
): Promise<ClarifyResult> {
  const result = await analyzeQuery(query, history);
  if (result.action === 'clarify') {
    return {
      action: 'clarify',
      opener: result.opener,
      currentQuestion: { question: result.question, options: result.options },
      questions: [],
    };
  }
  return { action: 'generate', opener: '', currentQuestion: null, questions: [] };
}

// ── Report system prompt (used as context for design_report tool) ─────────────

const REPORT_SYSTEM_PROMPT = `You are an expert business intelligence analyst and UI architect.
You receive a user query and real BigQuery data.
Respond with valid JSON only — no markdown, no code fences, no explanation.

OUTPUT FORMAT:
{
  "template": "summary|deep_dive|trend_analysis|comparison|qa_answer",
  "title": "Report title (5-8 words)",
  "message": "2-3 sentence narrative summary",
  "cards": [ { "renderType": "ComponentName", "props": { ...props... }, "children": [] } ],
  "followUp": [ { "label": "Short label", "intent": "full question" } ]
}

COLUMN NAME RULE — MOST IMPORTANT:
The EXACT_COLUMNS list in the user message contains the exact column names as they exist in the database.
You MUST copy these names character-for-character into xKey, yKey, nameKey, valueKey, labelKey, and columns[].
NEVER lowercase, rename, or invent column names. If unsure, check EXACT_COLUMNS.

TEMPLATES:
- "summary"        → High-level overview. Lead with KPIGrid + 1-2 charts.
- "deep_dive"      → Full analysis. Use metrics + charts + table + insights.
- "trend_analysis" → Time-based. Lead with LineChart or AreaChart.
- "comparison"     → Side-by-side. Use TwoColumn layout.
- "qa_answer"      → Direct question. Lead with InsightCard + SummaryText.

COMPONENTS:
Metric (embed real values from sample): KPICard, KPIGrid, StatDelta
Charts (pipeline attaches data — you only set keys): BarChart, LineChart, AreaChart, PieChart, RankedList
Data: Table — set columns[] to EXACT column names you want shown
Narrative (embed content): InsightCard, AlertBanner, SummaryText
Layout: TwoColumn (exactly 2 children), Section (1–4 children)

RULES:
- xKey/yKey/nameKey/valueKey/labelKey: MUST be from EXACT_COLUMNS list.
- KPICard/KPIGrid/StatDelta: compute real numeric values from data sample.
- trend: "+4.2%" or "-1.5%". Only include if clearly calculable from data.
- TwoColumn: exactly 2 children only.
- BarChart, LineChart, AreaChart, PieChart, RankedList, Table are FULL-WIDTH — never nest alone in TwoColumn.
- followUp: 3–4 natural follow-up questions the user might ask.
- Max 6 top-level cards. Must produce at least 2 cards.`;

// ── generateReport ────────────────────────────────────────────────────────────

// Compact sample rows for the LLM prompt.
// Keeps only measure + dimension columns (drops ID cols already excluded by dataShapeAnalyzer),
// caps at MAX_SAMPLE_ROWS rows, and serializes as compact JSON (no indentation).
// This keeps the prompt well under Gemma's context window on wide tables.
const MAX_SAMPLE_ROWS = 8;
const MAX_SAMPLE_COLS = 10;

function buildCompactSample(rows: any[], shape: ShapeSignature): string {
  const keepCols = [
    ...(shape.timeColumn ? [shape.timeColumn] : []),
    ...shape.dimensionColumns,
    ...shape.measureColumns,
  ].slice(0, MAX_SAMPLE_COLS);

  const sliced = rows.slice(0, MAX_SAMPLE_ROWS).map(row =>
    Object.fromEntries(keepCols.filter(c => c in row).map(c => [c, row[c]]))
  );
  return JSON.stringify(sliced);
}

export async function generateReport(
  query: string,
  shape: ShapeSignature,
  sampleRows: any[],
  priorContext?: string,
): Promise<LLMReport> {
  const ai = getAI();

  const allColumns = Object.keys(shape.columnTypes);
  const priorSection = priorContext
    ? `\nPRIOR REPORT CONTEXT:\n${priorContext}\n`
    : '';

  const compactSample = buildCompactSample(sampleRows, shape);

  const userMessage = `USER QUERY: "${query}"
${priorSection}
EXACT_COLUMNS (copy these character-for-character into all key fields):
  Dimension columns: ${shape.dimensionColumns.join(', ') || 'none'}
  Measure columns:   ${shape.measureColumns.join(', ') || 'none'}
  ${shape.isTimeSeries ? `Time column:       ${shape.timeColumn}` : 'Not a time series'}
  All columns:       ${allColumns.join(', ')}

DATA SUMMARY:
- Total rows in BigQuery: ${shape.rowCount}
- Time series: ${shape.isTimeSeries ? `yes (${shape.timeColumn})` : 'no'}

DATA SAMPLE (${Math.min(sampleRows.length, MAX_SAMPLE_ROWS)} rows, key columns only — column names are EXACT):
${compactSample}

Design the best dashboard to answer this query. Use EXACT_COLUMNS for all key fields. Respond with JSON only.`;

  try {
    const response = await withRetry(() => ai.models.generateContent({
      model: MODEL,
      config: {
        temperature: 0.4,
        maxOutputTokens: 4000,
        responseMimeType: 'application/json',
        systemInstruction: REPORT_SYSTEM_PROMPT,
      },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    }));

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
    return { template: 'summary', message: 'I encountered an error generating the report.', title: 'Report', description: '', cards: [], followUp: [] };
  }
}

// ── editReport — surgical card-tree mutation for follow-up edit requests ──────

export interface EditReportResult {
  acknowledgment: string;
  title: string;
  message: string;
  cards: ReportCard[];
  followUp: Array<{ label: string; intent: string }>;
}

const EDIT_REPORT_SYSTEM_PROMPT = `You are an expert BI dashboard editor.
You receive the CURRENT report as a JSON card tree and a USER EDIT REQUEST.
Apply only the requested change. Keep all other cards exactly as-is.
Respond with valid JSON only. No markdown, no code fences.

OUTPUT FORMAT:
{
  "acknowledgment": "One sentence confirming what you changed, e.g. 'Done — I removed the Revenue by Territory chart.'",
  "title": "Report title (keep existing unless user asked to rename)",
  "message": "2-3 sentence updated narrative summary",
  "cards": [ { "renderType": "...", "props": { ... }, "children": [] } ],
  "followUp": [ { "label": "Short label", "intent": "full question" } ]
}

EDIT RULES:
- "hide" / "remove" a section → delete that card from the array entirely.
- "change chart type" → swap renderType, keep all props/keys identical.
- "add" a KPI or chart → append new card using only column names already present in existing cards.
- "show only" → keep only the specified cards, remove the rest.
- Never invent new column names. Only use keys already present in the current card tree.
- followUp: 3–4 natural follow-up questions.`;

export { buildHydrationMap, rehydrateEditedCards };

// Strip heavy data arrays from cards before sending to LLM.
// The LLM only needs the structure (renderType, props keys, children) — not 50 rows of data.
function stripCardData(cards: ReportCard[]): ReportCard[] {
  const strip = (card: ReportCard): ReportCard => {
    const { data: _d, rows: _r, items: _i, ...restProps } = card.props as any;
    return {
      renderType: card.renderType,
      props: restProps,
      children: card.children?.map(strip),
    };
  };
  return cards.map(strip);
}

// Build a lookup map from original hydrated cards so we can re-attach data after LLM edits.
// Key = renderType + primary label (title, xKey, labelKey, etc.)
function buildHydrationMap(cards: ReportCard[]): Map<string, any> {
  const map = new Map<string, any>();
  const index = (card: ReportCard) => {
    const p = card.props as any;
    const label = p.title ?? p.xKey ?? p.labelKey ?? p.nameKey ?? '';
    const key = `${card.renderType}::${String(label).toLowerCase()}`;
    map.set(key, { data: p.data, rows: p.rows, items: p.items });
    card.children?.forEach(index);
  };
  cards.forEach(index);
  return map;
}

// Re-attach hydrated data to LLM-edited cards using the map built above.
function rehydrateEditedCards(editedCards: ReportCard[], hydrationMap: Map<string, any>): ReportCard[] {
  const rehydrate = (card: ReportCard): ReportCard => {
    const p = card.props as any;
    const label = p.title ?? p.xKey ?? p.labelKey ?? p.nameKey ?? '';
    const key = `${card.renderType}::${String(label).toLowerCase()}`;
    const hydrated = hydrationMap.get(key);
    return {
      renderType: card.renderType,
      props: hydrated ? { ...p, ...hydrated } : p,
      children: card.children?.map(rehydrate),
    };
  };
  return editedCards.map(rehydrate);
}

export async function editReport(
  editRequest: string,
  currentCards: ReportCard[],
  priorContext?: string,
): Promise<EditReportResult> {
  const ai = getAI();

  // Strip data arrays — LLM only needs structure, not 50-row datasets
  const strippedCards = stripCardData(currentCards);

  const priorSection = priorContext ? `\nREPORT CONTEXT:\n${priorContext}\n` : '';
  const userMessage = `${priorSection}
CURRENT REPORT CARDS (structure only — data arrays omitted to save tokens):
${JSON.stringify(strippedCards, null, 2)}

USER EDIT REQUEST: "${editRequest}"

Apply the edit and return the full modified card tree as JSON.`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      config: {
        temperature: 0.2,
        maxOutputTokens: 4000,
        responseMimeType: 'application/json',
        systemInstruction: EDIT_REPORT_SYSTEM_PROMPT,
      },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    });

    const raw = response.text ?? '';
    const cleaned = stripThinkTags(raw);
    const jsonStr = extractJSON(cleaned);
    const parsed = JSON.parse(jsonStr);

    return {
      acknowledgment: typeof parsed.acknowledgment === 'string' ? parsed.acknowledgment : 'Done — report updated.',
      title: parsed.title ?? priorContext ?? 'Updated Report',
      message: parsed.message ?? '',
      cards: Array.isArray(parsed.cards) ? parsed.cards : currentCards,
      followUp: Array.isArray(parsed.followUp) ? parsed.followUp : [],
    };
  } catch (err: any) {
    console.error('editReport error:', err?.message ?? err);
    // Safe fallback: return the existing cards unchanged with a generic ack
    return {
      acknowledgment: 'I had trouble applying that edit. The report is unchanged.',
      title: '',
      message: '',
      cards: currentCards,
      followUp: [],
    };
  }
}

/**
 * Phase 1: Generates a narrative-only response (summary, analysis, explanation)
 * using the existing report context without modifying visualizations or querying BQ.
 */
export async function generateNarrativeResponse(
  query: string,
  currentCards: ReportCard[],
  priorContext: string,
): Promise<{ message: string; followUp: { label: string; intent: string }[] }> {
  const ai = getAI();
  
  // Strip data arrays to save tokens, but keep keys and props for context
  const strippedCards = stripCardData(currentCards);

  const system = `You are a business intelligence assistant. The user is asking a question about an existing report.
  
EXISTING REPORT CONTEXT:
${priorContext}

CURRENT REPORT STRUCTURE (data omitted):
${JSON.stringify(strippedCards, null, 2)}

Your task:
1. Provide a concise, professional narrative response based ONLY on the context provided.
2. If the user asks for a summary, provide a high-level executive summary.
3. If they ask for bullet points, use bullet points.
4. If they ask "why" or for insights, provide data-driven explanations based on the report structure and context.
5. Do NOT suggest new charts or changes to the report.
6. Do NOT mention technical details like BigQuery or SQL.

Respond with valid JSON only. No markdown. No code fences.
{
  "message": "your narrative response here",
  "followUp": [ { "label": "Short label", "intent": "full question" } ]
}`;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: MODEL,
      config: {
        temperature: 0.3,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
        systemInstruction: system,
      },
      contents: [{ role: 'user', parts: [{ text: `USER QUESTION: "${query}"` }] }],
    });

    const raw = response.text ?? '';
    const cleaned = stripThinkTags(raw);
    const jsonStr = extractJSON(cleaned);
    const parsed = JSON.parse(jsonStr);

    return {
      message: parsed.message ?? '',
      followUp: Array.isArray(parsed.followUp) ? parsed.followUp : [],
    };
  });
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
