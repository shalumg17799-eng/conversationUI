// High-quality server-side video render via Remotion (headless Chrome + ffmpeg).
// Bundles the shared composition once (cached), then renders a script to a 1080p
// H.264 MP4. This is what makes real quality possible — full resolution, real
// fonts, proper encoding — none of which the browser could do.

import path from 'path';
import { existsSync } from 'fs';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia, type RenderMediaOnProgress } from '@remotion/renderer';

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

export async function renderScriptToFile(
  script: unknown,
  outPath: string,
  onProgress?: (fraction: number) => void,
  cancelSignal?: Parameters<typeof renderMedia>[0]['cancelSignal'],
): Promise<RenderResult> {
  const serveUrl = await getServeUrl();
  const inputProps = { script } as Record<string, unknown>;

  const composition = await selectComposition({ serveUrl, id: 'ReportVideo', inputProps });

  const onProg: RenderMediaOnProgress = ({ progress }) => onProgress?.(progress);

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
    cancelSignal,
    chromiumOptions: { gl: 'angle' },
  });

  return { outPath };
}

// Warm the bundle at startup so the first user render isn't slowed by bundling.
export function warmupRenderer(): void {
  getServeUrl().catch(() => { /* logged by caller on first real render */ });
}
