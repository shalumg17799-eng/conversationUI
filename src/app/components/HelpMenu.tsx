// "What's new" / Help entry point, rendered as a left-sidebar item (above
// Settings). Shows a notification dot when the latest release hasn't been seen,
// and opens a modal listing every feature in that release — click a feature to
// play its video. Reuses the same fetch/seen logic and video-modal pattern the
// old floating pill used; self-contained (no context), polls every 60s so a new
// release lights the dot live.
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, Sparkles, X, Play } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const SEEN_KEY = 'whatsNewLastSeenVersion';
const POLL_MS = 60_000;

interface Feature {
  id: string;
  title: string;
  script?: string;
  bullets: string[];
  videoUrl: string; // relative, e.g. /media/releases/2026.07.14/doc-deck-export.mp4
}
interface Release {
  version: string;
  publishedAt?: string;
  features: Feature[];
}

const readSeen = (): string | null => {
  try { return localStorage.getItem(SEEN_KEY); } catch { return null; }
};

export function HelpMenu() {
  const [release, setRelease] = useState<Release | null>(null);
  const [lastSeen, setLastSeen] = useState<string | null>(readSeen);
  const [open, setOpen] = useState(false);
  // null = nothing playing yet (list-only). A feature index once the user clicks a row.
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/releases/latest`);
        if (res.status === 204 || !res.ok) return; // none published
        const data = (await res.json()) as Release;
        if (!cancelled && data?.version && Array.isArray(data.features) && data.features.length) setRelease(data);
      } catch {
        /* offline / endpoint missing — leave state as-is */
      }
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  const hasUnseen = !!release && release.version !== lastSeen;

  const openModal = () => {
    if (release) {
      // Opening the panel marks the whole release seen — no need to watch every video.
      try { localStorage.setItem(SEEN_KEY, release.version); } catch { /* ignore */ }
      setLastSeen(release.version);
    }
    setSelected(null); // open to the list; nothing plays until a row is clicked
    setOpen(true);
  };

  const feature = selected !== null ? release?.features[selected] : undefined;
  const dateLabel = release?.publishedAt ? new Date(release.publishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';

  return (
    <>
      {/* Sidebar item — matches the icon-rail nav style */}
      <button
        onClick={openModal}
        title="What's new / Help"
        className="flex flex-col items-center justify-center gap-1 w-full py-2.5 rounded-[10px] transition-all duration-150 group hover:bg-[#F5F2EE]"
      >
        <span className="relative">
          <HelpCircle className="w-[20px] h-[20px] text-[#B0ADA7] group-hover:text-[#6B6965]" />
          {hasUnseen && (
            <span
              className="absolute -top-1 -right-1 w-[7px] h-[7px] bg-[#D4572A] rounded-full"
              style={{ border: '1.5px solid #fff' }}
            />
          )}
        </span>
        <span className="text-[9px] text-center leading-tight text-[#B0ADA7] group-hover:text-[#6B6965]">Help</span>
      </button>

      {open && release && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-6" onClick={() => setOpen(false)}>
          <div className="w-full max-w-[900px] max-h-[88vh] flex flex-col rounded-2xl bg-white overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#ECEAE6] shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles size={16} className="shrink-0" style={{ color: '#D4572A' }} />
                <span className="font-semibold text-[#1A1917]">What's New</span>
                <span className="text-xs text-[#8A8785] shrink-0">· {release.version}{dateLabel ? ` · ${dateLabel}` : ''}</span>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="p-1 rounded-full text-[#8A8785] hover:bg-black/5">
                <X size={18} />
              </button>
            </div>

            {/* Selected feature's video */}
            {feature && (
              <video
                key={feature.id}
                src={`${API_BASE}${feature.videoUrl}`}
                controls
                autoPlay
                className="w-full bg-black object-contain shrink-0"
                style={{ maxHeight: '52vh' }}
              />
            )}

            {/* Feature list */}
            <div className="overflow-y-auto divide-y divide-[#F0EEE9]">
              {release.features.map((f, i) => {
                const active = i === selected;
                return (
                  <button
                    key={f.id}
                    onClick={() => setSelected(i)}
                    className={`w-full text-left px-5 py-3.5 transition-colors ${active ? 'bg-[#FEF0EC]' : 'hover:bg-[#F5F2EE]'}`}
                  >
                    <div className="flex items-center gap-2 font-medium text-[#1A1917]">
                      {/* play affordance in front of every title; fills in when active */}
                      <Play
                        size={14}
                        className="shrink-0"
                        style={{ color: active ? '#D4572A' : '#B0ADA7' }}
                        fill={active ? '#D4572A' : 'none'}
                      />
                      {f.title}
                    </div>
                    {f.bullets?.length > 0 && (
                      <ul className="mt-2 space-y-1.5">
                        {f.bullets.map((b, bi) => (
                          <li key={bi} className="flex items-start gap-2.5">
                            <span className="w-1.5 h-1.5 rounded-full mt-2 shrink-0" style={{ background: '#D4572A' }} />
                            <span className="text-sm text-[#57534E] leading-snug">{b}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
