// Full-bleed looping B-roll with a slow Ken-Burns push and a dark gradient
// scrim so foreground text stays legible. Used behind hero/insight scenes.
// OffthreadVideo renders reliably in the Remotion server render; muted + loop
// keeps it purely decorative.
import React from 'react';
import { AbsoluteFill, OffthreadVideo, useCurrentFrame, interpolate } from 'remotion';

export const BackgroundVideo: React.FC<{ src: string; overlay?: number }> = ({ src, overlay = 0.62 }) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, 600], [1.06, 1.18], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>
        <OffthreadVideo src={src} muted loop style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background: `linear-gradient(105deg, rgba(20,18,16,${Math.min(0.92, overlay + 0.2)}) 0%, rgba(20,18,16,${overlay}) 45%, rgba(20,18,16,${Math.max(0.35, overlay - 0.2)}) 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};
