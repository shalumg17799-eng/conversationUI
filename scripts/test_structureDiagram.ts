// Regression tests for the KAG-sourced structure-diagram path (Track M2 → live).
//
// WHAT THIS PATH IS, AND WHY IT IS SEPARATE FROM test_drawIntent.ts.
//
// detectDrawingIntent routes PROCESS diagrams — escalation flows, journeys — to the
// BigQuery + LLM path, because that structure exists nowhere in our data and the labels
// want real measured values. detectStructureIntent routes questions about the SHAPE OF
// THE WAREHOUSE ("what feeds into take rate", "show me the schema") to KAG instead, where
// the answer is already held exactly. That path emits a mermaid-artifact with NO model
// call, so the only thing standing between the graph and the user is this serializer —
// which makes these assertions the whole safety net for it.
//
// Everything here runs against a synthetic KagGraph: no BigQuery, no Neo4j, no LLM, no
// network. assembleGraph() is deliberately not exercised — it is a ~28s schema scan, and
// a test that needs credentials is a test that gets skipped.
//
// Run: npm run test:structure   (from repo root)

import assert from 'node:assert/strict';
import { detectStructureIntent, detectDrawingIntent } from '../backend/src/services/llmHandler';
import {
  buildStructureDiagram, resolveStructureRoot, summarize,
} from '../backend/src/kag/structureDiagram';
import { guardMermaid } from '../backend/src/services/mermaidGuard';
import type { KagGraph } from '../backend/src/kag/types';

let passed = 0;
function t(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e: any) { console.error(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
}

// Mirrors the real graph's shape: Domain containers, a Report, the Table behind it, the
// Metric measured from that table, and the Columns underneath.
const G: KagGraph = {
  nodes: [
    { id: 'Domain:sales', type: 'Domain', label: 'Sales', aliases: [], props: {}, provenance: 'catalog' },
    { id: 'Report:sales--monthly-revenue-take-rate', type: 'Report', label: 'Monthly Revenue & Take Rate', aliases: [], props: {}, provenance: 'catalog' },
    { id: 'Table:fact-sug-monthly-rollup', type: 'Table', label: 'fact_sug_monthly_rollup', aliases: [], props: {}, provenance: 'bigquery' },
    { id: 'Metric:take-rate-pct', type: 'Metric', label: 'Take Rate', aliases: ['take rate %'], props: {}, provenance: 'glossary' },
    { id: 'Column:take-rate-pct', type: 'Column', label: 'take_rate_pct', aliases: [], props: {}, provenance: 'bigquery' },
    { id: 'Column:units-sold', type: 'Column', label: 'units_sold', aliases: [], props: {}, provenance: 'bigquery' },
    { id: 'Metric:churn', type: 'Metric', label: 'Churn', aliases: [], props: {}, provenance: 'glossary' },
  ],
  edges: [
    { from: 'Report:sales--monthly-revenue-take-rate', to: 'Domain:sales', type: 'IN_DOMAIN', weight: 1, provenance: 'catalog' },
    { from: 'Table:fact-sug-monthly-rollup', to: 'Domain:sales', type: 'IN_DOMAIN', weight: 1, provenance: 'catalog' },
    { from: 'Metric:take-rate-pct', to: 'Domain:sales', type: 'IN_DOMAIN', weight: 1, provenance: 'catalog' },
    { from: 'Report:sales--monthly-revenue-take-rate', to: 'Table:fact-sug-monthly-rollup', type: 'SOURCED_FROM', weight: 1, provenance: 'catalog' },
    { from: 'Metric:take-rate-pct', to: 'Table:fact-sug-monthly-rollup', type: 'MEASURED_BY', weight: 1, provenance: 'glossary' },
    { from: 'Table:fact-sug-monthly-rollup', to: 'Column:take-rate-pct', type: 'HAS_COLUMN', weight: 1, provenance: 'bigquery' },
    { from: 'Table:fact-sug-monthly-rollup', to: 'Column:units-sold', type: 'HAS_COLUMN', weight: 1, provenance: 'bigquery' },
    // Density edges — present in the real graph in bulk (JOINS_ON 37, SLICED_BY 132) and
    // the reason a lineage view has to filter rather than just cap node count.
    { from: 'Table:fact-sug-monthly-rollup', to: 'Table:dim-territories', type: 'JOINS_ON', weight: 1, provenance: 'bigquery' },
    { from: 'Table:fact-sug-monthly-rollup', to: 'Dimension:territory', type: 'SLICED_BY', weight: 1, provenance: 'bigquery' },
  ],
};
// Endpoints for the density edges above.
G.nodes.push(
  { id: 'Table:dim-territories', type: 'Table', label: 'dim_territories', aliases: [], props: {}, provenance: 'bigquery' },
  { id: 'Dimension:territory', type: 'Dimension', label: 'territory_name', aliases: [], props: {}, provenance: 'bigquery' },
);

console.log('detectStructureIntent — positives');
for (const q of [
  'show me the schema',
  'show me the data model',
  'what feeds into take rate',
  'what feeds to the take rate metric',
  'how is the data organized',
  'how is the data structured',
  'show me the KAG graph',
  'show me the knowledge graph',
  'where does take rate come from',
  'which tables behind this report',
  'show me the data lineage for take rate',
]) {
  t(`routes to KAG: "${q}"`, () => {
    assert.equal(detectStructureIntent([q]), true, 'should be a structure question');
  });
}

console.log('detectStructureIntent — negatives (ordinary data questions)');
for (const q of [
  'revenue by data centre',
  'what feeds the top territories by revenue',   // "feeds" without "into" — about values
  'show me revenue trend over time',
  'take rate by territory',
  'draw the contact center call escalation flow', // process diagram → LLM path, not KAG
  'summarize the churn report',
]) {
  t(`stays on the normal path: "${q}"`, () => {
    assert.equal(detectStructureIntent([q]), false, 'must not hijack an ordinary query');
  });
}

console.log('routing precedence');
t('a process diagram is drawing-intent but NOT structure-intent', () => {
  // The two paths must stay distinct: an escalation flow has no KAG representation, so
  // routing it to the graph would produce a diagram of the wrong thing entirely.
  const q = 'draw the contact center call escalation flow';
  assert.ok(detectDrawingIntent([q]), 'should still be a drawing request');
  assert.equal(detectStructureIntent([q]), false);
});

t('"data lineage" satisfies both, and structure wins by being checked first', () => {
  const q = 'show me the data lineage for take rate';
  assert.ok(detectDrawingIntent([q]), 'still matches the drawing regex');
  assert.equal(detectStructureIntent([q]), true, 'and must also match structure');
});

console.log('subject resolution');
t('names the metric the question is about', () => {
  assert.equal(resolveStructureRoot(G, ['what feeds into take rate']), 'Metric:take-rate-pct');
});

t('a general question has no root — the whole model is the answer', () => {
  assert.equal(resolveStructureRoot(G, ['show me the schema']), undefined);
});

t('never roots on a Domain', () => {
  // Rooting on Sales would collapse the view into that subgraph and hide the joins,
  // which is the opposite of what a lineage question wants.
  const r = resolveStructureRoot(G, ['how is the sales data organized']);
  assert.notEqual(r, 'Domain:sales');
});

t('prefers the longest matching label', () => {
  // "take rate" must beat a bare substring match, so the diagram centres on the metric
  // the user named rather than any node that happens to share a word.
  assert.equal(resolveStructureRoot(G, ['where does take rate come from']), 'Metric:take-rate-pct');
});

console.log('diagram output');
t('rooted lineage is guard-clean and centred on the subject', () => {
  const d = buildStructureDiagram(G, ['what feeds into take rate']);
  const g = guardMermaid(d.content);
  assert.equal(g.ok, true, `guard refused KAG output: ${g.reason}`);
  assert.ok(d.content.includes('Metric_take_rate_pct'), d.content);
  assert.ok(d.content.includes('Table_fact_sug_monthly_rollup'), 'the table feeding it should appear');
  assert.equal(d.rootId, 'Metric:take-rate-pct');
  assert.ok(/Take Rate/.test(d.title), d.title);
});

t('whole-model view is guard-clean and groups by domain', () => {
  const d = buildStructureDiagram(G, ['show me the data model']);
  assert.equal(guardMermaid(d.content).ok, true);
  assert.ok(d.content.includes('subgraph Domain_sales'), d.content);
  assert.equal(d.rootId, undefined);
});

t('whole-model view omits Columns — it is a map, not a dump', () => {
  // nodeTypes is deliberately Domain/Report/Table/Metric: including every column turns
  // a readable model into 172 leaf nodes and Mermaid layout degrades past ~100.
  const d = buildStructureDiagram(G, ['show me the schema']);
  assert.ok(!d.content.includes('Column_units_sold'), 'columns should not be in the overview');
});

t('output carries no raw KagNode ids', () => {
  // ':' cannot be parsed by Mermaid; graphToMermaid slugs it. Asserted here too because
  // this path emits straight to the client with no model or validator in between.
  const d = buildStructureDiagram(G, ['what feeds into take rate']);
  const body = d.content.replace(/^%%.*$/gm, '');
  assert.ok(!/[A-Za-z]+:[A-Za-z]/.test(body), `a raw id survived:\n${body}`);
});

t('an unknown subject degrades to the overview rather than throwing', () => {
  assert.doesNotThrow(() => buildStructureDiagram(G, ['what feeds into gross margin']));
  const d = buildStructureDiagram(G, ['what feeds into gross margin']);
  assert.equal(guardMermaid(d.content).ok, true);
});

t('lineage excludes JOINS_ON and SLICED_BY — the density edges', () => {
  // REGRESSION, found by rendering the real graph in a browser, not by any assertion
  // here: a 28-node neighbourhood carried 59 EDGES because JOINS_ON links every table to
  // every other and SLICED_BY adds one per dimension. Mermaid's SVG grows with edges, so
  // the card refused with "rendered diagram exceeded size limit" — the query worked and
  // the answer was unreadable. Capping nodes alone does NOT fix this; the edge types do.
  const d = buildStructureDiagram(G, ['what feeds into take rate']);
  assert.ok(!d.content.includes('JOINS_ON'), `join edges leaked into lineage:\n${d.content}`);
  assert.ok(!d.content.includes('SLICED_BY'), `slice edges leaked into lineage:\n${d.content}`);
  // ...while the edges that ARE lineage survive.
  assert.ok(d.content.includes('MEASURED_BY'), d.content);
  assert.ok(d.content.includes('HAS_COLUMN'), d.content);
});

t('the overview drops columns and density edges alike', () => {
  const d = buildStructureDiagram(G, ['show me the data model']);
  for (const rel of ['JOINS_ON', 'SLICED_BY', 'HAS_COLUMN']) {
    assert.ok(!d.content.includes(rel), `${rel} should not be in the overview:\n${d.content}`);
  }
  assert.ok(d.content.includes('SOURCED_FROM') || d.content.includes('REPORTS_ON'), d.content);
});

t('summarize reports the real counts', () => {
  assert.deepEqual(summarize(G), { nodes: 9, edges: 9 });
});

console.log(`\n${passed} passed.`);
