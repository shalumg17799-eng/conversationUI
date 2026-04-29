import { IntentResult, ShapeSignature } from '../types';

/**
 * Deterministically suggests a list of components to include in a report
 * based on the intent and the shape of the data.
 */
export const composeReport = (intent: IntentResult, shape: ShapeSignature, query: string): string[] => {
  console.log('Layer 2.7 - Composing report structure with strict rules');
  
  const componentList: string[] = [];
  const lowercaseQuery = query.toLowerCase();

  // 1. KPI: Include only if measureColumns exist and rowCount > 0
  if (shape.measureColumns.length > 0 && shape.rowCount > 0) {
    componentList.push('KPI');
  }

  // 2. BarChart: Include only if dimensionColumns exist and cardinality > 1
  const hasMultipleCategories = shape.dimensionColumns.some(col => shape.cardinality[col] > 1);
  if (shape.dimensionColumns.length > 0 && hasMultipleCategories) {
    componentList.push('BarChart');
  }

  // 3. LineChart: Include only if timeColumn exists
  if (shape.timeColumn) {
    componentList.push('LineChart');
  }

  // 4. Table: Include if columnCount > 3 OR query explicitly asks for details
  const asksForDetails = lowercaseQuery.includes('detail') || 
                         lowercaseQuery.includes('record') || 
                         lowercaseQuery.includes('data');
                         
  if (shape.columnCount > 3 || asksForDetails) {
    componentList.push('Table');
  }

  return Array.from(new Set(componentList));
};
