import { ShapeSignature } from '../types';

/**
 * Deterministically filters available components based on the shape of the data.
 * This reduces LLM hallucination and ensures appropriate component selection.
 */
export interface SelectionResult {
  type: 'BarChart' | 'LineChart' | 'KPI' | 'GenerativeTable';
  confidence: 'high' | 'low';
}

/**
 * Deterministically selects the best component based on the shape of the data.
 * Returns a 'high' confidence if the pattern is unmistakable.
 */
export const selectComponent = (shape: ShapeSignature): SelectionResult => {
  console.log('Layer 3 - Running rule-based component selection...');

  // 1. Time Series Data
  if (shape.isTimeSeries) {
    return { type: 'LineChart', confidence: 'high' };
  }

  // 2. Single Value (KPI)
  if (shape.rowCount === 1) {
    return { type: 'KPI', confidence: 'high' };
  }

  // 3. High Column Count (Table)
  if (shape.columnCount > 8) {
    return { type: 'GenerativeTable', confidence: 'high' };
  }

  // 4. Improved BarChart Rule
  // Best for: Categorical data with a small number of rows and at least one measure.
  const hasDimensions = shape.dimensionColumns.length > 0;
  const hasMeasures = shape.measureColumns.length > 0;
  
  if (hasDimensions && hasMeasures && shape.rowCount > 1 && shape.rowCount <= 15) {
    return { type: 'BarChart', confidence: 'high' };
  }

  // 5. Default Fallback
  return { type: 'GenerativeTable', confidence: 'low' };
};
