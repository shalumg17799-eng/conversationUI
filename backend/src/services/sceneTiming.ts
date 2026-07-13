// Backend copy of the scene-duration formula. The canonical version lives in the
// frontend at src/remotion/timing.ts and drives the in-app preview; this copy
// drives the backend render. They can't share one module across the two tsconfig
// roots without reshaping the build output, so instead they are kept byte-for-byte
// in sync and pinned by scripts/test_timing.ts, which fails if they ever diverge.
// If you change the formula here, change it there too (the test will remind you).

export const TAIL_PAD_SEC = 0.6;   // breathing room after each line before the cut
export const MIN_SCENE_SEC = 1.8;  // floor so a scene's intro animation still has room to play

// Frames a scene should last given its measured narration audio (ms) and fps.
export function sceneDurationFrames(audioMs: number, fps: number): number {
  const floorFrames = Math.round(MIN_SCENE_SEC * fps);
  return Math.max(floorFrames, Math.round((audioMs / 1000 + TAIL_PAD_SEC) * fps));
}
