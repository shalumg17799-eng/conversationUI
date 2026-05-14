import React, { lazy, Suspense } from 'react';
import {
  BarChart, Bar,
  LineChart, Line,
  AreaChart, Area,
  PieChart, Pie, Cell, Legend,
  ScatterChart, Scatter, ZAxis,
  FunnelChart, Funnel, LabelList,
  RadialBarChart, RadialBar,
  ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
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

function ScatterPlotComponent({ data, xKey, yKey, zKey, title, explanation }: any) {
  return (
    <div className={`${CARD_BASE} ${CARD_HOVER}`} style={{ boxShadow: SHADOW_DEFAULT }}>
      <div className="p-5">
        <h4 className="text-[14px] font-semibold text-[#1C1917] mb-0.5 leading-snug" style={FB}>{title}</h4>
        {explanation && (
          <p className="text-[11px] text-[#8A8785] mb-4 leading-relaxed" style={FI}>{explanation}</p>
        )}
        <ResponsiveContainer width="100%" height={260}>
          <ScatterChart margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" {...GRID_STYLE} />
            <XAxis dataKey={xKey} axisLine={false} tickLine={false} tick={AXIS_STYLE} name={xKey} />
            <YAxis dataKey={yKey} axisLine={false} tickLine={false} tick={AXIS_STYLE} tickFormatter={yFmt} width={40} name={yKey} />
            {zKey && <ZAxis dataKey={zKey} range={[40, 200]} name={zKey} />}
            <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<ChartTooltip />} />
            <Scatter data={data} fill="#2563EB" fillOpacity={0.7} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function FunnelChartComponent({ data, nameKey, valueKey, title, explanation }: any) {
  const funnelData = (data || []).map((d: any, i: number) => ({
    ...d,
    name: d[nameKey] ?? d.name,
    value: d[valueKey] ?? d.value,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));
  return (
    <div className={`${CARD_BASE} ${CARD_HOVER}`} style={{ boxShadow: SHADOW_DEFAULT }}>
      <div className="p-5">
        <h4 className="text-[14px] font-semibold text-[#1C1917] mb-0.5 leading-snug" style={FB}>{title}</h4>
        {explanation && (
          <p className="text-[11px] text-[#8A8785] mb-4 leading-relaxed" style={FI}>{explanation}</p>
        )}
        <ResponsiveContainer width="100%" height={280}>
          <FunnelChart>
            <Tooltip content={<ChartTooltip />} />
            <Funnel dataKey="value" data={funnelData} isAnimationActive={false}>
              <LabelList position="center" fill="#fff" fontSize={11} fontFamily="Inter, sans-serif" dataKey="name" />
            </Funnel>
          </FunnelChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function GaugeChartComponent({ value, max = 100, target, title, explanation, unit = '' }: any) {
  const numVal  = Number(value) || 0;
  const numMax  = Number(max)   || 100;
  const numTarget = target !== undefined ? Number(target) : undefined;

  const pct       = Math.min(Math.max(numVal / numMax, 0), 1);
  const targetPct = numTarget !== undefined ? Math.min(Math.max(numTarget / numMax, 0), 1) : undefined;

  // SVG canvas — gauge arc sits in top portion, value text in the open area below
  const W = 260, H = 158;
  const cx = 130, cy = 108;
  const outerR = 95, innerR = 68;

  // pct 0–1 → point on arc: 0=left end, 1=right end, 0.5=top
  const pctToPoint = (p: number, r: number) => {
    const a = (1 - p) * Math.PI;
    return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
  };

  // Annular arc path from pct1 to pct2, sweep counterclockwise (top arc)
  const arcPath = (p1: number, p2: number, rO: number, rI: number): string => {
    if (Math.abs(p2 - p1) < 0.001) return '';
    const o1 = pctToPoint(p1, rO), o2 = pctToPoint(p2, rO);
    const i1 = pctToPoint(p2, rI), i2 = pctToPoint(p1, rI);
    const lg = (p2 - p1) > 0.5 ? 1 : 0;
    return `M${o1.x.toFixed(1)} ${o1.y.toFixed(1)} A${rO} ${rO} 0 ${lg} 0 ${o2.x.toFixed(1)} ${o2.y.toFixed(1)} L${i1.x.toFixed(1)} ${i1.y.toFixed(1)} A${rI} ${rI} 0 ${lg} 1 ${i2.x.toFixed(1)} ${i2.y.toFixed(1)}Z`;
  };

  // Fill color: compare against target if present, else use fixed thresholds
  const fillColor = targetPct !== undefined
    ? (pct >= targetPct ? '#1D9E75' : pct >= targetPct * 0.85 ? '#D97706' : '#D4183D')
    : (pct >= 0.8 ? '#1D9E75' : pct >= 0.6 ? '#D97706' : '#D4183D');

  const statusLabel = targetPct !== undefined
    ? (pct >= targetPct ? 'Above target' : pct >= targetPct * 0.85 ? 'Near target' : 'Below target')
    : (pct >= 0.8 ? 'High' : pct >= 0.6 ? 'Mid' : 'Low');

  const leftLabel  = pctToPoint(0,   outerR + 14);
  const rightLabel = pctToPoint(1,   outerR + 14);
  const targetOuter = targetPct !== undefined ? pctToPoint(targetPct, outerR + 5)  : null;
  const targetInner = targetPct !== undefined ? pctToPoint(targetPct, innerR - 5)  : null;
  const targetLabel = targetPct !== undefined ? pctToPoint(targetPct, outerR + 22) : null;

  return (
    <div className={`${CARD_BASE} ${CARD_HOVER}`} style={{ boxShadow: SHADOW_DEFAULT }}>
      <div className="p-5">
        <p className="text-[11px] font-semibold text-[#8A8785] uppercase tracking-[0.06em] mb-1" style={FI}>
          {title}
        </p>
        {explanation && (
          <p className="text-[11px] text-[#8A8785] mb-3 leading-relaxed" style={FI}>{explanation}</p>
        )}

        <div className="flex flex-col items-center">
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: W, overflow: 'visible' }}>
            {/* Zone backgrounds: red → amber → green left to right */}
            <path d={arcPath(0,   0.6, outerR, innerR)} fill="#FEE2E2" />
            <path d={arcPath(0.6, 0.8, outerR, innerR)} fill="#FEF3C7" />
            <path d={arcPath(0.8, 1.0, outerR, innerR)} fill="#D1FAE5" />

            {/* White zone dividers */}
            {[0.6, 0.8].map((p, i) => {
              const op = pctToPoint(p, outerR + 1);
              const ip = pctToPoint(p, innerR - 1);
              return <line key={i} x1={op.x.toFixed(1)} y1={op.y.toFixed(1)} x2={ip.x.toFixed(1)} y2={ip.y.toFixed(1)} stroke="white" strokeWidth={2.5} />;
            })}

            {/* Value fill arc */}
            {pct > 0.005 && <path d={arcPath(0, pct, outerR, innerR)} fill={fillColor} />}

            {/* Target tick */}
            {targetOuter && targetInner && (
              <line
                x1={targetOuter.x.toFixed(1)} y1={targetOuter.y.toFixed(1)}
                x2={targetInner.x.toFixed(1)} y2={targetInner.y.toFixed(1)}
                stroke="#1C1917" strokeWidth={2.5} strokeLinecap="round"
              />
            )}

            {/* Target value label above tick */}
            {targetLabel && numTarget !== undefined && (
              <text x={targetLabel.x.toFixed(1)} y={targetLabel.y.toFixed(1)} textAnchor="middle"
                fontSize={9} fill="#1C1917" fontFamily="Inter, sans-serif" fontWeight="700">
                {numTarget}{unit}
              </text>
            )}

            {/* Arc end labels: 0 on left, max on right */}
            <text x={leftLabel.x.toFixed(1)}  y={(leftLabel.y + 3).toFixed(1)}  textAnchor="end"   fontSize={9} fill="#8A8785" fontFamily="Inter, sans-serif">0{unit}</text>
            <text x={rightLabel.x.toFixed(1)} y={(rightLabel.y + 3).toFixed(1)} textAnchor="start" fontSize={9} fill="#8A8785" fontFamily="Inter, sans-serif">{numMax}{unit}</text>

            {/* Value — sits below arc in open space */}
            <text x={cx} y={cy + 16} textAnchor="middle" fontSize={30} fontWeight="600" fill="#1C1917"
              fontFamily='"JetBrains Mono", monospace'>
              {typeof numVal === 'number' ? numVal.toLocaleString() : numVal}{unit}
            </text>

            {/* Status label */}
            <text x={cx} y={cy + 34} textAnchor="middle" fontSize={10} fontWeight="600"
              fill={fillColor} fontFamily="Inter, sans-serif">
              {statusLabel}
            </text>
          </svg>

          {/* Legend */}
          <div className="flex items-center justify-center gap-3 mt-1 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: '#FECACA' , border: '1px solid #D4183D' }} />
              <span className="text-[10px] text-[#6B6965]" style={FI}>Low  &lt; 60%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: '#FDE68A', border: '1px solid #D97706' }} />
              <span className="text-[10px] text-[#6B6965]" style={FI}>Mid  60–80%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: '#A7F3D0', border: '1px solid #1D9E75' }} />
              <span className="text-[10px] text-[#6B6965]" style={FI}>High  &gt; 80%</span>
            </div>
            {numTarget !== undefined && (
              <div className="flex items-center gap-1.5">
                <div className="w-3.5 h-0.5 flex-shrink-0 rounded-full" style={{ background: '#1C1917' }} />
                <span className="text-[10px] text-[#6B6965]" style={FI}>Target</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ComparisonCard({ title, entities, metric, explanation }: any) {
  if (!Array.isArray(entities) || entities.length < 2) return null;
  const values = entities.map((e: any) => Number(e.value) || 0);
  const maxVal = Math.max(...values, 1);
  return (
    <div className={`${CARD_BASE} ${CARD_HOVER}`} style={{ boxShadow: SHADOW_DEFAULT }}>
      <div className="p-5">
        {title && (
          <p className="text-[11px] font-semibold text-[#8A8785] uppercase tracking-[0.06em] mb-4" style={FI}>
            {title}
          </p>
        )}
        {metric && (
          <p className="text-[12px] text-[#6B6965] mb-4" style={FI}>{metric}</p>
        )}
        <div className="space-y-4">
          {entities.map((entity: any, i: number) => {
            const color = CHART_COLORS[i % CHART_COLORS.length];
            const pct = Math.round((Number(entity.value) / maxVal) * 100);
            return (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-[#1C1917]" style={FI}>{entity.label}</span>
                  <span className="text-[13px] font-semibold text-[#1C1917]" style={FM}>
                    {typeof entity.value === 'number' ? entity.value.toLocaleString() : entity.value}
                    {entity.unit ? ` ${entity.unit}` : ''}
                  </span>
                </div>
                <div className="h-2 bg-[#F4F2EF] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: color }}
                  />
                </div>
                {entity.delta && (
                  <p className="text-[11px] text-[#8A8785]" style={FI}>{entity.delta}</p>
                )}
              </div>
            );
          })}
        </div>
        {explanation && (
          <p className="text-[11px] text-[#8A8785] mt-4 leading-relaxed" style={FI}>{explanation}</p>
        )}
      </div>
    </div>
  );
}

function HeatMapComponent({ data, xKey, yKey, valueKey, title, explanation }: any) {
  if (!Array.isArray(data) || !data.length) return null;
  const xValues = [...new Set(data.map((d: any) => d[xKey]))];
  const yValues = [...new Set(data.map((d: any) => d[yKey]))];
  const values = data.map((d: any) => Number(d[valueKey]) || 0);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values, 1);
  const getColor = (v: number) => {
    const t = (v - minVal) / (maxVal - minVal);
    if (t >= 0.75) return '#1D4ED8';
    if (t >= 0.5) return '#60A5FA';
    if (t >= 0.25) return '#BFDBFE';
    return '#EFF6FF';
  };
  const getTextColor = (v: number) => {
    const t = (v - minVal) / (maxVal - minVal);
    return t >= 0.5 ? '#fff' : '#1C1917';
  };
  const lookup = new Map(data.map((d: any) => [`${d[xKey]}__${d[yKey]}`, Number(d[valueKey]) || 0]));
  return (
    <div className={`${CARD_BASE} ${CARD_HOVER}`} style={{ boxShadow: SHADOW_DEFAULT }}>
      <div className="p-5">
        <h4 className="text-[14px] font-semibold text-[#1C1917] mb-0.5 leading-snug" style={FB}>{title}</h4>
        {explanation && <p className="text-[11px] text-[#8A8785] mb-4 leading-relaxed" style={FI}>{explanation}</p>}
        <div className="overflow-x-auto mt-3">
          <table className="w-full border-collapse" style={FI}>
            <thead>
              <tr>
                <th className="text-[10px] text-[#8A8785] font-medium pb-2 pr-2 text-left w-20" />
                {xValues.map((x: any) => (
                  <th key={x} className="text-[10px] text-[#8A8785] font-semibold pb-2 px-1 text-center min-w-[48px]">{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {yValues.map((y: any) => (
                <tr key={y}>
                  <td className="text-[10px] text-[#6B6965] font-medium pr-2 py-0.5 text-right">{y}</td>
                  {xValues.map((x: any) => {
                    const v = lookup.get(`${x}__${y}`) ?? 0;
                    return (
                      <td key={x} className="px-1 py-0.5">
                        <div
                          className="rounded-[4px] text-[10px] font-semibold flex items-center justify-center"
                          style={{ background: getColor(v), color: getTextColor(v), height: 32, minWidth: 40, ...FM }}
                        >
                          {v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SparklineComponent({ data, xKey, yKey, value, label, trend, explanation }: any) {
  return (
    <div className={`${CARD_BASE} ${CARD_HOVER}`} style={{ boxShadow: SHADOW_DEFAULT }}>
      <div className="p-5 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-[#8A8785] uppercase tracking-[0.06em]" style={FI}>{label}</p>
          <p className="text-[26px] font-semibold text-[#1C1917] leading-tight mt-1" style={FM}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {trend && <div className="mt-1"><TrendBadge trend={trend} /></div>}
          {explanation && <p className="text-[11px] text-[#8A8785] mt-1.5" style={FI}>{explanation}</p>}
        </div>
        {Array.isArray(data) && data.length > 1 && (
          <div className="flex-shrink-0" style={{ width: 100, height: 48 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                <Line
                  type="monotone" dataKey={yKey}
                  stroke="#2563EB" strokeWidth={1.5} dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

function ComboChartComponent({ data, xKey, barKey, lineKey, barLabel, lineLabel, title, explanation }: any) {
  return (
    <div className={`${CARD_BASE} ${CARD_HOVER}`} style={{ boxShadow: SHADOW_DEFAULT }}>
      <div className="p-5">
        <h4 className="text-[14px] font-semibold text-[#1C1917] mb-0.5 leading-snug" style={FB}>{title}</h4>
        {explanation && <p className="text-[11px] text-[#8A8785] mb-4 leading-relaxed" style={FI}>{explanation}</p>}
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={data} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
            <defs>
              <linearGradient id="comboBarGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563EB" />
                <stop offset="100%" stopColor="#60A5FA" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" {...GRID_STYLE} vertical={false} />
            <XAxis dataKey={xKey} axisLine={false} tickLine={false} tick={AXIS_STYLE} />
            <YAxis yAxisId="bar" axisLine={false} tickLine={false} tick={AXIS_STYLE} tickFormatter={yFmt} width={40} />
            <YAxis yAxisId="line" orientation="right" axisLine={false} tickLine={false} tick={AXIS_STYLE} tickFormatter={yFmt} width={36} />
            <Tooltip content={<ChartTooltip />} />
            <Bar yAxisId="bar" dataKey={barKey} fill="url(#comboBarGrad)" radius={[4, 4, 0, 0]} isAnimationActive={false} name={barLabel ?? barKey} />
            <Line yAxisId="line" type="monotone" dataKey={lineKey} stroke="#D4572A" strokeWidth={2} dot={false} isAnimationActive={false} name={lineLabel ?? lineKey} />
          </ComposedChart>
        </ResponsiveContainer>
        {(barLabel || lineLabel) && (
          <div className="flex items-center gap-4 mt-2">
            {barLabel && <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{ background: '#2563EB' }} /><span className="text-[11px] text-[#6B6965]" style={FI}>{barLabel}</span></div>}
            {lineLabel && <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 rounded-full" style={{ background: '#D4572A' }} /><span className="text-[11px] text-[#6B6965]" style={FI}>{lineLabel}</span></div>}
          </div>
        )}
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

function PivotTableComponent({ data, rowKey, colKey, valueKey, title, explanation }: any) {
  if (!Array.isArray(data) || !data.length) return null;
  const rowValues = [...new Set(data.map((d: any) => d[rowKey]))];
  const colValues = [...new Set(data.map((d: any) => d[colKey]))];
  const lookup = new Map(data.map((d: any) => [`${d[rowKey]}__${d[colKey]}`, d[valueKey]]));
  const rowTotals = new Map(rowValues.map(r => [r, colValues.reduce((s, c) => s + (Number(lookup.get(`${r}__${c}`)) || 0), 0)]));
  const colTotals = new Map(colValues.map(c => [c, rowValues.reduce((s, r) => s + (Number(lookup.get(`${r}__${c}`)) || 0), 0)]));
  const grandTotal = [...rowTotals.values()].reduce((a, b) => a + b, 0);
  const fmt = (v: any) => typeof v === 'number' && v >= 1000 ? v.toLocaleString() : (v ?? '—');
  return (
    <div className={`${CARD_BASE} ${CARD_HOVER}`} style={{ boxShadow: SHADOW_DEFAULT }}>
      <div className="p-5">
        {title && <h4 className="text-[14px] font-semibold text-[#1C1917] mb-0.5 leading-snug" style={FB}>{title}</h4>}
        {explanation && <p className="text-[11px] text-[#8A8785] mb-4 leading-relaxed" style={FI}>{explanation}</p>}
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-[12px]" style={FI}>
            <thead>
              <tr className="border-b border-[#E5E3DF]">
                <th className="text-left py-2 pr-4 text-[11px] font-semibold text-[#8A8785] uppercase tracking-wide">{rowKey}</th>
                {colValues.map((c: any) => <th key={c} className="text-right py-2 px-3 text-[11px] font-semibold text-[#8A8785] uppercase tracking-wide whitespace-nowrap">{c}</th>)}
                <th className="text-right py-2 pl-3 text-[11px] font-semibold text-[#1C1917] uppercase tracking-wide">Total</th>
              </tr>
            </thead>
            <tbody>
              {rowValues.map((r: any) => (
                <tr key={r} className="border-b border-[#F4F2EF] hover:bg-[#FAFAF9]">
                  <td className="py-2 pr-4 font-medium text-[#1C1917]">{r}</td>
                  {colValues.map((c: any) => (
                    <td key={c} className="py-2 px-3 text-right text-[#6B6965]" style={FM}>{fmt(lookup.get(`${r}__${c}`))}</td>
                  ))}
                  <td className="py-2 pl-3 text-right font-semibold text-[#1C1917]" style={FM}>{fmt(rowTotals.get(r))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#E5E3DF] bg-[#F4F2EF]">
                <td className="py-2 pr-4 text-[11px] font-semibold text-[#1C1917] uppercase tracking-wide">Total</td>
                {colValues.map((c: any) => <td key={c} className="py-2 px-3 text-right font-semibold text-[#1C1917]" style={FM}>{fmt(colTotals.get(c))}</td>)}
                <td className="py-2 pl-3 text-right font-bold text-[#1C1917]" style={FM}>{fmt(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

function TimelineCard({ events, title, explanation }: any) {
  if (!Array.isArray(events)) return null;
  return (
    <div className={`${CARD_BASE} ${CARD_HOVER}`} style={{ boxShadow: SHADOW_DEFAULT }}>
      <div className="p-5">
        {title && <h4 className="text-[14px] font-semibold text-[#1C1917] mb-3 leading-snug" style={FB}>{title}</h4>}
        {explanation && <p className="text-[11px] text-[#8A8785] mb-4 leading-relaxed" style={FI}>{explanation}</p>}
        <div className="relative pl-5 space-y-4">
          <div className="absolute left-1.5 top-1.5 bottom-1.5 w-px bg-[#E5E3DF]" />
          {events.map((event: any, i: number) => {
            const isLast = i === events.length - 1;
            const dotColor = event.type === 'success' ? '#1D9E75' : event.type === 'warning' ? '#D97706' : event.type === 'error' ? '#D4183D' : '#2563EB';
            return (
              <div key={i} className="relative">
                <div
                  className="absolute -left-5 mt-0.5 w-3 h-3 rounded-full border-2 border-white"
                  style={{ background: dotColor, boxShadow: `0 0 0 1px ${dotColor}30` }}
                />
                <div className={isLast ? '' : ''}>
                  {event.date && (
                    <p className="text-[10px] font-semibold text-[#8A8785] uppercase tracking-wide mb-0.5" style={FM}>{event.date}</p>
                  )}
                  {event.title && <p className="text-[13px] font-semibold text-[#1C1917]" style={FI}>{event.title}</p>}
                  {event.description && <p className="text-[12px] text-[#6B6965] mt-0.5 leading-relaxed" style={FI}>{event.description}</p>}
                  {event.value && <p className="text-[11px] font-semibold mt-1" style={{ color: dotColor, ...FM }}>{event.value}</p>}
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

function StepList({ steps, title, explanation }: any) {
  if (!Array.isArray(steps)) return null;
  return (
    <div className={`${CARD_BASE} ${CARD_HOVER}`} style={{ boxShadow: SHADOW_DEFAULT }}>
      <div className="p-5">
        {title && <h4 className="text-[14px] font-semibold text-[#1C1917] mb-3 leading-snug" style={FB}>{title}</h4>}
        {explanation && <p className="text-[11px] text-[#8A8785] mb-4 leading-relaxed" style={FI}>{explanation}</p>}
        <div className="space-y-3">
          {steps.map((step: any, i: number) => (
            <div key={i} className="flex gap-3">
              <div
                className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold mt-0.5"
                style={{ background: '#EFF6FF', color: '#2563EB', ...FM }}
              >
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                {typeof step === 'string' ? (
                  <p className="text-[13px] text-[#1C1917]" style={FI}>{step}</p>
                ) : (
                  <>
                    {step.title && <p className="text-[13px] font-semibold text-[#1C1917]" style={FI}>{step.title}</p>}
                    {step.description && <p className="text-[12px] text-[#6B6965] mt-0.5 leading-relaxed" style={FI}>{step.description}</p>}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Callout({ title, body, metric, explanation }: any) {
  return (
    <div
      className="rounded-[12px] border-l-4 px-5 py-4"
      style={{ borderLeftColor: '#2563EB', background: '#EFF6FF', border: '1px solid #BFDBFE', borderLeftWidth: 4 }}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {title && <p className="text-[15px] font-semibold text-[#1E40AF] mb-1 leading-snug" style={FB}>{title}</p>}
          {metric && (
            <p className="text-[28px] font-semibold text-[#1C1917] leading-none mb-2" style={FM}>{metric}</p>
          )}
          {body && <p className="text-[13px] text-[#1E40AF] leading-relaxed" style={FI}>{body}</p>}
          {explanation && <p className="text-[11px] text-[#6B6965] mt-2" style={FI}>{explanation}</p>}
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ items, title, explanation }: any) {
  const list = Array.isArray(items) ? items : [];
  return (
    <div className={`${CARD_BASE} ${CARD_HOVER}`} style={{ boxShadow: SHADOW_DEFAULT }}>
      <div className="p-5">
        {title && <h4 className="text-[14px] font-semibold text-[#1C1917] mb-3 leading-snug" style={FB}>{title}</h4>}
        {explanation && <p className="text-[11px] text-[#8A8785] mb-4 leading-relaxed" style={FI}>{explanation}</p>}
        <div className="space-y-4">
          {list.map((item: any, i: number) => {
            const actual = Number(item.value) || 0;
            const target = Number(item.target) || 100;
            const pct = Math.min(Math.round((actual / target) * 100), 100);
            const color = pct >= 90 ? '#1D9E75' : pct >= 70 ? '#D97706' : '#D4183D';
            return (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-[#1C1917]" style={FI}>{item.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-semibold" style={{ color, ...FM }}>{pct}%</span>
                    <span className="text-[11px] text-[#8A8785]" style={FI}>
                      {typeof actual === 'number' ? actual.toLocaleString() : actual}
                      {item.unit ? ` ${item.unit}` : ''} / {typeof target === 'number' ? target.toLocaleString() : target}{item.unit ? ` ${item.unit}` : ''}
                    </span>
                  </div>
                </div>
                <div className="h-2 bg-[#F4F2EF] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
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
  ScatterPlot: ScatterPlotComponent,
  FunnelChart: FunnelChartComponent,
  GaugeChart: GaugeChartComponent,
  ComparisonCard,
  HeatMap: HeatMapComponent,
  Sparkline: SparklineComponent,
  ComboChart: ComboChartComponent,
  PivotTable: PivotTableComponent,
  TimelineCard,
  StepList,
  Callout,
  ProgressBar,
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
