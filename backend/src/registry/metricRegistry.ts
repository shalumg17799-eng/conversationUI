export interface MetricDefinition {
  column: string;
  aggregation: "SUM" | "AVG" | "COUNT" | "MAX" | "MIN" | "NONE";
  aliases: string[];
  semanticCategory: string;
}

export const METRIC_REGISTRY: Record<string, MetricDefinition> = {
  revenue: { 
    column: "sug_revenue", 
    aggregation: "SUM", 
    aliases: ["revenue", "sales", "sug revenue", "income", "sales amount"], 
    semanticCategory: "financial" 
  },
  take_rate: { 
    column: "take_rate_pct", 
    aggregation: "AVG", 
    aliases: ["take rate", "take_rate", "takerate"], 
    semanticCategory: "financial" 
  },
  churn: { 
    column: "return_rate_pct", 
    aggregation: "AVG", 
    aliases: ["churn", "return rate", "returns", "attrition"], 
    semanticCategory: "retention" 
  },
  retention: { 
    column: "retention_rate", 
    aggregation: "AVG", 
    aliases: ["retention"], 
    semanticCategory: "retention" 
  },
  performance: { 
    column: "performance_score", 
    aggregation: "AVG", 
    aliases: ["performance", "score", "kpi"], 
    semanticCategory: "performance" 
  },
  device: { 
    column: "device_count", 
    aggregation: "SUM", 
    aliases: ["device", "devices"], 
    semanticCategory: "inventory" 
  },
  employee: { 
    column: "employee_count", 
    aggregation: "SUM", 
    aliases: ["employee", "agent", "rep"], 
    semanticCategory: "hr" 
  },
  rank: { 
    column: "rank", 
    aggregation: "MIN", 
    aliases: ["rank", "ranking"], 
    semanticCategory: "performance" 
  }
};
