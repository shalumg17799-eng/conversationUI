import { OutputModeDecision, OutputModeSource } from './outputMode';

// Phase 2: in-memory observability for the output_mode governance token.
// Passive — no effect on the request path. Reset endpoint provided for tests/ops.

interface OutputModeMetrics {
  total: number;
  byMode: Record<string, number>;
  bySource: Record<OutputModeSource, number>;
  invalid: number;
  invalidValues: Record<string, number>;
}

const metrics: OutputModeMetrics = {
  total: 0,
  byMode: {},
  bySource: { llm: 0, override: 0, fallback: 0 },
  invalid: 0,
  invalidValues: {},
};

// Structured log line + metric accumulation.
export function recordOutputMode(d: OutputModeDecision, ctx: { query: string; provider: string }): void {
  metrics.total += 1;
  metrics.byMode[d.outputMode] = (metrics.byMode[d.outputMode] ?? 0) + 1;
  metrics.bySource[d.source] += 1;
  if (d.invalid) {
    metrics.invalid += 1;
    const key = d.llmRaw ?? 'unknown';
    metrics.invalidValues[key] = (metrics.invalidValues[key] ?? 0) + 1;
  }
  console.log(
    `[OutputMode] intent=${d.intent} outputMode=${d.outputMode} source=${d.source}` +
    (d.invalid ? ` invalidLlmValue=${JSON.stringify(d.llmRaw)}` : '') +
    ` provider=${ctx.provider}`
  );
}

export function getOutputModeMetrics(): OutputModeMetrics {
  return {
    total: metrics.total,
    byMode: { ...metrics.byMode },
    bySource: { ...metrics.bySource },
    invalid: metrics.invalid,
    invalidValues: { ...metrics.invalidValues },
  };
}

// Derived rates for the /metrics endpoint.
export function getOutputModeSummary() {
  const m = getOutputModeMetrics();
  const rate = (n: number) => (m.total ? +(n / m.total).toFixed(4) : 0);
  return {
    total: m.total,
    byMode: m.byMode,
    bySource: m.bySource,
    invalidValues: m.invalidValues,
    llmRate: rate(m.bySource.llm),
    overrideRate: rate(m.bySource.override),
    fallbackRate: rate(m.bySource.fallback),
    invalidRate: rate(m.invalid),
  };
}

export function resetOutputModeMetrics(): void {
  metrics.total = 0;
  metrics.byMode = {};
  metrics.bySource = { llm: 0, override: 0, fallback: 0 };
  metrics.invalid = 0;
  metrics.invalidValues = {};
}
