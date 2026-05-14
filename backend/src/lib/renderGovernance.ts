/**
 * Render Governance Layer
 *
 * Deterministic enforcement of:
 *  - Intent classification from query text
 *  - Template locking per intent
 *  - Component allow-lists per template
 *  - Dataset scoping (comparisonRows, trendRows, rankingRows, summaryRows)
 *  - Structured analytical context (replaces free-text priorContext)
 *
 * This layer runs BEFORE generateReport() and constrains what the LLM can produce.
 * It does NOT change orchestration — it only adds governance.
 */

import { ShapeSignature } from '../types';
import { ReportCard } from '../services/llmHandler';

// ── Analytical Intent ─────────────────────────────────────────────────────────

export type AnalyticalIntent =
  | 'comparison'    // compare X and Y, T-007 vs T-001
  | 'trend'         // over time, monthly, by month
  | 'ranking'       // top N, bottom N, ranked by
  | 'metric_only'   // what is the revenue, show me the rate
  | 'full_dashboard'; // full report, dashboard, deep dive

export type TemplateId =
  | 'comparison'
  | 'trend_analysis'
  | 'ranking'
  | 'summary'
  | 'deep_dive';

// ── Structured Analytical Context ────────────────────────────────────────────
// Replaces the free-text priorContext string for follow-up continuity.

export interface AnalyticalContext {
  metric: string | null;
  dimension: string | null;
  entities: string[];           // e.g. ['T-007', 'T-001']
  comparisonMode: boolean;
  rankingMode: 'top_n' | 'bottom_n' | 'none';
  rankingN: number | null;
  activeTemplate: TemplateId | null;
  activeTable: string | null;
  timeframe: string | null;
  // Narrative string kept for LLM context — derived from structured fields
  narrativeSummary: string;
}

export function buildAnalyticalContext(
  query: string,
  intent: AnalyticalIntent,
  template: TemplateId,
  entities: string[],
  shape: ShapeSignature,
  activeTable: string | null,
  title: string,
  message: string,
): AnalyticalContext {
  const q = query.toLowerCase();

  const rankingMatch = q.match(/\b(top|bottom)\s+(\d+)\b/i);
  const rankingMode: AnalyticalContext['rankingMode'] =
    rankingMatch?.[1]?.toLowerCase() === 'bottom' ? 'bottom_n' :
    rankingMatch?.[1]?.toLowerCase() === 'top' ? 'top_n' : 'none';
  const rankingN = rankingMatch ? parseInt(rankingMatch[2], 10) : null;

  const timeKeywords = ['monthly', 'weekly', 'daily', 'quarterly', 'yearly', 'over time', 'by month', 'last month', 'this year'];
  const timeframe = timeKeywords.find(t => q.includes(t)) ?? null;

  const metric = shape.measureColumns[0] ?? null;
  const dimension = shape.dimensionColumns.find(c => !/(_id|_key|_code|_num)$/i.test(c)) ?? shape.dimensionColumns[0] ?? null;

  const narrativeSummary = [
    `Title: "${title}".`,
    `Template: ${template}.`,
    `Summary: ${message}`,
    activeTable ? `Table: ${activeTable}.` : '',
    entities.length ? `Entities: ${entities.join(', ')}.` : '',
    rankingMode !== 'none' ? `Ranking: ${rankingMode} ${rankingN}.` : '',
    timeframe ? `Timeframe: ${timeframe}.` : '',
  ].filter(Boolean).join(' ');

  return {
    metric,
    dimension,
    entities,
    comparisonMode: intent === 'comparison',
    rankingMode,
    rankingN,
    activeTemplate: template,
    activeTable,
    timeframe,
    narrativeSummary,
  };
}

// ── Intent Detection ──────────────────────────────────────────────────────────

const COMPARISON_RE = /\bcompare\b|\bvs\.?\b|\bversus\b|\band\s+[A-Z][A-Z0-9]*-[A-Z0-9]+\b/i;
const TREND_RE = /\bover\s+time\b|\btrend\b|\bmonthly\b|\bby\s+month\b|\bweekly\b|\bdaily\b|\bhow\s+has\b|\bhistory\b|\bover\s+the\s+(last|past)\b/i;
const RANKING_RE = /\btop\s+\d+\b|\bbottom\s+\d+\b|\branked?\s+by\b|\bhighest\b|\blowest\b|\bbest\b|\bworst\b/i;
const METRIC_ONLY_RE = /\bwhat\s+is\s+the\b|\bshow\s+me\s+the\b|\bgive\s+me\s+the\b|\bwhat'?s\s+the\b/i;
const DASHBOARD_RE = /\bfull\s+report\b|\bdashboard\b|\bgive\s+me\s+everything\b|\bdeep\s+dive\b/i;

export function detectAnalyticalIntent(query: string): AnalyticalIntent {
  const q = query;
  if (COMPARISON_RE.test(q)) return 'comparison';
  if (TREND_RE.test(q)) return 'trend';
  if (RANKING_RE.test(q)) return 'ranking';
  if (DASHBOARD_RE.test(q)) return 'full_dashboard';
  if (METRIC_ONLY_RE.test(q)) return 'metric_only';
  return 'full_dashboard'; // safe default — LLM will further constrain
}

// ── Template Locking ──────────────────────────────────────────────────────────

export function lockTemplate(intent: AnalyticalIntent, shape: ShapeSignature): TemplateId {
  switch (intent) {
    case 'comparison':   return 'comparison';
    case 'trend':        return shape.isTimeSeries ? 'trend_analysis' : 'comparison';
    case 'ranking':      return 'ranking';
    case 'metric_only':  return 'summary';
    case 'full_dashboard': return 'deep_dive';
  }
}

// ── Component Allow-Lists ─────────────────────────────────────────────────────
// Each template defines exactly which renderTypes are permitted.
// Cards outside this list are stripped before hydration.

const TEMPLATE_ALLOWED_COMPONENTS: Record<TemplateId, string[]> = {
  comparison: [
    'KPICard', 'KPIGrid', 'StatDelta',
    'BarChart',
    'TwoColumn', 'Section',
    'InsightCard', 'SummaryText',
  ],
  trend_analysis: [
    'LineChart', 'AreaChart',
    'KPICard', 'StatDelta',
    'Table', 'GenerativeTable',
    'Section',
    'InsightCard', 'SummaryText',
  ],
  ranking: [
    'RankedList', 'BarChart',
    'KPICard', 'KPIGrid',
    'Table', 'GenerativeTable',
    'Section',
    'InsightCard',
  ],
  summary: [
    'KPICard', 'KPIGrid', 'StatDelta',
    'InsightCard', 'SummaryText', 'AlertBanner',
    'Section',
  ],
  deep_dive: [
    'KPICard', 'KPIGrid', 'StatDelta',
    'BarChart', 'LineChart', 'AreaChart', 'PieChart', 'RankedList',
    'Table', 'GenerativeTable',
    'TwoColumn', 'Section',
    'InsightCard', 'SummaryText', 'AlertBanner',
  ],
};

export function getAllowedComponentsForTemplate(template: TemplateId): string[] {
  return TEMPLATE_ALLOWED_COMPONENTS[template] ?? TEMPLATE_ALLOWED_COMPONENTS.deep_dive;
}

// ── Card Constraint Enforcement ───────────────────────────────────────────────
// Strips cards whose renderType is not in the allowed list for the locked template.
// Recurses into children (TwoColumn, Section).

export function enforceComponentConstraints(
  cards: ReportCard[],
  template: TemplateId,
): { cards: ReportCard[]; stripped: string[] } {
  const allowed = new Set(getAllowedComponentsForTemplate(template));
  const stripped: string[] = [];

  const filterCard = (card: ReportCard): ReportCard | null => {
    if (!allowed.has(card.renderType)) {
      stripped.push(card.renderType);
      return null;
    }
    const filteredChildren = (card.children ?? [])
      .map(filterCard)
      .filter((c): c is ReportCard => c !== null);
    return { ...card, children: filteredChildren };
  };

  const filtered = cards.map(filterCard).filter((c): c is ReportCard => c !== null);
  return { cards: filtered, stripped };
}

// ── Dataset Scoping ───────────────────────────────────────────────────────────
// Produces intent-specific row subsets from the full BQ result.
// hydrateTree receives scopedRows instead of allRows.

export interface ScopedDataset {
  comparisonRows: any[];   // rows for specific entities being compared
  trendRows: any[];        // rows sorted/grouped by time dimension
  rankingRows: any[];      // rows sorted by primary measure, limited to N
  summaryRows: any[];      // first row or aggregated single-row summary
  detailRows: any[];       // full scoped dataset (capped at 50)
}

export function buildScopedDataset(
  allRows: any[],
  intent: AnalyticalIntent,
  shape: ShapeSignature,
  entities: string[],
  rankingN: number | null,
  rankingMode: 'top_n' | 'bottom_n' | 'none',
): ScopedDataset {
  const dimCols = shape.dimensionColumns;
  const measureCol = shape.measureColumns[0];

  // comparisonRows: rows matching extracted entities
  const comparisonRows = entities.length > 0
    ? allRows.filter(row =>
        dimCols.some(col =>
          entities.some(e => String(row[col] ?? '').toUpperCase() === e.toUpperCase())
        )
      )
    : allRows;

  // trendRows: sorted by time column if present, otherwise by first dimension
  const trendRows = shape.isTimeSeries && shape.timeColumn
    ? [...allRows].sort((a, b) => String(a[shape.timeColumn!]).localeCompare(String(b[shape.timeColumn!])))
    : allRows;

  // rankingRows: sorted by primary measure, limited to N
  const n = rankingN ?? 10;
  const sorted = measureCol
    ? [...allRows].sort((a, b) => {
        const av = Number(a[measureCol]) || 0;
        const bv = Number(b[measureCol]) || 0;
        return rankingMode === 'bottom_n' ? av - bv : bv - av;
      })
    : allRows;
  const rankingRows = sorted.slice(0, n);

  // summaryRows: single aggregated row for KPI display
  const summaryRows = allRows.slice(0, 1);

  // detailRows: full scoped set, capped
  const detailRows = allRows.slice(0, 50);

  return { comparisonRows, trendRows, rankingRows, summaryRows, detailRows };
}

// ── Per-Card Row Selector ─────────────────────────────────────────────────────
// Returns the correct scoped row set for a given renderType and intent.

export function selectRowsForCard(
  renderType: string,
  intent: AnalyticalIntent,
  scoped: ScopedDataset,
): any[] {
  switch (renderType) {
    case 'BarChart':
      if (intent === 'comparison') return scoped.comparisonRows;
      if (intent === 'ranking')    return scoped.rankingRows;
      return scoped.detailRows;

    case 'LineChart':
    case 'AreaChart':
      return scoped.trendRows;

    case 'PieChart':
      if (intent === 'comparison') return scoped.comparisonRows;
      return scoped.detailRows;

    case 'RankedList':
      return scoped.rankingRows;

    case 'Table':
    case 'GenerativeTable':
      if (intent === 'comparison') return scoped.comparisonRows;
      if (intent === 'ranking')    return scoped.rankingRows;
      if (intent === 'trend')      return scoped.trendRows;
      return scoped.detailRows;

    // KPI/narrative components use summaryRows (LLM already embedded values)
    default:
      return scoped.summaryRows;
  }
}

// ── LLM Prompt Hint Builder ───────────────────────────────────────────────────
// Builds the governance hint appended to the LLM query so it knows the constraints.

export function buildGovernanceHint(
  intent: AnalyticalIntent,
  template: TemplateId,
  allowedComponents: string[],
  entities: string[],
  isFiltered: boolean,
  priorContext: AnalyticalContext | null,
): string {
  const parts: string[] = [];

  parts.push(`[RENDER GOVERNANCE]`);
  parts.push(`INTENT: ${intent}`);
  parts.push(`TEMPLATE: ${template} — you MUST use this template.`);
  parts.push(`ALLOWED COMPONENTS: ${allowedComponents.join(', ')} — use ONLY these renderTypes.`);

  if (entities.length > 0) {
    parts.push(`ENTITIES: ${entities.join(', ')} — KPI values MUST come from these entities only.`);
  }
  if (isFiltered) {
    parts.push(`DATA IS PRE-FILTERED TO MATCHING ENTITIES ONLY — do not add global summary cards.`);
  }
  if (intent === 'comparison' && entities.length >= 2) {
    parts.push(`COMPARISON MODE: show ${entities[0]} vs ${entities[1]} side by side. Use TwoColumn with one KPICard per entity.`);
  }
  if (intent === 'ranking') {
    parts.push(`RANKING MODE: lead with RankedList or BarChart. Do NOT add unrelated trend charts.`);
  }
  if (intent === 'trend') {
    parts.push(`TREND MODE: lead with LineChart or AreaChart. Do NOT add comparison cards.`);
  }
  if (priorContext?.comparisonMode && intent !== 'comparison') {
    parts.push(`PRIOR CONTEXT had comparison mode — preserve metric: ${priorContext.metric}, dimension: ${priorContext.dimension}.`);
  }

  return parts.join(' | ');
}

// ── Deterministic Card Builder ──────────────────────────────────────────────
// Builds the full render tree from intent + shape + scoped data.
// The LLM is NOT involved in component or layout selection.
// LLM only enriches title, message, and narrative cards afterward.

import { mapProps } from '../services/propMapper';

export interface DeterministicCard {
  renderType: string;
  props: Record<string, any>;
  children?: DeterministicCard[];
}

export function buildDeterministicCards(
  intent: AnalyticalIntent,
  template: TemplateId,
  shape: ShapeSignature,
  scoped: ScopedDataset,
  entities: string[],
  rankingN: number | null,
): DeterministicCard[] {
  const cards: DeterministicCard[] = [];

  const bestDim = shape.dimensionColumns.find(c => !/(_id|_key|_code|_num)$/i.test(c))
    ?? shape.dimensionColumns[0] ?? '';
  const PREF = ['revenue', 'rate', 'score', 'pct', 'percent', 'count', 'total', 'avg'];
  const sortedMeasures = [...shape.measureColumns].sort((a, b) => {
    const ai = PREF.findIndex(p => a.toLowerCase().includes(p));
    const bi = PREF.findIndex(p => b.toLowerCase().includes(p));
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  const primaryMeasure = sortedMeasures[0] ?? '';

  console.log(`[DeterministicComponentSelection] template=${template} intent=${intent} primaryMeasure=${primaryMeasure} bestDim=${bestDim}`);

  switch (template) {

    case 'comparison': {
      // Entity comparison: one KPICard per entity side-by-side, then BarChart
      if (entities.length >= 2 && scoped.comparisonRows.length >= 2) {
        const entityCards: DeterministicCard[] = entities.slice(0, 2).map(entity => {
          const row = scoped.comparisonRows.find(r =>
            shape.dimensionColumns.some(col => String(r[col] ?? '').toUpperCase() === entity.toUpperCase())
          ) ?? {};
          const val = row[primaryMeasure];
          return {
            renderType: 'KPICard',
            props: {
              title: `${entity} — ${primaryMeasure}`,
              value: val !== undefined ? (typeof val === 'number' ? val.toLocaleString() : val) : '—',
            },
          };
        });
        cards.push({ renderType: 'TwoColumn', props: {}, children: entityCards });
      } else {
        // Fallback: KPIGrid with all measures
        cards.push({ renderType: 'KPIGrid', props: mapProps('KPIGrid', shape, intent, scoped) });
      }
      // BarChart for visual comparison
      if (primaryMeasure && bestDim) {
        cards.push({ renderType: 'BarChart', props: mapProps('BarChart', shape, intent, scoped) });
      }
      break;
    }

    case 'trend_analysis': {
      // KPICard for current value, then LineChart
      if (primaryMeasure) {
        cards.push({ renderType: 'KPICard', props: mapProps('KPICard', shape, intent, scoped) });
      }
      const timeCol = shape.timeColumn ?? bestDim;
      if (timeCol && primaryMeasure) {
        cards.push({
          renderType: shape.isTimeSeries ? 'LineChart' : 'AreaChart',
          props: mapProps('LineChart', shape, intent, scoped),
        });
      }
      break;
    }

    case 'ranking': {
      // RankedList as primary, BarChart as secondary
      const n = rankingN ?? 10;
      if (primaryMeasure && bestDim) {
        cards.push({
          renderType: 'RankedList',
          props: mapProps('RankedList', shape, intent, scoped, { title: `Top ${n} by ${primaryMeasure}` }),
        });
        cards.push({
          renderType: 'BarChart',
          props: mapProps('BarChart', shape, intent, scoped, { title: `${primaryMeasure} by ${bestDim}` }),
        });
      } else {
        cards.push({ renderType: 'KPIGrid', props: mapProps('KPIGrid', shape, intent, scoped) });
      }
      break;
    }

    case 'summary': {
      // KPIGrid only — no charts
      cards.push({ renderType: 'KPIGrid', props: mapProps('KPIGrid', shape, intent, scoped) });
      break;
    }

    case 'deep_dive': {
      // Full dashboard: KPIGrid + primary chart + table
      if (sortedMeasures.length > 0) {
        cards.push({ renderType: 'KPIGrid', props: mapProps('KPIGrid', shape, intent, scoped) });
      }
      if (shape.isTimeSeries && shape.timeColumn && primaryMeasure) {
        cards.push({ renderType: 'LineChart', props: mapProps('LineChart', shape, intent, scoped) });
      } else if (bestDim && primaryMeasure) {
        cards.push({ renderType: 'BarChart', props: mapProps('BarChart', shape, intent, scoped) });
      }
      if (bestDim) {
        cards.push({ renderType: 'GenerativeTable', props: mapProps('GenerativeTable', shape, intent, scoped) });
      }
      break;
    }
  }

  console.log(`[TemplateComposition] Built ${cards.length} deterministic cards: [${cards.map(c => c.renderType).join(', ')}]`);
  return cards;
}

// ── Context Continuity Check ──────────────────────────────────────────────────
// Determines whether a follow-up query should inherit prior analytical context.

export function shouldInheritContext(
  query: string,
  priorContext: AnalyticalContext | null,
): boolean {
  if (!priorContext?.activeTable) return false;

  const q = query.toLowerCase();

  // Explicit new domain signals — reset context
  const NEW_DOMAIN_RE = /\b(new\s+report|different\s+(report|data|topic)|switch\s+to|show\s+me\s+(something|a\s+different))\b/i;
  if (NEW_DOMAIN_RE.test(query)) return false;

  // Follow-up signals — inherit context
  const FOLLOW_UP_RE = /\b(now|also|instead|add|remove|change|update|modify|show\s+only|compare|bottom|top|filter|by\s+\w+)\b/i;
  if (FOLLOW_UP_RE.test(query)) return true;

  // If query mentions same entities as prior context — inherit
  if (priorContext.entities.length > 0) {
    const mentionsEntity = priorContext.entities.some(e => q.includes(e.toLowerCase()));
    if (mentionsEntity) return true;
  }

  // If query mentions same metric as prior context — inherit
  if (priorContext.metric && q.includes(priorContext.metric.toLowerCase())) return true;

  return false;
}
