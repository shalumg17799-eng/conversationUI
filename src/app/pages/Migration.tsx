import React, { useState } from 'react';
import { Layout } from '../components/ui/Layout';
import { useNavigate } from 'react-router';
import { 
  migrationRequests,
  formatRelativeTime,
  refMetricDefinitions,
} from '@/lib/dataModel';
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  FileText, 
  Database,
  ArrowRight,
  ExternalLink,
  MessageCircle,
  FileSearch,
} from 'lucide-react';

export function MigrationPage() {
  const navigate = useNavigate();
  const [selectedMigration, setSelectedMigration] = useState(migrationRequests[1]); // Default to "In Progress" example
  
  // Separate migrations by status
  const inProgressMigrations = migrationRequests.filter(
    m => ['Submitted', 'In Review', 'In Progress', 'Validating'].includes(m.status)
  );
  const completedMigrations = migrationRequests.filter(m => m.status === 'Completed');

  const StatusBadge = ({ status }: { status: string }) => {
    const styles = {
      'Submitted': 'bg-muted text-foreground',
      'In Review': 'bg-brand-subtle text-brand',
      'In Progress': 'bg-yellow-50 text-yellow-700',
      'Validating': 'bg-purple-50 text-purple-700',
      'Completed': 'bg-green-50 text-green-700',
    };
    
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium ${styles[status as keyof typeof styles]}`} style={{ fontFamily: 'var(--font-body)' }}>
        {status === 'Completed' && <CheckCircle2 className="w-3 h-3" />}
        {(status === 'In Progress' || status === 'Validating') && <Clock className="w-3 h-3" />}
        {(status === 'In Review' || status === 'Submitted') && <AlertCircle className="w-3 h-3" />}
        {status}
      </span>
    );
  };

  // Migration progress stepper based on status
  const getProgressSteps = (status: string) => {
    const allSteps = [
      { label: 'Request Submitted', key: 'submitted' },
      { label: 'Asset Assessment', key: 'assessment' },
      { label: 'Definition Mapping', key: 'mapping' },
      { label: 'Platform Translation', key: 'translation' },
      { label: 'Validation', key: 'validation' },
      { label: 'Completion', key: 'completion' },
    ];

    const statusMap: Record<string, number> = {
      'Submitted': 1,
      'In Review': 2,
      'In Progress': 4,
      'Validating': 5,
      'Completed': 6,
    };

    const completedCount = statusMap[status] || 1;

    return allSteps.map((step, idx) => ({
      ...step,
      completed: idx < completedCount,
      inProgress: idx === completedCount - 1 && status !== 'Completed',
    }));
  };

  const MigrationListItem = ({ migration, isActive }: { migration: typeof migrationRequests[0], isActive: boolean }) => (
    <div
      onClick={() => setSelectedMigration(migration)}
      className={`p-4 border-b border-border cursor-pointer transition-all hover:bg-muted ${
        isActive ? 'bg-brand-subtle border-l-4 border-l-blue-600' : 'border-l-4 border-l-transparent'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {migration.request_type === 'Report' ? (
              <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            ) : (
              <Database className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            )}
            <h3 className="text-[13px] font-semibold text-foreground truncate" style={{ fontFamily: 'var(--font-body)' }}>
              {migration.asset_name}
            </h3>
          </div>
          <p className="text-[11px] text-muted-foreground mb-2" style={{ fontFamily: 'var(--font-body)' }}>
            {migration.request_type} · {migration.source_platform} → {migration.target_platform}
          </p>
          <div className="flex items-center gap-2">
            <StatusBadge status={migration.status} />
            <span className="text-[10px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
              {migration.status === 'Completed' 
                ? `Completed ${formatRelativeTime(migration.submitted_date)}`
                : formatRelativeTime(migration.submitted_date)
              }
            </span>
          </div>
        </div>
        {isActive && <ArrowRight className="w-4 h-4 text-brand flex-shrink-0 mt-1" />}
      </div>
    </div>
  );

  const progressSteps = getProgressSteps(selectedMigration.status);
  const isCompleted = selectedMigration.status === 'Completed';
  const isInProgress = ['In Progress', 'Validating'].includes(selectedMigration.status);

  return (
    <Layout>
      {/* Page Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="space-y-1">
          <h1 className="text-[28px] font-semibold text-foreground" style={{ fontFamily: 'var(--font-body)' }}>
            Migration
          </h1>
          <p className="text-[13px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
            Track and review platform migrations
          </p>
        </div>
        <button
          onClick={() => navigate('/talk/migration')}
          className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-[13px] font-medium transition-colors"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          Request Migration
        </button>
      </div>

      {/* Two-Column Layout */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left Column: Migration List */}
        <div className="col-span-4 bg-card rounded-[12px] border border-border shadow-sm overflow-hidden">
          {/* In Progress Section */}
          <div>
            <div className="px-5 py-3 bg-muted border-b border-border">
              <h2 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide" style={{ fontFamily: 'var(--font-body)' }}>
                In Progress ({inProgressMigrations.length})
              </h2>
            </div>
            <div>
              {inProgressMigrations.length > 0 ? (
                inProgressMigrations.map(migration => (
                  <MigrationListItem
                    key={migration.request_id}
                    migration={migration}
                    isActive={selectedMigration.request_id === migration.request_id}
                  />
                ))
              ) : (
                <div className="p-6 text-center text-[12px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                  No migrations in progress
                </div>
              )}
            </div>
          </div>

          {/* Completed Section */}
          <div className="border-t-4 border-[var(--muted)]">
            <div className="px-5 py-3 bg-muted border-b border-border">
              <h2 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide" style={{ fontFamily: 'var(--font-body)' }}>
                Completed ({completedMigrations.length})
              </h2>
            </div>
            <div>
              {completedMigrations.length > 0 ? (
                completedMigrations.map(migration => (
                  <MigrationListItem
                    key={migration.request_id}
                    migration={migration}
                    isActive={selectedMigration.request_id === migration.request_id}
                  />
                ))
              ) : (
                <div className="p-6 text-center text-[12px] text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                  No completed migrations
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Migration Details */}
        <div className="col-span-8 bg-card rounded-[12px] border border-border shadow-sm p-6">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                {selectedMigration.request_type === 'Report' ? (
                  <div className="w-10 h-10 rounded-lg bg-brand-subtle flex items-center justify-center">
                    <FileText className="w-5 h-5 text-brand" />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
                    <Database className="w-5 h-5 text-purple-600" />
                  </div>
                )}
                <div>
                  <h2 className="text-[18px] font-semibold text-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                    {selectedMigration.asset_name}
                  </h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded" style={{ fontFamily: 'var(--font-body)' }}>
                      {selectedMigration.request_type}
                    </span>
                    <StatusBadge status={selectedMigration.status} />
                  </div>
                </div>
              </div>
              <span className="text-[11px] text-muted-foreground font-mono" style={{ fontFamily: 'var(--font-body)' }}>
                {selectedMigration.request_id}
              </span>
            </div>
          </div>

          {/* Platform Transition */}
          <div className="mb-6 pb-6 border-b border-border">
            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2" style={{ fontFamily: 'var(--font-body)' }}>
              Platform Transition
            </label>
            <div className="flex items-center gap-3">
              <div className="px-4 py-2 bg-muted rounded-lg border border-border">
                <span className="text-[13px] font-medium text-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                  {selectedMigration.source_platform}
                </span>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
              <div className="px-4 py-2 bg-brand-subtle rounded-lg border border-brand/20">
                <span className="text-[13px] font-medium text-brand" style={{ fontFamily: 'var(--font-body)' }}>
                  {selectedMigration.target_platform}
                </span>
              </div>
            </div>
          </div>

          {/* Preserved Assets */}
          <div className="mb-6 pb-6 border-b border-border">
            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2" style={{ fontFamily: 'var(--font-body)' }}>
              Preserved Assets
            </label>
            <div className="flex flex-wrap gap-2">
              {selectedMigration.request_type === 'Report' ? (
                <>
                  <span className="bg-green-50 text-green-700 text-[11px] font-medium px-2.5 py-1 rounded" style={{ fontFamily: 'var(--font-body)' }}>
                    Metrics
                  </span>
                  <span className="bg-green-50 text-green-700 text-[11px] font-medium px-2.5 py-1 rounded" style={{ fontFamily: 'var(--font-body)' }}>
                    Dimensions
                  </span>
                  <span className="bg-green-50 text-green-700 text-[11px] font-medium px-2.5 py-1 rounded" style={{ fontFamily: 'var(--font-body)' }}>
                    Calculations
                  </span>
                  <span className="bg-green-50 text-green-700 text-[11px] font-medium px-2.5 py-1 rounded" style={{ fontFamily: 'var(--font-body)' }}>
                    Certifications
                  </span>
                </>
              ) : (
                <>
                  <span className="bg-green-50 text-green-700 text-[11px] font-medium px-2.5 py-1 rounded" style={{ fontFamily: 'var(--font-body)' }}>
                    Schema
                  </span>
                  <span className="bg-green-50 text-green-700 text-[11px] font-medium px-2.5 py-1 rounded" style={{ fontFamily: 'var(--font-body)' }}>
                    Relationships
                  </span>
                  <span className="bg-green-50 text-green-700 text-[11px] font-medium px-2.5 py-1 rounded" style={{ fontFamily: 'var(--font-body)' }}>
                    Certifications
                  </span>
                  <span className="bg-green-50 text-green-700 text-[11px] font-medium px-2.5 py-1 rounded" style={{ fontFamily: 'var(--font-body)' }}>
                    Governance rules
                  </span>
                </>
              )}
            </div>
            {selectedMigration.request_type === 'Dataset' && (
              <div className="mt-3">
                <p className="text-[11px] text-muted-foreground mb-1.5" style={{ fontFamily: 'var(--font-body)' }}>
                  Key metrics preserved:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {refMetricDefinitions.slice(0, 4).map(metric => (
                    <span key={metric.metric_id} className="bg-brand-subtle text-brand text-[10px] font-medium px-2 py-0.5 rounded" style={{ fontFamily: 'var(--font-body)' }}>
                      {metric.metric_name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Migration Progress */}
          <div className="mb-6 pb-6 border-b border-border">
            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-4" style={{ fontFamily: 'var(--font-body)' }}>
              Migration Progress
            </label>
            <div className="space-y-4">
              {progressSteps.map((step, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <div className="relative">
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      step.completed 
                        ? 'border-green-600 bg-green-600' 
                        : step.inProgress 
                        ? 'border-brand bg-brand-subtle'
                        : 'border-gray-300 bg-white'
                    }`}>
                      {step.completed && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                      {step.inProgress && <Clock className="w-3.5 h-3.5 text-brand" />}
                    </div>
                    {idx < progressSteps.length - 1 && (
                      <div className={`absolute left-1/2 top-6 w-0.5 h-4 -translate-x-1/2 ${
                        step.completed ? 'bg-green-600' : 'bg-border'
                      }`} />
                    )}
                  </div>
                  <div className="flex-1 pt-0.5">
                    <p className={`text-[13px] ${
                      step.completed ? 'text-foreground font-medium' : step.inProgress ? 'text-brand font-medium' : 'text-muted-foreground'
                    }`} style={{ fontFamily: 'var(--font-body)' }}>
                      {step.label}
                    </p>
                    {step.inProgress && (
                      <p className="text-[11px] text-muted-foreground mt-0.5" style={{ fontFamily: 'var(--font-body)' }}>
                        Currently processing...
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-3" style={{ fontFamily: 'var(--font-body)' }}>
              Actions
            </label>
            <div className="flex flex-wrap gap-2">
              {isInProgress && (
                <>
                  <button className="px-4 py-2 bg-white hover:bg-muted text-foreground border border-border rounded-lg text-[12px] font-medium transition-colors flex items-center gap-2" style={{ fontFamily: 'var(--font-body)' }}>
                    <FileSearch className="w-4 h-4" />
                    View logs
                  </button>
                  <button 
                    onClick={() => navigate(`/talk/migration/${selectedMigration.request_id}`)}
                    className="px-4 py-2 bg-white hover:bg-muted text-foreground border border-border rounded-lg text-[12px] font-medium transition-colors flex items-center gap-2" 
                    style={{ fontFamily: 'var(--font-body)' }}
                  >
                    <MessageCircle className="w-4 h-4" />
                    Ask about status
                  </button>
                </>
              )}
              {isCompleted && (
                <>
                  <button className="px-4 py-2 bg-brand hover:bg-brand-hover text-white rounded-lg text-[12px] font-medium transition-colors flex items-center gap-2" style={{ fontFamily: 'var(--font-body)' }}>
                    <ExternalLink className="w-4 h-4" />
                    View migrated asset
                  </button>
                  <button className="px-4 py-2 bg-white hover:bg-muted text-foreground border border-border rounded-lg text-[12px] font-medium transition-colors flex items-center gap-2" style={{ fontFamily: 'var(--font-body)' }}>
                    <ExternalLink className="w-4 h-4" />
                    Open in {selectedMigration.target_platform}
                  </button>
                  <button className="px-4 py-2 bg-white hover:bg-muted text-foreground border border-border rounded-lg text-[12px] font-medium transition-colors flex items-center gap-2" style={{ fontFamily: 'var(--font-body)' }}>
                    <FileSearch className="w-4 h-4" />
                    View validation summary
                  </button>
                </>
              )}
              {['Submitted', 'In Review'].includes(selectedMigration.status) && (
                <>
                  <button 
                    onClick={() => navigate(`/talk/migration/${selectedMigration.request_id}`)}
                    className="px-4 py-2 bg-white hover:bg-muted text-foreground border border-border rounded-lg text-[12px] font-medium transition-colors flex items-center gap-2" 
                    style={{ fontFamily: 'var(--font-body)' }}
                  >
                    <MessageCircle className="w-4 h-4" />
                    Ask about status
                  </button>
                  <button className="px-4 py-2 bg-white hover:bg-muted text-foreground border border-border rounded-lg text-[12px] font-medium transition-colors flex items-center gap-2" style={{ fontFamily: 'var(--font-body)' }}>
                    <FileSearch className="w-4 h-4" />
                    View submission details
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
