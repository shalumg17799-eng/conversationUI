// "What's new" release TOUR — a timeline-synced walkthrough.
//
// Structure: cover → one segment per feature → outro (a <Series>). Each feature
// segment plays its own narration audio and lays its beats out on that audio's
// timeline; every beat shows a full-frame, header-visible app recording with the
// spoken phrase captioned beneath it. Footage is shown WITHOUT a hard crop (a
// tiny top-anchored push only) so the app header stays on screen — the previous
// version's Ken-Burns cover-zoom was eating it.
import React from 'react';
import {
  AbsoluteFill, Audio, OffthreadVideo, Series, Sequence,
  useCurrentFrame, useVideoConfig, interpolate, spring,
} from 'remotion';
import type { ReleaseTour, TourSegment, TourHero, TourBeat } from './types';
import { THEME } from './theme';
import { FeatureMock, type MockKind } from './mock/AppMock';

export function tourDurationInFrames(tour: ReleaseTour): number {
  const f = (tour.features ?? []).reduce((a, s) => a + Math.max(1, s.durationInFrames), 0);
  return Math.max(1, (tour.cover?.durationInFrames ?? 0) + f + (tour.outro?.durationInFrames ?? 0));
}

// ── Full-frame footage shot (no crop) + synced caption ───────────────────────
const TourShot: React.FC<{ beat: TourBeat }> = ({ beat }) => {
  const frame = useCurrentFrame();
  const dur = beat.durationInFrames;
  // Gentle top-anchored push: origin 'top' means the TOP edge (header) never
  // crops; only the bottom (under the caption scrim) drifts.
  const scale = interpolate(frame, [0, dur], [1.0, 1.035], { extrapolateRight: 'clamp' });
  const capIn = interpolate(frame, [2, 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const capOut = interpolate(frame, [dur - 8, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const capOp = Math.min(capIn, capOut);
  const rise = interpolate(capOp, [0, 1], [16, 0]);

  return (
    <AbsoluteFill style={{ backgroundColor: THEME.ink }}>
      {beat.footageUrl ? (
        <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}>
          <OffthreadVideo src={beat.footageUrl} muted loop style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </AbsoluteFill>
      ) : (
        <AbsoluteFill style={{ background: `radial-gradient(120% 120% at 30% 10%, #2A211C 0%, ${THEME.ink} 70%)` }} />
      )}
      {/* Bottom scrim only — keeps the top (header) clear, darkens under caption. */}
      <AbsoluteFill style={{ background: 'linear-gradient(0deg, rgba(15,13,11,0.82) 0%, rgba(15,13,11,0.35) 16%, rgba(15,13,11,0) 34%)' }} />
      <div style={{ position: 'absolute', left: 120, right: 120, bottom: 96, opacity: capOp, transform: `translateY(${rise}px)` }}>
        <div style={{ color: THEME.white, fontSize: 52, fontWeight: 600, lineHeight: 1.28, fontFamily: THEME.fontBody, textShadow: '0 2px 20px rgba(0,0,0,0.6)', maxWidth: 1500 }}>
          {beat.text}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Persistent top-left label for the whole feature segment.
const FeatureChrome: React.FC<{ kicker?: string; heading: string }> = ({ kicker, heading }) => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: 'clamp' });
  const y = interpolate(op, [0, 1], [-14, 0]);
  return (
    <div style={{ position: 'absolute', top: 64, left: 120, right: 120, opacity: op, transform: `translateY(${y}px)` }}>
      <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 10, background: 'rgba(15,13,11,0.42)', padding: '18px 26px', borderRadius: 16, borderLeft: `5px solid ${THEME.brand}`, backdropFilter: 'blur(6px)' }}>
        {kicker && <div style={{ color: THEME.brand, fontWeight: 700, fontSize: 22, letterSpacing: 3, textTransform: 'uppercase' }}>{kicker}</div>}
        <div style={{ color: THEME.white, fontWeight: 700, fontSize: 40, lineHeight: 1.05, fontFamily: THEME.fontHeading, textShadow: '0 2px 16px rgba(0,0,0,0.5)' }}>{heading}</div>
      </div>
    </div>
  );
};

// Bottom-anchored caption that shows whichever beat's words are being spoken now
// (used over the recreated-UI mock, where footage isn't per-beat sequenced).
const CaptionOverlay: React.FC<{ beats: TourBeat[] }> = ({ beats }) => {
  const frame = useCurrentFrame();
  const active = beats.find((b) => frame >= b.startFrame && frame < b.startFrame + b.durationInFrames) ?? beats[beats.length - 1];
  if (!active) return null;
  const local = frame - active.startFrame;
  const op = Math.min(
    interpolate(local, [0, 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
    interpolate(local, [active.durationInFrames - 8, active.durationInFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
  );
  return (
    <>
      <AbsoluteFill style={{ background: 'linear-gradient(0deg, rgba(15,13,11,0.72) 0%, rgba(15,13,11,0) 22%)' }} />
      <div style={{ position: 'absolute', left: 120, right: 120, bottom: 70, opacity: op }}>
        <div style={{ color: THEME.white, fontSize: 46, fontWeight: 600, lineHeight: 1.3, textAlign: 'center', fontFamily: THEME.fontBody, textShadow: '0 2px 18px rgba(0,0,0,0.7)' }}>{active.text}</div>
      </div>
    </>
  );
};

const FeatureSegment: React.FC<{ seg: TourSegment }> = ({ seg }) => (
  <AbsoluteFill style={{ backgroundColor: THEME.ink }}>
    {seg.audioUrl && <Audio src={seg.audioUrl} />}
    {seg.mock ? (
      <>
        <FeatureMock kind={seg.mock as MockKind} />
        <CaptionOverlay beats={seg.beats} />
      </>
    ) : (
      <>
        {seg.beats.map((b, i) => (
          <Sequence key={i} from={b.startFrame} durationInFrames={Math.max(1, b.durationInFrames)} name={`beat-${i}`}>
            <TourShot beat={b} />
          </Sequence>
        ))}
        <FeatureChrome kicker={seg.kicker} heading={seg.heading} />
      </>
    )}
  </AbsoluteFill>
);

// ── Cover / Outro hero (dark, brand rule) ────────────────────────────────────
const Hero: React.FC<{ hero: TourHero }> = ({ hero }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 26 });
  const y = interpolate(s, [0, 1], [40, 0]);
  const op = interpolate(frame, [0, 16], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ backgroundColor: THEME.ink, fontFamily: THEME.fontBody }}>
      {hero.audioUrl && <Audio src={hero.audioUrl} />}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 14, background: THEME.brand }} />
      <div style={{ padding: '0 140px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', transform: `translateY(${y}px)`, opacity: op }}>
        {hero.kicker && <div style={{ color: THEME.brand, fontWeight: 700, fontSize: 30, letterSpacing: 6, textTransform: 'uppercase', marginBottom: 26 }}>{hero.kicker}</div>}
        <div style={{ color: THEME.white, fontWeight: 800, fontSize: 100, lineHeight: 1.03, fontFamily: THEME.fontHeading, maxWidth: 1500 }}>{hero.heading}</div>
        {hero.sub && <div style={{ color: '#C9C3BC', fontSize: 38, marginTop: 34, maxWidth: 1300, lineHeight: 1.35 }}>{hero.sub}</div>}
      </div>
      <div style={{ position: 'absolute', bottom: 54, left: 140, color: THEME.muted, fontSize: 24, fontWeight: 600, letterSpacing: 1 }}>Report Hub · What's New</div>
    </AbsoluteFill>
  );
};

export const ReleaseTourVideo: React.FC<{ tour: ReleaseTour }> = ({ tour }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: THEME.ink }}>
      <Series>
        <Series.Sequence durationInFrames={Math.max(1, tour.cover.durationInFrames)}>
          <Hero hero={tour.cover} />
        </Series.Sequence>
        {tour.features.map((seg, i) => (
          <Series.Sequence key={i} durationInFrames={Math.max(1, seg.durationInFrames)}>
            <FeatureSegment seg={seg} />
          </Series.Sequence>
        ))}
        <Series.Sequence durationInFrames={Math.max(1, tour.outro.durationInFrames)}>
          <Hero hero={tour.outro} />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
