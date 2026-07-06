import { ShapeSignature } from '../types';
import { ReportCard } from './llmHandler';
import { ConstraintSet } from './componentSelector';
import { REGISTRY_BY_TYPE } from '../registry/componentRegistry';
import { validateTree } from './uiValidator';

// Phase 5: the Governor — the first component allowed to modify generated output.
// Flow: validate → retry(once, structural only) → govern(trim, deterministic) → fallback.
// Gated by ENABLE_GOVERNOR: off | shadow | enforce.

export type GovernorMode = 'off' | 'shadow' | 'enforce';

export function governorMode(): GovernorMode {
  const v = (process.env.ENABLE_GOVERNOR || 'off').toLowerCase();
  return v === 'shadow' || v === 'enforce' ? v : 'off';
}

export type GovernorAction =
  | 'structural_retry' | 'drop_card' | 'primary_cap' | 'trim_budget' | 'fallback'
  | (string & {}); // open union — also carries 'layout_passthrough'; keeping it un-named avoids
                   // forcing a new required key in Record<GovernorAction,number> (governorTelemetry.ts)

export interface GovernorDecision {
  action: GovernorAction;
  detail: string;
  component?: string;
}

export interface GovernorOutcome {
  mode: GovernorMode;
  cards: ReportCard[];       // what to render — modified only in enforce mode
  originalCount: number;
  finalCount: number;
  decisions: GovernorDecision[];
  retried: boolean;
  usedFallback: boolean;
  changed: boolean;          // enforce changed output (or shadow would have)
}

export interface GovernorInput {
  cards: ReportCard[];
  constraints: ConstraintSet;
  shape: ShapeSignature;
  provider: string;
  mode: GovernorMode;
  regenerate: (structuralErrors: string[]) => Promise<ReportCard[]>;
  fallback: () => ReportCard[];
}

// ── Structural validation ─────────────────────────────────────────────────────
export function structuralErrors(cards: ReportCard[]): string[] {
  return validateTree(cards as any).violations.map(v => `${v.component}:${v.category}:${v.detail}`);
}

// ── Governance trim (deterministic; no retry) ─────────────────────────────────
export function applyGovernance(cards: ReportCard[], c: ConstraintSet): { kept: ReportCard[]; decisions: GovernorDecision[] } {
  const decisions: GovernorDecision[] = [];

  // full_dashboard = no restrictions (per spec) → passthrough.
  if (c.outputMode === 'full_dashboard') return { kept: cards, decisions };

  const allowed = new Set(c.allowedComponents);
  const primaryFamily = c.primaryRequirement.family;
  const primaryMax = c.primaryRequirement.max;
  const kept: ReportCard[] = [];
  let primaryCount = 0;

  for (const card of cards) {
    const spec = REGISTRY_BY_TYPE[card.renderType];
    const family = spec?.family;

    // Layout wrappers are TRANSPARENT: govern their children independently and keep the
    // wrapper only if ≥1 child survives. Prevents dropping valid nested cards (a KPI/chart)
    // just because the wrapper's own family (layout) isn't allowed by the mode.
    if (spec?.isLayoutWrapper === true) {
      const childCards = Array.isArray(card.children) ? card.children : [];
      const childResult = applyGovernance(childCards, c);
      decisions.push(...childResult.decisions);
      if (childResult.kept.length === 0) {
        decisions.push({ action: 'drop_card', component: card.renderType, detail: 'layout_wrapper_empty' });
        continue;
      }
      if (kept.length >= c.maxCards) {
        decisions.push({ action: 'trim_budget', component: card.renderType, detail: `exceeds maxCards ${c.maxCards}` });
        continue;
      }
      decisions.push({ action: 'layout_passthrough', component: card.renderType, detail: `${childResult.kept.length}/${childCards.length} children kept` });
      kept.push({ ...card, children: childResult.kept });
      continue;
    }

    if (allowed.size > 0 && !allowed.has(card.renderType)) {
      decisions.push({ action: 'drop_card', component: card.renderType, detail: 'component_not_allowed' });
      continue;
    }
    if (allowed.size === 0) {
      decisions.push({ action: 'drop_card', component: card.renderType, detail: 'no_components_allowed' });
      continue;
    }
    if (primaryFamily && family === primaryFamily && primaryMax !== undefined) {
      if (primaryCount >= primaryMax) {
        decisions.push({ action: 'primary_cap', component: card.renderType, detail: `exceeds ${primaryFamily} max ${primaryMax}` });
        continue;
      }
      primaryCount++;
    }
    if (kept.length >= c.maxCards) {
      decisions.push({ action: 'trim_budget', component: card.renderType, detail: `exceeds maxCards ${c.maxCards}` });
      continue;
    }
    kept.push(card);
  }

  return { kept, decisions };
}

// ── Governed fallback (obeys outputMode + shape + registry) ───────────────────
const bestDimension = (s: ShapeSignature) =>
  s.dimensionColumns.find(c => !/(_id|_key|_code|_num|rank)$/i.test(c)) ?? s.dimensionColumns[0];
const topMeasures = (s: ShapeSignature) => s.measureColumns.slice(0, 4);

function chartFor(shape: ShapeSignature, c: ConstraintSet): ReportCard | null {
  const cands = shape.isTimeSeries ? ['LineChart', 'AreaChart'] : ['BarChart', 'RankedList'];
  const type = cands.find(t => c.allowedComponents.includes(t));
  const dim = bestDimension(shape);
  const y = topMeasures(shape)[0];
  if (!type || !dim || !y) return null;
  if (type === 'RankedList') return { renderType: 'RankedList', props: { title: `${y} by ${dim}`, labelKey: dim, valueKey: y } };
  return { renderType: type, props: { title: `${y} by ${dim}`, xKey: shape.isTimeSeries ? (shape.timeColumn ?? dim) : dim, yKey: y } };
}

export function generateGovernedFallback(shape: ShapeSignature, c: ConstraintSet): ReportCard[] {
  const out: ReportCard[] = [];
  const fam = c.primaryRequirement.family;

  if (fam === 'metric') {
    out.push({ renderType: 'KPICard', props: { title: topMeasures(shape)[0] ?? 'Metric', value: '—' } });
  } else if (fam === 'chart') {
    const ch = chartFor(shape, c);
    out.push(ch ?? { renderType: 'KPICard', props: { title: topMeasures(shape)[0] ?? 'Metric', value: '—' } });
  } else if (fam === 'table') {
    out.push({ renderType: 'Table', props: { title: 'Data Detail', columns: [bestDimension(shape), ...topMeasures(shape)].filter(Boolean).slice(0, 8) } });
  } else if (fam === 'narrative') {
    out.push({ renderType: 'SummaryText', props: { text: 'Summary of the available data.' } });
  } else {
    // full_dashboard / no primary — small dashboard
    out.push({ renderType: 'KPIGrid', props: { metrics: topMeasures(shape).map(m => ({ title: m, value: '—' })) } });
    const ch = chartFor(shape, c);
    if (ch) out.push(ch);
    out.push({ renderType: 'Table', props: { title: 'Data Detail', columns: [bestDimension(shape), ...topMeasures(shape)].filter(Boolean).slice(0, 8) } });
  }

  const capped = out.filter(card => c.allowedComponents.length === 0 || c.allowedComponents.includes(card.renderType) || c.outputMode === 'full_dashboard');
  return capped.slice(0, Math.max(1, c.maxCards));
}

// ── Orchestrator ──────────────────────────────────────────────────────────────
function log(mode: GovernorMode, d: GovernorDecision): void {
  console.log(`[Governor] mode=${mode} action=${d.action}${d.component ? ` component=${d.component}` : ''} reason=${d.detail}`);
}

export async function governReport(input: GovernorInput): Promise<GovernorOutcome> {
  const { mode, constraints, cards } = input;
  const originalCount = cards.length;

  if (mode === 'off') {
    return { mode, cards, originalCount, finalCount: originalCount, decisions: [], retried: false, usedFallback: false, changed: false };
  }

  // ── SHADOW: simulate only. No regenerate, no fallback, no output change. ──
  if (mode === 'shadow') {
    const decisions: GovernorDecision[] = [];
    const sErrs = structuralErrors(cards);
    if (sErrs.length) decisions.push({ action: 'structural_retry', detail: `would retry: ${sErrs.join('; ')}` });
    const sim = applyGovernance(cards, constraints);
    decisions.push(...sim.decisions);
    if (sim.kept.length === 0 && constraints.maxCards > 0) decisions.push({ action: 'fallback', detail: 'would use governed fallback' });
    decisions.forEach(d => log('shadow', d));
    const changed = decisions.length > 0;
    return { mode, cards, originalCount, finalCount: originalCount, decisions, retried: false, usedFallback: false, changed };
  }

  // ── ENFORCE: actually modify. ──
  const decisions: GovernorDecision[] = [];
  let working = cards;
  let retried = false;
  let usedFallback = false;

  // 1. Structural validation → retry once (structural failures only).
  const sErrs = structuralErrors(working);
  if (sErrs.length) {
    decisions.push({ action: 'structural_retry', detail: sErrs.join('; ') });
    try {
      const regenerated = await input.regenerate(sErrs);
      retried = true;
      if (structuralErrors(regenerated).length === 0) {
        working = regenerated;
      } else {
        working = input.fallback();
        usedFallback = true;
        decisions.push({ action: 'fallback', detail: 'retry still structurally invalid' });
      }
    } catch (err) {
      working = input.fallback();
      usedFallback = true;
      decisions.push({ action: 'fallback', detail: `retry threw: ${(err as Error)?.message ?? err}` });
    }
  }

  // 2. Governance trim (deterministic).
  const govResult = applyGovernance(working, constraints);
  decisions.push(...govResult.decisions);
  let finalCards = govResult.kept;

  // 3. If governance emptied the report, fall back (then re-trim to budget).
  if (finalCards.length === 0 && constraints.maxCards > 0) {
    const fb = input.fallback();
    finalCards = applyGovernance(fb, constraints).kept;
    if (finalCards.length === 0) finalCards = fb.slice(0, Math.max(1, constraints.maxCards)); // last-resort safety
    usedFallback = true;
    decisions.push({ action: 'fallback', detail: 'governance produced 0 cards' });
  }

  decisions.forEach(d => log('enforce', d));
  const changed = retried || usedFallback || finalCards.length !== originalCount || govResult.decisions.length > 0;
  return { mode, cards: finalCards, originalCount, finalCount: finalCards.length, decisions, retried, usedFallback, changed };
}
