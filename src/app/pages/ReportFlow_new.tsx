import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { ConversationalPage } from './Conversational_new';

/**
 * ReportFlowNew - A standalone page that auto-initializes the Create Report flow
 * This provides an independent entry point to the report creation experience
 */
export default function ReportFlowNew() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Auto-initialize create report mode when component mounts
  useEffect(() => {
    // Only set if not already in create-report mode
    if (searchParams.get('mode') !== 'create-report') {
      setSearchParams({ mode: 'create-report' });
    }
  }, []); // Run once on mount

  return <ConversationalPage isReportFlowMode={true} />;
}