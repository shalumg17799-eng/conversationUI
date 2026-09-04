// Turn word-level timings (from ElevenLabs with-timestamps) into "beats": short
// spoken phrases with a start/end time. A beat is the unit the release-tour video
// syncs to — each beat gets an on-screen caption (its own words) and a footage
// shot, shown for exactly the window those words are spoken.
//
// Beats break on sentence/clause punctuation, and are additionally capped by
// duration and word count so no single beat runs too long to sit under one shot.

import type { WordTiming } from '../services/ttsService';

export interface Beat {
  text: string;
  startMs: number;
  endMs: number;
}

export interface BeatOptions {
  maxMs?: number;    // hard cap on a beat's spoken length
  minMs?: number;    // avoid ultra-short flashes: merge a tiny trailing beat back
  maxWords?: number; // cap words per beat
}

const CLAUSE_END = /[.!?;:,]$/;

export function splitIntoBeats(words: WordTiming[], opts: BeatOptions = {}): Beat[] {
  const maxMs = opts.maxMs ?? 4200;
  const minMs = opts.minMs ?? 1200;
  const maxWords = opts.maxWords ?? 9;
  if (!words.length) return [];

  const beats: Beat[] = [];
  let bucket: WordTiming[] = [];

  const flush = () => {
    if (!bucket.length) return;
    beats.push({
      text: bucket.map((w) => w.word).join(' '),
      startMs: bucket[0].startMs,
      endMs: bucket[bucket.length - 1].endMs,
    });
    bucket = [];
  };

  for (const w of words) {
    bucket.push(w);
    const spanMs = w.endMs - bucket[0].startMs;
    const clause = CLAUSE_END.test(w.word);
    if ((clause && spanMs >= minMs) || spanMs >= maxMs || bucket.length >= maxWords) flush();
  }
  flush();

  // Merge a too-short tail into the previous beat so captions don't flicker.
  if (beats.length >= 2) {
    const last = beats[beats.length - 1];
    if (last.endMs - last.startMs < minMs) {
      const prev = beats[beats.length - 2];
      prev.text = `${prev.text} ${last.text}`;
      prev.endMs = last.endMs;
      beats.pop();
    }
  }
  return beats;
}
