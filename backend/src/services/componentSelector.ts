import { ShapeSignature } from '../types';
import { AnalyticalIntent, TemplateId, getAllowedComponentsForTemplate, lockTemplate } from '../lib/renderGovernance';

/**
 * Returns the allowed component list for a given intent + data shape.
 * This is the active governance entry point — called before generateReport().
 */
export const getAllowedComponents = (
  shape: ShapeSignature,
  intent: AnalyticalIntent,
): string[] => {
  const template = lockTemplate(intent, shape);
  const allowed = getAllowedComponentsForTemplate(template);
  console.log(`[ComponentSelector] intent=${intent} template=${template} allowed=[${allowed.join(', ')}]`);
  return allowed;
};

export { lockTemplate, getAllowedComponentsForTemplate };
