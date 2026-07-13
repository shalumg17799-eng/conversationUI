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
  const contentType = res.headers.get('content-type') || '';
  const buf = Buffer.from(await res.arrayBuffer());
  // Guard: the CDN occasionally answers 200 with a NON-video body (rate-limit
  // notice, error page, redirect stub). Writing that as .mp4 makes Remotion's
  // OffthreadVideo throw "Unknown file type" and fail the WHOLE render — turning a
  // decorative, best-effort background into a hard export failure. Verify it's a
  // real video container first; otherwise throw so the caller keeps the scene on
  // its clean background (which is what "best-effort footage" is supposed to mean).
  if (!isVideoContainer(buf) && !/^video\//i.test(contentType)) {
    const head = buf.subarray(0, 16).toString('ascii').replace(/[^\x20-\x7e]/g, '.');
    throw new Error(`Pixabay download not a video (content-type="${contentType}", ${buf.length}B, head="${head}")`);
  }
  await fs.writeFile(outPath, buf);
}

// Recognise the containers Pixabay serves by magic bytes (more reliable than the
// content-type header): MP4/MOV (ISO BMFF) carry a 'ftyp' box at offset 4;
// WebM/Matroska start with the EBML signature 1A 45 DF A3.
function isVideoContainer(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  if (buf.toString('ascii', 4, 8) === 'ftyp') return true;
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return true;
  return false;
}
