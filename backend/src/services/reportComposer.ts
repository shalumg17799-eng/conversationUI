import { IntentResult, ShapeSignature } from '../types';

/**
 * Deterministically suggests a list of components to include in a report
 * based on the intent and the shape of the data.
 */
export const composeReport = (intent: IntentResult, shape: ShapeSignature, query: string): string[] => {
  console.log('Layer 2.7 - Composing report structure with strict rules');
  
  const componentList: string[] = [];
  const lowercaseQuery = query.toLowerCase();

  // 1. KPI or KPIGrid: headline metrics
  if (shape.measureColumns.length > 0 && shape.rowCount > 0) {
    componentList.push(shape.measureColumns.length >= 2 ? 'KPIGrid' : 'KPI');
  }

  // 2. BarChart: categorical comparisons
  const hasMultipleCategories = shape.dimensionColumns.some(col => shape.cardinality[col] > 1);
  if (shape.dimensionColumns.length > 0 && hasMultipleCategories) {
    componentList.push('BarChart');
  }

  // 3. LineChart: time series
  if (shape.timeColumn) {
    componentList.push('LineChart');
  }

  // 4. GenerativeTable: prefer over Table for richer display
  const asksForDetails = lowercaseQuery.includes('detail') ||
                         lowercaseQuery.includes('record') ||
                         lowercaseQuery.includes('data') ||
                         lowercaseQuery.includes('list') ||
                         lowercaseQuery.includes('show');

  if (shape.columnCount > 3 || asksForDetails) {
    componentList.push('GenerativeTable');
  }

  // 5. ReportVisualization: wrap everything if multi-section response
  const isComplexQuery = lowercaseQuery.includes('report') || lowercaseQuery.includes('analysis') || lowercaseQuery.includes('summary');
  if (isComplexQuery && componentList.length >= 2) {
    componentList.unshift('ReportVisualization');
  }

  return Array.from(new Set(componentList));
};
