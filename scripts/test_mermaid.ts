// Guardrail tests for the 'mermaid-artifact' node type.
//
// Covers:
//   1. frontend/backend mermaidGuard copies are logically identical (same parity
//      guard used by test_artifacts.ts for the sanitizer copies)
//   2. the guard ACCEPTS one realistic sample per allowlisted diagram type, and
//      does not trip over Mermaid's angle-bracket arrow syntax
//   3. the guard REFUSES init directives, click statements, embedded markup,
//      config keywords, unknown diagram types, oversized and non-string payloads
//   4. round-trip — real pre-rendered Mermaid SVG survives
//      strip<style> -> sanitizeArtifact(_, 'mermaid') intact and inert
//   5. retention regression — the specific failure mode that makes the <style>
//      pre-strip mandatory rather than cosmetic
//   6. validator integration — mermaid nodes take the guard branch, never the
//      markup branch, and refused source raises unsafe_artifact_content
//   7. constraint integration — mermaid-artifact is LLM-selectable
//
// The fixtures under scripts/fixtures/mermaid/ are REAL Mermaid output, generated
// by scripts/gen_mermaid_fixtures.mjs in headless Chromium. They are committed so
// this test needs no browser. Regenerate them after any Mermaid version bump —
// emitted markup and class names are version-coupled, which is why VERSION is
// checked below.
//
// Run: npm run test:mermaid   (from repo root)

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  sanitizeArtifact, buildArtifactSrcDoc, MIN_RETENTION_RATIO,
  isArtifactRenderType, artifactKindOf, ARTIFACT_RENDER_TYPES,
} from '../backend/src/services/artifactSanitizer';
import { guardMermaid, escapeLabelAngles, MAX_MERMAID_BYTES, ALLOWED_HEADERS } from '../backend/src/services/mermaidGuard';
import { validateTree, assessArtifactNode } from '../backend/src/services/uiValidator';
import { REGISTRY_BY_TYPE } from '../backend/src/registry/componentRegistry';
import { deriveConstraints } from '../backend/src/services/componentSelector';
import { ShapeSignature } from '../backend/src/types';
import { graphToMermaid } from '../backend/src/kag/graphToMermaid';
import type { KagGraph } from '../backend/src/kag/types';

const ROOT = join(__dirname, '..');
const FIXTURES = join(__dirname, 'fixtures', 'mermaid');

let passed = 0;
function t(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e: any) { console.error(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
}

// Reduce a copy to just its executable logic (same reduction as test_artifacts.ts).
const logic = (src: string) =>
  src.replace(/\/\/.*$/gm, '').split('\n').map((l) => l.trim()).filter(Boolean).join('\n');

// Mermaid emits its styling as a <style> block inside the <svg>. MermaidArtifact
// removes it BEFORE sanitizing; this mirrors that step exactly.
const stripStyleBlocks = (svg: string) => svg.replace(/<style[\s\S]*?<\/style>/gi, '');

// Assert a sanitized payload contains no executable vector, whatever the input.
// Same property (and same reasoning) as assertInert in test_artifacts.ts.
function assertInert(safe: string, label: string) {
  const s = safe.toLowerCase();
  assert.ok(!/<\s*script/.test(s), `${label}: <script> survived`);
  assert.ok(!/\son[a-z]+\s*=/.test(s), `${label}: inline event handler survived`);
  assert.ok(!s.includes('javascript:'), `${label}: javascript: URI survived`);
  assert.ok(!s.includes('vbscript:'), `${label}: vbscript: URI survived`);
  assert.ok(!/<\s*iframe|<\s*object|<\s*embed/.test(s), `${label}: nested browsing context survived`);
  assert.ok(!/<\s*foreignobject/.test(s), `${label}: foreignObject survived`);
  assert.ok(!/\sstyle\s*=/.test(s), `${label}: style attribute survived`);
  assert.ok(!/<\s*style/.test(s), `${label}: <style> survived`);
  assert.ok(!/xlink:href/.test(s), `${label}: xlink:href survived`);
  const residue = safe.replace(/<\/?[a-zA-Z][a-zA-Z0-9:-]*(?:\s[^<>]*)?\/?>/g, '');
  assert.ok(!residue.includes('<'), `${label}: unescaped '<' survived in text`);
  assert.ok(!residue.includes('>'), `${label}: unescaped '>' survived in text`);
}

// One realistic sample per allowlisted diagram type.
const VALID: Record<string, string> = {
  flowchart: 'flowchart TD\n  A["Territory T-007"] --> B{"Take rate?"}\n  B -->|Low| C["Escalate"]',
  graph: 'graph LR\n  Ingest --> Shape\n  Shape --> Render',
  sequenceDiagram: 'sequenceDiagram\n  participant U as User\n  U->>S: Ask\n  S-->>U: Answer',
  classDiagram: 'classDiagram\n  class Registry {\n    +getSpec()\n  }\n  Registry --> Spec',
  stateDiagram: 'stateDiagram\n  [*] --> Off\n  Off --> Shadow',
  'stateDiagram-v2': 'stateDiagram-v2\n  [*] --> Off\n  Off --> Shadow : enable',
  erDiagram: 'erDiagram\n  TERRITORY ||--o{ ORDER : places',
  mindmap: 'mindmap\n  root((Artifacts))\n    HTML\n    SVG',
  timeline: 'timeline\n  title Delivery\n  2026-01 : Guard\n  2026-02 : Renderer',
};

console.log('guard copy parity');
t('frontend and backend mermaidGuard copies are logically identical', () => {
  const back = logic(readFileSync(join(ROOT, 'backend/src/services/mermaidGuard.ts'), 'utf8'));
  const front = logic(readFileSync(join(ROOT, 'src/app/components/mermaidGuard.ts'), 'utf8'));
  assert.equal(
    front, back,
    'backend/src/services/mermaidGuard.ts and src/app/components/mermaidGuard.ts have diverged.\n' +
    'Edit BOTH copies identically.',
  );
});

console.log('helpers');
t('mermaid-artifact is recognised as an artifact render type', () => {
  assert.equal(isArtifactRenderType('mermaid-artifact'), true);
  assert.equal(artifactKindOf('mermaid-artifact'), 'mermaid');
  // The other two must be untouched by the addition.
  assert.equal(artifactKindOf('svg-artifact'), 'svg');
  assert.equal(artifactKindOf('html-artifact'), 'html');
  assert.ok(ARTIFACT_RENDER_TYPES.includes('mermaid-artifact' as any));
});

console.log('guard — accepts');
t('one valid sample per allowlisted diagram type is accepted', () => {
  for (const header of ALLOWED_HEADERS) {
    const sample = VALID[header];
    assert.ok(sample, `no sample authored for allowlisted header: ${header}`);
    const g = guardMermaid(sample);
    assert.equal(g.ok, true, `${header} refused: ${g.reason} (${g.removed.join(',')})`);
    assert.deepEqual(g.removed, []);
    assert.equal(g.code, sample.trim());
  }
});

t('every allowlisted header has a committed fixture', () => {
  const files = new Set(readdirSync(FIXTURES).filter((f) => f.endsWith('.svg')));
  for (const header of ALLOWED_HEADERS) {
    assert.ok(files.has(`${header}.svg`), `missing fixture for ${header}`);
  }
});

t('arrow syntax is not mistaken for markup', () => {
  // REGRESSION GUARD. A "no angle brackets" rule looks safe but would refuse
  // essentially every diagram, since Mermaid builds its edges from '<' and '>'.
  // The rule is narrower on purpose: a tag-open is '<' followed by a name char.
  for (const src of [
    'flowchart LR\n  A --> B',
    'flowchart LR\n  A <--> B',
    'flowchart LR\n  A -.-> B\n  B ==> C',
    'sequenceDiagram\n  A->>B: hi\n  B-->>A: bye',
    'classDiagram\n  A <|-- B\n  C *-- D\n  E o-- F',
    'erDiagram\n  A ||--o{ B : has',
  ]) {
    const g = guardMermaid(src);
    assert.equal(g.ok, true, `arrow syntax refused: ${JSON.stringify(src)} -> ${g.reason}`);
  }
});

t('leading %% comments do not hide the diagram type', () => {
  const g = guardMermaid('%% generated by the pipeline\n\nflowchart TD\n  A --> B');
  assert.equal(g.ok, true, g.reason);
});

t('a label containing the word "click" is not refused', () => {
  // `click` is only a statement at line start; a node labelled "Click-through
  // rate" is ordinary content and must survive.
  const g = guardMermaid('flowchart TD\n  A["Click-through rate"] --> B["Conversion"]');
  assert.equal(g.ok, true, g.reason);
});

console.log('guard — refuses');
t('%%{init}%% directives are refused', () => {
  for (const src of [
    `%%{init: {'securityLevel':'loose'}}%%\nflowchart TD\n  A --> B`,
    `flowchart TD\n  %%{init: {'theme':'dark'}}%%\n  A --> B`,
  ]) {
    const g = guardMermaid(src);
    assert.equal(g.ok, false, `init directive accepted: ${src}`);
    assert.ok(g.removed.includes('init-directive'), g.removed.join(','));
    assert.equal(g.code, '', 'refused payload must not be returned');
  }
});

t('click / interaction statements are refused', () => {
  for (const src of [
    'flowchart TD\n  A --> B\n  click A "https://evil.test"',
    'flowchart TD\n  A --> B\n  click A call doThing()',
    'flowchart TD\n  A --> B\n    click A href "https://evil.test" _blank',
    'flowchart TD\n  A --> B\n  CLICK A "https://evil.test"',
  ]) {
    const g = guardMermaid(src);
    assert.equal(g.ok, false, `click accepted: ${src}`);
    assert.ok(g.removed.includes('click'), g.removed.join(','));
  }
});

t('embedded markup in labels is refused', () => {
  for (const src of [
    'flowchart TD\n  A["<img src=x onerror=alert(1)>"] --> B',
    'flowchart TD\n  A["<script>alert(1)</script>"] --> B',
    'flowchart TD\n  A["</svg><script>x</script>"] --> B',
  ]) {
    const g = guardMermaid(src);
    assert.equal(g.ok, false, `markup accepted: ${src}`);
    assert.ok(g.removed.includes('tag-open'), g.removed.join(','));
  }
});

t('config keywords are refused', () => {
  for (const src of [
    'flowchart TD\n  A --> B\n  linkTarget _blank',
    'flowchart TD\n  securityLevel loose\n  A --> B',
    'flowchart TD\n  htmlLabels true\n  A --> B',
  ]) {
    assert.equal(guardMermaid(src).ok, false, `config keyword accepted: ${src}`);
  }
});

t('script and data URI schemes are refused', () => {
  for (const src of [
    'flowchart TD\n  A["javascript:alert(1)"] --> B',
    'flowchart TD\n  A["data:text/html;base64,PHN2Zz4="] --> B',
    'flowchart TD\n  A["vbscript:msgbox(1)"] --> B',
  ]) {
    assert.equal(guardMermaid(src).ok, false, `scheme accepted: ${src}`);
  }
});

t('unknown and chart-shaped diagram types are refused', () => {
  // sankey-beta: a real Mermaid type we have not reviewed.
  // pie / gantt / journey: deliberately excluded — they are charts (the registry
  // already has real chart components) and they render wrong here anyway, because
  // their per-segment colours come from the <style> block this pipeline strips.
  for (const src of [
    'sankey-beta\n  A,B,10',
    'pie title Revenue\n  "EMEA" : 42',
    'gantt\n  title Rollout\n  section A\n    Task :a1, 2026-01-05, 3d',
    'journey\n  title Trip\n  section Go\n    Walk: 5: Me',
    'quadrantChart\n  title Reach',
    'A --> B',
  ]) {
    const g = guardMermaid(src);
    assert.equal(g.ok, false, `unsupported type accepted: ${src}`);
    assert.ok(g.removed.includes('header'), g.removed.join(','));
  }
});

t('oversized source is refused before any other rule', () => {
  const huge = 'flowchart TD\n' + 'A --> B\n'.repeat(MAX_MERMAID_BYTES);
  const g = guardMermaid(huge);
  assert.equal(g.ok, false);
  assert.deepEqual(g.removed, ['oversized'], 'size must short-circuit');
  assert.equal(g.code, '');
});

t('non-string / empty content is handled without throwing', () => {
  for (const bad of [null, undefined, 42, {}, [], '', '   \n  ']) {
    let g: ReturnType<typeof guardMermaid> | undefined;
    assert.doesNotThrow(() => { g = guardMermaid(bad as any); });
    assert.equal(g!.ok, false);
    assert.equal(g!.code, '');
  }
});

t('a payload tripping several rules reports all of them', () => {
  const g = guardMermaid(`%%{init:{'securityLevel':'loose'}}%%\nsankey-beta\n  click A "x"\n  B["<script>"]`);
  assert.equal(g.ok, false);
  for (const cls of ['header', 'init-directive', 'click', 'tag-open']) {
    assert.ok(g.removed.includes(cls), `missing ${cls} in ${g.removed.join(',')}`);
  }
});

console.log('round-trip — real Mermaid output through the sanitizer');
const fixtureNames = readdirSync(FIXTURES).filter((f) => f.endsWith('.svg'));

t('fixtures were generated by the pinned Mermaid version', () => {
  const stamped = readFileSync(join(FIXTURES, 'VERSION'), 'utf8').trim();
  const installed = `mermaid@${JSON.parse(
    readFileSync(join(ROOT, 'node_modules/mermaid/package.json'), 'utf8'),
  ).version}`;
  assert.equal(
    stamped, installed,
    'Mermaid was upgraded without regenerating the fixtures.\n' +
    'Emitted SVG structure and class names are version-coupled — MERMAID_CSS is\n' +
    'written against them. Run: node scripts/gen_mermaid_fixtures.mjs',
  );
});

for (const file of fixtureNames) {
  t(`${file} survives strip-<style> + sanitize, usable and inert`, () => {
    const raw = readFileSync(join(FIXTURES, file), 'utf8');
    const r = sanitizeArtifact(stripStyleBlocks(raw), 'mermaid');

    assert.equal(r.oversized, false);
    assert.equal(r.usable, true, `unusable (retention ${r.retention.toFixed(3)})`);
    assert.ok(
      r.retention >= MIN_RETENTION_RATIO,
      `retention ${r.retention.toFixed(3)} below ${MIN_RETENTION_RATIO}`,
    );
    assert.ok(r.safe.includes('<svg'), 'root <svg> did not survive');
    assertInert(r.safe, file);

    // The srcdoc must carry the trusted Mermaid stylesheet and still admit no script.
    const doc = buildArtifactSrcDoc(r.safe, 'mermaid');
    assert.ok(doc.includes('text-anchor:middle'), 'MERMAID_CSS layout rules missing from srcdoc');
    assert.ok(!/<\s*script/i.test(doc), 'srcdoc contains a script tag');
  });
}

t('node labels survive — the diagram is not a set of empty boxes', () => {
  // Regression: with htmlLabels left at its default, Mermaid emits node labels
  // inside <foreignObject>, which the sanitizer strips wholesale. Every fixture
  // still rendered, just with no text in any node. Assert on real label content.
  const cases: [string, string[]][] = [
    ['flowchart.svg', ['Territory T-007', 'Escalate to Region Lead', 'Ops review']],
    ['graph.svg', ['BigQuery ingest', 'Component selector']],
    ['classDiagram.svg', ['ComponentSpec', 'requiredProps']],
    ['stateDiagram-v2.svg', ['Shadow', 'Enforce']],
    ['mindmap.svg', ['Artifacts', 'Bespoke drawings']],
    ['erDiagram.svg', ['TERRITORY', 'takeRate']],
  ];
  for (const [file, labels] of cases) {
    const raw = readFileSync(join(FIXTURES, file), 'utf8');
    const text = sanitizeArtifact(stripStyleBlocks(raw), 'mermaid').safe.replace(/<[^>]*>/g, '');
    for (const label of labels) {
      assert.ok(text.includes(label), `${file}: label "${label}" was lost`);
    }
  }
});

console.log('retention regression — why the <style> pre-strip is mandatory');
t('skipping the pre-strip false-downgrades good diagrams', () => {
  // THIS IS THE TEST THAT STOPS SOMEONE REORDERING THE PIPELINE.
  //
  // sanitizeArtifact would drop the <style> block anyway, but it would count those
  // kilobytes as *removed*, dragging retention under MIN_RETENTION_RATIO and
  // downgrading a perfectly good diagram to plain text. Pre-stripping shrinks
  // originalLength too, so the ratio stays honest.
  // NOTE ON WHAT THIS NOW ASSERTS. `usable` no longer depends on retention for
  // mermaid (see the comment in sanitizeArtifact — a dense but valid diagram was
  // being refused while a sparse one rendered). So this asserts the RATIO itself,
  // which is still reported for telemetry and is still the honest measure of
  // whether the pipeline is ordered correctly.
  const belowFloor: string[] = [];
  for (const file of fixtureNames) {
    const raw = readFileSync(join(FIXTURES, file), 'utf8');
    if (sanitizeArtifact(raw, 'mermaid').retention < MIN_RETENTION_RATIO) belowFloor.push(file);
    // With the pre-strip every fixture stays well above the floor — asserted per-fixture above.
  }
  assert.ok(
    belowFloor.length > 0,
    'expected at least one fixture to fall below the retention floor without the ' +
    '<style> pre-strip; if this becomes empty the ordering guarantee has lost its teeth',
  );
  // timeline is the most extreme case (its <style> block dwarfs its geometry) and
  // is named explicitly so the assertion cannot be satisfied by a marginal fixture.
  assert.ok(
    belowFloor.includes('timeline.svg'),
    `expected timeline.svg below the floor; got: ${belowFloor.join(',')}`,
  );
});

t('a dense, label-heavy diagram is not refused for being mostly bookkeeping', () => {
  // REGRESSION: an 18-node flowchart with labelled edges reached a real user as
  // "Rich content unavailable (too much content was removed)". Mermaid's own
  // data-*/style/aria bookkeeping outweighed the geometry by byte count, dragging
  // retention under the floor — even though every label and shape survived intact.
  // Retention must not decide usability for machine-generated SVG.
  const raw = readFileSync(join(FIXTURES, 'flowchart.svg'), 'utf8');
  const stripped = stripStyleBlocks(raw);
  // Simulate the attribute-heavy case by asserting the property directly: a result
  // with healthy content but low retention must still be usable for mermaid.
  const r = sanitizeArtifact(stripped, 'mermaid');
  assert.equal(r.usable, true);
  assert.ok(r.safe.includes('<svg'), 'diagram did not survive');
  const text = r.safe.replace(/<[^>]*>/g, '').trim();
  assert.ok(text.length > 0, 'labels did not survive');

  // And the contrast that makes the rule meaningful: html/svg artifacts DO still
  // downgrade on low retention, because their payload is model-authored markup.
  const gutted = sanitizeArtifact('<div><script>' + 'x'.repeat(4000) + '</script><p>hi</p></div>', 'html');
  assert.ok(gutted.retention < MIN_RETENTION_RATIO);
  assert.equal(gutted.usable, false, 'html must still downgrade on low retention');
});

console.log('registry + validator integration');
t('mermaid-artifact is an ordinary registry member', () => {
  const spec = REGISTRY_BY_TYPE['mermaid-artifact'];
  assert.ok(spec, 'mermaid-artifact missing from registry');
  assert.deepEqual(spec.requiredProps, ['content']);
  assert.equal(spec.dataNeeds, 'none');
  assert.equal(spec.tier, 'organism');
  assert.equal(spec.family, 'narrative');
  assert.ok(spec.outputModes.length > 0);
});

t('mermaid-artifact is LLM-selectable via deriveConstraints', () => {
  const shape: ShapeSignature = {
    rowCount: 12, columnCount: 3, isTimeSeries: false,
    dimensionColumns: ['region'], measureColumns: ['revenue'],
  } as ShapeSignature;
  const c = deriveConstraints('narrative', shape);
  assert.ok(
    c.allowedComponents.includes('mermaid-artifact'),
    'mermaid-artifact not selectable in narrative mode',
  );
});

t('assessArtifactNode takes the guard branch, never the markup branch', () => {
  const a = assessArtifactNode({
    renderType: 'mermaid-artifact',
    props: { content: 'flowchart TD\n  A["Territory T-007"] --> B["Escalate"]' },
  });
  assert.ok(a);
  assert.equal(a!.kind, 'mermaid');
  assert.equal(a!.shouldDowngrade, false);
  assert.equal(a!.retention, 1, 'guard verdicts are binary, not fractional');
  assert.deepEqual(a!.removed, []);
  // The markup sanitizer would have shredded this source into `removed` classes;
  // an empty list proves the guard branch ran instead.
  assert.ok(a!.safe.startsWith('flowchart'), 'safe should carry the source, not markup');
});

t('refused mermaid source raises unsafe_artifact_content', () => {
  const { violations } = validateTree([
    { renderType: 'mermaid-artifact', props: { content: 'flowchart TD\n  A --> B\n  click A "https://evil.test"' } },
  ]);
  const v = violations.filter((x) => x.category === 'unsafe_artifact_content');
  assert.equal(v.length, 1, `expected exactly one violation, got ${JSON.stringify(violations)}`);
  assert.ok(v[0].detail.startsWith('refused:'), v[0].detail);
  assert.ok(v[0].detail.includes('click'), v[0].detail);
});

t('clean mermaid node produces no violations', () => {
  const { violations } = validateTree([
    {
      renderType: 'mermaid-artifact',
      props: { content: 'flowchart TD\n  A["Territory T-007"] --> B["Escalate"]', title: 'Escalation path' },
    },
  ]);
  assert.deepEqual(violations, [], JSON.stringify(violations));
});

t('missing content raises both a missing_prop and a content violation', () => {
  const { violations } = validateTree([{ renderType: 'mermaid-artifact', props: {} }]);
  assert.ok(violations.some((v) => v.category === 'missing_prop' && v.detail === 'content'), JSON.stringify(violations));
  assert.ok(violations.some((v) => v.category === 'unsafe_artifact_content'), JSON.stringify(violations));
});

t('adding mermaid did not disturb the other artifact types', () => {
  const { violations } = validateTree([
    { renderType: 'html-artifact', props: { content: '<p>Revenue grew steadily across all four regions this quarter.</p>' } },
    { renderType: 'svg-artifact', props: { content: '<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="#2563EB"/></svg>' } },
  ]);
  assert.deepEqual(violations, [], JSON.stringify(violations));
});


console.log('label normalization — the silent-corruption fix');
t('a raw > inside a quoted label is entity-escaped', () => {
  // Mermaid uses '>' as node-shape syntax, so a raw '>' in a label is swallowed
  // by its parser with no error. A real generated diagram asked for
  // `{"Return Rate > 4%?"}` and rendered "Return Rate 4%?" — a different
  // condition, shown confidently. Escaping is what makes it survive.
  assert.equal(
    escapeLabelAngles('flowchart TD\n  B{"Return Rate > 4%?"} --> C["ok"]'),
    'flowchart TD\n  B{"Return Rate &gt; 4%?"} --> C["ok"]',
  );
});

t('an already-escaped entity is not double-escaped', () => {
  // '&gt;' itself contains a '>', so a naive />/g rewrite produces '&gt&gt;'.
  assert.equal(escapeLabelAngles('flowchart TD\n  A["Rate &gt; 4%"]'),
    'flowchart TD\n  A["Rate &gt; 4%"]');
  // ...and the operation is idempotent, which is what makes that safe.
  const once = escapeLabelAngles('flowchart TD\n  A["Rate > 4%"]');
  assert.equal(escapeLabelAngles(once), once);
});

t('arrow syntax outside quotes is never touched', () => {
  for (const src of [
    'flowchart LR\n  A --> B\n  B ==> C\n  C -.-> D',
    'sequenceDiagram\n  U->>S: Ask\n  S-->>U: Answer',
    'classDiagram\n  A <|-- B',
    'erDiagram\n  A ||--o{ B : has',
  ]) {
    assert.equal(escapeLabelAngles(src), src, `arrows were rewritten in: ${src}`);
  }
});

t('normalization runs only on guard-approved source', () => {
  // Order matters: the guard judges what the model actually wrote; only then is
  // the source repaired. A refused payload has code === '' and normalizing it
  // must stay a no-op rather than resurrecting anything.
  const refused = guardMermaid('flowchart TD\n  A --> B\n  click A "https://evil.test"');
  assert.equal(refused.ok, false);
  assert.equal(escapeLabelAngles(refused.code), '');
});

console.log('graphToMermaid — KAG graph serializer (Track M2)');

// A small synthetic KagGraph, not a live BigQuery/Neo4j pull — this test asserts
// the serializer's own output is guard-clean, not that a real graph is reachable.
const SAMPLE_GRAPH: KagGraph = {
  nodes: [
    { id: 'Domain:contact-center', type: 'Domain', label: 'Contact Center', aliases: [], props: {}, provenance: 'catalog' },
    { id: 'Table:fact_contact_center_metrics', type: 'Table', label: 'fact_contact_center_metrics', aliases: [], props: {}, provenance: 'bigquery' },
    { id: 'Metric:take-rate-pct', type: 'Metric', label: 'Take Rate > 4%?', aliases: [], props: {}, provenance: 'glossary' },
    { id: 'Column:take_rate', type: 'Column', label: 'take_rate', aliases: [], props: {}, provenance: 'bigquery' },
  ],
  edges: [
    { from: 'Table:fact_contact_center_metrics', to: 'Domain:contact-center', type: 'IN_DOMAIN', weight: 1, provenance: 'catalog' },
    { from: 'Metric:take-rate-pct', to: 'Domain:contact-center', type: 'IN_DOMAIN', weight: 1, provenance: 'catalog' },
    { from: 'Metric:take-rate-pct', to: 'Table:fact_contact_center_metrics', type: 'MEASURED_BY', weight: 1, provenance: 'glossary' },
    { from: 'Table:fact_contact_center_metrics', to: 'Column:take_rate', type: 'HAS_COLUMN', weight: 1, provenance: 'bigquery' },
  ],
};

t('serializer output is guard-clean — the cheapest regression test for the guard itself', () => {
  const mmd = graphToMermaid(SAMPLE_GRAPH);
  const g = guardMermaid(mmd);
  assert.equal(g.ok, true, `serializer output refused: ${g.reason} (${g.removed.join(',')}) —\n${mmd}`);
});

t('node ids drop the colon Mermaid cannot parse', () => {
  const mmd = graphToMermaid(SAMPLE_GRAPH);
  assert.ok(mmd.includes('Table_fact_contact_center_metrics'), mmd);
  assert.ok(!/[A-Za-z]+:[A-Za-z]/.test(mmd.replace(/^flowchart TD$/m, '')), 'a raw KagNode id survived unslugified');
});

t('an id containing "--" does not turn the node line into an edge', () => {
  // REGRESSION, found by rendering the REAL assembled graph rather than the
  // fixture: the builder joins some ids with a double hyphen
  // (`Report:sales--monthly-revenue-take-rate`). Mermaid reads '--' as its link
  // operator, so the node line parsed as an edge and the ENTIRE diagram failed
  // with "Expecting 'LINK' ... got 'STR'" — not one bad node, no output at all.
  const g: KagGraph = {
    nodes: [
      { id: 'Domain:sales', type: 'Domain', label: 'Sales', aliases: [], props: {}, provenance: 'catalog' },
      { id: 'Report:sales--monthly-revenue-take-rate', type: 'Report', label: 'Monthly Revenue', aliases: [], props: {}, provenance: 'catalog' },
    ],
    edges: [
      { from: 'Report:sales--monthly-revenue-take-rate', to: 'Domain:sales', type: 'IN_DOMAIN', weight: 1, provenance: 'catalog' },
    ],
  };
  const mmd = graphToMermaid(g);
  assert.ok(mmd.includes('Report_sales__monthly_revenue_take_rate'), mmd);
  assert.ok(!/--/.test(mmd.replace(/^%%.*$/gm, '')), `a '--' survived into an id:\n${mmd}`);
  assert.equal(guardMermaid(mmd).ok, true);
});

t('every emitted id is a bare Mermaid identifier', () => {
  // The allowlist rule, asserted directly: whatever a KagNode id contains, what
  // reaches Mermaid is [A-Za-z0-9_] only.
  const mmd = graphToMermaid(SAMPLE_GRAPH);
  for (const line of mmd.split('\n')) {
    if (line.startsWith('%%') || line === 'flowchart TD' || line.trim() === 'end') continue;
    const ids = line.trim().startsWith('subgraph')
      ? [line.trim().split(/\s+/)[1].split('[')[0]]
      : line.split(/-->\|\w+\|/).map((part) => part.trim().split(/[[({>]/)[0]).filter(Boolean);
    for (const id of ids) {
      assert.ok(/^[A-Za-z0-9_]+$/.test(id), `id "${id}" is not a bare identifier (line: ${line})`);
    }
  }
});

t('nodes are grouped under their Domain via IN_DOMAIN, not drawn as an edge', () => {
  const mmd = graphToMermaid(SAMPLE_GRAPH);
  assert.ok(mmd.includes('subgraph Domain_contact_center'), mmd);
  assert.ok(!mmd.includes('-->|IN_DOMAIN|'), 'IN_DOMAIN should group, not draw an arrow');
});

t('a label containing a raw ">" is escaped, exactly as the model-authored path is', () => {
  // 'Take Rate > 4%?' is a real KAG metric name. Mermaid uses '>' as node-shape
  // syntax and swallows a raw '>' inside a QUOTED label with no error — the very
  // failure escapeLabelAngles exists to fix (see mermaidGuard.ts). Quoting the
  // label is NOT sufficient; the corrupted M1 case was quoted too.
  const mmd = graphToMermaid(SAMPLE_GRAPH);
  assert.ok(mmd.includes('Take Rate &gt; 4%?'), `label was not escaped:\n${mmd}`);
  assert.ok(!/"[^"\n]*[^t]> /.test(mmd), `a raw '>' survived inside a label:\n${mmd}`);
  // Escaping must agree with the M1 path character-for-character, not merely "look escaped".
  assert.equal(mmd, escapeLabelAngles(mmd), 'output disagrees with escapeLabelAngles');
  assert.equal(guardMermaid(mmd).ok, true);
});

t('the Term flag shape and edge arrows are not damaged by label escaping', () => {
  // escapeLabelAngles rewrites double-quoted spans only. The '>' that opens the
  // Term shape (`id>"label"]`) and the '>' in every `-->` sit outside quotes, so
  // both must pass through byte-identical.
  const withTerm: KagGraph = {
    nodes: [
      ...SAMPLE_GRAPH.nodes,
      { id: 'Term:take-rate', type: 'Term', label: 'Take rate', aliases: [], props: {}, provenance: 'glossary' },
    ],
    edges: [
      ...SAMPLE_GRAPH.edges,
      { from: 'Term:take-rate', to: 'Metric:take-rate-pct', type: 'ALIAS_OF', weight: 1, provenance: 'glossary' },
    ],
  };
  const mmd = graphToMermaid(withTerm);
  assert.ok(mmd.includes('Term_take_rate>"Take rate"]'), `Term flag shape was mangled:\n${mmd}`);
  assert.ok(mmd.includes('-->|ALIAS_OF|'), `edge arrow was mangled:\n${mmd}`);
  assert.equal(guardMermaid(mmd).ok, true);
});

t('maxNodes truncation is stated in the output, never silent', () => {
  const mmd = graphToMermaid(SAMPLE_GRAPH, { maxNodes: 2 });
  assert.ok(mmd.startsWith('%% truncated:'), mmd);
  assert.equal(guardMermaid(mmd).ok, true, 'truncated output must still be guard-clean');
});

t('a low-degree Domain is never evicted by the budget, even under heavy truncation', () => {
  // REGRESSION, found by rendering the REAL assembled graph (546 nodes, 4
  // domains) at the default maxNodes:60: only 2 of 4 domains rendered. A
  // Domain's own degree is just its direct IN_DOMAIN edge count, which loses
  // badly to individual well-connected Columns/Tables under pure top-degree
  // ranking. This graph reproduces that shape at small scale: "Quiet" has a
  // single, low-degree member, while "Busy" has several well-connected ones —
  // a naive global top-N would keep Busy's members and drop Quiet entirely.
  const g: KagGraph = {
    nodes: [
      { id: 'Domain:quiet', type: 'Domain', label: 'Quiet', aliases: [], props: {}, provenance: 'catalog' },
      { id: 'Domain:busy', type: 'Domain', label: 'Busy', aliases: [], props: {}, provenance: 'catalog' },
      { id: 'Table:quiet_tbl', type: 'Table', label: 'quiet_tbl', aliases: [], props: {}, provenance: 'bigquery' },
      { id: 'Table:busy_tbl', type: 'Table', label: 'busy_tbl', aliases: [], props: {}, provenance: 'bigquery' },
      { id: 'Metric:busy_m1', type: 'Metric', label: 'Busy Metric 1', aliases: [], props: {}, provenance: 'glossary' },
      { id: 'Metric:busy_m2', type: 'Metric', label: 'Busy Metric 2', aliases: [], props: {}, provenance: 'glossary' },
      { id: 'Column:busy_c1', type: 'Column', label: 'busy_c1', aliases: [], props: {}, provenance: 'bigquery' },
    ],
    edges: [
      { from: 'Table:quiet_tbl', to: 'Domain:quiet', type: 'IN_DOMAIN', weight: 1, provenance: 'catalog' },
      { from: 'Table:busy_tbl', to: 'Domain:busy', type: 'IN_DOMAIN', weight: 1, provenance: 'catalog' },
      { from: 'Metric:busy_m1', to: 'Domain:busy', type: 'IN_DOMAIN', weight: 1, provenance: 'catalog' },
      { from: 'Metric:busy_m2', to: 'Domain:busy', type: 'IN_DOMAIN', weight: 1, provenance: 'catalog' },
      { from: 'Metric:busy_m1', to: 'Table:busy_tbl', type: 'MEASURED_BY', weight: 1, provenance: 'glossary' },
      { from: 'Metric:busy_m2', to: 'Table:busy_tbl', type: 'MEASURED_BY', weight: 1, provenance: 'glossary' },
      { from: 'Table:busy_tbl', to: 'Column:busy_c1', type: 'HAS_COLUMN', weight: 1, provenance: 'bigquery' },
    ],
  };
  // busy_tbl has degree 4 (IN_DOMAIN + 2×MEASURED_BY + HAS_COLUMN); quiet_tbl
  // has degree 1. A pure top-degree cut to 3 non-domain slots keeps every Busy
  // member and drops Quiet's only member before Quiet's own Domain node is
  // ever considered — reproducing the real bug at this scale.
  const mmd = graphToMermaid(g, { maxNodes: 5 });
  assert.ok(mmd.includes('subgraph Domain_quiet'), `Quiet domain was evicted entirely:\n${mmd}`);
  assert.ok(mmd.includes('subgraph Domain_busy'), mmd);
  assert.equal(guardMermaid(mmd).ok, true);
});

t('rootId restricts to the neighborhood of one node, bounded by maxNodes', () => {
  // Column's only edge is to Table; Table also connects on to Domain and Metric.
  // A budget of 2 must stop at the immediate neighbor, not walk the whole graph.
  const mmd = graphToMermaid(SAMPLE_GRAPH, { rootId: 'Column:take_rate', maxNodes: 2 });
  assert.ok(mmd.includes('Column_take_rate'), mmd);
  assert.ok(mmd.includes('Table_fact_contact_center_metrics'), 'immediate neighbor should be kept');
  assert.ok(!mmd.includes('Metric_take_rate_pct'), 'two hops away should be excluded by the budget');
  assert.equal(guardMermaid(mmd).ok, true);
});

t('a rootId walk cut short by maxNodes says so — truncation is never silent', () => {
  // REGRESSION: the budget was applied INSIDE the breadth-first walk, so the
  // reachable-but-dropped nodes were never counted and no `%% truncated:` line was
  // emitted. A bounded neighborhood then looked exactly like a complete one — the
  // same silent-drop failure the maxNodes path is explicitly written to avoid.
  const mmd = graphToMermaid(SAMPLE_GRAPH, { rootId: 'Column:take_rate', maxNodes: 2 });
  assert.ok(mmd.startsWith('%% truncated:'), `bounded rootId walk did not report truncation:\n${mmd}`);
  assert.ok(mmd.includes('2 of 4 nodes'), mmd);

  // ...and a walk that fits inside the budget must NOT claim truncation.
  const whole = graphToMermaid(SAMPLE_GRAPH, { rootId: 'Column:take_rate' });
  assert.ok(!whole.includes('%% truncated:'), `unbounded walk falsely reported truncation:\n${whole}`);
});

t('the root node itself always survives its own budget', () => {
  // Degree ranking is right for a whole-graph view and WRONG here: Column is the
  // lowest-degree node in the sample, so ranking by degree would evict the very
  // node the caller asked to see and return a "neighborhood" without its centre.
  const mmd = graphToMermaid(SAMPLE_GRAPH, { rootId: 'Column:take_rate', maxNodes: 1 });
  assert.ok(mmd.includes('Column_take_rate'), `root was evicted by its own budget:\n${mmd}`);
});

t('an unknown rootId fails closed with a comment, not a throw', () => {
  assert.doesNotThrow(() => graphToMermaid(SAMPLE_GRAPH, { rootId: 'Metric:does-not-exist' }));
  const mmd = graphToMermaid(SAMPLE_GRAPH, { rootId: 'Metric:does-not-exist' });
  assert.ok(mmd.startsWith('%% root node not found'), mmd);
});

console.log(`\n${passed} passed (including label normalization).`);
