# Artifact export gap — scoped handoff for Track A (Video) / Track B (Document & Deck Export)

**Status:** scoped-but-deferred. Owned by Track A / Track B, **not** Track D.
**Source:** verification cross-check of the Track D (Rich Artifacts) work.
**Do not build from Track D.** This document is a handoff, not a work order.

---

## The gap, precisely stated

`html-artifact` and `svg-artifact` nodes render correctly in the app (sandboxed iframe), but they are **silently dropped from every export** — PDF, PPTX, and Excel.

Mechanism, in [`src/lib/exportReport.ts`](../src/lib/exportReport.ts):

- The exporter walks the report tree with a `switch (node.renderType)`.
- There is **no `case 'html-artifact'` and no `case 'svg-artifact'`**, so both fall through to `default: handled = false`.
- The `!handled` fallback then calls `nodeRows(node)`. Artifacts carry their payload in `props.content` (a markup string), not in rows — so `nodeRows` returns nothing and **nothing is pushed to the export**.
- No error is raised. The export completes successfully, just without the artifact's content.

Net effect: a report that contains an artifact exports fine, but the artifact is missing from the output file, with no warning to the user.

Video ([`backend/src/services/videoRenderer.ts`](../backend/src/services/videoRenderer.ts) and `backend/src/releaseNotes/`) likewise has no artifact-specific handling.

---

## Why this is two separate problems, not one "bridge"

### SVG → export: comparatively tractable

SVG is already vector markup. It can be embedded **natively** into PDF and PPTX without any screenshot/rasterization step. The sanitized `props.content` is a complete `<svg>` document; the export path needs a case that hands that markup to the PDF/PPTX writer's vector/image path. No headless browser required.

### HTML → export: harder, and it's a direct consequence of the security design

The HTML artifact renders inside a `sandbox=""` **opaque-origin** iframe **by design** — that isolation is the security property behind Track D's Requirement 2/4 (no script execution, no same-origin access). That same isolation means:

- **Standard DOM-screenshot capture cannot reach it.** `html2canvas` and similar tools read the live DOM; they cannot see into a sandboxed, opaque-origin iframe. So the approach used elsewhere in the app will produce a blank/missing region for an HTML artifact.

A real fix therefore needs one of:

1. **Server-side headless render** of the *sanitized* HTML (e.g. a headless-Chromium screenshot of `buildArtifactSrcDoc(...)` output) to produce an image for embedding; or
2. **A non-visual fallback** — serialize the sanitized HTML's textual/tabular content (headings, paragraphs, tables) into the export's native narrative/table blocks instead of a visual capture.

Whichever is chosen, it must consume the **already-sanitized** content (the output of `sanitizeArtifact`), never the raw model output, so the export path does not reintroduce the injection surface the renderer removed.

---

## Current behavior to preserve

Until this is deliberately built, **exports must keep failing silently and gracefully** — i.e. omit the artifact and complete normally.

Do **not** add a hard error when an artifact is encountered during export. Reports that happen to contain an artifact export successfully today (minus the artifact); introducing an error would be a **regression** for those reports.

---

## Constraints for whoever picks this up

- Consume sanitized content only (`sanitizeArtifact` output), never raw `props.content`.
- Preserve the sandbox/CSP security properties — do not weaken the renderer to make export easier.
- SVG and HTML are independent increments; SVG can ship first.

## Explicitly out of scope for this document

No implementation. No changes to `exportReport.ts`, `videoRenderer.ts`, `ArtifactFrame`, `sanitizeArtifact`, or any dispatch/ranking logic were made as part of raising this gap.
