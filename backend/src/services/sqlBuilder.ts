import { AnalyticalPlan } from '../types';

export function buildSelectClause(plan: AnalyticalPlan): string {
  const selects: string[] = [];
  
  if (plan.groupBy && plan.groupBy.length > 0) {
    plan.groupBy.forEach(col => {
      // groupBy already contains physical columns from the planner
      selects.push(col);
    });
  }

  if (plan.measure) {
    const physicalCol = plan.measure.field;
    const agg = plan.measure.aggregation;
    const alias = plan.measure.logicalField || physicalCol;
    
    if (agg === 'NONE' || (!plan.groupBy || plan.groupBy.length === 0)) {
       selects.push(`${physicalCol} AS ${alias}`);
    } else {
       selects.push(`${agg}(${physicalCol}) AS ${alias}`);
    }
  } else {
    selects.push('*');
  }

  if (selects.length === 0) return '*';
  return selects.join(', ');
}

export function buildWhereClause(plan: AnalyticalPlan): string {
  if (!plan.filters || plan.filters.length === 0) return '';
  
  const conditions = plan.filters.map(f => {
    // f.field should be physical column ideally, but filters aren't deeply resolved yet.
    // For safety, assuming f.field is physical column
    const val = typeof f.value === 'string' ? `'${f.value}'` : f.value;
    return `${f.field} ${f.operator} ${val}`;
  });

  return `WHERE ${conditions.join(' AND ')}`;
}

export function buildGroupByClause(plan: AnalyticalPlan): string {
  if (!plan.groupBy || plan.groupBy.length === 0) return '';
  if (!plan.measure || plan.measure.aggregation === 'NONE') return '';
  
  return `GROUP BY ${plan.groupBy.join(', ')}`;
}

export function buildOrderClause(plan: AnalyticalPlan): string {
  if (plan.operation && (plan.operation.type === 'top_n' || plan.operation.type === 'bottom_n')) {
    const alias = plan.measure?.logicalField || plan.measure?.field;
    const sortField = alias || plan.groupBy?.[0] || '1';
    
    // Log observability
    console.log(`[SQLBuilder] ORDER BY ${sortField} ${plan.operation.sort.toUpperCase()} LIMIT ${plan.operation.limit}`);

    return `ORDER BY ${sortField} ${plan.operation.sort.toUpperCase()}`;
  }
  return '';
}

export function buildLimitClause(plan: AnalyticalPlan): string {
  if (plan.operation && plan.operation.limit) {
    return `LIMIT ${plan.operation.limit}`;
  }
  return '';
}

export function buildAnalyticalQuerySQL(tablePath: string, plan: AnalyticalPlan, defaultOrder?: string, defaultLimit?: number): string {
  if (plan.intent === 'raw' || !plan.measure) {
     let sql = `SELECT * FROM ${tablePath}`;
     if (defaultOrder) sql += ` ORDER BY ${defaultOrder}`;
     if (defaultLimit) sql += ` LIMIT ${defaultLimit}`;
     return sql;
  }

  const select = buildSelectClause(plan);
  const where = buildWhereClause(plan);
  const groupBy = buildGroupByClause(plan);
  
  let order = buildOrderClause(plan);
  if (!order && defaultOrder) order = `ORDER BY ${defaultOrder}`;

  let limit = buildLimitClause(plan);
  if (!limit && defaultLimit) limit = `LIMIT ${defaultLimit}`;

  return `SELECT ${select} FROM ${tablePath} ${where} ${groupBy} ${order} ${limit}`.trim().replace(/\s+/g, ' ');
}
