// Persistent "what's new" affordance. It always shows a small pill bottom-right
// while a release exists — clicking it replays the latest explainer any time.
// When there's a release the user hasn't seen yet it emphasises itself ("New
// feature — take a look" + a pulsing dot); once watched it stays as a subtle
// "What's new" pill (doesn't vanish). It polls every 60s, so a freshly published
// release re-emphasises live without a refresh or re-login.
// Self-contained: no new context/provider; mounted once in Layout (auth pages).
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, X } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const SEEN_KEY = 'lastSeenReleaseVersion';
const POLL_MS = 60_000;

interface Release {
  version: string;
  title: string;
  script?: string;
  bullets?: string[];
  videoUrl: string; // relative, e.g. /media/releases/2026.07.13.mp4
  createdAt?: string;
}

const readSeen = (): string | null => {
  try { return localStorage.getItem(SEEN_KEY); } catch { return null; }
};

export function WhatsNewBadge() {
  const [release, setRelease] = useState<Release | null>(null);
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState<string | null>(readSeen);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/releases/latest`);
        if (res.status === 204 || !res.ok) return; // none published
        const data = (await res.json()) as Release;
        if (!cancelled && data?.version && data?.videoUrl) setRelease(data);
      } catch {
        /* offline / endpoint missing — leave the current pill as-is */
      }
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  if (!release) return null;

  const isNew = release.version !== lastSeen;
  const videoSrc = `${API_BASE}${release.videoUrl}`;

  const watch = () => {
    try { localStorage.setItem(SEEN_KEY, release.version); } catch { /* ignore */ }
    setLastSeen(release.version); // tone the pill down, but keep it visible
    setOpen(true);
  };

  return (
    <>
      <div className="fixed bottom-6 right-6 z-[150]">
        <button
          onClick={watch}
          title={`${release.title} · ${release.version}`}
          className="flex items-center rounded-full shadow-lg border border-[#E5E3DF] transition-all"
          style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
        >
          {isNew ? (
            <span className="flex items-center gap-2.5 pl-2 pr-4 py-1.5 text-sm font-medium text-[#1A1917]">
              <span className="relative flex items-center justify-center w-7 h-7 rounded-full text-white shrink-0" style={{ background: '#D4572A' }}>
                <Sparkles size={15} />
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#D4572A] ring-2 ring-white animate-pulse" />
              </span>
              New feature — take a look
            </span>
          ) : (
            <span className="flex items-center gap-2 pl-2.5 pr-3.5 py-1.5 text-[13px] font-medium text-[#6B6965] hover:text-[#1A1917]">
              <Sparkles size={14} className="shrink-0" style={{ color: '#D4572A' }} />
              What's new
            </span>
          )}
        </button>
      </div>

      {open && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-6" onClick={() => setOpen(false)}>
          <div className="w-full max-w-[900px] rounded-2xl bg-white overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#ECEAE6]">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles size={16} className="shrink-0" style={{ color: '#D4572A' }} />
                <span className="font-medium text-[#1A1917] truncate">{release.title}</span>
                <span className="text-xs text-[#8A8785] shrink-0">· {release.version}</span>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="p-1 rounded-full text-[#8A8785] hover:bg-black/5">
                <X size={18} />
              </button>
            </div>
            <video src={videoSrc} controls autoPlay className="w-full max-h-[70vh] bg-black object-contain" />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
