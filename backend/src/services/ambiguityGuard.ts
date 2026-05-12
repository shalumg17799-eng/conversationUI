import { AnalyticalPlan } from '../types';
import { ConversationState } from '../types/conversationState';

export interface AmbiguityResult {
  isAmbiguous: boolean;
  missingField?: 'metric' | 'dimension' | 'domain';
  reason?: string;
  clarificationMessage?: string;
  clarificationOptions?: string[];
}

export function checkAmbiguity(
  query: string, 
  plan: AnalyticalPlan, 
  state: ConversationState
): AmbiguityResult {
  
  // Rule 1: Ranking intent exists AND no metric resolved
  if (plan.intent === 'ranking' && (!plan.measure || !plan.measure.field || plan.measure.field === 'unknown')) {
     console.log(`[AmbiguityGuard] metricMissing=true clarificationRequired=true`);
     return {
       isAmbiguous: true,
       missingField: 'metric',
       reason: 'Ranking intent without metric',
       clarificationMessage: 'What metric would you like to use?',
       clarificationOptions: ['Revenue', 'Churn', 'Take Rate', 'Run Rate', 'Growth']
     };
  }

  // More rules can be added here deterministically

  return { isAmbiguous: false };
}
