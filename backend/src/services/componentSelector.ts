import { ShapeSignature } from '../types';

/**
 * Deterministically filters available components based on the shape of the data.
 * This reduces LLM hallucination and ensures appropriate component selection.
 */
export const getAllowedComponents = (shape: ShapeSignature): string[] => {
  console.log('Pre-filtering components based on data shape...');

  // 1. Time Series Data
  if (shape.isTimeSeries) {
    return ['LineChart'];
  }

  // 2. Single Value (KPI)
  if (shape.rowCount === 1) {
    return ['KPI'];
  }

  // 3. Wide Data (Too many columns for simple charts)
  if (shape.columnCount > 5) {
    return ['Table'];
  }

  // 4. Default for categorical/comparison data
  return ['BarChart', 'Table'];
};
