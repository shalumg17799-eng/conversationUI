import { UITypeTree, ValidationResult } from '../types';
import registry from '../registry/componentRegistry.json';

export const validateUITypeTree = async (uiTree: UITypeTree): Promise<ValidationResult> => {
  // Layer 4: Validator (Deterministic validation using Component Registry)
  console.log('Layer 4 - Validating UI Type Tree');

  const errors: string[] = [];

  // 1. Check if component exists in registry
  const component = registry.components.find(c => c.type === uiTree.renderType);
  
  if (!component) {
    return {
      isValid: false,
      errors: [`Component "${uiTree.renderType}" is not registered.`]
    };
  }

  // 2. Validate required props
  component.requiredProps.forEach(prop => {
    if (!(prop in uiTree.props)) {
      errors.push(`Missing required prop: "${prop}" for component "${uiTree.renderType}".`);
    }
  });

  // 3. Validate optional allowed props (preventing extra noise)
  Object.keys(uiTree.props).forEach(prop => {
    if (!component.allowedProps.includes(prop) && !component.requiredProps.includes(prop)) {
      // Just a warning or soft error? Let's treat it as invalid for strictness.
      // errors.push(`Property "${prop}" is not allowed for component "${uiTree.renderType}".`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined
  };
};
