// Scene components — one per SceneKind. Each reads a VideoScene and renders its
// visual + on-screen text. Narration (audio) is layered by ReportVideo in Phase 2.
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig, Easing } from 'remotion';
import type { VideoScene } from './types';
import { THEME } from './theme';
import { SceneFrame } from './components/SceneFrame';
import { RemChart } from './components/RemChart';
import { BackgroundVideo } from './components/BackgroundVideo';

// Parse a display metric ("$912K", "64.06%", "10,565,731") into parts so the
// number can count up while keeping its prefix/suffix/decimals.
function parseMetric(value: string): { prefix: string; num: number; decimals: number; suffix: string } | null {
  const m = String(value).match(/^(\D*?)([\d,]+(?:\.\d+)?)(.*)$/);
  if (!m) return null;
  const numStr = m[2].replace(/,/g, '');
  const dot = numStr.indexOf('.');
  return { prefix: m[1] ?? '', num: parseFloat(numStr), decimals: dot >= 0 ? numStr.length - dot - 1 : 0, suffix: m[3] ?? '' };
}

// Count-up number; falls back to the raw string if it can't be parsed.
const AnimatedNumber: React.FC<{ value: string; startFrame?: number }> = ({ value, startFrame = 8 }) => {
  const frame = useCurrentFrame();
  const p = parseMetric(value);
  if (!p) return <>{value}</>;
  const t = interpolate(frame, [startFrame, startFrame + 26], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const cur = p.num * t;
  const body = cur.toLocaleString('en-US', { minimumFractionDigits: p.decimals, maximumFractionDigits: p.decimals });
  return <>{p.prefix}{body}{p.suffix}</>;
};

const bulletsBlock = (bullets: string[] | undefined, startFrame = 14, color: string = THEME.ink) => {
  if (!bullets?.length) return null;
  return <BulletList bullets={bullets} startFrame={startFrame} color={color} />;
};

const BulletList: React.FC<{ bullets: string[]; startFrame?: number; color?: string }> = ({ bullets, startFrame = 14, color = THEME.ink }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {bullets.map((b, i) => {
        const op = interpolate(frame, [startFrame + i * 8, startFrame + i * 8 + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const x = interpolate(op, [0, 1], [-20, 0]);
        return (
          <div key={i} style={{ opacity: op, transform: `translateX(${x}px)`, display: 'flex', alignItems: 'flex-start', gap: 18 }}>
            <div style={{ width: 14, height: 14, borderRadius: 7, background: THEME.brand, marginTop: 16, flexShrink: 0 }} />
            <div style={{ color, fontSize: 34, lineHeight: 1.3 }}>{b}</div>
          </div>
        );
      })}
    </div>
  );
};

// ── Cover / Outro (dark hero) ────────────────────────────────────────────────
const HeroScene: React.FC<{ scene: VideoScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 24 });
  const y = interpolate(s, [0, 1], [40, 0]);
  const op = interpolate(frame, [0, 16], [0, 1], { extrapolateRight: 'clamp' });
  const t = scene.onScreenText;
  const bg = scene.visual.backgroundVideo;
  return (
    <AbsoluteFill style={{ backgroundColor: THEME.ink, fontFamily: THEME.fontBody }}>
      {bg && <BackgroundVideo src={bg} overlay={0.6} />}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 14, background: THEME.brand }} />
      <div style={{ padding: '0 140px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', transform: `translateY(${y}px)`, opacity: op }}>
        {t.kicker && <div style={{ color: THEME.brand, fontWeight: 700, fontSize: 30, letterSpacing: 6, textTransform: 'uppercase', marginBottom: 26 }}>{t.kicker}</div>}
        {t.heading && <div style={{ color: THEME.white, fontWeight: 800, fontSize: 104, lineHeight: 1.03, fontFamily: THEME.fontHeading, maxWidth: 1500 }}>{t.heading}</div>}
        {t.sub && <div style={{ color: '#C9C3BC', fontSize: 36, marginTop: 34, maxWidth: 1300, lineHeight: 1.35 }}>{t.sub}</div>}
      </div>
      <div style={{ position: 'absolute', bottom: 54, left: 140, color: THEME.muted, fontSize: 24, fontWeight: 600, letterSpacing: 1 }}>Talk · Analytics</div>
    </AbsoluteFill>
  );
};

// ── Key metrics ──────────────────────────────────────────────────────────────
// Cards pop in, numbers count up, then a spotlight walks across the metrics one
// at a time (paced to the scene length) so it feels like the narration is
// stepping through them rather than a static grid.
const KpiScene: React.FC<{ scene: VideoScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const kpis = scene.visual.kpis ?? [];
  const dur = scene.durationInFrames;

  const sweepStart = 46;
  const perCard = Math.max(24, (dur - sweepStart - 12) / Math.max(1, kpis.length));
  const active = frame < sweepStart ? -1 : Math.min(kpis.length - 1, Math.floor((frame - sweepStart) / perCard));

  return (
    <SceneFrame kicker={scene.onScreenText.kicker} heading={scene.onScreenText.heading}>
      <div style={{ display: 'flex', gap: 34, marginTop: 30, flexWrap: 'wrap' }}>
        {kpis.map((k, i) => {
          const pop = spring({ frame: frame - 10 - i * 6, fps, config: { damping: 180 }, durationInFrames: 18 });
          const isActive = i === active;
          const lift = isActive ? interpolate(Math.sin((frame - sweepStart) / 6), [-1, 1], [0, 1]) * 4 : 0;
          const sc = interpolate(pop, [0, 1], [0.9, 1]) * (isActive ? 1.03 : 1);
          return (
            <div key={i} style={{
              flex: '1 1 340px', minWidth: 340, background: THEME.white,
              border: `${isActive ? 2 : 1}px solid ${isActive ? THEME.brand : THEME.line}`,
              borderRadius: 20, padding: '40px 42px',
              transform: `scale(${sc}) translateY(${-lift}px)`,
              opacity: interpolate(pop, [0, 1], [0, 1]) * (active >= 0 && !isActive ? 0.82 : 1),
              boxShadow: isActive ? `0 16px 40px ${THEME.brand}33` : '0 4px 18px rgba(0,0,0,0.04)',
            }}>
              <div style={{ color: isActive ? THEME.brand : THEME.muted, fontSize: 24, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 20 }}>{k.label}</div>
              <div style={{ color: THEME.ink, fontSize: 72, fontWeight: 800, fontFamily: THEME.fontMono, lineHeight: 1 }}>
                <AnimatedNumber value={k.value} startFrame={12 + i * 5} />
              </div>
              {k.trend && <div style={{ color: THEME.brand, fontSize: 26, marginTop: 16 }}>{k.trend}</div>}
            </div>
          );
        })}
      </div>
    </SceneFrame>
  );
};

// ── Chart ────────────────────────────────────────────────────────────────────
const ChartScene: React.FC<{ scene: VideoScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const c = scene.visual.chart!;
  // Gentle continuous push so the frame breathes.
  const zoom = interpolate(frame, [0, scene.durationInFrames], [1, 1.03], { extrapolateRight: 'clamp' });
  return (
    <SceneFrame kicker={scene.onScreenText.kicker} heading={scene.onScreenText.heading} sub={scene.onScreenText.sub}>
      <div style={{ display: 'flex', gap: 50, height: '100%', alignItems: 'center' }}>
        <div style={{ flex: '1 1 62%', transformOrigin: 'center', transform: `scale(${zoom})` }}>
          <RemChart chart={c} width={1020} height={560} accent={scene.visual.accent} durationInFrames={scene.durationInFrames} />
        </div>
        <div style={{ flex: '1 1 38%' }}>
          <div style={{ color: THEME.brand, fontSize: 24, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 26 }}>What the data shows</div>
          {/* first bullet (the peak) reveals right as the chart spotlights it */}
          {bulletsBlock(scene.onScreenText.bullets, 44)}
        </div>
      </div>
    </SceneFrame>
  );
};

// ── Insights ─────────────────────────────────────────────────────────────────
const InsightScene: React.FC<{ scene: VideoScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bg = scene.visual.backgroundVideo;
  const t = scene.onScreenText;

  // Clean (paper) version when there's no footage.
  if (!bg) {
    return (
      <SceneFrame kicker={t.kicker} heading={t.heading}>
        <div style={{ marginTop: 40, maxWidth: 1500 }}>{bulletsBlock(t.bullets, 14)}</div>
      </SceneFrame>
    );
  }

  // Cinematic version over B-roll.
  const rise = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 22 });
  const y = interpolate(rise, [0, 1], [30, 0]);
  const op = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ backgroundColor: THEME.ink, fontFamily: THEME.fontBody }}>
      <BackgroundVideo src={bg} overlay={0.66} />
      <div style={{ padding: '90px 110px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ transform: `translateY(${y}px)`, opacity: op }}>
          {t.kicker && <div style={{ color: THEME.brand, fontWeight: 700, fontSize: 26, letterSpacing: 4, textTransform: 'uppercase', marginBottom: 14 }}>{t.kicker}</div>}
          {t.heading && <div style={{ color: THEME.white, fontWeight: 800, fontSize: 72, lineHeight: 1.05, marginBottom: 40, fontFamily: THEME.fontHeading }}>{t.heading}</div>}
          <div style={{ maxWidth: 1500 }}>{bulletsBlock(t.bullets, 14, THEME.white)}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── Table ────────────────────────────────────────────────────────────────────
const TableScene: React.FC<{ scene: VideoScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const t = scene.visual.table!;
  return (
    <SceneFrame kicker={scene.onScreenText.kicker} heading={scene.onScreenText.heading}>
      <div style={{ marginTop: 30, background: THEME.white, border: `1px solid ${THEME.line}`, borderRadius: 18, overflow: 'hidden' }}>
        <div style={{ display: 'flex', background: THEME.ink }}>
          {t.columns.map((c, i) => <div key={i} style={{ flex: 1, color: THEME.white, fontWeight: 700, fontSize: 26, padding: '22px 26px' }}>{c}</div>)}
        </div>
        {t.rows.map((row, ri) => {
          const op = interpolate(frame, [10 + ri * 5, 10 + ri * 5 + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          // Spotlight the top row once the table has settled.
          const hi = ri === 0 ? interpolate(frame, [10 + t.rows.length * 5 + 6, 10 + t.rows.length * 5 + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 0;
          const bg = ri === 0 ? `rgba(212,87,42,${0.06 + 0.06 * hi})` : ri % 2 ? THEME.white : THEME.paper;
          return (
            <div key={ri} style={{ display: 'flex', background: bg, opacity: op, borderLeft: `${4 * hi}px solid ${THEME.brand}` }}>
              {row.map((cell, ci) => <div key={ci} style={{ flex: 1, color: THEME.ink, fontSize: 25, fontWeight: ri === 0 ? 700 : 400, padding: '20px 26px', fontFamily: ci === 0 ? THEME.fontBody : THEME.fontMono }}>{cell}</div>)}
            </div>
          );
        })}
      </div>
    </SceneFrame>
  );
};

export const Scene: React.FC<{ scene: VideoScene }> = ({ scene }) => {
  switch (scene.visual.kind) {
    case 'cover': case 'outro': return <HeroScene scene={scene} />;
    case 'kpis': return <KpiScene scene={scene} />;
    case 'chart': return <ChartScene scene={scene} />;
    case 'insight': return <InsightScene scene={scene} />;
    case 'table': return <TableScene scene={scene} />;
    default: return <SceneFrame heading={scene.onScreenText.heading} />;
  }
};
