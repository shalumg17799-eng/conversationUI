import { GoogleGenAI, Type, Tool } from '@google/genai';
import dotenv from 'dotenv';
import { ShapeSignature } from '../types';
import { runQueryWithMeta, qualifiedTable } from '../lib/bigqueryClient';
import { DATA_SOURCES, ALL_DOMAINS, ALL_TABLES, getSourcesByDomain } from './dataSourceMap';

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

function buildAnalyzePrompt(query: string, history: ClarificationTurn[]): { system: string; user: string } {
  const historyText = history.length > 0
    ? `\nCONVERSATION SO FAR:\n${history.map(t => `Q: ${t.question}\nA: ${t.answer}`).join('\n')}`
    : '';

  const catalogText = DATA_SOURCES.map(s =>
    `- domain="${s.domain}" report="${s.reportName}" table="${s.table}"`
  ).join('\n');

  const system = `You are a business intelligence assistant that decides if a user query has enough context to generate a report.

AVAILABLE DATA (only suggest options from this list):
${catalogText}

RULES:
1. If the query + history clearly specifies a domain AND a report name → action="route", set table to the exact table string from the list above.
2. If domain is unclear → action="clarify". Set question="Which domain would you like to report on?"
3. If domain is clear but report is unclear → action="clarify". Set question="Which report would you like to see?"
4. opener MUST acknowledge what the user asked. Reference their specific words.
5. Never invent table names. Only use tables from the list above.

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
    const { system, user } = buildAnalyzePrompt(query, history);

    const response = await ai.models.generateContent({
      model: MODEL,
      config: {
        temperature: 0.2,
        maxOutputTokens: 512,
        responseMimeType: 'application/json',
        systemInstruction: system,
      },
      contents: [{ role: 'user', parts: [{ text: user }] }],
    });

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

DATA SAMPLE (first ${sampleRows.length} rows — column names are EXACT):
${JSON.stringify(sampleRows, null, 2)}

Design the best dashboard to answer this query. Use EXACT_COLUMNS for all key fields. Respond with JSON only.`;

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
    return { template: 'summary', message: 'I encountered an error generating the report.', title: 'Report', description: '', cards: [], followUp: [] };
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
