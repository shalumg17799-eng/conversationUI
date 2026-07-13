// Animation timing for a chart scene, derived from the scene's total length.
// Scene duration is now driven by real narration audio (see timing.ts), so a
// chart can run anywhere from ~1.8s to ~10s. Hardcoded frame numbers used to
// mean short scenes cut mid-callout and long scenes froze after ~2s while the
// voice kept talking. These beats scale with the duration instead, with clamps
// so the intro still feels snappy and the peak reveal always COMPLETES before
// the cut. RemChart and ChartScene both read this, so the chart's spotlight and
// the bullet reveal stay in step.

export interface ChartBeats {
  axisEnd: number;      // axes/gridlines fully faded in by here
  drawStart: number;    // series starts drawing
  drawDur: number;      // spring length for the series draw (line grow / bars / pie sweep)
  focusStart: number;   // peak emphasis begins (also when the pulse starts)
  focusEnd: number;     // peak emphasis fully ramped
  calloutStart: number; // value callout begins fading in
  calloutEnd: number;   // value callout fully shown
  peakReveal: number;   // canonical "the peak is being called out" frame (== focusStart)
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function chartBeats(durationInFrames: number): ChartBeats {
  const D = durationInFrames && durationInFrames > 0 ? durationInFrames : 90;

  const axisEnd = clamp(Math.round(D * 0.12), 8, 22);
  const drawStart = Math.round(axisEnd * 0.5);
  const drawDur = clamp(Math.round(D * 0.28), 16, 44);
  const drawEnd = drawStart + drawDur;

  // Peak reveal lands around a third of the way in (roughly where the narration
  // reaches the peak), but never before the series finishes drawing and never so
  // late it can't complete before the scene ends.
  const focusStart = clamp(Math.round(D * 0.34), drawEnd, Math.max(drawEnd, D - 10));
  const focusDur = clamp(Math.round(D * 0.12), 8, 20);
  const focusEnd = clamp(focusStart + focusDur, focusStart + 6, D - 2);

  const calloutStart = clamp(focusStart + Math.round(focusDur * 0.4), focusStart, D - 6);
  const calloutEnd = clamp(calloutStart + Math.round(D * 0.10), calloutStart + 8, D - 1);

  return { axisEnd, drawStart, drawDur, focusStart, focusEnd, calloutStart, calloutEnd, peakReveal: focusStart };
}
