import { ConversationState } from '../types/conversationState';

const sessionStates = new Map<string, ConversationState>();

export function getConversationState(sessionId: string = 'default_session'): ConversationState {
  if (!sessionStates.has(sessionId)) {
    sessionStates.set(sessionId, {
      sessionId,
      clarificationDepth: 0,
      resolvedContext: {},
      awaitingField: null,
      awaitingClarification: false
    });
  }
  return sessionStates.get(sessionId)!;
}

export function updateConversationState(sessionId: string, updates: Partial<ConversationState>): ConversationState {
  const state = getConversationState(sessionId);
  const newState = { ...state, ...updates };
  if (updates.resolvedContext) {
    newState.resolvedContext = { ...state.resolvedContext, ...updates.resolvedContext };
  }
  sessionStates.set(sessionId, newState);
  
  const domainLog = newState.resolvedContext?.domain || newState.domain || 'none';
  const reportLog = newState.resolvedContext?.report || newState.report || 'none';
  const metricLog = newState.resolvedContext?.metric || newState.metric || 'none';
  
  console.log(`[ConversationState] domain=${domainLog} report=${reportLog} metric=${metricLog}`);
  
  return newState;
}

export function clearClarificationState(sessionId: string): void {
  updateConversationState(sessionId, {
    awaitingClarification: false,
    awaitingField: null,
    clarificationDepth: 0
  });
}

export function incrementClarificationDepth(sessionId: string): number {
  const state = getConversationState(sessionId);
  const newDepth = (state.clarificationDepth || 0) + 1;
  updateConversationState(sessionId, { clarificationDepth: newDepth });
  console.log(`[ClarificationDepth] depth=${newDepth}`);
  return newDepth;
}

export function resetConversationState(sessionId: string): void {
  sessionStates.delete(sessionId);
}
