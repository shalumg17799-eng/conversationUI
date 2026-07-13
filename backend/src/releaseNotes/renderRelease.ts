// Render a ReleaseNote into an MP4 via the shared Remotion renderer (same bundle,
// concurrency, and encoding as report videos — just a different composition).
//
// If ElevenLabs is configured, the narration script is synthesized and embedded as
// a data URL so the explainer has a voiceover. It's embedded (not a served URL)
// because this render runs offline from the CLI/CI, with no server to host the
// audio. TTS is best-effort: if it's off or fails, the video renders silent.
import { promises as fs } from 'fs';
import { renderCompositionToFile } from '../services/videoRenderer';
import { ttsEnabled, synthesizeToBuffer } from '../services/ttsService';
import { releasesDir, releaseVideoPath } from './releaseStore';
import type { ReleaseNote } from './types';

export async function renderReleaseVideo(
  release: ReleaseNote,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  await fs.mkdir(releasesDir(), { recursive: true });
  const out = releaseVideoPath(release.version);

  // Compose the render props, adding a voiceover when TTS is available.
  const props: ReleaseNote & { audioUrl?: string; audioDurationMs?: number } = { ...release };
  if (ttsEnabled()) {
    try {
      const audio = await synthesizeToBuffer(release.script);
      if (audio.ok && audio.buffer.length) {
        props.audioUrl = `data:audio/mpeg;base64,${audio.buffer.toString('base64')}`;
        props.audioDurationMs = audio.durationMs;
        console.log(`[release] narration: ${(audio.durationMs / 1000).toFixed(1)}s (${(audio.buffer.length / 1024).toFixed(0)} KB)`);
      }
    } catch (err) {
      console.warn(`[release] TTS failed (${(err as Error)?.message ?? err}); rendering silent`);
    }
  } else {
    console.log('[release] ELEVENLABS_API_KEY not set — rendering silent (no voiceover)');
  }

  await renderCompositionToFile('ReleaseNoteVideo', { release: props }, out, onProgress);
  return out;
}
