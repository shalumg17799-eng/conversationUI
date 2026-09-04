// Compile a release (its Claude-generated feature notes) into ONE VideoScript —
// the same scene shape the report-video pipeline renders through the shared
// `ReportVideo` Remotion composition. Rather than one clip per feature, the whole
// release becomes a single narrated walkthrough:
//
//   cover  ·  one 'insight' scene per feature  ·  outro
//
// Each feature scene carries the feature's title + bullets as on-screen text, its
// script as narration, and (when the capture step has produced one) a screen
// recording as `backgroundVideo` — the InsightScene renders that as cinematic
// B-roll with the copy overlaid. No footage → it renders the clean paper variant.
//
// Durations here are word-count estimates; when TTS runs, videoJobs-style retiming
// snaps each scene to its actual voiceover length, so these are just sane floors.

import type { FeatureNote } from './types';

// Mirror src/remotion/types.ts (kept as plain literals — the backend can't import
// across the frontend tsconfig root). If the canvas constants change there, change
// them here too.
const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;

// Spoken pace + padding, matched to the report pipeline's feel.
const WORDS_PER_SEC = 2.6;
const TAIL_SEC = 1.0;

const countWords = (...parts: (string | undefined)[]): number =>
  parts.filter(Boolean).join(' ').trim().split(/\s+/).filter(Boolean).length;

const estFrames = (secs: number, min: number, max: number): number =>
  Math.round(Math.min(max, Math.max(min, secs)) * FPS);

export interface ReleaseScriptScene {
  id: string;
  visual: { kind: 'cover' | 'insight' | 'outro'; accent?: string; backgroundVideo?: string };
  onScreenText: { kicker?: string; heading?: string; sub?: string; bullets?: string[] };
  narration: string;
  durationInFrames: number;
}

export interface ReleaseScript {
  title: string;
  fps: number;
  width: number;
  height: number;
  scenes: ReleaseScriptScene[];
}

export interface BuildReleaseScriptOptions {
  version: string;
  name?: string;
  features: FeatureNote[];
  // featureId → absolute URL of a captured screen recording (piece 3). Optional;
  // any feature without footage renders the clean paper scene.
  footage?: Record<string, string>;
}

export function buildReleaseScript(opts: BuildReleaseScriptOptions): ReleaseScript {
  const { version, name, features, footage = {} } = opts;
  const headline = name || `What's New in ${version}`;
  const count = features.length;
  const intro =
    `Here's everything new in ${name || version}. ` +
    `${count} update${count === 1 ? '' : 's'} to help you get more out of your reports.`;

  const cover: ReleaseScriptScene = {
    id: 'cover',
    visual: { kind: 'cover' },
    onScreenText: {
      kicker: `What's New · ${version}`,
      heading: headline,
      sub: `${count} new update${count === 1 ? '' : 's'} in this release`,
    },
    narration: intro,
    durationInFrames: estFrames(countWords(intro) / WORDS_PER_SEC + TAIL_SEC, 3.5, 9),
  };

  const featureScenes: ReleaseScriptScene[] = features.map((f, i) => {
    const secs = countWords(f.script, ...(f.bullets ?? [])) / WORDS_PER_SEC + TAIL_SEC;
    const bg = footage[f.id];
    return {
      id: `feature-${f.id}`,
      visual: { kind: 'insight', ...(bg ? { backgroundVideo: bg } : {}) },
      onScreenText: {
        kicker: f.affectedArea ? `New · ${f.affectedArea}` : `New · ${i + 1} of ${count}`,
        heading: f.title,
        bullets: (f.bullets ?? []).slice(0, 4),
      },
      narration: f.script,
      durationInFrames: estFrames(secs, 4, 14),
    };
  });

  const outroLine = 'That covers this release. Open any report to try it out.';
  const outro: ReleaseScriptScene = {
    id: 'outro',
    visual: { kind: 'outro' },
    onScreenText: { kicker: version, heading: "That's what's new", sub: 'Open any report to try it.' },
    narration: outroLine,
    durationInFrames: estFrames(countWords(outroLine) / WORDS_PER_SEC + TAIL_SEC, 3, 6),
  };

  return {
    title: headline,
    fps: FPS,
    width: WIDTH,
    height: HEIGHT,
    scenes: [cover, ...featureScenes, outro],
  };
}
