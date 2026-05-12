import { IntentResult, AnalyticalPlan } from '../types';
import { resolveSemantics } from './semanticResolver';

export function generateAnalyticalPlan(query: string, intentContext: IntentResult): AnalyticalPlan {
    const q = query.toLowerCase();
    
    // Call the semantic resolver
    const semantics = resolveSemantics(query);
    
    const plan: AnalyticalPlan = {
        intent: "raw",
        confidenceScore: semantics.confidence
    };

    // 1. Detect Ranking Intent & Top/Bottom N
    const topMatch = q.match(/top\s+(\d+)/);
    const bottomMatch = q.match(/bottom\s+(\d+)/);
    
    if (topMatch) {
        plan.intent = "ranking";
        plan.operation = { type: "top_n", limit: parseInt(topMatch[1], 10), sort: "desc" };
        plan.confidenceScore += 0.2;
    } else if (bottomMatch) {
        plan.intent = "ranking";
        plan.operation = { type: "bottom_n", limit: parseInt(bottomMatch[1], 10), sort: "asc" };
        plan.confidenceScore += 0.2;
    } else if (q.match(/\b(best|highest|leading)\b/)) {
        plan.intent = "ranking";
        plan.operation = { type: "top_n", limit: 5, sort: "desc" };
        plan.confidenceScore += 0.1;
    } else if (q.match(/\b(worst|lowest)\b/)) {
        plan.intent = "ranking";
        plan.operation = { type: "bottom_n", limit: 5, sort: "asc" };
        plan.confidenceScore += 0.1;
    } else {
        if (intentContext.intent === 'trend') plan.intent = "trend";
        else if (intentContext.intent === 'comparison') plan.intent = "comparison";
        else plan.intent = "metric_by_dimension";
    }

    // 2. Measure & Aggregation mapping
    if (semantics.metric) {
        plan.measure = {
            field: semantics.metric.physical,
            logicalField: semantics.metric.logical,
            aggregation: semantics.metric.aggregation as any
        };
    } else if (intentContext.metric && intentContext.metric !== 'unknown') {
        const { METRIC_REGISTRY } = require('../registry/metricRegistry');
        // intentContext.metric might be the logical name or physical column if passed directly.
        // Let's try to look it up in the registry by logical name first
        const fallbackDef = Object.entries(METRIC_REGISTRY).find(([logical, def]: [string, any]) => 
            logical === intentContext.metric || def.aliases.includes(intentContext.metric)
        ) as [string, any] | undefined;
        
        if (fallbackDef) {
            plan.measure = {
                field: fallbackDef[1].column,
                logicalField: fallbackDef[0],
                aggregation: fallbackDef[1].aggregation as any
            };
            plan.confidenceScore += 0.3;
            console.log(`[InheritedMetric] metric=${fallbackDef[0]}`);
        } else {
            plan.confidenceScore -= 0.3;
        }
    } else {
        // Unresolved metric decreases confidence
        plan.confidenceScore -= 0.3;
    }

    // 3. Grouping
    if (semantics.dimension) {
        plan.groupBy = [semantics.dimension.physical];
    } else if (intentContext.dimension && intentContext.dimension !== 'unknown') {
        const { DIMENSION_REGISTRY } = require('../registry/dimensionRegistry');
        const fallbackDim = Object.entries(DIMENSION_REGISTRY).find(([logical, def]: [string, any]) => 
            logical === intentContext.dimension || def.aliases.includes(intentContext.dimension)
        ) as [string, any] | undefined;
        
        if (fallbackDim) {
            plan.groupBy = [fallbackDim[1].column];
            console.log(`[InheritedDimension] dimension=${fallbackDim[0]}`);
        } else {
            plan.confidenceScore -= 0.2;
        }
    } else if (plan.intent === 'ranking') {
        // Fallbacks for ranking if dimension missing
       if (q.includes('outlet') || q.includes('store')) {
         plan.groupBy = ['outlet_id'];
       } else if (q.includes('employee') || q.includes('agent')) {
         plan.groupBy = ['employee_id'];
       } else {
         plan.groupBy = ['territory_id'];
       }
       // Since it was fallback, decrease confidence slightly
       plan.confidenceScore -= 0.1;
    } else {
       // Unresolved dimension decreases confidence
       plan.confidenceScore -= 0.2;
    }

    // Normalize confidence to 0.0 -> 1.0
    if (plan.confidenceScore > 1.0) plan.confidenceScore = 1.0;
    if (plan.confidenceScore < 0.0) plan.confidenceScore = 0.0;

    return plan;
}
