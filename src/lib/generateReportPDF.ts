/**
 * Professional PDF Generation Utility for Report Hub Reports
 * 
 * This module generates high-quality, structured PDFs using jsPDF and jsPDF-AutoTable.
 * It does NOT use DOM screenshot capture (html2canvas). Instead, it programmatically
 * builds each page with proper layout positioning, chart images, and tables.
 * 
 * Features:
 * - Native chart export using amCharts5 API
 * - Professional table rendering with jspdf-autotable
 * - Multi-page support with automatic page breaks
 * - Consistent typography and spacing
 * - Dynamic Y-position tracking for layout flow
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as am5 from '@amcharts/amcharts5';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface KPIData {
  kpi_name: string;
  current_value: string;
  previous_value: string;
  trend: 'up' | 'down' | 'flat';
  delta: string;
}

export interface TableRow {
  [key: string]: string | number;
}

export interface ReportData {
  reportName: string;
  domain: string;
  datasetName: string;
  lastUpdated: string;
  sourceApplication?: string;
  kpis: KPIData[];
  topDrivers: TableRow[];
  topEntities: TableRow[];
}

export interface ChartExportData {
  chartRoot: am5.Root;
  title: string;
  width?: number;
  height?: number;
}

export interface PDFGenerationOptions {
  reportData: ReportData;
  charts: {
    trend?: ChartExportData;
    yoyPrimary?: ChartExportData;
    yoySecondary?: ChartExportData;
  };
  filename?: string;
  onProgress?: (stage: string) => void;
}

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

const PDF_CONFIG = {
  pageFormat: 'a4' as const,
  orientation: 'portrait' as const,
  unit: 'mm' as const,
  margin: 10,
  lineHeight: 1.4,
  colors: {
    primary: '#111827',
    secondary: '#6B7280',
    accent: '#60A5FA',
    border: '#E5E7EB',
    success: '#10B981',
    danger: '#EF4444',
  },
  fonts: {
    regular: 'helvetica',
    bold: 'helvetica',
  },
};

// ============================================================================
// CHART EXPORT UTILITIES
// ============================================================================

/**
 * Export amCharts chart to high-resolution base64 image
 */
async function exportChartToBase64(
  chartRoot: am5.Root,
  options: { scale?: number; width?: number; height?: number } = {}
): Promise<string> {
  const { scale = 3 } = options;

  try {
    // Dynamically import amCharts exporting plugin
    const am5plugins_exporting = await import('@amcharts/amcharts5/plugins/exporting');
    const Exporting = am5plugins_exporting.Exporting;

    // Create exporting instance
    const exporting = Exporting.new(chartRoot, {
      pngOptions: {
        quality: 1,
        maintainPixelRatio: true,
      },
      filePrefix: 'chart',
      backgroundColor: am5.color(0xFFFFFF),
    });

    // Export as PNG
    const imageData = await exporting.export('png', {
      scale: scale,
      quality: 1,
      maintainPixelRatio: true,
    });

    // Clean up
    exporting.dispose();

    return imageData as string;
  } catch (error) {
    console.error('Error exporting chart:', error);
    throw new Error('Failed to export chart');
  }
}

// ============================================================================
// PDF LAYOUT UTILITIES
// ============================================================================

/**
 * Tracks vertical position on current page and handles page breaks
 */
class PDFLayoutManager {
  private pdf: jsPDF;
  private currentY: number;
  private margin: number;
  private pageHeight: number;
  private pageWidth: number;
  private footerHeight: number = 15;

  constructor(pdf: jsPDF, margin: number = 10) {
    this.pdf = pdf;
    this.margin = margin;
    this.pageHeight = pdf.internal.pageSize.getHeight();
    this.pageWidth = pdf.internal.pageSize.getWidth();
    this.currentY = margin;
  }

  /**
   * Get current Y position
   */
  getY(): number {
    return this.currentY;
  }

  /**
   * Set Y position
   */
  setY(y: number): void {
    this.currentY = y;
  }

  /**
   * Move Y position down by specified amount
   */
  moveY(amount: number): void {
    this.currentY += amount;
  }

  /**
   * Get available height remaining on current page
   */
  getAvailableHeight(): number {
    return this.pageHeight - this.currentY - this.footerHeight;
  }

  /**
   * Check if there's enough space for content, add page if needed
   */
  ensureSpace(requiredHeight: number): boolean {
    if (this.getAvailableHeight() < requiredHeight) {
      this.addPage();
      return false;
    }
    return true;
  }

  /**
   * Add a new page and reset Y position
   */
  addPage(): void {
    this.pdf.addPage();
    this.currentY = this.margin;
  }

  /**
   * Get content width (page width minus margins)
   */
  getContentWidth(): number {
    return this.pageWidth - this.margin * 2;
  }

  /**
   * Get left margin X position
   */
  getMarginX(): number {
    return this.margin;
  }
}

// ============================================================================
// PDF RENDERING FUNCTIONS
// ============================================================================

/**
 * Add PDF header with report information
 */
function addHeader(
  pdf: jsPDF,
  reportData: ReportData,
  pageNumber: number,
  totalPages: number,
  margin: number
): void {
  const pageWidth = pdf.internal.pageSize.getWidth();

  // Title
  pdf.setFontSize(12);
  pdf.setTextColor(PDF_CONFIG.colors.primary);
  pdf.setFont(PDF_CONFIG.fonts.bold, 'bold');
  pdf.text(`${reportData.reportName} — Full Report`, margin, margin + 5);

  // Subtitle
  pdf.setFontSize(8);
  pdf.setTextColor(PDF_CONFIG.colors.secondary);
  pdf.setFont(PDF_CONFIG.fonts.regular, 'normal');
  pdf.text(
    `${reportData.domain} | ${reportData.datasetName}`,
    margin,
    margin + 10
  );

  // Page number (right-aligned)
  const pageText = `Page ${pageNumber} of ${totalPages}`;
  const pageTextWidth = pdf.getTextWidth(pageText);
  pdf.text(pageText, pageWidth - margin - pageTextWidth, margin + 5);

  // Separator line
  pdf.setDrawColor(PDF_CONFIG.colors.border);
  pdf.setLineWidth(0.3);
  pdf.line(margin, margin + 12, pageWidth - margin, margin + 12);
}

/**
 * Add PDF footer with branding and date
 */
function addFooter(pdf: jsPDF, margin: number): void {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const footerY = pageHeight - margin - 5;

  // Separator line
  pdf.setDrawColor(PDF_CONFIG.colors.border);
  pdf.setLineWidth(0.3);
  pdf.line(margin, footerY - 3, pageWidth - margin, footerY - 3);

  // Footer text
  pdf.setFontSize(7);
  pdf.setTextColor(PDF_CONFIG.colors.secondary);
  pdf.setFont(PDF_CONFIG.fonts.regular, 'normal');
  pdf.text('Powered by Report Hub · Data-Driven · Connected Model', margin, footerY);

  // Date (right-aligned)
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const dateText = `Generated: ${dateStr}`;
  const dateWidth = pdf.getTextWidth(dateText);
  pdf.text(dateText, pageWidth - margin - dateWidth, footerY);
}

/**
 * Render section title
 */
function renderSectionTitle(
  pdf: jsPDF,
  layout: PDFLayoutManager,
  title: string
): void {
  layout.ensureSpace(10);

  pdf.setFontSize(11);
  pdf.setTextColor(PDF_CONFIG.colors.primary);
  pdf.setFont(PDF_CONFIG.fonts.bold, 'bold');
  pdf.text(title, layout.getMarginX(), layout.getY());

  layout.moveY(7);
}

/**
 * Render KPI cards section
 */
function renderKPISection(
  pdf: jsPDF,
  layout: PDFLayoutManager,
  kpis: KPIData[]
): void {
  renderSectionTitle(pdf, layout, 'Year to Date Performance');

  const margin = layout.getMarginX();
  const cardWidth = (layout.getContentWidth() - 4) / 3; // 3 cards with 2mm gaps
  const cardHeight = 30;

  layout.ensureSpace(cardHeight + 5);

  kpis.slice(0, 3).forEach((kpi, index) => {
    const x = margin + index * (cardWidth + 2);
    const y = layout.getY();

    // Card border
    pdf.setDrawColor(PDF_CONFIG.colors.border);
    pdf.setLineWidth(0.3);
    pdf.rect(x, y, cardWidth, cardHeight);

    // KPI name
    pdf.setFontSize(7);
    pdf.setTextColor(PDF_CONFIG.colors.secondary);
    pdf.setFont(PDF_CONFIG.fonts.regular, 'normal');
    pdf.text(kpi.kpi_name.toUpperCase(), x + 3, y + 5);

    // Trend icon
    const trendColor =
      kpi.trend === 'up'
        ? PDF_CONFIG.colors.success
        : kpi.trend === 'down'
        ? PDF_CONFIG.colors.danger
        : PDF_CONFIG.colors.secondary;
    const trendSymbol = kpi.trend === 'up' ? '↑' : kpi.trend === 'down' ? '↓' : '—';
    pdf.setTextColor(trendColor);
    pdf.text(trendSymbol, x + cardWidth - 6, y + 5);

    // Current value
    pdf.setFontSize(18);
    pdf.setTextColor(PDF_CONFIG.colors.primary);
    pdf.setFont(PDF_CONFIG.fonts.bold, 'bold');
    pdf.text(kpi.current_value, x + 3, y + 15);

    // Delta and previous value
    pdf.setFontSize(8);
    pdf.setTextColor(trendColor);
    pdf.setFont(PDF_CONFIG.fonts.bold, 'bold');
    pdf.text(kpi.delta, x + 3, y + 22);

    pdf.setTextColor(PDF_CONFIG.colors.secondary);
    pdf.setFont(PDF_CONFIG.fonts.regular, 'normal');
    pdf.text(`from ${kpi.previous_value}`, x + 3 + pdf.getTextWidth(kpi.delta) + 2, y + 22);
  });

  layout.moveY(cardHeight + 8);
}

/**
 * Render chart with title
 */
async function renderChart(
  pdf: jsPDF,
  layout: PDFLayoutManager,
  chartData: ChartExportData
): Promise<void> {
  const { chartRoot, title, width, height } = chartData;

  renderSectionTitle(pdf, layout, title);

  const chartHeight = height || 80;
  layout.ensureSpace(chartHeight + 5);

  try {
    // Export chart as base64 image
    const imageData = await exportChartToBase64(chartRoot, { scale: 3 });

    // Add image to PDF
    const chartWidth = width || layout.getContentWidth();
    pdf.addImage(
      imageData,
      'PNG',
      layout.getMarginX(),
      layout.getY(),
      chartWidth,
      chartHeight,
      undefined,
      'FAST'
    );

    layout.moveY(chartHeight + 8);
  } catch (error) {
    console.error(`Failed to render chart: ${title}`, error);
    // Add placeholder text
    pdf.setFontSize(9);
    pdf.setTextColor(PDF_CONFIG.colors.secondary);
    pdf.text('[Chart could not be rendered]', layout.getMarginX(), layout.getY());
    layout.moveY(10);
  }
}

/**
 * Render data table using jspdf-autotable
 */
function renderTable(
  pdf: jsPDF,
  layout: PDFLayoutManager,
  title: string,
  data: TableRow[],
  columns: { header: string; dataKey: string }[]
): void {
  renderSectionTitle(pdf, layout, title);

  // Use jspdf-autotable for professional table rendering
  autoTable(pdf, {
    startY: layout.getY(),
    head: [columns.map((col) => col.header)],
    body: data.map((row) => columns.map((col) => String(row[col.dataKey] || ''))),
    theme: 'grid',
    headStyles: {
      fillColor: [249, 250, 251],
      textColor: [107, 114, 128],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'left',
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [17, 24, 39],
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251],
    },
    margin: { left: layout.getMarginX(), right: layout.getMarginX() },
    tableWidth: layout.getContentWidth(),
    didDrawPage: (data) => {
      // Update layout Y position after table
      if (data.cursor) {
        layout.setY(data.cursor.y);
      }
    },
  });

  layout.moveY(5);
}

// ============================================================================
// MAIN PDF GENERATION FUNCTION
// ============================================================================

/**
 * Generate complete PDF report
 */
export async function generateReportPDF(options: PDFGenerationOptions): Promise<void> {
  const { reportData, charts, filename, onProgress } = options;

  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║        Professional PDF Generation Started            ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  try {
    // Initialize PDF
    onProgress?.('Initializing PDF document...');
    const pdf = new jsPDF({
      orientation: PDF_CONFIG.orientation,
      unit: PDF_CONFIG.unit,
      format: PDF_CONFIG.pageFormat,
      compress: true,
    });

    const layout = new PDFLayoutManager(pdf, PDF_CONFIG.margin);

    // Reserve space for header
    layout.setY(PDF_CONFIG.margin + 15);

    // ========================================================================
    // SECTION 1: KPI Cards
    // ========================================================================
    onProgress?.('Rendering KPI metrics...');
    renderKPISection(pdf, layout, reportData.kpis);

    // ========================================================================
    // SECTION 2: Trend Chart
    // ========================================================================
    if (charts.trend) {
      onProgress?.('Exporting trend chart...');
      await renderChart(pdf, layout, charts.trend);
    }

    // ========================================================================
    // SECTION 3: YoY Primary Chart
    // ========================================================================
    if (charts.yoyPrimary) {
      onProgress?.('Exporting year-over-year chart...');
      await renderChart(pdf, layout, charts.yoyPrimary);
    }

    // ========================================================================
    // SECTION 4: Top Drivers Table
    // ========================================================================
    if (reportData.topDrivers.length > 0) {
      onProgress?.('Rendering data tables...');
      renderTable(
        pdf,
        layout,
        reportData.domain === 'Sales'
          ? 'Top Products'
          : reportData.domain === 'Customer Experience'
          ? 'Top Drivers'
          : 'Top Segments',
        reportData.topDrivers,
        [
          { header: 'Name', dataKey: 'name' },
          { header: 'Value', dataKey: 'value' },
          { header: 'Share', dataKey: 'share' },
          { header: 'Trend', dataKey: 'trend' },
        ]
      );
    }

    // ========================================================================
    // SECTION 5: YoY Secondary Chart
    // ========================================================================
    if (charts.yoySecondary) {
      onProgress?.('Exporting secondary metrics...');
      await renderChart(pdf, layout, charts.yoySecondary);
    }

    // ========================================================================
    // SECTION 6: Top Entities Table
    // ========================================================================
    if (reportData.topEntities.length > 0) {
      renderTable(
        pdf,
        layout,
        reportData.domain === 'Sales'
          ? 'Top Territories'
          : reportData.domain === 'Customer Experience'
          ? 'Top Locations'
          : 'Top Entities',
        reportData.topEntities,
        [
          { header: 'Entity', dataKey: 'entity' },
          { header: 'Metric', dataKey: 'value' },
          { header: 'Volume', dataKey: 'impressions' },
          { header: 'Rate', dataKey: 'rate' },
        ]
      );
    }

    // ========================================================================
    // Add headers and footers to all pages
    // ========================================================================
    onProgress?.('Finalizing document...');
    const totalPages = pdf.getNumberOfPages();

    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      addHeader(pdf, reportData, i, totalPages, PDF_CONFIG.margin);
      addFooter(pdf, PDF_CONFIG.margin);
    }

    // ========================================================================
    // Save PDF
    // ========================================================================
    const finalFilename =
      filename ||
      `${reportData.reportName.replace(/\s+/g, '_')}_Full_Report_${
        new Date().toISOString().split('T')[0]
      }.pdf`;

    onProgress?.('Saving PDF file...');
    pdf.save(finalFilename);

    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║           ✅ PDF Generation Completed!                 ║');
    console.log(`║           File: ${finalFilename.padEnd(37)}║`);
    console.log(`║           Pages: ${String(totalPages).padEnd(36)}║`);
    console.log('╚════════════════════════════════════════════════════════╝');

    onProgress?.('complete');
  } catch (error) {
    console.error('╔════════════════════════════════════════════════════════╗');
    console.error('║              ❌ PDF Generation Failed                  ║');
    console.error('╚════════════════════════════════════════════════════════╝');
    console.error(error);
    throw error;
  }
}
