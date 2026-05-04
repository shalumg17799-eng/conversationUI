import { ShapeSignature } from '../types';

/**
 * Deterministically maps data columns to component properties.
 * Removes the need for the LLM to handle prop assignment.
 */
export const mapProps = (renderType: string, shape: ShapeSignature): Record<string, any> => {
  console.log(`Layer 3.5 - Mapping props for ${renderType}`);

  switch (renderType) {
    case 'BarChart':
      return {
        title: `Performance by ${shape.dimensionColumns[0] || 'Category'}`,
        data: shape.data,
        xKey: shape.dimensionColumns[0],
        yKey: shape.measureColumns[0]
      };

    case 'LineChart':
      return {
        title: `${shape.measureColumns[0] || 'Metric'} Over Time`,
        data: shape.data,
        xKey: shape.timeColumn || shape.dimensionColumns[0],
        yKey: shape.measureColumns[0]
      };

    case 'KPI':
      return {
        title: shape.measureColumns[0] || 'Metric',
        value: shape.data?.[0]?.[shape.measureColumns[0]] || 0,
        trend: '+12.5%'
      };

    case 'Table':
    case 'GenerativeTable':
      return {
        title: 'Detailed Data View',
        columns: Object.keys(shape.columnTypes),
        rows: shape.data,
        data: shape.data
      };

    case 'KPIGrid':
      return {
        metrics: shape.measureColumns.map((col) => ({
          title: col,
          value: shape.data?.[0]?.[col] ?? 0,
          trend: '+0%'
        }))
      };

    case 'InlineChart':
      return {
        data: shape.data,
        chartType: shape.isTimeSeries ? 'line' : 'bar',
        xKey: shape.timeColumn || shape.dimensionColumns[0],
        yKey: shape.measureColumns[0]
      };

    case 'ReportVisualization':
      return {
        title: `Analysis Report`,
        sections: []
      };

    default:
      return {};
  }
};
