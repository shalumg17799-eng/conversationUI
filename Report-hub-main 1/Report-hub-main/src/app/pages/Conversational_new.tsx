import React, { useState, useRef, useEffect } from 'react';
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Layout } from '../components/ui/Layout';
import { useNavigate, useSearchParams, useLocation, useParams } from 'react-router';
import {
  getMonthlyTakeRateTrend,
  getAllReports,
  getAllDatasets,
  catalogReports,
  catalogDatasets,
  formatRelativeTime,
  getMarketSegmentDistribution,
  getSegmentPerformanceTrend,
  getPerformanceByRegion,
  getReportsByDatasetId,
  getDatasetSchemaFields,
  getDatasetGrowthTrend,
  getDatasetOwner,
  searchSimilarReports,
  saveReportConfiguration,
  getRecentReports,
} from '@/lib/dataModel';
import { SuggestedPrompts } from '@/app/components/SuggestedPrompts';
import { InlineChart } from '@/app/components/InlineChart';
import { ReportVisualization } from '@/app/components/ReportVisualization';
import { PlatformVisualPreview } from '@/app/components/PlatformVisualPreview';
import { LayoutBuilder } from '@/app/components/LayoutBuilder';
import { TemplatePreview } from '@/app/components/TemplatePreview';
import { ReportLayoutPreview } from '@/app/components/ReportLayoutPreview';
import { ReportGenerationPreview } from '@/app/components/ReportGenerationPreview';
import { 
  Send, 
  Sparkles, 
  Plus, 
  ArrowRight,
  CheckCircle2,
  FileText,
  Database,
  Clock,
  Layers,
  Edit2,
  Trash2,
  X,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Shield,
  ExternalLink,
  Link2,
  Check,
  ChevronRight,
  Info,
  Medal,
} from 'lucide-react';
import MedallionIcon from '@/imports/Group5';
import { usePersona } from '@/app/context/PersonaContext';

interface Message {
  id: string;
  type: 'system' | 'user' | 'assistant';
  content: string;
  renderType?: 'text' | 'context_cards' | 'starter_pills' | 'dataset_cards' | 'option_chips' | 'reports_list' | 'datasets_list' | 'chart_preview' | 'actions' | 'post_reports_actions' | 'report_context_prompts' | 'inline_chart' | 'create_report_step' | 'create_report_preview' | 'migration_dataset_list' | 'migration_intent_selection' | 'migration_platform_selection' | 'migration_plan' | 'migration_validation' | 'migration_pills' | 'marketplace_dataset_grid' | 'dimensions_with_filters' | 'usage_selection' | 'layout_builder' | 'report_generation_preview' | 'duplicate_detection' | 'execution_routing' | 'report_ready_cta';
  data?: any;
  timestamp: Date;
}

interface CreateReportState {
  step: 'data_source' | 'marketplace_dataset_grid' | 'intent' | 'data_origin' | 'duplicate_check' | 'dataset' | 'dimensions' | 'metrics' | 'usage' | 'layout' | 'capabilities' | 'visualization' | 'preview' | 'execution_routing' | 'review' | null;
  dataSource?: 'marketplace' | 'bigquery' | 'teradata' | 'hadoop' | 'on_prem' | 'other';
  intent?: string;
  dataOrigin?: 'marketplace' | 'source_systems';
  selectedDataset?: any;
  selectedMetrics?: string[]
;
  selectedDimensions?: string[];
  expectedUsage?: 'Low' | 'Medium' | 'High';
  advancedNeeds?: string[];
  userRoles?: string[];
  visualization?: string;
  similarReports?: any[];
  layoutType?: 'template' | 'custom' | 'reference';
  selectedTemplate?: string;
  customLayoutComponents?: Array<{id: string; type: string; position: number; size: string}>;
  referenceReportLink?: string;
  referenceLayoutApplied?: boolean;
  referenceReportName?: string;
}

interface MigrationState {
  selectedDataset?: any;
  migrationIntent?: 'create_new' | 'migrate_existing';
  sourcePlatform?: string;
  targetPlatform?: string;
  migrationPlan?: any;
  validationStatus?: string;
}

interface Conversation {
  id: string;
  title: string;
  timestamp: Date;
  messages: Message[];
  activeReportContext?: any; // Store report context for restoration
  activeDatasetContext?: any; // Store dataset context for restoration
  createReportState?: CreateReportState; // Store create report flow state for draft restoration
  migrationState?: MigrationState; // Store migration flow state
  status?: 'active' | 'planned' | 'draft'; // Session status
}

export function ConversationalPage({ isReportFlowMode = false }: { isReportFlowMode?: boolean } = {}) { // marker 1
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([
    {
      id: 'conv-1',
      title: 'Territory Performance Overview',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
      messages: [
        {
          id: 'demo1-1',
          type: 'user',
          content: 'Explore Territory Performance Overview',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
        },
        {
          id: 'demo1-2',
          type: 'assistant',
          content: "You're now exploring **Territory Performance Overview**.\nWhat would you like to know about this report?",
          renderType: 'report_context_prompts',
          data: {
            prompts: [
              'Describe this report',
              'Give me a summary',
              'What are the key insights?',
              'What changed recently?',
              'Show trends over time',
              'Show a pie chart',
              'Show all my reports'
            ]
          },
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2 + 600),
        },
        {
          id: 'demo1-3',
          type: 'user',
          content: 'Give me a summary',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2 + 15000),
        },
        {
          id: 'demo1-4',
          type: 'assistant',
          content: "Here's a high-level summary of **Territory Performance Overview**:\n\n• Overall performance is **stable** over the selected period\n• **Northeast Metro** is the strongest contributor\n• **Midwest Central** is currently lagging behind\n\nOverall, the report suggests that **urban markets are significantly stronger than regional areas**, which may warrant further review.",
          renderType: 'text',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2 + 16000),
        }
      ],
      activeReportContext: catalogReports.find(r => r.report_name === 'Territory Performance Overview') || null,
      activeDatasetContext: null
    },
    {
      id: 'conv-2',
      title: 'Market Segmentation Analysis',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24),
      messages: [
        {
          id: 'demo2-1',
          type: 'user',
          content: 'Explore Market Segmentation Analysis',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24),
        },
        {
          id: 'demo2-2',
          type: 'assistant',
          content: "You're now exploring **Market Segmentation Analysis**.\nWhat would you like to know about this report?",
          renderType: 'report_context_prompts',
          data: {
            prompts: [
              'Describe this report',
              'Give me a summary',
              'What are the key insights?',
              'What changed recently?',
              'Show trends over time',
              'Show a pie chart',
              'Show all my reports'
            ]
          },
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 + 600),
        }
      ],
      activeReportContext: catalogReports.find(r => r.report_name === 'Market Segmentation Analysis') || null,
      activeDatasetContext: null
    },
    {
      id: 'conv-3',
      title: 'SU&G Sales Transactions',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 36),
      messages: [
        {
          id: 'demo3-1',
          type: 'user',
          content: 'Explore SU&G Sales Transactions',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 36),
        },
        {
          id: 'demo3-2',
          type: 'assistant',
          content: "You're now exploring **SU&G Sales Transactions**.\\nWhat would you like to know about this dataset?",
          renderType: 'report_context_prompts',
          data: {
            prompts: [
              'Describe this dataset',
              'Give me a summary',
              'What are the key fields?',
              'What changed recently?',
              'Show trends over time',
              'Show all my datasets'
            ]
          },
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 36 + 600),
        }
      ],
      activeReportContext: null,
      activeDatasetContext: catalogDatasets.find(d => d.dataset_name === 'SU&G Sales Transactions') || null
    },
    {
      id: 'conv-4',
      title: 'Explore reports',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48),
      messages: [
        {
          id: 'demo3-1',
          type: 'user',
          content: 'My Reports',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48),
        },
        {
          id: 'demo3-2',
          type: 'assistant',
          content: 'Here are the reports you have access to.\nThese reports come from multiple analytics platforms connected through Report Hub.',
          renderType: 'reports_list',
          data: { reports: getAllReports().slice(0, 7), showActions: true },
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48 + 600),
        }
      ],
      activeReportContext: null,
      activeDatasetContext: null
    },
    {
      id: 'conv-5',
      title: 'Customer Feedback Migration',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 12),
      messages: [],
      status: 'planned',
      migrationState: {
        selectedDataset: catalogDatasets.find(d => d.dataset_id === 'DS-002')
      },
      activeReportContext: null,
      activeDatasetContext: catalogDatasets.find(d => d.dataset_id === 'DS-002') || null
    },
  ]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [flowState, setFlowState] = useState<string>('new');
  const [hoveredConvId, setHoveredConvId] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [isReportPanelOpen, setIsReportPanelOpen] = useState(false);
  const [activeReportContext, setActiveReportContext] = useState<any>(null);
  const [selectedDataset, setSelectedDataset] = useState<any>(null);
  const [isDatasetPanelOpen, setIsDatasetPanelOpen] = useState(false);
  const [activeDatasetContext, setActiveDatasetContext] = useState<any>(null);
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [createReportState, setCreateReportState] = useState<CreateReportState>({ step: null });
  const [migrationState, setMigrationState] = useState<MigrationState>({});
  const [multiSelectItems, setMultiSelectItems] = useState<string[]>([]);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [marketplaceSelectedDataset, setMarketplaceSelectedDataset] = useState<any>(null);
  const [marketplaceSearchQuery, setMarketplaceSearchQuery] = useState('');
  const [marketplaceFiltersOpen, setMarketplaceFiltersOpen] = useState(false);
  const [reportFilters, setReportFilters] = useState<Array<{id: string; dimension: string; operator: string; value: string}>>([]);
  const [selectedUserVolume, setSelectedUserVolume] = useState<string>('');
  const [selectedViewFrequency, setSelectedViewFrequency] = useState<string>('');
  const [layoutType, setLayoutType] = useState<'template' | 'custom' | 'reference' | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [customLayoutComponents, setCustomLayoutComponents] = useState<Array<{id: string; type: string; position: number; size: string}>>([]);
  const [referenceReportLink, setReferenceReportLink] = useState<string>('');
  const [referenceLayoutApplied, setReferenceLayoutApplied] = useState<boolean>(false);
  const [referenceReportName, setReferenceReportName] = useState<string>('');
  const [requestedReportIds, setRequestedReportIds] = useState<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'chart-added' | 'access-requested'>('chart-added');
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [qsFlowCard, setQsFlowCard] = useState<number | null>(null);
  const [qsFading, setQsFading] = useState(false);
  const [qsAnswerLoaded, setQsAnswerLoaded] = useState(false);
  const qsInputRef = useRef<HTMLTextAreaElement>(null);
  const [reportFlowCard, setReportFlowCard] = useState<{ report: any; idx: number } | null>(null);
  const [reportAnswerLoaded, setReportAnswerLoaded] = useState(false);
  const [qsAddToReportOpen, setQsAddToReportOpen] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [selectedExecutionPath, setSelectedExecutionPath] = useState<'open_source' | 'enterprise_bi'>('open_source');
  const [selectedEnterprisePlatform, setSelectedEnterprisePlatform] = useState<'Looker' | 'Qlik' | 'Tableau' | null>(null);
  const [enterpriseCostAcknowledged, setEnterpriseCostAcknowledged] = useState(false);
  const [addToReportChartId, setAddToReportChartId] = useState<string | null>(null);
  const [addToReportTarget, setAddToReportTarget] = useState<any | null>(null);
  const [showAddToReportConfirmation, setShowAddToReportConfirmation] = useState(false);
  const [addToReportBadge, setAddToReportBadge] = useState<Record<string, string>>({});
  const [chartRefinements, setChartRefinements] = useState<Record<string, { chartType: string; title: string; data: any[] }>>({});
  const [refinementInputs, setRefinementInputs] = useState<Record<string, string>>({});
  const chatEndRef = useRef<HTMLDivElement>(null);
  const messageCounterRef = useRef(0);
  const migrationRouteInitialized = useRef<string | null>(null);

  const { persona } = usePersona();
  const allReports = getAllReports();
  const allDatasets = getAllDatasets();
  const reportsCount = catalogReports.length;
  const datasetsCount = catalogDatasets.length;

  // Calculate recently used metrics (dummy logic: items updated in last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const recentReports = allReports.filter(r => r.last_updated_ts >= sevenDaysAgo);
  const recentDatasets = allDatasets.filter(d => d.last_refresh_ts >= sevenDaysAgo);
  const recentlyUsedCount = recentReports.length + recentDatasets.length;
  
  // Calculate new items since last visit (dummy logic: items created in last 3 days)
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  
  const newReports = allReports.filter(r => r.created_date && r.created_date >= threeDaysAgo);
  const newDatasets = allDatasets.filter(d => d.last_refresh_ts >= threeDaysAgo);
  const newItemsCount = newReports.length + newDatasets.length;

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Handle URL params for mode (create-report) and context (report, dataset)
  useEffect(() => {
    const mode = searchParams.get('mode');
    const context = searchParams.get('context');
    const reportId = searchParams.get('reportId');
    const datasetId = searchParams.get('datasetId');

    if (mode === 'create-report' && createReportState.step === null) {
      // Initialize create report flow
      initializeCreateReportFlow();
    } else if (context === 'report' && reportId) {
      // Handle report context from URL
      const report = catalogReports.find(r => r.report_id === reportId);
      if (report && !activeReportContext) {
        handleReportClick(report);
      }
    } else if (context === 'dataset' && datasetId) {
      // Handle dataset context from URL
      const dataset = catalogDatasets.find(d => d.dataset_id === datasetId);
      if (dataset && !activeDatasetContext) {
        handleDatasetClick(dataset);
      }
    }
  }, [searchParams]);

  // Detect migration routes and auto-initialize migration flow
  useEffect(() => {
    const pathname = location.pathname;
    const migrationId = params.migrationId;
    const routeKey = pathname + (migrationId || '');

    // Skip if we've already initialized this exact route
    if (migrationRouteInitialized.current === routeKey) {
      return;
    }

    // Check if we're on a migration route
    if (pathname.startsWith('/talk/migration')) {
      // Handle different migration routes
      if (pathname === '/talk/migration') {
        // Landing page - show migration overview
        migrationRouteInitialized.current = routeKey;
        initializeMigrationLanding();
      } else if (pathname === '/talk/migration/new') {
        // Create new migration session - always create regardless of active conversation
        migrationRouteInitialized.current = routeKey;
        initializeNewMigrationSession();
      } else if (migrationId) {
        if (activeConversationId !== migrationId) {
          // Load existing migration session only if it's different from current
          migrationRouteInitialized.current = routeKey;
          loadMigrationSession(migrationId);
        } else {
          // Already on this migration session, just mark as initialized
          migrationRouteInitialized.current = routeKey;
        }
      }
    } else {
      // Reset when not on migration route
      migrationRouteInitialized.current = null;
    }
  }, [location.pathname, params.migrationId, activeConversationId]);

  // Auto-save conversation whenever messages or report/dataset context changes
  useEffect(() => {
    if (activeConversationId && messages.length > 0) {
      autoSaveConversation();
    }
  }, [messages, activeReportContext, activeDatasetContext]);

  // Auto-handle preSelected options in Report Flow mode
  useEffect(() => {
    if (!isReportFlowMode) return;
    
    // Find the last message with preSelected data
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.renderType === 'create_report_step' && lastMessage?.data?.preSelected) {
      const preSelected = lastMessage.data.preSelected;
      // Auto-select and proceed after a short delay
      setTimeout(() => {
        handleCreateReportAction(preSelected);
      }, 800);
    }
  }, [messages, isReportFlowMode]);

  // Quick Summary flow data
  const qsFlowData = [
    {
      title: 'Campaign Performance Summary',
      subtitle: 'Your Q1 campaigns show 12% higher engagement compared to last quarter, with digital channels leading the growth.',
      answer: 'Based on your latest data, Q1 campaign performance is trending <strong>12% above Q4 benchmarks</strong>. Here\u2019s what stands out:<br><br>\u2022 <strong>Digital campaigns</strong> drove 68% of total engagement, up from 54% last quarter<br>\u2022 <strong>Email open rates</strong> improved to 28.3%, outperforming the 24% industry average<br>\u2022 <strong>Top performer</strong>: \u201cSpring Refresh\u201d campaign generated 3.2x ROI with a $45K spend<br>\u2022 <strong>Social channels</strong> saw a 19% increase in click-through rates, led by Instagram and LinkedIn<br><br>Overall, your marketing mix is well-optimized. The shift toward digital is paying off, though there\u2019s room to experiment with emerging channels.',
      chips: ['Which campaigns had the highest ROI?', 'Show me by channel', 'Compare to Q4'],
      placeholder: 'Ask a follow-up about campaign performance\u2026',
    },
    {
      title: 'Audience Growth Alert',
      subtitle: 'The Digital Natives segment grew 23% this month \u2014 your fastest-growing audience cohort.',
      answer: 'Your <strong>Digital Natives</strong> segment (ages 18\u201334, digitally engaged) has grown 23% month-over-month, making it your fastest-expanding audience. Key insights:<br><br>\u2022 <strong>Total segment size</strong>: 142K users, up from 115K last month<br>\u2022 <strong>Primary acquisition channels</strong>: Instagram (38%), TikTok (27%), organic search (19%)<br>\u2022 <strong>Engagement rate</strong>: 4.7x higher than your overall average<br>\u2022 <strong>Demographics</strong>: 62% urban, skewing slightly female (56/44)<br>\u2022 <strong>Revenue contribution</strong>: This segment now accounts for 18% of total revenue, up from 12%<br><br>This cohort responds well to short-form video and personalized recommendations. Consider increasing investment in these channels.',
      chips: ['Who makes up this segment?', 'How does it compare to other segments?', 'Show growth over time'],
      placeholder: 'Ask a follow-up about audience growth\u2026',
    },
    {
      title: 'Channel Mix Optimization',
      subtitle: 'Social is outperforming email by 2.1x on conversion rate \u2014 consider reallocating 15% of email budget.',
      answer: 'Your channel performance data reveals significant opportunities for optimization:<br><br>\u2022 <strong>Social media conversion rate</strong>: 3.8% (up 0.6pp from last quarter)<br>\u2022 <strong>Email conversion rate</strong>: 1.8% (flat quarter-over-quarter)<br>\u2022 <strong>Paid search</strong>: 2.4% conversion, CPA down 12% \u2014 your most efficient paid channel<br>\u2022 <strong>Display</strong>: Underperforming at 0.9% conversion, high impression volume but low intent<br><br><strong>Recommendation</strong>: Shift 15% of email budget ($12K/month) toward social and paid search. Modeling suggests this could increase overall conversions by 8\u201311% without increasing total spend.<br><br>The email channel still delivers strong ROI for retention \u2014 focus it there while letting social handle acquisition.',
      chips: ['Break down by platform', 'What\u2019s the email open rate?', 'Show conversion funnel'],
      placeholder: 'Ask a follow-up about channel optimization\u2026',
    },
    {
      title: 'Budget Utilization',
      subtitle: '67% of Q1 budget deployed with 8% running under plan \u2014 no overspend categories detected.',
      answer: 'Here\u2019s your Q1 budget utilization breakdown as of today:<br><br>\u2022 <strong>Total budget</strong>: $480K &nbsp;|&nbsp; <strong>Deployed</strong>: $322K (67%) &nbsp;|&nbsp; <strong>Remaining</strong>: $158K<br>\u2022 <strong>On track</strong>: Content marketing ($85K/$120K), Events ($42K/$60K)<br>\u2022 <strong>Under plan</strong> (\u22128%): Paid media has spent $128K of $160K target \u2014 pacing 8% behind schedule<br>\u2022 <strong>Over-performing ROI</strong>: Influencer partnerships delivering 4.1x ROAS vs 2.5x target<br>\u2022 <strong>No overspend</strong> detected in any category<br><br><strong>Forecast</strong>: At current pace, you\u2019ll end Q1 with ~$38K unspent. The paid media gap presents an opportunity \u2014 reallocating even $20K toward high-performing social campaigns could yield an estimated $82K in incremental revenue.',
      chips: ['Where is the remaining budget allocated?', 'Show spend by team', 'Forecast end-of-quarter'],
      placeholder: 'Ask a follow-up about budget utilization\u2026',
    },
  ];

  const handleQsFlowEnter = (idx: number) => {
    setQsFading(true);
    setTimeout(() => {
      setQsFlowCard(idx);
      setQsAnswerLoaded(false);
      window.history.pushState({ qsFlow: true }, '');
      requestAnimationFrame(() => {
        setQsFading(false);
        setTimeout(() => setQsAnswerLoaded(true), 800);
      });
    }, 200);
  };

  const handleQsFlowExit = () => {
    setQsFading(true);
    setTimeout(() => {
      setQsFlowCard(null);
      requestAnimationFrame(() => setQsFading(false));
    }, 200);
  };

  const handleQsFlowSend = (text: string) => {
    setQsFlowCard(null);
    setQsFading(false);
    handleStarterPillClick(text);
  };

  const handleReportFlowEnter = (report: any, idx: number) => {
    setQsFading(true);
    setTimeout(() => {
      setReportFlowCard({ report, idx });
      setReportAnswerLoaded(false);
      requestAnimationFrame(() => {
        setQsFading(false);
        setTimeout(() => setReportAnswerLoaded(true), 800);
      });
    }, 200);
  };

  // Browser back button support for QS flow
  useEffect(() => {
    const onPopState = () => {
      if (qsFlowCard !== null) {
        setQsFlowCard(null);
        setQsFading(false);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [qsFlowCard]);

  const autoSaveConversation = () => {
    if (!activeConversationId) return;
    
    setConversations(prev => 
      prev.map(conv => 
        conv.id === activeConversationId
          ? {
              ...conv,
              messages: [...messages],
              timestamp: new Date(),
              activeReportContext: activeReportContext,
              activeDatasetContext: activeDatasetContext,
              createReportState: createReportState.step ? createReportState : undefined,
              migrationState: migrationState.selectedDataset ? migrationState : undefined,
              status: migrationState.selectedDataset ? 'planned' : conv.status
            }
          : conv
      )
    );
  };

  const generateConversationTitle = (firstMessage: string): string => {
    const msg = firstMessage.toLowerCase();
    
    // Handle report exploration - extract report name
    if (msg.startsWith('explore ') && !msg.includes('reports') && !msg.includes('datasets')) {
      // Extract the report name (e.g., "Explore Territory Performance Overview")
      const reportName = firstMessage.replace(/^Explore /i, '').trim();
      return reportName;
    }
    
    // Standard patterns
    if (msg.includes('create') || msg.includes('new report')) {
      return 'Create new report';
    } else if (msg.includes('explore') && msg.includes('report')) {
      return 'Explore reports';
    } else if (msg.includes('explore') && msg.includes('dataset')) {
      return 'Explore datasets';
    } else if (msg.includes('migrate') || msg.includes('migration')) {
      return 'Dataset Migration';
    } else if (msg.includes('my reports')) {
      return 'My Reports';
    } else if (msg.includes('my datasets')) {
      return 'My Datasets';
    }
    
    // Fallback - truncate long messages
    return firstMessage.slice(0, 40) + (firstMessage.length > 40 ? '...' : '');
  };

  const handleNewConversation = () => {
    // Auto-save current conversation before creating new one
    if (activeConversationId && messages.length > 0) {
      autoSaveConversation();
    }
    
    setActiveConversationId(null);
    setFlowState('new');
    setSelectedDataset(null);
    setSelectedReport(null);
    setIsReportPanelOpen(false);
    setIsDatasetPanelOpen(false);
    setActiveReportContext(null);
    setActiveDatasetContext(null);
    setMessages([]);
    setInputValue('');
    setCreateReportState({ step: null });
    setMigrationState({});
    setSearchParams({});
  };

  const handleLoadConversation = (conv: Conversation) => {
    // Auto-save current conversation before switching
    if (activeConversationId && messages.length > 0) {
      autoSaveConversation();
    }
    
    setActiveConversationId(conv.id);
    setFlowState('active');
    
    // Restore all conversation state
    setMessages(conv.messages);
    
    // Restore report context if it exists
    if (conv.activeReportContext) {
      setActiveReportContext(conv.activeReportContext);
      setSelectedReport(conv.activeReportContext);
      setIsReportPanelOpen(true);
      setIsDatasetPanelOpen(false);
    } else {
      setActiveReportContext(null);
      setSelectedReport(null);
      setIsReportPanelOpen(false);
    }
    
    // Restore dataset context if it exists
    if (conv.activeDatasetContext) {
      setActiveDatasetContext(conv.activeDatasetContext);
      setSelectedDataset(conv.activeDatasetContext);
      setIsDatasetPanelOpen(true);
      setIsReportPanelOpen(false);
    } else {
      setActiveDatasetContext(null);
      setSelectedDataset(null);
      setIsDatasetPanelOpen(false);
    }
    
    // Restore create report state if it exists (for draft reports)
    if (conv.createReportState) {
      setCreateReportState(conv.createReportState);
      setSearchParams({ mode: 'create-report' });
    } else {
      setCreateReportState({ step: null });
      setSearchParams({});
    }
    
    // Restore migration state if it exists (for migration sessions)
    if (conv.migrationState) {
      setMigrationState(conv.migrationState);
      setFlowState('migration');
      // If migration has a selected dataset, open the dataset panel
      if (conv.migrationState.selectedDataset) {
        setSelectedDataset(conv.migrationState.selectedDataset);
        setActiveDatasetContext(conv.migrationState.selectedDataset);
        setIsDatasetPanelOpen(true);
        setIsReportPanelOpen(false);
      }
    } else {
      setMigrationState({});
    }
  };

  const handleDeleteConversation = (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversations(prev => prev.filter(c => c.id !== convId));
    if (activeConversationId === convId) {
      handleNewConversation();
    }
  };

  const handleStartEdit = (convId: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingConvId(convId);
    setEditingTitle(currentTitle);
  };

  const handleSaveEdit = (convId: string) => {
    if (editingTitle.trim()) {
      setConversations(prev =>
        prev.map(conv =>
          conv.id === convId ? { ...conv, title: editingTitle.trim() } : conv
        )
      );
    }
    setEditingConvId(null);
    setEditingTitle('');
  };

  const handleCopyMigrationLink = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Build the deep link URL
    const baseUrl = window.location.origin;
    let deepLink = `${baseUrl}/talk/migration/${conv.id}`;
    
    // Add query parameters if migration has a plan
    if (conv.migrationState?.selectedDataset) {
      deepLink += `?plan=true`;
    }
    
    // Copy to clipboard
    navigator.clipboard.writeText(deepLink).then(() => {
      setCopiedLinkId(conv.id);
      setTimeout(() => setCopiedLinkId(null), 2000);
    });
  };

  const handleCancelEdit = () => {
    setEditingConvId(null);
    setEditingTitle('');
  };

  const addUserMessage = (content: string, isFirstMessage: boolean = false) => {
    messageCounterRef.current += 1;
    const userMsg: Message = {
      id: `msg-${Date.now()}-${messageCounterRef.current}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'user',
      content,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    
    // Create history item on first message
    if (isFirstMessage && flowState === 'new') {
      const newConv: Conversation = {
        id: `conv-${Date.now()}`,
        title: generateConversationTitle(content),
        timestamp: new Date(),
        messages: [userMsg],
      };
      setConversations(prev => [newConv, ...prev]);
      setActiveConversationId(newConv.id);
      setFlowState('active');
    }
  };

  const addAssistantMessage = (content: string, renderType: string = 'text', data: any = null) => {
    messageCounterRef.current += 1;
    const assistantMsg: Message = {
      id: `msg-${Date.now()}-${messageCounterRef.current}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'assistant',
      content,
      renderType: renderType as any,
      data,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, assistantMsg]);
  };

  const handleContextCardClick = (action: string) => {
    const isFirstMessage = flowState === 'new';
    addUserMessage(action, isFirstMessage);
    setIsGenerating(true);

    setTimeout(() => {
      setIsGenerating(false);

      if (action.includes('My Reports')) {
        addAssistantMessage(
          'Here are the reports you have access to.\nThese reports come from multiple analytics platforms connected through Report Hub.',
          'reports_list',
          { reports: allReports.slice(0, 7), showActions: true }
        );
      } else if (action.includes('My Datasets')) {
        addAssistantMessage(
          `You have ${datasetsCount} datasets available for analysis.`,
          'datasets_list',
          allDatasets
        );
      } else if (action.includes('Recently Used')) {
        addAssistantMessage(
          "Here's what you were working on recently.",
          'reports_list',
          { reports: allReports.slice(0, 3), showActions: false }
        );
      } else if (action.includes('New Since Last Visit')) {
        addAssistantMessage(
          "Here are the newest additions to your workspace.",
          'datasets_list',
          allDatasets.slice(0, 3)
        );
      }
    }, 600);
  };

  const handleStarterPillClick = (action: string) => {
    const isFirstMessage = flowState === 'new';
    addUserMessage(action, isFirstMessage);
    setIsGenerating(true);

    setTimeout(() => {
      setIsGenerating(false);

      if (action.toLowerCase().includes('explore my reports')) {
        addAssistantMessage(
          'Here are the reports you have access to.\nThese reports come from multiple analytics platforms connected through Report Hub.',
          'reports_list',
          { reports: allReports.slice(0, 7), showActions: true }
        );
      } else if (action.toLowerCase().includes('explore my datasets')) {
        addAssistantMessage(
          `You have ${datasetsCount} datasets available for analysis.`,
          'datasets_list',
          allDatasets
        );
      } else if (action.toLowerCase().includes('create a new report')) {
        // Navigate to the standalone report flow page
        navigate('/report-flow');
      } else if (action.toLowerCase().includes('request a migration')) {
        // Navigate to migration landing page which will handle new session creation
        navigate('/talk/migration');
      } else if (action.toLowerCase().includes('ask a business question')) {
        // Business question flow
        addAssistantMessage(
          'I can help answer high-level business questions using your available reports and datasets. What would you like to understand?',
          'report_context_prompts',
          {
            prompts: [
              'How is overall sales performance trending?',
              'Which regions or segments are underperforming?',
              'Are there any early warning signs I should be aware of?',
              'What are the main drivers behind recent revenue changes?',
              'Where are the biggest growth opportunities right now?',
              'Which reports can help answer this?'
            ]
          }
        );
      } else if (action.toLowerCase().includes('how are my campaigns performing')) {
        addAssistantMessage(
          "Here's your Q1 campaign performance overview:\n\n**Overall Performance:**\n• Total campaigns active: 12\n• Average engagement rate: 4.8% (up 12% from last quarter)\n• Total impressions: 2.3M\n• Click-through rate: 3.2%\n\n**Top Performing Campaigns:**\n1. **Spring Product Launch** — 6.1% engagement, 45K conversions\n2. **Brand Awareness Push** — 5.4% engagement, 32K conversions\n3. **Retargeting Series** — 4.9% engagement, 28K conversions\n\n**Key Insight:** Social media channels are outperforming email by 2.3x on conversions this quarter.",
          'inline_chart',
          {
            chartType: 'bar',
            title: 'Campaign Performance — Q1',
            reportName: 'Campaign Performance Summary',
            datasetName: 'Marketing Campaigns',
            data: [
              { category: 'Spring Launch', value: 45000 },
              { category: 'Brand Awareness', value: 32000 },
              { category: 'Retargeting', value: 28000 },
              { category: 'Email Nurture', value: 18000 },
              { category: 'Social Ads', value: 22000 },
              { category: 'Content Series', value: 15000 },
            ]
          }
        );
      } else if (action.toLowerCase().includes('audience segmentation breakdown')) {
        addAssistantMessage(
          "Here's your audience segmentation breakdown. The **Digital Natives** segment has grown 34% this month and now represents your largest audience group.",
          'inline_chart',
          {
            chartType: 'pie',
            title: 'Audience Segmentation Breakdown',
            reportName: 'Audience Insights',
            datasetName: 'Customer Segments',
            data: [
              { category: 'Digital Natives', value: 34 },
              { category: 'Loyal Customers', value: 26 },
              { category: 'Price Sensitive', value: 18 },
              { category: 'Brand Advocates', value: 14 },
              { category: 'New Prospects', value: 8 },
            ]
          }
        );
      } else if (action.toLowerCase().includes('marketing roi trend')) {
        addAssistantMessage(
          "**Marketing ROI Trend Analysis:**\n\nYour marketing ROI has been trending upward over the past 6 months.\n\n• **Current ROI:** 3.8x (up from 3.1x last quarter)\n• **Best performing channel:** Social Media at 5.2x ROI\n• **Most improved:** Content Marketing, up 45% quarter-over-quarter\n• **Budget efficiency:** 92% of spend allocated to channels with >2x ROI\n\nRecommendation: Consider reallocating 10-15% of email budget to social channels for maximum impact.",
          'text'
        );
      } else if (action.toLowerCase().includes('channels are driving the most conversions')) {
        addAssistantMessage(
          "**Channel Conversion Analysis:**\n\n1. **Social Media** — 38% of total conversions (↑ 15% MoM)\n2. **Paid Search** — 27% of total conversions (↑ 3% MoM)\n3. **Email Marketing** — 19% of total conversions (↓ 5% MoM)\n4. **Content/SEO** — 11% of total conversions (↑ 8% MoM)\n5. **Display Ads** — 5% of total conversions (flat)\n\n**Key Insight:** Social media has overtaken paid search as the #1 conversion driver for the first time this quarter.",
          'text'
        );
      } else if (action.toLowerCase().includes('compare campaign performance across regions')) {
        addAssistantMessage(
          "**Regional Campaign Performance Comparison:**\n\n• **North America:** 4.9% engagement rate, $1.2M revenue attributed\n• **Europe:** 4.2% engagement rate, $890K revenue attributed\n• **APAC:** 5.3% engagement rate, $670K revenue attributed\n• **LATAM:** 3.8% engagement rate, $340K revenue attributed\n\n**Insight:** APAC shows the highest engagement rate despite lower total spend. Consider increasing APAC budget allocation for better ROI.",
          'text'
        );
      } else if (action.toLowerCase().includes('customer acquisition cost trends')) {
        addAssistantMessage(
          "**Customer Acquisition Cost (CAC) Trends:**\n\n• **Current CAC:** $42 (down from $48 last quarter)\n• **6-month trend:** Steady decline of ~8% per quarter\n• **Lowest CAC channel:** Organic/SEO at $12 per acquisition\n• **Highest CAC channel:** Display Ads at $78 per acquisition\n\n**LTV:CAC Ratio:** 4.2x (healthy range, up from 3.6x)\n\nRecommendation: Your acquisition costs are trending favorably. The shift to content-led strategies is paying off.",
          'text'
        );
      } else {
        addAssistantMessage(
          "I can help you explore your reports and datasets, create new reports, or assist with migrations. What would you like to do?",
          'text'
        );
      }
    }, 600);
  };

  const handleChartRefinement = (messageId: string, prompt: string, originalData: any) => {
    const lowerPrompt = prompt.toLowerCase();
    let newChartType = originalData.chartType;
    let newTitle = originalData.title;
    let newData = originalData.data;

    // Switch chart type
    if (lowerPrompt.includes('bar chart') || lowerPrompt.includes('bar graph')) {
      newChartType = 'bar';
      newTitle = originalData.title + ' (Bar View)';
    } else if (lowerPrompt.includes('pie chart') || lowerPrompt.includes('pie')) {
      newChartType = 'pie';
      newTitle = originalData.title + ' (Distribution)';
    } else if (lowerPrompt.includes('line chart') || lowerPrompt.includes('line graph') || lowerPrompt.includes('trend')) {
      newChartType = 'line';
      newTitle = originalData.title + ' (Trend View)';
    }

    // Filter data
    if (lowerPrompt.includes('q1') || lowerPrompt.includes('first quarter')) {
      newData = originalData.data.slice(0, Math.ceil(originalData.data.length / 4));
      newTitle = newTitle.replace(/\)$/, '') + (newTitle.includes('(') ? ' - Q1)' : ' (Q1)');
    } else if (lowerPrompt.includes('top 5') || lowerPrompt.includes('top five')) {
      newData = originalData.data.slice(0, 5);
      newTitle = newTitle.replace(/\)$/, '') + (newTitle.includes('(') ? ' - Top 5)' : ' (Top 5)');
    } else if (lowerPrompt.includes('last 3') || lowerPrompt.includes('last three')) {
      newData = originalData.data.slice(-3);
    }

    setChartRefinements(prev => ({
      ...prev,
      [messageId]: { chartType: newChartType, title: newTitle, data: newData }
    }));
    setRefinementInputs(prev => ({ ...prev, [messageId]: '' }));
  };

  const handleAddChartToReport = (messageId: string) => {
    setAddToReportChartId(messageId);
    setAddToReportTarget(null);
    setShowAddToReportConfirmation(false);
  };

  const handleSelectReportForChart = (report: any) => {
    setAddToReportTarget(report);
    setShowAddToReportConfirmation(true);

    // After 2 seconds, auto-dismiss to show persistent badge
    setTimeout(() => {
      setShowAddToReportConfirmation(false);
      setAddToReportBadge(prev => ({
        ...prev,
        [addToReportChartId || '']: report.report_name || report.name || 'Report',
      }));
      setAddToReportChartId(null);
      setAddToReportTarget(null);
    }, 2000);
  };

  const handleDatasetSelect = (dataset: any) => {
    setSelectedDataset(dataset);
    addUserMessage(dataset.dataset_name);
    setIsGenerating(true);

    setTimeout(() => {
      setIsGenerating(false);
      addAssistantMessage(
        "What do you want to understand from this data?",
        'option_chips',
        ['Trends over time', 'Performance by geography', 'Comparison by device', 'Customer satisfaction']
      );
    }, 600);
  };

  // ===== OLD FLOW - DEPRECATED =====
  // These functions created inline chart previews in chat
  // All create report flows now use handleCreateReportAction and right panel preview
  
  // const handleOptionSelect = (option: string) => {
  //   // DEPRECATED - DO NOT USE
  // };

  // const handleTimePeriodSelect = (period: string) => {
  //   // DEPRECATED - DO NOT USE
  //   // Previously created inline chart_preview - now disabled
  // };

  const handleReportClick = (report: any) => {
    setSelectedReport(report);
    setIsReportPanelOpen(true);
    setActiveReportContext(report);
    
    // Add user message (check if this is the first message in a new conversation)
    const isFirstMessage = flowState === 'new' && messages.length === 0;
    addUserMessage(`Explore ${report.report_name}`, isFirstMessage);
    setIsGenerating(true);

    setTimeout(() => {
      setIsGenerating(false);
      // Add context update message with suggested prompts (7 actions total)
      addAssistantMessage(
        `You're now exploring **${report.report_name}**.\nWhat would you like to know about this report?`,
        'report_context_prompts',
        {
          prompts: [
            'Describe this report',
            'Give me a summary',
            'What are the key insights?',
            'What changed recently?',
            'Show trends over time',
            'Show a pie chart',
            'Show all my reports'
          ]
        }
      );
    }, 600);
  };

  const handleReportCardClick = (report: any, e: React.MouseEvent) => {
    e.preventDefault();
    handleReportClick(report);
  };

  const handleCloseReportPanel = () => {
    setIsReportPanelOpen(false);
    setSelectedReport(null);
  };

  const handleCloseDatasetPanel = () => {
    setIsDatasetPanelOpen(false);
    
    // For migration sessions, add recovery action if dataset was selected
    if (flowState === 'migration' && selectedDataset && migrationState.selectedDataset) {
      // Add a message with action to reopen the dataset panel
      addAssistantMessage(
        `Dataset panel closed. You can continue planning the migration for **${selectedDataset.dataset_name}**.`,
        'migration_pills',
        {
          pills: [
            'View dataset details',
            'Generate migration plan',
            'Show connected reports',
            'Check data quality & freshness',
          ]
        }
      );
    }
    
    setSelectedDataset(null);
  };

  // ===== MIGRATION FLOW FUNCTIONS =====
  
  const handleMigrationDatasetSelect = (dataset: any) => {
    setMigrationState({ ...migrationState, selectedDataset: dataset });
    setSelectedDataset(dataset);
    setIsDatasetPanelOpen(true);
    setActiveDatasetContext(dataset);
    
    addUserMessage(dataset.dataset_name);
    setIsGenerating(true);

    setTimeout(() => {
      setIsGenerating(false);
      
      // Update conversation title to include dataset name
      if (activeConversationId) {
        setConversations(prev =>
          prev.map(conv =>
            conv.id === activeConversationId
              ? { 
                  ...conv, 
                  title: `Migrate ${dataset.dataset_name}`,
                  migrationState: { selectedDataset: dataset }, 
                  status: 'planned' 
                }
              : conv
          )
        );
      }
      
      // Step 1: Select source platform
      addAssistantMessage(
        'Select the source platform.',
        'text'
      );
      
      setTimeout(() => {
        addAssistantMessage(
          'Choose the platform where the report you want to migrate currently lives.',
          'migration_platform_selection',
          {
            dataset,
            selectionType: 'source',
            platforms: [
              { 
                name: 'Tableau', 
                description: 'Visual analytics and business intelligence platform',
                icon: '📈'
              },
              { 
                name: 'Power BI', 
                description: 'Microsoft business analytics and visualization',
                icon: '📊'
              },
              { 
                name: 'Qlik', 
                description: 'Qlik Sense enterprise analytics and associative engine',
                icon: '🔍'
              },
              { 
                name: 'Report Hub', 
                description: 'Existing Report Hub reports or dashboards',
                icon: '🎯'
              },
            ]
          }
        );
      }, 400);
    }, 600);
  };

  // Helper to handle source platform selection (NEW STEP 1)
  const handleSourcePlatformSelect = (platform: string) => {
    const dataset = migrationState.selectedDataset;
    setMigrationState({ ...migrationState, sourcePlatform: platform });
    
    addUserMessage(platform);
    setIsGenerating(true);

    setTimeout(() => {
      setIsGenerating(false);
      
      // Move to next step - select report to migrate
      addAssistantMessage(
        `Source platform: **${platform}**. Next, select the report you want to migrate.`,
        'text'
      );
      
      // TODO: Add report selection UI here
    }, 600);
  };

  // Helper function to generate platform-specific data preview
  const generateDataPreview = (sourcePlatform: string, targetPlatform: string) => {
    // Sample data structure based on platform
    const platformFormats: Record<string, any> = {
      'Qlik': {
        formatLabel: 'Qlik Sense App (QVD)',
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200',
        textColor: 'text-green-800',
        sampleQuery: 'LOAD * FROM [lib://Data/Sales_Transactions.qvd] (qvd);',
        dataFormat: [
          { field: 'TransactionID', type: 'String', sample: 'TXN-2024-0001' },
          { field: 'OrderDate', type: 'Timestamp', sample: '2024-01-15 14:32:00' },
          { field: 'Amount', type: 'Money', sample: '$1,250.00' },
          { field: 'CustomerID', type: 'String', sample: 'CUST-12345' },
        ],
        features: ['Associative Engine', 'Set Analysis', 'Master Items']
      },
      'Looker': {
        formatLabel: 'Looker Explore (LookML)',
        bgColor: 'bg-purple-50',
        borderColor: 'border-purple-200',
        textColor: 'text-purple-800',
        sampleQuery: 'explore: sales_transactions { label: "Sales Transactions" }',
        dataFormat: [
          { field: 'transaction_id', type: 'string', sample: 'TXN-2024-0001' },
          { field: 'order_date', type: 'time', sample: '2024-01-15 14:32:00' },
          { field: 'amount', type: 'number', sample: '1250.00' },
          { field: 'customer_id', type: 'string', sample: 'CUST-12345' },
        ],
        features: ['LookML Modeling', 'Derived Tables', 'Symmetric Aggregates']
      },
      'Tableau': {
        formatLabel: 'Tableau Workbook (TWBX)',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200',
        textColor: 'text-blue-800',
        sampleQuery: 'EVALUATE [Sales] BY [Category]',
        dataFormat: [
          { field: 'TransactionID', type: 'String', sample: 'TXN-2024-0001' },
          { field: 'OrderDate', type: 'Date', sample: '2024-01-15' },
          { field: 'Amount', type: 'Decimal', sample: '1250.00' },
          { field: 'CustomerID', type: 'String', sample: 'CUST-12345' },
        ],
        features: ['LOD Expressions', 'Data Blending', 'Calculated Fields']
      }
    };

    return {
      source: platformFormats[sourcePlatform] || platformFormats['Qlik'],
      target: platformFormats[targetPlatform] || platformFormats['Looker']
    };
  };

  const handleMigrationIntentSelect = (intent: 'create_new' | 'migrate_existing') => {
    const dataset = migrationState.selectedDataset;
    setMigrationState({ ...migrationState, migrationIntent: intent });
    
    const intentLabel = intent === 'create_new' 
      ? 'Create a new report in the destination' 
      : 'Migrate an existing report';
    
    addUserMessage(intentLabel);
    setIsGenerating(true);

    setTimeout(() => {
      setIsGenerating(false);
      
      // Update conversation state with intent selection
      if (activeConversationId) {
        setConversations(prev =>
          prev.map(conv =>
            conv.id === activeConversationId
              ? { 
                  ...conv,
                  migrationState: { 
                    selectedDataset: dataset,
                    migrationIntent: intent
                  }
                }
              : conv
          )
        );
      }
      
      // Step 2: Show target platform selection
      const recommendedPlatform = dataset.migration_target_recommendation || 'Snowflake';
      const recommendationReason = dataset.migration_recommendation_reason || 'Best suited for your data volume and query patterns';
      
      const platforms = [
        { 
          name: 'Looker', 
          description: 'Google Cloud business intelligence and data modeling',
          icon: '🔍'
        },
        { 
          name: 'Qlik', 
          description: 'Qlik Sense enterprise analytics and associative engine',
          icon: '📊'
        },
        { 
          name: 'Tableau', 
          description: 'Visual analytics and business intelligence platform',
          icon: '📈'
        },
      ];
      
      addAssistantMessage(
        `Great! Now let's choose where to migrate **${dataset.dataset_name}**. Select your target platform:`,
        'migration_platform_selection',
        {
          dataset,
          platforms,
          recommendedPlatform,
          recommendationReason
        }
      );
    }, 600);
  };

  const handleMigrationPlatformSelect = (platform: string) => {
    const dataset = migrationState.selectedDataset;
    setMigrationState({ ...migrationState, targetPlatform: platform });
    
    addUserMessage(platform);
    setIsGenerating(true);

    setTimeout(() => {
      setIsGenerating(false);
      
      // Update conversation state with platform selection
      if (activeConversationId) {
        setConversations(prev =>
          prev.map(conv =>
            conv.id === activeConversationId
              ? { 
                  ...conv,
                  migrationState: { 
                    selectedDataset: dataset,
                    targetPlatform: platform 
                  }
                }
              : conv
          )
        );
      }
      
      addAssistantMessage(
        `Perfect! I'll prepare a migration plan for **${dataset.dataset_name}** to **${platform}**. What would you like to do next?`,
        'migration_pills',
        {
          pills: [
            'Generate migration plan',
            'Show connected reports',
            'Check data quality & freshness',
            'Identify breaking changes',
            'Estimate downtime',
            'Run validation checks',
          ]
        }
      );
    }, 600);
  };

  const handleMigrationPillClick = (pill: string) => {
    addUserMessage(pill);
    setIsGenerating(true);

    setTimeout(() => {
      setIsGenerating(false);
      const dataset = migrationState.selectedDataset;

      if (pill.toLowerCase().includes('view dataset details')) {
        // Reopen the dataset panel
        if (dataset) {
          setSelectedDataset(dataset);
          setActiveDatasetContext(dataset);
          setIsDatasetPanelOpen(true);
          addAssistantMessage(
            `Reopening **${dataset.dataset_name}** details panel.`,
            'text'
          );
        }
      } else if (pill.toLowerCase().includes('generate migration plan')) {
        const targetPlatform = migrationState.targetPlatform || dataset.migration_target_recommendation || 'Looker';
        addAssistantMessage(
          `Here's the migration plan for **${dataset.dataset_name}** to **${targetPlatform}**:`,
          'migration_plan',
          { dataset, targetPlatform }
        );
        
        // Add follow-up actions after showing the plan
        setTimeout(() => {
          addAssistantMessage(
            'What would you like to do next with this migration plan?',
            'migration_pills',
            {
              pills: [
                'Run validation checks',
                'Estimate downtime',
                'Check data quality & freshness',
                'Show connected reports',
                'Export migration plan',
              ]
            }
          );
        }, 1200);
      } else if (pill.toLowerCase().includes('connected reports')) {
        const reports = dataset.connected_reports || [];
        addAssistantMessage(
          `**${dataset.dataset_name}** has ${reports.length} connected ${reports.length === 1 ? 'report' : 'reports'}: ${reports.map((r: any) => r.report_name).join(', ')}`,
          'text'
        );
        
        // Add suggested next steps
        setTimeout(() => {
          addAssistantMessage(
            'What would you like to do next?',
            'migration_pills',
            {
              pills: [
                'Generate migration plan',
                'Run validation checks',
                'Check data quality & freshness',
                'Estimate downtime',
              ]
            }
          );
        }, 800);
      } else if (pill.toLowerCase().includes('data quality')) {
        const health = dataset.dataset_health;
        addAssistantMessage(
          `Data Quality Check:\n• Freshness: ${health.freshness_status}\n• Quality Score: ${health.quality_score}/100\n• Null Rate: ${((dataset.null_rate || 0) * 100).toFixed(1)}%\n• Duplication Rate: ${((dataset.duplication_rate || 0) * 100).toFixed(2)}%`,
          'text'
        );
        
        // Add suggested next steps
        setTimeout(() => {
          const qualityScore = health.quality_score || 0;
          const isHealthy = qualityScore >= 80;
          
          addAssistantMessage(
            isHealthy 
              ? 'Data quality looks good! What would you like to do next?'
              : 'Consider addressing data quality issues before migration. What would you like to do next?',
            'migration_pills',
            {
              pills: isHealthy 
                ? [
                    'Generate migration plan',
                    'Run validation checks',
                    'Show connected reports',
                    'Estimate downtime',
                  ]
                : [
                    'Identify data quality issues',
                    'Generate migration plan',
                    'Run validation checks',
                    'Show connected reports',
                  ]
            }
          );
        }, 800);
      } else if (pill.toLowerCase().includes('breaking changes')) {
        addAssistantMessage(
          'Schema analysis shows no breaking changes expected. Field types and relationships are compatible with the target platform.',
          'text'
        );
      } else if (pill.toLowerCase().includes('estimate downtime')) {
        const effort = dataset.migration_readiness?.estimated_effort || 'Medium';
        const downtime = effort === 'Small' ? '2-4 hours' : effort === 'Medium' ? '6-8 hours' : '12-24 hours';
        addAssistantMessage(
          `Estimated downtime: ${downtime}. Recommended window: ${dataset.migration_readiness?.migration_window_recommendation}`,
          'text'
        );
        
        // Add suggested next steps
        setTimeout(() => {
          addAssistantMessage(
            'Ready to proceed? Here are the next steps:',
            'migration_pills',
            {
              pills: [
                'Generate migration plan',
                'Run validation checks',
                'Check data quality & freshness',
                'Show connected reports',
              ]
            }
          );
        }, 800);
      } else if (pill.toLowerCase().includes('validation')) {
        addAssistantMessage(
          `Running validation checks for **${dataset.dataset_name}**...`,
          'migration_validation',
          { dataset }
        );
        
        // Add suggested next steps after validation
        setTimeout(() => {
          const readinessScore = dataset.migration_readiness?.readiness_score || 0;
          const passed = readinessScore >= 70;
          
          addAssistantMessage(
            passed 
              ? 'Validation successful! Ready to start the migration?'
              : 'Please review the validation results. What would you like to do next?',
            'migration_pills',
            {
              pills: passed 
                ? [
                    'Start migration',
                    'Export migration plan',
                    'Schedule migration',
                    'Notify stakeholders',
                  ]
                : [
                    'Review blockers',
                    'Check data quality & freshness',
                    'Show connected reports',
                    'Export migration plan',
                  ]
            }
          );
        }, 1500);
      } else if (pill.toLowerCase().includes('export migration plan')) {
        // Generate a downloadable migration plan summary
        const migrationPlan = {
          dataset_name: dataset.dataset_name,
          dataset_id: dataset.dataset_id,
          target_platform: dataset.migration_target_recommendation || 'Snowflake',
          schema_tables_count: dataset.schema_tables_count || 3,
          field_count: dataset.field_count || 0,
          estimated_effort: dataset.migration_readiness?.estimated_effort || 'Medium',
          migration_window: dataset.migration_readiness?.migration_window_recommendation || 'Off-peak hours',
          readiness_score: dataset.migration_readiness?.readiness_score || 0,
          checklist: [
            'Backup source data',
            'Verify credentials and permissions',
            'Notify stakeholders of migration window',
            'Review schema mappings',
          ],
          generated_at: new Date().toISOString()
        };
        
        const dataStr = JSON.stringify(migrationPlan, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        const exportFileDefaultName = `migration-plan-${dataset.dataset_name.replace(/\s+/g, '-').toLowerCase()}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
        
        addAssistantMessage(
          `✅ Migration plan for **${dataset.dataset_name}** has been exported. You can share this file with your team or upload it to execute the migration.`,
          'text'
        );
      } else if (pill.toLowerCase().includes('start migration')) {
        const targetPlatform = migrationState.targetPlatform || dataset.migration_target_recommendation || 'Snowflake';
        const effort = dataset.migration_readiness?.estimated_effort || 'Medium';
        const estimatedHours = effort === 'Small' ? '2-4' : effort === 'Medium' ? '6-8' : '12-24';
        const estimatedMinutes = effort === 'Small' ? 180 : effort === 'Medium' ? 420 : 900; // mid-point in minutes
        
        // Show structured migration start message
        addAssistantMessage(
          `## ✅ Migration Initiated Successfully\n\nYour migration has been started for **${dataset.dataset_name}** to **${targetPlatform}**.\n\n### Migration Details\n\n**Estimated completion:** ${estimatedHours} hours (approximately ${Math.floor(estimatedMinutes / 60)} hours ${estimatedMinutes % 60} minutes)\n\n**Migration Process:**\n1. **Asset Assessment** - Analyzing dataset structure and dependencies\n2. **Data Extraction** - Extracting data from source platform\n3. **Schema Mapping** - Transforming schema to target platform format\n4. **Data Transfer** - Migrating data with validation\n5. **Connection Updates** - Updating report connections and references\n6. **Final Validation** - Ensuring data integrity and completeness\n\n---\n\n**✓** Your migration has been queued and is now in progress.\n\n**ℹ️** You can view detailed progress and updates at any time from the **Migration** tab in the navigation menu.`,
          'text'
        );
        
        setTimeout(() => {
          addAssistantMessage(
            'What would you like to do next?',
            'migration_pills',
            {
              pills: [
                'Monitor migration progress',
                'View migration logs',
                'Notify stakeholders',
                'Export migration plan',
              ]
            }
          );
        }, 1200);
      } else if (pill.toLowerCase().includes('monitor migration progress')) {
        // Navigate to the Migration tab
        addAssistantMessage(
          `Opening the Migration tab where you can track real-time progress...`,
          'text'
        );
        
        setTimeout(() => {
          navigate('/migration');
        }, 800);
      } else if (pill.toLowerCase().includes('view migration logs')) {
        const targetPlatform = migrationState.targetPlatform || dataset.migration_target_recommendation || 'Snowflake';
        addAssistantMessage(
          `## 📋 Migration Logs\n\n**Migration:** ${dataset.dataset_name} → ${targetPlatform}\n\n**Recent Activity:**\n\n\`\`\`\n[${new Date().toLocaleTimeString()}] Migration initiated\n[${new Date().toLocaleTimeString()}] Asset assessment: COMPLETED\n[${new Date().toLocaleTimeString()}] Data extraction: IN PROGRESS (45% complete)\n[${new Date().toLocaleTimeString()}] Schema mapping: QUEUED\n[${new Date().toLocaleTimeString()}] Validation checks: PENDING\n\`\`\`\n\n**Status:** Migration is currently running. Check the Migration tab for detailed real-time updates.`,
          'text'
        );
        
        setTimeout(() => {
          addAssistantMessage(
            'Need more details?',
            'migration_pills',
            {
              pills: [
                'Monitor migration progress',
                'Notify stakeholders',
                'Export migration plan',
              ]
            }
          );
        }, 1000);
      } else if (pill.toLowerCase().includes('schedule migration')) {
        addAssistantMessage(
          `📅 To schedule the migration, please specify your preferred date and time window. Recommended window: **${dataset.migration_readiness?.migration_window_recommendation || 'Off-peak hours (weekends or after 6 PM)'}**\\n\\nConsiderations:\\n• Estimated downtime: ${dataset.migration_readiness?.estimated_effort === 'Small' ? '2-4 hours' : dataset.migration_readiness?.estimated_effort === 'Medium' ? '6-8 hours' : '12-24 hours'}\\n• Connected reports: ${dataset.connected_reports?.length || 0} ${dataset.connected_reports?.length === 1 ? 'report' : 'reports'}\\n• Active users to notify: ${Math.floor(Math.random() * 50) + 10}`,
          'text'
        );
        
        setTimeout(() => {
          addAssistantMessage(
            'Ready to confirm the schedule?',
            'migration_pills',
            {
              pills: [
                'Confirm schedule',
                'Notify stakeholders',
                'Export migration plan',
                'Generate migration plan',
              ]
            }
          );
        }, 1000);
      } else if (pill.toLowerCase().includes('notify stakeholders')) {
        const connectedReports = dataset.connected_reports || [];
        addAssistantMessage(
          `📧 Preparing stakeholder notifications for **${dataset.dataset_name}** migration...\\n\\n**Affected stakeholders:**\\n• Report owners: ${connectedReports.length} ${connectedReports.length === 1 ? 'report' : 'reports'}\\n• Active users: ${Math.floor(Math.random() * 50) + 10}\\n• Downstream systems: ${dataset.downstream_systems?.join(', ') || 'None'}\\n\\nNotification will include migration window, expected downtime, and action items.`,
          'text'
        );
        
        setTimeout(() => {
          addAssistantMessage(
            'Notifications prepared. What would you like to do next?',
            'migration_pills',
            {
              pills: [
                'Send notifications',
                'Schedule migration',
                'Export migration plan',
                'Run validation checks',
              ]
            }
          );
        }, 1000);
      } else if (pill.toLowerCase().includes('identify data quality')) {
        addAssistantMessage(
          `🔍 Analyzing data quality issues for **${dataset.dataset_name}**...\\n\\n**Issues Found:**\\n• Null values in ${Math.floor((dataset.null_rate || 0) * dataset.field_count || 5)} fields (${((dataset.null_rate || 0) * 100).toFixed(1)}%)\\n• Duplicate records: ${((dataset.duplication_rate || 0) * 100).toFixed(2)}%\\n• Stale data: Last refresh ${formatRelativeTime(dataset.last_refresh_ts)}\\n\\n**Recommendations:**\\n1. Clean null values before migration\\n2. De-duplicate records\\n3. Refresh data to ensure freshness`,
          'text'
        );
        
        setTimeout(() => {
          addAssistantMessage(
            'Would you like to proceed with data remediation?',
            'migration_pills',
            {
              pills: [
                'Generate cleanup script',
                'Schedule data refresh',
                'Generate migration plan',
                'Run validation checks',
              ]
            }
          );
        }, 1000);
      } else if (pill.toLowerCase().includes('review blockers')) {
        const blockers = dataset.migration_readiness?.key_blockers || [];
        const hasBlockers = blockers.length > 0;
        
        addAssistantMessage(
          hasBlockers 
            ? `⚠️ **Migration Blockers for ${dataset.dataset_name}:**\\n\\n${blockers.map((b: any, i: number) => `${i + 1}. ${b.blocker} - ${b.impact}`).join('\\n')}\\n\\n**Next Steps:**\\nAddress these blockers before proceeding with migration.`
            : `✅ No blockers found for **${dataset.dataset_name}**. You're ready to proceed with migration!`,
          'text'
        );
        
        setTimeout(() => {
          addAssistantMessage(
            hasBlockers ? 'What would you like to do about these blockers?' : 'Ready to proceed?',
            'migration_pills',
            {
              pills: hasBlockers 
                ? [
                    'Get remediation steps',
                    'Check data quality & freshness',
                    'Show connected reports',
                    'Export migration plan',
                  ]
                : [
                    'Start migration',
                    'Schedule migration',
                    'Export migration plan',
                    'Notify stakeholders',
                  ]
            }
          );
        }, 1000);
      } else {
        addAssistantMessage('Processing...', 'text');
      }
    }, 600);
  };

  // ===== MIGRATION FLOW FUNCTIONS =====
  
  const initializeMigrationLanding = () => {
    // Show migration landing/overview - list all datasets available for migration
    const newConvId = `migration-landing-${Date.now()}`;
    
    // Check if a dataset is pre-selected via URL parameter
    const preSelectedDatasetId = searchParams.get('dataset');
    const preSelectedDataset = preSelectedDatasetId 
      ? catalogDatasets.find(d => d.dataset_id === preSelectedDatasetId)
      : null;
    
    const initialMessage: Message = {
      id: `msg-${Date.now()}`,
      type: 'assistant',
      content: 'I can help you migrate your datasets to a new platform. Let me show you your available datasets.',
      renderType: 'migration_dataset_list',
      data: { datasets: allDatasets },
      timestamp: new Date()
    };
    
    const newConversation: Conversation = {
      id: newConvId,
      title: preSelectedDataset ? `Migrate ${preSelectedDataset.dataset_name}` : 'Dataset Migration',
      timestamp: new Date(),
      messages: [initialMessage],
      status: 'planned',
      migrationState: preSelectedDataset ? { selectedDataset: preSelectedDataset } : {}
    };
    
    setConversations(prev => [newConversation, ...prev]);
    setActiveConversationId(newConvId);
    setMessages([initialMessage]);
    setFlowState('migration');
    setMigrationState(preSelectedDataset ? { selectedDataset: preSelectedDataset } : {});
    
    // Update URL to use the new migration ID (clear the dataset param if present)
    navigate(`/talk/migration/${newConvId}`, { replace: true });
    
    // If dataset was pre-selected, automatically trigger selection after a short delay
    if (preSelectedDataset) {
      setTimeout(() => {
        handleMigrationDatasetSelect(preSelectedDataset);
      }, 800);
    }
  };

  const initializeNewMigrationSession = () => {
    // Create a new migration session
    const newConvId = `migration-${Date.now()}`;
    
    // Start directly with source platform selection (Step 1)
    const initialMessage: Message = {
      id: `msg-${Date.now()}`,
      type: 'assistant',
      content: 'Select the source platform.',
      renderType: 'text',
      timestamp: new Date()
    };
    
    const platformSelectionMessage: Message = {
      id: `msg-${Date.now()}-2`,
      type: 'assistant',
      content: 'Choose the platform where the report you want to migrate currently lives.',
      renderType: 'migration_platform_selection',
      data: {
        selectionType: 'source',
        platforms: [
          { 
            name: 'Tableau', 
            description: 'Visual analytics and business intelligence platform',
            icon: '📈'
          },
          { 
            name: 'Power BI', 
            description: 'Microsoft business analytics and visualization',
            icon: '📊'
          },
          { 
            name: 'Qlik', 
            description: 'Qlik Sense enterprise analytics and associative engine',
            icon: '🔍'
          },
          { 
            name: 'Report Hub', 
            description: 'Existing Report Hub reports or dashboards',
            icon: '🎯'
          },
        ]
      },
      timestamp: new Date()
    };
    
    const newConversation: Conversation = {
      id: newConvId,
      title: 'New Migration Session',
      timestamp: new Date(),
      messages: [initialMessage, platformSelectionMessage],
      status: 'planned',
      migrationState: {}
    };
    
    setConversations(prev => [newConversation, ...prev]);
    setActiveConversationId(newConvId);
    setMessages([initialMessage, platformSelectionMessage]);
    setFlowState('migration');
    setMigrationState({});
    
    // Update URL to use the new migration ID
    navigate(`/talk/migration/${newConvId}`, { replace: true });
  };

  const loadMigrationSession = (migrationId: string) => {
    // Load an existing migration session by ID
    const existingConv = conversations.find(c => c.id === migrationId);
    
    if (existingConv) {
      // Load the existing conversation
      handleLoadConversation(existingConv);
      
      // Check if 'plan' parameter is set to auto-generate migration plan
      const shouldGeneratePlan = searchParams.get('plan') === 'true';
      if (shouldGeneratePlan && existingConv.migrationState?.selectedDataset) {
        setTimeout(() => {
          handleMigrationPillClick('Generate migration plan');
        }, 1000);
      }
    } else {
      // Session not found, redirect to migration landing
      navigate('/talk/migration', { replace: true });
    }
  };

  // ===== CREATE REPORT FLOW FUNCTIONS =====
  // 
  // CANONICAL LAYOUT PATTERN (STRICT):
  // - Talk column (left): Text messages + action pills ONLY
  // - Report preview (right): Full draft report panel using same component as My Reports
  // - NO inline charts/previews in chat stream
  // - Routing: /talk?mode=create-report (persists throughout flow)
  // - Flow: Intent → Dataset → Metrics → Dimensions → Visualization → Review (right panel opens)
  // 
  
  const initializeCreateReportFlow = () => {
    // Start a new conversation for report creation
    if (!activeConversationId) {
      handleNewConversation();
    }
    
    // Set URL parameter for routing
    setSearchParams({ mode: 'create-report' });
    
    // Only add user message if we haven't already
    const hasCreateMessage = messages.some(m => 
      m.type === 'user' && m.content.toLowerCase().includes('create') && m.content.toLowerCase().includes('report')
    );
    
    if (!hasCreateMessage) {
      addUserMessage('Create a new report');
    }
    
    // Set flow state
    setCreateReportState({ step: 'data_source' });
    
    // Add first step with consumer-relevant business question prompts
    setTimeout(() => {
      addAssistantMessage(
        "Let's create a new report.\n\nWhere does your data live?",
        'create_report_step',
        {
          step: 'data_source',
          actions: isReportFlowMode 
            ? ['Gold Dataset Catalog']
            : [
              'Data Marketplace / Catalog (Preferred)',
              'BigQuery',
              'Teradata',
              'Hadoop',
              'On-prem servers',
              'Other / Custom connector'
            ],
          helperText: isReportFlowMode 
            ? "Gold Dataset Catalog is the only data source available."
            : "Choose a primary source. Data Marketplace is recommended.",
          preSelected: isReportFlowMode ? 'Gold Dataset Catalog' : undefined
        }
      );
    }, 300);
  };

  const handleCreateReportAction = async (action: string, stepData?: any) => {
    const currentStep = createReportState.step;
    
    addUserMessage(action);
    setIsGenerating(true);

    if (currentStep === 'data_source') {
      // NEW STEP 1: Handle data source selection
      const dataSource = action.includes('Marketplace') || action.includes('Gold Dataset Catalog') ? 'marketplace' 
        : action.includes('BigQuery') ? 'bigquery'
        : action.includes('Teradata') ? 'teradata'
        : action.includes('Hadoop') ? 'hadoop'
        : action.includes('On-prem') ? 'on_prem'
        : 'other';
      
      if (dataSource === 'marketplace') {
        // Show marketplace dataset grid
        setIsGenerating(false);
        setCreateReportState({ ...createReportState, step: 'marketplace_dataset_grid', dataSource });
        
        addAssistantMessage(
          'Select a dataset from the Data Marketplace:',
          'marketplace_dataset_grid',
          {
            datasets: allDatasets.filter(d => d.certified_flag)
          }
        );
      } else {
        // Show placeholder for other connectors
        setIsGenerating(false);
        addAssistantMessage(
          `Connector setup for ${action} is not yet available in this prototype. Please select "Data Marketplace / Catalog (Preferred)" to continue.`,
          'text'
        );
      }
    } else if (currentStep === 'intent') {
      // Step 2: Data Origin Selection (NEW)
      setIsGenerating(false);
      setCreateReportState({ ...createReportState, step: 'data_origin', intent: action });
      
      addAssistantMessage(
        'Where should this data come from?',
        'create_report_step',
        {
          step: 'data_origin',
          actions: [
            'Data Marketplace / Catalog (Recommended)',
            'Known Source Systems'
          ],
          actionDescriptions: [
            'Governed, certified datasets',
            'BigQuery / Teradata / Hadoop'
          ],
          helperText: "You're not restricted to these suggestions. You can describe your needs in your own words."
        }
      );
    } else if (currentStep === 'data_origin') {
      // Step 3: Duplicate Detection Logic (moved from intent)
      const dataOrigin = action.includes('Marketplace') ? 'marketplace' : 'source_systems';
      const similarReports = await searchSimilarReports(createReportState.intent || '');
      setIsGenerating(false);
      
      if (similarReports.length > 0) {
        setCreateReportState({ 
          ...createReportState, 
          step: 'duplicate_check', 
          dataOrigin: dataOrigin,
          similarReports: similarReports 
        });
        
        addAssistantMessage(
          `To prevent report duplication and ensure data consistency, please review these ${similarReports.length} existing ${similarReports.length === 1 ? 'report' : 'reports'} that appear to match your intent. Can you use one of these instead?`,
          'create_report_step',
          {
            step: 'duplicate_check',
            actions: [
              ...similarReports.map(r => `Use existing: ${r.report_name}`),
              'None of these, I need a new custom report'
            ],
            helperText: "You're not restricted to these suggestions. You can describe your needs in your own words."
          }
        );
      } else {
        // No duplicates, skip to dataset
        setCreateReportState({ ...createReportState, step: 'dataset', dataOrigin: dataOrigin });
        
        const datasetsToShow = dataOrigin === 'marketplace' 
          ? allDatasets.filter(d => d.certified_flag)
          : allDatasets;
        
        addAssistantMessage(
          dataOrigin === 'marketplace' 
            ? 'Here are the governed, certified datasets from the Data Marketplace:'
            : 'Which dataset from known source systems should power this report?',
          'dataset_cards',
          datasetsToShow.slice(0, 6)
        );
      }
    } else {
      // For other steps, we can keep the small delay to feel more natural or just run immediately
      setTimeout(() => {
        setIsGenerating(false);

        if (currentStep === 'duplicate_check') {
          if (action === 'None of these, I need a new custom report') {
            setCreateReportState({ ...createReportState, step: 'dataset' });
            addAssistantMessage(
              'Understood. Let’s build a new report. Which dataset should power this business requirement?',
              'dataset_cards',
              allDatasets.slice(0, 6)
            );
          } else {
            // User chose an existing report
            const reportName = action.replace('Use existing: ', '');
            const report = catalogReports.find(r => r.report_name === reportName);
            if (report) {
              handleReportCardClick(report, { preventDefault: () => {} } as any);
              setCreateReportState({ step: null });
              setSearchParams({});
            }
          }
        } else if (currentStep === 'dataset') {
          // Dataset selected, move to dimensions
          const dataset = stepData;
          setCreateReportState({ ...createReportState, step: 'dimensions', selectedDataset: dataset });
          
          addAssistantMessage(
            'How would you like to slice this data? Select the primary dimensions.',
            'create_report_step',
            {
              step: 'dimensions',
              actions: ['Time/Period', 'Geography/Territory', 'Product Category', 'Customer Segment', 'Sales Channel'],
              allowMultiple: true,
              helperText: "You're not restricted to these suggestions. You can describe your needs in your own words."
            }
          );
        } else if (currentStep === 'dimensions') {
          // Dimensions selected, show filter builder
          const dimensions = stepData;
          setCreateReportState({ ...createReportState, selectedDimensions: dimensions });
          
          // Show filter builder UI with selected dimensions
          addAssistantMessage(
            'Do you want to apply any filters or selection criteria?',
            'dimensions_with_filters',
            {
              selectedDimensions: dimensions,
              selectedDataset: createReportState.selectedDataset,
              availableDimensions: [
                'Time (Day / Week / Month / Quarter)',
                'Region',
                'Product / Plan',
                'Customer Segment',
                'Channel',
                'Geography'
              ]
            }
          );
        } else if (currentStep === 'metrics') {
          // Metrics selected, move to usage (Cost-aware / Platform-intentional)
          const metrics = stepData;
          setCreateReportState({ ...createReportState, step: 'usage', selectedMetrics: metrics });
          
          addAssistantMessage(
            'Who is the primary audience, and how often will they access this report? (This helps optimize cost and performance)',
            'create_report_step',
            {
              step: 'usage',
              actions: [
                'Executive Leadership (Monthly/High visibility)',
                'Operations & Front-line (Daily/Real-time)',
                'Business Analysts (Weekly/Deep-dive)',
                'Casual Users (Ad-hoc/Occasional)'
              ],
              helperText: "You're not restricted to these suggestions. You can describe your needs in your own words."
            }
          );
        } else if (currentStep === 'usage') {
          // Usage selected, move to capabilities (Conditional Enterprise Routing)
          const usage = action;
          let expectedUsage: 'Low' | 'Medium' | 'High' = 'Medium';
          if (usage.includes('Executive') || usage.includes('Operations')) {
            expectedUsage = 'High';
          } else if (usage.includes('Casual')) {
            expectedUsage = 'Low';
          }
          
          setCreateReportState({ ...createReportState, step: 'capabilities', expectedUsage });
          
          addAssistantMessage(
            'Are any of these advanced capabilities required for this report?',
            'create_report_step',
            {
              step: 'capabilities',
              actions: [
                'Automated Scheduled Delivery',
                'Embedded Analytics (Public-facing)',
                'Custom White-label Branding',
                'Advanced Data Governance/PII Rules',
                'None / Basic Dashboarding'
              ],
              allowMultiple: true,
              helperText: "You're not restricted to these suggestions. You can describe your needs in your own words."
            }
          );
        } else if (currentStep === 'capabilities') {
          // Capabilities selected, move to visualization
          const capabilities = stepData;
          setCreateReportState({ ...createReportState, step: 'visualization', advancedNeeds: capabilities });
          
          addAssistantMessage(
            'Perfect. What is your preferred visualization style for the main view?',
            'create_report_step',
            {
              step: 'visualization',
              actions: ['Trend Analysis (Lines)', 'Comparison Matrix (Bars)', 'Executive Scorecard (KPIs)', 'Data Table (Details)'],
              helperText: "You're not restricted to these suggestions. You can describe your needs in your own words."
            }
          );
        } else if (currentStep === 'visualization') {
          // Visualization selected, create draft and review
          const visualization = action;
          const updatedState = { ...createReportState, step: 'review' as const, visualization };
          setCreateReportState(updatedState);
          
          // Platform routing logic: 
          // Enterprise if High Usage OR Advanced Capabilities requested
          const hasAdvancedNeeds = createReportState.advancedNeeds && 
            createReportState.advancedNeeds.some(n => n !== 'None / Basic Dashboarding');
          const isEnterpriseNeeded = createReportState.expectedUsage === 'High' || hasAdvancedNeeds;
          
          // Select an appropriate enterprise platform based on domain if needed
          let recommendedPlatform = 'Open-source Report Hub';
          if (isEnterpriseNeeded) {
            const domain = createReportState.selectedDataset?.domain;
            if (domain === 'Sales') recommendedPlatform = 'Tableau';
            else if (domain === 'Operations') recommendedPlatform = 'Qlik';
            else recommendedPlatform = 'Looker';
          }
          
          const draftReport = {
            report_id: 'DRAFT',
            report_name: `${createReportState.intent?.replace('I want to ', '').replace('Analyze ', '').replace('Monitor ', '').replace('Forecast ', '') || 'New'} Report`,
            domain: createReportState.selectedDataset?.domain || 'General',
            source_dataset_id: createReportState.selectedDataset?.dataset_id || 'DS-001',
            last_updated_ts: new Date(),
            enterprise_flag: isEnterpriseNeeded,
            source_application: isEnterpriseNeeded ? recommendedPlatform as any : undefined,
            business_owner: 'You',
            primary_use_case: createReportState.intent,
            created_date: new Date(),
            refresh_frequency: isEnterpriseNeeded ? 'Hourly' : 'Daily',
            key_kpis: [],
            primary_dimensions: createReportState.selectedDimensions || [],
            time_range_supported: 'Last 6 Months',
            top_insights: [
              `Cost-optimized for ${createReportState.expectedUsage} frequency usage.`,
              `Provisioned on **${recommendedPlatform}** ${isEnterpriseNeeded ? 'to support advanced capabilities' : 'as a standard dashboard'}.`
            ],
            known_limitations: [],
            recommended_actions: [],
            related_reports: [],
            used_by_roles: isEnterpriseNeeded ? ['Executive', 'Manager'] : ['Analyst'],
            isDraft: true,
            draftConfig: {
              metrics: createReportState.selectedMetrics,
              dimensions: createReportState.selectedDimensions,
              visualization: visualization,
              recommendedPlatform
            }
          };
          
          setSelectedReport(draftReport);
          setIsReportPanelOpen(true);
          setIsDatasetPanelOpen(false);
          
          addAssistantMessage(
            isEnterpriseNeeded 
              ? `Configuration complete! This report requires advanced capabilities and will be provisioned on **${recommendedPlatform}** (Enterprise BI). You can review the draft on the right.\n\n**Note:** Advanced capabilities are provided through Enterprise BI platforms and may incur higher costs.`
              : `Configuration complete! This report is generated using **Open Source Analytics** for speed and cost efficiency. You can review the draft on the right.\n\n**Note:** This report is generated using open-source analytics for cost optimization.`,
            'create_report_preview',
            {
              draftReportId: 'DRAFT',
              enhancementActions: ['Trend Charts (Line/Area)', 'Comparison Charts (Bar/Column)', 'Executive Scorecard (KPIs)', 'Detail Table']
            }
          );
        }
      }, 600);
    }
  };

  const handleCreateReportDatasetSelect = (dataset: any) => {
    handleCreateReportAction(`Use ${dataset.dataset_name}`, dataset);
  };

  const handleMarketplaceDatasetSelect = (dataset: any) => {
    // Handle dataset selection from marketplace grid
    // Use the displayTitle that was attached when the user clicked the card
    const displayName = dataset.displayTitle || dataset.dataset_name;
    
    addUserMessage(`Selected dataset: ${displayName}`);
    setIsGenerating(true);
    
    setTimeout(() => {
      setIsGenerating(false);
      setCreateReportState({ 
        ...createReportState, 
        step: 'dimensions', 
        selectedDataset: dataset,
        selectedDatasetDisplayName: displayName 
      });
      
      addAssistantMessage(
        `Connected via Data Marketplace: **${displayName}**\n\nGreat. Now let's define the scope of your report.`,
        'text'
      );
      
      // Add dimensions selection step
      setTimeout(() => {
        addAssistantMessage(
          'Which dimensions should this report include?',
          'create_report_step',
          {
            step: 'dimensions',
            allowMultiple: true,
            actions: [
              'Time (Day / Week / Month / Quarter)',
              'Region',
              'Product / Plan',
              'Customer Segment',
              'Channel',
              'Geography'
            ],
            helperText: "Select one or more ways you want to break down the data."
          }
        );
      }, 400);
    }, 300);
  };

  const handleContinueFromDimensions = () => {
    // Continue from dimensions/filters to usage step
    addUserMessage('Continue to usage details');
    setIsGenerating(true);
    
    setTimeout(() => {
      setIsGenerating(false);
      
      addAssistantMessage(
        'Scope defined. I\'ll use these dimensions and filters to build your report.',
        'text'
      );
      
      // Move to usage step
      setTimeout(() => {
        setCreateReportState({ ...createReportState, step: 'usage' });
        
        addAssistantMessage(
          'To make sure this report performs well and scales correctly, I need a bit of usage information.',
          'text'
        );
        
        // Add usage selection step
        setTimeout(() => {
          addAssistantMessage(
            'How many people are expected to use this report?',
            'usage_selection',
            {
              step: 'user_volume',
              selectedDataset: createReportState.selectedDataset,
              selectedDimensions: createReportState.selectedDimensions
            }
          );
        }, 400);
      }, 400);
    }, 300);
  };

  const handleContinueFromUsage = () => {
    // Continue from usage to layout step
    addUserMessage('Continue to layout & visuals');
    setIsGenerating(true);
    
    setTimeout(() => {
      setIsGenerating(false);
      
      addAssistantMessage(
        'Got it. I\'ll use this usage information to optimize how your report is generated and delivered.',
        'text'
      );
      
      // Move to layout step
      setTimeout(() => {
        setCreateReportState({ ...createReportState, step: 'layout' });
        
        addAssistantMessage(
          'Next, let\'s design how your report will look.',
          'text'
        );
        
        setTimeout(() => {
          addAssistantMessage(
            'How would you like to visualize this data?',
            'layout_builder',
            {
              step: 'layout_selection',
              helperText: 'Choose a starting point. You can customize the layout next.'
            }
          );
        }, 400);
      }, 400);
    }, 300);
  };

  const handleEnhancementAction = (action: string) => {
    // Update the existing draft report with new visualization type
    addUserMessage(action);
    setIsGenerating(true);

    setTimeout(() => {
      setIsGenerating(false);

      // Update draft report visualization
      if (selectedReport && selectedReport.isDraft) {
        const updatedReport = {
          ...selectedReport,
          draftConfig: {
            ...selectedReport.draftConfig,
            visualization: action
          }
        };
        setSelectedReport(updatedReport);
        
        // Update create report state
        setCreateReportState({
          ...createReportState,
          visualization: action
        });

        // Reopen panel if closed
        if (!isReportPanelOpen) {
          setIsReportPanelOpen(true);
        }

        addAssistantMessage(
          `Updated visualization to **${action}**. The report preview has been refreshed.`,
          'text'
        );
      }
    }, 600);
  };

  const handleViewReport = () => {
    // Navigate directly to the report in view mode
    if (selectedReport) {
      const reportId = selectedReport.report_id || selectedReport.report_name?.toLowerCase().replace(/\s+/g, '-');
      navigate(`/reports/${reportId}`);
    }
  };

  const handleFinalizeReportCreation = async () => {
    setIsGenerating(true);
    
    // Create new report object
    const newReportId = `RPT-${String(catalogReports.length + 1).padStart(3, '0')}`;
    const reportName = selectedReport?.report_name || `${createReportState.intent || 'New'} Report`;
    
    // Routing logic re-calculated for consistency
    const hasAdvancedNeeds = createReportState.advancedNeeds && 
      createReportState.advancedNeeds.some(n => n !== 'None / Basic Dashboarding');
    const isEnterprise = createReportState.expectedUsage === 'High' || hasAdvancedNeeds;
    
    let sourceApp = 'Open-source Report Hub';
    if (isEnterprise) {
      const domain = createReportState.selectedDataset?.domain;
      if (domain === 'Sales') sourceApp = 'Tableau';
      else if (domain === 'Operations') sourceApp = 'Qlik';
      else sourceApp = 'Looker';
    }
    
    const newReportConfig: any = {
      report_id: newReportId,
      report_name: reportName,
      domain: createReportState.selectedDataset?.domain || 'General',
      source_dataset_id: createReportState.selectedDataset?.dataset_id || 'DS-001',
      enterprise_flag: isEnterprise,
      source_application: isEnterprise ? sourceApp : undefined,
      business_owner: 'You',
      primary_use_case: createReportState.intent,
      refresh_frequency: isEnterprise ? 'Hourly' : 'Daily',
      key_kpis: [],
      primary_dimensions: createReportState.selectedDimensions || [],
      time_range_supported: 'Last 6 Months',
      top_insights: [
        `Initial configuration completed via guided intent flow.`,
        isEnterprise ? `Enterprise routing to ${sourceApp} enabled for advanced requirements.` : `Standard cost-effective deployment on Open-source Report Hub.`
      ],
      used_by_roles: isEnterprise ? ['Executive', 'Manager'] : ['Analyst'],
    };

    // Save to catalog via mock API
    const savedReport = await saveReportConfiguration(newReportConfig);
    
    setIsGenerating(false);
    setIsReportPanelOpen(false);
    setSelectedReport(null);

    // Add success message
    addAssistantMessage(
      `**Report created successfully!**\n\n${reportName} is now available in your reports catalog. It has been provisioned on **${isEnterprise ? sourceApp : 'Open-source Report Hub'}** based on your performance and governance requirements.`,
      'text'
    );

    // Reset create report state
    setCreateReportState({ step: null });
    setSearchParams({});


  };

  const handleCancelReportCreation = () => {
    addUserMessage('Cancel');
    addAssistantMessage(
      'Report creation cancelled. Your progress has been saved in this conversation.',
      'text'
    );
    
    setCreateReportState({ step: null });
    searchParams.delete('context');
    setSearchParams(searchParams);
  };

  const getMetricsForDataset = (dataset: any): string[] => {
    // Return relevant consumer-centric metrics based on dataset domain
    const domainMetrics: Record<string, string[]> = {
      'Sales': [
        'Total Revenue (Gross)', 
        'Take Rate (Sell-through %)', 
        'Units Sold (Volume)', 
        'Revenue Growth (YoY)', 
        'Run Rate (Projected)',
        'Average Order Value (AOV)'
      ],
      'Customer Experience': [
        'Retail Interaction Score (RIS)', 
        'Net Promoter Score (NPS)', 
        'Overall Satisfaction (CSAT)', 
        'Sentiment Score', 
        'Survey Response Rate',
        'Customer Effort Score'
      ],
      'Operations': [
        'All-Accessory Return Damage (AARD)', 
        'Unit Return Rate (%)', 
        'Order Fulfillment Time', 
        'Inventory Turnover', 
        'Operating Efficiency Score',
        'Stock-out Frequency'
      ],
      'Finance': [
        'Actual vs. Forecast Variance', 
        'Operating Margin (%)', 
        'EBITDA Contribution', 
        'Budget Utilization Rate', 
        'Unit Economics (CAC/LTV)'
      ],
      'Geography': [
        'Market Penetration (%)', 
        'Territory Coverage Index', 
        'Regional Performance Delta', 
        'Outlet Density',
        'Addressable Market Share'
      ],
    };
    
    return domainMetrics[dataset?.domain] || ['Revenue', 'Unit Volume', 'Performance Delta', 'Growth Rate'];
  };

  // ===== END CREATE REPORT FLOW FUNCTIONS =====

  const handleDatasetClick = (dataset: any) => {
    // Add user message for dataset exploration
    addUserMessage(`Explore ${dataset.dataset_name}`);
    
    // Set dataset context
    setActiveDatasetContext(dataset);
    setSelectedDataset(dataset);
    setIsDatasetPanelOpen(true);
    setIsReportPanelOpen(false); // Close report panel if open
    setActiveReportContext(null);
    
    // Generate dataset-specific suggested prompts
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
      addAssistantMessage(
        `You're now exploring **${dataset.dataset_name}**.\\nWhat would you like to know about this dataset?`,
        'report_context_prompts',
        {
          prompts: [
            'Describe this dataset',
            'What are the key fields?',
            'Which reports use this dataset?',
            'What changed recently?',
            'How is this dataset performing?',
            'Show all my datasets'
          ]
        }
      );
    }, 600);
  };

  const handlePostReportAction = (action: string) => {
    addUserMessage(action);
    setIsGenerating(true);

    setTimeout(() => {
      setIsGenerating(false);

      if (action === 'Ask a question about a report') {
        addAssistantMessage(
          'Which report would you like to ask about?',
          'reports_list',
          { reports: allReports.slice(0, 5), showActions: false }
        );
      } else if (action === 'Create a new report') {
        // Use new create report flow
        setSearchParams({ mode: 'create-report' });
        // The useEffect hook will detect the mode change and call initializeCreateReportFlow
      }
    }, 600);
  };

  const handleActionButtonClick = (action: string) => {
    if (action === 'Save as report') {
      navigate('/reports');
    } else if (action === 'Open in Enterprise BI') {
      navigate('/enterprise-bi');
    } else if (action === 'Ask follow-up questions') {
      addUserMessage('Tell me more about this data');
      setIsGenerating(true);
      setTimeout(() => {
        setIsGenerating(false);
        addAssistantMessage(
          'I can help you dive deeper into this analysis. What specific aspect would you like to explore?',
          'text'
        );
      }, 600);
    }
  };

  const handleAsk = () => {
    const userQuestion = inputValue.trim();
    if (!userQuestion) return;

    const isFirstMessage = flowState === 'new';
    addUserMessage(userQuestion, isFirstMessage);
    setInputValue('');
    setIsGenerating(true);

    setTimeout(() => {
      setIsGenerating(false);
      const q = userQuestion.toLowerCase();

      // Handle specific customer support questions
      if (q.includes('top') && q.includes('three') && q.includes('reason') && q.includes('negative') && q.includes('sentiment') && q.includes('repeat') && q.includes('caller')) {
        addAssistantMessage(
          'Top Three Drivers of Negative Sentiment Among Repeat Callers:',
          'structured_qa_card',
          {
            title: 'Top Three Drivers of Negative Sentiment Among Repeat Callers:',
            items: [
              {
                rank: 1,
                title: 'Inability To Pay Full Balance',
                category: 'Payment Arrangements',
                metric: '3,037 negative sentiment calls'
              },
              {
                rank: 2,
                title: 'Number Porting Issue',
                category: '',
                metric: '2,927 calls'
              },
              {
                rank: 3,
                title: 'Unexpected Bill Increase',
                category: '',
                metric: '2,721 calls'
              }
            ],
            insight: 'These three issues collectively represent significant pain points that are causing customers to call back multiple times with continued dissatisfaction. The concentration of negative sentiment around financial concerns (payment arrangements and bill increases) suggests that billing transparency and payment flexibility may require immediate attention to reduce repeat calls and improve customer experience.'
          }
        );
        return;
      } else if (q.includes('top') && q.includes('reason') && q.includes('bill') && q.includes('explanation') && q.includes('issue') && q.includes('repeat') && q.includes('caller')) {
        addAssistantMessage(
          'Top Three Reasons for Bill Explanation Issues Among Repeat Callers:',
          'structured_qa_card',
          {
            title: 'Top Three Reasons for Bill Explanation Issues Among Repeat Callers:',
            items: [
              {
                rank: 1,
                title: 'Unexpected Bill Increase',
                category: 'Narrowly leads as the primary concern',
                metric: '3,391 calls'
              },
              {
                rank: 2,
                title: 'Incorrect Bill Amount',
                category: 'Only 1.6% fewer calls than #1',
                metric: '3,337 calls'
              },
              {
                rank: 3,
                title: 'High Bill Amount',
                category: '26% of these top issues',
                metric: '2,375 calls'
              }
            ],
            insight: '"Unexpected Bill Increase" and "Incorrect Bill Amount" are nearly equal in volume, suggesting customers are equally troubled by surprise increases and perceived billing errors. The significant volume of repeat calls about high bills indicates persistent customer dissatisfaction with pricing or potential communication gaps about plan costs. These findings suggest an opportunity to improve bill transparency and proactive communication about upcoming changes to reduce repeat calls and enhance customer satisfaction.'
          }
        );
        return;
      } else if (q.includes('insight') && q.includes('table') && q.includes('call_transcripts_raw')) {
        addAssistantMessage(
          'Key Insights from call_transcripts_raw Table:',
          'structured_qa_card',
          {
            title: 'Key Insights from call_transcripts_raw Table:',
            items: [
              {
                rank: '📈',
                title: 'Average Call Time Trending Up',
                category: '823 seconds (February) → 1,062 seconds (August)',
                metric: '29% increase'
              },
              {
                rank: '📊',
                title: 'Monthly Call Volume',
                category: '5.1-5.7 million calls for most months, 2.9 million in August 2025',
                metric: 'Significant drop suggests potential data incompleteness'
              },
              {
                rank: '⏱️',
                title: 'Hold Time Deterioration',
                category: '99 seconds (January) → 124 seconds (current), Holds per call: 0.98 → 1.21',
                metric: '25% increase'
              },
              {
                rank: '👥',
                title: 'Staffing Expansion',
                category: '30,328 agents (January) → 35,013 agents (July)',
                metric: 'August shows decrease to 31,962 agents'
              }
            ],
            insight: 'The data reveals concerning trends in call efficiency with deteriorating hold times and increasing call duration. The staffing decrease in August warrants investigation alongside the reduced call volume.'
          }
        );
        return;
      } else if (q.includes('action') && q.includes('reducing') && q.includes('call') && q.includes('inflow')) {
        addAssistantMessage(
          'Actions for Reducing Call Inflow:',
          'structured_qa_card',
          {
            title: 'Actions for Reducing Call Inflow:',
            items: [
              {
                rank: 1,
                title: 'Account Issues',
                category: 'Implement enhanced self-service options, Improve online account management tools',
                metric: '21.7% of all calls (7.1M calls)'
              },
              {
                rank: 2,
                title: 'Billing Concerns',
                category: 'Develop targeted educational campaigns, Enhance mobile app billing features',
                metric: '16.9% of all calls (5.5M calls)'
              },
              {
                rank: 3,
                title: 'Payment-Related Inquiries',
                category: 'Create robust self-service payment options',
                metric: '11.28% of all calls (3.7M calls)'
              }
            ],
            additionalItems: [
              {
                title: 'Equipment Issues',
                category: 'Better documentation and troubleshooting guides',
                metric: '8.55% of calls'
              },
              {
                title: 'Shop/Ordering Concerns',
                category: 'Simplified ordering processes',
                metric: '8.03% of calls'
              }
            ],
            insight: 'Account + Billing categories alone represent over 12.6 million calls that could potentially be handled through digital channels. Top 3 priorities account for nearly 50% of all calls.'
          }
        );
        return;
      }

      // Handle business questions first (before context checks)
      if (q.includes('sales performance') && (q.includes('trending') || q.includes('trend'))) {
        const salesDataset = allDatasets.find(d => d.dataset_name.includes('Sales'));
        const salesReports = allReports.filter(r => r.domain === 'Sales').slice(0, 3);
        
        addAssistantMessage(
          `Overall sales performance has remained stable over the last 30 days, with slight regional variation.\n\nRevenue from the **${salesDataset?.dataset_name || 'SU&G Sales Transactions'}** dataset shows a 2.3% increase month-over-month, while average take rate declined by 0.6%, as seen in the **${salesReports[0]?.report_name || 'SU&G Performance Dashboard'}** and **${salesReports[1]?.report_name || 'Territory Take Rate Analysis'}** reports.\n\nThis suggests that volume growth is offsetting margin pressure in some regions, particularly in underperforming territories.`,
          'text'
        );
        
        addAssistantMessage('', 'report_context_prompts', {
          prompts: [
            'Explore related reports',
            'Which regions are underperforming?',
            'Show sales datasets',
            'Create a performance report'
          ]
        });
        return;
      } else if ((q.includes('regions') || q.includes('segments')) && q.includes('underperforming')) {
        addAssistantMessage(
          `Based on recent performance data, the **Southeast** and **Mountain** regions are showing signs of underperformance compared to targets.\n\nKey observations:\n• Southeast region: 8% below target, driven by declining customer retention\n• Mountain region: 5% below target, attributed to competitive pressure and pricing challenges\n• Both regions show improvement potential through targeted intervention\n\nRelevant reports: **Territory Take Rate Analysis**, **Regional Performance Dashboard**`,
          'text'
        );
        
        addAssistantMessage('', 'report_context_prompts', {
          prompts: [
            'View regional performance report',
            'What are the main revenue drivers?',
            'Create a regional analysis report',
            'Show all my reports'
          ]
        });
        return;
      } else if (q.includes('warning') || (q.includes('early') && q.includes('signs'))) {
        addAssistantMessage(
          `There are a few early indicators worth monitoring:\n\n• **Customer satisfaction scores** have declined 3.2% quarter-over-quarter, particularly in service response times\n• **Inventory turnover** is slowing in certain product categories, suggesting potential demand shifts\n• **Operating margins** show increased pressure in high-volume, low-margin segments\n\nThese trends are visible in the **Customer Experience Dashboard**, **Operations Performance Report**, and **Margin Analysis** reports.\n\nRecommendation: Focus on customer feedback analysis and operational efficiency improvements in the near term.`,
          'text'
        );
        
        addAssistantMessage('', 'report_context_prompts', {
          prompts: [
            'Explore customer experience reports',
            'Show operations datasets',
            'What changed recently?',
            'Create a monitoring report'
          ]
        });
        return;
      } else if (q.includes('driver') && q.includes('revenue')) {
        addAssistantMessage(
          `The main drivers behind recent revenue changes are:\n\n**Primary drivers:**\n• Volume growth (+4.1%) offsetting price/mix pressure (-1.8%)\n• Customer acquisition up 12% year-over-year, particularly in digital channels\n• Average order value stable, with slight improvement in premium segments\n\n**Secondary factors:**\n• Regional mix shifts favoring higher-margin territories\n• Product category performance varied, with strong growth in core offerings\n\nThis analysis draws from **Sales Transactions**, **Customer Experience**, and **Regional Performance** datasets, visible in reports like **SU&G Performance Dashboard** and **Customer Segment Analysis**.`,
          'text'
        );
        
        addAssistantMessage('', 'report_context_prompts', {
          prompts: [
            'View revenue analysis reports',
            'Show customer datasets',
            'What are growth opportunities?',
            'Create a driver analysis report'
          ]
        });
        return;
      } else if (q.includes('growth') && q.includes('opportunit')) {
        addAssistantMessage(
          `The biggest growth opportunities right now are:\n\n**Near-term opportunities:**\n• **Digital channel expansion** — 18% growth trajectory with high customer acquisition rates\n• **Cross-sell to existing customers** — Current penetration at 34%, potential to reach 45%+\n• **Premium product segments** — Showing strong demand signals with limited supply constraints\n\n**Medium-term strategic opportunities:**\n• Geographic expansion in underserved markets (Southwest region)\n• Product line extensions in high-performing categories\n• Operational efficiency improvements to unlock margin expansion\n\nRelevant data sources: **Sales Transactions**, **Customer Behavior**, **Market Analysis** datasets and **Growth Strategy Dashboard**.`,
          'text'
        );
        
        addAssistantMessage('', 'report_context_prompts', {
          prompts: [
            'Show growth-related reports',
            'Explore customer datasets',
            'Create a growth analysis report',
            'What changed recently?'
          ]
        });
        return;
      } else if (!activeReportContext && !activeDatasetContext && q.includes('changed') && q.includes('recently')) {
        // Generic "what changed" for business context (no specific report/dataset)
        addAssistantMessage(
          `Here are the most significant changes across your data over the past 30 days:\n\n**Sales & Revenue:**\n• Overall sales up 2.3% month-over-month\n• Average take rate declined 0.6%\n• Regional variation with Southeast underperforming\n\n**Customer Experience:**\n• Satisfaction scores down 3.2% quarter-over-quarter\n• Service response times showing delays\n• Customer retention stable in most segments\n\n**Operations:**\n• Inventory turnover slowing in select categories\n• Operating margins under pressure in high-volume segments\n\nFor detailed analysis, explore specific reports in these areas.`,
          'text'
        );
        
        addAssistantMessage('', 'report_context_prompts', {
          prompts: [
            'Show all my reports',
            'Which regions are underperforming?',
            'What are the growth opportunities?',
            'Explore my datasets'
          ]
        });
        return;
      }

      // Handle context-based questions
      if (activeReportContext && q.includes('show all my reports')) {
        // Reset report context
        setActiveReportContext(null);
        setIsReportPanelOpen(false);
        setSelectedReport(null);
        addAssistantMessage(
          'Here are the reports you have access to.\nThese reports come from multiple analytics platforms connected through Report Hub.',
          'reports_list',
          { reports: allReports.slice(0, 7), showActions: true }
        );
      } else if (activeReportContext && q.includes('describe')) {
        const response = generateReportResponse(activeReportContext, 'describe');
        addAssistantMessage(response, 'text');
        addAssistantMessage('', 'report_context_prompts', {
          prompts: getContextualSuggestions(userQuestion)
        });
      } else if (activeReportContext && q.includes('summary')) {
        const response = generateReportResponse(activeReportContext, 'summary');
        addAssistantMessage(response, 'text');
        addAssistantMessage('', 'report_context_prompts', {
          prompts: getContextualSuggestions(userQuestion)
        });
      } else if (activeReportContext && q.includes('insights')) {
        const response = generateReportResponse(activeReportContext, 'insights');
        addAssistantMessage(response, 'text');
        addAssistantMessage('', 'report_context_prompts', {
          prompts: getContextualSuggestions(userQuestion)
        });
      } else if (activeReportContext && q.includes('changed')) {
        const response = generateReportResponse(activeReportContext, 'changed');
        addAssistantMessage(response, 'text');
        addAssistantMessage('', 'report_context_prompts', {
          prompts: getContextualSuggestions(userQuestion)
        });
      } else if (activeReportContext && (q.includes('pie chart') || q.includes('trend') || q.includes('breakdown'))) {
        // Render inline charts for visualization requests
        const chartType = q.includes('pie') ? 'pie' : q.includes('breakdown') ? 'bar' : 'line';
        const title = q.includes('pie') ? 'Distribution by Category' : q.includes('breakdown') ? 'Performance by Segment' : 'Trend Over Time';
        
        addAssistantMessage(
          `Here's a visual analysis for **${activeReportContext.report_name}**:`,
          'inline_chart',
          {
            chartType,
            title,
            reportName: activeReportContext.report_name,
            datasetName: activeReportContext.source_dataset || 'Analytics Data'
          }
        );
        addAssistantMessage('', 'report_context_prompts', {
          prompts: getContextualSuggestions(userQuestion)
        });
      } else if (q.includes('report') && (q.includes('show') || q.includes('list') || q.includes('my'))) {
        addAssistantMessage(
          'Here are the reports you have access to.\nThese reports come from multiple analytics platforms connected through Report Hub.',
          'reports_list',
          { reports: allReports.slice(0, 7), showActions: true }
        );
      } else if (q.includes('dataset') && (q.includes('show') || q.includes('list') || q.includes('my'))) {
        addAssistantMessage(
          `You have ${datasetsCount} datasets available for analysis.`,
          'datasets_list',
          allDatasets
        );
      } else if (q.includes('create') || q.includes('new report')) {
        addAssistantMessage(
          "Great — let's build a new report together.\nWhich dataset would you like to use?",
          'dataset_cards',
          allDatasets.slice(0, 4)
        );
      } else if (activeReportContext) {
        // User has an active report context - handle generic questions about the report
        const name = activeReportContext.report_name;
        let response = '';

        if (q.includes('metrics') || q.includes('track')) {
          response = `**${name}** tracks several key performance indicators, including revenue metrics, customer engagement measures, and operational efficiency scores. These metrics are refreshed regularly to provide up-to-date insights for decision-making.`;
        } else if (q.includes('how') && (q.includes('used') || q.includes('typically'))) {
          response = `**${name}** is typically used by leadership and operational teams to monitor performance trends, identify areas for improvement, and support strategic planning decisions. It's often reviewed during weekly business reviews and monthly performance assessments.`;
        } else if (q.includes('segment') && q.includes('underperforming')) {
          response = `Based on current data, certain segments show lower performance compared to others. I'd recommend drilling into the specific dimensions to identify root causes and potential intervention strategies.`;
        } else if (q.includes('metric') && q.includes('driving')) {
          response = `The primary drivers appear to be correlated with customer acquisition rates and operational efficiency improvements. These factors have the strongest correlation with overall performance trends.`;
        } else if (q.includes('areas') && q.includes('attention')) {
          response = `Areas that may need attention include segments with declining trends, regions underperforming against targets, and metrics showing increased variability. I recommend prioritizing segments with the largest performance gaps.`;
        } else if (q.includes('caused') || q.includes('why')) {
          response = `Recent changes appear to be driven by a combination of seasonal patterns, market dynamics, and operational adjustments. Understanding the root causes requires analyzing correlations across multiple dimensions and time periods.`;
        } else if (q.includes('improving') || q.includes('worsening')) {
          response = `Overall trends suggest improvement in key metrics, though some areas show mixed signals. Continuous monitoring and targeted interventions in underperforming segments will be important to sustain positive momentum.`;
        } else if (q.includes('compare') && (q.includes('period') || q.includes('previous'))) {
          response = `Compared to the previous period, most metrics show positive movement with a few exceptions in specific segments. Year-over-year comparisons indicate sustained improvement in core business drivers.`;
        } else if (q.includes('compare') && q.includes('report')) {
          response = `To compare this report with others, you can select multiple reports from your catalog. This will enable side-by-side analysis of metrics, trends, and performance across different business areas.`;
        } else if (q.includes('explain') && q.includes('chart')) {
          response = `This visualization shows the distribution and trends of key metrics over the selected time period. Notable patterns include gradual improvement in core indicators and some variance in specific segments that may warrant deeper investigation.`;
        } else if (q.includes('stands out')) {
          response = `The most notable patterns in this data include strong performance in certain segments, consistent upward trends in key metrics, and a few outliers that may indicate opportunities for optimization or areas requiring attention.`;
        } else if (q.includes('visualization') || q.includes('visual')) {
          // Render a default chart for generic visualization requests
          addAssistantMessage(
            `Here's a visual analysis for **${name}**:`,
            'inline_chart',
            {
              chartType: 'line',
              title: 'Performance Trend',
              reportName: name,
              datasetName: activeReportContext.source_dataset || 'Analytics Data'
            }
          );
          addAssistantMessage('', 'report_context_prompts', {
            prompts: getContextualSuggestions('Show trends over time')
          });
          return; // Exit early
        } else {
          // Generic fallback for report context
          response = `I understand you're asking about **${name}**. Could you provide more details about what you'd like to know? You can ask about specific metrics, time periods, segments, or trends.`;
        }

        addAssistantMessage(response, 'text');
        addAssistantMessage('', 'report_context_prompts', {
          prompts: getContextualSuggestions(userQuestion)
        });
      } else if (activeDatasetContext && q.includes('show all my datasets')) {
        // Reset dataset context
        setActiveDatasetContext(null);
        setIsDatasetPanelOpen(false);
        setSelectedDataset(null);
        addAssistantMessage(
          `You have ${datasetsCount} datasets available for analysis.`,
          'datasets_list',
          allDatasets
        );
      } else if (activeDatasetContext && q.includes('describe')) {
        const response = generateDatasetResponse(activeDatasetContext, 'describe');
        addAssistantMessage(response, 'text');
        addAssistantMessage('', 'report_context_prompts', {
          prompts: getDatasetContextualSuggestions(userQuestion)
        });
      } else if (activeDatasetContext && q.includes('summary')) {
        const response = generateDatasetResponse(activeDatasetContext, 'summary');
        addAssistantMessage(response, 'text');
        addAssistantMessage('', 'report_context_prompts', {
          prompts: getDatasetContextualSuggestions(userQuestion)
        });
      } else if (activeDatasetContext && (q.includes('fields') || q.includes('columns') || q.includes('schema') || q.includes('key fields'))) {
        const response = generateDatasetResponse(activeDatasetContext, 'fields');
        addAssistantMessage(response, 'text');
        addAssistantMessage('', 'report_context_prompts', {
          prompts: getDatasetContextualSuggestions(userQuestion)
        });
      } else if (activeDatasetContext && q.includes('changed')) {
        const response = generateDatasetResponse(activeDatasetContext, 'changed');
        addAssistantMessage(response, 'text');
        addAssistantMessage('', 'report_context_prompts', {
          prompts: getDatasetContextualSuggestions(userQuestion)
        });
      } else if (activeDatasetContext && (q.includes('performing') || q.includes('performance'))) {
        const response = generateDatasetResponse(activeDatasetContext, 'performing');
        addAssistantMessage(response, 'text');
        addAssistantMessage('', 'report_context_prompts', {
          prompts: getDatasetContextualSuggestions(userQuestion)
        });
      } else if (activeDatasetContext && (q.includes('which reports') || q.includes('reports use') || q.includes('reports using'))) {
        const connectedReports = getReportsByDatasetId(activeDatasetContext.dataset_id);
        
        if (connectedReports.length > 0) {
          const response = generateDatasetResponse(activeDatasetContext, 'reports_using');
          addAssistantMessage(response, 'text');
          // Show the connected reports list
          addAssistantMessage(
            'Select a report to explore:',
            'reports_list',
            { reports: connectedReports, showActions: false }
          );
          addAssistantMessage('', 'report_context_prompts', {
            prompts: getDatasetContextualSuggestions(userQuestion)
          });
        } else {
          addAssistantMessage(
            `**${activeDatasetContext.dataset_name}** is not currently used by any active reports.\\n\\nThis dataset is available for new report development.`,
            'text'
          );
          addAssistantMessage('', 'report_context_prompts', {
            prompts: getDatasetContextualSuggestions(userQuestion)
          });
        }
      } else if (activeDatasetContext && (q.includes('trend') || q.includes('over time'))) {
        // NO INLINE CHARTS - Direct user to dataset panel or create report
        addAssistantMessage(
          `To view trend analysis for **${activeDatasetContext.dataset_name}**, you can either explore the dataset details in the right panel or create a new report with this dataset.`,
          'text'
        );
        addAssistantMessage('', 'report_context_prompts', {
          prompts: getDatasetContextualSuggestions(userQuestion)
        });
      } else if (activeDatasetContext) {
        // User has an active dataset context - handle generic questions about the dataset
        const name = activeDatasetContext.dataset_name;
        let response = '';

        if (q.includes('refresh') || q.includes('updated')) {
          response = `**${name}** is refreshed **${activeDatasetContext.refresh_frequency.toLowerCase()}**. The last refresh occurred ${formatRelativeTime(activeDatasetContext.last_refresh_ts)}, and the dataset is currently ${activeDatasetContext.certified_flag ? 'certified and' : ''} in good standing.`;
        } else if (q.includes('quality') || q.includes('reliable')) {
          response = `**${name}** ${activeDatasetContext.certified_flag ? 'is **certified** and' : ''} meets quality standards. It undergoes regular validation checks and data quality monitoring to ensure accuracy and reliability for reporting and analytics.`;
        } else if (q.includes('row') || q.includes('records') || q.includes('size')) {
          const rowCount = activeDatasetContext.row_count?.toLocaleString() || '1M+';
          response = `**${name}** currently contains **${rowCount} rows** with **${activeDatasetContext.field_count || '20+'} fields**. The dataset size is monitored regularly to ensure optimal performance and query efficiency.`;
        } else if (q.includes('use cases') || q.includes('best for')) {
          const useCases = activeDatasetContext.domain === 'Sales' ? 'sales forecasting, territory optimization, and revenue analysis' :
                           activeDatasetContext.domain === 'Customer Experience' ? 'satisfaction tracking, NPS monitoring, and feedback analysis' :
                           activeDatasetContext.domain === 'Operations' ? 'process efficiency, return analysis, and quality monitoring' :
                           activeDatasetContext.domain === 'Finance' ? 'budget planning, variance analysis, and forecasting' :
                           'organizational planning and performance tracking';
          response = `**${name}** is best suited for ${useCases}. It contains the necessary dimensions and metrics to support ${activeDatasetContext.domain.toLowerCase()}-related analytics workflows.`;
        } else {
          // Generic fallback for dataset context
          response = `I understand you're asking about **${name}**. You can ask me about the dataset's fields, refresh schedule, data quality, connected reports, or performance metrics. What would you like to know?`;
        }

        addAssistantMessage(response, 'text');
        addAssistantMessage('', 'report_context_prompts', {
          prompts: getDatasetContextualSuggestions(userQuestion)
        });
      } else {
        addAssistantMessage(
          "I understand you're looking for information. I can help you explore your reports, datasets, create new reports, or assist with migrations. What would you like to do?",
          'text'
        );
      }
    }, 600);
  };

  const handleReportContextPrompt = (prompt: string) => {
    addUserMessage(prompt);
    setIsGenerating(true);

    setTimeout(() => {
      setIsGenerating(false);
      const q = prompt.toLowerCase();

      // Handle business questions (work without specific report/dataset context)
      if (q.includes('sales performance trending') || q.includes('overall sales performance')) {
        const salesDataset = allDatasets.find(d => d.dataset_name.includes('Sales'));
        const salesReports = allReports.filter(r => r.domain === 'Sales').slice(0, 3);
        
        addAssistantMessage(
          `Overall sales performance has remained stable over the last 30 days, with slight regional variation.\n\nRevenue from the **${salesDataset?.dataset_name || 'SU&G Sales Transactions'}** dataset shows a 2.3% increase month-over-month, while average take rate declined by 0.6%, as seen in the **${salesReports[0]?.report_name || 'SU&G Performance Dashboard'}** and **${salesReports[1]?.report_name || 'Territory Take Rate Analysis'}** reports.\n\nThis suggests that volume growth is offsetting margin pressure in some regions, particularly in underperforming territories.`,
          'text'
        );
        
        addAssistantMessage('', 'report_context_prompts', {
          prompts: [
            'Explore related reports',
            'Which regions are underperforming?',
            'Show sales datasets',
            'Create a performance report'
          ]
        });
        return;
      } else if (q.includes('regions') && q.includes('underperforming')) {
        addAssistantMessage(
          `Based on recent performance data, the **Southeast** and **Mountain** regions are showing signs of underperformance compared to targets.\n\nKey observations:\n• Southeast region: 8% below target, driven by declining customer retention\n• Mountain region: 5% below target, attributed to competitive pressure and pricing challenges\n• Both regions show improvement potential through targeted intervention\n\nRelevant reports: **Territory Take Rate Analysis**, **Regional Performance Dashboard**`,
          'text'
        );
        
        addAssistantMessage('', 'report_context_prompts', {
          prompts: [
            'View regional performance report',
            'What are the main revenue drivers?',
            'Create a regional analysis report',
            'Show all my reports'
          ]
        });
        return;
      } else if (q.includes('early warning signs') || q.includes('warning signs')) {
        addAssistantMessage(
          `There are a few early indicators worth monitoring:\n\n• **Customer satisfaction scores** have declined 3.2% quarter-over-quarter, particularly in service response times\n• **Inventory turnover** is slowing in certain product categories, suggesting potential demand shifts\n• **Operating margins** show increased pressure in high-volume, low-margin segments\n\nThese trends are visible in the **Customer Experience Dashboard**, **Operations Performance Report**, and **Margin Analysis** reports.\n\nRecommendation: Focus on customer feedback analysis and operational efficiency improvements in the near term.`,
          'text'
        );
        
        addAssistantMessage('', 'report_context_prompts', {
          prompts: [
            'Explore customer experience reports',
            'Show operations datasets',
            'What changed recently?',
            'Create a monitoring report'
          ]
        });
        return;
      } else if (q.includes('drivers') && q.includes('revenue')) {
        addAssistantMessage(
          `The main drivers behind recent revenue changes are:\n\n**Primary drivers:**\n• Volume growth (+4.1%) offsetting price/mix pressure (-1.8%)\n• Customer acquisition up 12% year-over-year, particularly in digital channels\n• Average order value stable, with slight improvement in premium segments\n\n**Secondary factors:**\n• Regional mix shifts favoring higher-margin territories\n• Product category performance varied, with strong growth in core offerings\n\nThis analysis draws from **Sales Transactions**, **Customer Experience**, and **Regional Performance** datasets, visible in reports like **SU&G Performance Dashboard** and **Customer Segment Analysis**.`,
          'text'
        );
        
        addAssistantMessage('', 'report_context_prompts', {
          prompts: [
            'View revenue analysis reports',
            'Show customer datasets',
            'What are growth opportunities?',
            'Create a driver analysis report'
          ]
        });
        return;
      } else if (q.includes('growth opportunities') || q.includes('biggest growth')) {
        addAssistantMessage(
          `The biggest growth opportunities right now are:\n\n**Near-term opportunities:**\n• **Digital channel expansion** — 18% growth trajectory with high customer acquisition rates\n• **Cross-sell to existing customers** — Current penetration at 34%, potential to reach 45%+\n• **Premium product segments** — Showing strong demand signals with limited supply constraints\n\n**Medium-term strategic opportunities:**\n• Geographic expansion in underserved markets (Southwest region)\n• Product line extensions in high-performing categories\n• Operational efficiency improvements to unlock margin expansion\n\nRelevant data sources: **Sales Transactions**, **Customer Behavior**, **Market Analysis** datasets and **Growth Strategy Dashboard**.`,
          'text'
        );
        
        addAssistantMessage('', 'report_context_prompts', {
          prompts: [
            'Show growth-related reports',
            'Explore customer datasets',
            'Create a growth analysis report',
            'What changed recently?'
          ]
        });
        return;
      } else if (q.includes('which reports can help') || q.includes('reports can help')) {
        addAssistantMessage(
          'Here are the reports you have access to.\nThese reports come from multiple analytics platforms connected through Report Hub.',
          'reports_list',
          { reports: allReports.slice(0, 7), showActions: true }
        );
        return;
      } else if (q.includes('which datasets') && q.includes('relevant')) {
        addAssistantMessage(
          `You have ${datasetsCount} datasets available for analysis.`,
          'datasets_list',
          allDatasets
        );
        return;
      } else if (!activeReportContext && !activeDatasetContext && q.includes('changed recently')) {
        // Generic "what changed" for business context (no specific report/dataset)
        addAssistantMessage(
          `Here are the most significant changes across your data over the past 30 days:\n\n**Sales & Revenue:**\n• Overall sales up 2.3% month-over-month\n• Average take rate declined 0.6%\n• Regional variation with Southeast underperforming\n\n**Customer Experience:**\n• Satisfaction scores down 3.2% quarter-over-quarter\n• Service response times showing delays\n• Customer retention stable in most segments\n\n**Operations:**\n• Inventory turnover slowing in select categories\n• Operating margins under pressure in high-volume segments\n\nFor detailed analysis, explore specific reports in these areas.`,
          'text'
        );
        
        addAssistantMessage('', 'report_context_prompts', {
          prompts: [
            'Show all my reports',
            'Which regions are underperforming?',
            'What are the growth opportunities?',
            'Explore my datasets'
          ]
        });
        return;
      }

      // Handle dataset context prompts
      if (activeDatasetContext) {
        if (q.includes('show all my datasets')) {
          // Reset dataset context
          setActiveDatasetContext(null);
          setIsDatasetPanelOpen(false);
          setSelectedDataset(null);
          addAssistantMessage(
            `You have ${datasetsCount} datasets available for analysis.`,
            'datasets_list',
            allDatasets
          );
        } else if (q.includes('describe')) {
          const response = generateDatasetResponse(activeDatasetContext, 'describe');
          addAssistantMessage(response, 'text');
          addAssistantMessage('', 'report_context_prompts', {
            prompts: getDatasetContextualSuggestions(prompt)
          });
        } else if (q.includes('summary')) {
          const response = generateDatasetResponse(activeDatasetContext, 'summary');
          addAssistantMessage(response, 'text');
          addAssistantMessage('', 'report_context_prompts', {
            prompts: getDatasetContextualSuggestions(prompt)
          });
        } else if (q.includes('fields') || q.includes('key')) {
          const response = generateDatasetResponse(activeDatasetContext, 'fields');
          addAssistantMessage(response, 'text');
          addAssistantMessage('', 'report_context_prompts', {
            prompts: getDatasetContextualSuggestions(prompt)
          });
        } else if (q.includes('changed')) {
          const response = generateDatasetResponse(activeDatasetContext, 'changed');
          addAssistantMessage(response, 'text');
          addAssistantMessage('', 'report_context_prompts', {
            prompts: getDatasetContextualSuggestions(prompt)
          });
        } else if (q.includes('performing') || q.includes('performance')) {
          const response = generateDatasetResponse(activeDatasetContext, 'performing');
          addAssistantMessage(response, 'text');
          addAssistantMessage('', 'report_context_prompts', {
            prompts: getDatasetContextualSuggestions(prompt)
          });
        } else if (q.includes('which reports') || q.includes('reports use')) {
          const connectedReports = getReportsByDatasetId(activeDatasetContext.dataset_id);
          
          if (connectedReports.length > 0) {
            const response = generateDatasetResponse(activeDatasetContext, 'reports_using');
            addAssistantMessage(response, 'text');
            // Show the connected reports list
            addAssistantMessage(
              'Select a report to explore:',
              'reports_list',
              { reports: connectedReports, showActions: false }
            );
            addAssistantMessage('', 'report_context_prompts', {
              prompts: getDatasetContextualSuggestions(prompt)
            });
          } else {
            addAssistantMessage(
              `**${activeDatasetContext.dataset_name}** is not currently used by any active reports.\\n\\nThis dataset is available for new report development.`,
              'text'
            );
            addAssistantMessage('', 'report_context_prompts', {
              prompts: getDatasetContextualSuggestions(prompt)
            });
          }
        } else if (q.includes('trend') || q.includes('over time')) {
          // Render inline chart for dataset trend
          addAssistantMessage(
            `Here's a trend analysis for **${activeDatasetContext.dataset_name}**:`,
            'inline_chart',
            {
              chartType: 'line',
              title: 'Data Volume Trend',
              reportName: activeDatasetContext.dataset_name,
              datasetName: activeDatasetContext.domain
            }
          );
          addAssistantMessage('', 'report_context_prompts', {
            prompts: getDatasetContextualSuggestions(prompt)
          });
        }
        return;
      }

      // Handle business question follow-up prompts (routing to other workflows)
      if (q.includes('explore related reports') || q.includes('show sales datasets') || 
          q.includes('show operations datasets') || q.includes('show customer datasets') ||
          q.includes('show growth-related reports') || q.includes('view regional performance report') ||
          q.includes('view revenue analysis reports') || q.includes('explore customer experience reports')) {
        
        // Route to reports or datasets based on the prompt
        if (q.includes('datasets') || q.includes('dataset')) {
          const domain = q.includes('sales') ? 'Sales' : 
                        q.includes('operations') ? 'Operations' : 
                        q.includes('customer') ? 'Customer Experience' : null;
          
          const filteredDatasets = domain 
            ? allDatasets.filter(d => d.domain === domain)
            : allDatasets;
          
          addAssistantMessage(
            `You have ${filteredDatasets.length} ${domain ? domain.toLowerCase() + ' ' : ''}datasets available for analysis.`,
            'datasets_list',
            filteredDatasets
          );
        } else {
          // Show reports
          const domain = q.includes('sales') ? 'Sales' : 
                        q.includes('regional') || q.includes('revenue') ? 'Sales' : 
                        q.includes('customer experience') ? 'Customer Experience' : 
                        q.includes('growth') ? 'Sales' : null;
          
          const filteredReports = domain 
            ? allReports.filter(r => r.domain === domain).slice(0, 5)
            : allReports.slice(0, 7);
          
          addAssistantMessage(
            'Here are the relevant reports you have access to:',
            'reports_list',
            { reports: filteredReports, showActions: true }
          );
        }
        return;
      } else if (q.includes('create') && (q.includes('performance report') || q.includes('regional analysis') || 
                  q.includes('monitoring report') || q.includes('driver analysis') || q.includes('growth analysis'))) {
        // Route to create report flow
        setSearchParams({ mode: 'create-report' });
        return;
      }

      // Handle report context prompts (existing logic)
      if (q.includes('show all my reports')) {
        // Reset report context
        setActiveReportContext(null);
        setIsReportPanelOpen(false);
        setSelectedReport(null);
        addAssistantMessage(
          'Here are the reports you have access to.\nThese reports come from multiple analytics platforms connected through Report Hub.',
          'reports_list',
          { reports: allReports.slice(0, 7), showActions: true }
        );
      } else if (activeReportContext && q.includes('describe')) {
        const response = generateReportResponse(activeReportContext, 'describe');
        addAssistantMessage(response, 'text');
        // Show contextual follow-ups based on "Describe"
        addAssistantMessage('', 'report_context_prompts', {
          prompts: getContextualSuggestions(prompt)
        });
      } else if (activeReportContext && q.includes('summary')) {
        const response = generateReportResponse(activeReportContext, 'summary');
        addAssistantMessage(response, 'text');
        // Show contextual follow-ups based on "Summary"
        addAssistantMessage('', 'report_context_prompts', {
          prompts: getContextualSuggestions(prompt)
        });
      } else if (activeReportContext && q.includes('insights')) {
        const response = generateReportResponse(activeReportContext, 'insights');
        addAssistantMessage(response, 'text');
        // Show contextual follow-ups based on "Insights"
        addAssistantMessage('', 'report_context_prompts', {
          prompts: getContextualSuggestions(prompt)
        });
      } else if (activeReportContext && q.includes('changed')) {
        const response = generateReportResponse(activeReportContext, 'changed');
        addAssistantMessage(response, 'text');
        // Show contextual follow-ups based on "Changed"
        addAssistantMessage('', 'report_context_prompts', {
          prompts: getContextualSuggestions(prompt)
        });
      } else if (activeReportContext && (q.includes('trends over time') || q.includes('show a pie chart') || q.includes('show pie chart') || q.includes('pie chart') || q.includes('trend') || q.includes('breakdown') || q.includes('compare metrics'))) {
        // Detect specific chart type from prompt
        let chartType: 'line' | 'pie' | 'bar' = 'line';
        let title = 'Performance Trend';
        
        if (q.includes('pie chart')) {
          chartType = 'pie';
          title = 'Distribution by Category';
        } else if (q.includes('breakdown') || q.includes('compare metrics')) {
          chartType = 'bar';
          title = 'Performance by Segment';
        } else if (q.includes('trends over time') || q.includes('trend')) {
          chartType = 'line';
          title = 'Trend Over Time';
        }
        
        addAssistantMessage(
          `Here's a visual analysis for **${activeReportContext.report_name}**:`,
          'inline_chart',
          {
            chartType,
            title,
            reportName: activeReportContext.report_name,
            datasetName: activeReportContext.source_dataset || 'Analytics Data'
          }
        );
        // Show contextual follow-ups for visualization requests
        addAssistantMessage('', 'report_context_prompts', {
          prompts: getContextualSuggestions('Show trends over time')
        });
      } else {
        // Generic fallback for other questions (metrics, usage, segments, etc.)
        const name = activeReportContext.report_name;
        let response = '';

        if (q.includes('metrics') || q.includes('track')) {
          response = `**${name}** tracks several key performance indicators, including revenue metrics, customer engagement measures, and operational efficiency scores. These metrics are refreshed regularly to provide up-to-date insights for decision-making.`;
        } else if (q.includes('how') && (q.includes('used') || q.includes('typically'))) {
          response = `**${name}** is typically used by leadership and operational teams to monitor performance trends, identify areas for improvement, and support strategic planning decisions. It's often reviewed during weekly business reviews and monthly performance assessments.`;
        } else if (q.includes('segment') && q.includes('underperforming')) {
          response = `Based on current data, certain segments show lower performance compared to others. I'd recommend drilling into the specific dimensions to identify root causes and potential intervention strategies.`;
        } else if (q.includes('metric') && q.includes('driving')) {
          response = `The primary drivers appear to be correlated with customer acquisition rates and operational efficiency improvements. These factors have the strongest correlation with overall performance trends.`;
        } else if (q.includes('areas') && q.includes('attention')) {
          response = `Areas that may need attention include segments with declining trends, regions underperforming against targets, and metrics showing increased variability. I recommend prioritizing segments with the largest performance gaps.`;
        } else if (q.includes('caused') || q.includes('why')) {
          response = `Recent changes appear to be driven by a combination of seasonal patterns, market dynamics, and operational adjustments. Understanding the root causes requires analyzing correlations across multiple dimensions and time periods.`;
        } else if (q.includes('improving') || q.includes('worsening')) {
          response = `Overall trends suggest improvement in key metrics, though some areas show mixed signals. Continuous monitoring and targeted interventions in underperforming segments will be important to sustain positive momentum.`;
        } else if (q.includes('compare') && (q.includes('period') || q.includes('previous'))) {
          response = `Compared to the previous period, most metrics show positive movement with a few exceptions in specific segments. Year-over-year comparisons indicate sustained improvement in core business drivers.`;
        } else if (q.includes('compare') && q.includes('report')) {
          response = `To compare this report with others, you can select multiple reports from your catalog. This will enable side-by-side analysis of metrics, trends, and performance across different business areas.`;
        } else if (q.includes('explain') && q.includes('chart')) {
          response = `This visualization shows the distribution and trends of key metrics over the selected time period. Notable patterns include gradual improvement in core indicators and some variance in specific segments that may warrant deeper investigation.`;
        } else if (q.includes('stands out')) {
          response = `The most notable patterns in this data include strong performance in certain segments, consistent upward trends in key metrics, and a few outliers that may indicate opportunities for optimization or areas requiring attention.`;
        } else if (q.includes('another visualization') || (q.includes('show') && q.includes('visual'))) {
          // Rotate to a different chart type
          const chartTypes = ['line', 'bar', 'pie'] as const;
          const randomType = chartTypes[Math.floor(Math.random() * chartTypes.length)];
          const titles = {
            line: 'Performance Trend',
            bar: 'Comparative Analysis',
            pie: 'Distribution Overview'
          };
          
          addAssistantMessage(
            `Here's another view of **${name}**:`,
            'inline_chart',
            {
              chartType: randomType,
              title: titles[randomType],
              reportName: name,
              datasetName: activeReportContext.source_dataset || 'Analytics Data'
            }
          );
          addAssistantMessage('', 'report_context_prompts', {
            prompts: getContextualSuggestions('Show another visualization')
          });
          return; // Exit early since we already added messages
        } else if (q.includes('ask a question')) {
          response = `You can ask me anything about **${name}**. For example, you might ask about specific metrics, time periods, segments, or how certain factors are performing. I'm here to help you explore the data.`;
        } else {
          // Generic fallback
          response = `I understand you're asking about **${name}**. Could you provide more details about what you'd like to know? You can ask about specific metrics, time periods, segments, or trends.`;
        }

        addAssistantMessage(response, 'text');
        addAssistantMessage('', 'report_context_prompts', {
          prompts: getContextualSuggestions(prompt)
        });
      }
      
      // Fallback: User requested a visualization but no report is active
      if (!activeReportContext && (q.includes('trends over time') || q.includes('pie chart') || q.includes('trend') || q.includes('visualization') || q.includes('visual') || q.includes('breakdown') || q.includes('compare metrics'))) {
        addAssistantMessage(
          "To view visualizations, please select a report first. You can browse your available reports or ask me to show them.",
          'text'
        );
        addAssistantMessage('', 'report_context_prompts', {
          prompts: [
            'Show all my reports',
            'Ask a business question',
            'Create a new report'
          ]
        });
      }
    }, 600);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  const getSourceAppColor = (app?: string) => {
    switch (app) {
      case 'Tableau':
        return 'bg-blue-100 text-blue-700';
      case 'Looker':
        return 'bg-purple-100 text-purple-700';
      case 'Qlik':
        return 'bg-green-100 text-green-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getDatasetSourceColor = (source?: string) => {
    switch (source) {
      case 'Qlik':
        return 'bg-green-100 text-green-700';
      case 'Looker':
        return 'bg-purple-100 text-purple-700';
      case 'Tableau':
        return 'bg-blue-100 text-blue-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  // Get enterprise platform button details for reports and datasets
  const getEnterprisePlatformButton = (source?: string) => {
    if (!source) return null;
    
    // Map source systems to supported enterprise platforms
    const supportedPlatforms = ['Tableau', 'Looker', 'Qlik'];
    
    if (!supportedPlatforms.includes(source)) return null;
    
    return {
      label: `View in ${source}`,
      platform: source,
      url: '#', // Placeholder URL
    };
  };

  // Get contextual follow-up suggestions based on last user action
  const getContextualSuggestions = (lastAction: string): string[] => {
    const q = lastAction.toLowerCase();

    if (q.includes('describe')) {
      return [
        'Give me a summary',
        'What are the key insights?',
        'What metrics does this report track?',
        'How is this report typically used?',
        'What changed recently?',
        'Show all my reports'
      ];
    } else if (q.includes('summary')) {
      return [
        'What are the key insights?',
        'What changed recently?',
        'Show trends over time',
        'Which areas need attention?',
        'Compare this with another report',
        'Show all my reports'
      ];
    } else if (q.includes('insights')) {
      return [
        'What changed recently?',
        'Show trends over time',
        'Which segment is underperforming?',
        'Which metric is driving this trend?',
        'Show a pie chart',
        'Show all my reports'
      ];
    } else if (q.includes('changed')) {
      return [
        'What caused these changes?',
        'Are these changes improving or worsening?',
        'Show trends over time',
        'Compare with the previous period',
        'Show a pie chart',
        'Show all my reports'
      ];
    } else if (q.includes('trend') || q.includes('pie chart') || q.includes('breakdown') || q.includes('visualization')) {
      return [
        'Explain this chart',
        'What stands out here?',
        'What changed recently?',
        'Show another visualization',
        'Ask a question about this report',
        'Show all my reports'
      ];
    }

    // Default fallback (shouldn't normally reach here)
    return [
      'Give me a summary',
      'What are the key insights?',
      'What changed recently?',
      'Show trends over time',
      'Show a pie chart',
      'Show all my reports'
    ];
  };

  // Get dataset-specific contextual follow-up suggestions (adaptive)
  const getDatasetContextualSuggestions = (lastAction: string): string[] => {
    const q = lastAction.toLowerCase();

    if (q.includes('describe')) {
      return [
        'What are the key fields?',
        'Which reports use this dataset?',
        'What use cases is this dataset best for?',
        'How is this dataset performing?',
        'What changed recently?',
        'Show all my datasets'
      ];
    } else if (q.includes('key fields') || q.includes('schema')) {
      return [
        'Which fields are most used in reports?',
        'Which reports use this dataset?',
        'What changed recently?',
        'How is this dataset performing?',
        'Show all my datasets'
      ];
    } else if (q.includes('reports use') || q.includes('connected reports')) {
      return [
        'Compare reports using this dataset',
        'What are the key fields?',
        'How is this dataset performing?',
        'Show all my datasets'
      ];
    } else if (q.includes('performing') || q.includes('quality')) {
      return [
        'What changed recently?',
        'What are the key fields?',
        'Which reports use this dataset?',
        'Show trends over time',
        'Show all my datasets'
      ];
    } else if (q.includes('changed')) {
      return [
        'What are the key fields?',
        'Which reports use this dataset?',
        'How is this dataset performing?',
        'Show trends over time',
        'Show all my datasets'
      ];
    } else if (q.includes('trend') || q.includes('over time')) {
      return [
        'What are the key fields?',
        'Which reports use this dataset?',
        'What changed recently?',
        'How is this dataset performing?',
        'Show all my datasets'
      ];
    }

    // Default fallback for datasets
    return [
      'Describe this dataset',
      'What are the key fields?',
      'Which reports use this dataset?',
      'What changed recently?',
      'How is this dataset performing?',
      'Show all my datasets'
    ];
  };

  // Generate report-specific responses using templates
  const generateReportResponse = (report: any, type: 'describe' | 'summary' | 'insights' | 'changed') => {
    const name = report.report_name;
    const domain = report.domain;

    if (type === 'describe') {
      // Describe this report template
      if (name === 'Market Segmentation Analysis') {
        return `**${name}** is a ${domain}-focused report designed to help teams understand how key performance indicators are performing across relevant dimensions.\n\nIt includes metrics such as **Segment Share Index (SSI)**, **Market Penetration Rate**, and **Revenue Distribution**, enabling analysis by **customer segment** and **geographic region** over time.\n\nThis report is typically used to support decisions related to **market expansion and resource allocation**, such as performance optimization or strategic planning.`;
      } else if (name === 'SUG Sales Performance Dashboard') {
        return `**${name}** is a ${domain}-focused report designed to help teams understand how key performance indicators are performing across relevant dimensions.\n\nIt includes metrics such as **Take Rate**, **Run Rate**, and **AARD %**, enabling analysis by **territory** and **outlet** over time.\n\nThis report is typically used to support decisions related to **sales optimization and territory management**, such as performance optimization or strategic planning.`;
      } else if (name === 'Territory Performance Overview') {
        return `**${name}** is a ${domain}-focused report designed to help teams understand how key performance indicators are performing across relevant dimensions.\n\nIt includes metrics such as **Revenue by Territory**, **Customer Satisfaction (RIS)**, and **Take Rate %**, enabling analysis by **geographic territory** and **market** over time.\n\nThis report is typically used to support decisions related to **regional performance and market strategy**, such as performance optimization or strategic planning.`;
      } else {
        return `**${name}** is a ${domain}-focused report designed to help teams understand how key performance indicators are performing across relevant dimensions.\n\nIt includes critical business metrics enabling analysis over time and across segments.\n\nThis report is typically used to support decisions related to operational excellence, such as performance optimization or strategic planning.`;
      }
    } else if (type === 'summary') {
      // Give me a summary template
      if (name === 'Market Segmentation Analysis') {
        return `Here's a high-level summary of **${name}**:\n\n• Overall performance is **upward** over the selected period\n• **Enterprise segment** is the strongest contributor\n• **Consumer Value segment** is currently lagging behind\n\nOverall, the report suggests that **premium segments are driving growth while value tiers need attention**, which may warrant further review.`;
      } else if (name === 'SUG Sales Performance Dashboard') {
        return `Here's a high-level summary of **${name}**:\n\n• Overall performance is **upward** over the selected period\n• **West Coast Premium (T-005)** is the strongest contributor\n• **Southwest Regional (T-004)** is currently lagging behind\n\nOverall, the report suggests that **coastal territories are outperforming inland markets**, which may warrant further review.`;
      } else if (name === 'Territory Performance Overview') {
        return `Here's a high-level summary of **${name}**:\n\n• Overall performance is **stable** over the selected period\n• **Northeast Metro** is the strongest contributor\n• **Midwest Central** is currently lagging behind\n\nOverall, the report suggests that **urban markets are significantly stronger than regional areas**, which may warrant further review.`;
      } else {
        return `Here's a high-level summary of **${name}**:\n\n• Overall performance is **positive** over the selected period\n• Key metrics show improvement across most dimensions\n• Some areas may require additional attention\n\nOverall, the report suggests continued monitoring to maintain positive momentum, which may warrant further review.`;
      }
    } else if (type === 'insights') {
      // What are the key insights? template
      if (name === 'Market Segmentation Analysis') {
        return `Key insights from **${name}** include:\n\n• **Enterprise dominance** — supported by 42% market share and $2.52M revenue\n• **Growth acceleration in premium segments** — comparison across Enterprise (+18% YoY) vs Value (+5% YoY)\n• **West Coast concentration** — notable pattern showing 35% of total performance\n\nThese findings indicate that **the business is successfully capturing premium customers but risks underserving value markets**, which could impact future actions or priorities.`;
      } else if (name === 'SUG Sales Performance Dashboard') {
        return `Key insights from **${name}** include:\n\n• **Consistent upward trajectory** — supported by Take Rate improvement from 68% to 75%\n• **Premium device strength** — comparison across device groups showing phones at 58% of revenue\n• **Weekend performance gap** — notable pattern with 30% lower weekend sales\n\nThese findings indicate that **sales momentum is strong but weekend opportunities remain untapped**, which could impact future actions or priorities.`;
      } else if (name === 'Territory Performance Overview') {
        return `Key insights from **${name}** include:\n\n• **Urban market strength** — supported by Northeast Metro leading in revenue and RIS\n• **Regional underperformance** — comparison across territories showing 20-25% gaps\n• **RIS correlation** — notable pattern between customer satisfaction and revenue\n\nThese findings indicate that **metro territories are thriving while regional markets need strategic intervention**, which could impact future actions or priorities.`;
      } else {
        return `Key insights from **${name}** include:\n\n• **Positive trends** — supported by improving metrics over time\n• **Segmentation opportunities** — comparison across dimensions revealing gaps\n• **Emerging patterns** — notable variations requiring attention\n\nThese findings indicate that **strategic adjustments could enhance outcomes**, which could impact future actions or priorities.`;
      }
    } else if (type === 'changed') {
      // What changed recently? template
      if (name === 'Market Segmentation Analysis') {
        return `Recent changes in **${name}** show that:\n\n• **Segment Share Index** changed by **+5.2%** compared to the previous period\n• **Enterprise segment** experienced the most significant shift\n• Overall variability has **decreased**\n\nThese movements suggest that **recent initiatives in enterprise capture are working effectively**, and may require deeper investigation.`;
      } else if (name === 'SUG Sales Performance Dashboard') {
        return `Recent changes in **${name}** show that:\n\n• **Take Rate** changed by **+2.8%** compared to the previous period\n• **West Coast Premium territory** experienced the most significant shift\n• Overall variability has **remained stable**\n\nThese movements suggest that **training programs in top territories are yielding results**, and may require deeper investigation.`;
      } else if (name === 'Territory Performance Overview') {
        return `Recent changes in **${name}** show that:\n\n• **Territory Revenue** changed by **+1.2%** compared to the previous period\n• **Northeast Metro** experienced the most significant shift\n• Overall variability has **increased slightly**\n\nThese movements suggest that **market conditions are creating new patterns across regions**, and may require deeper investigation.`;
      } else {
        return `Recent changes in **${name}** show that:\n\n• Key metrics changed **moderately** compared to the previous period\n• Several areas experienced notable shifts\n• Overall variability has **remained stable**\n\nThese movements suggest that **performance is following expected seasonal patterns**, and may require deeper investigation.`;
      }
    }

    return '';
  };

  // Generate dataset-specific responses using templates (analyst-level tone)
  const generateDatasetResponse = (dataset: any, type: 'describe' | 'summary' | 'fields' | 'changed' | 'performing' | 'reports_using') => {
    const name = dataset.dataset_name;
    const domain = dataset.domain;
    const rowCount = dataset.row_count?.toLocaleString() || '1M+';
    const fieldCount = dataset.field_count || '20+';
    const connectedReports = getReportsByDatasetId(dataset.dataset_id);
    const growthTrend = getDatasetGrowthTrend(dataset.dataset_id);

    if (type === 'describe') {
      // Describe this dataset template - practical, use case focused
      const useCases = domain === 'Sales' ? 'sales forecasting, territory optimization, and revenue analysis' :
                       domain === 'Customer Experience' ? 'satisfaction tracking, NPS monitoring, and feedback analysis' :
                       domain === 'Operations' ? 'process efficiency, return analysis, and quality monitoring' :
                       domain === 'Finance' ? 'budget planning, variance analysis, and forecasting' :
                       'organizational planning and performance tracking';
      
      const strengths = dataset.certified_flag ? 'certified and trusted for production analytics' : 'actively used but pending certification';
      const limitations = dataset.refresh_frequency === 'Monthly' ? 'Monthly refresh limits real-time insights' :
                          dataset.refresh_frequency === 'Weekly' ? 'Weekly refresh may lag fast-moving trends' :
                          'No known limitations for current use cases';
      
      return `**${name}** is a ${domain}-focused dataset with **${rowCount} rows** and **${fieldCount} fields**, refreshed **${dataset.refresh_frequency.toLowerCase()}**.\\n\\n**Best use cases**: ${useCases}.\\n\\n**Strengths**: ${strengths}, powers ${connectedReports.length} active reports.\\n\\n**Limitations**: ${limitations}.\\n\\n**Readiness**: ${dataset.certified_flag ? 'Production-ready' : 'Development/testing recommended'}.`;
    } else if (type === 'summary') {
      // Give me a summary template - concise and actionable
      const qualityIndicator = dataset.certified_flag ? '✓ Certified' : '⚠ Uncertified';
      const freshnessIndicator = dataset.refresh_frequency === 'Hourly' ? '✓ Highly fresh' :
                                 dataset.refresh_frequency === 'Daily' ? '✓ Fresh' :
                                 dataset.refresh_frequency === 'Weekly' ? '◐ Moderate' : '◐ Limited';
      
      return `**Dataset Summary: ${name}**\\n\\n• **Scale**: ${rowCount} rows, ${fieldCount} fields\\n• **Freshness**: ${freshnessIndicator} ��� Last refresh ${formatRelativeTime(dataset.last_refresh_ts)}\\n• **Quality**: ${qualityIndicator}\\n• **Usage**: Powers ${connectedReports.length} production reports\\n• **Growth**: ${growthTrend} data volume trend\\n\\n**Recommendation**: ${dataset.certified_flag ? 'Approved for analytics workloads' : 'Review data quality before production use'}.`;
    } else if (type === 'fields') {
      // What are the key fields? template - show actual schema
      const schemaFields = getDatasetSchemaFields(dataset.dataset_id);
      const topFields = schemaFields.slice(0, 6);
      
      let fieldList = topFields.map(f => `• **${f.field_name}** (${f.data_type}) — ${f.description}`).join('\\n');
      if (schemaFields.length > 6) {
        fieldList += `\\n\\n_...and ${schemaFields.length - 6} additional fields_`;
      }
      
      return `**Key fields in ${name}**:\\n\\n${fieldList}\\n\\n**Use case fit**: These fields support ${domain.toLowerCase()} analysis with strong temporal, dimensional, and metric coverage.`;
    } else if (type === 'changed') {
      // What changed recently? template - data quality focus
      const daysSinceRefresh = Math.floor((new Date().getTime() - dataset.last_refresh_ts.getTime()) / (1000 * 60 * 60 * 24));
      const freshnessStatus = daysSinceRefresh === 0 ? '✓ Current' :
                              daysSinceRefresh === 1 ? '✓ Recent' :
                              daysSinceRefresh <= 7 ? '◐ Acceptable' : '⚠ Aging';
      
      return `**Recent activity for ${name}**:\\n\\n• **Last refresh**: ${formatRelativeTime(dataset.last_refresh_ts)} — ${freshnessStatus}\\n• **Data volume**: ${rowCount} rows (${growthTrend} trend)\\n• **Validation status**: All checks passed\\n• **Schema stability**: No recent schema changes detected\\n\\n**Data quality**: ${dataset.certified_flag ? 'Meets all governance standards' : 'Under review for certification'}.`;
    } else if (type === 'performing') {
      // How is this dataset performing?
      const usageScore = connectedReports.length >= 3 ? 'High usage' : connectedReports.length >= 1 ? 'Moderate usage' : 'Low usage';
      const freshnessScore = dataset.refresh_frequency === 'Hourly' || dataset.refresh_frequency === 'Daily' ? 'Excellent freshness' : 'Adequate freshness';
      const qualityScore = dataset.certified_flag ? 'Certified quality' : 'Quality review pending';
      
      return `**Performance assessment for ${name}**:\\n\\n• **Usage**: ${usageScore} — ${connectedReports.length} connected reports\\n• **Freshness**: ${freshnessScore} — ${dataset.refresh_frequency} refresh cycle\\n• **Data quality**: ${qualityScore}\\n• **Volume trend**: ${growthTrend}\\n\\n**Overall**: ${dataset.certified_flag && connectedReports.length > 0 ? 'Strong performer, widely trusted' : dataset.certified_flag ? 'Certified but underutilized' : 'Needs governance review'}.`;
    } else if (type === 'reports_using') {
      // Which reports use this dataset?
      if (connectedReports.length === 0) {
        return `**${name}** is not currently used by any active reports.\\n\\nThis dataset is available for new report development.`;
      }
      
      const reportList = connectedReports.slice(0, 4).map(r => `• **${r.report_name}** (${r.domain})`).join('\\n');
      const moreCount = connectedReports.length > 4 ? `\\n\\n_...and ${connectedReports.length - 4} more reports_` : '';
      
      return `**${name}** powers **${connectedReports.length} active reports**:\\n\\n${reportList}${moreCount}\\n\\nThese reports rely on this dataset for ${domain.toLowerCase()}-related analytics.`;
    }

    return '';
  };

  const renderMessage = (message: Message) => {
    // User Message
    if (message.type === 'user') {
      return (
        <div className="flex justify-end">
          <div className="max-w-[70%] bg-[#2563EB] border border-[#1D4ED8] rounded-2xl px-4 py-3">
            <p className="text-[14px] text-white" style={{ fontFamily: 'Inter, sans-serif' }}>
              {message.content}
            </p>
          </div>
        </div>
      );
    }

    // Assistant Message
    if (message.type === 'assistant') {
      return (
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-[#FEF0EC] flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-4 h-4 text-[#D4572A]" />
          </div>
          <div className="flex-1">
            {message.content && (
              <p className="text-[14px] text-[#1C1917] leading-relaxed whitespace-pre-line mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                {message.content.split('**').map((part, i) => 
                  i % 2 === 0 ? part : <strong key={i}>{part}</strong>
                )}
              </p>
            )}

            {/* Structured Q&A Cards */}
            {message.renderType === 'structured_qa_card' && message.data && (
              <div className="space-y-3 mt-3">
                {/* Title */}
                <h3 className="text-[15px] font-semibold text-[#111827] mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {message.data.title}
                </h3>

                {/* Main Items as Cards */}
                <div className="space-y-3">
                  {message.data.items.map((item: any, idx: number) => (
                    <div
                      key={idx}
                      className="bg-[#FAFAFA] border-l-4 border-[#334155] rounded-lg p-4 shadow-sm"
                    >
                      <div className="flex items-start gap-4">
                        {/* Rank Number */}
                        <div className="flex-shrink-0">
                          <div className="text-[32px] font-bold text-[#334155]" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {item.rank}
                          </div>
                        </div>
                        
                        {/* Content */}
                        <div className="flex-1">
                          {/* Title */}
                          <h4 className="text-[14px] font-bold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {item.title}
                          </h4>
                          
                          {/* Category */}
                          {item.category && (
                            <p className="text-[12px] text-[#6B7280] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                              {item.category}
                            </p>
                          )}
                          
                          {/* Metric - highlighted */}
                          <div className="inline-block bg-[#FEF3C7] border border-[#FDE68A] rounded-md px-3 py-1.5">
                            <span className="text-[13px] font-bold text-[#D97706]" style={{ fontFamily: 'Inter, sans-serif' }}>
                              {item.metric}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Additional Items (if present) */}
                {message.data.additionalItems && message.data.additionalItems.length > 0 && (
                  <>
                    <h4 className="text-[13px] font-semibold text-[#111827] mt-5 mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                      Additional Focus Areas:
                    </h4>
                    <div className="space-y-2">
                      {message.data.additionalItems.map((item: any, idx: number) => (
                        <div
                          key={idx}
                          className="bg-[#FAFAFA] border-l-4 border-[#334155] rounded-lg p-3 shadow-sm"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-1">
                              <h5 className="text-[13px] font-bold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                                {item.title}
                              </h5>
                              {item.category && (
                                <p className="text-[11px] text-[#6B7280] mb-1.5" style={{ fontFamily: 'Inter, sans-serif' }}>
                                  {item.category}
                                </p>
                              )}
                              <div className="inline-block bg-[#FEF3C7] border border-[#FDE68A] rounded-md px-2.5 py-1">
                                <span className="text-[12px] font-bold text-[#D97706]" style={{ fontFamily: 'Inter, sans-serif' }}>
                                  {item.metric}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Key Insight Section */}
                {message.data.insight && (
                  <div className="bg-[#F1F5F9] border-l-4 border-[#334155] rounded-lg p-4 mt-5">
                    <h4 className="text-[13px] font-bold text-[#111827] mb-2 flex items-center gap-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                      <span className="text-[#334155]">💡</span> Key Insight:
                    </h4>
                    <p className="text-[12px] text-[#374151] leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {message.data.insight}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Dataset Cards */}
            {message.renderType === 'dataset_cards' && message.data && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                {message.data.map((dataset: any) => (
                  <div
                    key={dataset.dataset_id}
                    onClick={() => {
                      if (createReportState.step === 'dataset') {
                        // In create report flow - proceed with dataset selection
                        handleCreateReportDatasetSelect(dataset);
                      } else {
                        // Not in create report flow - start create report flow with this dataset
                        // First, set the create report state to dataset step
                        setCreateReportState({ 
                          step: 'dataset', 
                          intent: 'Custom business question',
                          selectedDataset: null,
                          selectedMetrics: [],
                          selectedDimensions: [],
                          visualization: null
                        });
                        // Then select the dataset
                        addUserMessage(dataset.dataset_name);
                        handleCreateReportDatasetSelect(dataset);
                      }
                    }}
                    className="border border-[#E5E7EB] rounded-lg p-4 hover:border-blue-400 hover:shadow-sm cursor-pointer transition-all bg-white"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-[13px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {dataset.dataset_name}
                      </p>
                      {dataset.certified_flag && (
                        <div className="w-3.5 h-3.5">
                          <MedallionIcon />
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {dataset.domain}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Create Report Step */}
            {message.renderType === 'create_report_step' && message.data && (
              <div className="space-y-3 mt-3">
                <div className="flex flex-wrap gap-2">
                  {message.data.actions.map((action: string, idx: number) => {
                    const isSelected = multiSelectItems.includes(action);
                    const isMultiSelect = message.data.allowMultiple;
                    const description = message.data.actionDescriptions?.[idx];
                    
                    return (
                      <div key={`${message.id}-action-${idx}`} className="flex flex-col">
                        <button
                          onClick={() => {
                            if (isMultiSelect) {
                              // Toggle selection for multi-select
                              if (isSelected) {
                                setMultiSelectItems(prev => prev.filter(item => item !== action));
                              } else {
                                setMultiSelectItems(prev => [...prev, action]);
                              }
                            } else {
                              // Single select - clear and proceed
                              setMultiSelectItems([]);
                              handleCreateReportAction(action);
                            }
                          }}
                          className={`px-4 py-2.5 border rounded-full text-[13px] transition-all shadow-sm hover:shadow-md ${
                            isSelected 
                              ? 'bg-[#111827] text-white border-[#111827]' 
                              : 'bg-white hover:bg-gray-50 border-[#E5E7EB] text-[#111827]'
                          }`}
                          style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                          {action}
                        </button>
                        {description && (
                          <p className="text-[10px] text-[#9CA3AF] mt-1 ml-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {description}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
                {message.data.allowMultiple && multiSelectItems.length > 0 && (
                  <button
                    onClick={() => {
                      handleCreateReportAction(`Selected: ${multiSelectItems.join(', ')}`, multiSelectItems);
                      setMultiSelectItems([]);
                    }}
                    className="px-5 py-2.5 bg-[#111827] hover:bg-[#0F172A] text-white rounded-lg text-[13px] font-medium transition-colors"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
                    Continue with {multiSelectItems.length} selected
                  </button>
                )}
                
                {/* Helper message - show for all steps that have helperText */}
                {message.data.helperText && (
                  <p className="text-[11px] text-[#9CA3AF] italic leading-relaxed mt-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {message.data.helperText}
                  </p>
                )}
              </div>
            )}

            {/* Create Report Preview with View Report Button and Enhancement Pills */}
            {message.renderType === 'create_report_preview' && message.data && (
              <div className="mt-4 space-y-3">
                {/* Open Report Button */}
                <button
                  onClick={handleViewReport}
                  className="px-5 py-3 bg-[#111827] hover:bg-[#0F172A] text-white rounded-lg text-[13px] font-medium transition-colors shadow-sm flex items-center gap-2"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                >
                  Open report
                  <ArrowRight className="w-4 h-4" />
                </button>

                {/* Enhancement Pills */}
                <div>
                  <p className="text-[11px] text-[#6B7280] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Refine visualization:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {message.data.enhancementActions?.map((action: string, idx: number) => (
                      <button
                        key={`${message.id}-enhance-${idx}`}
                        onClick={() => handleEnhancementAction(action)}
                        className="px-4 py-2 bg-white hover:bg-gray-50 border border-[#E5E7EB] rounded-full text-[12px] text-[#111827] transition-all shadow-sm hover:shadow-md"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Marketplace Dataset Grid */}
            {message.renderType === 'marketplace_dataset_grid' && message.data && (
              <div className="mt-4 bg-white border border-[#E5E7EB] rounded-xl p-5 shadow-sm">
                {/* Search and Controls */}
                <div className="mb-4 space-y-3">
                  <input
                    type="text"
                    placeholder="Search customer data for churn and retention analysis..."
                    value={marketplaceSearchQuery}
                    onChange={(e) => setMarketplaceSearchQuery(e.target.value)}
                    className="w-full px-4 py-2.5 border border-[#E5E7EB] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  />
                  
                  <div className="flex items-center justify-between gap-3">
                    <button
                      onClick={() => setMarketplaceFiltersOpen(!marketplaceFiltersOpen)}
                      className="px-3 py-1.5 text-[11px] text-[#6B7280] border border-[#E5E7EB] rounded-lg hover:bg-gray-50 transition-colors"
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                      {marketplaceFiltersOpen ? 'Hide' : 'Show'} Filters
                    </button>
                    
                    <div className="flex items-center gap-3">
                      <select className="px-3 py-1.5 text-[11px] text-[#6B7280] border border-[#E5E7EB] rounded-lg bg-white" style={{ fontFamily: 'Inter, sans-serif' }}>
                        <option>Items / Page: 10</option>
                        <option>Items / Page: 20</option>
                      </select>
                      <select className="px-3 py-1.5 text-[11px] text-[#6B7280] border border-[#E5E7EB] rounded-lg bg-white" style={{ fontFamily: 'Inter, sans-serif' }}>
                        <option>Sort by: Relevance</option>
                        <option>Sort by: Name</option>
                        <option>Sort by: Recently Updated</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Filters Panel */}
                {marketplaceFiltersOpen && (
                  <div className="mb-4 p-4 bg-gray-50 border border-[#E5E7EB] rounded-lg">
                    <h4 className="text-[12px] font-semibold text-[#111827] mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                      Filters
                    </h4>
                    <div className="space-y-2">
                      <details className="group">
                        <summary className="cursor-pointer text-[11px] font-medium text-[#6B7280] list-none flex items-center justify-between" style={{ fontFamily: 'Inter, sans-serif' }}>
                          Applicable Spoke(s)
                          <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" />
                        </summary>
                        <div className="mt-2 ml-2 space-y-1.5">
                          <label className="flex items-center gap-2 text-[10px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                            <input type="checkbox" className="w-3 h-3 rounded" />
                            Sales
                          </label>
                          <label className="flex items-center gap-2 text-[10px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                            <input type="checkbox" className="w-3 h-3 rounded" />
                            Marketing
                          </label>
                          <label className="flex items-center gap-2 text-[10px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                            <input type="checkbox" className="w-3 h-3 rounded" />
                            Operations
                          </label>
                        </div>
                      </details>
                    </div>
                  </div>
                )}

                {/* Dataset Grid */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {message.data.datasets.filter((d: any) => 
                    marketplaceSearchQuery === '' || 
                    d.dataset_name.toLowerCase().includes(marketplaceSearchQuery.toLowerCase()) ||
                    d.domain?.toLowerCase().includes(marketplaceSearchQuery.toLowerCase())
                  ).map((dataset: any) => {
                    const isSelected = marketplaceSelectedDataset?.dataset_id === dataset.dataset_id;
                    
                    // Copy override mapping for churn-focused dataset names
                    const datasetCopyOverrides: Record<string, { title: string; description: string; refreshCadence: string }> = {
                      'customer_churn': {
                        title: 'Customer Churn Events',
                        description: 'Historical record of customer churn events including cancellation dates, churn type (voluntary or involuntary), and primary churn reason.',
                        refreshCadence: 'Refreshed daily'
                      },
                      'subscriber_lifecycle': {
                        title: 'Subscriber Lifecycle Metrics',
                        description: 'Customer tenure, activation milestones, plan changes, upgrades, downgrades, and lifecycle stage indicators.',
                        refreshCadence: 'Refreshed daily'
                      },
                      'customer_account': {
                        title: 'Customer Account & Plan Details',
                        description: 'Account-level attributes including plan type, pricing tier, contract status, device type, and subscription configuration.',
                        refreshCadence: 'Refreshed daily'
                      },
                      'customer_usage': {
                        title: 'Customer Usage & Engagement Signals',
                        description: 'Aggregated usage patterns and engagement indicators such as data consumption, service activity, and feature usage trends.',
                        refreshCadence: 'Refreshed daily'
                      },
                      'customer_support': {
                        title: 'Customer Support & Service Interactions',
                        description: 'Customer service touchpoints including call center interactions, ticket volume, resolution times, and escalation indicators.',
                        refreshCadence: 'Refreshed daily'
                      },
                      'customer_feedback': {
                        title: 'Customer Feedback & Sentiment Signals',
                        description: 'Survey results, feedback scores, and sentiment indicators derived from customer feedback channels.',
                        refreshCadence: 'Refreshed weekly'
                      }
                    };
                    
                    // Determine which override to use based on dataset properties
                    let overrideKey = '';
                    const datasetNameLower = dataset.dataset_name.toLowerCase();
                    const domainLower = dataset.domain?.toLowerCase() || '';
                    
                    if (datasetNameLower.includes('churn') || domainLower.includes('churn')) {
                      overrideKey = 'customer_churn';
                    } else if (datasetNameLower.includes('subscriber') || datasetNameLower.includes('lifecycle') || domainLower.includes('lifecycle')) {
                      overrideKey = 'subscriber_lifecycle';
                    } else if (datasetNameLower.includes('account') || datasetNameLower.includes('plan') || domainLower.includes('account')) {
                      overrideKey = 'customer_account';
                    } else if (datasetNameLower.includes('usage') || datasetNameLower.includes('engagement') || domainLower.includes('usage')) {
                      overrideKey = 'customer_usage';
                    } else if (datasetNameLower.includes('support') || datasetNameLower.includes('service') || domainLower.includes('support')) {
                      overrideKey = 'customer_support';
                    } else if (datasetNameLower.includes('feedback') || datasetNameLower.includes('sentiment') || domainLower.includes('feedback')) {
                      overrideKey = 'customer_feedback';
                    } else {
                      // Default to cycling through overrides based on index
                      const overrideKeys = Object.keys(datasetCopyOverrides);
                      const datasetIndex = message.data.datasets.indexOf(dataset);
                      overrideKey = overrideKeys[datasetIndex % overrideKeys.length];
                    }
                    
                    const copyOverride = datasetCopyOverrides[overrideKey];
                    const displayTitle = copyOverride?.title || dataset.dataset_name;
                    const displayDescription = copyOverride?.description || `${dataset.domain} data for analytics and reporting`;
                    const displayRefreshCadence = copyOverride?.refreshCadence || 'Refreshed daily';
                    
                    return (
                      <div
                        key={dataset.dataset_id}
                        onClick={() => setMarketplaceSelectedDataset({ ...dataset, displayTitle })}
                        className={`border rounded-lg p-4 cursor-pointer transition-all ${
                          isSelected 
                            ? 'border-blue-500 bg-blue-50 shadow-md' 
                            : 'border-[#E5E7EB] hover:border-blue-300 hover:shadow-sm bg-white'
                        }`}
                      >
                        {/* Tag */}
                        <div className="mb-2">
                          <span className="inline-block px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-medium rounded" style={{ fontFamily: 'Inter, sans-serif' }}>
                            dataset
                          </span>
                        </div>
                        
                        {/* Title */}
                        <div className="flex items-start gap-2 mb-2">
                          <h4 className="text-[13px] font-semibold text-[#111827] flex-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {displayTitle}
                          </h4>
                          {dataset.certified_flag && (
                            <div className="w-4 h-4 flex-shrink-0">
                              <MedallionIcon />
                            </div>
                          )}
                        </div>
                        
                        {/* Description */}
                        <p className="text-[11px] text-[#6B7280] mb-3 line-clamp-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                          {displayDescription}
                        </p>
                        
                        {/* Metadata */}
                        <div className="space-y-1 mb-3">
                          <p className="text-[10px] text-[#9CA3AF]" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Published on {dataset.last_updated_ts ? new Date(dataset.last_updated_ts).toLocaleDateString() : 'N/A'}
                          </p>
                          <p className="text-[10px] text-[#9CA3AF]" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {displayRefreshCadence}
                          </p>
                        </div>
                        
                        {/* Action Icons */}
                        <div className="flex items-center gap-3">
                          <button className="text-[#9CA3AF] hover:text-[#6B7280] transition-colors">
                            <Database className="w-3.5 h-3.5" />
                          </button>
                          <button className="text-[#9CA3AF] hover:text-[#6B7280] transition-colors">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3 pt-3 border-t border-[#E5E7EB]">
                  <button
                    onClick={() => {
                      if (marketplaceSelectedDataset) {
                        handleMarketplaceDatasetSelect(marketplaceSelectedDataset);
                        setMarketplaceSelectedDataset(null);
                        setMarketplaceSearchQuery('');
                      }
                    }}
                    disabled={!marketplaceSelectedDataset}
                    className="px-5 py-2.5 bg-[#111827] hover:bg-[#0F172A] text-white rounded-lg text-[13px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
                    Use selected dataset
                  </button>
                  <button
                    onClick={() => {
                      // Go back to data source selection
                      setCreateReportState({ step: 'data_source' });
                      setMarketplaceSelectedDataset(null);
                      setMarketplaceSearchQuery('');
                    }}
                    className="px-5 py-2.5 bg-white hover:bg-gray-50 border border-[#E5E7EB] text-[#111827] rounded-lg text-[13px] font-medium transition-colors"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
                    Back
                  </button>
                </div>
              </div>
            )}

            {/* Dimensions with Filters */}
            {message.renderType === 'dimensions_with_filters' && message.data && (
              <div className="mt-4 space-y-5">
                {/* Selected Dimensions Display */}
                <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
                  <p className="text-[11px] font-medium text-[#6B7280] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Selected Dimensions:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {message.data.selectedDimensions?.map((dim: string, idx: number) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#111827] text-white rounded-full text-[12px]"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        {dim}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Filter Builder */}
                <div className="bg-white border border-[#E5E7EB] rounded-lg p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="text-[13px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                        Selection Criteria (Optional)
                      </h4>
                      <p className="text-[11px] text-[#6B7280] mt-0.5" style={{ fontFamily: 'Inter, sans-serif' }}>
                        Limit the data shown in this report
                      </p>
                    </div>
                  </div>

                  {/* Filter Rows */}
                  <div className="space-y-3 mb-4">
                    {reportFilters.map((filter, idx) => (
                      <div key={filter.id} className="flex items-center gap-3">
                        <select
                          value={filter.dimension}
                          onChange={(e) => {
                            const updated = [...reportFilters];
                            updated[idx].dimension = e.target.value;
                            setReportFilters(updated);
                          }}
                          className="flex-1 px-3 py-2 text-[12px] border border-[#E5E7EB] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                          <option value="">Select dimension...</option>
                          {message.data.availableDimensions?.map((dim: string) => (
                            <option key={dim} value={dim}>{dim}</option>
                          ))}
                        </select>
                        
                        <select
                          value={filter.operator}
                          onChange={(e) => {
                            const updated = [...reportFilters];
                            updated[idx].operator = e.target.value;
                            setReportFilters(updated);
                          }}
                          className="w-32 px-3 py-2 text-[12px] border border-[#E5E7EB] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                          <option value="">Operator...</option>
                          <option value="equals">Equals</option>
                          <option value="includes">Includes</option>
                          <option value="between">Between</option>
                          <option value="not_equals">Not Equals</option>
                        </select>
                        
                        <input
                          type="text"
                          value={filter.value}
                          onChange={(e) => {
                            const updated = [...reportFilters];
                            updated[idx].value = e.target.value;
                            setReportFilters(updated);
                          }}
                          placeholder="Value..."
                          className="flex-1 px-3 py-2 text-[12px] border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          style={{ fontFamily: 'Inter, sans-serif' }}
                        />
                        
                        <button
                          onClick={() => {
                            setReportFilters(reportFilters.filter((_, i) => i !== idx));
                          }}
                          className="p-2 text-[#9CA3AF] hover:text-red-600 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add Filter Button */}
                  <button
                    onClick={() => {
                      setReportFilters([
                        ...reportFilters,
                        { id: `filter-${Date.now()}`, dimension: '', operator: '', value: '' }
                      ]);
                    }}
                    className="px-4 py-2 text-[12px] text-blue-600 hover:text-blue-700 font-medium transition-colors flex items-center gap-1.5"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
                    <Plus className="w-4 h-4" />
                    Add another filter
                  </button>
                </div>

                {/* Report Scope Summary */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="text-[13px] font-semibold text-[#111827] mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Report Scope Summary
                  </h4>
                  
                  <div className="space-y-2">
                    <div>
                      <p className="text-[10px] text-[#6B7280] uppercase tracking-wide mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                        Dataset
                      </p>
                      <p className="text-[12px] text-[#111827] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {message.data.selectedDataset?.dataset_name || 'Not selected'}
                      </p>
                    </div>
                    
                    <div>
                      <p className="text-[10px] text-[#6B7280] uppercase tracking-wide mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                        Dimensions
                      </p>
                      <p className="text-[12px] text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {message.data.selectedDimensions?.join(', ') || 'None'}
                      </p>
                    </div>
                    
                    {reportFilters.length > 0 && (
                      <div>
                        <p className="text-[10px] text-[#6B7280] uppercase tracking-wide mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                          Active Filters
                        </p>
                        <div className="space-y-1">
                          {reportFilters
                            .filter(f => f.dimension && f.operator && f.value)
                            .map((filter, idx) => (
                              <p key={idx} className="text-[12px] text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                                • {filter.dimension} {filter.operator} {filter.value}
                              </p>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={handleContinueFromDimensions}
                    className="px-5 py-2.5 bg-[#111827] hover:bg-[#0F172A] text-white rounded-lg text-[13px] font-medium transition-colors"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
                    Continue to usage details
                  </button>
                  <button
                    onClick={() => {
                      // Go back to dataset selection
                      setCreateReportState({ ...createReportState, step: 'marketplace_dataset_grid' });
                      setReportFilters([]);
                    }}
                    className="px-5 py-2.5 bg-white hover:bg-gray-50 border border-[#E5E7EB] text-[#111827] rounded-lg text-[13px] font-medium transition-colors"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
                    Edit dataset selection
                  </button>
                </div>
              </div>
            )}

            {/* Usage Selection */}
            {message.renderType === 'usage_selection' && message.data && (
              <div className="mt-4 space-y-5">
                {/* User Volume Selection */}
                <div className="bg-white border border-[#E5E7EB] rounded-lg p-5">
                  <div className="mb-4">
                    <h4 className="text-[13px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                      How many people are expected to use this report?
                    </h4>
                    <p className="text-[11px] text-[#6B7280] mt-0.5" style={{ fontFamily: 'Inter, sans-serif' }}>
                      This helps us plan performance and delivery.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {['1–10 users', '11–50 users', '51–200 users', '200+ users'].map((option) => (
                      <button
                        key={option}
                        onClick={() => setSelectedUserVolume(option)}
                        className={`px-4 py-3 rounded-lg text-[12px] font-medium transition-all border-2 ${
                          selectedUserVolume === option
                            ? 'bg-[#111827] text-white border-[#111827]'
                            : 'bg-white text-[#111827] border-[#E5E7EB] hover:border-[#9CA3AF]'
                        }`}
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                  
                  <p className="text-[10px] text-[#9CA3AF] mt-3 italic" style={{ fontFamily: 'Inter, sans-serif' }}>
                    This is an estimate, not a commitment.
                  </p>
                </div>

                {/* View Frequency (shown after user volume is selected) */}
                {selectedUserVolume && (
                  <div className="bg-white border border-[#E5E7EB] rounded-lg p-5">
                    <div className="mb-4">
                      <h4 className="text-[13px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                        How often will this report be viewed?
                      </h4>
                      <p className="text-[11px] text-[#6B7280] mt-0.5" style={{ fontFamily: 'Inter, sans-serif' }}>
                        Approximate frequency is sufficient.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {['On demand', 'Daily', 'Weekly', 'Monthly', 'Quarterly'].map((option) => (
                        <button
                          key={option}
                          onClick={() => setSelectedViewFrequency(option)}
                          className={`px-4 py-2 rounded-full text-[12px] font-medium transition-all ${
                            selectedViewFrequency === option
                              ? 'bg-[#111827] text-white'
                              : 'bg-white text-[#111827] border border-[#E5E7EB] hover:bg-gray-50'
                          }`}
                          style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Usage Summary (shown after both are selected) */}
                {selectedUserVolume && selectedViewFrequency && (
                  <>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="text-[13px] font-semibold text-[#111827] mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                        Usage Summary
                      </h4>
                      
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Expected users:
                          </p>
                          <p className="text-[12px] text-[#111827] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {selectedUserVolume}
                          </p>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                            View frequency:
                          </p>
                          <p className="text-[12px] text-[#111827] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {selectedViewFrequency}
                          </p>
                        </div>
                      </div>
                      
                      <p className="text-[10px] text-[#6B7280] mt-3 pt-3 border-t border-blue-200" style={{ fontFamily: 'Inter, sans-serif' }}>
                        These inputs are used for performance optimization and cost-aware routing.
                      </p>
                    </div>

                    {/* Informational Callout */}
                    {!isReportFlowMode && (
                      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                        <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                        <p className="text-[11px] text-amber-900" style={{ fontFamily: 'Inter, sans-serif' }}>
                          Higher usage or advanced workloads may require enterprise BI capabilities later in the flow.
                        </p>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-3 pt-2">
                      <button
                        onClick={handleContinueFromUsage}
                        className="px-5 py-2.5 bg-[#111827] hover:bg-[#0F172A] text-white rounded-lg text-[13px] font-medium transition-colors"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        Continue to layout & visuals
                      </button>
                      <button
                        onClick={() => {
                          // Go back to dimensions/scope
                          setCreateReportState({ ...createReportState, step: 'dimensions' });
                          setSelectedUserVolume('');
                          setSelectedViewFrequency('');
                        }}
                        className="px-5 py-2.5 bg-white hover:bg-gray-50 border border-[#E5E7EB] text-[#111827] rounded-lg text-[13px] font-medium transition-colors"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        Edit report scope
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Layout Builder */}
            {message.renderType === 'layout_builder' && message.data && (
              <div className="mt-4 space-y-5">
                {/* Layout Type Selection */}
                {!layoutType && (
                  <div className="bg-white border border-[#E5E7EB] rounded-lg p-5">
                    <div className="mb-4">
                      <p className="text-[11px] text-[#6B7280] mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {message.data.helperText}
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <button
                        onClick={() => setLayoutType('template')}
                        className="group p-5 bg-white border-2 border-[#E5E7EB] rounded-lg hover:border-[#111827] hover:shadow-md transition-all text-left"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Layers className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <h4 className="text-[13px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                              Template-based
                            </h4>
                            <p className="text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                              Start with a recommended layout
                            </p>
                          </div>
                        </div>
                      </button>

                      <button
                        onClick={() => setLayoutType('custom')}
                        className="group p-5 bg-white border-2 border-[#E5E7EB] rounded-lg hover:border-[#111827] hover:shadow-md transition-all text-left"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Edit2 className="w-5 h-5 text-purple-600" />
                          </div>
                          <div>
                            <h4 className="text-[13px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                              Custom (Drag & drop)
                            </h4>
                            <p className="text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                              Build your own layout
                            </p>
                          </div>
                        </div>
                      </button>

                      <button
                        onClick={() => setLayoutType('reference')}
                        className="group p-5 bg-white border-2 border-[#E5E7EB] rounded-lg hover:border-[#111827] hover:shadow-md transition-all text-left"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Link2 className="w-5 h-5 text-green-600" />
                          </div>
                          <div>
                            <h4 className="text-[13px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                              Reference an existing report
                            </h4>
                            <p className="text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                              Use another report as a visual or layout reference
                            </p>
                          </div>
                        </div>
                      </button>
                    </div>

                    {/* Informational Callout - Report Flow Only */}
                    {isReportFlowMode && (
                      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg mt-4">
                        <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                        <p className="text-[11px] text-amber-900" style={{ fontFamily: 'Inter, sans-serif' }}>
                          Advanced visualization may require enterprise BI capabilities.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Template Selection */}
                {layoutType === 'template' && !selectedTemplate && (
                  <div className="bg-white border border-[#E5E7EB] rounded-lg p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <h4 className="text-[13px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                        Choose a template
                      </h4>
                      <button
                        onClick={() => setLayoutType(null)}
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
                          className="group p-4 bg-white border-2 border-[#E5E7EB] rounded-lg hover:border-[#111827] hover:shadow-sm transition-all text-left"
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

                {/* Custom Layout Builder */}
                {layoutType === 'custom' && (
                  <div className="bg-white border border-[#E5E7EB] rounded-lg p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <h4 className="text-[13px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                        Build your layout
                      </h4>
                      <button
                        onClick={() => {
                          setLayoutType(null);
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
                      isReportFlowMode={isReportFlowMode}
                    />
                  </div>
                )}

                {/* Reference Report Panel */}
                {layoutType === 'reference' && (
                  <div className="bg-white border-2 border-[#E5E7EB] rounded-lg p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <h4 className="text-[13px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                          Reference an existing report for layout
                        </h4>
                        <p className="text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                          Use another report as a visual or layout reference.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setLayoutType(null);
                          setReferenceReportLink('');
                          setReferenceLayoutApplied(false);
                          setReferenceReportName('');
                        }}
                        className="text-[11px] text-[#6B7280] hover:text-[#111827] underline"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        Back
                      </button>
                    </div>

                    {!referenceLayoutApplied ? (
                      <>
                        <div className="space-y-3">
                          <input
                            type="text"
                            value={referenceReportLink}
                            onChange={(e) => setReferenceReportLink(e.target.value)}
                            placeholder="Paste link to existing report"
                            className="w-full px-4 py-2.5 border border-[#E5E7EB] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            style={{ fontFamily: 'Inter, sans-serif' }}
                          />
                          
                          <button
                            onClick={() => {
                              if (referenceReportLink.trim()) {
                                setReferenceLayoutApplied(true);
                                // Extract report name from link or use a generic name
                                const urlParts = referenceReportLink.split('/');
                                const reportName = urlParts[urlParts.length - 1] || 'Referenced Report';
                                setReferenceReportName(reportName);
                              }
                            }}
                            disabled={!referenceReportLink.trim()}
                            className={`px-5 py-2.5 rounded-lg text-[13px] font-medium transition-colors ${
                              referenceReportLink.trim()
                                ? 'bg-[#111827] hover:bg-[#0F172A] text-white'
                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            }`}
                            style={{ fontFamily: 'Inter, sans-serif' }}
                          >
                            Use as layout reference
                          </button>
                        </div>

                        <p className="text-[10px] text-[#9CA3AF] mt-3 italic" style={{ fontFamily: 'Inter, sans-serif' }}>
                          The report will be used as a visual reference only. Data and metrics are not reused.
                        </p>
                      </>
                    ) : (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <h5 className="text-[13px] font-semibold text-green-900 mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                              Referenced layout applied
                            </h5>
                            <p className="text-[11px] text-green-800 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                              Layout structure from "{referenceReportName}" will be used with your current dataset.
                            </p>
                            <button
                              onClick={() => {
                                setReferenceLayoutApplied(false);
                                setReferenceReportLink('');
                                setReferenceReportName('');
                              }}
                              className="text-[11px] text-green-700 hover:text-green-900 underline font-medium"
                              style={{ fontFamily: 'Inter, sans-serif' }}
                            >
                              Change reference
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Live Preview */}
                {(selectedTemplate || (layoutType === 'custom' && customLayoutComponents.length > 0) || (layoutType === 'reference' && referenceLayoutApplied)) && (
                  <ReportLayoutPreview
                    layoutType={layoutType || 'template'}
                    selectedTemplate={selectedTemplate}
                    customLayoutComponents={customLayoutComponents}
                    dataset={createReportState.selectedDataset}
                    dimensions={createReportState.selectedDimensions}
                    referenceReportName={referenceReportName}
                  />
                )}

                {/* Layout Summary & Actions */}
                {(selectedTemplate || (layoutType === 'custom' && customLayoutComponents.length > 0) || (layoutType === 'reference' && referenceLayoutApplied)) && (
                  <>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="text-[13px] font-semibold text-[#111827] mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                        Layout Summary
                      </h4>
                      
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Layout source:
                          </p>
                          <p className="text-[12px] text-[#111827] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {layoutType === 'template' ? 'Template-based' : layoutType === 'custom' ? 'Custom' : 'Referenced report'}
                          </p>
                        </div>
                        
                        {layoutType === 'template' && selectedTemplate && (
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                              Template:
                            </p>
                            <p className="text-[12px] text-[#111827] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                              {selectedTemplate.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                            </p>
                          </div>
                        )}
                        
                        {layoutType === 'custom' && (
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                              Components:
                            </p>
                            <p className="text-[12px] text-[#111827] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                              {customLayoutComponents.length} element{customLayoutComponents.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                        )}
                        
                        {layoutType === 'reference' && referenceReportName && (
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                              Reference:
                            </p>
                            <p className="text-[12px] text-[#111827] font-medium truncate max-w-[200px]" style={{ fontFamily: 'Inter, sans-serif' }} title={referenceReportName}>
                              {referenceReportName}
                            </p>
                          </div>
                        )}
                      </div>
                      
                      <p className="text-[10px] text-[#6B7280] mt-3 pt-3 border-t border-blue-200" style={{ fontFamily: 'Inter, sans-serif' }}>
                        This layout will be used to structure your report visualization.
                      </p>
                    </div>

                    {/* Helper Text for Reference Mode */}
                    {layoutType === 'reference' && !referenceLayoutApplied && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <p className="text-[11px] text-amber-800" style={{ fontFamily: 'Inter, sans-serif' }}>
                          Add a reference report link to continue.
                        </p>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-3 pt-2">
                      <button
                        onClick={() => {
                          addUserMessage('Generate report preview');
                          setIsGenerating(true);
                          
                          // Update create report state with layout configuration
                          setCreateReportState({
                            ...createReportState,
                            layoutType,
                            selectedTemplate,
                            customLayoutComponents,
                            referenceReportLink,
                            referenceLayoutApplied,
                            referenceReportName,
                          });

                          setTimeout(() => {
                            setIsGenerating(false);
                            
                            addAssistantMessage(
                              'I\'m generating a model report using your selections.',
                              'text'
                            );
                            
                            // Show loading state
                            setTimeout(() => {
                              addAssistantMessage(
                                'Compiling data, layout, and visuals…',
                                'text'
                              );
                              
                              // Show preview after brief delay
                              setTimeout(() => {
                                setCreateReportState({
                                  ...createReportState,
                                  step: 'preview',
                                  layoutType,
                                  selectedTemplate,
                                  customLayoutComponents,
                                  referenceReportLink,
                                  referenceLayoutApplied,
                                  referenceReportName,
                                });
                                
                                addAssistantMessage(
                                  'Here\'s your report preview',
                                  'report_generation_preview',
                                  {
                                    layoutType,
                                    selectedTemplate,
                                    customLayoutComponents,
                                    referenceReportName,
                                    dataset: createReportState.selectedDataset,
                                    selectedDimensions: createReportState.selectedDimensions,
                                    selectedUserVolume,
                                    selectedViewFrequency,
                                  }
                                );
                              }, 1200);
                            }, 400);
                          }, 800);
                        }}
                        className="px-5 py-2.5 bg-[#111827] hover:bg-[#0F172A] text-white rounded-lg text-[13px] font-medium transition-colors"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        Generate report preview
                      </button>
                      <button
                        onClick={() => {
                          setCreateReportState({ ...createReportState, step: 'usage' });
                          setLayoutType(null);
                          setSelectedTemplate('');
                          setCustomLayoutComponents([]);
                          setReferenceReportLink('');
                          setReferenceLayoutApplied(false);
                          setReferenceReportName('');
                        }}
                        className="px-5 py-2.5 bg-white hover:bg-gray-50 border border-[#E5E7EB] text-[#111827] rounded-lg text-[13px] font-medium transition-colors"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        Edit usage details
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Report Generation Preview */}
            {message.renderType === 'report_generation_preview' && message.data && (
              <ReportGenerationPreview
                layoutType={message.data.layoutType}
                selectedTemplate={message.data.selectedTemplate}
                customLayoutComponents={message.data.customLayoutComponents}
                referenceReportName={message.data.referenceReportName}
                dataset={message.data.dataset}
                selectedDimensions={message.data.selectedDimensions}
                selectedUserVolume={message.data.selectedUserVolume}
                selectedViewFrequency={message.data.selectedViewFrequency}
                isReportFlowMode={isReportFlowMode}
                onContinue={() => {
                  addUserMessage('Looks good — continue');
                  setIsGenerating(true);
                  
                  setTimeout(() => {
                    setIsGenerating(false);
                    
                    // Update state to duplicate_check step
                    setCreateReportState({ ...createReportState, step: 'duplicate_check' });
                    
                    addAssistantMessage(
                      'Before creating a new report, I checked for existing reports that match your intent.',
                      'text'
                    );
                    
                    // Simulate checking for similar reports
                    setTimeout(async () => {
                      setIsGenerating(true);
                      
                      // Search for similar reports based on dataset and dimensions
                      const searchQuery = createReportState.selectedDataset?.name || 'performance';
                      const similarReports = await searchSimilarReports(searchQuery);
                      
                      // Limit to 2-3 results
                      const topSimilarReports = similarReports.slice(0, 3);
                      
                      setIsGenerating(false);
                      
                      if (topSimilarReports.length > 0) {
                        setCreateReportState({
                          ...createReportState,
                          step: 'duplicate_check',
                          similarReports: topSimilarReports,
                        });
                        
                        addAssistantMessage(
                          'Similar reports already exist',
                          'duplicate_detection',
                          {
                            reports: topSimilarReports,
                          }
                        );
                      } else {
                        // No similar reports found, continue to execution routing
                        addAssistantMessage(
                          'No similar reports found. Proceeding with report creation.',
                          'text'
                        );
                        
                        // Continue to execution routing step
                        setTimeout(() => {
                          setCreateReportState({ ...createReportState, step: 'execution_routing' });
                          
                          addAssistantMessage(
                            'Based on your report\'s complexity and expected usage, here\'s how this report will be generated.',
                            'text'
                          );
                          
                          setTimeout(() => {
                            addAssistantMessage(
                              'Report execution plan',
                              'execution_routing',
                              {
                                defaultPath: 'open_source',
                                expectedUsage: createReportState.expectedUsage,
                                selectedUserVolume,
                                selectedViewFrequency,
                              }
                            );
                          }, 400);
                        }, 800);
                      }
                    }, 600);
                  }, 600);
                }}
                onEditLayout={() => {
                  addUserMessage('Edit layout');
                  
                  // Reset to layout step
                  setCreateReportState({ ...createReportState, step: 'layout' });
                  
                  setTimeout(() => {
                    addAssistantMessage(
                      'No problem. Let\'s refine your report layout.',
                      'layout_builder',
                      {
                        step: 'layout_selection',
                        helperText: 'Choose a layout approach:',
                      }
                    );
                  }, 300);
                }}
                onEditScope={() => {
                  addUserMessage('Edit scope');
                  
                  // Reset to dimensions step
                  setCreateReportState({ ...createReportState, step: 'dimensions' });
                  setLayoutType(null);
                  setSelectedTemplate('');
                  setCustomLayoutComponents([]);
                  setReferenceReportLink('');
                  setReferenceLayoutApplied(false);
                  setReferenceReportName('');
                  
                  setTimeout(() => {
                    addAssistantMessage(
                      'Sure. Let\'s adjust the dimensions and filters.',
                      'dimensions_with_filters',
                      {
                        dataset: createReportState.selectedDataset,
                        availableDimensions: createReportState.selectedDataset?.schema || [],
                        selectedDimensions: createReportState.selectedDimensions || [],
                      }
                    );
                  }, 300);
                }}
              />
            )}

            {/* Duplicate Detection */}
            {message.renderType === 'duplicate_detection' && message.data && (
              <div className="mt-4 bg-amber-50 border-2 border-amber-200 rounded-lg p-5">
                {/* Header */}
                <div className="mb-4">
                  <h4 className="text-[14px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Similar reports already exist
                  </h4>
                  <p className="text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                    To reduce duplication and keep data consistent, consider using or enhancing an existing report.
                  </p>
                </div>

                {/* Similar Reports List */}
                <div className="space-y-3 mb-4">
                  {message.data.reports.map((report: any) => {
                    // Determine usage indicator
                    const usageIndicator = report.used_by_roles && report.used_by_roles.length > 2 
                      ? 'Frequently used' 
                      : 'Low usage';
                    const usageColor = report.used_by_roles && report.used_by_roles.length > 2
                      ? 'text-green-700 bg-green-50 border-green-200'
                      : 'text-gray-600 bg-gray-50 border-gray-200';

                    return (
                      <div
                        key={report.report_id}
                        className="bg-white border border-gray-300 rounded-lg p-4 shadow-sm"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h5 className="text-[13px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                                {report.report_name}
                              </h5>
                              {report.source_application && (
                                <span className="inline-flex items-center px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] rounded border border-blue-200 font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                                  {report.source_application}
                                </span>
                              )}
                            </div>
                            {report.primary_use_case && (
                              <p className="text-[11px] text-[#6B7280] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                                {report.primary_use_case}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Report Owner */}
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="text-[10px] text-[#9CA3AF] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Owner:
                          </span>
                          <span className="text-[10px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {report.owner || report.created_by || 'Alex Morgan (Analytics Admin)'}
                          </span>
                        </div>

                        {/* Access Restriction Notice */}
                        <div className="flex items-start gap-1.5 mb-3 px-2 py-1.5 bg-gray-50 rounded">
                          <Info className="w-3 h-3 text-gray-500 flex-shrink-0 mt-0.5" />
                          <p className="text-[10px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                            You don't have access to this report. You must request approval to view or modify it.
                          </p>
                        </div>

                        {/* Key Dimensions */}
                        {report.primary_dimensions && report.primary_dimensions.length > 0 && (
                          <div className="flex items-center gap-1.5 mb-2">
                            <span className="text-[10px] text-[#9CA3AF] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                              Dimensions:
                            </span>
                            {report.primary_dimensions.map((dim: string, idx: number) => (
                              <span
                                key={idx}
                                className="inline-flex items-center px-1.5 py-0.5 bg-gray-100 text-gray-700 text-[10px] rounded"
                                style={{ fontFamily: 'Inter, sans-serif' }}
                              >
                                {dim}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Metadata Row */}
                        <div className="flex items-center gap-3 mb-3 text-[10px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Updated {formatRelativeTime(report.last_updated_ts)}
                          </span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-medium ${usageColor}`}>
                            {usageIndicator}
                          </span>
                        </div>

                        {/* Action Button */}
                        <div className="pt-2 border-t border-gray-200">
                          <button
                            onClick={() => {
                              const ownerName = report.owner || report.created_by || 'Alex Morgan (Analytics Admin)';
                              addUserMessage(`Request access to ${report.report_name}`);
                              setIsGenerating(true);
                              
                              setTimeout(() => {
                                setIsGenerating(false);
                                addAssistantMessage(
                                  `This report is owned by ${ownerName}. An access request has been sent.`,
                                  'text'
                                );
                              }, 600);
                            }}
                            className="w-full px-3 py-2 bg-[#111827] hover:bg-[#0F172A] text-white rounded text-[12px] font-medium transition-colors"
                            style={{ fontFamily: 'Inter, sans-serif' }}
                          >
                            Request access
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Create New Option */}
                <div className="pt-3 border-t-2 border-amber-300">
                  <button
                    onClick={() => {
                      addUserMessage('None of these meet my needs — create a new report');
                      setIsGenerating(true);
                      
                      setTimeout(() => {
                        setIsGenerating(false);
                        addAssistantMessage(
                          'Understood. I\'ll proceed with creating a new report.',
                          'text'
                        );
                        
                        // Continue to execution routing step
                        setTimeout(() => {
                          setCreateReportState({ ...createReportState, step: 'execution_routing' });
                          
                          addAssistantMessage(
                            'Based on your report\'s complexity and expected usage, here\'s how this report will be generated.',
                            'text'
                          );
                          
                          setTimeout(() => {
                            addAssistantMessage(
                              'Report execution plan',
                              'execution_routing',
                              {
                                defaultPath: 'open_source',
                                expectedUsage: createReportState.expectedUsage,
                                selectedUserVolume,
                                selectedViewFrequency,
                              }
                            );
                          }, 400);
                        }, 800);
                      }, 600);
                    }}
                    className="text-[13px] text-[#111827] hover:text-[#0F172A] underline font-medium"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
                    None of these meet my needs — create a new report
                  </button>
                  <p className="text-[10px] text-[#92400E] mt-2 italic" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Creating a new report increases maintenance and operational cost.
                  </p>
                </div>
              </div>
            )}

            {/* Execution Routing */}
            {message.renderType === 'execution_routing' && message.data && (
              <div className="mt-4 space-y-4">
                {/* Open Source Default Path */}
                <div className={`bg-white border-2 rounded-lg p-5 transition-all ${
                  selectedExecutionPath === 'open_source' 
                    ? 'border-blue-500 shadow-md' 
                    : 'border-[#E5E7EB]'
                }`}>
                  <div className="flex items-start gap-3 mb-3">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      selectedExecutionPath === 'open_source'
                        ? 'border-blue-500 bg-blue-500'
                        : 'border-gray-300'
                    }`}>
                      {selectedExecutionPath === 'open_source' && (
                        <Check className="w-3 h-3 text-white" />
                      )}
                    </div>
                    <div className="flex-1">
                      <h4 className="text-[14px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                        Generated using Report Hub (Open Source)
                      </h4>
                      <p className="text-[11px] text-[#6B7280] mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                        This report can be handled efficiently without enterprise BI tools.
                      </p>
                      
                      <ul className="space-y-1.5">
                        <li className="flex items-center gap-2 text-[11px] text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                          Meets visualization and performance needs
                        </li>
                        <li className="flex items-center gap-2 text-[11px] text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                          No additional licensing cost
                        </li>
                        <li className="flex items-center gap-2 text-[11px] text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                          Consistent experience within Report Hub
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Advanced Options Toggle */}
                {!showAdvancedOptions && (
                  <button
                    onClick={() => setShowAdvancedOptions(true)}
                    className="text-[12px] text-[#6B7280] hover:text-[#111827] underline font-medium"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
                    View advanced options
                  </button>
                )}

                {/* Enterprise BI Options */}
                {showAdvancedOptions && (
                  <div className="space-y-4">
                    <div className={`bg-white border-2 rounded-lg p-5 transition-all ${
                      selectedExecutionPath === 'enterprise_bi' 
                        ? 'border-purple-500 shadow-md' 
                        : 'border-[#E5E7EB]'
                    }`}>
                      <div className="flex items-start gap-3 mb-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                          selectedExecutionPath === 'enterprise_bi'
                            ? 'border-purple-500 bg-purple-500'
                            : 'border-gray-300'
                        }`}>
                          {selectedExecutionPath === 'enterprise_bi' && (
                            <Check className="w-3 h-3 text-white" />
                          )}
                        </div>
                        <div className="flex-1">
                          <h4 className="text-[14px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Use Enterprise BI
                          </h4>
                          <p className="text-[11px] text-[#6B7280] mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Required only for advanced capabilities or high-scale workloads.
                          </p>

                          {/* Platform Selection */}
                          <div className="mb-3">
                            <p className="text-[11px] text-[#6B7280] mb-2 font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                              Select platform:
                            </p>
                            <div className="flex gap-2">
                              {['Looker', 'Qlik', 'Tableau'].map((platform) => (
                                <button
                                  key={platform}
                                  onClick={() => {
                                    setSelectedExecutionPath('enterprise_bi');
                                    setSelectedEnterprisePlatform(platform as 'Looker' | 'Qlik' | 'Tableau');
                                  }}
                                  className={`px-3 py-1.5 rounded border text-[11px] font-medium transition-all ${
                                    selectedEnterprisePlatform === platform
                                      ? 'bg-purple-50 border-purple-500 text-purple-700'
                                      : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'
                                  }`}
                                  style={{ fontFamily: 'Inter, sans-serif' }}
                                >
                                  {platform}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Expected Usage Summary (from Step 3) */}
                          {selectedEnterprisePlatform && (
                            <div className="pt-3 border-t border-gray-200">
                              <h5 className="text-[11px] text-[#6B7280] mb-2 font-semibold" style={{ fontFamily: 'Inter, sans-serif' }}>
                                Expected usage
                              </h5>
                              <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                                    Users:
                                  </span>
                                  <span className="text-[12px] text-[#111827] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                                    {selectedUserVolume || 'Not specified'}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                                    Views:
                                  </span>
                                  <span className="text-[12px] text-[#111827] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                                    {selectedViewFrequency || 'Not specified'}
                                  </span>
                                </div>
                              </div>
                              <p className="text-[10px] text-[#9CA3AF] mt-2 italic" style={{ fontFamily: 'Inter, sans-serif' }}>
                                Based on the usage you provided earlier.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Cost Implications (shown when platform is selected and Step 3 usage exists) */}
                    {selectedEnterprisePlatform && selectedUserVolume && selectedViewFrequency && (
                      <div className="bg-amber-50 border border-amber-300 rounded-lg p-4">
                        <div className="flex items-start gap-2 mb-3">
                          <Info className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <h5 className="text-[13px] font-semibold text-[#111827] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                              Cost implications
                            </h5>
                            <ul className="space-y-1 text-[11px] text-[#6B7280] mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                              <li>• Enterprise BI usage incurs additional licensing costs</li>
                              <li>• Costs scale with users and views</li>
                            </ul>
                            <p className="text-[11px] text-[#92400E] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                              If you need advanced capabilities, you pay for them.
                            </p>
                          </div>
                        </div>

                        {/* Confirmation Checkbox */}
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={enterpriseCostAcknowledged}
                            onChange={(e) => setEnterpriseCostAcknowledged(e.target.checked)}
                            className="mt-0.5 w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                          />
                          <span className="text-[11px] text-[#111827] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                            I understand and approve the use of Enterprise BI for this report
                          </span>
                        </label>
                      </div>
                    )}
                  </div>
                )}

                {/* Final CTAs */}
                <div className="flex items-center gap-3 pt-2">
                  {selectedExecutionPath === 'open_source' && (
                    <button
                      onClick={() => {
                        addUserMessage('Proceed with Report Hub (Open Source)');
                        setIsGenerating(true);
                        
                        setTimeout(() => {
                          setIsGenerating(false);
                          
                          // Show published confirmation message
                          addAssistantMessage(
                            'Your report has been published.',
                            'text'
                          );
                          
                          // Show report ready card with View report CTA
                          setTimeout(() => {
                            const reportName = 'Customer Churn';
                            
                            addAssistantMessage(
                              '',
                              'report_ready_cta',
                              {
                                reportName: reportName,
                                platform: 'Report Hub',
                                executionPath: 'open_source',
                                status: 'Published'
                              }
                            );
                            
                            // Reset create report flow state
                            setCreateReportState({ step: null });
                            setShowAdvancedOptions(false);
                            setSelectedExecutionPath('open_source');
                            setSelectedEnterprisePlatform(null);
                            setEnterpriseCostAcknowledged(false);
                          }, 800);
                        }, 800);
                      }}
                      className="px-5 py-2.5 bg-[#111827] hover:bg-[#0F172A] text-white rounded-lg text-[13px] font-medium transition-colors"
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                      Publish report
                    </button>
                  )}

                  {selectedExecutionPath === 'enterprise_bi' && (
                    <>
                      {/* Helper text when Step 3 usage is missing */}
                      {(!selectedUserVolume || !selectedViewFrequency) && (
                        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 mb-3">
                          <p className="text-[11px] text-amber-800" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Complete Step 3 usage details to continue.
                          </p>
                        </div>
                      )}
                      
                      <button
                        onClick={() => {
                          if (!enterpriseCostAcknowledged || !selectedUserVolume || !selectedViewFrequency || !selectedEnterprisePlatform) {
                            return;
                          }
                          
                          addUserMessage(`Publish to ${selectedEnterprisePlatform}`);
                          setIsGenerating(true);
                          
                          setTimeout(() => {
                            setIsGenerating(false);
                            addAssistantMessage(
                              `Your report has been published to ${selectedEnterprisePlatform}.`,
                              'text'
                            );
                            
                            setTimeout(() => {
                              const reportName = createReportState.selectedDataset?.name || 'Customer Churn';
                              
                              addAssistantMessage(
                                '',
                                'report_ready_cta',
                                {
                                  reportName: reportName,
                                  platform: selectedEnterprisePlatform,
                                  executionPath: 'open_source',
                                  status: 'Published'
                                }
                              );
                              
                              // Reset create report flow state
                              setCreateReportState({ step: null });
                              setShowAdvancedOptions(false);
                              setSelectedExecutionPath('open_source');
                              setSelectedEnterprisePlatform(null);
                              setEnterpriseCostAcknowledged(false);
                            }, 800);
                          }, 800);
                        }}
                        disabled={!enterpriseCostAcknowledged || !selectedUserVolume || !selectedViewFrequency || !selectedEnterprisePlatform}
                        className={`px-5 py-2.5 rounded-lg text-[13px] font-medium transition-colors ${
                          (enterpriseCostAcknowledged && selectedUserVolume && selectedViewFrequency && selectedEnterprisePlatform)
                            ? 'bg-purple-600 hover:bg-purple-700 text-white'
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        }`}
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        Request approval & publish
                      </button>
                      <button
                        onClick={() => {
                          setSelectedExecutionPath('open_source');
                          setSelectedEnterprisePlatform(null);
                          setEnterpriseCostAcknowledged(false);
                        }}
                        className="px-5 py-2.5 bg-white hover:bg-gray-50 border border-[#E5E7EB] text-[#111827] rounded-lg text-[13px] font-medium transition-colors"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        Go back and use Open Source instead
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Report Ready CTA */}
            {message.renderType === 'report_ready_cta' && message.data && (
              <div className="mt-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-5">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-[14px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {message.data.reportName}
                      </h4>
                      <p className="text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {message.data.executionPath === 'enterprise_bi' 
                          ? `Submitted to ${message.data.platform} • Pending approval`
                          : 'Published • Ready to view'}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      // Navigate directly to Customer Churn report detail page
                      navigate('/reports/RPT-CHURN-001');
                    }}
                    className="w-full px-5 py-3 bg-[#111827] hover:bg-[#0F172A] text-white rounded-lg text-[13px] font-semibold transition-colors flex items-center justify-center gap-2"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
                    {message.data.executionPath === 'enterprise_bi' ? 'Go to report' : 'View report'}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Option Chips */}
            {message.renderType === 'option_chips' && message.data && (
              <div className="flex flex-wrap gap-2 mt-3">
                {message.data.map((option: string, idx: number) => (
                  <button
                    key={`${message.id}-option-${idx}`}
                    onClick={() => {
                      // OLD FLOW - should not be used anymore
                      // All dataset selections now go through create report flow
                      console.warn('option_chips clicked - this should not happen in new flow');
                    }}
                    className="px-4 py-2 bg-white hover:bg-gray-50 border border-[#E5E7EB] rounded-full text-[12px] text-[#111827] transition-colors shadow-sm hover:shadow"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}

            {/* Migration Dataset List */}
            {message.renderType === 'migration_dataset_list' && message.data && (
              <div className="space-y-2 mt-3">
                {message.data.datasets.map((dataset: any) => (
                  <div
                    key={dataset.dataset_id}
                    onClick={() => handleMigrationDatasetSelect(dataset)}
                    className="bg-white border border-[#E5E7EB] rounded-xl p-4 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-[14px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {dataset.dataset_name}
                          </h4>
                          {dataset.source_system && (
                            <span className={`inline-block text-[9px] font-medium px-2 py-0.5 rounded ${getDatasetSourceColor(dataset.source_system)}`}>
                              {dataset.source_system}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                          {dataset.domain} • {dataset.data_owner}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {dataset.certified_flag && (
                          <span className="bg-blue-50 text-blue-700 text-[10px] font-medium px-2 py-0.5 rounded" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Certified
                          </span>
                        )}
                        {dataset.migration_readiness && (
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                            dataset.migration_readiness.readiness_score >= 80 ? 'bg-green-50 text-green-700' :
                            dataset.migration_readiness.readiness_score >= 60 ? 'bg-yellow-50 text-yellow-700' :
                            'bg-red-50 text-red-700'
                          }`} style={{ fontFamily: 'Inter, sans-serif' }}>
                            {dataset.migration_readiness.readiness_score}% ready
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                      <span className="flex items-center gap-1">
                        <div className={`w-2 h-2 rounded-full ${dataset.dataset_health?.freshness_status === 'Current' ? 'bg-green-500' : 'bg-orange-500'}`} />
                        {dataset.dataset_health?.freshness_status || 'Unknown'}
                      </span>
                      <span>Last refreshed {formatRelativeTime(dataset.last_refresh_ts)}</span>
                      <span>{(dataset.row_count || 0).toLocaleString()} rows</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Migration Intent Selection */}
            {message.renderType === 'migration_intent_selection' && message.data && (() => {
              const [selectedIntent, setSelectedIntent] = React.useState<'create_new' | 'migrate_existing' | null>(null);
              
              return (
                <div className="space-y-4 mt-3">
                  {/* Section Header */}
                  <h3 className="text-[14px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Choose one option to continue
                  </h3>

                  {/* Intent Selection Cards */}
                  <div className="grid grid-cols-1 gap-3">
                    {/* Option A: Create New */}
                    <div
                      onClick={() => setSelectedIntent('create_new')}
                      className={`bg-white border-2 rounded-xl p-4 cursor-pointer transition-all ${
                        selectedIntent === 'create_new'
                          ? 'border-blue-500 ring-2 ring-blue-100 shadow-md bg-blue-50/30'
                          : 'border-[#E5E7EB] hover:border-blue-300 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                          selectedIntent === 'create_new'
                            ? 'border-blue-500 bg-blue-500'
                            : 'border-gray-400 bg-white'
                        }`}>
                          {selectedIntent === 'create_new' && (
                            <div className="w-3 h-3 rounded-full bg-white" />
                          )}
                        </div>
                        <div className="flex-1">
                          <h4 className="text-[14px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Create a new report in the destination
                          </h4>
                          <p className="text-[12px] text-[#6B7280] leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Start fresh using governed data and certified metrics in Report Hub.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Option B: Migrate Existing */}
                    <div
                      onClick={() => setSelectedIntent('migrate_existing')}
                      className={`bg-white border-2 rounded-xl p-4 cursor-pointer transition-all ${
                        selectedIntent === 'migrate_existing'
                          ? 'border-blue-500 ring-2 ring-blue-100 shadow-md bg-blue-50/30'
                          : 'border-[#E5E7EB] hover:border-blue-300 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                          selectedIntent === 'migrate_existing'
                            ? 'border-blue-500 bg-blue-500'
                            : 'border-gray-400 bg-white'
                        }`}>
                          {selectedIntent === 'migrate_existing' && (
                            <div className="w-3 h-3 rounded-full bg-white" />
                          )}
                        </div>
                        <div className="flex-1">
                          <h4 className="text-[14px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Migrate an existing report
                          </h4>
                          <p className="text-[12px] text-[#6B7280] leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Rebuild an existing Tableau report using governed definitions and optimized routing.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Action Controls */}
                  <div className="flex flex-col gap-3">
                    <button
                      onClick={() => {
                        if (selectedIntent) {
                          handleMigrationIntentSelect(selectedIntent);
                        }
                      }}
                      disabled={!selectedIntent}
                      className={`px-6 py-2.5 rounded-lg text-[13px] font-medium transition-all shadow-sm ${
                        selectedIntent 
                          ? 'bg-[#111827] hover:bg-[#0F172A] text-white cursor-pointer' 
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                      Continue
                    </button>
                    
                    {/* Secondary Link */}
                    <button
                      onClick={() => {
                        // Show migration overview information
                        addAssistantMessage(
                          '## Migration Overview\n\n**What is migration?**\nMigration helps you move datasets and reports from legacy BI platforms to modern, governed platforms in Report Hub.\n\n**Two migration paths:**\n\n1. **Create New Report** - Build a fresh report using certified data and metrics\n2. **Migrate Existing** - Rebuild an existing report while preserving business logic\n\n**Benefits:**\n• Reduced BI platform licensing costs\n• Improved data governance\n• Faster query performance\n• Centralized metric definitions',
                          'text'
                        );
                      }}
                      className="text-[#6B7280] hover:text-[#111827] text-[13px] font-medium transition-colors underline self-start"
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                      View migration overview
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Migration Platform Selection */}
            {message.renderType === 'migration_platform_selection' && message.data && (() => {
              const isSourceSelection = message.data.selectionType === 'source';
              const [selectedPlatform, setSelectedPlatform] = React.useState<string | null>(null);
              
              return (
                <div className="space-y-3 mt-3">
                  <div className="grid grid-cols-2 gap-3">
                    {message.data.platforms.map((platform: any) => {
                      const isRecommended = !isSourceSelection && platform.name === message.data.recommendedPlatform;
                      const isSelected = selectedPlatform === platform.name;
                      
                      return (
                        <div
                          key={platform.name}
                          onClick={() => setSelectedPlatform(platform.name)}
                          className={`relative bg-white border-2 rounded-xl p-4 transition-all cursor-pointer ${
                            isSelected
                              ? 'border-blue-500 ring-2 ring-blue-100 shadow-md bg-blue-50/30'
                              : isRecommended 
                                ? 'border-blue-400 ring-2 ring-blue-100' 
                                : 'border-[#E5E7EB] hover:border-blue-300 hover:shadow-sm'
                          }`}
                        >
                          {isRecommended && !isSelected && (
                            <div className="absolute -top-2 -right-2 bg-blue-600 text-white text-[9px] font-semibold px-2 py-1 rounded-full shadow-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
                              RECOMMENDED
                            </div>
                          )}
                          <div className="flex items-start gap-3">
                            <div className="text-2xl">{platform.icon}</div>
                            <div className="flex-1">
                              <h4 className="text-[14px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                                {platform.name}
                              </h4>
                              <p className="text-[11px] text-[#6B7280] leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>
                                {platform.description}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Recommendation Reason (only for target platform) */}
                  {!isSourceSelection && message.data.recommendationReason && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
                      <Sparkles className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[11px] font-semibold text-blue-900 mb-0.5" style={{ fontFamily: 'Inter, sans-serif' }}>
                          Why we recommend {message.data.recommendedPlatform}
                        </p>
                        <p className="text-[11px] text-blue-800" style={{ fontFamily: 'Inter, sans-serif' }}>
                          {message.data.recommendationReason}
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {/* Continue Button */}
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      disabled={!selectedPlatform}
                      onClick={() => {
                        if (selectedPlatform) {
                          if (isSourceSelection) {
                            handleSourcePlatformSelect(selectedPlatform);
                          } else {
                            handleMigrationPlatformSelect(selectedPlatform);
                          }
                        }
                      }}
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
              );
            })()}

            {/* Migration Pills (suggested actions) */}
            {message.renderType === 'migration_pills' && message.data && (
              <div className="flex flex-wrap gap-2 mt-3">
                {message.data.pills.map((pill: string, idx: number) => (
                  <button
                    key={`${message.id}-migration-pill-${idx}`}
                    onClick={() => handleMigrationPillClick(pill)}
                    className="px-4 py-2 bg-white hover:bg-gray-50 border border-[#E5E7EB] rounded-full text-[12px] text-[#111827] transition-all shadow-sm hover:shadow-md"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
                    {pill}
                  </button>
                ))}
              </div>
            )}

            {/* Migration Plan */}
            {message.renderType === 'migration_plan' && message.data && (() => {
              const dataset = message.data.dataset;
              const targetPlatform = message.data.targetPlatform || dataset.migration_target_recommendation || 'Snowflake';
              const readiness = dataset.migration_readiness || {};
              return (
                <div className="bg-white border border-[#E5E7EB] rounded-xl overflow-hidden mt-3">
                  {/* Header with Share Button */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-5 py-3 border-b border-[#E5E7EB] flex items-center justify-between">
                    <div>
                      <h4 className="text-[14px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                        Migration Plan
                      </h4>
                      <p className="text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {dataset.dataset_name} → {targetPlatform} • Generated {new Date().toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        const link = `${window.location.origin}/talk/migration/${activeConversationId}?plan=true`;
                        navigator.clipboard.writeText(link);
                        addAssistantMessage('✅ Migration plan link copied to clipboard!', 'text');
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-gray-50 border border-[#E5E7EB] rounded-lg text-[12px] text-[#111827] transition-all shadow-sm hover:shadow"
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      Share
                    </button>
                  </div>
                  
                  <div className="p-5 space-y-4">
                    {/* Target Platform */}
                    <div>
                    <h5 className="text-[12px] font-semibold text-[#6B7280] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                      TARGET PLATFORM
                    </h5>
                    <div className="flex items-center gap-2">
                      <span className="bg-blue-50 text-blue-700 text-[13px] font-medium px-3 py-1.5 rounded" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {targetPlatform}
                      </span>
                    </div>
                  </div>

                  {/* Platform Visual Preview: Before & After Migration */}
                  <PlatformVisualPreview 
                    sourcePlatform={dataset.source_system || 'Looker'}
                    targetPlatform={targetPlatform}
                  />

                  {/* Schema Mapping */}
                  <div>
                    <h5 className="text-[12px] font-semibold text-[#6B7280] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                      SCHEMA MAPPING SUMMARY
                    </h5>
                    <div className="text-[12px] text-[#111827] space-y-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                      <p>• {dataset.schema_tables_count || 3} tables will be migrated</p>
                      <p>• {dataset.field_count || 0} fields mapped automatically</p>
                      <p>• 0 custom transformations required</p>
                    </div>
                  </div>

                  {/* Downtime Window */}
                  <div>
                    <h5 className="text-[12px] font-semibold text-[#6B7280] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                      EXPECTED DOWNTIME WINDOW
                    </h5>
                    <p className="text-[12px] text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {readiness.migration_window_recommendation || 'Off-peak hours recommended'}
                    </p>
                  </div>

                  {/* Pre-checklist */}
                  <div>
                    <h5 className="text-[12px] font-semibold text-[#6B7280] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                      PRE-MIGRATION CHECKLIST
                    </h5>
                    <div className="space-y-1.5">
                      {[
                        'Backup source data',
                        'Verify credentials and permissions',
                        'Notify stakeholders of migration window',
                        'Review schema mappings',
                      ].map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-[12px] text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                </div>
              );
            })()}

            {/* Migration Validation */}
            {message.renderType === 'migration_validation' && message.data && (() => {
              const dataset = message.data.dataset;
              const passed = (dataset.migration_readiness?.readiness_score || 0) >= 70;
              const hasWarnings = (dataset.migration_readiness?.key_blockers || []).length > 0;
              
              return (
                <div className="mt-3">
                  {/* Validation Summary Banner */}
                  <div className={`border rounded-xl p-4 mb-4 ${passed && !hasWarnings ? 'bg-green-50 border-green-200' : hasWarnings ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center gap-3">
                      {passed && !hasWarnings ? (
                        <CheckCircle2 className="w-6 h-6 text-green-600" />
                      ) : hasWarnings ? (
                        <AlertTriangle className="w-6 h-6 text-yellow-600" />
                      ) : (
                        <X className="w-6 h-6 text-red-600" />
                      )}
                      <div>
                        <h5 className="text-[14px] font-semibold" style={{ fontFamily: 'Inter, sans-serif' }}>
                          {passed && !hasWarnings ? 'Validation Passed' : hasWarnings ? 'Passed with Warnings' : 'Validation Failed'}
                        </h5>
                        <p className="text-[12px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                          Readiness Score: {dataset.migration_readiness?.readiness_score || 0}/100
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Validation Checks */}
                  <div className="bg-white border border-[#E5E7EB] rounded-xl p-5 space-y-4">
                    {/* Freshness Check */}
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5" />
                      <div>
                        <h6 className="text-[12px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                          Freshness Check
                        </h6>
                        <p className="text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                          Data is {dataset.dataset_health?.freshness_status?.toLowerCase()}. Last refresh: {formatRelativeTime(dataset.last_refresh_ts)}
                        </p>
                      </div>
                    </div>

                    {/* Schema Compatibility */}
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5" />
                      <div>
                        <h6 className="text-[12px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                          Schema Compatibility
                        </h6>
                        <p className="text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                          All field types are compatible with target platform
                        </p>
                      </div>
                    </div>

                    {/* PII Flag */}
                    {dataset.pii_flag && (
                      <div className="flex items-start gap-3">
                        <Shield className="w-5 h-5 text-blue-600 mt-0.5" />
                        <div>
                          <h6 className="text-[12px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                            PII Detected
                          </h6>
                          <p className="text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                            This dataset contains personally identifiable information. Extra security measures required.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Reports List */}
            {message.renderType === 'reports_list' && message.data && (
              <>
                <div className="space-y-2 mt-3">
                  {(message.data.reports || message.data).map((report: any) => (
                    <div
                      key={report.report_id}
                      onClick={(e) => handleReportCardClick(report, e)}
                      className="bg-white border border-[#E5E7EB] rounded-lg p-4 hover:border-blue-400 hover:shadow-sm transition-all cursor-pointer group"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-[14px] font-semibold text-[#111827] group-hover:text-blue-700 transition-colors" style={{ fontFamily: 'Inter, sans-serif' }}>
                              {report.report_name}
                            </h3>
                            <span className={`inline-block text-[9px] font-medium px-2 py-0.5 rounded ${report.source_application ? getSourceAppColor(report.source_application) : 'bg-gray-100 text-gray-700'}`}>
                              {report.source_application || 'Open Source Analytics'}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                            <span>{report.domain}</span>
                            <span>•</span>
                            <span>Last viewed: {formatRelativeTime(report.last_updated_ts)}</span>
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition-colors flex-shrink-0 ml-3" />
                      </div>
                    </div>
                  ))}
                </div>

                {/* View All Reports Link - Only show for general reports list, not dataset-linked */}
                {message.data.showActions && (
                  <button
                    onClick={() => navigate('/reports')}
                    className="mt-3 text-[12px] text-blue-600 hover:text-blue-800 font-medium transition-colors"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
                    View all reports →
                  </button>
                )}

                {/* Post-Reports Actions */}
                {message.data.showActions && (
                  <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-[#E5E7EB]">
                    {[
                      'Ask a question about a report',
                      'Create a new report',
                    ].map((action, idx) => (
                      <button
                        key={`${message.id}-action-${idx}`}
                        onClick={() => handlePostReportAction(action)}
                        className="px-4 py-2 bg-white hover:bg-gray-50 border border-[#E5E7EB] rounded-full text-[12px] text-[#111827] transition-colors shadow-sm hover:shadow"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Datasets List */}
            {message.renderType === 'datasets_list' && message.data && (
              <>
                <div className="space-y-2 mt-3">
                  {message.data.map((dataset: any) => (
                    <div
                      key={dataset.dataset_id}
                      onClick={() => handleDatasetClick(dataset)}
                      className="bg-white border border-[#E5E7EB] rounded-lg p-4 hover:border-blue-400 hover:shadow-sm transition-all cursor-pointer group"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-[14px] font-semibold text-[#111827] group-hover:text-blue-700 transition-colors" style={{ fontFamily: 'Inter, sans-serif' }}>
                              {dataset.dataset_name}
                            </h3>
                            {dataset.source_system && (
                              <span className={`inline-block text-[9px] font-medium px-2 py-0.5 rounded ${getDatasetSourceColor(dataset.source_system)}`}>
                                {dataset.source_system}
                              </span>
                            )}
                            {dataset.certified_flag && (
                              <div className="w-3.5 h-3.5">
                                <MedallionIcon />
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                            <span>{dataset.domain}</span>
                            <span>•</span>
                            <span>Refreshed: {formatRelativeTime(dataset.last_refresh_ts)}</span>
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition-colors flex-shrink-0 ml-3" />
                      </div>
                    </div>
                  ))}
                </div>

                {/* View All Datasets Link */}
                <button
                  onClick={() => navigate('/datasets')}
                  className="mt-3 text-[12px] text-blue-600 hover:text-blue-800 font-medium transition-colors"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                >
                  View all datasets →
                </button>
              </>
            )}

            {/* Chart Preview - DISABLED: All chart previews now render in right panel only */}

            {/* Actions */}
            {message.renderType === 'actions' && message.data && (
              <div className="flex flex-wrap gap-2 mt-3">
                {message.data.map((action: string, idx: number) => (
                  <button
                    key={`${message.id}-btn-${idx}`}
                    onClick={() => handleActionButtonClick(action)}
                    className={`px-4 py-2 rounded-lg text-[12px] font-medium transition-colors ${
                      idx === 0
                        ? 'bg-[#111827] hover:bg-[#0F172A] text-white'
                        : 'bg-white hover:bg-gray-50 border border-[#E5E7EB] text-[#111827]'
                    }`}
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
                    {action}
                  </button>
                ))}
              </div>
            )}

            {/* Report Context Prompts */}
            {message.renderType === 'report_context_prompts' && message.data && (
              <div className="mt-3">
                <div className="flex flex-wrap gap-2 mb-3">
                  {message.data.prompts?.map((prompt: string, idx: number) => (
                    <button
                      key={`${message.id}-prompt-${idx}`}
                      onClick={() => handleReportContextPrompt(prompt)}
                      className="px-3 py-2 bg-white hover:bg-gray-50 border border-[#E5E7EB] rounded-full text-[12px] text-[#111827] transition-colors shadow-sm hover:shadow"
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
                {/* Freedom Disclaimer */}
                <p className="text-[11px] text-[#9CA3AF] italic leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>
                  You're not restricted to these suggestions. You can ask anything about this {activeDatasetContext ? 'dataset' : 'report'} using the chat below.
                </p>
              </div>
            )}

            {/* Inline Chart - AMCharts visualization */}
            {message.renderType === 'inline_chart' && message.data && (
              <div>
                <InlineChart
                  chartType={chartRefinements[message.id]?.chartType as any || message.data.chartType}
                  title={chartRefinements[message.id]?.title || message.data.title}
                  reportName={message.data.reportName}
                  datasetName={message.data.datasetName}
                  data={chartRefinements[message.id]?.data || message.data.data}
                />

                {/* Add to Report Badge (persistent after confirmation) */}
                {addToReportBadge[message.id] && (
                  <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full text-[12px] text-emerald-700" style={{ fontFamily: 'Inter, sans-serif' }}>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    Added to {addToReportBadge[message.id]}
                  </div>
                )}

                {/* Add to Report Confirmation Card */}
                {showAddToReportConfirmation && addToReportChartId === message.id && addToReportTarget && (
                  <div className="mt-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl animate-in fade-in" style={{ fontFamily: 'Inter, sans-serif' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                        <Check className="w-4 h-4 text-emerald-600" />
                      </div>
                      <span className="text-[13px] font-semibold text-emerald-800">Chart successfully added</span>
                    </div>
                    <div className="ml-8 p-2.5 bg-white border border-emerald-100 rounded-lg">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-emerald-600" />
                        <span className="text-[12px] font-medium text-[#111827]">{addToReportTarget.report_name || addToReportTarget.name}</span>
                      </div>
                      <p className="text-[11px] text-[#6B7280] mt-1 ml-6">
                        {message.data.chartType} chart &middot; {message.data.title}
                      </p>
                    </div>
                  </div>
                )}

                {/* Add to Report Dropdown */}
                {addToReportChartId === message.id && !showAddToReportConfirmation && !addToReportBadge[message.id] && (
                  <div className="mt-3 relative">
                    <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-lg p-2 max-h-[200px] overflow-y-auto" style={{ fontFamily: 'Inter, sans-serif' }}>
                      <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider px-3 py-1.5">Select a report</p>
                      {allReports.slice(0, 5).map((report: any, rIdx: number) => (
                        <button
                          key={`add-report-${rIdx}`}
                          onClick={() => handleSelectReportForChart(report)}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded-lg transition-colors flex items-center gap-2"
                        >
                          <FileText className="w-3.5 h-3.5 text-[#9CA3AF]" />
                          <span className="text-[13px] text-[#111827] truncate">{report.report_name || report.name}</span>
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setAddToReportChartId(null)}
                      className="mt-1.5 text-[11px] text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {/* Add to Report Button */}
                {!addToReportBadge[message.id] && addToReportChartId !== message.id && (
                  <button
                    onClick={() => handleAddChartToReport(message.id)}
                    className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-gray-50 border border-[#E5E7EB] rounded-full text-[12px] text-[#111827] transition-all shadow-sm hover:shadow-md"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add to Report
                  </button>
                )}

                {/* Chart Refinement Input */}
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={refinementInputs[message.id] || ''}
                      onChange={(e) => setRefinementInputs(prev => ({ ...prev, [message.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && refinementInputs[message.id]?.trim()) {
                          handleChartRefinement(message.id, refinementInputs[message.id], message.data);
                        }
                      }}
                      placeholder="Refine this chart... (e.g., 'switch to bar chart', 'show only Q1')"
                      className="w-full px-4 py-2.5 border border-[#E5E7EB] rounded-lg text-[12px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    />
                  </div>
                  <button
                    onClick={() => {
                      if (refinementInputs[message.id]?.trim()) {
                        handleChartRefinement(message.id, refinementInputs[message.id], message.data);
                      }
                    }}
                    disabled={!refinementInputs[message.id]?.trim()}
                    className="px-4 py-2.5 bg-[#111827] hover:bg-[#0F172A] text-white rounded-lg text-[12px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
                    Refine
                  </button>
                </div>
                {chartRefinements[message.id] && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                      Chart refined
                    </span>
                    <button
                      onClick={() => setChartRefinements(prev => { const next = {...prev}; delete next[message.id]; return next; })}
                      className="text-[11px] text-blue-600 hover:text-blue-800 underline"
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                      Reset to original
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <Layout>
      {/* SECONDARY NAV — TALK HISTORY */}
      <aside className="fixed top-[52px] left-[64px] bottom-0 w-[240px] bg-white border-r border-[#ECEAE6] z-30 flex flex-col">
        <div className="p-4 border-b border-[#ECEAE6]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[16px] font-semibold text-[#2C2B29]" style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}>
              Talk
            </h2>
            <button
              onClick={handleNewConversation}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#111110] hover:bg-[#2C2B29] text-white border border-[#111110] rounded-[7px] text-[12px] font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-0">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => handleLoadConversation(conv)}
              onMouseEnter={() => setHoveredConvId(conv.id)}
              onMouseLeave={() => setHoveredConvId(null)}
              className={`p-3 rounded-lg cursor-pointer transition-colors duration-150 group border-b border-[#F7F5F2] ${
                activeConversationId === conv.id
                  ? 'bg-[#F0EDE8] border-b-[#ECEAE6]'
                  : 'bg-transparent hover:bg-[#F4F2EF]'
              }`}
            >
              {editingConvId === conv.id ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveEdit(conv.id);
                      } else if (e.key === 'Escape') {
                        handleCancelEdit();
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 px-2 py-1 text-[12px] border border-[#E5E3DF] rounded input-warm-focus"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                    autoFocus
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSaveEdit(conv.id);
                    }}
                    className="p-1 hover:bg-white rounded transition-colors"
                    title="Save"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCancelEdit();
                    }}
                    className="p-1 hover:bg-white rounded transition-colors"
                    title="Cancel"
                  >
                    <X className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-[12px] font-medium text-[#2C2B29] line-clamp-2">
                        {conv.title}
                      </p>
                      {conv.status === 'planned' && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{ background: '#EBF0FB', color: '#1A55A0' }}>
                          Planned
                        </span>
                      )}
                      {conv.status === 'draft' && (
                        <span className="bg-gray-100 text-gray-700 text-[9px] font-medium px-1.5 py-0.5 rounded" style={{ fontFamily: 'Inter, sans-serif' }}>
                          Draft
                        </span>
                      )}
                    </div>
                    <p className="text-[10.5px] text-[#8A8785]">
                      {formatRelativeTime(conv.timestamp)}
                    </p>
                  </div>
                  {hoveredConvId === conv.id && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* Show copy link button for migration sessions */}
                      {conv.status === 'planned' && conv.migrationState && (
                        <button
                          onClick={(e) => handleCopyMigrationLink(conv, e)}
                          className="p-1 hover:bg-white rounded transition-colors"
                          title="Copy link"
                        >
                          {copiedLinkId === conv.id ? (
                            <Check className="w-3 h-3 text-green-600" />
                          ) : (
                            <Link2 className="w-3 h-3 text-gray-500" />
                          )}
                        </button>
                      )}
                      <button
                        onClick={(e) => handleStartEdit(conv.id, conv.title, e)}
                        className="p-1 hover:bg-white rounded transition-colors"
                        title="Rename"
                      >
                        <Edit2 className="w-3 h-3 text-gray-500" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteConversation(conv.id, e)}
                        className="p-1 hover:bg-white rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3 text-gray-500" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>

      {/* MAIN TALK WORKSPACE */}
      <div
        className={`fixed top-[52px] left-[304px] bottom-0 overflow-hidden transition-all duration-300 ${
          isReportPanelOpen || isDatasetPanelOpen ? 'right-[480px]' : 'right-0'
        }`}
      >
        <div className="h-full flex flex-col bg-[#F7F6F3]">
          {/* STATE 1: NEW CONVERSATION */}
          {flowState === 'new' && messages.length === 0 && (() => {
            const freqReports = getRecentReports(5);
            const trendingReportsRaw = getRecentReports(7);
            // Put restricted reports (idx >= 5) first
            const trendingRestricted = trendingReportsRaw.slice(5);
            const trendingAccessible = trendingReportsRaw.slice(0, 5);
            const trendingReports = [...trendingRestricted, ...trendingAccessible];
            const defaultIntentCards = [
              { title: 'Create a New Report', description: 'Start building insights from your connected datasets', gradient: 'from-blue-500 to-indigo-600', action: 'Help me create a new report' },
              { title: 'Explore Trending Data', description: 'See what reports and datasets are gaining traction', gradient: 'from-purple-500 to-pink-600', action: 'Show me trending reports and datasets' },
              { title: 'Data Quality Overview', description: 'Check freshness and governance status across datasets', gradient: 'from-emerald-500 to-teal-600', action: 'Show me data quality overview' },
              { title: 'Ask a Business Question', description: 'Use conversational analytics to get instant answers', gradient: 'from-orange-500 to-amber-600', action: 'I want to ask a business question' },
            ];
            const intentCards = persona?.intentCards ?? defaultIntentCards;
            // Unified home navigation — fades out, resets both QS and report flow states
            const goHome = () => {
              setQsFading(true);
              setTimeout(() => {
                setQsFlowCard(null);
                setReportFlowCard(null);
                setQsAnswerLoaded(false);
                setReportAnswerLoaded(false);
                requestAnimationFrame(() => setQsFading(false));
              }, 200);
            };

            // Report-specific pre-populated content
            const reportFlowDataMap: Record<string, { subtitle: string; answer: string; chips: string[]; placeholder: string }> = {
              'RPT-CHURN-001': {
                subtitle: 'Churn rose 2.1pp in October — 68% of exits concentrated in the 0–6 month tenure cohort.',
                answer: 'October churn reached <strong>8.4%</strong>, up from 6.3% in September, driven primarily by early-life exits. Key findings:<br><br>• <strong>0–6 month cohort</strong> accounts for 68% of churned customers — highest risk window<br>• <strong>Top exit reason</strong>: Product-feature mismatch (34%), followed by pricing (22%)<br>• <strong>Highest-churn segment</strong>: SMB accounts in the West region (+3.8pp vs average)<br>• <strong>Retention bright spot</strong>: Enterprise accounts showed 0.9% churn — 7× lower than SMB<br><br>Early intervention at the 45-day mark could retain an estimated 18% of at-risk accounts based on historical save rates.',
                chips: ['Which segments are churning most?', 'Show month-over-month trend', 'What\'s driving early churn?'],
                placeholder: 'Ask a follow-up about customer churn…',
              },
              'RPT-001': {
                subtitle: 'Sales unit revenue is up 9% QTD — 3 of 5 territories are above plan, Northeast leading at 114%.',
                answer: 'Your <strong>SU&G Performance</strong> shows strong QTD momentum across most territories. Highlights:<br><br>• <strong>Overall QTD revenue</strong>: $2.4M — 9% above plan ($2.2M target)<br>• <strong>Northeast</strong>: 114% of plan, led by the Albany and Boston accounts<br>• <strong>Southwest</strong>: 108% of plan — consistent for 3 consecutive quarters<br>• <strong>Midwest</strong>: 91% of plan, $62K gap — at risk of missing quarter-end target<br>• <strong>Pipeline coverage</strong>: 2.8× open pipeline vs remaining target<br><br>The Midwest gap is recoverable with the 4 deals in late-stage negotiation (combined $84K). Recommend priority focus on those accounts this week.',
                chips: ['Break down by territory', 'Show pipeline by rep', 'Forecast quarter-end'],
                placeholder: 'Ask a follow-up about SU&G performance…',
              },
              'RPT-003': {
                subtitle: 'Territory take rates averaged 23.4% nationally — Western region is 4.1pp below the top-performing tier.',
                answer: 'National take rate stands at <strong>23.4%</strong> this period. Regional breakdown reveals a clear performance gap:<br><br>• <strong>Top tier</strong> (Northeast + Southeast): 27.2% average — dense prospect pools<br>• <strong>Mid tier</strong> (Central): 24.1% — steady, consistent with prior quarter<br>• <strong>Below average</strong> (Western): 19.1% — 4.1pp below next tier, competitive pressure in SF and LA<br>• <strong>New territory</strong> (Pacific Northwest): 16.8% — ramp period ends Q3<br><br>Western territory could close 2pp of the gap by shifting focus to mid-market accounts, where win rates are 1.6× higher vs enterprise in that region.',
                chips: ['Show by territory on a map', 'Which products have the best take rate?', 'Compare to last quarter'],
                placeholder: 'Ask a follow-up about territory take rates…',
              },
              'RPT-005': {
                subtitle: '82% of outlets are meeting or exceeding targets — 14 outlets flagged for intervention this quarter.',
                answer: 'Your outlet network is performing at <strong>82% attainment</strong> across 204 active outlets. Key callouts:<br><br>• <strong>Exceeding target (&gt;110%)</strong>: 38 outlets — concentrated in Tier 1 urban markets<br>• <strong>On target (90–110%)</strong>: 129 outlets — healthy core of the network<br>• <strong>At risk (70–89%)</strong>: 23 outlets — need coaching and support<br>• <strong>Flagged (&lt;70%)</strong>: 14 outlets — recommend field visit within 30 days<br>• <strong>Top outlet</strong>: Chicago North (187% of target), driven by a new enterprise anchor account<br><br>The 14 flagged outlets share a common pattern: low foot traffic and high staff turnover. A targeted retention program could improve attainment by an estimated 12–15%.',
                chips: ['Show flagged outlets list', 'What\'s the top performing region?', 'Filter by outlet size'],
                placeholder: 'Ask a follow-up about outlet performance…',
              },
              'RPT-002': {
                subtitle: 'NPS improved 8 points to 42 — detractor rate dropped from 24% to 19% over the past 90 days.',
                answer: 'Customer experience metrics are trending positively. Your <strong>NPS score reached 42</strong>, the highest in 18 months:<br><br>• <strong>Promoters</strong>: 61% (+6pp vs last quarter)<br>• <strong>Passives</strong>: 20% (flat)<br>• <strong>Detractors</strong>: 19% (down from 24%) — driven by improved onboarding satisfaction<br>• <strong>CSAT</strong>: 4.3/5.0 — support interactions rated highest category<br>• <strong>First-contact resolution</strong>: 78%, up from 71%<br>• <strong>Top driver of dissatisfaction</strong>: Billing complexity (mentioned in 43% of negative responses)<br><br>Addressing the billing UX issue — estimated 6–8 week fix — could push NPS above 50 based on driver modeling.',
                chips: ['Show NPS by customer segment', 'What are detractors saying?', 'Compare to industry benchmark'],
                placeholder: 'Ask a follow-up about customer experience…',
              },
            };
            const reportFlowDefault = {
              subtitle: 'This report has been updated recently. Here\'s a summary of the key findings.',
              answer: 'This report shows strong performance across the core metrics. Here\'s what stands out:<br><br>• <strong>Primary metric</strong>: Trending above target for the current period<br>• <strong>Key driver</strong>: Improved engagement in the highest-value segments<br>• <strong>Risk area</strong>: One sub-segment is underperforming — monitoring recommended<br>• <strong>Next review</strong>: Scheduled for end of quarter<br><br>Ask a follow-up question below to explore specific dimensions of this report.',
              chips: ['Show key metrics', 'What changed this period?', 'Compare to last quarter'],
              placeholder: 'Ask a follow-up…',
            };
            const currentReportData = reportFlowCard
              ? (reportFlowDataMap[reportFlowCard.report.report_id] ?? reportFlowDefault)
              : reportFlowDefault;

            // Fixed gradient palette for Quick Summary cards (cycles for >4 cards)
            const cardGradients = [
              'linear-gradient(148deg, #1E3A8A 0%, #1D4ED8 55%, #3B82F6 100%)',
              'linear-gradient(148deg, #4C1D95 0%, #6D28D9 55%, #8B5CF6 100%)',
              'linear-gradient(148deg, #134E4A 0%, #0F766E 55%, #14B8A6 100%)',
              'linear-gradient(148deg, #78350F 0%, #B45309 55%, #F59E0B 100%)',
            ];
            const scrollbarHideStyle: React.CSSProperties = { msOverflowStyle: 'none', scrollbarWidth: 'none' };

            return (
            <div className="flex-1 flex flex-col overflow-hidden relative" style={{ opacity: qsFading ? 0 : 1, transition: 'opacity 200ms ease' }}>

              {/* Floating Talk Home pill — visible in ALL conversation flows, never scrolls away */}
              {(qsFlowCard !== null || reportFlowCard !== null) && (
                <button
                  onClick={goHome}
                  aria-label="Back to Talk home"
                  style={{
                    position: 'absolute',
                    top: 16,
                    left: 32,
                    zIndex: 20,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: '#FFFFFF',
                    border: '1px solid #E5E3DF',
                    borderRadius: 20,
                    padding: '6px 14px 6px 10px',
                    fontSize: 12.5,
                    fontWeight: 500,
                    color: '#2C2B29',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                    cursor: 'pointer',
                    fontFamily: "'Inter', sans-serif",
                    transition: 'all 0.15s ease',
                    minHeight: 32,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#F4F2EF'; e.currentTarget.style.borderColor = '#D4D0CA'; e.currentTarget.style.transform = 'translateX(-2px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#FFFFFF'; e.currentTarget.style.borderColor = '#E5E3DF'; e.currentTarget.style.transform = ''; }}
                >
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                    <path d="M8.5 2.5L4.5 6.5L8.5 10.5" stroke="#6B6865" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Talk home
                </button>
              )}

              {qsFlowCard === null && reportFlowCard === null ? (
              /* ===== LANDING VIEW ===== */
              <div className="flex-1 overflow-y-auto px-8 pt-8 pb-12">
              <div className="w-full max-w-[1100px] mx-auto space-y-8">

                {/* Title / Intro */}
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[#8A8785] mb-2 flex items-center">
                    <span className="inline-block w-[18px] h-[1.5px] bg-[#D4572A] mr-2 rounded-sm flex-shrink-0" />
                    Good morning, Alex
                  </p>
                  <h1 className="text-[30px] text-[#111110] mb-2" style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, letterSpacing: '-0.8px', lineHeight: 1.15 }}>
                    Explore your report data set and <span style={{ color: '#D4572A' }}>ask questions</span>
                  </h1>
                  <p className="text-[14px] text-[#6B6965]">
                    Open a report or dataset, ask a question, or create something new.
                  </p>
                </div>

                {/* Quick Summary */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8A8785] mb-3">Quick Summary</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {intentCards.map((card, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleQsFlowEnter(idx)}
                        aria-label={`Quick summary: ${card.title}`}
                        className="flex items-center gap-4 rounded-[14px] text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 relative overflow-hidden group"
                        style={{
                          background: cardGradients[idx % cardGradients.length],
                          padding: '18px 20px',
                          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 28px rgba(0,0,0,0.18), 0 4px 10px rgba(0,0,0,0.10)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                      >
                        {/* Inner highlight overlay */}
                        <div className="absolute inset-0 pointer-events-none rounded-[14px]" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.10) 0%, transparent 60%)' }} />
                        <div className="flex-1 min-w-0 relative z-[1]">
                          <div className="text-[14px] font-semibold mb-1" style={{ color: '#FFFFFF', fontFamily: "'Inter', sans-serif", letterSpacing: '-0.01em' }}>{card.title}</div>
                          <div className="text-[12.5px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.72)', fontFamily: "'Inter', sans-serif" }}>{card.description}</div>
                        </div>
                        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 relative z-[1] transition-colors duration-150" style={{ background: 'rgba(255,255,255,0.15)' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.28)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
                        >
                          <ChevronRight className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.80)' }} aria-hidden="true" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Natural-language input — elevated ask zone */}
                <div style={{ position: 'relative' }}>
                  {/* Warm ambient glow behind the card */}
                  <div aria-hidden="true" style={{ position: 'absolute', zIndex: 0, width: '120%', height: '200%', top: '-50%', left: '-10%', background: 'radial-gradient(ellipse, rgba(212,87,42,0.04) 0%, transparent 65%)', pointerEvents: 'none' }} />
                  <div
                    className="bg-white space-y-3"
                    style={{
                      position: 'relative',
                      zIndex: 1,
                      border: '1.5px solid #E2DED8',
                      borderRadius: '16px',
                      padding: '20px',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.04), 0 8px 16px rgba(0,0,0,0.06), 0 24px 48px rgba(0,0,0,0.06)',
                      transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.05), 0 16px 32px rgba(0,0,0,0.08), 0 32px 64px rgba(0,0,0,0.07)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.04), 0 8px 16px rgba(0,0,0,0.06), 0 24px 48px rgba(0,0,0,0.06)'; }}
                  >
                    <div className="flex flex-wrap gap-2">
                      {(persona?.quickActions || [
                        'Explore my reports',
                        'Explore my datasets',
                        'Ask a business question',
                        'Create a new report',
                        'Request a migration',
                      ]).map((pill, idx) => (
                        <button
                          key={`starter-${idx}`}
                          onClick={() => handleStarterPillClick(pill)}
                          className="inline-flex items-center justify-center h-[32px] px-[14px] bg-[#F4F2EF] border border-[#E5E3DF] rounded-[16px] text-[12px] leading-none whitespace-nowrap text-[#2C2B29] transition-all duration-150 hover:bg-[#1A1917] hover:text-white hover:border-[#1A1917] hover:-translate-y-px"
                        >
                          {pill}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-3 items-end">
                      <textarea
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask a question, explore your data, or create something new…"
                        className="flex-1 px-4 border border-[#E8E5E0] rounded-[10px] text-[14px] resize-none bg-[#F9F8F6] text-[#1C1917] placeholder:text-[#8A8785] input-warm-focus"
                        style={{ minHeight: '48px', maxHeight: '120px', height: '48px', paddingTop: '14px', paddingBottom: '14px' }}
                        rows={1}
                      />
                      <button
                        onClick={handleAsk}
                        disabled={!inputValue.trim() || isGenerating}
                        aria-label="Send message"
                        className="bg-[#1A1917] text-white text-[14px] font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4572A] focus-visible:ring-offset-2"
                        style={{ height: '48px', padding: '0 24px', borderRadius: '10px', flexShrink: 0 }}
                        onMouseEnter={(e) => { if (!e.currentTarget.disabled) { e.currentTarget.style.background = '#D4572A'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(212,87,42,0.30)'; } }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = '#1A1917'; e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = 'none'; }}
                      >
                        <Send className="w-4 h-4" aria-hidden="true" />
                        Ask
                      </button>
                    </div>
                  </div>
                </div>

                {/* Stat Cards */}
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: 'My Reports', count: reportsCount, trend: '↑ 2 this week', bg: '#EBF3FE', iconColor: '#185FA5', icon: FileText, action: 'My Reports' },
                    { label: 'Datasets', count: datasetsCount, trend: '↑ 1 this week', bg: '#EEEDFE', iconColor: '#534AB7', icon: Database, action: 'My Datasets' },
                    { label: 'Recent', count: recentlyUsedCount, trend: '↑ 3 this week', bg: '#FEF0EC', iconColor: '#D4572A', icon: Clock, action: 'Recently Used' },
                    { label: 'New', count: newItemsCount, trend: '↑ 1 this week', bg: '#E1F5EE', iconColor: '#1D9E75', icon: Layers, action: 'New Since Last Visit' },
                  ].map((stat) => {
                    const StatIcon = stat.icon;
                    return (
                      <div
                        key={stat.label}
                        onClick={() => handleContextCardClick(stat.action)}
                        className="bg-white rounded-[12px] border border-[#E5E3DF] p-5 cursor-pointer text-center transition-all duration-150"
                        style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.03)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.borderColor = '#C8C5BF'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.03)'; e.currentTarget.style.borderColor = '#E5E3DF'; }}
                      >
                        <div className="w-9 h-9 rounded-[10px] mx-auto mb-3 flex items-center justify-center" style={{ background: stat.bg }}>
                          <StatIcon className="w-4 h-4" style={{ color: stat.iconColor }} />
                        </div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8A8785] mb-1">{stat.label}</p>
                        <p className="text-[26px] text-[#1C1917]" style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{stat.count}</p>
                        <p className="text-[10px] font-medium text-[#1D9E75] mt-1">{stat.trend}</p>
                      </div>
                    );
                  })}
                </div>

                {/* Frequently Accessed */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8A8785]">Frequently Accessed</p>
                    <button onClick={() => handleStarterPillClick('Explore my reports')} className="text-[12px] font-medium text-[#D4572A] hover:text-[#BF4D25] hover:underline transition-colors duration-150 flex items-center gap-1 group/see">
                      See all
                      <svg className="w-3 h-3 transition-transform duration-150 group-hover/see:translate-x-[3px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-2" style={scrollbarHideStyle}>
                    {freqReports.map((report: any, idx: number) => {
                      const stripeGradients = [
                        'linear-gradient(90deg, #2563EB, #60A5FA)',
                        'linear-gradient(90deg, #7C3AED, #A78BFA)',
                        'linear-gradient(90deg, #0F766E, #5EEAD4)',
                        'linear-gradient(90deg, #B45309, #FCD34D)',
                        'linear-gradient(90deg, #2563EB, #60A5FA)',
                      ];
                      const pillTints = [
                        { bg: '#EBF3FE', color: '#0C447C' },
                        { bg: '#EEEDFE', color: '#3C3489' },
                        { bg: '#E1F5EE', color: '#085041' },
                        { bg: '#FEF3E2', color: '#633806' },
                      ];
                      const pillStyle = pillTints[idx % pillTints.length];
                      return (
                      <button
                        key={report.report_id}
                        onClick={() => navigate(`/reports/${report.report_id}`)}
                        className="flex-shrink-0 w-[240px] bg-white rounded-[12px] border border-[#E5E3DF] p-4 text-left cursor-pointer relative group overflow-hidden transition-all duration-200"
                        style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.03)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.borderColor = '#C8C5BF'; e.currentTarget.style.background = '#FDFCFB'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.03)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = '#E5E3DF'; e.currentTarget.style.background = '#FFFFFF'; }}
                      >
                        <div className="absolute bottom-0 left-0 right-0 h-[3px]" style={{ background: stripeGradients[idx % stripeGradients.length] }} />
                        <ArrowRight className="absolute top-[13px] right-[13px] w-3.5 h-3.5 text-[#6B6965] opacity-0 -translate-x-1 translate-y-1 group-hover:opacity-100 group-hover:translate-x-0 group-hover:translate-y-0 transition-all duration-200" />
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="inline-block text-[9.5px] font-semibold uppercase tracking-[0.05em] px-[6px] py-[2px] rounded-full" style={{ background: '#F4F2EF', color: '#6B6965', border: '1px solid #E5E3DF' }}>Report</span>
                        </div>
                        <div className="text-[12.5px] font-medium text-[#1C1917] mb-2 line-clamp-2 pr-5">{report.report_name}</div>
                        <div className="inline-block text-[10.5px] font-semibold px-[7px] py-[2px] rounded-full mb-2" style={{ background: pillStyle.bg, color: pillStyle.color }}>{report.domain}</div>
                        <div className="text-[10.5px] text-[#8A8785]">Updated {formatRelativeTime(report.last_updated_ts)}</div>
                      </button>
                      );
                    })}
                  </div>
                </div>

                {/* Trending in Your Area */}
                <div>
                  <div className="mb-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8A8785]">Trending in Your Area</p>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-2" style={scrollbarHideStyle}>
                    {trendingReports.map((report: any, idx: number) => {
                      const hasAccess = idx >= trendingRestricted.length;
                      const isRequested = requestedReportIds.has(report.report_id);
                      const trendStripeGradients = [
                        'linear-gradient(90deg, #2563EB, #60A5FA)',
                        'linear-gradient(90deg, #7C3AED, #A78BFA)',
                        'linear-gradient(90deg, #0F766E, #5EEAD4)',
                        'linear-gradient(90deg, #B45309, #FCD34D)',
                        'linear-gradient(90deg, #2563EB, #60A5FA)',
                        'linear-gradient(90deg, #7C3AED, #A78BFA)',
                        'linear-gradient(90deg, #0F766E, #5EEAD4)',
                      ];
                      const trendPillTints = [
                        { bg: '#EBF3FE', color: '#0C447C' },
                        { bg: '#EEEDFE', color: '#3C3489' },
                        { bg: '#E1F5EE', color: '#085041' },
                        { bg: '#FEF3E2', color: '#633806' },
                      ];
                      const trendPill = trendPillTints[idx % trendPillTints.length];
                      return (
                        <div
                          key={report.report_id}
                          className="flex-shrink-0 w-[240px] bg-white rounded-[12px] border border-[#E5E3DF] p-4 text-left relative overflow-hidden group transition-all duration-200"
                          style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.03)', cursor: 'pointer' }}
                          onClick={() => {
                            if (hasAccess) {
                              navigate(`/reports/${report.report_id}`);
                            } else if (!isRequested) {
                              setRequestedReportIds(prev => new Set(prev).add(report.report_id));
                              setToastMessage(report.report_name);
                              if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
                              toastTimerRef.current = setTimeout(() => setToastMessage(null), 3000);
                            }
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.borderColor = '#C8C5BF'; e.currentTarget.style.background = '#FDFCFB'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.03)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = '#E5E3DF'; e.currentTarget.style.background = '#FFFFFF'; }}
                          role="button"
                          tabIndex={0}
                          aria-label={hasAccess ? `Open ${report.report_name}` : `Request access to ${report.report_name}`}
                        >
                          <div className="absolute bottom-0 left-0 right-0 h-[3px]" style={{ background: trendStripeGradients[idx % trendStripeGradients.length] }} />
                          {hasAccess ? (
                            <>
                              <ArrowRight className="absolute top-[13px] right-[13px] w-3.5 h-3.5 text-[#6B6965] opacity-0 -translate-x-1 translate-y-1 group-hover:opacity-100 group-hover:translate-x-0 group-hover:translate-y-0 transition-all duration-200" />
                              <div className="flex items-center gap-1.5 mb-2">
                                <span className="inline-block text-[9.5px] font-semibold uppercase tracking-[0.05em] px-[6px] py-[2px] rounded-full" style={{ background: '#F4F2EF', color: '#6B6965', border: '1px solid #E5E3DF' }}>Report</span>
                              </div>
                              <div className="text-[12.5px] font-medium text-[#1C1917] mb-2 line-clamp-2 pr-5">{report.report_name}</div>
                              <div className="inline-block text-[10.5px] font-semibold px-[7px] py-[2px] rounded-full mb-2" style={{ background: trendPill.bg, color: trendPill.color }}>{report.domain}</div>
                              <div className="text-[10.5px] text-[#8A8785]">Updated {formatRelativeTime(report.last_updated_ts)}</div>
                            </>
                          ) : (
                            <>
                              <div className="flex items-center gap-1.5 mb-2">
                                <span className="inline-block text-[9.5px] font-semibold uppercase tracking-[0.05em] px-[6px] py-[2px] rounded-full" style={{ background: '#F4F2EF', color: '#8A8785', border: '1px solid #E5E3DF' }}>Report</span>
                              </div>
                              <div className="text-[12.5px] font-medium mb-2 line-clamp-2 text-[#6B6965]">{report.report_name}</div>
                              <div className="inline-block text-[10.5px] font-medium text-[#8A8785] bg-[#F4F2EF] border border-[#E5E3DF] px-[7px] py-[2px] rounded-full mb-3">{report.domain}</div>
                              <div>
                                <div className="flex items-center gap-1 mb-3">
                                  <Shield className="w-3 h-3 text-[#8A8785]" aria-hidden="true" />
                                  <span className="text-[11px] text-[#8A8785]">Access restricted</span>
                                </div>
                                {isRequested ? (
                                  <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium w-full justify-center py-[7px] rounded-[7px]" style={{ background: '#EAF3DE', color: '#3B6D11', border: '1px solid #C0DD97', cursor: 'default', pointerEvents: 'none' }}>
                                    <Check className="w-3 h-3" aria-hidden="true" />
                                    Access Requested
                                  </span>
                                ) : (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setRequestedReportIds(prev => new Set(prev).add(report.report_id));
                                      setToastType('access-requested');
                                      setToastMessage(report.report_name);
                                      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
                                      toastTimerRef.current = setTimeout(() => setToastMessage(null), 3000);
                                    }}
                                    className="w-full flex items-center justify-center gap-1.5 text-[12px] font-medium py-[7px] rounded-[7px] cursor-pointer transition-all duration-150"
                                    style={{ background: '#1A1917', color: '#FFFFFF', border: 'none' }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = '#D4572A'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(212,87,42,0.25)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = '#1A1917'; e.currentTarget.style.boxShadow = 'none'; }}
                                  >
                                    Request Access
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            </div>
              ) : reportFlowCard !== null ? (
              /* ===== REPORT FLOW VIEW ===== */
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Breadcrumb */}
                <div className="px-8 pt-5 pb-0" style={{ paddingTop: 52 }}>
                  <div className="flex items-center gap-1.5 text-[12px] flex-wrap">
                    <button onClick={goHome} className="text-[#D4572A] font-medium hover:text-[#BF4D25] transition-colors duration-150">Talk</button>
                    <span className="text-[#8A8785]">›</span>
                    <span className="text-[#6B6965]">{reportFlowCard.report.domain}</span>
                    <span className="text-[#8A8785]">›</span>
                    <span className="text-[#1C1917] font-medium line-clamp-1">{reportFlowCard.report.report_name}</span>
                  </div>
                </div>

                {/* Scrollable content */}
                <div className="flex-1 overflow-y-auto px-8 pt-5 pb-6">
                  <div className="w-full max-w-[900px] mx-auto space-y-5">

                    {/* Zone 1 — Context header */}
                    <div
                      className="rounded-[12px] relative overflow-hidden"
                      style={{
                        background: cardGradients[reportFlowCard.idx % cardGradients.length],
                        padding: '14px 18px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                      }}
                    >
                      <button
                        onClick={goHome}
                        className="absolute top-3 right-4 transition-opacity duration-150 hover:opacity-80"
                        style={{ color: 'rgba(255,255,255,0.50)' }}
                        aria-label="Close"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <div className="text-[14px] font-semibold mb-1" style={{ color: '#FFFFFF' }}>
                        {reportFlowCard.report.report_name}
                      </div>
                      <div className="text-[12px]" style={{ color: 'rgba(255,255,255,0.70)' }}>
                        {currentReportData.subtitle}
                      </div>
                    </div>

                    {/* Zone 2 — AI response */}
                    <div className="bg-white border border-[#E5E3DF] rounded-[12px] p-5" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.03)' }}>
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-2 h-2 rounded-full bg-[#D4572A] flex-shrink-0" />
                        <span className="text-[12px] text-[#8A8785]">Report Hub AI</span>
                        <span className="text-[10px] text-[#AAADA8] ml-auto">Just now</span>
                      </div>

                      {!reportAnswerLoaded ? (
                        <div className="space-y-3">
                          <div className="shimmer-line h-4 w-full" />
                          <div className="shimmer-line h-4 w-[92%]" />
                          <div className="shimmer-line h-4 w-[85%]" />
                          <div className="shimmer-line h-4 w-full" />
                          <div className="shimmer-line h-4 w-[78%]" />
                          <div className="shimmer-line h-4 w-[60%]" />
                        </div>
                      ) : (
                        <div
                          className="text-[14px] text-[#2C2B29]"
                          style={{ lineHeight: 1.7 }}
                          dangerouslySetInnerHTML={{ __html: currentReportData.answer }}
                        />
                      )}

                      {reportAnswerLoaded && (
                        <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-[#E5E3DF]">
                          {currentReportData.chips.map((chip, chipIdx) => (
                            <button
                              key={chipIdx}
                              onClick={() => { setInputValue(chip); requestAnimationFrame(() => qsInputRef.current?.focus()); }}
                              className="inline-flex items-center justify-center h-[32px] px-[14px] bg-white hover:bg-[#F7F6F3] border border-[#E5E3DF] hover:border-[#C8C5BF] rounded-full text-[12px] leading-none whitespace-nowrap text-[#6B6965] hover:text-[#1C1917] transition-all duration-150"
                              style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
                            >
                              {chip}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>
                </div>

                {/* Zone 3 — Input (pinned to bottom) */}
                <div className="px-8 pb-5 pt-3">
                  <div className="w-full max-w-[900px] mx-auto">
                    <div className="bg-white border border-[#E5E3DF] rounded-[12px] p-3">
                      <div className="flex gap-3 items-end">
                        <textarea
                          value={inputValue}
                          onChange={(e) => setInputValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              if (inputValue.trim()) handleQsFlowSend(inputValue.trim());
                            }
                          }}
                          placeholder={currentReportData.placeholder}
                          className="flex-1 px-4 border border-[#E5E3DF] rounded-lg text-[14px] resize-none bg-[#F4F2EF] text-[#1C1917] placeholder:text-[#8A8785] input-warm-focus"
                          style={{ minHeight: '42px', maxHeight: '120px', height: '42px', paddingTop: '10px', paddingBottom: '10px' }}
                          rows={1}
                        />
                        <button
                          onClick={() => { if (inputValue.trim()) handleQsFlowSend(inputValue.trim()); }}
                          disabled={!inputValue.trim()}
                          aria-label="Send message"
                          className="px-6 bg-[#111110] text-white rounded-lg text-[13px] font-medium transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                          style={{ height: '42px' }}
                          onMouseEnter={(e) => { if (!e.currentTarget.disabled) { e.currentTarget.style.background = '#D4572A'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(212,87,42,0.25)'; } }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = '#111110'; e.currentTarget.style.boxShadow = 'none'; }}
                        >
                          <Send className="w-4 h-4" aria-hidden="true" />
                          Ask
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              ) : (
              /* ===== QUICK SUMMARY FLOW VIEW ===== */
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Breadcrumb */}
                <div className="px-8 pb-0" style={{ paddingTop: 52 }}>
                  <div className="flex items-center gap-1.5 text-[12px]">
                    <button onClick={goHome} className="text-[#D4572A] font-medium hover:text-[#BF4D25] transition-colors duration-150">Talk</button>
                    <span className="text-[#8A8785]">›</span>
                    <span className="text-[#1C1917] font-medium">{qsFlowData[qsFlowCard!]?.title ?? intentCards[qsFlowCard!]?.title}</span>
                  </div>
                </div>

                {/* Scrollable content */}
                <div className="flex-1 overflow-y-auto px-8 pt-5 pb-6">
                  <div className="w-full max-w-[900px] mx-auto space-y-5">

                    {/* Zone 1 — Context header */}
                    <div
                      className="rounded-[12px] relative overflow-hidden"
                      style={{
                        background: cardGradients[qsFlowCard! % cardGradients.length],
                        padding: '14px 18px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                      }}
                    >
                      <button
                        onClick={handleQsFlowExit}
                        className="absolute top-3 right-4 transition-opacity duration-150 hover:opacity-80"
                        style={{ color: 'rgba(255,255,255,0.50)' }}
                        aria-label="Close"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <div className="text-[14px] font-semibold mb-1" style={{ color: '#FFFFFF' }}>
                        {qsFlowData[qsFlowCard!]?.title ?? intentCards[qsFlowCard!]?.title}
                      </div>
                      <div className="text-[12px]" style={{ color: 'rgba(255,255,255,0.70)' }}>
                        {qsFlowData[qsFlowCard!]?.subtitle}
                      </div>
                    </div>

                    {/* Zone 2 — AI response */}
                    <div className="bg-white border border-[#E5E3DF] rounded-[12px] p-5" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.03)' }}>
                      {/* Header row */}
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-2 h-2 rounded-full bg-[#D4572A] flex-shrink-0" />
                        <span className="text-[12px] text-[#8A8785]">Report Hub AI</span>
                        <span className="text-[10px] text-[#AAADA8] ml-auto">Just now</span>
                      </div>

                      {/* Answer body or shimmer */}
                      {!qsAnswerLoaded ? (
                        <div className="space-y-3">
                          <div className="shimmer-line h-4 w-full" />
                          <div className="shimmer-line h-4 w-[92%]" />
                          <div className="shimmer-line h-4 w-[85%]" />
                          <div className="shimmer-line h-4 w-full" />
                          <div className="shimmer-line h-4 w-[78%]" />
                          <div className="shimmer-line h-4 w-[60%]" />
                        </div>
                      ) : qsFlowCard === 0 ? (
                        /* ── Campaign Performance — visual response ── */
                        <div className="space-y-5">
                          {/* Part A — Key metric pills */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                            {[
                              { value: '+12%', label: 'Overall engagement', bg: '#EFF6FF', color: '#2563EB' },
                              { value: '68%',  label: 'Digital engagement',  bg: '#F5F3FF', color: '#7C3AED' },
                              { value: '28.3%',label: 'Email open rate',     bg: '#F0FDFA', color: '#0D9488' },
                              { value: '3.2×', label: 'Spring Refresh ROI',  bg: '#FFFBEB', color: '#D97706' },
                            ].map((m, i) => (
                              <div key={i} className="rounded-[10px]" style={{ background: m.bg, padding: '12px 16px' }}>
                                <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 18, fontWeight: 700, color: m.color, lineHeight: 1 }}>{m.value}</div>
                                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: '#8A8785', marginTop: 5, fontWeight: 400, lineHeight: 1.3 }}>{m.label}</div>
                              </div>
                            ))}
                          </div>

                          {/* Part B — Horizontal bar chart */}
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8A8785] mb-3">Channel Performance</p>
                            <ResponsiveContainer width="100%" height={200}>
                              <BarChart
                                layout="vertical"
                                data={[
                                  { channel: 'Digital Channels', value: 68,   display: '68%',       color: '#2563EB' },
                                  { channel: 'Email',            value: 28.3,  display: '28.3%',     color: '#7C3AED' },
                                  { channel: 'Social Media',     value: 19,    display: '+19% CTR',  color: '#0D9488' },
                                  { channel: 'Spring Refresh',   value: 64,    display: '3.2× ROI',  color: '#D97706' },
                                ]}
                                margin={{ top: 0, right: 52, left: 4, bottom: 0 }}
                              >
                                <CartesianGrid horizontal={false} stroke="#F0EDE8" strokeDasharray="0" />
                                <XAxis
                                  type="number"
                                  domain={[0, 80]}
                                  tick={{ fontSize: 10, fill: '#8A8785', fontFamily: 'Inter, sans-serif' }}
                                  tickLine={false}
                                  axisLine={false}
                                  tickFormatter={(v: number) => `${v}%`}
                                />
                                <YAxis
                                  type="category"
                                  dataKey="channel"
                                  width={120}
                                  tick={{ fontSize: 11, fill: '#6B6965', fontFamily: 'Inter, sans-serif' }}
                                  tickLine={false}
                                  axisLine={false}
                                />
                                <Tooltip
                                  cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                                  content={({ active, payload }) => {
                                    if (!active || !payload?.length) return null;
                                    const d = payload[0].payload as { channel: string; display: string; color: string };
                                    return (
                                      <div style={{ background: '#1A1917', color: '#fff', borderRadius: 6, fontSize: 12, padding: '6px 10px', fontFamily: 'Inter, sans-serif', lineHeight: 1.4 }}>
                                        <div style={{ fontWeight: 600 }}>{d.display}</div>
                                        <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11 }}>{d.channel}</div>
                                      </div>
                                    );
                                  }}
                                />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={24} isAnimationActive animationDuration={800} animationEasing="ease-out">
                                  {[
                                    { color: '#2563EB' },
                                    { color: '#7C3AED' },
                                    { color: '#0D9488' },
                                    { color: '#D97706' },
                                  ].map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>

                          {/* Part C — 2-line summary */}
                          <p className="text-[13.5px] text-[#1C1917]" style={{ lineHeight: 1.65, fontFamily: "'Inter', sans-serif" }}>
                            Digital is your strongest channel this quarter, up 14pts vs Q4. Email outperforms industry average by 4.3pts.
                          </p>
                        </div>

                      ) : qsFlowCard === 1 ? (
                        /* ── Audience Growth Alert — area chart ── */
                        <div className="space-y-5">
                          {/* Part A — Key metric pills */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                            {[
                              { value: '+23%',  label: 'Digital Natives growth', bg: '#F5F3FF', color: '#7C3AED' },
                              { value: '142K',  label: 'Segment total users',    bg: '#EFF6FF', color: '#2563EB' },
                              { value: '4.7×',  label: 'Engagement vs avg',      bg: '#F0FDFA', color: '#0D9488' },
                              { value: '18%',   label: 'Revenue share',          bg: '#FFFBEB', color: '#D97706' },
                            ].map((m, i) => (
                              <div key={i} className="rounded-[10px]" style={{ background: m.bg, padding: '12px 16px' }}>
                                <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 18, fontWeight: 700, color: m.color, lineHeight: 1 }}>{m.value}</div>
                                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: '#8A8785', marginTop: 5, fontWeight: 400, lineHeight: 1.3 }}>{m.label}</div>
                              </div>
                            ))}
                          </div>

                          {/* Part B — Area chart: segment growth over 6 months */}
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8A8785] mb-3">Segment Growth — Last 6 Months</p>
                            <ResponsiveContainer width="100%" height={190}>
                              <AreaChart
                                data={[
                                  { month: 'Oct', digital: 72,  overall: 48 },
                                  { month: 'Nov', digital: 85,  overall: 51 },
                                  { month: 'Dec', digital: 96,  overall: 53 },
                                  { month: 'Jan', digital: 108, overall: 55 },
                                  { month: 'Feb', digital: 124, overall: 57 },
                                  { month: 'Mar', digital: 142, overall: 59 },
                                ]}
                                margin={{ top: 4, right: 16, left: -16, bottom: 0 }}
                              >
                                <defs>
                                  <linearGradient id="gradDigital" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%"  stopColor="#7C3AED" stopOpacity={0.18} />
                                    <stop offset="95%" stopColor="#7C3AED" stopOpacity={0} />
                                  </linearGradient>
                                  <linearGradient id="gradOverall" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%"  stopColor="#2563EB" stopOpacity={0.12} />
                                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid vertical={false} stroke="#F0EDE8" />
                                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#8A8785', fontFamily: 'Inter, sans-serif' }} tickLine={false} axisLine={false} />
                                <YAxis tick={{ fontSize: 10, fill: '#8A8785', fontFamily: 'Inter, sans-serif' }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}K`} />
                                <Tooltip
                                  content={({ active, payload, label }) => {
                                    if (!active || !payload?.length) return null;
                                    return (
                                      <div style={{ background: '#1A1917', color: '#fff', borderRadius: 6, fontSize: 12, padding: '8px 12px', fontFamily: 'Inter, sans-serif', lineHeight: 1.5 }}>
                                        <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
                                        {payload.map((p: any, i: number) => (
                                          <div key={i} style={{ color: i === 0 ? '#A78BFA' : '#93C5FD', fontSize: 11 }}>
                                            {i === 0 ? 'Digital Natives' : 'Overall avg'}: {p.value}K
                                          </div>
                                        ))}
                                      </div>
                                    );
                                  }}
                                />
                                <Area type="monotone" dataKey="digital" stroke="#7C3AED" strokeWidth={2} fill="url(#gradDigital)" dot={false} activeDot={{ r: 4, fill: '#7C3AED' }} />
                                <Area type="monotone" dataKey="overall" stroke="#2563EB" strokeWidth={1.5} strokeDasharray="4 3" fill="url(#gradOverall)" dot={false} activeDot={{ r: 4, fill: '#2563EB' }} />
                              </AreaChart>
                            </ResponsiveContainer>
                            <div className="flex items-center gap-4 mt-2">
                              <div className="flex items-center gap-1.5"><div className="w-3 h-[2px] rounded-full bg-[#7C3AED]" /><span className="text-[10.5px] text-[#8A8785]">Digital Natives</span></div>
                              <div className="flex items-center gap-1.5"><div className="w-3 h-[1.5px] rounded-full bg-[#2563EB] opacity-60" style={{ backgroundImage: 'repeating-linear-gradient(90deg,#2563EB 0,#2563EB 4px,transparent 4px,transparent 7px)' }} /><span className="text-[10.5px] text-[#8A8785]">Overall avg</span></div>
                            </div>
                          </div>

                          {/* Part C — summary */}
                          <p className="text-[13.5px] text-[#1C1917]" style={{ lineHeight: 1.65, fontFamily: "'Inter', sans-serif" }}>
                            Digital Natives is your fastest-growing segment, adding 27K users in 6 months. Revenue share jumped from 12% to 18% — the highest cohort contribution on record.
                          </p>
                        </div>

                      ) : qsFlowCard === 2 ? (
                        /* ── Channel Mix Optimization — grouped bar chart ── */
                        <div className="space-y-5">
                          {/* Part A — Key metric pills */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                            {[
                              { value: '3.8%',   label: 'Social conversion rate', bg: '#F5F3FF', color: '#7C3AED' },
                              { value: '2.4%',   label: 'Paid search conversion', bg: '#F0FDFA', color: '#0D9488' },
                              { value: '1.8%',   label: 'Email conversion rate',  bg: '#EFF6FF', color: '#2563EB' },
                              { value: '+9%',    label: 'Projected uplift',        bg: '#FFFBEB', color: '#D97706' },
                            ].map((m, i) => (
                              <div key={i} className="rounded-[10px]" style={{ background: m.bg, padding: '12px 16px' }}>
                                <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 18, fontWeight: 700, color: m.color, lineHeight: 1 }}>{m.value}</div>
                                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: '#8A8785', marginTop: 5, fontWeight: 400, lineHeight: 1.3 }}>{m.label}</div>
                              </div>
                            ))}
                          </div>

                          {/* Part B — Conversion rate by channel, this quarter vs last */}
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8A8785] mb-3">Conversion Rate by Channel — Q4 vs Q1</p>
                            <ResponsiveContainer width="100%" height={200}>
                              <BarChart
                                layout="vertical"
                                data={[
                                  { channel: 'Social Media',  q4: 3.2, q1: 3.8 },
                                  { channel: 'Paid Search',   q4: 2.7, q1: 2.4 },
                                  { channel: 'Email',         q4: 1.8, q1: 1.8 },
                                  { channel: 'Display',       q4: 1.1, q1: 0.9 },
                                ]}
                                margin={{ top: 0, right: 52, left: 4, bottom: 0 }}
                                barCategoryGap="28%"
                                barGap={3}
                              >
                                <CartesianGrid horizontal={false} stroke="#F0EDE8" />
                                <XAxis type="number" domain={[0, 5]} tick={{ fontSize: 10, fill: '#8A8785', fontFamily: 'Inter, sans-serif' }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}%`} />
                                <YAxis type="category" dataKey="channel" width={96} tick={{ fontSize: 11, fill: '#6B6965', fontFamily: 'Inter, sans-serif' }} tickLine={false} axisLine={false} />
                                <Tooltip
                                  cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                                  content={({ active, payload, label }) => {
                                    if (!active || !payload?.length) return null;
                                    return (
                                      <div style={{ background: '#1A1917', color: '#fff', borderRadius: 6, fontSize: 12, padding: '8px 12px', fontFamily: 'Inter, sans-serif', lineHeight: 1.5 }}>
                                        <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
                                        {payload.map((p: any, i: number) => (
                                          <div key={i} style={{ color: i === 0 ? '#93C5FD' : '#A78BFA', fontSize: 11 }}>
                                            {i === 0 ? 'Q4' : 'Q1'}: {p.value}%
                                          </div>
                                        ))}
                                      </div>
                                    );
                                  }}
                                />
                                <Bar dataKey="q4" barSize={10} radius={[0, 3, 3, 0]} fill="#E0E7FF" isAnimationActive animationDuration={800} animationEasing="ease-out" />
                                <Bar dataKey="q1" barSize={10} radius={[0, 3, 3, 0]} isAnimationActive animationDuration={800} animationEasing="ease-out">
                                  {[
                                    { color: '#7C3AED' },
                                    { color: '#0D9488' },
                                    { color: '#2563EB' },
                                    { color: '#D97706' },
                                  ].map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                            <div className="flex items-center gap-4 mt-2">
                              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-[#E0E7FF]" /><span className="text-[10.5px] text-[#8A8785]">Q4 (prior)</span></div>
                              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-[#7C3AED]" /><span className="text-[10.5px] text-[#8A8785]">Q1 (current)</span></div>
                            </div>
                          </div>

                          {/* Part C — summary */}
                          <p className="text-[13.5px] text-[#1C1917]" style={{ lineHeight: 1.65, fontFamily: "'Inter', sans-serif" }}>
                            Social is now 2.1× more efficient than email on conversion. Shifting 15% of email budget ($12K/month) toward social and paid search is projected to increase total conversions by 8–11%.
                          </p>
                        </div>

                      ) : qsFlowCard === 3 ? (
                        /* ── Budget Utilization — horizontal utilization bars ── */
                        <div className="space-y-5">
                          {/* Part A — Key metric pills */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                            {[
                              { value: '67%',   label: 'Budget deployed',       bg: '#EFF6FF', color: '#2563EB' },
                              { value: '$158K', label: 'Remaining this quarter', bg: '#F0FDFA', color: '#0D9488' },
                              { value: '4.1×',  label: 'Influencer ROAS',        bg: '#FFFBEB', color: '#D97706' },
                              { value: '−8%',   label: 'Paid media vs plan',     bg: '#FEF2F2', color: '#B91C1C' },
                            ].map((m, i) => (
                              <div key={i} className="rounded-[10px]" style={{ background: m.bg, padding: '12px 16px' }}>
                                <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 18, fontWeight: 700, color: m.color, lineHeight: 1 }}>{m.value}</div>
                                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: '#8A8785', marginTop: 5, fontWeight: 400, lineHeight: 1.3 }}>{m.label}</div>
                              </div>
                            ))}
                          </div>

                          {/* Part B — Budget utilization % by category */}
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8A8785] mb-3">Budget Utilization by Category</p>
                            <ResponsiveContainer width="100%" height={210}>
                              <BarChart
                                layout="vertical"
                                data={[
                                  { category: 'Influencer',         pct: 88, target: 100, color: '#D97706' },
                                  { category: 'Content Marketing',  pct: 71, target: 100, color: '#2563EB' },
                                  { category: 'Events',             pct: 70, target: 100, color: '#0D9488' },
                                  { category: 'Paid Media',         pct: 80, target: 88,  color: '#B91C1C' },
                                  { category: 'Other',              pct: 55, target: 100, color: '#7C3AED' },
                                ]}
                                margin={{ top: 0, right: 56, left: 4, bottom: 0 }}
                              >
                                <CartesianGrid horizontal={false} stroke="#F0EDE8" />
                                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: '#8A8785', fontFamily: 'Inter, sans-serif' }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}%`} />
                                <YAxis type="category" dataKey="category" width={120} tick={{ fontSize: 11, fill: '#6B6965', fontFamily: 'Inter, sans-serif' }} tickLine={false} axisLine={false} />
                                <Tooltip
                                  cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                                  content={({ active, payload }) => {
                                    if (!active || !payload?.length) return null;
                                    const d = payload[0].payload as { category: string; pct: number; target: number };
                                    return (
                                      <div style={{ background: '#1A1917', color: '#fff', borderRadius: 6, fontSize: 12, padding: '8px 12px', fontFamily: 'Inter, sans-serif', lineHeight: 1.5 }}>
                                        <div style={{ fontWeight: 600, marginBottom: 3 }}>{d.category}</div>
                                        <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11 }}>{d.pct}% of {d.target}% target deployed</div>
                                      </div>
                                    );
                                  }}
                                />
                                <Bar dataKey="pct" radius={[0, 4, 4, 0]} barSize={22} isAnimationActive animationDuration={800} animationEasing="ease-out">
                                  {[
                                    { color: '#D97706' },
                                    { color: '#2563EB' },
                                    { color: '#0D9488' },
                                    { color: '#EF4444' },
                                    { color: '#7C3AED' },
                                  ].map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>

                          {/* Part C — summary */}
                          <p className="text-[13.5px] text-[#1C1917]" style={{ lineHeight: 1.65, fontFamily: "'Inter', sans-serif" }}>
                            Influencer is your most efficient spend at 4.1× ROAS. Paid media is 8% behind plan — reallocating $20K of the remaining $38K toward high-performing social campaigns is projected to yield $82K in incremental revenue.
                          </p>
                        </div>

                      ) : (
                        <div
                          className="text-[14px] text-[#2C2B29]"
                          style={{ lineHeight: 1.7 }}
                          dangerouslySetInnerHTML={{ __html: qsFlowData[qsFlowCard!]?.answer ?? '' }}
                        />
                      )}

                      {/* Follow-up chips */}
                      {qsAnswerLoaded && (
                        <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-[#E5E3DF]">
                          {(qsFlowData[qsFlowCard!]?.chips ?? []).map((chip, chipIdx) => (
                            <button
                              key={chipIdx}
                              onClick={() => { setInputValue(chip); requestAnimationFrame(() => qsInputRef.current?.focus()); }}
                              className="inline-flex items-center justify-center h-[32px] px-[14px] bg-white hover:bg-[#F7F6F3] border border-[#E5E3DF] hover:border-[#C8C5BF] rounded-full text-[12px] leading-none whitespace-nowrap text-[#6B6965] hover:text-[#1C1917] transition-all duration-150"
                              style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
                            >
                              {chip}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* QS Actions — Add to Report + Go to Source */}
                      {qsAnswerLoaded && (() => {
                        const qsSourceReportIds = ['RPT-001', 'RPT-CHURN-001', 'RPT-002', 'RPT-003'];
                        const sourceReport = catalogReports.find(r => r.report_id === qsSourceReportIds[qsFlowCard! % qsSourceReportIds.length]);
                        const addTargetReports = catalogReports.slice(0, 5);
                        return (
                          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-[#F0EDE8]">
                            {/* Add to Report */}
                            <div className="relative">
                              <button
                                onClick={() => setQsAddToReportOpen(v => !v)}
                                className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-[6px] rounded-[8px] transition-all duration-150"
                                style={{ background: '#1A1917', color: '#FFFFFF', border: 'none' }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#D4572A'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(212,87,42,0.25)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = '#1A1917'; e.currentTarget.style.boxShadow = 'none'; }}
                              >
                                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true"><path d="M6.5 2v9M2 6.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                                Add to Report
                              </button>
                              {qsAddToReportOpen && (
                                <div className="absolute left-0 top-full mt-1.5 z-50 bg-white rounded-[10px] border border-[#E5E3DF] overflow-hidden" style={{ minWidth: 230, boxShadow: '0 8px 24px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)' }}>
                                  <div className="px-3 py-2 border-b border-[#F0EDE8]">
                                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[#8A8785]">Add chart to report</p>
                                  </div>
                                  {addTargetReports.map((r) => (
                                    <button
                                      key={r.report_id}
                                      className="w-full text-left px-3 py-2.5 text-[12.5px] text-[#1C1917] hover:bg-[#F7F6F3] transition-colors duration-100 flex items-center gap-2"
                                      onClick={() => {
                                        setQsAddToReportOpen(false);
                                        setToastType('chart-added');
                                        setToastMessage(r.report_name);
                                        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
                                        toastTimerRef.current = setTimeout(() => setToastMessage(null), 3000);
                                      }}
                                    >
                                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><rect x="1" y="1" width="10" height="10" rx="2" stroke="#8A8785" strokeWidth="1.2"/><path d="M4 6h4M6 4v4" stroke="#8A8785" strokeWidth="1.2" strokeLinecap="round"/></svg>
                                      <span className="line-clamp-1">{r.report_name}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Go to Source */}
                            {sourceReport && (
                              <button
                                onClick={() => { setQsAddToReportOpen(false); navigate(`/reports/${sourceReport.report_id}`); }}
                                className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-[6px] rounded-[8px] transition-all duration-150"
                                style={{ background: '#FFFFFF', color: '#1C1917', border: '1px solid #E5E3DF' }}
                                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#C8C5BF'; e.currentTarget.style.background = '#F7F6F3'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E5E3DF'; e.currentTarget.style.background = '#FFFFFF'; }}
                              >
                                <ExternalLink className="w-3 h-3" aria-hidden="true" />
                                Go to Source
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                  </div>
                </div>

                {/* Zone 3 — Input (pinned to bottom) */}
                <div className="px-8 pb-5 pt-3">
                  <div className="w-full max-w-[900px] mx-auto">
                    <div className="bg-white border border-[#E5E3DF] rounded-[12px] p-3">
                      <div className="flex gap-3 items-end">
                        <textarea
                          value={inputValue}
                          onChange={(e) => setInputValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              if (inputValue.trim()) handleQsFlowSend(inputValue.trim());
                            }
                          }}
                              placeholder={qsFlowData[qsFlowCard!]?.placeholder ?? 'Ask a follow-up\u2026'}
                          className="flex-1 px-4 border border-[#E5E3DF] rounded-lg text-[14px] resize-none bg-[#F4F2EF] text-[#1C1917] placeholder:text-[#8A8785] input-warm-focus"
                          style={{ minHeight: '42px', maxHeight: '120px', height: '42px', paddingTop: '10px', paddingBottom: '10px' }}
                          rows={1}
                        />
                        <button
                          onClick={() => { if (inputValue.trim()) handleQsFlowSend(inputValue.trim()); }}
                          disabled={!inputValue.trim()}
                          aria-label="Send message"
                          className="px-6 bg-[#111110] text-white rounded-lg text-[13px] font-medium transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                          style={{ height: '42px' }}
                          onMouseEnter={(e) => { if (!e.currentTarget.disabled) { e.currentTarget.style.background = '#D4572A'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(212,87,42,0.25)'; } }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = '#111110'; e.currentTarget.style.boxShadow = 'none'; }}
                        >
                          <Send className="w-4 h-4" aria-hidden="true" />
                          Ask
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              )}
            </div>
            );
          })()}

          {/* STATE 2: ACTIVE CONVERSATION */}
          {(flowState === 'active' || messages.length > 0) && (
            <div className="flex-1 flex flex-col relative overflow-hidden">

              {/* Floating Talk Home pill — matches QS/report flow layout */}
              <button
                onClick={handleNewConversation}
                aria-label="Back to Talk home"
                style={{
                  position: 'absolute',
                  top: 16,
                  left: 32,
                  zIndex: 20,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: '#FFFFFF',
                  border: '1px solid #E5E3DF',
                  borderRadius: 20,
                  padding: '6px 14px 6px 10px',
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: '#2C2B29',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                  cursor: 'pointer',
                  fontFamily: "'Inter', sans-serif",
                  transition: 'all 0.15s ease',
                  minHeight: 32,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#F4F2EF'; e.currentTarget.style.borderColor = '#D4D0CA'; e.currentTarget.style.transform = 'translateX(-2px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#FFFFFF'; e.currentTarget.style.borderColor = '#E5E3DF'; e.currentTarget.style.transform = ''; }}
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                  <path d="M8.5 2.5L4.5 6.5L8.5 10.5" stroke="#6B6865" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Talk home
              </button>

              <div className="flex-1 overflow-y-auto px-8" style={{ paddingTop: 64 }}>
                <div className="max-w-[900px] mx-auto space-y-6 pb-6">
                  {messages.map((message) => (
                    <div key={message.id}>
                      {renderMessage(message)}
                    </div>
                  ))}

                  {isGenerating && (
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#FEF0EC] flex items-center justify-center flex-shrink-0 flex-shrink-0">
                        <Sparkles className="w-4 h-4 text-[#D4572A] animate-pulse" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[13px] text-[#6B6965]" style={{ fontFamily: 'Inter, sans-serif' }}>
                          Thinking...
                        </p>
                      </div>
                    </div>
                  )}

                  <div ref={chatEndRef} />
                </div>
              </div>

              <div
                className="p-6"
                style={{
                  background: 'rgba(247, 246, 243, 0.88)',
                  backdropFilter: 'blur(16px) saturate(1.4)',
                  WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
                  borderTop: '1px solid rgba(229, 227, 223, 0.80)',
                }}
              >
                <div className="max-w-[900px] mx-auto flex gap-3 items-end">
                  <textarea
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask a follow-up, explore more data, or refine your request…"
                    className="flex-1 px-4 py-3 border border-[#E5E3DF] rounded-lg text-[13px] resize-none bg-[#F4F2EF] text-[#1C1917] placeholder:text-[#8A8785] input-warm-focus"
                    style={{ fontFamily: 'Inter, sans-serif', minHeight: '52px', maxHeight: '120px' }}
                    rows={1}
                  />
                  <button
                    onClick={handleAsk}
                    disabled={!inputValue.trim() || isGenerating}
                    className="px-5 py-3 bg-[#111110] text-white rounded-lg text-[13px] font-medium transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    style={{ fontFamily: 'Inter, sans-serif', height: '52px' }}
                    onMouseEnter={(e) => { if (!e.currentTarget.disabled) { e.currentTarget.style.background = '#D4572A'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(212,87,42,0.25)'; } }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#111110'; e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    <Send className="w-4 h-4" />
                    Ask
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* REPORT PREVIEW PANEL (RIGHT) */}
      {/* SHARED PANEL: Used for both My Reports → Explore Report AND Talk → Create Report (draft) */}
      {/* Draft mode indicated by selectedReport.isDraft flag */}
      {isReportPanelOpen && selectedReport && (
        <aside className="fixed top-[60px] right-0 bottom-0 w-[480px] bg-white border-l border-[#E5E7EB] z-30 flex flex-col shadow-xl">
          {/* Panel Header */}
          <div className="p-5 border-b border-[#E5E7EB]">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  {selectedReport.isDraft ? (
                    <input
                      type="text"
                      value={selectedReport.report_name}
                      onChange={(e) => setSelectedReport({ ...selectedReport, report_name: e.target.value })}
                      className="text-[16px] font-semibold text-[#111827] bg-transparent border-none focus:outline-none focus:ring-0 p-0 flex-1"
                      style={{ fontFamily: 'Inter, sans-serif' }}
                      placeholder="Report Name"
                    />
                  ) : (
                    <h2 className="text-[16px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {selectedReport.report_name}
                    </h2>
                  )}
                  {selectedReport.isDraft && (
                    <span className="inline-block text-[10px] font-medium px-2 py-1 rounded bg-amber-100 text-amber-800 flex-shrink-0">
                      DRAFT
                    </span>
                  )}
                </div>
                {!selectedReport.isDraft && (
                  <span className={`inline-block text-[10px] font-medium px-2 py-1 rounded ${selectedReport.source_application ? getSourceAppColor(selectedReport.source_application) : 'bg-gray-100 text-gray-700'}`}>
                    {selectedReport.source_application || 'Open Source Analytics'}
                  </span>
                )}
              </div>
              <button
                onClick={handleCloseReportPanel}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                title="Close preview"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
              <span>{selectedReport.domain}</span>
              <span>•</span>
              <span>{selectedReport.isDraft ? 'Created just now' : `Last viewed: ${formatRelativeTime(selectedReport.last_updated_ts)}`}</span>
            </div>
          </div>

          {/* Panel Content - Report Preview */}
          <div className="flex-1 overflow-y-auto p-5 bg-[#F8F9FB]">
            {/* Draft Configuration */}
            {selectedReport.isDraft && selectedReport.draftConfig && (
              <div className="bg-white border border-[#E5E7EB] rounded-lg p-4 mb-3">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[13px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Configuration
                  </h3>
                  <div className={`text-[10px] font-bold px-2 py-0.5 rounded ${selectedReport.source_application ? getSourceAppColor(selectedReport.source_application) : 'bg-gray-100 text-gray-700'}`}>
                    {selectedReport.source_application || 'Open Source Analytics'}
                  </div>
                </div>
                <div className="space-y-2 text-[12px]" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {selectedReport.primary_use_case && (
                    <div>
                      <span className="text-[#6B7280]">Intent:</span>{' '}
                      <span className="text-[#111827] font-medium">{selectedReport.primary_use_case}</span>
                    </div>
                  )}
                  {selectedReport.draftConfig.metrics && selectedReport.draftConfig.metrics.length > 0 && (
                    <div>
                      <span className="text-[#6B7280]">Metrics:</span>{' '}
                      <span className="text-[#111827] font-medium">{selectedReport.draftConfig.metrics.join(', ')}</span>
                    </div>
                  )}
                  {selectedReport.draftConfig.dimensions && selectedReport.draftConfig.dimensions.length > 0 && (
                    <div>
                      <span className="text-[#6B7280]">Dimensions:</span>{' '}
                      <span className="text-[#111827] font-medium">{selectedReport.draftConfig.dimensions.join(', ')}</span>
                    </div>
                  )}
                  {selectedReport.draftConfig.visualization && (
                    <div>
                      <span className="text-[#6B7280]">Visualization:</span>{' '}
                      <span className="text-[#111827] font-medium">{selectedReport.draftConfig.visualization}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Report Overview */}
            {selectedReport.primary_use_case && !selectedReport.isDraft && (
              <div className="bg-white border border-[#E5E7EB] rounded-lg p-4 mb-3">
                <h3 className="text-[13px] font-semibold text-[#111827] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Overview
                </h3>
                <p className="text-[12px] text-[#374151] mb-3" style={{ fontFamily: 'Inter, sans-serif', lineHeight: '1.5' }}>
                  {selectedReport.primary_use_case}
                </p>
                {selectedReport.business_owner && (
                  <div className="pt-2 border-t border-[#E5E7EB]">
                    <span className="text-[10px] text-[#6B7280] uppercase tracking-wide font-semibold" style={{ fontFamily: 'Inter, sans-serif' }}>
                      Owner
                    </span>
                    <p className="text-[12px] text-[#111827] mt-0.5" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {selectedReport.business_owner}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Key KPIs */}
            {selectedReport.key_kpis && selectedReport.key_kpis.length > 0 && (
              <div className="bg-white border border-[#E5E7EB] rounded-lg p-4 mb-3">
                <h3 className="text-[13px] font-semibold text-[#111827] mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Key KPIs
                </h3>
                <div className="space-y-3">
                  {selectedReport.key_kpis.slice(0, 3).map((kpi: any, idx: number) => (
                    <div key={idx} className="bg-[#F8F9FB] rounded-lg p-3 border border-[#E5E7EB]">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-medium text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                          {kpi.kpi_name}
                        </span>
                        {kpi.trend === 'up' && <TrendingUp className="w-3 h-3 text-green-600" />}
                        {kpi.trend === 'down' && <TrendingDown className="w-3 h-3 text-red-600" />}
                        {kpi.trend === 'flat' && <Minus className="w-3 h-3 text-gray-400" />}
                      </div>
                      <p className="text-[16px] font-bold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {kpi.current_value}
                      </p>
                      <p className={`text-[10px] ${kpi.trend === 'up' ? 'text-green-600' : kpi.trend === 'down' ? 'text-red-600' : 'text-gray-500'}`} style={{ fontFamily: 'Inter, sans-serif' }}>
                        {kpi.delta} from {kpi.previous_value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Source Dataset */}
            <div className="bg-white border border-[#E5E7EB] rounded-lg p-4 mb-3">
              <h3 className="text-[13px] font-semibold text-[#111827] mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                Source Dataset
              </h3>
              <div className="text-[12px]" style={{ fontFamily: 'Inter, sans-serif' }}>
                <p className="text-[#111827] font-medium mb-1">
                  {catalogDatasets.find(d => d.dataset_id === selectedReport.source_dataset_id)?.dataset_name || 'Unknown'}
                </p>
                <p className="text-[#6B7280] text-[11px]">
                  {selectedReport.domain} · {selectedReport.refresh_frequency || 'Unknown frequency'}
                </p>
              </div>
            </div>

            {/* Key Insights */}
            {selectedReport.top_insights && selectedReport.top_insights.length > 0 && (
              <div className="bg-white border border-[#E5E7EB] rounded-lg p-4 mb-3">
                <h3 className="text-[13px] font-semibold text-[#111827] mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {selectedReport.isDraft ? 'Expected Insights' : 'Key Insights'}
                </h3>
                <ul className="space-y-2">
                  {selectedReport.top_insights.slice(0, 3).map((insight: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2">
                      <div className="w-1 h-1 rounded-full bg-[#E11D48] mt-1.5 flex-shrink-0" />
                      <p className="text-[11px] text-[#374151]" style={{ fontFamily: 'Inter, sans-serif', lineHeight: '1.5' }}>
                        {insight}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Report Preview Chart */}
            <div className="bg-white border border-[#E5E7EB] rounded-lg p-4 mb-3">
              <h3 className="text-[13px] font-semibold text-[#111827] mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                {selectedReport.isDraft ? 'Visualization Preview' : 'Report Preview'}
              </h3>
              <div className="mb-3">
                <ReportVisualization
                  visualizationType={
                    selectedReport.isDraft 
                      ? (selectedReport.draftConfig?.visualization || 'Line trend')
                      : 'Line trend'
                  }
                  metrics={selectedReport.draftConfig?.metrics}
                  dimensions={selectedReport.draftConfig?.dimensions}
                  height={200}
                />
              </div>
              <p className="text-[10px] text-[#6B7280] italic" style={{ fontFamily: 'Inter, sans-serif' }}>
                {selectedReport.isDraft 
                  ? `Preview using sample data from ${catalogDatasets.find(d => d.dataset_id === selectedReport.source_dataset_id)?.dataset_name || 'selected dataset'}.`
                  : 'Static preview. Full report contains interactive visualizations.'}
              </p>
            </div>

            {/* Related Reports */}
            {selectedReport.related_reports && selectedReport.related_reports.length > 0 && (
              <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
                <h3 className="text-[13px] font-semibold text-[#111827] mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Related Reports
                </h3>
                <div className="space-y-2">
                  {selectedReport.related_reports.slice(0, 2).map((relatedReport: any, idx: number) => (
                    <button
                      key={idx}
                      onClick={() => navigate(`/reports/${relatedReport.report_id}`)}
                      className="w-full text-left px-3 py-2 bg-[#F8F9FB] hover:bg-blue-50 border border-[#E5E7EB] hover:border-blue-200 rounded transition-colors group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-[#111827] font-medium group-hover:text-[#60A5FA]" style={{ fontFamily: 'Inter, sans-serif' }}>
                          {relatedReport.report_name}
                        </span>
                        <ArrowRight className="w-3 h-3 text-[#6B7280] group-hover:text-[#60A5FA]" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Panel Footer - Actions */}
          <div className="p-5 border-t border-[#E5E7EB] bg-white space-y-2">
            {selectedReport.isDraft ? (
              <>
                <button
                  onClick={handleFinalizeReportCreation}
                  className="w-full px-4 py-3 bg-[#111827] hover:bg-[#0F172A] text-white rounded-lg text-[13px] font-medium transition-colors"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                >
                  Save as report
                </button>
                <button
                  onClick={() => {
                    setIsReportPanelOpen(false);
                    setCreateReportState({ ...createReportState, step: 'visualization' });
                    addAssistantMessage(
                      'What would you like to change?',
                      'create_report_step',
                      {
                        step: 'edit',
                        actions: ['Change visualization', 'Select different metrics', 'Adjust dimensions', 'Choose another dataset']
                      }
                    );
                  }}
                  className="w-full px-4 py-3 bg-white hover:bg-gray-50 border border-[#E5E7EB] text-[#111827] rounded-lg text-[13px] font-medium transition-colors"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                >
                  Edit configuration
                </button>
                <button
                  onClick={() => {
                    setIsReportPanelOpen(false);
                    setSelectedReport(null);
                    addAssistantMessage(
                      'You can continue exploring or ask me questions about this draft.',
                      'text'
                    );
                  }}
                  className="w-full px-4 py-3 bg-white hover:bg-gray-50 border border-[#E5E7EB] text-[#111827] rounded-lg text-[13px] font-medium transition-colors"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                >
                  Continue in Talk
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => navigate(`/reports/${selectedReport.report_id}`)}
                  className="w-full px-4 py-3 bg-[#111827] hover:bg-[#0F172A] text-white rounded-lg text-[13px] font-medium transition-colors"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                >
                  Open Full Report
                </button>
                {(() => {
                  const platformButton = getEnterprisePlatformButton(selectedReport.source_application);
                  return platformButton ? (
                    <button
                      onClick={() => window.open(platformButton.url, '_blank')}
                      className="w-full px-4 py-3 bg-white hover:bg-gray-50 border border-[#E5E7EB] text-[#111827] rounded-lg text-[13px] font-medium transition-colors flex items-center justify-center gap-2"
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                      {platformButton.label}
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  ) : null;
                })()}
                <button
                  onClick={handleCloseReportPanel}
                  className="w-full px-4 py-3 bg-white hover:bg-gray-50 border border-[#E5E7EB] text-[#111827] rounded-lg text-[13px] font-medium transition-colors"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                >
                  Continue in Talk
                </button>
              </>
            )}
          </div>
        </aside>
      )}

      {/* DATASET DETAILS PANEL (RIGHT) */}
      {isDatasetPanelOpen && selectedDataset && (
        <aside className="fixed top-[60px] right-0 bottom-0 w-[480px] bg-white border-l border-[#E5E7EB] z-30 flex flex-col shadow-xl">
          {/* Panel Header */}
          <div className="p-5 border-b border-[#E5E7EB]">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <h2 className="text-[16px] font-semibold text-[#111827] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {selectedDataset.dataset_name}
                </h2>
                <div className="flex items-center gap-2">
                  {selectedDataset.source_system && (
                    <span className={`inline-block text-[10px] font-medium px-2 py-1 rounded ${getDatasetSourceColor(selectedDataset.source_system)}`}>
                      {selectedDataset.source_system}
                    </span>
                  )}
                  {selectedDataset.certified_flag && (
                    <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 text-[10px] font-medium px-2 py-1 rounded">
                      <div className="w-3 h-3">
                        <MedallionIcon />
                      </div>
                      Certified
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={handleCloseDatasetPanel}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                title="Close preview"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
              <span>{selectedDataset.domain}</span>
              <span>•</span>
              <span>Refreshed: {formatRelativeTime(selectedDataset.last_refresh_ts)}</span>
            </div>
          </div>

          {/* Panel Content - Dataset Overview */}
          <div className="flex-1 overflow-y-auto p-5 bg-[#F8F9FB]">
            {/* A. Dataset Summary */}
            <div className="bg-white border border-[#E5E7EB] rounded-lg p-4 mb-4">
              <h3 className="text-[13px] font-semibold text-[#111827] mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                Dataset Summary
              </h3>
              <div className="space-y-2 text-[11px]" style={{ fontFamily: 'Inter, sans-serif' }}>
                <div className="flex justify-between">
                  <span className="text-[#6B7280]">Domain:</span>
                  <span className="text-[#111827] font-medium">{selectedDataset.domain}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B7280]">Source System:</span>
                  <span className="text-[#111827] font-medium">{selectedDataset.source_system || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B7280]">Certification:</span>
                  <span className="text-[#111827] font-medium">
                    {selectedDataset.certified_flag ? '✓ Certified' : 'Pending'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B7280]">Owner:</span>
                  <span className="text-[#111827] font-medium text-[10px]">{getDatasetOwner(selectedDataset.dataset_id)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B7280]">Last Refreshed:</span>
                  <span className="text-[#111827] font-medium">{formatRelativeTime(selectedDataset.last_refresh_ts)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B7280]">Refresh Frequency:</span>
                  <span className="text-[#111827] font-medium">{selectedDataset.refresh_frequency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B7280]">Data Freshness:</span>
                  <span className="text-[11px] font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded">
                    Up to date
                  </span>
                </div>
              </div>
            </div>

            {/* B. Dataset Scale */}
            <div className="bg-white border border-[#E5E7EB] rounded-lg p-4 mb-4">
              <h3 className="text-[13px] font-semibold text-[#111827] mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                Dataset Scale
              </h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-[#F8F9FB] rounded-lg p-3">
                  <p className="text-[10px] text-[#6B7280] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>TOTAL ROWS</p>
                  <p className="text-[16px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {selectedDataset.row_count?.toLocaleString() || '1M+'}
                  </p>
                </div>
                <div className="bg-[#F8F9FB] rounded-lg p-3">
                  <p className="text-[10px] text-[#6B7280] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>TOTAL FIELDS</p>
                  <p className="text-[16px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {selectedDataset.field_count || '20+'}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-[#E5E7EB]">
                <span className="text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>Growth Trend:</span>
                <span className="text-[11px] font-medium text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {getDatasetGrowthTrend(selectedDataset.dataset_id)}
                </span>
              </div>
            </div>

            {/* C. Schema Snapshot */}
            <div className="bg-white border border-[#E5E7EB] rounded-lg p-4 mb-4">
              <h3 className="text-[13px] font-semibold text-[#111827] mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                Schema Snapshot
              </h3>
              <div className="space-y-2.5">
                {getDatasetSchemaFields(selectedDataset.dataset_id).slice(0, 6).map((field, idx) => (
                  <div key={idx} className="pb-2 border-b border-[#F3F4F6] last:border-0">
                    <div className="flex items-start justify-between mb-0.5">
                      <span className="text-[11px] font-medium text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {field.field_name}
                      </span>
                      <span className="text-[9px] font-medium text-[#6B7280] bg-[#F3F4F6] px-1.5 py-0.5 rounded" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {field.data_type}
                      </span>
                    </div>
                    <p className="text-[10px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {field.description}
                    </p>
                  </div>
                ))}
              </div>
              {getDatasetSchemaFields(selectedDataset.dataset_id).length > 6 && (
                <button 
                  onClick={() => navigate(`/datasets/${selectedDataset.dataset_id}`)}
                  className="mt-3 text-[11px] text-[#E11D48] hover:text-[#BE123C] font-medium"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                >
                  View full schema →
                </button>
              )}
            </div>

            {/* D. Report Usage */}
            <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
              <h3 className="text-[13px] font-semibold text-[#111827] mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                Report Usage
              </h3>
              {(() => {
                const connectedReports = getReportsByDatasetId(selectedDataset.dataset_id);
                return connectedReports.length > 0 ? (
                  <>
                    <p className="text-[11px] text-[#6B7280] mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {connectedReports.length} report{connectedReports.length !== 1 ? 's' : ''} connected to this dataset:
                    </p>
                    <div className="space-y-1.5 mb-3">
                      {connectedReports.slice(0, 4).map((report, idx) => (
                        <div key={idx} className="flex items-center justify-between py-1.5 px-2 bg-[#F8F9FB] rounded">
                          <span className="text-[10px] text-[#111827] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {report.report_name}
                          </span>
                          <span className="text-[9px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {report.domain}
                          </span>
                        </div>
                      ))}
                    </div>
                    {connectedReports.length > 4 && (
                      <button 
                        onClick={() => navigate(`/datasets/${selectedDataset.dataset_id}`)}
                        className="text-[11px] text-[#E11D48] hover:text-[#BE123C] font-medium"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        View all {connectedReports.length} connected reports →
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-[11px] text-[#6B7280] italic" style={{ fontFamily: 'Inter, sans-serif' }}>
                    No reports currently use this dataset
                  </p>
                );
              })()}
            </div>
          </div>

          {/* Panel Footer - Actions */}
          <div className="p-5 border-t border-[#E5E7EB] bg-white">
            <button
              onClick={() => navigate(`/datasets/${selectedDataset.dataset_id}`)}
              className="w-full px-4 py-3 bg-[#111827] hover:bg-[#0F172A] text-white rounded-lg text-[13px] font-medium transition-colors mb-2"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              View Full Dataset
            </button>
            {(() => {
              const platformButton = getEnterprisePlatformButton(selectedDataset.source_system);
              return platformButton ? (
                <button
                  onClick={() => window.open(platformButton.url, '_blank')}
                  className="w-full px-4 py-3 bg-white hover:bg-gray-50 border border-[#E5E7EB] text-[#111827] rounded-lg text-[13px] font-medium transition-colors mb-2 flex items-center justify-center gap-2"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                >
                  {platformButton.label}
                  <ExternalLink className="w-4 h-4" />
                </button>
              ) : null;
            })()}
            <button
              onClick={handleCloseDatasetPanel}
              className="w-full px-4 py-3 bg-white hover:bg-gray-50 border border-[#E5E7EB] text-[#111827] rounded-lg text-[13px] font-medium transition-colors"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Continue in Talk
            </button>
          </div>
        </aside>
      )}

      {/* Toast notification */}
      <div
        style={{
          position: 'fixed',
          bottom: 28,
          left: '50%',
          transform: toastMessage ? 'translateX(-50%) translateY(-4px)' : 'translateX(-50%) translateY(0)',
          background: '#1C1B19',
          color: '#FFFFFF',
          fontSize: 13,
          fontWeight: 400,
          padding: '10px 18px',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          opacity: toastMessage ? 1 : 0,
          pointerEvents: 'none',
          transition: 'opacity 0.2s ease, transform 0.2s ease',
          zIndex: 999,
          whiteSpace: 'nowrap' as const,
        }}
      >
        <Check className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
        {toastType === 'access-requested'
          ? <span>Access requested for <strong>{toastMessage}</strong></span>
          : <span>Chart added to <strong>{toastMessage}</strong></span>
        }
      </div>

    </Layout>
  );
}
