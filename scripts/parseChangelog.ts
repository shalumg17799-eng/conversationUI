// Extract `feature:` entries from the "Unreleased" section of CHANGELOG.md and emit
// them as { version, features[] } — the exact shape `npm run release:note -- --input`
// already consumes. Pure string/fs work: no backend deps, no pipeline knowledge.
// This is the trigger/input layer; it does not touch generation, TTS, or rendering.
//
//   node parseChangelog.ts [--changelog <path>] [--out <path>] [--version <v>]
//
// Prints the JSON to stdout and (if --out) writes it to a file. `features` is empty
// when there are no `feature:` entries — callers should no-op in that case.

import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

interface FeatureInput {
  id?: string;
  title: string;
  summary?: string;
  bullets?: string[];
}

// Pull every `- feature: ...` line out of the "## Unreleased" section (up to the
// next "## " heading). One `|`-separated line → title | summary | bullet | bullet…
export function parseUnreleasedFeatures(md: string): FeatureInput[] {
  const out: FeatureInput[] = [];
  let inSection = false;
  // Drop HTML comments so commented-out example lines aren't parsed as real entries.
  const clean = md.replace(/<!--[\s\S]*?-->/g, '');
  for (const raw of clean.split(/\r?\n/)) {
    const heading = raw.match(/^##\s+(.*\S)\s*$/);
    if (heading) { inSection = /^unreleased\b/i.test(heading[1].trim()); continue; }
    if (!inSection) continue;

    const item = raw.match(/^\s*[-*]\s+feature\s*:\s*(.+?)\s*$/i);
    if (!item) continue; // non-feature entries (fix:, chore:, …) and prose are ignored
    const segments = item[1].split('|').map((s) => s.trim()).filter(Boolean);
    if (!segments.length) continue;
    // An optional `scene:<id>` segment (anywhere) picks the recreated-UI scene;
    // the remaining segments are title | summary | bullets.
    const sceneSeg = segments.find((s) => /^scene\s*:/i.test(s));
    const scene = sceneSeg ? sceneSeg.replace(/^scene\s*:/i, '').trim() : undefined;
    const rest = sceneSeg ? segments.filter((s) => s !== sceneSeg) : segments;
    const [title, summary, ...bullets] = rest;
    if (!title) continue;
    out.push({
      title,
      ...(summary ? { summary } : {}),
      ...(bullets.length ? { bullets } : {}),
      ...(scene ? { scene } : {}),
    });
  }
  return out;
}

// Move the (uncommented) `- feature:` lines out of "## Unreleased" and into a new
// dated `## <version>` section directly below it. Used by CI AFTER a successful
// render so consumed entries don't re-trigger. Commented examples stay put.
export function consumeUnreleased(md: string, version: string): string {
  const lines = md.split(/\r?\n/);
  let start = -1;
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^##\s+(.*\S)\s*$/);
    if (h && /^unreleased\b/i.test(h[1].trim())) {
      start = i;
      for (let j = i + 1; j < lines.length; j++) { if (/^##\s+/.test(lines[j])) { end = j; break; } }
      break;
    }
  }
  if (start < 0) return md;

  const kept: string[] = [];
  const moved: string[] = [];
  let inComment = false;
  for (const line of lines.slice(start + 1, end)) {
    const wasInComment = inComment;
    if (line.includes('<!--') && !line.includes('-->')) inComment = true;
    else if (line.includes('-->')) inComment = false;
    const isFeature = /^\s*[-*]\s+feature\s*:/i.test(line);
    if (isFeature && !wasInComment && !line.includes('<!--')) moved.push(`- ${line.replace(/^\s*[-*]\s+/, '')}`);
    else kept.push(line);
  }
  if (!moved.length) return md;

  return [
    ...lines.slice(0, start + 1),
    ...kept,
    '',
    `## ${version}`,
    '',
    ...moved,
    ...lines.slice(end),
  ].join('\n');
}

function defaultVersion(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const arg = (flag: string): string | undefined => {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
};

// Default to the repo-root CHANGELOG.md relative to THIS script (works from any cwd).
const changelogPath = arg('--changelog') || path.resolve(__dirname, '..', 'CHANGELOG.md');
const outPath = arg('--out');
const version = arg('--version') || defaultVersion();

let md = '';
try {
  md = readFileSync(changelogPath, 'utf8');
} catch {
  console.error(`[parseChangelog] no changelog found at ${changelogPath}`);
}

// `--consume`: rewrite the changelog, moving Unreleased feature lines into ## version.
// Run this only AFTER a successful render so failed renders don't lose entries.
if (args.includes('--consume')) {
  const rewritten = consumeUnreleased(md, version);
  if (rewritten !== md) {
    writeFileSync(changelogPath, rewritten);
    console.error(`[parseChangelog] moved consumed entries into ## ${version} in ${changelogPath}`);
  } else {
    console.error('[parseChangelog] nothing to consume');
  }
  process.exit(0);
}

const features = parseUnreleasedFeatures(md);
const result = { version, features };
const json = JSON.stringify(result, null, 2);

if (outPath) writeFileSync(outPath, json);
console.error(`[parseChangelog] ${features.length} feature entr${features.length === 1 ? 'y' : 'ies'} in Unreleased → ${version}`);
process.stdout.write(json + '\n');
