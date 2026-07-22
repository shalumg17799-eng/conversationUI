import { GoogleGenAI, Type, Tool } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';
import { spawn } from 'child_process';
import dotenv from 'dotenv';
import { ShapeSignature } from '../types';
import { runQueryWithMeta, qualifiedTable } from '../lib/bigqueryClient';
import { DATA_SOURCES, ALL_DOMAINS, ALL_TABLES, getSourcesByDomain, getAnglesByDomain, findAnglesByLabel } from './dataSourceMap';
import { loadCatalogContext } from './catalogRefresher';
import { OutputMode } from '../registry/componentRegistry';
import { isValidOutputMode, withOutputModeHint } from './outputMode';

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
  | { action: 'route'; table: string; intent: 'trend' | 'comparison' | 'metric_by_dimension'; outputMode?: OutputMode };

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

// ── Provider abstraction ──────────────────────────────────────────────────────
// Two LLM backends, selected per-request based on the logged-in user:
//   'gemma'  → internal users → Google Gemma via @google/genai (production path)
//   'sonnet' → client users   → Anthropic Sonnet via the `claude` CLI (temporary
//              stopgap until a Sonnet API key is available; swap generateViaCLI
//              for a direct SDK call when the key arrives — nothing else changes).
export type LLMProvider = 'gemma' | 'sonnet';

const SONNET_MODEL = process.env.SONNET_MODEL || 'sonnet'; // CLI alias for latest Sonnet

export function resolveProvider(raw: unknown): LLMProvider {
  return raw === 'sonnet' ? 'sonnet' : 'gemma';
}

interface GenOpts {
  system: string;
  user: string;
  temperature?: number;
  maxOutputTokens?: number;
}

// Sonnet path — shell out to the locally-authenticated `claude` CLI in print mode.
// Uses the user's existing CLI login (OAuth/keychain). IMPORTANT: we strip
// ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN from the child env, otherwise the CLI
// would inherit the backend's ANTHROPIC_API_KEY (loaded by dotenv) and bill the
// console/API account instead of the subscription behind the OAuth login. We also
// do NOT pass --bare (which would force ANTHROPIC_API_KEY-only auth). --system-prompt
// REPLACES Claude Code's default agent prompt with ours; the user text goes on stdin
// to avoid any shell-escaping issues (spawn runs without a shell).
function generateViaCLI(opts: GenOpts): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      '-p',
      '--model', SONNET_MODEL,
      '--system-prompt', opts.system,
      '--output-format', 'json',
      '--no-session-persistence',
    ];
    // Force OAuth/subscription auth: remove any inherited API-key credentials so the
    // CLI uses the logged-in account, not the (possibly empty) console API balance.
    const childEnv = { ...process.env };
    delete childEnv.ANTHROPIC_API_KEY;
    delete childEnv.ANTHROPIC_AUTH_TOKEN;
    const child = spawn('claude', args, { stdio: ['pipe', 'pipe', 'pipe'], env: childEnv });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('error', err => reject(new Error(`Sonnet CLI spawn failed: ${err.message}. Is the \`claude\` CLI installed and logged in?`)));
    child.on('close', code => {
      if (code !== 0) {
        return reject(new Error(`Sonnet CLI exited ${code}: ${stderr.trim() || stdout.trim() || 'no output'}`));
      }
      // --output-format json wraps the reply: { type:'result', result:'<text>', ... }
      try {
        const env = JSON.parse(stdout);
        if (env && typeof env.result === 'string') return resolve(env.result);
        if (env && env.is_error) return reject(new Error(`Sonnet CLI error: ${env.result ?? 'unknown'}`));
      } catch { /* not JSON — fall through to raw */ }
      resolve(stdout);
    });

    child.stdin.write(opts.user);
    child.stdin.end();
  });
}

// Sonnet via the Anthropic API SDK — the fast path. No process spawn; the system
// prompt is sent with cache_control so Anthropic caches it across calls (big latency
// + cost win on the repeated catalog/system prompt). This is the drop-in replacement
// for the CLI: same (system, user) -> text contract.
let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });
  return _anthropic;
}

const SONNET_API_MODEL = process.env.SONNET_API_MODEL || 'claude-sonnet-4-6';

async function generateViaAPI(opts: GenOpts): Promise<string> {
  const client = getAnthropic();
  const msg = await client.messages.create({
    model: SONNET_API_MODEL,
    max_tokens: opts.maxOutputTokens ?? 2048,
    temperature: opts.temperature ?? 0.3,
    system: [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: opts.user }],
  });
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');
}

// The Sonnet transport is chosen at call time, not hard-wired:
//   • ANTHROPIC_API_KEY set  → API SDK (fast, cached)
//   • no key                 → `claude` CLI on the user's OAuth login (stopgap)
// Add the key to .env and Sonnet auto-upgrades to the API with zero code changes.
function useSonnetApi(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim());
}

// Rewrite report-video narration lines into natural spoken voiceover, keeping
// every number/fact identical and the order/count of lines unchanged. Used by
// the client-only video feature via /api/video/narration. Degrades gracefully:
// with no API key (or on any parse mismatch) the original lines pass through.
export async function polishNarrationLines(lines: string[], title?: string): Promise<string[]> {
  if (!Array.isArray(lines) || lines.length === 0) return lines ?? [];

  const system =
    'You are a professional voiceover script editor for short data-report videos. ' +
    'Rewrite each narration line so it sounds warm, clear, and natural when spoken aloud. ' +
    'STRICT RULES: keep every number, percentage, date, and proper noun exactly as given; ' +
    'do not invent facts; keep each line roughly the same length (one or two sentences); ' +
    'return ONLY a JSON array of strings with the SAME length and order as the input — no prose, no keys.';
  const user = JSON.stringify({ title: title ?? 'Report', lines });

  try {
    // Route through the same Sonnet transport as reports: API SDK when
    // ANTHROPIC_API_KEY is set, otherwise the locally-authenticated `claude` CLI.
    const raw = await modelGenerate('sonnet', { system, user, maxOutputTokens: 1600, temperature: 0.5 });
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return lines;
    const parsed = JSON.parse(match[0]);
    if (Array.isArray(parsed) && parsed.length === lines.length && parsed.every((s) => typeof s === 'string' && s.trim())) {
      return parsed as string[];
    }
    return lines;
  } catch {
    return lines; // any failure → keep deterministic narration
  }
}

// Scene context handed to the video scriptwriter — enough to tell the story
// without the narration parroting what's already on screen.
export interface NarrationScene {
  kind: string;               // cover | kpis | chart | insight | table | outro
  heading?: string;
  onScreen?: string[];        // text already visible on the slide
  dataHint?: string;          // factual summary (numbers) the line may draw from
}

// Write engaging, story-structured voiceover for a report video. Produces one
// line per scene as a single flowing narrative — hook/context → the findings →
// takeaway — instead of reading the slide text. TTS-friendly (full month names,
// spoken numbers, no abbreviations/codes). Falls back to the provided dataHints
// (the deterministic narration) if the model is unavailable or returns garbage.
export async function writeVideoNarration(
  scenes: NarrationScene[],
  meta: { title?: string; description?: string },
): Promise<string[]> {
  const fallback = scenes.map(s => s.dataHint ?? '');
  if (!scenes.length) return fallback;

  const system =
    'You are a scriptwriter for short, engaging data-story videos. You write the voiceover narration only.\n' +
    'Write the whole set of lines as ONE cohesive story that flows scene to scene:\n' +
    '• Open by framing what this report is about and WHY it matters (the question or problem it answers).\n' +
    '• Build through the middle scenes by revealing what the data shows — the tension, the standouts, what is surprising or important.\n' +
    '• Close with a clear takeaway or "so what".\n' +
    'HARD RULES:\n' +
    '- Return ONLY a JSON array of strings, exactly one per scene, in order. No keys, no commentary.\n' +
    '- Each line is 1–2 sentences of natural, spoken English (a person talking, not a caption).\n' +
    '- DO NOT read the on-screen text verbatim. Complement it — add the narrative connective tissue between slides.\n' +
    '- Every number, percentage, and name must stay accurate to the data hints. Never invent figures.\n' +
    '- Write for text-to-speech: spell months in full (say "April", never "Apr" or "A P R"); say "percent" and "dollars"; expand or drop codes and abbreviations (e.g. say "territory nine", not "T-009"; never read "(APR)" as letters).\n' +
    '- Vary sentence openings; keep it warm and confident, not robotic.';

  const user = JSON.stringify({
    title: meta.title ?? 'Report',
    description: meta.description ?? '',
    scenes: scenes.map((s, i) => ({ scene: i + 1, kind: s.kind, heading: s.heading, onScreen: s.onScreen, dataHint: s.dataHint })),
  });

  try {
    const raw = await modelGenerate('sonnet', { system, user, maxOutputTokens: 2200, temperature: 0.7 });
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return fallback;
    const parsed = JSON.parse(match[0]);
    if (Array.isArray(parsed) && parsed.length === scenes.length && parsed.every((s) => typeof s === 'string' && s.trim())) {
      return parsed as string[];
    }
    return fallback;
  } catch {
    return fallback;
  }
}

// Choose a few cinematic stock-footage search queries for the B-roll behind a
// report video, evoking the topic without literal charts. Falls back to safe
// corporate defaults.
export async function pickFootageQueries(title?: string, description?: string): Promise<string[]> {
  const fallback = ['business analytics', 'modern office', 'city skyline aerial'];
  const system =
    'You pick stock-video search queries for cinematic B-roll behind a corporate data-report video. ' +
    'Return ONLY a JSON array of exactly 3 short queries (1–3 lowercase words each). ' +
    'They should evoke the report\'s subject and a professional, aspirational mood — NOT literal charts, graphs, or screens. ' +
    'Prefer abstract/atmospheric footage (people working, cityscapes, technology, industry, nature) relevant to the topic. No brand names.';
  const user = JSON.stringify({ title: title ?? 'Business report', description: description ?? '' });
  try {
    const raw = await modelGenerate('sonnet', { system, user, maxOutputTokens: 200, temperature: 0.6 });
    const m = raw.match(/\[[\s\S]*\]/);
    if (!m) return fallback;
    const arr = JSON.parse(m[0]);
    if (Array.isArray(arr) && arr.length && arr.every((s) => typeof s === 'string' && s.trim())) {
      return arr.slice(0, 3).map((s) => String(s).trim());
    }
    return fallback;
  } catch {
    return fallback;
  }
}

// Single entry point every LLM call funnels through. Returns the raw model text;
// callers still run stripThinkTags + extractJSON as before. Exported so parallel,
// offline features (e.g. release-note generation) can reuse the same Sonnet
// transport (CLI on OAuth, or API when ANTHROPIC_API_KEY is set) without touching
// the query pipeline.
export async function modelGenerate(provider: LLMProvider, opts: GenOpts): Promise<string> {
  if (provider === 'sonnet') return useSonnetApi() ? generateViaAPI(opts) : generateViaCLI(opts);

  const ai = getAI();
  const response = await ai.models.generateContent({
    model: MODEL,
    config: {
      temperature: opts.temperature ?? 0.3,
      maxOutputTokens: opts.maxOutputTokens ?? 2048,
      responseMimeType: 'application/json',
      systemInstruction: opts.system,
    },
    contents: [{ role: 'user', parts: [{ text: opts.user }] }],
  });
  return response.text ?? '';
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

// ── Sonnet front-door responder ───────────────────────────────────────────────
// One Sonnet call that decides how to respond to ANY message — it is not forced to
// build a report. Sonnet is capable enough to converse, answer, clarify, or route
// in a single decision. Grounded by a COMPACT in-memory catalog (no heavy .md file).
export type SonnetIntent =
  | { action: 'chat'; message: string }
  | { action: 'answer'; message: string }
  | { action: 'clarify'; question: string; options: string[] }
  | { action: 'generate'; table: string; intent: 'trend' | 'comparison' | 'metric_by_dimension'; outputMode?: OutputMode };

// True when the text carries report-level intent beyond a bare domain — a metric,
// dimension, chart type, or comparison. "create a sales report" → false (bare domain),
// "sales revenue trend" / "compare territories" → true. Drives drill-down vs generate.
function hasReportSpecificity(texts: string[], domainName?: string): boolean {
  const STOP = new Set(['create', 'new', 'a', 'an', 'the', 'report', 'reports', 'me', 'my', 'i',
    'want', 'wanted', 'please', 'to', 'for', 'build', 'generate', 'make', 'give', 'get', 'show',
    'see', 'view', 'pull', 'can', 'you', 'of', 'on', 'about', 'dashboard', 'data', 'some', 'let',
    'lets', 'need', 'would', 'like', 'with', 'and', 'this', 'that', 'help', 'please', 'us', 'we']);
  const domainWords = new Set((domainName ?? '').toLowerCase().split(/\s+/));
  const tokens = texts.join(' ').toLowerCase().replace(/[^a-z0-9\s%-]/g, ' ').split(/\s+/).filter(Boolean);
  return tokens.some(t => t.length > 1 && !STOP.has(t) && !domainWords.has(t));
}

export async function sonnetRespond(
  query: string,
  history: ClarificationTurn[] = [],
): Promise<SonnetIntent> {
  const available = getAvailableDataSources();
  const availableTables = new Set(available.map(s => s.table));
  const allTexts = [query, ...history.map(t => t.answer)];

  // ── Deterministic context extraction first — only ask for what's actually missing.
  const { domain: knownDomain, source: knownSource } = extractContextFromText(allTexts);

  // A report ANGLE was picked from the menu (or named) → build that specific report.
  // The descriptive label rides into report generation via the clarification history,
  // so the same table produces a different report per angle.
  const pickedAngle = findAnglesByLabel(allTexts).find(a => availableTables.has(a.table));
  if (pickedAngle) {
    return { action: 'generate', table: pickedAngle.table, intent: 'metric_by_dimension' };
  }

  // A specific catalog report is identifiable → generate now (no LLM, no questions).
  if (knownSource && availableTables.has(knownSource.table)) {
    return { action: 'generate', table: knownSource.table, intent: 'metric_by_dimension' };
  }

  // Domain known but the request is BARE (no specific metric/dimension) → offer the
  // domain's report menu (multiple angles from existing data). Don't pick arbitrarily.
  if (knownDomain && !hasReportSpecificity(allTexts, knownDomain)) {
    const angles = getAnglesByDomain(knownDomain).filter(a => availableTables.has(a.table));
    if (angles.length >= 2) {
      return { action: 'clarify', question: `Which ${knownDomain} report would you like?`, options: angles.map(a => a.label) };
    }
    if (angles.length === 1) {
      return { action: 'generate', table: angles[0].table, intent: 'metric_by_dimension' };
    }
    // No angles configured for this domain — fall back to the raw catalog reports.
    const inDomain = available.filter(s => s.domain.toLowerCase() === knownDomain.toLowerCase());
    if (inDomain.length === 1) return { action: 'generate', table: inDomain[0].table, intent: 'metric_by_dimension' };
    if (inDomain.length > 1) {
      return { action: 'clarify', question: `Which ${knownDomain} report would you like?`, options: inDomain.map(s => s.reportName) };
    }
  }

  const domains = [...new Set(available.map(s => s.domain))];
  const reportNames = new Set(available.map(s => s.reportName));
  const domainAngleLabels = knownDomain ? getAnglesByDomain(knownDomain).filter(a => availableTables.has(a.table)).map(a => a.label) : [];
  const catalog = available.map(s => `- domain="${s.domain}" report="${s.reportName}" table="${s.table}" kpis=${s.kpis.slice(0, 4).join('/')}`).join('\n');

  // Tell the model exactly what is already settled so it never re-asks it.
  const knownBlock = knownDomain
    ? `ALREADY KNOWN: domain = "${knownDomain}". Do NOT ask for the domain again. If the user's wording points at one report, GENERATE it; otherwise CLARIFY *which report* — options MUST be exactly ${JSON.stringify(domainAngleLabels)}.`
    : `ALREADY KNOWN: nothing chosen yet.`;

  const historyText = history.length
    ? `\nCONVERSATION SO FAR:\n${history.map(t => `Q: ${t.question}\nA: ${t.answer}`).join('\n')}`
    : '';

  const system = `You are a warm, conversational business-intelligence assistant. Respond to what the user ACTUALLY said — never follow a fixed script, and never repeat a question whose answer you already have.

Pick exactly ONE action:
- "chat"     → greetings, small talk, thanks, general help → reply warmly in "message".
- "answer"   → a question you can answer in prose without a dashboard → put it in "message".
- "clarify"  → you are missing ONE thing needed to proceed. Ask ONLY for what's missing; put the question in "message" and choices in "options".
- "generate" → there's enough context to build it → set "table" to the EXACT table string and pick "intent".

${knownBlock}

AVAILABLE DATA (only these exist — never invent tables, domains, or reports):
${catalog}
ALL DOMAINS: ${domains.join(', ')}

Guidance:
- Use CONVERSATION SO FAR. If the domain (or a report) is already established, MOVE FORWARD — never repeat a question you already have the answer to.
- If the user gave only a DOMAIN with no specific report/metric/chart in mind (e.g. "create a sales report", "I want a network report"), you MUST CLARIFY *which report* and list that domain's reports as options. Do NOT arbitrarily pick one.
- GENERATE only when the request names or strongly implies a specific report, metric, dimension, or chart (e.g. "sales revenue trend", "compare territories", "churn over time", "top territories by take rate"). Then pick the matching table.
- One-off factual questions with no need for a visual → "answer". Greetings/small talk → "chat".

Respond with valid JSON only, no markdown:
{ "action": "chat"|"answer"|"clarify"|"generate", "message": "...", "options": ["..."], "table": "...", "intent": "trend"|"comparison"|"metric_by_dimension" }
(omit fields irrelevant to the chosen action)`;

  const user = `USER MESSAGE: "${query}"${historyText}\n\nDecide the best next action. Respond with JSON.`;

  try {
    const raw = await withRetry(() => modelGenerate('sonnet', { system: withOutputModeHint(system), user, temperature: 0.4, maxOutputTokens: 1024 }));
    const parsed = JSON.parse(extractJSON(stripThinkTags(raw)));

    if (parsed.action === 'generate' && parsed.table && available.some(s => s.table === parsed.table)) {
      return { action: 'generate', table: parsed.table, intent: parsed.intent ?? 'metric_by_dimension', outputMode: isValidOutputMode(parsed.output_mode) ? parsed.output_mode : undefined };
    }
    if (parsed.action === 'clarify') {
      // Guardrail: if the domain is already known, force report-level options so we can
      // never bounce back to "which domain?". Otherwise validate against the catalog.
      let opts: string[];
      if (knownDomain) {
        opts = domainAngleLabels;
      } else {
        opts = Array.isArray(parsed.options)
          ? parsed.options.filter((o: string) => domains.includes(o) || reportNames.has(o))
          : [];
        if (!opts.length) opts = domains;
      }
      const q = (typeof parsed.message === 'string' && parsed.message.trim())
        ? parsed.message
        : (knownDomain ? `Which ${knownDomain} report would you like?` : 'Which area would you like to explore?');
      return { action: 'clarify', question: q, options: opts };
    }
    if (parsed.action === 'answer' && typeof parsed.message === 'string') {
      return { action: 'answer', message: parsed.message };
    }
    if (typeof parsed.message === 'string') return { action: 'chat', message: parsed.message };
  } catch (err) {
    console.error('[sonnetRespond] failed, using deterministic fallback:', err);
  }

  // Fallback: never a dead end. Drill to report-level if domain is known.
  if (knownDomain && domainAngleLabels.length) {
    return { action: 'clarify', question: `Which ${knownDomain} report would you like?`, options: domainAngleLabels };
  }
  const det = deterministicRoute(query, history);
  if (det.action === 'route') return { action: 'generate', table: det.table, intent: det.intent };
  return { action: 'clarify', question: det.question, options: det.options };
}

// ── Deterministic router (no LLM) ─────────────────────────────────────────────
// Used by the lean Sonnet pipeline: route via the catalog fast-path, else fall back
// to a deterministic clarify. This removes one Sonnet call per new report — Sonnet
// is strong enough that we only need it for the single report-design step, not for
// table routing (which the catalog already determines).
export function deterministicRoute(query: string, history: ClarificationTurn[] = []): AnalyzeResult {
  const allTexts = [query, ...history.map(t => t.answer)];
  const { source } = extractContextFromText(allTexts);
  if (source) {
    const available = getAvailableDataSources();
    if (available.some(s => s.table === source.table)) {
      return { action: 'route', table: source.table, intent: 'metric_by_dimension' };
    }
  }
  return deterministicFallback(query, history);
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
8. Requests to DRAW/SKETCH a diagram/flow/topology/map, or to WRITE a brief/memo/document/one-pager, ARE supported — the report layer renders them. Treat them like any other request: route if a domain+report is clear, else clarify the domain/report normally. NEVER answer that diagrams or documents are unsupported or that the dataset lacks them.

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
  provider: LLMProvider = 'gemma',
): Promise<AnalyzeResult> {
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

    const raw = await withRetry(() => modelGenerate(provider, {
      system: withOutputModeHint(system), user, temperature: 0.2, maxOutputTokens: 768,
    }));

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
          outputMode: isValidOutputMode(parsed.output_mode) ? parsed.output_mode : undefined,
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
  provider: LLMProvider = 'gemma',
): Promise<FusedIntentResult> {
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
    const raw = await modelGenerate(provider, {
      system, user: userMessage, temperature: 0.2, maxOutputTokens: 4000,
    });

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

// NOTE: the "AVAILABLE COMPONENTS" catalogue below is hand-maintained and is NOT
// derived from backend/src/registry/componentRegistry.ts. A type must be listed here
// AND registered there to be usable end to end — registry membership alone only wires
// validation, constraint derivation, governance and rendering, never generation.
// That duplication is the same class of drift as the known registry/renderer gap;
// deriving this catalogue from the registry would remove it (tracked separately).
//
// Phase 2, Track D added 'html-artifact' and 'svg-artifact' to both. They are listed
// under RICH ARTIFACTS with deliberately restrictive last-resort wording: generation
// does not enforce the constraint set (see "observed, not enforced" in generateReport)
// and the governor defaults to off, so the prompt text is the only thing bounding how
// often the model reaches for them. Weaken that wording and they will start displacing
// real chart/table components on ordinary BI queries.
const REPORT_SYSTEM_PROMPT = `You are an expert business intelligence analyst. You receive a user query and real BigQuery data.
Understand WHAT the user is asking, then select ONLY the components that directly answer it.
Do NOT default to a standard dashboard layout. Choose components based on query intent.
Respond with valid JSON only — no markdown, no code fences, no explanation.

OUTPUT FORMAT:
{
  "title": "Report title (5-8 words)",
  "message": "2-3 sentence narrative summary that directly answers the query",
  "cards": [ { "renderType": "ComponentName", "props": { ...props... }, "children": [] } ],
  "followUp": [ { "label": "Short label", "intent": "full question" } ]
}

COLUMN NAME RULE — MOST IMPORTANT:
The EXACT_COLUMNS list in the user message contains the exact column names as they exist in the database.
You MUST copy these names character-for-character into xKey, yKey, nameKey, valueKey, labelKey, and columns[].
NEVER lowercase, rename, or invent column names. If unsure, check EXACT_COLUMNS.

── STEP 1: UNDERSTAND THE QUERY INTENT ───────────────────────────────────────

TEXT / SUMMARY / ANSWER — user wants explanation, insight, or direct answer.
  Signals: "summarize", "explain", "what is", "why", "how", "tell me", "describe", "insights", "analyze".
  → Cards: 1-2 KPICards (most relevant metric) + 1 InsightCard or SummaryText. NO charts. NO tables.

SPECIFIC METRIC / KPI — user wants one or a few numbers.
  Signals: "show me the", "what is the revenue", "give me the rate".
  → Cards: KPIGrid or 1-3 KPICards. Add 1 chart only if it directly shows the metric. NO table unless asked.

TREND / TIME-BASED — user wants to see change over time.
  Signals: "trend", "over time", "monthly", "by month", "how has X changed".
  → Cards: 1 LineChart or AreaChart + 1 KPICard for current value. Optional Table if detail needed.

COMPARISON / BREAKDOWN — user wants to compare entities or rank them.
  Signals: "by territory", "compare", "top N", "ranking", "breakdown", "vs".
  → Cards: ComparisonCard or BarChart or RankedList + KPIGrid with averages. Optional Table.
  → Use ComparisonCard when comparing 2-5 named entities head-to-head.

CORRELATION — user wants to see relationship between two metrics.
  Signals: "correlation", "relationship", "does X affect Y", "scatter".
  → Cards: ScatterPlot { xKey, yKey, zKey? } + 1 InsightCard describing the relationship.

CONVERSION / PIPELINE — user wants to see drop-off through stages.
  Signals: "funnel", "conversion", "pipeline", "drop-off", "stages".
  → Cards: FunnelChart { nameKey, valueKey } + 1-2 KPICards for top/bottom stage rates.

ATTAINMENT / GOAL — user wants to see progress toward a target.
  Signals: "attainment", "quota", "target", "goal", "vs target", "achievement".
  → Cards: GaugeChart or ProgressBar + InsightCard with context.

PATTERN / ACTIVITY GRID — user wants a time-of-day or day-of-week heatmap.
  Signals: "heatmap", "by hour", "by day", "pattern", "busiest time", "activity".
  → Cards: HeatMap { xKey=hour/day, yKey=dimension, valueKey } + 1 InsightCard.

DUAL-AXIS / COMBINED METRIC — user wants bar + line on same chart.
  Signals: "vs", "and", "revenue and growth", "volume and rate", "two metrics over time".
  → Cards: ComboChart { xKey, barKey, lineKey } + 1 KPICard.

CROSS-TAB / PIVOT — user wants a matrix breakdown.
  Signals: "pivot", "cross-tab", "by X and Y", "matrix", "breakdown by two dimensions".
  → Cards: PivotTable { rowKey, colKey, valueKey }.

STEPS / PROCESS — user wants actions or recommendations.
  Signals: "steps", "actions", "recommendations", "what should I do", "how to improve".
  → Cards: StepList + 1 InsightCard with context.

TIMELINE / HISTORY — user wants a sequence of events.
  Signals: "timeline", "history", "what happened", "events", "milestones".
  → Cards: TimelineCard { events }.

FULL DASHBOARD — user wants everything.
  Signals: "full report", "dashboard", "give me everything", "deep dive".
  → Cards: KPIGrid + 1-2 charts + Table. Max 5 cards.

── STEP 2: COMPONENT SELECTION RULES ────────────────────────────────────────
- Pick the minimum components needed to answer the query. Don't pad.
- Minimum 1 card. Maximum 5 top-level cards.
- Full-width components (BarChart, LineChart, AreaChart, ScatterPlot, FunnelChart, Table): NEVER put alone inside TwoColumn.
- TwoColumn: exactly 2 children only (KPICard, GaugeChart, ComparisonCard, StatDelta work well here).
- followUp: 3-4 natural follow-up questions as array of { label, intent }.

── AVAILABLE COMPONENTS ──────────────────────────────────────────────────────

METRIC (embed real values from data sample):
  KPICard { title, value, trend?, delta?, explanation? }
  KPIGrid { metrics: [{title, value, trend?}], explanation? }
  StatDelta { title, current, previous, currentLabel?, previousLabel?, trend? }

CHARTS (pipeline attaches data — set keys only from EXACT_COLUMNS):
  BarChart     { title, xKey, yKey, filterValues?: string[], explanation? }
  // filterValues: when query names specific entities (e.g. "T-007, T-003, T-019"), set filterValues to those exact dimension values.
  // Leave filterValues absent to show all entities, sorted T-001 → T-N.
  LineChart    { title, xKey, yKey, explanation? }
  AreaChart    { title, xKey, yKey, explanation? }
  PieChart     { title, nameKey, valueKey, explanation? }
  RankedList   { title, labelKey, valueKey, limit?, sort?: "asc"|"desc", explanation? }
// sort "desc" = top N highest (default), "asc" = bottom N lowest
  ScatterPlot  { title, xKey, yKey, zKey?, explanation? }       — correlation queries ("does X relate to Y")
  FunnelChart  { title, nameKey, valueKey, explanation? }       — conversion/pipeline queries
  HeatMap      { title, xKey, yKey, valueKey, explanation? }    — time-of-day or day-of-week pattern queries
  ComboChart   { title, xKey, barKey, lineKey, barLabel?, lineLabel?, explanation? }  — dual-axis: bar + line (e.g. revenue + growth rate)
  Sparkline    { label, value, trend?, xKey, yKey, explanation? }  — tiny inline KPI + trend line (pipeline attaches data)

METRIC WITH GOAL:
  GaugeChart   { title, value, max?, target?, unit?, explanation? }  — embed value from data sample; color auto green/amber/red

COMPARISON:
  ComparisonCard { title, metric?, entities: [{label, value, unit?, delta?}], explanation? }  — embed values from data sample

PROGRESS / ATTAINMENT:
  ProgressBar  { title?, items: [{label, value, target, unit?}], explanation? }  — embed values; color auto by attainment %

DATA:
  Table        { title, columns[] }   — columns[] = EXACT column names from EXACT_COLUMNS
  PivotTable   { title, rowKey, colKey, valueKey, explanation? }  — cross-tab; pipeline attaches data

NARRATIVE (embed content directly):
  InsightCard  { title, body, type?: "insight"|"warning"|"success" }
  SummaryText  { text }
  AlertBanner  { message, type?: "info"|"warning"|"error"|"success" }
  Callout      { title, body?, metric?, explanation? }   — highlighted key finding, larger than AlertBanner
  StepList     { title?, steps: [string | {title, description}], explanation? }  — numbered action items or process steps
  TimelineCard { title?, events: [{date?, title, description?, value?, type?: "success"|"warning"|"error"|"info"}], explanation? }

LAYOUT:
  TwoColumn    { children: [exactly 2] }
  Section      { title?, description?, children: [1-4] }

RICH ARTIFACTS — only when the user explicitly asks for a drawing or a formatted document.
  svg-artifact  { content, title?, caption?, explanation? }
    USE WHEN the query explicitly asks to draw/sketch/map something structural:
      "draw a diagram", "sketch the flow", "show the topology", "map the architecture",
      "flow chart", "process diagram", "escalation path", "how does X connect to Y".
    content = one self-contained static SVG document laying out that structure — labelled
    boxes/nodes connected by lines or arrows. Use a viewBox, readable <text> labels, and
    the palette #2563EB #1D9E75 #D97706 #7C3AED on #EFF6FF/#F0FDF4/#FEF3C7 fills.
    Ground the labels in the real domain entities from the data sample where relevant.
    NEVER as a substitute for a chart — any x/y, categorical, time-series or share-of-whole
    DATA must use BarChart/LineChart/AreaChart/PieChart/etc. A diagram shows STRUCTURE
    (how things connect or flow), never measured values.
    DECISIVE: when the request explicitly uses drawing language (draw / sketch / diagram /
    map / topology / flow), the svg-artifact IS the answer — build the structure from the
    domain entities (e.g. territories or nodes as boxes) and DO NOT fall back to a chart
    dashboard just because the underlying data is numeric. The "not a substitute for a
    chart" rule applies to data questions that merely COULD be drawn, not to an explicit
    request to draw.

  html-artifact { content, title?, caption?, explanation? }
    USE WHEN the query explicitly asks for a written document rather than a dashboard:
      "write a brief", "formatted document", "write-up with headings", "a one-pager",
      "memo", "report document with sections and nested tables".
    content = one self-contained static HTML fragment: <h3> headings, <p> prose,
    <ul>/<ol> lists, and <table> where a small inline table genuinely helps.
    Embed real values from the data sample — never placeholders.
    NEVER for a plain data answer: tabular data uses Table/PivotTable, metrics use
    KPICard/KPIGrid, and short narrative text uses SummaryText/InsightCard/Callout.

  Both are rendered sandboxed with scripts disabled. content MUST be static markup only:
  no <script>, no on* event handlers, no style="" attributes, no javascript:/data: URIs,
  no external resource loads. Such content is stripped and the card downgrades to plain text.
  Use SVG presentation attributes (fill=, stroke=) rather than style="".
  Emit at most ONE artifact card per report, and only when the query explicitly asked for it.

── ENTITY SPECIFICITY (critical) ────────────────────────────────────────────
If the query mentions specific entities (e.g. T-007, T-001, a named territory, team, or product):
- The QUERY-RELEVANT ROWS section shows data for those exact entities.
- KPI values MUST come from those specific entity rows — NEVER show network/global averages.
- Title and message MUST name the entities explicitly.
- Example: query = "show T-007 return rate" → KPICard title="T-007 Return Rate", value=4.66%.

── COMPARISON SPECIFICITY ───────────────────────────────────────────────────
If the query compares two or more entities (e.g. "compare T-007 and T-001"):
- message MUST describe the comparison: "T-007 has X vs T-001's Y — a Z% difference."
- Use ComparisonCard with entities array, one entry per entity with their actual values.
- NEVER write generic phrases like "analysis across territories" when specific ones were asked about.

── NARRATIVE ACCURACY ───────────────────────────────────────────────────────
The "message" field must directly and specifically answer the user query.
- Query asks "which territory has highest X?" → message must name that territory and its value.
- Query compares A and B → message must compare A and B with their values.
- NEVER recycle a prior report description. NEVER use generic phrases.`;

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
  provider: LLMProvider = 'gemma',
  outputMode?: OutputMode,   // Phase 2: inert — logged for observability, never enforced
): Promise<LLMReport> {
  if (outputMode) console.log(`[generateReport] outputMode=${outputMode} (observed, not enforced)`);
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
    const raw = await withRetry(() => modelGenerate(provider, {
      system: REPORT_SYSTEM_PROMPT, user: userMessage, temperature: 0.4, maxOutputTokens: 4000,
    }));

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
  messages: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>,
  provider: LLMProvider = 'gemma',
): Promise<LLMResponse> {
  const system = systemPrompt + '\n\n' + CHAT_JSON_SCHEMA;

  let raw: string;
  if (provider === 'sonnet') {
    // CLI takes a single user turn — flatten the message history into one transcript.
    const transcript = messages
      .map(m => `${m.role === 'model' ? 'Assistant' : 'User'}: ${m.parts.map(p => p.text).join(' ')}`)
      .join('\n');
    raw = await generateViaCLI({ system, user: transcript, temperature: 0.3, maxOutputTokens: 2048 });
  } else {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: MODEL,
      config: {
        temperature: 0.3,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
        systemInstruction: system,
      },
      contents: messages,
    });
    raw = response.text ?? '';
  }

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
