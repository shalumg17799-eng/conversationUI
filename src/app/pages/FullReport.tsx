import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { getReportById, catalogDatasets, formatRelativeTime } from '@/lib/dataModel';
import {
  TrendingUp, TrendingDown, Minus, ArrowLeft, Download, Home,
  Calendar, Users, DollarSign, Activity, Star,
} from 'lucide-react';

// ============================================================
//  DUMMY DATA
// ============================================================

const MONTHLY_TREND = [
  { month: 'Jan', thisYear: 2400, lastYear: 2100, target: 2500 },
  { month: 'Feb', thisYear: 2800, lastYear: 2300, target: 2600 },
  { month: 'Mar', thisYear: 3200, lastYear: 2700, target: 2900 },
  { month: 'Apr', thisYear: 2900, lastYear: 2500, target: 3000 },
  { month: 'May', thisYear: 3500, lastYear: 2800, target: 3200 },
  { month: 'Jun', thisYear: 3800, lastYear: 3100, target: 3400 },
  { month: 'Jul', thisYear: 3600, lastYear: 3200, target: 3500 },
  { month: 'Aug', thisYear: 4100, lastYear: 3300, target: 3700 },
  { month: 'Sep', thisYear: 4300, lastYear: 3500, target: 3900 },
  { month: 'Oct', thisYear: 3900, lastYear: 3400, target: 4000 },
  { month: 'Nov', thisYear: 4500, lastYear: 3800, target: 4200 },
  { month: 'Dec', thisYear: 5200, lastYear: 4200, target: 4500 },
];

const SEGMENT_PIE = [
  { name: 'Enterprise', value: 38, color: '#3B82F6' },
  { name: 'Mid-Market', value: 27, color: '#10B981' },
  { name: 'SMB', value: 19, color: '#F59E0B' },
  { name: 'Partners', value: 11, color: '#8B5CF6' },
  { name: 'Other', value: 5, color: '#94A3B8' },
];

const QUARTERLY_YOY = [
  { quarter: 'Q1', thisYear: 8400, lastYear: 7100 },
  { quarter: 'Q2', thisYear: 10200, lastYear: 8300 },
  { quarter: 'Q3', thisYear: 12000, lastYear: 10000 },
  { quarter: 'Q4', thisYear: 13600, lastYear: 11400 },
];

const REGION_DATA = [
  { region: 'North America', pct: 42 },
  { region: 'Europe', pct: 28 },
  { region: 'Asia Pacific', pct: 16 },
  { region: 'Latin America', pct: 8 },
  { region: 'Middle East', pct: 4 },
  { region: 'Africa', pct: 2 },
];

const ENGAGEMENT_TREND = [
  { month: 'Jul', activeUsers: 38200, sessions: 156000, conversions: 2100 },
  { month: 'Aug', activeUsers: 41000, sessions: 168000, conversions: 2400 },
  { month: 'Sep', activeUsers: 43500, sessions: 180000, conversions: 2700 },
  { month: 'Oct', activeUsers: 39800, sessions: 165000, conversions: 2300 },
  { month: 'Nov', activeUsers: 44200, sessions: 185000, conversions: 2900 },
  { month: 'Dec', activeUsers: 48300, sessions: 201000, conversions: 3200 },
];

const TOP_PERFORMERS = [
  { rank: 1,  name: 'Acme Corporation',   region: 'North America', revenue: '$1,842K', growth: '+24.3%', customers: 2340, share: '14.9%', trend: 'up' },
  { rank: 2,  name: 'Global Tech Inc',    region: 'Europe',        revenue: '$1,421K', growth: '+18.7%', customers: 1890, share: '11.5%', trend: 'up' },
  { rank: 3,  name: 'Pacific Retail Co',  region: 'Asia Pacific',  revenue: '$1,205K', growth: '+31.2%', customers: 1650, share: '9.7%',  trend: 'up' },
  { rank: 4,  name: 'Metro Services Ltd', region: 'North America', revenue: '$984K',   growth: '+11.4%', customers: 1420, share: '7.9%',  trend: 'up' },
  { rank: 5,  name: 'Atlas Financial',    region: 'Europe',        revenue: '$876K',   growth: '-2.1%',  customers: 1180, share: '7.1%',  trend: 'down' },
  { rank: 6,  name: 'Nexus Solutions',    region: 'North America', revenue: '$743K',   growth: '+8.9%',  customers: 980,  share: '6.0%',  trend: 'up' },
  { rank: 7,  name: 'Crescent Group',     region: 'Middle East',   revenue: '$621K',   growth: '+42.1%', customers: 840,  share: '5.0%',  trend: 'up' },
  { rank: 8,  name: 'Summit Partners',    region: 'Latin America', revenue: '$589K',   growth: '+15.3%', customers: 760,  share: '4.8%',  trend: 'up' },
  { rank: 9,  name: 'Delta Industries',   region: 'Asia Pacific',  revenue: '$512K',   growth: '-7.4%',  customers: 690,  share: '4.1%',  trend: 'down' },
  { rank: 10, name: 'Horizon Ventures',   region: 'North America', revenue: '$487K',   growth: '+5.2%',  customers: 640,  share: '3.9%',  trend: 'up' },
];

const SEGMENT_BREAKDOWN = [
  { segment: 'Enterprise – Tier 1',   q1: '$2,840K', q2: '$3,120K', q3: '$3,580K', q4: '$4,100K', ytd: '$13,640K', change: '+$1,840K', pct: '+15.6%', status: 'on-track' },
  { segment: 'Enterprise – Tier 2',   q1: '$1,620K', q2: '$1,790K', q3: '$2,100K', q4: '$2,380K', ytd: '$7,890K',  change: '+$920K',   pct: '+13.2%', status: 'on-track' },
  { segment: 'Mid-Market – Growth',   q1: '$980K',   q2: '$1,140K', q3: '$1,380K', q4: '$1,620K', ytd: '$5,120K',  change: '+$680K',   pct: '+15.3%', status: 'on-track' },
  { segment: 'Mid-Market – Core',     q1: '$840K',   q2: '$920K',   q3: '$1,050K', q4: '$1,180K', ytd: '$3,990K',  change: '+$310K',   pct: '+8.4%',  status: 'on-track' },
  { segment: 'SMB – Digital',         q1: '$420K',   q2: '$510K',   q3: '$630K',   q4: '$720K',   ytd: '$2,280K',  change: '+$390K',   pct: '+20.6%', status: 'on-track' },
  { segment: 'SMB – Traditional',     q1: '$380K',   q2: '$340K',   q3: '$310K',   q4: '$290K',   ytd: '$1,320K',  change: '-$210K',   pct: '-13.7%', status: 'at-risk' },
  { segment: 'Partners – Strategic',  q1: '$310K',   q2: '$380K',   q3: '$450K',   q4: '$520K',   ytd: '$1,660K',  change: '+$240K',   pct: '+16.9%', status: 'on-track' },
  { segment: 'Partners – Regional',   q1: '$180K',   q2: '$210K',   q3: '$240K',   q4: '$280K',   ytd: '$910K',    change: '+$80K',    pct: '+9.6%',  status: 'on-track' },
  { segment: 'Self-Serve',            q1: '$290K',   q2: '$340K',   q3: '$420K',   q4: '$510K',   ytd: '$1,560K',  change: '+$460K',   pct: '+41.8%', status: 'on-track' },
  { segment: 'OEM / Embedded',        q1: '$160K',   q2: '$190K',   q3: '$220K',   q4: '$250K',   ytd: '$820K',    change: '+$120K',   pct: '+17.1%', status: 'on-track' },
  { segment: 'Government',            q1: '$480K',   q2: '$390K',   q3: '$510K',   q4: '$580K',   ytd: '$1,960K',  change: '+$140K',   pct: '+7.7%',  status: 'on-track' },
  { segment: 'Non-Profit',            q1: '$80K',    q2: '$70K',    q3: '$60K',    q4: '$50K',    ytd: '$260K',    change: '-$90K',    pct: '-25.7%', status: 'at-risk' },
];

// ============================================================
//  SUB-COMPONENTS
// ============================================================

function KpiCard({
  label,
  value,
  delta,
  subtext,
  trend,
  icon,
}: {
  label: string;
  value: string;
  delta: string;
  subtext: string;
  trend: 'up' | 'down' | 'flat';
  icon: React.ReactNode;
}) {
  const deltaColor =
    trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-500' : 'text-muted-foreground';
  const deltaBg =
    trend === 'up' ? 'bg-emerald-50' : trend === 'down' ? 'bg-red-50' : 'bg-muted';
  const TrendIcon =
    trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-sm flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide" style={{ fontFamily: 'var(--font-body)' }}>
          {label}
        </span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div className="text-[30px] font-bold text-foreground leading-none" style={{ fontFamily: 'var(--font-body)' }}>
        {value}
      </div>
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${deltaBg} ${deltaColor}`} style={{ fontFamily: 'var(--font-body)' }}>
          <TrendIcon className="w-3 h-3" />
          {delta}
        </span>
        <span className="text-[11px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>{subtext}</span>
      </div>
    </div>
  );
}

const customTooltipStyle = {
  backgroundColor: '#fff',
  border: '1px solid #E5E7EB',
  borderRadius: '8px',
  fontSize: '12px',
  fontFamily: 'var(--font-body)',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
};

// ============================================================
//  MAIN PAGE
// ============================================================

export function FullReportPage() {
  const { reportId } = useParams();
  const navigate = useNavigate();
  const report = getReportById(reportId!);
  const sourceDataset = report
    ? catalogDatasets.find(d => d.dataset_id === report.source_dataset_id)
    : null;

  const [activeTab, setActiveTab] = useState<'overview' | 'trends' | 'segments' | 'entities'>('overview');

  if (!report) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center p-8">
        <div className="bg-card rounded-xl border border-border p-10 shadow-sm text-center max-w-md">
          <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <Activity className="w-6 h-6 text-muted-foreground" />
          </div>
          <h2 className="text-[18px] font-semibold text-foreground mb-2" style={{ fontFamily: 'var(--font-body)' }}>
            Report not found
          </h2>
          <p className="text-[13px] text-muted-foreground mb-5" style={{ fontFamily: 'var(--font-body)' }}>
            This report may have been removed or the link is invalid.
          </p>
          <button
            onClick={() => window.close()}
            className="px-5 py-2.5 bg-foreground hover:bg-foreground text-white rounded-lg text-[13px] font-medium"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            Close Tab
          </button>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'trends', label: 'Trends' },
    { id: 'segments', label: 'Segments' },
    { id: 'entities', label: 'Entities' },
  ] as const;

  const platformColors: Record<string, { bg: string; text: string }> = {
    Tableau: { bg: '#DBEAFE', text: '#1E40AF' },
    Looker:  { bg: '#E0E7FF', text: '#3730A3' },
    Qlik:    { bg: '#DCFCE7', text: '#166534' },
  };
  const platform = report.source_application ?? '';
  const pc = platformColors[platform] ?? { bg: '#F3F4F6', text: '#374151' };

  return (
    <div className="min-h-screen bg-muted">

      {/* ── HEADER ─────────────────────────────────────────── */}
      <div className="bg-white border-b border-border px-8 py-4 sticky top-0 z-20">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between">

          {/* Left: nav + title */}
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={() => window.history.length > 1 ? navigate(`/reports/${reportId}`) : navigate('/reports')}
              className="p-2 hover:bg-muted rounded-lg transition-colors flex-shrink-0"
              title="Back"
            >
              <ArrowLeft className="w-4 h-4 text-muted-foreground" />
            </button>

            <div className="min-w-0">
              {/* Breadcrumb */}
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground mb-0.5" style={{ fontFamily: 'var(--font-body)' }}>
                <span>Reports</span>
                <span>/</span>
                <span className="truncate max-w-[180px]">{report.report_name}</span>
                <span>/</span>
                <span className="text-foreground font-medium">Full Report</span>
              </div>
              <h1 className="text-[19px] font-bold text-foreground truncate" style={{ fontFamily: 'var(--font-body)' }}>
                {report.report_name}
              </h1>
            </div>
          </div>

          {/* Right: meta + actions */}
          <div className="flex items-center gap-4 flex-shrink-0">
            {/* Meta pills */}
            <div className="hidden lg:flex items-center gap-2 text-[11px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
              <span
                className="px-2 py-1 rounded font-semibold text-[10px]"
                style={{ backgroundColor: pc.bg, color: pc.text }}
              >
                {platform || 'Internal'}
              </span>
              <span className="bg-muted text-muted-foreground px-2 py-1 rounded text-[10px] font-medium">
                {report.domain}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Updated {formatRelativeTime(report.last_updated_ts)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate('/reports')}
                className="px-3 py-1.5 bg-muted hover:bg-border text-foreground rounded-lg text-[12px] font-medium transition-colors flex items-center gap-1.5"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                <Home className="w-3.5 h-3.5" />
                Report Hub
              </button>
              <button
                className="px-3 py-1.5 bg-foreground hover:bg-foreground text-white rounded-lg text-[12px] font-medium transition-colors flex items-center gap-1.5"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                <Download className="w-3.5 h-3.5" />
                Export
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* ── TAB BAR ────────────────────────────────────────── */}
      <div className="bg-white border-b border-border px-8">
        <div className="max-w-[1440px] mx-auto flex items-center gap-0">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-[13px] font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-[#111827] text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {tab.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 py-2">
            <span className="text-[11px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
              Period:
            </span>
            {['FY 2024', 'FY 2023', 'Last 12 Mo'].map(p => (
              <button
                key={p}
                className="px-3 py-1 text-[11px] font-medium rounded-full border border-border text-muted-foreground hover:border-gray-400 hover:text-foreground transition-colors"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT ──────────────────────────────────── */}
      <div className="max-w-[1440px] mx-auto px-8 py-6 space-y-6">

        {/* ── KPI STRIP ────────────────────────────────────── */}
        <div className="grid grid-cols-5 gap-4">
          <KpiCard label="Total Revenue"      value="$44.2M"  delta="+8.2%"  subtext="vs last year"  trend="up"   icon={<DollarSign className="w-4 h-4" />} />
          <KpiCard label="Active Customers"   value="48,293"  delta="+12.1%" subtext="vs last year"  trend="up"   icon={<Users className="w-4 h-4" />} />
          <KpiCard label="Churn Rate"         value="3.2%"    delta="-0.8pp" subtext="vs last year"  trend="up"   icon={<Activity className="w-4 h-4" />} />
          <KpiCard label="Avg Deal Size"      value="$256K"   delta="+4.3%"  subtext="vs last year"  trend="up"   icon={<TrendingUp className="w-4 h-4" />} />
          <KpiCard label="NPS Score"          value="72"      delta="-3 pts" subtext="vs last year"  trend="down" icon={<Star className="w-4 h-4" />} />
        </div>

        {/* ── ROW 1: Trend Line + Segment Donut ───────────── */}
        <div className="grid grid-cols-12 gap-4">

          {/* Multi-line trend chart */}
          <div className="col-span-8 bg-card rounded-xl border border-border p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-[14px] font-semibold text-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                  Revenue Trend — FY 2024
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5" style={{ fontFamily: 'var(--font-body)' }}>
                  Monthly performance vs prior year and target (USD thousands)
                </p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={MONTHLY_TREND} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fontFamily: 'var(--font-body)', fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fontFamily: 'var(--font-body)', fill: '#9CA3AF' }} axisLine={false} tickLine={false} tickFormatter={v => `$${v/1000}M`} />
                <Tooltip contentStyle={customTooltipStyle} formatter={(v: number) => [`$${v.toLocaleString()}K`, '']} />
                <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'var(--font-body)' }} />
                <Line type="monotone" dataKey="thisYear" name="This Year"  stroke="#3B82F6" strokeWidth={2.5} dot={{ r: 3, fill: '#3B82F6' }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="lastYear" name="Last Year"  stroke="#94A3B8" strokeWidth={2}   strokeDasharray="4 2" dot={false} />
                <Line type="monotone" dataKey="target"   name="Target"     stroke="#F59E0B" strokeWidth={1.5} strokeDasharray="6 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Segment Pie / Donut */}
          <div className="col-span-4 bg-card rounded-xl border border-border p-6 shadow-sm">
            <div className="mb-4">
              <h3 className="text-[14px] font-semibold text-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                Revenue by Segment
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5" style={{ fontFamily: 'var(--font-body)' }}>
                FY 2024 share breakdown
              </p>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={SEGMENT_PIE}
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={72}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {SEGMENT_PIE.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={customTooltipStyle} formatter={(v: number) => [`${v}%`, 'Share']} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 mt-2">
              {SEGMENT_PIE.map((seg, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: seg.color }} />
                    <span className="text-[11px] text-foreground" style={{ fontFamily: 'var(--font-body)' }}>{seg.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${seg.value}%`, backgroundColor: seg.color }} />
                    </div>
                    <span className="text-[11px] font-semibold text-foreground w-8 text-right" style={{ fontFamily: 'var(--font-body)' }}>{seg.value}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* ── ROW 2: YoY Grouped Bar + Regional Horizontal Bar */}
        <div className="grid grid-cols-12 gap-4">

          {/* YoY Quarterly Grouped Bar */}
          <div className="col-span-6 bg-card rounded-xl border border-border p-6 shadow-sm">
            <div className="mb-5">
              <h3 className="text-[14px] font-semibold text-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                Quarterly Revenue — Year over Year
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5" style={{ fontFamily: 'var(--font-body)' }}>
                FY 2024 vs FY 2023 (USD thousands)
              </p>
            </div>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={QUARTERLY_YOY} barCategoryGap="30%" barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis dataKey="quarter" tick={{ fontSize: 11, fontFamily: 'var(--font-body)', fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fontFamily: 'var(--font-body)', fill: '#9CA3AF' }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}M`} />
                <Tooltip contentStyle={customTooltipStyle} formatter={(v: number) => [`$${v.toLocaleString()}K`, '']} />
                <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'var(--font-body)' }} />
                <Bar dataKey="thisYear" name="FY 2024" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="lastYear" name="FY 2023" fill="#CBD5E1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Regional Horizontal Bar */}
          <div className="col-span-6 bg-card rounded-xl border border-border p-6 shadow-sm">
            <div className="mb-5">
              <h3 className="text-[14px] font-semibold text-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                Revenue by Region
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5" style={{ fontFamily: 'var(--font-body)' }}>
                Share of total FY 2024 revenue
              </p>
            </div>
            <div className="space-y-4 mt-2">
              {REGION_DATA.map((r, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-medium text-foreground" style={{ fontFamily: 'var(--font-body)' }}>{r.region}</span>
                    <span className="text-[12px] font-bold text-foreground" style={{ fontFamily: 'var(--font-body)' }}>{r.pct}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${r.pct}%`,
                        background: i === 0
                          ? 'linear-gradient(90deg, #3B82F6, #60A5FA)'
                          : i === 1
                          ? 'linear-gradient(90deg, #10B981, #34D399)'
                          : i === 2
                          ? 'linear-gradient(90deg, #8B5CF6, #A78BFA)'
                          : '#CBD5E1',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            {/* Summary mini-row */}
            <div className="mt-5 pt-4 border-t border-border grid grid-cols-3 gap-3">
              {[
                { label: 'Regions', value: '6' },
                { label: 'Fastest Growing', value: 'APAC +31%' },
                { label: 'Highest Revenue', value: 'N. America' },
              ].map((s, i) => (
                <div key={i} className="text-center">
                  <div className="text-[13px] font-bold text-foreground" style={{ fontFamily: 'var(--font-body)' }}>{s.value}</div>
                  <div className="text-[10px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* ── ROW 3: Engagement Area Chart (full width) ────── */}
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-[14px] font-semibold text-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                Engagement & Activity Trend
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5" style={{ fontFamily: 'var(--font-body)' }}>
                Active users, sessions, and conversions — last 6 months
              </p>
            </div>
            <div className="flex items-center gap-2">
              {[
                { color: '#3B82F6', label: 'Active Users' },
                { color: '#10B981', label: 'Sessions' },
                { color: '#F59E0B', label: 'Conversions' },
              ].map((l, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: l.color }} />
                  <span className="text-[10px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={ENGAGEMENT_TREND} margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradUsers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3B82F6" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradSessions" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#10B981" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradConversions" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#F59E0B" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fontFamily: 'var(--font-body)', fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fontFamily: 'var(--font-body)', fill: '#9CA3AF' }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
              <Tooltip contentStyle={customTooltipStyle} formatter={(v: number) => [v.toLocaleString(), '']} />
              <Area type="monotone" dataKey="activeUsers"  name="Active Users"  stroke="#3B82F6" strokeWidth={2} fill="url(#gradUsers)"       dot={false} />
              <Area type="monotone" dataKey="sessions"     name="Sessions"      stroke="#10B981" strokeWidth={2} fill="url(#gradSessions)"    dot={false} />
              <Area type="monotone" dataKey="conversions"  name="Conversions"   stroke="#F59E0B" strokeWidth={2} fill="url(#gradConversions)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* ── TABLE 1: Top Performers ─────────────────────── */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="text-[14px] font-semibold text-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                Top 10 Performers
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5" style={{ fontFamily: 'var(--font-body)' }}>
                Ranked by FY 2024 total revenue contribution
              </p>
            </div>
            <span className="text-[11px] text-muted-foreground bg-muted px-3 py-1 rounded-full" style={{ fontFamily: 'var(--font-body)' }}>
              10 of 48,293 accounts
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  {['#', 'Account Name', 'Region', 'Revenue', 'YoY Growth', 'Customers', 'Mkt Share', 'Trend'].map((h, i) => (
                    <th
                      key={i}
                      className={`px-5 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border ${i === 0 ? 'text-center' : i >= 3 ? 'text-right' : 'text-left'}`}
                      style={{ fontFamily: 'var(--font-body)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3F4F6]">
                {TOP_PERFORMERS.map((row) => (
                  <tr key={row.rank} className="hover:bg-[#FAFAFA] transition-colors">
                    <td className="px-5 py-3.5 text-center">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold ${row.rank <= 3 ? 'bg-amber-50 text-amber-600' : 'bg-muted text-muted-foreground'}`} style={{ fontFamily: 'var(--font-body)' }}>
                        {row.rank}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-[13px] font-semibold text-foreground" style={{ fontFamily: 'var(--font-body)' }}>{row.name}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-[12px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>{row.region}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="text-[13px] font-bold text-foreground" style={{ fontFamily: 'var(--font-body)' }}>{row.revenue}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span
                        className={`text-[12px] font-semibold ${row.growth.startsWith('+') ? 'text-emerald-600' : 'text-red-500'}`}
                        style={{ fontFamily: 'var(--font-body)' }}
                      >
                        {row.growth}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="text-[12px] text-foreground" style={{ fontFamily: 'var(--font-body)' }}>{row.customers.toLocaleString()}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="text-[12px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>{row.share}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {row.trend === 'up'
                        ? <TrendingUp className="w-4 h-4 text-emerald-500 ml-auto" />
                        : <TrendingDown className="w-4 h-4 text-red-400 ml-auto" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── TABLE 2: Segment Breakdown ──────────────────── */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="text-[14px] font-semibold text-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                Segment Revenue Breakdown
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5" style={{ fontFamily: 'var(--font-body)' }}>
                Quarterly and annual revenue by business segment
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full bg-emerald-50 text-emerald-600" style={{ fontFamily: 'var(--font-body)' }}>
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /> On Track
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full bg-red-50 text-red-500" style={{ fontFamily: 'var(--font-body)' }}>
                <span className="w-1.5 h-1.5 bg-red-400 rounded-full" /> At Risk
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  {['Segment', 'Q1 2024', 'Q2 2024', 'Q3 2024', 'Q4 2024', 'YTD Total', 'YoY Change', 'YoY %', 'Status'].map((h, i) => (
                    <th
                      key={i}
                      className={`px-5 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border ${i === 0 ? 'text-left' : i === 8 ? 'text-center' : 'text-right'}`}
                      style={{ fontFamily: 'var(--font-body)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3F4F6]">
                {SEGMENT_BREAKDOWN.map((row, idx) => (
                  <tr key={idx} className="hover:bg-[#FAFAFA] transition-colors">
                    <td className="px-5 py-3.5">
                      <span className="text-[12px] font-medium text-foreground" style={{ fontFamily: 'var(--font-body)' }}>{row.segment}</span>
                    </td>
                    {[row.q1, row.q2, row.q3, row.q4].map((v, i) => (
                      <td key={i} className="px-5 py-3.5 text-right">
                        <span className="text-[12px] text-foreground" style={{ fontFamily: 'var(--font-body)' }}>{v}</span>
                      </td>
                    ))}
                    <td className="px-5 py-3.5 text-right">
                      <span className="text-[12px] font-bold text-foreground" style={{ fontFamily: 'var(--font-body)' }}>{row.ytd}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span
                        className={`text-[12px] font-semibold ${row.change.startsWith('+') ? 'text-emerald-600' : 'text-red-500'}`}
                        style={{ fontFamily: 'var(--font-body)' }}
                      >
                        {row.change}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span
                        className={`text-[12px] font-semibold ${row.pct.startsWith('+') ? 'text-emerald-600' : 'text-red-500'}`}
                        style={{ fontFamily: 'var(--font-body)' }}
                      >
                        {row.pct}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full ${
                          row.status === 'on-track'
                            ? 'bg-emerald-50 text-emerald-600'
                            : 'bg-red-50 text-red-500'
                        }`}
                        style={{ fontFamily: 'var(--font-body)' }}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${row.status === 'on-track' ? 'bg-emerald-500' : 'bg-red-400'}`} />
                        {row.status === 'on-track' ? 'On Track' : 'At Risk'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Summary row */}
              <tfoot className="bg-muted border-t-2 border-border">
                <tr>
                  <td className="px-5 py-3.5">
                    <span className="text-[12px] font-bold text-foreground" style={{ fontFamily: 'var(--font-body)' }}>Total</span>
                  </td>
                  {['$8,580K', '$9,400K', '$10,960K', '$12,460K', '$41,400K', '+$4,880K', '+13.4%'].map((v, i) => (
                    <td key={i} className="px-5 py-3.5 text-right">
                      <span className="text-[12px] font-bold text-foreground" style={{ fontFamily: 'var(--font-body)' }}>{v}</span>
                    </td>
                  ))}
                  <td className="px-5 py-3.5 text-center">
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-600" style={{ fontFamily: 'var(--font-body)' }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      Overall
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ── FOOTER ───────────────────────────────────────── */}
        <div className="bg-card rounded-xl border border-border px-6 py-4 shadow-sm flex items-center justify-between">
          <div className="text-[11px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
            Powered by <span className="font-semibold text-foreground">Report Hub</span>
            {sourceDataset && (
              <> · Dataset: <span className="font-medium text-foreground">{sourceDataset.dataset_name}</span></>
            )}
            {' '}· Last refreshed {formatRelativeTime(report.last_updated_ts)}
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(`/reports/${reportId}`)}
              className="text-[12px] text-[#3B82F6] hover:text-[#2563EB] hover:underline font-medium"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              Report Detail
            </button>
            <span className="text-[#E5E7EB]">·</span>
            <button
              onClick={() => navigate('/reports')}
              className="text-[12px] text-[#3B82F6] hover:text-[#2563EB] hover:underline font-medium"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              All Reports
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
