// KAG graph builder — DATA_SOURCES + REPORT_ANGLES + BigQuery schema + glossary → Neo4j.
//
// Two hard rules:
//   1. Physical facts come from BigQuery. Semantics come from the glossary. Neither
//      is ever guessed. A metric with no confirmed column produces a PROPOSAL in
//      unmapped.json, never a MEASURED_BY edge.
//   2. Rebuilds are idempotent. Nodes are stamped with builtAt and stale ones are
//      swept, so a removed table does not linger in the graph forever.

import fs from 'fs/promises';
import path from 'path';
import {
  DATA_SOURCES, REPORT_ANGLES, ALL_TABLES, ALL_DOMAINS, getSourceByTable,
} from '../services/dataSourceMap';
import { fetchTableSchema } from '../services/catalogRefresher';
import { runQueryWithMeta, qualifiedTable, PROJECT_ID, DATASET } from '../lib/bigqueryClient';
import { KAG_CONFIG } from './config';
import { GLOSSARY, isDimensionColumn } from './glossary';
import { runCypher } from './neo4jClient';
import { applySchema } from './schema';
import { buildAffinity } from './kagAffinity';
import {
  KagNode, KagEdge, KagGraph, KagNodeType, KagRelType, KAG_REL_TYPES,
  BuildReport, UnmappedMetric,
} from './types';

const UNMAPPED_PATH = path.resolve(__dirname, '../../data/kag/unmapped.json');
const BATCH_SIZE = 500;

/** Provenances the builder owns. Sweeping is scoped to these so telemetry-learned
 *  nodes and edges (Phase 6) survive a catalog rebuild. */
const MANAGED_PROVENANCE = ['catalog', 'bigquery', 'glossary'];

// ── Helpers ──────────────────────────────────────────────────────────────────

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/%/g, 'pct')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function nodeId(type: KagNodeType, ...parts: string[]): string {
  return `${type}:${parts.map(slugify).filter(Boolean).join('--')}`;
}

/** Tokenized similarity, used ONLY to propose metric→column candidates for human
 *  review. Deliberately simple: it never writes to the graph. */
export function similarity(a: string, b: string): number {
  const norm = (s: string) => s.toLowerCase().replace(/%/g, 'pct').split(/[^a-z0-9]+/).filter(Boolean);
  const ta = norm(a), tb = norm(b);
  if (!ta.length || !tb.length) return 0;

  const sa = new Set(ta), sb = new Set(tb);
  let shared = 0;
  for (const t of sa) if (sb.has(t)) shared += 1;
  const jaccard = shared / new Set([...ta, ...tb]).size;

  const ja = ta.join(''), jb = tb.join('');
  const containment = ja.includes(jb) || jb.includes(ja) ? 0.3 : 0;

  return Math.min(1, jaccard + containment);
}

/** Neo4j properties must be primitives or arrays of primitives — nested maps throw.
 *  Anything structured is JSON-encoded rather than silently dropped. */
function flattenProps(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
    } else if (Array.isArray(v) && v.every(x => typeof x === 'string' || typeof x === 'number')) {
      out[k] = v;
    } else {
      out[k] = JSON.stringify(v);
    }
  }
  return out;
}

// ── Graph assembly (pure — no Neo4j, no side effects; unit-testable) ──────────

export interface EntityStats {
  columnsScanned: number;
  /** Dimensions dropped, with the reason. Surfaced so a cap is never silent. */
  columnsSkipped: string[];
  entitiesAdded: number;
  capped: boolean;
}

export interface AssembledGraph extends KagGraph {
  unmapped: UnmappedMetric[];
  tablesWithSchema: string[];
  tablesWithoutSchema: string[];
  entityStats: EntityStats;
}

/**
 * @param includeEntities Phase 5 entity scan. Costs one BigQuery query per STRING
 *   dimension column, so `kag:build --no-entities` skips it for a fast rebuild.
 */
export async function assembleGraph(includeEntities = true): Promise<AssembledGraph> {
  const nodes = new Map<string, KagNode>();
  const edges: KagEdge[] = [];

  const addNode = (n: KagNode) => {
    const existing = nodes.get(n.id);
    if (existing) {
      // Merge aliases on repeat definition (a metric named by several reports).
      existing.aliases = [...new Set([...existing.aliases, ...n.aliases])];
      Object.assign(existing.props, n.props);
      return;
    }
    nodes.set(n.id, n);
  };
  const addEdge = (e: KagEdge) => {
    if (!KAG_REL_TYPES.includes(e.type)) throw new Error(`Unknown relationship type: ${e.type}`);
    if (e.from === e.to) return;
    edges.push(e);
  };

  // ── 1. Domains ─────────────────────────────────────────────────────────────
  for (const domain of ALL_DOMAINS) {
    addNode({
      id: nodeId('Domain', domain),
      type: 'Domain',
      label: domain,
      aliases: GLOSSARY.domains[domain]?.aliases ?? [],
      props: {},
      provenance: 'catalog',
    });
  }

  // ── 2. Tables ──────────────────────────────────────────────────────────────
  // Schema is fetched FIRST because it decides which tables get a node at all.
  // A :Table node for a table that does not exist in BigQuery is worse than no
  // node: retrieval would happily route a query to it and the query would fail at
  // execution. DATA_SOURCES claims "every entry represents a real BQ table with
  // data", but that is an assertion, not a guarantee — BigQuery is the authority.
  // This mirrors the getAvailableDataSources() probe filter the server already
  // applies at runtime, and is what plan §Phase 3 requires of the pack itself.
  const tablesWithSchema: string[] = [];
  const tablesWithoutSchema: string[] = [];
  const schemaByTable = new Map<string, Array<{ column_name: string; data_type: string }>>();

  // Discover the whole warehouse, not just the curated list. `routable` is what keeps
  // this safe: a discovered-but-unexposed table gets a node and columns so the graph
  // KNOWS it, but scoreCandidates never routes to it.
  const routableTables = new Set(ALL_TABLES);
  let discoveredTables: string[] = [...ALL_TABLES];

  if (KAG_CONFIG.indexAllTables) {
    try {
      const { rows } = await runQueryWithMeta(
        `SELECT table_name FROM \`${PROJECT_ID}.${DATASET}\`.INFORMATION_SCHEMA.TABLES`);
      const exclude = new RegExp(KAG_CONFIG.tableExcludePattern, 'i');
      const all = rows.map((r: any) => String(r.table_name)).filter(t => !exclude.test(t));
      const extra = all.filter(t => !routableTables.has(t));
      discoveredTables = [...new Set([...ALL_TABLES, ...all])];
      console.log(`[KAG Builder] Discovered ${all.length} object(s) in ${DATASET}; ` +
        `${routableTables.size} routable, ${extra.length} indexed-only`);
    } catch (err) {
      console.warn('[KAG Builder] table discovery failed, falling back to DATA_SOURCES only:',
        (err as Error).message);
    }
  }

  for (const table of discoveredTables) {
    try {
      const cols = await fetchTableSchema(table);
      if (cols.length === 0) {
        tablesWithoutSchema.push(table);
        console.warn(`[KAG Builder] ${table}: schema query returned 0 columns`);
        continue;
      }
      schemaByTable.set(table, cols);
      tablesWithSchema.push(table);
    } catch (err) {
      // Non-fatal by design: the rest of the graph is still worth building, and a
      // loud warning beats a half-silent partial build.
      tablesWithoutSchema.push(table);
      console.warn(`[KAG Builder] ${table}: schema fetch FAILED — ${(err as Error).message}`);
    }
  }

  for (const table of schemaByTable.keys()) {
    const src = getSourceByTable(table);
    addNode({
      id: nodeId('Table', table),
      type: 'Table',
      label: table,
      aliases: [],
      props: {
        table,
        orderBy: src?.orderBy ?? '',
        rowLimit: src?.limit ?? 0,
        description: src?.description ?? '',
        // The safety boundary. Only DATA_SOURCES tables can be routed to; everything
        // else is indexed so the graph can answer "that data exists, over there".
        routable: routableTables.has(table),
      },
      provenance: routableTables.has(table) ? 'catalog' : 'bigquery',
    });
  }

  // ── 3. Reports (catalog reports + report angles) ────────────────────────────
  // A single table powers many reports; the descriptive label is what drives
  // generation, so angles are first-class Report nodes alongside DATA_SOURCES.
  interface ReportSeed { domain: string; label: string; table: string; description: string; kpis: string[]; origin: string }
  const reportSeeds: ReportSeed[] = [
    ...DATA_SOURCES.map(s => ({
      domain: s.domain, label: s.reportName, table: s.table,
      description: s.description, kpis: s.kpis, origin: 'data_source',
    })),
    ...REPORT_ANGLES.map(a => ({
      domain: a.domain, label: a.label, table: a.table,
      description: '', kpis: [] as string[], origin: 'report_angle',
    })),
  ];

  for (const seed of reportSeeds) {
    // A report whose table has no schema can never be served — the query engine
    // would fail at execution. Dropping it here keeps SOURCED_FROM edges from
    // dangling and keeps unservable reports out of retrieval and clarification.
    if (!schemaByTable.has(seed.table)) {
      console.warn(`[KAG Builder] Report "${seed.label}" skipped — backing table ${seed.table} has no schema`);
      continue;
    }
    const id = nodeId('Report', seed.domain, seed.label);
    addNode({
      id,
      type: 'Report',
      label: seed.label,
      aliases: [],
      props: { domain: seed.domain, table: seed.table, description: seed.description, origin: seed.origin },
      provenance: 'catalog',
    });
    addEdge({ from: id, to: nodeId('Domain', seed.domain), type: 'IN_DOMAIN', weight: 1.0, provenance: 'catalog' });
    addEdge({ from: id, to: nodeId('Table', seed.table), type: 'SOURCED_FROM', weight: 1.0, provenance: 'catalog' });
  }

  // ── 4. Metrics ─────────────────────────────────────────────────────────────
  // Union of every KPI named by a catalog report and every glossary metric.
  const metricLabels = new Set<string>([
    ...DATA_SOURCES.flatMap(s => s.kpis),
    ...Object.keys(GLOSSARY.metrics),
  ]);

  // Concept terms are folded into their targets' aliases so a query like "churn"
  // full-text-matches the Metric directly, within the 2-hop traversal budget.
  const termAliases = new Map<string, string[]>();
  for (const [term, def] of Object.entries(GLOSSARY.terms)) {
    for (const target of def.targets) {
      termAliases.set(target, [...(termAliases.get(target) ?? []), term]);
    }
  }

  for (const label of metricLabels) {
    const g = GLOSSARY.metrics[label];
    addNode({
      id: nodeId('Metric', label),
      type: 'Metric',
      label,
      aliases: [...new Set([...(g?.aliases ?? []), ...(termAliases.get(label) ?? [])])],
      props: { unit: g?.unit ?? 'unknown', kind: g?.kind ?? 'unknown', confirmedColumn: g?.column ?? '' },
      provenance: g ? 'glossary' : 'catalog',
    });
  }

  // Report → Metric. The critical path: a metric seed reaches a table via its report
  // even when no column mapping is confirmed yet.
  for (const s of DATA_SOURCES) {
    const reportNode = nodeId('Report', s.domain, s.reportName);
    for (const kpi of s.kpis) {
      addEdge({ from: reportNode, to: nodeId('Metric', kpi), type: 'REPORTS_ON', weight: 0.9, provenance: 'catalog' });
    }
  }

  // ── 5. Term nodes (explainability — retrieval uses the folded aliases above) ─
  for (const [term, def] of Object.entries(GLOSSARY.terms)) {
    const id = nodeId('Term', term);
    addNode({
      id, type: 'Term', label: term, aliases: [],
      props: { note: def.note ?? '' }, provenance: 'glossary',
    });
    for (const target of def.targets) {
      if (!metricLabels.has(target)) {
        console.warn(`[KAG Builder] Glossary term "${term}" targets unknown metric "${target}" — skipped`);
        continue;
      }
      addEdge({ from: id, to: nodeId('Metric', target), type: 'ALIAS_OF', weight: def.weight, provenance: 'glossary' });
    }
  }

  // ── 6. Columns + Dimensions (physical truth from BigQuery) ──────────────────
  // Schema was fetched in step 2 — it gates which tables exist at all.
  for (const [table, cols] of schemaByTable) {
    for (const col of cols) {
      const colId = nodeId('Column', table, col.column_name);
      const isDim = isDimensionColumn(col.column_name, col.data_type);
      addNode({
        id: colId,
        type: 'Column',
        label: col.column_name,
        aliases: [],
        props: { table, dataType: col.data_type, role: isDim ? 'dimension' : 'measure' },
        provenance: 'bigquery',
      });
      addEdge({ from: nodeId('Table', table), to: colId, type: 'HAS_COLUMN', weight: 1.0, provenance: 'bigquery' });

      if (isDim) {
        // One Dimension concept per column name, shared across tables — so
        // `territory_name` in two tables is a single breakdown axis.
        const dimId = nodeId('Dimension', col.column_name);
        addNode({
          id: dimId, type: 'Dimension', label: col.column_name, aliases: [],
          props: { dataType: col.data_type }, provenance: 'bigquery',
        });
        addEdge({ from: dimId, to: colId, type: 'HAS_COLUMN', weight: 1.0, provenance: 'bigquery' });
      }
    }
  }

  // ── 7. MEASURED_BY — confirmed mappings only; everything else is a proposal ──
  const unmapped: UnmappedMetric[] = [];

  for (const label of metricLabels) {
    const g = GLOSSARY.metrics[label];
    const tablesForMetric = [...new Set(
      DATA_SOURCES.filter(s => s.kpis.includes(label)).map(s => s.table),
    )];

    let confirmed = false;
    if (g?.column) {
      for (const table of tablesForMetric.length ? tablesForMetric : [...schemaByTable.keys()]) {
        const cols = schemaByTable.get(table);
        const hit = cols?.find(c => c.column_name === g.column);
        if (hit) {
          addEdge({
            from: nodeId('Metric', label),
            to: nodeId('Column', table, hit.column_name),
            type: 'MEASURED_BY', weight: 1.0, provenance: 'glossary',
          });
          confirmed = true;
        }
      }
      if (!confirmed) {
        console.warn(`[KAG Builder] Glossary maps "${label}" → "${g.column}" but no such column exists in ${tablesForMetric.join(', ') || 'any table'}`);
      }
    }

    if (!confirmed) {
      const candidates = tablesForMetric
        .flatMap(table => (schemaByTable.get(table) ?? []).map(c => ({
          table, column: c.column_name, dataType: c.data_type,
          similarity: +similarity(label, c.column_name).toFixed(3),
        })))
        .filter(c => c.similarity >= 0.25)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 3);

      unmapped.push({ metric: label, metricId: nodeId('Metric', label), tables: tablesForMetric, candidates });
    }
  }

  // ── 8. SLICED_BY — metric can be broken down by dimensions of its own tables ──
  for (const label of metricLabels) {
    const tablesForMetric = [...new Set(DATA_SOURCES.filter(s => s.kpis.includes(label)).map(s => s.table))];
    const dims = new Set<string>();
    for (const table of tablesForMetric) {
      for (const col of schemaByTable.get(table) ?? []) {
        if (isDimensionColumn(col.column_name, col.data_type)) dims.add(col.column_name);
      }
    }
    for (const dim of dims) {
      addEdge({
        from: nodeId('Metric', label), to: nodeId('Dimension', dim),
        type: 'SLICED_BY', weight: 0.8, provenance: 'bigquery',
      });
    }
  }

  // ── 9. JOINS_ON — only shared key-shaped columns of identical type ───────────
  const tableList = [...schemaByTable.keys()];
  for (let i = 0; i < tableList.length; i++) {
    for (let j = i + 1; j < tableList.length; j++) {
      const a = tableList[i], b = tableList[j];
      const colsB = new Map((schemaByTable.get(b) ?? []).map(c => [c.column_name, c.data_type]));
      const shared = (schemaByTable.get(a) ?? [])
        .filter(c => /_(id|name|key|code)$/i.test(c.column_name) && colsB.get(c.column_name) === c.data_type)
        .map(c => c.column_name);
      if (shared.length > 0) {
        addEdge({
          from: nodeId('Table', a), to: nodeId('Table', b), type: 'JOINS_ON',
          weight: 0.6, provenance: 'bigquery',
        });
      }
    }
  }

  // ── 10. Entities (Phase 5) — distinct values of low-cardinality STRING dimensions ─
  // This is what lets "how did Dallas do last quarter" seed on the entity and traverse
  // Entity → Dimension → Table, instead of failing to match any metric or report.
  //
  // Restricted to STRING columns on purpose: numeric and date dimensions (month_id,
  // date_id) are ranges, not named things a user says out loud, and they would consume
  // the entity budget without ever being a useful seed.
  const entityStats: EntityStats = { columnsScanned: 0, columnsSkipped: [], entitiesAdded: 0, capped: false };

  if (includeEntities) {
    outer:
    for (const [table, cols] of schemaByTable) {
      // Entities only for routable tables: a filter can only ever be applied to a
      // table we route to, and scanning all 22 objects would multiply BigQuery cost
      // for values that could never be used.
      if (!routableTables.has(table)) continue;
      for (const col of cols) {
        if (col.data_type.toUpperCase() !== 'STRING') continue;
        if (!isDimensionColumn(col.column_name, col.data_type)) continue;
        // Temporal columns are ranges, not named things a user says out loud. Some are
        // typed STRING here (`date`, `month_name`), so the type check alone lets them
        // through — they would spend the entity budget on 60 date literals that can
        // only ever produce false seed matches.
        if (/^(date|day|month|quarter|year|week|period|timestamp)/i.test(col.column_name)) {
          entityStats.columnsSkipped.push(`${table}.${col.column_name} (temporal)`);
          continue;
        }

        if (entityStats.entitiesAdded >= KAG_CONFIG.entityTotalCap) {
          entityStats.capped = true;
          console.warn(`[KAG Builder] Entity total cap (${KAG_CONFIG.entityTotalCap}) reached — remaining dimensions skipped`);
          break outer;
        }

        entityStats.columnsScanned += 1;
        // One query per column returns both the values AND the cardinality signal:
        // asking for cap+1 rows tells us we are over the cap without a second COUNT.
        const cap = KAG_CONFIG.entityCardinalityCap;
        try {
          const { rows } = await runQueryWithMeta(
            `SELECT DISTINCT \`${col.column_name}\` AS v
             FROM ${qualifiedTable(table)}
             WHERE \`${col.column_name}\` IS NOT NULL
             LIMIT ${cap + 1}`,
          );

          if (rows.length > cap) {
            // Over the cap: skip entirely rather than store an arbitrary prefix, which
            // would look like full coverage while silently missing most values.
            entityStats.columnsSkipped.push(`${table}.${col.column_name} (>${cap} distinct)`);
            continue;
          }

          // HAS_VALUE hangs off the COLUMN, not the Dimension concept. That is both
          // more accurate (a value lives in a physical column) and what makes entity
          // seeding work at all: Entity→Column→Table is 2 hops, inside KAG_MAX_HOPS,
          // whereas Entity→Dimension→Column→Table is 3 and silently reached no table.
          const colId = nodeId('Column', table, col.column_name);
          for (const row of rows) {
            const value = String((row as any).v ?? '').trim();
            if (!value) continue;

            const entId = nodeId('Entity', value);
            addNode({
              id: entId,
              type: 'Entity',
              label: value,
              aliases: [],
              // `column` and `table` are what make a parameterized WHERE clause
              // constructible from a matched entity alone.
              props: { value, column: col.column_name, table },
              provenance: 'bigquery',
            });
            addEdge({ from: colId, to: entId, type: 'HAS_VALUE', weight: 0.9, provenance: 'bigquery' });
            entityStats.entitiesAdded += 1;
          }
        } catch (err) {
          entityStats.columnsSkipped.push(`${table}.${col.column_name} (query failed)`);
          console.warn(`[KAG Builder] entity scan failed for ${table}.${col.column_name}: ${(err as Error).message}`);
        }
      }
    }

    console.log(
      `[KAG Builder] Entities: ${entityStats.entitiesAdded} added from ${entityStats.columnsScanned} column(s); ` +
      `${entityStats.columnsSkipped.length} skipped`,
    );
    // Never let a cap pass silently — a dropped dimension reads as "no such entity"
    // at query time, which is indistinguishable from a bug unless it was logged here.
    for (const s of entityStats.columnsSkipped) console.warn(`[KAG Builder]   skipped ${s}`);
  }

  return {
    nodes: [...nodes.values()],
    edges,
    unmapped,
    tablesWithSchema,
    tablesWithoutSchema,
    entityStats,
  };
}

// ── Neo4j write ──────────────────────────────────────────────────────────────

async function writeNodes(nodes: KagNode[], builtAt: string): Promise<void> {
  const byType = new Map<KagNodeType, KagNode[]>();
  for (const n of nodes) byType.set(n.type, [...(byType.get(n.type) ?? []), n]);

  for (const [type, group] of byType) {
    // Cypher cannot parameterize a label. `type` is a KagNodeType from our own
    // assembly, but validate anyway — this is the injection guard for writes.
    if (!/^[A-Za-z]+$/.test(type)) throw new Error(`Illegal node label: ${type}`);

    for (let i = 0; i < group.length; i += BATCH_SIZE) {
      const rows = group.slice(i, i + BATCH_SIZE).map(n => ({
        id: n.id,
        label: n.label,
        aliases: n.aliases,
        aliasText: n.aliases.join(' | '),
        provenance: n.provenance,
        props: flattenProps(n.props),
      }));

      await runCypher(
        `UNWIND $rows AS row
         MERGE (n:Kag {id: row.id})
         SET n:${type},
             n += row.props,
             n.type = $type,
             n.label = row.label,
             n.aliases = row.aliases,
             n.aliasText = row.aliasText,
             n.provenance = row.provenance,
             n.builtAt = $builtAt`,
        { rows, type, builtAt },
        { access: 'write', timeoutMs: 60_000, quiet: true },
      );
    }
  }
}

async function writeEdges(edges: KagEdge[]): Promise<void> {
  const byType = new Map<KagRelType, KagEdge[]>();
  for (const e of edges) byType.set(e.type, [...(byType.get(e.type) ?? []), e]);

  for (const [type, group] of byType) {
    if (!KAG_REL_TYPES.includes(type)) throw new Error(`Illegal relationship type: ${type}`);

    for (let i = 0; i < group.length; i += BATCH_SIZE) {
      const rows = group.slice(i, i + BATCH_SIZE);
      await runCypher(
        `UNWIND $rows AS row
         MATCH (a:Kag {id: row.from})
         MATCH (b:Kag {id: row.to})
         MERGE (a)-[r:${type}]->(b)
         SET r.weight = row.weight, r.provenance = row.provenance`,
        { rows },
        { access: 'write', timeoutMs: 60_000, quiet: true },
      );
    }
  }
}

/** Remove managed relationships before rewriting, so an edge deleted from the
 *  catalog does not survive as a stale path. Scoped to builder-owned provenances. */
async function clearManagedEdges(): Promise<void> {
  await runCypher(
    `MATCH (:Kag)-[r]->(:Kag) WHERE r.provenance IN $provenances DELETE r`,
    { provenances: MANAGED_PROVENANCE },
    { access: 'write', timeoutMs: 60_000, quiet: true },
  );
}

/** Mark-and-sweep: delete builder-owned nodes not stamped by this build. */
async function sweepStaleNodes(builtAt: string): Promise<number> {
  const rows = await runCypher<{ deleted: number }>(
    `MATCH (n:Kag)
     WHERE n.provenance IN $provenances AND (n.builtAt IS NULL OR n.builtAt <> $builtAt)
     WITH n, count(*) AS _
     DETACH DELETE n
     RETURN count(*) AS deleted`,
    { provenances: MANAGED_PROVENANCE, builtAt },
    { access: 'write', timeoutMs: 60_000, quiet: true },
  );
  return Number(rows[0]?.deleted ?? 0);
}

// ── Orchestration ────────────────────────────────────────────────────────────

/**
 * Full rebuild: assemble → apply schema → write → sweep → report.
 * Safe to call repeatedly; two consecutive runs must produce identical counts.
 */
export async function buildKagGraph(includeEntities = true): Promise<BuildReport> {
  const t0 = Date.now();
  const builtAt = new Date().toISOString();
  console.log('[KAG Builder] Starting graph build...');

  const assembled = await assembleGraph(includeEntities);
  await applySchema();
  await clearManagedEdges();
  await writeNodes(assembled.nodes, builtAt);
  await writeEdges(assembled.edges);
  const sweptNodes = await sweepStaleNodes(builtAt);

  // Phase 6 affinity runs AFTER the sweep: Component nodes carry provenance 'registry',
  // which is deliberately outside MANAGED_PROVENANCE, so learned weights survive a
  // catalog rebuild. Building them before the sweep would be harmless but confusing.
  try {
    await buildAffinity();
  } catch (err) {
    // Advisory layer — a failure here must not fail the build.
    console.warn('[KAG Builder] affinity build failed (non-fatal):', (err as Error).message);
  }

  const nodesByType: Record<string, number> = {};
  for (const n of assembled.nodes) nodesByType[n.type] = (nodesByType[n.type] ?? 0) + 1;
  const edgesByType: Record<string, number> = {};
  for (const e of assembled.edges) edgesByType[e.type] = (edgesByType[e.type] ?? 0) + 1;

  const report: BuildReport = {
    builtAt,
    nodeCount: assembled.nodes.length,
    edgeCount: assembled.edges.length,
    nodesByType,
    edgesByType,
    tablesWithSchema: assembled.tablesWithSchema,
    tablesWithoutSchema: assembled.tablesWithoutSchema,
    unmapped: assembled.unmapped,
    sweptNodes,
    durationMs: Date.now() - t0,
    entityStats: assembled.entityStats,
  };

  await writeUnmappedReport(builtAt, report.tablesWithoutSchema, report.unmapped);

  // Surface the catalog gap discovery just made visible: tables BigQuery has, that the
  // graph now knows about, but that no report exposes. This is the actionable list —
  // each one is a "break down by X" query waiting to fail.
  try {
    const unexposed = await runCypher<{ table: string; dims: string[] }>(
      `MATCH (t:Table) WHERE t.routable = false
       OPTIONAL MATCH (t)-[:HAS_COLUMN]->(c:Column) WHERE c.role = 'dimension'
       RETURN t.label AS table, collect(c.label)[0..6] AS dims ORDER BY table`,
      {}, { quiet: true },
    );
    if (unexposed.length) {
      console.log(`[KAG Builder] ${unexposed.length} table(s) indexed but NOT routable ` +
        `(no DATA_SOURCES entry — add one to make them queryable):`);
      for (const u of unexposed) {
        console.log(`  • ${u.table}${u.dims?.length ? ` — breakdowns: ${u.dims.join(', ')}` : ''}`);
      }
    }
  } catch { /* reporting only */ }

  console.log(
    `[KAG Builder] Done in ${report.durationMs}ms — ${report.nodeCount} nodes, ${report.edgeCount} edges, ` +
    `swept ${sweptNodes}, ${report.unmapped.length} unmapped metrics, ` +
    `schema ok for ${report.tablesWithSchema.length} table(s) (${ALL_TABLES.length} routable)`,
  );
  if (report.tablesWithoutSchema.length > 0) {
    console.warn(`[KAG Builder] NO SCHEMA for: ${report.tablesWithoutSchema.join(', ')} — ` +
      `Column/Dimension coverage is incomplete for these tables.`);
  }

  return report;
}

/**
 * Write the human review queue. Exported and independent of Neo4j so `kag:build --dry`
 * produces it too — reviewing proposed mappings should not require a graph database.
 */
export async function writeUnmappedReport(
  builtAt: string,
  tablesWithoutSchema: string[],
  unmapped: UnmappedMetric[],
): Promise<void> {
  // Gap 6 — the glossary is the one manual input, so make the manual step mechanical:
  // emit a paste-ready JSON block using the top candidate for each unmapped metric.
  // Still a HUMAN decision (nothing is auto-merged), but it removes the schema-hunting.
  const suggested: Record<string, unknown> = {};
  for (const u of unmapped) {
    const best = u.candidates[0];
    suggested[u.metric] = {
      column: best ? best.column : null,
      _candidate: best ? `${best.table}.${best.column} (similarity ${best.similarity})` : 'no candidate found',
      _otherOptions: u.candidates.slice(1).map(c => `${c.table}.${c.column} (${c.similarity})`),
    };
  }

  const payload = {
    builtAt,
    pasteReady: {
      _howToUse: 'Review each entry. Where the candidate is right, copy "column" into the '
               + 'matching metric in backend/src/kag/glossary.data.json and rebuild. Where it '
               + 'is wrong or absent, the metric has no backing data — fix upstream or remove '
               + 'the KPI from dataSourceMap.ts.',
      metrics: suggested,
    },
    note: 'Metrics with no confirmed column mapping. Confirm a candidate by setting '
        + '"column" for that metric in backend/src/kag/glossary.data.json, then rebuild. '
        + 'Candidates are name-similarity proposals only and are NOT in the graph.',
    tablesWithoutSchema,
    warning: tablesWithoutSchema.length > 0
      ? 'BigQuery schema was unavailable for the tables listed above, so NO column '
        + 'candidates could be proposed for their metrics. Fix BigQuery credentials and '
        + 'rebuild before reviewing this file.'
      : undefined,
    unmappedCount: unmapped.length,
    unmapped,
  };
  await fs.mkdir(path.dirname(UNMAPPED_PATH), { recursive: true });
  await fs.writeFile(UNMAPPED_PATH, JSON.stringify(payload, null, 2), 'utf-8');
  console.log(`[KAG Builder] Wrote ${unmapped.length} unmapped metrics to ${UNMAPPED_PATH}`);
}
