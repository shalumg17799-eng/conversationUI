// Shared types for the report → video pipeline.
// A report ({ meta, components }) is compiled into a VideoScript: an ordered
// list of scenes, each mirroring the user's 4-column model —
//   Scene (id/kind) · Visuals (visual) · On-screen text (onScreenText) · Narration.
// Remotion renders the script; ElevenLabs (Phase 2) fills narrationAudio.

export type SceneKind = 'cover' | 'kpis' | 'chart' | 'insight' | 'table' | 'outro';
export type ChartKind = 'bar' | 'line' | 'area' | 'pie';

export interface KpiDatum {
  label: string;
  value: string;   // display value, e.g. "$912K"
  trend?: string;
}

export interface ChartVisual {
  chartKind: ChartKind;
  labels: string[];
  series: { name: string; values: number[] }[];
}

export interface SceneVisual {
  kind: SceneKind;
  chart?: ChartVisual;         // kind === 'chart'
  kpis?: KpiDatum[];           // kind === 'kpis'
  table?: { columns: string[]; rows: string[][] };  // kind === 'table'
  accent?: string;             // hex, no '#'
  backgroundVideo?: string;    // URL to looping B-roll (hero scenes; added server-side)
}

export interface OnScreenText {
  kicker?: string;
  heading?: string;
  sub?: string;
  bullets?: string[];
}

export interface VideoScene {
  id: string;
  visual: SceneVisual;
  onScreenText: OnScreenText;
  narration: string;
  durationInFrames: number;
  narrationAudio?: string;     // Phase 2: object URL / data URL of TTS clip
}

export interface VideoScript {
  title: string;
  fps: number;
  width: number;
  height: number;
  scenes: VideoScene[];
}

export const VIDEO_FPS = 30;
export const VIDEO_W = 1920;
export const VIDEO_H = 1080;
