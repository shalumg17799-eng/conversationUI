export interface IntentResult {
  intent: "metric_by_dimension" | "trend" | "comparison";
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

export interface AnalyticalPlan {
  intent: "ranking" | "trend" | "comparison" | "metric_by_dimension" | "raw";
  operation?: {
    type: "top_n" | "bottom_n";
    limit: number;
    sort: "asc" | "desc";
  };
  measure?: {
    field: string;
    logicalField?: string;
    aggregation: "SUM" | "AVG" | "COUNT" | "MAX" | "MIN" | "NONE";
  };
  groupBy?: string[];
  filters?: { field: string; operator: string; value: any }[];
  confidenceScore: number;
}
