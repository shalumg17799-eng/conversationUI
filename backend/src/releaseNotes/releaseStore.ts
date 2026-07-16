// File-backed registry for releases. Each release lives under
// data/releases/{version}/ with one MP4 per feature, plus a single
// data/releases/releases.json index. MP4s are served at /media/releases/*
// (express.static over data/releases).

import { promises as fs } from 'fs';
import path from 'path';
import type { ReleaseRecord, ReleaseSummary } from './types';

const RELEASES_DIR = path.resolve(process.cwd(), 'data', 'releases');
const REGISTRY = path.join(RELEASES_DIR, 'releases.json');

export const releasesDir = (): string => RELEASES_DIR;

// Filesystem-safe path segment (version dir / feature filename).
const seg = (s: string): string => s.replace(/[^a-zA-Z0-9._-]/g, '_');

export const releaseVersionDir = (version: string): string => path.join(RELEASES_DIR, seg(version));
export const releaseVideoPath = (version: string, featureId: string): string =>
  path.join(RELEASES_DIR, seg(version), `${seg(featureId)}.mp4`);
export const releaseVideoUrl = (version: string, featureId: string): string =>
  `/media/releases/${seg(version)}/${seg(featureId)}.mp4`;

export async function readReleases(): Promise<ReleaseRecord[]> {
  try {
    const raw = await fs.readFile(REGISTRY, 'utf8');
    const arr = JSON.parse(raw);
    // Keep only records in the new nested shape (ignore any legacy flat entries).
    return Array.isArray(arr) ? (arr as ReleaseRecord[]).filter((r) => r && Array.isArray(r.features)) : [];
  } catch {
    return []; // no registry yet
  }
}

const byNewest = (a: ReleaseRecord, b: ReleaseRecord) => (b.publishedAt || '').localeCompare(a.publishedAt || '');

export async function getLatestRelease(): Promise<ReleaseRecord | null> {
  const all = await readReleases();
  if (!all.length) return null;
  return all.slice().sort(byNewest)[0];
}

// Full records, newest-first — for the multi-version "What's New" panel that
// needs scripts, videoUrls and the combined overview per release.
export async function listReleasesFull(): Promise<ReleaseRecord[]> {
  const all = await readReleases();
  return all.slice().sort(byNewest);
}

// Lightweight list (title + bullets only) for a "previous releases" view.
export async function listReleaseSummaries(): Promise<ReleaseSummary[]> {
  const all = await readReleases();
  return all.slice().sort(byNewest).map((r) => ({
    version: r.version,
    publishedAt: r.publishedAt,
    features: r.features.map((f) => ({ id: f.id, title: f.title, bullets: f.bullets })),
  }));
}

// Insert or replace by version, then persist.
export async function upsertRelease(rec: ReleaseRecord): Promise<void> {
  await fs.mkdir(RELEASES_DIR, { recursive: true });
  const all = await readReleases();
  const idx = all.findIndex((r) => r.version === rec.version);
  if (idx >= 0) all[idx] = rec;
  else all.push(rec);
  await fs.writeFile(REGISTRY, JSON.stringify(all, null, 2));
}
