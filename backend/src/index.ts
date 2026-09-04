import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { runPipeline } from './pipeline/runPipeline';
import { runStreamingPipeline } from './pipeline/runStreamingPipeline';
import { BigQueryService } from './services/bigqueryService';
import { callLLM, probeTableAvailability, resolveProvider, polishNarrationLines, writeVideoNarration } from './services/llmHandler';
import {
  getPrefs as getLayoutPrefs,
  savePrefs as saveLayoutPrefs,
  resetPrefs as resetLayoutPrefs,
  DEFAULT_PREFS as LAYOUT_DEFAULT_PREFS,
} from './services/layoutPrefsStore';
import { refreshCatalog } from './services/catalogRefresher';
import { getOutputModeSummary, resetOutputModeMetrics } from './services/outputModeTelemetry';
import { getValidationSummary, resetValidationMetrics } from './services/validationTelemetry';
import { getConstraintSummary, resetConstraintMetrics } from './services/constraintTelemetry';
import { getGovernorSummary, resetGovernorMetrics } from './services/governorTelemetry';
import { getLayoutSummary, resetLayoutMetrics } from './services/layoutDirectiveTelemetry';
import { KAG_CONFIG, isKagConfigured } from './kag/config';
import { verifyConnectivity, hasApocPathExpand, closeDriver, warmUpIndexes } from './kag/neo4jClient';
import { applySchema, getGraphStats } from './kag/schema';
import { getKagSummary, resetKagMetrics } from './kag/kagTelemetry';
import { refreshKagGraph } from './kag/kagRefresh';
import { retrieve, getBreakerState, warmRetrieval } from './kag/kagRetriever';
import { buildGroundingPack } from './kag/groundingPack';
import { assembleGraph } from './kag/kagBuilder';
import { graphToMermaid } from './kag/graphToMermaid';
import type { KagNodeType, KagRelType } from './kag/types';
import { createJob, getJob, listJobs, cancelJob, deleteJob, videoPath, loadPersistedJobs, AUDIO_ROOT, VIDEO_ROOT, FOOTAGE_ROOT } from './services/videoJobs';
import { warmupRenderer } from './services/videoRenderer';
import { ttsEnabled } from './services/ttsService';
import { getLatestRelease, listReleaseSummaries, listReleasesFull, releasesDir } from './releaseNotes/releaseStore';
import { startPublish, getPublishJob } from './releaseNotes/publishRelease';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Allowed CORS origin — set FRONTEND_ORIGIN in production to the frontend URL. Defaults to '*' for dev.
const ALLOWED_ORIGIN = process.env.FRONTEND_ORIGIN || '*';

// Video render payloads (the compiled script incl. chart data) can be large.
app.use(express.json({ limit: '15mb' }));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  // X-User-Id carries the layout-prefs identity; PUT is used by /api/layout-prefs.
  // Both are required here or the browser blocks the preflight before the route runs.
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-User-Id');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/', (_req: Request, res: Response) => {
  res.json({ message: 'Generative UI Analytical Engine is running' });
});

// Access-gate verification — two user roles, each bound to an LLM provider.
// Credentials live only in backend env, never shipped to the client.
//   internal user → Gemma API
//   client user   → Sonnet (via the `claude` CLI for now)
// Legacy single-password (ACCESS_PASSWORD) still works and maps to the internal role.
interface AuthUser { username?: string; password?: string; role: 'internal' | 'client'; provider: 'gemma' | 'sonnet'; }

function getAuthUsers(): AuthUser[] {
  const users: AuthUser[] = [
    {
      username: process.env.INTERNAL_USERNAME,
      password: process.env.INTERNAL_PASSWORD || process.env.ACCESS_PASSWORD,
      role: 'internal',
      provider: 'gemma',
    },
    {
      username: process.env.CLIENT_USERNAME,
      password: process.env.CLIENT_PASSWORD,
      role: 'client',
      provider: 'sonnet',
    },
  ];
  // Only keep users that have a password configured.
  return users.filter(u => !!u.password);
}

app.post('/api/auth/verify', (req: Request, res: Response) => {
  const { username, password } = req.body ?? {};
  const users = getAuthUsers();
  if (users.length === 0) {
    return res.status(500).json({ success: false, error: 'No login credentials configured (set INTERNAL_/CLIENT_ USERNAME + PASSWORD).' });
  }

  const match = users.find(u =>
    u.password === password &&
    // If a username is configured for this user it must match; otherwise password alone suffices (legacy).
    (!u.username || u.username === username)
  );

  if (!match) return res.json({ success: false });
  // userId is the stable per-user key for server-side preferences. Username when one
  // is configured, else the role — the legacy password-only login has no username, and
  // silently bucketing those users together under "default" would let one person's
  // layout leak into another's.
  const userId = match.username || match.role;
  return res.json({ success: true, role: match.role, provider: match.provider, userId });
});

// ── Adaptive UI — per-user layout preferences ────────────────────────────────
// The frontend keeps a localStorage cache for instant paint; THIS is the source of
// truth, so a layout follows the user across sessions and devices.
//
// Identity comes from the X-User-Id header, set by the frontend from the userId the
// login response returned. That is deliberately not a security boundary — this app's
// auth is a shared-credential gate, and layout prefs are non-sensitive UI state. What
// it does guarantee is ISOLATION: two different users never read or write each
// other's layout. Requests without an id are refused rather than silently pooled.
function layoutUserId(req: Request): string | null {
  const raw = req.header('X-User-Id');
  const id = typeof raw === 'string' ? raw.trim() : '';
  return id ? id.slice(0, 64) : null;
}

app.get('/api/layout-prefs', async (req: Request, res: Response) => {
  const userId = layoutUserId(req);
  if (!userId) return res.status(401).json({ error: 'missing X-User-Id' });
  try {
    const prefs = await getLayoutPrefs(userId);
    // null => this user has never saved; the client falls back to its own defaults.
    res.json({ prefs, defaults: LAYOUT_DEFAULT_PREFS });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? 'failed to read layout prefs' });
  }
});

app.put('/api/layout-prefs', async (req: Request, res: Response) => {
  const userId = layoutUserId(req);
  if (!userId) return res.status(401).json({ error: 'missing X-User-Id' });
  try {
    // savePrefs coerces every field against the bounded enums, so a hand-crafted PUT
    // cannot inject a value the contract does not allow. The coerced result is echoed
    // back, letting the client reconcile if anything was dropped.
    const prefs = await saveLayoutPrefs(userId, req.body?.prefs ?? req.body);
    res.json({ prefs });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? 'failed to save layout prefs' });
  }
});

app.delete('/api/layout-prefs', async (req: Request, res: Response) => {
  const userId = layoutUserId(req);
  if (!userId) return res.status(401).json({ error: 'missing X-User-Id' });
  try {
    await resetLayoutPrefs(userId);
    res.json({ prefs: null, defaults: LAYOUT_DEFAULT_PREFS });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? 'failed to reset layout prefs' });
  }
});

// SSE streaming endpoint — preferred for Generative UI
app.post('/api/conversational/stream', async (req: Request, res: Response) => {
  const { query, skipClarification, clarificationHistory, priorContext, activeTable, currentCards, conversationHistory, provider } = req.body;
  if (!query) return res.status(400).json({ error: 'Query is required' });

  const llmProvider = resolveProvider(provider);
  console.log(`[Stream] provider=${llmProvider}`);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  });

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    await runStreamingPipeline(query, send, !!skipClarification, clarificationHistory ?? [], priorContext, activeTable, currentCards, conversationHistory ?? [], llmProvider);
    send('done', { success: true });
  } catch (error: any) {
    send('error', { message: error.message || 'Internal Server Error' });
  } finally {
    res.end();
  }
});

// Non-streaming fallback
app.post('/api/conversational', async (req: Request, res: Response) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ success: false, error: 'Query is required' });

  try {
    const result = await runPipeline(query);
    res.json({ success: true, uiTree: result.uiTree });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Internal Server Error',
      uiTree: { renderType: 'Table', props: { title: 'Error' }, children: [] }
    });
  }
});

// Narration polish for the report → video feature. Takes the client's
// deterministic narration lines and returns natural spoken versions (facts
// preserved). Never fails the caller: on any error it echoes the input back so
// the video still renders with the original script.
app.post('/api/video/narration', async (req: Request, res: Response) => {
  const { lines, scenes, title, description } = req.body ?? {};
  try {
    // Preferred: full scene context → story-structured narration.
    if (Array.isArray(scenes) && scenes.length) {
      const out = await writeVideoNarration(scenes, { title, description });
      return res.json({ lines: out });
    }
    // Back-compat: line-by-line polish.
    if (!Array.isArray(lines)) return res.status(400).json({ error: 'lines[] or scenes[] required' });
    const polished = await polishNarrationLines(lines, typeof title === 'string' ? title : undefined);
    res.json({ lines: polished });
  } catch {
    res.json({ lines: Array.isArray(lines) ? lines : [] });
  }
});

// ── Report → video render jobs (backend, high quality) ─────────────────────
// Narration MP3s are served here so the Remotion renderer (headless Chrome) can
// load each scene's <Audio> during the render.
app.use('/media/audio', express.static(AUDIO_ROOT));
// Pixabay B-roll, served so the renderer can load each scene's background video.
app.use('/media/footage', express.static(FOOTAGE_ROOT));
// Finished MP4s, served for inline playback in the client video tray.
app.use('/media/videos', express.static(VIDEO_ROOT));
// "What's new" release explainer MP4s (mirrors /media/videos).
app.use('/media/releases', express.static(releasesDir()));

// Latest release (with its full features[]) for the "what's new" Help panel.
// Public, like the other /api routes (the app gates access client-side after login).
app.get('/api/releases/latest', async (_req: Request, res: Response) => {
  try {
    const latest = await getLatestRelease();
    if (!latest) return res.status(204).end(); // none published yet
    res.json(latest);
  } catch (e: any) {
    res.status(500).json({ error: (e?.message ?? 'failed to read releases').toString().slice(0, 200) });
  }
});

// All releases, FULL records (scripts, videos, overview) newest-first — powers
// the multi-version "What's New" panel where users browse every past release.
app.get('/api/releases/all', async (_req: Request, res: Response) => {
  try {
    res.json({ releases: await listReleasesFull() });
  } catch (e: any) {
    res.status(500).json({ error: (e?.message ?? 'failed to list releases').toString().slice(0, 200) });
  }
});

// All releases, lightweight (title + bullets per feature) for a "previous releases" view.
app.get('/api/releases', async (_req: Request, res: Response) => {
  try {
    res.json({ releases: await listReleaseSummaries() });
  } catch (e: any) {
    res.status(500).json({ error: (e?.message ?? 'failed to list releases').toString().slice(0, 200) });
  }
});

// Publish a release: scripts each feature, renders ONE combined overview video
// (optionally over real captured app footage), and upserts the release so the
// "What's New" modal picks it up. This is the on-publish trigger — it returns a
// job id immediately and generates the video asynchronously.
// Body: { version: string, name?: string, features: FeatureInput[], capture?: boolean }
app.post('/api/releases/publish', (req: Request, res: Response) => {
  const body = req.body ?? {};
  if (!body.version || typeof body.version !== 'string') {
    return res.status(400).json({ error: 'version (string) required' });
  }
  if (!Array.isArray(body.features) || !body.features.length || !body.features.every((f: any) => f && typeof f.title === 'string')) {
    return res.status(400).json({ error: 'features[] with at least one { title } required' });
  }
  const id = startPublish({
    version: body.version,
    name: typeof body.name === 'string' ? body.name : undefined,
    features: body.features,
    capture: body.capture,
  });
  res.json({ id, status: 'queued' });
});

// Poll a publish job's status (queued → scripting → capturing → voicing →
// rendering → ready | failed).
app.get('/api/releases/publish/:id', (req: Request, res: Response) => {
  const job = getPublishJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'not found' });
  res.json(job);
});

// Enqueue a render. Body: { script } — the compiled VideoScript from the client.
app.post('/api/video', (req: Request, res: Response) => {
  const script = req.body?.script;
  if (!script || !Array.isArray(script.scenes) || !script.scenes.length) {
    return res.status(400).json({ error: 'script with scenes[] required' });
  }
  const id = createJob(script);
  res.json({ id, status: 'queued' });
});

// List all jobs / library.
app.get('/api/videos', (_req: Request, res: Response) => res.json({ jobs: listJobs() }));

// Poll a single job's status.
app.get('/api/video/:id', (req: Request, res: Response) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'not found' });
  res.json(job);
});

// Stream / download the finished MP4.
app.get('/api/video/:id/download', (req: Request, res: Response) => {
  const job = getJob(req.params.id);
  if (!job || job.status !== 'ready') return res.status(404).json({ error: 'not ready' });
  res.download(videoPath(req.params.id), `${job.title.replace(/[^a-z0-9]+/gi, '_').slice(0, 60) || 'report'}.mp4`);
});

app.post('/api/video/:id/cancel', (req: Request, res: Response) => {
  res.json({ ok: cancelJob(req.params.id) });
});

app.delete('/api/video/:id', async (req: Request, res: Response) => {
  await deleteJob(req.params.id);
  res.json({ ok: true });
});

// BigQuery raw query endpoint
const BQ_METHODS: Record<string, (params?: any) => Promise<any[]>> = {
  markets: () => BigQueryService.getMarkets(),
  territories: () => BigQueryService.getTerritories(),
  outlets: () => BigQueryService.getOutlets(),
  devices: () => BigQueryService.getDevices(),
  salesDaily: (p) => BigQueryService.getSalesDaily(p?.dateRange),
  monthlyRollup: (p) => BigQueryService.getMonthlyRollup(p?.territoryId),
  intradaySales: (p) => BigQueryService.getIntradaySales(p?.date),
  networkKpi: (p) => BigQueryService.getNetworkKpiPoints(p?.dateRange),
  contactCenter: () => BigQueryService.getContactCenterMetrics(),
  dynamicScores: () => BigQueryService.getDynamicScores(),
  catalogReports: (p) => BigQueryService.getCatalogReports(p?.domain),
  catalogDatasets: (p) => BigQueryService.getCatalogDatasets(p?.domain),
  churnMonthly: () => BigQueryService.getChurnMonthly(),
  performanceByRegion: () => BigQueryService.getPerformanceByRegion(),
  revenueByDeviceGroup: () => BigQueryService.getRevenueByDeviceGroup(),
  dailySalesDetail: (p) => BigQueryService.getDailySalesDetail(p?.dateRange),
  monthlyTerritoryPerformance: () => BigQueryService.getMonthlyTerritoryPerformance(),
};

app.post('/api/query', async (req: Request, res: Response) => {
  const { table, params, rawSql } = req.body;

  try {
    let data: any[];

    if (rawSql) {
      data = await BigQueryService.runRawQuery(rawSql);
    } else if (table && BQ_METHODS[table]) {
      data = await BQ_METHODS[table](params);
    } else {
      return res.status(400).json({ error: `Unknown table: ${table}. Valid: ${Object.keys(BQ_METHODS).join(', ')}` });
    }

    res.json({ success: true, data, rowCount: data.length });
  } catch (error: any) {
    console.error('BigQuery error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Dual-mode chat route
// chatMode === 'llm'    → straight to Gemma (no pipeline, no BQ)
// chatMode === 'static' → keyword scripts (not implemented yet, falls through to LLM)
// default              → full pipeline (BQ + Gemma via streaming endpoint)
app.post('/api/chat', async (req: Request, res: Response) => {
  const { chatMode = 'llm', system, messages, query, provider } = req.body;

  if (!messages && !query) {
    return res.status(400).json({ error: 'messages or query required' });
  }

  const llmProvider = resolveProvider(provider);

  if (chatMode === 'static') {
    // Placeholder — static keyword flows run on frontend; this path is a passthrough
    return res.json({ success: true, message: 'Static mode: handle on frontend', cards: [], followUp: [] });
  }

  // LLM mode — call Gemma directly with provided system prompt + message history
  try {
    const systemPrompt = system || 'You are a helpful business intelligence assistant.';
    const formattedMessages = messages ?? [{ role: 'user', parts: [{ text: query }] }];

    const result = await callLLM(systemPrompt, formattedMessages, llmProvider);
    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('LLM chat error:', error);
    // 429 quota fallback
    if (error?.status === 429 || error?.message?.includes('quota')) {
      return res.status(429).json({
        success: false,
        message: "I'm receiving too many requests right now. Please try again in a moment.",
        cards: [], followUp: []
      });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// Manual catalog refresh endpoint (admin/debug use).
// Rebuilds the KAG graph from the same BigQuery schema read, so the graph and the
// markdown catalog can never disagree about physical reality.
app.post('/api/catalog/refresh', async (_req: Request, res: Response) => {
  try {
    await refreshCatalog();
    const kag = await refreshKagGraph('manual');
    res.json({ success: true, message: 'Catalog refreshed successfully', kag });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Phase 2 — output_mode observability (distribution, fallback/override/invalid rates).
app.get('/api/metrics/output-mode', (_req: Request, res: Response) => {
  res.json(getOutputModeSummary());
});
app.post('/api/metrics/output-mode/reset', (_req: Request, res: Response) => {
  resetOutputModeMetrics();
  res.json({ success: true });
});

// Phase 3 — shadow validation observability (passive; never affects rendering).
app.get('/api/metrics/validation', (_req: Request, res: Response) => {
  res.json(getValidationSummary());
});
app.post('/api/metrics/validation/reset', (_req: Request, res: Response) => {
  resetValidationMetrics();
  res.json({ success: true });
});

// Phase 4 — advisory constraint observability (passive; never affects generation).
app.get('/api/metrics/constraints', (_req: Request, res: Response) => {
  res.json(getConstraintSummary());
});
app.post('/api/metrics/constraints/reset', (_req: Request, res: Response) => {
  resetConstraintMetrics();
  res.json({ success: true });
});

// Phase 5 — governor observability (mode, change rate, retries, fallbacks, drops).
app.get('/api/metrics/governor', (_req: Request, res: Response) => {
  res.json(getGovernorSummary());
});
app.post('/api/metrics/governor/reset', (_req: Request, res: Response) => {
  resetGovernorMetrics();
  res.json({ success: true });
});

// Adaptive UI (Requirement 5): layout-directive intent telemetry.
app.get('/api/metrics/layout', (_req: Request, res: Response) => {
  res.json(getLayoutSummary());
});
app.post('/api/metrics/layout/reset', (_req: Request, res: Response) => {
  resetLayoutMetrics();
  res.json({ success: true });
});

// KAG — retrieval telemetry. `shadow.agreementRate` is the Phase 2 gate: it must
// reach 0.90 before KAG_ENABLED is turned on.
app.get('/api/metrics/kag', (_req: Request, res: Response) => {
  // `shadowMode` is the flag; `shadow` (from the summary) is the agreement data.
  res.json({ enabled: KAG_CONFIG.enabled, shadowMode: KAG_CONFIG.shadow, configured: isKagConfigured(), ...getKagSummary() });
});
app.post('/api/metrics/kag/reset', (_req: Request, res: Response) => {
  resetKagMetrics();
  res.json({ success: true });
});

// KAG — graph contents and connection health (admin/debug).
// NOTE: deliberately NO endpoint that executes arbitrary Cypher, in any environment.
// Use Neo4j Browser against the instance for ad-hoc exploration.
// KAG — inspect what retrieval returns for a query. The single most useful endpoint
// for triaging a bad route: it shows the seeds, the scored candidates, the pack the
// model would see, and whether the answer came from Neo4j, cache or the fallback.
app.get('/api/kag/retrieve', async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) return res.status(400).json({ error: 'missing ?q=' });
  if (!isKagConfigured()) return res.status(503).json({ configured: false, error: 'NEO4J_URI / NEO4J_PASSWORD not set' });

  try {
    const sub = await retrieve(q);
    const pack = buildGroundingPack(sub);
    res.json({
      query: q,
      source: sub.source,
      latencyMs: sub.latencyMs,
      truncated: sub.truncated,
      seeds: sub.seeds,
      candidateTables: sub.candidateTables,
      nodeCount: sub.nodes.length,
      edgeCount: sub.edges.length,
      pack: { text: pack.text, tokens: pack.tokens, tables: pack.tablesIncluded, clipped: pack.clipped },
      breaker: getBreakerState(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/kag/stats', async (_req: Request, res: Response) => {
  if (!isKagConfigured()) {
    return res.status(503).json({ configured: false, error: 'NEO4J_URI / NEO4J_PASSWORD not set' });
  }
  try {
    const stats = await getGraphStats();
    res.json({
      configured: true,
      enabled: KAG_CONFIG.enabled,
      shadowMode: KAG_CONFIG.shadow,
      breaker: getBreakerState(),
      ...stats,
    });
  } catch (err: any) {
    res.status(500).json({ configured: true, error: err.message });
  }
});

// KAG — the routing graph itself, serialized to Mermaid for a human to read in a
// Markdown preview or the Mermaid Live Editor. Deterministic and code-generated —
// unlike mermaid-artifact, there is no model-authored content here, so there is
// no guard to apply. Needs BigQuery/catalog access (same as `npm run kag:build`),
// NOT Neo4j — assembleGraph() builds the graph in memory, it doesn't read the
// store, so this intentionally does not gate on isKagConfigured().
app.get('/api/kag/graph.mmd', async (req: Request, res: Response) => {
  try {
    const nodeTypes = typeof req.query.nodeTypes === 'string'
      ? (req.query.nodeTypes.split(',') as KagNodeType[]) : undefined;
    const relTypes = typeof req.query.relTypes === 'string'
      ? (req.query.relTypes.split(',') as KagRelType[]) : undefined;
    const rootId = typeof req.query.root === 'string' ? req.query.root : undefined;
    const maxNodes = typeof req.query.maxNodes === 'string' ? Number(req.query.maxNodes) : undefined;

    const g = await assembleGraph(false); // false: skip the BigQuery entity scan, this is a structure view
    const mmd = graphToMermaid(g, { nodeTypes, relTypes, rootId, maxNodes });
    res.type('text/plain').send(mmd);
  } catch (err: any) {
    res.status(500).type('text/plain').send(`%% kag graph.mmd failed: ${err.message}`);
  }
});

app.listen(port, () => {
  console.log(`Backend listening at http://localhost:${port}`);

  // Refresh catalog and probe table availability on startup
  refreshCatalog().catch(err => console.error('[Startup] Catalog refresh failed:', err));
  probeTableAvailability().catch(err => console.error('[Startup] Table availability probe failed:', err));

  // Video: rebuild the library from disk and pre-bundle the Remotion composition
  // so the first user render doesn't pay the bundling cost.
  loadPersistedJobs().catch(err => console.error('[Startup] Video library load failed:', err));
  warmupRenderer();

  // KAG warmup — deliberately non-blocking and failure-tolerant. An unreachable
  // Neo4j means degraded KAG, never a failed server. The connectivity call also pays
  // the TLS handshake so the first user query does not.
  if (isKagConfigured()) {
    (async () => {
      // Retry rather than give up after one probe. Neo4j needs 20-30s to become
      // healthy from cold while this backend is listening in ~10s, so a single check
      // loses the race on every co-started stack. The old code logged "unreachable"
      // once and stopped, leaving the pool cold until a user query reconnected it --
      // and that query paid the 800ms timeout and silently fell back.
      const WARMUP_ATTEMPTS = 6;
      const WARMUP_GAP_MS = 5_000;
      let conn = await verifyConnectivity();
      for (let attempt = 2; !conn.ok && attempt <= WARMUP_ATTEMPTS; attempt++) {
        console.warn(`[Startup] KAG: Neo4j not ready (attempt ${attempt - 1}/${WARMUP_ATTEMPTS}) — retrying in ${WARMUP_GAP_MS / 1000}s`);
        await new Promise(r => setTimeout(r, WARMUP_GAP_MS));
        conn = await verifyConnectivity();
      }
      if (!conn.ok) {
        console.warn(`[Startup] KAG: Neo4j unreachable after ${WARMUP_ATTEMPTS} attempts (${conn.error}) — retrieval will fall back to the markdown catalog`);
        return;
      }
      console.log(`[Startup] KAG: connected — ${conn.version}`);
      await applySchema();
      const apoc = await hasApocPathExpand();
      if (!apoc) console.warn('[Startup] KAG: APOC path expansion unavailable — using plain-Cypher traversal');
      const stats = await getGraphStats();
      if (stats.totalNodes === 0) {
        // Self-heal rather than telling a human to run a script.
        console.warn('[Startup] KAG: graph is EMPTY — building now');
        await refreshKagGraph('startup', true);
      } else {
        console.log(`[Startup] KAG: ${stats.totalNodes} nodes, ${stats.totalRels} rels, built ${stats.builtAt}`);
      }

      // Warm the ACTUAL retrieval path, not just the connection. getServerInfo opens a
      // socket but touches no index; the first real query still pays Lucene index load
      // and page-cache warmup, which is what exceeded the 800ms budget and made the
      // first queries after a restart fall back.
      //
      // Hits the indexes DIRECTLY rather than calling retrieve(), because retrieve()
      // enforces the 800ms request-path budget — the very cost this is here to absorb.
      // Measured: a cold warm-up via retrieve() timed out at 813ms and reported
      // source=fallback-catalog, i.e. it failed at the one job it exists to do.
      // Warmup is not on a user's critical path, so it gets a generous budget instead.
      const warmMs = await warmUpIndexes() + await warmRetrieval();
      console.log(`[Startup] KAG: retrieval path warm — ${warmMs}ms`);
    })().catch(err => console.error('[Startup] KAG warmup failed (non-fatal):', err));
  } else if (KAG_CONFIG.enabled) {
    console.warn('[Startup] KAG_ENABLED=true but NEO4J_URI/NEO4J_PASSWORD are not set — KAG stays inactive');
  }

  if (!ttsEnabled()) console.warn('[Startup] ELEVENLABS_API_KEY not set — report videos will render WITHOUT narration.');
  setInterval(() => {
    refreshCatalog().catch(err => console.error('[Scheduler] Catalog refresh failed:', err));
    // The graph is rebuilt on the SAME cadence as the markdown catalog. Refreshing one
    // without the other is how the grounding layer drifts away from BigQuery unnoticed.
    refreshKagGraph('scheduler').catch(err => console.error('[Scheduler] KAG refresh failed:', err));
  }, 24 * 60 * 60 * 1000);
});

// Drain the Neo4j connection pool on shutdown so Azure restarts are clean.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    closeDriver()
      .catch(err => console.error('[Shutdown] Neo4j close failed:', err))
      .finally(() => process.exit(0));
  });
}
