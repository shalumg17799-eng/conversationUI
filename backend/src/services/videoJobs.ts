// Orchestrates a report-video render job on the backend:
//   polish narration → ElevenLabs voiceover (retime scenes) → Remotion 1080p
//   render → save MP4 to disk. Jobs run one at a time (rendering is CPU-heavy).
// State is held in memory for live progress; finished videos also get a sidecar
// .json so the library survives a server restart.

import path from 'path';
import { promises as fs } from 'fs';
import { makeCancelSignal } from '@remotion/renderer';
import { writeVideoNarration, pickFootageQueries, type NarrationScene } from './llmHandler';
import { ttsEnabled, synthesizeToFile } from './ttsService';
import { pixabayEnabled, searchFootage, downloadFootage } from './pixabayService';
import { renderScriptToFile } from './videoRenderer';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const VIDEO_DIR = path.join(DATA_DIR, 'videos');
const AUDIO_DIR = path.join(DATA_DIR, 'media', 'audio');
const FOOTAGE_DIR = path.join(DATA_DIR, 'media', 'footage');
// Scenes that get cinematic B-roll behind them (data scenes stay clean).
const HERO_KINDS = new Set(['cover', 'insight', 'outro']);
const ASSET_BASE = process.env.RENDER_ASSET_BASE || `http://localhost:${process.env.PORT || 3001}`;
const TAIL_PAD_SEC = 0.6;

export type JobStatus = 'queued' | 'polishing' | 'voicing' | 'rendering' | 'ready' | 'failed' | 'cancelled';

export interface VideoJob {
  id: string;
  title: string;
  status: JobStatus;
  progress: number;
  label: string;
  error?: string;
  durationSec: number;
  sizeBytes: number;
  createdAt: number;
}

interface Scene { narration: string; durationInFrames: number; narrationAudio?: string; [k: string]: unknown; }
interface Script { title?: string; fps: number; width: number; height: number; scenes: Scene[]; }

const jobs = new Map<string, VideoJob>();
const cancellers = new Map<string, () => void>();
const queue: Array<{ id: string; script: Script }> = [];
let running = false;
let seq = 0;

const publicMeta = (j: VideoJob): VideoJob => ({ ...j });
export const getJob = (id: string) => jobs.get(id);
export const listJobs = () => [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt).map(publicMeta);
export const videoPath = (id: string) => path.join(VIDEO_DIR, `${id}.mp4`);

export function createJob(script: Script): string {
  const id = `vid_${Date.now().toString(36)}_${seq++}`;
  const title = (script.title || 'Report').toString();
  jobs.set(id, { id, title, status: 'queued', progress: 0, label: 'Queued', durationSec: 0, sizeBytes: 0, createdAt: Date.now() });
  queue.push({ id, script });
  void pump();
  return id;
}

export function cancelJob(id: string): boolean {
  const job = jobs.get(id);
  if (!job) return false;
  // Drop from queue if not yet running.
  const qi = queue.findIndex(q => q.id === id);
  if (qi >= 0) queue.splice(qi, 1);
  cancellers.get(id)?.();
  job.status = 'cancelled';
  job.label = 'Cancelled';
  return true;
}

function set(id: string, p: Partial<VideoJob>) {
  const j = jobs.get(id);
  if (j) Object.assign(j, p);
}

async function pump() {
  if (running) return;
  const next = queue.shift();
  if (!next) return;
  running = true;
  const { id, script } = next;
  const audioDir = path.join(AUDIO_DIR, id);

  try {
    if (jobs.get(id)?.status === 'cancelled') throw new CancelError();
    await fs.mkdir(VIDEO_DIR, { recursive: true });
    await fs.mkdir(audioDir, { recursive: true });

    // 1. Write the story narration (best-effort — falls back to deterministic).
    set(id, { status: 'polishing', label: 'Writing narration', progress: 0.02 });
    try {
      const ctx: NarrationScene[] = script.scenes.map((s) => {
        const v = (s.visual ?? {}) as { kind?: string };
        const t = (s.onScreenText ?? {}) as { heading?: string; sub?: string; bullets?: string[] };
        const onScreen = [t.heading, t.sub, ...(t.bullets ?? [])].filter(Boolean) as string[];
        return { kind: v.kind ?? 'scene', heading: t.heading, onScreen, dataHint: s.narration };
      });
      const coverSub = (script.scenes[0]?.onScreenText as { sub?: string } | undefined)?.sub;
      const lines = await writeVideoNarration(ctx, { title: script.title, description: coverSub });
      if (lines.length === script.scenes.length) script.scenes.forEach((s, i) => { s.narration = lines[i]; });
    } catch { /* keep deterministic narration */ }

    // 1b. Cinematic B-roll for hero scenes (best-effort).
    if (pixabayEnabled()) {
      set(id, { label: 'Finding footage', progress: 0.03 });
      const footDir = path.join(FOOTAGE_DIR, id);
      try {
        await fs.mkdir(footDir, { recursive: true });
        const coverSub = (script.scenes[0]?.onScreenText as { sub?: string } | undefined)?.sub;
        const queries = await pickFootageQueries(script.title, coverSub);
        let qi = 0;
        for (let i = 0; i < script.scenes.length; i++) {
          if (jobs.get(id)?.status === 'cancelled') throw new CancelError();
          const kind = (script.scenes[i].visual as { kind?: string } | undefined)?.kind;
          if (!kind || !HERO_KINDS.has(kind)) continue;
          try {
            const clips = await searchFootage(queries[qi % queries.length] || queries[0]);
            qi++;
            if (!clips.length) continue;
            const clip = clips[i % clips.length];
            const out = path.join(footDir, `bg${i}.mp4`);
            await downloadFootage(clip.url, out);
            (script.scenes[i].visual as Record<string, unknown>).backgroundVideo = `${ASSET_BASE}/media/footage/${id}/bg${i}.mp4`;
          } catch { /* this scene stays clean */ }
        }
      } catch { /* no footage — scenes render clean */ }
    }

    // 2. Voiceover per scene + retime.
    if (ttsEnabled()) {
      set(id, { status: 'voicing', label: 'Generating voiceover', progress: 0.05 });
      for (let i = 0; i < script.scenes.length; i++) {
        if (jobs.get(id)?.status === 'cancelled') throw new CancelError();
        const scene = script.scenes[i];
        try {
          const file = path.join(audioDir, `scene${i}.mp3`);
          const { durationMs, ok } = await synthesizeToFile(scene.narration, file);
          if (ok) {
            scene.narrationAudio = `${ASSET_BASE}/media/audio/${id}/scene${i}.mp3`;
            // Retime the scene to the ACTUAL voiceover length (+ tail), so the visual
            // stays on screen exactly as long as the narration plays. Base it on the
            // measured audio rather than max() with the word-count estimate — the
            // estimate is derived from pre-rewrite text and drifts out of sync. A small
            // floor guarantees the scene's intro animation still has room to play.
            if (durationMs > 0) {
              const floorFrames = Math.round(1.8 * script.fps);
              scene.durationInFrames = Math.max(floorFrames, Math.round((durationMs / 1000 + TAIL_PAD_SEC) * script.fps));
            }
          }
        } catch { /* skip a failed line; scene stays silent with estimated timing */ }
        set(id, { progress: 0.05 + ((i + 1) / script.scenes.length) * 0.13, label: `Voiceover ${i + 1}/${script.scenes.length}` });
      }
    }

    // 3. Render.
    if (jobs.get(id)?.status === 'cancelled') throw new CancelError();
    set(id, { status: 'rendering', label: 'Rendering 1080p video', progress: 0.2 });
    const { cancelSignal, cancel } = makeCancelSignal();
    cancellers.set(id, cancel);
    const out = videoPath(id);
    await renderScriptToFile(script, out, (frac) => set(id, { progress: 0.2 + frac * 0.78, label: `Rendering ${Math.round(frac * 100)}%` }), cancelSignal);
    cancellers.delete(id);

    const stat = await fs.stat(out);
    const durationSec = Math.round(script.scenes.reduce((s, sc) => s + sc.durationInFrames, 0) / script.fps);
    set(id, { status: 'ready', label: 'Ready', progress: 1, sizeBytes: stat.size, durationSec });
    await writeSidecar(id);
  } catch (e: any) {
    if (e instanceof CancelError || e?.name === 'AbortError' || jobs.get(id)?.status === 'cancelled') {
      set(id, { status: 'cancelled', label: 'Cancelled' });
      await fs.rm(videoPath(id), { force: true }).catch(() => {});
    } else {
      set(id, { status: 'failed', label: 'Failed', error: (e?.message ?? 'Render failed').toString().slice(0, 300) });
    }
  } finally {
    cancellers.delete(id);
    // cleanup per-job source assets (kept only through the render)
    await fs.rm(audioDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(path.join(FOOTAGE_DIR, id), { recursive: true, force: true }).catch(() => {});
    running = false;
    if (queue.length) void pump();
  }
}

class CancelError extends Error { constructor() { super('cancelled'); this.name = 'CancelError'; } }

async function writeSidecar(id: string) {
  const j = jobs.get(id);
  if (!j) return;
  const meta = { id: j.id, title: j.title, durationSec: j.durationSec, sizeBytes: j.sizeBytes, createdAt: j.createdAt };
  await fs.writeFile(path.join(VIDEO_DIR, `${id}.json`), JSON.stringify(meta)).catch(() => {});
}

// Repopulate the library from disk on startup so ready videos survive restarts.
export async function loadPersistedJobs(): Promise<void> {
  try {
    const files = await fs.readdir(VIDEO_DIR);
    for (const f of files.filter(f => f.endsWith('.json'))) {
      try {
        const meta = JSON.parse(await fs.readFile(path.join(VIDEO_DIR, f), 'utf8'));
        if (meta?.id && !jobs.has(meta.id)) {
          jobs.set(meta.id, { ...meta, status: 'ready', progress: 1, label: 'Ready' });
        }
      } catch { /* skip corrupt sidecar */ }
    }
  } catch { /* no dir yet */ }
}

export async function deleteJob(id: string): Promise<void> {
  cancelJob(id);
  jobs.delete(id);
  await fs.rm(videoPath(id), { force: true }).catch(() => {});
  await fs.rm(path.join(VIDEO_DIR, `${id}.json`), { force: true }).catch(() => {});
}

export const AUDIO_ROOT = AUDIO_DIR;
export const VIDEO_ROOT = VIDEO_DIR;
export const FOOTAGE_ROOT = FOOTAGE_DIR;
