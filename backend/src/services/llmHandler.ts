import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { ShapeSignature } from '../types';

dotenv.config();

const MODEL = 'gemma-4-31b-it';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ClarifyResult {
  action: 'generate' | 'clarify';
  questions: string[];
}

export interface ReportCard {
  renderType: 'BarChart' | 'LineChart' | 'KPI' | 'KPIGrid' | 'GenerativeTable';
  props: Record<string, any>;
}

export interface LLMReport {
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
You receive a user query and a sample of real data from BigQuery.
Your job is to design the best report to answer the query.

AVAILABLE COMPONENTS (pick 1-4 that best suit the data):

- KPI: single metric. Props: { title, value (number), trend ("+X%" string), explanation }
- KPIGrid: 2-6 metrics. Props: { metrics: [{title, value, trend}], explanation }
- BarChart: categorical comparison. Props: { title, xKey (column name), yKey (column name), explanation }
  DO NOT include data — the pipeline will attach it.
- LineChart: time series / trend. Props: { title, xKey (date/time column), yKey (numeric column), explanation }
  DO NOT include data — the pipeline will attach it.
- GenerativeTable: tabular detail. Props: { title, columns: [column names], explanation }
  DO NOT include data — the pipeline will attach it.

RULES:
- Read the actual column names from the data sample and use them exactly in xKey/yKey/columns.
- For KPI and KPIGrid, read actual values from the data sample (use first row or compute average/total if obvious).
- Write a real trend string like "+12%" or "-3%" only if you can infer it; otherwise omit trend.
- explanation: one sentence (max 20 words) describing what this component shows.
- followUp: 3-4 short questions the user might ask next.
- NEVER invent column names. Only use columns that exist in the sample.

OUTPUT FORMAT — valid JSON only, no markdown, no code fences:
{
  "message": "2-3 sentence narrative summary of the analysis",
  "title": "Report title (5-8 words)",
  "description": "One-sentence report description",
  "cards": [
    {
      "renderType": "ComponentName",
      "props": { ...component props... }
    }
  ],
  "followUp": [
    { "label": "Short button label", "intent": "what this follow-up asks" }
  ]
}`;

// ── Clarification gate ────────────────────────────────────────────────────────

const CLARIFY_SYSTEM = `You are a business intelligence assistant routing layer.
Decide if a user query has enough context to generate a BI report, or if you need more information.

A query is SPECIFIC ENOUGH if it mentions ANY of:
- A metric (revenue, sales, churn, performance, take rate, calls, CSAT, scores, units)
- A dimension (region, territory, market, employee, device, outlet, team, department)
- A dataset or domain (contact center, sales, network, catalog)
- A time period (monthly, Q1, last quarter, this year)

A query is TOO VAGUE if it is:
- A greeting or non-BI question ("hi", "hello", "how are you")
- A generic request with no data context ("create a report", "show me something", "give me data")
- Ambiguous with no clear metric or dimension

RESPOND WITH JSON ONLY:
{
  "action": "generate",
  "questions": []
}
OR
{
  "action": "clarify",
  "questions": ["Question 1?", "Question 2?"]
}
Max 2 short, specific questions. Questions should guide the user to specify metric + dimension or time period.`;

export async function clarifyOrGenerate(query: string): Promise<ClarifyResult> {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      config: {
        temperature: 0,
        maxOutputTokens: 256,
        responseMimeType: 'application/json',
        systemInstruction: CLARIFY_SYSTEM,
      },
      contents: [{ role: 'user', parts: [{ text: `User query: "${query}"` }] }],
    });

    const raw = stripThinkTags(response.text ?? '');
    const parsed = JSON.parse(extractJSON(raw));

    return {
      action: parsed.action === 'clarify' ? 'clarify' : 'generate',
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
    };
  } catch (err) {
    console.error('clarifyOrGenerate error:', err);
    // On error, default to generating — don't block the user
    return { action: 'generate', questions: [] };
  }
}

// ── Main export ──────────────────────────────────────────────────────────────

export async function generateReport(
  query: string,
  shape: ShapeSignature,
  sampleRows: any[]
): Promise<LLMReport> {
  const ai = getAI();

  const columnSummary = Object.entries(shape.columnTypes)
    .map(([col, type]) => `${col} (${type})`)
    .join(', ');

  const userMessage = `USER QUERY: "${query}"

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
        temperature: 0.3,
        maxOutputTokens: 3000,
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
      message: parsed.message ?? 'Here is your analysis.',
      title: parsed.title ?? 'Data Report',
      description: parsed.description ?? '',
      cards: Array.isArray(parsed.cards) ? parsed.cards : [],
      followUp: Array.isArray(parsed.followUp) ? parsed.followUp : [],
    };
  } catch (err: any) {
    console.error('generateReport error:', err?.message ?? err);
    return {
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
