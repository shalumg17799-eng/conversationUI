// Turn a structured change description into a short, render-ready release note,
// using the SAME Sonnet transport the report pipeline uses (modelGenerate →
// `claude` CLI on OAuth, or the Anthropic API when ANTHROPIC_API_KEY is set).
// Degrades gracefully: if Claude is unavailable or returns junk, the raw input is
// used so a video still renders.

import { modelGenerate } from '../services/llmHandler';
import type { ReleaseInput, ReleaseNote } from './types';

const SYSTEM =
  'You write very short "what\'s new" explainer scripts for an internal analytics web app. ' +
  'Given a structured description of a shipped change, produce: ' +
  '(1) a punchy one-line title (<= 8 words); ' +
  '(2) a plain-language narration script of 2 to 4 short sentences that reads in about 15-25 seconds ' +
  'when spoken, addressing the user as "you", no jargon, no marketing fluff; ' +
  '(3) 2 to 4 short bullet highlights (<= 8 words each). ' +
  'Only describe what the input implies — never invent features. ' +
  'Return ONLY minified JSON: {"title": string, "script": string, "bullets": string[]}. No prose, no code fences.';

export async function generateReleaseNote(input: ReleaseInput): Promise<ReleaseNote> {
  const version = (input.version && input.version.trim()) || defaultVersion();

  // Deterministic fallback (used if Claude is unavailable or returns junk).
  const fallback: ReleaseNote = {
    version,
    title: input.title.trim(),
    script: (input.summary && input.summary.trim()) || `${input.title.trim()} is now available.`,
    bullets: (input.bullets ?? []).filter((b) => b && b.trim()).slice(0, 4),
  };

  const user = JSON.stringify({
    title: input.title,
    summary: input.summary ?? '',
    bullets: input.bullets ?? [],
    affectedArea: input.affectedArea ?? '',
  });

  try {
    const raw = await modelGenerate('sonnet', { system: SYSTEM, user, temperature: 0.5, maxOutputTokens: 700 });
    const parsed = parseJsonObject(raw);
    if (!parsed) return fallback;
    const title = typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : fallback.title;
    const script = typeof parsed.script === 'string' && parsed.script.trim() ? parsed.script.trim() : fallback.script;
    const bullets = Array.isArray(parsed.bullets)
      ? parsed.bullets.filter((b: unknown): b is string => typeof b === 'string' && !!b.trim()).map((b: string) => b.trim()).slice(0, 4)
      : fallback.bullets;
    return { version, title, script, bullets: bullets.length ? bullets : fallback.bullets };
  } catch (err) {
    console.warn(`[releaseNotes] Claude generation failed (${(err as Error)?.message ?? err}); using input as-is`);
    return fallback;
  }
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const v = JSON.parse(match[0]);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function defaultVersion(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}
