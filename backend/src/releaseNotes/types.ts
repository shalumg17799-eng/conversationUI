// Types for the "what's new" release pipeline. A release now bundles MANY feature
// items — each independently scripted (Claude), narrated (ElevenLabs) and rendered
// (Remotion) — rather than one video per release. Still an offline CLI/CI pipeline,
// independent of the dashboard query pipeline.

// ── Input (CLI args, a JSON file, a PR body → JSON) ──────────────────────────
export interface FeatureInput {
  id?: string;           // slug for the filename/URL; derived from title if absent
  title: string;         // short change title (required)
  summary?: string;      // free-text description of what changed
  bullets?: string[];    // optional explicit highlights
  affectedArea?: string; // e.g. "Reports", "LLM"
}

export interface ReleaseInput {
  version?: string;         // defaults to today's date (YYYY.MM.DD)
  features: FeatureInput[]; // one or more features shipped in this release
}

// ── Claude-generated, render-ready ───────────────────────────────────────────
export interface FeatureNote {
  id: string;
  title: string;
  script: string;    // 2–4 sentence plain-language narration
  bullets: string[];
  affectedArea?: string;
}

// ── Stored / served ──────────────────────────────────────────────────────────
export interface FeatureRecord extends FeatureNote {
  videoUrl: string; // relative to the API host, e.g. /media/releases/2026.07.14/doc-deck-export.mp4
}

export interface ReleaseRecord {
  version: string;          // semantic product version, e.g. "v1.1.0"
  name?: string;            // optional human label, e.g. "Report Hub 1.1"
  publishedAt: string;      // ISO timestamp
  features: FeatureRecord[];
  // One combined walkthrough for the whole release (all features in a single
  // narrated video). Absent until the on-publish pipeline has rendered it.
  overviewVideoUrl?: string; // e.g. /media/releases/v1.1.0/overview.mp4
  posterUrl?: string;        // still frame shown before playback
  durationSec?: number;      // combined video length
}

// Lightweight shape for the list endpoint (no scripts/video payload).
export interface ReleaseSummary {
  version: string;
  publishedAt: string;
  features: { id: string; title: string; bullets: string[] }[];
}
