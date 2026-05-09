export interface IntentResult {
  intent: "metric_by_dimension" | "trend" | "comparison" | "metric_only";
  metric: string;
  dimension: string;
  timeRange?: string;
}

export interface ShapeSignature {
  rowCount: number;
  columnCount: number;
  columnTypes: {
    [columnName: string]: "numeric" | "categorical" | "datetime";
  };
  dimensionColumns: string[];
  measureColumns: string[];
  timeColumn?: string;
  isTimeSeries: boolean;
  cardinality: {
    [columnName: string]: number;
  };
  data: any[];
}

export interface UITypeTree {
  renderType: string;
  props: Record<string, any>;
  children?: UITypeTree[];
  sections?: ReportSection[];
}

export type DashboardTemplate = 'summary' | 'deep_dive' | 'trend_analysis' | 'comparison' | 'qa_answer';

export interface ReportSection {
  type: "summary" | "analysis" | "details";
  components: UITypeTree[];
}

export interface ValidationResult {
  isValid: boolean;
  errors?: string[];
}
