// Assemble a ReleaseTour (the timeline-synced composition props) from already-
// synthesized parts: per-feature narration audio + word-derived beats + one
// footage clip per beat. Pure — no IO. Beats are laid end-to-end so they tile
// the whole feature segment (caption + footage always present, no gaps), and
// each beat is timed from the ElevenLabs word timestamps.

const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;
const TAIL_SEC = 0.5;
const MIN_HERO_SEC = 2.6;

const msToFrames = (ms: number) => Math.max(1, Math.round((ms / 1000) * FPS));

export interface TourBeatInput { text: string; startMs: number; endMs: number; }
export interface TourFeatureInput {
  kicker?: string;
  heading: string;
  audioUrl?: string;
  durationMs: number;
  beats: TourBeatInput[];
  footage?: string[]; // aligned to beats (may contain '' for a missing clip)
  mock?: string;      // recreated-UI scene id ('chat-kpi' | 'export-docs' | 'export-video')
}
export interface TourHeroInput {
  kicker?: string; heading: string; sub?: string; audioUrl?: string; durationMs: number;
}
export interface BuildTourInput {
  title: string;
  version: string;
  cover: TourHeroInput;
  features: TourFeatureInput[];
  outro: TourHeroInput;
}

function hero(h: TourHeroInput) {
  const frames = Math.max(Math.round(MIN_HERO_SEC * FPS), msToFrames(h.durationMs) + Math.round(TAIL_SEC * FPS));
  return { kicker: h.kicker, heading: h.heading, sub: h.sub, audioUrl: h.audioUrl, durationInFrames: frames };
}

export function buildTour(input: BuildTourInput) {
  const features = input.features.map((f) => {
    const segFrames = msToFrames(f.durationMs) + Math.round(TAIL_SEC * FPS);
    const footage = f.footage ?? [];
    const sorted = f.beats
      .map((b, i) => ({ b, url: footage[i] || undefined }))
      .sort((a, z) => a.b.startMs - z.b.startMs);

    const beats = sorted.map((entry, i) => {
      const startFrame = i === 0 ? 0 : msToFrames(entry.b.startMs);
      const endFrame = i < sorted.length - 1 ? msToFrames(sorted[i + 1].b.startMs) : segFrames;
      return {
        text: entry.b.text,
        startFrame,
        durationInFrames: Math.max(1, endFrame - startFrame),
        footageUrl: entry.url,
      };
    });

    return {
      kicker: f.kicker,
      heading: f.heading,
      audioUrl: f.audioUrl,
      durationInFrames: segFrames,
      beats,
      ...(f.mock ? { mock: f.mock } : {}),
    };
  });

  return {
    title: input.title,
    version: input.version,
    fps: FPS,
    width: WIDTH,
    height: HEIGHT,
    cover: hero(input.cover),
    features,
    outro: hero(input.outro),
  };
}
