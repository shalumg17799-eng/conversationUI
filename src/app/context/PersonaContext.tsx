import React, { createContext, useContext, useState, ReactNode } from 'react';

export type PersonaType = 'marketing_director' | 'power_user';

export interface Persona {
  id: PersonaType;
  label: string;
  title: string;
  description: string;
  icon: string;
  quickActions: string[];
  intentCards: Array<{
    title: string;
    description: string;
    gradient: string;
    action: string;
  }>;
}

export const personas: Record<PersonaType, Persona> = {
  marketing_director: {
    id: 'marketing_director',
    label: 'Marketing Director',
    title: 'Marketing Director',
    description: 'Explore reports, territory performance, and business insights across your data',
    icon: '📊',
    // Action-oriented + backed by real data (Sales / Network / Contact Center / CX).
    // No campaign/audience/ROI prompts — there is no data behind those.
    quickActions: [
      'Explore my reports',
      'Create a new report',
      'Show territory revenue trend',
      'Compare territories by take rate',
      'Show network KPI trends',
      'Request a migration',
    ],
    intentCards: [
      {
        title: 'Create a New Report',
        description: 'Start building insights from your connected datasets',
        gradient: 'from-brand to-brand-hover',
        action: 'Help me create a new report',
      },
      {
        title: 'Territory Performance',
        description: 'Revenue and take rate across territories',
        gradient: 'from-violet-500 to-purple-600',
        action: 'Show territory revenue trend',
      },
      {
        title: 'Network Health',
        description: 'KPI scores, signal strength, and latency trends',
        gradient: 'from-blue-500 to-cyan-600',
        action: 'Show network KPI trends',
      },
      {
        title: 'Ask a Business Question',
        description: 'Use conversational analytics to get instant answers',
        gradient: 'from-emerald-500 to-teal-600',
        action: 'I want to ask a business question',
      },
    ],
  },
  power_user: {
    id: 'power_user',
    label: 'Power User',
    title: 'Power User',
    description: 'Full access to analytics, migrations, and advanced platform features',
    icon: '⚡',
    quickActions: [
      'Explore my reports',
      'Explore my datasets',
      'Ask a business question',
      'Create a new report',
      'Request a migration',
      'Check data governance status',
    ],
    intentCards: [
      {
        title: 'Migration Readiness',
        description: '3 datasets are ready for migration to BigQuery',
        gradient: 'from-orange-500 to-amber-600',
        action: 'Show me migration-ready datasets',
      },
      {
        title: 'Data Quality Alert',
        description: '2 datasets flagged with freshness issues in the last 24 hours',
        gradient: 'from-red-500 to-rose-600',
        action: 'Show me data quality alerts',
      },
      {
        title: 'Report Usage Spike',
        description: 'Territory Performance report views up 45% this week',
        gradient: 'from-indigo-500 to-blue-600',
        action: 'Show me trending reports',
      },
      {
        title: 'New Datasets Available',
        description: '4 new certified datasets added to the marketplace this week',
        gradient: 'from-green-500 to-emerald-600',
        action: 'Show me new datasets',
      },
    ],
  },
};

interface PersonaContextType {
  persona: Persona | null;
  personaType: PersonaType | null;
  setPersonaType: (type: PersonaType) => void;
  isMarketingDirector: boolean;
  isPowerUser: boolean;
}

const PersonaContext = createContext<PersonaContextType>({
  persona: null,
  personaType: null,
  setPersonaType: () => {},
  isMarketingDirector: false,
  isPowerUser: false,
});

export function PersonaProvider({ children }: { children: ReactNode }) {
  const [personaType, setPersonaType] = useState<PersonaType | null>(null);

  const persona = personaType ? personas[personaType] : null;

  return (
    <PersonaContext.Provider
      value={{
        persona,
        personaType,
        setPersonaType,
        isMarketingDirector: personaType === 'marketing_director',
        isPowerUser: personaType === 'power_user',
      }}
    >
      {children}
    </PersonaContext.Provider>
  );
}

export function usePersona() {
  return useContext(PersonaContext);
}
