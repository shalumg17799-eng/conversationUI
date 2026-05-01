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
          <h1 className="text-[28px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
            Datasets
          </h1>
          <p className="text-[13px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
            Governed datasets powering analytics across Report Hub.
          </p>
        </div>
        <div className="text-[11px] text-[#6B7280] bg-blue-50 px-3 py-1.5 rounded-md" style={{ fontFamily: 'Inter, sans-serif' }}>
          Connected · Governed
        </div>
      </div>

      {/* SECTION 1: DATASET SUMMARY TILES */}
      <div className="grid grid-cols-3 gap-6">
        <button
          onClick={() => navigate('/datasets')}
          className="bg-white rounded-[12px] border border-[#E5E7EB] p-6 shadow-sm text-left hover:border-[#6B7280] transition-colors"
        >
          <div className="text-[32px] font-bold text-[#111827] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
            {datasetCounts.total}
          </div>
          <div className="text-[14px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
            Total Datasets
          </div>
          <div className="text-[12px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
            Across all domains
          </div>
        </button>

        <button
          onClick={() => navigate('/datasets')}
          className="bg-[#ECFDF3] rounded-[12px] border border-[#E5E7EB] p-6 shadow-sm text-left hover:border-[#6B7280] transition-colors"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="text-[32px] font-bold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
              {datasetCounts.certified}
            </div>
            <div className="w-8 h-8">
              <MedallionIcon />
            </div>
          </div>
          <div className="text-[14px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
            Certified Datasets
          </div>
          <div className="text-[12px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
            Trusted for decisions
          </div>
        </button>

        <button
          onClick={() => navigate('/datasets')}
          className="bg-white rounded-[12px] border border-[#E5E7EB] p-6 shadow-sm text-left hover:border-[#6B7280] transition-colors"
        >
          <div className="text-[32px] font-bold text-[#111827] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
            {datasetCounts.domains}
          </div>
          <div className="text-[14px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
            Domains Covered
          </div>
          <div className="text-[12px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
            Cross-functional data
          </div>
        </button>
      </div>

      {/* SECTION 2: DATASETS TABLE */}
      <div className="bg-white rounded-[12px] border border-[#E5E7EB] p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="text-[18px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
            All Datasets
          </h2>
          <p className="text-[13px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
            Datasets available for conversational and inline analytics.
          </p>
        </div>

        <div className="border border-[#E5E7EB] rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-[#E5E7EB]">
              <tr>
                <th className="text-left px-4 py-3 text-[12px] font-semibold text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Dataset Name
                </th>
                <th className="text-left px-4 py-3 text-[12px] font-semibold text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Domain
                </th>
                <th className="text-left px-4 py-3 text-[12px] font-semibold text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Source Application
                </th>
                <th className="text-left px-4 py-3 text-[12px] font-semibold text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Certified
                </th>
                <th className="text-left px-4 py-3 text-[12px] font-semibold text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Refresh Frequency
                </th>
                <th className="text-left px-4 py-3 text-[12px] font-semibold text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Last Refreshed
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {allDatasets.map((dataset) => (
                <tr 
                  key={dataset.dataset_id}
                  onClick={() => navigate(`/datasets/${dataset.dataset_id}`)}
                  className="hover:bg-gray-50 transition-colors cursor-pointer group"
                >
                  <td className="px-4 py-3 text-[13px] text-[#111827] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {dataset.dataset_name}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {dataset.domain}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {dataset.source_system || 'N/A'}
                  </td>
                  <td className="px-4 py-3">
                    {dataset.certified_flag ? (
                      <span className="inline-flex items-center gap-1 bg-[#ECFDF3] text-[#065F46] text-[10px] font-medium px-2 py-1 rounded" style={{ fontFamily: 'Inter, sans-serif' }}>
                        <div className="w-3 h-3">
                          <MedallionIcon />
                        </div>
                        Certified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[#6B7280] text-[10px] font-medium px-2 py-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                        <AlertCircle className="w-3 h-3" />
                        Not Certified
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {dataset.refresh_frequency}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {formatRelativeTime(dataset.last_refresh_ts)}
                      </span>
                      <ChevronRight className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 3: QUICK ACTIONS */}
      <div className="bg-[#EFF6FF] rounded-[12px] border border-[#BFDBFE] p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
              Explore dataset insights
            </h3>
            <p className="text-[12px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
              Datasets power insights across Report Hub.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/conversational')}
              className="px-5 py-2.5 bg-[#111827] hover:bg-[#0F172A] text-white rounded-lg text-[13px] font-medium transition-colors"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Ask Questions with Conversational Analytics
            </button>
            <button
              onClick={() => navigate('/governance')}
              className="px-5 py-2.5 bg-white hover:bg-gray-50 text-[#111827] border border-[#E5E7EB] rounded-lg text-[13px] font-medium transition-colors"
              style={{ fontFamily: 'Inter, sans-serif' }}
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
        <div className="bg-white rounded-[12px] border border-[#E5E7EB] p-8 shadow-sm text-center">
          <h2 className="text-[18px] font-semibold text-[#111827] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
            Dataset not found
          </h2>
          <p className="text-[13px] text-[#6B7280] mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
            The dataset you're looking for doesn't exist or has been removed.
          </p>
          <button
            onClick={() => navigate('/datasets')}
            className="px-4 py-2 bg-[#111827] hover:bg-[#0F172A] text-white rounded-lg text-[13px] font-medium"
            style={{ fontFamily: 'Inter, sans-serif' }}
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
        <div className="flex items-center gap-2 text-[12px]" style={{ fontFamily: 'Inter, sans-serif' }}>
          <button 
            onClick={() => navigate('/datasets')}
            className="text-[#60A5FA] hover:text-[#3B82F6] hover:underline"
          >
            Datasets
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-[#6B7280]">{dataset.dataset_name}</span>
        </div>
        
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-[28px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                {dataset.dataset_name}
              </h1>
              {platformButton && (
                <button
                  onClick={() => window.open(platformButton.url, '_blank')}
                  className="px-3 py-1.5 bg-white hover:bg-gray-50 border border-[#E5E7EB] text-[#111827] rounded-lg text-[12px] font-medium transition-colors flex items-center gap-2"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                  title={platformButton.label}
                >
                  {platformButton.label}
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <p className="text-[13px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
              Dataset overview, freshness, and usage.
            </p>
          </div>
        </div>
      </div>

      {/* Not Certified Warning Banner */}
      {!dataset.certified_flag && (
        <div className="bg-[#FFFBEB] rounded-[12px] border border-[#FCD34D] p-4">
          <p className="text-[13px] text-[#92400E] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
            ⚠️ This dataset is not certified for critical decision-making.
          </p>
        </div>
      )}

      {/* SECTION 1: DATASET METADATA */}
      <div className="bg-white rounded-[12px] border border-[#E5E7EB] p-6 shadow-sm">
        <h2 className="text-[16px] font-semibold text-[#111827] mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
          Dataset Metadata
        </h2>
        
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
              Domain
            </label>
            <p className="text-[14px] text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
              {dataset.domain}
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
              Certification Status
            </label>
            {dataset.certified_flag ? (
              <span className="inline-flex items-center gap-1.5 bg-[#ECFDF3] text-[#065F46] text-[11px] font-medium px-3 py-1 rounded" style={{ fontFamily: 'Inter, sans-serif' }}>
                <div className="w-3.5 h-3.5">
                  <MedallionIcon />
                </div>
                Certified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 bg-gray-100 text-[#6B7280] text-[11px] font-medium px-3 py-1 rounded" style={{ fontFamily: 'Inter, sans-serif' }}>
                <AlertCircle className="w-3.5 h-3.5" />
                Not Certified
              </span>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
              Refresh Frequency
            </label>
            <p className="text-[14px] text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
              {dataset.refresh_frequency}
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
              Last Refreshed
            </label>
            <p className="text-[14px] text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
              {formatRelativeTime(dataset.last_refresh_ts)}
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 2: METRICS POWERED BY THIS DATASET */}
      <div className="bg-white rounded-[12px] border border-[#E5E7EB] p-6 shadow-sm">
        <h2 className="text-[16px] font-semibold text-[#111827] mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
          Key Metrics Powered
        </h2>

        <div className="space-y-3">
          {metrics.map((metric) => (
            <div 
              key={metric.metric_id} 
              className="flex items-start justify-between p-3 bg-[#F8F9FB] rounded-lg border border-[#E5E7EB] hover:border-[#6B7280] transition-colors"
            >
              <div>
                <h3 className="text-[13px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {metric.metric_name}
                </h3>
                <p className="text-[12px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {metric.definition}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 3: SAMPLE DATA PREVIEW */}
      <div className="bg-white rounded-[12px] border border-[#E5E7EB] p-6 shadow-sm">
        <h2 className="text-[16px] font-semibold text-[#111827] mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
          Sample Data Preview
        </h2>

        <div className="mb-2">
          <p className="text-[12px] text-[#6B7280] mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
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
                tick={{ fill: '#6B7280', fontSize: 11, fontFamily: 'Inter, sans-serif' }}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#6B7280', fontSize: 11, fontFamily: 'Inter, sans-serif' }}
                domain={[0, 100]}
              />
              <Bar 
                dataKey="takeRate"
                fill="#60A5FA"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-[#F8F9FB] rounded-lg p-3 border border-[#E5E7EB]">
          <p className="text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
            Preview rendered via Report Hub (lightweight)
          </p>
        </div>

        <div className="mt-4 pt-4 border-t border-[#E5E7EB]">
          <p className="text-[10px] text-[#6B7280] text-center" style={{ fontFamily: 'Inter, sans-serif' }}>
            Powered by Report Hub dummy data (connected model)
          </p>
        </div>
      </div>

      {/* SECTION 4: REPORTS USING THIS DATASET */}
      <div className="bg-white rounded-[12px] border border-[#E5E7EB] p-6 shadow-sm">
        <h2 className="text-[16px] font-semibold text-[#111827] mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
          Used By Reports
        </h2>

        {relatedReports.length > 0 ? (
          <div className="border border-[#E5E7EB] rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-[#E5E7EB]">
                <tr>
                  <th className="text-left px-4 py-3 text-[12px] font-semibold text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Report Name
                  </th>
                  <th className="text-left px-4 py-3 text-[12px] font-semibold text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Type
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {relatedReports.map((report) => (
                  <tr 
                    key={report.report_id}
                    onClick={() => navigate(`/reports/${report.report_id}`)}
                    className="hover:bg-gray-50 transition-colors cursor-pointer group"
                  >
                    <td className="px-4 py-3 text-[13px] text-[#111827] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {report.report_name}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-between">
                        {report.enterprise_flag ? (
                          <span className="bg-[#FFFBEB] text-[#92400E] text-[10px] font-medium px-2 py-1 rounded" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Enterprise
                          </span>
                        ) : (
                          <span className="bg-blue-50 text-blue-700 text-[10px] font-medium px-2 py-1 rounded" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Standard
                          </span>
                        )}
                        <ChevronRight className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-[#F8F9FB] rounded-lg p-6 border border-[#E5E7EB] text-center">
            <p className="text-[13px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
              No reports currently use this dataset.
            </p>
          </div>
        )}
      </div>

      {/* SECTION 5: ACTIONS & ROUTING */}
      <div className="bg-[#EFF6FF] rounded-[12px] border border-[#BFDBFE] p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[12px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
            Report Hub manages where insights live — not where users work.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/datasets')}
            className="text-[13px] text-[#60A5FA] hover:text-[#3B82F6] hover:underline font-medium"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            ← Back to Datasets
          </button>

          <div className="flex gap-3">
            <button
              onClick={() => navigate('/conversational')}
              className="px-5 py-2.5 bg-[#111827] hover:bg-[#0F172A] text-white rounded-lg text-[13px] font-medium"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Ask a question using this dataset
            </button>
            <button
              onClick={() => navigate('/governance')}
              className="px-4 py-2.5 bg-white hover:bg-gray-50 text-[#111827] border border-[#E5E7EB] rounded-lg text-[13px] font-medium"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              View Governance Details
            </button>
            {hasEnterpriseReports && (
              <button
                onClick={() => navigate('/enterprise-bi')}
                className="px-4 py-2.5 bg-white hover:bg-gray-50 text-[#111827] border border-[#E5E7EB] rounded-lg text-[13px] font-medium"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                View related Enterprise BI
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-[#BFDBFE]">
          <button
            onClick={() => navigate('/talk/migration')}
            className="text-[12px] text-[#60A5FA] hover:text-[#3B82F6] hover:underline"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            Request Migration →
          </button>
        </div>
      </div>
    </Layout>
  );
}