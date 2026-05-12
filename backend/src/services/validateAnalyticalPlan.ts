import { AnalyticalPlan } from '../types';

export interface ValidationResult {
  isValid: boolean;
  reason?: string;
}

export function validateAnalyticalPlan(plan: AnalyticalPlan): ValidationResult {
  // Skip validation for raw/fallback queries
  if (plan.intent === 'raw') {
    return { isValid: true };
  }

  // 1. Metric must exist
  if (!plan.measure) {
    console.log(`[Validation] status=FAIL reason=UNKNOWN_METRIC`);
    return { isValid: false, reason: "UNKNOWN_METRIC" };
  }
  if (!plan.measure.field || plan.measure.field === 'unknown') {
    console.log(`[Validation] status=FAIL reason=UNKNOWN_METRIC`);
    return { isValid: false, reason: "UNKNOWN_METRIC" };
  }

  // 2. Aggregation must be valid
  const validAggs = ["SUM", "AVG", "COUNT", "MAX", "MIN", "NONE"];
  if (!validAggs.includes(plan.measure.aggregation)) {
    console.log(`[Validation] status=FAIL reason=INVALID_AGGREGATION`);
    return { isValid: false, reason: "INVALID_AGGREGATION" };
  }

  // 3. Dimension must exist
  if (!plan.groupBy || plan.groupBy.length === 0) {
    console.log(`[Validation] status=FAIL reason=UNKNOWN_DIMENSION`);
    return { isValid: false, reason: "UNKNOWN_DIMENSION" };
  }
  if (plan.groupBy[0] === 'unknown') {
    console.log(`[Validation] status=FAIL reason=UNKNOWN_DIMENSION`);
    return { isValid: false, reason: "UNKNOWN_DIMENSION" };
  }

  // 4. No datasource/table names allowed as measures
  const tableKeywords = ["fact_", "v_", "rollup", "_sales_"];
  if (tableKeywords.some(kw => plan.measure!.field.includes(kw))) {
    console.log(`[Validation] status=FAIL reason=TABLE_NAME_AS_METRIC`);
    return { isValid: false, reason: "TABLE_NAME_AS_METRIC" };
  }

  console.log(`[Validation] status=PASS`);
  return { isValid: true };
}
