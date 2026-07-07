// Export dropdown for a generated report — PDF / Excel / PPT / Video.
// Self-contained (own open state + outside-click close) so each report row in a
// chat can render its own menu without colliding on shared state.

import { useEffect, useRef, useState } from 'react';
import { Download, FileSpreadsheet, FileText, Presentation, Clapperboard, Eye, ChevronDown } from 'lucide-react';
import { exportReportPDF, exportReportExcel, exportReportPPT, type ReportMeta } from '@/lib/exportReport';
import { VideoPreviewModal } from './VideoPreviewModal';
import { useVideoJobs } from '@/app/context/VideoJobsContext';

interface ExportMenuProps {
  meta: ReportMeta;
  components: any[];
}

type ExportOption = {
  key: string;
  label: string;
  hint: string;
  Icon: typeof FileText;
  run?: (meta: ReportMeta, components: any[]) => void;
  action?: 'video' | 'preview';
};

const OPTIONS: ExportOption[] = [
  { key: 'pdf', label: 'PDF', hint: 'Formatted document', Icon: FileText, run: exportReportPDF },
  { key: 'excel', label: 'Excel', hint: 'Spreadsheet workbook', Icon: FileSpreadsheet, run: exportReportExcel },
  { key: 'ppt', label: 'PPT', hint: 'Presentation deck', Icon: Presentation, run: exportReportPPT },
  { key: 'video', label: 'Video (MP4)', hint: 'Renders in the video tray', Icon: Clapperboard, action: 'video' },
  { key: 'preview', label: 'Preview video', hint: 'Play instantly, no export', Icon: Eye, action: 'preview' },
];

export function ExportMenu({ meta, components }: ExportMenuProps) {
  const { enqueue } = useVideoJobs();
  const [open, setOpen] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium rounded-lg border border-border text-foreground hover:bg-accent hover:border-brand/40 transition-colors"
        title="Export report"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Download className="w-3.5 h-3.5" />
        Export as
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1.5 w-52 overflow-hidden rounded-xl border border-border bg-white shadow-lg"
        >
          {OPTIONS.map(({ key, label, hint, Icon, run, action }) => (
            <button
              key={key}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                if (action === 'video') enqueue(meta, components);
                else if (action === 'preview') setShowVideo(true);
                else run?.(meta, components);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-accent transition-colors"
            >
              <Icon className="w-4 h-4 text-brand flex-shrink-0" />
              <span className="flex flex-col">
                <span className="text-[13px] font-medium text-foreground leading-tight">{label}</span>
                <span className="text-[11px] text-muted-foreground leading-tight">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {showVideo && (
        <VideoPreviewModal meta={meta} components={components} onClose={() => setShowVideo(false)} />
      )}
    </div>
  );
}
