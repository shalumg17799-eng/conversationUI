// Faithful in-Remotion recreation of the Report Hub UI, used as the "footage" for
// the what's-new tour instead of fragile headless screen-capture. Reuses the real
// design (tokens, layout, the exact Export menu items from ExportMenu.tsx) so it
// looks like the actual app, but is fully deterministic and pixel-controlled.
//
// Three feature scenes:
//   chat-kpi     — a prompt sent + the model returning a report with KPI cards + chart
//   export-docs  — the report's "Export as" menu open, PDF / Excel / PPT highlighted
//   export-video — the same menu with "Video (MP4)" highlighted
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig, Easing } from 'remotion';

const C = {
  ink: '#1A1917', body: '#3A3733', sub: '#8A8785', faint: '#B0ADA7',
  line: '#ECEAE6', hair: '#F0EEE9', paper: '#F7F5F2', white: '#FFFFFF',
  brand: '#D4572A', brandSoft: '#FDE7DE', indigo: '#4F46E5',
  blueTop: '#5B8DEF', blueBot: '#2F6BFF', green: '#0D9488',
  font: 'Inter, sans-serif', head: '"Bricolage Grotesque", Inter, sans-serif', mono: '"JetBrains Mono", monospace',
};

const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };
const rev = (frame: number, a: number, b: number) => interpolate(frame, [a, b], [0, 1], clamp);

// Count-up number that keeps a prefix/suffix (e.g. "88.96%").
const Num: React.FC<{ value: string; start: number }> = ({ value, start }) => {
  const frame = useCurrentFrame();
  const m = String(value).match(/^(\D*?)([\d,]+(?:\.\d+)?)(.*)$/);
  if (!m) return <>{value}</>;
  const num = parseFloat(m[2].replace(/,/g, ''));
  const dot = m[2].indexOf('.'); const dec = dot >= 0 ? m[2].length - dot - 1 : 0;
  const t = interpolate(frame, [start, start + 26], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  return <>{m[1]}{(num * t).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}{m[3]}</>;
};

// ── App chrome ───────────────────────────────────────────────────────────────
const Icon: React.FC<{ d: string; size?: number; color?: string; sw?: number; fill?: string }> = ({ d, size = 20, color = C.faint, sw = 1.7, fill = 'none' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{<path d={d} />}</svg>
);
const P = {
  search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35', bell: 'M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0',
  clap: 'M20.2 6L3 11l-.9-2.4c-.3-.8.1-1.7.9-2l12.2-4.5c.8-.3 1.7.1 2 .9L20.2 6zM3 11h18v8a2 2 0 01-2 2H5a2 2 0 01-2-2v-8z',
  chat: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z', grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  doc: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6', db: 'M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3zM4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5',
  layers: 'M12 2L2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5', shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  down: 'M12 5v14M19 12l-7 7-7-7', chev: 'M6 9l6 6 6-6', sparkle: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z',
  fileText: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  sheet: 'M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zM3 9h18M3 15h18M9 3v18M15 3v18',
  present: 'M2 3h20M3 3v11a2 2 0 002 2h14a2 2 0 002-2V3M12 16v5M8 21h8', eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 15a3 3 0 100-6 3 3 0 000 6z',
};

const railItems = [
  { p: P.chat, label: 'Talk', active: true }, { p: P.grid, label: 'Dashboard' }, { p: P.doc, label: 'Reports' },
  { p: P.db, label: 'Datasets' }, { p: P.layers, label: 'Platforms' }, { p: P.shield, label: 'Governance' },
];
const convos = ['Territory Performance Overview', 'Market Segmentation Analysis', 'SU&G Sales Transactions', 'Explore reports'];

const Header: React.FC = () => (
  <div style={{ height: 72, background: C.white, borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', padding: '0 26px', gap: 20, flexShrink: 0 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 250 }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: C.ink }} />
      <span style={{ fontWeight: 700, fontSize: 19, color: C.ink }}>Report Hub</span>
      <span style={{ fontSize: 12, color: C.sub, background: C.hair, padding: '3px 9px', borderRadius: 6 }}>Demo</span>
    </div>
    <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: 660, height: 46, background: '#F3F1EE', borderRadius: 23, display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px' }}>
        <Icon d={P.search} size={18} color={C.faint} />
        <span style={{ color: C.faint, fontSize: 15 }}>Search insights, reports, datasets...</span>
      </div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, width: 250, justifyContent: 'flex-end' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: C.white, border: `1px solid ${C.line}`, borderRadius: 22, padding: '6px 12px 6px 6px' }}>
        <div style={{ width: 30, height: 30, borderRadius: 15, background: C.indigo, color: '#fff', fontSize: 12, fontWeight: 700, display: 'grid', placeItems: 'center' }}>MD</div>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>Marketing Director</span>
        <Icon d={P.chev} size={16} color={C.faint} />
      </div>
      <Icon d={P.clap} size={22} color={C.sub} />
      <Icon d={P.bell} size={22} color={C.sub} />
    </div>
  </div>
);

const Rail: React.FC = () => (
  <div style={{ width: 74, background: C.white, borderRight: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 14, gap: 4, flexShrink: 0 }}>
    {railItems.map((it, i) => (
      <div key={i} style={{ width: 60, padding: '9px 0', borderRadius: 11, background: it.active ? C.brandSoft : 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        <Icon d={it.p} size={20} color={it.active ? C.brand : C.faint} />
        <span style={{ fontSize: 9, color: it.active ? C.brand : C.faint }}>{it.label}</span>
      </div>
    ))}
  </div>
);

const TalkPanel: React.FC<{ activeTitle?: string }> = ({ activeTitle }) => (
  <div style={{ width: 250, background: C.white, borderRight: `1px solid ${C.line}`, padding: 18, flexShrink: 0 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
      <span style={{ fontSize: 17, fontWeight: 600, color: C.ink }}>Talk</span>
      <span style={{ background: C.ink, color: '#fff', fontSize: 12, fontWeight: 600, padding: '7px 14px', borderRadius: 8 }}>+ New</span>
    </div>
    {activeTitle && (
      <div style={{ padding: '11px 12px', borderRadius: 9, background: '#FEF3EF', marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{activeTitle}</div>
        <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>0 minutes ago</div>
      </div>
    )}
    {convos.map((t, i) => (
      <div key={i} style={{ padding: '11px 12px' }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: C.body }}>{t}</div>
        <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>{i + 1} day ago</div>
      </div>
    ))}
  </div>
);

const AppFrame: React.FC<{ children: React.ReactNode; activeTitle?: string }> = ({ children, activeTitle }) => (
  <AbsoluteFill style={{ background: C.white, fontFamily: C.font }}>
    <Header />
    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      <Rail />
      <TalkPanel activeTitle={activeTitle} />
      <div style={{ flex: 1, background: C.paper, position: 'relative', overflow: 'hidden' }}>{children}</div>
    </div>
  </AbsoluteFill>
);

// ── Report widgets ───────────────────────────────────────────────────────────
const KPIS = [
  { label: 'AVG RIS SCORE', value: '88.96%' }, { label: 'AVG RETURN RATE', value: '3.92%' },
  { label: 'AVG AARD', value: '26.69%' }, { label: 'AVG TAKE RATE', value: '64.06%' },
];
const RIS = [90, 88, 84, 89, 87, 89, 82.6, 87, 93.62, 91, 86, 88, 87, 86, 86.37, 91.8, 88.76, 86.57, 87, 84.4];

const ExportButton: React.FC<{ open?: boolean }> = ({ open }) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 13px', fontSize: 14, fontWeight: 600, borderRadius: 9, border: `1px solid ${open ? C.brand : C.line}`, color: C.brand, background: C.white }}>
    <Icon d={P.down} size={15} color={C.brand} /> Export as <Icon d={P.chev} size={15} color={C.brand} />
  </div>
);

const menuRows = [
  { p: P.fileText, label: 'PDF', hint: 'Formatted document' },
  { p: P.sheet, label: 'Excel', hint: 'Spreadsheet workbook' },
  { p: P.present, label: 'PPT', hint: 'Presentation deck' },
  { p: P.clap, label: 'Video (MP4)', hint: 'Renders in the video tray' },
  { p: P.eye, label: 'Preview video', hint: 'Play instantly, no export' },
];
const CursorSvg: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <div style={{ position: 'absolute', left: x, top: y, zIndex: 60, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.35))' }}>
    <svg width="30" height="30" viewBox="0 0 24 24"><path d="M4 2 L4 20 L9 15 L12.5 22.5 L15.5 21 L12 13.5 L19 13.5 Z" fill="#fff" stroke="#1A1917" strokeWidth="1.4" strokeLinejoin="round" /></svg>
  </div>
);

const MenuRow: React.FC<{ r: { p: string; label: string; hint: string }; hot?: boolean }> = ({ r, hot }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '17px 18px', background: hot ? '#FBF3EF' : C.white }}>
    <Icon d={r.p} size={22} color={C.brand} sw={1.8} />
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontSize: 17, fontWeight: 600, color: C.ink, lineHeight: 1.2 }}>{r.label}</span>
      <span style={{ fontSize: 13, color: C.sub, lineHeight: 1.2 }}>{r.hint}</span>
    </div>
  </div>
);

// Menu with a spotlight ring wrapped AROUND the target rows (so it always aligns,
// no coordinate math) plus a cursor pointing at them.
const ExportMenuMock: React.FC<{ reveal: number; hoverRow?: number; spot?: { start: number; count: number } }> = ({ reveal, hoverRow, spot }) => {
  const rowH = 74;
  const curY = spot ? (spot.start + spot.count / 2) * rowH - 12 : 0;
  return (
    <div style={{ position: 'relative', width: 300, transformOrigin: 'top right', transform: `scale(${interpolate(reveal, [0, 1], [0.9, 1])})`, opacity: reveal }}>
      <div style={{ width: 300, borderRadius: 16, border: `1px solid ${C.line}`, background: C.white, boxShadow: '0 20px 50px rgba(0,0,0,0.16)', overflow: 'hidden' }}>
        {menuRows.map((r, i) => <MenuRow key={i} r={r} hot={hoverRow === i} />)}
      </div>
      {/* Spotlight ring as a non-clipped overlay so its top edge isn't cut by the menu radius. */}
      {spot && (
        <div style={{
          position: 'absolute', left: -3, width: 306,
          top: spot.start * rowH - 3, height: spot.count * rowH + 6,
          border: `3px solid ${C.brand}`, borderRadius: 12,
          boxShadow: '0 0 0 5px rgba(212,87,42,0.16)', pointerEvents: 'none',
        }} />
      )}
      {spot && <CursorSvg x={224} y={curY} />}
    </div>
  );
};

const KpiRow: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ display: 'flex', gap: 18, marginTop: 22 }}>
      {KPIS.map((k, i) => {
        const pop = spring({ frame: frame - startFrame - i * 6, fps, config: { damping: 180 }, durationInFrames: 16 });
        return (
          <div key={i} style={{ flex: 1, background: C.white, border: `1px solid ${C.line}`, borderRadius: 16, padding: '22px 24px', opacity: pop, transform: `scale(${interpolate(pop, [0, 1], [0.94, 1])})` }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: 1, color: C.sub, marginBottom: 12 }}>{k.label}</div>
            <div style={{ fontSize: 40, fontWeight: 800, color: C.ink, fontFamily: C.mono, lineHeight: 1 }}><Num value={k.value} start={startFrame + i * 6 + 4} /></div>
            <div style={{ fontSize: 13, color: C.faint, marginTop: 10 }}>— neutral</div>
          </div>
        );
      })}
    </div>
  );
};

const BarChart: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const grow = rev(frame, startFrame, startFrame + 40);
  return (
    <div style={{ marginTop: 22, background: C.white, border: `1px solid ${C.line}`, borderRadius: 16, padding: 26 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>RIS Score by Territory (Retention Index)</div>
      <div style={{ fontSize: 13, color: C.sub, marginTop: 4 }}>Higher RIS = stronger retention. T-009 leads at 93.62%; T-007 lags at 82.6%.</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 210, marginTop: 20, paddingLeft: 8 }}>
        {RIS.map((v, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ width: '100%', height: (v / 100) * 190 * grow, background: `linear-gradient(180deg, ${C.blueTop}, ${C.blueBot})`, borderRadius: '4px 4px 0 0' }} />
            <span style={{ fontSize: 10, color: C.faint }}>T-{String(i + 1).padStart(3, '0')}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const ReportCard: React.FC<{ frame: number; withChart?: boolean; menu?: React.ReactNode; exportOpen?: boolean }> = ({ frame, withChart, menu, exportOpen }) => {
  const appear = rev(frame, 6, 24);
  return (
    <div style={{ background: C.white, border: `1px solid ${C.line}`, borderRadius: 20, padding: 30, opacity: appear, transform: `translateY(${interpolate(appear, [0, 1], [16, 0])}px)` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon d={P.sparkle} size={20} color={C.brand} fill={C.brand} sw={0} />
          <span style={{ fontSize: 21, fontWeight: 700, color: C.ink }}>Network Churn &amp; Retention Metrics Overview</span>
        </div>
        <div style={{ position: 'relative', zIndex: 50 }}>
          <ExportButton open={exportOpen} />
          {menu && <div style={{ position: 'absolute', right: 0, top: 46 }}>{menu}</div>}
        </div>
      </div>
      <div style={{ fontSize: 15, color: C.sub, marginTop: 12, maxWidth: 1100, lineHeight: 1.5 }}>
        Across territories in April 2026, RIS ranges from 82.6% (T-007) to 93.62% (T-009). Return rates span 2.94% to 4.84%; AARD sits between 21.61% and 30.78%.
      </div>
      <div style={{ fontSize: 12, color: C.faint, marginTop: 8 }}>50 rows from BigQuery</div>
      <KpiRow startFrame={26} />
      {withChart && <BarChart startFrame={70} />}
    </div>
  );
};

// Synthetic cursor that eases between waypoints (in main-area coordinates).
const Cursor: React.FC<{ points: Array<{ f: number; x: number; y: number }> }> = ({ points }) => {
  const frame = useCurrentFrame();
  let x = points[0].x, y = points[0].y;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    if (frame >= a.f) {
      const t = interpolate(frame, [a.f, b.f], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
      x = interpolate(t, [0, 1], [a.x, b.x]); y = interpolate(t, [0, 1], [a.y, b.y]);
    }
  }
  return (
    <div style={{ position: 'absolute', left: x, top: y, zIndex: 50, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.3))' }}>
      <svg width="30" height="30" viewBox="0 0 24 24"><path d="M4 2 L4 20 L9 15 L12.5 22.5 L15.5 21 L12 13.5 L19 13.5 Z" fill="#fff" stroke="#1A1917" strokeWidth="1.4" strokeLinejoin="round" /></svg>
    </div>
  );
};

// ── Feature scenes ───────────────────────────────────────────────────────────
const PromptBubble: React.FC = () => {
  const frame = useCurrentFrame();
  const op = rev(frame, 4, 16);
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', opacity: op, transform: `translateY(${interpolate(op, [0, 1], [10, 0])}px)` }}>
      <div style={{ background: C.ink, color: '#fff', fontSize: 16, fontWeight: 500, padding: '13px 20px', borderRadius: 14 }}>Show me network churn &amp; retention metrics by territory</div>
    </div>
  );
};

const FeatureChatKpi: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AppFrame activeTitle="Network Churn &amp; Retention">
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <div style={{ padding: '34px 60px', display: 'flex', flexDirection: 'column', gap: 22, transform: `translateY(${interpolate(rev(frame, 60, 200), [0, 1], [0, -140])}px)` }}>
          <PromptBubble />
          <div style={{ opacity: rev(frame, 28, 44) }}><ReportCard frame={frame - 24} withChart /></div>
        </div>
      </div>
    </AppFrame>
  );
};

const FeatureExport: React.FC<{ target: 'docs' | 'video' }> = ({ target }) => {
  const frame = useCurrentFrame();
  const menuOpen = rev(frame, 44, 60);
  const spot = frame > 68 ? (target === 'video' ? { start: 3, count: 1 } : { start: 0, count: 3 }) : undefined;
  const hoverRow = frame > 66 ? (target === 'video' ? 3 : (frame > 150 ? 2 : frame > 108 ? 1 : 0)) : undefined;
  return (
    <AppFrame activeTitle="Network Churn &amp; Retention">
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <div style={{ padding: '34px 60px' }}>
          <ReportCard frame={frame} exportOpen={frame > 44} menu={menuOpen > 0 ? <ExportMenuMock reveal={menuOpen} hoverRow={hoverRow} spot={spot} /> : null} />
        </div>
      </div>
    </AppFrame>
  );
};

export type MockKind = 'chat-kpi' | 'export-docs' | 'export-video';
export const FeatureMock: React.FC<{ kind: MockKind }> = ({ kind }) => {
  if (kind === 'export-docs') return <FeatureExport target="docs" />;
  if (kind === 'export-video') return <FeatureExport target="video" />;
  return <FeatureChatKpi />;
};
