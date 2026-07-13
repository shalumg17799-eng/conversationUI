// Types for the "what's new" release-note pipeline. This is a small, offline
// pipeline (CLI / CI job) that reuses the Claude transport and the Remotion
// renderer, but is otherwise independent of the dashboard query pipeline.

// What a caller (CLI args, a CHANGELOG entry, a PR description) feeds in.
export interface ReleaseInput {
  version?: string;      // optional; defaults to today's date (YYYY.MM.DD)
  title: string;         // short change title (required)
  summary?: string;      // free-text description of what changed
  bullets?: string[];    // optional explicit highlights
  affectedArea?: string; // e.g. "Video export", "Dashboard"
}

// The Claude-generated, render-ready note (matches the Remotion ReleaseNote prop).
export interface ReleaseNote {
  version: string;
  title: string;
  script: string;    // 2–4 sentence plain-language narration
  bullets: string[];
}

// A stored release, as returned by GET /api/releases/latest.
export interface ReleaseRecord extends ReleaseNote {
  affectedArea?: string;
  videoUrl: string;  // relative to the API host, e.g. /media/releases/2026.07.08.mp4
  createdAt: string; // ISO timestamp
}
