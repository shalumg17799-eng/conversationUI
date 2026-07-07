// Pixabay footage for report-video backgrounds. Searches the free Videos API,
// picks a well-sized clip, and downloads it. Key lives in backend/.env. All
// best-effort: with no key or on any failure, callers get nothing and scenes
// render on their clean background.

import { promises as fs } from 'fs';

export const pixabayEnabled = () => !!(process.env.PIXABAY_API_KEY && process.env.PIXABAY_API_KEY.trim());

export interface FootageClip { url: string; width: number; height: number; }

// Search landscape B-roll for a query. Returns candidate clips (medium size —
// good quality without huge downloads), best-effort.
export async function searchFootage(query: string): Promise<FootageClip[]> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return [];
  const url = `https://pixabay.com/api/videos/?key=${key}&q=${encodeURIComponent(query)}&per_page=20&safesearch=true`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data: any = await res.json();
    const hits: any[] = Array.isArray(data?.hits) ? data.hits : [];
    return hits
      .map((h) => {
        const v = h?.videos ?? {};
        const pick = v.medium ?? v.large ?? v.small ?? v.tiny;
        return pick?.url ? { url: pick.url as string, width: pick.width ?? 1920, height: pick.height ?? 1080 } : null;
      })
      .filter((c): c is FootageClip => !!c && c.width >= c.height); // landscape only
  } catch {
    return [];
  }
}

export async function downloadFootage(url: string, outPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pixabay download ${res.status}`);
  await fs.writeFile(outPath, Buffer.from(await res.arrayBuffer()));
}
