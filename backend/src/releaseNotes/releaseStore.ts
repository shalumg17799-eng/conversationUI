// Tiny file-backed registry for release notes. Lives alongside the existing
// backend/data assets (data/videos, data/media) at data/releases, and the MP4s
// are served statically at /media/releases (mirrors /media/videos).

import { promises as fs } from 'fs';
import path from 'path';
import type { ReleaseRecord } from './types';

const RELEASES_DIR = path.resolve(process.cwd(), 'data', 'releases');
const REGISTRY = path.join(RELEASES_DIR, 'releases.json');

export const releasesDir = (): string => RELEASES_DIR;

// Filesystem-safe version → used for the MP4 filename and its URL.
export const safeVersion = (v: string): string => v.replace(/[^a-zA-Z0-9._-]/g, '_');
export const releaseVideoPath = (version: string): string => path.join(RELEASES_DIR, `${safeVersion(version)}.mp4`);
export const releaseVideoUrl = (version: string): string => `/media/releases/${safeVersion(version)}.mp4`;

export async function readReleases(): Promise<ReleaseRecord[]> {
  try {
    const raw = await fs.readFile(REGISTRY, 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as ReleaseRecord[]) : [];
  } catch {
    return []; // no registry yet
  }
}

export async function getLatestRelease(): Promise<ReleaseRecord | null> {
  const all = await readReleases();
  if (!all.length) return null;
  return all.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
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
