// Publish a release AND generate its single combined "what's new" overview video.
//
// This is the on-publish trigger: given a release's raw change list, it
//   1. scripts each feature with Claude (generateFeatureNote),
//   2. (piece 3) captures a screen recording per feature,
//   3. compiles ONE VideoScript (cover · feature scenes · outro),
//   4. voices each scene with ElevenLabs and retimes to the audio,
//   5. renders a 1080p MP4 + a poster still through the shared ReportVideo
//      composition, and
//   6. upserts the release record so /api/releases/latest serves it — the
//      "What's New" modal then shows the features immediately and the combined
//      video as soon as it's ready.
//
// Runs async (one publish at a time) with an in-memory status map the client can
// poll. Every media step is best-effort: TTS off → silent video; a feature's
// capture missing → that scene renders clean. Only the render itself is fatal.

import { promises as fs } from 'fs';
import path from 'path';
import { generateFeatureNote } from './generateScript';
import { buildReleaseScript } from './buildReleaseScript';
import { captureReleaseFootage } from './captureFootage';
import { renderScriptToFile, renderStillToFile } from '../services/videoRenderer';
import { ttsEnabled, synthesizeToFile } from '../services/ttsService';
import { sceneDurationFrames } from '../services/sceneTiming';
import { AUDIO_ROOT, FOOTAGE_ROOT } from '../services/videoJobs';
import {
  releaseVersionDir, releaseVideoPath, releaseVideoUrl, upsertRelease,
} from './releaseStore';
import type { FeatureInput, FeatureNote, ReleaseRecord, FeatureRecord } from './types';

const ASSET_BASE = process.env.RENDER_ASSET_BASE || `http://localhost:${process.env.PORT || 3001}`;

export type PublishStatus =
  | 'queued' | 'scripting' | 'capturing' | 'voicing' | 'rendering' | 'ready' | 'failed';

export interface PublishJob {
  id: string;
  version: string;
  status: PublishStatus;
  label: string;
  progress: number;
  error?: string;
  createdAt: number;
}

export interface PublishInput {
  version: string;
  name?: string;
  features: FeatureInput[];
  capture?: boolean; // opt into screen-recording capture (piece 3); default true when available
}

const jobs = new Map<string, PublishJob>();
const queue: Array<{ id: string; input: PublishInput }> = [];
let running = false;
let seq = 0;

export const getPublishJob = (id: string): PublishJob | undefined => jobs.get(id);
export const listPublishJobs = (): PublishJob[] =>
  [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt);

function set(id: string, p: Partial<PublishJob>) {
  const j = jobs.get(id);
  if (j) Object.assign(j, p);
}

export function startPublish(input: PublishInput): string {
  const id = `rel_${Date.now().toString(36)}_${seq++}`;
  jobs.set(id, {
    id, version: input.version, status: 'queued', label: 'Queued', progress: 0, createdAt: Date.now(),
  });
  queue.push({ id, input });
  void pump();
  return id;
}

async function pump() {
  if (running) return;
  const next = queue.shift();
  if (!next) return;
  running = true;
  const { id, input } = next;
  const { version } = input;
  const audioDir = path.join(AUDIO_ROOT, id);

  try {
    await fs.mkdir(releaseVersionDir(version), { recursive: true });
    await fs.mkdir(audioDir, { recursive: true });

    // 1. Script each feature (Claude, best-effort → raw input on failure).
    set(id, { status: 'scripting', label: 'Writing feature scripts', progress: 0.04 });
    const notes: FeatureNote[] = [];
    for (const f of input.features) notes.push(await generateFeatureNote(f));

    // 2. Capture real app footage per feature (piece 3; best-effort, may be empty).
    let footage: Record<string, string> = {};
    if (input.capture !== false) {
      set(id, { status: 'capturing', label: 'Recording app footage', progress: 0.12 });
      try {
        footage = await captureReleaseFootage(id, version, notes);
      } catch (e) {
        console.warn(`[release ${id}] capture failed (${(e as Error)?.message ?? e}); scenes render clean`);
      }
    }

    // 3. Compile the single combined script.
    const script = buildReleaseScript({ version, name: input.name, features: notes, footage });

    // 4. Voiceover per scene + retime to the spoken length.
    if (ttsEnabled()) {
      set(id, { status: 'voicing', label: 'Generating voiceover', progress: 0.2 });
      for (let i = 0; i < script.scenes.length; i++) {
        const scene = script.scenes[i];
        try {
          const file = path.join(audioDir, `scene${i}.mp3`);
          const { durationMs, ok } = await synthesizeToFile(scene.narration, file);
          if (ok) {
            (scene as { narrationAudio?: string }).narrationAudio = `${ASSET_BASE}/media/audio/${id}/scene${i}.mp3`;
            if (durationMs > 0) scene.durationInFrames = sceneDurationFrames(durationMs, script.fps);
          }
        } catch { /* silent scene, estimated timing */ }
        set(id, { progress: 0.2 + ((i + 1) / script.scenes.length) * 0.15, label: `Voiceover ${i + 1}/${script.scenes.length}` });
      }
    }

    // 5. Render the combined MP4 + poster still.
    set(id, { status: 'rendering', label: 'Rendering overview video', progress: 0.38 });
    const outMp4 = releaseVideoPath(version, 'overview');
    const outJpg = path.join(releaseVersionDir(version), 'overview.jpg');
    const onProg = (frac: number) => set(id, { progress: 0.38 + frac * 0.56, label: `Rendering ${Math.round(frac * 100)}%` });
    try {
      await renderScriptToFile(script, outMp4, onProg);
    } catch (renderErr) {
      // Screen-capture B-roll (OffthreadVideo) is the usual OOM/compositor culprit
      // and is decorative — strip it and render once more on clean scenes.
      const hadFootage = script.scenes.some((s) => s.visual.backgroundVideo);
      if (!hadFootage) throw renderErr;
      console.warn(`[release ${id}] render failed (${(renderErr as any)?.message ?? renderErr}); retrying without footage`);
      set(id, { label: 'Retrying without footage', progress: 0.38 });
      for (const s of script.scenes) delete s.visual.backgroundVideo;
      await renderScriptToFile(script, outMp4, onProg);
    }
    // Poster: a frame from the cover scene. Best-effort — a missing poster just
    // falls back to the modal's gradient placeholder.
    try {
      await renderStillToFile('ReportVideo', { script }, outJpg, 24);
    } catch (e) {
      console.warn(`[release ${id}] poster still failed (${(e as Error)?.message ?? e})`);
    }

    // 6. Upsert the release record.
    const durationSec = Math.round(script.scenes.reduce((s, sc) => s + sc.durationInFrames, 0) / script.fps);
    const overviewVideoUrl = releaseVideoUrl(version, 'overview');
    const hasPoster = await fs.stat(outJpg).then(() => true).catch(() => false);
    const features: FeatureRecord[] = notes.map((n) => ({
      ...n,
      // No per-feature clips anymore — point at the combined video so any legacy
      // consumer still resolves to something playable.
      videoUrl: overviewVideoUrl,
    }));
    const record: ReleaseRecord = {
      version,
      name: input.name,
      publishedAt: new Date().toISOString(),
      features,
      overviewVideoUrl,
      durationSec,
      ...(hasPoster ? { posterUrl: `/media/releases/${version}/overview.jpg` } : {}),
    };
    await upsertRelease(record);

    set(id, { status: 'ready', label: 'Published', progress: 1 });
  } catch (e: any) {
    set(id, { status: 'failed', label: 'Failed', error: (e?.message ?? 'publish failed').toString().slice(0, 300) });
  } finally {
    // Keep the MP4/poster; drop the per-job narration + footage source clips.
    await fs.rm(audioDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(path.join(FOOTAGE_ROOT, id), { recursive: true, force: true }).catch(() => {});
    running = false;
    if (queue.length) void pump();
  }
}
