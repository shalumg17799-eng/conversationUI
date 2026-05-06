import { ShapeSignature, IntentResult } from '../types';
import { SelectionResult } from './componentSelector';

interface StaticReport {
  title: string;
  message: string;
  cards: any[];
  followUp: any[];
}

/**
 * Generates a lightweight, static report object when rule-based selection is highly confident.
 */
export const generateStaticReport = (
  query: string,
  intent: IntentResult,
  shape: ShapeSignature,
  selection: SelectionResult
): StaticReport => {
  const metricName = intent.metric !== 'unknown' ? intent.metric : 'Metric';
  const dimensionName = intent.dimension !== 'unknown' ? intent.dimension : 'Dimension';
  
  const title = `Analysis of ${metricName.charAt(0).toUpperCase() + metricName.slice(1)} by ${dimensionName.charAt(0).toUpperCase() + dimensionName.slice(1)}`;
  const message = `Based on your query, we have automatically visualized the ${metricName} across ${dimensionName}.`;

  const cards = [];

  // Construct props based on component type
  const props: any = { title };
  
  if (selection.type === 'BarChart' || selection.type === 'LineChart') {
    props.xKey = shape.timeColumn || shape.dimensionColumns[0] || 'dimension';
    props.yKey = shape.measureColumns[0] || 'value';
  } else if (selection.type === 'KPI') {
    props.value = shape.data[0] ? Object.values(shape.data[0])[0] : 0;
  } else if (selection.type === 'GenerativeTable') {
    props.columns = shape.dimensionColumns.concat(shape.measureColumns);
  }

  cards.push({
    renderType: selection.type,
    props
  });

  return {
    title,
    message,
    cards,
    followUp: [
      { label: `Filter by ${dimensionName}`, intent: `show ${metricName} for a specific ${dimensionName}` },
      { label: `View trend`, intent: `show trend of ${metricName}` }
    ]
  };
};
