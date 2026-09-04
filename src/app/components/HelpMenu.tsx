// "What's new" / Help entry point, rendered as a left-sidebar item (above
// Settings). Clicking it opens a small popover with two choices:
//   • What's New — the release-notes browser (every version, newest first, with
//     descriptions, an overview video, and a "Download PDF" of that version's
//     notes). The video is produced by the release pipeline (see releaseNotes/*);
//     here we just attach/play it, or show a placeholder until it exists.
//   • Help — support / documentation entry point (placeholder for now).
// Shows a notification dot when the latest release hasn't been seen, and
// AUTO-OPENS the What's New view once per session on the first load that carries
// an unseen release (i.e. right after login). Self-contained (no context); polls
// every 60s so a new release lights the dot live even without a reload.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, Sparkles, X, Play, FileDown, LifeBuoy, ChevronRight, ChevronDown, Check, Mail, BookOpen } from 'lucide-react';
import { generateReleaseNotesPDF } from '../../lib/generateReleaseNotesPDF';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const SEEN_KEY = 'whatsNewLastSeenVersion';
const AUTO_KEY = 'whatsNewAutoOpenedVersion'; // session-scoped: auto-open a version at most once
const POLL_MS = 60_000;

interface Feature {
  id: string;
  title: string;
  script?: string;
  bullets: string[];
  affectedArea?: string;
  videoUrl: string; // relative, e.g. /media/releases/v1.1.0/doc-deck-export.mp4
}
interface Release {
  version: string;
  name?: string;
  publishedAt?: string;
  features: Feature[];
  // One combined overview video for the whole release. Falls back to the first
  // feature's video when the pipeline hasn't produced a combined cut yet.
  overviewVideoUrl?: string;
  posterUrl?: string; // still frame shown before playback
  durationSec?: number;
}

const readSeen = (): string | null => {
  try { return localStorage.getItem(SEEN_KEY); } catch { return null; }
};

const overviewOf = (r: Release): string | undefined => r.overviewVideoUrl || r.features[0]?.videoUrl || undefined;

export function HelpMenu() {
  const [releases, setReleases] = useState<Release[]>([]);
  const [lastSeen, setLastSeen] = useState<string | null>(readSeen);
  const [menuOpen, setMenuOpen] = useState(false);
  const [view, setView] = useState<null | 'whatsnew' | 'help'>(null);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false); // false = poster + play button; true = <video> playing
  const [versionMenuOpen, setVersionMenuOpen] = useState(false); // header version dropdown
  const autoOpenedRef = useRef(false);
  const menuWrapRef = useRef<HTMLDivElement>(null);
  const versionMenuRef = useRef<HTMLDivElement>(null);

  const latest = releases[0] || null; // list is served newest-first

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/releases/all`);
        if (!res.ok) return;
        const data = (await res.json()) as { releases?: Release[] };
        const list = (data?.releases ?? []).filter((r) => r?.version && Array.isArray(r.features) && r.features.length);
        if (!cancelled) setReleases(list);
      } catch {
        /* offline / endpoint missing — leave state as-is */
      }
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  const hasUnseen = !!latest && latest.version !== lastSeen;

  const markSeen = (version: string) => {
    try { localStorage.setItem(SEEN_KEY, version); } catch { /* ignore */ }
    setLastSeen(version);
  };

  const openWhatsNew = (version?: string) => {
    const v = version || latest?.version || null;
    if (latest) markSeen(latest.version); // opening marks the newest release seen
    setSelectedVersion(v);
    setPlaying(false); // always open to the poster; user clicks play
    setView('whatsnew');
    setMenuOpen(false);
  };

  // Auto-open once per session when the first load carries an unseen release —
  // the "trigger on login" behaviour. Guarded by sessionStorage so a manual
  // close (or the 60s poll) never re-pops it for the same version.
  useEffect(() => {
    if (!latest || !hasUnseen || autoOpenedRef.current) return;
    let alreadyAutoOpened = false;
    try { alreadyAutoOpened = sessionStorage.getItem(AUTO_KEY) === latest.version; } catch { /* ignore */ }
    if (alreadyAutoOpened) return;
    autoOpenedRef.current = true;
    try { sessionStorage.setItem(AUTO_KEY, latest.version); } catch { /* ignore */ }
    openWhatsNew(latest.version);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest, hasUnseen]);

  // Close the popover on outside-click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  const selected = useMemo(
    () => releases.find((r) => r.version === selectedVersion) || releases[0] || null,
    [releases, selectedVersion],
  );

  const closeModal = () => { setView(null); setPlaying(false); setVersionMenuOpen(false); };

  // Close the header version dropdown on outside-click / Escape.
  useEffect(() => {
    if (!versionMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (versionMenuRef.current && !versionMenuRef.current.contains(e.target as Node)) setVersionMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setVersionMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [versionMenuOpen]);

  const dateLabel = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';

  return (
    <>
      {/* Sidebar item — matches the icon-rail nav style */}
      <div className="relative" ref={menuWrapRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          title="What's new / Help"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
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

        {/* Popover menu — anchored to the right of the rail */}
        {menuOpen && (
          <div
            role="menu"
            className="absolute left-[calc(100%+10px)] bottom-0 z-[210] w-56 rounded-[14px] bg-white shadow-2xl ring-1 ring-black/10 p-1.5 animate-[fadeIn_.12s_ease-out]"
          >
            <button
              role="menuitem"
              onClick={() => openWhatsNew()}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-left hover:bg-[#FBF6F3] transition-colors group"
            >
              <span className="grid place-items-center w-8 h-8 rounded-full shrink-0" style={{ background: '#FDE7DE' }}>
                <Sparkles size={15} style={{ color: '#D4572A' }} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 font-semibold text-[13.5px] text-[#1A1917]">
                  What's New
                  {hasUnseen && <span className="w-[6px] h-[6px] rounded-full bg-[#D4572A]" />}
                </span>
                <span className="block text-[11.5px] text-[#8A8785] leading-tight">Release notes &amp; videos</span>
              </span>
              <ChevronRight size={15} className="text-[#C4C1BB] group-hover:text-[#8A8785] shrink-0" />
            </button>

            <button
              role="menuitem"
              onClick={() => { setView('help'); setMenuOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-left hover:bg-[#F5F4F2] transition-colors group"
            >
              <span className="grid place-items-center w-8 h-8 rounded-full shrink-0" style={{ background: '#EDEBE8' }}>
                <LifeBuoy size={15} style={{ color: '#6B6965' }} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-[13.5px] text-[#1A1917]">Help</span>
                <span className="block text-[11.5px] text-[#8A8785] leading-tight">Docs &amp; support</span>
              </span>
              <ChevronRight size={15} className="text-[#C4C1BB] group-hover:text-[#8A8785] shrink-0" />
            </button>
          </div>
        )}
      </div>

      {/* ── What's New — multi-version browser ─────────────────────────────── */}
      {view === 'whatsnew' && selected && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6 animate-[fadeIn_.15s_ease-out]"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-[1200px] max-h-[92vh] flex flex-col rounded-[20px] bg-white overflow-hidden shadow-2xl ring-1 ring-black/5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header — subtle terracotta wash */}
            <div
              className="flex items-center justify-between px-6 py-4 border-b border-[#F0EDE8] shrink-0"
              style={{ background: 'linear-gradient(90deg,#FFF7F3 0%,#FFFFFF 60%)' }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="grid place-items-center w-8 h-8 rounded-full" style={{ background: '#FDE7DE' }}>
                  <Sparkles size={16} style={{ color: '#D4572A' }} />
                </span>
                <div className="flex flex-col leading-tight min-w-0">
                  <span className="font-semibold text-[15px] text-[#1A1917]">What's New</span>
                  <span className="text-[11px] text-[#8A8785] truncate">Everything we've shipped, newest first</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* Version picker — dropdown, sits just left of the close icon */}
                <div className="relative" ref={versionMenuRef}>
                  <button
                    onClick={() => setVersionMenuOpen((v) => !v)}
                    aria-haspopup="listbox"
                    aria-expanded={versionMenuOpen}
                    className="flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-[10px] bg-white ring-1 ring-[#E5E1DB] hover:ring-[#D4572A]/40 transition-colors"
                  >
                    <span className="flex flex-col items-start leading-tight min-w-0">
                      <span className="text-[13px] font-semibold text-[#1A1917] truncate max-w-[160px]">{selected.name || selected.version}</span>
                      <span className="text-[10.5px] text-[#8A8785] truncate max-w-[160px]">
                        {selected.version}{dateLabel(selected.publishedAt) ? ` · ${dateLabel(selected.publishedAt)}` : ''}
                      </span>
                    </span>
                    <ChevronDown size={16} className={`text-[#8A8785] transition-transform ${versionMenuOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {versionMenuOpen && (
                    <div
                      role="listbox"
                      className="absolute right-0 top-[calc(100%+6px)] z-[10] w-64 max-h-[60vh] overflow-y-auto rounded-[14px] bg-white shadow-2xl ring-1 ring-black/10 p-1.5 animate-[fadeIn_.12s_ease-out]"
                    >
                      {releases.map((r) => {
                        const active = r.version === selected.version;
                        return (
                          <button
                            key={r.version}
                            role="option"
                            aria-selected={active}
                            onClick={() => { setSelectedVersion(r.version); setPlaying(false); setVersionMenuOpen(false); }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-left transition-colors ${
                              active ? 'bg-[#FBF6F3]' : 'hover:bg-[#F5F4F2]'
                            }`}
                          >
                            <span className="min-w-0 flex-1">
                              <span className={`block text-[13.5px] font-semibold truncate ${active ? 'text-[#1A1917]' : 'text-[#4C4842]'}`}>
                                {r.name || r.version}
                              </span>
                              <span className="block text-[11px] text-[#8A8785] truncate">
                                {r.version}{dateLabel(r.publishedAt) ? ` · ${dateLabel(r.publishedAt)}` : ''} · {r.features.length} update{r.features.length > 1 ? 's' : ''}
                              </span>
                            </span>
                            {active && <Check size={15} className="text-[#D4572A] shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <button
                  onClick={closeModal}
                  aria-label="Close"
                  className="p-1.5 rounded-full text-[#8A8785] hover:bg-black/5 hover:text-[#1A1917] transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Selected version detail — features · overview video */}
            <div className="grid grid-cols-1 min-h-0 flex-1">
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,42fr)_minmax(0,58fr)] min-h-0">
                {/* Left — features */}
                <div className="overflow-y-auto px-7 py-6 lg:border-r border-[#F0EDE8]">
                  <div className="flex items-start justify-between gap-3 mb-5">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#B0ADA7]">In this release</p>
                      <p className="text-[13px] text-[#8A8785] mt-0.5">
                        {selected.version}{dateLabel(selected.publishedAt) ? ` · ${dateLabel(selected.publishedAt)}` : ''} · {selected.features.length} update{selected.features.length > 1 ? 's' : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => generateReleaseNotesPDF(selected)}
                      title="Download these release notes as a PDF"
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold text-white shadow-sm transition-transform hover:scale-[1.03] active:scale-95"
                      style={{ background: '#D4572A' }}
                    >
                      <FileDown size={14} /> PDF
                    </button>
                  </div>

                  <ul className="space-y-6">
                    {selected.features.map((f, i) => (
                      <li key={f.id} className="flex gap-3">
                        <span
                          className="grid place-items-center w-6 h-6 rounded-full text-[11px] font-semibold shrink-0 mt-0.5"
                          style={{ background: '#FDE7DE', color: '#D4572A' }}
                        >
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="font-semibold text-[14.5px] text-[#1A1917] leading-snug">{f.title}</div>
                          {f.affectedArea && (
                            <span className="inline-block mt-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: '#FDE7DE', color: '#D4572A' }}>
                              {f.affectedArea}
                            </span>
                          )}
                          {f.script && (
                            <p className="mt-2 text-[13px] text-[#6B6965] leading-relaxed">{f.script}</p>
                          )}
                          {f.bullets?.length > 0 && (
                            <ul className="mt-2.5 space-y-2">
                              {f.bullets.map((b, bi) => (
                                <li key={bi} className="flex items-start gap-2.5">
                                  <span className="w-1.5 h-1.5 rounded-full mt-[7px] shrink-0" style={{ background: '#D4572A' }} />
                                  <span className="text-[13.5px] text-[#4C4842] leading-snug">{b}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Right — overview video (or placeholder) + document actions */}
                <div className="flex flex-col justify-center p-8 gap-4 min-w-0 bg-[#FBFAF8] lg:bg-transparent">
                  {(() => {
                    const overviewUrl = overviewOf(selected);
                    return (
                      <>
                        <div className="relative w-full rounded-[14px] overflow-hidden bg-black shadow-lg" style={{ aspectRatio: '16 / 9' }}>
                          {playing && overviewUrl ? (
                            <video
                              key={`${selected.version}:${overviewUrl}`}
                              src={`${API_BASE}${overviewUrl}`}
                              poster={selected.posterUrl ? `${API_BASE}${selected.posterUrl}` : undefined}
                              controls
                              autoPlay
                              className="absolute inset-0 w-full h-full object-contain bg-black"
                            />
                          ) : (
                            <button
                              onClick={() => overviewUrl && setPlaying(true)}
                              disabled={!overviewUrl}
                              className="group absolute inset-0 w-full h-full flex items-center justify-center disabled:cursor-default"
                              aria-label="Play overview video"
                            >
                              {selected.posterUrl ? (
                                <img src={`${API_BASE}${selected.posterUrl}`} alt="" className="absolute inset-0 w-full h-full object-cover" />
                              ) : (
                                <div
                                  className="absolute inset-0"
                                  style={{ background: 'radial-gradient(120% 120% at 30% 20%, #3A2A24 0%, #1A1210 70%)' }}
                                />
                              )}
                              <span className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                              {overviewUrl ? (
                                <span className="relative grid place-items-center w-16 h-16 rounded-full bg-white/95 shadow-xl transition-transform duration-150 group-hover:scale-105">
                                  <Play size={26} style={{ color: '#D4572A', marginLeft: 3 }} fill="#D4572A" />
                                </span>
                              ) : (
                                <span className="relative text-[13px] text-white/70">Overview video coming soon</span>
                              )}
                              <span className="absolute bottom-3 left-4 right-4 text-left text-white">
                                <span className="block text-[13px] font-semibold drop-shadow">Watch the {selected.version} overview</span>
                                <span className="block text-[11px] text-white/75">
                                  {selected.durationSec ? `${Math.round(selected.durationSec)}s · ` : ''}All {selected.features.length} updates in one video
                                </span>
                              </span>
                            </button>
                          )}
                        </div>

                        {/* Document actions */}
                        <div className="flex flex-wrap items-center gap-2.5">
                          <button
                            onClick={() => generateReleaseNotesPDF(selected)}
                            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-[10px] text-[13px] font-semibold text-white shadow-sm transition-transform hover:scale-[1.02] active:scale-95"
                            style={{ background: '#D4572A' }}
                          >
                            <FileDown size={15} /> Download PDF
                          </button>
                          <button
                            onClick={() => overviewUrl && setPlaying(true)}
                            disabled={!overviewUrl}
                            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-[10px] text-[13px] font-semibold text-[#4C4842] ring-1 ring-[#E5E1DB] hover:bg-[#F5F2EE] transition-colors disabled:opacity-50 disabled:cursor-default"
                          >
                            <Play size={15} /> {overviewUrl ? 'Play video' : 'Video coming soon'}
                          </button>
                        </div>
                        <p className="text-[11.5px] text-[#8A8785] leading-relaxed">
                          Generate a shareable document of this release — download the notes as a PDF, or watch the auto-generated narrated walkthrough of everything new.
                        </p>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ── Help — docs & support ──────────────────────────────────────────── */}
      {view === 'help' && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6 animate-[fadeIn_.15s_ease-out]"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-[440px] rounded-[20px] bg-white overflow-hidden shadow-2xl ring-1 ring-black/5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0EDE8]">
              <div className="flex items-center gap-2.5">
                <span className="grid place-items-center w-8 h-8 rounded-full" style={{ background: '#EDEBE8' }}>
                  <LifeBuoy size={16} style={{ color: '#6B6965' }} />
                </span>
                <span className="font-semibold text-[15px] text-[#1A1917]">Help &amp; Support</span>
              </div>
              <button
                onClick={closeModal}
                aria-label="Close"
                className="p-1.5 rounded-full text-[#8A8785] hover:bg-black/5 hover:text-[#1A1917] transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-2.5">
              <a
                href="mailto:support@radiant.digital"
                className="flex items-center gap-3 px-3.5 py-3 rounded-[12px] ring-1 ring-[#EDEAE5] hover:bg-[#FBFAF8] transition-colors"
              >
                <Mail size={17} className="text-[#D4572A] shrink-0" />
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold text-[#1A1917]">Contact support</span>
                  <span className="block text-[12px] text-[#8A8785] truncate">support@radiant.digital</span>
                </span>
              </a>
              <button
                onClick={() => openWhatsNew()}
                className="w-full flex items-center gap-3 px-3.5 py-3 rounded-[12px] ring-1 ring-[#EDEAE5] hover:bg-[#FBFAF8] transition-colors text-left"
              >
                <Sparkles size={17} className="text-[#D4572A] shrink-0" />
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold text-[#1A1917]">What's new</span>
                  <span className="block text-[12px] text-[#8A8785] truncate">Latest features &amp; release notes</span>
                </span>
              </button>
              <div className="flex items-center gap-3 px-3.5 py-3 rounded-[12px] ring-1 ring-[#EDEAE5] opacity-70">
                <BookOpen size={17} className="text-[#8A8785] shrink-0" />
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold text-[#1A1917]">Documentation</span>
                  <span className="block text-[12px] text-[#8A8785] truncate">Guides &amp; tutorials — coming soon</span>
                </span>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
