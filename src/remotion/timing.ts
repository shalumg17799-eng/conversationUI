// Canonical scene-duration formula (frontend / in-app preview path).
// The backend render uses a byte-for-byte copy at backend/src/services/sceneTiming.ts
// — the two tsconfig roots can't share one module without reshaping the build
// output, so the copy is pinned by scripts/test_timing.ts, which fails the build
// if the two ever diverge. Change one → change both.
// Both paths must turn a measured voiceover length into the SAME number of
// frames, or the preview and the final render drift apart.

export const TAIL_PAD_SEC = 0.6;   // breathing room after each line before the cut
export const MIN_SCENE_SEC = 1.8;  // floor so a scene's intro animation still has room to play

// Frames a scene should last given its measured narration audio (ms) and fps.
// Based on the ACTUAL audio length (+ tail), floored — never the word-count
// estimate, which is derived from pre-rewrite text and drifts out of sync.
export function sceneDurationFrames(audioMs: number, fps: number): number {
  const floorFrames = Math.round(MIN_SCENE_SEC * fps);
  return Math.max(floorFrames, Math.round((audioMs / 1000 + TAIL_PAD_SEC) * fps));
}
