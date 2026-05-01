import React from 'react';
import { Layout } from '../components/ui/Layout';
import { useNavigate } from 'react-router';
import { getAllDatasets, catalogReports } from '@/lib/dataModel';
import { ExternalLink, Database, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import MedallionIcon from '@/imports/Group5';

export function EnterpriseBIPage() {
  const navigate = useNavigate();
  const allDatasets = getAllDatasets();
  const allReports = catalogReports;

  // Calculate platform statistics
  const platforms = [
    {
      name: 'Looker Studio Pro',
      icon: '📊',
      datasets: allDatasets.filter(d => d.source_system === 'BigQuery').length || 9,
      reports: allReports.filter(r => r.source_application === 'Looker Studio Pro').length || 5,
      certified: true,
      status: 'Connected',
      color: 'purple',
      url: '#',
    },
    {
      name: 'Looker',
      icon: '📊',
      datasets: allDatasets.filter(d => d.source_system === 'BigQuery').length || 12,
      reports: allReports.filter(r => r.source_application === 'Looker').length || 8,
      certified: true,
      status: 'Connected',
      color: 'purple',
      url: '#',
    },
    {
      name: 'Qlik',
      icon: '💼',
      datasets: allDatasets.filter(d => d.source_system === 'Hadoop').length || 15,
      reports: allReports.filter(r => r.source_application === 'Qlik').length || 11,
      certified: true,
      status: 'Connected',
      color: 'green',
      url: '#',
    },
    {
      name: 'Tableau',
      icon: '📈',
      datasets: allDatasets.filter(d => d.source_system === 'Teradata').length || 10,
      reports: allReports.filter(r => r.source_application === 'Tableau').length || 6,
      certified: false,
      status: 'Connected',
      color: 'blue',
      url: '#',
    },
  ];

  const totalDatasets = platforms.reduce((sum, p) => sum + p.datasets, 0);
  const totalReports = platforms.reduce((sum, p) => sum + p.reports, 0);

  return (
    <Layout>
      {/* Page Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="space-y-1">
          <h1 className="text-[28px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
            Enterprise Platforms
          </h1>
          <p className="text-[13px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
            View and access connected enterprise BI platforms and their datasets.
          </p>
        </div>
        <div className="text-[11px] text-[#6B7280] bg-blue-50 px-3 py-1.5 rounded-md" style={{ fontFamily: 'Inter, sans-serif' }}>
          {platforms.length} Platforms Connected
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-[12px] border border-[#E5E7EB] p-6 shadow-sm">
          <div className="text-[32px] font-bold text-[#111827] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
            {platforms.length}
          </div>
          <div className="text-[14px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
            Connected Platforms
          </div>
          <div className="text-[12px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
            Enterprise BI systems
          </div>
        </div>

        <div className="bg-white rounded-[12px] border border-[#E5E7EB] p-6 shadow-sm">
          <div className="text-[32px] font-bold text-[#111827] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
            {totalDatasets}
          </div>
          <div className="text-[14px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
            Total Datasets
          </div>
          <div className="text-[12px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
            Across all platforms
          </div>
        </div>

        <div className="bg-white rounded-[12px] border border-[#E5E7EB] p-6 shadow-sm">
          <div className="text-[32px] font-bold text-[#111827] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
            {totalReports}
          </div>
          <div className="text-[14px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
            Total Reports
          </div>
          <div className="text-[12px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
            Across reporting platforms
          </div>
        </div>
      </div>

      {/* Platform Cards Grid */}
      <div className="grid grid-cols-3 gap-6">
        {platforms.map((platform) => (
          <div
            key={platform.name}
            className="bg-white rounded-[12px] border border-[#E5E7EB] p-6 shadow-sm hover:shadow-md transition-all hover:border-[#6B7280]"
          >
            {/* Tableau Decommission Banner */}
            {platform.name === 'Tableau' && (
              <div className="mb-4 bg-[#FFFBEB] border border-[#FDE68A] rounded-lg p-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-[#D97706] flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-[#92400E] leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Tableau is set to be decommissioned by Q4 2026. No new reports can be created on legacy platforms past 12/31/2026.
                </p>
              </div>
            )}

            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="text-[32px]">{platform.icon}</div>
                <div>
                  <h3 className="text-[16px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {platform.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-[#6B7280] bg-gray-100 px-2 py-0.5 rounded" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {platform.status}
                    </span>
                    {platform.certified && (
                      <span className="inline-flex items-center gap-1 bg-[#ECFDF3] text-[#065F46] text-[10px] font-medium px-2 py-0.5 rounded" style={{ fontFamily: 'Inter, sans-serif' }}>
                        <div className="w-2.5 h-2.5">
                          <MedallionIcon />
                        </div>
                        Certified
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Metrics */}
            <div className="space-y-3 mb-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[12px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                  <Database className="w-4 h-4" />
                  Datasets
                </div>
                <span className="text-[18px] font-bold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {platform.datasets}
                </span>
              </div>

              {platform.reports > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[12px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                    <FileText className="w-4 h-4" />
                    Reports
                  </div>
                  <span className="text-[18px] font-bold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {platform.reports}
                  </span>
                </div>
              )}
            </div>

            {/* Metadata */}
            <div className="mb-4 pb-4 border-b border-[#E5E7EB]">
              <p className="text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                Connected via Report Hub
              </p>
              <p className="text-[10px] text-green-600 font-medium mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                ✓ Up to date
              </p>
            </div>

            {/* Primary Action */}
            <button
              className="w-full px-4 py-2.5 bg-[#111827] hover:bg-[#0F172A] text-white rounded-lg text-[13px] font-medium transition-colors flex items-center justify-center gap-2"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Open {platform.name}
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Info Banner */}
      <div className="bg-[#EFF6FF] rounded-[12px] border border-[#BFDBFE] p-6 shadow-sm mt-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
              Platform launchpad
            </h3>
            <p className="text-[12px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
              Use this page to quickly access your connected enterprise BI platforms. All analytics and insights are available through Report Hub conversational flows.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/datasets')}
              className="px-5 py-2.5 bg-white hover:bg-gray-50 text-[#111827] border border-[#E5E7EB] rounded-lg text-[13px] font-medium transition-colors"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              View All Datasets
            </button>
            <button
              onClick={() => navigate('/conversational')}
              className="px-5 py-2.5 bg-[#111827] hover:bg-[#0F172A] text-white rounded-lg text-[13px] font-medium transition-colors"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Ask Questions
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}