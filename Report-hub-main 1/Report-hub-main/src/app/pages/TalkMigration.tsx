import React, { useState, useRef, useEffect } from 'react';
import { Layout } from '../components/ui/Layout';
import { useNavigate, useParams } from 'react-router';
import {
  getAllDatasets,
  catalogDatasets,
  formatRelativeTime,
  MigrationSession,
} from '@/lib/dataModel';
import {
  Send,
  Plus,
  Edit2,
  Trash2,
  X,
  Database,
  CheckCircle2,
  AlertCircle,
  Clock,
  XCircle,
  TrendingUp,
  AlertTriangle,
  Shield,
  Zap,
  FileText,
  ExternalLink,
  Play,
  Pause,
  RefreshCw,
  Lock,
  ArrowRight,
  Info,
  Search,
  Filter,
  Users,
  Eye,
  Layers,
  Link2,
} from 'lucide-react';
import { LayoutBuilder } from '@/app/components/LayoutBuilder';
import { TemplatePreview } from '@/app/components/TemplatePreview';
import { ReportPreviewUI } from '@/app/components/ReportPreviewStep';
import { PlatformPreviewComparison } from '@/app/components/PlatformPreviewComparison';

// Intent Selection Component (separate to avoid hooks violation)
interface IntentSelectionProps {
  msgId: string;
  msgContent: string;
  onIntentSelect: () => void;
  onViewOverview: () => void;
}

function IntentSelectionUI({ msgId, msgContent, onIntentSelect, onViewOverview }: IntentSelectionProps) {
  // Pre-selected by default since it's the only option
  const [selectedIntent, setSelectedIntent] = useState<'migrate_existing'>('migrate_existing');

  return (
    <div className="mb-6">
      {/* Assistant Message */}
      <div className="bg-gray-50 px-4 py-3 rounded-xl mb-4 max-w-[80%]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="text-[13px] text-[#111827] font-semibold mb-2">
          I can help you migrate an existing report.
        </div>
        <div className="text-[13px] text-[#111827]">
          Let's start by selecting where the report currently lives, then choose the report you want to migrate.
        </div>
      </div>

      {/* Intent Selection UI */}
      <div className="space-y-4 max-w-[80%]">
        {/* Section Header */}
        <h3 className="text-[14px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
          Choose one option to continue
        </h3>

        {/* Single Option: Migrate Existing (Pre-selected) */}
        <div className="grid grid-cols-1 gap-3">
          <div
            onClick={() => setSelectedIntent('migrate_existing')}
            className="bg-white border-2 border-blue-500 ring-2 ring-blue-100 shadow-md bg-blue-50/30 rounded-xl p-4 cursor-pointer transition-all"
          >
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full border-2 border-blue-500 bg-blue-500 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all">
                <div className="w-3 h-3 rounded-full bg-white" />
              </div>
              <div className="flex-1">
                <h4 className="text-[14px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Migrate an existing report
                </h4>
                <p className="text-[12px] text-[#6B7280] leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Select the source platform, choose the report, then migrate it into Report Hub.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-col gap-3">
          <button
            onClick={onIntentSelect}
            className="px-6 py-2.5 rounded-lg text-[13px] font-medium transition-all shadow-sm bg-[#111827] hover:bg-[#0F172A] text-white cursor-pointer"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            Continue
          </button>
          
          {/* Secondary Link */}
          <button
            onClick={onViewOverview}
            className="text-[#6B7280] hover:text-[#111827] text-[13px] font-medium transition-colors underline self-start"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            View migration overview
          </button>
        </div>
      </div>
    </div>
  );
}

// Source Platform Selection Component (Step 2)
interface SourcePlatformSelectionProps {
  msgId: string;
  onContinue: (platform: 'tableau' | 'qlik' | 'looker' | 'bifabric') => void;
}

function SourcePlatformSelectionUI({ msgId, onContinue }: SourcePlatformSelectionProps) {
  const [selectedPlatform, setSelectedPlatform] = useState<'tableau' | 'qlik' | 'looker' | 'bifabric' | null>(null);

  const platforms = [
    { id: 'tableau' as const, name: 'Tableau', subtitle: 'Source system' },
    { id: 'qlik' as const, name: 'Qlik', subtitle: 'Source system' },
    { id: 'looker' as const, name: 'Looker', subtitle: 'Source system' },
    { id: 'bifabric' as const, name: 'Report Hub', subtitle: 'Source system' },
  ];

  return (
    <div className="mb-6">
      {/* Source Platform Selection */}
      <div className="space-y-4 max-w-[80%]">
        {/* Platform Selection List */}
        <div className="space-y-3">
          {platforms.map((platform) => (
            <div
              key={platform.id}
              onClick={() => setSelectedPlatform(platform.id)}
              className={`bg-white border-2 rounded-xl p-4 cursor-pointer transition-all ${
                selectedPlatform === platform.id
                  ? 'border-blue-500 ring-2 ring-blue-100 shadow-md bg-blue-50/30'
                  : 'border-[#E5E7EB] hover:border-blue-300 hover:shadow-sm'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Radio Button */}
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                  selectedPlatform === platform.id
                    ? 'border-blue-500 bg-blue-500'
                    : 'border-gray-400 bg-white'
                }`}>
                  {selectedPlatform === platform.id && (
                    <div className="w-3 h-3 rounded-full bg-white" />
                  )}
                </div>
                
                <div className="flex-1">
                  <h4 className="text-[14px] font-semibold text-[#111827] mb-0.5" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {platform.name}
                  </h4>
                  <p className="text-[12px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {platform.subtitle}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Action Controls */}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => {
              if (selectedPlatform) {
                onContinue(selectedPlatform);
              }
            }}
            disabled={!selectedPlatform}
            className={`px-6 py-2.5 rounded-lg text-[13px] font-medium transition-all shadow-sm ${
              selectedPlatform 
                ? 'bg-[#111827] hover:bg-[#0F172A] text-white cursor-pointer' 
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

// Report Selection Component (Step 3)
interface ReportSelectionProps {
  msgId: string;
  sourcePlatform: 'tableau' | 'powerbi' | 'qlik' | 'bifabric';
  onContinue: (reportId: string) => void;
  onReportSelect: (report: any) => void;
}

function ReportSelectionUI({ msgId, sourcePlatform, onContinue, onReportSelect }: ReportSelectionProps) {
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const platformNames = {
    tableau: 'Tableau',
    powerbi: 'Power BI',
    qlik: 'Qlik',
    bifabric: 'Report Hub'
  };

  // Mock report data based on source platform
  const allReports = [
    {
      id: 'report-1',
      name: 'Customer Churn Report',
      owner: 'Analytics Team',
      lastUpdated: '2 days ago',
      users: 42,
      views: 1200,
      usageLevel: 'high',
      sourcePlatform: sourcePlatform
    },
    {
      id: 'report-2',
      name: 'Monthly Sales Performance',
      owner: 'Sales Operations',
      lastUpdated: '1 week ago',
      users: 28,
      views: 850,
      usageLevel: 'high',
      sourcePlatform: sourcePlatform
    },
    {
      id: 'report-3',
      name: 'Subscriber Growth Trends',
      owner: 'Product Team',
      lastUpdated: '3 days ago',
      users: 15,
      views: 320,
      usageLevel: 'low',
      sourcePlatform: sourcePlatform
    }
  ];

  const filteredReports = allReports.filter(report =>
    report.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    report.owner.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleReportSelect = (report: any) => {
    setSelectedReportId(report.id);
    onReportSelect(report);
  };

  return (
    <div className="mb-6">
      {/* Assistant Message */}
      <div className="bg-gray-50 px-4 py-3 rounded-xl mb-4 max-w-[80%]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="text-[13px] text-[#111827] font-semibold mb-2">
          Select the report you want to migrate.
        </div>
        <div className="text-[13px] text-[#111827]">
          Choose a report from the selected source platform to continue.
        </div>
      </div>

      {/* Report Selection */}
      <div className="space-y-4 max-w-[90%]">
        {/* Section Header */}
        <div>
          <h3 className="text-[14px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
            AVAILABLE REPORTS
          </h3>
          <p className="text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
            Showing reports from: {platformNames[sourcePlatform]}
          </p>
        </div>

        {/* Search and Filter Controls */}
        <div className="bg-white border border-[#E5E7EB] rounded-xl p-4 space-y-3">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search reports by name or owner"
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              style={{ fontFamily: 'Inter, sans-serif' }}
            />
          </div>

          {/* Filter Chips */}
          <div className="flex flex-wrap gap-2">
            <button className="px-3 py-1 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-md text-[11px] text-gray-700 font-medium transition-colors" style={{ fontFamily: 'Inter, sans-serif' }}>
              <Filter className="inline w-3 h-3 mr-1" />
              Owner
            </button>
            <button className="px-3 py-1 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-md text-[11px] text-gray-700 font-medium transition-colors" style={{ fontFamily: 'Inter, sans-serif' }}>
              <Filter className="inline w-3 h-3 mr-1" />
              Domain
            </button>
            <button className="px-3 py-1 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-md text-[11px] text-gray-700 font-medium transition-colors" style={{ fontFamily: 'Inter, sans-serif' }}>
              <Filter className="inline w-3 h-3 mr-1" />
              Last updated
            </button>
            <button className="px-3 py-1 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-md text-[11px] text-gray-700 font-medium transition-colors" style={{ fontFamily: 'Inter, sans-serif' }}>
              <Filter className="inline w-3 h-3 mr-1" />
              Usage
            </button>
          </div>
        </div>

        {/* Report List */}
        <div className="space-y-2">
          {filteredReports.map((report) => (
            <div
              key={report.id}
              onClick={() => handleReportSelect(report)}
              className={`bg-white border-2 rounded-xl p-4 cursor-pointer transition-all ${
                selectedReportId === report.id
                  ? 'border-blue-500 ring-2 ring-blue-100 shadow-md bg-blue-50/30'
                  : 'border-[#E5E7EB] hover:border-blue-300 hover:shadow-sm'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Radio Indicator */}
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                  selectedReportId === report.id
                    ? 'border-blue-500 bg-blue-500'
                    : 'border-gray-400 bg-white'
                }`}>
                  {selectedReportId === report.id && (
                    <div className="w-3 h-3 rounded-full bg-white" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-[14px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                          {report.name}
                        </h4>
                        {report.usageLevel === 'high' && (
                          <span className="inline-flex items-center bg-green-100 text-green-700 text-[10px] font-semibold px-2 py-0.5 rounded">
                            High usage
                          </span>
                        )}
                        {report.usageLevel === 'low' && (
                          <span className="inline-flex items-center bg-gray-100 text-gray-600 text-[10px] font-semibold px-2 py-0.5 rounded">
                            Low usage
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-[#6B7280] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                        Owner: {report.owner}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 text-[11px] text-[#9CA3AF]" style={{ fontFamily: 'Inter, sans-serif' }}>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {report.lastUpdated}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {report.users} users
                    </span>
                    <span className="flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      {(report.views / 1000).toFixed(1)}k views/month
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredReports.length === 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
            <p className="text-[13px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
              No reports found matching your search.
            </p>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => {
              if (selectedReportId) {
                onContinue(selectedReportId);
              }
            }}
            disabled={!selectedReportId}
            className={`px-6 py-2.5 rounded-lg text-[13px] font-medium transition-all shadow-sm ${
              selectedReportId 
                ? 'bg-[#111827] hover:bg-[#0F172A] text-white cursor-pointer' 
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

// Destination Platform Selection Component (Step 4)
interface DestinationPlatformSelectionProps {
  msgId: string;
  sourcePlatform: 'tableau' | 'powerbi' | 'qlik' | 'bifabric';
  reportName: string;
  onContinue: (destinationPlatform: 'bifabric' | 'qlik' | 'looker') => void;
  onDestinationSelect: (platform: 'bifabric' | 'qlik' | 'looker') => void;
}

function DestinationPlatformSelectionUI({ 
  msgId, 
  sourcePlatform, 
  reportName, 
  onContinue, 
  onDestinationSelect 
}: DestinationPlatformSelectionProps) {
  const [selectedDestination, setSelectedDestination] = useState<'bifabric' | 'qlik' | 'looker'>('bifabric');

  const platformNames = {
    tableau: 'Tableau',
    powerbi: 'Power BI',
    qlik: 'Qlik',
    bifabric: 'Report Hub'
  };

  const destinationOptions = [
    {
      id: 'bifabric' as const,
      name: 'Report Hub',
      subtitle: 'Unified reporting experience',
      helperText: 'Default destination. Optimized automatically during migration.',
      recommended: true
    },
    {
      id: 'qlik' as const,
      name: 'Qlik',
      subtitle: 'Enterprise BI (optional)',
      helperText: '',
      recommended: false
    },
    {
      id: 'looker' as const,
      name: 'Looker',
      subtitle: 'Enterprise BI (optional)',
      helperText: '',
      recommended: false
    }
  ];

  const handleDestinationSelect = (platform: 'bifabric' | 'qlik' | 'looker') => {
    setSelectedDestination(platform);
    onDestinationSelect(platform);
  };

  return (
    <div className="mb-6">
      {/* Assistant Message */}
      <div className="bg-gray-50 px-4 py-3 rounded-xl mb-4 max-w-[80%]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="text-[13px] text-[#111827] font-semibold mb-2">
          Choose where this report should live after migration.
        </div>
        <div className="text-[13px] text-[#111827]">
          Report Hub is the recommended destination. Other platforms are supported if needed.
        </div>
      </div>

      {/* Destination Selection */}
      <div className="space-y-4 max-w-[90%]">
        {/* Source vs Destination Context */}
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-[12px]" style={{ fontFamily: 'Inter, sans-serif' }}>
          <div className="flex items-center gap-2">
            <span className="text-[#6B7280] font-medium">SOURCE:</span>
            <span className="text-[#111827] font-semibold">{platformNames[sourcePlatform]}</span>
          </div>
          <ArrowRight className="w-4 h-4 text-blue-500" />
          <div className="flex items-center gap-2">
            <span className="text-[#6B7280] font-medium">DESTINATION:</span>
            <span className="text-blue-600 font-semibold">Select below</span>
          </div>
        </div>

        {/* Section Header */}
        <div>
          <h3 className="text-[14px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
            DESTINATION PLATFORM
          </h3>
          <p className="text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
            Destination platforms only. Source platforms were selected earlier.
          </p>
        </div>

        {/* Destination Options */}
        <div className="space-y-3">
          {destinationOptions.map((option) => (
            <div
              key={option.id}
              onClick={() => handleDestinationSelect(option.id)}
              className={`bg-white border-2 rounded-xl p-4 cursor-pointer transition-all ${
                selectedDestination === option.id
                  ? 'border-blue-500 ring-2 ring-blue-100 shadow-md bg-blue-50/30'
                  : 'border-[#E5E7EB] hover:border-blue-300 hover:shadow-sm'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Radio Button */}
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                  selectedDestination === option.id
                    ? 'border-blue-500 bg-blue-500'
                    : 'border-gray-400 bg-white'
                }`}>
                  {selectedDestination === option.id && (
                    <div className="w-3 h-3 rounded-full bg-white" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-[14px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {option.name}
                    </h4>
                    {option.recommended && (
                      <span className="inline-flex items-center bg-green-100 text-green-700 text-[10px] font-semibold px-2 py-0.5 rounded">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-[#6B7280] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {option.subtitle}
                  </p>
                  {option.helperText && (
                    <p className="text-[11px] text-[#9CA3AF]" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {option.helperText}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Action Controls */}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => onContinue(selectedDestination)}
            className="px-6 py-2.5 rounded-lg text-[13px] font-medium transition-all shadow-sm bg-[#111827] hover:bg-[#0F172A] text-white cursor-pointer"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

// Visual Configuration Component (Step 5)
interface VisualConfigurationProps {
  msgId: string;
  reportName: string;
  sourcePlatform?: string;
  destinationPlatform?: string;
  onContinue: (config: { 
    layoutOption: 'keep_current' | 'template' | 'custom' | 'reference_existing'; 
    referenceReportUrl?: string; 
    selectedTemplate?: string;
    customLayoutComponents?: any[];
    includeSummary: boolean; 
    preserveFilters: boolean; 
    useStandardTheme: boolean 
  }) => void;
}

function VisualConfigurationUI({ msgId, reportName, sourcePlatform = 'tableau', destinationPlatform = 'bifabric', onContinue }: VisualConfigurationProps) {
  const [layoutOption, setLayoutOption] = useState<'keep_current' | 'template' | 'custom' | 'reference_existing'>('keep_current');
  const [referenceReportUrl, setReferenceReportUrl] = useState('');
  const [includeSummary, setIncludeSummary] = useState(true);
  const [preserveFilters, setPreserveFilters] = useState(true);
  const [useStandardTheme, setUseStandardTheme] = useState(true);
  
  // Sub-view state for template and custom options
  const [showSubView, setShowSubView] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [customLayoutComponents, setCustomLayoutComponents] = useState<any[]>([]);

  const handleContinue = () => {
    onContinue({
      layoutOption,
      referenceReportUrl: layoutOption === 'reference_existing' ? referenceReportUrl : undefined,
      selectedTemplate: layoutOption === 'template' ? selectedTemplate || undefined : undefined,
      customLayoutComponents: layoutOption === 'custom' ? customLayoutComponents : undefined,
      includeSummary,
      preserveFilters,
      useStandardTheme
    });
  };

  return (
    <div className="mb-6">
      {/* Assistant Message */}
      <div className="bg-gray-50 px-4 py-3 rounded-xl mb-4 max-w-[80%]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="text-[13px] text-[#111827] font-semibold mb-2">
          Configure how the report should look.
        </div>
        <div className="text-[13px] text-[#111827]">
          You can keep the existing layout or reference another report for visual guidance.
        </div>
      </div>

      {/* Visual Configuration */}
      <div className="space-y-4 max-w-[90%]">
        {/* Section Header */}
        <div>
          <h3 className="text-[14px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
            VISUAL CONFIGURATION
          </h3>
          <p className="text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
            Choose a starting point. You can customize the layout next.
          </p>
        </div>

        {/* Show 4-option grid when not in sub-view */}
        {!showSubView && (
          <div className="grid grid-cols-2 gap-3">
            {/* Option 1: Keep current layout (Migration default) */}
            <div
              onClick={() => {
                setLayoutOption('keep_current');
                setShowSubView(false);
              }}
              className={`bg-white border-2 rounded-xl p-4 cursor-pointer transition-all ${
                layoutOption === 'keep_current'
                  ? 'border-blue-500 ring-2 ring-blue-100 shadow-md bg-blue-50/30'
                  : 'border-[#E5E7EB] hover:border-blue-300 hover:shadow-sm'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Radio Button */}
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                  layoutOption === 'keep_current'
                    ? 'border-blue-500 bg-blue-500'
                    : 'border-gray-400 bg-white'
                }`}>
                  {layoutOption === 'keep_current' && (
                    <div className="w-3 h-3 rounded-full bg-white" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-[14px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                      Keep the current report layout
                    </h4>
                    <span className="inline-flex items-center bg-blue-100 text-blue-700 text-[10px] font-semibold px-2 py-0.5 rounded">
                      Default
                    </span>
                  </div>
                  <p className="text-[12px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Reuse the existing layout and visual structure from the source report.
                  </p>
                </div>
              </div>
            </div>

            {/* Option 2: Template-based */}
            <div
              onClick={() => {
                setLayoutOption('template');
                setShowSubView(true);
                setSelectedTemplate(null);
              }}
              className={`bg-white border-2 rounded-xl p-4 cursor-pointer transition-all ${
                layoutOption === 'template'
                  ? 'border-blue-500 ring-2 ring-blue-100 shadow-md bg-blue-50/30'
                  : 'border-[#E5E7EB] hover:border-blue-300 hover:shadow-sm'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Radio Button */}
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                  layoutOption === 'template'
                    ? 'border-blue-500 bg-blue-500'
                    : 'border-gray-400 bg-white'
                }`}>
                  {layoutOption === 'template' && (
                    <div className="w-3 h-3 rounded-full bg-white" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className="text-[14px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Template-based
                  </h4>
                  <p className="text-[12px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Start with a recommended layout
                  </p>
                </div>
              </div>
            </div>

            {/* Option 3: Custom (Drag & drop) */}
            <div
              onClick={() => {
                setLayoutOption('custom');
                setShowSubView(true);
              }}
              className={`bg-white border-2 rounded-xl p-4 cursor-pointer transition-all ${
                layoutOption === 'custom'
                  ? 'border-blue-500 ring-2 ring-blue-100 shadow-md bg-blue-50/30'
                  : 'border-[#E5E7EB] hover:border-blue-300 hover:shadow-sm'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Radio Button */}
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                  layoutOption === 'custom'
                    ? 'border-blue-500 bg-blue-500'
                    : 'border-gray-400 bg-white'
                }`}>
                  {layoutOption === 'custom' && (
                    <div className="w-3 h-3 rounded-full bg-white" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className="text-[14px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Custom (Drag & drop)
                  </h4>
                  <p className="text-[12px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Build your own layout
                  </p>
                </div>
              </div>
            </div>

            {/* Option 4: Reference existing report */}
            <div
              onClick={() => {
                setLayoutOption('reference_existing');
                setShowSubView(false);
              }}
              className={`bg-white border-2 rounded-xl p-4 cursor-pointer transition-all ${
                layoutOption === 'reference_existing'
                  ? 'border-blue-500 ring-2 ring-blue-100 shadow-md bg-blue-50/30'
                  : 'border-[#E5E7EB] hover:border-blue-300 hover:shadow-sm'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Radio Button */}
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                  layoutOption === 'reference_existing'
                    ? 'border-blue-500 bg-blue-500'
                    : 'border-gray-400 bg-white'
                }`}>
                  {layoutOption === 'reference_existing' && (
                    <div className="w-3 h-3 rounded-full bg-white" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className="text-[14px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Reference an existing report
                  </h4>
                  <p className="text-[12px] text-[#6B7280] mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Use another report as a visual or layout reference
                  </p>

                  {/* Conditional Input Panel */}
                  {layoutOption === 'reference_existing' && (
                    <div className="mt-3 space-y-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={referenceReportUrl}
                          onChange={(e) => setReferenceReportUrl(e.target.value)}
                          placeholder="Paste link to existing report"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          style={{ fontFamily: 'Inter, sans-serif' }}
                        />
                        <button
                          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-lg text-[12px] font-medium text-gray-700 transition-colors whitespace-nowrap"
                          style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                          Use as layout reference
                        </button>
                      </div>
                      <p className="text-[11px] text-[#9CA3AF]" style={{ fontFamily: 'Inter, sans-serif' }}>
                        The report will be used as a visual reference only. Data and metrics are not reused.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Template Selection Sub-View */}
        {showSubView && layoutOption === 'template' && (
          <div className="bg-white border border-[#E5E7EB] rounded-lg p-5">
            <div className="mb-4 flex items-center justify-between">
              <h4 className="text-[13px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                Choose a template
              </h4>
              <button
                onClick={() => {
                  setShowSubView(false);
                  setLayoutOption('keep_current');
                  setSelectedTemplate(null);
                }}
                className="text-[11px] text-[#6B7280] hover:text-[#111827] underline"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                Back
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { id: 'kpi_summary', label: 'KPI Summary', desc: 'Key metrics at a glance' },
                { id: 'trend_over_time', label: 'Trend over time', desc: 'Time-based analysis' },
                { id: 'comparison', label: 'Comparison by category', desc: 'Side-by-side comparison' },
                { id: 'table_first', label: 'Table-first view', desc: 'Detailed data table' },
              ].map((template) => (
                <button
                  key={template.id}
                  onClick={() => setSelectedTemplate(template.id)}
                  className={`group p-4 bg-white border-2 rounded-lg hover:shadow-sm transition-all text-left ${
                    selectedTemplate === template.id
                      ? 'border-blue-500 ring-2 ring-blue-100'
                      : 'border-[#E5E7EB] hover:border-[#111827]'
                  }`}
                >
                  {/* Template wireframe preview */}
                  <div className="mb-3">
                    <TemplatePreview templateId={template.id} />
                  </div>
                  <h5 className="text-[12px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {template.label}
                  </h5>
                  <p className="text-[10px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {template.desc}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Custom Layout Builder Sub-View */}
        {showSubView && layoutOption === 'custom' && (
          <div className="bg-white border border-[#E5E7EB] rounded-lg p-5">
            <div className="mb-4 flex items-center justify-between">
              <h4 className="text-[13px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                Build your layout
              </h4>
              <button
                onClick={() => {
                  setShowSubView(false);
                  setLayoutOption('keep_current');
                  setCustomLayoutComponents([]);
                }}
                className="text-[11px] text-[#6B7280] hover:text-[#111827] underline"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                Back
              </button>
            </div>

            <LayoutBuilder
              onLayoutChange={(components) => setCustomLayoutComponents(components)}
              initialComponents={customLayoutComponents}
            />
          </div>
        )}

        {/* Optional Visual Preferences */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <h4 className="text-[12px] font-semibold text-[#111827] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
            Visual Preferences (Optional)
          </h4>
          
          {/* Include summary view */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id={`${msgId}-summary`}
              checked={includeSummary}
              onChange={(e) => setIncludeSummary(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-2 focus:ring-blue-500 cursor-pointer"
            />
            <label htmlFor={`${msgId}-summary`} className="text-[13px] text-[#111827] cursor-pointer" style={{ fontFamily: 'Inter, sans-serif' }}>
              Include summary view
            </label>
          </div>

          {/* Preserve filters */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id={`${msgId}-filters`}
              checked={preserveFilters}
              onChange={(e) => setPreserveFilters(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-2 focus:ring-blue-500 cursor-pointer"
            />
            <label htmlFor={`${msgId}-filters`} className="text-[13px] text-[#111827] cursor-pointer" style={{ fontFamily: 'Inter, sans-serif' }}>
              Preserve filters from source report
            </label>
          </div>

          {/* Use standard theme */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id={`${msgId}-theme`}
              checked={useStandardTheme}
              onChange={(e) => setUseStandardTheme(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-2 focus:ring-blue-500 cursor-pointer"
            />
            <label htmlFor={`${msgId}-theme`} className="text-[13px] text-[#111827] cursor-pointer" style={{ fontFamily: 'Inter, sans-serif' }}>
              Use standard Report Hub color theme
            </label>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-col gap-3">
          <button
            onClick={handleContinue}
            className="px-6 py-2.5 rounded-lg text-[13px] font-medium transition-all shadow-sm bg-[#111827] hover:bg-[#0F172A] text-white cursor-pointer"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

// Migration Execution Component (Step 6)
interface MigrationExecutionProps {
  msgId: string;
  sourcePlatform: string;
  destinationPlatform: string;
  reportName: string;
  visualHandling: string;
  onComplete?: () => void;
}

function MigrationExecutionUI({ msgId, sourcePlatform, destinationPlatform, reportName, visualHandling, onComplete }: MigrationExecutionProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [currentStep, setCurrentStep] = useState<number | null>(null);

  const platformNames: Record<string, string> = {
    tableau: 'Tableau',
    powerbi: 'Power BI',
    qlik: 'Qlik',
    looker: 'Looker',
    bifabric: 'Report Hub'
  };

  const migrationSteps = [
    { id: 1, label: 'Preparing migration' },
    { id: 2, label: 'Extracting report structure' },
    { id: 3, label: 'Migrating report to Report Hub' },
    { id: 4, label: 'Finalizing report' }
  ];

  const handleRunMigration = () => {
    setIsRunning(true);
    setCompletedSteps([]);
    setCurrentStep(1);

    // Simulate step progression
    setTimeout(() => {
      setCompletedSteps([1]);
      setCurrentStep(2);
    }, 1500);

    setTimeout(() => {
      setCompletedSteps([1, 2]);
      setCurrentStep(3);
    }, 3000);

    setTimeout(() => {
      setCompletedSteps([1, 2, 3]);
      setCurrentStep(4);
    }, 4500);

    setTimeout(() => {
      setCompletedSteps([1, 2, 3, 4]);
      setCurrentStep(null);
      // Migration complete - trigger callback
      if (onComplete) {
        onComplete();
      }
    }, 6000);
  };

  const getStepStatus = (stepId: number) => {
    if (completedSteps.includes(stepId)) return 'completed';
    if (currentStep === stepId) return 'in-progress';
    return 'pending';
  };

  const progressPercentage = isRunning ? Math.min((completedSteps.length / migrationSteps.length) * 100 + 15, 100) : 0;

  if (!isRunning) {
    // Pre-execution state
    return (
      <div className="mb-6">
        {/* Assistant Message */}
        <div className="bg-gray-50 px-4 py-3 rounded-xl mb-4 max-w-[80%]" style={{ fontFamily: 'Inter, sans-serif' }}>
          <div className="text-[13px] text-[#111827] font-semibold mb-2">
            Ready to run the migration.
          </div>
          <div className="text-[13px] text-[#111827]">
            This will migrate the selected report into Report Hub. The process runs in the background and does not disrupt existing users.
          </div>
        </div>

        {/* Migration Summary */}
        <div className="space-y-4 max-w-[90%]">
          <h3 className="text-[14px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
            MIGRATION SUMMARY
          </h3>

          {/* Summary Card */}
          <div className="bg-white border-2 border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[13px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                Source platform:
              </span>
              <span className="text-[13px] text-[#111827] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                {platformNames[sourcePlatform] || sourcePlatform}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-[13px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                Report:
              </span>
              <span className="text-[13px] text-[#111827] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                {reportName}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-[13px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                Destination:
              </span>
              <span className="text-[13px] text-[#111827] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                {platformNames[destinationPlatform] || destinationPlatform}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-[13px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                Visual handling:
              </span>
              <span className="text-[13px] text-[#111827] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                {visualHandling}
              </span>
            </div>
          </div>

          {/* Run Migration Button */}
          <div className="flex flex-col gap-3 pt-2">
            <button
              onClick={handleRunMigration}
              className="px-6 py-2.5 rounded-lg text-[13px] font-medium transition-all shadow-sm bg-[#111827] hover:bg-[#0F172A] text-white cursor-pointer"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Run migration
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Migration in progress state
  return (
    <div className="mb-6">
      {/* Status Message */}
      <div className="bg-gray-50 px-4 py-3 rounded-xl mb-4 max-w-[80%]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="text-[13px] text-[#111827] font-semibold mb-2">
          Migration in progress…
        </div>
        <div className="text-[13px] text-[#111827]">
          The report is being migrated. You can track progress below.
        </div>
      </div>

      {/* Progress Tracker */}
      <div className="space-y-4 max-w-[90%]">
        {/* Progress Bar */}
        <div className="bg-white border-2 border-gray-200 rounded-xl p-5">
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-medium text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                Progress
              </span>
              <span className="text-[12px] font-medium text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                {Math.round(progressPercentage)}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>

          {/* Migration Steps */}
          <div className="space-y-4 mt-6">
            {migrationSteps.map((step) => {
              const status = getStepStatus(step.id);
              return (
                <div key={step.id} className="flex items-start gap-3">
                  {/* Step Icon */}
                  <div className="flex-shrink-0 mt-0.5">
                    {status === 'completed' && (
                      <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                    {status === 'in-progress' && (
                      <div className="w-6 h-6 rounded-full border-2 border-blue-500 flex items-center justify-center bg-white">
                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                      </div>
                    )}
                    {status === 'pending' && (
                      <div className="w-6 h-6 rounded-full border-2 border-gray-300 bg-white" />
                    )}
                  </div>

                  {/* Step Label */}
                  <div className="flex-1 min-w-0">
                    <div className={`text-[13px] font-medium ${
                      status === 'completed' ? 'text-[#111827]' : 
                      status === 'in-progress' ? 'text-blue-600' : 
                      'text-[#9CA3AF]'
                    }`} style={{ fontFamily: 'Inter, sans-serif' }}>
                      {step.label}
                    </div>
                    {status === 'completed' && (
                      <div className="text-[11px] text-[#6B7280] mt-0.5" style={{ fontFamily: 'Inter, sans-serif' }}>
                        Completed
                      </div>
                    )}
                    {status === 'in-progress' && (
                      <div className="text-[11px] text-blue-600 mt-0.5" style={{ fontFamily: 'Inter, sans-serif' }}>
                        In progress
                      </div>
                    )}
                    {status === 'pending' && (
                      <div className="text-[11px] text-[#9CA3AF] mt-0.5" style={{ fontFamily: 'Inter, sans-serif' }}>
                        Pending
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Reassurance Message */}
        <div className="flex items-start gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
          <svg className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-[12px] text-blue-900" style={{ fontFamily: 'Inter, sans-serif' }}>
            Existing reports remain available during migration.
          </p>
        </div>

        {/* Optional View Details Link */}
        <div className="flex justify-center pt-2">
          <button className="text-[12px] text-[#6B7280] hover:text-[#111827] underline transition-colors" style={{ fontFamily: 'Inter, sans-serif' }}>
            View details
          </button>
        </div>
      </div>
    </div>
  );
}

// Migration Completion Component (Step 7)
interface MigrationCompletionProps {
  msgId: string;
  sourcePlatform: string;
  reportName: string;
}

function MigrationCompletionUI({ msgId, sourcePlatform, reportName }: MigrationCompletionProps) {
  const navigate = useNavigate();

  const platformNames: Record<string, string> = {
    tableau: 'Tableau',
    powerbi: 'Power BI',
    qlik: 'Qlik',
    looker: 'Looker',
    bifabric: 'Report Hub'
  };

  return (
    <div className="mb-6">
      {/* Success Message */}
      <div className="bg-green-50 px-4 py-3 rounded-xl mb-4 max-w-[80%] border border-green-200" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="flex items-start gap-3">
          {/* Success Icon */}
          <div className="flex-shrink-0 mt-0.5">
            <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          
          <div className="flex-1">
            <div className="text-[13px] text-green-900 font-semibold mb-2">
              Migration completed successfully.
            </div>
            <div className="text-[13px] text-green-900">
              The report has been migrated to Report Hub and is now available in the unified reports experience. No changes were required from you.
            </div>
          </div>
        </div>
      </div>

      {/* Migration Completion Summary */}
      <div className="space-y-4 max-w-[90%]">
        <h3 className="text-[14px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
          MIGRATION COMPLETE
        </h3>

        {/* Summary Card */}
        <div className="bg-white border-2 border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[13px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
              Report:
            </span>
            <span className="text-[13px] text-[#111827] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
              {reportName}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-[13px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
              Source:
            </span>
            <span className="text-[13px] text-[#111827] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
              {platformNames[sourcePlatform] || sourcePlatform}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-[13px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
              Destination:
            </span>
            <span className="text-[13px] text-[#111827] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
              Report Hub
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-[13px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
              Status:
            </span>
            <span className="text-[13px] text-green-700 font-medium flex items-center gap-1" style={{ fontFamily: 'Inter, sans-serif' }}>
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              Completed
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-[13px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
              User impact:
            </span>
            <span className="text-[13px] text-[#111827] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
              None
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3 pt-2">
          <button
            onClick={() => {
              // Navigate directly to Customer Churn report detail page
              navigate('/reports/RPT-CHURN-001');
            }}
            className="px-6 py-2.5 rounded-lg text-[13px] font-medium transition-all shadow-sm bg-[#111827] hover:bg-[#0F172A] text-white cursor-pointer"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            Open report
          </button>

          <button
            onClick={() => {
              navigate(`/reports?migrated=${encodeURIComponent(reportName)}`);
            }}
            className="px-6 py-2.5 rounded-lg text-[13px] font-medium transition-all border-2 border-gray-300 bg-white hover:bg-gray-50 text-[#111827] cursor-pointer"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            View all reports
          </button>

          <div className="flex justify-center">
            <button
              onClick={() => {
                // Reset and start another migration
                window.location.reload();
              }}
              className="text-[12px] text-[#6B7280] hover:text-[#111827] underline transition-colors"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Start another migration
            </button>
          </div>
        </div>

        {/* Governance Nudge */}
        <div className="flex items-start gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg mt-4">
          <svg className="w-4 h-4 text-gray-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-[12px] text-gray-700" style={{ fontFamily: 'Inter, sans-serif' }}>
            The original source report is still available. Once usage is confirmed, it can be archived to reduce BI platform sprawl.
          </p>
        </div>
      </div>
    </div>
  );
}

// Data Source Selection Component (Step 3A)
interface DataSourceSelectionProps {
  msgId: string;
  onContinue: (dataSource: 'vdm' | 'other') => void;
  onLearnMore: () => void;
}

function DataSourceSelectionUI({ msgId, onContinue, onLearnMore }: DataSourceSelectionProps) {
  const [selectedSource, setSelectedSource] = useState<'vdm' | 'other'>('vdm'); // Default to VDM

  return (
    <div className="mb-6">
      {/* Assistant Message */}
      <div className="bg-gray-50 px-4 py-3 rounded-xl mb-4 max-w-[80%]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="text-[13px] text-[#111827] font-semibold mb-2">
          Next, choose the data source for rebuilding this report.
        </div>
        <div className="text-[13px] text-[#111827]">
          Using governed data helps ensure consistency, reuse, and trusted definitions across Report Hub.
        </div>
      </div>

      {/* Data Source Selection */}
      <div className="space-y-4 max-w-[80%]">
        {/* Section Header */}
        <h3 className="text-[14px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
          Select data source
        </h3>

        {/* Radio Selection Group */}
        <div className="space-y-3">
          {/* Option 1: Virtual Data Marketplace (Primary - Default) */}
          <div
            onClick={() => setSelectedSource('vdm')}
            className={`bg-white border-2 rounded-xl p-4 cursor-pointer transition-all ${
              selectedSource === 'vdm'
                ? 'border-blue-500 ring-2 ring-blue-100 shadow-md bg-blue-50/30'
                : 'border-[#E5E7EB] hover:border-blue-300 hover:shadow-sm'
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Radio Button */}
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                selectedSource === 'vdm'
                  ? 'border-blue-500 bg-blue-500'
                  : 'border-gray-400 bg-white'
              }`}>
                {selectedSource === 'vdm' && (
                  <div className="w-3 h-3 rounded-full bg-white" />
                )}
              </div>
              
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-[14px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Virtual Data Marketplace (Recommended)
                  </h4>
                  {/* Badges */}
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center bg-blue-100 text-blue-700 text-[10px] font-semibold px-2 py-0.5 rounded">
                      Preferred
                    </span>
                    <span className="inline-flex items-center bg-green-100 text-green-700 text-[10px] font-semibold px-2 py-0.5 rounded">
                      Governed
                    </span>
                  </div>
                </div>
                <p className="text-[12px] text-[#6B7280] leading-relaxed mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Use certified, governed data products with approved metrics and dimensions.
                </p>
                <p className="text-[11px] text-[#9CA3AF] italic" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Best choice for most migrations.
                </p>
              </div>
            </div>
          </div>

          {/* Option 2: Other Governed Sources (Secondary) */}
          <div
            onClick={() => setSelectedSource('other')}
            className={`bg-white border-2 rounded-xl p-4 cursor-pointer transition-all ${
              selectedSource === 'other'
                ? 'border-blue-500 ring-2 ring-blue-100 shadow-md bg-blue-50/30'
                : 'border-[#E5E7EB] hover:border-blue-300 hover:shadow-sm'
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Radio Button */}
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                selectedSource === 'other'
                  ? 'border-blue-500 bg-blue-500'
                  : 'border-gray-400 bg-white'
              }`}>
                {selectedSource === 'other' && (
                  <div className="w-3 h-3 rounded-full bg-white" />
                )}
              </div>
              
              <div className="flex-1">
                <h4 className="text-[14px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Other governed sources
                </h4>
                <p className="text-[12px] text-[#6B7280] leading-relaxed mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Connect directly to approved enterprise data sources if needed.
                </p>
                {/* Expandable subtext (non-interactive for this step) */}
                <div className="text-[11px] text-[#9CA3AF] bg-gray-50 px-2 py-1.5 rounded">
                  Examples: BigQuery, Teradata, Hadoop
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* System Guidance Callout */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3" style={{ fontFamily: 'Inter, sans-serif' }}>
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-[12px] text-[#111827] leading-relaxed">
              Virtual Data Marketplace provides a semantic layer with certified metrics, shared definitions, and built-in governance.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => onContinue(selectedSource)}
            className="px-6 py-2.5 bg-[#111827] hover:bg-[#0F172A] text-white rounded-lg text-[13px] font-medium transition-colors shadow-sm self-start"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            Continue
          </button>
          
          {/* Secondary Link */}
          <button
            onClick={onLearnMore}
            className="text-[#6B7280] hover:text-[#111827] text-[13px] font-medium transition-colors underline self-start"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            Why Virtual Data Marketplace is recommended
          </button>
        </div>
      </div>
    </div>
  );
}

// Catalog Selection Component (Step 4A)
interface CatalogSelectionProps {
  msgId: string;
  onContinue: (selections: { catalogItem: string; metrics: string[]; dimensions: string[] }) => void;
  onViewLineage: () => void;
}

function CatalogSelectionUI({ msgId, onContinue, onViewLineage }: CatalogSelectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<string | null>(null);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['churn_rate']);
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>(['customer_segment', 'brand', 'geography', 'time_period']);
  const [showTrustIndicators, setShowTrustIndicators] = useState(false);

  const catalogItems = [
    {
      id: 'customer_churn_metrics',
      title: 'Customer Churn Metrics',
      badge: 'Certified',
      badgeColor: 'green',
      description: 'Approved churn definitions for customer retention and CX reporting.',
      owner: 'Customer Analytics COE',
      isPrimary: true,
    },
    {
      id: 'subscriber_profile',
      title: 'Subscriber Profile – Unified View',
      badge: 'Certified',
      badgeColor: 'green',
      description: 'Single view of subscriber attributes and segments.',
      owner: 'Data Platform Team',
      isPrimary: false,
    },
    {
      id: 'legacy_churn',
      title: 'Legacy Churn %',
      badge: 'Deprecated',
      badgeColor: 'yellow',
      description: 'Replaced by Customer Churn Metrics.',
      owner: 'Legacy Analytics',
      isPrimary: false,
      isDeprecated: true,
    },
  ];

  const availableFilters = ['Domain', 'Certification', 'Data freshness'];

  const toggleFilter = (filter: string) => {
    setSelectedFilters(prev =>
      prev.includes(filter) ? prev.filter(f => f !== filter) : [...prev, filter]
    );
  };

  const toggleMetric = (metricId: string) => {
    setSelectedMetrics(prev =>
      prev.includes(metricId) ? prev.filter(m => m !== metricId) : [...prev, metricId]
    );
  };

  const toggleDimension = (dimensionId: string) => {
    setSelectedDimensions(prev =>
      prev.includes(dimensionId) ? prev.filter(d => d !== dimensionId) : [...prev, dimensionId]
    );
  };

  return (
    <div className="mb-6">
      {/* Assistant Message */}
      <div className="bg-gray-50 px-4 py-3 rounded-xl mb-4 max-w-[80%]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="text-[13px] text-[#111827] font-semibold mb-2">
          Browse the catalog to select governed data.
        </div>
        <div className="text-[13px] text-[#111827]">
          Choose certified metrics and dimensions so this report uses approved definitions.
        </div>
      </div>

      {/* Catalog Browser Panel */}
      <div className="bg-white border-2 border-[#E5E7EB] rounded-xl p-6 mb-4 max-w-[90%]" style={{ fontFamily: 'Inter, sans-serif' }}>
        {/* Search Input */}
        <div className="mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search metrics, dimensions, or data products"
            className="w-full px-4 py-2.5 border border-[#E5E7EB] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            style={{ fontFamily: 'Inter, sans-serif' }}
          />
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[12px] text-[#6B7280] font-medium">Filters:</span>
          <div className="flex gap-2">
            {availableFilters.map((filter) => (
              <button
                key={filter}
                onClick={() => toggleFilter(filter)}
                className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all ${
                  selectedFilters.includes(filter)
                    ? 'bg-blue-100 text-blue-700 border border-blue-300'
                    : 'bg-gray-100 text-gray-600 border border-gray-300 hover:bg-gray-200'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        {/* Catalog Items */}
        <div className="space-y-3">
          {catalogItems.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedCatalogItem(item.id)}
              className={`bg-white border-2 rounded-xl p-4 cursor-pointer transition-all ${
                selectedCatalogItem === item.id
                  ? 'border-blue-200 bg-blue-50/20 hover:border-blue-300 hover:shadow-sm'
                  : 'border-[#E5E7EB] hover:border-blue-300 hover:shadow-sm'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-[14px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {item.title}
                    </h4>
                    <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded ${
                      item.badgeColor === 'green'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {item.badge}
                    </span>
                  </div>
                  <p className="text-[12px] text-[#6B7280] leading-relaxed mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {item.description}
                  </p>
                  <p className="text-[11px] text-[#9CA3AF]" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Owner: {item.owner}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Action Controls */}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => {
              if (selectedCatalogItem) {
                onContinue({
                  catalogItem: selectedCatalogItem,
                  metrics: selectedMetrics,
                  dimensions: selectedDimensions
                });
              }
            }}
            disabled={!selectedCatalogItem}
            className={`px-6 py-2.5 rounded-lg text-[13px] font-medium transition-all shadow-sm ${
              selectedCatalogItem 
                ? 'bg-[#111827] hover:bg-[#0F172A] text-white cursor-pointer' 
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            Continue
          </button>
          
          {/* Secondary Link */}
          <button
            onClick={onViewLineage}
            className="text-[#6B7280] hover:text-[#111827] text-[13px] font-medium transition-colors underline self-start"
            style={{ fontFamily: 'Inter, sans-serif' }}>
            View metric lineage
          </button>
        </div>
      </div>
    </div>
  );
}

// Execution Routing Component (Step 6A)
interface ExecutionRoutingProps {
  msgId: string;
  decision: 'reuse' | 'enhance' | 'new';
  metrics: string[];
  dimensions: string[];
  onContinue: () => void;
  onLearnRouting: () => void;
}

function ExecutionRoutingUI({ msgId, decision, metrics, dimensions, onContinue, onLearnRouting }: ExecutionRoutingProps) {
  return (
    <div className="mb-6">
      <div className="bg-gray-50 px-4 py-3 rounded-xl mb-4 max-w-[80%]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="text-[13px] text-[#111827] font-semibold mb-2">
          Here's how this report will be generated.
        </div>
        <div className="text-[13px] text-[#111827]">
          Report Hub automatically routes reports to the most cost-effective execution engine.
        </div>
      </div>
      <button
        onClick={onContinue}
        className="px-6 py-2.5 rounded-lg text-[13px] font-medium bg-[#111827] text-white"
        style={{ fontFamily: 'Inter, sans-serif' }}
      >
        Continue
      </button>
    </div>
  );
}

// Report Reuse Detection Component (Step 5A)
interface ReportReuseDetectionProps {
  msgId: string;
  onContinue: (decision: 'reuse' | 'enhance' | 'new') => void;
  onViewComparison: () => void;
}

function ReportReuseDetectionUI({ msgId, onContinue, onViewComparison }: ReportReuseDetectionProps) {
  const [selectedDecision, setSelectedDecision] = useState<'reuse' | 'enhance' | 'new' | null>(null);

  const similarReports = [
    {
      id: 'report-1',
      title: 'Customer Churn – Executive Overview',
      status: 'Active',
      statusColor: 'green',
      backend: 'Report Hub (Open-source)',
      usage: 'Used by 42 users • 1,200 views/month',
      owner: 'Customer Analytics COE',
      lastUpdated: '5 days ago',
      isPrimary: true,
    },
    {
      id: 'report-2',
      title: 'Monthly Churn Trends',
      status: 'Low usage',
      statusColor: 'yellow',
      backend: 'Qlik',
      usage: 'Used by 8 users • 120 views/month',
      owner: 'Regional Analytics Team',
      lastUpdated: '18 days ago',
      isPrimary: false,
    },
  ];

  return (
    <div className="mb-6">
      {/* Assistant Message */}
      <div className="bg-gray-50 px-4 py-3 rounded-xl mb-4 max-w-[80%]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="text-[13px] text-[#111827] font-semibold mb-2">
          I'm checking for similar reports.
        </div>
        <div className="text-[13px] text-[#111827]">
          To reduce duplication and licensing cost, Report Hub looks for existing reports that use the same governed metrics and dimensions.
        </div>
      </div>

      {/* Similar Reports Results Panel */}
      <div className="bg-white border-2 border-[#E5E7EB] rounded-xl p-5 mb-4 max-w-[90%]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <h3 className="text-[14px] font-semibold text-[#111827] mb-4">
          Similar reports detected
        </h3>

        {/* Report Cards */}
        <div className="space-y-3 mb-5">
          {similarReports.map((report) => (
            <div
              key={report.id}
              className={`border-2 rounded-xl p-4 ${
                report.isPrimary
                  ? 'border-blue-200 bg-blue-50/20'
                  : report.statusColor === 'yellow'
                  ? 'border-yellow-200 bg-yellow-50/20'
                  : 'border-[#E5E7EB]'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-[14px] font-semibold text-[#111827]">
                      {report.title}
                    </h4>
                    <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded ${
                      report.statusColor === 'green'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {report.status}
                    </span>
                  </div>
                  
                  <div className="space-y-1 text-[12px]">
                    <div className="flex items-center gap-2">
                      <span className="text-[#6B7280] font-medium min-w-[110px]">Backend execution:</span>
                      <span className="text-[#111827]">{report.backend}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[#6B7280] font-medium min-w-[110px]">Usage:</span>
                      <span className="text-[#111827]">{report.usage}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[#6B7280] font-medium min-w-[110px]">Owner:</span>
                      <span className="text-[#111827]">{report.owner}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[#6B7280] font-medium min-w-[110px]">Last updated:</span>
                      <span className="text-[#111827]">{report.lastUpdated}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Decision Section */}
        <div className="border-t-2 border-[#E5E7EB] pt-4">
          <h4 className="text-[13px] font-semibold text-[#111827] mb-3">
            What would you like to do?
          </h4>

          {/* Radio Selection Group */}
          <div className="space-y-3">
            {/* Option 1: Reuse */}
            <label
              className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                selectedDecision === 'reuse'
                  ? 'border-blue-500 bg-blue-50/30 ring-2 ring-blue-100'
                  : 'border-[#E5E7EB] hover:border-blue-300 hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                name="reuse-decision"
                value="reuse"
                checked={selectedDecision === 'reuse'}
                onChange={() => setSelectedDecision('reuse')}
                className="w-5 h-5 mt-0.5 accent-blue-600 cursor-pointer"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[13px] font-semibold text-[#111827]">Reuse an existing report</span>
                  <span className="text-[10px] font-semibold text-blue-600 bg-blue-100 px-2 py-0.5 rounded">
                    Recommended
                  </span>
                </div>
                <p className="text-[12px] text-[#6B7280] mb-1">
                  Use an existing report as-is to avoid duplication.
                </p>
                <p className="text-[11px] text-[#9CA3AF] italic">
                  Best for consistency and cost control.
                </p>
              </div>
            </label>

            {/* Option 2: Enhance */}
            <label
              className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                selectedDecision === 'enhance'
                  ? 'border-blue-500 bg-blue-50/30 ring-2 ring-blue-100'
                  : 'border-[#E5E7EB] hover:border-blue-300 hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                name="reuse-decision"
                value="enhance"
                checked={selectedDecision === 'enhance'}
                onChange={() => setSelectedDecision('enhance')}
                className="w-5 h-5 mt-0.5 accent-blue-600 cursor-pointer"
              />
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-[#111827] mb-1">
                  Enhance an existing report
                </div>
                <p className="text-[12px] text-[#6B7280] mb-1">
                  Extend an existing report with additional metrics or filters.
                </p>
                <p className="text-[11px] text-[#9CA3AF] italic">
                  Recommended when only small changes are needed.
                </p>
              </div>
            </label>

            {/* Option 3: New Version */}
            <label
              className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                selectedDecision === 'new'
                  ? 'border-blue-500 bg-blue-50/30 ring-2 ring-blue-100'
                  : 'border-[#E5E7EB] hover:border-blue-300 hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                name="reuse-decision"
                value="new"
                checked={selectedDecision === 'new'}
                onChange={() => setSelectedDecision('new')}
                className="w-5 h-5 mt-0.5 accent-blue-600 cursor-pointer"
              />
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-[#111827] mb-1">
                  Proceed with a new version
                </div>
                <p className="text-[12px] text-[#6B7280] mb-1">
                  Create a new report despite similarities.
                </p>
                <p className="text-[11px] text-yellow-600 italic">
                  May increase report sprawl and BI cost.
                </p>
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* Action Controls */}
      <div className="flex flex-col gap-3 max-w-[80%]">
        <button
          onClick={() => selectedDecision && onContinue(selectedDecision)}
          disabled={!selectedDecision}
          className={`px-6 py-2.5 rounded-lg text-[13px] font-medium transition-all shadow-sm self-start ${
            selectedDecision
              ? 'bg-[#111827] hover:bg-[#0F172A] text-white cursor-pointer'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          Continue
        </button>
        
        {/* Secondary Link */}
        <button
          onClick={onViewComparison}
          className="text-[#6B7280] hover:text-[#111827] text-[13px] font-medium transition-colors underline self-start"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          View detailed comparison
        </button>
      </div>
    </div>
  );
}

// Migration Plan & Validation Component (Step 7A)
interface MigrationPlanValidationProps {
  msgId: string;
  decision: 'reuse' | 'enhance' | 'new';
  sourceSystem: string;
  metrics: string[];
  dimensions: string[];
  onStartMigration: () => void;
  onReviewDetails: () => void;
}

function MigrationPlanValidationUI({ 
  msgId, 
  decision, 
  sourceSystem, 
  metrics, 
  dimensions, 
  onStartMigration, 
  onReviewDetails 
}: MigrationPlanValidationProps) {
  const decisionLabels = {
    reuse: 'Reuse existing report',
    enhance: 'Enhance existing report',
    new: 'New version',
  };

  const validationChecks = [
    {
      name: 'Schema compatibility',
      status: 'passed',
      subtext: 'All fields match expected types',
    },
    {
      name: 'Metric parity with source report',
      status: 'passed',
      subtext: 'Calculations validated',
    },
    {
      name: 'Data freshness & availability',
      status: 'passed',
      subtext: 'Source data current and accessible',
    },
    {
      name: 'Deprecated element usage',
      status: 'passed',
      subtext: 'None detected',
    },
    {
      name: 'Downstream impact',
      status: 'passed',
      subtext: 'No breaking dependencies',
    },
  ];

  const allChecksPassed = validationChecks.every(check => check.status === 'passed');

  return (
    <div className="mb-6">
      {/* Assistant Message */}
      <div className="bg-gray-50 px-4 py-3 rounded-xl mb-4 max-w-[80%]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="text-[13px] text-[#111827] font-semibold mb-2">
          Here&apos;s the migration plan and readiness check.
        </div>
        <div className="text-[13px] text-[#111827]">
          Before executing the migration, Report Hub validates compatibility, highlights risks, and confirms readiness.
        </div>
      </div>

      {/* Migration Plan Summary */}
      <div className="bg-white border-2 border-gray-300 rounded-xl p-5 mb-4 max-w-[90%]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <h3 className="text-[14px] font-semibold text-[#111827] mb-4">
          Migration plan
        </h3>

        <div className="space-y-2.5">
          <div className="flex items-start gap-2">
            <span className="text-[12px] font-medium text-[#6B7280] min-w-[150px]">Source system:</span>
            <span className="text-[12px] text-[#111827]">{sourceSystem}</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[12px] font-medium text-[#6B7280] min-w-[150px]">Destination:</span>
            <span className="text-[12px] text-[#111827]">Report Hub (Open-source execution)</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[12px] font-medium text-[#6B7280] min-w-[150px]">Action:</span>
            <span className="text-[12px] text-[#111827]">{decisionLabels[decision]}</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[12px] font-medium text-[#6B7280] min-w-[150px]">Governed data source:</span>
            <span className="text-[12px] text-[#111827]">Virtual Data Marketplace</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[12px] font-medium text-[#6B7280] min-w-[150px]">Metrics:</span>
            <span className="text-[12px] text-[#111827]">{metrics.join(', ')}</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[12px] font-medium text-[#6B7280] min-w-[150px]">Dimensions:</span>
            <span className="text-[12px] text-[#111827]">{dimensions.join(', ')}</span>
          </div>
        </div>
      </div>

      {/* Validation Checks */}
      <div className="bg-white border-2 border-gray-300 rounded-xl p-5 mb-4 max-w-[90%]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <h3 className="text-[14px] font-semibold text-[#111827] mb-4">
          Validation checks
        </h3>

        <div className="space-y-3">
          {validationChecks.map((check, idx) => (
            <div key={idx} className="flex items-start gap-3 pb-3 border-b border-gray-200 last:border-b-0 last:pb-0">
              <div className="mt-0.5">
                {check.status === 'passed' && (
                  <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-green-600 text-[12px] font-bold">✓</span>
                  </div>
                )}
              </div>
              <div className="flex-1">
                <div className="text-[13px] font-medium text-[#111827] mb-0.5">
                  {check.name}
                </div>
                <div className="text-[11px] text-[#6B7280]">
                  {check.subtext}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Risk & Impact Summary */}
      <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-5 mb-4 max-w-[90%]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <h3 className="text-[14px] font-semibold text-[#111827] mb-4">
          Impact summary
        </h3>

        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <span className="text-[12px] font-medium text-[#6B7280] min-w-[150px]">Estimated downtime:</span>
            <span className="text-[12px] text-[#111827]">None</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[12px] font-medium text-[#6B7280] min-w-[150px]">Expected user impact:</span>
            <span className="text-[12px] text-[#111827]">Minimal</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[12px] font-medium text-[#6B7280] min-w-[150px]">Reports affected:</span>
            <span className="text-[12px] text-[#111827]">1 (this report only)</span>
          </div>
        </div>
      </div>

      {/* Action Controls */}
      <div className="flex flex-col gap-3 max-w-[80%]">
        <button
          onClick={onStartMigration}
          disabled={!allChecksPassed}
          className={`px-6 py-2.5 rounded-lg text-[13px] font-medium transition-all shadow-sm self-start ${
            allChecksPassed
              ? 'bg-[#111827] hover:bg-[#0F172A] text-white cursor-pointer'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          Start migration
        </button>
        
        {/* Secondary Link */}
        <button
          onClick={onReviewDetails}
          className="text-[#6B7280] hover:text-[#111827] text-[13px] font-medium transition-colors underline self-start"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          Review details
        </button>
      </div>
    </div>
  );
}

// Final Validation & Readiness Component (Step 8A)
interface FinalValidationReadinessProps {
  msgId: string;
  onRunMigration: () => void;
  onScheduleLater: () => void;
}

function FinalValidationReadinessUI({ 
  msgId, 
  onRunMigration, 
  onScheduleLater 
}: FinalValidationReadinessProps) {
  const finalChecks = [
    { name: 'Data access verified', status: 'passed' },
    { name: 'Metric definitions locked', status: 'passed' },
    { name: 'Semantic mappings resolved', status: 'passed' },
    { name: 'Execution engine available', status: 'passed' },
    { name: 'Rollback path prepared', status: 'passed' },
  ];

  const allChecksPassed = finalChecks.every(check => check.status === 'passed');

  return (
    <div className="mb-6">
      {/* Assistant Message */}
      <div className="bg-gray-50 px-4 py-3 rounded-xl mb-4 max-w-[80%]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="text-[13px] text-[#111827] font-semibold mb-2">
          Final validation complete. This migration is ready to run.
        </div>
        <div className="text-[13px] text-[#111827]">
          All required checks have passed. You can proceed knowing this migration will not disrupt existing users or reports.
        </div>
      </div>

      {/* Readiness Status Panel */}
      <div className="bg-white border-2 border-gray-300 rounded-xl p-5 mb-4 max-w-[90%]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <h3 className="text-[14px] font-semibold text-[#111827] mb-4">
          Readiness status
        </h3>

        {/* Overall Status */}
        <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4 mb-4 flex items-center gap-3">
          <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-white text-[14px] font-bold">✓</span>
          </div>
          <div className="text-[14px] font-semibold text-green-700">
            Ready for migration
          </div>
        </div>

        {/* Final Validation Checklist */}
        <div className="space-y-2.5">
          {finalChecks.map((check, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-green-600 text-[12px] font-bold">✓</span>
              </div>
              <div className="text-[13px] text-[#111827]">
                {check.name}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* What Happens Next */}
      <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-5 mb-4 max-w-[90%]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <h3 className="text-[14px] font-semibold text-[#111827] mb-3">
          What happens next
        </h3>

        <ul className="space-y-2 text-[13px] text-[#111827]">
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>Migration will run in the background</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>No downtime expected</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>Existing Tableau report remains available until migration completes</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>Users will be automatically routed through Report Hub</span>
          </li>
        </ul>
      </div>

      {/* Action Controls */}
      <div className="flex flex-col gap-3 max-w-[80%]">
        <button
          onClick={onRunMigration}
          disabled={!allChecksPassed}
          className={`px-6 py-2.5 rounded-lg text-[13px] font-medium transition-all shadow-sm self-start ${
            allChecksPassed
              ? 'bg-[#111827] hover:bg-[#0F172A] text-white cursor-pointer'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          Run migration now
        </button>
        
        {/* Secondary Link */}
        <button
          onClick={onScheduleLater}
          className="text-[#6B7280] hover:text-[#111827] text-[13px] font-medium transition-colors underline self-start"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          Schedule for later
        </button>
      </div>
    </div>
  );
}

// Migration Execution & Progress Component (Step 9A)
interface MigrationExecutionProgressProps {
  msgId: string;
  onViewLogs: () => void;
  onCancelMigration: () => void;
  onMigrationComplete: () => void;
}

function MigrationExecutionProgressUI({ 
  msgId, 
  onViewLogs, 
  onCancelMigration,
  onMigrationComplete 
}: MigrationExecutionProgressProps) {
  // Track if migration has already been completed to prevent duplicate calls
  const hasCompletedRef = React.useRef(false);
  
  // Simulate migration completion after 5 seconds
  React.useEffect(() => {
    const completionTimer = setTimeout(() => {
      // Only trigger completion once
      if (!hasCompletedRef.current) {
        hasCompletedRef.current = true;
        onMigrationComplete();
      }
    }, 5000); // 5 seconds to show progress UI

    return () => clearTimeout(completionTimer);
  }, [onMigrationComplete]);
  const migrationSteps = [
    { 
      name: 'Extracting report logic from Tableau', 
      status: 'completed' 
    },
    { 
      name: 'Mapping metrics and dimensions to governed definitions', 
      status: 'completed' 
    },
    { 
      name: 'Generating report using Report Hub execution engine', 
      status: 'in_progress' 
    },
    { 
      name: 'Validating output and parity', 
      status: 'pending' 
    },
    { 
      name: 'Publishing report to Report Hub', 
      status: 'pending' 
    },
  ];

  const completedSteps = migrationSteps.filter(s => s.status === 'completed').length;
  const totalSteps = migrationSteps.length;
  const progressPercentage = Math.round((completedSteps / totalSteps) * 100);

  return (
    <div className="mb-6">
      {/* Assistant Message */}
      <div className="bg-gray-50 px-4 py-3 rounded-xl mb-4 max-w-[80%]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="text-[13px] text-[#111827] font-semibold mb-2">
          Migration in progress.
        </div>
        <div className="text-[13px] text-[#111827]">
          The report is being migrated in the background. You can monitor progress here. No user disruption is expected.
        </div>
      </div>

      {/* Migration Progress Panel */}
      <div className="bg-white border-2 border-gray-300 rounded-xl p-5 mb-4 max-w-[90%]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <h3 className="text-[14px] font-semibold text-[#111827] mb-4">
          Migration progress
        </h3>

        {/* Overall Progress Bar */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] font-medium text-[#111827]">Overall progress</span>
            <span className="text-[13px] font-medium text-[#111827]">{progressPercentage}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${progressPercentage}%` }}
            ></div>
          </div>
        </div>

        {/* Step Tracker */}
        <div className="space-y-4">
          {migrationSteps.map((step, idx) => (
            <div key={idx} className="flex items-start gap-3">
              {/* Status Icon */}
              <div className="flex-shrink-0 mt-0.5">
                {step.status === 'completed' && (
                  <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-green-600 text-[12px] font-bold">✓</span>
                  </div>
                )}
                {step.status === 'in_progress' && (
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                    <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
                {step.status === 'pending' && (
                  <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                  </div>
                )}
              </div>

              {/* Step Name */}
              <div className={`flex-1 text-[13px] ${
                step.status === 'completed' ? 'text-[#111827]' :
                step.status === 'in_progress' ? 'text-[#111827] font-medium' :
                'text-[#6B7280]'
              }`}>
                {step.name}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Safety Reassurance Callout */}
      <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 mb-4 max-w-[90%]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <p className="text-[13px] text-[#111827]">
          Existing Tableau reports remain available during migration. If an issue is detected, Report Hub can roll back safely.
        </p>
      </div>

      {/* Execution Controls */}
      <div className="flex flex-col gap-3 max-w-[80%]">
        {/* Disabled Primary Button (no action during execution) */}
        <button
          disabled
          className="px-6 py-2.5 rounded-lg text-[13px] font-medium bg-gray-300 text-gray-500 cursor-not-allowed shadow-sm self-start"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          Migration in progress...
        </button>
        
        {/* Secondary Links */}
        <div className="flex gap-4">
          <button
            onClick={onViewLogs}
            className="text-[#111827] hover:text-[#0F172A] text-[13px] font-medium transition-colors underline"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            View detailed logs
          </button>
          
          <button
            onClick={onCancelMigration}
            className="text-red-600 hover:text-red-700 text-[13px] font-medium transition-colors underline"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            Cancel migration
          </button>
        </div>
      </div>
    </div>
  );
}

// Migration Completion & Success Component (Step 10A)
interface MigrationCompletionSuccessProps {
  msgId: string;
  onViewReport: () => void;
  onMonitorUsage: () => void;
  onExportSummary: () => void;
  onStartAnother: () => void;
}

function MigrationCompletionSuccessUI({ 
  msgId, 
  onViewReport, 
  onMonitorUsage, 
  onExportSummary,
  onStartAnother 
}: MigrationCompletionSuccessProps) {
  return (
    <div className="mb-6">
      {/* Success Message with Icon */}
      <div className="bg-green-50 border-2 border-green-200 px-4 py-3 rounded-xl mb-4 max-w-[80%]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="flex items-start gap-3">
          {/* Success Checkmark Icon */}
          <div className="flex-shrink-0 mt-0.5">
            <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
              <span className="text-white text-[14px] font-bold">✓</span>
            </div>
          </div>
          
          <div className="flex-1">
            <div className="text-[13px] text-[#111827] font-semibold mb-2">
              Migration completed successfully.
            </div>
            <div className="text-[13px] text-[#111827]">
              <strong>Customer Churn Overview</strong> is now available through Report Hub. Users will access it through a single, consistent experience, regardless of the underlying execution engine.
            </div>
          </div>
        </div>
      </div>

      {/* Migration Summary Card */}
      <div className="bg-white border-2 border-gray-300 rounded-xl p-5 mb-4 max-w-[90%]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <h3 className="text-[14px] font-semibold text-[#111827] mb-4">
          Migration summary
        </h3>

        <div className="space-y-3">
          {/* Summary Rows */}
          <div className="flex items-start">
            <span className="text-[13px] text-[#6B7280] w-[180px] flex-shrink-0">Source:</span>
            <span className="text-[13px] text-[#111827] font-medium">Tableau</span>
          </div>
          
          <div className="flex items-start">
            <span className="text-[13px] text-[#6B7280] w-[180px] flex-shrink-0">Execution path:</span>
            <span className="text-[13px] text-[#111827] font-medium">Report Hub (Open-source)</span>
          </div>
          
          <div className="flex items-start">
            <span className="text-[13px] text-[#6B7280] w-[180px] flex-shrink-0">Governed data source:</span>
            <span className="text-[13px] text-[#111827] font-medium">Virtual Data Marketplace</span>
          </div>
          
          <div className="flex items-start">
            <span className="text-[13px] text-[#6B7280] w-[180px] flex-shrink-0">Metrics:</span>
            <span className="text-[13px] text-[#111827] font-medium">Customer Churn Rate</span>
          </div>
          
          <div className="flex items-start">
            <span className="text-[13px] text-[#6B7280] w-[180px] flex-shrink-0">Dimensions:</span>
            <span className="text-[13px] text-[#111827] font-medium">Customer Segment, Brand, Geography, Time Period</span>
          </div>
          
          <div className="flex items-start">
            <span className="text-[13px] text-[#6B7280] w-[180px] flex-shrink-0">Migration status:</span>
            <span className="text-[13px] text-green-600 font-semibold">Completed</span>
          </div>
          
          <div className="flex items-start">
            <span className="text-[13px] text-[#6B7280] w-[180px] flex-shrink-0">User impact:</span>
            <span className="text-[13px] text-[#111827] font-medium">None</span>
          </div>
        </div>
      </div>

      {/* Primary Next Actions */}
      <div className="mb-4 max-w-[90%]">
        <h3 className="text-[14px] font-semibold text-[#111827] mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
          What would you like to do next?
        </h3>

        <div className="flex flex-wrap gap-3">
          {/* Primary Button */}
          <button
            onClick={onViewReport}
            className="px-6 py-2.5 bg-[#111827] text-white rounded-lg hover:bg-[#1F2937] active:bg-[#0F172A] transition-colors shadow-sm text-[13px] font-medium"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            Open report
          </button>

          {/* Secondary Button */}
          <button
            onClick={onMonitorUsage}
            className="px-6 py-2.5 bg-white text-[#111827] border-2 border-gray-300 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-colors shadow-sm text-[13px] font-medium"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            Monitor usage
          </button>

          {/* Tertiary Button (text style) */}
          <button
            onClick={onExportSummary}
            className="px-6 py-2.5 text-[#111827] hover:bg-gray-100 active:bg-gray-200 rounded-lg transition-colors text-[13px] font-medium"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            Export migration summary
          </button>
        </div>
      </div>

      {/* Legacy Report Notice */}
      <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 mb-4 max-w-[90%]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="text-[13px] font-semibold text-[#111827] mb-1">
          About the legacy report
        </div>
        <p className="text-[13px] text-[#111827]">
          The original Tableau report is still available. Once usage is confirmed, it can be archived to reduce licensing cost.
        </p>
      </div>

      {/* Optional Follow-up Link */}
      <div className="max-w-[80%]">
        <button
          onClick={onStartAnother}
          className="text-[#111827] hover:text-[#0F172A] text-[13px] font-medium transition-colors underline"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          Start another migration
        </button>
      </div>
    </div>
  );
}

// Step 2B: Create New Report - Data Source Selection (VDM-First)
interface CreateNewDataSourceSelectionProps {
  msgId: string;
  onContinue: (dataSource: 'vdm' | 'other') => void;
  onLearnMore: () => void;
}

function CreateNewDataSourceSelectionUI({ 
  msgId, 
  onContinue,
  onLearnMore
}: CreateNewDataSourceSelectionProps) {
  const [selectedSource, setSelectedSource] = useState<'vdm' | 'other'>('vdm');

  return (
    <div className="mb-6">
      {/* Assistant Message */}
      <div className="bg-gray-50 px-4 py-3 rounded-xl mb-4 max-w-[80%]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="text-[13px] text-[#111827] font-semibold mb-2">
          Let's create a new report using governed data.
        </div>
        <div className="text-[13px] text-[#111827]">
          New reports in Report Hub start with certified data products, so metrics are consistent and reusable from day one.
        </div>
      </div>

      {/* Data Source Selection Section */}
      <div className="mb-4 max-w-[90%]">
        <h3 className="text-[14px] font-semibold text-[#111827] mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
          Select data source
        </h3>

        <div className="space-y-3">
          {/* OPTION 1 - VDM (Recommended, Pre-selected) */}
          <div
            onClick={() => setSelectedSource('vdm')}
            className={`bg-white border-2 rounded-xl p-4 cursor-pointer transition-all ${
              selectedSource === 'vdm'
                ? 'border-blue-500 ring-2 ring-blue-100 shadow-md'
                : 'border-[#E5E7EB] hover:border-blue-300 hover:shadow-sm'
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Radio Button */}
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                selectedSource === 'vdm'
                  ? 'border-blue-500 bg-blue-500'
                  : 'border-gray-400 bg-white'
              }`}>
                {selectedSource === 'vdm' && (
                  <div className="w-2.5 h-2.5 rounded-full bg-white" />
                )}
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-[14px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Virtual Data Marketplace (Recommended)
                  </h4>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center bg-blue-100 text-blue-700 text-[10px] font-semibold px-2 py-0.5 rounded">
                      Preferred
                    </span>
                    <span className="inline-flex items-center bg-green-100 text-green-700 text-[10px] font-semibold px-2 py-0.5 rounded">
                      Governed
                    </span>
                  </div>
                </div>
                <p className="text-[12px] text-[#6B7280] leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Browse certified data products with approved metrics and dimensions.
                </p>
              </div>
            </div>
          </div>

          {/* OPTION 2 - Other Governed Sources */}
          <div
            onClick={() => setSelectedSource('other')}
            className={`bg-white border-2 rounded-xl p-4 cursor-pointer transition-all ${
              selectedSource === 'other'
                ? 'border-blue-500 ring-2 ring-blue-100 shadow-md'
                : 'border-[#E5E7EB] hover:border-blue-300 hover:shadow-sm'
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Radio Button */}
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                selectedSource === 'other'
                  ? 'border-blue-500 bg-blue-500'
                  : 'border-gray-400 bg-white'
              }`}>
                {selectedSource === 'other' && (
                  <div className="w-2.5 h-2.5 rounded-full bg-white" />
                )}
              </div>

              <div className="flex-1">
                <h4 className="text-[14px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Other governed sources
                </h4>
                <p className="text-[12px] text-[#6B7280] leading-relaxed mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Use approved enterprise data sources if needed.
                </p>
                <p className="text-[11px] text-[#9CA3AF] italic" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Examples: BigQuery, Teradata, Hadoop
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Continue Control */}
      <div className="flex flex-col gap-3 max-w-[90%]">
        <button
          onClick={() => onContinue(selectedSource)}
          className="px-6 py-2.5 bg-[#111827] text-white rounded-lg hover:bg-[#1F2937] active:bg-[#0F172A] transition-colors shadow-sm text-[13px] font-medium w-fit"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          Continue
        </button>

        {/* Optional Secondary Link */}
        <button
          onClick={onLearnMore}
          className="text-[#111827] hover:text-[#0F172A] text-[13px] font-medium transition-colors underline text-left w-fit"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          Why Virtual Data Marketplace is recommended
        </button>
      </div>
    </div>
  );
}

// Step 3B: Create New Report - VDM Confirmation (Non-editable)
interface CreateNewVDMConfirmationProps {
  msgId: string;
  onContinue: () => void;
}

function CreateNewVDMConfirmationUI({ 
  msgId, 
  onContinue 
}: CreateNewVDMConfirmationProps) {
  return (
    <div className="mb-6">
      {/* Assistant Message */}
      <div className="bg-gray-50 px-4 py-3 rounded-xl mb-4 max-w-[80%]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="text-[13px] text-[#111827] font-semibold mb-2">
          We'll build this report using governed data.
        </div>
        <div className="text-[13px] text-[#111827]">
          New reports in Report Hub start with Virtual Data Marketplace, so metrics are certified and reusable from day one.
        </div>
      </div>

      {/* VDM Confirmation Card (Locked/Confirmed) */}
      <div className="bg-white border-2 border-green-200 rounded-xl p-5 mb-4 max-w-[90%]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="flex items-start gap-3">
          {/* Checkmark Icon */}
          <div className="flex-shrink-0 mt-0.5">
            <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-white" />
            </div>
          </div>

          <div className="flex-1">
            <h4 className="text-[14px] font-semibold text-[#111827] mb-1">
              Virtual Data Marketplace
            </h4>
            <p className="text-[12px] text-[#6B7280] mb-3">
              Confirmed data source for this report
            </p>
            
            {/* Badges */}
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center bg-green-100 text-green-700 text-[10px] font-semibold px-2 py-0.5 rounded">
                Governed
              </span>
              <span className="inline-flex items-center bg-blue-100 text-blue-700 text-[10px] font-semibold px-2 py-0.5 rounded">
                Certified Metrics
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Continue Button */}
      <button
        onClick={onContinue}
        className="px-6 py-2.5 bg-[#111827] text-white rounded-lg hover:bg-[#1F2937] active:bg-[#0F172A] transition-colors shadow-sm text-[13px] font-medium w-fit"
        style={{ fontFamily: 'Inter, sans-serif' }}
      >
        Continue
      </button>
    </div>
  );
}

// Step 5B: Create New Report - Usage Expectations
interface CreateNewUsageExpectationsProps {
  msgId: string;
  onContinue: (expectations: { audience: string; users: string; views: string }) => void;
}

function CreateNewUsageExpectationsUI({ 
  msgId, 
  onContinue 
}: CreateNewUsageExpectationsProps) {
  const [audience, setAudience] = useState<string>('Operational');
  const [users, setUsers] = useState<string>('10-50');
  const [views, setViews] = useState<string>('Medium');

  return (
    <div className="mb-6">
      {/* Assistant Message */}
      <div className="bg-gray-50 px-4 py-3 rounded-xl mb-4 max-w-[80%]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="text-[13px] text-[#111827] font-semibold mb-2">
          How will this report be used?
        </div>
        <div className="text-[13px] text-[#111827]">
          This helps Report Hub choose the most cost-effective execution path.
        </div>
      </div>

      {/* Usage Expectations Form */}
      <div className="bg-white border-2 border-[#E5E7EB] rounded-xl p-5 mb-4 max-w-[90%]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <h3 className="text-[14px] font-semibold text-[#111827] mb-4">
          Report usage details
        </h3>

        <div className="space-y-5">
          {/* Intended Audience */}
          <div>
            <label className="block text-[13px] font-medium text-[#111827] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
              Intended audience
            </label>
            <div className="space-y-2">
              {['Executive', 'Operational', 'Team'].map((option) => (
                <div
                  key={option}
                  onClick={() => setAudience(option)}
                  className={`border-2 rounded-lg p-3 cursor-pointer transition-all ${
                    audience === option
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      audience === option
                        ? 'border-blue-500 bg-blue-500'
                        : 'border-gray-400'
                    }`}>
                      {audience === option && (
                        <div className="w-2 h-2 rounded-full bg-white" />
                      )}
                    </div>
                    <span className="text-[13px] font-medium text-[#111827]">{option}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Expected Users */}
          <div>
            <label className="block text-[13px] font-medium text-[#111827] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
              Expected users
            </label>
            <div className="space-y-2">
              {['<10', '10-50', '50+'].map((option) => (
                <div
                  key={option}
                  onClick={() => setUsers(option)}
                  className={`border-2 rounded-lg p-3 cursor-pointer transition-all ${
                    users === option
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      users === option
                        ? 'border-blue-500 bg-blue-500'
                        : 'border-gray-400'
                    }`}>
                      {users === option && (
                        <div className="w-2 h-2 rounded-full bg-white" />
                      )}
                    </div>
                    <span className="text-[13px] font-medium text-[#111827]">{option}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Expected Views per Month */}
          <div>
            <label className="block text-[13px] font-medium text-[#111827] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
              Expected views per month
            </label>
            <div className="space-y-2">
              {['Low', 'Medium', 'High'].map((option) => (
                <div
                  key={option}
                  onClick={() => setViews(option)}
                  className={`border-2 rounded-lg p-3 cursor-pointer transition-all ${
                    views === option
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      views === option
                        ? 'border-blue-500 bg-blue-500'
                        : 'border-gray-400'
                    }`}>
                      {views === option && (
                        <div className="w-2 h-2 rounded-full bg-white" />
                      )}
                    </div>
                    <span className="text-[13px] font-medium text-[#111827]">{option}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Helper Text */}
        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
          <p className="text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
            This helps Report Hub choose the most cost-effective execution path.
          </p>
        </div>
      </div>

      {/* Continue Button */}
      <button
        onClick={() => onContinue({ audience, users, views })}
        className="px-6 py-2.5 bg-[#111827] text-white rounded-lg hover:bg-[#1F2937] active:bg-[#0F172A] transition-colors shadow-sm text-[13px] font-medium w-fit"
        style={{ fontFamily: 'Inter, sans-serif' }}
      >
        Continue
      </button>
    </div>
  );
}

// Step 6B: Create New Report - Execution Routing
interface CreateNewExecutionRoutingProps {
  msgId: string;
  expectations: { audience: string; users: string; views: string };
  onContinue: () => void;
  onLearnMore: () => void;
}

function CreateNewExecutionRoutingUI({ 
  msgId, 
  expectations,
  onContinue,
  onLearnMore 
}: CreateNewExecutionRoutingProps) {
  const [showEnterpriseDetails, setShowEnterpriseDetails] = useState(false);

  return (
    <div className="mb-6">
      {/* Assistant Message */}
      <div className="bg-gray-50 px-4 py-3 rounded-xl mb-4 max-w-[80%]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="text-[13px] text-[#111827] font-semibold mb-2">
          Report execution path
        </div>
        <div className="text-[13px] text-[#111827]">
          Based on your usage expectations, Report Hub will determine the best execution platform.
        </div>
      </div>

      {/* Default Execution Card */}
      <div className="bg-green-50 border-2 border-green-200 rounded-xl p-5 mb-4 max-w-[90%]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="flex items-start gap-3 mb-3">
          <div className="flex-shrink-0 mt-0.5">
            <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-white" />
            </div>
          </div>

          <div className="flex-1">
            <h4 className="text-[14px] font-semibold text-[#111827] mb-1">
              Report Hub Open-Source Engine
            </h4>
            <p className="text-[12px] text-[#6B7280] mb-3">
              Default execution path for this report
            </p>
            
            {/* Badges */}
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center bg-blue-100 text-blue-700 text-[10px] font-semibold px-2 py-0.5 rounded">
                Recommended
              </span>
              <span className="inline-flex items-center bg-green-100 text-green-700 text-[10px] font-semibold px-2 py-0.5 rounded">
                No additional BI licensing cost
              </span>
            </div>

            {/* Cost Note */}
            <div className="bg-white rounded-lg p-3 border border-green-300">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-[#111827]">
                  This report will use Report Hub's open-source engine, avoiding enterprise BI licensing fees.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Enterprise BI Section (Collapsed/Informational) */}
      <div className="bg-white border-2 border-gray-200 rounded-xl p-4 mb-4 max-w-[90%]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <button
          onClick={() => setShowEnterpriseDetails(!showEnterpriseDetails)}
          className="w-full flex items-center justify-between text-left"
        >
          <h4 className="text-[13px] font-semibold text-[#111827]">
            When enterprise BI is required
          </h4>
          <ArrowRight className={`w-4 h-4 text-gray-400 transition-transform ${showEnterpriseDetails ? 'rotate-90' : ''}`} />
        </button>

        {showEnterpriseDetails && (
          <div className="mt-4 space-y-3">
            <div className="border-l-2 border-gray-300 pl-3">
              <h5 className="text-[12px] font-semibold text-[#111827] mb-1">Qlik</h5>
              <p className="text-[11px] text-[#6B7280]">
                Used for advanced analytics and associative models
              </p>
            </div>

            <div className="border-l-2 border-gray-300 pl-3">
              <h5 className="text-[12px] font-semibold text-[#111827] mb-1">Looker</h5>
              <p className="text-[11px] text-[#6B7280]">
                Routed when specific Looker capabilities are required
              </p>
            </div>

            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-[11px] text-[#6B7280]">
                <strong>Example triggers:</strong> Advanced analytics, high concurrency, real-time dashboards
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Summary Note */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 max-w-[90%]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-[12px] text-[#111827]">
            <strong>New reports never start in Tableau.</strong> All new work uses governed data and Report Hub execution routing.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 max-w-[90%]">
        <button
          onClick={onContinue}
          className="px-6 py-2.5 bg-[#111827] text-white rounded-lg hover:bg-[#1F2937] active:bg-[#0F172A] transition-colors shadow-sm text-[13px] font-medium w-fit"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          Continue
        </button>

        <button
          onClick={onLearnMore}
          className="text-[#111827] hover:text-[#0F172A] text-[13px] font-medium transition-colors underline text-left w-fit"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          Learn more about execution routing
        </button>
      </div>
    </div>
  );
}

interface Message {
  id: string;
  type: 'system' | 'user' | 'assistant';
  content: string;
  renderType?: 'text' | 'dataset_list' | 'migration_plan' | 'validation_results' | 'progress_log' | 'completion_summary' | 'suggested_pills' | 'migration_initiated' | 'migration_intent_selection' | 'migration_source_platform_selection' | 'migration_report_selection' | 'migration_destination_platform_selection' | 'migration_visual_configuration' | 'report_preview' | 'platform_preview' | 'migration_execution' | 'migration_completion' | 'migration_source_destination' | 'migration_data_source_selection' | 'migration_catalog_selection' | 'migration_report_reuse_detection' | 'migration_execution_routing' | 'migration_plan_validation' | 'migration_final_readiness' | 'migration_execution_progress' | 'migration_completion_success' | 'create_new_data_source_selection' | 'create_new_vdm_confirmation' | 'create_new_usage_expectations' | 'create_new_execution_routing';
  data?: any;
  timestamp: Date;
}

export function TalkMigrationPage() {
  const navigate = useNavigate();
  const { datasetId, step } = useParams();
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Migration sessions (conversation history)
  const [migrationSessions, setMigrationSessions] = useState<MigrationSession[]>([
    {
      session_id: 'mig-session-1',
      title: 'Migrate Customer Churn Overview',
      selected_dataset_id: 'churn-vdm-001',
      messages: [],
      status: 'planned',
      last_updated: new Date(Date.now() - 0), // 0 minutes ago
    },
  ]);

  const [activeSessionId, setActiveSessionId] = useState<string>('mig-session-1');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [flowState, setFlowState] = useState<'landing' | 'active'>('active');
  const [selectedReport, setSelectedReport] = useState<any>(null);

  // Right panel state - Customer Churn Overview
  const [selectedDataset, setSelectedDataset] = useState<any>({
    dataset_id: 'churn-vdm-001',
    dataset_name: 'Customer Churn Overview',
    domain: 'Customer',
    source_system: 'Virtual Data Marketplace',
    certified_flag: true,
    data_owner: 'Customer Analytics COE',
    last_refresh_ts: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
    refresh_frequency: 'Daily',
    dataset_health: {
      freshness_status: 'Current',
      quality_score: 95,
    },
    row_count: 1500000,
    field_count: 25,
    storage_type: 'Virtual Data Marketplace',
    pii_flag: false,
    null_rate: 0.02,
    duplication_rate: 0.001,
    connected_reports: [
      { report_id: 'rep-001', report_name: 'Monthly Churn Dashboard' },
      { report_id: 'rep-002', report_name: 'Customer Retention Analysis' },
    ],
    downstream_systems: ['Tableau', 'Power BI'],
  });
  const [showRightPanel, setShowRightPanel] = useState(true);

  const allDatasets = getAllDatasets();

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Define addAssistantMessage early with useCallback to prevent duplicates
  const addAssistantMessage = React.useCallback((content: string, renderType?: string, data?: any) => {
    const newMsg: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Add random suffix for uniqueness
      type: 'assistant',
      content,
      renderType: renderType as any,
      data,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, newMsg]);
    setIsGenerating(false);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-save current session
  useEffect(() => {
    if (activeSessionId && messages.length > 0) {
      setMigrationSessions(prev =>
        prev.map(session =>
          session.session_id === activeSessionId
            ? { ...session, messages: messages as any, last_updated: new Date() }
            : session
        )
      );
    }
  }, [messages, activeSessionId]);

  // Initialize with source platform selection (Step 1)
  useEffect(() => {
    if (activeSessionId === 'mig-session-1' && messages.length === 0) {
      const titleMsg: Message = {
        id: 'msg-step1-title',
        type: 'assistant',
        content: 'Select the source platform.',
        renderType: 'text',
        timestamp: new Date(),
      };
      
      const platformSelectionMsg: Message = {
        id: 'msg-step1-platform',
        type: 'assistant',
        content: 'Choose the platform where the report you want to migrate currently lives.',
        renderType: 'migration_source_platform_selection',
        data: {},
        timestamp: new Date(),
      };
      
      setMessages([titleMsg, platformSelectionMsg]);
    }
  }, [activeSessionId, selectedDataset]);

  // Handle dataset selection from URL
  useEffect(() => {
    if (datasetId) {
      const dataset = allDatasets.find(d => d.dataset_id === datasetId);
      if (dataset) {
        setSelectedDataset(dataset);
        setShowRightPanel(true);
        setFlowState('active');
        
        // Add selection message if not already added
        if (messages.length === 0 || !messages.some(m => m.data?.selectedDataset?.dataset_id === datasetId)) {
          addAssistantMessage(
            `You selected ${dataset.dataset_name}. I can generate a migration plan and highlight risks. What would you like to do next?`,
            'suggested_pills',
            {
              selectedDataset: dataset,
              pills: [
                'Generate migration plan',
                'Show connected reports',
                'Check data quality & freshness',
                'Identify breaking changes',
                'Estimate downtime',
                'Show required mappings',
              ]
            }
          );
        }
      }
    }
  }, [datasetId, messages.length, addAssistantMessage, allDatasets]);

  const handleNewSession = () => {
    const newSession: MigrationSession = {
      session_id: `mig-session-${Date.now()}`,
      title: `Migration ${new Date().toLocaleDateString()}`,
      messages: [],
      status: 'draft',
      last_updated: new Date(),
    };
    setMigrationSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newSession.session_id);
    setMessages([]);
    setFlowState('landing');
    setShowRightPanel(false);
    setSelectedDataset(null);
    navigate('/talk/migration');
  };

  const handleLoadSession = (session: MigrationSession) => {
    setActiveSessionId(session.session_id);
    setMessages(session.messages as Message[]);
    setFlowState(session.messages.length > 0 ? 'active' : 'landing');
    
    // Restore dataset selection if exists
    if (session.selected_dataset_id) {
      const dataset = allDatasets.find(d => d.dataset_id === session.selected_dataset_id);
      if (dataset) {
        setSelectedDataset(dataset);
        setShowRightPanel(true);
        navigate(`/talk/migration/datasets/${dataset.dataset_id}`);
      }
    }
  };

  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMigrationSessions(prev => prev.filter(s => s.session_id !== sessionId));
    if (activeSessionId === sessionId) {
      handleNewSession();
    }
  };

  const handleEditSessionTitle = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const session = migrationSessions.find(s => s.session_id === sessionId);
    if (session) {
      setEditingSessionId(sessionId);
      setEditingTitle(session.title);
    }
  };

  const handleSaveTitle = (sessionId: string) => {
    setMigrationSessions(prev =>
      prev.map(s => (s.session_id === sessionId ? { ...s, title: editingTitle } : s))
    );
    setEditingSessionId(null);
  };

  const handleStarterPillClick = (pill: string) => {
    setIsGenerating(true);
    setFlowState('active');
    
    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      type: 'user',
      content: pill,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);

    setTimeout(() => {
      if (pill.toLowerCase().includes('select a dataset')) {
        navigate('/talk/migration/datasets');
        addAssistantMessage(
          `Here are your datasets available for migration. Select one to continue.`,
          'dataset_list',
          { datasets: allDatasets }
        );
      } else if (pill.toLowerCase().includes('migration-ready')) {
        const readyDatasets = allDatasets.filter(d => 
          d.migration_readiness && d.migration_readiness.readiness_score >= 70
        );
        addAssistantMessage(
          `I found ${readyDatasets.length} datasets with a readiness score of 70 or higher.`,
          'dataset_list',
          { datasets: readyDatasets }
        );
      } else if (pill.toLowerCase().includes('assess')) {
        addAssistantMessage(
          'Dataset readiness assessment evaluates data quality, schema compatibility, dependencies, and migration complexity. Select a dataset to see its detailed readiness score.',
          'text'
        );
      } else if (pill.toLowerCase().includes('estimate')) {
        addAssistantMessage(
          'Migration effort is estimated based on data volume, schema complexity, transformations required, and downstream dependencies. Typical migrations range from hours to days.',
          'text'
        );
      } else if (pill.toLowerCase().includes('explain')) {
        addAssistantMessage(
          'Dataset migration follows these steps: 1) Selection & Assessment, 2) Plan Generation, 3) Validation, 4) Migration Execution, 5) Report Repointing, 6) Post-Migration Verification.',
          'text'
        );
      } else if (pill.toLowerCase().includes('history')) {
        addAssistantMessage(
          'Your migration history is shown in the left panel. You currently have 1 planned migration for Customer Feedback & RIS.',
          'text'
        );
      }
    }, 800);
  };

  const handleAsk = () => {
    if (!inputValue.trim()) return;

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      type: 'user',
      content: inputValue,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsGenerating(true);
    setFlowState('active');

    setTimeout(() => {
      const q = inputValue.toLowerCase();
      
      if (q.includes('dataset') && (q.includes('select') || q.includes('choose') || q.includes('show'))) {
        navigate('/talk/migration/datasets');
        addAssistantMessage(
          `Here are your datasets available for migration.`,
          'dataset_list',
          { datasets: allDatasets }
        );
      } else if (q.includes('plan')) {
        if (selectedDataset) {
          navigate(`/talk/migration/datasets/${selectedDataset.dataset_id}/plan`);
          addAssistantMessage(
            `Migration plan for ${selectedDataset.dataset_name}`,
            'migration_plan',
            { dataset: selectedDataset }
          );
        } else {
          addAssistantMessage('Please select a dataset first to generate a migration plan.', 'text');
        }
      } else {
        addAssistantMessage(
          'I can help you migrate datasets. Try: "Select a dataset", "Show migration-ready datasets", or "Generate migration plan".',
          'text'
        );
      }
    }, 800);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  const handleDatasetClick = (dataset: any) => {
    setSelectedDataset(dataset);
    setShowRightPanel(true);
    navigate(`/talk/migration/datasets/${dataset.dataset_id}`);
  };

  const handlePillClick = (pill: string) => {
    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      type: 'user',
      content: pill,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsGenerating(true);

    setTimeout(() => {
      if (pill.toLowerCase().includes('generate migration plan')) {
        navigate(`/talk/migration/datasets/${selectedDataset.dataset_id}/plan`);
        addAssistantMessage(
          `Migration plan for ${selectedDataset.dataset_name}`,
          'migration_plan',
          { dataset: selectedDataset }
        );
      } else if (pill.toLowerCase().includes('connected reports')) {
        const reports = selectedDataset.connected_reports || [];
        addAssistantMessage(
          `${selectedDataset.dataset_name} has ${reports.length} connected ${reports.length === 1 ? 'report' : 'reports'}: ${reports.map((r: any) => r.report_name).join(', ')}`,
          'text'
        );
      } else if (pill.toLowerCase().includes('data quality')) {
        const health = selectedDataset.dataset_health;
        addAssistantMessage(
          `Data Quality Check:\n• Freshness: ${health.freshness_status}\n• Quality Score: ${health.quality_score}/100\n• Null Rate: ${((selectedDataset.null_rate || 0) * 100).toFixed(1)}%\n• Duplication Rate: ${((selectedDataset.duplication_rate || 0) * 100).toFixed(2)}%`,
          'text'
        );
      } else if (pill.toLowerCase().includes('breaking changes')) {
        addAssistantMessage(
          'Schema analysis shows no breaking changes expected. Field types and relationships are compatible with the target platform.',
          'text'
        );
      } else if (pill.toLowerCase().includes('estimate downtime')) {
        const effort = selectedDataset.migration_readiness?.estimated_effort || 'Medium';
        const downtime = effort === 'Small' ? '2-4 hours' : effort === 'Medium' ? '6-8 hours' : '12-24 hours';
        addAssistantMessage(
          `Estimated downtime: ${downtime}. Recommended window: ${selectedDataset.migration_readiness?.migration_window_recommendation}`,
          'text'
        );
      } else if (pill.toLowerCase().includes('mappings')) {
        addAssistantMessage(
          'Schema mappings will preserve all field types and relationships. Auto-mapping coverage: 95%. Manual review required for custom transformations.',
          'text'
        );
      } else {
        addAssistantMessage('Processing...', 'text');
      }
    }, 800);
  };

  const renderMessage = (msg: Message) => {
    if (msg.type === 'user') {
      return (
        <div key={msg.id} className="flex justify-end mb-4">
          <div className="bg-[#111827] text-white px-4 py-3 rounded-xl max-w-[80%]" style={{ fontFamily: 'Inter, sans-serif' }}>
            <p className="text-[13px]">{msg.content}</p>
          </div>
        </div>
      );
    }

    // Migration Intent Selection - Step 1 (Migration Only)
    if (msg.renderType === 'migration_intent_selection') {
      return (
        <IntentSelectionUI
          key={msg.id}
          msgId={msg.id}
          msgContent={msg.content}
          onIntentSelect={() => {
            const userMsg: Message = {
              id: `msg-${Date.now()}`,
              type: 'user',
              content: 'Migrate an existing report',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMsg]);
            setIsGenerating(true);
            setTimeout(() => {
              setIsGenerating(false);
              
              // Route to Step 2: Source Platform Selection
              addAssistantMessage(
                'Source platform selection',
                'migration_source_platform_selection',
                {}
              );
            }, 800);
          }}
          onViewOverview={() => {
            const userMsg: Message = {
              id: `msg-${Date.now()}`,
              type: 'user',
              content: 'View migration overview',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMsg]);
            setIsGenerating(true);
            setTimeout(() => {
              setIsGenerating(false);
              addAssistantMessage(
                '## Migration Overview\n\n**What is migration?**\nMigration helps you move datasets and reports from legacy BI platforms to modern, governed platforms in Report Hub.\n\n**Two migration paths:**\n\n1. **Create New Report** - Build a fresh report using certified data and metrics\n2. **Migrate Existing** - Rebuild an existing report while preserving business logic\n\n**Benefits:**\n• Reduced BI platform licensing costs\n• Improved data governance\n• Faster query performance\n• Centralized metric definitions',
                'text'
              );
            }, 800);
          }}
        />
      );
    }

    // Step 2: Source Platform Selection
    if (msg.renderType === 'migration_source_platform_selection') {
      return (
        <SourcePlatformSelectionUI
          key={msg.id}
          msgId={msg.id}
          onContinue={(platform) => {
            const platformNames = {
              tableau: 'Tableau',
              qlik: 'Qlik',
              bifabric: 'Report Hub'
            };
            
            const userMsg: Message = {
              id: `msg-${Date.now()}`,
              type: 'user',
              content: platformNames[platform],
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMsg]);
            setIsGenerating(true);
            setTimeout(() => {
              setIsGenerating(false);
              
              // Route to Step 3: Select report to migrate
              addAssistantMessage(
                'Report selection',
                'migration_report_selection',
                { sourcePlatform: platform }
              );
            }, 800);
          }}
        />
      );
    }

    // Step 3: Report Selection
    if (msg.renderType === 'migration_report_selection') {
      const sourcePlatform = msg.data?.sourcePlatform || 'tableau';
      return (
        <ReportSelectionUI
          key={msg.id}
          msgId={msg.id}
          sourcePlatform={sourcePlatform}
          onReportSelect={(report) => {
            // Update the selected report for the right drawer
            setSelectedReport({
              ...report,
              sourcePlatform: sourcePlatform
            });
          }}
          onContinue={(reportId) => {
            const selectedReportData = selectedReport;
            const userMsg: Message = {
              id: `msg-${Date.now()}`,
              type: 'user',
              content: selectedReportData?.name || 'Selected report',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMsg]);
            setIsGenerating(true);
            setTimeout(() => {
              setIsGenerating(false);
              
              // Route to Step 4: Select destination platform
              addAssistantMessage(
                'Destination platform selection',
                'migration_destination_platform_selection',
                { 
                  reportId, 
                  report: selectedReportData,
                  sourcePlatform: selectedReportData?.sourcePlatform || 'tableau'
                }
              );
            }, 800);
          }}
        />
      );
    }

    // Step 4: Destination Platform Selection
    if (msg.renderType === 'migration_destination_platform_selection') {
      const sourcePlatform = msg.data?.sourcePlatform || 'tableau';
      const reportData = msg.data?.report || selectedReport;
      const reportName = reportData?.name || 'Selected report';
      
      return (
        <DestinationPlatformSelectionUI
          key={msg.id}
          msgId={msg.id}
          sourcePlatform={sourcePlatform}
          reportName={reportName}
          onDestinationSelect={(platform) => {
            // Update the selected report with destination platform
            if (reportData) {
              setSelectedReport({
                ...reportData,
                destinationPlatform: platform
              });
            }
          }}
          onContinue={(destinationPlatform) => {
            const platformNames = {
              bifabric: 'Report Hub',
              qlik: 'Qlik',
              looker: 'Looker'
            };
            
            const userMsg: Message = {
              id: `msg-${Date.now()}`,
              type: 'user',
              content: platformNames[destinationPlatform],
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMsg]);
            setIsGenerating(true);
            setTimeout(() => {
              setIsGenerating(false);
              
              // Route to Step 5: Configure visuals
              addAssistantMessage(
                'Visual configuration',
                'migration_visual_configuration',
                { 
                  destinationPlatform,
                  sourcePlatform,
                  report: reportData
                }
              );
            }, 800);
          }}
        />
      );
    }

    // Step 5: Visual Configuration
    if (msg.renderType === 'migration_visual_configuration') {
      const reportData = msg.data?.report || selectedReport;
      const reportName = reportData?.name || 'Selected report';
      const sourcePlatform = msg.data?.sourcePlatform;
      const destinationPlatform = msg.data?.destinationPlatform;
      
      return (
        <VisualConfigurationUI
          key={msg.id}
          msgId={msg.id}
          reportName={reportName}
          sourcePlatform={sourcePlatform}
          destinationPlatform={destinationPlatform}
          onContinue={(config) => {
            const layoutLabel = config.layoutOption === 'keep_current' 
              ? 'Keep current layout' 
              : 'Reference existing report';
            
            const userMsg: Message = {
              id: `msg-${Date.now()}`,
              type: 'user',
              content: layoutLabel,
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMsg]);
            setIsGenerating(true);
            
            // Update selected report with visual config
            if (reportData) {
              setSelectedReport({
                ...reportData,
                visualConfig: config
              });
            }
            
            setTimeout(() => {
              setIsGenerating(false);
              
              // Route to Step 5.5: Platform Preview
              addAssistantMessage(
                'Platform preview',
                'platform_preview',
                { 
                  ...msg.data,
                  visualConfig: config
                }
              );
            }, 800);
          }}
        />
      );
    }

    // Step 5.5: Platform Preview (Before/After Comparison)
    if (msg.renderType === 'platform_preview') {
      const reportData = msg.data?.report || selectedReport;
      const reportName = reportData?.name || 'Selected report';
      const sourcePlatform = msg.data?.sourcePlatform || reportData?.sourcePlatform || 'tableau';
      const destinationPlatform = msg.data?.destinationPlatform || reportData?.destinationPlatform || 'bifabric';
      
      return (
        <PlatformPreviewComparison
          key={msg.id}
          msgId={msg.id}
          reportName={reportName}
          sourcePlatform={sourcePlatform}
          destinationPlatform={destinationPlatform}
          onContinue={() => {
            // User confirms preview, route to Step 6: Migration Execution
            setIsGenerating(true);
            
            const userMsg: Message = {
              id: `user-${Date.now()}`,
              type: 'user',
              content: 'Continue to execution',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMsg]);
            
            setTimeout(() => {
              setIsGenerating(false);
              
              // Route to Step 6: Migration Execution
              addAssistantMessage(
                'Migration execution',
                'migration_execution',
                msg.data
              );
            }, 800);
          }}
          onBack={() => {
            // User wants to go back to visual configuration
            setIsGenerating(true);
            
            const userMsg: Message = {
              id: `user-${Date.now()}`,
              type: 'user',
              content: 'Back to visual configuration',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMsg]);
            
            setTimeout(() => {
              setIsGenerating(false);
              
              // Route back to Step 5: Visual Configuration
              addAssistantMessage(
                'Visual configuration',
                'migration_visual_configuration',
                msg.data
              );
            }, 500);
          }}
        />
      );
    }

    // Step 5.5 (Legacy): Report Preview - kept for backwards compatibility
    if (msg.renderType === 'report_preview') {
      const reportData = msg.data?.report || selectedReport;
      const reportName = reportData?.name || 'Selected report';
      const visualConfig = msg.data?.visualConfig || reportData?.visualConfig;
      const layoutOption = visualConfig?.layoutOption || 'keep_current';
      const selectedTemplate = visualConfig?.selectedTemplate;
      
      return (
        <ReportPreviewUI
          key={msg.id}
          msgId={msg.id}
          reportName={reportName}
          layoutOption={layoutOption}
          selectedTemplate={selectedTemplate}
          onFinalize={() => {
            // User confirms preview, route to Step 6: Migration Execution
            setIsGenerating(true);
            
            const userMsg: Message = {
              id: `user-${Date.now()}`,
              type: 'user',
              content: 'Finalize and run migration',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMsg]);
            
            setTimeout(() => {
              setIsGenerating(false);
              
              // Route to Step 6: Migration Execution
              addAssistantMessage(
                'Migration execution',
                'migration_execution',
                { 
                  ...msg.data,
                  visualConfig
                }
              );
            }, 800);
          }}
          onBackToVisual={() => {
            // User wants to go back to visual configuration
            setIsGenerating(true);
            
            const userMsg: Message = {
              id: `user-${Date.now()}`,
              type: 'user',
              content: 'Back to visual configuration',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMsg]);
            
            setTimeout(() => {
              setIsGenerating(false);
              
              // Route back to Step 5: Visual Configuration
              addAssistantMessage(
                'Visual configuration',
                'visual_configuration',
                msg.data
              );
            }, 500);
          }}
        />
      );
    }

    // Step 6: Migration Execution (now after preview step)
    if (msg.renderType === 'migration_execution') {
      const reportData = msg.data?.report || selectedReport;
      const reportName = reportData?.name || 'Selected report';
      const sourcePlatform = msg.data?.sourcePlatform || reportData?.sourcePlatform || 'tableau';
      const destinationPlatform = msg.data?.destinationPlatform || reportData?.destinationPlatform || 'bifabric';
      const visualConfig = msg.data?.visualConfig || reportData?.visualConfig;
      const visualHandling = visualConfig?.layoutOption === 'keep_current' 
        ? 'Reuse layout' 
        : 'Reference existing report';
      
      return (
        <MigrationExecutionUI
          key={msg.id}
          msgId={msg.id}
          sourcePlatform={sourcePlatform}
          destinationPlatform={destinationPlatform}
          reportName={reportName}
          visualHandling={visualHandling}
          onComplete={() => {
            setTimeout(() => {
              setIsGenerating(false);
              
              // Route to Step 7: Migration Complete
              addAssistantMessage(
                'Migration completed',
                'migration_completion',
                { 
                  ...msg.data,
                  reportName,
                  sourcePlatform
                }
              );
            }, 500);
          }}
        />
      );
    }

    // Step 7: Migration Completion
    if (msg.renderType === 'migration_completion') {
      const reportData = msg.data?.report || selectedReport;
      const reportName = msg.data?.reportName || reportData?.name || 'Selected report';
      const sourcePlatform = msg.data?.sourcePlatform || reportData?.sourcePlatform || 'tableau';
      
      return (
        <MigrationCompletionUI
          key={msg.id}
          msgId={msg.id}
          sourcePlatform={sourcePlatform}
          reportName={reportName}
        />
      );
    }

    if (msg.renderType === 'migration_initiated') {
      const assetName = msg.data?.assetName || 'Customer Churn Overview';
      return (
        <div key={msg.id} className="mb-6">
          <div className="bg-gray-50 px-4 py-3 rounded-xl mb-4 max-w-[80%]" style={{ fontFamily: 'Inter, sans-serif' }}>
            <p className="text-[13px] text-[#111827] mb-3">
              Got it — I'll help you migrate <strong>{assetName}</strong> into the Report Hub ecosystem.
            </p>
            <p className="text-[13px] text-[#111827] mb-1">
              Before we begin, I'll confirm your intent and preferred destination path.
            </p>
            <p className="text-[13px] text-[#111827]">
              You'll be guided to use governed data (Virtual Data Marketplace) by default, so your churn metrics stay consistent and certified.
            </p>
          </div>

          {/* What happens next checklist */}
          <div className="bg-white border border-[#E5E7EB] rounded-xl p-4 mb-4 max-w-[80%]">
            <h5 className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
              What happens next
            </h5>
            <div className="space-y-2">
              {[
                'Clarify intent (new report vs migrate existing)',
                'Confirm source → destination',
                'Choose data source (VDM recommended)',
                'Select governed metrics & dimensions',
              ].map((item, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex items-center justify-center mt-0.5 flex-shrink-0">
                    <span className="text-[10px] text-[#6B7280] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {idx + 1}
                    </span>
                  </div>
                  <span className="text-[12px] text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {item}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* CTAs */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const userMsg: Message = {
                  id: `msg-${Date.now()}`,
                  type: 'user',
                  content: 'Continue',
                  timestamp: new Date(),
                };
                setMessages(prev => [...prev, userMsg]);
                setIsGenerating(true);
                setTimeout(() => {
                  addAssistantMessage(
                    'Great! Let me guide you through the next steps...',
                    'text'
                  );
                }, 800);
              }}
              className="px-6 py-2.5 bg-[#111827] hover:bg-[#0F172A] text-white rounded-lg text-[13px] font-medium transition-colors shadow-sm"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Continue
            </button>
            <button
              onClick={() => {
                const userMsg: Message = {
                  id: `msg-${Date.now()}`,
                  type: 'user',
                  content: 'View migration overview',
                  timestamp: new Date(),
                };
                setMessages(prev => [...prev, userMsg]);
                setIsGenerating(true);
                setTimeout(() => {
                  addAssistantMessage(
                    'Migration overview: Dataset migration follows these steps: 1) Selection & Assessment, 2) Plan Generation, 3) Validation, 4) Migration Execution, 5) Report Repointing, 6) Post-Migration Verification.',
                    'text'
                  );
                }, 800);
              }}
              className="text-[13px] text-blue-600 hover:underline font-medium"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              View migration overview
            </button>
          </div>
        </div>
      );
    }

    // Step 2: Source → Destination Confirmation
    if (msg.renderType === 'migration_source_destination') {
      return (
        <div key={msg.id} className="mb-6">
          {/* Assistant Message */}
          <div className="bg-gray-50 px-4 py-3 rounded-xl mb-4 max-w-[80%]" style={{ fontFamily: 'Inter, sans-serif' }}>
            <div className="text-[13px] text-[#111827] whitespace-pre-wrap font-semibold mb-2">
              Let's confirm where this report is coming from and where it's going.
            </div>
            <div className="text-[13px] text-[#111827]">
              This ensures there's no confusion about the target-state BI platform.
            </div>
          </div>

          {/* SOURCE → DESTINATION VISUAL BLOCK */}
          <div className="bg-white border-2 border-[#E5E7EB] rounded-xl p-6 mb-4 max-w-[90%]" style={{ fontFamily: 'Inter, sans-serif' }}>
            <div className="flex items-start gap-8">
              {/* LEFT SIDE - SOURCE (Locked) */}
              <div className="flex-1">
                <div className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-3">
                  SOURCE
                </div>
                <div className="bg-gray-50 border-2 border-gray-300 rounded-xl p-4 opacity-75">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h4 className="text-[14px] font-semibold text-[#111827] mb-1">
                        Tableau
                      </h4>
                      <p className="text-[11px] text-[#6B7280]">
                        Legacy BI platform
                      </p>
                    </div>
                    <Lock className="w-4 h-4 text-gray-400" />
                  </div>
                  <div className="mt-2">
                    <span className="inline-flex items-center gap-1 bg-gray-200 text-gray-600 text-[10px] font-medium px-2 py-0.5 rounded">
                      Source only
                    </span>
                  </div>
                </div>
              </div>

              {/* CENTER - DIRECTION INDICATOR */}
              <div className="flex flex-col items-center justify-center pt-8">
                <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wide mb-2">
                  Migration path
                </div>
                <ArrowRight className="w-8 h-8 text-blue-600" strokeWidth={2.5} />
              </div>

              {/* RIGHT SIDE - DESTINATION (Ranked) */}
              <div className="flex-1">
                <div className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-3">
                  DESTINATION (Preference order)
                </div>
                <div className="space-y-3">
                  {/* Option 1: Report Hub */}
                  <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
                    <div className="flex items-start gap-2 mb-2">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex-shrink-0">
                        1
                      </span>
                      <div className="flex-1">
                        <h4 className="text-[14px] font-semibold text-[#111827] mb-0.5">
                          Verizon Report Hub
                        </h4>
                        <p className="text-[11px] text-[#6B7280] font-medium mb-2">
                          Default destination
                        </p>
                        <p className="text-[11px] text-[#6B7280] leading-relaxed">
                          Most reports are generated using Report Hub's open-source engine.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Option 2: Qlik */}
                  <div className="bg-white border-2 border-gray-200 rounded-xl p-4">
                    <div className="flex items-start gap-2 mb-2">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-400 text-white text-[11px] font-bold flex-shrink-0">
                        2
                      </span>
                      <div className="flex-1">
                        <h4 className="text-[14px] font-semibold text-[#111827] mb-0.5">
                          Qlik
                        </h4>
                        <p className="text-[11px] text-[#6B7280] font-medium mb-2">
                          Secondary (advanced analytics if required)
                        </p>
                        <p className="text-[11px] text-[#6B7280] leading-relaxed">
                          Used only when advanced enterprise BI capabilities are needed.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Option 3: Looker */}
                  <div className="bg-white border-2 border-gray-200 rounded-xl p-4">
                    <div className="flex items-start gap-2 mb-2">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-400 text-white text-[11px] font-bold flex-shrink-0">
                        3
                      </span>
                      <div className="flex-1">
                        <h4 className="text-[14px] font-semibold text-[#111827] mb-0.5">
                          Looker
                        </h4>
                        <p className="text-[11px] text-[#6B7280] font-medium mb-2">
                          Tertiary
                        </p>
                        <p className="text-[11px] text-[#6B7280] leading-relaxed">
                          Routed only when specific Looker capabilities are required.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SYSTEM GUIDANCE CALLOUT */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 max-w-[90%]" style={{ fontFamily: 'Inter, sans-serif' }}>
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-[12px] text-[#111827] leading-relaxed">
                Report Hub determines the final execution platform based on usage, complexity, and cost — not by default tool selection.
              </p>
            </div>
          </div>

          {/* CONTINUE CONTROL */}
          <div className="flex flex-col gap-3">
            <button
              onClick={() => {
                const userMsg: Message = {
                  id: `msg-${Date.now()}`,
                  type: 'user',
                  content: 'Continue',
                  timestamp: new Date(),
                };
                setMessages(prev => [...prev, userMsg]);
                setIsGenerating(true);
                setTimeout(() => {
                  setIsGenerating(false);
                  // Add Step 3A: Data Source Selection
                  addAssistantMessage(
                    'Perfect! Source and destination confirmed.',
                    'migration_data_source_selection',
                    {}
                  );
                }, 800);
              }}
              className="px-6 py-2.5 bg-[#111827] hover:bg-[#0F172A] text-white rounded-lg text-[13px] font-medium transition-colors shadow-sm self-start"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Continue
            </button>
            
            {/* Secondary Link */}
            <button
              onClick={() => {
                const userMsg: Message = {
                  id: `msg-${Date.now()}`,
                  type: 'user',
                  content: 'Why Report Hub is the default destination',
                  timestamp: new Date(),
                };
                setMessages(prev => [...prev, userMsg]);
                setIsGenerating(true);
                setTimeout(() => {
                  setIsGenerating(false);
                  addAssistantMessage(
                    'Report Hub is the default destination because:\n\n• **Cost Efficiency**: Open-source engine reduces licensing costs\n• **Data Governance**: Built-in integration with Virtual Data Marketplace\n• **Performance**: Optimized for standard reporting and dashboards\n• **Scalability**: Handles most business intelligence use cases\n\nEnterprise BI platforms (Qlik, Looker) are reserved for specialized capabilities like advanced analytics, real-time data, or complex associative models.',
                    'text'
                  );
                }, 800);
              }}
              className="text-[#6B7280] hover:text-[#111827] text-[13px] font-medium transition-colors underline self-start"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Why Report Hub is the default destination
            </button>
          </div>
        </div>
      );
    }

    // Step 2B: Create New Report - Data Source Selection (VDM-First)
    if (msg.renderType === 'create_new_data_source_selection') {
      return (
        <CreateNewDataSourceSelectionUI
          key={msg.id}
          msgId={msg.id}
          onContinue={(dataSource) => {
            const userMsg: Message = {
              id: `msg-${Date.now()}`,
              type: 'user',
              content: dataSource === 'vdm' 
                ? 'Continue with Virtual Data Marketplace'
                : 'Continue with other governed sources',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMsg]);
            setIsGenerating(true);
            setTimeout(() => {
              setIsGenerating(false);
              // Route to Step 3B: VDM Confirmation
              addAssistantMessage(
                'VDM confirmed',
                'create_new_vdm_confirmation',
                {}
              );
            }, 800);
          }}
          onLearnMore={() => {
            const userMsg: Message = {
              id: `msg-${Date.now()}`,
              type: 'user',
              content: 'Why Virtual Data Marketplace is recommended',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMsg]);
            setIsGenerating(true);
            setTimeout(() => {
              setIsGenerating(false);
              addAssistantMessage(
                'Virtual Data Marketplace is recommended because:\n\n• **Certified Data**: All data products are governed and approved by domain experts\n• **Consistent Metrics**: Pre-defined business metrics ensure everyone uses the same calculations\n• **Data Quality**: Automated quality checks and monitoring\n• **Faster Development**: Reusable dimensions and metrics reduce report creation time\n• **Compliance**: Built-in data lineage and access controls\n\nUsing VDM ensures your reports are built on trusted, governed data from day one.',
                'text'
              );
            }, 800);
          }}
        />
      );
    }

    // Step 3B: Create New Report - VDM Confirmation
    if (msg.renderType === 'create_new_vdm_confirmation') {
      return (
        <CreateNewVDMConfirmationUI
          key={msg.id}
          msgId={msg.id}
          onContinue={() => {
            const userMsg: Message = {
              id: `msg-${Date.now()}`,
              type: 'user',
              content: 'Continue',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMsg]);
            setIsGenerating(true);
            setTimeout(() => {
              setIsGenerating(false);
              // Route to Step 4B: Catalog Selection
              addAssistantMessage(
                "Great! Now let's select your data and metrics.",
                'migration_catalog_selection',
                { pathType: 'create_new' }
              );
            }, 800);
          }}
        />
      );
    }

    // Step 3A: Data Source Selection
    if (msg.renderType === 'migration_data_source_selection') {
      return (
        <DataSourceSelectionUI
          key={msg.id}
          msgId={msg.id}
          onContinue={(dataSource) => {
            const userMsg: Message = {
              id: `msg-${Date.now()}`,
              type: 'user',
              content: dataSource === 'vdm' 
                ? 'Virtual Data Marketplace (Recommended)'
                : 'Other governed sources',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMsg]);
            setIsGenerating(true);
            setTimeout(() => {
              setIsGenerating(false);
              // Add Step 4A: Catalog Selection
              addAssistantMessage(
                `Excellent choice! You've selected **${dataSource === 'vdm' ? 'Virtual Data Marketplace' : 'Other governed sources'}** as your data source.`,
                'migration_catalog_selection',
                { dataSource }
              );
            }, 800);
          }}
          onLearnMore={() => {
            const userMsg: Message = {
              id: `msg-${Date.now()}`,
              type: 'user',
              content: 'Why Virtual Data Marketplace is recommended',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMsg]);
            setIsGenerating(true);
            setTimeout(() => {
              setIsGenerating(false);
              addAssistantMessage(
                'Virtual Data Marketplace is recommended because:\n\n• **Semantic Layer**: Provides a unified view of certified metrics and dimensions\n• **Data Governance**: All data products are certified, documented, and maintained by data stewards\n• **Reusability**: Metrics are pre-calculated and shared across teams, reducing duplication\n• **Trust**: Definitions are approved by domain experts and business stakeholders\n• **Performance**: Optimized data products with caching and query acceleration\n• **Lineage**: Full visibility into data sources, transformations, and consumption\n\nUsing VDM ensures your migrated report uses the same trusted definitions as other Report Hub reports.',
                'text'
              );
            }, 800);
          }}
        />
      );
    }

    // Step 4A: Catalog & Metric/Dimension Selection
    if (msg.renderType === 'migration_catalog_selection') {
      return (
        <CatalogSelectionUI
          key={msg.id}
          msgId={msg.id}
          onContinue={(selections) => {
            const userMsg: Message = {
              id: `msg-${Date.now()}`,
              type: 'user',
              content: `Continue with ${selections.metrics.length} metric(s) and ${selections.dimensions.length} dimension(s)`,
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMsg]);
            setIsGenerating(true);
            setTimeout(() => {
              setIsGenerating(false);
              // Add Step 5A: Report Reuse Detection
              addAssistantMessage(
                `Perfect! You've selected:\n\n**Metrics:** ${selections.metrics.length} metric(s)\n**Dimensions:** ${selections.dimensions.join(', ')}`,
                'migration_report_reuse_detection',
                { selections }
              );
            }, 800);
          }}
          onViewLineage={() => {
            const userMsg: Message = {
              id: `msg-${Date.now()}`,
              type: 'user',
              content: 'View metric lineage',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMsg]);
            setIsGenerating(true);
            setTimeout(() => {
              setIsGenerating(false);
              addAssistantMessage(
                '**Customer Churn Rate Lineage**\n\n**Source:**\nVirtual Data Marketplace → Customer Analytics COE → CRM System\n\n**Transformations:**\n1. Raw event capture (subscriber disconnects)\n2. Aggregation to monthly grain\n3. Calculation: (Disconnected / Active at Start) × 100\n4. Quality validation and certification\n\n**Downstream Usage:**\n• 12 active dashboards\n• 8 executive reports\n• 3 operational alerts\n\n**Last Certified:** Jan 2026 by Customer Analytics COE',
                'text'
              );
            }, 800);
          }}
        />
      );
    }

    // Step 5A: Report Reuse Detection
    if (msg.renderType === 'migration_report_reuse_detection') {
      return (
        <ReportReuseDetectionUI
          key={msg.id}
          msgId={msg.id}
          onContinue={(decision) => {
            const decisionLabels = {
              reuse: 'Reuse an existing report',
              enhance: 'Enhance an existing report',
              new: 'Proceed with a new version',
            };
            const userMsg: Message = {
              id: `msg-${Date.now()}`,
              type: 'user',
              content: decisionLabels[decision],
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMsg]);
            setIsGenerating(true);
            setTimeout(() => {
              setIsGenerating(false);
              
              // Add Step 6A: Execution Routing
              addAssistantMessage(
                `Great! I'll show you how this report will be generated.`,
                'migration_execution_routing',
                { 
                  decision,
                  metrics: ['Customer Churn Rate'],
                  dimensions: ['Customer Segment', 'Brand', 'Geography', 'Time Period']
                }
              );
            }, 800);
          }}
          onViewComparison={() => {
            const userMsg: Message = {
              id: `msg-${Date.now()}`,
              type: 'user',
              content: 'View detailed comparison',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMsg]);
            setIsGenerating(true);
            setTimeout(() => {
              setIsGenerating(false);
              addAssistantMessage(
                `**Detailed Report Comparison**\n\n**Your Requirements:**\n• Metrics: Customer Churn Rate\n• Dimensions: Customer Segment, Brand, Geography, Time Period\n• Data Source: Virtual Data Marketplace\n\n**Customer Churn – Executive Overview:**\n✅ Uses same Customer Churn Rate metric\n✅ Includes all your selected dimensions\n✅ Connected to Virtual Data Marketplace\n✅ Already certified and trusted\n✅ High usage (42 users, 1,200 views/month)\n• Last updated: 5 days ago\n• Active maintenance by Customer Analytics COE\n\n**Monthly Churn Trends:**\n✅ Uses same Customer Churn Rate metric\n⚠️ Missing Brand dimension\n✅ Connected to Virtual Data Marketplace\n⚠️ Low usage (8 users, 120 views/month)\n• Last updated: 18 days ago\n• Runs on Qlik (Enterprise BI)\n\n**Recommendation:** The Executive Overview is a near-perfect match and is actively maintained with high adoption.`,
                'text'
              );
            }, 800);
          }}
        />
      );
    }

    // Step 6A: Execution Routing
    if (msg.renderType === 'migration_execution_routing') {
      return (
        <ExecutionRoutingUI
          key={msg.id}
          msgId={msg.id}
          decision={msg.data.decision}
          metrics={msg.data.metrics}
          dimensions={msg.data.dimensions}
          onContinue={() => {
            const userMsg: Message = {
              id: `msg-${Date.now()}`,
              type: 'user',
              content: 'Continue with execution plan',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMsg]);
            setIsGenerating(true);
            setTimeout(() => {
              setIsGenerating(false);
              
              // Add Step 7A: Migration Plan & Validation
              addAssistantMessage(
                `Great! I'll now prepare the migration plan and validation checks.`,
                'migration_plan_validation',
                { 
                  decision: msg.data.decision,
                  sourceSystem: 'Tableau',
                  metrics: msg.data.metrics,
                  dimensions: msg.data.dimensions
                }
              );
            }, 800);
          }}
          onLearnRouting={() => {
            const userMsg: Message = {
              id: `msg-${Date.now()}`,
              type: 'user',
              content: 'Learn how routing decisions are made',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMsg]);
            setIsGenerating(true);
            setTimeout(() => {
              setIsGenerating(false);
              addAssistantMessage(
                `**How Report Hub Makes Routing Decisions**\n\n**Automatic Analysis:**\nReport Hub analyzes your report requirements including:\n• Visualization complexity (maps, custom charts, etc.)\n• Expected concurrent users\n• Calculation complexity\n• Data volume and refresh requirements\n\n**Default Path (Open-Source):**\n✓ Standard tables, bar charts, line charts, pie charts\n✓ Basic filters and parameters\n✓ PDF/PPT export\n✓ Scheduled email delivery\n✓ Up to ~100 concurrent users\n\n**Enterprise BI Path (Looker, Qlik, Tableau):**\nOnly triggered when you need:\n• Advanced geospatial mapping\n• Complex custom calculations beyond SQL\n• 100+ concurrent users\n• Platform-specific visualizations\n\n**Cost Control:**\nThe system always recommends the open-source path first. Enterprise BI is only suggested when capabilities genuinely require it, with explicit cost warnings.\n\n**Your Report:**\nCustomer Churn Rate with standard dimensions → Perfect fit for open-source execution.`,
                'text'
              );
            }, 800);
          }}
        />
      );
    }

    // Step 5B: Create New Report - Usage Expectations
    if (msg.renderType === 'create_new_usage_expectations') {
      return (
        <CreateNewUsageExpectationsUI
          key={msg.id}
          msgId={msg.id}
          onContinue={(expectations) => {
            const userMsg: Message = {
              id: `msg-${Date.now()}`,
              type: 'user',
              content: `Continue with usage expectations: ${expectations.audience}, ${expectations.users} users, ${expectations.views} views`,
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMsg]);
            setIsGenerating(true);
            setTimeout(() => {
              setIsGenerating(false);
              // Route to Step 6B: Execution Routing
              addAssistantMessage(
                'Usage expectations recorded',
                'create_new_execution_routing',
                { expectations }
              );
            }, 800);
          }}
        />
      );
    }

    // Step 6B: Create New Report - Execution Routing
    if (msg.renderType === 'create_new_execution_routing') {
      return (
        <CreateNewExecutionRoutingUI
          key={msg.id}
          msgId={msg.id}
          expectations={msg.data.expectations}
          onContinue={() => {
            const userMsg: Message = {
              id: `msg-${Date.now()}`,
              type: 'user',
              content: 'Continue to visualization preferences',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMsg]);
            setIsGenerating(true);
            setTimeout(() => {
              setIsGenerating(false);
              addAssistantMessage(
                'Great! The report execution path has been determined. Next, let\'s configure visualization preferences and layout options.',
                'text'
              );
            }, 800);
          }}
          onLearnMore={() => {
            const userMsg: Message = {
              id: `msg-${Date.now()}`,
              type: 'user',
              content: 'Learn more about execution routing',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMsg]);
            setIsGenerating(true);
            setTimeout(() => {
              setIsGenerating(false);
              addAssistantMessage(
                '**How Report Hub Determines Execution Routing**\\n\\n**Automatic Analysis:**\\nReport Hub evaluates your report based on:\\n• Usage expectations (audience, users, views)\\n• Data complexity and volume\\n• Visualization requirements\\n• Performance needs\\n\\n**Default: Open-Source Engine**\\nMost reports execute on Report Hub\'s open-source engine, which handles:\\n✓ Standard visualizations (charts, tables, filters)\\n✓ Governed metrics and dimensions\\n✓ Scheduled refreshes and email delivery\\n✓ Up to ~100 concurrent users\\n✓ **No additional licensing cost**\\n\\n**Enterprise BI Platforms (Qlik, Looker)**\\nOnly used when advanced capabilities are required:\\n• Complex associative models\\n• Advanced geospatial mapping\\n• High concurrency (100+ users)\\n• Platform-specific features\\n\\n**For Your Report:**\\nBased on your usage expectations, Report Hub will use the open-source engine, keeping costs low while meeting all requirements.\\n\\n**Important:** New reports never start in Tableau or other legacy BI tools.',
                'text'
              );
            }, 800);
          }}
        />
      );
    }

    // Step 7A: Migration Plan & Validation
    if (msg.renderType === 'migration_plan_validation') {
      return (
        <MigrationPlanValidationUI
          key={msg.id}
          msgId={msg.id}
          decision={msg.data.decision}
          sourceSystem={msg.data.sourceSystem}
          metrics={msg.data.metrics}
          dimensions={msg.data.dimensions}
          onStartMigration={() => {
            const userMsg: Message = {
              id: `msg-${Date.now()}`,
              type: 'user',
              content: 'Start migration',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMsg]);
            setIsGenerating(true);
            setTimeout(() => {
              setIsGenerating(false);
              // Add Step 8A: Final Validation & Readiness
              addAssistantMessage(
                `Running final validation checks...`,
                'migration_final_readiness'
              );
            }, 800);
          }}
          onReviewDetails={() => {
            const userMsg: Message = {
              id: `msg-${Date.now()}`,
              type: 'user',
              content: 'Review details',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMsg]);
            setIsGenerating(true);
            setTimeout(() => {
              setIsGenerating(false);
              addAssistantMessage(
                `**Migration Plan Details**\n\n**Data Flow:**\n• Source: Tableau report "Customer Churn Overview"\n• Data retrieval: Virtual Data Marketplace (governed catalog)\n• Transformation: Report Hub semantic layer\n• Output: Open-source execution engine\n\n**Technical Specifications:**\n• Query optimization: Enabled\n• Caching strategy: Intelligent (based on data freshness)\n• Security: Row-level security inherited from VDM\n• Performance: Sub-second response for standard queries\n\n**Compatibility Notes:**\n✓ All metrics use standard SQL aggregations\n✓ Filters compatible with Report Hub UI\n✓ Export formats: PDF, PPT, Excel, CSV\n✓ Scheduling: Supports all standard cadences\n\n**Rollback Plan:**\nIf issues occur, the original Tableau report remains unchanged and accessible. Migration can be reversed without data loss.\n\nReady to proceed?`,
                'text'
              );
            }, 800);
          }}
        />
      );
    }

    // Step 8A: Final Validation & Readiness
    if (msg.renderType === 'migration_final_readiness') {
      return (
        <FinalValidationReadinessUI
          key={msg.id}
          msgId={msg.id}
          onRunMigration={() => {
            const userMsg: Message = {
              id: `msg-${Date.now()}`,
              type: 'user',
              content: 'Run migration now',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMsg]);
            setIsGenerating(true);
            setTimeout(() => {
              setIsGenerating(false);
              // Add Step 9A: Migration Execution & Progress
              addAssistantMessage(
                `Starting migration execution...`,
                'migration_execution_progress'
              );
            }, 800);
          }}
          onScheduleLater={() => {
            const userMsg: Message = {
              id: `msg-${Date.now()}`,
              type: 'user',
              content: 'Schedule for later',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMsg]);
            setIsGenerating(true);
            setTimeout(() => {
              setIsGenerating(false);
              addAssistantMessage(
                `**Schedule Migration**\n\nYou can schedule this migration to run at a specific time.\n\n**Recommended times:**\n• Off-peak hours (evenings or weekends)\n• During planned maintenance windows\n• After data refresh cycles complete\n\n**Default schedule:** Tonight at 2:00 AM EST\n\nWould you like to customize the schedule or proceed with the default?`,
                'text'
              );
            }, 800);
          }}
        />
      );
    }

    // Step 9A: Migration Execution & Progress
    if (msg.renderType === 'migration_execution_progress') {
      return (
        <MigrationExecutionProgressUI
          key={msg.id}
          msgId={msg.id}
          onViewLogs={() => {
            const userMsg: Message = {
              id: `msg-${Date.now()}`,
              type: 'user',
              content: 'View detailed logs',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMsg]);
            setIsGenerating(true);
            setTimeout(() => {
              setIsGenerating(false);
              addAssistantMessage(
                `**Migration Execution Logs**\n\n**${new Date().toLocaleTimeString()}** - Migration started\n**${new Date().toLocaleTimeString()}** - Connected to Tableau Server\n**${new Date().toLocaleTimeString()}** - Retrieved report metadata\n**${new Date().toLocaleTimeString()}** - Extracted 12 calculated fields\n**${new Date().toLocaleTimeString()}** - Mapped 8 dimensions to VDM catalog\n**${new Date().toLocaleTimeString()}** - Mapped 4 metrics to governed definitions\n**${new Date().toLocaleTimeString()}** - Building semantic layer...\n**${new Date().toLocaleTimeString()}** - Generating SQL queries\n**${new Date().toLocaleTimeString()}** - Executing test query (1.2s)\n**${new Date().toLocaleTimeString()}** - Report generation in progress...\n\n**System Status:** All services operational\n**Memory Usage:** 45%\n**Network Latency:** 12ms`,
                'text'
              );
            }, 800);
          }}
          onCancelMigration={() => {
            const userMsg: Message = {
              id: `msg-${Date.now()}`,
              type: 'user',
              content: 'Cancel migration',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMsg]);
            setIsGenerating(true);
            setTimeout(() => {
              setIsGenerating(false);
              addAssistantMessage(
                `**Confirm Migration Cancellation**\n\n⚠️ **Warning:** Canceling this migration will:\n• Stop all in-progress tasks\n• Roll back any partial changes\n• Preserve the original Tableau report\n\n**Current Progress:** 60% complete\n\n**Are you sure you want to cancel?**\n\nIf you're experiencing issues, I can help troubleshoot while the migration continues.`,
                'text'
              );
            }, 800);
          }}
          onMigrationComplete={() => {
            // Automatically transition to Step 10A when migration completes
            setIsGenerating(true);
            setTimeout(() => {
              setIsGenerating(false);
              addAssistantMessage(
                `Migration completed successfully.`,
                'migration_completion_success'
              );
            }, 500);
          }}
        />
      );
    }

    // Step 10A: Migration Completion & Success
    if (msg.renderType === 'migration_completion_success') {
      return (
        <MigrationCompletionSuccessUI
          key={msg.id}
          msgId={msg.id}
          onViewReport={() => {
            const userMsg: Message = {
              id: `msg-${Date.now()}`,
              type: 'user',
              content: 'View report',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMsg]);
            setIsGenerating(true);
            setTimeout(() => {
              setIsGenerating(false);
              addAssistantMessage(
                `**Opening Customer Churn Overview**\n\nThe report is now loading in Report Hub's unified viewer.\n\n**What you'll see:**\n• Clean, consistent UI matching Report Hub design system\n• All original visualizations and metrics\n• Interactive filters (Customer Segment, Brand, Geography, Time Period)\n• Export options (PDF, PPT, Excel, CSV)\n• Sharing and collaboration features\n\n**Behind the scenes:**\n✓ Data sourced from Virtual Data Marketplace\n✓ Executed via open-source engine\n✓ Governed metric definitions applied\n✓ Row-level security enforced\n\nUsers won't know this was originally a Tableau report—they'll just see it as "Customer Churn Overview" in their Report Hub catalog.`,
                'text'
              );
            }, 800);
          }}
          onMonitorUsage={() => {
            const userMsg: Message = {
              id: `msg-${Date.now()}`,
              type: 'user',
              content: 'Monitor usage',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMsg]);
            setIsGenerating(true);
            setTimeout(() => {
              setIsGenerating(false);
              addAssistantMessage(
                `**Usage & Adoption Analytics**\n\n**Customer Churn Overview - Usage Dashboard**\n\n**Post-Migration Activity (Last 7 days):**\n• Unique viewers: 24 users\n• Total views: 87\n• Average session duration: 4m 32s\n• Export actions: 12 (PDF: 7, Excel: 5)\n• Filters applied: 156 interactions\n\n**Adoption Trends:**\n📈 +35% increase in views vs. pre-migration baseline\n📈 +18% new users discovered report via Report Hub search\n⏱️ -22% reduction in time-to-insight (faster loading)\n\n**User Feedback:**\n✓ 89% positive sentiment\n✓ "Easier to find and use" - 15 comments\n✓ "Faster than before" - 8 comments\n\n**Recommendation:**\nUsage is strong and adoption exceeds pre-migration levels. The legacy Tableau report can be safely archived after a 30-day observation period.`,
                'text'
              );
            }, 800);
          }}
          onExportSummary={() => {
            const userMsg: Message = {
              id: `msg-${Date.now()}`,
              type: 'user',
              content: 'Export migration summary',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMsg]);
            setIsGenerating(true);
            setTimeout(() => {
              setIsGenerating(false);
              addAssistantMessage(
                `**Migration Summary Export**\n\n**Report:** Customer Churn Overview\n**Migration Date:** ${new Date().toLocaleDateString()}\n**Completed By:** Report Hub Migration Assistant\n\n**Migration Path:**\n• Source Platform: Tableau\n• Destination: Report Hub (Open-source execution)\n• Data Source: Virtual Data Marketplace\n• Governance: Enabled (governed metrics & dimensions)\n\n**Technical Details:**\n• Metrics Migrated: Customer Churn Rate\n• Dimensions Migrated: Customer Segment, Brand, Geography, Time Period\n• Filters: 4 interactive filters preserved\n• Visualizations: All charts and tables migrated\n• Row-level Security: Inherited from VDM\n• Performance: Sub-second query response\n\n**Business Impact:**\n• User Disruption: None\n• License Cost Savings: ~$70/month (after legacy archival)\n• Usage Improvement: +35% post-migration\n• Time-to-Insight: -22% faster\n\n**Next Steps:**\n1. Monitor usage for 30 days\n2. Archive legacy Tableau report\n3. Train users on Report Hub features\n4. Consider migrating related reports\n\n**Status:** ✓ Completed Successfully\n\n📥 **Download Options:**\n• PDF summary (formatted)\n• CSV data export\n• JSON metadata`,
                'text'
              );
            }, 800);
          }}
          onStartAnother={() => {
            const userMsg: Message = {
              id: `msg-${Date.now()}`,
              type: 'user',
              content: 'Start another migration',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMsg]);
            setIsGenerating(true);
            setTimeout(() => {
              setIsGenerating(false);
              // Return to Step 1: Migration Initiated
              addAssistantMessage(
                `Great! Let's migrate another report to Report Hub.\n\nI'll guide you through the same structured process to ensure a smooth migration.`,
                'migration_initiated'
              );
            }, 800);
          }}
        />
      );
    }

    if (msg.renderType === 'dataset_list') {
      return (
        <div key={msg.id} className="mb-6">
          <div className="bg-gray-50 px-4 py-3 rounded-xl mb-3 max-w-[80%]" style={{ fontFamily: 'Inter, sans-serif' }}>
            <p className="text-[13px] text-[#111827]">{msg.content}</p>
          </div>
          <div className="space-y-2">
            {msg.data.datasets.map((dataset: any) => (
              <div
                key={dataset.dataset_id}
                onClick={() => handleDatasetClick(dataset)}
                className="bg-white border border-[#E5E7EB] rounded-xl p-4 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h4 className="text-[14px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {dataset.dataset_name}
                    </h4>
                    <p className="text-[12px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {dataset.domain} • {dataset.source_system}
                    </p>
                  </div>
                  {dataset.certified_flag && (
                    <Shield className="w-5 h-5 text-blue-600" />
                  )}
                </div>
                {dataset.migration_readiness && (
                  <div className="flex items-center gap-2 mt-2">
                    <div className={`text-[11px] font-medium px-2 py-1 rounded ${
                      dataset.migration_readiness.readiness_score >= 80
                        ? 'bg-green-50 text-green-700'
                        : dataset.migration_readiness.readiness_score >= 60
                        ? 'bg-yellow-50 text-yellow-700'
                        : 'bg-red-50 text-red-700'
                    }`}>
                      Readiness: {dataset.migration_readiness.readiness_score}%
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (msg.renderType === 'suggested_pills') {
      return (
        <div key={msg.id} className="mb-6">
          <div className="bg-gray-50 px-4 py-3 rounded-xl mb-3 max-w-[80%]" style={{ fontFamily: 'Inter, sans-serif' }}>
            <p className="text-[13px] text-[#111827]">{msg.content}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {msg.data.pills.map((pill: string, idx: number) => (
              <button
                key={idx}
                onClick={() => handlePillClick(pill)}
                className="px-4 py-2 bg-white border border-[#E5E7EB] rounded-lg text-[13px] text-[#111827] hover:border-blue-400 hover:bg-blue-50 transition-all"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                {pill}
              </button>
            ))}
          </div>
        </div>
      );
    }

    // Default text render
    return (
      <div key={msg.id} className="mb-4">
        <div className="bg-gray-50 px-4 py-3 rounded-xl max-w-[80%]" style={{ fontFamily: 'Inter, sans-serif' }}>
          <p className="text-[13px] text-[#111827] whitespace-pre-wrap">{msg.content}</p>
        </div>
      </div>
    );
  };

  // Main UI structure continues here...
  return (
    <Layout>
      <div className="flex h-[calc(100vh-64px)]">
        {/* LEFT PANEL - Session History */}
        <div className="w-[280px] bg-white border-r border-[#E5E7EB] flex flex-col" style={{ fontFamily: 'Inter, sans-serif' }}>
          {/* Header */}
          <div className="p-4 border-b border-[#E5E7EB]">
            <button
              onClick={handleNewSession}
              className="w-full px-4 py-2.5 bg-[#111827] hover:bg-[#0F172A] text-white rounded-lg text-[13px] font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Migration
            </button>
          </div>

          {/* Session List */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-3 space-y-2">
              {migrationSessions.map(session => (
                <div
                  key={session.session_id}
                  onClick={() => handleLoadSession(session)}
                  className={`p-3 rounded-lg cursor-pointer transition-all ${
                    activeSessionId === session.session_id
                      ? 'bg-blue-50 border-2 border-blue-200'
                      : 'bg-white border border-[#E5E7EB] hover:border-blue-300 hover:shadow-sm'
                  }`}
                >
                  {editingSessionId === session.session_id ? (
                    <div onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onBlur={() => handleSaveTitle(session.session_id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveTitle(session.session_id);
                          if (e.key === 'Escape') setEditingSessionId(null);
                        }}
                        className="w-full px-2 py-1 text-[13px] border border-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="text-[13px] font-medium text-[#111827] flex-1 line-clamp-2">
                          {session.title}
                        </h4>
                        <div className="flex items-center gap-1 ml-2">
                          <button
                            onClick={(e) => handleEditSessionTitle(session.session_id, e)}
                            className="p-1 hover:bg-gray-100 rounded"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-gray-500" />
                          </button>
                          <button
                            onClick={(e) => handleDeleteSession(session.session_id, e)}
                            className="p-1 hover:bg-gray-100 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-gray-500" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                          session.status === 'completed' ? 'bg-green-100 text-green-700' :
                          session.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                          session.status === 'planned' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {session.status === 'completed' ? 'Completed' :
                           session.status === 'in_progress' ? 'In Progress' :
                           session.status === 'planned' ? 'Planned' : 'Draft'}
                        </span>
                        <span className="text-[10px] text-[#6B7280]">
                          {formatRelativeTime(session.last_updated)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CENTER PANEL - Chat */}
        <div className="flex-1 flex flex-col bg-white">
          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto">
              {messages
                .filter((msg, index, arr) => {
                  // Filter out duplicate Migration Completed messages (Step 10A)
                  if (msg.step === '10A' || msg.content?.includes('Migration Completed Successfully')) {
                    // Find the first occurrence of Step 10A
                    const firstIndex = arr.findIndex(
                      m => m.step === '10A' || m.content?.includes('Migration Completed Successfully')
                    );
                    // Only keep the first occurrence
                    return index === firstIndex;
                  }
                  return true;
                })
                .map(msg => renderMessage(msg))}
              {isGenerating && (
                <div className="flex items-center gap-2 text-[#6B7280] text-[13px]">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Generating response...
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </div>

          {/* Input Area */}
          <div className="border-t border-[#E5E7EB] p-4 bg-white">
            <div className="max-w-4xl mx-auto">
              <div className="relative">
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about migration..."
                  className="w-full px-4 py-3 pr-12 border border-[#E5E7EB] rounded-xl text-[13px] resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  style={{ fontFamily: 'Inter, sans-serif', minHeight: '48px', maxHeight: '120px' }}
                  rows={1}
                />
                <button
                  onClick={handleAsk}
                  disabled={!inputValue.trim() || isGenerating}
                  className="absolute right-2 top-2 p-2 bg-[#111827] hover:bg-[#0F172A] text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL - Report/Dataset Details */}
        {showRightPanel && (
          <div className="w-[360px] bg-white border-l border-[#E5E7EB] overflow-y-auto p-6" style={{ fontFamily: 'Inter, sans-serif' }}>
            {/* Show placeholder when no report or dataset selected */}
            {!selectedReport && !selectedDataset && (
              <>
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-[16px] font-semibold text-[#111827]">
                    Report Selection
                  </h3>
                  <button
                    onClick={() => setShowRightPanel(false)}
                    className="p-1 hover:bg-gray-100 rounded"
                  >
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
                <div className="flex items-center justify-center h-[200px]">
                  <p className="text-[13px] text-[#6B7280] text-center">
                    No report selected yet
                  </p>
                </div>
              </>
            )}

            {/* Show report or dataset details when selected */}
            {(selectedReport || selectedDataset) && (
              <>
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-[16px] font-semibold text-[#111827]">
                    {selectedReport ? selectedReport.name : (selectedDataset?.dataset_name || 'No report selected yet')}
                  </h3>
                  <button
                    onClick={() => setShowRightPanel(false)}
                    className="p-1 hover:bg-gray-100 rounded"
                  >
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </div>

            {/* Show selected report details if available */}
            {selectedReport && (
              <div className="space-y-4">
                {/* Basic Info */}
                <div>
                  <h4 className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-2">
                    Report Details
                  </h4>
                  <div className="space-y-2 text-[12px]">
                    <div className="flex justify-between">
                      <span className="text-[#6B7280]">Source Platform:</span>
                      <span className="text-[#111827] font-medium">
                        {selectedReport.sourcePlatform === 'tableau' ? 'Tableau' : 
                         selectedReport.sourcePlatform === 'powerbi' ? 'Power BI' :
                         selectedReport.sourcePlatform === 'qlik' ? 'Qlik' : 'Report Hub'}
                      </span>
                    </div>
                    {selectedReport.destinationPlatform && (
                      <div className="flex justify-between">
                        <span className="text-[#6B7280]">Destination:</span>
                        <span className="text-[#111827] font-medium">
                          {selectedReport.destinationPlatform === 'bifabric' ? 'Report Hub' : 
                           selectedReport.destinationPlatform === 'qlik' ? 'Qlik' : 
                           selectedReport.destinationPlatform === 'looker' ? 'Looker' : '—'}
                        </span>
                      </div>
                    )}
                    {selectedReport.visualConfig && (
                      <div className="flex justify-between">
                        <span className="text-[#6B7280]">Visual Handling:</span>
                        <span className="text-[#111827] font-medium">
                          {selectedReport.visualConfig.layoutOption === 'keep_current' 
                            ? 'Reuse layout' 
                            : 'Reference existing'}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-[#6B7280]">Owner:</span>
                      <span className="text-[#111827] font-medium">{selectedReport.owner}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#6B7280]">Last Updated:</span>
                      <span className="text-[#111827] font-medium">{selectedReport.lastUpdated}</span>
                    </div>
                  </div>
                </div>

                {/* Usage Stats */}
                <div>
                  <h4 className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-2">
                    Usage Snapshot
                  </h4>
                  <div className="space-y-2 text-[12px]">
                    <div className="flex justify-between">
                      <span className="text-[#6B7280]">Active Users:</span>
                      <span className="text-[#111827] font-medium">{selectedReport.users} users</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#6B7280]">Monthly Views:</span>
                      <span className="text-[#111827] font-medium">{(selectedReport.views / 1000).toFixed(1)}k</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#6B7280]">Usage Level:</span>
                      <span className={`font-medium ${selectedReport.usageLevel === 'high' ? 'text-green-600' : 'text-gray-600'}`}>
                        {selectedReport.usageLevel === 'high' ? 'High' : 'Low'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Show dataset details if no report selected */}
            {!selectedReport && selectedDataset && (
              <div className="space-y-4">
              {/* Basic Info */}
              <div>
                <h4 className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-2">
                  Overview
                </h4>
                <div className="space-y-2 text-[12px]">
                  <div className="flex justify-between">
                    <span className="text-[#6B7280]">Domain:</span>
                    <span className="text-[#111827] font-medium">{selectedDataset.domain}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#6B7280]">Source:</span>
                    <span className="text-[#111827] font-medium">{selectedDataset.source_system}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#6B7280]">Certified:</span>
                    <span className={`font-medium ${selectedDataset.certified_flag ? 'text-green-600' : 'text-gray-600'}`}>
                      {selectedDataset.certified_flag ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Data Health */}
              <div>
                <h4 className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-2">
                  Data Health
                </h4>
                <div className="space-y-2 text-[12px]">
                  <div className="flex justify-between">
                    <span className="text-[#6B7280]">Freshness:</span>
                    <span className="text-[#111827] font-medium">{selectedDataset.dataset_health?.freshness_status}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#6B7280]">Quality Score:</span>
                    <span className="text-[#111827] font-medium">{selectedDataset.dataset_health?.quality_score}/100</span>
                  </div>
                </div>
              </div>

              {/* Connected Reports */}
              {selectedDataset.connected_reports && selectedDataset.connected_reports.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-2">
                    Connected Reports ({selectedDataset.connected_reports.length})
                  </h4>
                  <div className="space-y-2">
                    {selectedDataset.connected_reports.map((report: any) => (
                      <div key={report.report_id} className="text-[12px] text-[#111827] p-2 bg-gray-50 rounded">
                        {report.report_name}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              </div>
            )}
            </>
          )}
        </div>
      )}
      </div>
    </Layout>
  );
}