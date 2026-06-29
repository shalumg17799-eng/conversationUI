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
