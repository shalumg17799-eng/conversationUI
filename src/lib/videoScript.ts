// Compile a generated report ({ meta, components }) into a VideoScript.
// Deterministic — walks the same UINode tree the PPT/PDF exporters use and emits
// ordered scenes (cover → key metrics → one per chart → insights → table → outro),
// each with data-derived narration. Phase 2 swaps the templated narration for an
// LLM-polished pass and fills per-scene audio; the scene shapes stay the same.

import type {
  VideoScript, VideoScene, ChartKind, KpiDatum, ChartVisual,
} from '@/remotion/types';
import { VIDEO_FPS, VIDEO_W, VIDEO_H } from '@/remotion/types';
import { THEME } from '@/remotion/theme';
import { synthesizeSpeech } from '@/lib/tts';

interface UINode { renderType: string; props?: Record<string, any>; children?: UINode[]; }
interface ReportMeta { title?: string; description?: string; rowCount?: number; }

// ── number helpers (shared shape with exportReport) ──────────────────────────
function num(v: any): number {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim();
  const m = parseFloat(s.replace(/[^0-9.\-]/g, ''));
  if (Number.isNaN(m)) return NaN;
  if (/m\b|million/i.test(s)) return m * 1e6;
  if (/k\b|thousand/i.test(s)) return m * 1e3;
  if (/b\b|billion/i.test(s)) return m * 1e9;
  return m;
}
function fmtNum(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}
// "September 2025" from 202509 / "2025-09"; pass through otherwise.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function fmtPeriod(v: any): string {
  const m = String(v ?? '').trim().match(/^(\d{4})[-/]?(\d{2})$/);
  if (m) { const mo = +m[2]; if (mo >= 1 && mo <= 12) return `${MONTHS[mo - 1]} ${m[1]}`; }
  return String(v ?? '');
}
// Speakable version of a display value: "$912K" → "912 thousand dollars".
function speakValue(v: string): string {
  const dollars = /\$/.test(v);
  const pct = /%/.test(v);
  const n = num(v);
  let core = v;
  if (Number.isFinite(n)) {
    const a = Math.abs(n);
    if (a >= 1e9) core = `${(n / 1e9).toFixed(1)} billion`;
    else if (a >= 1e6) core = `${(n / 1e6).toFixed(1)} million`;
    else if (a >= 1e3) core = `${(n / 1e3).toFixed(0)} thousand`;
    else core = `${n}`;
  }
  if (pct) return `${core} percent`;
  if (dollars) return `${core} dollars`;
  return core;
}

// ── chart extraction ─────────────────────────────────────────────────────────
function xyChart(kind: ChartKind, p: Record<string, any>): ChartVisual | null {
  const rows = Array.isArray(p.data) ? p.data : [];
  if (!rows.length) return null;
  const xKey = p.xKey ?? Object.keys(rows[0])[0];
  const yKeys: string[] = p.yKeys ?? (p.yKey ? [p.yKey] : [Object.keys(rows[0])[1]].filter(Boolean));
  if (!xKey || !yKeys.length) return null;
  return {
    chartKind: kind,
    labels: rows.map((r: any) => fmtPeriod(r[xKey])),
    series: yKeys.map((k) => ({ name: k, values: rows.map((r: any) => num(r[k])) })),
  };
}
function categoricalChart(kind: ChartKind, p: Record<string, any>): ChartVisual | null {
  const rows = Array.isArray(p.data) ? p.data : [];
  if (!rows.length) return null;
  const nameKey = p.nameKey ?? Object.keys(rows[0])[0];
  const valueKey = p.valueKey ?? Object.keys(rows[0])[1];
  return {
    chartKind: kind,
    labels: rows.map((r: any) => String(r[nameKey] ?? '')),
    series: [{ name: valueKey ?? 'Value', values: rows.map((r: any) => num(r[valueKey])) }],
  };
}
function listChart(items: any[]): ChartVisual | null {
  const list = (items ?? []).filter(Boolean);
  if (!list.length) return null;
  return {
    chartKind: 'bar',
    labels: list.map((it) => String(it.label ?? it.name ?? '')),
    series: [{ name: 'Value', values: list.map((it) => num(it.value)) }],
  };
}
const isTimeSeries = (c: ChartVisual) =>
  /jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{4}/i.test(c.labels[0] ?? '');

// One or two sentences describing what a chart shows, from its own data.
function chartNarration(title: string, c: ChartVisual): { text: string; bullets: string[] } {
  const s = c.series[0];
  const pairs = c.labels.map((l, i) => ({ l, v: s?.values[i] })).filter(p => Number.isFinite(p.v as number)) as { l: string; v: number }[];
  if (!pairs.length) return { text: `${title}.`, bullets: [] };
  const max = pairs.reduce((a, b) => (b.v > a.v ? b : a));
  const min = pairs.reduce((a, b) => (b.v < a.v ? b : a));
  const total = pairs.reduce((sum, p) => sum + p.v, 0);
  const bullets: string[] = [`Peak: ${max.l} (${fmtNum(max.v)})`];
  let text: string;
  if (isTimeSeries(c) && pairs.length > 1) {
    const first = pairs[0], last = pairs[pairs.length - 1];
    const pct = first.v !== 0 ? ((last.v - first.v) / Math.abs(first.v)) * 100 : 0;
    const dir = last.v >= first.v ? 'climbing' : 'declining';
    text = `${title} shows a ${dir} trend, moving from ${fmtNum(first.v)} in ${first.l} to ${fmtNum(last.v)} in ${last.l}, a change of ${pct >= 0 ? 'plus ' : ''}${pct.toFixed(0)} percent, and peaking at ${fmtNum(max.v)}.`;
    bullets.push(`${first.l} → ${last.l}: ${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`);
  } else if (c.chartKind === 'pie') {
    const share = (max.v / total) * 100;
    text = `${title}. ${max.l} leads, making up ${share.toFixed(0)} percent of the total.`;
    bullets.push(`${max.l}: ${share.toFixed(0)}% share`);
  } else {
    text = `${title}. ${max.l} is highest at ${fmtNum(max.v)}, while ${min.l} sits lowest at ${fmtNum(min.v)}.`;
    bullets.push(`Lowest: ${min.l} (${fmtNum(min.v)})`);
  }
  bullets.push(`Total: ${fmtNum(total)}`);
  return { text, bullets: bullets.slice(0, 3) };
}

// Estimate scene length from narration (≈2.6 words/sec) — replaced by real audio duration in Phase 2.
function framesForNarration(text: string, min = 2.5, max = 9): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const secs = Math.min(max, Math.max(min, words / 2.6 + 0.8));
  return Math.round(secs * VIDEO_FPS);
}

const nodeTitle = (n: UINode, fb: string) => n.props?.title ?? n.props?.label ?? fb;

export function buildVideoScript(meta: ReportMeta, components: UINode[]): VideoScript {
  const kpis: KpiDatum[] = [];
  const chartScenes: VideoScene[] = [];
  const insightBullets: string[] = [];
  const insightNarr: string[] = [];
  let tableScene: VideoScene | null = null;

  const visit = (node: UINode, idx: number) => {
    const p = node.props ?? {};
    const title = nodeTitle(node, `Chart ${idx + 1}`);
    const pushChart = (c: ChartVisual | null) => {
      if (!c || !c.series[0]?.values.some(Number.isFinite)) return;
      const { text, bullets } = chartNarration(title, c);
      chartScenes.push({
        id: `chart-${chartScenes.length}`,
        visual: { kind: 'chart', chart: c, accent: THEME.series[chartScenes.length % THEME.series.length].slice(1) },
        onScreenText: { kicker: 'Visualization', heading: title, sub: p.explanation, bullets },
        narration: text,
        durationInFrames: framesForNarration(text),
      });
    };

    switch (node.renderType) {
      case 'KPI': case 'KPICard': case 'StatDelta':
        if (p.title && p.value !== undefined) kpis.push({ label: p.title, value: String(p.value), trend: p.trend });
        break;
      case 'KPIGrid':
        (p.metrics ?? []).forEach((m: any) => m?.title && kpis.push({ label: m.title, value: String(m.value ?? '—'), trend: m.trend }));
        break;
      case 'GaugeChart':
        if (p.title) kpis.push({ label: p.title, value: `${p.value ?? '—'}${p.unit ?? ''}`, trend: p.target !== undefined ? `target ${p.target}${p.unit ?? ''}` : undefined });
        break;
      case 'BarChart': pushChart(xyChart('bar', p)); break;
      case 'LineChart': case 'Sparkline': pushChart(xyChart('line', p)); break;
      case 'AreaChart': pushChart(xyChart('area', p)); break;
      case 'ComboChart': {
        const rows = Array.isArray(p.data) ? p.data : [];
        if (rows.length && p.xKey) pushChart({
          chartKind: 'bar',
          labels: rows.map((r: any) => fmtPeriod(r[p.xKey])),
          series: [p.barKey, p.lineKey].filter(Boolean).map((k: string, i: number) => ({ name: (i === 0 ? p.barLabel : p.lineLabel) ?? k, values: rows.map((r: any) => num(r[k])) })),
        });
        break;
      }
      case 'PieChart': pushChart(categoricalChart('pie', p)); break;
      case 'FunnelChart': pushChart(categoricalChart('bar', p)); break;
      case 'RankedList': case 'ProgressBar': pushChart(listChart(p.items)); break;
      case 'ComparisonCard': pushChart(listChart(p.entities)); break;
      case 'InsightCard':
        if (p.title || p.body) { insightBullets.push(p.title ?? p.body); insightNarr.push([p.title, p.body].filter(Boolean).join(': ')); }
        break;
      case 'Callout':
        if (p.title || p.body) { insightBullets.push(p.title ?? p.body); insightNarr.push([p.title, p.body].filter(Boolean).join(': ')); }
        break;
      case 'SummaryText':
        if (p.text) { insightBullets.push(p.text); insightNarr.push(p.text); }
        break;
      case 'AlertBanner':
        if (p.message) { insightBullets.push(p.message); insightNarr.push(p.message); }
        break;
      case 'Table': case 'GenerativeTable': case 'PivotTable': {
        if (!tableScene) {
          const rows = (p.rows ?? p.data ?? []) as any[];
          if (Array.isArray(rows) && rows.length) {
            const columns = (p.columns ?? Object.keys(rows[0])).slice(0, 5) as string[];
            const body = rows.slice(0, 6).map((r) => columns.map((c) => {
              const v = r[c];
              return v === null || v === undefined ? '' : typeof v === 'number' ? fmtNum(v) : String(v);
            }));
            const narr = `The detail table lists ${rows.length} rows across ${columns.length} columns, including ${columns.slice(0, 3).join(', ')}.`;
            tableScene = {
              id: 'table',
              visual: { kind: 'table', table: { columns, rows: body } },
              onScreenText: { kicker: 'Data', heading: nodeTitle(node, 'Detail Table') },
              narration: narr,
              durationInFrames: framesForNarration(narr, 3),
            };
          }
        }
        break;
      }
    }
    (node.children ?? []).forEach((c, i) => visit(c, i));
  };
  components.forEach((n, i) => visit(n, i));

  // ── assemble ordered scenes ────────────────────────────────────────────────
  const scenes: VideoScene[] = [];

  // Cover
  const coverNarr = meta.description
    ? `${meta.title ?? 'Your report'}. ${meta.description}`
    : `Here's your ${meta.title ?? 'report'}.`;
  scenes.push({
    id: 'cover',
    visual: { kind: 'cover', accent: THEME.brand.slice(1) },
    onScreenText: { kicker: 'Analytics Report', heading: meta.title ?? 'Report', sub: meta.description },
    narration: coverNarr,
    durationInFrames: framesForNarration(coverNarr, 3, 8),
  });

  // Key metrics
  if (kpis.length) {
    const top = kpis.slice(0, 4);
    const spoken = top.map(k => `${k.label} at ${speakValue(k.value)}`).join(', ');
    const narr = `Let's start with the headline numbers. ${spoken}.`;
    scenes.push({
      id: 'kpis',
      visual: { kind: 'kpis', kpis: top },
      onScreenText: { kicker: 'Overview', heading: 'Key Metrics' },
      narration: narr,
      durationInFrames: framesForNarration(narr, 3, 9),
    });
  }

  scenes.push(...chartScenes);

  // Insights
  if (insightBullets.length) {
    const narr = `A few takeaways. ${insightNarr.slice(0, 3).join('. ')}.`;
    scenes.push({
      id: 'insights',
      visual: { kind: 'insight' },
      onScreenText: { kicker: 'Analysis', heading: 'Key Insights', bullets: insightBullets.slice(0, 4) },
      narration: narr,
      durationInFrames: framesForNarration(narr, 3, 10),
    });
  }

  if (tableScene) scenes.push(tableScene);

  // Outro
  const outroNarr = 'That wraps up the report. Explore the full breakdown anytime in your dashboard.';
  scenes.push({
    id: 'outro',
    visual: { kind: 'outro', accent: THEME.brand.slice(1) },
    onScreenText: { kicker: 'Summary', heading: 'Thanks for watching', sub: 'Generated by Talk' },
    narration: outroNarr,
    durationInFrames: framesForNarration(outroNarr, 3, 7),
  });

  return { title: meta.title ?? 'Report', fps: VIDEO_FPS, width: VIDEO_W, height: VIDEO_H, scenes };
}

export const scriptDurationInFrames = (s: VideoScript) =>
  Math.max(1, s.scenes.reduce((sum, sc) => sum + sc.durationInFrames, 0));

// Voice every scene with ElevenLabs and retime each to its clip length, so the
// visuals stay on screen exactly as long as the narration plays. Runs
// sequentially (kind to ElevenLabs rate limits) and reports progress 0..1.
// Falls back to the estimated timing for any line that fails to synthesize.
const TAIL_PAD_SEC = 0.6; // breathing room after each line before the cut

export async function narrateScript(
  script: VideoScript,
  onProgress?: (done: number, total: number) => void,
): Promise<VideoScript> {
  const scenes: VideoScene[] = [];
  const total = script.scenes.length;
  for (let i = 0; i < total; i++) {
    const scene = script.scenes[i];
    try {
      const clip = await synthesizeSpeech(scene.narration);
      const frames = Math.round((clip.durationMs / 1000 + TAIL_PAD_SEC) * script.fps);
      scenes.push({ ...scene, narrationAudio: clip.url, durationInFrames: Math.max(scene.durationInFrames, frames) });
    } catch {
      scenes.push({ ...scene }); // keep estimated timing, no audio
    }
    onProgress?.(i + 1, total);
  }
  return { ...script, scenes };
}
