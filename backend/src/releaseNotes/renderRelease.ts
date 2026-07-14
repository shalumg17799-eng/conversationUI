// Render ONE feature into an MP4 via the shared Remotion renderer (same bundle,
// concurrency, encoding as report videos — the ReleaseNoteVideo composition is
// unchanged; it just renders one feature's title/script/bullets).
//
// If ElevenLabs is configured, the feature's script is synthesized and embedded as
// a data URL (this render runs offline from the CLI/CI, with no server to host the
// audio). TTS is best-effort: off or failing → the video renders silent.
import { promises as fs } from 'fs';
import { renderCompositionToFile } from '../services/videoRenderer';
import { ttsEnabled, synthesizeToBuffer } from '../services/ttsService';
import { releaseVersionDir, releaseVideoPath } from './releaseStore';
import type { FeatureNote } from './types';

export async function renderFeatureVideo(
  version: string,
  feature: FeatureNote,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  await fs.mkdir(releaseVersionDir(version), { recursive: true });
  const out = releaseVideoPath(version, feature.id);

  // Props for the ReleaseNoteVideo composition (kicker shows the release version).
  const props: {
    version: string; title: string; script: string; bullets: string[];
    audioUrl?: string; audioDurationMs?: number;
  } = { version, title: feature.title, script: feature.script, bullets: feature.bullets };

  if (ttsEnabled()) {
    try {
      const audio = await synthesizeToBuffer(feature.script);
      if (audio.ok && audio.buffer.length) {
        props.audioUrl = `data:audio/mpeg;base64,${audio.buffer.toString('base64')}`;
        props.audioDurationMs = audio.durationMs;
        console.log(`[release]   ${feature.id}: narration ${(audio.durationMs / 1000).toFixed(1)}s (${(audio.buffer.length / 1024).toFixed(0)} KB)`);
      }
    } catch (err) {
      console.warn(`[release]   ${feature.id}: TTS failed (${(err as Error)?.message ?? err}); rendering silent`);
    }
  }

  await renderCompositionToFile('ReleaseNoteVideo', { release: props }, out, onProgress);
  return out;
}
