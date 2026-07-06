import { OutputMode, OUTPUT_MODES } from '../registry/componentRegistry';

// Phase 2: output_mode is a FROZEN governance token — classified here, observed only.
// Nothing in this phase enforces it (no trimming, no constraints, no fallback cards).

export type OutputModeSource = 'llm' | 'override' | 'fallback';

export interface OutputModeDecision {
  outputMode: OutputMode;
  source: OutputModeSource;
  intent: string;
  llmRaw?: string;    // raw LLM value (only when the model proposed one)
  invalid?: boolean;  // LLM proposed a value not in the enum
}

const VALID = new Set<string>(OUTPUT_MODES);

// Deterministic fallback from intent.
const INTENT_FALLBACK: Record<string, OutputMode> = {
  trend: 'single_chart',
  comparison: 'comparison_dashboard',
  metric_by_dimension: 'comparison_dashboard',
};

// Keyword overrides matched against the raw user query. Order = priority.
const KEYWORD_OVERRIDES: Array<{ re: RegExp; mode: OutputMode }> = [
  { re: /\b(summary|summarize|summarise|explain|why)\b/i,        mode: 'narrative' },
  { re: /\b(table|rows|list)\b/i,                                mode: 'table' },
  { re: /\b(dashboard|everything|deep\s*dive|full\s*report)\b/i, mode: 'full_dashboard' },
];

// Permissive default when intent is unknown — Phase 2 must never hide anything.
const DEFAULT_MODE: OutputMode = 'full_dashboard';

export function isValidOutputMode(v: unknown): v is OutputMode {
  return typeof v === 'string' && VALID.has(v);
}

// OPTIONAL, env-gated prompt hint. Default OFF so classifier prompts — and therefore
// routing behavior — are unchanged (Phase 2 = no user-visible change). Set
// PHASE2_LLM_OUTPUT_MODE_HINT=true to let the model propose output_mode (populates
// source='llm' telemetry). The field is a hint only and is never enforced.
export function withOutputModeHint(system: string): string {
  if (process.env.PHASE2_LLM_OUTPUT_MODE_HINT !== 'true') return system;
  return `${system}\n\nOPTIONAL: you may add an "output_mode" field — one of ${JSON.stringify(OUTPUT_MODES)}. Hint only; omit if unsure. It does not change how you route or answer.`;
}

/**
 * Resolve + freeze the output_mode for a request.
 * Precedence: keyword override > valid LLM proposal > deterministic intent fallback.
 * Pure + synchronous — safe to unit test in isolation. The returned object is frozen
 * so downstream code cannot mutate the governance token.
 */
export function resolveOutputMode(params: {
  query: string;
  intent: string;
  llmProposed?: unknown;
}): OutputModeDecision {
  const { query, intent, llmProposed } = params;

  const override = KEYWORD_OVERRIDES.find(o => o.re.test(query));
  if (override) {
    return Object.freeze({ outputMode: override.mode, source: 'override', intent });
  }

  if (llmProposed !== undefined && llmProposed !== null) {
    if (isValidOutputMode(llmProposed)) {
      return Object.freeze({ outputMode: llmProposed, source: 'llm', intent, llmRaw: llmProposed });
    }
    const fb = INTENT_FALLBACK[intent] ?? DEFAULT_MODE;
    return Object.freeze({ outputMode: fb, source: 'fallback', intent, llmRaw: String(llmProposed), invalid: true });
  }

  const fb = INTENT_FALLBACK[intent] ?? DEFAULT_MODE;
  return Object.freeze({ outputMode: fb, source: 'fallback', intent });
}
