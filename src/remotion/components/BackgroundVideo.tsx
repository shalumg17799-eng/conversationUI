// Full-bleed looping B-roll with a slow Ken-Burns push and a dark gradient
// scrim so foreground text stays legible. Used behind hero/insight scenes.
// OffthreadVideo renders reliably in the Remotion server render; muted + loop
// keeps it purely decorative.
import React from 'react';
import { AbsoluteFill, OffthreadVideo, useCurrentFrame, interpolate } from 'remotion';

// `overlay` is the base scrim strength. The gradient is LEFT-anchored: dark on the
// left where the copy sits (kept legible) and fading to nearly clear on the right
// so the real app footage stays visible instead of being buried under a flat wash.
export const BackgroundVideo: React.FC<{ src: string; overlay?: number }> = ({ src, overlay = 0.42 }) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, 600], [1.06, 1.18], { extrapolateRight: 'clamp' });
  const o = overlay;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>
        <OffthreadVideo src={src} muted loop style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background:
            `linear-gradient(90deg,` +
            ` rgba(20,18,16,${Math.min(0.9, o + 0.34)}) 0%,` +
            ` rgba(20,18,16,${o}) 32%,` +
            ` rgba(20,18,16,${Math.max(0, o - 0.28)}) 55%,` +
            ` rgba(20,18,16,0) 78%)`,
        }}
      />
    </AbsoluteFill>
  );
};
