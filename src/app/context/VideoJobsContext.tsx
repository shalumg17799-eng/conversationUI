// Background video jobs — now backend-rendered. The client compiles the report
// into a VideoScript and hands it to the server, which does the heavy work
// (narration polish → ElevenLabs voiceover → Remotion 1080p render). The header
// tray polls job status; finished MP4s are played/downloaded from server URLs.
// Users enqueue and keep working while the render runs remotely.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { buildVideoScript } from '@/lib/videoScript';
import type { ReportMeta } from '@/lib/exportReport';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export type JobStatus = 'queued' | 'polishing' | 'voicing' | 'rendering' | 'ready' | 'failed' | 'cancelled';

export interface VideoJob {
  id: string;
  title: string;
  status: JobStatus;
  progress: number;
  label: string;
  error?: string;
  durationSec: number;
  sizeBytes: number;
  createdAt: number;
}

export interface LibraryVideo extends VideoJob { playUrl: string; downloadUrl: string; }

const ACTIVE: JobStatus[] = ['queued', 'polishing', 'voicing', 'rendering'];

interface Ctx {
  jobs: VideoJob[];        // active + failed/cancelled (not ready)
  videos: LibraryVideo[];  // ready library
  activeCount: number;
  unseen: number;
  enqueue: (meta: ReportMeta, components: any[]) => Promise<void>;
  cancelJob: (id: string) => void;
  dismissJob: (id: string) => void;
  removeVideo: (id: string) => Promise<void>;
  markSeen: () => void;
}

const VideoJobsContext = createContext<Ctx | null>(null);
export const useVideoJobs = () => {
  const c = useContext(VideoJobsContext);
  if (!c) throw new Error('useVideoJobs must be used within VideoJobsProvider');
  return c;
};

const playUrl = (id: string) => `${API_BASE}/media/videos/${id}.mp4`;
const downloadUrl = (id: string) => `${API_BASE}/api/video/${id}/download`;

export function VideoJobsProvider({ children }: { children: React.ReactNode }) {
  const [all, setAll] = useState<VideoJob[]>([]);
  const [unseen, setUnseen] = useState(0);
  // Locally dismissed non-ready jobs (failed/cancelled the user cleared).
  const dismissed = useRef<Set<string>>(new Set());
  const prevReady = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/videos`);
      if (!res.ok) return;
      const data = await res.json();
      const jobs: VideoJob[] = Array.isArray(data?.jobs) ? data.jobs : [];
      // "Ready" toast + badge transitions are handled in the effect on `all`.
      setAll(jobs.filter(j => !dismissed.current.has(j.id)));
    } catch { /* backend unreachable — keep last state */ }
  }, []);

  // Poll while any job is active.
  useEffect(() => {
    refresh();
    const t = setInterval(() => { refresh(); }, 2000);
    return () => clearInterval(t);
  }, [refresh]);

  // Fire "ready" side-effects on transition.
  useEffect(() => {
    const readyIds = all.filter(j => j.status === 'ready').map(j => j.id);
    let bumped = 0;
    readyIds.forEach(id => { if (!prevReady.current.has(id)) bumped++; });
    if (bumped > 0 && prevReady.current.size > 0) {
      setUnseen(u => u + bumped);
      const j = all.find(x => x.status === 'ready' && !prevReady.current.has(x.id));
      if (j) toast.success('Video ready', { description: j.title });
    }
    prevReady.current = new Set(readyIds);
  }, [all]);

  const enqueue = useCallback(async (meta: ReportMeta, components: any[]) => {
    try {
      const script = buildVideoScript(meta, components);
      const res = await fetch(`${API_BASE}/api/video`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script }),
      });
      if (!res.ok) throw new Error(`Server ${res.status}`);
      toast('Video queued', { description: 'Rendering on the server — track it in the video tray.' });
      refresh();
    } catch (e: any) {
      toast.error('Could not start video', { description: e?.message ?? 'Backend unreachable' });
    }
  }, [refresh]);

  const cancelJob = useCallback((id: string) => {
    fetch(`${API_BASE}/api/video/${id}/cancel`, { method: 'POST' }).catch(() => {});
    setAll(prev => prev.map(j => (j.id === id ? { ...j, status: 'cancelled', label: 'Cancelled' } : j)));
  }, []);

  const dismissJob = useCallback((id: string) => {
    dismissed.current.add(id);
    setAll(prev => prev.filter(j => j.id !== id));
  }, []);

  const removeVideo = useCallback(async (id: string) => {
    await fetch(`${API_BASE}/api/video/${id}`, { method: 'DELETE' }).catch(() => {});
    setAll(prev => prev.filter(j => j.id !== id));
    prevReady.current.delete(id);
  }, []);

  const markSeen = useCallback(() => setUnseen(0), []);

  const jobs = all.filter(j => j.status !== 'ready');
  const videos: LibraryVideo[] = all.filter(j => j.status === 'ready').map(j => ({ ...j, playUrl: playUrl(j.id), downloadUrl: downloadUrl(j.id) }));
  const activeCount = all.filter(j => ACTIVE.includes(j.status)).length;

  const value = useMemo<Ctx>(() => ({
    jobs, videos, activeCount, unseen, enqueue, cancelJob, dismissJob, removeVideo, markSeen,
  }), [all, unseen, enqueue, cancelJob, dismissJob, removeVideo, markSeen]);

  return <VideoJobsContext.Provider value={value}>{children}</VideoJobsContext.Provider>;
}
