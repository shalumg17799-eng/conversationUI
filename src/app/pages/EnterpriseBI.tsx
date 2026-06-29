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
          <h1 className="text-[28px] font-semibold text-foreground" style={{ fontFamily: 'var(--font-body)' }}>
            Enterprise Platforms
          </h1>
          <p className="text-[13px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
            View and access connected enterprise BI platforms and their datasets.
          </p>
        </div>
        <div className="text-[11px] text-muted-foreground bg-brand-subtle px-3 py-1.5 rounded-md" style={{ fontFamily: 'var(--font-body)' }}>
          {platforms.length} Platforms Connected
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-6 mb-6">
        <div className="bg-card rounded-[12px] border border-border p-6 shadow-sm">
          <div className="text-[32px] font-bold text-foreground mb-2" style={{ fontFamily: 'var(--font-body)' }}>
            {platforms.length}
          </div>
          <div className="text-[14px] font-semibold text-foreground mb-1" style={{ fontFamily: 'var(--font-body)' }}>
            Connected Platforms
          </div>
          <div className="text-[12px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
            Enterprise BI systems
          </div>
        </div>

        <div className="bg-card rounded-[12px] border border-border p-6 shadow-sm">
          <div className="text-[32px] font-bold text-foreground mb-2" style={{ fontFamily: 'var(--font-body)' }}>
            {totalDatasets}
          </div>
          <div className="text-[14px] font-semibold text-foreground mb-1" style={{ fontFamily: 'var(--font-body)' }}>
            Total Datasets
          </div>
          <div className="text-[12px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
            Across all platforms
          </div>
        </div>

        <div className="bg-card rounded-[12px] border border-border p-6 shadow-sm">
          <div className="text-[32px] font-bold text-foreground mb-2" style={{ fontFamily: 'var(--font-body)' }}>
            {totalReports}
          </div>
          <div className="text-[14px] font-semibold text-foreground mb-1" style={{ fontFamily: 'var(--font-body)' }}>
            Total Reports
          </div>
          <div className="text-[12px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
            Across reporting platforms
          </div>
        </div>
      </div>

      {/* Platform Cards Grid */}
      <div className="grid grid-cols-3 gap-6">
        {platforms.map((platform) => (
          <div
            key={platform.name}
            className="bg-card rounded-[12px] border border-border p-6 shadow-sm hover:shadow-md transition-all hover:border-brand/40"
          >
            {/* Tableau Decommission Banner */}
            {platform.name === 'Tableau' && (
              <div className="mb-4 bg-[#FFFBEB] border border-[#FDE68A] rounded-lg p-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-[#D97706] flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-[#92400E] leading-relaxed" style={{ fontFamily: 'var(--font-body)' }}>
                  Tableau is set to be decommissioned by Q4 2026. No new reports can be created on legacy platforms past 12/31/2026.
                </p>
              </div>
            )}

            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="text-[32px]">{platform.icon}</div>
                <div>
                  <h3 className="text-[16px] font-semibold text-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                    {platform.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded" style={{ fontFamily: 'var(--font-body)' }}>
                      {platform.status}
                    </span>
                    {platform.certified && (
                      <span className="inline-flex items-center gap-1 bg-[#ECFDF3] text-[#065F46] text-[10px] font-medium px-2 py-0.5 rounded" style={{ fontFamily: 'var(--font-body)' }}>
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
                <div className="flex items-center gap-2 text-[12px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                  <Database className="w-4 h-4" />
                  Datasets
                </div>
                <span className="text-[18px] font-bold text-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                  {platform.datasets}
                </span>
              </div>

              {platform.reports > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[12px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                    <FileText className="w-4 h-4" />
                    Reports
                  </div>
                  <span className="text-[18px] font-bold text-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                    {platform.reports}
                  </span>
                </div>
              )}
            </div>

            {/* Metadata */}
            <div className="mb-4 pb-4 border-b border-border">
              <p className="text-[11px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                Connected via Report Hub
              </p>
              <p className="text-[10px] text-green-600 font-medium mt-1" style={{ fontFamily: 'var(--font-body)' }}>
                ✓ Up to date
              </p>
            </div>

            {/* Primary Action */}
            <button
              className="w-full px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-[13px] font-medium transition-colors flex items-center justify-center gap-2"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              Open {platform.name}
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Info Banner */}
      <div className="bg-brand-subtle rounded-[12px] border border-brand/20 p-6 shadow-sm mt-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-semibold text-foreground mb-1" style={{ fontFamily: 'var(--font-body)' }}>
              Platform launchpad
            </h3>
            <p className="text-[12px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
              Use this page to quickly access your connected enterprise BI platforms. All analytics and insights are available through Report Hub conversational flows.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/datasets')}
              className="px-5 py-2.5 bg-white hover:bg-muted text-foreground border border-border rounded-lg text-[13px] font-medium transition-colors"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              View All Datasets
            </button>
            <button
              onClick={() => navigate('/conversational')}
              className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-[13px] font-medium transition-colors"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              Ask Questions
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}