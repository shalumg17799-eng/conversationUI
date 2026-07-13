import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { runPipeline } from './pipeline/runPipeline';
import { runStreamingPipeline } from './pipeline/runStreamingPipeline';
import { BigQueryService } from './services/bigqueryService';
import { callLLM, probeTableAvailability, resolveProvider, polishNarrationLines, writeVideoNarration } from './services/llmHandler';
import { refreshCatalog } from './services/catalogRefresher';
import { getOutputModeSummary, resetOutputModeMetrics } from './services/outputModeTelemetry';
import { getValidationSummary, resetValidationMetrics } from './services/validationTelemetry';
import { getConstraintSummary, resetConstraintMetrics } from './services/constraintTelemetry';
import { getGovernorSummary, resetGovernorMetrics } from './services/governorTelemetry';
import { createJob, getJob, listJobs, cancelJob, deleteJob, videoPath, loadPersistedJobs, AUDIO_ROOT, VIDEO_ROOT, FOOTAGE_ROOT } from './services/videoJobs';
import { warmupRenderer } from './services/videoRenderer';
import { ttsEnabled } from './services/ttsService';
import { getLatestRelease, releasesDir } from './releaseNotes/releaseStore';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Allowed CORS origin — set FRONTEND_ORIGIN in production to the frontend URL. Defaults to '*' for dev.
const ALLOWED_ORIGIN = process.env.FRONTEND_ORIGIN || '*';

// Video render payloads (the compiled script incl. chart data) can be large.
app.use(express.json({ limit: '15mb' }));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
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
  return res.json({ success: true, role: match.role, provider: match.provider });
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

// Latest release note for the login-time "what's new" badge. Public, like the
// other /api routes (the app gates access client-side after login).
app.get('/api/releases/latest', async (_req: Request, res: Response) => {
  try {
    const latest = await getLatestRelease();
    if (!latest) return res.status(204).end(); // none published yet
    res.json(latest);
  } catch (e: any) {
    res.status(500).json({ error: (e?.message ?? 'failed to read releases').toString().slice(0, 200) });
  }
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

// Manual catalog refresh endpoint (admin/debug use)
app.post('/api/catalog/refresh', async (_req: Request, res: Response) => {
  try {
    await refreshCatalog();
    res.json({ success: true, message: 'Catalog refreshed successfully' });
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

app.listen(port, () => {
  console.log(`Backend listening at http://localhost:${port}`);

  // Refresh catalog and probe table availability on startup
  refreshCatalog().catch(err => console.error('[Startup] Catalog refresh failed:', err));
  probeTableAvailability().catch(err => console.error('[Startup] Table availability probe failed:', err));

  // Video: rebuild the library from disk and pre-bundle the Remotion composition
  // so the first user render doesn't pay the bundling cost.
  loadPersistedJobs().catch(err => console.error('[Startup] Video library load failed:', err));
  warmupRenderer();
  if (!ttsEnabled()) console.warn('[Startup] ELEVENLABS_API_KEY not set — report videos will render WITHOUT narration.');
  setInterval(() => {
    refreshCatalog().catch(err => console.error('[Scheduler] Catalog refresh failed:', err));
  }, 24 * 60 * 60 * 1000);
});
