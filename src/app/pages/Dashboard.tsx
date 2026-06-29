import React from 'react';
import { Layout } from '../components/ui/Layout';
import { useNavigate } from 'react-router';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import { FileText, Layers, Database, TrendingUp } from 'lucide-react';
import MedallionIcon from '../../imports/Group5';
import { PageHeader, MetricGrid, SectionCard, DataTable, StatusBadge } from '../components/shared';
import type { Column } from '../components/shared';
import {
  getReportsCount,
  getDatasetsCount,
  getLatestRefreshTime,
  getLast90DaysRevenue,
  getCurrentMonthMetrics,
  getTopTerritories,
  getBottomTerritories,
  getRecentReports,
  getFeaturedDatasets,
  formatRelativeTime,
} from '@/lib/dataModel';

interface KpiTile {
  count: number;
  label: string;
  icon: React.ReactNode;
  to: string;
  highlight?: boolean;
  badge?: React.ReactNode;
}

interface RecentReport {
  report_id: string;
  report_name: string;
  domain: string;
  last_updated_ts: number | string;
}

export function DashboardPage() {
  const navigate = useNavigate();

  const reportsCount = getReportsCount(false);
  const enterpriseReportsCount = getReportsCount(true);
  const datasetsCount = getDatasetsCount(false);
  const certifiedDatasetsCount = getDatasetsCount(true);
  const latestRefresh = getLatestRefreshTime();

  const last90DaysData = getLast90DaysRevenue();
  const currentMonthMetrics = getCurrentMonthMetrics();
  const topTerritories = getTopTerritories(5);
  const bottomTerritories = getBottomTerritories(5);
  const recentReports = getRecentReports(5);
  const featuredDatasets = getFeaturedDatasets(6);

  const performanceData = [
    { metric: 'Take Rate', value: currentMonthMetrics.takeRate },
    { metric: 'RIS', value: currentMonthMetrics.ris },
    { metric: 'Return Rate', value: currentMonthMetrics.returnRate },
    { metric: 'AARD', value: currentMonthMetrics.aard },
  ];

  const sampledRevenueData = last90DaysData.filter((_, idx) => idx % 10 === 0);

  const kpiTiles: KpiTile[] = [
    { count: reportsCount, label: 'Reports Available', icon: <FileText />, to: '/reports' },
    { count: enterpriseReportsCount, label: 'Enterprise BI Reports', icon: <Layers />, to: '/enterprise-bi', highlight: true },
    { count: datasetsCount, label: 'Datasets Available', icon: <Database />, to: '/datasets' },
    { count: certifiedDatasetsCount, label: 'Gold Datasets', icon: <span className="w-6 h-6 inline-block"><MedallionIcon /></span>, to: '/datasets' },
  ];

  const reportColumns: Column<RecentReport>[] = [
    { header: 'Report Name', cell: (r) => <span className="font-medium text-foreground">{r.report_name}</span> },
    { header: 'Domain', cell: (r) => <span className="text-muted-foreground">{r.domain}</span> },
    { header: 'Last Updated', align: 'right', cell: (r) => <span className="text-muted-foreground">{formatRelativeTime(r.last_updated_ts)}</span> },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          title="Dashboard"
          description="A unified view of your accessible insights, reports, and data."
          actions={
            <div className="flex flex-col items-end gap-1">
              <StatusBadge tone="brand" dot>Data-Driven Demo</StatusBadge>
              <span className="text-[11px] text-muted-foreground">Last refresh: {formatRelativeTime(latestRefresh)}</span>
            </div>
          }
        />

        {/* KPI summary tiles */}
        <MetricGrid columns={4}>
          {kpiTiles.map((tile) => (
            <button
              key={tile.label}
              onClick={() => navigate(tile.to)}
              className={`group text-left bg-card border border-border rounded-[12px] p-5 shadow-sm hover:border-brand/40 hover:shadow-md transition-all duration-200 ${tile.highlight ? 'bg-brand-subtle' : ''}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-muted-foreground group-hover:text-brand transition-colors [&_svg]:size-4">{tile.icon}</span>
              </div>
              <div className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">{tile.count}</div>
              <div className="text-sm font-medium text-foreground mt-0.5 group-hover:text-brand transition-colors">{tile.label}</div>
            </button>
          ))}
        </MetricGrid>

        {/* Key signals */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SectionCard title="SU&G Revenue Trend (90 days)" description="High-level revenue signal across territories">
            <div className="h-[160px]">
              <ResponsiveContainer width="100%" height="100%" minHeight={160}>
                <LineChart data={sampledRevenueData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`} />
                  <Line type="monotone" dataKey="revenue" stroke="var(--brand)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
              <TrendingUp className="size-4 text-brand" />
              <p className="text-sm font-medium text-foreground">Run Rate (MTD): ${(currentMonthMetrics.runRate / 1000000).toFixed(2)}M</p>
            </div>
          </SectionCard>

          <SectionCard title="Performance Snapshot" description="Key indicators across all territories (current month)">
            <div className="space-y-3.5">
              {performanceData.map((item) => (
                <div key={item.metric}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-foreground">{item.metric}</span>
                    <span className="text-sm font-semibold text-foreground tabular-nums">{item.value.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div className="bg-brand h-1.5 rounded-full transition-all" style={{ width: `${Math.min(item.value, 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        {/* Territory performance */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[
            { title: 'Top Territories (Take Rate)', rows: topTerritories, stroke: 'var(--success)' },
            { title: 'Bottom Territories (Take Rate)', rows: bottomTerritories, stroke: 'var(--destructive)' },
          ].map((block) => (
            <SectionCard key={block.title} title={block.title}>
              <div className="space-y-3">
                {block.rows.map((t: any) => (
                  <div key={t.territory_id} className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-foreground">{t.territory_name}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">{t.take_rate_pct.toFixed(1)}%</div>
                    </div>
                    <div className="w-[80px] h-[24px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={t.sparkline}>
                          <Line type="monotone" dataKey="value" stroke={block.stroke} strokeWidth={1.5} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          ))}
        </div>

        {/* Your reports */}
        <SectionCard title="Your Reports" flush>
          <DataTable
            columns={reportColumns}
            rows={recentReports as RecentReport[]}
            rowKey={(r) => r.report_id}
            onRowClick={(r) => navigate(`/reports/${r.report_id}`)}
          />
        </SectionCard>

        {/* Your datasets */}
        <div>
          <h2 className="text-base font-semibold text-foreground mb-3">Your Datasets</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {featuredDatasets.map((dataset: any) => (
              <button
                key={dataset.dataset_id}
                onClick={() => navigate(`/datasets/${dataset.dataset_id}`)}
                className="group text-left bg-card border border-border rounded-[12px] p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-brand/40 transition-all duration-200"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="text-sm font-semibold text-foreground line-clamp-2 flex-1 group-hover:text-brand transition-colors">{dataset.dataset_name}</div>
                  {dataset.certified_flag && <div className="ml-2 w-5 h-5 flex-shrink-0"><MedallionIcon /></div>}
                </div>
                <div className="text-sm text-muted-foreground mb-2">{dataset.domain}</div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Refreshed {formatRelativeTime(dataset.last_refresh_ts)}</span>
                  <StatusBadge tone="neutral">{dataset.refresh_frequency}</StatusBadge>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
