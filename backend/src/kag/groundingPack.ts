// Grounding pack — serialize a RetrievedSubgraph into the compact, deterministic
// text block that replaces the full-catalog injection (plan §4.5).
//
// Deterministic ordering matters for two reasons beyond tidiness: the pack is part
// of a cached prompt (unstable ordering defeats prompt caching), and shadow-mode
// token comparisons are meaningless if the same subgraph serializes differently
// across runs.
//
// Pure — no Neo4j, no I/O. Unit-testable against a hand-built subgraph.

import type { KagNode, KagEdge, RetrievedSubgraph } from './types';

/** ~4 chars per token. Rough, but consistent — used only for relative comparison. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface PackOptions {
  /** Soft ceiling. Tables are emitted in score order until adding one would exceed it. */
  maxTokens?: number;
  /** Cap on tables described in full, regardless of budget. */
  maxTables?: number;
  /**
   * table → tables sharing a key. Supplied by the caller rather than read from the
   * subgraph, because JOINS_ON is deliberately NOT traversed (it leaks score between
   * unrelated tables — see kagRetriever.TRAVERSAL_RELS). This keeps the pack pure.
   */
  joinsByTable?: Record<string, string[]>;
}

interface TableFacts {
  table: string;
  score: number;
  domain: string;
  reports: string[];
  metrics: Array<{ label: string; column: string; dataType: string }>;
  dimensions: Array<{ column: string; dataType: string }>;
  orderBy: string;
  rowLimit: number;
  /** Tables reachable by a confirmed shared key. */
  joins: string[];
}

/**
 * Collect, per candidate table, the facts a generator actually needs: which reports
 * describe it, which metrics resolve to which physical columns, and which columns
 * are breakdown axes.
 */
function collectFacts(sub: RetrievedSubgraph, joinsByTable: Record<string, string[]> = {}): TableFacts[] {
  const byId = new Map<string, KagNode>(sub.nodes.map(n => [n.id, n]));
  const tableNodeByName = new Map<string, KagNode>();
  for (const n of sub.nodes) {
    if (n.type === 'Table') tableNodeByName.set((n.props?.table as string) ?? n.label, n);
  }

  const edgesFrom = new Map<string, KagEdge[]>();
  const edgesTo = new Map<string, KagEdge[]>();
  for (const e of sub.edges) {
    if (!edgesFrom.has(e.from)) edgesFrom.set(e.from, []);
    if (!edgesTo.has(e.to)) edgesTo.set(e.to, []);
    edgesFrom.get(e.from)!.push(e);
    edgesTo.get(e.to)!.push(e);
  }

  const facts: TableFacts[] = [];

  for (const candidate of sub.candidateTables) {
    const tableNode = tableNodeByName.get(candidate.table);
    if (!tableNode) continue;

    // Reports that name this table (Report -SOURCED_FROM-> Table).
    const reports = (edgesTo.get(tableNode.id) ?? [])
      .filter(e => e.type === 'SOURCED_FROM')
      .map(e => byId.get(e.from))
      .filter((n): n is KagNode => !!n && n.type === 'Report')
      .map(n => n.label);

    // Columns of this table, split by the role the builder assigned.
    const columns = (edgesFrom.get(tableNode.id) ?? [])
      .filter(e => e.type === 'HAS_COLUMN')
      .map(e => byId.get(e.to))
      .filter((n): n is KagNode => !!n && n.type === 'Column');

    // Metric → Column, but only mappings a human confirmed (MEASURED_BY is never
    // written from similarity guesses — see kagBuilder).
    const metrics: TableFacts['metrics'] = [];
    for (const col of columns) {
      for (const e of edgesTo.get(col.id) ?? []) {
        if (e.type !== 'MEASURED_BY') continue;
        const metric = byId.get(e.from);
        if (metric?.type !== 'Metric') continue;
        metrics.push({
          label: metric.label,
          column: col.label,
          dataType: String(col.props?.dataType ?? 'UNKNOWN'),
        });
      }
    }

    const dimensions = columns
      .filter(c => c.props?.role === 'dimension')
      .map(c => ({ column: c.label, dataType: String(c.props?.dataType ?? 'UNKNOWN') }));

    // Supplied by the caller (see PackOptions.joinsByTable) — not walked.
    const joins = joinsByTable[candidate.table] ?? [];

    const domainEdge = (edgesFrom.get(tableNode.id) ?? []).find(e => e.type === 'IN_DOMAIN');
    const reportDomain = reports.length
      ? (byId.get((edgesTo.get(tableNode.id) ?? []).find(e => e.type === 'SOURCED_FROM')!.from)?.props?.domain as string)
      : undefined;

    facts.push({
      table: candidate.table,
      score: candidate.score,
      domain: reportDomain ?? (domainEdge ? byId.get(domainEdge.to)?.label ?? '' : ''),
      // Deterministic: sort every list, dedupe.
      reports: [...new Set(reports)].sort(),
      metrics: [...new Map(metrics.map(m => [`${m.label}|${m.column}`, m])).values()]
        .sort((a, b) => a.label.localeCompare(b.label)),
      dimensions: [...new Map(dimensions.map(d => [d.column, d])).values()]
        .sort((a, b) => a.column.localeCompare(b.column)),
      orderBy: String(tableNode.props?.orderBy ?? ''),
      rowLimit: Number(tableNode.props?.rowLimit ?? 0),
      joins: [...new Set(joins)].sort(),
    });
  }

  return facts;
}

function renderTable(f: TableFacts): string {
  const lines: string[] = [];
  const head = f.reports.length ? `"${f.reports[0]}" → ` : '';
  lines.push(`[${f.domain || 'Unknown'}] ${head}table: ${f.table} (score ${f.score.toFixed(2)})`);

  if (f.metrics.length) {
    lines.push(`  metrics: ${f.metrics.map(m => `${m.label} → ${m.column} (${m.dataType})`).join(', ')}`);
  }
  if (f.dimensions.length) {
    lines.push(`  dimensions: ${f.dimensions.map(d => `${d.column} (${d.dataType})`).join(', ')}`);
  }
  if (f.joins.length) {
    // Lets the model say "that needs outlet data, which lives in X" instead of
    // silently answering from whichever single table it happened to be handed.
    lines.push(`  joinable with: ${f.joins.join(', ')}`);
  }
  if (f.orderBy || f.rowLimit) {
    lines.push(`  order: ${f.orderBy || 'n/a'}, limit ${f.rowLimit || 'n/a'}`);
  }
  return lines.join('\n');
}

export interface GroundingPack {
  text: string;
  tokens: number;
  tablesIncluded: string[];
  /** True when the budget or table cap dropped a candidate the retriever returned. */
  clipped: boolean;
}

/**
 * Serialize to the pack format. Returns an empty pack (text: '') when there is
 * nothing grounded to say — callers must fall back to the full catalog rather than
 * sending an empty RELEVANT DATA block, which reads as "there is no data".
 */
export function buildGroundingPack(sub: RetrievedSubgraph, opts: PackOptions = {}): GroundingPack {
  const maxTokens = opts.maxTokens ?? 600;
  const maxTables = opts.maxTables ?? 5;

  const facts = collectFacts(sub, opts.joinsByTable ?? {});
  if (facts.length === 0) {
    return { text: '', tokens: 0, tablesIncluded: [], clipped: false };
  }

  const header = 'RELEVANT DATA (retrieved for this query):';
  const footer = 'RULES: use ONLY the table and column names above, verbatim.';

  const blocks: string[] = [];
  const included: string[] = [];
  let clipped = false;

  for (const f of facts.slice(0, maxTables)) {
    const block = renderTable(f);
    const candidateText = [header, ...blocks, block, footer].join('\n');
    if (blocks.length > 0 && estimateTokens(candidateText) > maxTokens) {
      clipped = true;
      break;
    }
    blocks.push(block);
    included.push(f.table);
  }

  if (facts.length > included.length) clipped = true;

  const text = [header, ...blocks, footer].join('\n');
  return { text, tokens: estimateTokens(text), tablesIncluded: included, clipped };
}
