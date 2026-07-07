// The full report video: lays out scenes back-to-back as <Sequence>s with a
// short cross-fade between them. Phase 2 adds an <Audio> per scene for narration.
import React from 'react';
import { AbsoluteFill, Audio, Series } from 'remotion';
import type { VideoScript } from './types';
import { Scene } from './scenes';

export const ReportVideo: React.FC<{ script: VideoScript }> = ({ script }) => {
  return (
    <AbsoluteFill>
      <Series>
        {script.scenes.map((scene) => (
          <Series.Sequence key={scene.id} durationInFrames={scene.durationInFrames}>
            <Scene scene={scene} />
            {scene.narrationAudio && <Audio src={scene.narrationAudio} />}
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};
