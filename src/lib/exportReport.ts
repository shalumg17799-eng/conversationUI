// ============================================================================
//  Report export — PDF + Excel from a generative-UI report's component tree.
//
//  A generated chat report is { meta, components }, where each component is a
//  UINode { renderType, props, children? }. Charts/tables carry their rows in
//  props.data / props.rows; ranked lists in props.items; KPIs in props.value /
//  props.metrics. These helpers walk that tree and flatten it into tabular data,
//  then emit a PDF (jsPDF + autotable) or an .xlsx workbook (SheetJS).
//
//  Provider-agnostic: works for both Gemma and Sonnet reports — it only reads the
//  already-hydrated data, no model involved.
// ============================================================================

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import pptxgen from 'pptxgenjs';

export interface ReportMeta {
  title?: string;
  description?: string;
  rowCount?: number;
}

interface UINode {
  renderType: string;
  props?: Record<string, any>;
  children?: UINode[];
}

interface ExtractedTable {
  title: string;
  rows: Record<string, any>[];
}

interface ExtractedKpi {
  metric: string;
  value: string;
  trend?: string;
}

const sanitizeFile = (s: string) =>
  (s || 'report').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'report';

// Excel sheet names: ≤31 chars, no []:*?/\ — and unique.
function safeSheetName(name: string, used: Set<string>): string {
  let base = (name || 'Sheet').replace(/[\[\]:*?/\\]/g, ' ').trim().slice(0, 28) || 'Sheet';
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) candidate = `${base.slice(0, 25)} ${n++}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

// Pull the row array a node carries, normalized to an array of flat objects.
function nodeRows(node: UINode): Record<string, any>[] | null {
  const p = node.props ?? {};
  const raw = p.data ?? p.rows ?? p.items;
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'object') return raw;
  return null;
}

function nodeTitle(node: UINode, fallback: string): string {
  return node.props?.title ?? node.props?.label ?? fallback;
}

// Walk the tree, collecting every tabular component and every KPI.
function collect(nodes: UINode[]): { tables: ExtractedTable[]; kpis: ExtractedKpi[] } {
  const tables: ExtractedTable[] = [];
  const kpis: ExtractedKpi[] = [];

  const visit = (node: UINode, idx: number) => {
    const p = node.props ?? {};
    switch (node.renderType) {
      case 'KPICard':
      case 'StatDelta':
        if (p.title && p.value !== undefined) kpis.push({ metric: p.title, value: String(p.value), trend: p.trend });
        break;
      case 'KPIGrid':
        if (Array.isArray(p.metrics)) {
          p.metrics.forEach((m: any) => m?.title && kpis.push({ metric: m.title, value: String(m.value ?? '—'), trend: m.trend }));
        }
        break;
      default: {
        const rows = nodeRows(node);
        if (rows) tables.push({ title: nodeTitle(node, `${node.renderType} ${idx + 1}`), rows });
      }
    }
    (node.children ?? []).forEach((c, i) => visit(c, i));
  };

  nodes.forEach((n, i) => visit(n, i));
  return { tables, kpis };
}

// ── Excel ────────────────────────────────────────────────────────────────────
export function exportReportExcel(meta: ReportMeta, components: UINode[]): void {
  const { tables, kpis } = collect(components);
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();

  // Summary sheet — title, description, and KPIs.
  const summaryAoA: any[][] = [
    [meta.title ?? 'Report'],
    ...(meta.description ? [[meta.description]] : []),
    ...(meta.rowCount ? [[`${meta.rowCount} rows`]] : []),
    [],
  ];
  if (kpis.length) {
    summaryAoA.push(['Metric', 'Value', 'Trend']);
    kpis.forEach(k => summaryAoA.push([k.metric, k.value, k.trend ?? '']));
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAoA), safeSheetName('Summary', used));

  // One sheet per table/chart dataset.
  tables.forEach(t => {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(t.rows), safeSheetName(t.title, used));
  });

  XLSX.writeFile(wb, `${sanitizeFile(meta.title ?? 'report')}.xlsx`);
}

// ── PDF ──────────────────────────────────────────────────────────────────────
export function exportReportPDF(meta: ReportMeta, components: UINode[]): void {
  const { tables, kpis } = collect(components);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const marginX = 16;
  const pageW = pdf.internal.pageSize.getWidth();
  let y = 18;

  // Brand accent bar
  pdf.setFillColor(212, 87, 42); // terracotta #D4572A
  pdf.rect(0, 0, pageW, 3, 'F');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.setTextColor(28, 25, 23);
  pdf.text(pdf.splitTextToSize(meta.title ?? 'Report', pageW - marginX * 2), marginX, y);
  y += 9;

  if (meta.description) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(110, 105, 100);
    const lines = pdf.splitTextToSize(meta.description, pageW - marginX * 2);
    pdf.text(lines, marginX, y);
    y += lines.length * 5 + 2;
  }

  pdf.setFontSize(8);
  pdf.setTextColor(150, 145, 140);
  pdf.text(`Generated ${new Date().toLocaleString()}${meta.rowCount ? ` · ${meta.rowCount} rows` : ''}`, marginX, y);
  y += 6;

  // KPI table
  if (kpis.length) {
    autoTable(pdf, {
      startY: y,
      head: [['Metric', 'Value', 'Trend']],
      body: kpis.map(k => [k.metric, k.value, k.trend ?? '']),
      theme: 'grid',
      headStyles: { fillColor: [26, 25, 23], textColor: 255 },
      styles: { fontSize: 9, cellPadding: 2 },
      margin: { left: marginX, right: marginX },
    });
    y = (pdf as any).lastAutoTable.finalY + 8;
  }

  // One table per dataset
  tables.forEach(t => {
    const cols = Object.keys(t.rows[0] ?? {});
    if (!cols.length) return;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(28, 25, 23);
    if (y > pdf.internal.pageSize.getHeight() - 30) { pdf.addPage(); y = 18; }
    pdf.text(t.title, marginX, y);
    y += 4;
    autoTable(pdf, {
      startY: y,
      head: [cols],
      body: t.rows.slice(0, 200).map(r => cols.map(c => formatCell(r[c]))),
      theme: 'striped',
      headStyles: { fillColor: [212, 87, 42], textColor: 255 },
      styles: { fontSize: 8, cellPadding: 1.8 },
      margin: { left: marginX, right: marginX },
    });
    y = (pdf as any).lastAutoTable.finalY + 8;
  });

  pdf.save(`${sanitizeFile(meta.title ?? 'report')}.pdf`);
}

function formatCell(v: any): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2);
  return String(v);
}

// ── PowerPoint ─────────────────────────────────────────────────────────────
//  A templated, presentation-ready deck: cover, an executive-summary slide with
//  narrative + key-metric bullets, a native chart slide per visualization (with
//  data-derived talking points), paginated data tables, and a closing
//  takeaways slide. Charts are rendered as native PowerPoint charts (editable in
//  the deck), reconstructed from each report component's underlying data.
const BRAND = 'D4572A';   // terracotta
const INK = '1C1917';     // near-black
const MUTE = '6E6964';    // muted grey
const PANEL = 'FBF6F1';   // warm off-white card
const LINE = 'E7E0D8';    // hairline
// Category palette mirrored from the in-app chart theme (UITreeRenderer).
const SERIES_COLORS = ['2563EB', '7C3AED', '0D9488', 'D97706', 'D4572A', 'D4183D', '1D9E75'];

const W = 13.333;
const H = 7.5;

type ChartKind = 'bar' | 'line' | 'area' | 'pie' | 'scatter';

interface ChartBlock {
  kind: 'chart';
  chartKind: ChartKind;
  title: string;
  explanation?: string;
  labels: string[];
  series: { name: string; values: number[] }[];
  isTimeSeries?: boolean;
}
interface TableBlock { kind: 'table'; title: string; rows: Record<string, any>[]; }
interface NarrativeBlock {
  kind: 'narrative';
  variant: 'insight' | 'warning' | 'success' | 'info' | 'summary' | 'callout' | 'steps' | 'timeline';
  title?: string;
  body?: string;
  items?: string[];
}
type Block = ChartBlock | TableBlock | NarrativeBlock;

// Coerce a possibly-formatted value ("$12.9M", "64.6%", 1234) to a number.
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

// Turn a compact period code (202504, "2025-04") into "April 2025"; pass through anything else.
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function fmtPeriod(v: any): string {
  const s = String(v ?? '').trim();
  const m = s.match(/^(\d{4})[-/]?(\d{2})$/);
  if (m) { const mo = Number(m[2]); if (mo >= 1 && mo <= 12) return `${MONTH_NAMES[mo - 1]} ${m[1]}`; }
  return s;
}

// Compact human-readable number for talking points.
function fmtNum(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}

// Build a chart block from an {data, xKey, yKey}-style node.
function xyChart(kind: ChartKind, p: Record<string, any>, title: string): ChartBlock | null {
  const rows = Array.isArray(p.data) ? p.data : [];
  if (!rows.length) return null;
  const xKey = p.xKey ?? Object.keys(rows[0])[0];
  const yKeys: string[] = p.yKeys ?? (p.yKey ? [p.yKey] : [Object.keys(rows[0])[1]].filter(Boolean));
  if (!xKey || !yKeys.length) return null;
  const labels = rows.map((r: any) => fmtPeriod(r[xKey]));
  const series = yKeys.map((k: string) => ({ name: k, values: rows.map((r: any) => num(r[k])) }));
  // Time series if the x labels look like dates/months.
  const isTimeSeries = /date|month|time|year|day|week|quarter/i.test(String(xKey)) ||
    /jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{4}/i.test(labels[0] ?? '');
  return { kind: 'chart', chartKind: kind, title, explanation: p.explanation, labels, series, isTimeSeries };
}

// Build a categorical (pie/funnel) chart from {data, nameKey, valueKey}.
function categoricalChart(kind: ChartKind, p: Record<string, any>, title: string): ChartBlock | null {
  const rows = Array.isArray(p.data) ? p.data : [];
  if (!rows.length) return null;
  const nameKey = p.nameKey ?? Object.keys(rows[0])[0];
  const valueKey = p.valueKey ?? Object.keys(rows[0])[1];
  const labels = rows.map((r: any) => String(r[nameKey] ?? ''));
  const values = rows.map((r: any) => num(r[valueKey]));
  return { kind: 'chart', chartKind: kind, title, explanation: p.explanation, labels, series: [{ name: valueKey ?? 'Value', values }] };
}

// Build a bar chart from a {label,value} list (RankedList, ComparisonCard, ProgressBar).
function listChart(items: any[], p: Record<string, any>, title: string): ChartBlock | null {
  const list = (items ?? []).filter(Boolean);
  if (!list.length) return null;
  const labels = list.map((it: any) => String(it.label ?? it.name ?? ''));
  const values = list.map((it: any) => num(it.value));
  return { kind: 'chart', chartKind: 'bar', title, explanation: p.explanation, labels, series: [{ name: 'Value', values }] };
}

// Walk the tree into ordered presentation blocks + the flat KPI list.
function collectRich(nodes: UINode[]): { blocks: Block[]; kpis: ExtractedKpi[] } {
  const blocks: Block[] = [];
  const kpis: ExtractedKpi[] = [];

  const visit = (node: UINode, idx: number) => {
    const p = node.props ?? {};
    const title = nodeTitle(node, `${node.renderType} ${idx + 1}`);
    let handled = true;

    switch (node.renderType) {
      case 'KPI':
      case 'KPICard':
      case 'StatDelta':
        if (p.title && p.value !== undefined) kpis.push({ metric: p.title, value: String(p.value), trend: p.trend });
        break;
      case 'KPIGrid':
        if (Array.isArray(p.metrics)) p.metrics.forEach((m: any) => m?.title && kpis.push({ metric: m.title, value: String(m.value ?? '—'), trend: m.trend }));
        break;
      case 'GaugeChart':
        if (p.title) kpis.push({ metric: p.title, value: `${p.value ?? '—'}${p.unit ?? ''}`, trend: p.target !== undefined ? `target ${p.target}${p.unit ?? ''}` : undefined });
        break;

      case 'BarChart': { const c = xyChart('bar', p, title); if (c) blocks.push(c); break; }
      case 'LineChart': { const c = xyChart('line', p, title); if (c) blocks.push(c); break; }
      case 'AreaChart': { const c = xyChart('area', p, title); if (c) blocks.push(c); break; }
      case 'Sparkline': { const c = xyChart('line', p, title); if (c) blocks.push(c); break; }
      case 'ScatterPlot': { const c = xyChart('scatter', p, title); if (c) blocks.push(c); break; }
      case 'ComboChart': {
        const rows = Array.isArray(p.data) ? p.data : [];
        if (rows.length && p.xKey) {
          const labels = rows.map((r: any) => fmtPeriod(r[p.xKey]));
          const series = [p.barKey, p.lineKey].filter(Boolean).map((k: string, i: number) => ({
            name: (i === 0 ? p.barLabel : p.lineLabel) ?? k,
            values: rows.map((r: any) => num(r[k])),
          }));
          blocks.push({ kind: 'chart', chartKind: 'bar', title, explanation: p.explanation, labels, series });
        }
        break;
      }
      case 'PieChart': { const c = categoricalChart('pie', p, title); if (c) blocks.push(c); break; }
      case 'FunnelChart': { const c = categoricalChart('bar', p, title); if (c) blocks.push(c); break; }
      case 'RankedList': { const c = listChart(p.items, p, title); if (c) blocks.push(c); break; }
      case 'ProgressBar': { const c = listChart(p.items, p, title); if (c) blocks.push(c); break; }
      case 'ComparisonCard': { const c = listChart(p.entities, p, title); if (c) blocks.push(c); break; }

      case 'InsightCard':
        blocks.push({ kind: 'narrative', variant: (p.type ?? 'insight'), title: p.title, body: [p.body, p.highlight].filter(Boolean).join(' — ') });
        break;
      case 'Callout':
        blocks.push({ kind: 'narrative', variant: 'callout', title: p.title, body: [p.metric, p.body].filter(Boolean).join(' — ') });
        break;
      case 'AlertBanner':
        blocks.push({ kind: 'narrative', variant: (p.type === 'error' ? 'warning' : p.type ?? 'info'), body: p.message });
        break;
      case 'SummaryText':
        blocks.push({ kind: 'narrative', variant: 'summary', body: p.text });
        break;
      case 'StepList':
        if (Array.isArray(p.steps)) blocks.push({ kind: 'narrative', variant: 'steps', title: p.title, items: p.steps.map((s: any) => typeof s === 'string' ? s : [s.title, s.description].filter(Boolean).join(': ')) });
        break;
      case 'TimelineCard':
        if (Array.isArray(p.events)) blocks.push({ kind: 'narrative', variant: 'timeline', title: p.title, items: p.events.map((e: any) => [e.date, [e.title, e.description].filter(Boolean).join(': ')].filter(Boolean).join(' — ')) });
        break;

      case 'Table':
      case 'GenerativeTable':
      case 'PivotTable':
      case 'HeatMap': {
        const rows = nodeRows(node);
        if (rows) blocks.push({ kind: 'table', title, rows });
        break;
      }
      default:
        handled = false;
    }

    if (!handled) {
      const rows = nodeRows(node);
      if (rows) blocks.push({ kind: 'table', title, rows });
    }
    (node.children ?? []).forEach((c, i) => visit(c, i));
  };

  nodes.forEach((n, i) => visit(n, i));
  return { blocks, kpis };
}

// Derive presentation talking points from a chart's own data.
function chartInsights(b: ChartBlock): string[] {
  const s = b.series[0];
  if (!s || !s.values.length) return [];
  const pairs = b.labels.map((l, i) => ({ l, v: s.values[i] })).filter(p => Number.isFinite(p.v));
  if (!pairs.length) return [];
  const bullets: string[] = [];
  const max = pairs.reduce((a, b) => (b.v > a.v ? b : a));
  const min = pairs.reduce((a, b) => (b.v < a.v ? b : a));
  const total = pairs.reduce((sum, p) => sum + p.v, 0);
  const avg = total / pairs.length;

  bullets.push(`Peak: ${max.l} at ${fmtNum(max.v)}`);
  if (min.l !== max.l) bullets.push(`Lowest: ${min.l} at ${fmtNum(min.v)}`);

  if (b.isTimeSeries && pairs.length > 1) {
    const first = pairs[0], last = pairs[pairs.length - 1];
    const delta = last.v - first.v;
    const pct = first.v !== 0 ? (delta / Math.abs(first.v)) * 100 : 0;
    bullets.push(`Trend: ${first.l} → ${last.l} ${delta >= 0 ? '▲' : '▼'} ${fmtNum(Math.abs(delta))} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`);
  } else if (b.chartKind === 'pie') {
    bullets.push(`${max.l} makes up ${((max.v / total) * 100).toFixed(1)}% of the total`);
  } else {
    bullets.push(`Average: ${fmtNum(avg)} across ${pairs.length} categories`);
  }
  bullets.push(`Total: ${fmtNum(total)}`);
  if (b.series.length > 1) bullets.push(`Compares ${b.series.length} series: ${b.series.map(x => x.name).join(', ')}`);
  return bullets.slice(0, 5);
}

// Shared header band for a content slide; returns the y below the header.
function slideHeader(pptx: pptxgen, slide: pptxgen.Slide, title: string, kicker?: string): number {
  slide.background = { color: 'FFFFFF' };
  slide.addShape(pptx.ShapeType.rect, { x: 0.6, y: 0.55, w: 0.12, h: 0.5, fill: { color: BRAND } });
  if (kicker) slide.addText(kicker.toUpperCase(), { x: 0.85, y: 0.42, w: 11.8, h: 0.25, fontSize: 9, bold: true, color: BRAND, charSpacing: 2 });
  slide.addText(title, { x: 0.85, y: kicker ? 0.66 : 0.5, w: 11.8, h: 0.7, fontSize: 22, bold: true, color: INK, valign: 'top' });
  return 1.55;
}

export function exportReportPPT(meta: ReportMeta, components: UINode[]): void {
  const { blocks, kpis } = collectRich(components);
  const pptx = new pptxgen();
  pptx.defineLayout({ name: 'WIDE', width: W, height: H });
  pptx.layout = 'WIDE';
  pptx.author = 'Talk';
  pptx.company = 'Talk';
  pptx.title = meta.title ?? 'Report';

  let page = 0;
  const footer = (slide: pptxgen.Slide) => {
    page += 1;
    slide.addShape(pptx.ShapeType.line, { x: 0.6, y: H - 0.55, w: W - 1.2, h: 0, line: { color: LINE, width: 0.75 } });
    slide.addText(meta.title ?? 'Report', { x: 0.6, y: H - 0.5, w: 8, h: 0.35, fontSize: 8, color: MUTE });
    slide.addText(String(page), { x: W - 1.6, y: H - 0.5, w: 1, h: 0.35, fontSize: 8, color: MUTE, align: 'right' });
  };

  // ── Cover ──────────────────────────────────────────────────────────────
  const cover = pptx.addSlide();
  cover.background = { color: INK };
  cover.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.35, h: H, fill: { color: BRAND } });
  cover.addText('ANALYTICS REPORT', { x: 1, y: 1.9, w: 11, h: 0.4, fontSize: 13, color: BRAND, bold: true, charSpacing: 3 });
  cover.addText(meta.title ?? 'Report', { x: 1, y: 2.35, w: 11.3, h: 2, fontSize: 40, color: 'FFFFFF', bold: true, valign: 'top', lineSpacingMultiple: 1.05 });
  if (meta.description) cover.addText(meta.description, { x: 1, y: 4.5, w: 10.8, h: 1.7, fontSize: 14, color: 'C9C3BC', valign: 'top', lineSpacingMultiple: 1.25 });
  cover.addText(
    `Generated ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}${meta.rowCount ? `  ·  ${meta.rowCount} rows analyzed` : ''}`,
    { x: 1, y: H - 0.9, w: 11, h: 0.4, fontSize: 10, color: MUTE }
  );

  const charts = blocks.filter((b): b is ChartBlock => b.kind === 'chart');
  const narratives = blocks.filter((b): b is NarrativeBlock => b.kind === 'narrative');
  const tables = blocks.filter((b): b is TableBlock => b.kind === 'table');

  // ── Executive summary — paragraph + key-metric & highlight bullets ───────
  {
    const slide = pptx.addSlide();
    const y0 = slideHeader(pptx, slide, 'Executive Summary', 'Overview');
    const leftW = 7.1;

    if (meta.description) {
      slide.addText(meta.description, { x: 0.85, y: y0, w: leftW, h: 2.4, fontSize: 13, color: INK, valign: 'top', lineSpacingMultiple: 1.3, align: 'left' });
    }

    // Scope / composition bullets built from what the report actually contains.
    const scope: string[] = [];
    if (meta.rowCount) scope.push(`Based on ${meta.rowCount} rows from the underlying dataset`);
    if (charts.length) scope.push(`${charts.length} visualization${charts.length > 1 ? 's' : ''} covering ${charts.map(c => c.title).slice(0, 3).join(', ')}${charts.length > 3 ? ', and more' : ''}`);
    if (kpis.length) scope.push(`${kpis.length} headline metric${kpis.length > 1 ? 's' : ''} tracked`);
    if (tables.length) scope.push(`${tables.length} supporting data table${tables.length > 1 ? 's' : ''}`);
    if (scope.length) {
      slide.addText('What this report covers', { x: 0.85, y: y0 + 2.6, w: leftW, h: 0.35, fontSize: 12, bold: true, color: MUTE });
      slide.addText(scope.map(t => ({ text: t, options: { bullet: { code: '2022' }, breakLine: true } })), {
        x: 0.85, y: y0 + 3.0, w: leftW, h: 2.3, fontSize: 12, color: INK, valign: 'top', lineSpacingMultiple: 1.2, paraSpaceAfter: 6,
      });
    }

    // Right rail: key metrics as compact cards.
    const rx = 8.35, rw = 4.35;
    slide.addText('KEY METRICS', { x: rx, y: y0, w: rw, h: 0.3, fontSize: 10, bold: true, color: BRAND, charSpacing: 2 });
    const shown = kpis.slice(0, 5);
    const ch = 0.86, gap = 0.14;
    shown.forEach((k, i) => {
      const cy = y0 + 0.42 + i * (ch + gap);
      slide.addShape(pptx.ShapeType.roundRect, { x: rx, y: cy, w: rw, h: ch, rectRadius: 0.06, fill: { color: PANEL }, line: { color: LINE, width: 1 } });
      slide.addShape(pptx.ShapeType.rect, { x: rx, y: cy, w: 0.07, h: ch, fill: { color: SERIES_COLORS[i % SERIES_COLORS.length] } });
      slide.addText(k.metric.toUpperCase(), { x: rx + 0.22, y: cy + 0.1, w: rw - 1.4, h: 0.66, fontSize: 9, bold: true, color: MUTE, valign: 'middle' });
      slide.addText(k.value, { x: rx + rw - 1.5, y: cy + 0.06, w: 1.35, h: 0.5, fontSize: 16, bold: true, color: INK, align: 'right', valign: 'middle' });
      if (k.trend) slide.addText(k.trend, { x: rx + rw - 1.5, y: cy + 0.48, w: 1.35, h: 0.3, fontSize: 8, color: MUTE, align: 'right', valign: 'top' });
    });
    if (!shown.length) slide.addText('No headline metrics in this report.', { x: rx, y: y0 + 0.5, w: rw, h: 0.4, fontSize: 11, italic: true, color: MUTE });

    footer(slide);
  }

  // ── One slide per chart — native chart + data-derived talking points ─────
  charts.forEach((c) => {
    const slide = pptx.addSlide();
    const y0 = slideHeader(pptx, slide, c.title, 'Visualization');
    if (c.explanation) slide.addText(c.explanation, { x: 0.85, y: y0, w: W - 1.7, h: 0.85, fontSize: 11, color: MUTE, valign: 'top', lineSpacingMultiple: 1.15 });

    const chartTop = y0 + (c.explanation ? 0.95 : 0.1);
    const chartX = 0.6, chartW = 7.5, chartH = H - chartTop - 0.75;

    const common: any = {
      x: chartX, y: chartTop, w: chartW, h: chartH,
      chartColors: SERIES_COLORS,
      showLegend: c.series.length > 1, legendPos: 'b', legendFontSize: 9,
      catAxisLabelFontSize: 9, valAxisLabelFontSize: 9,
      catAxisLabelColor: MUTE, valAxisLabelColor: MUTE,
      showTitle: false,
    };

    if (c.chartKind === 'pie') {
      slide.addChart(pptx.ChartType.pie, [{ name: c.title, labels: c.labels, values: c.series[0].values }], {
        ...common, showLegend: true, legendPos: 'r', showPercent: true, dataLabelColor: 'FFFFFF', dataLabelFontSize: 9,
      });
    } else if (c.chartKind === 'scatter') {
      slide.addChart(pptx.ChartType.scatter, [
        { name: 'X', values: c.labels.map(l => num(l)) },
        ...c.series.map(s => ({ name: s.name, values: s.values })),
      ], { ...common, lineSize: 0 });
    } else {
      const type = c.chartKind === 'line' ? pptx.ChartType.line : c.chartKind === 'area' ? pptx.ChartType.area : pptx.ChartType.bar;
      const data = c.series.map(s => ({ name: s.name, labels: c.labels, values: s.values }));
      slide.addChart(type, data, {
        ...common,
        barDir: 'col',
        ...(c.chartKind === 'line' ? { lineSize: 2.5, lineSmooth: true, lineDataSymbol: 'none' } : {}),
        ...(c.chartKind === 'area' ? { lineSize: 1.5, chartColorsOpacity: 40 } : {}),
      });
    }

    // Talking points rail.
    const rx = 8.4, rw = 4.35;
    slide.addText('WHAT THE DATA SHOWS', { x: rx, y: chartTop, w: rw, h: 0.3, fontSize: 10, bold: true, color: BRAND, charSpacing: 1.5 });
    const points = chartInsights(c);
    if (points.length) {
      slide.addText(points.map(t => ({ text: t, options: { bullet: { code: '2022' }, breakLine: true } })), {
        x: rx, y: chartTop + 0.45, w: rw, h: chartH - 0.45, fontSize: 12, color: INK, valign: 'top', lineSpacingMultiple: 1.25, paraSpaceAfter: 8,
      });
    }
    footer(slide);
  });

  // ── Analysis & insights — narrative paragraphs and bullets ───────────────
  if (narratives.length) {
    // Chunk narratives so a slide never overflows (≈6 blocks/slide).
    for (let i = 0; i < narratives.length; i += 6) {
      const group = narratives.slice(i, i + 6);
      const slide = pptx.addSlide();
      const y0 = slideHeader(pptx, slide, i === 0 ? 'Analysis & Insights' : 'Analysis & Insights (cont.)', 'Narrative');
      const runs: pptxgen.TextProps[] = [];
      group.forEach((n) => {
        if (n.title) runs.push({ text: n.title, options: { bold: true, fontSize: 13, color: INK, breakLine: true, paraSpaceBefore: 6 } });
        if (n.body) runs.push({ text: n.body, options: { fontSize: 12, color: '3A3733', breakLine: true, lineSpacingMultiple: 1.2, paraSpaceAfter: 6 } });
        (n.items ?? []).forEach(it => runs.push({ text: it, options: { fontSize: 12, color: INK, bullet: { code: '2022' }, breakLine: true, indentLevel: 1, paraSpaceAfter: 3 } }));
      });
      slide.addText(runs, { x: 0.85, y: y0, w: W - 1.7, h: H - y0 - 0.75, valign: 'top' });
      footer(slide);
    }
  }

  // ── Data tables — paginated ──────────────────────────────────────────────
  const ROWS_PER_SLIDE = 12;
  tables.forEach(t => {
    const cols = Object.keys(t.rows[0] ?? {});
    if (!cols.length) return;
    const chunks: Record<string, any>[][] = [];
    for (let i = 0; i < Math.min(t.rows.length, 200); i += ROWS_PER_SLIDE) chunks.push(t.rows.slice(i, i + ROWS_PER_SLIDE));

    chunks.forEach((chunk, ci) => {
      const slide = pptx.addSlide();
      const title = chunks.length > 1 ? `${t.title} (${ci + 1}/${chunks.length})` : t.title;
      const y0 = slideHeader(pptx, slide, title, 'Data');

      const header = cols.map(c => ({ text: c, options: { bold: true, color: 'FFFFFF', fill: { color: INK }, fontSize: 11, align: 'left' as const } }));
      const body = chunk.map((r, ri) =>
        cols.map(c => ({ text: formatCell(r[c]), options: { fontSize: 10, color: INK, fill: { color: ri % 2 ? 'FFFFFF' : PANEL }, align: 'left' as const } }))
      );
      slide.addTable([header, ...body], {
        x: 0.6, y: y0, w: W - 1.2,
        border: { type: 'solid', color: LINE, pt: 0.5 }, rowH: 0.38, valign: 'middle', margin: [3, 6, 3, 6],
      });
      if (ci === 0 && t.rows.length > 200) slide.addText(`Showing first 200 of ${t.rows.length} rows.`, { x: 0.6, y: H - 0.85, w: 6, h: 0.3, fontSize: 9, italic: true, color: MUTE });
      footer(slide);
    });
  });

  // ── Closing takeaways ────────────────────────────────────────────────────
  {
    const slide = pptx.addSlide();
    const y0 = slideHeader(pptx, slide, 'Key Takeaways', 'Summary');
    const takeaways: string[] = [];
    kpis.slice(0, 3).forEach(k => takeaways.push(`${k.metric}: ${k.value}${k.trend ? ` (${k.trend})` : ''}`));
    charts.slice(0, 4).forEach(c => { const ins = chartInsights(c)[0]; if (ins) takeaways.push(`${c.title} — ${ins}`); });
    narratives.filter(n => n.variant === 'insight' || n.variant === 'success' || n.variant === 'summary').slice(0, 3).forEach(n => { if (n.body) takeaways.push(n.body); });
    if (!takeaways.length) takeaways.push('Review the visualizations and data tables in this deck for detailed findings.');

    slide.addText(takeaways.slice(0, 8).map(t => ({ text: t, options: { bullet: { code: '2022', indent: 18 }, breakLine: true } })), {
      x: 0.85, y: y0 + 0.1, w: W - 1.7, h: H - y0 - 0.9, fontSize: 14, color: INK, valign: 'top', lineSpacingMultiple: 1.3, paraSpaceAfter: 10,
    });
    footer(slide);
  }

  pptx.writeFile({ fileName: `${sanitizeFile(meta.title ?? 'report')}.pptx` });
}
