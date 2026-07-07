// Sends the full scene context to the backend scriptwriter
// (POST /api/video/narration), which returns story-structured voiceover, then
// maps it back onto the scenes. Reuses the backend so the Anthropic key stays
// server-side. Best-effort: any failure keeps the deterministic narration.
// (The export/render path runs the same writer server-side; this keeps the
// in-app preview consistent with the exported video.)

import type { VideoScript } from '@/remotion/types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export async function polishScriptNarration(script: VideoScript, signal?: AbortSignal): Promise<VideoScript> {
  const scenes = script.scenes.map(s => ({
    kind: s.visual.kind,
    heading: s.onScreenText.heading,
    onScreen: [s.onScreenText.heading, s.onScreenText.sub, ...(s.onScreenText.bullets ?? [])].filter(Boolean),
    dataHint: s.narration,
  }));
  try {
    const res = await fetch(`${API_BASE}/api/video/narration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: script.title, description: script.scenes[0]?.onScreenText.sub, scenes }),
      signal,
    });
    if (!res.ok) return script;
    const data = await res.json();
    const lines = data?.lines;
    if (!Array.isArray(lines) || lines.length !== script.scenes.length) return script;
    return {
      ...script,
      scenes: script.scenes.map((sc, i) =>
        typeof lines[i] === 'string' && lines[i].trim() ? { ...sc, narration: lines[i] } : sc,
      ),
    };
  } catch {
    return script; // network/abort/offline → keep deterministic narration
  }
}
