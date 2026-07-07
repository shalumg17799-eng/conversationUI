// Remotion composition registry — the entry the backend renderer bundles.
// One dynamic composition whose dimensions/duration are derived from the
// `script` input prop via calculateMetadata, so a single composition renders
// any report at its authored size and length.
import React from 'react';
import { Composition } from 'remotion';
import { ReportVideo } from './ReportVideo';
import type { VideoScript } from './types';
import { VIDEO_FPS, VIDEO_W, VIDEO_H } from './types';

const durationOf = (s?: VideoScript) =>
  Math.max(1, (s?.scenes ?? []).reduce((a, sc) => a + sc.durationInFrames, 0));

const EMPTY: VideoScript = { title: '', fps: VIDEO_FPS, width: VIDEO_W, height: VIDEO_H, scenes: [] };

export const RemotionRoot: React.FC = () => (
  <Composition
    id="ReportVideo"
    component={ReportVideo as any}
    durationInFrames={1}
    fps={VIDEO_FPS}
    width={VIDEO_W}
    height={VIDEO_H}
    defaultProps={{ script: EMPTY }}
    calculateMetadata={({ props }) => {
      const s = (props as { script?: VideoScript }).script;
      return {
        durationInFrames: durationOf(s),
        fps: s?.fps || VIDEO_FPS,
        width: s?.width || VIDEO_W,
        height: s?.height || VIDEO_H,
      };
    }}
  />
);
