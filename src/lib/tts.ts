// Client-side text-to-speech via ElevenLabs, for report → video narration.
// Returns a playable object-URL plus the exact clip duration (so scene lengths
// can be timed to the voiceover). Results are cached per (voice, text) for the
// session to avoid re-spending credits on repeat previews.
//
// The API key ships in the browser bundle (VITE_ELEVENLABS_KEY) — acceptable for
// the demo; use a usage-restricted key. A backend proxy would remove the
// exposure but is out of the client-only scope.

const API_KEY = import.meta.env.VITE_ELEVENLABS_KEY as string | undefined;
const VOICE_ID = (import.meta.env.VITE_ELEVENLABS_VOICE_ID as string | undefined) || '21m00Tcm4TlvDq8ikWAM';
const MODEL_ID = 'eleven_turbo_v2_5'; // fast + low-cost; good for many short lines

export interface SpeechClip {
  url: string;         // object URL for an audio/mpeg blob
  durationMs: number;  // measured decoded duration
}

export const ttsAvailable = () => Boolean(API_KEY);

const cache = new Map<string, Promise<SpeechClip>>();
const key = (text: string, voice: string) => `${voice}::${text}`;

// Decode an audio blob to read its precise duration.
async function measureDuration(blob: Blob): Promise<number> {
  const buf = await blob.arrayBuffer();
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  if (Ctx) {
    try {
      const ctx = new Ctx();
      const decoded = await ctx.decodeAudioData(buf.slice(0));
      const ms = decoded.duration * 1000;
      ctx.close?.();
      if (ms > 0) return ms;
    } catch { /* fall through to <audio> probe */ }
  }
  // Fallback: probe via an <audio> element.
  return new Promise((resolve) => {
    const el = document.createElement('audio');
    el.preload = 'metadata';
    el.onloadedmetadata = () => resolve(Number.isFinite(el.duration) ? el.duration * 1000 : 0);
    el.onerror = () => resolve(0);
    el.src = URL.createObjectURL(blob);
  });
}

export function synthesizeSpeech(text: string, voiceId: string = VOICE_ID): Promise<SpeechClip> {
  if (!API_KEY) return Promise.reject(new Error('ElevenLabs key missing (VITE_ELEVENLABS_KEY)'));
  const k = key(text, voiceId);
  const hit = cache.get(k);
  if (hit) return hit;

  const p = (async () => {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: { stability: 0.4, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`ElevenLabs ${res.status}: ${detail.slice(0, 200)}`);
    }
    const blob = await res.blob();
    const durationMs = await measureDuration(blob);
    return { url: URL.createObjectURL(blob), durationMs };
  })();

  cache.set(k, p);
  p.catch(() => cache.delete(k)); // don't cache failures
  return p;
}
