import { GoogleGenAI, Type, Tool } from '@google/genai';
import dotenv from 'dotenv';
import { ShapeSignature } from '../types';
import { runQueryWithMeta, qualifiedTable } from '../lib/bigqueryClient';
import { DATA_SOURCES, ALL_DOMAINS, ALL_TABLES, getSourcesByDomain } from './dataSourceMap';
import { loadCatalogContext } from './catalogRefresher';

dotenv.config();

// ── Table availability cache ──────────────────────────────────────────────────
// Probed once at startup; filters out DATA_SOURCES whose BQ tables return no rows.
// This ensures clarification options only include reports we can actually render.

let availableTablesCache: Set<string> | null = null;

export async function probeTableAvailability(): Promise<void> {
  const uniqueTables = [...new Set(DATA_SOURCES.map(s => s.table))];
  const results = await Promise.allSettled(
    uniqueTables.map(async (table) => {
      const rows = await runQueryWithMeta(`SELECT 1 FROM ${qualifiedTable(table)} LIMIT 1`);
      return { table, available: rows.rows.length > 0 };
    })
  );
  availableTablesCache = new Set(
    results
      .filter((r): r is PromiseFulfilledResult<{ table: string; available: boolean }> =>
        r.status === 'fulfilled' && r.value.available)
      .map(r => r.value.table)
  );
  console.log(`[TableProbe] Available tables: ${[...availableTablesCache].join(', ')}`);
}

export function getAvailableDataSources(): typeof DATA_SOURCES {
  if (!availableTablesCache) return DATA_SOURCES; // fallback: assume all available before probe completes
  return DATA_SOURCES.filter(s => availableTablesCache!.has(s.table));
}

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
// Always uses available sources only — never suggests reports with no data.
function deterministicFallback(query: string, history: ClarificationTurn[]): AnalyzeResult {
  const allTexts = [query, ...history.map(t => t.answer)];
  const { domain, source } = extractContextFromText(allTexts);
  const availableSources = getAvailableDataSources();

  if (source && availableSources.some(s => s.table === source.table)) {
    return { action: 'route', table: source.table, intent: 'metric_by_dimension' };
  }

  if (domain) {
    const sources = availableSources.filter(s => s.domain.toLowerCase() === domain.toLowerCase());
    return {
      action: 'clarify',
      opener: `I can help with ${domain} reports.`,
      question: 'Which report would you like to see?',
      options: sources.map(s => s.reportName),
    };
  }

  const availableDomains = [...new Set(availableSources.map(s => s.domain))];
  return {
    action: 'clarify',
    opener: "Happy to help you create a report! We have data across several business domains.",
    question: 'Which domain would you like to report on?',
    options: availableDomains,
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

  // Only include sources backed by tables that actually have data
  const availableSources = getAvailableDataSources();
  const catalogText = availableSources.map(s =>
    `- domain="${s.domain}" report="${s.reportName}" table="${s.table}"`
  ).join('\n');

  // Inject pre-built catalog context (real BQ column names, descriptions, KPIs).
  const catalogContext = await loadCatalogContext();
  const catalogContextSection = catalogContext
    ? `\n\nDATASET FIELD REFERENCE (pre-built from BigQuery — use for smarter clarification):\n${catalogContext}`
    : '';

  const isFollowUp = history.length > 0;

  const system = `You are a friendly, conversational business intelligence assistant. Your job is to understand what the user needs and guide them to the right report.

AVAILABLE DATA (only suggest options from this list — these are the only reports with real data):
${catalogText}
${catalogContextSection}

RULES:
1. If the query + history clearly specifies a domain AND a report name → action="route", set table to the exact table string from the list above.
2. If domain is unclear → action="clarify". ${isFollowUp ? 'This is a follow-up turn — do NOT repeat greetings or say "I\'m doing great". Just acknowledge the user\'s answer and move forward naturally.' : 'Write a natural, conversational opener that responds to exactly what the user said (greet back if they greeted, acknowledge their goal).'} Set options to the domain names from the AVAILABLE DATA list above.
3. If domain is clear but report is unclear → action="clarify". Acknowledge the chosen domain briefly. Set options to ONLY the report names for that domain from AVAILABLE DATA above.
4. ${isFollowUp ? 'opener must be brief and move the conversation forward. No greetings, no "I\'m doing great". Example: "Great, since you\'re interested in Sales..."' : 'opener MUST be conversational and natural. If the user says "hey how are you", respond to that first, THEN transition to the business question.'}
5. Never invent table names, domain names, or report names. Only use values from the AVAILABLE DATA list above.
6. options array MUST come ONLY from the AVAILABLE DATA catalog above — domain names when domain unknown, report names when domain is known. Never include options that are not in AVAILABLE DATA.
7. Use the DATASET FIELD REFERENCE to ask specific, field-aware clarification questions when relevant.

Respond with valid JSON only. No markdown. No code fences.
{
  "action": "route" | "clarify",
  "opener": "...",
  "question": "...",
  "options": ["...", "..."],
  "table": "...",
  "intent": "trend" | "comparison" | "metric_by_dimension"
}
(omit "question"/"options" if action=route; omit "table"/"intent" if action=clarify)`;

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
        maxOutputTokens: 768,
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
      // Validate: table must exist in available sources (has real data)
      const availableSources = getAvailableDataSources();
      const validSource = availableSources.find(s => s.table === parsed.table);
      if (validSource) {
        console.log(`[analyzeQuery] LLM route → table: ${parsed.table}`);
        return {
          action: 'route',
          table: parsed.table,
          intent: parsed.intent ?? 'metric_by_dimension',
        };
      }
      console.warn(`[analyzeQuery] LLM returned unavailable table "${parsed.table}" — falling back`);
    }

    if (parsed.action === 'clarify') {
      // Use LLM-provided options if valid; validate against available sources only
      const allTextsForDomain = [query, ...history.map(t => t.answer)];
      const { domain } = extractContextFromText(allTextsForDomain);
      const availableSources = getAvailableDataSources();
      const availableDomains = [...new Set(availableSources.map(s => s.domain))];
      const availableReportNames = new Set(availableSources.map(s => s.reportName));

      let options: string[];
      if (Array.isArray(parsed.options) && parsed.options.length > 0) {
        const validOptions = parsed.options.filter((o: string) =>
          availableDomains.includes(o) || availableReportNames.has(o)
        );
        if (validOptions.length > 0) {
          options = validOptions;
        } else {
          options = domain
            ? availableSources.filter(s => s.domain.toLowerCase() === domain.toLowerCase()).map(s => s.reportName)
            : availableDomains;
        }
      } else {
        options = domain
          ? availableSources.filter(s => s.domain.toLowerCase() === domain.toLowerCase()).map(s => s.reportName)
          : availableDomains;
      }

      return {
        action: 'clarify',
        opener: parsed.opener ?? (domain ? `I can help with ${domain} reports.` : 'Happy to help you create a report!'),
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
  | { action: 'edit_data_change'; sqlOverride?: string }
  | { action: 'clarify_intent' }
  | { action: 'qa_answer'; message: string; followUp: Array<{ label: string; intent: string }> }
  | {
      action: 'edit_structural';
      acknowledgment: string;
      title: string;
      message: string;
      cards: ReportCard[];
      followUp: Array<{ label: string; intent: string }>;
    };

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export async function classifyAndEditReport(
  query: string,
  currentCards: ReportCard[],
  priorContext: string,
  dataContext = '',
  conversationHistory: ConversationTurn[] = [],
): Promise<FusedIntentResult> {
  const ai = getAI();
  const strippedCards = stripCardData(currentCards);

  // Detect requested output format so the LLM can honor it
  const wantsBullets = /\b(point|pointer|bullet|list|itemize|enumerate)\b/i.test(query);
  const formatHint = wantsBullets
    ? 'User wants bullet-point format — use markdown bullets (- item) in the message field.'
    : 'Use flowing prose paragraphs unless the user explicitly asks for bullets.';

  // Recent conversation context: last 3 turns, most recent last (recency weighting).
  // Only include if there are prior turns — avoids empty section noise.
  const recentHistory = conversationHistory.slice(-6); // up to 3 pairs
  const historySection = recentHistory.length > 0
    ? `\n── RECENT CONVERSATION (most recent last — use only if relevant to current request) ──\n${recentHistory.map(t => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content.slice(0, 300)}`).join('\n')}\n`
    : '';

  const system = `You are a BI dashboard assistant. The user has an open report and sends a follow-up message.
Your job: read the CURRENT REQUEST first, decide the best action, then use report context only to support that decision.

FORMAT RULE: ${formatHint}

Choose exactly one action and respond with JSON only. No markdown, no code fences.

── QA / ANSWER (user wants text — a summary, explanation, insight, analysis, or answer to a question):
Applies when the user asks for: summary, give summary, pointers, bullets, explain, what does this mean,
  what factors, why is, insights, tell me, describe, what drives, what is contributing, analyze,
  break down, how many, which territory, what is the, any direct question about the data.
IMPORTANT: "give the summary", "summarize this", "explain", "in pointers", "in bullets" → ALWAYS qa_answer.
{ "action": "qa_answer", "message": "Substantive answer using actual data values from REPORT DATA. ${formatHint} Include specific numbers.", "followUp": [ { "label": "...", "intent": "..." } ] }

── STRUCTURAL EDIT (change the report layout/visuals — hide, remove, rename, reorder, change chart type):
Applies when: "show only KPI", "remove the chart", "hide the table", "change to line chart", "just show KPI section".
{
  "action": "edit_structural",
  "acknowledgment": "One sentence confirming what you changed.",
  "title": "Report title (keep existing unless user asked to rename)",
  "message": "2–3 sentence updated narrative.",
  "cards": [ ...ONLY surviving cards after the edit... ],
  "followUp": [ { "label": "...", "intent": "..." } ]
}
KPI renderTypes: KPICard, KPIGrid, StatDelta
Chart renderTypes: BarChart, LineChart, AreaChart, PieChart, RankedList
Data renderTypes: Table, GenerativeTable
- "show only KPI" → KEEP KPI renderTypes only, REMOVE everything else.
- "remove chart/table" → REMOVE those renderTypes.
- Return ALL surviving cards. Never invent column names.

── DATA CHANGE (needs fresh filtered/sorted database rows — top N, filter by value, date range):
Applies when: "top 5 territories", "filter by T-017", "show only last 3 months".
{ "action": "edit_data_change", "sqlOverride": "ORDER BY SUG_REVENUE DESC LIMIT 5" }

── NEW REPORT (completely different topic unrelated to current report):
{ "action": "new_report" }

── AMBIGUOUS:
{ "action": "clarify_intent" }`;

  // User message: REQUEST first, then data context, then history (most recent last).
  const userMessage = `CURRENT REQUEST: "${query}"

── REPORT DATA (actual metric values — use these to answer qa_answer questions) ──
${dataContext || '(no data available)'}

── REPORT CONTEXT ──
${priorContext}

── CARD STRUCTURE (layout only) ──
${JSON.stringify(strippedCards, null, 2)}
${historySection}`;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: MODEL,
      config: {
        temperature: 0.2,
        maxOutputTokens: 4000,
        responseMimeType: 'application/json',
        systemInstruction: system,
      },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
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
    if (parsed.action === 'edit_data_change') {
      return {
        action: 'edit_data_change',
        sqlOverride: typeof parsed.sqlOverride === 'string' ? parsed.sqlOverride : undefined,
      };
    }
    if (parsed.action === 'qa_answer') {
      return {
        action: 'qa_answer',
        message: typeof parsed.message === 'string' ? parsed.message : 'Here is a summary of the report.',
        followUp: Array.isArray(parsed.followUp) ? parsed.followUp : [],
      };
    }
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

const REPORT_SYSTEM_PROMPT = `You are an expert business intelligence analyst. You receive a user query and real BigQuery data.
Your first job: understand WHAT the user is actually asking for, then pick ONLY the components that directly answer it.
Do NOT default to a standard dashboard layout. Choose components intentionally based on user intent.
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

── STEP 1: CLASSIFY THE QUERY INTENT ─────────────────────────────────────────
Read the USER QUERY and classify it as one of:

A) TEXT / SUMMARY / ANSWER — user wants an explanation, summary, insight, or direct answer.
   Signals: "summary", "summarize", "explain", "what is", "why", "how", "in text", "in points",
            "tell me", "describe", "what drives", "insights", "analyze", "what does this mean".
   → Use template "qa_answer". Cards: 1-2 KPICards (most relevant metric only) + 1 InsightCard or SummaryText with the full answer. NO charts. NO tables.

B) SPECIFIC METRIC / KPI — user wants to see one or a few numbers.
   Signals: "show me the", "what is the revenue", "give me the rate", "what's the value of".
   → Use template "summary". Cards: KPIGrid or 1-3 KPICards only. Add 1 chart only if it directly shows the metric asked. NO table unless explicitly asked.

C) TREND / TIME-BASED — user wants to see how something changes over time.
   Signals: "trend", "over time", "monthly", "by month", "how has X changed".
   → Use template "trend_analysis". Cards: 1 LineChart or AreaChart + 1 KPICard for current value. Optional Table if detail is needed.

D) COMPARISON / BREAKDOWN — user wants to compare across territories, teams, products, etc.
   Signals: "by territory", "compare", "top N", "which territory", "breakdown", "ranking".
   → Use template "comparison". Cards: 1 BarChart or RankedList + KPIGrid with averages. Optional Table.

E) FULL DASHBOARD — user explicitly asks for a full report/dashboard with everything.
   Signals: "show me the full report", "dashboard", "give me everything", "deep dive".
   → Use template "deep_dive". Cards: KPIGrid + 1-2 charts + Table. Max 5 cards.

── STEP 2: SELECT ONLY THE CARDS THAT ANSWER THE QUERY ──────────────────────
Intent A (text/summary): NEVER add charts or tables. InsightCard body = direct answer with specific numbers from data.
Intent B (metric): 1-3 KPIs max. Chart only if it shows the exact metric asked.
Intent C (trend): Lead with chart. 1 supporting KPI only.
Intent D (comparison): Lead with chart/ranking. Supporting KPIs for context.
Intent E (dashboard): Full set — but still max 5 top-level cards.

AVAILABLE COMPONENTS:
Metrics (embed real values from data sample): KPICard { title, value, trend? }, KPIGrid { metrics: [{title,value,trend?}] }, StatDelta { title, value, delta, trend }
Charts (pipeline attaches data — set keys only): BarChart { title, xKey, yKey }, LineChart { title, xKey, yKey }, AreaChart { title, xKey, yKey }, PieChart { title, nameKey, valueKey }, RankedList { title, labelKey, valueKey, limit? }
Data: Table { title, columns[] } — columns[] = EXACT column names
Narrative (embed content directly): InsightCard { title, body }, SummaryText { content }, AlertBanner { title, message }
Layout: TwoColumn { children: [exactly 2] }, Section { title?, children: [1-4] }

RULES:
- xKey/yKey/nameKey/valueKey/labelKey: MUST be from EXACT_COLUMNS list.
- KPICard/KPIGrid/StatDelta: compute real numeric values from data sample. Never use placeholder "—".
- InsightCard/SummaryText body: write the actual answer using specific numbers from the data sample.
- trend: "+4.2%" or "-1.5%". Only include if clearly calculable from data.
- TwoColumn: exactly 2 children only. BarChart/LineChart/Table are FULL-WIDTH — never alone in TwoColumn.
- followUp: 3–4 natural follow-up questions.
- Minimum 1 card. Maximum 5 top-level cards. Do not pad with redundant components.

── ENTITY SPECIFICITY (critical) ────────────────────────────────────────────
If the query mentions specific entities (e.g. T-007, T-001, a named territory, team, or product):
- The QUERY-RELEVANT ROWS section in the user message shows the data for those exact entities.
- KPI values MUST come from those specific entity rows — NEVER show network/global averages.
- Title and message MUST name the entities explicitly.
- Example: query = "show T-007 return rate" → KPICard title="T-007 Return Rate", value=4.66% (from T-007's row).

── COMPARISON SPECIFICITY ───────────────────────────────────────────────────
If the query compares two or more entities (e.g. "compare T-007 and T-001"):
- message MUST describe the comparison result: "T-007 has X vs T-001's Y — a Z% difference."
- KPIs must show each entity's value, not a global average. Use one KPICard per entity, or a TwoColumn with one KPICard per side.
- NEVER write a generic message like "analysis across territories" when two specific ones were asked about.

── NARRATIVE ACCURACY ───────────────────────────────────────────────────────
The "message" field must directly and specifically answer the user query.
- Query asks "which territory has highest X?" → message must name that territory and its value.
- Query compares A and B → message must compare A and B with their values.
- NEVER recycle a prior report description. NEVER use generic phrases that don't answer the specific question.`;

// ── generateReport ────────────────────────────────────────────────────────────

const MAX_SAMPLE_ROWS = 10;
const MAX_SAMPLE_COLS = 10;

// Extract entity tokens mentioned in the query (territory IDs, names, identifiers).
// Finds any dimension value that appears verbatim in the query string.
function extractQueryEntities(query: string, rows: any[], dimensionCols: string[]): string[] {
  if (!rows.length || !dimensionCols.length) return [];
  const queryUpper = query.toUpperCase();
  const seen = new Set<string>();
  for (const row of rows) {
    for (const col of dimensionCols) {
      const val = String(row[col] ?? '').trim();
      if (val.length > 1 && queryUpper.includes(val.toUpperCase()) && !seen.has(val)) {
        seen.add(val);
      }
    }
  }
  return [...seen];
}

// Build a sample that puts query-relevant entity rows first, then fills with others.
// This ensures the LLM sees the specific entities the user asked about and computes
// correct KPI values for them rather than global averages.
function buildCompactSample(rows: any[], shape: ShapeSignature, query = ''): string {
  const keepCols = [
    ...(shape.timeColumn ? [shape.timeColumn] : []),
    ...shape.dimensionColumns,
    ...shape.measureColumns,
  ].slice(0, MAX_SAMPLE_COLS);

  const entities = extractQueryEntities(query, rows, shape.dimensionColumns);

  let ordered: any[];
  if (entities.length > 0) {
    const relevant = rows.filter(row =>
      shape.dimensionColumns.some(col => entities.includes(String(row[col] ?? '').trim()))
    );
    const others = rows.filter(row =>
      !shape.dimensionColumns.some(col => entities.includes(String(row[col] ?? '').trim()))
    );
    ordered = [...relevant, ...others];
  } else {
    ordered = rows;
  }

  const sliced = ordered.slice(0, MAX_SAMPLE_ROWS).map(row =>
    Object.fromEntries(keepCols.filter(c => c in row).map(c => [c, row[c]]))
  );
  return JSON.stringify(sliced);
}

// Build a human-readable block of the query-relevant entity rows for the prompt.
// Shown separately as "QUERY-RELEVANT ROWS" so the LLM knows exactly what to use for KPIs.
function buildEntityHighlight(rows: any[], shape: ShapeSignature, entities: string[]): string {
  if (!entities.length) return '';
  const keepCols = [...shape.dimensionColumns, ...shape.measureColumns].slice(0, MAX_SAMPLE_COLS);
  const relevant = rows.filter(row =>
    shape.dimensionColumns.some(col => entities.includes(String(row[col] ?? '').trim()))
  );
  if (!relevant.length) return '';
  const formatted = relevant.map(row =>
    keepCols.filter(c => c in row).map(c => `${c}=${row[c]}`).join(', ')
  ).join('\n');
  return `\nQUERY-RELEVANT ROWS (use these for KPI values — NOT global averages):\n${formatted}\n`;
}

export async function generateReport(
  query: string,
  shape: ShapeSignature,
  sampleRows: any[],
  priorContext?: string,
): Promise<LLMReport> {
  const ai = getAI();

  const allColumns = Object.keys(shape.columnTypes);

  const entities = extractQueryEntities(query, sampleRows, shape.dimensionColumns);
  const entityHighlight = buildEntityHighlight(sampleRows, shape, entities);
  const compactSample = buildCompactSample(sampleRows, shape, query);

  const userMessage = `USER QUERY: "${query}"

EXACT_COLUMNS (copy these character-for-character into all key fields):
  Dimension columns: ${shape.dimensionColumns.join(', ') || 'none'}
  Measure columns:   ${shape.measureColumns.join(', ') || 'none'}
  ${shape.isTimeSeries ? `Time column:       ${shape.timeColumn}` : 'Not a time series'}
  All columns:       ${allColumns.join(', ')}
${entityHighlight}
DATA SAMPLE (${Math.min(sampleRows.length, MAX_SAMPLE_ROWS)} rows, query-relevant entities first):
${compactSample}

Design the best response to this query. Use EXACT_COLUMNS for all key fields. Respond with JSON only.`;

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
