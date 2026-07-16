// Release-notes → PDF. Programmatic jsPDF (no html2canvas) so the document is
// crisp, selectable text — mirrors the approach in generateReportPDF.ts. Given
// one release, it lays out the version header, then each feature with its
// description and highlight bullets, paginating as needed.
import { jsPDF } from 'jspdf';

export interface ReleaseFeatureLike {
  title: string;
  script?: string;      // plain-language description
  bullets?: string[];
  affectedArea?: string;
}
export interface ReleaseLike {
  version: string;
  name?: string;
  publishedAt?: string;
  features: ReleaseFeatureLike[];
}

const TERRACOTTA: [number, number, number] = [212, 87, 42]; // #D4572A
const INK: [number, number, number] = [26, 25, 23];         // #1A1917
const MUTED: [number, number, number] = [138, 135, 133];    // #8A8785
const BODY: [number, number, number] = [76, 72, 66];        // #4C4842

const fmtDate = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
};

export function generateReleaseNotesPDF(release: ReleaseLike): void {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 18;
  const contentW = pageW - margin * 2;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - margin) {
      pdf.addPage();
      y = margin;
    }
  };

  // ── Title band ──────────────────────────────────────────────────────────
  pdf.setFillColor(...TERRACOTTA);
  pdf.rect(0, 0, pageW, 3, 'F');

  pdf.setTextColor(...MUTED);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text("WHAT'S NEW", margin, (y += 8));

  pdf.setTextColor(...INK);
  pdf.setFontSize(22);
  const heading = release.name ? `${release.name}` : `Release ${release.version}`;
  pdf.text(heading, margin, (y += 10));

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.setTextColor(...MUTED);
  const sub = [release.version, fmtDate(release.publishedAt)].filter(Boolean).join('  ·  ');
  pdf.text(sub, margin, (y += 7));

  y += 4;
  pdf.setDrawColor(240, 237, 232);
  pdf.line(margin, y, pageW - margin, y);
  y += 6;

  // ── Features ────────────────────────────────────────────────────────────
  release.features.forEach((f, i) => {
    ensureSpace(20);

    // number chip + title
    pdf.setFillColor(253, 231, 222); // #FDE7DE
    pdf.circle(margin + 3, y + 1, 3.2, 'F');
    pdf.setTextColor(...TERRACOTTA);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text(String(i + 1), margin + 3, y + 2.3, { align: 'center' });

    pdf.setTextColor(...INK);
    pdf.setFontSize(14);
    const titleLines = pdf.splitTextToSize(f.title, contentW - 12);
    pdf.text(titleLines, margin + 9, y + 2.5);
    y += titleLines.length * 6.5 + 1;

    if (f.affectedArea) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(...TERRACOTTA);
      pdf.text(f.affectedArea.toUpperCase(), margin + 9, y + 2);
      y += 5;
    }

    if (f.script) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10.5);
      pdf.setTextColor(...BODY);
      const lines = pdf.splitTextToSize(f.script, contentW - 9);
      lines.forEach((line: string) => {
        ensureSpace(6);
        pdf.text(line, margin + 9, (y += 5));
      });
      y += 1;
    }

    (f.bullets ?? []).forEach((b) => {
      const lines = pdf.splitTextToSize(b, contentW - 15);
      ensureSpace(lines.length * 5 + 2);
      pdf.setFillColor(...TERRACOTTA);
      pdf.circle(margin + 11, y + 3.3, 0.9, 'F');
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(...BODY);
      lines.forEach((line: string) => {
        ensureSpace(5);
        pdf.text(line, margin + 14, (y += 5));
      });
      y += 1;
    });

    y += 6;
  });

  // ── Footer on every page ────────────────────────────────────────────────
  const pageCount = pdf.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    pdf.setPage(p);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...MUTED);
    pdf.text('Report Hub · Release Notes', margin, pageH - 8);
    pdf.text(`${p} / ${pageCount}`, pageW - margin, pageH - 8, { align: 'right' });
  }

  const safe = release.version.replace(/[^a-zA-Z0-9._-]/g, '_');
  pdf.save(`release-notes-${safe}.pdf`);
}
