import dotenv from 'dotenv';
import { executeQuery } from '../services/queryEngine';
import { analyzeDataShape } from '../services/dataShapeAnalyzer';
import {
  generateReport, analyzeQuery, sonnetRespond,
  classifyAndEditReport, buildHydrationMap, rehydrateEditedCards,
  ReportCard, ConversationTurn, LLMProvider,
  getAvailableDataSources,
} from '../services/llmHandler';
import { runQueryWithMeta, qualifiedTable } from '../lib/bigqueryClient';
import { DATA_SOURCES, ALL_DOMAINS, getSourcesByDomain } from '../services/dataSourceMap';
import { UITypeTree, ShapeSignature, CachedReport } from '../types';
import { cacheService, generateKey } from '../services/cacheService';
import { resolveOutputMode } from '../services/outputMode';
import { recordOutputMode } from '../services/outputModeTelemetry';
import { shadowValidateCards } from '../services/validationTelemetry';
import { deriveConstraints } from '../services/componentSelector';
import { recordConstraints } from '../services/constraintTelemetry';
import { governReport, governorMode, generateGovernedFallback } from '../services/governor';
import { recordGovernor } from '../services/governorTelemetry';
import { OutputMode } from '../registry/componentRegistry';
import { resolveLayout, buildAcknowledgment } from '../services/layoutDirective';
import { recordLayoutDirective } from '../services/layoutDirectiveTelemetry';

// Fixes column name casing in LLM-generated cards.
// BQ returns columns in their original case (e.g. TEAM, CSAT_SCORE) but the LLM
// often lowercases them (team, csat_score), causing Recharts to find nothing.
function fixColumnCasing(cards: ReportCard[], actualColumns: string[]): ReportCard[] {
  const caseMap = new Map<string, string>();
  actualColumns.forEach(col => caseMap.set(col.toLowerCase(), col));

  const fixProps = (props: Record<string, any>): Record<string, any> => {
    const out = { ...props };
    for (const key of ['xKey', 'yKey', 'nameKey', 'valueKey', 'labelKey', 'timeColumn', 'barKey', 'lineKey', 'zKey', 'rowKey', 'colKey']) {
      if (typeof out[key] === 'string') {
        out[key] = caseMap.get(out[key].toLowerCase()) ?? out[key];
      }
    }
    if (Array.isArray(out.columns)) {
      out.columns = out.columns.map((c: string) => caseMap.get(c.toLowerCase()) ?? c);
    }
    if (Array.isArray(out.metrics)) {
      out.metrics = out.metrics.map((m: any) => typeof m === 'object' ? m : m);
    }
    return out;
  };

  const fixCard = (card: ReportCard): ReportCard => ({
    ...card,
    props: fixProps(card.props),
    children: card.children?.map(fixCard),
  });

  return cards.map(fixCard);
}

// Guaranteed fallback: always produces at least one renderable card from the data shape.
// Used when the LLM returns cards:[] for any reason.
function generateFallbackCards(shape: ShapeSignature): ReportCard[] {
  const cards: ReportCard[] = [];

  // Pick best dimension: prefer short string columns (territory, name) over numeric IDs
  const bestDimension = shape.dimensionColumns.find(c => !/(_id|_key|_code|_num)$/i.test(c))
    ?? shape.dimensionColumns[0];

  // Pick best measures: up to 4, prefer revenue/rate/score columns
  const preferredOrder = ['revenue', 'rate', 'score', 'pct', 'percent', 'count', 'total', 'avg'];
  const sortedMeasures = [...shape.measureColumns].sort((a, b) => {
    const aScore = preferredOrder.findIndex(p => a.toLowerCase().includes(p));
    const bScore = preferredOrder.findIndex(p => b.toLowerCase().includes(p));
    return (aScore === -1 ? 99 : aScore) - (bScore === -1 ? 99 : bScore);
  });
  const topMeasures = sortedMeasures.slice(0, 4);

  if (topMeasures.length > 0) {
    cards.push({
      renderType: 'KPIGrid',
      props: {
        metrics: topMeasures.map(col => ({ title: col, value: '—' })),
        explanation: 'Key metrics from the dataset.',
      },
    });
  }

  if (shape.isTimeSeries && shape.timeColumn && topMeasures.length > 0) {
    cards.push({
      renderType: 'LineChart',
      props: {
        title: `${topMeasures[0]} Over Time`,
        xKey: shape.timeColumn,
        yKey: topMeasures[0],
        explanation: `Trend of ${topMeasures[0]} over time.`,
      },
    });
  } else if (bestDimension && topMeasures.length > 0) {
    cards.push({
      renderType: 'BarChart',
      props: {
        title: `${topMeasures[0]} by ${bestDimension}`,
        xKey: bestDimension,
        yKey: topMeasures[0],
        explanation: `${topMeasures[0]} broken down by ${bestDimension}.`,
      },
    });
  }

  const columns = [bestDimension, ...topMeasures].filter(Boolean).slice(0, 8) as string[];
  if (columns.length > 0) {
    cards.push({
      renderType: 'Table',
      props: { title: 'Data Detail', columns, explanation: 'Full dataset view.' },
    });
  }

  return cards;
}

dotenv.config();

type SendFn = (event: string, data: unknown) => void;

// How many sample rows Gemma sees (keeps tokens low while giving enough context)
const SAMPLE_SIZE = 20;

// Pre-aggregate raw BQ rows into one row per unique dimension combination.
// Measure columns are averaged. This ensures the LLM embeds the same values
// that hydrateTree will compute — both derive from real BQ data.
function preaggregateRows(rows: any[], shape: ShapeSignature): any[] {
  if (!shape.dimensionColumns.length || !shape.measureColumns.length) return rows;

  const grouped = new Map<string, { sums: Record<string, number>; counts: Record<string, number>; sample: any }>();

  for (const row of rows) {
    const key = shape.dimensionColumns.map(c => String(row[c] ?? '')).join('|');
    const entry = grouped.get(key) ?? { sums: {}, counts: {}, sample: row };
    for (const col of shape.measureColumns) {
      const val = Number(row[col]) || 0;
      entry.sums[col] = (entry.sums[col] ?? 0) + val;
      entry.counts[col] = (entry.counts[col] ?? 0) + 1;
    }
    grouped.set(key, entry);
  }

  return Array.from(grouped.values()).map(({ sums, counts, sample }) => {
    const row = { ...sample };
    for (const col of shape.measureColumns) {
      row[col] = counts[col] > 0 ? Math.round((sums[col] / counts[col]) * 100) / 100 : 0;
    }
    return row;
  });
}

// Recursively attach real BigQuery data to components that need it.
// Layout wrappers (TwoColumn, Section) are hydrated by recursing into their children.
// Narrative components (InsightCard, AlertBanner, SummaryText, StatDelta) have
// values embedded by the LLM and need no hydration.
function hydrateTree(card: ReportCard, allRows: any[]): UITypeTree {
  const { renderType, props } = card;

  // Recurse into children first (handles TwoColumn, Section, etc.)
  const hydratedChildren: UITypeTree[] = (card.children ?? []).map(child =>
    hydrateTree(child, allRows)
  );

  switch (renderType) {
    // ── Charts — attach dataset; aggregate time-series charts by xKey ────────
    case 'LineChart':
    case 'AreaChart': {
      const { xKey, yKey } = props;
      if (xKey && yKey) {
        // Aggregate: group by xKey, average yKey — prevents duplicate x-axis labels
        const grouped = new Map<string, { sum: number; count: number }>();
        for (const row of allRows) {
          const x = String(row[xKey] ?? '');
          const y = Number(row[yKey]) || 0;
          const entry = grouped.get(x) ?? { sum: 0, count: 0 };
          entry.sum += y;
          entry.count += 1;
          grouped.set(x, entry);
        }
        const aggregated = Array.from(grouped.entries()).map(([x, { sum, count }]) => ({
          ...Object.fromEntries(Object.entries(allRows.find(r => String(r[xKey]) === x) ?? {})),
          [xKey]: x,
          [yKey]: Math.round((sum / count) * 100) / 100,
        }));
        return { renderType, props: { ...props, data: aggregated }, children: hydratedChildren };
      }
      return { renderType, props: { ...props, data: allRows }, children: hydratedChildren };
    }

    case 'BarChart': {
      const { xKey, yKey, filterValues } = props;
      if (xKey && yKey) {
        // Aggregate: group by xKey, average yKey — one bar per entity
        const grouped = new Map<string, { sum: number; count: number }>();
        for (const row of allRows) {
          const x = String(row[xKey] ?? '');
          if (!x) continue;
          const y = Number(row[yKey]) || 0;
          const entry = grouped.get(x) ?? { sum: 0, count: 0 };
          entry.sum += y;
          entry.count += 1;
          grouped.set(x, entry);
        }
        // Filter to specific entities if LLM specified them
        const allowed = Array.isArray(filterValues) && filterValues.length > 0
          ? new Set(filterValues.map(String))
          : null;

        let data: Record<string, any>[] = Array.from(grouped.entries())
          .filter(([x]) => !allowed || allowed.has(x))
          .map(([x, { sum, count }]) => ({
            ...Object.fromEntries(Object.entries(allRows.find((r: any) => String(r[xKey]) === x) ?? {})),
            [xKey]: x,
            [yKey]: Math.round((sum / count) * 100) / 100,
          }));

        // Sort by xKey naturally (T-001 < T-002 < T-010 etc.)
        data.sort((a, b) =>
          String(a[xKey]).localeCompare(String(b[xKey]), undefined, { numeric: true, sensitivity: 'base' })
        );

        return { renderType, props: { ...props, data }, children: hydratedChildren };
      }
      return { renderType, props: { ...props, data: allRows }, children: hydratedChildren };
    }

    case 'PieChart':
    case 'ScatterPlot':
    case 'HeatMap':
    case 'FunnelChart':
    case 'PivotTable':
      return { renderType, props: { ...props, data: allRows }, children: hydratedChildren };

    case 'ComboChart': {
      const { xKey, barKey, lineKey } = props;
      if (xKey && (barKey || lineKey)) {
        const grouped = new Map<string, { barSum: number; lineSum: number; count: number }>();
        for (const row of allRows) {
          const x = String(row[xKey] ?? '');
          const entry = grouped.get(x) ?? { barSum: 0, lineSum: 0, count: 0 };
          entry.barSum += Number(row[barKey]) || 0;
          entry.lineSum += Number(row[lineKey]) || 0;
          entry.count += 1;
          grouped.set(x, entry);
        }
        const data = Array.from(grouped.entries()).map(([x, { barSum, lineSum, count }]) => ({
          [xKey]: x,
          ...(barKey ? { [barKey]: Math.round((barSum / count) * 100) / 100 } : {}),
          ...(lineKey ? { [lineKey]: Math.round((lineSum / count) * 100) / 100 } : {}),
        }));
        return { renderType, props: { ...props, data }, children: hydratedChildren };
      }
      return { renderType, props: { ...props, data: allRows }, children: hydratedChildren };
    }

    case 'Sparkline': {
      const { xKey, yKey } = props;
      if (xKey && yKey) {
        const data = allRows.map(row => ({ [xKey]: row[xKey], [yKey]: Number(row[yKey]) || 0 }));
        return { renderType, props: { ...props, data }, children: hydratedChildren };
      }
      return { renderType, props: { ...props, data: allRows }, children: hydratedChildren };
    }

    // ── RankedList — deduplicate by labelKey, aggregate valueKey ─────────────
    case 'RankedList': {
      const { labelKey, valueKey, limit = 10, sort = 'desc' } = props;
      const grouped = new Map<string, { sum: number; count: number }>();
      for (const row of allRows) {
        const label = String(row[labelKey] ?? '');
        const val = Number(row[valueKey]) || 0;
        const entry = grouped.get(label) ?? { sum: 0, count: 0 };
        entry.sum += val;
        entry.count += 1;
        grouped.set(label, entry);
      }
      const items = Array.from(grouped.entries())
        .map(([label, { sum, count }]) => ({ label, value: Math.round((sum / count) * 100) / 100 }))
        .sort((a, b) => sort === 'asc' ? a.value - b.value : b.value - a.value)
        .slice(0, limit)
        .map((item, i) => ({ rank: i + 1, label: item.label, value: item.value }));
      return { renderType, props: { ...props, items }, children: hydratedChildren };
    }

    // ── Tables — attach full dataset ─────────────────────────────────────────
    case 'Table':
    case 'GenerativeTable': {
      const columns = props.columns ?? (allRows[0] ? Object.keys(allRows[0]) : []);
      return {
        renderType,
        props: { ...props, columns, data: allRows, rows: allRows },
        children: hydratedChildren,
      };
    }

    // ── Layout wrappers — pass through with hydrated children ─────────────────
    case 'TwoColumn':
    case 'Section':
      return { renderType, props, children: hydratedChildren };

    // ── Metric / Narrative — LLM already embedded values, no hydration needed ─
    default:
      return { renderType, props, children: hydratedChildren };
  }
}

export interface ClarificationTurn {
  question: string;
  answer: string;
}

// Extract a compact, human-readable data summary from hydrated cards.
// Used to give the LLM actual metric values so it can answer analytical questions
// without re-querying BigQuery.
function buildCompactDataContext(cards: ReportCard[], maxRows = 10): string {
  const lines: string[] = [];

  const extract = (card: ReportCard) => {
    const p = card.props as any;
    switch (card.renderType) {
      case 'KPICard':
      case 'StatDelta':
        if (p.title && p.value !== undefined) {
          lines.push(`${p.title}: ${p.value}${p.trend ? ` (${p.trend})` : ''}`);
        }
        break;
      case 'KPIGrid':
        if (Array.isArray(p.metrics)) {
          p.metrics.forEach((m: any) => {
            if (m.title) lines.push(`${m.title}: ${m.value ?? '—'}${m.trend ? ` (${m.trend})` : ''}`);
          });
        }
        break;
      case 'RankedList':
        if (Array.isArray(p.items) && p.title) {
          lines.push(`${p.title}:`);
          p.items.slice(0, maxRows).forEach((item: any) =>
            lines.push(`  #${item.rank} ${item.label}: ${item.value}`)
          );
        }
        break;
      case 'Table':
      case 'GenerativeTable': {
        const rows: any[] = p.data ?? p.rows ?? [];
        if (rows.length > 0 && p.title) {
          lines.push(`${p.title} (sample rows):`);
          rows.slice(0, maxRows).forEach((row: any) =>
            lines.push('  ' + Object.entries(row).map(([k, v]) => `${k}=${v}`).join(', '))
          );
        }
        break;
      }
    }
    card.children?.forEach(extract);
  };

  cards.forEach(extract);
  return lines.join('\n');
}

export async function runStreamingPipeline(
  query: string,
  send: SendFn,
  skipClarification = false,
  clarificationHistory: ClarificationTurn[] = [],
  priorContext?: string,
  activeTable?: string,
  currentCards?: ReportCard[],
  conversationHistory: ConversationTurn[] = [],
  provider: LLMProvider = 'gemma',
): Promise<void> {
  // Phase 1: provider is part of the key — gemma and sonnet must not share cache entries.
  const cacheKey = generateKey({ query, stream: true, v: 3, provider, history: clarificationHistory, prior: priorContext });
  const cached = cacheService.get<CachedReport>(cacheKey);

  console.log(`[Pipeline] query="${query}" skipClarification=${skipClarification} history=${clarificationHistory.length} activeTable=${activeTable ?? 'none'} cacheHit=${!!cached}`);

  if (cached) {
    send('meta', { title: cached.title, description: cached.message, cached: true, activeTable: cached.activeTable, rowCount: cached.rowCount ?? null, outputMode: cached.outputMode });
    for (const component of cached.components) send('component', component);
    if (cached.followUp && cached.followUp.length > 0) send('followUp', cached.followUp);
    return;
  }

  // ── Adaptive UI: UI-personalization intent (Requirement 5) ─────────────────
  // Runs BEFORE report/edit classification so a layout command ("move the right
  // panel to the bottom", "hide the sidebar", "use a compact layout") is recognized
  // as a distinct UI intent and never becomes a new report or a structural edit.
  //
  // resolveLayout is fast-path-first: an obvious keyword command is parsed instantly
  // with no LLM call; anything the fast-path cannot resolve is handed to Sonnet, which
  // decides intent AND parses. Sonnet self-gates (isLayout=false ⇒ we fall through
  // to the normal pipeline), so novel phrasing works without a regex edit while data
  // queries and report-content edits are left untouched.
  const layout = await resolveLayout(query, provider);
  if (layout.isLayout) {
    send('status', { message: 'Adjusting your layout...' });
    recordLayoutDirective(layout.result, { query, provider });

    // Only emit schema-valid directives; unsupported ops are reported clearly.
    send('layout_directive', {
      directives: layout.result.directives,
      rejected: layout.result.rejected,
      acknowledgment: buildAcknowledgment(layout.result),
      source: layout.result.source,
    });
    return;
  }

  // ── LLM intent classification ─────────────────────────────────────────────
  // When an existing report is open and the user sends a follow-up (no active
  // clarification in progress), ask the LLM to classify intent before routing.
  // This replaces keyword matching entirely.
  const hasExistingReport = !!priorContext && !!activeTable && currentCards && currentCards.length > 0;
  const inClarificationFlow = clarificationHistory.length > 0;

  // Unambiguous text/summary/answer signals — these queries must never generate a new dashboard.
  const TEXT_REQUEST_RE = /\b(summar(y|ize|ise)|explain|in\s+(text|points?|pointers?|bullets?)|tell\s+me|what\s+(is|are|does|drives|caused?)|why\s+(is|are|does)|how\s+(many|much|does)|insights?|describe|what\s+does\s+this\s+mean|give\s+(me\s+)?(the\s+)?summary|analyze\s+this)\b/i;
  const isClearTextRequest = TEXT_REQUEST_RE.test(query);

  if (hasExistingReport && !inClarificationFlow && !skipClarification) {
    send('status', { message: 'Understanding your request...' });

    const dataContext = buildCompactDataContext(currentCards!);

    // For clear text/summary requests, prepend an instruction so the LLM cannot misclassify.
    const classifyQuery = isClearTextRequest
      ? `RESPOND IN TEXT FORMAT ONLY (qa_answer). Do not generate a new report or dashboard. ${query}`
      : query;

    // Single fused LLM call: classifies intent AND applies structural edits in one shot.
    let fusedResult: Awaited<ReturnType<typeof classifyAndEditReport>> | null = null;
    try {
      fusedResult = await classifyAndEditReport(classifyQuery, currentCards!, priorContext!, dataContext, conversationHistory, provider);
    } catch (err) {
      console.error('[Pipeline] classifyAndEditReport failed after retries:', err);
      // Fall through to new-report flow as safe default
    }

    if (fusedResult) {
      console.log(`[Pipeline] Fused intent: ${fusedResult.action}`);

      // ── Structural edit: LLM already returned modified cards ──────────────
      if (fusedResult.action === 'edit_structural') {
        const hydrationMap = buildHydrationMap(currentCards!);
        const rehydrated = rehydrateEditedCards(fusedResult.cards, hydrationMap);

        send('acknowledgment', { message: fusedResult.acknowledgment });
        send('meta', {
          title: fusedResult.title || (priorContext!.match(/Title: "([^"]+)"/)?.[1] ?? 'Updated Report'),
          description: fusedResult.message,
          rowCount: null,
          template: 'summary',
          activeTable,
        });
        for (const card of rehydrated) send('component', card);
        if (fusedResult.followUp.length > 0) send('followUp', fusedResult.followUp);
        return;
      }

      // ── QA / summary: answer from context, no BQ re-query ────────────────
      if (fusedResult.action === 'qa_answer') {
        send('qa_answer', { message: fusedResult.message, followUp: fusedResult.followUp });
        return;
      }

      // ── Data-change edit: re-query BQ with optional SQL filter ────────────
      if (fusedResult.action === 'edit_data_change') {
        send('status', { message: 'Fetching updated data...' });

        let allRows: any[] = [];
        const sqlOverride = fusedResult.sqlOverride;

        if (sqlOverride && activeTable) {
          // Apply LLM-suggested filter/sort directly against the active table
          try {
            const sql = `SELECT * FROM ${qualifiedTable(activeTable)} ${sqlOverride}`;
            console.log(`[Pipeline] edit_data_change sqlOverride: ${sql}`);
            const result = await runQueryWithMeta(sql);
            allRows = result.rows;
          } catch (sqlErr: any) {
            console.warn('[Pipeline] sqlOverride failed, falling back to full table:', sqlErr.message);
          }
        }

        if (allRows.length === 0 && activeTable) {
          // Fallback: fetch full active table without filter
          try {
            const result = await runQueryWithMeta(`SELECT * FROM ${qualifiedTable(activeTable)} LIMIT 50`);
            allRows = result.rows;
          } catch (fallbackErr: any) {
            console.warn('[Pipeline] edit_data_change full-table fallback failed:', fallbackErr.message);
          }
        }

        if (allRows.length === 0) {
          send('acknowledgment', { message: "I couldn't find data matching that filter. The original report is unchanged." });
          for (const card of currentCards!) send('component', card);
          return;
        }

        const dataShape = await analyzeDataShape(allRows);
        const aggregatedRows = preaggregateRows(allRows, dataShape);
        const sampleRows = aggregatedRows.slice(0, SAMPLE_SIZE);
        const editEnrichedQuery = `EDIT REQUEST: ${query}. Prior report: ${priorContext}`;

        send('status', { message: 'Updating report...' });
        const report = await generateReport(editEnrichedQuery, dataShape, sampleRows, priorContext, provider);
        const actualColumns = Object.keys(dataShape.columnTypes);
        report.cards = fixColumnCasing(report.cards, actualColumns);
        if (report.cards.length === 0) report.cards = generateFallbackCards(dataShape);

        // Phase 3: shadow validation — passive, never blocks render.
        shadowValidateCards(report.cards, provider);

        send('acknowledgment', { message: "Here's the updated report with your changes applied." });
        send('meta', { title: report.title, description: report.message, rowCount: allRows.length, template: report.template, activeTable });
        const validComponents: UITypeTree[] = [];
        for (const card of report.cards) {
          const node = hydrateTree(card, allRows);
          send('component', node);
          validComponents.push(node);
        }
        if (report.followUp.length > 0) send('followUp', report.followUp);
        cacheService.set(cacheKey, { components: validComponents, title: report.title, message: report.message, activeTable, followUp: report.followUp, rowCount: allRows.length }, 5 * 60 * 1000);
        return;
      }

      // ── Ambiguous: ask user to clarify ────────────────────────────────────
      if (fusedResult.action === 'clarify_intent') {
        send('clarification', {
          opener: 'I want to make sure I understand what you need.',
          currentQuestion: {
            question: 'Are you looking to modify the current report, or would you like to start a new one?',
            options: ['Modify the current report', 'Start a new report'],
          },
        });
        return;
      }

      // Safety net: if LLM returned new_report for a clear text request, force qa_answer
      // using the data context we already have (avoids unnecessary BQ re-query).
      if (fusedResult.action === 'new_report' && isClearTextRequest && dataContext) {
        try {
          const forced = await classifyAndEditReport(
            `You MUST respond with action="qa_answer". Answer this question directly using the report data: ${query}`,
            currentCards!,
            priorContext!,
            dataContext,
            conversationHistory,
            provider,
          );
          if (forced.action === 'qa_answer') {
            send('qa_answer', { message: forced.message, followUp: forced.followUp });
            return;
          }
        } catch (e) {
          console.error('[Pipeline] forced qa_answer failed:', e);
        }
      }

      // fusedResult.action === 'new_report' → fall through to normal flow
    }
  }

  const start = Date.now();

  // Build enriched query from clarification history if present
  const enrichedQuery = clarificationHistory.length > 0
    ? `${query}. Context: ${clarificationHistory.map(t => `${t.question} → ${t.answer}`).join('; ')}`
    : query;

  // Step 0+1 — decide clarify vs route (normal new-report flow)
  // Always use the LLM-driven analyzeQuery — never keyword classification.
  // forceGenerate (skipClarification or long history) suppresses further clarification
  // but still uses the LLM to pick the right table.
  const forceGenerate = skipClarification || clarificationHistory.length >= 3;
  let tableOverride: string | undefined;
  const intent = { metric: 'unknown', dimension: 'unknown', intent: 'metric_by_dimension' as const };
  let resolvedIntent = 'metric_by_dimension';
  let llmProposedMode: OutputMode | undefined;

  send('status', { message: provider === 'sonnet' ? 'Thinking…' : 'Understanding your query...' });

  if (provider === 'sonnet') {
    // Sonnet front-door: one call decides chat / answer / clarify / generate.
    // It is NOT forced to build a report — greetings and questions get real replies.
    const decision = await sonnetRespond(query, clarificationHistory);
    console.log(`[Pipeline] Sonnet intent: ${decision.action}`);

    // Conversational or direct answer — reply as text, no dashboard.
    if (decision.action === 'chat' || decision.action === 'answer') {
      recordOutputMode({ outputMode: 'qa_answer', source: 'llm', intent: 'qa_answer' }, { query, provider });
      send('qa_answer', { message: decision.message, followUp: [] });
      return;
    }
    // Needs a choice — ask, unless we're forcing generation.
    if (decision.action === 'clarify') {
      if (!forceGenerate) {
        send('clarification', { opener: '', currentQuestion: { question: decision.question, options: decision.options } });
        return;
      }
      tableOverride = getAvailableDataSources()[0]?.table;
    } else {
      // generate
      tableOverride = decision.table;
      resolvedIntent = decision.intent;
      llmProposedMode = decision.outputMode;
    }
  } else {
    // Gemma path — unchanged: LLM-driven analyze, then route or clarify.
    const analysis = await analyzeQuery(query, clarificationHistory, provider);

    if (analysis.action === 'clarify' && !forceGenerate) {
      send('clarification', {
        opener: analysis.opener,
        currentQuestion: { question: analysis.question, options: analysis.options },
      });
      return;
    }

    if (analysis.action === 'route') {
      tableOverride = analysis.table;
      resolvedIntent = analysis.intent;
      llmProposedMode = analysis.outputMode;
    } else {
      // forceGenerate or LLM couldn't route — derive table from history/query text
      const allTexts = [query, ...clarificationHistory.map(t => t.answer)];
      const availableSources = getAvailableDataSources();
      const matched = availableSources.find(s =>
        allTexts.some(t => t.toLowerCase().includes(s.reportName.toLowerCase()))
      ) ?? availableSources.find(s =>
        allTexts.some(t => t.toLowerCase().includes(s.domain.toLowerCase()))
      );
      tableOverride = matched?.table ?? availableSources[0]?.table;
    }
  }

  // ── Phase 2: classify + FREEZE output_mode (observed only — no enforcement) ──
  const outputModeDecision = resolveOutputMode({ query, intent: resolvedIntent, llmProposed: llmProposedMode });
  recordOutputMode(outputModeDecision, { query, provider });
  const outputMode = outputModeDecision.outputMode;

  // Step 2 — fetch real BigQuery data
  send('status', { message: 'Querying BigQuery...' });
  const allRows = await executeQuery(intent, (meta) => send('bq_debug', meta), tableOverride);

  // Track which table ultimately produced data (for follow-up routing)
  const resolvedTable = tableOverride ?? activeTable;

  if (allRows.length === 0) {
    // Recovery — only show options from tables that actually have data,
    // and exclude the table that just failed to avoid showing the same dead-end again.
    const availableSources = getAvailableDataSources();
    const failedTable = tableOverride;

    const answeredDomain = clarificationHistory
      .map(t => t.answer)
      .find(a => [...new Set(availableSources.map(s => s.domain))].some(d => d.toLowerCase() === a.toLowerCase()));

    let recoveryOptions: string[];
    let recoveryQuestion: string;

    if (answeredDomain) {
      const sources = availableSources
        .filter(s => s.domain.toLowerCase() === answeredDomain.toLowerCase() && s.table !== failedTable);
      recoveryOptions = sources.map(s => s.reportName);
      recoveryQuestion = recoveryOptions.length > 0
        ? `Which ${answeredDomain} report would you like to explore?`
        : 'Which domain would you like to explore?';
      if (recoveryOptions.length === 0) {
        // All reports in this domain are unavailable — fall back to domains
        recoveryOptions = [...new Set(availableSources.map(s => s.domain))];
      }
    } else {
      recoveryOptions = [...new Set(availableSources.map(s => s.domain))];
      recoveryQuestion = 'Which domain would you like to explore?';
    }

    send('clarification', {
      opener: `I don't have data available for that report right now. Here's what I can show you instead:`,
      currentQuestion: { question: recoveryQuestion, options: recoveryOptions },
      isRecovery: true,
    });
    return;
  }

  // Step 3 — shape analysis (gives Gemma column types)
  const dataShape = await analyzeDataShape(allRows);

  // Phase 4: derive constraints (telemetry). Phase 5 governor may consume them.
  const constraints = deriveConstraints(outputMode, dataShape);
  recordConstraints(constraints, provider);

  // Pre-aggregate so the LLM sees one row per entity with correct averaged values —
  // the same values that hydrateTree will compute from the full dataset.
  const aggregatedRows = preaggregateRows(allRows, dataShape);
  const sampleRows = aggregatedRows.slice(0, SAMPLE_SIZE);

  // Step 4 — single LLM call: decides everything (enriched query gives the model full context)
  const providerLabel = provider === 'sonnet' ? 'Sonnet' : 'Gemma';
  send('status', { message: `Analysing ${allRows.length} rows with ${providerLabel}...` });
  const report = await generateReport(enrichedQuery, dataShape, sampleRows, priorContext, provider, outputMode);

  // Fix column casing: LLM often lowercases BQ column names which breaks charts
  const actualColumns = Object.keys(dataShape.columnTypes);
  report.cards = fixColumnCasing(report.cards, actualColumns);

  if (report.cards.length === 0) {
    console.warn('generateReport returned empty cards — using deterministic fallback');
    report.cards = generateFallbackCards(dataShape);
    if (report.cards.length === 0) {
      send('error', { message: 'No data could be rendered. Try a more specific query.' });
      return;
    }
  }

  // Phase 3: shadow validation — passive, never blocks render.
  shadowValidateCards(report.cards, provider);

  // Phase 5: governor. off → no-op; shadow → log only; enforce → modify output.
  const gMode = governorMode();
  if (gMode !== 'off') {
    const outcome = await governReport({
      cards: report.cards,
      constraints,
      shape: dataShape,
      provider,
      mode: gMode,
      regenerate: async (errs) => {
        const retryQuery = `${enrichedQuery}\n\nThe previous attempt was invalid — fix these issues and try again: ${errs.join('; ')}`;
        const r = await generateReport(retryQuery, dataShape, sampleRows, priorContext, provider, outputMode);
        return fixColumnCasing(r.cards, actualColumns);
      },
      fallback: () => generateGovernedFallback(dataShape, constraints),
    });
    recordGovernor(outcome);
    // Only enforce mode mutates output; and never to an empty report.
    if (gMode === 'enforce' && outcome.cards.length > 0) report.cards = outcome.cards;
  }

  // Step 5 — stream report metadata (includes template so frontend can adapt layout)
  send('meta', {
    title: report.title,
    description: report.message,
    rowCount: allRows.length,
    template: report.template,
    activeTable: resolvedTable,
    outputMode,
  });

  // Step 6 — hydrate + stream each card (recursive for layout wrappers)
  const validComponents: UITypeTree[] = [];

  for (const card of report.cards) {
    const node = hydrateTree(card, allRows);
    send('component', node);
    validComponents.push(node);
  }

  // Step 7 — stream follow-up suggestions
  if (report.followUp.length > 0) {
    send('followUp', report.followUp);
  }

  send('status', { message: `Done in ${Date.now() - start}ms` });

  cacheService.set(cacheKey, {
    components: validComponents,
    title: report.title,
    message: report.message,
    activeTable: resolvedTable,
    followUp: report.followUp,
    rowCount: allRows.length,
    outputMode,
  }, 5 * 60 * 1000);
}
