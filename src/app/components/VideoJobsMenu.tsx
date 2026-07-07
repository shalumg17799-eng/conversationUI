// Header video tray — the "dock" for backend render jobs and the finished
// library. Shows in-progress jobs with a live progress bar (and cancel), plus
// completed videos to play, download, or delete. Sits beside the notification
// bell in the app header. Videos play/download straight from server URLs.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clapperboard, X, Loader2, Play, Download, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useVideoJobs, type VideoJob, type LibraryVideo } from '@/app/context/VideoJobsContext';

const STEP_LABEL: Record<VideoJob['status'], string> = {
  queued: 'Queued', polishing: 'Polishing narration', voicing: 'Voiceover', rendering: 'Rendering',
  ready: 'Ready', failed: 'Failed', cancelled: 'Cancelled',
};

const fmtSize = (b: number) => b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`;
const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function VideoJobsMenu() {
  const { jobs, videos, activeCount, unseen, cancelJob, dismissJob, removeVideo, markSeen } = useVideoJobs();
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState<{ url: string; title: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    markSeen();
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, markSeen]);

  const download = (v: LibraryVideo) => {
    const a = document.createElement('a');
    a.href = v.downloadUrl;
    a.click();
  };

  const activeJobs = jobs; // context already excludes ready
  const badge = activeCount + unseen;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="relative w-9 h-9 rounded-full flex items-center justify-center bg-[#F5F2EE] hover:bg-[#EDEAE5] transition-colors"
        title="Video reports"
        aria-label="Video reports"
      >
        <Clapperboard className="w-[18px] h-[18px] text-[#6B6965]" />
        {activeCount > 0 ? (
          <Loader2 className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 text-[#D4572A] animate-spin" />
        ) : badge > 0 ? (
          <span className="absolute top-1 right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-[#D4572A] text-white text-[9px] font-bold flex items-center justify-center" style={{ border: '1.5px solid #F7F6F3' }}>{badge}</span>
        ) : null}
      </button>

      {open && (
        <div className="absolute right-0 z-[60] mt-2 w-[340px] max-h-[520px] overflow-hidden rounded-2xl border border-border bg-white shadow-xl flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-[13px] font-semibold text-foreground">Video reports</span>
            <button onClick={() => setOpen(false)} className="p-1 rounded-md hover:bg-accent text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
          </div>

          <div className="overflow-y-auto">
            {activeJobs.length > 0 && (
              <div className="px-2 pt-2">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">In progress</div>
                {activeJobs.map(j => (
                  <div key={j.id} className="px-2 py-2 rounded-lg hover:bg-accent/50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-medium text-foreground truncate">{j.title}</span>
                      {(j.status === 'failed' || j.status === 'cancelled')
                        ? <button onClick={() => dismissJob(j.id)} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                        : <button onClick={() => cancelJob(j.id)} className="text-[10px] text-muted-foreground hover:text-[#D4183D]">Cancel</button>}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      {j.status === 'failed' ? <AlertTriangle className="w-3 h-3 text-amber-600" />
                        : j.status === 'cancelled' ? <X className="w-3 h-3 text-muted-foreground" />
                        : <Loader2 className="w-3 h-3 text-[#D4572A] animate-spin" />}
                      <span className="text-[10px] text-muted-foreground truncate">{j.error ?? j.label ?? STEP_LABEL[j.status]}</span>
                    </div>
                    {!['failed', 'cancelled'].includes(j.status) && (
                      <div className="h-1 mt-1.5 bg-[#F4F2EF] rounded-full overflow-hidden">
                        <div className="h-full bg-[#D4572A] transition-all duration-300" style={{ width: `${Math.round(j.progress * 100)}%` }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="px-2 pt-2 pb-2">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Library</div>
              {videos.length === 0 && activeJobs.length === 0 && (
                <div className="px-3 py-8 text-center text-[12px] text-muted-foreground">
                  No videos yet. Use <span className="font-medium">Export as → Video</span> on a report.
                </div>
              )}
              {videos.map(v => (
                <div key={v.id} className="group flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-accent/50">
                  <div className="w-8 h-8 rounded-md bg-[#1C1917] flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-[#1D9E75]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-medium text-foreground truncate">{v.title}</div>
                    <div className="text-[10px] text-muted-foreground">{fmtDur(v.durationSec)} · {fmtSize(v.sizeBytes)}</div>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-70 group-hover:opacity-100">
                    <button onClick={() => setPlaying({ url: v.playUrl, title: v.title })} className="p-1.5 rounded-md hover:bg-accent text-foreground" title="Play"><Play className="w-3.5 h-3.5" /></button>
                    <button onClick={() => download(v)} className="p-1.5 rounded-md hover:bg-accent text-foreground" title="Download"><Download className="w-3.5 h-3.5" /></button>
                    <button onClick={() => removeVideo(v.id)} className="p-1.5 rounded-md hover:bg-accent text-[#D4183D]" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Portalled to <body> so the fixed overlay isn't trapped by the header's
          backdrop-filter containing block (which mis-positions it). */}
      {playing && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-6" onClick={() => setPlaying(null)}>
          <div className="w-full max-w-[960px] rounded-2xl bg-white overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-[13px] font-semibold text-foreground truncate">{playing.title}</span>
              <button onClick={() => setPlaying(null)} className="p-1 rounded-md hover:bg-accent text-muted-foreground"><X className="w-4 h-4" /></button>
            </div>
            <video src={playing.url} controls autoPlay className="w-full max-h-[75vh] bg-black object-contain" />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
