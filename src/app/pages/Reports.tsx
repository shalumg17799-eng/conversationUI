import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Layout } from '../components/ui/Layout';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { 
  getAllReports, 
  getReportCounts, 
  getReportById,
  catalogDatasets,
  formatRelativeTime,
  getReportPreviewData,
  getRelatedInsights,
} from '@/lib/dataModel';
import { ChevronRight, TrendingUp, TrendingDown, Minus, ArrowRight, ExternalLink, Plus, X, Check, Star, Share2, MoreVertical, Download } from 'lucide-react';
import { jsPDF } from 'jspdf';

export function ReportsPage() {
  const { reportId } = useParams();
  const navigate = useNavigate();

  // If we have a reportId, show the detail view
  if (reportId) {
    return <ReportDetailView reportId={reportId} />;
  }

  // Otherwise show the index view
  return <ReportsIndexView />;
}

function ReportsIndexView() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const allReports = getAllReports();
  const reportCounts = getReportCounts();
  
  // Check for migrated report parameter
  const migratedReportName = searchParams.get('migrated');
  const [showSuccessBanner, setShowSuccessBanner] = useState(!!migratedReportName);
  
  // Handle highlight from create report flow
  const [highlightedReportName, setHighlightedReportName] = useState<string | null>(null);
  const [showCreateSuccessBanner, setShowCreateSuccessBanner] = useState(false);
  const [createdReportInfo, setCreatedReportInfo] = useState<any>(null);
  const highlightedReportRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    // Check if we have navigation state from create report flow
    if (location.state && (location.state as any).source === 'create-report-flow') {
      const highlightReport = (location.state as any).highlightReport;
      
      if (highlightReport) {
        setHighlightedReportName(highlightReport.reportName);
        setCreatedReportInfo(highlightReport);
        
        // Check if report exists in the list (match by name only, since platform may differ)
        const matchingReport = allReports.find(
          report => 
            report.report_name.toLowerCase() === highlightReport.reportName.toLowerCase()
        );
        
        if (matchingReport) {
          // Scroll to the highlighted report after a short delay
          setTimeout(() => {
            if (highlightedReportRef.current) {
              highlightedReportRef.current.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center' 
              });
            }
          }, 100);
        } else {
          // Show success banner if report not found in list yet
          setShowCreateSuccessBanner(true);
        }
        
        // Clear highlight after 3 seconds
        const timer = setTimeout(() => {
          setHighlightedReportName(null);
        }, 3000);
        
        // Clear navigation state to prevent re-highlighting on refresh
        window.history.replaceState({}, document.title);
        
        return () => clearTimeout(timer);
      }
    }
  }, [location.state, allReports]);

  return (
    <Layout>
      {/* Success Banner - Migrated Report */}
      {showSuccessBanner && migratedReportName && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-start justify-between" style={{ fontFamily: 'Inter, sans-serif' }}>
          <div className="flex items-start gap-3 flex-1">
            <div className="flex-shrink-0 mt-0.5">
              <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                <Check className="w-3 h-3 text-white" />
              </div>
            </div>
            <div>
              <p className="text-[13px] text-green-900 font-medium">
                {migratedReportName} is now available in Report Hub.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowSuccessBanner(false)}
            className="flex-shrink-0 text-green-600 hover:text-green-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Success Banner - Created Report */}
      {showCreateSuccessBanner && createdReportInfo && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex items-start justify-between" style={{ fontFamily: 'Inter, sans-serif' }}>
          <div className="flex items-start gap-3 flex-1">
            <div className="flex-shrink-0 mt-0.5">
              <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                <Check className="w-3 h-3 text-white" />
              </div>
            </div>
            <div>
              <p className="text-[13px] text-blue-900 font-medium">
                Report created: {createdReportInfo.reportName}
              </p>
              <p className="text-[11px] text-blue-700 mt-1">
                {createdReportInfo.executionPath === 'enterprise_bi' 
                  ? `Submitted to ${createdReportInfo.platform} • Pending approval`
                  : 'Published • Ready to view'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateSuccessBanner(false)}
            className="flex-shrink-0 text-blue-600 hover:text-blue-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* PAGE HEADER */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-[28px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
            My Reports
          </h1>
          <p className="text-[13px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
            Unified reporting experience across all platforms
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <button
            onClick={() => navigate('/report-flow')}
            className="px-5 py-2.5 bg-[#111827] hover:bg-[#0F172A] text-white rounded-lg text-[13px] font-medium transition-colors shadow-sm flex items-center gap-2"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            <Plus className="w-4 h-4" />
            Create New Report
          </button>
          <div className="text-[11px] text-[#6B7280] bg-blue-50 px-3 py-1.5 rounded-md" style={{ fontFamily: 'Inter, sans-serif' }}>
            Tool-Agnostic · Unified View
          </div>
        </div>
      </div>

      {/* SECTION 1: REPORTS OVERVIEW (Summary Tiles) */}
      <div className="grid grid-cols-3 gap-6">
        <button
          onClick={() => navigate('/reports')}
          className="bg-white rounded-[12px] border border-[#E5E7EB] p-6 shadow-sm text-left hover:border-[#6B7280] transition-colors"
        >
          <div className="text-[32px] font-bold text-[#111827] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
            {reportCounts.total}
          </div>
          <div className="text-[14px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
            Total Reports
          </div>
          <div className="text-[12px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
            Across all platforms
          </div>
        </button>

        <button
          onClick={() => navigate('/reports')}
          className="bg-white rounded-[12px] border border-[#E5E7EB] p-6 shadow-sm text-left hover:border-[#6B7280] transition-colors"
        >
          <div className="text-[32px] font-bold text-[#111827] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
            {reportCounts.standard}
          </div>
          <div className="text-[14px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
            Standard Reports
          </div>
          <div className="text-[12px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
            Lightweight access
          </div>
        </button>

        <button
          onClick={() => navigate('/reports')}
          className="bg-[#FFFBEB] rounded-[12px] border border-[#E5E7EB] p-6 shadow-sm text-left hover:border-[#6B7280] transition-colors"
        >
          <div className="text-[32px] font-bold text-[#111827] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
            {reportCounts.enterprise}
          </div>
          <div className="text-[14px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
            Enterprise Reports
          </div>
          <div className="text-[12px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
            Advanced analysis
          </div>
        </button>
      </div>

      {/* SECTION 2: REPORTS GRID */}
      <div className="bg-white rounded-[12px] border border-[#E5E7EB] p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="text-[18px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
            All Reports
          </h2>
          <p className="text-[13px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
            Unified view of all reports, regardless of source platform
          </p>
        </div>

        {/* Reports Grid */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          {allReports.map((report) => {
            const dataset = catalogDatasets.find(d => d.dataset_id === report.source_dataset_id);
            const isMigrated = migratedReportName && report.report_name === migratedReportName;
            const isHighlighted = highlightedReportName && 
              report.report_name.toLowerCase() === highlightedReportName.toLowerCase();
            
            return (
              <div
                key={report.report_id}
                ref={isHighlighted ? highlightedReportRef : null}
                onClick={() => navigate(`/reports/${report.report_id}`)}
                className={`bg-white border-2 ${
                  isHighlighted 
                    ? 'border-blue-400 shadow-lg bg-blue-50' 
                    : isMigrated 
                    ? 'border-green-300 shadow-md' 
                    : 'border-gray-200'
                } rounded-xl p-5 cursor-pointer transition-all hover:shadow-lg hover:border-gray-300 group relative`}
              >
                {/* Highlight Badge */}
                {isHighlighted && (
                  <div className="absolute top-3 right-3">
                    <span className="bg-blue-500 text-white text-[10px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                      <Check className="w-3 h-3" />
                      New
                    </span>
                  </div>
                )}
                
                {/* Migrated Badge */}
                {!isHighlighted && isMigrated && (
                  <div className="absolute top-3 right-3">
                    <span className="bg-green-500 text-white text-[10px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                      <Check className="w-3 h-3" />
                      Migrated
                    </span>
                  </div>
                )}

                {/* Report Title */}
                <div className="mb-3">
                  <h3 className="text-[15px] font-semibold text-[#111827] mb-1 line-clamp-2 pr-16" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {report.report_name}
                  </h3>
                </div>

                {/* Domain & Category */}
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>Domain:</span>
                    <span className="text-[11px] text-[#111827] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {report.domain}
                    </span>
                  </div>
                  
                  {report.business_owner && (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>Owner:</span>
                      <span className="text-[11px] text-[#111827] font-medium truncate" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {report.business_owner}
                      </span>
                    </div>
                  )}
                </div>

                {/* Last Updated */}
                <div className="text-[11px] text-[#6B7280] mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Updated {formatRelativeTime(report.last_updated_ts)}
                </div>

                {/* Bottom Section: Type & Actions */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-2">
                    {report.enterprise_flag ? (
                      <span className="bg-[#FFFBEB] text-[#92400E] text-[10px] font-medium px-2 py-1 rounded" style={{ fontFamily: 'Inter, sans-serif' }}>
                        Enterprise
                      </span>
                    ) : (
                      <span className="bg-blue-50 text-blue-700 text-[10px] font-medium px-2 py-1 rounded" style={{ fontFamily: 'Inter, sans-serif' }}>
                        Standard
                      </span>
                    )}
                  </div>

                  {/* Action Icons */}
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        console.log('Favorite report');
                      }}
                      className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                      title="Favorite"
                    >
                      <Star className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        console.log('Share report');
                      }}
                      className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                      title="Share"
                    >
                      <Share2 className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        console.log('More options');
                      }}
                      className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                      title="More options"
                    >
                      <MoreVertical className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-[#F8F9FB] rounded-lg p-3 border border-[#E5E7EB]">
          <p className="text-[12px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
            Unified reporting experience across all BI platforms.
          </p>
        </div>
      </div>

      {/* SECTION 3: QUICK ACTIONS */}
      <div className="bg-[#EFF6FF] rounded-[12px] border border-[#BFDBFE] p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
              Need quick insights?
            </h3>
            <p className="text-[12px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
              Use conversational analytics for fast insights. Escalate only when needed.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/conversational')}
              className="px-5 py-2.5 bg-[#111827] hover:bg-[#0F172A] text-white rounded-lg text-[13px] font-medium transition-colors"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Open Conversational Analytics
            </button>
            <button
              onClick={() => navigate('/enterprise-bi')}
              className="px-5 py-2.5 bg-white hover:bg-gray-50 text-[#111827] border border-[#E5E7EB] rounded-lg text-[13px] font-medium transition-colors"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              View Enterprise BI
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}

// Custom Tooltip for Chart
const ChurnTooltip = ({ active, payload, metricLabel }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const change = data.change_vs_previous_month;
    const changeDirection = change > 0 ? '↑' : change < 0 ? '↓' : '→';
    const changeColor = change > 0 ? '#EF4444' : change < 0 ? '#10B981' : '#6B7280';
    const label = metricLabel || 'Value';

    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3" style={{ fontFamily: 'Inter, sans-serif' }}>
        <p className="text-[12px] font-semibold text-[#111827] mb-2">{data.month}</p>
        <p className="text-[13px] text-[#111827] mb-1">
          {label}: <span className="font-bold">{data.churn_rate}%</span>
        </p>
        {change !== undefined && change !== 0 && (
          <p className="text-[11px]" style={{ color: changeColor }}>
            {changeDirection} {Math.abs(change).toFixed(1)}% vs previous month
          </p>
        )}
      </div>
    );
  }
  return null;
};

// Memoized Chart Component to prevent unnecessary re-renders
const ChurnRateChart = React.memo(({ data, reportId }: { data: any[]; reportId: string }) => {
  const isChurn = reportId === 'RPT-CHURN-001';
  const yAxisLabel = isChurn ? 'Churn Rate (%)' : 'Performance (%)';
  const yDomain: [number, number] = isChurn ? [0, 8] : [0, 100];
  const metricLabel = isChurn ? 'Churn Rate' : 'Value';
  const gradientId = `blueGrad-${reportId}`;

  return (
    <div key="report-chart-wrapper" className="w-full mb-4" style={{ height: '240px', display: 'block' }}>
      <ResponsiveContainer key={`chart-container-${reportId}`} width="100%" height={240}>
        <BarChart
          data={data}
          margin={{ top: 10, right: 20, left: 10, bottom: 20 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563EB" />
              <stop offset="100%" stopColor="#60A5FA" />
            </linearGradient>
          </defs>
          <XAxis
            key={`xaxis-${reportId}`}
            dataKey="month"
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#6B7280', fontSize: 11, fontFamily: 'Inter, sans-serif' }}
          />
          <YAxis
            key={`yaxis-${reportId}`}
            label={{ value: yAxisLabel, angle: -90, position: 'insideLeft', style: { fill: '#6B7280', fontSize: 11, fontFamily: 'Inter, sans-serif' } }}
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#6B7280', fontSize: 11, fontFamily: 'Inter, sans-serif' }}
            domain={yDomain}
            tickFormatter={(value) => `${value}%`}
          />
          <Tooltip key={`tooltip-${reportId}`} content={<ChurnTooltip metricLabel={metricLabel} />} cursor={{ fill: 'rgba(96, 165, 250, 0.08)' }} />
          <Bar
            key={`bar-${reportId}`}
            dataKey="churn_rate"
            fill={`url(#${gradientId})`}
            radius={[6, 6, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});

ChurnRateChart.displayName = 'ChurnRateChart';

function ReportDetailView({ reportId }: { reportId: string }) {
  const navigate = useNavigate();
  const report = getReportById(reportId);
  const previewData = useMemo(() => {
    const data = getReportPreviewData(reportId);
    return data ? data.map((item, index) => ({ ...item, id: `${reportId}-${index}` })) : null;
  }, [reportId]);
  const relatedInsights = getRelatedInsights(reportId);
  const reportContentRef = useRef<HTMLDivElement>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const handleDownloadPdf = async () => {
    if (!report || isDownloadingPdf) return;
    setIsDownloadingPdf(true);

    try {
      // ── Pure jsPDF approach ─────────────────────────────────────────────
      // Build the PDF directly from the report data model using jsPDF's
      // drawing primitives. This completely bypasses html2canvas and its
      // incompatibility with Tailwind CSS v4's oklch() color functions.
      // ────────────────────────────────────────────────────────────────────

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const marginX = 20;
      const contentW = pageW - marginX * 2;
      let y = marginX;

      const black = '#111827';
      const gray = '#6B7280';
      const accentBlue = '#3B82F6';
      const lightBg = '#F3F4F6';
      const borderCol = '#D1D5DB';

      const checkPage = (needed: number) => {
        if (y + needed > pageH - 15) {
          pdf.addPage();
          y = marginX;
        }
      };

      const drawSectionTitle = (title: string) => {
        checkPage(14);
        pdf.setFillColor(lightBg);
        pdf.roundedRect(marginX, y, contentW, 9, 1.5, 1.5, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.setTextColor(black);
        pdf.text(title, marginX + 4, y + 6.2);
        y += 13;
      };

      const drawLabel = (label: string, value: string, x: number, w: number) => {
        checkPage(12);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(gray);
        pdf.text(label.toUpperCase(), x, y);
        y += 4;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        pdf.setTextColor(black);
        const lines = pdf.splitTextToSize(value, w);
        pdf.text(lines, x, y);
        y += lines.length * 4.5 + 2;
      };

      const drawBulletList = (items: string[], bulletColor: string = '#E11D48') => {
        for (const item of items) {
          checkPage(10);
          pdf.setFillColor(bulletColor);
          pdf.circle(marginX + 3, y - 0.8, 1, 'F');
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(9);
          pdf.setTextColor('#374151');
          const lines = pdf.splitTextToSize(item, contentW - 10);
          pdf.text(lines, marginX + 7, y);
          y += lines.length * 4 + 3;
        }
      };

      const drawDivider = () => {
        checkPage(4);
        pdf.setDrawColor(borderCol);
        pdf.setLineWidth(0.3);
        pdf.line(marginX, y, pageW - marginX, y);
        y += 4;
      };

      // ═══════════════ HEADER ═══════════════

      pdf.setFillColor(accentBlue);
      pdf.rect(0, 0, pageW, 3, 'F');
      y = 12;

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(20);
      pdf.setTextColor(black);
      const titleLines = pdf.splitTextToSize(report.report_name, contentW - 40);
      pdf.text(titleLines, marginX, y);
      y += titleLines.length * 8;

      // Badges
      pdf.setFillColor('#EFF6FF');
      pdf.roundedRect(marginX, y, 22, 6, 1.5, 1.5, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.setTextColor(accentBlue);
      pdf.text('Report Hub', marginX + 3, y + 4);

      if (report.enterprise_flag) {
        pdf.setFillColor('#FFFBEB');
        pdf.roundedRect(marginX + 26, y, 22, 6, 1.5, 1.5, 'F');
        pdf.setTextColor('#92400E');
        pdf.text('Enterprise', marginX + 29, y + 4);
      } else {
        pdf.setFillColor('#EFF6FF');
        pdf.roundedRect(marginX + 26, y, 20, 6, 1.5, 1.5, 'F');
        pdf.setTextColor(accentBlue);
        pdf.text('Standard', marginX + 29, y + 4);
      }
      y += 10;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(gray);
      pdf.text(`Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, marginX, y);
      y += 8;
      drawDivider();

      // ═══════════════ METADATA ═══════════════

      drawSectionTitle('Report Metadata');
      const halfW = contentW / 2 - 4;
      const col1X = marginX;
      const col2X = marginX + contentW / 2 + 4;

      let savedY = y;
      drawLabel('Domain', report.domain, col1X, halfW);
      let afterC1 = y;
      y = savedY;
      const dsName = catalogDatasets.find(d => d.dataset_id === report.source_dataset_id)?.dataset_name || 'Unknown';
      drawLabel('Source Dataset', dsName, col2X, halfW);
      y = Math.max(afterC1, y);

      savedY = y;
      drawLabel('Last Updated', formatRelativeTime(report.last_updated_ts), col1X, halfW);
      afterC1 = y;
      y = savedY;
      drawLabel('Report Type', report.enterprise_flag ? 'Enterprise' : 'Standard', col2X, halfW);
      y = Math.max(afterC1, y);

      if (report.business_owner) {
        savedY = y;
        drawLabel('Business Owner', report.business_owner, col1X, halfW);
        afterC1 = y;
        y = savedY;
        drawLabel('Refresh Frequency', report.refresh_frequency || 'Not specified', col2X, halfW);
        y = Math.max(afterC1, y);
      }
      y += 2;

      // ═══════════════ KEY KPIs ═══════════════

      if (report.key_kpis && report.key_kpis.length > 0) {
        drawSectionTitle('Key KPIs & Trends');
        const kpiCount = Math.min(report.key_kpis.length, 3);
        const kpiW = (contentW - (kpiCount - 1) * 4) / kpiCount;

        for (let row = 0; row < Math.ceil(report.key_kpis.length / 3); row++) {
          checkPage(28);
          const rowStartY = y;
          for (let col = 0; col < 3; col++) {
            const idx = row * 3 + col;
            if (idx >= report.key_kpis.length) break;
            const kpi = report.key_kpis[idx];
            const kx = marginX + col * (kpiW + 4);

            pdf.setFillColor('#F9FAFB');
            pdf.roundedRect(kx, rowStartY, kpiW, 24, 2, 2, 'F');
            pdf.setDrawColor(borderCol);
            pdf.roundedRect(kx, rowStartY, kpiW, 24, 2, 2, 'S');

            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(7.5);
            pdf.setTextColor(gray);
            pdf.text(kpi.kpi_name, kx + 3, rowStartY + 5);

            const arrowColor = kpi.trend === 'up' ? '#16A34A' : kpi.trend === 'down' ? '#DC2626' : gray;
            pdf.setTextColor(arrowColor);
            pdf.setFontSize(7);
            const arrow = kpi.trend === 'up' ? '\u25B2' : kpi.trend === 'down' ? '\u25BC' : '-';
            pdf.text(arrow, kx + kpiW - 8, rowStartY + 5);

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(14);
            pdf.setTextColor(black);
            pdf.text(kpi.current_value, kx + 3, rowStartY + 14);

            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(7);
            pdf.setTextColor(arrowColor);
            pdf.text(`${kpi.delta} from ${kpi.previous_value}`, kx + 3, rowStartY + 20);
          }
          y = rowStartY + 28;
        }
        y += 2;
      }

      // ═══════════════ RELATED INSIGHTS ═══════════════

      if (relatedInsights && relatedInsights.length > 0) {
        drawSectionTitle('Related Insights');
        checkPage(22);
        const insCount = Math.min(relatedInsights.length, 3);
        const insW = (contentW - (insCount - 1) * 4) / insCount;
        const insStartY = y;

        relatedInsights.forEach((insight, idx) => {
          const ix = marginX + idx * (insW + 4);
          pdf.setFillColor('#F9FAFB');
          pdf.roundedRect(ix, insStartY, insW, 18, 2, 2, 'F');
          pdf.setDrawColor(borderCol);
          pdf.roundedRect(ix, insStartY, insW, 18, 2, 2, 'S');

          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(7.5);
          pdf.setTextColor(gray);
          pdf.text(insight.label, ix + 3, insStartY + 5);

          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(13);
          pdf.setTextColor(black);
          pdf.text(String(insight.value), ix + 3, insStartY + 14);
        });
        y = insStartY + 22;
      }

      // ═══════════════ BAR CHART + DATA TABLE ═══════════════

      if (previewData && previewData.length > 0) {
        drawSectionTitle(`Report Preview - ${previewData[0]?.churn_rate != null ? 'Churn Rate' : previewData[0]?.takeRate != null ? 'Take Rate' : 'Metric'} Trend`);

        // ── Visual Bar Chart (rendered with jsPDF rectangles) ─────────────
        const chartH = 60;
        const chartLeftPad = 14;
        const chartBottomPad = 12;
        const chartAreaW = contentW - chartLeftPad;
        const chartAreaH = chartH - chartBottomPad;
        const chartOriginX = marginX + chartLeftPad;

        checkPage(chartH + 12);
        const chartTopY = y;

        // Normalize: preview data may use churn_rate, takeRate, or value
        const getVal = (d: any): number => {
          if (typeof d.churn_rate === 'number') return d.churn_rate;
          if (typeof d.takeRate === 'number') return d.takeRate;
          if (typeof d.value === 'number') return d.value;
          return 0;
        };
        const chartLabel = previewData[0]?.churn_rate != null ? 'Churn Rate'
          : previewData[0]?.takeRate != null ? 'Take Rate'
          : 'Value';

        const maxRate = Math.max(...previewData.map((d: any) => getVal(d)), 1);
        const yAxisMax = Math.ceil(maxRate + 1);
        const yTicks = 5;
        const yStep = yAxisMax / yTicks;

        // Gridlines & Y-axis tick labels
        for (let t = 0; t <= yTicks; t++) {
          const tickVal = t * yStep;
          const tickY = chartTopY + chartAreaH - (tickVal / yAxisMax) * chartAreaH;
          pdf.setDrawColor('#E5E7EB');
          pdf.setLineWidth(0.15);
          pdf.line(chartOriginX, tickY, chartOriginX + chartAreaW, tickY);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(6.5);
          pdf.setTextColor(gray);
          pdf.text(`${tickVal.toFixed(0)}%`, marginX, tickY + 1);
        }

        // Draw bars
        const barCount = previewData.length;
        const barGroupW = chartAreaW / barCount;
        const barW = Math.min(barGroupW * 0.6, 12);
        const barGap = (barGroupW - barW) / 2;

        previewData.forEach((row: any, idx: number) => {
          const rowVal = getVal(row);
          const barH = (rowVal / yAxisMax) * chartAreaH;
          const bx = chartOriginX + idx * barGroupW + barGap;
          const by = chartTopY + chartAreaH - barH;

          // Rounded-top bar: body + rounded cap
          const radius = Math.min(1.8, barW / 2);
          pdf.setFillColor('#60A5FA');
          if (barH > radius) {
            pdf.rect(bx, by + radius, barW, barH - radius, 'F');
          }
          pdf.roundedRect(bx, by, barW, Math.min(barH, radius * 2 + 1), radius, radius, 'F');

          // Value label above bar
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(6);
          pdf.setTextColor('#1E40AF');
          const valStr = `${rowVal}%`;
          const valTxtW = pdf.getTextWidth(valStr);
          pdf.text(valStr, bx + (barW - valTxtW) / 2, by - 1.5);

          // X-axis month label
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(6.5);
          pdf.setTextColor(gray);
          const label = String(row.month);
          const labelTxtW = pdf.getTextWidth(label);
          pdf.text(label, bx + (barW - labelTxtW) / 2, chartTopY + chartAreaH + 5);
        });

        // X-axis baseline
        pdf.setDrawColor('#9CA3AF');
        pdf.setLineWidth(0.4);
        pdf.line(chartOriginX, chartTopY + chartAreaH, chartOriginX + chartAreaW, chartTopY + chartAreaH);

        // Chart frame
        pdf.setDrawColor('#E5E7EB');
        pdf.setLineWidth(0.2);
        pdf.roundedRect(marginX - 1, chartTopY - 5, contentW + 2, chartH + 8, 2, 2, 'S');

        y = chartTopY + chartH + 8;

        // ── Data Table beneath chart ──────────────────────────────────────
        checkPage(10);
        pdf.setFillColor(lightBg);
        pdf.rect(marginX, y, contentW, 7, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8);
        pdf.setTextColor(black);
        pdf.text('Month', marginX + 4, y + 5);
        pdf.text(`${chartLabel} (%)`, marginX + 55, y + 5);
        pdf.text('Change vs Prev.', marginX + 105, y + 5);
        y += 8;

        for (const row of previewData) {
          checkPage(7);
          pdf.setDrawColor('#E5E7EB');
          pdf.line(marginX, y - 1, pageW - marginX, y - 1);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(8.5);
          pdf.setTextColor(black);
          pdf.text(String(row.month), marginX + 4, y + 3.5);
          pdf.text(`${getVal(row)}%`, marginX + 55, y + 3.5);
          const change = typeof row.change_vs_previous_month === 'number' ? row.change_vs_previous_month : null;
          const changeStr = change != null ? (change > 0 ? `+${change.toFixed(1)}%` : change < 0 ? `${change.toFixed(1)}%` : '-') : '-';
          pdf.setTextColor(change != null && change > 0 ? '#DC2626' : change != null && change < 0 ? '#16A34A' : gray);
          pdf.text(changeStr, marginX + 105, y + 3.5);
          y += 6;
        }
        y += 4;
      }

      // ═══════════════ REPORT OVERVIEW ═══════════════

      if (report.primary_use_case) {
        drawSectionTitle('Report Overview');
        checkPage(12);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor('#374151');
        const txt = `This report is used by ${report.used_by_roles?.join(', ') || 'key stakeholders'} to support decisions related to ${report.primary_use_case} within the ${report.domain} domain.`;
        const lines = pdf.splitTextToSize(txt, contentW);
        pdf.text(lines, marginX, y);
        y += lines.length * 4 + 4;
      }

      // ═══════════════ DIMENSIONS ═══════════════

      if (report.primary_dimensions && report.primary_dimensions.length > 0) {
        drawSectionTitle('Dimensions & Coverage');
        checkPage(10);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(gray);
        pdf.text('PRIMARY DIMENSIONS', marginX, y);
        y += 4;
        pdf.setFontSize(9);
        pdf.setTextColor(black);
        const dimText = pdf.splitTextToSize(report.primary_dimensions.join('  |  '), contentW);
        pdf.text(dimText, marginX, y);
        y += dimText.length * 4 + 2;
        if (report.time_range_supported) {
          pdf.setFontSize(8);
          pdf.setTextColor(gray);
          pdf.text('TIME RANGE', marginX, y);
          y += 4;
          pdf.setFontSize(9);
          pdf.setTextColor(black);
          pdf.text(report.time_range_supported, marginX, y);
          y += 6;
        }
        y += 2;
      }

      // ═══════════════ KEY INSIGHTS ═══════════════

      if (report.top_insights && report.top_insights.length > 0) {
        drawSectionTitle('Key Insights');
        drawBulletList(report.top_insights, '#E11D48');
      }

      // ═══════════════ KNOWN LIMITATIONS ═══════════════

      if (report.known_limitations && report.known_limitations.length > 0) {
        drawSectionTitle('Known Limitations');
        drawBulletList(report.known_limitations, '#9CA3AF');
      }

      // ═══════════════ RECOMMENDED ACTIONS ═══════════════

      if (report.recommended_actions && report.recommended_actions.length > 0) {
        drawSectionTitle('Recommended Actions');
        drawBulletList(report.recommended_actions, '#3B82F6');
      }

      // ═══════════════ RELATED REPORTS ═══════════════

      if (report.related_reports && report.related_reports.length > 0) {
        drawSectionTitle('Related Reports');
        for (const rel of report.related_reports) {
          checkPage(7);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(9);
          pdf.setTextColor(accentBlue);
          pdf.text(`->  ${rel.report_name}`, marginX + 3, y);
          y += 5.5;
        }
        y += 2;
      }

      // ═══════════════ USED BY ROLES ═══════════════

      if (report.used_by_roles && report.used_by_roles.length > 0) {
        drawSectionTitle('Commonly Used By');
        checkPage(8);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(black);
        const roleText = pdf.splitTextToSize(report.used_by_roles.join('  |  '), contentW);
        pdf.text(roleText, marginX, y);
        y += roleText.length * 4 + 4;
      }

      // ═══════════════ DATASET ═══════════════

      const srcDS = catalogDatasets.find(d => d.dataset_id === report.source_dataset_id);
      if (srcDS) {
        drawSectionTitle('Powered By Dataset');
        checkPage(14);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10);
        pdf.setTextColor(black);
        pdf.text(srcDS.dataset_name, marginX, y);
        if (srcDS.certified_flag) {
          const nw = pdf.getTextWidth(srcDS.dataset_name);
          pdf.setFillColor('#ECFDF3');
          pdf.roundedRect(marginX + nw + 3, y - 3.5, 16, 5, 1, 1, 'F');
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(6.5);
          pdf.setTextColor('#065F46');
          pdf.text('Certified', marginX + nw + 5, y - 0.2);
        }
        y += 5;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8.5);
        pdf.setTextColor(gray);
        pdf.text(`Domain: ${srcDS.domain}  |  Last refreshed: ${formatRelativeTime(srcDS.last_refresh_ts)}`, marginX, y);
        y += 8;
      }

      // ═══════════════ FOOTER ON ALL PAGES ═══════════════

      const totalPages = pdf.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        pdf.setPage(p);
        pdf.setDrawColor(borderCol);
        pdf.setLineWidth(0.3);
        pdf.line(marginX, pageH - 12, pageW - marginX, pageH - 12);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7);
        pdf.setTextColor(gray);
        pdf.text('Powered by Report Hub', marginX, pageH - 8);
        pdf.text(`Page ${p} of ${totalPages}`, pageW - marginX - 20, pageH - 8);
      }

      const fileName = `${report.report_name.replace(/[^a-zA-Z0-9]/g, '_')}_Report.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error('PDF download failed:', error);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  if (!report) {
    return (
      <Layout>
        <div className="bg-white rounded-[12px] border border-[#E5E7EB] p-8 shadow-sm text-center">
          <h2 className="text-[18px] font-semibold text-[#111827] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
            Report not found
          </h2>
          <p className="text-[13px] text-[#6B7280] mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
            The report you're looking for doesn't exist or has been removed.
          </p>
          <button
            onClick={() => navigate('/reports')}
            className="px-4 py-2 bg-[#111827] hover:bg-[#0F172A] text-white rounded-lg text-[13px] font-medium"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            Back to Reports
          </button>
        </div>
      </Layout>
    );
  }

  const sourceDataset = catalogDatasets.find(d => d.dataset_id === report.source_dataset_id);

  const trendIcon = (trend: string) => {
    if (trend === 'up') return <TrendingUp className="w-3.5 h-3.5 text-green-600" />;
    if (trend === 'down') return <TrendingDown className="w-3.5 h-3.5 text-red-600" />;
    return <Minus className="w-3.5 h-3.5 text-gray-400" />;
  };

  // Get enterprise platform button details
  const getEnterprisePlatformButton = (source?: string) => {
    if (!source) return null;
    
    const platformMap: { [key: string]: string } = {
      'Tableau': 'Tableau',
      'Looker': 'Looker',
      'Qlik': 'Qlik',
    };
    
    const platform = platformMap[source];
    if (!platform) return null;
    
    return {
      label: `View in ${platform}`,
      platform: platform,
      url: '#', // Placeholder URL
    };
  };

  const platformButton = getEnterprisePlatformButton(report.source_application);

  return (
    <Layout>
      <div ref={reportContentRef} data-pdf-root className="space-y-8">
      {/* PAGE HEADER */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[12px]" style={{ fontFamily: 'Inter, sans-serif' }}>
          <button 
            onClick={() => navigate('/reports')}
            className="text-[#60A5FA] hover:text-[#3B82F6] hover:underline"
          >
            Reports
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-[#6B7280]">{report.report_name}</span>
        </div>
        
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-[28px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                {report.report_name}
              </h1>
              <div 
                className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-[12px] font-medium"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                Report Hub
              </div>
            </div>
            <p className="text-[13px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
              Report overview and access details.
            </p>
          </div>
          <button
            onClick={handleDownloadPdf}
            disabled={isDownloadingPdf}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#111827] hover:bg-[#0F172A] disabled:bg-[#374151] disabled:cursor-not-allowed text-white rounded-lg text-[13px] font-medium transition-colors shadow-sm"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            <Download className="w-4 h-4" />
            {isDownloadingPdf ? 'Generating PDF...' : 'Download PDF'}
          </button>
        </div>
      </div>

      {/* Enterprise Warning Banner */}
      {report.enterprise_flag && (
        <div className="bg-[#FFFBEB] rounded-[12px] border border-[#FCD34D] p-4">
          <p className="text-[13px] text-[#92400E] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
            ⚠️ This report requires advanced analysis capabilities.
          </p>
        </div>
      )}

      {/* SECTION 1: REPORT METADATA */}
      <div className="bg-white rounded-[12px] border border-[#E5E7EB] p-6 shadow-sm">
        <h2 className="text-[16px] font-semibold text-[#111827] mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
          Report Metadata
        </h2>
        
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
              Domain
            </label>
            <p className="text-[14px] text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
              {report.domain}
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
              Source Dataset
            </label>
            <button
              onClick={() => navigate(`/datasets/${report.source_dataset_id}`)}
              className="text-[14px] text-[#60A5FA] hover:text-[#3B82F6] hover:underline font-medium"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              {sourceDataset?.dataset_name || 'Unknown'}
            </button>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
              Last Updated
            </label>
            <p className="text-[14px] text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
              {formatRelativeTime(report.last_updated_ts)}
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
              Report Type
            </label>
            {report.enterprise_flag ? (
              <span className="inline-block bg-[#FFFBEB] text-[#92400E] text-[11px] font-medium px-3 py-1 rounded" style={{ fontFamily: 'Inter, sans-serif' }}>
                Enterprise
              </span>
            ) : (
              <span className="inline-block bg-blue-50 text-blue-700 text-[11px] font-medium px-3 py-1 rounded" style={{ fontFamily: 'Inter, sans-serif' }}>
                Standard
              </span>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 2: REPORT PREVIEW */}
      <div className="bg-white rounded-[12px] border border-[#E5E7EB] p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[16px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
            Report Preview
          </h2>
          <button
            onClick={() => navigate(`/reports/${reportId}/full`)}
            className="px-4 py-2 bg-[#111827] hover:bg-[#0F172A] text-white rounded-lg text-[13px] font-medium transition-colors"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            View Full Report
          </button>
        </div>

        {!report.enterprise_flag && previewData ? (
          <>
            <ChurnRateChart data={previewData} reportId={reportId} />
            
            <div className="bg-[#F8F9FB] rounded-lg p-3 border border-[#E5E7EB]">
              <p className="text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                Preview rendered via Report Hub (lightweight)
              </p>
            </div>
          </>
        ) : (
          <div className="bg-[#F8F9FB] rounded-lg p-8 border border-[#E5E7EB] text-center">
            <p className="text-[14px] text-[#111827] font-medium mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
              Full report available in Enterprise BI
            </p>
            <button
              onClick={() => navigate('/enterprise-bi')}
              className="px-5 py-2.5 bg-[#111827] hover:bg-[#0F172A] text-white rounded-lg text-[13px] font-medium"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Open in Enterprise BI
            </button>
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-[#E5E7EB]">
          <p className="text-[10px] text-[#6B7280] text-center" style={{ fontFamily: 'Inter, sans-serif' }}>
            Powered by Report Hub dummy data (connected model)
          </p>
        </div>
      </div>

      {/* SECTION 3: RELATED INSIGHTS */}
      <div className="bg-white rounded-[12px] border border-[#E5E7EB] p-6 shadow-sm">
        <h2 className="text-[16px] font-semibold text-[#111827] mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
          Related Insights
        </h2>

        <div className="grid grid-cols-3 gap-4 mb-5">
          {relatedInsights.map((insight, idx) => (
            <div key={idx} className="bg-[#F8F9FB] rounded-lg p-4 border border-[#E5E7EB]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-medium text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {insight.label}
                </span>
                {trendIcon(insight.trend)}
              </div>
              <p className="text-[20px] font-bold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                {insight.value}
              </p>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => navigate('/conversational')}
            className="px-4 py-2 bg-[#111827] hover:bg-[#0F172A] text-white rounded-lg text-[12px] font-medium"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            Ask a question about this report
          </button>
          <button
            onClick={() => navigate(`/datasets/${report.source_dataset_id}`)}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-[#111827] rounded-lg text-[12px] font-medium"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            View underlying dataset
          </button>
        </div>
      </div>

      {/* NEW SECTION: REPORT OVERVIEW */}
      {report.primary_use_case && (
        <div className="bg-white rounded-[12px] border border-[#E5E7EB] p-6 shadow-sm">
          <h2 className="text-[16px] font-semibold text-[#111827] mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
            Report Overview
          </h2>
          <p className="text-[14px] text-[#374151] mb-4" style={{ fontFamily: 'Inter, sans-serif', lineHeight: '1.6' }}>
            This report is used by{' '}
            <span className="font-medium text-[#111827]">
              {report.used_by_roles?.join(', ') || 'key stakeholders'}
            </span>{' '}
            to support decisions related to{' '}
            <span className="font-medium text-[#111827]">{report.primary_use_case}</span>
            {' '}within the {report.domain} domain.
          </p>
          
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[#E5E7EB]">
            <div>
              <label className="block text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                Business Owner
              </label>
              <p className="text-[13px] text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                {report.business_owner || 'Not specified'}
              </p>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                Refresh Frequency
              </label>
              <p className="text-[13px] text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                {report.refresh_frequency || 'Not specified'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* NEW SECTION: KEY KPIs & TRENDS */}
      {report.key_kpis && report.key_kpis.length > 0 && (
        <div className="bg-white rounded-[12px] border border-[#E5E7EB] p-6 shadow-sm">
          <h2 className="text-[16px] font-semibold text-[#111827] mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
            Key KPIs & Trends
          </h2>
          <div className="grid grid-cols-3 gap-4">
            {report.key_kpis.map((kpi, idx) => (
              <div key={idx} className="bg-[#F8F9FB] rounded-lg p-4 border border-[#E5E7EB]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-medium text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {kpi.kpi_name}
                  </span>
                  {trendIcon(kpi.trend)}
                </div>
                <p className="text-[20px] font-bold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {kpi.current_value}
                </p>
                <div className="flex items-center gap-1.5 text-[11px]" style={{ fontFamily: 'Inter, sans-serif' }}>
                  <span className={kpi.trend === 'up' ? 'text-green-600' : kpi.trend === 'down' ? 'text-red-600' : 'text-gray-500'}>
                    {kpi.delta}
                  </span>
                  <span className="text-[#6B7280]">from {kpi.previous_value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* NEW SECTION: DIMENSIONS & COVERAGE */}
      {(report.primary_dimensions || report.time_range_supported) && (
        <div className="bg-white rounded-[12px] border border-[#E5E7EB] p-6 shadow-sm">
          <h2 className="text-[16px] font-semibold text-[#111827] mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
            Dimensions & Coverage
          </h2>
          <div className="space-y-4">
            {report.primary_dimensions && report.primary_dimensions.length > 0 && (
              <div>
                <label className="block text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Primary Dimensions
                </label>
                <div className="flex flex-wrap gap-2">
                  {report.primary_dimensions.map((dim, idx) => (
                    <span 
                      key={idx}
                      className="inline-block bg-blue-50 text-blue-700 text-[12px] font-medium px-3 py-1.5 rounded" 
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                      {dim}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {report.time_range_supported && (
              <div>
                <label className="block text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Time Range Supported
                </label>
                <p className="text-[13px] text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {report.time_range_supported}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* NEW SECTION: KEY INSIGHTS */}
      {report.top_insights && report.top_insights.length > 0 && (
        <div className="bg-white rounded-[12px] border border-[#E5E7EB] p-6 shadow-sm">
          <h2 className="text-[16px] font-semibold text-[#111827] mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
            Key Insights
          </h2>
          <ul className="space-y-3">
            {report.top_insights.map((insight, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-[#E11D48] mt-2 flex-shrink-0" />
                <p className="text-[13px] text-[#374151]" style={{ fontFamily: 'Inter, sans-serif', lineHeight: '1.6' }}>
                  {insight}
                </p>
              </li>
            ))}
          </ul>
          
          {report.known_limitations && report.known_limitations.length > 0 && (
            <div className="mt-5 pt-5 border-t border-[#E5E7EB]">
              <h3 className="text-[13px] font-semibold text-[#111827] mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                Known Limitations
              </h3>
              <ul className="space-y-2">
                {report.known_limitations.map((limitation, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#6B7280] mt-2 flex-shrink-0" />
                    <p className="text-[12px] text-[#6B7280] italic" style={{ fontFamily: 'Inter, sans-serif', lineHeight: '1.6' }}>
                      {limitation}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* NEW SECTION: USAGE & RELATIONSHIPS */}
      {(report.related_reports || report.recommended_actions || report.used_by_roles) && (
        <div className="bg-white rounded-[12px] border border-[#E5E7EB] p-6 shadow-sm">
          <h2 className="text-[16px] font-semibold text-[#111827] mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
            Usage & Relationships
          </h2>
          
          <div className="space-y-5">
            {/* Related Reports */}
            {report.related_reports && report.related_reports.length > 0 && (
              <div>
                <h3 className="text-[13px] font-semibold text-[#111827] mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Related Reports
                </h3>
                <div className="space-y-2">
                  {report.related_reports.map((relatedReport, idx) => (
                    <button
                      key={idx}
                      onClick={() => navigate(`/reports/${relatedReport.report_id}`)}
                      className="w-full text-left px-4 py-3 bg-[#F8F9FB] hover:bg-blue-50 border border-[#E5E7EB] hover:border-blue-200 rounded-lg transition-colors group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] text-[#111827] font-medium group-hover:text-[#60A5FA]" style={{ fontFamily: 'Inter, sans-serif' }}>
                          {relatedReport.report_name}
                        </span>
                        <ArrowRight className="w-4 h-4 text-[#6B7280] group-hover:text-[#60A5FA]" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Commonly Used By Roles */}
            {report.used_by_roles && report.used_by_roles.length > 0 && (
              <div className="pt-5 border-t border-[#E5E7EB]">
                <h3 className="text-[13px] font-semibold text-[#111827] mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Commonly Used By
                </h3>
                <div className="flex flex-wrap gap-2">
                  {report.used_by_roles.map((role, idx) => (
                    <span 
                      key={idx}
                      className="inline-block bg-gray-100 text-gray-700 text-[12px] font-medium px-3 py-1.5 rounded" 
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                      {role}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Recommended Actions */}
            {report.recommended_actions && report.recommended_actions.length > 0 && (
              <div className="pt-5 border-t border-[#E5E7EB]">
                <h3 className="text-[13px] font-semibold text-[#111827] mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Recommended Actions
                </h3>
                <ul className="space-y-2">
                  {report.recommended_actions.map((action, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#E11D48] mt-2 flex-shrink-0" />
                      <p className="text-[13px] text-[#374151]" style={{ fontFamily: 'Inter, sans-serif', lineHeight: '1.6' }}>
                        {action}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 4: DATASET DEPENDENCY */}
      {sourceDataset && (
        <div className="bg-white rounded-[12px] border border-[#E5E7EB] p-6 shadow-sm">
          <h2 className="text-[16px] font-semibold text-[#111827] mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
            Powered By Dataset
          </h2>

          <div className="flex items-start justify-between">
            <div className="space-y-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-[15px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {sourceDataset.dataset_name}
                  </h3>
                  {sourceDataset.certified_flag && (
                    <span className="bg-[#ECFDF3] text-[#065F46] text-[10px] font-medium px-2 py-1 rounded" style={{ fontFamily: 'Inter, sans-serif' }}>
                      Certified
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Domain: {sourceDataset.domain}
                </p>
              </div>
              
              <p className="text-[12px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                Last refreshed: {formatRelativeTime(sourceDataset.last_refresh_ts)}
              </p>
            </div>

            <button
              onClick={() => navigate(`/datasets/${report.source_dataset_id}`)}
              className="px-5 py-2.5 bg-[#111827] hover:bg-[#0F172A] text-white rounded-lg text-[13px] font-medium"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Open Dataset
            </button>
          </div>
        </div>
      )}

      {/* SECTION 5: ESCALATION / NAVIGATION */}
      <div className="bg-[#EFF6FF] rounded-[12px] border border-[#BFDBFE] p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/reports')}
            className="text-[13px] text-[#60A5FA] hover:text-[#3B82F6] hover:underline font-medium"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            ← Back to Reports
          </button>

          <div className="flex gap-3">
            {!report.enterprise_flag ? (
              <button
                onClick={() => navigate('/conversational')}
                className="px-5 py-2.5 bg-[#111827] hover:bg-[#0F172A] text-white rounded-lg text-[13px] font-medium"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                Continue in Conversational Analytics
              </button>
            ) : (
              <button
                onClick={() => navigate('/enterprise-bi')}
                className="px-5 py-2.5 bg-[#111827] hover:bg-[#0F172A] text-white rounded-lg text-[13px] font-medium"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                Open Enterprise BI
              </button>
            )}
          </div>
        </div>
      </div>
      </div>
    </Layout>
  );
}