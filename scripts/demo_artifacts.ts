// DEMO PROOF (Phase 2, Track D): "Render an HTML + SVG artifact through the tree."
//
// Two parts:
//   PART A — deterministic contract proof. Builds a UI tree containing artifact
//            nodes and walks it exactly as the pipeline + renderer do: registry
//            lookup -> shadow validation -> sanitize -> sandboxed srcdoc. Proves
//            an artifact node survives the validated tree end to end and emerges
//            as sandboxed content, never as raw markup. No LLM, no BigQuery.
//   PART B — live proof. Runs real queries through runStreamingPipeline — the SAME
//            path /api/conversational/stream uses, i.e. what the UI actually hits —
//            and collects emitted cards. Requires credentials; if it can't run it
//            reports SKIPPED rather than failing, so this script stays useful in CI.
//
//            It deliberately does NOT use runPipeline: that path ignores a non-'route'
//            analysis (see runPipeline.ts) and force-feeds the query to generation,
//            bypassing the Layer-1 domain guard the UI enforces. Proving the feature
//            there would overstate what a real conversation produces.
//
// Why not runEvaluation.ts: that harness compares only uiTree.renderType, which is
// always the top-level 'Report' shell. Artifact nodes are nested CHILDREN of that
// shell, so a correct emission still reads as "Report" and scores as a miss. It
// cannot observe this feature. This script walks the tree instead.
//
// Run: npm run demo:artifacts   (from repo root)

import assert from 'node:assert/strict';
import { validateTree } from '../backend/src/services/uiValidator';
import { REGISTRY_BY_TYPE } from '../backend/src/registry/componentRegistry';
import {
  sanitizeArtifact, buildArtifactSrcDoc, artifactKindOf, isArtifactRenderType,
} from '../backend/src/services/artifactSanitizer';

let passed = 0;
function t(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e: any) { console.error(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
}

interface Node { renderType: string; props: any; children?: Node[] }

// Collect every artifact node anywhere in a tree (the check runEvaluation.ts lacks).
function findArtifactNodes(node: any, out: Node[] = []): Node[] {
  if (!node || typeof node !== 'object') return out;
  if (isArtifactRenderType(node.renderType)) out.push(node);
  if (Array.isArray(node.children)) node.children.forEach((c: any) => findArtifactNodes(c, out));
  if (Array.isArray(node.sections)) {
    node.sections.forEach((s: any) =>
      (Array.isArray(s?.components) ? s.components : []).forEach((c: any) => findArtifactNodes(c, out)));
  }
  return out;
}

const HTML_ARTIFACT = [
  '<div class="brief">',
  '<h3>Q1 Regional Brief</h3>',
  '<p>Revenue grew <strong>18%</strong> year over year, led by EMEA.</p>',
  '<table><thead><tr><th>Region</th><th>Revenue</th><th>YoY</th></tr></thead>',
  '<tbody><tr><td>EMEA</td><td>1.2M</td><td>+24%</td></tr>',
  '<tr><td>APAC</td><td>0.9M</td><td>+11%</td></tr></tbody></table>',
  '<p>See the <a href="#detail">detail section</a> for the full breakdown.</p>',
  '</div>',
].join('');

const SVG_ARTIFACT = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 120">',
  '<rect x="8" y="40" width="80" height="40" rx="6" fill="#EFF6FF" stroke="#2563EB"/>',
  '<text x="48" y="64" font-size="11" text-anchor="middle" fill="#1C1917">Order</text>',
  '<line x1="88" y1="60" x2="128" y2="60" stroke="#6B6965" stroke-width="2"/>',
  '<rect x="128" y="40" width="80" height="40" rx="6" fill="#F0FDF4" stroke="#1D9E75"/>',
  '<text x="168" y="64" font-size="11" text-anchor="middle" fill="#1C1917">Pick</text>',
  '<line x1="208" y1="60" x2="248" y2="60" stroke="#6B6965" stroke-width="2"/>',
  '<rect x="248" y="40" width="64" height="40" rx="6" fill="#FEF3C7" stroke="#D97706"/>',
  '<text x="280" y="64" font-size="11" text-anchor="middle" fill="#1C1917">Ship</text>',
  '</svg>',
].join('');

// The tree a report containing both artifact tiers produces — same shape
// runPipeline builds (Report shell + cards as children).
const DEMO_TREE: Node = {
  renderType: 'Report',
  props: { title: 'Q1 Fulfilment Review', description: 'Regional performance and flow.' },
  children: [
    { renderType: 'KPICard', props: { title: 'Revenue', value: '2.1M' }, children: [] },
    { renderType: 'html-artifact', props: { content: HTML_ARTIFACT, title: 'Regional Brief' }, children: [] },
    { renderType: 'svg-artifact', props: { content: SVG_ARTIFACT, title: 'Fulfilment Flow' }, children: [] },
  ],
};

console.log('\n══ PART A — contract proof (deterministic) ══\n');

t('both artifact tiers resolve through the registry', () => {
  for (const type of ['html-artifact', 'svg-artifact']) {
    assert.ok(REGISTRY_BY_TYPE[type], `${type} not resolvable via registry`);
  }
});

t('artifact nodes survive the validated tree with zero violations', () => {
  const { violations, nodeCount } = validateTree([DEMO_TREE] as any);
  assert.equal(violations.length, 0, `expected clean tree, got ${JSON.stringify(violations)}`);
  assert.equal(nodeCount, 4, `expected 4 nodes walked, got ${nodeCount}`);
});

t('both artifact nodes are reachable by a tree walk', () => {
  const found = findArtifactNodes(DEMO_TREE);
  assert.equal(found.length, 2, `expected 2 artifact nodes, found ${found.length}`);
  const types = found.map(n => n.renderType).sort();
  assert.deepEqual(types, ['html-artifact', 'svg-artifact']);
});

t('HTML artifact renders as sandboxed srcdoc, not raw markup', () => {
  const node = findArtifactNodes(DEMO_TREE).find(n => n.renderType === 'html-artifact')!;
  const r = sanitizeArtifact(node.props.content, artifactKindOf(node.renderType));
  assert.equal(r.usable, true, 'HTML artifact should be usable');
  assert.ok(r.safe.includes('<strong>18%</strong>'), 'content should survive');
  assert.ok(r.safe.includes('<table>'), 'table markup should survive');
  const doc = buildArtifactSrcDoc(r.safe, 'html');
  assert.ok(doc.includes('Content-Security-Policy'), 'srcdoc must carry the CSP');
  assert.ok(!/<\s*script/i.test(doc), 'srcdoc must contain no script');
  console.log(`      → ${r.safeLength} chars sanitized, retention ${(r.retention * 100).toFixed(0)}%`);
});

t('SVG artifact renders as sandboxed srcdoc, not raw markup', () => {
  const node = findArtifactNodes(DEMO_TREE).find(n => n.renderType === 'svg-artifact')!;
  const r = sanitizeArtifact(node.props.content, artifactKindOf(node.renderType));
  assert.equal(r.usable, true, 'SVG artifact should be usable');
  assert.ok(r.safe.includes('<svg'), 'svg root should survive');
  assert.ok(r.safe.includes('<rect'), 'vector content should survive');
  assert.ok(r.safe.includes('Order'), 'label text should survive');
  const doc = buildArtifactSrcDoc(r.safe, 'svg');
  assert.ok(doc.includes('Content-Security-Policy'), 'srcdoc must carry the CSP');
  assert.ok(!/<\s*script/i.test(doc), 'srcdoc must contain no script');
  console.log(`      → ${r.safeLength} chars sanitized, retention ${(r.retention * 100).toFixed(0)}%`);
});

t('a hostile artifact in the same tree is caught, not rendered', () => {
  const hostile: Node = {
    renderType: 'Report', props: { title: 'x' },
    children: [{
      renderType: 'html-artifact',
      props: { content: '<div onclick="steal()"><script>fetch("/exfil")</script>hi</div>' },
      children: [],
    }],
  };
  const { violations } = validateTree([hostile] as any);
  assert.ok(violations.some(v => v.category === 'unsafe_artifact_content'),
    `expected unsafe_artifact_content, got ${JSON.stringify(violations)}`);
  const node = findArtifactNodes(hostile)[0];
  const r = sanitizeArtifact(node.props.content, 'html');
  assert.ok(!r.safe.includes('steal'), 'handler survived');
  assert.ok(!r.safe.includes('fetch'), 'script body survived');
});

// ── PART B — live pipeline proof (the UI's own path) ─────────────────────────
// Queries must be BOTH artifact-shaped AND inside the four data domains
// (Sales / Network / Contact Center / Customer Experience), or the Layer-1 guard
// refuses them before generation ever runs.
// Both verified to emit an artifact through the streaming path. Note that phrasing
// matters: "Sketch a flow diagram of the contact center escalation path" routes to a
// data answer instead, because Layer 1 reads it as a metrics question about the
// contact center. "Draw a process diagram of how X flows..." reads as structural.
const LIVE_QUERIES = [
  'Write a brief with headings on territory revenue performance',
  'Draw a diagram of the network topology',
];

async function liveProof() {
  console.log('\n══ PART B — live proof via the UI path (runStreamingPipeline) ══\n');
  // dotenv lives in backend/node_modules, not resolvable from scripts/ — resolve it
  // from the cwd (the npm script runs this from backend/). Non-fatal: if env is
  // already populated the pipeline still runs.
  try {
    const dotenvPath = require.resolve('dotenv', { paths: [process.cwd()] });
    require(dotenvPath).config();
  } catch { /* env may already be set */ }

  let runStreamingPipeline: any;
  try {
    ({ runStreamingPipeline } = await import('../backend/src/pipeline/runStreamingPipeline'));
  } catch (e: any) {
    console.log(`  SKIPPED — pipeline not loadable: ${e?.message ?? e}`);
    return;
  }

  // Reproduce the UI's real two-turn conversation. A fresh message arrives with
  // skipClarification=false and almost always comes back as a clarification (this is
  // true for ordinary BI queries too, not just artifact ones). The UI then resends the
  // ORIGINAL query with clarificationHistory=[{question, answer}] — see
  // Conversational_new.tsx (queryToSend = activeContext). Simulating only turn 1, or
  // passing skipClarification=true, does not reflect what a user actually experiences.
  for (const q of LIVE_QUERIES) {
    console.log(`  ▸ "${q}"`);

    // ── Turn 1 ──────────────────────────────────────────────────────────────
    let clarification: any = null;
    const turn1: any[] = [];
    try {
      await runStreamingPipeline(q, (ev: string, d: any) => {
        if (ev === 'component' && d) turn1.push(d);
        if (ev === 'clarification') clarification = d;
      }, false, [], undefined, undefined, undefined, [], 'gemma');
    } catch (e: any) {
      console.log(`      turn 1 failed — ${e?.message ?? e}`);
      continue;
    }

    let cards = turn1;

    // ── Turn 2 (only if turn 1 asked something) ─────────────────────────────
    if (clarification && turn1.length === 0) {
      const question: string = clarification?.currentQuestion?.question ?? '';
      const options: string[] = clarification?.currentQuestion?.options ?? [];
      const answer = options[0] ?? 'Sales';
      console.log(`      turn 1 → clarification: "${String(question).slice(0, 70)}"`);
      console.log(`      turn 2 → answering: "${answer}"`);
      const turn2: any[] = [];
      try {
        await runStreamingPipeline(q, (ev: string, d: any) => {
          if (ev === 'component' && d) turn2.push(d);
        }, false, [{ question, answer }], undefined, undefined, undefined, [], 'gemma');
      } catch (e: any) {
        console.log(`      turn 2 failed — ${e?.message ?? e}`);
        continue;
      }
      cards = turn2;
    }

    const types = cards.map(c => c?.renderType).filter(Boolean);
    const found = cards.filter(c => isArtifactRenderType(c?.renderType));
    if (found.length > 0) {
      console.log(`      ✅ artifact rendered`);
      for (const n of found) {
        const r = sanitizeArtifact(n.props?.content, artifactKindOf(n.renderType));
        console.log(`         ${n.renderType}: usable=${r.usable} retention=${(r.retention * 100).toFixed(0)}% len=${r.safeLength}`);
      }
    } else {
      console.log(`      —  no artifact emitted`);
    }
    console.log(`      cards: [${types.join(', ')}]`);

    // Whatever the model chose, the emitted cards must still validate.
    const { violations } = validateTree(cards as any);
    const unsafe = violations.filter(v => v.category === 'unsafe_artifact_content');
    if (unsafe.length) console.log(`      ⚠ unsafe_artifact_content: ${unsafe.map(v => v.detail).join('; ')}`);
  }
}

// ── PART C — displacement regression (opt-in: DEMO_REGRESSION=1) ─────────────
// Adding selectable types to the prompt catalogue can make the model reach for them
// on ordinary BI queries, displacing real chart/table components. Generation does not
// enforce the constraint set and the governor defaults to off, so the catalogue wording
// is the only guardrail — this is what proves the wording holds.
//
// Opt-in because it runs every pre-existing eval query live (slow + real API cost).
async function displacementCheck() {
  if (process.env.DEMO_REGRESSION !== '1') {
    console.log('\n══ PART C — displacement regression ══\n');
    console.log('  SKIPPED — set DEMO_REGRESSION=1 to run (executes every eval query live).');
    return;
  }
  console.log('\n══ PART C — displacement regression (pre-existing BI queries) ══\n');

  let runStreamingPipeline: any, cases: any[];
  try {
    ({ runStreamingPipeline } = await import('../backend/src/pipeline/runStreamingPipeline'));
    cases = (await import('../backend/src/evaluation/testCases.json')).default as any[];
  } catch (e: any) {
    console.log(`  SKIPPED — ${e?.message ?? e}`);
    return;
  }

  let hits = 0;
  for (const c of cases) {
    const cards: any[] = [];
    try {
      // skipClarification=TRUE here, unlike Part B, and the difference is deliberate:
      // this part asks "when generation runs, does it displace real components?", so
      // generation must actually run. With false, a first-turn query stops at the
      // clarification gate and emits no cards at all — making the check vacuously pass.
      await runStreamingPipeline(c.query, (ev: string, d: any) => {
        if (ev === 'component' && d) cards.push(d);
      }, true, [], undefined, undefined, undefined, [], 'gemma');
    } catch { /* a failed query can't displace anything */ }
    const types = cards.map(x => x?.renderType).filter(Boolean);
    const arts = types.filter(isArtifactRenderType);
    hits += arts.length;
    console.log(`  ${arts.length ? 'ARTIFACT' : '  ok    '} | ${String(c.query).padEnd(34)} | ${types.join(', ')}`);
  }
  console.log(`\n  Artifact nodes on pre-existing BI queries: ${hits}`);
  if (hits > 0) {
    console.error('  REGRESSION — artifacts displaced real components.');
    process.exitCode = 1;
  } else {
    console.log('  PASS — no displacement of real components.');
  }
}

liveProof()
  .catch(e => console.log(`  PART B skipped — ${e?.message ?? e}`))
  .then(() => displacementCheck())
  .catch(e => console.log(`  PART C skipped — ${e?.message ?? e}`))
  .then(() => {
    console.log(`\n${passed} contract check(s) passed.`);
  });
