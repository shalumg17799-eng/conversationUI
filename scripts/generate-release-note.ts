// Generate a "what's new" release video from a change description.
//
// Offline / CI job — decoupled from the dashboard query pipeline. It (1) asks
// Claude to write a short script, (2) renders a Remotion explainer, (3) stores the
// MP4 + a registry entry that GET /api/releases/latest serves.
//
// Run from the repo root:
//   npm run release:note -- --title "PPT export" --summary "..." --area "Reports"
//   npm run release:note -- --version 2026.07.08 --title "..." --bullet "A" --bullet "B"
//   npm run release:note -- --input path/to/change.json      # { title, summary, bullets, affectedArea, version }
//   npm run release:note -- --json '{"title":"...","summary":"..."}'
//
// (npm run release:note runs it with cwd=backend so it reuses backend/.env and the
//  backend/data/releases storage location.)

import '../backend/src/releaseNotes/loadEnv'; // loads backend/.env (resolves dotenv from backend/)
import { readFileSync } from 'fs';
import { generateReleaseNote } from '../backend/src/releaseNotes/generateScript';
import { renderReleaseVideo } from '../backend/src/releaseNotes/renderRelease';
import { upsertRelease, releaseVideoUrl } from '../backend/src/releaseNotes/releaseStore';
import type { ReleaseInput, ReleaseRecord } from '../backend/src/releaseNotes/types';

function parseArgs(argv: string[]): ReleaseInput {
  const args = argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
  };
  const getAll = (flag: string): string[] => {
    const out: string[] = [];
    args.forEach((a, i) => { if (a === flag && args[i + 1]) out.push(args[i + 1]); });
    return out;
  };

  // Base can come from a file or an inline JSON blob (e.g. a PR body serialized to JSON).
  let base: Partial<ReleaseInput> = {};
  const inputFile = get('--input');
  const jsonStr = get('--json');
  if (inputFile) base = JSON.parse(readFileSync(inputFile, 'utf8'));
  else if (jsonStr) base = JSON.parse(jsonStr);

  const bullets = getAll('--bullet');
  const input: ReleaseInput = {
    version: get('--version') ?? base.version,
    title: get('--title') ?? base.title ?? '',
    summary: get('--summary') ?? base.summary,
    affectedArea: get('--area') ?? base.affectedArea,
    bullets: bullets.length ? bullets : base.bullets,
  };

  if (!input.title || !input.title.trim()) {
    console.error('Error: a change title is required (--title "…", or title in --input/--json).');
    console.error('Usage: npm run release:note -- --title "<title>" [--summary "<what changed>"] [--area "<area>"] [--bullet "<point>" ...] [--version <v>]');
    process.exit(2);
  }
  return input;
}

(async () => {
  const input = parseArgs(process.argv);
  console.log(`[release] input: "${input.title}" (version ${input.version ?? 'auto-date'})`);

  const note = await generateReleaseNote(input);
  console.log(`[release] title : ${note.title}`);
  console.log(`[release] script: ${note.script}`);
  console.log(`[release] bullets: ${note.bullets.map((b) => `\n  • ${b}`).join('')}`);

  console.log('[release] rendering explainer video…');
  let lastPct = -1;
  const out = await renderReleaseVideo(note, (f) => {
    const pct = Math.round(f * 100);
    if (pct !== lastPct && (pct % 10 === 0 || pct === 100)) { lastPct = pct; console.log(`[release] render ${pct}%`); }
  });

  const record: ReleaseRecord = {
    ...note,
    ...(input.affectedArea ? { affectedArea: input.affectedArea } : {}),
    videoUrl: releaseVideoUrl(note.version),
    createdAt: new Date().toISOString(),
  };
  await upsertRelease(record);

  console.log(`[release] video  : ${out}`);
  console.log(`[release] served : ${record.videoUrl}`);
  console.log(`[release] done — GET /api/releases/latest now returns version ${note.version}`);
  process.exit(0);
})().catch((e) => {
  console.error('[release] FAILED:', e?.stack ?? e);
  process.exit(1);
});
