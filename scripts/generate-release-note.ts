// Generate a "what's new" release from one or more feature descriptions.
//
// Offline / CI job — decoupled from the dashboard query pipeline. For each feature
// it (1) asks Claude to write a short script, (2) renders a narrated Remotion
// explainer, then (3) stores all of them under a single release version that
// GET /api/releases/latest serves.
//
// Run from the repo root:
//   # Single feature (flags)
//   npm run release:note -- --title "PPT export" --summary "..." --area "Reports" --bullet "One-click .pptx"
//   # Multiple features (JSON file or inline) — the real multi-feature path:
//   npm run release:note -- --input release.json
//   npm run release:note -- --json '{"version":"2026.07.14","features":[{"title":"A","summary":"..."},{"title":"B","summary":"..."}]}'
//
// A JSON input is { version?, features: [{ id?, title, summary?, bullets?, affectedArea? }, ...] }.
// (npm run release:note runs with cwd=backend so it reuses backend/.env and the
//  backend/data/releases storage location.)

import '../backend/src/releaseNotes/loadEnv'; // loads backend/.env (resolves dotenv from backend/)
import { readFileSync } from 'fs';
import { generateFeatureNote } from '../backend/src/releaseNotes/generateScript';
import { renderFeatureVideo } from '../backend/src/releaseNotes/renderRelease';
import { upsertRelease, releaseVideoUrl } from '../backend/src/releaseNotes/releaseStore';
import type { ReleaseInput, FeatureInput, ReleaseRecord, FeatureRecord } from '../backend/src/releaseNotes/types';

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

  // A file or inline JSON can supply the full { version, features[] } (or a single
  // feature object). Flags describe a single feature and win over the file's flags.
  const inputFile = get('--input');
  const jsonStr = get('--json');
  let base: Partial<ReleaseInput> & Partial<FeatureInput> = {};
  if (inputFile) base = JSON.parse(readFileSync(inputFile, 'utf8'));
  else if (jsonStr) base = JSON.parse(jsonStr);

  const version = get('--version') ?? (base as ReleaseInput).version;

  // Determine the feature list.
  let features: FeatureInput[];
  if (Array.isArray((base as ReleaseInput).features) && (base as ReleaseInput).features.length) {
    features = (base as ReleaseInput).features;
  } else {
    // Single feature from flags (or a single-feature JSON object).
    const bullets = getAll('--bullet');
    const single: FeatureInput = {
      title: get('--title') ?? (base as FeatureInput).title ?? '',
      summary: get('--summary') ?? (base as FeatureInput).summary,
      affectedArea: get('--area') ?? (base as FeatureInput).affectedArea,
      bullets: bullets.length ? bullets : (base as FeatureInput).bullets,
    };
    features = [single];
  }

  features = features.filter((f) => f && f.title && f.title.trim());
  if (!features.length) {
    console.error('Error: at least one feature with a title is required.');
    console.error('Usage: npm run release:note -- --title "<title>" [--summary "..."] [--bullet "..." ...]   OR   --input release.json');
    process.exit(2);
  }
  return { version, features };
}

(async () => {
  const input = parseArgs(process.argv);
  const version = (input.version && input.version.trim()) || defaultVersion();
  console.log(`[release] version ${version} — ${input.features.length} feature(s)`);

  const records: FeatureRecord[] = [];
  const failed: string[] = [];
  for (const feat of input.features) {
    console.log(`\n[release] · "${feat.title}"`);
    const note = await generateFeatureNote(feat);
    console.log(`[release]   title  : ${note.title}`);
    console.log(`[release]   script : ${note.script}`);
    console.log(`[release]   bullets: ${note.bullets.map((b) => `\n    • ${b}`).join('')}`);

    try {
      // Renders can crash transiently under memory pressure ("Target closed"); retry.
      await withRetry(async () => {
        let lastPct = -1;
        await renderFeatureVideo(version, note, (f) => {
          const pct = Math.round(f * 100);
          if (pct !== lastPct && (pct % 20 === 0 || pct === 100)) { lastPct = pct; console.log(`[release]   render ${pct}%`); }
        });
      }, 3, note.id);
      records.push({ ...note, videoUrl: releaseVideoUrl(version, note.id) });
      console.log(`[release]   video  : ${releaseVideoUrl(version, note.id)}`);
    } catch (e) {
      // Don't lose the whole release for one flaky render — skip and publish the rest.
      failed.push(note.title);
      console.warn(`[release]   SKIPPED "${note.title}" after retries (${String((e as Error)?.message ?? e).slice(0, 90)})`);
    }
  }

  if (!records.length) {
    console.error('[release] FAILED: no features rendered successfully');
    process.exit(1);
  }

  const release: ReleaseRecord = { version, publishedAt: new Date().toISOString(), features: records };
  await upsertRelease(release);

  console.log(`\n[release] done — release ${version} with ${records.length} feature(s)${failed.length ? `; ${failed.length} skipped: ${failed.join(', ')}` : ''}`);
  console.log('[release] GET /api/releases/latest now returns this release');
  process.exit(0);
})().catch((e) => {
  console.error('[release] FAILED:', e?.stack ?? e);
  process.exit(1);
});

function defaultVersion(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

async function withRetry<T>(fn: () => Promise<T>, attempts: number, label: string): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      console.warn(`[release]   ${label}: render attempt ${i}/${attempts} failed (${String((e as Error)?.message ?? e).slice(0, 90)})${i < attempts ? ' — retrying' : ''}`);
    }
  }
  throw lastErr;
}
