import { ShapeSignature, IntentResult } from '../types';

/**
 * Final authority for component selection.
 * The LLM is NOT allowed to change the renderType or structure.
 */
export const selectComponent = (shape: ShapeSignature, intent: IntentResult): string[] => {
  console.log('Deterministic component selection...');

  const { intent: intentType } = intent;
  console.log(`[Selector] Intent: ${intentType}, Rows: ${shape.rowCount}, Cols: ${shape.columnCount}`);

  // 1. Force Intent-Based Visualizations
  if (intentType === 'trend') {
    return ['LineChart'];
  }

  if (intentType === 'metric_by_dimension' || intentType === 'comparison' as any) {
    return ['BarChart'];
  }

  if (intentType === 'metric_only' || shape.rowCount === 1) {
    return ['KPI'];
  }

  // 2. Data Shape Fallbacks (Only if intent is ambiguous)
  if (shape.isTimeSeries && shape.rowCount > 1) return ['LineChart'];
  if (shape.rowCount > 1 && shape.columnCount <= 5) return ['BarChart'];

  // Final Fallback for detailed exploration
  return ['GenerativeTable'];
};
