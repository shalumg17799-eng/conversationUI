import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { Toaster } from 'sonner';
import { PersonaProvider } from './context/PersonaContext';
import { LoginPage } from './pages/Login';
import { PersonaPickerPage } from './pages/PersonaPicker';
import { DashboardPage } from './pages/Dashboard';
import { ConversationalPage } from './pages/Conversational_new';
import { EnterpriseBIPage } from './pages/EnterpriseBI';
import { AdvancedPage } from './pages/Advanced';
import { ReportsPage } from './pages/Reports';
import { FullReportPage } from './pages/FullReport';
import { DatasetsPage } from './pages/Datasets';
import { GovernancePage } from './pages/Governance';
import { MigrationPage } from './pages/Migration';
import { TalkMigrationPage } from './pages/TalkMigration';
import { SettingsPage } from './pages/Settings';
import { NotFoundPage } from './pages/NotFound';
import ReportFlowNew from './pages/ReportFlow_new';

// Report Hub Platform - v1.0.0
export default function App() {
  return (
    <BrowserRouter>
      <PersonaProvider>
      <Toaster position="top-right" richColors closeButton />
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/persona" element={<PersonaPickerPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/conversational" element={<ConversationalPage />} />
        <Route path="/report-flow" element={<ReportFlowNew />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/reports/:reportId" element={<ReportsPage />} />
        <Route path="/reports/:reportId/full" element={<FullReportPage />} />
        <Route path="/datasets" element={<DatasetsPage />} />
        <Route path="/datasets/:datasetId" element={<DatasetsPage />} />
        <Route path="/enterprise-bi" element={<EnterpriseBIPage />} />
        <Route path="/governance" element={<GovernancePage />} />
        <Route path="/migration" element={<MigrationPage />} />
        <Route path="/talk/migration" element={<TalkMigrationPage />} />
        <Route path="/talk/migration/datasets" element={<TalkMigrationPage />} />
        <Route path="/talk/migration/datasets/:datasetId" element={<TalkMigrationPage />} />
        <Route path="/talk/migration/datasets/:datasetId/:step" element={<TalkMigrationPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/advanced" element={<AdvancedPage />} />
        <Route path="/404" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
      </PersonaProvider>
    </BrowserRouter>
  );
}