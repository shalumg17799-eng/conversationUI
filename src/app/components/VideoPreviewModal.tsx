// Preview: compiles the report into a VideoScript, generates ElevenLabs
// voiceover per scene (retiming scenes to the narration), then plays it live in
// a @remotion/player. Phase 3 moves the mp4 encode into a background job; this
// modal stays as the instant preview.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Player } from '@remotion/player';
import { X, Volume2, AlertTriangle, Loader2 } from 'lucide-react';
import { ReportVideo } from '@/remotion/ReportVideo';
import { buildVideoScript, narrateScript, scriptDurationInFrames } from '@/lib/videoScript';
import { polishScriptNarration } from '@/lib/narrationPolish';
import { ttsAvailable } from '@/lib/tts';
import type { VideoScript } from '@/remotion/types';
import type { ReportMeta } from '@/lib/exportReport';

export function VideoPreviewModal({ meta, components, onClose }: { meta: ReportMeta; components: any[]; onClose: () => void }) {
  const baseScript = useMemo(() => buildVideoScript(meta, components), [meta, components]);
  const [script, setScript] = useState<VideoScript>(baseScript);
  const [phase, setPhase] = useState<'voicing' | 'ready' | 'silent'>(ttsAvailable() ? 'voicing' : 'silent');
  const [progress, setProgress] = useState({ done: 0, total: baseScript.scenes.length });
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    if (!ttsAvailable()) return; // no key → silent preview
    (async () => {
      try {
        const polished = await polishScriptNarration(baseScript);
        const voiced = await narrateScript(polished, (done, total) => {
          if (!cancelled.current) setProgress({ done, total });
        });
        if (!cancelled.current) { setScript(voiced); setPhase('ready'); }
      } catch (e: any) {
        if (!cancelled.current) { setError(e?.message ?? 'Voiceover failed'); setPhase('silent'); }
      }
    })();
    return () => { cancelled.current = true; };
  }, [baseScript]);

  const durationInFrames = useMemo(() => scriptDurationInFrames(script), [script]);
  const showPlayer = phase === 'ready' || phase === 'silent';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div className="w-full max-w-[1100px] rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[14px] font-semibold text-foreground truncate">Video preview — {script.title}</span>
            <span className="text-[11px] text-muted-foreground flex-shrink-0">{script.scenes.length} scenes · ~{Math.round(durationInFrames / script.fps)}s</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-[#1C1917] relative" style={{ aspectRatio: `${script.width} / ${script.height}` }}>
          {phase === 'voicing' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-brand" />
              <div className="text-[14px] font-medium flex items-center gap-2"><Volume2 className="w-4 h-4" /> Generating voiceover…</div>
              <div className="w-64 h-1.5 bg-white/15 rounded-full overflow-hidden">
                <div className="h-full bg-brand transition-all duration-300" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
              </div>
              <div className="text-[11px] text-white/60">Scene {progress.done} of {progress.total}</div>
            </div>
          )}
          {showPlayer && (
            <Player
              component={ReportVideo}
              inputProps={{ script }}
              durationInFrames={durationInFrames}
              fps={script.fps}
              compositionWidth={script.width}
              compositionHeight={script.height}
              style={{ width: '100%' }}
              controls
              autoPlay
              loop
            />
          )}
        </div>

        <div className="px-5 py-3 text-[11px] text-muted-foreground border-t border-border flex items-center gap-2">
          {error ? (
            <span className="flex items-center gap-1.5 text-amber-600"><AlertTriangle className="w-3.5 h-3.5" /> Voiceover unavailable ({error}). Playing silent preview.</span>
          ) : phase === 'silent' ? (
            <span className="flex items-center gap-1.5 text-amber-600"><AlertTriangle className="w-3.5 h-3.5" /> No ElevenLabs key set — silent preview. Add VITE_ELEVENLABS_KEY for narration.</span>
          ) : (
            <span>MP4 export renders in the background (next phase) and lands in the header video tray. Preview loops here.</span>
          )}
        </div>
      </div>
    </div>
  );
}
