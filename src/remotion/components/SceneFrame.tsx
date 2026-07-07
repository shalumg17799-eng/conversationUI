// Shared chrome for a content scene: paper background, terracotta rule,
// kicker + heading that spring in, and a footer wordmark. Children hold the
// scene-specific visual. Entrance is driven by the frame, so renders are
// deterministic.
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { THEME } from '../theme';

export const SceneFrame: React.FC<{
  kicker?: string;
  heading?: string;
  sub?: string;
  children?: React.ReactNode;
}> = ({ kicker, heading, sub, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 20 });
  const y = interpolate(rise, [0, 1], [24, 0]);
  const op = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' });

  // Subtle drifting glow so data scenes have gentle motion (never static).
  const driftX = interpolate(frame % 480, [0, 240, 480], [-6, 6, -6]);
  const driftY = interpolate(frame % 600, [0, 300, 600], [4, -4, 4]);

  return (
    <AbsoluteFill style={{ backgroundColor: THEME.paper, fontFamily: THEME.fontBody, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute', top: `${18 + driftY}%`, right: `${8 + driftX}%`, width: 720, height: 720,
          borderRadius: '50%', background: `radial-gradient(circle, ${THEME.brand}14 0%, ${THEME.brand}00 70%)`,
          filter: 'blur(8px)',
        }}
      />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 10, backgroundColor: THEME.brand }} />
      <div style={{ padding: '90px 110px', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ transform: `translateY(${y}px)`, opacity: op }}>
          {kicker && (
            <div style={{ color: THEME.brand, fontWeight: 700, fontSize: 26, letterSpacing: 4, textTransform: 'uppercase', marginBottom: 14 }}>
              {kicker}
            </div>
          )}
          {heading && (
            <div style={{ color: THEME.ink, fontWeight: 800, fontSize: 76, lineHeight: 1.05, fontFamily: THEME.fontHeading }}>
              {heading}
            </div>
          )}
          {sub && (
            <div style={{ color: THEME.muted, fontSize: 30, marginTop: 18, maxWidth: 1300, lineHeight: 1.35 }}>
              {sub}
            </div>
          )}
        </div>
        <div style={{ flex: 1, position: 'relative', marginTop: 44 }}>{children}</div>
      </div>
      <div style={{ position: 'absolute', bottom: 46, left: 110, color: THEME.muted, fontSize: 22, fontWeight: 600, letterSpacing: 1 }}>
        Talk
      </div>
    </AbsoluteFill>
  );
};
