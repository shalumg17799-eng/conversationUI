// "What's new" release explainer — a short (15–30s) animated card that reuses the
// report-video chrome (SceneFrame: paper background, terracotta rule, brand type).
// Props are the Claude-generated ReleaseNote; nothing here fetches or renders BI
// data, so it's fully decoupled from the report pipeline while sharing the look.
import React from 'react';
import { AbsoluteFill, Audio, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import type { ReleaseNote } from './types';
import { THEME } from './theme';
import { SceneFrame } from './components/SceneFrame';

// Video length. When narration audio is present, size to it (+ a short tail) so the
// voice always finishes on screen; otherwise use a reading-time estimate. Both are
// floored at 15s and capped so a runaway script can't produce an absurd clip.
// Exported so the composition's calculateMetadata (in Root) and any caller agree.
export function releaseDurationInFrames(release: ReleaseNote, fps: number): number {
  if (release.audioDurationMs && release.audioDurationMs > 0) {
    const secs = Math.min(60, Math.max(15, release.audioDurationMs / 1000 + 1.4));
    return Math.round(secs * fps);
  }
  const words =
    (release.script ?? '').trim().split(/\s+/).filter(Boolean).length +
    (release.bullets ?? []).reduce((n, b) => n + b.trim().split(/\s+/).filter(Boolean).length, 0);
  const secs = Math.min(30, Math.max(15, 6 + words / 2.8 + (release.bullets?.length ?? 0) * 1.1));
  return Math.round(secs * fps);
}

// Fade + slight rise, gated on a start frame.
const useReveal = (startFrame: number, over = 16) => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [startFrame, startFrame + over], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const y = interpolate(op, [0, 1], [18, 0]);
  return { opacity: op, transform: `translateY(${y}px)` };
};

const Bullet: React.FC<{ text: string; startFrame: number }> = ({ text, startFrame }) => {
  const style = useReveal(startFrame);
  return (
    <div style={{ ...style, display: 'flex', alignItems: 'flex-start', gap: 20 }}>
      <div style={{ width: 16, height: 16, borderRadius: 8, background: THEME.brand, marginTop: 16, flexShrink: 0 }} />
      <div style={{ color: THEME.ink, fontSize: 38, lineHeight: 1.3 }}>{text}</div>
    </div>
  );
};

export const ReleaseNoteVideo: React.FC<{ release: ReleaseNote }> = ({ release }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const bullets = release.bullets ?? [];

  const narration = useReveal(18, 20);
  // Gentle continuous breathe so a longer hold never feels frozen.
  const zoom = interpolate(frame, [0, releaseDurationInFrames(release, fps)], [1, 1.02], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}>
      {release.audioUrl && <Audio src={release.audioUrl} />}
      <SceneFrame kicker={`What's New · ${release.version}`} heading={release.title}>
        <div style={{ maxWidth: 1560 }}>
          <div style={{ ...narration, color: THEME.ink, fontSize: 44, lineHeight: 1.4, fontWeight: 500 }}>
            {release.script}
          </div>
          {bullets.length > 0 && (
            <div style={{ marginTop: 54, display: 'flex', flexDirection: 'column', gap: 26 }}>
              {bullets.map((b, i) => (
                <Bullet key={i} text={b} startFrame={54 + i * 12} />
              ))}
            </div>
          )}
        </div>
      </SceneFrame>
    </AbsoluteFill>
  );
};
