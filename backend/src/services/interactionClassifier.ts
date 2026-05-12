import { DATA_SOURCES, ALL_DOMAINS } from './dataSourceMap';

export type InteractionType = 'new_report' | 'summarize_report' | 'analyze_report' | 'analytical_intent' | 'assistant_intent';

/**
 * Lightweight classifier to determine the orchestration layer for a query.
 * Enforces precedence boundaries before any LLM routing begins.
 */
export async function classifyInteraction(
  query: string, 
  hasContext: boolean
): Promise<InteractionType> {
  const q = query.toLowerCase();

  // 1. Layer: Narrative / Conversational (Phase 1)
  if (hasContext) {
    if (
      q.includes('summarize') || 
      q.includes('summary') || 
      q.includes('bullet points') || 
      q.includes('executive summary') ||
      q.includes('tl;dr')
    ) {
      return 'summarize_report';
    }

    if (
      q.includes('why') || 
      q.includes('explain') || 
      q.includes('insights') || 
      q.includes('tell me more') ||
      q.includes('what drive') ||
      q.includes('reason')
    ) {
      return 'analyze_report';
    }
  }

  // 2. Layer: Guided Assistant / Onboarding
  if (
    q.includes('onboard') || 
    q.includes('help') || 
    q.includes('how to use') || 
    q.includes('tutorial') ||
    q.includes('what can you do') ||
    q.includes('guide me')
  ) {
    return 'assistant_intent';
  }

  // 3. Layer: Explicit Analytical Intent (Direct Routing Bypass)
  // Check against metadata catalog (Metrics, Domains, Report Names)
  const isAnalytical = 
    ALL_DOMAINS.some(d => q.includes(d.toLowerCase())) ||
    DATA_SOURCES.some(ds => 
      q.includes(ds.reportName.toLowerCase()) || 
      ds.kpis.some(kpi => q.includes(kpi.toLowerCase()))
    );

  if (isAnalytical) {
    return 'analytical_intent';
  }

  // Default to new_report (which triggers the standard LLM fallback/router)
  return 'new_report';
}
