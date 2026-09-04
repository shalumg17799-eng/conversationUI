// High-quality server-side video render via Remotion (headless Chrome + ffmpeg).
// Bundles the shared composition once (cached), then renders a script to a 1080p
// H.264 MP4. This is what makes real quality possible — full resolution, real
// fonts, proper encoding — none of which the browser could do.

import os from 'os';
import path from 'path';
import { existsSync } from 'fs';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia, renderStill, type RenderMediaOnProgress } from '@remotion/renderer';

// The Remotion entry lives in the frontend workspace (src/remotion/index.ts) so
// the composition code is shared with the in-app preview. Resolve it robustly
// whether we're run from backend/ (ts-node-dev) or backend/dist.
function resolveEntry(): string {
  const candidates = [
    path.resolve(process.cwd(), '../src/remotion/index.ts'),
    path.resolve(process.cwd(), 'src/remotion/index.ts'),
    path.resolve(__dirname, '../../../src/remotion/index.ts'),
    path.resolve(__dirname, '../../../../src/remotion/index.ts'),
  ];
  const found = candidates.find(existsSync);
  if (!found) throw new Error(`Remotion entry not found. Looked in:\n${candidates.join('\n')}`);
  return found;
}

let serveUrlPromise: Promise<string> | null = null;
function getServeUrl(): Promise<string> {
  if (!serveUrlPromise) {
    serveUrlPromise = bundle({
      entryPoint: resolveEntry(),
      // Keep the app's Tailwind out of it — the composition uses inline styles.
    }).catch((e) => { serveUrlPromise = null; throw e; });
  }
  return serveUrlPromise;
}

export interface RenderResult { outPath: string; }

// Render any registered composition to an MP4, reusing the cached bundle,
// memory-safe concurrency, and browser-log surfacing. renderScriptToFile (report
// videos) and the release-note renderer are both thin callers of this.
export async function renderCompositionToFile(
  compositionId: string,
  inputProps: Record<string, unknown>,
  outPath: string,
  onProgress?: (fraction: number) => void,
  cancelSignal?: Parameters<typeof renderMedia>[0]['cancelSignal'],
): Promise<RenderResult> {
  const serveUrl = await getServeUrl();

  const composition = await selectComposition({ serveUrl, id: compositionId, inputProps });

  const onProg: RenderMediaOnProgress = ({ progress }) => onProgress?.(progress);
  // Surface in-composition console output (warnings/errors from the scenes) so a
  // bad render isn't diagnosed blind. Tagged with the output basename (the job id).
  const tag = `[render ${path.basename(outPath)}]`;

  // Render concurrency = how many headless-Chrome tabs run in parallel. Remotion
  // defaults to the core count, but each tab costs memory and B-roll adds
  // OffthreadVideo decode on top, so on a host with little free RAM the default
  // exhausts memory and the compositor process dies ("Compositor exited with
  // code 3" / "memory allocation … failed"). Derive a memory-safe default
  // (~1 tab per 0.9 GB free, capped by cores), overridable via
  // VIDEO_RENDER_CONCURRENCY for hosts that want to force a value.
  const cores = os.cpus().length;
  const forced = parseInt(process.env.VIDEO_RENDER_CONCURRENCY || '', 10);
  const memSafe = Math.max(1, Math.floor(os.freemem() / (0.9 * 1e9)));
  const concurrency = Number.isFinite(forced) && forced > 0
    ? Math.max(1, forced)
    : Math.max(1, Math.min(cores, memSafe));
  console.log(`${tag} concurrency=${concurrency} (cores=${cores}, freeMem=${(os.freemem() / 1e9).toFixed(1)}GB)`);

  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation: outPath,
    inputProps,
    crf: 18,                    // high quality (lower = better)
    x264Preset: 'medium',
    jpegQuality: 95,            // crisp frame capture
    onProgress: onProg,
    onBrowserLog: (log) => {
      if (log.type === 'error' || log.type === 'warning') console.warn(tag, log.type, log.text);
    },
    concurrency,
    cancelSignal,
    chromiumOptions: { gl: 'angle' },
  });

  return { outPath };
}

// Render a single still frame of a composition to a JPEG (used for the "what's
// new" overview poster — the thumbnail shown before the user hits play).
export async function renderStillToFile(
  compositionId: string,
  inputProps: Record<string, unknown>,
  outPath: string,
  frame = 24,
): Promise<RenderResult> {
  const serveUrl = await getServeUrl();
  const composition = await selectComposition({ serveUrl, id: compositionId, inputProps });
  await renderStill({
    composition,
    serveUrl,
    output: outPath,
    inputProps,
    // Clamp so a short composition can't be asked for a frame past its end.
    frame: Math.min(frame, Math.max(0, composition.durationInFrames - 1)),
    imageFormat: 'jpeg',
    jpegQuality: 90,
    chromiumOptions: { gl: 'angle' },
  });
  return { outPath };
}

// Report videos: render the 'ReportVideo' composition from a compiled script.
export async function renderScriptToFile(
  script: unknown,
  outPath: string,
  onProgress?: (fraction: number) => void,
  cancelSignal?: Parameters<typeof renderMedia>[0]['cancelSignal'],
): Promise<RenderResult> {
  return renderCompositionToFile('ReportVideo', { script }, outPath, onProgress, cancelSignal);
}

// Warm the bundle at startup so the first user render isn't slowed by bundling.
export function warmupRenderer(): void {
  getServeUrl().catch(() => { /* logged by caller on first real render */ });
}
