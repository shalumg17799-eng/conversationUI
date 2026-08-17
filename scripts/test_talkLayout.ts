// Geometry guard for the Adaptive UI layout engine.
//
// The bug this pins: every Talk surface is `position: fixed`, so each one's box is
// COMPUTED, not laid out by flow — nothing pushes anything. The page ran two
// different copies of that arithmetic (one size-aware for the history panel, one
// hardcoded at 240px; one header-aware, one pinned to a 52px top) and the chat
// workspace only made room for a RIGHT-docked report panel. So a directive moved
// some surfaces and not others: "move the report panel to the bottom" dropped the
// panel on top of the chat, "make the sidebar wide" left an 80px seam, and
// "hide the header" left a 52px hole. That is the "changes partially" report.
//
// computeTalkLayout is now the single source of truth. This test resolves the
// styles it returns into real pixel rectangles and asserts the invariant that
// actually matters: THE SURFACES TILE THE VIEWPORT — no overlap, no gap — across
// every combination of dock edge, header position, sidebar width, nav rail and
// dataset panel. A second engine cannot be reintroduced without failing this.
//
// Run: npm run test:talklayout   (from repo root)

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeTalkLayout, applyDirective, chromeOffsets, DEFAULT_PREFS,
  RAIL_W, DATASET_W, HISTORY_WIDTHS, REPORT_WIDTHS,
  type LayoutPrefs, type LayoutDirective, type LayoutPosition, type LayoutSize,
} from '../src/app/context/LayoutPrefsContext';

let passed = 0;
function t(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e: any) { console.error(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
}

// ── resolve a React style into a pixel rectangle ─────────────────────────────
const VW = 1600, VH = 900;

function val(v: unknown, W = VW, H = VH): number {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim();
  const calc = s.match(/^calc\((.+)\)$/);
  if (calc) return calc[1].split('+').reduce((a, term) => a + val(term.trim(), W, H), 0);
  if (s.endsWith('px')) return parseFloat(s);
  if (s.endsWith('vh')) return (parseFloat(s) / 100) * H;
  if (s.endsWith('vw')) return (parseFloat(s) / 100) * W;
  return parseFloat(s) || 0;
}
const has = (v: unknown) => v !== undefined && v !== null;

interface Rect { x1: number; x2: number; y1: number; y2: number; }
function rectOf(style: Record<string, unknown>): Rect {
  const L = has(style.left) ? val(style.left) : undefined;
  const R = has(style.right) ? val(style.right) : undefined;
  const Wd = has(style.width) ? val(style.width) : undefined;
  const T = has(style.top) ? val(style.top) : undefined;
  const B = has(style.bottom) ? val(style.bottom) : undefined;
  const Ht = has(style.height) ? val(style.height) : undefined;

  let x1: number, x2: number, y1: number, y2: number;
  if (L !== undefined && R !== undefined) { x1 = L; x2 = VW - R; }
  else if (L !== undefined && Wd !== undefined) { x1 = L; x2 = L + Wd; }
  else if (R !== undefined && Wd !== undefined) { x2 = VW - R; x1 = x2 - Wd; }
  else throw new Error(`cannot resolve horizontal box from ${JSON.stringify(style)}`);

  if (T !== undefined && B !== undefined) { y1 = T; y2 = VH - B; }
  else if (T !== undefined && Ht !== undefined) { y1 = T; y2 = T + Ht; }
  else if (B !== undefined && Ht !== undefined) { y2 = VH - B; y1 = y2 - Ht; }
  else throw new Error(`cannot resolve vertical box from ${JSON.stringify(style)}`);

  return { x1, x2, y1, y2 };
}

const overlaps = (a: Rect, b: Rect) =>
  a.x1 < b.x2 - 0.001 && b.x1 < a.x2 - 0.001 && a.y1 < b.y2 - 0.001 && b.y1 < a.y2 - 0.001;

const prefsWith = (...ds: LayoutDirective[]): LayoutPrefs => ds.reduce(applyDirective, DEFAULT_PREFS);

// ── the invariant, swept across every combination ────────────────────────────

const DOCKS: LayoutPosition[] = ['right', 'left', 'top', 'bottom'];
const SIZES: LayoutSize[] = ['narrow', 'default', 'wide', 'full'];
type HeaderCase = { name: string; ds: LayoutDirective[] };
const HEADERS: HeaderCase[] = [
  { name: 'header top', ds: [] },
  { name: 'header bottom', ds: [{ op: 'move', target: 'header', position: 'bottom' }] },
  { name: 'header hidden', ds: [{ op: 'toggle', target: 'header', visibility: 'hide' }] },
];

t('workspace and report panel tile the viewport — no overlap, no gap (192 combos)', () => {
  let combos = 0;
  for (const dock of DOCKS) {
    for (const header of HEADERS) {
      for (const histSize of SIZES) {
        for (const rail of [true, false]) {
          for (const dataset of [true, false]) {
            const ds: LayoutDirective[] = [
              ...header.ds,
              { op: 'move', target: 'right_panel', position: dock },
              { op: 'resize', target: 'left_panel', size: histSize },
            ];
            if (!rail) ds.push({ op: 'toggle', target: 'nav_rail', visibility: 'hide' });
            const prefs = prefsWith(...ds);
            const L = computeTalkLayout(prefs, { reportPanelActive: true, datasetPanelActive: dataset });
            const label = `${dock} / ${header.name} / hist ${histSize} / rail ${rail} / dataset ${dataset}`;

            const work = rectOf(L.workspaceStyle as Record<string, unknown>);
            const rep = rectOf(L.reportPanel.style as Record<string, unknown>);
            assert.ok(!overlaps(work, rep), `${label}: workspace overlaps the report panel`);

            // They must ABUT on the dock edge — an inequality here is the gap.
            const edge = { right: [work.x2, rep.x1], left: [work.x1, rep.x2], top: [work.y1, rep.y2], bottom: [work.y2, rep.y1] }[dock];
            assert.ok(Math.abs(edge[0] - edge[1]) < 0.001, `${label}: ${dock} seam — workspace edge ${edge[0]} vs panel edge ${edge[1]}`);

            // The content region starts past the rail + history, whichever is showing.
            const chrome = chromeOffsets(prefs);
            const contentLeft = (rail ? RAIL_W : 0) + HISTORY_WIDTHS[histSize];
            const leading = dock === 'left' ? rep : work;
            assert.equal(leading.x1, contentLeft, `${label}: content should start at ${contentLeft}`);

            // Nothing may stray outside the header-adjusted vertical band.
            for (const [nm, r] of [['workspace', work], ['report', rep]] as const) {
              assert.ok(r.y1 >= chrome.top - 0.001, `${label}: ${nm} overlaps the header (top ${r.y1} < ${chrome.top})`);
              assert.ok(r.y2 <= VH - chrome.bottom + 0.001, `${label}: ${nm} overlaps a bottom-docked header`);
            }

            // The dataset panel owns the right edge; a right-docked report stacks inboard.
            if (dataset) {
              const dsRect = rectOf(L.datasetPanelStyle as Record<string, unknown>);
              assert.ok(!overlaps(work, dsRect), `${label}: workspace overlaps the dataset panel`);
              assert.ok(!overlaps(rep, dsRect), `${label}: report panel overlaps the dataset panel`);
              assert.equal(dsRect.x2, VW, `${label}: dataset panel should hold the right edge`);
            }
            combos++;
          }
        }
      }
    }
  }
  assert.equal(combos, 192, `expected 192 combinations, swept ${combos}`);
});

t('history panel sits between the rail and the content, at its directive-set width', () => {
  for (const size of SIZES) {
    const prefs = prefsWith({ op: 'resize', target: 'left_panel', size });
    const L = computeTalkLayout(prefs, { reportPanelActive: false, datasetPanelActive: false });
    const hist = rectOf(L.historyStyle as Record<string, unknown>);
    assert.equal(hist.x1, RAIL_W, `${size}: history should start at the rail edge`);
    assert.equal(hist.x2 - hist.x1, HISTORY_WIDTHS[size], `${size}: history width`);
    const work = rectOf(L.workspaceStyle as Record<string, unknown>);
    assert.equal(work.x1, hist.x2, `${size}: workspace must abut the history panel`);
  }
});

// ── the specific reported failures ───────────────────────────────────────────

t('REGRESSION "move the report panel to the bottom" — workspace yields vertical room', () => {
  const prefs = prefsWith({ op: 'move', target: 'right_panel', position: 'bottom' });
  const L = computeTalkLayout(prefs, { reportPanelActive: true, datasetPanelActive: false });
  const work = rectOf(L.workspaceStyle as Record<string, unknown>);
  const rep = rectOf(L.reportPanel.style as Record<string, unknown>);
  // Previously the workspace kept bottom:0 and the panel landed on top of the chat.
  assert.equal(work.y2, rep.y1, 'workspace must stop where the bottom-docked panel starts');
  assert.ok(work.y2 < VH, 'workspace must not run to the viewport floor');
  assert.equal(rep.y2, VH, 'panel should reach the floor when the header is on top');
});

t('REGRESSION "make the sidebar wide" — the report panel follows the new sidebar edge', () => {
  const prefs = prefsWith(
    { op: 'move', target: 'right_panel', position: 'bottom' },
    { op: 'resize', target: 'left_panel', size: 'wide' },
  );
  const L = computeTalkLayout(prefs, { reportPanelActive: true, datasetPanelActive: false });
  const rep = rectOf(L.reportPanel.style as Record<string, unknown>);
  // The old engine hardcoded a 240px history here, leaving an 80px seam.
  assert.equal(rep.x1, RAIL_W + HISTORY_WIDTHS.wide, 'panel must start past the WIDE sidebar (64 + 320)');
  assert.notEqual(rep.x1, RAIL_W + HISTORY_WIDTHS.default, 'must not fall back to the default width');
});

t('REGRESSION "hide the header" — every surface reclaims the top 52px', () => {
  const prefs = prefsWith({ op: 'toggle', target: 'header', visibility: 'hide' });
  const L = computeTalkLayout(prefs, { reportPanelActive: true, datasetPanelActive: false });
  for (const [nm, style] of [
    ['workspace', L.workspaceStyle], ['report', L.reportPanel.style],
    ['history', L.historyStyle], ['dataset', L.datasetPanelStyle],
  ] as const) {
    assert.equal(rectOf(style as Record<string, unknown>).y1, 0, `${nm} must start at 0 with no header`);
  }
});

t('REGRESSION header docked bottom — surfaces stop short of the bar', () => {
  const prefs = prefsWith({ op: 'move', target: 'header', position: 'bottom' });
  const L = computeTalkLayout(prefs, { reportPanelActive: true, datasetPanelActive: false });
  const chrome = chromeOffsets(prefs);
  assert.equal(chrome.bottom, 52);
  for (const [nm, style] of [
    ['workspace', L.workspaceStyle], ['history', L.historyStyle], ['dataset', L.datasetPanelStyle],
  ] as const) {
    assert.equal(rectOf(style as Record<string, unknown>).y2, VH - 52, `${nm} must clear a bottom header`);
    assert.equal(rectOf(style as Record<string, unknown>).y1, 0, `${nm} must start at 0`);
  }
});

t('REGRESSION "hide the sidebar" — content reflows to the rail edge', () => {
  const prefs = prefsWith({ op: 'toggle', target: 'left_panel', visibility: 'hide' });
  const L = computeTalkLayout(prefs, { reportPanelActive: false, datasetPanelActive: false });
  assert.equal(L.historyVisible, false);
  assert.equal(rectOf(L.workspaceStyle as Record<string, unknown>).x1, RAIL_W);
});

t('"hide the nav rail" and "hide the sidebar" together clear the left edge', () => {
  const prefs = prefsWith(
    { op: 'toggle', target: 'left_panel', visibility: 'hide' },
    { op: 'toggle', target: 'nav_rail', visibility: 'hide' },
  );
  const L = computeTalkLayout(prefs, { reportPanelActive: false, datasetPanelActive: false });
  assert.equal(rectOf(L.workspaceStyle as Record<string, unknown>).x1, 0);
});

t('"hide the report" removes the panel and gives the room back', () => {
  const prefs = prefsWith({ op: 'toggle', target: 'right_panel', visibility: 'hide' });
  const L = computeTalkLayout(prefs, { reportPanelActive: true, datasetPanelActive: false });
  assert.equal(L.reportVisible, false);
  const work = rectOf(L.workspaceStyle as Record<string, unknown>);
  assert.equal(work.x2, VW, 'workspace should reclaim the full width');
});

t('resize directives actually change the report width', () => {
  for (const size of SIZES) {
    const prefs = prefsWith({ op: 'resize', target: 'right_panel', size });
    const L = computeTalkLayout(prefs, { reportPanelActive: true, datasetPanelActive: false });
    const rep = rectOf(L.reportPanel.style as Record<string, unknown>);
    assert.equal(rep.x2 - rep.x1, REPORT_WIDTHS[size], `report width for ${size}`);
    const work = rectOf(L.workspaceStyle as Record<string, unknown>);
    assert.equal(work.x2, rep.x1, `workspace must track the ${size} report width`);
  }
});

t('reset returns every surface to the default frame', () => {
  const messy = prefsWith(
    { op: 'move', target: 'right_panel', position: 'bottom' },
    { op: 'toggle', target: 'left_panel', visibility: 'hide' },
    { op: 'resize', target: 'right_panel', size: 'full' },
    { op: 'reset' },
  );
  assert.deepEqual(messy, DEFAULT_PREFS);
  const L = computeTalkLayout(messy, { reportPanelActive: true, datasetPanelActive: false });
  assert.equal(L.reportDock, 'right');
  assert.equal(rectOf(L.workspaceStyle as Record<string, unknown>).x1, RAIL_W + HISTORY_WIDTHS.default);
});

t('dataset panel is a fixed 480 and outranks the report panel on the right edge', () => {
  const prefs = prefsWith({ op: 'move', target: 'right_panel', position: 'right' });
  const L = computeTalkLayout(prefs, { reportPanelActive: true, datasetPanelActive: true });
  const ds = rectOf(L.datasetPanelStyle as Record<string, unknown>);
  const rep = rectOf(L.reportPanel.style as Record<string, unknown>);
  assert.equal(ds.x2 - ds.x1, DATASET_W);
  assert.equal(rep.x2, ds.x1, 'a right-docked report must stack inboard of the dataset panel');
});

// The unit tests above prove the ENGINE is right. This one proves the page still
// asks it, instead of quietly growing a second copy of the arithmetic again —
// which is how the surfaces drifted apart in the first place.
t('the Talk page owns no layout geometry of its own', () => {
  // Bundled to node_modules/.cache before running, so __dirname is not the repo —
  // resolve from cwd, which the npm script pins to the root.
  const pagePath = join(process.cwd(), 'src/app/pages/Conversational_new.tsx');
  if (!existsSync(pagePath)) throw new Error(`run this from the repo root (looked for ${pagePath})`);
  const page = readFileSync(pagePath, 'utf8');
  const banned = [
    'layoutMetrics', 'reportPanelChrome', 'NAV_RAIL_WIDTH',
    'RIGHT_PANEL_WIDTHS', 'LEFT_PANEL_WIDTHS', 'chromeOffsets',
  ];
  const found = banned.filter((sym) => page.includes(sym));
  assert.deepEqual(
    found, [],
    `Conversational_new.tsx reintroduced local layout math (${found.join(', ')}).\n` +
    'Return the box from computeTalkLayout instead — two engines drift and leave gaps/overlaps.',
  );
});

console.log(`\n${passed} passed`);
if (process.exitCode) console.error('FAILURES — see above');
