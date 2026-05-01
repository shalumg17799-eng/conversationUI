// BigQuery-Enabled Data Model for Report Hub
// This replaces the synthetic data with dynamic BigQuery queries

import { BigQueryDataService } from './bigqueryDataService';

// Import existing interfaces from dataModel.ts to maintain compatibility
export interface CatalogReport {
  report_id: string;
  report_name: string;
  domain: string;
  source_dataset_id: string;
  last_updated_ts: Date;
  enterprise_flag: boolean;
  source_application?: 'Tableau' | 'Qlik' | 'Looker';
  
  // Extended fields
  business_owner?: string;
  description?: string;
  primary_use_case?: string;
  created_date?: Date;
  refresh_frequency?: string;
  key_kpis?: Array<{
    kpi_name: string;
    current_value: string;
    previous_value: string;
    trend: 'up' | 'down' | 'flat';
    delta: string;
  }>;
  primary_dimensions?: string[];
  time_range_supported?: string;
  top_insights?: string[];
  known_limitations?: string[];
  recommended_actions?: string[];
  related_reports?: Array<{
    report_id: string;
    report_name: string;
  }>;
  used_by_roles?: string[];
}

export interface CatalogDataset {
  dataset_id: string;
  dataset_name: string;
  domain: string;
  last_refresh_ts: Date;
  refresh_frequency: string;
  certified_flag: boolean;
  source_system?: 'BigQuery' | 'Teradata' | 'Hadoop';
  row_count?: number;
  field_count?: number;
  
  // Extended fields
  key_fields?: Array<{
    field_name: string;
    field_type: string;
    description: string;
  }>;
  dataset_health?: {
    freshness_status: 'Current' | 'Stale' | 'At Risk';
    quality_score: number;
    known_issues?: string[];
  };
  primary_use_cases?: string[];
  connected_reports?: Array<{
    report_id: string;
    report_name: string;
  }>;
  data_owner?: string;
  
  // Migration-specific fields
  migration_readiness?: {
    readiness_score: number;
    risk_level: 'Low' | 'Medium' | 'High';
    estimated_effort: 'Small' | 'Medium' | 'Large';
    key_blockers?: string[];
    migration_window_recommendation?: string;
  };
  pii_flag?: boolean;
  downstream_systems?: string[];
  schema_tables_count?: number;
  null_rate?: number;
  duplication_rate?: number;
  migration_target_recommendation?: 'BigQuery' | 'Teradata' | 'Hadoop' | 'Looker' | 'Tableau' | 'Qlik';
  migration_recommendation_reason?: string;
  storage_type?: 'Data Warehouse' | 'Data Lake' | 'Lakehouse';
}

// Telecom-specific interfaces
export interface TelecomMetrics {
  total_subscribers: number;
  avg_tenure: number;
  autopay_count: number;
  autopay_percentage: number;
}

export interface DailyUsage {
  date: string;
  total_data_gb: number;
  total_hotspot_gb: number;
  active_subscribers: number;
  avg_data_per_subscriber: number;
}

export interface PlanPerformance {
  plan_id: string;
  name: string;
  tier: string;
  price: number;
  subscriber_count: number;
  avg_tenure_days: number;
  autopay_count: number;
  autopay_percentage: number;
}

export interface NetworkEvent {
  event_date: string;
  severity: string;
  event_type: string;
  event_count: number;
  affected_subscribers: number;
}

// ===== BIGQUERY DATA FUNCTIONS =====

// Get telecom metrics for dashboard
export async function getTelecomMetrics(): Promise<TelecomMetrics> {
  const metrics = await BigQueryDataService.getSubscriberMetrics();
  return metrics[0] || {
    total_subscribers: 0,
    avg_tenure: 0,
    autopay_count: 0,
    autopay_percentage: 0
  };
}

// Get daily usage data
export async function getDailyUsageData(days: number = 30): Promise<DailyUsage[]> {
  return await BigQueryDataService.getDailyDataUsage(days);
}

// Get plan performance data
export async function getPlanPerformanceData(): Promise<PlanPerformance[]> {
  return await BigQueryDataService.getPlanPerformance();
}

// Get network events data
export async function getNetworkEventsData(days: number = 7): Promise<NetworkEvent[]> {
  return await BigQueryDataService.getNetworkEvents(days);
}

// ===== CATALOG FUNCTIONS (Updated for Telecom) =====

// Telecom-focused catalog reports
export const catalogReports: CatalogReport[] = [
  {
    report_id: 'RPT-TEL-001',
    report_name: 'Subscriber Metrics Dashboard',
    domain: 'Customer Analytics',
    source_dataset_id: 'DS-TEL-001',
    last_updated_ts: new Date(),
    enterprise_flag: false,
    source_application: 'Tableau',
    
    business_owner: 'Telecom Analytics Team',
    description: 'Real-time subscriber metrics and performance indicators',
    primary_use_case: 'Monitor subscriber growth, retention, and engagement',
    created_date: new Date(),
    refresh_frequency: 'Real-time',
    key_kpis: [
      { kpi_name: 'Total Subscribers', current_value: '0', previous_value: '0', trend: 'flat', delta: '0' },
      { kpi_name: 'Avg Tenure', current_value: '0', previous_value: '0', trend: 'flat', delta: '0' },
      { kpi_name: 'Autopay Rate', current_value: '0%', previous_value: '0%', trend: 'flat', delta: '0%' },
    ],
    primary_dimensions: ['Plan Type', 'Segment', 'Region'],
    time_range_supported: 'Last 90 Days',
    top_insights: [
      'Subscriber metrics updated in real-time from BigQuery',
      'Autopay adoption correlates with higher retention',
      'Plan performance varies by customer segment',
    ],
    known_limitations: [
      'Data depends on BigQuery query performance',
      'Real-time metrics may have slight delays',
    ],
    recommended_actions: [
      'Monitor subscriber trends daily',
      'Focus on plans with lower autopay adoption',
    ],
    related_reports: [
      { report_id: 'RPT-TEL-002', report_name: 'Usage Analytics' },
      { report_id: 'RPT-TEL-003', report_name: 'Network Performance' },
    ],
    used_by_roles: ['Product Manager', 'Marketing Analyst', 'Operations Manager'],
  },
  {
    report_id: 'RPT-TEL-002',
    report_name: 'Data Usage Analytics',
    domain: 'Network Analytics',
    source_dataset_id: 'DS-TEL-002',
    last_updated_ts: new Date(),
    enterprise_flag: false,
    source_application: 'Looker',
    
    business_owner: 'Network Analytics Team',
    description: 'Daily data usage patterns and trends analysis',
    primary_use_case: 'Analyze data consumption patterns and optimize network resources',
    created_date: new Date(),
    refresh_frequency: 'Daily',
    key_kpis: [
      { kpi_name: 'Daily Data Usage', current_value: '0 GB', previous_value: '0 GB', trend: 'flat', delta: '0 GB' },
      { kpi_name: 'Hotspot Usage', current_value: '0 GB', previous_value: '0 GB', trend: 'flat', delta: '0 GB' },
      { kpi_name: 'Active Users', current_value: '0', previous_value: '0', trend: 'flat', delta: '0' },
    ],
    primary_dimensions: ['Date', 'Plan Type', 'Region'],
    time_range_supported: 'Last 30 Days',
    top_insights: [
      'Data usage peaks during evening hours',
      'Hotspot usage correlates with premium plans',
      'Weekend usage patterns differ from weekdays',
    ],
    known_limitations: [
      'Usage data is aggregated daily',
      'Does not include real-time usage spikes',
    ],
    recommended_actions: [
      'Monitor network capacity during peak hours',
      'Optimize hotspot allocation for premium plans',
    ],
    related_reports: [
      { report_id: 'RPT-TEL-001', report_name: 'Subscriber Metrics Dashboard' },
      { report_id: 'RPT-TEL-004', report_name: 'Plan Performance' },
    ],
    used_by_roles: ['Network Engineer', 'Product Manager', 'Capacity Planner'],
  },
  {
    report_id: 'RPT-TEL-003',
    report_name: 'Network Performance Monitor',
    domain: 'Network Operations',
    source_dataset_id: 'DS-TEL-003',
    last_updated_ts: new Date(),
    enterprise_flag: true,
    source_application: 'Qlik',
    
    business_owner: 'Network Operations Center',
    description: 'Real-time network events and performance monitoring',
    primary_use_case: 'Monitor network health and identify performance issues',
    created_date: new Date(),
    refresh_frequency: 'Real-time',
    key_kpis: [
      { kpi_name: 'Network Events', current_value: '0', previous_value: '0', trend: 'flat', delta: '0' },
      { kpi_name: 'Critical Events', current_value: '0', previous_value: '0', trend: 'flat', delta: '0' },
      { kpi_name: 'Affected Users', current_value: '0', previous_value: '0', trend: 'flat', delta: '0' },
    ],
    primary_dimensions: ['Event Type', 'Severity', 'Region'],
    time_range_supported: 'Last 7 Days',
    top_insights: [
      'Network events tracked in real-time',
      'Critical events require immediate attention',
      'Event patterns help identify network issues',
    ],
    known_limitations: [
      'Event data depends on network monitoring systems',
      'May not capture all network issues',
    ],
    recommended_actions: [
      'Investigate critical events immediately',
      'Analyze event patterns for proactive maintenance',
    ],
    related_reports: [
      { report_id: 'RPT-TEL-002', report_name: 'Usage Analytics' },
      { report_id: 'RPT-TEL-005', report_name: 'Geographic Analysis' },
    ],
    used_by_roles: ['Network Engineer', 'Operations Manager', 'Support Team'],
  },
  {
    report_id: 'RPT-TEL-004',
    report_name: 'Plan Performance Analysis',
    domain: 'Product Analytics',
    source_dataset_id: 'DS-TEL-004',
    last_updated_ts: new Date(),
    enterprise_flag: false,
    source_application: 'Tableau',
    
    business_owner: 'Product Analytics Team',
    description: 'Plan performance metrics and subscriber distribution',
    primary_use_case: 'Analyze plan performance and optimize product offerings',
    created_date: new Date(),
    refresh_frequency: 'Weekly',
    key_kpis: [
      { kpi_name: 'Plan Distribution', current_value: '0', previous_value: '0', trend: 'flat', delta: '0' },
      { kpi_name: 'Avg Revenue per User', current_value: '$0', previous_value: '$0', trend: 'flat', delta: '$0' },
      { kpi_name: 'Plan Retention', current_value: '0%', previous_value: '0%', trend: 'flat', delta: '0%' },
    ],
    primary_dimensions: ['Plan Type', 'Tier', 'Price Point'],
    time_range_supported: 'Last 90 Days',
    top_insights: [
      'Premium plans show higher retention rates',
      'Price sensitivity varies by segment',
      'Autopay adoption higher in premium plans',
    ],
    known_limitations: [
      'Plan performance based on subscription data',
      'Does not include customer satisfaction metrics',
    ],
    recommended_actions: [
      'Focus on premium plan retention strategies',
      'Optimize pricing for different segments',
    ],
    related_reports: [
      { report_id: 'RPT-TEL-001', report_name: 'Subscriber Metrics Dashboard' },
      { report_id: 'RPT-TEL-002', report_name: 'Usage Analytics' },
    ],
    used_by_roles: ['Product Manager', 'Marketing Analyst', 'Finance Analyst'],
  },
  {
    report_id: 'RPT-TEL-005',
    report_name: 'Geographic Network Analysis',
    domain: 'Network Planning',
    source_dataset_id: 'DS-TEL-005',
    last_updated_ts: new Date(),
    enterprise_flag: true,
    source_application: 'Looker',
    
    business_owner: 'Network Planning Team',
    description: 'Geographic analysis of network performance and coverage',
    primary_use_case: 'Plan network expansion and optimize coverage',
    created_date: new Date(),
    refresh_frequency: 'Monthly',
    key_kpis: [
      { kpi_name: 'Coverage Areas', current_value: '0', previous_value: '0', trend: 'flat', delta: '0' },
      { kpi_name: 'Network Density', current_value: '0', previous_value: '0', trend: 'flat', delta: '0' },
      { kpi_name: 'Performance Score', current_value: '0', previous_value: '0', trend: 'flat', delta: '0' },
    ],
    primary_dimensions: ['Region', 'Network Type', 'Performance Tier'],
    time_range_supported: 'Last 12 Months',
    top_insights: [
      'Urban areas show higher network density',
      'Performance varies by geographic region',
      'Coverage gaps identified in rural areas',
    ],
    known_limitations: [
      'Geographic data based on network coverage maps',
      'May not reflect real-world performance',
    ],
    recommended_actions: [
      'Prioritize network expansion in underserved areas',
      'Optimize network density in high-demand areas',
    ],
    related_reports: [
      { report_id: 'RPT-TEL-003', report_name: 'Network Performance Monitor' },
      { report_id: 'RPT-TEL-004', report_name: 'Plan Performance Analysis' },
    ],
    used_by_roles: ['Network Planner', 'Operations Manager', 'Executive Team'],
  }
];

// Telecom-focused catalog datasets
export const catalogDatasets: CatalogDataset[] = [
  {
    dataset_id: 'DS-TEL-001',
    dataset_name: 'Telecom Subscriber Metrics',
    domain: 'Customer Analytics',
    last_refresh_ts: new Date(),
    refresh_frequency: 'Real-time',
    certified_flag: true,
    source_system: 'BigQuery',
    row_count: 1000000,
    field_count: 25,
    
    key_fields: [
      { field_name: 'subscriber_id', field_type: 'String', description: 'Unique subscriber identifier' },
      { field_name: 'plan_id', field_type: 'String', description: 'Associated plan identifier' },
      { field_name: 'segment', field_type: 'String', description: 'Customer segment classification' },
      { field_name: 'autopay_enabled', field_type: 'Boolean', description: 'Autopay enrollment status' },
      { field_name: 'tenure_days', field_type: 'Integer', description: 'Customer tenure in days' },
    ],
    dataset_health: {
      freshness_status: 'Current',
      quality_score: 95,
      known_issues: [],
    },
    primary_use_cases: ['Subscriber analytics', 'Retention analysis', 'Segment analysis'],
    connected_reports: [
      { report_id: 'RPT-TEL-001', report_name: 'Subscriber Metrics Dashboard' },
      { report_id: 'RPT-TEL-004', report_name: 'Plan Performance Analysis' },
    ],
    data_owner: 'Telecom Analytics Team',
    
    migration_readiness: {
      readiness_score: 95,
      risk_level: 'Low',
      estimated_effort: 'Small',
      key_blockers: [],
      migration_window_recommendation: 'Off-peak hours (2 AM - 4 AM EST)',
    },
    pii_flag: true,
    downstream_systems: ['CRM', 'Billing System'],
    schema_tables_count: 2,
    null_rate: 0.01,
    duplication_rate: 0.0001,
    migration_target_recommendation: 'BigQuery',
    migration_recommendation_reason: 'Optimized for real-time analytics with excellent PII handling',
    storage_type: 'Data Warehouse',
  },
  {
    dataset_id: 'DS-TEL-002',
    dataset_name: 'Daily Usage Analytics',
    domain: 'Network Analytics',
    last_refresh_ts: new Date(),
    refresh_frequency: 'Daily',
    certified_flag: true,
    source_system: 'BigQuery',
    row_count: 50000000,
    field_count: 15,
    
    key_fields: [
      { field_name: 'date', field_type: 'Date', description: 'Usage date' },
      { field_name: 'subscriber_id', field_type: 'String', description: 'Subscriber identifier' },
      { field_name: 'data_gb_used', field_type: 'Float', description: 'Data usage in GB' },
      { field_name: 'hotspot_gb_used', field_type: 'Float', description: 'Hotspot usage in GB' },
      { field_name: 'throttle_flag', field_type: 'Boolean', description: 'Data throttling status' },
    ],
    dataset_health: {
      freshness_status: 'Current',
      quality_score: 92,
      known_issues: [],
    },
    primary_use_cases: ['Usage analytics', 'Capacity planning', 'Network optimization'],
    connected_reports: [
      { report_id: 'RPT-TEL-002', report_name: 'Data Usage Analytics' },
    ],
    data_owner: 'Network Analytics Team',
    
    migration_readiness: {
      readiness_score: 88,
      risk_level: 'Low',
      estimated_effort: 'Medium',
      key_blockers: ['Large data volume requires careful migration planning'],
      migration_window_recommendation: 'Weekend maintenance window',
    },
    pii_flag: true,
    downstream_systems: ['Network Monitoring', 'Capacity Planning'],
    schema_tables_count: 1,
    null_rate: 0.02,
    duplication_rate: 0.0005,
    migration_target_recommendation: 'BigQuery',
    migration_recommendation_reason: 'Excellent for large-scale time-series data with partitioning support',
    storage_type: 'Data Lake',
  },
  {
    dataset_id: 'DS-TEL-003',
    dataset_name: 'Network Events Log',
    domain: 'Network Operations',
    last_refresh_ts: new Date(),
    refresh_frequency: 'Real-time',
    certified_flag: true,
    source_system: 'BigQuery',
    row_count: 10000000,
    field_count: 12,
    
    key_fields: [
      { field_name: 'event_timestamp', field_type: 'Timestamp', description: 'Event timestamp' },
      { field_name: 'subscriber_id', field_type: 'String', description: 'Affected subscriber' },
      { field_name: 'severity', field_type: 'String', description: 'Event severity level' },
      { field_name: 'event_type', field_type: 'String', description: 'Event type classification' },
    ],
    dataset_health: {
      freshness_status: 'Current',
      quality_score: 90,
      known_issues: [],
    },
    primary_use_cases: ['Network monitoring', 'Performance analysis', 'Incident tracking'],
    connected_reports: [
      { report_id: 'RPT-TEL-003', report_name: 'Network Performance Monitor' },
    ],
    data_owner: 'Network Operations Center',
    
    migration_readiness: {
      readiness_score: 85,
      risk_level: 'Medium',
      estimated_effort: 'Medium',
      key_blockers: ['Real-time data ingestion requirements'],
      migration_window_recommendation: 'Staggered migration with minimal downtime',
    },
    pii_flag: true,
    downstream_systems: ['Monitoring Systems', 'Alerting Platform'],
    schema_tables_count: 1,
    null_rate: 0.05,
    duplication_rate: 0.001,
    migration_target_recommendation: 'BigQuery',
    migration_recommendation_reason: 'Real-time streaming capabilities with excellent performance',
    storage_type: 'Data Lake',
  },
  {
    dataset_id: 'DS-TEL-004',
    dataset_name: 'Plan Performance Metrics',
    domain: 'Product Analytics',
    last_refresh_ts: new Date(),
    refresh_frequency: 'Weekly',
    certified_flag: true,
    source_system: 'BigQuery',
    row_count: 1000000,
    field_count: 20,
    
    key_fields: [
      { field_name: 'plan_id', field_type: 'String', description: 'Plan identifier' },
      { field_name: 'plan_name', field_type: 'String', description: 'Plan display name' },
      { field_name: 'tier', field_type: 'String', description: 'Plan tier classification' },
      { field_name: 'price', field_type: 'Float', description: 'Monthly price' },
      { field_name: 'subscriber_count', field_type: 'Integer', description: 'Number of subscribers' },
    ],
    dataset_health: {
      freshness_status: 'Current',
      quality_score: 93,
      known_issues: [],
    },
    primary_use_cases: ['Plan performance analysis', 'Revenue analytics', 'Product optimization'],
    connected_reports: [
      { report_id: 'RPT-TEL-004', report_name: 'Plan Performance Analysis' },
    ],
    data_owner: 'Product Analytics Team',
    
    migration_readiness: {
      readiness_score: 90,
      risk_level: 'Low',
      estimated_effort: 'Small',
      key_blockers: [],
      migration_window_recommendation: 'Off-peak hours (1 AM - 3 AM EST)',
    },
    pii_flag: false,
    downstream_systems: ['Product Catalog', 'Revenue System'],
    schema_tables_count: 2,
    null_rate: 0.01,
    duplication_rate: 0.0002,
    migration_target_recommendation: 'BigQuery',
    migration_recommendation_reason: 'Optimized for analytical queries with excellent performance',
    storage_type: 'Data Warehouse',
  },
  {
    dataset_id: 'DS-TEL-005',
    dataset_name: 'Geographic Network Data',
    domain: 'Network Planning',
    last_refresh_ts: new Date(),
    refresh_frequency: 'Monthly',
    certified_flag: false,
    source_system: 'BigQuery',
    row_count: 500000,
    field_count: 18,
    
    key_fields: [
      { field_name: 'region_id', field_type: 'String', description: 'Geographic region identifier' },
      { field_name: 'coverage_area', field_type: 'Float', description: 'Coverage area in square miles' },
      { field_name: 'network_density', field_type: 'Float', description: 'Network density score' },
      { field_name: 'performance_score', field_type: 'Float', description: 'Network performance score' },
    ],
    dataset_health: {
      freshness_status: 'Stale',
      quality_score: 75,
      known_issues: ['Some regions need updated coverage data'],
    },
    primary_use_cases: ['Network planning', 'Coverage analysis', 'Expansion planning'],
    connected_reports: [
      { report_id: 'RPT-TEL-005', report_name: 'Geographic Network Analysis' },
    ],
    data_owner: 'Network Planning Team',
    
    migration_readiness: {
      readiness_score: 70,
      risk_level: 'Medium',
      estimated_effort: 'Large',
      key_blockers: ['Data quality issues', 'Complex geographic transformations'],
      migration_window_recommendation: 'Extended maintenance window required',
    },
    pii_flag: false,
    downstream_systems: ['Network Planning Tools', 'GIS Systems'],
    schema_tables_count: 3,
    null_rate: 0.08,
    duplication_rate: 0.002,
    migration_target_recommendation: 'BigQuery',
    migration_recommendation_reason: 'Excellent for geographic data with spatial analysis capabilities',
    storage_type: 'Data Lake',
  }
];

// Export functions for compatibility
export async function getAllReports(): Promise<CatalogReport[]> {
  return catalogReports;
}

export async function getAllDatasets(): Promise<CatalogDataset[]> {
  return catalogDatasets;
}

export async function getReportById(reportId: string): Promise<CatalogReport | null> {
  return catalogReports.find(report => report.report_id === reportId) || null;
}

export async function getDatasetById(datasetId: string): Promise<CatalogDataset | null> {
  return catalogDatasets.find(dataset => dataset.dataset_id === datasetId) || null;
}

// Search functions
export async function searchSimilarReports(intent: string): Promise<CatalogReport[]> {
  const lowercaseIntent = intent.toLowerCase();
  return catalogReports.filter(report => {
    const nameMatch = report.report_name.toLowerCase().includes(lowercaseIntent);
    const domainMatch = report.domain.toLowerCase().includes(lowercaseIntent);
    const useCaseMatch = report.primary_use_case?.toLowerCase().includes(lowercaseIntent);
    
    const intentKeywords = lowercaseIntent.split(' ').filter(k => k.length > 3);
    const keywordMatch = intentKeywords.some(keyword => 
      report.report_name.toLowerCase().includes(keyword) || 
      report.domain.toLowerCase().includes(keyword)
    );

    return nameMatch || domainMatch || useCaseMatch || keywordMatch;
  }).slice(0, 3);
}

export async function saveReportConfiguration(report: CatalogReport): Promise<CatalogReport> {
  const newReport = {
    ...report,
    last_updated_ts: new Date(),
    created_date: new Date(),
  };
  
  catalogReports.unshift(newReport);
  return newReport;
}
