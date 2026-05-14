import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { runPipeline } from './pipeline/runPipeline';
import { runStreamingPipeline } from './pipeline/runStreamingPipeline';
import { BigQueryService } from './services/bigqueryService';
import { callLLM, probeTableAvailability } from './services/llmHandler';
import { refreshCatalog } from './services/catalogRefresher';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/', (_req: Request, res: Response) => {
  res.json({ message: 'Generative UI Analytical Engine is running' });
});

// SSE streaming endpoint — preferred for Generative UI
app.post('/api/conversational/stream', async (req: Request, res: Response) => {
  const { query, skipClarification, clarificationHistory, priorContext, activeTable, currentCards, conversationHistory, analyticalContext } = req.body;
  if (!query) return res.status(400).json({ error: 'Query is required' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    await runStreamingPipeline(query, send, !!skipClarification, clarificationHistory ?? [], priorContext, activeTable, currentCards, conversationHistory ?? [], analyticalContext);
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
  const { chatMode = 'llm', system, messages, query } = req.body;

  if (!messages && !query) {
    return res.status(400).json({ error: 'messages or query required' });
  }

  if (chatMode === 'static') {
    // Placeholder — static keyword flows run on frontend; this path is a passthrough
    return res.json({ success: true, message: 'Static mode: handle on frontend', cards: [], followUp: [] });
  }

  // LLM mode — call Gemma directly with provided system prompt + message history
  try {
    const systemPrompt = system || 'You are a helpful business intelligence assistant.';
    const formattedMessages = messages ?? [{ role: 'user', parts: [{ text: query }] }];

    const result = await callLLM(systemPrompt, formattedMessages);
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

app.listen(port, () => {
  console.log(`Backend listening at http://localhost:${port}`);

  // Refresh catalog and probe table availability on startup
  refreshCatalog().catch(err => console.error('[Startup] Catalog refresh failed:', err));
  probeTableAvailability().catch(err => console.error('[Startup] Table availability probe failed:', err));
  setInterval(() => {
    refreshCatalog().catch(err => console.error('[Scheduler] Catalog refresh failed:', err));
  }, 24 * 60 * 60 * 1000);
});
