import { IntentResult, ShapeSignature } from '../types';
import { AnalyticalIntent, TemplateId, lockTemplate, getAllowedComponentsForTemplate } from '../lib/renderGovernance';

/**
 * Deterministically selects the template and allowed component list
 * based on analytical intent and data shape.
 * Called before generateReport() to constrain LLM output.
 */
export const composeReport = (
  intent: AnalyticalIntent,
  shape: ShapeSignature,
  query: string,
): { template: TemplateId; allowedComponents: string[] } => {
  const template = lockTemplate(intent, shape);
  const allowedComponents = getAllowedComponentsForTemplate(template);

  console.log(`[ReportComposer] intent=${intent} → template=${template} components=[${allowedComponents.join(', ')}]`);

  return { template, allowedComponents };
};
