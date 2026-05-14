import { UITypeTree, ValidationResult } from '../types';

// Full component registry — includes all renderTypes the LLM can produce.
// Kept inline to avoid JSON import issues and to stay in sync with UITreeRenderer.
const COMPONENT_REGISTRY: Record<string, { requiredProps: string[] }> = {
  KPICard:          { requiredProps: ['title', 'value'] },
  KPI:              { requiredProps: ['title', 'value'] },
  KPIGrid:          { requiredProps: ['metrics'] },
  StatDelta:        { requiredProps: ['title', 'current', 'previous'] },
  BarChart:         { requiredProps: ['xKey', 'yKey'] },
  LineChart:        { requiredProps: ['xKey', 'yKey'] },
  AreaChart:        { requiredProps: ['xKey', 'yKey'] },
  PieChart:         { requiredProps: ['nameKey', 'valueKey'] },
  RankedList:       { requiredProps: ['labelKey', 'valueKey'] },
  Table:            { requiredProps: ['columns'] },
  GenerativeTable:  { requiredProps: ['columns'] },
  InsightCard:      { requiredProps: ['title', 'body'] },
  SummaryText:      { requiredProps: ['text'] },
  AlertBanner:      { requiredProps: ['message'] },
  TwoColumn:        { requiredProps: [] },
  Section:          { requiredProps: [] },
  Report:           { requiredProps: ['title'] },
  ReportSkeleton:   { requiredProps: [] },
  BigQueryDashboard:{ requiredProps: [] },
};

/**
 * Validates a UITypeTree node against the component registry.
 * Returns isValid=false with errors if required props are missing.
 * Used after fixColumnCasing and before hydrateTree.
 */
export const validateUITypeTree = (uiTree: UITypeTree): ValidationResult => {
  const errors: string[] = [];
  const entry = COMPONENT_REGISTRY[uiTree.renderType];

  if (!entry) {
    return {
      isValid: false,
      errors: [`Component "${uiTree.renderType}" is not in the registry.`],
    };
  }

  for (const prop of entry.requiredProps) {
    if (!(prop in uiTree.props) || uiTree.props[prop] === undefined || uiTree.props[prop] === null) {
      errors.push(`Missing required prop "${prop}" on ${uiTree.renderType}`);
    }
  }

  return { isValid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
};

/**
 * Validates all cards in a report and filters out invalid ones.
 * Logs each failure for observability.
 */
export const validateAndFilterCards = (cards: any[]): { valid: any[]; invalid: string[] } => {
  const valid: any[] = [];
  const invalid: string[] = [];

  const check = (card: any) => {
    const result = validateUITypeTree(card as UITypeTree);
    if (result.isValid) {
      valid.push(card);
    } else {
      const msg = `${card.renderType}: ${result.errors?.join(', ')}`;
      invalid.push(msg);
      console.warn(`[UIValidator] Dropping invalid card — ${msg}`);
    }
  };

  cards.forEach(check);
  return { valid, invalid };
};
