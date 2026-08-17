import React from 'react';
import { sanitizeArtifact, buildArtifactSrcDoc } from './artifactSanitizer';
import { guardMermaid, escapeLabelAngles } from './mermaidGuard';
import { ArtifactShell, ArtifactFallback } from './ArtifactShell';

// ════════════════════════════════════════════════════════════════════════════
// MERMAID ARTIFACT — text-to-diagram, compiled on the client
// ════════════════════════════════════════════════════════════════════════════
// Pipeline, in order (the order is load-bearing — see the <style> note below):
//
//   props.content (Mermaid SOURCE)
//     -> guardMermaid()            refuse unknown diagram types, init directives,
//                                  click statements, embedded markup
//     -> mermaid.render()          runs in the PARENT document, produces SVG
//     -> strip <style> block       remove all Mermaid-emitted CSS
//     -> sanitizeArtifact(_, 'mermaid')   allowlist strip of the SVG
//     -> buildArtifactSrcDoc(_, 'mermaid') adds app-authored MERMAID_CSS + CSP
//     -> <ArtifactShell>           the same <iframe sandbox=""> as every artifact
//
// THE ONE GENUINELY NEW EXPOSURE, stated plainly: mermaid.render() executes in the
// parent document, not in the sandbox, and briefly attaches a temporary element to
// document.body while measuring text. That is a *library* execution, not execution
// of model-authored script — the model supplies only declarative diagram source,
// and guardMermaid has already refused the constructs (%%{init}%%, click, markup)
// that could steer the library. Every other layer of the artifact security model
// is untouched: no allow-scripts, no CSP relaxation, no dangerouslySetInnerHTML.
// Do not move any of this work inside the iframe "for isolation" — that would
// require allow-scripts, which is strictly worse.

// Initialize exactly once per session, at module scope, so N diagram cards share
// one import and one configuration. The import is dynamic and this module is
// itself React.lazy'd, so nothing here enters the initial bundle.
let mermaidReady: Promise<any> | null = null;
function getMermaid(): Promise<any> {
  if (!mermaidReady) {
    mermaidReady = import('mermaid').then((mod) => {
      const m = mod.default;
      m.initialize({
        startOnLoad: false,
        // 'strict' runs Mermaid's own DOMPurify pass over labels and makes it
        // ignore click/interaction bindings. Deliberately NOT 'sandbox', which
        // would have Mermaid render into an iframe *it* controls — nesting its
        // frame inside ours means inheriting its policy instead of enforcing our own.
        securityLevel: 'strict',
        theme: 'base',
        // Theme variables are the OTHER half of the styling story. MERMAID_CSS in
        // artifactSanitizer covers what Mermaid styles through its <style> block;
        // these cover what it bakes into `fill`/`stroke` PRESENTATION ATTRIBUTES,
        // which survive sanitizing untouched. Without them, flowcharts came out in
        // the app palette while class/timeline/mindmap diagrams kept Mermaid's
        // stock colours — same report, two visual languages.
        //
        // Setting these here is not a hole in the %%{init}%% ban: this is our own
        // trusted configuration, applied once at module scope. What the guard
        // refuses is the MODEL supplying theme config through diagram source.
        themeVariables: {
          primaryColor: '#EFF6FF',
          primaryBorderColor: '#2563EB',
          primaryTextColor: '#1C1917',
          secondaryColor: '#F0FDF4',
          secondaryBorderColor: '#1D9E75',
          tertiaryColor: '#FEF3C7',
          tertiaryBorderColor: '#D97706',
          mainBkg: '#EFF6FF',
          nodeBorder: '#2563EB',
          lineColor: '#8A8785',
          textColor: '#1C1917',
          clusterBkg: '#F4F2EF',
          clusterBorder: '#E5E3DF',
          edgeLabelBackground: '#FFFFFF',
          fontSize: '16px',
        },
        // htmlLabels:false keeps labels as <text>/<tspan>. With htmlLabels:true
        // Mermaid emits <foreignObject>, which the sanitizer strips wholesale —
        // every node label would silently vanish and the diagram would render as
        // unlabelled boxes.
        //
        // BOTH the top-level flag and the per-diagram flags are required. Setting
        // only `flowchart.htmlLabels` leaves Mermaid 11 emitting foreignObject for
        // node labels; this was observed, not assumed — see the fixture generator.
        htmlLabels: false,
        // useMaxWidth:false everywhere is REQUIRED, not a preference.
        //
        // With useMaxWidth:true Mermaid emits width="100%" plus an inline
        // style="max-width:<natural>px". The sanitizer strips `style` attributes,
        // so only width="100%" survives and every diagram stretches to fill the
        // frame — a 222px class diagram was observed upscaling ~3.7x, with text
        // ballooning to match. With it false Mermaid writes real width/height
        // attributes (both allowlisted), and the wrapper's `svg{max-width:100%;
        // height:auto}` scales large diagrams down without ever scaling small
        // ones up.
        flowchart: { htmlLabels: false, useMaxWidth: false },
        class: { htmlLabels: false, useMaxWidth: false },
        sequence: { useMaxWidth: false },
        state: { useMaxWidth: false },
        er: { useMaxWidth: false },
        mindmap: { useMaxWidth: false },
        timeline: { useMaxWidth: false },
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      });
      return m;
    });
  }
  return mermaidReady;
}

// Mermaid requires a unique DOM id per render call. The hash makes the id stable
// and greppable for a given diagram; the counter guarantees uniqueness even when
// two cards hold identical source and render concurrently.
let renderSeq = 0;
function idFor(code: string): string {
  let h = 5381;
  for (let i = 0; i < code.length; i++) h = ((h << 5) + h + code.charCodeAt(i)) | 0;
  return `mermaid-${(h >>> 0).toString(36)}-${++renderSeq}`;
}

// Mermaid styles its output through a <style> block inside the <svg>. It is
// removed HERE, before sanitizing, and replaced downstream by the trusted
// MERMAID_CSS in buildArtifactSrcDoc.
//
// The ordering is mandatory, not cosmetic. sanitizeArtifact would drop the block
// anyway (style is absent from SVG_TAGS), but it would count those multiple
// kilobytes as *removed*, dragging retention below MIN_RETENTION_RATIO and
// false-downgrading a perfectly good diagram to plain text. Pre-stripping shrinks
// originalLength too, so the retention ratio stays honest.
function stripStyleBlocks(svg: string): string {
  return svg.replace(/<style[\s\S]*?<\/style>/gi, '');
}

// Natural size of the rendered diagram, read off the <svg> open tag.
//
// This is only available because `useMaxWidth:false` makes Mermaid write real
// width/height attributes (both allowlisted, so they survive sanitizing). The
// frame needs them: it is cross-origin by design, so the parent can never measure
// the diagram once it is inside the iframe.
function intrinsicOf(svg: string): { w: number; h: number } | undefined {
  const open = /<svg\b[^>]*>/i.exec(svg)?.[0];
  if (!open) return undefined;
  const w = parseFloat(/\swidth="([\d.]+)"/i.exec(open)?.[1] ?? '');
  const h = parseFloat(/\sheight="([\d.]+)"/i.exec(open)?.[1] ?? '');
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? { w, h } : undefined;
}

// Prepended to every guard-approved diagram immediately before mermaid.render.
// See the call site for why config alone is not enough. Keep this MINIMAL and
// restrictive — it exists to pin label rendering, never to style anything.
const RENDER_DIRECTIVE =
  '%%{init: {"flowchart": {"htmlLabels": false}, "class": {"htmlLabels": false}}}%%\n';

type FrameState =
  | { status: 'pending' }
  | { status: 'ok'; srcDoc: string; intrinsic?: { w: number; h: number } }
  | { status: 'error'; reason: string };

export default function MermaidArtifact({ content, title, caption, explanation, variant }: any) {
  const guard = React.useMemo(() => guardMermaid(content), [content]);
  const [state, setState] = React.useState<FrameState>({ status: 'pending' });

  React.useEffect(() => {
    // Never call mermaid.render on unguarded input.
    if (!guard.ok) return;

    let alive = true;
    (async () => {
      try {
        const mermaid = await getMermaid();
        // Normalize AFTER guarding: the guard judges what the model actually
        // wrote, then this repairs the one construct Mermaid would silently
        // destroy. See escapeLabelAngles for why this is not a "strip".
        const code = escapeLabelAngles(guard.code);
        // Force htmlLabels off PER RENDER, not just via initialize().
        //
        // initialize() writes to Mermaid's config singleton, and that singleton is
        // only shared with the renderer while there is exactly ONE copy of Mermaid in
        // the module graph. A stale Vite dep pre-bundle produces two: initialize()
        // reports htmlLabels:false on one while the renderer runs on the other's
        // default (true), emits <foreignObject> labels, and every diagram in the app
        // is refused below — with the harness, which has its own dep cache, working
        // perfectly the whole time. A directive travels WITH the source, so it cannot
        // be separated from the render the way shared config can.
        //
        // This is not a hole in the %%{init}%% ban. The guard refuses directives the
        // MODEL supplies, and it has already run: `guard.code` is approved source and
        // provably contains no directive of its own. This one is app-authored and
        // strictly more restrictive — exactly like the initialize() call above.
        const { svg } = await mermaid.render(idFor(code), RENDER_DIRECTIVE + code);
        if (!alive) return;

        // Mermaid puts node labels inside <foreignObject> when htmlLabels is on.
        // The sanitizer drops that element and its whole subtree, so the diagram
        // would render as unlabelled boxes — present, plausible, and meaningless.
        // Our config sets htmlLabels:false everywhere precisely to avoid this, so
        // reaching here means the config drifted or a Mermaid upgrade changed the
        // default. Fail loudly with an accurate reason instead of letting a
        // silently empty diagram through.
        if (/<foreignObject/i.test(svg)) {
          // OBSERVED CAUSE, and it is not a code change: a STALE Vite dependency
          // pre-bundle. `optimizeDeps.include: ['mermaid']` caches mermaid under
          // node_modules/.vite/deps, and if that cache is corrupt (an interrupted
          // re-optimization leaves a deps_temp_* directory behind) the copy that
          // getMermaid() initializes is not the copy that renders. initialize()
          // reports htmlLabels:false while the renderer still runs on the default
          // true — so every diagram comes back as foreignObject and every card
          // refuses, with the app broken and the harness fine. Cost hours to find;
          // the hint belongs here rather than in someone's memory.
          console.warn(
            '[mermaid-artifact] Mermaid emitted <foreignObject> despite htmlLabels:false. ' +
            'This usually means a stale Vite dep pre-bundle — stop the dev server, ' +
            'delete node_modules/.vite, and restart.',
          );
          setState({ status: 'error', reason: 'diagram labels could not be rendered safely' });
          return;
        }

        const result = sanitizeArtifact(stripStyleBlocks(svg), 'mermaid');
        if (!result.usable) {
          setState({
            status: 'error',
            reason: result.oversized
              ? 'rendered diagram exceeded size limit'
              : result.safeLength === 0 ? 'no safe content remained' : 'too much content was removed',
          });
          return;
        }
        setState({
          status: 'ok',
          srcDoc: buildArtifactSrcDoc(result.safe, 'mermaid'),
          intrinsic: intrinsicOf(result.safe),
        });
      } catch {
        // Mermaid throws on malformed syntax. The message can quote arbitrary
        // source, so it is not surfaced verbatim.
        if (alive) setState({ status: 'error', reason: 'diagram syntax error' });
      }
    })();

    // The render is async and the card can unmount mid-flight (a new report
    // replaces the old one); `alive` prevents a setState on a dead component.
    return () => { alive = false; };
  }, [guard]);

  // Downgrade path: show the source as text, which is readable and debuggable —
  // Mermaid source is prose-like enough to be useful on its own.
  const plain = typeof content === 'string' ? content.trim().slice(0, 600) : '';

  if (!guard.ok) {
    return <ArtifactFallback title={title} reason={guard.reason ?? 'refused'} text={plain} />;
  }
  if (state.status === 'error') {
    return <ArtifactFallback title={title} reason={state.reason} text={plain} />;
  }
  if (state.status === 'pending') {
    // Reserve the frame's height so the card doesn't jump when the SVG lands.
    return <div className="w-full" style={{ height: 380 }} aria-busy="true" />;
  }

  return (
    <ArtifactShell
      srcDoc={state.srcDoc} kind="mermaid" title={title} intrinsic={state.intrinsic}
      caption={caption} explanation={explanation} variant={variant}
    />
  );
}
