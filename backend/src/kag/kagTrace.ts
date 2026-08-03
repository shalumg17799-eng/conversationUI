// Per-request KAG trace — the demo surface.
//
// KAG's work is spread across modules (retrieval in kagRetriever, grounding in
// kagGrounding, filters and routing likewise, validation in kagValidator) and each is
// called from a different depth of the pipeline. Threading a trace object through
// every signature would touch a dozen call sites and put demo plumbing into function
// contracts.
//
// AsyncLocalStorage gives each in-flight request its own store instead. Concurrency is
// the reason: a module-level "last trace" variable would interleave two users' traces
// under any real load and quietly show the wrong numbers — the one thing a demo must
// not do.
//
// Every function here is fail-soft. Tracing is observation; if it throws, a user's
// report must not.

import { AsyncLocalStorage } from 'async_hooks';
import type { RoutingVerdict } from './types';

export interface KagTrace {
  query: string;
  startedAt: number;

  retrieval?: {
    source: string;
    latencyMs: number;
    seeds: Array<{ id: string; score: number }>;
    candidates: Array<{ table: string; score: number }>;
    nodes: number;
    truncated: boolean;
  };
  grounding?: {
    source: string;
    packTokens: number;
    catalogTokens: number;
    tables: string[];
    fallbackReason?: string;
  };
  routing?: {
    modelTable: string | null;
    kagTable: string | null;
    score?: number;
    overridden: boolean;
    /**
     * WHY the table was or wasn't changed. `overridden` is a boolean, and a boolean
     * cannot tell "KAG agreed" apart from "KAG never ran" — both are false. Reporting
     * the second as the first credits KAG with a decision it did not make, which is the
     * one thing a demo surface must never do. See RoutingVerdict in kagGrounding.
     */
    verdict: RoutingVerdict;
    reason: string;
  };
  /**
   * Shadow mode only: the pack KAG WOULD have sent. Kept separate from `grounding`,
   * which records what actually went into the prompt (the markdown fallback while
   * shadowing). Merging them would report a token saving that never happened.
   */
  shadowPack?: { packTokens: number; catalogTokens: number; tables: string[] };
  entities?: Array<{ column: string; values: string[] }>;
  validation?: { checked: number; repaired: number; violations: number; examples: string[] };
  affinity?: { suggested: string[]; chosen: string[] };
}

const storage = new AsyncLocalStorage<KagTrace>();

/** Run `fn` with a fresh trace bound to this async context. */
export function runWithTrace<T>(query: string, fn: () => Promise<T>): Promise<T> {
  return storage.run({ query, startedAt: Date.now() }, fn);
}

/** Current trace, or null outside a traced request (scripts, tests, warmup). */
export function currentTrace(): KagTrace | null {
  return storage.getStore() ?? null;
}

/** Merge a fragment into the active trace. No-op when untraced. */
export function trace(patch: Partial<KagTrace>): void {
  try {
    const t = storage.getStore();
    if (t) Object.assign(t, patch);
  } catch { /* observation must never break a request */ }
}

/**
 * One-line console banner. Deliberately distinctive — during a demo the backend log is
 * a wall of BigQuery and pipeline chatter, and the KAG contribution needs to be
 * findable at a glance rather than reconstructed from six interleaved lines.
 */
export function logTraceBanner(t: KagTrace): void {
  try {
    const bits: string[] = [];
    if (t.retrieval) {
      const top = t.retrieval.candidates[0];
      bits.push(`retrieved ${t.retrieval.source} ${t.retrieval.latencyMs}ms` +
        `${top ? ` → ${top.table}@${top.score.toFixed(2)}` : ' → no candidate'}`);
    }
    if (t.grounding) {
      const saved = t.grounding.catalogTokens - t.grounding.packTokens;
      bits.push(t.grounding.source === 'kag-pack'
        ? `pack ${t.grounding.packTokens}tok (saved ${saved})`
        : `fallback:${t.grounding.fallbackReason ?? t.grounding.source}`);
    }
    if (t.shadowPack) {
      const saved = t.shadowPack.catalogTokens - t.shadowPack.packTokens;
      bits.push(`SHADOW pack would be ${t.shadowPack.packTokens}tok vs ${t.shadowPack.catalogTokens} (would save ${saved})`);
    }
    // Same distinction as the browser panel: never print a verdict that implies KAG
    // had an opinion when it did not. `not-consulted` prints nothing at all — silence
    // is the honest report for a request KAG sat out.
    if (t.routing) {
      const r = t.routing;
      if (r.verdict === 'overrode') bits.push(`OVERRODE ${r.modelTable} → ${r.kagTable}`);
      else if (r.verdict === 'agreed') bits.push(`routing agreed (${r.kagTable})`);
      else if (r.verdict === 'deferred') bits.push(`routing DEFERRED — preferred ${r.kagTable}, ${r.reason}`);
      else if (r.verdict === 'no-opinion') bits.push('routing no candidate');
    }
    if (t.entities?.length) bits.push(`filters ${t.entities.map(e => `${e.column}=${e.values.join('|')}`).join(',')}`);
    if (t.validation && (t.validation.repaired || t.validation.violations)) {
      bits.push(`grounding repaired=${t.validation.repaired} violations=${t.validation.violations}`);
    }
    if (!bits.length) return;
    console.log(`\n┌─ KAG ─────────────────────────────────────────────────\n` +
      bits.map(b => `│ ${b}`).join('\n') +
      `\n└───────────────────────────────────────────────────────\n`);
  } catch { /* ignore */ }
}
