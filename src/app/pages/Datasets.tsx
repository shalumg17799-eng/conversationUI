import React from 'react';
import { Layout } from '../components/ui/Layout';
import { useParams, useNavigate } from 'react-router';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import { 
  getAllDatasets, 
  getDatasetCounts, 
  getDatasetById,
  getReportsByDatasetId,
  getMetricsByDataset,
  getDatasetPreviewData,
  formatRelativeTime,
} from '@/lib/dataModel';
import { ChevronRight, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import MedallionIcon from '@/imports/Group5';

export function DatasetsPage() {
  const { datasetId } = useParams();
  const navigate = useNavigate();

  // If we have a datasetId, show the detail view
  if (datasetId) {
    return <DatasetDetailView datasetId={datasetId} />;
  }

  // Otherwise show the index view
  return <DatasetsIndexView />;
}

function DatasetsIndexView() {
  const navigate = useNavigate();
  const allDatasets = getAllDatasets();
  const datasetCounts = getDatasetCounts();

  return (
    <Layout>
      {/* PAGE HEADER */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-[28px] font-semibold text-foreground" style={{ fontFamily: 'var(--font-body)' }}>
            Datasets
          </h1>
          <p className="text-[13px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
            Governed datasets powering analytics across Report Hub.
          </p>
        </div>
        <div className="text-[11px] text-muted-foreground bg-brand-subtle px-3 py-1.5 rounded-md" style={{ fontFamily: 'var(--font-body)' }}>
          Connected · Governed
        </div>
      </div>

      {/* SECTION 1: DATASET SUMMARY TILES */}
      <div className="grid grid-cols-3 gap-6">
        <button
          onClick={() => navigate('/datasets')}
          className="bg-card rounded-[12px] border border-border p-6 shadow-sm text-left hover:border-brand/40 transition-colors"
        >
          <div className="text-[32px] font-bold text-foreground mb-2" style={{ fontFamily: 'var(--font-body)' }}>
            {datasetCounts.total}
          </div>
          <div className="text-[14px] font-semibold text-foreground mb-1" style={{ fontFamily: 'var(--font-body)' }}>
            Total Datasets
          </div>
          <div className="text-[12px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
            Across all domains
          </div>
        </button>

        <button
          onClick={() => navigate('/datasets')}
          className="bg-[#ECFDF3] rounded-[12px] border border-border p-6 shadow-sm text-left hover:border-brand/40 transition-colors"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="text-[32px] font-bold text-foreground" style={{ fontFamily: 'var(--font-body)' }}>
              {datasetCounts.certified}
            </div>
            <div className="w-8 h-8">
              <MedallionIcon />
            </div>
          </div>
          <div className="text-[14px] font-semibold text-foreground mb-1" style={{ fontFamily: 'var(--font-body)' }}>
            Certified Datasets
          </div>
          <div className="text-[12px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
            Trusted for decisions
          </div>
        </button>

        <button
          onClick={() => navigate('/datasets')}
          className="bg-card rounded-[12px] border border-border p-6 shadow-sm text-left hover:border-brand/40 transition-colors"
        >
          <div className="text-[32px] font-bold text-foreground mb-2" style={{ fontFamily: 'var(--font-body)' }}>
            {datasetCounts.domains}
          </div>
          <div className="text-[14px] font-semibold text-foreground mb-1" style={{ fontFamily: 'var(--font-body)' }}>
            Domains Covered
          </div>
          <div className="text-[12px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
            Cross-functional data
          </div>
        </button>
      </div>

      {/* SECTION 2: DATASETS TABLE */}
      <div className="bg-card rounded-[12px] border border-border p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="text-[18px] font-semibold text-foreground mb-1" style={{ fontFamily: 'var(--font-body)' }}>
            All Datasets
          </h2>
          <p className="text-[13px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
            Datasets available for conversational and inline analytics.
          </p>
        </div>

        <div className="border border-border rounded-lg overflow-hidden">
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
                  Source Application
                </th>
                <th className="text-left px-4 py-3 text-[12px] font-semibold text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                  Certified
                </th>
                <th className="text-left px-4 py-3 text-[12px] font-semibold text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                  Refresh Frequency
                </th>
                <th className="text-left px-4 py-3 text-[12px] font-semibold text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                  Last Refreshed
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {allDatasets.map((dataset) => (
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
                  <td className="px-4 py-3 text-[13px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                    {dataset.source_system || 'N/A'}
                  </td>
                  <td className="px-4 py-3">
                    {dataset.certified_flag ? (
                      <span className="inline-flex items-center gap-1 bg-[#ECFDF3] text-[#065F46] text-[10px] font-medium px-2 py-1 rounded" style={{ fontFamily: 'var(--font-body)' }}>
                        <div className="w-3 h-3">
                          <MedallionIcon />
                        </div>
                        Certified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-muted-foreground text-[10px] font-medium px-2 py-1" style={{ fontFamily: 'var(--font-body)' }}>
                        <AlertCircle className="w-3 h-3" />
                        Not Certified
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                    {dataset.refresh_frequency}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                        {formatRelativeTime(dataset.last_refresh_ts)}
                      </span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 3: QUICK ACTIONS */}
      <div className="bg-brand-subtle rounded-[12px] border border-brand/20 p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-semibold text-foreground mb-1" style={{ fontFamily: 'var(--font-body)' }}>
              Explore dataset insights
            </h3>
            <p className="text-[12px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
              Datasets power insights across Report Hub.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/conversational')}
              className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-[13px] font-medium transition-colors"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              Ask Questions with Conversational Analytics
            </button>
            <button
              onClick={() => navigate('/governance')}
              className="px-5 py-2.5 bg-white hover:bg-muted text-foreground border border-border rounded-lg text-[13px] font-medium transition-colors"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              Manage Governance
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function DatasetDetailView({ datasetId }: { datasetId: string }) {
  const navigate = useNavigate();
  const dataset = getDatasetById(datasetId);
  const previewData = getDatasetPreviewData(datasetId);
  const metrics = getMetricsByDataset(datasetId);
  const relatedReports = getReportsByDatasetId(datasetId);

  if (!dataset) {
    return (
      <Layout>
        <div className="bg-card rounded-[12px] border border-border p-8 shadow-sm text-center">
          <h2 className="text-[18px] font-semibold text-foreground mb-2" style={{ fontFamily: 'var(--font-body)' }}>
            Dataset not found
          </h2>
          <p className="text-[13px] text-muted-foreground mb-4" style={{ fontFamily: 'var(--font-body)' }}>
            The dataset you're looking for doesn't exist or has been removed.
          </p>
          <button
            onClick={() => navigate('/datasets')}
            className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-[13px] font-medium"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            Back to Datasets
          </button>
        </div>
      </Layout>
    );
  }

  const hasEnterpriseReports = relatedReports.some(r => r.enterprise_flag);

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

  const platformButton = getEnterprisePlatformButton(dataset.source_system);

  return (
    <Layout>
      {/* PAGE HEADER */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[12px]" style={{ fontFamily: 'var(--font-body)' }}>
          <button 
            onClick={() => navigate('/datasets')}
            className="text-brand hover:text-brand-hover hover:underline"
          >
            Datasets
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">{dataset.dataset_name}</span>
        </div>
        
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-[28px] font-semibold text-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                {dataset.dataset_name}
              </h1>
              {platformButton && (
                <button
                  onClick={() => window.open(platformButton.url, '_blank')}
                  className="px-3 py-1.5 bg-white hover:bg-muted border border-border text-foreground rounded-lg text-[12px] font-medium transition-colors flex items-center gap-2"
                  style={{ fontFamily: 'var(--font-body)' }}
                  title={platformButton.label}
                >
                  {platformButton.label}
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <p className="text-[13px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
              Dataset overview, freshness, and usage.
            </p>
          </div>
        </div>
      </div>

      {/* Not Certified Warning Banner */}
      {!dataset.certified_flag && (
        <div className="bg-[#FFFBEB] rounded-[12px] border border-[#FCD34D] p-4">
          <p className="text-[13px] text-[#92400E] font-medium" style={{ fontFamily: 'var(--font-body)' }}>
            ⚠️ This dataset is not certified for critical decision-making.
          </p>
        </div>
      )}

      {/* SECTION 1: DATASET METADATA */}
      <div className="bg-card rounded-[12px] border border-border p-6 shadow-sm">
        <h2 className="text-[16px] font-semibold text-foreground mb-4" style={{ fontFamily: 'var(--font-body)' }}>
          Dataset Metadata
        </h2>
        
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1" style={{ fontFamily: 'var(--font-body)' }}>
              Domain
            </label>
            <p className="text-[14px] text-foreground" style={{ fontFamily: 'var(--font-body)' }}>
              {dataset.domain}
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1" style={{ fontFamily: 'var(--font-body)' }}>
              Certification Status
            </label>
            {dataset.certified_flag ? (
              <span className="inline-flex items-center gap-1.5 bg-[#ECFDF3] text-[#065F46] text-[11px] font-medium px-3 py-1 rounded" style={{ fontFamily: 'var(--font-body)' }}>
                <div className="w-3.5 h-3.5">
                  <MedallionIcon />
                </div>
                Certified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 bg-muted text-muted-foreground text-[11px] font-medium px-3 py-1 rounded" style={{ fontFamily: 'var(--font-body)' }}>
                <AlertCircle className="w-3.5 h-3.5" />
                Not Certified
              </span>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1" style={{ fontFamily: 'var(--font-body)' }}>
              Refresh Frequency
            </label>
            <p className="text-[14px] text-foreground" style={{ fontFamily: 'var(--font-body)' }}>
              {dataset.refresh_frequency}
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1" style={{ fontFamily: 'var(--font-body)' }}>
              Last Refreshed
            </label>
            <p className="text-[14px] text-foreground" style={{ fontFamily: 'var(--font-body)' }}>
              {formatRelativeTime(dataset.last_refresh_ts)}
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 2: METRICS POWERED BY THIS DATASET */}
      <div className="bg-card rounded-[12px] border border-border p-6 shadow-sm">
        <h2 className="text-[16px] font-semibold text-foreground mb-4" style={{ fontFamily: 'var(--font-body)' }}>
          Key Metrics Powered
        </h2>

        <div className="space-y-3">
          {metrics.map((metric) => (
            <div 
              key={metric.metric_id} 
              className="flex items-start justify-between p-3 bg-muted rounded-lg border border-border hover:border-brand/40 transition-colors"
            >
              <div>
                <h3 className="text-[13px] font-semibold text-foreground mb-1" style={{ fontFamily: 'var(--font-body)' }}>
                  {metric.metric_name}
                </h3>
                <p className="text-[12px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                  {metric.definition}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 3: SAMPLE DATA PREVIEW */}
      <div className="bg-card rounded-[12px] border border-border p-6 shadow-sm">
        <h2 className="text-[16px] font-semibold text-foreground mb-4" style={{ fontFamily: 'var(--font-body)' }}>
          Sample Data Preview
        </h2>

        <div className="mb-2">
          <p className="text-[12px] text-muted-foreground mb-4" style={{ fontFamily: 'var(--font-body)' }}>
            SU&G Revenue Trend (Last 6 Months)
          </p>
        </div>

        <div className="h-[220px] mb-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={previewData} margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
              <XAxis 
                dataKey="month" 
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 11, fontFamily: 'var(--font-body)' }}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 11, fontFamily: 'var(--font-body)' }}
                domain={[0, 100]}
              />
              <Bar 
                dataKey="takeRate"
                fill="var(--brand)"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-muted rounded-lg p-3 border border-border">
          <p className="text-[11px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
            Preview rendered via Report Hub (lightweight)
          </p>
        </div>

        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-[10px] text-muted-foreground text-center" style={{ fontFamily: 'var(--font-body)' }}>
            Powered by Report Hub dummy data (connected model)
          </p>
        </div>
      </div>

      {/* SECTION 4: REPORTS USING THIS DATASET */}
      <div className="bg-card rounded-[12px] border border-border p-6 shadow-sm">
        <h2 className="text-[16px] font-semibold text-foreground mb-4" style={{ fontFamily: 'var(--font-body)' }}>
          Used By Reports
        </h2>

        {relatedReports.length > 0 ? (
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 text-[12px] font-semibold text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                    Report Name
                  </th>
                  <th className="text-left px-4 py-3 text-[12px] font-semibold text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                    Type
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {relatedReports.map((report) => (
                  <tr 
                    key={report.report_id}
                    onClick={() => navigate(`/reports/${report.report_id}`)}
                    className="hover:bg-muted transition-colors cursor-pointer group"
                  >
                    <td className="px-4 py-3 text-[13px] text-foreground font-medium" style={{ fontFamily: 'var(--font-body)' }}>
                      {report.report_name}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-between">
                        {report.enterprise_flag ? (
                          <span className="bg-[#FFFBEB] text-[#92400E] text-[10px] font-medium px-2 py-1 rounded" style={{ fontFamily: 'var(--font-body)' }}>
                            Enterprise
                          </span>
                        ) : (
                          <span className="bg-brand-subtle text-brand text-[10px] font-medium px-2 py-1 rounded" style={{ fontFamily: 'var(--font-body)' }}>
                            Standard
                          </span>
                        )}
                        <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-muted rounded-lg p-6 border border-border text-center">
            <p className="text-[13px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
              No reports currently use this dataset.
            </p>
          </div>
        )}
      </div>

      {/* SECTION 5: ACTIONS & ROUTING */}
      <div className="bg-brand-subtle rounded-[12px] border border-brand/20 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[12px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
            Report Hub manages where insights live — not where users work.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/datasets')}
            className="text-[13px] text-brand hover:text-brand-hover hover:underline font-medium"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            ← Back to Datasets
          </button>

          <div className="flex gap-3">
            <button
              onClick={() => navigate('/conversational')}
              className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-[13px] font-medium"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              Ask a question using this dataset
            </button>
            <button
              onClick={() => navigate('/governance')}
              className="px-4 py-2.5 bg-white hover:bg-muted text-foreground border border-border rounded-lg text-[13px] font-medium"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              View Governance Details
            </button>
            {hasEnterpriseReports && (
              <button
                onClick={() => navigate('/enterprise-bi')}
                className="px-4 py-2.5 bg-white hover:bg-muted text-foreground border border-border rounded-lg text-[13px] font-medium"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                View related Enterprise BI
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-brand/20">
          <button
            onClick={() => navigate('/talk/migration')}
            className="text-[12px] text-brand hover:text-brand-hover hover:underline"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            Request Migration →
          </button>
        </div>
      </div>
    </Layout>
  );
}