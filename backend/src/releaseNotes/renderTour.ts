// Render a whole release as ONE recreated-UI "tour" video (the ReleaseTourVideo
// composition): cover → one native app-mock scene per feature → outro, with the
// narration word-timed into captions. This is the production renderer behind
// `npm run release:note` — it replaced the old per-feature slide renderer.
//
// Runs fully offline (CLI/CI): narration audio is embedded as data URLs (no server
// to host it), and the mock scenes need no screen-capture footage. Best-effort TTS
// — with no ElevenLabs key the video renders silent, captions derived from the
// script text so the walkthrough still reads.

import { promises as fs } from 'fs';
import path from 'path';
import { synthesizeWithTimestamps } from '../services/ttsService';
import { splitIntoBeats } from './beats';
import { buildTour } from './buildTour';
import { renderCompositionToFile, renderStillToFile } from '../services/videoRenderer';
import { releaseVersionDir, releaseVideoPath, releaseVideoUrl } from './releaseStore';
import type { FeatureNote } from './types';

const BEAT_OPTS = { maxMs: 5200, minMs: 1600, maxWords: 12 };
const WORDS_PER_SEC = 2.6;

const estMs = (text: string) => Math.max(2500, (text.trim().split(/\s+/).filter(Boolean).length / WORDS_PER_SEC) * 1000);

// Choose the recreated-UI scene for a feature: explicit `scene` wins, else infer
// from the title/area keywords, else the report/KPI scene.
export function sceneForNote(n: FeatureNote): string {
  if (n.scene) return n.scene;
  const hay = `${n.id} ${n.title} ${n.affectedArea ?? ''}`.toLowerCase();
  if (/video|narrat|remotion|clip|voiceover/.test(hay)) return 'export-video';
  if (/export|pdf|word|powerpoint|deck|document|excel|ppt/.test(hay)) return 'export-docs';
  return 'chat-kpi';
}

// Synthesize a line to an embeddable data URL + word timings (best-effort).
async function narrate(text: string): Promise<{ url?: string; durationMs: number; words: Array<{ word: string; startMs: number; endMs: number }> }> {
  try {
    const r = await synthesizeWithTimestamps(text);
    if (r.ok && r.buffer.length) {
      return { url: `data:audio/mpeg;base64,${r.buffer.toString('base64')}`, durationMs: r.durationMs, words: r.words };
    }
  } catch { /* fall through to silent */ }
  return { durationMs: 0, words: [] };
}

export interface RenderTourResult { overviewVideoUrl: string; posterUrl?: string; durationSec: number }

export async function renderReleaseTour(
  version: string,
  name: string | undefined,
  notes: FeatureNote[],
  onProgress?: (fraction: number) => void,
): Promise<RenderTourResult> {
  await fs.mkdir(releaseVersionDir(version), { recursive: true });

  const coverLine = `Here's what's new in ${name || version}.`;
  const outroLine = 'That covers this release. Open any report to try it out.';
  const cover = await narrate(coverLine);
  const outro = await narrate(outroLine);

  const features = [];
  for (const n of notes) {
    const a = await narrate(n.script);
    const durationMs = a.durationMs || estMs(n.script);
    const beats = a.words.length
      ? splitIntoBeats(a.words, BEAT_OPTS).map((b) => ({ text: b.text, startMs: b.startMs, endMs: b.endMs }))
      : [{ text: n.script, startMs: 0, endMs: durationMs }]; // silent fallback: one caption over the scene
    features.push({
      kicker: n.affectedArea ? `New · ${n.affectedArea}` : 'New',
      heading: n.title,
      audioUrl: a.url,
      durationMs,
      beats,
      mock: sceneForNote(n),
    });
  }

  const tour = buildTour({
    title: name || version,
    version,
    cover: {
      kicker: `What's New · ${version}`,
      heading: name || "What's New",
      sub: `${notes.length} new update${notes.length === 1 ? '' : 's'}`,
      audioUrl: cover.url, durationMs: cover.durationMs || 2600,
    },
    outro: {
      heading: "That's what's new", sub: 'Open any report to try it.',
      audioUrl: outro.url, durationMs: outro.durationMs || 2600,
    },
    features,
  });

  const dir = releaseVersionDir(version);
  const outMp4 = releaseVideoPath(version, 'overview');
  const outJpg = path.join(dir, 'overview.jpg');
  await renderCompositionToFile('ReleaseTourVideo', { tour }, outMp4, onProgress);

  let posterUrl: string | undefined;
  try {
    // A frame inside the first feature scene makes a richer poster than the cover.
    await renderStillToFile('ReleaseTourVideo', { tour }, outJpg, tour.cover.durationInFrames + 70);
    posterUrl = `/media/releases/${version}/overview.jpg`;
  } catch (e) {
    console.warn(`[release] poster still failed (${(e as Error)?.message ?? e})`);
  }

  const totalFrames = tour.cover.durationInFrames + tour.features.reduce((s, x) => s + x.durationInFrames, 0) + tour.outro.durationInFrames;
  return { overviewVideoUrl: releaseVideoUrl(version, 'overview'), posterUrl, durationSec: Math.round(totalFrames / tour.fps) };
}
