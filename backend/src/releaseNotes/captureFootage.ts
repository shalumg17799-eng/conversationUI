// Piece 3 — automated "guided tour" screen capture for the what's-new video.
//
// For each feature we drive the REAL running app with Playwright and record a
// short clip that behaves like an interactive prototype: a synthetic cursor
// glides to the actual control, a spotlight ring pulses on it ("added here"),
// then the control is clicked/opened. Each clip becomes that feature scene's
// `backgroundVideo`, which the InsightScene plays full-screen with the feature
// copy overlaid.
//
// Deliberately best-effort and OFF by default:
//   • enable with RELEASE_CAPTURE=1 (and have `playwright` installed).
//   • RELEASE_CAPTURE_URL      → running app (default http://localhost:5173).
//   • RELEASE_CAPTURE_ROLE     → seeded into localStorage.auth_role to pass the
//                                client-side login gate (default "admin").
//   • RELEASE_CAPTURE_MAGICLINK→ full magic-link URL to open first instead of
//                                seeding localStorage (overrides ROLE seeding).
//   • RELEASE_CAPTURE_SECS     → clip length target (default 8).
// Disabled / Playwright missing / a flow throws → we return whatever clips we got
// (possibly none); those scenes render clean. Capture is never fatal to a publish.

import { promises as fs } from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';
import { FOOTAGE_ROOT } from '../services/videoJobs';
import type { FeatureNote } from './types';

const ASSET_BASE = process.env.RENDER_ASSET_BASE || `http://localhost:${process.env.PORT || 3001}`;
const APP_URL = (process.env.RELEASE_CAPTURE_URL || 'http://localhost:5173').replace(/\/$/, '');
const APP_ORIGIN = (() => { try { return new URL(APP_URL).origin; } catch { return APP_URL; } })();
const ROLE = process.env.RELEASE_CAPTURE_ROLE || 'internal';
const PROVIDER = process.env.RELEASE_CAPTURE_PROVIDER || 'gemma';
const MAGIC_LINK = process.env.RELEASE_CAPTURE_MAGICLINK || '';
const CAPTURE_SECS = Number(process.env.RELEASE_CAPTURE_SECS || 6);
const VIEWPORT = { width: 1920, height: 1080 };

export const captureEnabled = (): boolean => process.env.RELEASE_CAPTURE === '1';

// ── Injected into every page: a cursor + spotlight the recording will show ────
// Runs before app scripts (addInitScript) so window.__tour is ready immediately
// and the cursor element survives SPA route changes (body persists).
const TOUR_INIT = `
(() => {
  if (window.__tourInstalled) return;
  window.__tourInstalled = true;
  const ensure = () => {
    if (!document.body) return;
    let cur = document.getElementById('__tour_cursor');
    if (!cur) {
      cur = document.createElement('div');
      cur.id = '__tour_cursor';
      cur.style.cssText = [
        'position:fixed','left:0','top:0','width:28px','height:28px','z-index:2147483647',
        'pointer-events:none','transition:transform .8s cubic-bezier(.22,.61,.36,1)',
        'transform:translate(60px,60px)','will-change:transform',
      ].join(';');
      cur.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none">' +
        '<path d="M4 2 L4 20 L9 15 L12.5 22.5 L15.5 21 L12 13.5 L19 13.5 Z" fill="#fff" stroke="#1A1917" stroke-width="1.4" stroke-linejoin="round"/></svg>';
      document.body.appendChild(cur);
      const ring = document.createElement('div');
      ring.id = '__tour_ring';
      ring.style.cssText = [
        'position:fixed','left:0','top:0','z-index:2147483646','pointer-events:none',
        'border:3px solid #D4572A','border-radius:14px','opacity:0',
        'box-shadow:0 0 0 4px rgba(212,87,42,.25), 0 0 30px rgba(212,87,42,.45)',
        'transition:opacity .3s ease, left .5s ease, top .5s ease, width .5s ease, height .5s ease',
      ].join(';');
      document.body.appendChild(ring);
      const style = document.createElement('style');
      style.textContent = '@keyframes __tourPulse{0%,100%{box-shadow:0 0 0 4px rgba(212,87,42,.25),0 0 26px rgba(212,87,42,.4)}50%{box-shadow:0 0 0 8px rgba(212,87,42,.12),0 0 40px rgba(212,87,42,.6)}}';
      document.head.appendChild(style);
    }
  };
  window.__tour = {
    rect(sel){ const el=document.querySelector(sel); if(!el) return null; const r=el.getBoundingClientRect(); if(r.width===0&&r.height===0) return null; return {x:r.left,y:r.top,w:r.width,h:r.height}; },
    moveTo(sel){ ensure(); const r=this.rect(sel); const cur=document.getElementById('__tour_cursor'); if(!r||!cur) return false; cur.style.transform='translate('+(r.x+r.w/2-4)+'px,'+(r.y+r.h/2-4)+'px)'; return true; },
    highlight(sel){ ensure(); const r=this.rect(sel); const ring=document.getElementById('__tour_ring'); if(!r||!ring) return false; const pad=8; ring.style.left=(r.x-pad)+'px'; ring.style.top=(r.y-pad)+'px'; ring.style.width=(r.w+pad*2)+'px'; ring.style.height=(r.h+pad*2)+'px'; ring.style.opacity='1'; ring.style.animation='__tourPulse 1.6s ease-in-out infinite'; return true; },
    clear(){ const ring=document.getElementById('__tour_ring'); if(ring){ring.style.opacity='0';ring.style.animation='';} },
  };
  if (document.readyState !== 'loading') ensure();
  else document.addEventListener('DOMContentLoaded', ensure);
})();
`;

const wait = (page: any, ms: number) => page.waitForTimeout(ms);

// ── Per-feature flows, keyed by a substring of the feature id/title/area. New or
// unmatched features fall back to a gentle scroll of the conversational page. ──
interface Flow {
  route: string;                       // SPA route to open
  target: string;                      // selector to move the cursor to + spotlight
  prep?: (page: any) => Promise<void>; // steps before the spotlight (type a question, etc.)
  action?: (page: any) => Promise<void>; // click after the spotlight (open a menu, etc.)
  waitFor?: string;                    // selector to await before touring (optional)
}

const softClick = async (page: any, sel: string) => {
  try { await page.locator(sel).first().click({ timeout: 3000 }); } catch { /* optional */ }
};

const FLOWS: Array<{ match: RegExp; flow: Flow }> = [
  {
    // Video tray — most reliable: the clapperboard is always in the header.
    match: /video|remotion|narrat/i,
    flow: {
      route: '/conversational',
      target: 'button[aria-label="Video reports"]',
      action: (page) => softClick(page, 'button[aria-label="Video reports"]'),
    },
  },
  {
    // Doc/deck export — ask a question, wait for the report, spotlight "Export as".
    match: /export|doc|deck|pdf|ppt|powerpoint|word/i,
    flow: {
      route: '/conversational',
      prep: async (page) => {
        await softClick(page, '[data-slot="textarea"]');
        try { await page.locator('[data-slot="textarea"]').first().fill('Show me territory performance'); } catch { /* ignore */ }
        await softClick(page, 'button:has-text("Ask")');
      },
      waitFor: 'button:has-text("Export as")',
      target: 'button:has-text("Export as")',
      action: (page) => softClick(page, 'button:has-text("Export as")'),
    },
  },
  {
    // Model upgrade / auto-visuals — spotlight the ask box with a question typed
    // in. We do NOT submit: submitting drops to a loading/home state that would
    // dominate the (looping) clip. The ask box in use tells the story cleanly.
    match: /model|answer|visual|chart|tool|smarter|faster/i,
    flow: {
      route: '/conversational',
      target: '[data-slot="textarea"]',
      prep: async (page) => {
        await softClick(page, '[data-slot="textarea"]');
        try { await page.locator('[data-slot="textarea"]').first().fill('Show revenue trend by territory'); } catch { /* ignore */ }
      },
    },
  },
];

const flowFor = (feature: FeatureNote): Flow => {
  const hay = `${feature.id} ${feature.title} ${feature.affectedArea ?? ''}`;
  return FLOWS.find((f) => f.match.test(hay))?.flow
      ?? { route: '/conversational', target: '[data-slot="textarea"]' };
};

// The "What's New" modal auto-opens on login and would cover the feature being
// filmed. Dismiss it (seeded localStorage usually prevents it; this is a belt-
// and-suspenders for a version mismatch).
async function dismissWhatsNew(page: any) {
  try {
    await page.keyboard.press('Escape');
    await page.locator('[aria-label="Close"]').first().click({ timeout: 1200 }).catch(() => {});
    await wait(page, 400);
  } catch { /* nothing open */ }
}

async function tour(page: any, flow: Flow) {
  await page.goto(`${APP_URL}${flow.route}`, { waitUntil: 'networkidle', timeout: 20_000 });
  await wait(page, 800);
  await dismissWhatsNew(page);
  if (flow.prep) { await flow.prep(page); await wait(page, 800); }
  if (flow.waitFor) { try { await page.waitForSelector(flow.waitFor, { timeout: 30_000 }); } catch { /* tour whatever's there */ } }

  // Move cursor → spotlight → perform the action, then HOLD on that end state
  // (menu/tray open, question typed) with the ring still on for the rest of the
  // clip — so a short clip that loops always shows the feature, never idle home.
  await page.evaluate((sel: string) => (window as any).__tour?.moveTo(sel), flow.target).catch(() => {});
  await wait(page, 900);
  await page.evaluate((sel: string) => (window as any).__tour?.highlight(sel), flow.target).catch(() => {});
  await wait(page, 1300);
  if (flow.action) { await flow.action(page); await wait(page, 1000); }
  // Keep the ring + end state visible through the tail (no clear()).
  await wait(page, Math.max(600, CAPTURE_SECS * 1000 - 4000));
}

export async function captureReleaseFootage(
  jobId: string,
  version: string,
  features: FeatureNote[],
): Promise<Record<string, string>> {
  if (!captureEnabled()) return {};

  let chromium: any;
  try { ({ chromium } = await import('playwright' as any)); }
  catch { console.warn('[capture] RELEASE_CAPTURE=1 but `playwright` is not installed; skipping footage'); return {}; }

  const outDir = path.join(FOOTAGE_ROOT, jobId);
  await fs.mkdir(outDir, { recursive: true });
  const result: Record<string, string> = {};

  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'] });
  try {
    for (const feature of features) {
      const flow = flowFor(feature);
      // Fresh context per clip: recordVideo writes one webm per context on close.
      const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: 1,
        recordVideo: { dir: outDir, size: VIEWPORT },
      });
      // Pass the client-side login gate: seed localStorage before any app code runs.
      await context.addInitScript(
        ({ role, provider, origin, version: v }: { role: string; provider: string; origin: string; version: string }) => {
          try {
            if (location.origin === origin) {
              localStorage.setItem('auth_role', role);
              if (!localStorage.getItem('llm_provider')) localStorage.setItem('llm_provider', provider);
              // Mark this release seen so the What's New modal doesn't auto-open
              // over the feature we're filming.
              localStorage.setItem('whatsNewLastSeenVersion', v);
              sessionStorage.setItem('whatsNewAutoOpenedVersion', v);
            }
          } catch { /* ignore */ }
        },
        { role: ROLE, provider: PROVIDER, origin: APP_ORIGIN, version },
      );
      await context.addInitScript(TOUR_INIT);

      const page = await context.newPage();
      try {
        // Magic-link login takes precedence when provided.
        if (MAGIC_LINK) { await page.goto(MAGIC_LINK, { waitUntil: 'networkidle', timeout: 20_000 }).catch(() => {}); }
        await tour(page, flow);
        const video = page.video();
        await context.close(); // finalizes the webm
        if (video) {
          const raw = await video.path();
          const dest = path.join(outDir, `${feature.id}.webm`);
          await fs.rename(raw, dest).catch(async () => { await fs.copyFile(raw, dest); });
          result[feature.id] = `${ASSET_BASE}/media/footage/${jobId}/${feature.id}.webm`;
          console.log(`[capture] ${feature.id}: recorded ${flow.route}`);
        }
      } catch (e) {
        await context.close().catch(() => {});
        console.warn(`[capture] ${feature.id}: flow failed (${(e as Error)?.message ?? e}); scene renders clean`);
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// Timeline-driven TOUR capture. Given each feature's narration BEATS (spoken
// phrases with timings), record one deep, header-visible shot per beat — chosen
// from the beat's own words — so the footage shows exactly what's being said in
// that window. Returns { featureId: [clipUrl per beat] }.
// ═══════════════════════════════════════════════════════════════════════════

export interface TourFeaturePlan { id: string; affectedArea?: string; beats: string[]; }

type ShotKind = 'ask' | 'reports' | 'dashboard' | 'video-tray';

// Pick the deep screen to film for a given spoken phrase. Only screens verified
// to render real, header-visible content are used (ask box, reports grid,
// dashboard charts/KPIs, video tray) — falls back to the feature's home area
// when the words are generic.
function shotForBeat(text: string, area?: string): ShotKind {
  const t = text.toLowerCase();
  if (/video|tray|narrat|remotion|clip|voiceover|voice-over/.test(t)) return 'video-tray';
  if (/chart|visual|kpi|table|graph|metric|dashboard|trend|snapshot/.test(t)) return 'dashboard';
  if (/export|pdf|word|powerpoint|deck|download|toolbar|document|report|insight/.test(t)) return 'reports';
  if (/ask|question|answer|plain language|type|prompt/.test(t)) return 'ask';
  const a = (area ?? '').toLowerCase();
  if (a.includes('video')) return 'video-tray';
  if (a.includes('report')) return 'reports';
  if (a.includes('llm')) return 'ask';
  return 'dashboard';
}

// Record one self-contained deep shot: navigate, dismiss the modal, drive the
// relevant control with cursor+spotlight, and dwell. Every kind lands on a real
// screen with the app header visible. Leading load frames are trimmed later.
async function recordShot(page: any, kind: ShotKind, dwellMs: number) {
  const go = (route: string) => page.goto(`${APP_URL}${route}`, { waitUntil: 'networkidle', timeout: 20_000 });
  const spot = async (sel: string) => {
    await page.evaluate((s: string) => (window as any).__tour?.moveTo(s), sel).catch(() => {});
    await wait(page, 700);
    await page.evaluate((s: string) => (window as any).__tour?.highlight(s), sel).catch(() => {});
  };

  if (kind === 'ask') {
    await go('/conversational'); await dismissWhatsNew(page);
    await softClick(page, '[data-slot="textarea"]');
    try { await page.locator('[data-slot="textarea"]').first().fill('Show revenue trend by territory'); } catch { /* ignore */ }
    await spot('[data-slot="textarea"]');
  } else if (kind === 'video-tray') {
    await go('/conversational'); await dismissWhatsNew(page);
    await spot('button[aria-label="Video reports"]');
    await wait(page, 500);
    await softClick(page, 'button[aria-label="Video reports"]');
  } else if (kind === 'reports') {
    await go('/reports'); await dismissWhatsNew(page);
    // Reports grid uses onClick cards (no anchors); spotlight the first card.
    await spot('button:has-text("Standard"), [class*="rounded"]:has-text("Performance")');
  } else { // dashboard
    await go('/dashboard'); await dismissWhatsNew(page);
    await wait(page, 700);
  }
  await wait(page, Math.max(1600, dwellMs));
}

// Drop the leading load frames (white/painting) from a recorded webm so every
// clip starts on real content — the app takes ~1-2s to paint after navigation,
// and beats sampled during that window looked blank. Re-encodes with ffmpeg;
// if ffmpeg is unavailable, keep the raw clip (mostly fine, just softer starts).
const TRIM_SEC = Number(process.env.RELEASE_CAPTURE_TRIM_SEC || 2.2);
function trimLeading(rawPath: string, outPath: string): boolean {
  const r = spawnSync('ffmpeg', [
    '-y', '-ss', String(TRIM_SEC), '-i', rawPath,
    '-an', '-c:v', 'libvpx', '-b:v', '5M', '-deadline', 'realtime', '-cpu-used', '5',
    outPath,
  ], { stdio: 'ignore' });
  return r.status === 0;
}

async function newSeededContext(browser: any, version: string, outDir: string) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, recordVideo: { dir: outDir, size: VIEWPORT } });
  await context.addInitScript(
    ({ role, provider, origin, version: v }: { role: string; provider: string; origin: string; version: string }) => {
      try {
        if (location.origin === origin) {
          localStorage.setItem('auth_role', role);
          if (!localStorage.getItem('llm_provider')) localStorage.setItem('llm_provider', provider);
          localStorage.setItem('whatsNewLastSeenVersion', v);
          sessionStorage.setItem('whatsNewAutoOpenedVersion', v);
        }
      } catch { /* ignore */ }
    },
    { role: ROLE, provider: PROVIDER, origin: APP_ORIGIN, version },
  );
  await context.addInitScript(TOUR_INIT);
  return context;
}

export async function captureTourFootage(
  jobId: string,
  version: string,
  plan: TourFeaturePlan[],
): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  if (!captureEnabled()) return out;

  let chromium: any;
  try { ({ chromium } = await import('playwright' as any)); }
  catch { console.warn('[capture] RELEASE_CAPTURE=1 but `playwright` is not installed; skipping footage'); return out; }

  const outDir = path.join(FOOTAGE_ROOT, jobId);
  await fs.mkdir(outDir, { recursive: true });
  // Record each distinct shot kind ONCE per release and reuse it for every beat
  // that maps to it — same-kind beats want the same screen, and re-recording is
  // the slow part. Keyed by kind → clip URL.
  const byKind = new Map<ShotKind, string>();
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'] });
  try {
    for (const feat of plan) {
      out[feat.id] = [];
      for (let bi = 0; bi < feat.beats.length; bi++) {
        const kind = shotForBeat(feat.beats[bi], feat.affectedArea);
        const cached = byKind.get(kind);
        if (cached !== undefined) { out[feat.id].push(cached); continue; }

        const context = await newSeededContext(browser, version, outDir);
        const page = await context.newPage();
        try {
          if (MAGIC_LINK) await page.goto(MAGIC_LINK, { waitUntil: 'networkidle', timeout: 20_000 }).catch(() => {});
          await recordShot(page, kind, CAPTURE_SECS * 1000);
          const video = page.video();
          await context.close();
          if (video) {
            const raw = await video.path();
            const rawDest = path.join(outDir, `${kind}.raw.webm`);
            const dest = path.join(outDir, `${kind}.webm`);
            await fs.rename(raw, rawDest).catch(async () => { await fs.copyFile(raw, rawDest); });
            // Trim leading load frames; fall back to the raw clip if ffmpeg fails.
            if (trimLeading(rawDest, dest)) { await fs.rm(rawDest, { force: true }).catch(() => {}); }
            else { await fs.rename(rawDest, dest).catch(() => {}); }
            const url = `${ASSET_BASE}/media/footage/${jobId}/${kind}.webm`;
            byKind.set(kind, url);
            out[feat.id].push(url);
            console.log(`[capture] ${feat.id} beat ${bi}: ${kind} (recorded)`);
          } else { byKind.set(kind, ''); out[feat.id].push(''); }
        } catch (e) {
          await context.close().catch(() => {});
          byKind.set(kind, '');
          out[feat.id].push('');
          console.warn(`[capture] ${feat.id} beat ${bi} (${kind}) failed: ${(e as Error)?.message ?? e}`);
        }
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
  return out;
}
