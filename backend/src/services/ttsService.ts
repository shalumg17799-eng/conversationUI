// Server-side narration for report videos. Synthesizes each line with
// ElevenLabs, writes the MP3 to disk, and measures its duration (so scene
// timing can match the voiceover). The API key lives in backend/.env — off the
// client entirely. If no key is set, callers get durationMs = 0 and no file,
// and the video renders silent.

import { promises as fs } from 'fs';
import { parseBuffer } from 'music-metadata';

const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
const MODEL_ID = 'eleven_turbo_v2_5';

export const ttsEnabled = () => !!(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_API_KEY.trim());

export interface SynthResult { durationMs: number; ok: boolean; }

const MONTHS_FULL: Record<string, string> = {
  jan: 'January', feb: 'February', mar: 'March', apr: 'April', may: 'May', jun: 'June',
  jul: 'July', aug: 'August', sep: 'September', sept: 'September', oct: 'October', nov: 'November', dec: 'December',
};
const FULL_MONTH = 'January|February|March|April|May|June|July|August|September|October|November|December';

// Make text read correctly aloud: expand month abbreviations ("Apr"/"APR" →
// "April", so ElevenLabs never spells "A-P-R"), unwrap parenthesized months
// like "(APR)", and expand quarter shorthand. Idempotent; safe on full text.
export function normalizeForTTS(input: string): string {
  let s = input;
  // Month abbreviations (with optional trailing dot) → full month name.
  s = s.replace(/\b(jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\.?\b/gi, (m) => {
    const key = m.toLowerCase().replace(/\.$/, '');
    return MONTHS_FULL[key === 'sept' ? 'sept' : key] ?? m;
  });
  // "(April)" left by the step above (or already present) → "April".
  s = s.replace(new RegExp(`\\(\\s*(${FULL_MONTH})\\s*\\)`, 'g'), '$1');
  // Quarter shorthand.
  s = s.replace(/\bQ1\b/gi, 'first quarter').replace(/\bQ2\b/gi, 'second quarter')
       .replace(/\bQ3\b/gi, 'third quarter').replace(/\bQ4\b/gi, 'fourth quarter');
  return s;
}

// Synthesize `text` to `outPath` (an .mp3). Returns the measured duration.
export async function synthesizeToFile(text: string, outPath: string): Promise<SynthResult> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return { durationMs: 0, ok: false };

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text: normalizeForTTS(text),
      model_id: MODEL_ID,
      voice_settings: { stability: 0.4, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`ElevenLabs ${res.status}: ${detail.slice(0, 200)}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(outPath, buf);

  let durationMs = 0;
  try {
    // duration:true forces a full-frame scan, so CBR/streamed ElevenLabs MP3s that
    // lack a Xing/duration header still report an accurate length. Without this the
    // duration comes back 0 and scene timing falls back to a word-count estimate that
    // does not match the spoken audio — which is what desyncs narration from visuals.
    const meta = await parseBuffer(buf, { mimeType: 'audio/mpeg', size: buf.length }, { duration: true });
    durationMs = Math.round((meta.format.duration ?? 0) * 1000);
  } catch { /* duration stays 0 → scene keeps estimated timing */ }
  return { durationMs, ok: true };
}
