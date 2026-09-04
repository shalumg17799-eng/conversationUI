// Phase 4 — grounding validation.
//
// Every table/column a generated card references must resolve to a node in the graph.
// Unresolvable references are counted as violations; resolvable-with-repair ones are
// repaired from the graph's canonical spelling.
//
// How this differs from fixColumnCasing (runStreamingPipeline.ts:28), which stays:
//   • fixColumnCasing repairs against the RESULT SET — ground truth for the rows that
//     came back, but it only fixes letter case.
//   • This repairs against the SCHEMA in the graph, so it additionally resolves a
//     METRIC LABEL to its physical column ("Take Rate %" → take_rate_pct). That is a
//     class of error casing repair cannot touch, and it is exactly what the model gets
//     wrong when it is shown KPI display names.
// The two are complementary; running both is deliberate, not redundant.
//
// Pure core + async wrapper: checkCardGrounding() needs no database, so the rules are
// unit-testable without Neo4j.

import { KAG_CONFIG, isKagActive } from './config';
import { canonicalColumnsFor } from './kagGrounding';
import { recordValidation } from './kagTelemetry';
import { trace } from './kagTrace';

/** Props whose string value names a column. Mirrors fixColumnCasing's key list. */
const COLUMN_PROPS = [
  'xKey', 'yKey', 'nameKey', 'valueKey', 'labelKey',
  'timeColumn', 'barKey', 'lineKey', 'zKey', 'rowKey', 'colKey',
] as const;

export type GroundingOutcome = 'ok' | 'repaired' | 'violation';

export interface GroundingFinding {
  renderType: string;
  prop: string;
  value: string;
  outcome: GroundingOutcome;
  /** Canonical spelling, when outcome === 'repaired'. */
  repairedTo?: string;
  /** How it resolved: 'case' or 'metric-label'. */
  via?: string;
}

export interface GroundingReport {
  checked: number;
  ok: number;
  repaired: number;
  violations: number;
  findings: GroundingFinding[];
}

export interface CanonicalSchema {
  /** Physical columns of the table. */
  columns: Array<{ column: string; dataType: string; role: string }>;
  /** Confirmed metric-label → column mappings (MEASURED_BY edges). */
  metrics: Array<{ label: string; column: string }>;
}

interface CardLike {
  renderType: string;
  props: Record<string, any>;
  children?: CardLike[];
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/%/g, 'pct').replace(/[^a-z0-9]+/g, '');
}

/**
 * Pure grounding check. Returns findings and (optionally) repaired cards.
 * `apply: false` — the shadow path — reports without touching the cards.
 */
export function checkCardGrounding<T extends CardLike>(
  cards: T[],
  schema: CanonicalSchema,
  apply: boolean,
): { report: GroundingReport; cards: T[] } {
  const byExact = new Set(schema.columns.map(c => c.column));
  const byNormalized = new Map<string, string>();
  for (const c of schema.columns) byNormalized.set(normalize(c.column), c.column);

  // Metric display name → physical column. This is the repair fixColumnCasing cannot do.
  const byMetricLabel = new Map<string, string>();
  for (const m of schema.metrics) byMetricLabel.set(normalize(m.label), m.column);

  const findings: GroundingFinding[] = [];
  let checked = 0, ok = 0, repaired = 0, violations = 0;

  const resolveOne = (renderType: string, prop: string, value: string): string => {
    checked += 1;
    if (byExact.has(value)) { ok += 1; return value; }

    const norm = normalize(value);
    const byCase = byNormalized.get(norm);
    if (byCase) {
      repaired += 1;
      findings.push({ renderType, prop, value, outcome: 'repaired', repairedTo: byCase, via: 'case' });
      return byCase;
    }

    const byMetric = byMetricLabel.get(norm);
    if (byMetric) {
      repaired += 1;
      findings.push({ renderType, prop, value, outcome: 'repaired', repairedTo: byMetric, via: 'metric-label' });
      return byMetric;
    }

    violations += 1;
    findings.push({ renderType, prop, value, outcome: 'violation' });
    return value; // left as-is; enforcement is the caller's decision, not ours
  };

  const walk = (card: T): T => {
    const props = { ...card.props };

    for (const key of COLUMN_PROPS) {
      if (typeof props[key] === 'string' && props[key]) {
        const resolved = resolveOne(card.renderType, key, props[key]);
        if (apply) props[key] = resolved;
      }
    }

    if (Array.isArray(props.columns)) {
      const resolved = props.columns.map((c: unknown) =>
        typeof c === 'string' ? resolveOne(card.renderType, 'columns[]', c) : c);
      if (apply) props.columns = resolved;
    }

    // Children are the same card shape; the cast keeps the generic caller-facing type
    // without forcing every consumer to declare a recursive T.
    const children = card.children?.map(c => walk(c as T)) as CardLike[] | undefined;
    return { ...card, props, ...(children ? { children } : {}) };
  };

  const out = cards.map(walk);
  return {
    report: { checked, ok, repaired, violations, findings },
    cards: apply ? out : cards,
  };
}

/**
 * Validate against the live graph.
 *
 * Returns the ORIGINAL cards untouched whenever KAG is inactive, in shadow mode, or
 * the graph cannot answer — consistent with the rest of KAG, an unavailable graph
 * degrades the grounding, never the response.
 */
export async function validateCardGrounding<T extends CardLike>(
  cards: T[],
  table: string,
): Promise<{ cards: T[]; report: GroundingReport | null }> {
  if (!isKagActive() || !table || cards.length === 0) return { cards, report: null };

  try {
    const schema = await canonicalColumnsFor(table);
    if (!schema) return { cards, report: null };

    // Shadow: measure, do not mutate. Same gate that governs Phase 3.
    const apply = !KAG_CONFIG.shadow;
    const { report, cards: next } = checkCardGrounding(cards, schema, apply);

    recordValidation(report.repaired, report.violations);
    trace({
      validation: {
        checked: report.checked, repaired: report.repaired, violations: report.violations,
        examples: report.findings.filter(f => f.outcome !== 'ok').slice(0, 4).map(f =>
          f.outcome === 'repaired' ? `${f.prop} "${f.value}" → ${f.repairedTo} (${f.via})` : `${f.prop} "${f.value}" ✗`),
      },
    });

    if (report.repaired || report.violations) {
      const summary = report.findings
        .filter(f => f.outcome !== 'ok')
        .slice(0, 6)
        .map(f => f.outcome === 'repaired'
          ? `${f.prop}:"${f.value}"→${f.repairedTo}(${f.via})`
          : `${f.prop}:"${f.value}"✗`)
        .join(' ');
      console.log(
        `[KAG Grounding] table=${table} checked=${report.checked} ok=${report.ok} ` +
        `repaired=${report.repaired} violations=${report.violations} ` +
        `applied=${apply} ${summary}`,
      );
    }

    return { cards: next, report };
  } catch (err) {
    console.warn('[KAG Grounding] suppressed error:', (err as Error).message?.slice(0, 160));
    return { cards, report: null };
  }
}
