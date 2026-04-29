import { classifyIntent } from '../services/intentClassifier';
import { executeQuery } from '../services/queryEngine';
import { analyzeDataShape } from '../services/dataShapeAnalyzer';
import { generateUITypeTree } from '../services/llmService';
import { validateUITypeTree } from '../services/uiValidator';
import { mapProps } from '../services/propMapper';
import { composeReport } from '../services/reportComposer';
import registry from '../registry/componentRegistry.json';
import { UITypeTree } from '../types';

export interface PipelineResult {
  uiTree: UITypeTree;
  wasShortCircuited: boolean;
  durationMs: number;
}

export async function runPipeline(query: string): Promise<PipelineResult> {
  const start = Date.now();

  // Layer 1: Intent & Retrieval
  const intent = await classifyIntent(query);
  const data = await executeQuery(intent);

  // Layer 2: Data Shape Analyzer
  const dataShape = await analyzeDataShape(data);

  // Layer 2.7: Report Composition (Deterministic)
  const componentTypes = composeReport(intent, dataShape, query);
  console.log('Layer 2.7: Suggested Components ->', componentTypes);

  const warnings: string[] = [];
  const sections: Record<string, UITypeTree[]> = {
    summary: [],
    analysis: [],
    details: []
  };

  for (const type of componentTypes) {
    // Layer 3.5: Prop Mapper (Deterministic)
    const props = mapProps(type, dataShape);
    
    const componentNode: UITypeTree = {
      renderType: type,
      props,
      children: []
    };

    // Layer 4: Validator
    const validation = await validateUITypeTree(componentNode);

    if (validation.isValid) {
      // Group into sections
      if (type === 'KPI') {
        sections.summary.push(componentNode);
      } else if (type === 'BarChart' || type === 'LineChart') {
        sections.analysis.push(componentNode);
      } else if (type === 'Table') {
        sections.details.push(componentNode);
      }
    } else {
      const errorMsg = `${type} skipped: ${validation.errors?.join(', ')}`;
      console.warn(errorMsg);
      warnings.push(errorMsg);
    }
  }

  // Final Structured Report
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const metric = intent.metric !== 'unknown' ? capitalize(intent.metric) : 'Data';
  const dimension = intent.dimension !== 'unknown' ? ` by ${capitalize(intent.dimension)}` : '';
  const time = intent.timeRange ? ` (${intent.timeRange.toUpperCase()})` : '';

  const reportTitle = `${metric}${dimension}${time}`;
  const reportDescription = intent.metric !== 'unknown' || intent.dimension !== 'unknown'
    ? `Comprehensive ${intent.metric !== 'unknown' ? intent.metric : 'analytical'} breakdown${intent.dimension !== 'unknown' ? ` across different ${intent.dimension} categories` : ''}${intent.timeRange ? ` for ${intent.timeRange}` : ''}.`
    : `Structured data analysis generated for: "${query}"`;

  const uiTree: UITypeTree = {
    renderType: 'Report',
    props: { 
      title: reportTitle,
      description: reportDescription,
      warnings
    },
    sections: [
      { type: 'summary', components: sections.summary },
      { type: 'analysis', components: sections.analysis },
      { type: 'details', components: sections.details }
    ].filter(s => s.components.length > 0) as any // Filter out empty sections
  };

  return {
    uiTree,
    wasShortCircuited: true,
    durationMs: Date.now() - start
  };
}
