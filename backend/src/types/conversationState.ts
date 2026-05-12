export interface ConversationState {
  sessionId?: string;
  domain?: string;
  report?: string;
  metric?: string;
  dimension?: string;
  analyticalIntent?: string;
  awaitingClarification?: boolean;
  awaitingField?: 'domain' | 'report' | 'metric' | 'dimension' | null;
  lastResolvedQuery?: string;
  clarificationDepth?: number;
  resolvedContext?: {
    domain?: string;
    report?: string;
    metric?: string;
    dimension?: string;
  };
}
