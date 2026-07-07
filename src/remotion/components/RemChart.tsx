// Choreographed, frame-driven chart for report videos. Pure SVG (deterministic
// for the server render). Beyond drawing the data, it stages a little story:
// axes fade in → series draw → the KEY data point (the peak) gets spotlighted
// with a pulsing marker and a value callout, while the rest recedes. That's what
// makes the narration's point land visually. Supports bar / line / area / pie.
import React from 'react';
import { useCurrentFrame, interpolate, useVideoConfig, spring } from 'remotion';
import type { ChartVisual } from '../types';
import { THEME } from '../theme';

const fmt = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};
const argmax = (a: number[]) => a.reduce((best, v, i) => (Number.isFinite(v) && v > a[best] ? i : best), 0);

export const RemChart: React.FC<{ chart: ChartVisual; width: number; height: number; accent?: string; durationInFrames?: number }> = ({ chart, width, height, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const grow = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 26 });

  const pad = { top: 40, right: 40, bottom: 58, left: 82 };
  const iw = width - pad.left - pad.right;
  const ih = height - pad.top - pad.bottom;
  const color = accent ? `#${accent}` : THEME.series[0];

  const values = chart.series[0]?.values ?? [];
  const finite = values.filter(Number.isFinite);
  const maxV = Math.max(...finite, 1);
  const minV = Math.min(0, ...finite);
  const yOf = (v: number) => pad.top + ih - ((v - minV) / (maxV - minV || 1)) * ih;
  const n = chart.labels.length;
  const peak = argmax(values);

  // Emphasis ramp: once the series is drawn (~frame 34), focus the peak and
  // recede the rest. A gentle pulse keeps it alive.
  const focus = interpolate(frame, [34, 50], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const pulse = 0.5 + 0.5 * Math.sin(Math.max(0, frame - 40) / 7);
  const axisOp = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: 'clamp' });

  const axis = chart.chartKind !== 'pie' && (
    <g opacity={axisOp}>
      {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
        const gy = pad.top + ih * t;
        const val = maxV - (maxV - minV) * t;
        return (
          <g key={i}>
            <line x1={pad.left} y1={gy} x2={pad.left + iw} y2={gy} stroke={THEME.line} strokeWidth={1} />
            <text x={pad.left - 14} y={gy + 6} textAnchor="end" fontSize={20} fill={THEME.muted} fontFamily={THEME.fontMono}>{fmt(val)}</text>
          </g>
        );
      })}
      {chart.labels.map((l, i) => {
        const step = Math.ceil(n / 9);
        if (i % step !== 0 && i !== n - 1 && i !== peak) return null;
        const x = pad.left + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
        const isPeak = i === peak;
        return <text key={i} x={x} y={pad.top + ih + 34} textAnchor="middle" fontSize={20} fontWeight={isPeak ? 700 : 400} fill={isPeak ? THEME.ink : THEME.muted}>{String(l).length > 12 ? String(l).slice(0, 11) + '…' : l}</text>;
      })}
    </g>
  );

  // Callout bubble for the peak value.
  const callout = (cx: number, cy: number, text: string) => {
    const op = interpolate(frame, [42, 54], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const w = Math.max(90, text.length * 17 + 34), h = 52;
    const x = Math.min(Math.max(cx - w / 2, pad.left), pad.left + iw - w);
    const y = Math.max(cy - h - 20, 4);
    return (
      <g opacity={op} transform={`translate(0, ${interpolate(op, [0, 1], [8, 0])})`}>
        <rect x={x} y={y} width={w} height={h} rx={12} fill={THEME.ink} />
        <text x={x + w / 2} y={y + h / 2 + 8} textAnchor="middle" fontSize={26} fontWeight={800} fill="#FFFFFF" fontFamily={THEME.fontMono}>{text}</text>
        <path d={`M${cx - 8} ${y + h} L${cx + 8} ${y + h} L${cx} ${y + h + 12} Z`} fill={THEME.ink} />
      </g>
    );
  };

  let body: React.ReactNode = null;
  let peakCallout: React.ReactNode = null;

  if (chart.chartKind === 'bar') {
    const bw = (iw / n) * 0.62;
    body = chart.labels.map((_, i) => {
      const v = values[i] ?? 0;
      const full = yOf(minV) - yOf(v);
      const g = spring({ frame: frame - 6 - i * 2, fps, config: { damping: 200 }, durationInFrames: 20 });
      const h = Math.max(0, full * g);
      const x = pad.left + (i + 0.5) * (iw / n) - bw / 2;
      const isPeak = i === peak;
      const baseColor = accent ? color : THEME.series[i % THEME.series.length];
      const opacity = isPeak ? 1 : 1 - 0.55 * focus;
      const lift = isPeak ? focus * pulse * 6 : 0;
      return (
        <g key={i}>
          {isPeak && <rect x={x - 6} y={yOf(minV) - h - 6 - lift} width={bw + 12} height={h + 6} rx={10} fill={color} opacity={0.16 * focus} />}
          <rect x={x} y={yOf(minV) - h - lift} width={bw} height={h} rx={7} fill={baseColor} opacity={opacity} />
        </g>
      );
    });
    const px = pad.left + (peak + 0.5) * (iw / n);
    peakCallout = callout(px, yOf(values[peak] ?? 0), fmt(values[peak] ?? 0));
  } else if (chart.chartKind === 'line' || chart.chartKind === 'area') {
    const pts = values.map((v, i) => [pad.left + (n === 1 ? iw / 2 : (i / (n - 1)) * iw), yOf(v ?? 0)] as const);
    const shown = Math.max(1, Math.floor(pts.length * grow));
    const visible = pts.slice(0, shown);
    const d = visible.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    const pk = pts[peak];
    body = (
      <>
        {chart.chartKind === 'area' && visible.length > 1 && (
          <path d={`${d} L${visible[visible.length - 1][0].toFixed(1)} ${yOf(minV)} L${visible[0][0].toFixed(1)} ${yOf(minV)} Z`} fill={color} fillOpacity={0.16} />
        )}
        <path d={d} fill="none" stroke={color} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
        {visible.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={i === peak ? 4 : 4} fill={color} opacity={0.5} />)}
        {/* spotlight on the peak */}
        {pk && (
          <g opacity={focus}>
            <circle cx={pk[0]} cy={pk[1]} r={14 + pulse * 8} fill={color} opacity={0.18} />
            <circle cx={pk[0]} cy={pk[1]} r={9} fill={color} stroke="#fff" strokeWidth={3} />
          </g>
        )}
      </>
    );
    if (pk) peakCallout = callout(pk[0], pk[1], fmt(values[peak] ?? 0));
  } else {
    // pie — animated sweep, largest slice pops
    const total = finite.reduce((a, b) => a + b, 0) || 1;
    const cx = pad.left + iw / 2, cy = pad.top + ih / 2, r = Math.min(iw, ih) / 2 - 10;
    let a0 = -Math.PI / 2;
    const sweep = grow;
    body = (
      <>
        {chart.labels.map((_, i) => {
          const frac = (values[i] ?? 0) / total;
          const a1 = a0 + frac * Math.PI * 2 * sweep;
          const large = a1 - a0 > Math.PI ? 1 : 0;
          const mid = (a0 + a1) / 2;
          const popOut = i === peak ? focus * 14 : 0;
          const ox = Math.cos(mid) * popOut, oy = Math.sin(mid) * popOut;
          const p0 = [cx + ox + r * Math.cos(a0), cy + oy + r * Math.sin(a0)];
          const p1 = [cx + ox + r * Math.cos(a1), cy + oy + r * Math.sin(a1)];
          const seg = <path key={i} d={`M${cx + ox} ${cy + oy} L${p0[0].toFixed(1)} ${p0[1].toFixed(1)} A${r} ${r} 0 ${large} 1 ${p1[0].toFixed(1)} ${p1[1].toFixed(1)} Z`} fill={THEME.series[i % THEME.series.length]} stroke={THEME.paper} strokeWidth={3} opacity={i === peak ? 1 : 1 - 0.3 * focus} />;
          a0 = a1;
          return seg;
        })}
        <circle cx={cx} cy={cy} r={r * 0.5} fill={THEME.paper} />
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize={22} fill={THEME.muted}>{String(chart.labels[peak]).slice(0, 14)}</text>
        <text x={cx} y={cy + 30} textAnchor="middle" fontSize={40} fontWeight={800} fill={THEME.ink} fontFamily={THEME.fontMono} opacity={focus}>{`${((values[peak] ?? 0) / total * 100).toFixed(0)}%`}</text>
      </>
    );
  }

  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      {axis}
      {body}
      {peakCallout}
      {chart.chartKind === 'pie' && chart.labels.slice(0, 6).map((l, i) => (
        <g key={i} transform={`translate(${width - 250}, ${44 + i * 42})`} opacity={interpolate(frame, [10 + i * 3, 24 + i * 3], [0, 1], { extrapolateRight: 'clamp' })}>
          <rect width={22} height={22} rx={4} fill={THEME.series[i % THEME.series.length]} />
          <text x={32} y={18} fontSize={22} fill={THEME.ink}>{String(l).length > 15 ? String(l).slice(0, 14) + '…' : l}</text>
        </g>
      ))}
    </svg>
  );
};
