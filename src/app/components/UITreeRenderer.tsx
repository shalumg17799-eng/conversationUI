import React, { lazy, Suspense } from 'react';
import {
  BarChart, Bar,
  LineChart, Line,
  AreaChart, Area,
  PieChart, Pie, Cell, Legend,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { GenerativeTable } from './GenerativeTable';
import { ReportSkeleton } from './ReportSkeleton';
import {
  TrendingUp, TrendingDown, Minus,
  Lightbulb, AlertTriangle, CheckCircle2, Info,
} from 'lucide-react';

const BigQueryDashboard = lazy(() => import('./BigQueryDashboard'));

export interface UITreeNode {
  renderType: string;
  props: Record<string, any>;
  children?: UITreeNode[];
  sections?: { type: string; components: UITreeNode[] }[];
}

// ── Design tokens (aligned to MASTER.md) ─────────────────────────────────────
const FB = { fontFamily: '"Bricolage Grotesque", sans-serif' };
const FI = { fontFamily: 'Inter, sans-serif' };
const FM = { fontFamily: '"JetBrains Mono", monospace' };

const SHADOW_DEFAULT = '0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.03)';
const SHADOW_HOVER   = '0 4px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)';

const CARD_BASE   = 'bg-white rounded-[12px] border border-[#E5E3DF] overflow-hidden';
const CARD_HOVER  = 'transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-[#C8C5BF] hover:-translate-y-px';

// MASTER.md category palette
const CHART_COLORS = ['#2563EB', '#7C3AED', '#0D9488', '#D97706', '#D4572A', '#D4183D', '#1D9E75'];
const AXIS_STYLE   = { fill: '#6B6965', fontSize: 11, fontFamily: 'Inter, sans-serif' };
const GRID_STYLE   = { stroke: '#F4F2EF' };

// ── Shared tooltip ────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#E5E3DF] rounded-[10px] px-3 py-2"
      style={{ boxShadow: SHADOW_HOVER, ...FI }}>
      {label !== undefined && (
        <p className="text-[11px] font-semibold text-[#1C1917] mb-1">{label}</p>
      )}
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-[12px] text-[#6B6965]" style={FM}>
          <span className="font-medium text-[#1C1917]">
            {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
          </span>
        </p>
      ))}
    </div>
  );
}

// ── Trend badge ───────────────────────────────────────────────────────────────
function TrendBadge({ trend, delta }: { trend?: string; delta?: string }) {
  const val = trend || delta || '';
  if (!val) return null;
  const isUp   = val.startsWith('+');
  const isDown = val.startsWith('-');
  return (
    <span
      className={`inline-flex items-center gap-1 text-[12px] font-medium ${
        isUp ? 'text-[#1D9E75]' : isDown ? 'text-[#D4183D]' : 'text-[#6B6965]'
      }`}
      style={FI}
    >
      {isUp   ? <TrendingUp   className="w-3.5 h-3.5" /> :
       isDown  ? <TrendingDown className="w-3.5 h-3.5" /> :
                 <Minus        className="w-3.5 h-3.5" />}
      {val}
    </span>
  );
}

// ── Y-axis formatter ──────────────────────────────────────────────────────────
const yFmt = (v: any) =>
  typeof v === 'number' && v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v;

// ════════════════════════════════════════════════════════════════════════════
// METRIC COMPONENTS
// ════════════════════════════════════════════════════════════════════════════

function KPICard({ value, title, label, trend, delta, deltaLabel, explanation }: any) {
  return (
    <div
      className={`${CARD_BASE} ${CARD_HOVER}`}
      style={{ boxShadow: SHADOW_DEFAULT }}
    >
      <div className="p-5">
        <p className="text-[11px] font-semibold text-[#8A8785] uppercase tracking-[0.06em] mb-3" style={FI}>
          {title || label}
        </p>
        <p className="text-[28px] font-semibold text-[#1C1917] leading-none mb-2.5" style={FM}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        <div className="flex items-center gap-2">
          <TrendBadge trend={trend} delta={delta} />
          {deltaLabel && (
            <span className="text-[11px] text-[#8A8785]" style={FI}>{deltaLabel}</span>
          )}
        </div>
        {explanation && (
          <p className="text-[11px] text-[#8A8785] mt-2.5 leading-relaxed" style={FI}>
            {explanation}
          </p>
        )}
      </div>
    </div>
  );
}

function KPIGrid({ metrics, explanation }: any) {
  if (!Array.isArray(metrics)) return null;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {metrics.map((m: any, i: number) => <KPICard key={i} {...m} />)}
      </div>
      {explanation && (
        <p className="text-[11px] text-[#8A8785] italic" style={FI}>{explanation}</p>
      )}
    </div>
  );
}

function StatDelta({ title, current, previous, currentLabel, previousLabel, trend, explanation }: any) {
  return (
    <div
      className={`${CARD_BASE} ${CARD_HOVER}`}
      style={{ boxShadow: SHADOW_DEFAULT }}
    >
      <div className="p-5">
        <p className="text-[11px] font-semibold text-[#8A8785] uppercase tracking-[0.06em] mb-4" style={FI}>
          {title}
        </p>
        <div className="flex items-end gap-8 mb-3">
          <div>
            <p className="text-[11px] text-[#8A8785] mb-1" style={FI}>{currentLabel || 'Current'}</p>
            <p className="text-[28px] font-semibold text-[#1C1917] leading-none" style={FM}>
              {typeof current === 'number' ? current.toLocaleString() : current}
            </p>
          </div>
          <div className="pb-0.5">
            <p className="text-[11px] text-[#8A8785] mb-1" style={FI}>{previousLabel || 'Previous'}</p>
            <p className="text-[20px] font-medium text-[#6B6965] leading-none" style={FM}>
              {typeof previous === 'number' ? previous.toLocaleString() : previous}
            </p>
          </div>
        </div>
        <TrendBadge trend={trend} />
        {explanation && (
          <p className="text-[11px] text-[#8A8785] mt-2.5 leading-relaxed" style={FI}>{explanation}</p>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// CHART COMPONENTS
// ════════════════════════════════════════════════════════════════════════════

function BarChartComponent({ data, xKey, yKey, title, explanation }: any) {
  return (
    <div
      className={`${CARD_BASE} ${CARD_HOVER}`}
      style={{ boxShadow: SHADOW_DEFAULT }}
    >
      <div className="p-5">
        <h4 className="text-[14px] font-semibold text-[#1C1917] mb-0.5 leading-snug" style={FB}>{title}</h4>
        {explanation && (
          <p className="text-[11px] text-[#8A8785] mb-4 leading-relaxed" style={FI}>{explanation}</p>
        )}
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
            <defs>
              <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#2563EB" />
                <stop offset="100%" stopColor="#60A5FA" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" {...GRID_STYLE} vertical={false} />
            <XAxis dataKey={xKey} axisLine={false} tickLine={false} tick={AXIS_STYLE} />
            <YAxis axisLine={false} tickLine={false} tick={AXIS_STYLE} tickFormatter={yFmt} width={40} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(37,99,235,0.05)' }} />
            <Bar dataKey={yKey} fill="url(#barGrad)" radius={[5, 5, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function LineChartComponent({ data, xKey, yKey, title, explanation }: any) {
  return (
    <div
      className={`${CARD_BASE} ${CARD_HOVER}`}
      style={{ boxShadow: SHADOW_DEFAULT }}
    >
      <div className="p-5">
        <h4 className="text-[14px] font-semibold text-[#1C1917] mb-0.5 leading-snug" style={FB}>{title}</h4>
        {explanation && (
          <p className="text-[11px] text-[#8A8785] mb-4 leading-relaxed" style={FI}>{explanation}</p>
        )}
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" {...GRID_STYLE} vertical={false} />
            <XAxis dataKey={xKey} axisLine={false} tickLine={false} tick={AXIS_STYLE} />
            <YAxis axisLine={false} tickLine={false} tick={AXIS_STYLE} tickFormatter={yFmt} width={40} />
            <Tooltip content={<ChartTooltip />} />
            <Line
              type="monotone" dataKey={yKey}
              stroke="#D4572A" strokeWidth={2} dot={false}
              activeDot={{ r: 4, fill: '#D4572A', stroke: '#fff', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function AreaChartComponent({ data, xKey, yKey, title, explanation }: any) {
  return (
    <div
      className={`${CARD_BASE} ${CARD_HOVER}`}
      style={{ boxShadow: SHADOW_DEFAULT }}
    >
      <div className="p-5">
        <h4 className="text-[14px] font-semibold text-[#1C1917] mb-0.5 leading-snug" style={FB}>{title}</h4>
        {explanation && (
          <p className="text-[11px] text-[#8A8785] mb-4 leading-relaxed" style={FI}>{explanation}</p>
        )}
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#D4572A" stopOpacity={0.12} />
                <stop offset="95%" stopColor="#D4572A" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" {...GRID_STYLE} vertical={false} />
            <XAxis dataKey={xKey} axisLine={false} tickLine={false} tick={AXIS_STYLE} />
            <YAxis axisLine={false} tickLine={false} tick={AXIS_STYLE} tickFormatter={yFmt} width={40} />
            <Tooltip content={<ChartTooltip />} />
            <Area
              type="monotone" dataKey={yKey}
              stroke="#D4572A" strokeWidth={2}
              fill="url(#areaGrad)" dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function PieChartComponent({ data, nameKey, valueKey, title, explanation }: any) {
  return (
    <div
      className={`${CARD_BASE} ${CARD_HOVER}`}
      style={{ boxShadow: SHADOW_DEFAULT }}
    >
      <div className="p-5">
        <h4 className="text-[14px] font-semibold text-[#1C1917] mb-0.5 leading-snug" style={FB}>{title}</h4>
        {explanation && (
          <p className="text-[11px] text-[#8A8785] mb-4 leading-relaxed" style={FI}>{explanation}</p>
        )}
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={data} dataKey={valueKey} nameKey={nameKey}
              cx="50%" cy="50%" outerRadius={90} innerRadius={44}
              paddingAngle={2} isAnimationActive={false}
            >
              {(data || []).map((_: any, i: number) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
            <Legend
              formatter={(value) => (
                <span style={{ ...FI, fontSize: 11, color: '#6B6965' }}>{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function RankedListComponent({ items, title, explanation }: any) {
  if (!Array.isArray(items)) return null;
  const max = Math.max(...items.map((i: any) => Number(i.value) || 0), 1);

  return (
    <div
      className={`${CARD_BASE} ${CARD_HOVER}`}
      style={{ boxShadow: SHADOW_DEFAULT }}
    >
      <div className="p-5">
        <h4 className="text-[14px] font-semibold text-[#1C1917] mb-0.5 leading-snug" style={FB}>{title}</h4>
        {explanation && (
          <p className="text-[11px] text-[#8A8785] mb-4 leading-relaxed" style={FI}>{explanation}</p>
        )}
        <div className="space-y-3 mt-3">
          {items.map((item: any, i: number) => {
            const pct = Math.round((Number(item.value) / max) * 100);
            const color = CHART_COLORS[i % CHART_COLORS.length];
            return (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center flex-shrink-0"
                      style={{ background: `${color}18`, color, ...FM }}
                    >
                      {item.rank ?? i + 1}
                    </span>
                    <span className="text-[13px] text-[#1C1917] font-medium truncate max-w-[200px]" style={FI}>
                      {item.label}
                    </span>
                  </div>
                  <span className="text-[13px] font-semibold text-[#1C1917]" style={FM}>
                    {typeof item.value === 'number' ? item.value.toLocaleString() : item.value}
                  </span>
                </div>
                <div className="h-1 bg-[#F4F2EF] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, background: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// DATA COMPONENTS
// ════════════════════════════════════════════════════════════════════════════

function TableComponent({ columns, rows, data, title, explanation }: any) {
  const tableRows = rows || data || [];
  const tableCols = columns || (tableRows[0] ? Object.keys(tableRows[0]) : []);
  return (
    <div
      className={`${CARD_BASE} ${CARD_HOVER}`}
      style={{ boxShadow: SHADOW_DEFAULT }}
    >
      <div className="p-5">
        {explanation && (
          <p className="text-[11px] text-[#8A8785] mb-3 leading-relaxed" style={FI}>{explanation}</p>
        )}
        <GenerativeTable title={title || 'Data'} columns={tableCols} rows={tableRows} />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// NARRATIVE COMPONENTS
// ════════════════════════════════════════════════════════════════════════════

const INSIGHT_STYLES: Record<string, { bg: string; border: string; iconColor: string; icon: React.ReactNode }> = {
  insight: {
    bg: '#EFF6FF', border: '#BFDBFE', iconColor: '#2563EB',
    icon: <Lightbulb className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#2563EB' }} />,
  },
  warning: {
    bg: '#FFFBEB', border: '#FCD34D', iconColor: '#D97706',
    icon: <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#D97706' }} />,
  },
  success: {
    bg: '#F0FDF9', border: '#99E6D0', iconColor: '#1D9E75',
    icon: <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#1D9E75' }} />,
  },
};

function InsightCard({ title, body, type = 'insight', highlight }: any) {
  const s = INSIGHT_STYLES[type] ?? INSIGHT_STYLES.insight;
  return (
    <div
      className="rounded-[12px] border p-4"
      style={{ background: s.bg, borderColor: s.border }}
    >
      <div className="flex items-start gap-3">
        {s.icon}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[#1C1917] mb-1" style={FB}>{title}</p>
          <p className="text-[12px] text-[#6B6965] leading-relaxed" style={FI}>{body}</p>
          {highlight && (
            <p
              className="text-[11px] font-semibold mt-2 px-2 py-1 rounded-[6px] inline-block"
              style={{ color: s.iconColor, background: 'rgba(255,255,255,0.7)', ...FI }}
            >
              {highlight}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const ALERT_STYLES: Record<string, { bg: string; border: string; text: string; icon: React.ReactNode }> = {
  warning: {
    bg: '#FFFBEB', border: '#FCD34D', text: '#92400E',
    icon: <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: '#D97706' }} />,
  },
  error: {
    bg: '#FFF1F2', border: '#FECDD3', text: '#9F1239',
    icon: <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: '#D4183D' }} />,
  },
  info: {
    bg: '#EFF6FF', border: '#BFDBFE', text: '#1E40AF',
    icon: <Info className="w-4 h-4 flex-shrink-0" style={{ color: '#2563EB' }} />,
  },
  success: {
    bg: '#F0FDF9', border: '#99E6D0', text: '#064E3B',
    icon: <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: '#1D9E75' }} />,
  },
};

function AlertBanner({ message, type = 'info' }: any) {
  const s = ALERT_STYLES[type] ?? ALERT_STYLES.info;
  return (
    <div
      className="flex items-center gap-3 rounded-[10px] border px-4 py-3"
      style={{ background: s.bg, borderColor: s.border }}
    >
      {s.icon}
      <p className="text-[13px] font-medium" style={{ color: s.text, ...FI }}>{message}</p>
    </div>
  );
}

function SummaryText({ text }: any) {
  return (
    <div className="rounded-[12px] border border-[#E5E3DF] px-5 py-4" style={{ background: '#F4F2EF' }}>
      <p className="text-[13px] text-[#6B6965] leading-relaxed" style={FI}>{text}</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// LAYOUT COMPONENTS
// ════════════════════════════════════════════════════════════════════════════

function TwoColumn({ children }: any) {
  const kids = React.Children.toArray(children);
  // Only split into 2 columns when there are exactly 2 children — otherwise render full-width
  if (kids.length !== 2) {
    return <div className="space-y-3">{kids}</div>;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {kids.map((child, i) => <div key={i}>{child}</div>)}
    </div>
  );
}

function Section({ title, description, children }: any) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-[15px] font-semibold text-[#1C1917] tracking-[-0.01em]" style={FB}>{title}</h3>
        {description && (
          <p className="text-[12px] text-[#6B6965] mt-0.5 leading-relaxed" style={FI}>{description}</p>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function ReportShell({ title, description, warnings, children }: any) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[16px] font-semibold text-[#1C1917] tracking-[-0.01em]" style={FB}>{title}</h3>
        {description && (
          <p className="text-[13px] text-[#6B6965] mt-1 leading-relaxed" style={FI}>{description}</p>
        )}
        {warnings?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {warnings.map((w: string, i: number) => (
              <span
                key={i}
                className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                style={{ color: '#92400E', background: '#FFFBEB', border: '1px solid #FCD34D', ...FI }}
              >
                {w}
              </span>
            ))}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// COMPONENT REGISTRY
// ════════════════════════════════════════════════════════════════════════════

const COMPONENT_MAP: Record<string, React.ComponentType<any>> = {
  KPI: KPICard,
  KPICard,
  KPIGrid,
  StatDelta,
  BarChart: BarChartComponent,
  LineChart: LineChartComponent,
  AreaChart: AreaChartComponent,
  PieChart: PieChartComponent,
  RankedList: RankedListComponent,
  Table: TableComponent,
  GenerativeTable: TableComponent,
  InsightCard,
  AlertBanner,
  SummaryText,
  TwoColumn,
  Section,
  Report: ReportShell,
  ReportSkeleton,
  BigQueryDashboard,
};

// ════════════════════════════════════════════════════════════════════════════
// RECURSIVE RENDERER
// ════════════════════════════════════════════════════════════════════════════

export function UITreeRenderer({ node }: { node: UITreeNode }) {
  const Component = COMPONENT_MAP[node.renderType];

  if (!Component) {
    return (
      <div
        className="p-3 rounded-[10px] border border-dashed border-[#E5E3DF] text-[11px] text-[#8A8785]"
        style={FI}
      >
        Unknown component: <code className="font-mono">{node.renderType}</code>
      </div>
    );
  }

  const childrenContent = (
    <>
      {node.children?.map((child, i) => <UITreeRenderer key={i} node={child} />)}
      {node.sections?.map((section, si) => (
        <div key={si} className="space-y-3">
          {section.components.map((c, ci) => <UITreeRenderer key={ci} node={c} />)}
        </div>
      ))}
    </>
  );

  if (node.renderType === 'BigQueryDashboard') {
    return (
      <Suspense fallback={<ReportSkeleton />}>
        <Component {...node.props} />
      </Suspense>
    );
  }

  return (
    <Component {...node.props}>
      {childrenContent}
    </Component>
  );
}
