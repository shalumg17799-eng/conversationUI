import { GoogleGenAI, Type, Tool } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';
import { spawn } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import dotenv from 'dotenv';
import { ShapeSignature } from '../types';
import { runQueryWithMeta, qualifiedTable } from '../lib/bigqueryClient';
import { DATA_SOURCES, ALL_DOMAINS, ALL_TABLES, getSourcesByDomain, getAnglesByDomain, findAnglesByLabel } from './dataSourceMap';
import { loadCatalogContext } from './catalogRefresher';
import { OutputMode } from '../registry/componentRegistry';
import { isValidOutputMode, withOutputModeHint } from './outputMode';
// Phase 3: grounding pack replaces the full-catalog injection when KAG is active.
import { resolveGroundingContext } from '../kag/kagGrounding';
// Semantic net under DRAW_INTENT_RE — consulted only when the regex has nothing to say.
import { classifyIntent, AskFn, IntentKind } from './drawIntentClassifier';

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
  | {
      action: 'route';
      table: string;
      intent: 'trend' | 'comparison' | 'metric_by_dimension';
      outputMode?: OutputMode;
      /**
       * Set when this route is serving a DRAWING request. Carries the signal that
       * DRAW_INTENT_RE found (fast path) or that the analyze LLM reported (safety net)
       * out to the pipeline, which needs it to pick an output mode whose allowed
       * components include the artifact types — see outputMode.ts.
       */
      drawKind?: 'svg' | 'html';
    };

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

// ── Thinking-model token budgeting ───────────────────────────────────────────
//
// MODEL is a THINKING model — the Google AI model metadata for gemma-4-31b-it
// literally reports `"thinking": true`. Its maxOutputTokens covers REASONING tokens
// AND the answer, but every call site here sized its budget for the ANSWER alone.
//
// That is not a tuning nit, it is a hard failure: reasoning costs hundreds to
// thousands of tokens (measured 125 on the smallest prompt in this file, 2155 on a
// routing prompt). analyzeQuery asked for 768; the model spent all 768 thinking,
// finished with MAX_TOKENS, and emitted NO answer — so `response.text` was ''.
// Three frames later JSON.parse('') threw "Unexpected end of JSON input" and the
// user saw "I encountered an error generating the report." classifyFollowUpIntent's
// 128-token budget could never have returned anything at all.
//
// Raising the cap is close to free: you are billed for tokens GENERATED, not for the
// ceiling, and reasoning does not inflate to fill the room (measured: ~230-320
// thinking tokens whether the cap was 512 or 3072). The clamp is the model's own
// declared outputTokenLimit.
const MODEL_OUTPUT_TOKEN_LIMIT = 32_768;

function withThinkingHeadroom(answerTokens: number): number {
  return Math.min(Math.max(answerTokens * 4, 4096), MODEL_OUTPUT_TOKEN_LIMIT);
}

/**
 * Read the text off a Gemma response, refusing an empty one.
 *
 * When reasoning exhausts the budget the API returns 200 with no text part at all.
 * Every caller in this file then runs JSON.parse on '' and reports a JSON syntax
 * error — which names neither the model, nor the budget, nor the real cause, and
 * sent this exact bug to a user as a generic "error generating the report". Fail
 * here instead, carrying the numbers needed to size the budget correctly.
 */
function requireText(response: any, label: string): string {
  const text = response?.text ?? '';
  if (text.trim()) return text;
  const finish = response?.candidates?.[0]?.finishReason;
  const usage = response?.usageMetadata ?? {};
  throw new Error(
    `${MODEL} returned no text for ${label} — finishReason=${finish}, ` +
    `thinking=${usage.thoughtsTokenCount ?? 0} tokens, answer=${usage.candidatesTokenCount ?? 0} tokens` +
    (finish === 'MAX_TOKENS' ? '. Reasoning consumed the entire output budget; raise maxOutputTokens.' : ''),
  );
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
//   'sonnet' → client users   → Anthropic Claude. Transport chosen at call time:
//              ANTHROPIC_API_KEY set → API SDK (fast, cached); else the `claude` CLI.
// NOTE: the provider key is still named 'sonnet' for frontend compatibility, but the
// underlying model is now Opus 4.8 (SONNET_API_MODEL / SONNET_MODEL below). Override
// either env var to pin a different model without touching code.
export type LLMProvider = 'gemma' | 'sonnet';

const SONNET_MODEL = process.env.SONNET_MODEL || 'opus'; // CLI alias for latest Opus

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
/**
 * Find a `claude` binary this process can actually spawn.
 *
 * WHY THIS IS NOT JUST `'claude'`. On Windows, `npm i -g @anthropic-ai/claude-code`
 * installs SHIMS — `claude` (a sh script), `claude.cmd` and `claude.ps1`. None of
 * them is an executable image, and Node's spawn() goes through CreateProcess, which
 * cannot run a .cmd/.ps1 without a shell. So `spawn('claude')` fails with
 * `ENOENT` even when `claude` works perfectly in the developer's terminal — which is
 * exactly how every 'sonnet' request died with "I encountered an error generating the
 * report" while the CLI looked healthy from the command line.
 *
 * The VS Code extension ships a REAL executable (claude.exe), so prefer that. Passing
 * a shell isn't an option here: the args carry an arbitrary system prompt, and routing
 * that through cmd.exe quoting is a correctness and injection hazard.
 *
 * Resolution order — first hit wins, result cached for the process:
 *   1. CLAUDE_CLI_PATH, if it points at something that exists (explicit override).
 *   2. Newest anthropic.claude-code-* VS Code extension's native-binary/claude.exe.
 *   3. claude.exe on PATH.
 *   4. 'claude' — correct on macOS/Linux, and the honest last resort elsewhere.
 */
let _claudeCli: string | null = null;

function resolveClaudeCli(): string {
  if (_claudeCli) return _claudeCli;

  const pinned = process.env.CLAUDE_CLI_PATH?.trim();
  if (pinned) {
    if (existsSync(pinned)) return (_claudeCli = pinned);
    console.warn(`[Sonnet CLI] CLAUDE_CLI_PATH is set but does not exist: ${pinned}`);
  }

  if (process.platform === 'win32') {
    const extRoot = join(homedir(), '.vscode', 'extensions');
    try {
      const candidates = readdirSync(extRoot)
        .filter((d) => d.startsWith('anthropic.claude-code-'))
        // Sort by version descending so a stale older extension never wins.
        .sort((a, b) => {
          const ver = (s: string) => (s.match(/(\d+)\.(\d+)\.(\d+)/) ?? []).slice(1).map(Number);
          const [x, y] = [ver(a), ver(b)];
          for (let i = 0; i < 3; i++) if ((y[i] ?? 0) !== (x[i] ?? 0)) return (y[i] ?? 0) - (x[i] ?? 0);
          return 0;
        })
        .map((d) => join(extRoot, d, 'resources', 'native-binary', 'claude.exe'));
      const found = candidates.find(existsSync);
      if (found) {
        console.log(`[Sonnet CLI] using VS Code extension binary: ${found}`);
        return (_claudeCli = found);
      }
    } catch { /* no extensions dir — fall through */ }

    for (const dir of (process.env.PATH ?? '').split(';')) {
      if (!dir.trim()) continue;
      const exe = join(dir.trim(), 'claude.exe');
      if (existsSync(exe)) {
        console.log(`[Sonnet CLI] using claude.exe from PATH: ${exe}`);
        return (_claudeCli = exe);
      }
    }

    console.warn(
      '[Sonnet CLI] No spawnable claude.exe found. The npm shims (claude.cmd/.ps1) ' +
      'cannot be spawned without a shell — set CLAUDE_CLI_PATH to a real executable.',
    );
  }

  return (_claudeCli = 'claude');
}

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
    // The `claude` binary is often NOT on PATH for a server process — the VS Code
    // extension ships it at
    //   ~/.vscode/extensions/anthropic.claude-code-<ver>-<plat>/resources/native-binary/claude.exe
    // and nothing adds that directory to PATH. Depending on ambient PATH also makes
    // behaviour differ by which terminal started the backend, which is how this broke
    // once already. CLAUDE_CLI_PATH pins it explicitly; 'claude' remains the default.
    const cliPath = resolveClaudeCli();
    const child = spawn(cliPath, args, { stdio: ['pipe', 'pipe', 'pipe'], env: childEnv });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('error', err => reject(new Error(
      `Sonnet CLI spawn failed: ${err.message} (tried "${cliPath}"). ` +
      'Is the `claude` CLI installed and logged in? On Windows the npm shims ' +
      '(claude.cmd/.ps1) are not spawnable — point CLAUDE_CLI_PATH at a real claude.exe.',
    )));
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

const SONNET_API_MODEL = process.env.SONNET_API_MODEL || 'claude-opus-4-8';

// Opus 4.8 / 4.7, Sonnet 5, and Fable 5 REJECT temperature/top_p/top_k with a 400 —
// steering is done via the prompt instead. Older models (Sonnet 4.6 and earlier) still
// accept them. Omitting temperature is valid on every model, so we only send it when the
// pinned model is one of the legacy sampling-capable ones.
function modelAcceptsSampling(model: string): boolean {
  return /sonnet-4-6|sonnet-4-5|opus-4-6|opus-4-5|opus-4-1|opus-4-0|haiku|sonnet-4-0/i.test(model);
}

// Fast Mode: same Opus model at up to 2.5x output tokens/sec, at premium pricing.
// Research preview, Opus 4.8/4.7 only, first-party Anthropic API only. Opt-in via
// SONNET_FAST_MODE so it never silently bills premium rates — set it to 1 to enable.
function fastModeEnabled(model: string): boolean {
  const on = /^(1|true|on|yes)$/i.test(process.env.SONNET_FAST_MODE || '');
  return on && /opus-4-(7|8)/i.test(model);
}

async function generateViaAPI(opts: GenOpts): Promise<string> {
  const client = getAnthropic();
  const model = SONNET_API_MODEL;
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: opts.maxOutputTokens ?? 2048,
    system: [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: opts.user }],
  };
  if (opts.temperature !== undefined && modelAcceptsSampling(model)) {
    params.temperature = opts.temperature;
  }

  const msg = fastModeEnabled(model)
    ? await client.beta.messages.create({ ...params, speed: 'fast', betas: ['fast-mode-2026-02-01'] })
    : await client.messages.create(params);

  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');
}

// Transport for the Claude ('sonnet' key) provider. Default is the `claude` CLI
// running Opus (SONNET_MODEL='opus') on the user's OAuth/subscription login — this is
// the intended path. The API SDK is only used when the operator explicitly opts in
// with SONNET_USE_API=1 AND an ANTHROPIC_API_KEY is present; otherwise we always use
// the CLI (even if a key happens to be in the env for other features).
function useSonnetApi(): boolean {
  const optedIn = /^(1|true|on|yes)$/i.test(process.env.SONNET_USE_API || '');
  return optedIn && !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim());
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
  facts?: string[];           // ground truth measured from the rendered chart
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
    '- A scene\'s "facts" are measured directly from the chart the viewer is looking at. They OUTRANK everything else. Any superlative you use (highest, lowest, leads, peaks, best performer) and any figure you attribute to a named item must agree with that scene\'s facts.\n' +
    '- Describe only the scene you are on. Never name an item as the leader or the laggard unless that scene\'s facts say so — the viewer is watching that chart while you speak, and naming a different one makes the voiceover contradict the screen.\n' +
    '- Write for text-to-speech: spell months in full (say "April", never "Apr" or "A P R"); say "percent" and "dollars"; expand or drop codes and abbreviations (e.g. say "territory nine", not "T-009"; never read "(APR)" as letters).\n' +
    '- Vary sentence openings; keep it warm and confident, not robotic.';

  const user = JSON.stringify({
    title: meta.title ?? 'Report',
    description: meta.description ?? '',
    scenes: scenes.map((s, i) => ({ scene: i + 1, kind: s.kind, heading: s.heading, onScreen: s.onScreen, facts: s.facts, dataHint: s.dataHint })),
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
      maxOutputTokens: withThinkingHeadroom(opts.maxOutputTokens ?? 2048),
      responseMimeType: 'application/json',
      systemInstruction: opts.system,
    },
    contents: [{ role: 'user', parts: [{ text: opts.user }] }],
  });
  return requireText(response, 'modelGenerate');
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

// Explicit request to DRAW a structural diagram or WRITE a formatted document —
// the rich-artifact tiers (mermaid-artifact / svg-artifact / html-artifact). Kept in
// lockstep with the "USE WHEN" lists in the generateReport artifact guidance below.
// Returns 'svg' for any drawing request and 'html' for a document request; the choice
// BETWEEN mermaid-artifact and svg-artifact is made by the model in the report prompt,
// so this only needs to distinguish "draw something" from "write something".
// Deliberately tight: a plain data question ("network latency by region") that merely
// COULD be drawn must NOT match — only explicit draw/sketch/write intent does.
//
// NAMED "<noun> flow" PHRASES, not a bare `flow`. Users type the structure they want
// without ever using a verb — "contact center call escalation flow" was a real request
// that produced a narrative paragraph instead of a diagram, because only
// "escalation PATH" was listed here. A bare /\bflow\b/ would fix that case and break
// two others that must stay negative: "cash flow by month" and "flow rate by device
// group" are measures, not structures. So each qualifier is enumerated, and every one
// of them has a test case in scripts/test_drawIntent.ts.
// `sequence of|when` is enumerated for the same reason as the flow phrases above, and
// from the same kind of real miss: "show me the sequence when a report is generated"
// returned prose. A bare /\bsequence\b/ would be wrong — "sequence number by outlet" is
// a column, not a structure — so the qualifier carries the intent, never the noun alone.
// Deliberately NOT added: "visualise"/"visualize"/"chart out". Users reach for those for
// ORDINARY CHARTS far more often than for structural diagrams, and a false positive here
// is expensive — it forces outputMode to `narrative`, which drops the chart families the
// question actually wanted. Those phrasings are covered by the LLM net in analyzeQuery
// instead, which can read the sentence rather than pattern-match a verb.
const DRAW_INTENT_RE = /\b(draw|sketch|diagram|topology|flow\s?chart|process\s+diagram|architecture\s+(?:diagram|map)|escalation\s+(?:path|flow)|(?:call|routing|process|approval|onboarding)\s+flow|customer\s+journey|state\s+machine|org(?:anisation|anization)?\s+chart|data\s+lineage|dependency\s+(?:map|graph)|map\s+(?:the|out)\b.*\b(?:architecture|topology|flow|network)|how\s+(?:does|do)\s+.+\bconnect|flow\s+of\b|sequence\s+(?:of|when)\b)/i;
const DOC_INTENT_RE = /\b(write\s+(?:a|me|up)\b.*\b(brief|memo|write-?up|one-?pager|document|report)|formatted\s+document|write-?up\s+with\s+headings|one-?pager|memo\b|document\s+with\s+(?:sections|headings))/i;
// STRUCTURE-OF-DATA questions — a different question shape from DRAW_INTENT_RE above.
//
// DRAW_INTENT_RE asks for a PROCESS (escalation flow, customer journey): structure that
// exists nowhere in our data, so the model must invent it and wants real measured values
// in the labels. These ask about the SHAPE OF THE WAREHOUSE — what feeds what, which
// table backs which report. That answer is already held exactly in KAG, so it is served
// deterministically from the graph with no model in the loop (see kag/structureDiagram).
//
// Enumerated, like DRAW_INTENT_RE, and for the same reason. The negatives that must stay
// negative are ordinary data questions that happen to share a noun: "revenue by data
// centre" is not a schema request, and "what feeds the top territories" is about values.
// Each phrasing below has a case in scripts/test_structureDiagram.ts.
const STRUCTURE_INTENT_RE = new RegExp(
  [
    /\b(?:data\s+model|schema)\b/,                     // "show me the schema", "the data model"
    /\bkag\b.*\bgraph\b|\bknowledge\s+graph\b/,        // "show me the KAG graph"
    /\bwhat\s+feeds\s+(?:in)?to\b/,                    // "what feeds into take rate"
    /\bhow\s+is\s+the\s+data\s+(?:organi[sz]ed|structured|modell?ed)\b/,
    /\bwhere\s+does\s+.+\bcome\s+from\b/,              // "where does take rate come from"
    /\b(?:table|column|field)s?\s+behind\b/,           // "the tables behind this report"
  ].map((r) => r.source).join('|'),
  'i',
);

/**
 * True when the user is asking about the structure of the DATA itself, which KAG can
 * answer exactly. Checked BEFORE detectDrawingIntent by callers that support the
 * deterministic path, because "show me the data lineage for take rate" satisfies both
 * and the graph-sourced answer is the better one — no LLM, no hallucinated columns.
 */
export function detectStructureIntent(texts: string[]): boolean {
  const joined = texts.join(' ');
  // "data lineage" lives in DRAW_INTENT_RE for historical reasons and is genuinely a
  // structure question, so it counts here too rather than being duplicated there.
  return STRUCTURE_INTENT_RE.test(joined) || /\bdata\s+lineage\b/i.test(joined);
}

export function detectDrawingIntent(texts: string[]): 'svg' | 'html' | null {
  const joined = texts.join(' ');
  if (DRAW_INTENT_RE.test(joined)) return 'svg';
  if (DOC_INTENT_RE.test(joined)) return 'html';
  return null;
}

/**
 * Provider-neutral outcome of the rich-artifact fast-path.
 *
 * `null` means "no drawing/writing intent — carry on with normal routing".
 */
export type DrawingRoute =
  | { action: 'generate'; table: string; drawKind: 'svg' | 'html' }
  | { action: 'clarify'; question: string; options: string[]; drawKind: 'svg' | 'html' }
  | null;

/**
 * Rich-artifact fast-path (draw a diagram / write a document).
 *
 * Explicit drawing/writing language is a SUPPORTED request the report layer renders as
 * a mermaid-/svg-/html-artifact. Without this, an LLM front-door can pick "answer" and
 * politely decline ("that's outside what I can build"), or fall through to a bare-domain
 * report menu — either way the artifact never generates. Route straight to generation
 * when a domain is known so it renders on the FIRST turn; if the domain is still
 * unknown, ask for it deterministically (a menu) rather than letting the model refuse.
 *
 * WHY THIS IS A SHARED FUNCTION rather than a block inside sonnetRespond, where it
 * used to live: it was Sonnet-only, and `internal` logins resolve to Gemma
 * (see getAuthUsers in index.ts). So the provider most people were actually using had
 * no safety net at all — "draw a sequence diagram of how a contact center call gets
 * escalated" came back as a "Which report would you like to see?" menu with zero
 * component events. Measured, not inferred. Both front doors now call this.
 *
 * PURE apart from the data-source lookups, and those fall back to the full catalog
 * before the availability probe completes — so it is unit-testable with no BigQuery
 * and no LLM. See scripts/test_drawIntent.ts.
 */
export function resolveDrawingRoute(allTexts: string[]): DrawingRoute {
  const drawKind = detectDrawingIntent(allTexts);
  if (!drawKind) return null;
  return routeForDrawKind(allTexts, drawKind);
}

/**
 * The routing half of resolveDrawingRoute, once the KIND is already decided.
 *
 * Split out so the regex path and the classifier path cannot drift: whichever decides
 * that a diagram was asked for, the table/clarify choice below is the same code.
 */
function routeForDrawKind(allTexts: string[], drawKind: 'svg' | 'html'): DrawingRoute {
  const available = getAvailableDataSources();
  const availableTables = new Set(available.map(s => s.table));
  const { domain: knownDomain } = extractContextFromText(allTexts);

  if (knownDomain) {
    const domainSources = available.filter(s => s.domain.toLowerCase() === knownDomain.toLowerCase());
    const table = domainSources[0]?.table
      ?? getAnglesByDomain(knownDomain).find(a => availableTables.has(a.table))?.table;
    if (table) return { action: 'generate', table, drawKind };
  }

  const drawDomains = [...new Set(available.map(s => s.domain))];
  if (drawDomains.length === 1) {
    const only = available.find(s => s.domain === drawDomains[0]);
    if (only) return { action: 'generate', table: only.table, drawKind };
  }

  return {
    action: 'clarify',
    question: `Sure — I can ${drawKind === 'svg' ? 'draw that' : 'write that up'}. Which area should it cover?`,
    options: drawDomains,
    drawKind,
  };
}

// ── Semantic intent resolution (regex fast path + model fallback) ─────────────

/** One LLM call, provider-shaped, for the intent classifier to borrow. */
function askFor(provider: LLMProvider): AskFn {
  return async (system, user) => {
    if (provider === 'sonnet') {
      return generateViaCLI({ system, user, temperature: 0, maxOutputTokens: 256 });
    }
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: MODEL,
      config: {
        temperature: 0,
        // withThinkingHeadroom because MODEL is a thinking model and a 256-token budget
        // would be spent entirely on reasoning, returning no answer at all — the exact
        // failure documented above requireText.
        maxOutputTokens: withThinkingHeadroom(256),
        responseMimeType: 'application/json',
        systemInstruction: system,
      },
      contents: [{ role: 'user', parts: [{ text: user }] }],
    });
    return stripThinkTags(requireText(response, 'classifyIntent'));
  };
}

export interface IntentResolution {
  /** Artifact kind to draw/write, or null for an ordinary data question. */
  draw: 'svg' | 'html' | null;
  /** True when the question is about the shape of the warehouse (the KAG path). */
  structure: boolean;
  /** 'regex' when the enumerated patterns decided it, 'model' when they missed. */
  source: 'regex' | 'model' | 'cache' | 'none';
  why?: string;
}

/**
 * What is this user asking for? Regex first, model only on a miss.
 *
 * The ordering is the whole design. DRAW_INTENT_RE / STRUCTURE_INTENT_RE stay
 * authoritative for every phrasing they enumerate — free, instant, and pinned by
 * test_drawIntent.ts — so this adds no latency to the requests that already worked. The
 * classifier exists for the long tail those lists cannot enumerate, which used to fall
 * through to a text answer with no error anywhere (see drawIntentClassifier.ts).
 *
 * Structure is checked before drawing for the same reason the pipeline does: "show me
 * the data lineage for take rate" satisfies both, and the graph-sourced answer is exact
 * where a model-drawn one would be invented.
 */
export async function resolveIntent(
  texts: string[],
  provider: LLMProvider = 'gemma',
  // Test seam. The regex half of this function is pure, but the fallback is not, and the
  // branches worth pinning are the failure ones — timeout, unparseable output, unknown
  // label. Injecting `ask` lets scripts/test_drawIntent.ts drive all of them with no
  // network and no API key, the same way the drawing route is testable with no BigQuery.
  ask: AskFn = askFor(provider),
): Promise<IntentResolution> {
  if (detectStructureIntent(texts)) return { draw: null, structure: true, source: 'regex' };
  const regexDraw = detectDrawingIntent(texts);
  if (regexDraw) return { draw: regexDraw, structure: false, source: 'regex' };

  const verdict = await classifyIntent(texts, ask);
  const source = verdict.source === 'cache' ? 'cache' : verdict.kind === 'none' ? 'none' : 'model';
  if (verdict.kind !== 'none') {
    console.log(`[intent] regex missed → model says ${verdict.kind}${verdict.why ? ` (${verdict.why})` : ''} for "${(texts[texts.length - 1] ?? '').slice(0, 80)}"`);
  }

  return {
    draw: verdict.kind === 'diagram' ? 'svg' : verdict.kind === 'document' ? 'html' : null,
    structure: verdict.kind === 'structure',
    source: source as IntentResolution['source'],
    why: verdict.why,
  };
}

// NO `resolveDrawingRouteSmart` / `detectStructureIntentSmart` wrappers here, and that is
// a decision rather than an omission. Both existed briefly and were removed: putting the
// classifier in front of the FRONT DOOR means every ordinary data question pays a
// classification (measured ~8s) to be told what it already was, since every ordinary
// question is a regex miss. analyzeQuery's `diagram` field already covers that case for
// free, off a call it was making anyway. The classifier earns its cost in exactly one
// place — recoverDrawRequest, below, where the fast path returns before any LLM call runs
// and the request would otherwise be lost in silence.

/** How many individual earlier turns may be classified when locating the request. */
const RECOVERY_SCAN_LIMIT = 3;

/**
 * Find the earlier turn that asked for a drawing, for the clarification-answer recovery
 * in runStreamingPipeline.
 *
 * The regex pass runs first and alone decides whenever it matches, so the recovery keeps
 * its existing, tested behaviour unchanged. Only when it finds nothing does the model
 * get asked — first over the turns TOGETHER (one call: is this conversation asking for a
 * picture at all?), and only if that says yes does it look at individual turns to find
 * which one carried the request.
 *
 * The turns are classified CONCURRENTLY, and that is a latency decision rather than a
 * style one. A classification costs ~8s against this provider (measured — see
 * CLASSIFY_TIMEOUT_MS), so the obvious sequential loop over three turns is a ~24s stall
 * on a request the user is already waiting on. In parallel the whole scan costs about one
 * classification. The scan is still capped at RECOVERY_SCAN_LIMIT newest-first, because a
 * drawing request the user has since talked past is not the one they are waiting on.
 *
 * Newest-first also cannot be skipped: the user's ANSWER to the clarifying question is
 * itself a prior turn by this point, so "the most recent turn" is usually "Contact
 * Center" and not the request. Each candidate is judged on its own.
 */
export interface RecoveredDrawRequest {
  /** The earlier wording to fold back into the query, or undefined if there is none. */
  request?: string;
  /**
   * The kind that was recovered. Carried out of here because the caller needs it for the
   * output-mode decision and re-deriving it would mean a second classification: the
   * recovered wording is by definition wording the regex cannot read.
   */
  draw: 'svg' | 'html' | null;
}

export async function recoverDrawRequest(
  priorUserTurns: string[],
  provider: LLMProvider = 'gemma',
  ask: AskFn = askFor(provider),
): Promise<RecoveredDrawRequest> {
  const turns = priorUserTurns.map((t) => String(t ?? '').trim()).filter(Boolean);
  if (!turns.length) return { draw: null };

  // Enumerated patterns: free, deterministic, and unchanged from before the classifier.
  const regexKind = detectDrawingIntent(turns);
  if (regexKind) {
    return { request: [...turns].reverse().find((t) => detectDrawingIntent([t])), draw: regexKind };
  }

  const candidates = [...turns].reverse().slice(0, RECOVERY_SCAN_LIMIT);
  const verdicts = await Promise.all(candidates.map((t) => resolveIntent([t], provider, ask)));

  // Newest-first: the first candidate that reads as a drawing request on its own.
  const i = verdicts.findIndex((v) => v.draw);
  if (i === -1) return { draw: null };

  console.log(`[intent] recovered a drawing request the regex could not see: "${candidates[i].slice(0, 80)}"`);
  return { request: candidates[i], draw: verdicts[i].draw };
}

/** Re-exported so the pipeline can log/telemeter classifier behaviour. */
export type { IntentKind };

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

  // ── Rich-artifact fast-path (draw a diagram / write a document) ──────────────
  // Shared with analyzeQuery (the Gemma front door) — see resolveDrawingRoute for why
  // this must not live in one provider's path only. "diagram"/"topology" also read as
  // report-specificity, so the bare-domain menu below is skipped.
  const draw = resolveDrawingRoute(allTexts);
  if (draw) {
    console.log(`[sonnetRespond] drawing intent (${draw.drawKind}) → ${draw.action}` +
      (draw.action === 'generate' ? ` table=${draw.table}` : '') + ` for "${query.slice(0, 80)}"`);
    return draw.action === 'generate'
      ? { action: 'generate', table: draw.table, intent: 'metric_by_dimension' }
      : { action: 'clarify', question: draw.question, options: draw.options };
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
- Requests to DRAW/SKETCH a diagram/flow/topology/map, or to WRITE a brief/memo/document/one-pager, ARE supported — the report layer renders them as rich artifacts. Treat them like any other request: "generate" when a domain+report is clear, else "clarify" the domain/report. NEVER use "answer" to say a diagram or document is unsupported or that the dataset lacks it.

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

  // Phase 3: field reference comes from the KAG grounding pack when the graph is
  // enabled, out of shadow, and confident; otherwise this resolves to the same
  // full-catalog markdown that was injected before KAG existed. The availability
  // filter is applied to the PACK, not just to the options — a probe-failed table
  // must not be described to the model at all.
  const grounding = await resolveGroundingContext(query, availableSources.map(s => s.table));
  const catalogContextSection = grounding.text ? `\n\n${grounding.text}` : '';
  console.log(`[KAG] grounding source=${grounding.source} tokens=${grounding.tokens}` +
    `${grounding.tables.length ? ` tables=[${grounding.tables.join(',')}]` : ''}` +
    `${grounding.fallbackReason ? ` reason="${grounding.fallbackReason}"` : ''}`);

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
7. Use the DATASET FIELD REFERENCE / RELEVANT DATA section to ask specific, field-aware clarification questions when relevant.
8. Requests to DRAW/SKETCH a diagram/flow/topology/map, or to WRITE a brief/memo/document/one-pager, ARE supported — the report layer renders them. Treat them like any other request: route if a domain+report is clear, else clarify the domain/report normally. NEVER answer that diagrams or documents are unsupported or that the dataset lacks them.

Respond with valid JSON only. No markdown. No code fences.
{
  "action": "route" | "clarify",
  "opener": "...",
  "question": "...",
  "options": ["...", "..."],
  "table": "...",
  "intent": "trend" | "comparison" | "metric_by_dimension",
  "diagram": true | false
}
(omit "question"/"options" if action=route; omit "table"/"intent" if action=clarify)

"diagram": set TRUE only when the user is asking to SEE A STRUCTURE — a flow, a process,
a sequence of steps, a hierarchy, a topology, how things connect — i.e. something drawn
as boxes and arrows. Set FALSE for every request about measured VALUES (totals, trends,
rankings, comparisons, breakdowns), even when the user says "show me" or "visualise".
"walk me through how a call gets escalated" → true. "visualise revenue by region" → false.`;

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

  // ── Rich-artifact fast-path (draw a diagram / write a document) ──────────────
  // The same net sonnetRespond has. It was Sonnet-only, and `internal` logins resolve
  // to Gemma — so the provider most sessions actually used sent "draw a sequence
  // diagram of how a contact center call gets escalated" into the ordinary
  // "Which report would you like to see?" menu and returned zero components.
  //
  // Placed AFTER the direct-source route (an explicitly named report still wins, which
  // is what carries the drawing request through a clarification round-trip) and BEFORE
  // the LLM call, so a drawing request never depends on the model volunteering a route.
  //
  // Deliberately the REGEX route, not the classifier one. An unenumerated phrasing is
  // caught for free by `parsed.diagram` on the LLM path below — see the note there — and
  // a classifier here would fire on every ordinary question to tell us what that field
  // already says. The gap the classifier does close is the clarification-answer turn,
  // where the fast path above returns before any LLM call: that lives in
  // recoverDrawRequest, called from runStreamingPipeline.
  const draw = resolveDrawingRoute(allTexts);
  if (draw) {
    console.log(`[analyzeQuery] drawing intent (${draw.drawKind}) → ${draw.action}` +
      (draw.action === 'generate' ? ` table=${draw.table}` : '') + ` for "${query.slice(0, 80)}"`);
    return draw.action === 'generate'
      ? { action: 'route', table: draw.table, intent: 'metric_by_dimension', drawKind: draw.drawKind }
      : { action: 'clarify', opener: '', question: draw.question, options: draw.options };
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
        // SAFETY NET for drawing intent, at zero added latency.
        //
        // DRAW_INTENT_RE is a hand-enumerated list, so its coverage is capped at what
        // someone thought to write down — and a miss is silent: the request routes
        // normally and the model narrates the diagram in prose instead of drawing it.
        // "show me the sequence when a report is generated" missed exactly that way.
        //
        // A separate classifier "only when the regex misses" would fire on EVERY
        // ordinary question, since every one of them misses. This call has already
        // happened, so reading one more field off its answer costs nothing.
        const llmDraw = parsed.diagram === true;
        if (llmDraw) console.log(`[analyzeQuery] LLM flagged drawing intent for "${query.slice(0, 80)}"`);
        console.log(`[analyzeQuery] LLM route → table: ${parsed.table}`);
        return {
          action: 'route',
          table: parsed.table,
          intent: parsed.intent ?? 'metric_by_dimension',
          outputMode: isValidOutputMode(parsed.output_mode) ? parsed.output_mode : undefined,
          drawKind: llmDraw ? 'svg' : undefined,
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
        maxOutputTokens: withThinkingHeadroom(128),
        responseMimeType: 'application/json',
        systemInstruction: system,
      },
      contents: [{ role: 'user', parts: [{ text: `USER MESSAGE: "${query}"` }] }],
    });

    const raw = requireText(response, 'classifyFollowUpIntent');
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
  mermaid-artifact { content, title?, caption?, explanation? }
    USE WHEN the request is for a STRUCTURAL diagram that is a graph of nodes and edges:
      "flow chart", "process flow", "escalation path", "sequence diagram", "state machine",
      "how does X connect to Y", "org chart", "data lineage", "dependency map".
    content = Mermaid source ONLY — no code fences, no prose, no leading blank line.
    The FIRST line MUST be exactly one of:
      flowchart TD | flowchart LR | graph TD | graph LR | sequenceDiagram | classDiagram |
      stateDiagram-v2 | erDiagram | mindmap | timeline
    Ground node labels in the real domain entities from the data sample.
    Node ids must be simple alphanumerics; put readable text in the label:
      flowchart TD
        A["Territory T-007"] --> B{"Take rate below target?"}
        B -->|Yes| C["Escalate to Region Lead"]
    FORBIDDEN, and the whole card is refused (not cleaned up) if present:
      %%{init}%% directives, click/href/call statements, and any HTML tag such as <b> or
      <br>. Arrows (-->, ->>, <|--) are fine — only tag-like "<" followed by a letter is not.
    NOT SUPPORTED, do not attempt: pie, gantt, journey, quadrantChart, sankey. Those are
      charts — use PieChart / TimelineCard / ProgressBar with real data instead.
    ALWAYS wrap label text in double quotes: A["Take rate below 60%"], not A[Take rate...].
      Quoted labels are the only form where punctuation and comparison signs are safe.
    Colours, fonts and layout are applied by the app; classDef/style/linkStyle statements
      are ignored, so do not spend tokens on them.
    PREFER mermaid-artifact over svg-artifact whenever the diagram is nodes-and-edges.
    NEVER as a substitute for a chart — measured values use BarChart/LineChart/PieChart/etc.
    A diagram shows STRUCTURE (how things connect or flow), never measured values.

  svg-artifact  { content, title?, caption?, explanation? }
    USE WHEN the drawing is a BESPOKE annotated visual that Mermaid cannot express —
      a schematic, a floor plan, a labelled illustration, a diagram with free-placed
      callouts. If the answer is a graph of boxes and arrows, use mermaid-artifact
      instead: it lays itself out, so it is far more reliable than hand-placed geometry.
    content = one self-contained static SVG document laying out that structure — labelled
    boxes/nodes connected by lines or arrows. Use a viewBox, readable <text> labels, and
    the palette #2563EB #1D9E75 #D97706 #7C3AED on #EFF6FF/#F0FDF4/#FEF3C7 fills.
    Ground the labels in the real domain entities from the data sample where relevant.
    NEVER as a substitute for a chart — any x/y, categorical, time-series or share-of-whole
    DATA must use BarChart/LineChart/AreaChart/PieChart/etc. A diagram shows STRUCTURE
    (how things connect or flow), never measured values.
    DECISIVE: when the request explicitly uses drawing language (draw / sketch / diagram /
    map / topology / flow), an artifact IS the answer — mermaid-artifact for a
    nodes-and-edges graph, svg-artifact otherwise. Build the structure from the domain
    entities (e.g. territories or nodes as boxes) and DO NOT fall back to a chart
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

  All THREE artifact types render sandboxed with scripts disabled.
  For svg-artifact and html-artifact, content MUST be static markup only: no <script>,
  no on* event handlers, no style="" attributes, no javascript:/data: URIs, no external
  resource loads. Such content is stripped and the card downgrades to plain text.
  Use SVG presentation attributes (fill=, stroke=) rather than style="".
  For mermaid-artifact, content is diagram SOURCE and contains no markup at all; a
  forbidden construct refuses the whole card rather than being cleaned up.
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

/**
 * Told, not inferred.
 *
 * REPORT_SYSTEM_PROMPT's mermaid-artifact entry lists the phrasings that should produce a
 * diagram — "process flow", "escalation path", "sequence diagram". That list is a second,
 * independent enumeration of English, with the same blind spots as the first: measured
 * live, "the lifecycle of a support ticket" reached generation with the drawing request
 * recovered and folded back into the query, output mode overridden to `narrative`, and
 * mermaid-artifact in the allowed set — and the model STILL returned a KPI grid, a bar
 * chart and a table, because "lifecycle" is not a word on its list.
 *
 * By this point the pipeline is not guessing: the request was classified before generation
 * began. Restating that as an instruction is strictly better than hoping the generator
 * re-derives it from wording, and it means a phrasing added to nobody's list still draws.
 *
 * Deliberately NOT enforcement — generation stays a single model call whose output the
 * governor observes. If the model ignores this, the card list is what it is.
 */
function drawDirective(drawKind?: 'svg' | 'html' | null): string {
  if (drawKind === 'svg') {
    return `

DRAWING REQUEST — ALREADY ESTABLISHED. The user asked for a DIAGRAM, not a dashboard. This
was determined from their own wording before you were called; do not re-litigate it from
the query text, which a clarification round-trip may have reduced to a report name.
  • Emit exactly ONE artifact card and NO chart, KPI, ranked-list or table cards.
  • Prefer mermaid-artifact — this is a graph of nodes and edges. Reserve svg-artifact for
    a bespoke annotated drawing Mermaid genuinely cannot express.
  • Ground the node labels in real figures from the DATA SAMPLE above, so the diagram
    carries measured values rather than invented ones.`;
  }
  if (drawKind === 'html') {
    return `

DOCUMENT REQUEST — ALREADY ESTABLISHED. The user asked for a formatted written document,
not a dashboard. Emit exactly ONE html-artifact card with real headings and prose, and no
chart or KPI cards. Ground every figure in the DATA SAMPLE above.`;
  }
  return '';
}

export async function generateReport(
  query: string,
  shape: ShapeSignature,
  sampleRows: any[],
  priorContext?: string,
  provider: LLMProvider = 'gemma',
  outputMode?: OutputMode,   // Phase 2: inert — logged for observability, never enforced
  // Set when the request has ALREADY been established as a drawing/writing request, by
  // the enumerated patterns or by the classifier. See DRAW_DIRECTIVE for why telling the
  // generator beats leaving it to re-read the wording.
  drawKind?: 'svg' | 'html' | null,
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

Design the best response to this query. Use EXACT_COLUMNS for all key fields. Respond with JSON only.${drawDirective(drawKind)}`;

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
        maxOutputTokens: withThinkingHeadroom(4000),
        responseMimeType: 'application/json',
        systemInstruction: EDIT_REPORT_SYSTEM_PROMPT,
      },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    });

    const raw = requireText(response, 'editReport');
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
        maxOutputTokens: withThinkingHeadroom(2048),
        responseMimeType: 'application/json',
        systemInstruction: system,
      },
      contents: messages,
    });
    raw = requireText(response, 'callLLM');
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
