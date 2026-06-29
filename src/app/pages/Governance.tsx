import React, { useState } from 'react';
import { Layout } from '../components/ui/Layout';
import { useNavigate } from 'react-router';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { 
  getGovernanceMetrics,
  getDatasetGovernanceStatus,
  refMetricDefinitions,
  catalogReports,
  getReportLandscapeData,
  formatRelativeTime,
} from '@/lib/dataModel';
import { CheckCircle2, AlertTriangle, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';

export function GovernancePage() {
  const navigate = useNavigate();
  const governanceMetrics = getGovernanceMetrics();
  const datasetStatus = getDatasetGovernanceStatus();
  const reportLandscape = getReportLandscapeData();
  
  const [expandedMetrics, setExpandedMetrics] = useState<Set<string>>(new Set());

  const toggleMetric = (metricId: string) => {
    const newExpanded = new Set(expandedMetrics);
    if (newExpanded.has(metricId)) {
      newExpanded.delete(metricId);
    } else {
      newExpanded.add(metricId);
    }
    setExpandedMetrics(newExpanded);
  };

  const StatusBadge = ({ status }: { status: 'healthy' | 'at-risk' | 'review' }) => {
    if (status === 'healthy') {
      return (
        <span className="inline-flex items-center gap-1 bg-[#ECFDF3] text-[#065F46] text-[10px] font-medium px-2 py-1 rounded" style={{ fontFamily: 'var(--font-body)' }}>
          <CheckCircle2 className="w-3 h-3" />
          Healthy
        </span>
      );
    } else if (status === 'at-risk') {
      return (
        <span className="inline-flex items-center gap-1 bg-[#FEF3C7] text-[#92400E] text-[10px] font-medium px-2 py-1 rounded" style={{ fontFamily: 'var(--font-body)' }}>
          <AlertTriangle className="w-3 h-3" />
          At Risk
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 bg-muted text-muted-foreground text-[10px] font-medium px-2 py-1 rounded" style={{ fontFamily: 'var(--font-body)' }}>
        <AlertCircle className="w-3 h-3" />
        Review
      </span>
    );
  };

  return (
    <Layout>
      {/* SECTION 0: PAGE HEADER */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-[28px] font-semibold text-foreground" style={{ fontFamily: 'var(--font-body)' }}>
            Governance
          </h1>
          <p className="text-[13px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
            Visibility into data quality, definitions, and analytics usage.
          </p>
        </div>
        <div className="text-[11px] text-brand bg-brand-subtle px-3 py-1.5 rounded-md" style={{ fontFamily: 'var(--font-body)' }}>
          System-Level · Conceptual
        </div>
      </div>

      {/* SECTION 1: GOVERNANCE OVERVIEW (Summary Tiles) */}
      <div className="grid grid-cols-4 gap-6">
        {/* Tile 1: Certified Datasets */}
        <button
          onClick={() => window.scrollTo({ top: 500, behavior: 'smooth' })}
          className="bg-card rounded-[12px] border border-border p-6 shadow-sm text-left hover:border-brand/40 hover:shadow-md transition-all"
        >
          <div className="text-[13px] font-semibold text-muted-foreground mb-2" style={{ fontFamily: 'var(--font-body)' }}>
            Certified Datasets
          </div>
          <div className="text-[32px] font-bold text-foreground mb-1" style={{ fontFamily: 'var(--font-body)' }}>
            {governanceMetrics.certifiedDatasets}/{governanceMetrics.totalDatasets}
          </div>
          <div className="text-[12px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
            {governanceMetrics.certificationRate.toFixed(0)}% trusted for decision-making
          </div>
        </button>

        {/* Tile 2: Standard vs Enterprise Reports */}
        <button
          onClick={() => window.scrollTo({ top: 1200, behavior: 'smooth' })}
          className="bg-card rounded-[12px] border border-border p-6 shadow-sm text-left hover:border-brand/40 hover:shadow-md transition-all"
        >
          <div className="text-[13px] font-semibold text-muted-foreground mb-3" style={{ fontFamily: 'var(--font-body)' }}>
            Standard vs Enterprise Reports
          </div>
          <div className="flex items-center gap-4 mb-2">
            <div>
              <div className="text-[24px] font-bold text-brand" style={{ fontFamily: 'var(--font-body)' }}>
                {governanceMetrics.standardReports}
              </div>
              <div className="text-[11px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                Standard
              </div>
            </div>
            <div>
              <div className="text-[24px] font-bold text-[#F59E0B]" style={{ fontFamily: 'var(--font-body)' }}>
                {governanceMetrics.enterpriseReports}
              </div>
              <div className="text-[11px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                Enterprise
              </div>
            </div>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-brand" 
              style={{ 
                width: `${(governanceMetrics.standardReports / (governanceMetrics.standardReports + governanceMetrics.enterpriseReports)) * 100}%` 
              }}
            />
          </div>
        </button>

        {/* Tile 3: Dataset Freshness */}
        <button
          onClick={() => window.scrollTo({ top: 500, behavior: 'smooth' })}
          className="bg-card rounded-[12px] border border-border p-6 shadow-sm text-left hover:border-brand/40 hover:shadow-md transition-all"
        >
          <div className="text-[13px] font-semibold text-muted-foreground mb-2" style={{ fontFamily: 'var(--font-body)' }}>
            Dataset Freshness
          </div>
          <div className="text-[32px] font-bold text-foreground mb-1" style={{ fontFamily: 'var(--font-body)' }}>
            {governanceMetrics.freshnessRate.toFixed(0)}%
          </div>
          <div className="text-[12px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
            Data timeliness across Report Hub
          </div>
        </button>

        {/* Tile 4: Governed Metrics */}
        <button
          onClick={() => window.scrollTo({ top: 900, behavior: 'smooth' })}
          className="bg-card rounded-[12px] border border-border p-6 shadow-sm text-left hover:border-brand/40 hover:shadow-md transition-all"
        >
          <div className="text-[13px] font-semibold text-muted-foreground mb-2" style={{ fontFamily: 'var(--font-body)' }}>
            Governed Metrics
          </div>
          <div className="text-[32px] font-bold text-foreground mb-1" style={{ fontFamily: 'var(--font-body)' }}>
            {governanceMetrics.governedMetrics}
          </div>
          <div className="text-[12px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
            Consistent definitions across platforms
          </div>
        </button>
      </div>

      {/* SECTION 2: DATASET GOVERNANCE */}
      <div className="bg-card rounded-[12px] border border-border p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="text-[18px] font-semibold text-foreground mb-1" style={{ fontFamily: 'var(--font-body)' }}>
            Dataset Governance
          </h2>
          <p className="text-[13px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
            Certification and freshness across data assets.
          </p>
        </div>

        <div className="border border-border rounded-lg overflow-hidden mb-4">
          <table className="w-full">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-[12px] font-semibold text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                  Dataset Name
                </th>
                <th className="text-left px-4 py-3 text-[12px] font-semibold text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                  Domain
                </th>
                <th className="text-left px-4 py-3 text-[12px] font-semibold text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                  Certified
                </th>
                <th className="text-left px-4 py-3 text-[12px] font-semibold text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                  Last Refreshed
                </th>
                <th className="text-left px-4 py-3 text-[12px] font-semibold text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {datasetStatus.map((dataset) => (
                <tr 
                  key={dataset.dataset_id}
                  onClick={() => navigate(`/datasets/${dataset.dataset_id}`)}
                  className="hover:bg-muted transition-colors cursor-pointer group"
                >
                  <td className="px-4 py-3 text-[13px] text-foreground font-medium" style={{ fontFamily: 'var(--font-body)' }}>
                    {dataset.dataset_name}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                    {dataset.domain}
                  </td>
                  <td className="px-4 py-3">
                    {dataset.certified_flag ? (
                      <span className="inline-flex items-center gap-1 bg-[#ECFDF3] text-[#065F46] text-[10px] font-medium px-2 py-1 rounded" style={{ fontFamily: 'var(--font-body)' }}>
                        <CheckCircle2 className="w-3 h-3" />
                        Yes
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                        No
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                    {formatRelativeTime(dataset.last_refresh_ts)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <StatusBadge status={dataset.status} />
                      <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-muted rounded-lg p-3 border border-border">
          <p className="text-[12px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
            Certification and freshness are managed centrally in Report Hub.
          </p>
        </div>
      </div>

      {/* SECTION 3: METRIC DEFINITIONS */}
      <div className="bg-card rounded-[12px] border border-border p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="text-[18px] font-semibold text-foreground mb-1" style={{ fontFamily: 'var(--font-body)' }}>
            Metric Definitions
          </h2>
          <p className="text-[13px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
            Shared definitions ensure consistent reporting across BI platforms.
          </p>
        </div>

        <div className="space-y-2 mb-4">
          {refMetricDefinitions.map((metric) => (
            <div 
              key={metric.metric_id}
              className="border border-border rounded-lg overflow-hidden"
            >
              <button
                onClick={() => toggleMetric(metric.metric_id)}
                className="w-full px-4 py-3 bg-muted hover:bg-muted transition-colors flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <ChevronDown 
                    className={`w-4 h-4 text-muted-foreground transition-transform ${expandedMetrics.has(metric.metric_id) ? 'rotate-0' : '-rotate-90'}`}
                  />
                  <span className="text-[14px] font-semibold text-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                    {metric.metric_name}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                  {metric.metric_id}
                </span>
              </button>
              
              {expandedMetrics.has(metric.metric_id) && (
                <div className="px-4 py-3 bg-white border-t border-border">
                  <div className="mb-3">
                    <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1" style={{ fontFamily: 'var(--font-body)' }}>
                      Definition
                    </label>
                    <p className="text-[13px] text-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                      {metric.definition}
                    </p>
                  </div>
                  <div className="bg-muted rounded p-3 border border-border">
                    <p className="text-[11px] text-muted-foreground font-mono" style={{ fontFamily: 'var(--font-body)' }}>
                      Applied consistently across Dashboard, Conversational, and Enterprise BI
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="bg-muted rounded-lg p-3 border border-border">
          <p className="text-[12px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
            These definitions are applied consistently across Dashboard, Conversational, and Enterprise BI.
          </p>
        </div>
      </div>

      {/* SECTION 4: REPORT GOVERNANCE */}
      <div className="bg-card rounded-[12px] border border-border p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="text-[18px] font-semibold text-foreground mb-1" style={{ fontFamily: 'var(--font-body)' }}>
            Report Landscape
          </h2>
          <p className="text-[13px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
            Visibility into how reports are classified and used.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-5">
          {/* Chart */}
          <div className="flex items-center justify-center">
            <div className="w-[200px] h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={reportLandscape}
                    dataKey="count"
                    nameKey="type"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                  >
                    {reportLandscape.map((entry, index) => (
                      <Cell key={`governance-${entry.platform}-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Legend and Stats */}
          <div className="flex flex-col justify-center">
            {reportLandscape.map((item) => (
              <div key={item.type} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: item.color }}></div>
                  <span className="text-[13px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                    {item.type} Reports
                  </span>
                </div>
                <span className="text-[18px] font-bold text-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Report Table */}
        <div className="border border-border rounded-lg overflow-hidden mb-4">
          <table className="w-full">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-[12px] font-semibold text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                  Report Name
                </th>
                <th className="text-left px-4 py-3 text-[12px] font-semibold text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                  Domain
                </th>
                <th className="text-left px-4 py-3 text-[12px] font-semibold text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                  Type
                </th>
                <th className="text-left px-4 py-3 text-[12px] font-semibold text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                  Governed By
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {catalogReports.map((report) => (
                <tr 
                  key={report.report_id}
                  onClick={() => navigate(`/reports/${report.report_id}`)}
                  className="hover:bg-muted transition-colors cursor-pointer group"
                >
                  <td className="px-4 py-3 text-[13px] text-foreground font-medium" style={{ fontFamily: 'var(--font-body)' }}>
                    {report.report_name}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                    {report.domain}
                  </td>
                  <td className="px-4 py-3">
                    {report.enterprise_flag ? (
                      <span className="bg-[#FEF3C7] text-[#92400E] text-[10px] font-medium px-2 py-1 rounded" style={{ fontFamily: 'var(--font-body)' }}>
                        Enterprise
                      </span>
                    ) : (
                      <span className="bg-brand-subtle text-brand text-[10px] font-medium px-2 py-1 rounded" style={{ fontFamily: 'var(--font-body)' }}>
                        Standard
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                        Report Hub
                      </span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-muted rounded-lg p-3 border border-border">
          <p className="text-[12px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
            Enterprise reports are intentionally limited to high-complexity use cases.
          </p>
        </div>
      </div>

      {/* SECTION 5: GOVERNANCE ACTIONS */}
      <div className="bg-brand-subtle rounded-[12px] border border-brand/20 p-6 shadow-sm">
        <h3 className="text-[15px] font-semibold text-foreground mb-4" style={{ fontFamily: 'var(--font-body)' }}>
          Governance actions
        </h3>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <button
            onClick={() => navigate('/datasets')}
            className="px-4 py-3 bg-white hover:bg-muted text-left border border-border rounded-lg text-[13px] font-medium transition-colors"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            View dataset certification details →
          </button>
          <button
            onClick={() => window.scrollTo({ top: 900, behavior: 'smooth' })}
            className="px-4 py-3 bg-white hover:bg-muted text-left border border-border rounded-lg text-[13px] font-medium transition-colors"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            Review metric definitions →
          </button>
          <button
            onClick={() => navigate('/migration')}
            className="px-4 py-3 bg-white hover:bg-muted text-left border border-border rounded-lg text-[13px] font-medium transition-colors"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            Request dataset certification →
          </button>
          <button
            onClick={() => navigate('/migration')}
            className="px-4 py-3 bg-white hover:bg-muted text-left border border-border rounded-lg text-[13px] font-medium transition-colors"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            Request report migration →
          </button>
        </div>

        <div className="bg-card rounded-lg p-3 border border-brand/20">
          <p className="text-[12px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
            Changes are request-driven and reviewed through Report Hub.
          </p>
        </div>
      </div>

      {/* SECTION 6: ESCALATION & NAVIGATION */}
      <div className="bg-card rounded-[12px] border border-border p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
            Governance visibility powered by Report Hub dummy data
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="px-5 py-2.5 bg-white hover:bg-muted text-foreground border border-border rounded-lg text-[13px] font-medium transition-colors"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              Back to Dashboard
            </button>
            <button
              onClick={() => navigate('/migration')}
              className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-[13px] font-medium transition-colors"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              View Migration Requests
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}