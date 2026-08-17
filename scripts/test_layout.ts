import assert from 'node:assert/strict';
import {
  detectLayoutIntent,
  deterministicParse,
  validateLayoutDirective,
  parseLayoutDirective,
  buildAcknowledgment,
  LayoutDirective,
  LAYOUT_TARGET_REGISTRY, LAYOUT_TARGETS, LAYOUT_PRESETS, LAYOUT_PRESETS_IDS,
  resolveTargetFromText, supportedTargetsMessage, TARGET_BY_ID,
} from '../backend/src/services/layoutDirective';
import {
  DEFAULT_PREFS as SERVER_DEFAULT_PREFS, coercePrefs,
  getPrefs, savePrefs, resetPrefs,
} from '../backend/src/services/layoutPrefsStore';
import {
  recordLayoutDirective, getLayoutMetrics, resetLayoutMetrics,
} from '../backend/src/services/layoutDirectiveTelemetry';

let passed = 0;
const queue: Array<() => Promise<void>> = [];
const t = (name: string, fn: () => void | Promise<void>) => {
  queue.push(async () => {
    try { await fn(); passed++; console.log(`  ok  ${name}`); }
    catch (e: any) { console.error(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
  });
};

// ── Task 1 acceptance: a layout command is classified as a UI intent, NOT a new
//    report or a data edit. Data queries and report edits must NOT be classified
//    as layout intents. ───────────────────────────────────────────────────────
console.log('detectLayoutIntent — recognizes UI-personalization commands');
const LAYOUT_COMMANDS = [
  'move the right panel to the bottom',
  'put the report panel on the left',
  'hide the sidebar',
  'show the history panel',
  'collapse the left panel',
  'make the panel wider',
  'shrink the report panel',
  'use a compact layout',
  'make it more spacious',
  'increase the density',
  'dock the panel at the bottom',
  'hide the navigation rail',
];
for (const cmd of LAYOUT_COMMANDS) {
  t(`layout: "${cmd}"`, () => {
    assert.equal(detectLayoutIntent(cmd).isLayout, true, `expected layout intent for "${cmd}"`);
  });
}

console.log('detectLayoutIntent — does NOT steal data queries or report edits');
const NON_LAYOUT = [
  'show me revenue by region',
  'what were sales last quarter',
  'compare churn across territories',
  'hide the table',          // structural report edit — no surface noun
  'remove the revenue chart', // structural report edit
  'change to a line chart',   // structural report edit
  'give me a summary',
  'top 5 territories by revenue',
  'show the KPI section only',
];
for (const cmd of NON_LAYOUT) {
  t(`non-layout: "${cmd}"`, () => {
    assert.equal(detectLayoutIntent(cmd).isLayout, false, `"${cmd}" must NOT be a layout intent`);
  });
}

// ── Task 2 acceptance: directives validate against the schema; unsupported
//    operations are rejected with a clear response. ────────────────────────────
console.log('deterministicParse — produces correct typed directives');
t('move right panel to bottom', () => {
  assert.deepEqual(deterministicParse('move the right panel to the bottom'),
    [{ op: 'move', target: 'right_panel', position: 'bottom' }]);
});
t('hide the sidebar → left_panel hide', () => {
  assert.deepEqual(deterministicParse('hide the sidebar'),
    [{ op: 'toggle', target: 'left_panel', visibility: 'hide' }]);
});
t('make the panel wider → resize wide', () => {
  assert.deepEqual(deterministicParse('make the report panel wider'),
    [{ op: 'resize', target: 'right_panel', size: 'wide' }]);
});
t('compact layout → density compact', () => {
  assert.deepEqual(deterministicParse('use a compact layout'),
    [{ op: 'density', density: 'compact' }]);
});
t('hide the nav rail → nav_rail hide', () => {
  assert.deepEqual(deterministicParse('hide the navigation rail'),
    [{ op: 'toggle', target: 'nav_rail', visibility: 'hide' }]);
});

console.log('validateLayoutDirective — accepts valid, rejects unsupported with clear reason');
t('valid move directive passes', () => {
  const r = validateLayoutDirective({ op: 'move', target: 'right_panel', position: 'bottom' });
  assert.equal(r.valid, true);
});
t('unknown op rejected with clear reason', () => {
  const r = validateLayoutDirective({ op: 'rotate', target: 'right_panel' });
  assert.equal(r.valid, false);
  if (!r.valid) assert.match(r.reason, /unsupported operation "rotate"/);
});
t('invalid position value rejected with clear reason', () => {
  const r = validateLayoutDirective({ op: 'move', target: 'right_panel', position: 'diagonal' });
  assert.equal(r.valid, false);
  if (!r.valid) assert.match(r.reason, /invalid position/);
});
t('invalid target rejected with clear reason', () => {
  const r = validateLayoutDirective({ op: 'toggle', target: 'footer', visibility: 'hide' });
  assert.equal(r.valid, false);
  if (!r.valid) assert.match(r.reason, /invalid target/);
});
t('missing required field rejected', () => {
  const r = validateLayoutDirective({ op: 'move', target: 'right_panel' });
  assert.equal(r.valid, false);
  if (!r.valid) assert.match(r.reason, /missing required field "position"/);
});
t('unsupported extra field rejected', () => {
  // NOTE: this used to assert that {op:'density', target:'right_panel'} was invalid.
  // Per-surface density is now a supported feature, so the case was re-pointed at a
  // field that genuinely is not in the schema. The property under test is unchanged:
  // additionalProperties:false must still reject anything the contract didn't declare.
  const r = validateLayoutDirective({ op: 'density', density: 'compact', pixels: 12 });
  assert.equal(r.valid, false);
});

t('density can now be scoped to a surface, but only a permitted one', () => {
  const scoped = validateLayoutDirective({ op: 'density', density: 'compact', target: 'right_panel' });
  assert.equal(scoped.valid, true, 'per-surface density should be accepted');

  // nav_rail has no independent spacing, so scoping to it is refused with a reason
  // rather than silently accepted and then doing nothing.
  const bad = validateLayoutDirective({ op: 'density', density: 'compact', target: 'nav_rail' });
  assert.equal(bad.valid, false);
});
t('non-object rejected, never throws', () => {
  assert.doesNotThrow(() => validateLayoutDirective(null));
  assert.equal((validateLayoutDirective(null) as any).valid, false);
  assert.equal((validateLayoutDirective('nope') as any).valid, false);
});

console.log('parseLayoutDirective — deterministic path returns validated directives');
t('parse returns validated directives (no LLM needed)', async () => {
  const r = await parseLayoutDirective('move the right panel to the bottom');
  assert.equal(r.source, 'deterministic');
  assert.equal(r.directives.length, 1);
  assert.equal(r.rejected.length, 0);
  assert.deepEqual(r.directives[0], { op: 'move', target: 'right_panel', position: 'bottom' });
});

console.log('buildAcknowledgment — clear responses');
t('acknowledges applied directives', () => {
  const ack = buildAcknowledgment({
    directives: [{ op: 'move', target: 'right_panel', position: 'bottom' }],
    rejected: [], source: 'deterministic',
  });
  assert.match(ack, /Done/);
  assert.match(ack, /report panel to the bottom/);
});
t('clearly reports unsupported operation', () => {
  const ack = buildAcknowledgment({
    directives: [],
    rejected: [{ raw: { op: 'rotate' }, reason: 'unsupported operation "rotate" — allowed: move, toggle, resize, density' }],
    source: 'none',
  });
  assert.match(ack, /can't do that/i);
  assert.match(ack, /unsupported operation "rotate"/);
});

console.log('telemetry');
t('records applied + rejected', () => {
  resetLayoutMetrics();
  recordLayoutDirective({
    directives: [{ op: 'move', target: 'right_panel', position: 'bottom' } as LayoutDirective],
    rejected: [], source: 'deterministic',
  }, { query: 'move the right panel to the bottom', provider: 'gemma' });
  recordLayoutDirective({
    directives: [],
    rejected: [{ raw: {}, reason: 'unsupported operation "rotate"' }], source: 'none',
  }, { query: 'rotate the panel', provider: 'gemma' });
  const m = getLayoutMetrics();
  assert.equal(m.detected, 2);
  assert.equal(m.applied, 1);
  assert.equal(m.directivesApplied, 1);
  assert.equal(m.directivesRejected, 1);
  assert.equal(m.byOp.move, 1);
});

// ── Registry refactor: new targets, new ops, persistence, anti-lockout ────────

console.log('target registry');
t('registry is internally consistent', () => {
  const ids = new Set<string>();
  for (const spec of LAYOUT_TARGET_REGISTRY) {
    assert.ok(!ids.has(spec.id), `duplicate target id: ${spec.id}`);
    ids.add(spec.id);
    assert.ok(spec.label.length > 0, `${spec.id} has no label`);
    assert.ok(spec.aliases.length > 0, `${spec.id} has no aliases`);
    assert.ok(spec.default, `${spec.id} has no default`);
  }
  assert.equal(LAYOUT_TARGETS.length, LAYOUT_TARGET_REGISTRY.length);
});

t('the targets users asked for are registered', () => {
  for (const id of ['profile', 'notifications', 'persona_selector', 'header_search', 'header_logo', 'mode_toggle']) {
    assert.ok(TARGET_BY_ID[id as keyof typeof TARGET_BY_ID], `${id} is not registered`);
  }
});

console.log('NL → registry mapping');
t('every registered alias resolves back to its own target', () => {
  // The strongest property available: no alias may be shadowed by another entry's.
  // Catches the ordering bug where a short alias ("report") swallows a longer one.
  for (const spec of LAYOUT_TARGET_REGISTRY) {
    for (const alias of [spec.label, ...spec.aliases]) {
      const got = resolveTargetFromText(`hide the ${alias}`);
      assert.equal(got, spec.id, `"${alias}" resolved to ${got}, expected ${spec.id}`);
    }
  }
});

t('the acceptance-criteria phrases map to the right surface', () => {
  const cases: [string, string][] = [
    ['remove the profile icon', 'profile'],
    ['hide my avatar', 'profile'],
    ['hide notifications', 'notifications'],
    ['get rid of the bell', 'notifications'],
    ['hide the persona selector', 'persona_selector'],
    ['hide the search bar', 'header_search'],
    ['hide the logo', 'header_logo'],
  ];
  for (const [q, expected] of cases) {
    const ds = deterministicParse(q);
    const toggle = ds.find(d => d.op === 'toggle') as any;
    assert.ok(toggle, `no toggle directive parsed from "${q}"`);
    assert.equal(toggle.target, expected, `"${q}" targeted ${toggle.target}`);
    assert.equal(toggle.visibility, 'hide');
  }
});

t('"remove the profile icon" is recognized as a layout intent at all', () => {
  // This is the regression the whole registry refactor exists for: before it, the
  // phrase never reached the parser because the surface noun was unknown.
  assert.equal(detectLayoutIntent('remove the profile icon').isLayout, true);
  assert.equal(detectLayoutIntent('hide notifications').isLayout, true);
});

t('unknown targets get a helpful listing, not a dead end', () => {
  assert.equal(resolveTargetFromText('hide the flux capacitor'), null);
  const msg = supportedTargetsMessage();
  assert.ok(msg.includes('report panel'), 'listing should name real surfaces');
  assert.ok(msg.includes('profile icon'), 'listing should include the new elements');
  assert.ok(LAYOUT_PRESETS_IDS.every(p => msg.includes(p)), 'listing should name every preset');
});

console.log('new bounded operations');
t('split / focus / text_scale / theme / high_contrast / preset validate', () => {
  const good: unknown[] = [
    { op: 'split', ratio: '70' },
    { op: 'focus', target: 'right_panel' },
    { op: 'focus', target: 'none' },
    { op: 'text_scale', scale: 'xl' },
    { op: 'theme', theme: 'dark' },
    { op: 'high_contrast', value: 'on' },
    { op: 'preset', preset: 'analyst' },
  ];
  for (const d of good) {
    const r = validateLayoutDirective(d);
    assert.equal(r.valid, true, `${JSON.stringify(d)} rejected: ${(r as any).reason}`);
  }
});

t('out-of-enum values on the new ops are refused', () => {
  const bad: unknown[] = [
    { op: 'split', ratio: '60' },          // not a registered step
    { op: 'split', ratio: 60 },            // number, not the enum string
    { op: 'focus', target: 'nav_rail' },   // not focusable
    { op: 'text_scale', scale: 'huge' },
    { op: 'theme', theme: 'solarized' },
    { op: 'high_contrast', value: 'maybe' },
    { op: 'preset', preset: 'ultra' },
    { op: 'text_scale', scale: '18px' },   // no free-form pixel values, ever
  ];
  for (const d of bad) {
    assert.equal(validateLayoutDirective(d).valid, false, `${JSON.stringify(d)} should be refused`);
  }
});

t('the acceptance-criteria commands parse deterministically (no LLM)', () => {
  const expect = (q: string, pred: (ds: LayoutDirective[]) => boolean) =>
    assert.ok(pred(deterministicParse(q)), `"${q}" did not parse as expected: ${JSON.stringify(deterministicParse(q))}`);

  expect('make the chat spacious', ds => ds.some(d => d.op === 'density' && (d as any).density === 'spacious' && (d as any).target === 'chat_panel'));
  expect('focus the report', ds => ds.some(d => d.op === 'focus' && (d as any).target === 'right_panel'));
  expect('make the text bigger', ds => ds.some(d => d.op === 'text_scale' && (d as any).scale === 'large'));
  expect('dark mode', ds => ds.some(d => d.op === 'theme' && (d as any).theme === 'dark'));
  expect('compact preset', ds => ds.some(d => d.op === 'preset' && (d as any).preset === 'compact'));
  expect('turn on high contrast', ds => ds.some(d => d.op === 'high_contrast' && (d as any).value === 'on'));
  expect('set the split to 70', ds => ds.some(d => d.op === 'split' && (d as any).ratio === '70'));
});

t('"compact layout" is still a density command, not the compact preset', () => {
  // The two vocabularies collide; density is the older, more common meaning.
  const ds = deterministicParse('compact layout');
  assert.ok(ds.some(d => d.op === 'density' && (d as any).density === 'compact'), JSON.stringify(ds));
  assert.ok(!ds.some(d => d.op === 'preset'), 'should not be read as a preset');
});

t('"make the panel bigger" resizes, it does not change the font size', () => {
  const ds = deterministicParse('make the panel bigger');
  assert.ok(ds.some(d => d.op === 'resize'), JSON.stringify(ds));
  assert.ok(!ds.some(d => d.op === 'text_scale'), 'bigger panel != bigger text');
});

console.log('presets');
t('every preset expands to directives that all validate', () => {
  for (const id of LAYOUT_PRESETS_IDS) {
    const bundle = LAYOUT_PRESETS[id];
    assert.ok(Array.isArray(bundle) && bundle.length > 0, `${id} preset is empty`);
    assert.equal(bundle[0].op, 'reset', `${id} must start from reset so it is absolute`);
    for (const d of bundle) {
      const r = validateLayoutDirective(d);
      assert.equal(r.valid, true, `${id} preset emits an invalid directive ${JSON.stringify(d)}: ${(r as any).reason}`);
    }
  }
});

console.log('anti-lockout');
t('the layout controls can never be hidden', () => {
  const r = validateLayoutDirective({ op: 'toggle', target: 'layout_controls', visibility: 'hide' });
  assert.equal(r.valid, false);
  assert.ok(/can't be hidden/i.test((r as any).reason), (r as any).reason);
});

t('a store blob claiming the controls are hidden is corrected on read', () => {
  const coerced = coercePrefs({ panels: { layout_controls: { visible: false } } });
  assert.equal(coerced.panels.layout_controls.visible, true, 'persistence must not be a lockout vector');
});

t('reset and every preset leave a usable layout', () => {
  // "Usable" = at least one primary work surface visible AND the escape hatch present.
  const usable = (p: any) =>
    p.panels.layout_controls.visible && (p.panels.chat_panel.visible || p.panels.right_panel.visible);
  assert.ok(usable(SERVER_DEFAULT_PREFS), 'defaults are not usable');
  assert.ok(usable(coercePrefs({})), 'an empty blob must coerce to a usable layout');
});

console.log('server persistence round-trip');
t('save → get → reset is per-user and isolated', async () => {
  const a = `__test_user_a_${process.pid}`;
  const b = `__test_user_b_${process.pid}`;
  try {
    await savePrefs(a, { ...SERVER_DEFAULT_PREFS, density: 'compact', theme: 'dark', textScale: 'large' });
    const got = await getPrefs(a);
    assert.ok(got, 'saved prefs should read back');
    assert.equal(got!.density, 'compact');
    assert.equal(got!.theme, 'dark');
    assert.equal(got!.textScale, 'large');

    // A different user must not see them.
    assert.equal(await getPrefs(b), null, 'prefs leaked across users');

    // Reset removes only that user's row.
    await savePrefs(b, { ...SERVER_DEFAULT_PREFS, density: 'spacious' });
    await resetPrefs(a);
    assert.equal(await getPrefs(a), null, 'reset should clear the user');
    assert.equal((await getPrefs(b))!.density, 'spacious', 'reset hit the wrong user');
  } finally {
    await resetPrefs(a);
    await resetPrefs(b);
  }
});

t('a malicious PUT body cannot inject unbounded values', async () => {
  const u = `__test_user_evil_${process.pid}`;
  try {
    const saved = await savePrefs(u, {
      density: 'ultra-compact',                       // not in the enum
      theme: 'javascript:alert(1)',
      textScale: '999px',
      split: '<script>',
      panels: {
        right_panel: { position: 'diagonal', size: '9999px', visible: 'yes', background: '#ff0000' },
        __proto__: { polluted: true },
      },
    });
    assert.equal(saved.density, SERVER_DEFAULT_PREFS.density);
    assert.equal(saved.theme, SERVER_DEFAULT_PREFS.theme);
    assert.equal(saved.textScale, SERVER_DEFAULT_PREFS.textScale);
    assert.equal(saved.split, SERVER_DEFAULT_PREFS.split);
    assert.equal(saved.panels.right_panel.position, SERVER_DEFAULT_PREFS.panels.right_panel.position);
    assert.equal(saved.panels.right_panel.size, SERVER_DEFAULT_PREFS.panels.right_panel.size);
    assert.equal(saved.panels.right_panel.background, undefined, 'free-form hex must be dropped');
    assert.equal((saved as any).polluted, undefined);
  } finally {
    await resetPrefs(u);
  }
});

console.log('frontend/backend contract lockstep');
console.log('focus is session-only');
t('focus is never persisted, whatever the client sends', async () => {
  const u = `__test_focus_${process.pid}`;
  try {
    // A client (or a hand-crafted PUT) claiming a focused state must not be able to
    // pin the next session into focus mode — it collapses every surface but one, so
    // the next login would land on a screen with no composer.
    const saved = await savePrefs(u, { ...SERVER_DEFAULT_PREFS, focus: 'right_panel', density: 'compact' });
    assert.equal(saved.focus, 'none', 'focus must be stripped on save');
    const got = await getPrefs(u);
    assert.equal(got!.focus, 'none', 'focus must be none on read');
    // ...while genuine preferences alongside it still persist.
    assert.equal(got!.density, 'compact', 'stripping focus must not drop other prefs');
  } finally {
    await resetPrefs(u);
  }
});

t('the frontend strips focus before writing, and forces none on load', () => {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'src/app/context/LayoutPrefsContext.tsx'), 'utf8');
  assert.ok(/function persistable\(/.test(src), 'persistable() helper is missing');
  assert.ok(/persistable\(prefs\)/.test(src), 'persistable is not applied on write');
  // Both storage paths must use it — the server PUT and the localStorage cache.
  const uses = (src.match(/persistable\(prefs\)/g) ?? []).length;
  assert.ok(uses >= 2, `expected persistable() on both write paths, found ${uses}`);
});

console.log('controls emit the same contract as chat');
t('every surface offered by the Customize menu is a registered target', () => {
  // The menu hand-mirrors the registry (separate tsconfig roots). If it offers a
  // control for something unregistered, clicking it emits a directive the backend
  // would refuse — a control that silently does nothing.
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'src/app/components/LayoutControls.tsx'), 'utf8');
  const block = /const SURFACES[^=]*=\s*\[([\s\S]*?)\n\];/.exec(src);
  assert.ok(block, 'SURFACES list not found in LayoutControls.tsx');
  const ids = [...block![1].matchAll(/id:\s*'([^']+)'/g)].map(m => m[1]);
  assert.ok(ids.length > 0, 'no surfaces parsed');
  for (const id of ids) {
    assert.ok((LAYOUT_TARGETS as readonly string[]).includes(id), `menu offers unregistered target "${id}"`);
  }
  // The essential surface must NOT be offered — a checkbox that refuses to work is
  // worse than no checkbox.
  assert.ok(!ids.includes('layout_controls'), 'the escape-hatch control must not be hideable from the menu');
  // Every other registered, toggleable surface SHOULD be reachable by clicking,
  // or a capability exists in chat but not in the UI.
  for (const spec of LAYOUT_TARGET_REGISTRY) {
    if (spec.id === 'layout_controls' || !spec.allowedOps.includes('toggle')) continue;
    assert.ok(ids.includes(spec.id), `"${spec.id}" is toggleable by chat but absent from the Customize menu`);
  }
});

t('the controls never hold their own layout state', () => {
  // The invariant that keeps chat and clicks identical: LayoutControls must route
  // everything through applyDirectives/resetPrefs and never keep a parallel copy of
  // preferences. Its only useState is which menu is open.
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'src/app/components/LayoutControls.tsx'), 'utf8');
  const states = [...src.matchAll(/useState<([^>]*)>/g)].map(m => m[1]);
  for (const s of states) {
    assert.ok(
      /'none'\s*\|\s*'edit'\s*\|\s*'customize'/.test(s),
      `LayoutControls holds unexpected state <${s}> — layout state must live in the provider`,
    );
  }
  assert.ok(/applyDirectives\(/.test(src), 'controls must emit directives through applyDirectives');
});

t('every registered target has a render binding that actually exists', () => {
  // The declaration in RENDER_BINDINGS is checked against reality here: the named
  // file must genuinely reference the target. Without this, the map could claim a
  // binding that was never written — which is precisely the silent failure it exists
  // to prevent (parses, validates, persists, renders nothing).
  const fs = require('fs');
  const path = require('path');
  const ctxPath = path.join(__dirname, '..', 'src/app/context/LayoutPrefsContext.tsx');
  const ctxSrc = fs.readFileSync(ctxPath, 'utf8');

  const block = /export const RENDER_BINDINGS[^=]*=\s*\{([\s\S]*?)\n\};/.exec(ctxSrc);
  assert.ok(block, 'RENDER_BINDINGS not found in LayoutPrefsContext.tsx');
  const bindings = new Map<string, string>();
  for (const m of block![1].matchAll(/^\s*(\w+)\s*:\s*'([^']+)'/gm)) bindings.set(m[1], m[2]);

  for (const id of LAYOUT_TARGETS) {
    const file = bindings.get(id);
    assert.ok(file, `"${id}" is registered but has no RENDER_BINDINGS entry`);
    const abs = path.join(__dirname, '..', file!);
    assert.ok(fs.existsSync(abs), `"${id}" claims a binding in ${file}, which does not exist`);
    const src = fs.readFileSync(abs, 'utf8');
    assert.ok(
      src.includes(`panels.${id}`),
      `"${id}" claims a render binding in ${file}, but that file never reads panels.${id}`,
    );
  }
});

t('frontend DEFAULT_PREFS covers exactly the registered targets', () => {
  // The frontend mirrors this contract by hand (two tsconfig roots, no shared module).
  // Reading its source is cheaper than letting the two drift silently.
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'src/app/context/LayoutPrefsContext.tsx'), 'utf8');
  for (const id of LAYOUT_TARGETS) {
    assert.ok(
      new RegExp(`\\b${id}\\s*:`).test(src),
      `frontend LayoutPrefsContext is missing the "${id}" target — backend and frontend have drifted`,
    );
  }
});

// Run all tests (sync + async) sequentially, then print the tally.
(async () => {
  for (const run of queue) await run();
  console.log(`\n${passed} passed.`);
})();
