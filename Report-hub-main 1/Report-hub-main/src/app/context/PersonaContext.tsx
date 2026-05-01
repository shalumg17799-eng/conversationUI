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
    description: 'Focused on campaign performance, audience insights, and marketing ROI',
    icon: '📊',
    quickActions: [
      'How are my campaigns performing this quarter?',
      'Show me audience segmentation breakdown',
      'What is the marketing ROI trend?',
      'Which channels are driving the most conversions?',
      'Compare campaign performance across regions',
      'Show customer acquisition cost trends',
    ],
    intentCards: [
      {
        title: 'Campaign Performance Summary',
        description: 'Your Q1 campaigns show 12% higher engagement than last quarter',
        gradient: 'from-pink-500 to-rose-600',
        action: 'Show me detailed campaign performance metrics',
      },
      {
        title: 'Audience Growth Alert',
        description: 'New audience segment "Digital Natives" grew 34% this month',
        gradient: 'from-violet-500 to-purple-600',
        action: 'Tell me more about audience growth trends',
      },
      {
        title: 'Channel Mix Optimization',
        description: 'Social media outperforming email by 2.3x on conversions',
        gradient: 'from-blue-500 to-cyan-600',
        action: 'Show me the channel performance comparison',
      },
      {
        title: 'Budget Utilization',
        description: '67% of marketing budget deployed, tracking 8% under plan',
        gradient: 'from-emerald-500 to-teal-600',
        action: 'Show me the budget utilization report',
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
