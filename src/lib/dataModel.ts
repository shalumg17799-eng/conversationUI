// Report Hub Backend Data Model (Dummy Data)
// This simulates a connected backend with realistic enterprise BI data

// ===== CATALOG TABLES =====

export interface CatalogReport {
  report_id: string;
  report_name: string;
  domain: string;
  source_dataset_id: string;
  last_updated_ts: Date;
  enterprise_flag: boolean;
  source_application?: 'Tableau' | 'Qlik' | 'Looker';
  
  // Extended fields for richer report details
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

export async function searchSimilarReports(intent: string): Promise<CatalogReport[]> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 800));
  
  const lowercaseIntent = intent.toLowerCase();
  return catalogReports.filter(report => {
    const nameMatch = report.report_name.toLowerCase().includes(lowercaseIntent);
    const domainMatch = report.domain.toLowerCase().includes(lowercaseIntent);
    const useCaseMatch = report.primary_use_case?.toLowerCase().includes(lowercaseIntent);
    
    // Check if intent contains keywords from report name
    const intentKeywords = lowercaseIntent.split(' ').filter(k => k.length > 3);
    const keywordMatch = intentKeywords.some(keyword => 
      report.report_name.toLowerCase().includes(keyword) || 
      report.domain.toLowerCase().includes(keyword)
    );

    return nameMatch || domainMatch || useCaseMatch || keywordMatch;
  }).slice(0, 3);
}

export async function saveReportConfiguration(report: CatalogReport): Promise<CatalogReport> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1200));
  
  // In a real app, this would be a Supabase call
  const newReport = {
    ...report,
    last_updated_ts: new Date(),
    created_date: new Date(),
  };
  
  catalogReports.unshift(newReport);
  return newReport;
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
  
  // Extended fields for richer dataset details
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
    readiness_score: number; // 0-100
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

// Migration Session (for Talk migration workflow)
export interface MigrationSession {
  session_id: string;
  title: string;
  selected_dataset_id?: string;
  messages: Array<{
    id: string;
    type: 'system' | 'user' | 'assistant';
    content: string;
    renderType?: string;
    data?: any;
    timestamp: Date;
  }>;
  status: 'draft' | 'planned' | 'validated' | 'running' | 'complete';
  last_updated: Date;
  migration_plan?: {
    target_platform: string;
    schema_mapping: any;
    connection_requirements: string[];
    estimated_downtime: string;
    rollback_plan: string;
  };
  validation_results?: {
    passed: boolean;
    warnings: string[];
    errors: string[];
  };
}

// Metric Definitions (Reference Data)
export interface MetricDefinition {
  metric_id: string;
  metric_name: string;
  definition: string;
}

// ===== DIMENSION TABLES =====

export interface DimDate {
  date_id: number;
  date: Date;
  month_id: number;
  month_name: string;
  year: number;
}

export interface DimGeoMarket {
  market_id: string;
  market_name: string;
}

export interface DimGeoTerritory {
  territory_id: string;
  market_id: string;
  territory_name: string;
}

export interface DimOutlet {
  outlet_id: string;
  territory_id: string;
  outlet_name: string;
  city: string;
  state: string;
}

// ===== FACT TABLES =====

export interface FactSugSalesDaily {
  date_id: number;
  outlet_id: string;
  device_id: string;
  sug_sales_units: number;
  eligible_device_units: number;
  sug_sales_revenue: number;
  accessory_revenue: number;
  return_units: number;
  passing_surveys: number;
  total_surveys: number;
}

export interface FactSugMonthlyRollup {
  month_id: number;
  territory_id: string;
  sug_revenue: number;
  run_rate: number;
  take_rate_pct: number;
  aard_pct: number;
  return_rate_pct: number;
  ris_pct: number;
}

export interface FactIntradayIntervalSales {
  date_id: number;
  hour: number;
  outlet_id: string;
  device_group: string;
  sales_units: number;
  sales_revenue: number;
}

export interface FactNetworkKpiPoints {
  date_id: number;
  site_id: string;
  lat: number;
  lon: number;
  cqi: number;
  rsrp: number;
  sinr: number;
  score: number;
  status: 'good' | 'warning' | 'critical';
}

export interface FactContactCenterMetrics {
  employee_id: string;
  employee_name: string;
  box_close_pct: number;
  inb_aht_sec: number;
  transfer_pct: number;
  sales_time_pct: number;
  hold_pct: number;
  status: 'good' | 'warning' | 'critical';
}

export interface FactDynamicScore {
  employee_id: string;
  employee_name: string;
  metric_1: number;
  metric_2: number;
  metric_3: number;
  metric_4: number;
  metric_5: number;
  overall_score: number;
  rank: number;
}

export interface RefOutlierThreshold {
  metric_name: string;
  min_threshold: number;
  max_threshold: number;
}

export interface DimDevice {
  device_id: string;
  device_name: string;
  device_group: string;
  manufacturer: string;
}

// ===== MOCK DATA GENERATION =====

// Helper to generate dates
const generateDate = (daysAgo: number): Date => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date;
};

const getCurrentMonthId = (): number => {
  const now = new Date();
  return now.getFullYear() * 100 + (now.getMonth() + 1);
};

const getMonthName = (monthId: number): string => {
  const month = monthId % 100;
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return monthNames[month - 1];
};

// Catalog Reports
export const catalogReports: CatalogReport[] = [
  {
    report_id: 'RPT-CHURN-001',
    report_name: 'Customer Churn – Monthly Variation Analysis',
    domain: 'Customer Experience',
    source_dataset_id: 'DS-002',
    last_updated_ts: generateDate(0),
    enterprise_flag: false,
    source_application: 'Tableau',
    
    // Extended fields
    business_owner: 'Jennifer Martinez (Customer Analytics)',
    description: 'Monthly churn rate variations across key customer segments',
    primary_use_case: 'Monitor customer retention and identify churn risk factors',
    created_date: generateDate(0),
    refresh_frequency: 'Weekly',
    key_kpis: [
      { kpi_name: 'Churn Rate', current_value: '12.3%', previous_value: '14.1%', trend: 'down', delta: '-1.8%' },
      { kpi_name: 'Retention Rate', current_value: '87.7%', previous_value: '85.9%', trend: 'up', delta: '1.8%' },
      { kpi_name: 'At-Risk Customers', current_value: '324', previous_value: '401', trend: 'down', delta: '-77' },
    ],
    primary_dimensions: ['Customer Segment', 'Region', 'Tenure'],
    time_range_supported: 'Last 12 Months',
    top_insights: [
      'Churn rate has decreased by 1.8% over the past quarter',
      'High-tenure customers show 65% lower churn risk',
      'Regional variations suggest opportunity for targeted retention campaigns',
    ],
    known_limitations: [
      'Churn predictions based on historical patterns only',
      'Does not account for external market factors',
    ],
    recommended_actions: [
      'Implement early warning system for at-risk customers',
      'Enhance onboarding experience to improve early-stage retention',
    ],
    related_reports: [
      { report_id: 'RPT-002', report_name: 'Customer Experience Metrics' },
      { report_id: 'RPT-005', report_name: 'Outlet Performance Scorecard' },
    ],
    used_by_roles: ['Customer Success Manager', 'Marketing Manager', 'Customer Experience Manager'],
  },
  {
    report_id: 'RPT-001',
    report_name: 'SU&G Performance Dashboard',
    domain: 'Sales',
    source_dataset_id: 'DS-001',
    last_updated_ts: generateDate(0.5),
    enterprise_flag: false,
    source_application: 'Tableau',
    
    // Extended fields
    business_owner: 'Sarah Johnson (Sales Analytics)',
    primary_use_case: 'Monitor SU&G sales performance across territories',
    created_date: generateDate(10),
    refresh_frequency: 'Daily',
    key_kpis: [
      { kpi_name: 'Take Rate', current_value: '58%', previous_value: '55%', trend: 'up', delta: '3%' },
      { kpi_name: 'RIS', current_value: '88%', previous_value: '86%', trend: 'up', delta: '2%' },
      { kpi_name: 'Run Rate', current_value: '$10.2M', previous_value: '$9.6M', trend: 'up', delta: '$0.6M' },
    ],
    primary_dimensions: ['Territory', 'Device Group'],
    time_range_supported: 'Last 6 Months',
    top_insights: [
      'Northeast Metro has the highest take rate at 62%',
      'RIS is consistently above 85% across all territories',
      'Run rate is projected to exceed $10M for the year',
    ],
    known_limitations: [
      'Data is based on sales transactions and may not reflect all sales channels',
      'RIS scores are self-reported and may not be fully accurate',
    ],
    recommended_actions: [
      'Focus on territories with lower take rates for targeted marketing campaigns',
      'Invest in improving customer satisfaction to boost RIS scores',
    ],
    related_reports: [
      { report_id: 'RPT-003', report_name: 'Territory Take Rate Analysis' },
      { report_id: 'RPT-004', report_name: 'Returns & AARD Deep Dive' },
    ],
    used_by_roles: ['Sales Manager', 'Operations Manager'],
  },
  {
    report_id: 'RPT-002',
    report_name: 'Customer Experience Metrics',
    domain: 'Customer Experience',
    source_dataset_id: 'DS-002',
    last_updated_ts: generateDate(2),
    enterprise_flag: false,
    source_application: 'Looker',
    
    // Extended fields
    business_owner: 'Michael Chen (CX Insights)',
    primary_use_case: 'Analyze customer feedback and RIS scores',
    created_date: generateDate(15),
    refresh_frequency: 'Daily',
    key_kpis: [
      { kpi_name: 'RIS', current_value: '85%', previous_value: '83%', trend: 'up', delta: '2%' },
      { kpi_name: 'NPS Score', current_value: '72', previous_value: '70', trend: 'up', delta: '2' },
      { kpi_name: 'Customer Satisfaction', current_value: '8.5', previous_value: '8.3', trend: 'up', delta: '0.2' },
    ],
    primary_dimensions: ['Outlet', 'Customer Segment'],
    time_range_supported: 'Last 30 Days',
    top_insights: [
      'RIS scores have improved by 2% in the last month',
      'NPS score is above the industry average at 72',
      'Customer satisfaction ratings are consistently high',
    ],
    known_limitations: [
      'RIS scores are self-reported and may not be fully accurate',
      'NPS score is based on a small sample size',
    ],
    recommended_actions: [
      'Continue to focus on improving customer satisfaction to boost RIS scores',
      'Expand NPS surveys to a larger sample size for more accurate results',
    ],
    related_reports: [
      { report_id: 'RPT-001', report_name: 'SU&G Performance Dashboard' },
      { report_id: 'RPT-005', report_name: 'Outlet Performance Scorecard' },
    ],
    used_by_roles: ['Customer Experience Manager', 'Sales Manager'],
  },
  {
    report_id: 'RPT-003',
    report_name: 'Territory Take Rate Analysis',
    domain: 'Sales',
    source_dataset_id: 'DS-001',
    last_updated_ts: generateDate(1),
    enterprise_flag: false,
    source_application: 'Qlik',
    
    // Extended fields
    business_owner: 'Sarah Johnson (Sales Analytics)',
    primary_use_case: 'Analyze take rate performance by territory',
    created_date: generateDate(12),
    refresh_frequency: 'Daily',
    key_kpis: [
      { kpi_name: 'Take Rate', current_value: '58%', previous_value: '55%', trend: 'up', delta: '3%' },
      { kpi_name: 'RIS', current_value: '88%', previous_value: '86%', trend: 'up', delta: '2%' },
      { kpi_name: 'Run Rate', current_value: '$10.2M', previous_value: '9.6M', trend: 'up', delta: '$0.6M' },
    ],
    primary_dimensions: ['Territory', 'Device Group'],
    time_range_supported: 'Last 6 Months',
    top_insights: [
      'Northeast Metro has the highest take rate at 62%',
      'RIS is consistently above 85% across all territories',
      'Run rate is projected to exceed $10M for the year',
    ],
    known_limitations: [
      'Data is based on sales transactions and may not reflect all sales channels',
      'RIS scores are self-reported and may not be fully accurate',
    ],
    recommended_actions: [
      'Focus on territories with lower take rates for targeted marketing campaigns',
      'Invest in improving customer satisfaction to boost RIS scores',
    ],
    related_reports: [
      { report_id: 'RPT-001', report_name: 'SU&G Performance Dashboard' },
      { report_id: 'RPT-004', report_name: 'Returns & AARD Deep Dive' },
    ],
    used_by_roles: ['Sales Manager', 'Operations Manager'],
  },
  {
    report_id: 'RPT-004',
    report_name: 'Returns & AARD Deep Dive',
    domain: 'Operations',
    source_dataset_id: 'DS-003',
    last_updated_ts: generateDate(3),
    enterprise_flag: true,
    source_application: 'Qlik',
    
    // Extended fields
    business_owner: 'Jessica Martinez (Operations)',
    primary_use_case: 'Analyze returns and AARD rates',
    created_date: generateDate(20),
    refresh_frequency: 'Daily',
    key_kpis: [
      { kpi_name: 'AARD', current_value: '26%', previous_value: '25%', trend: 'up', delta: '1%' },
      { kpi_name: 'Return Rate', current_value: '4%', previous_value: '4.5%', trend: 'down', delta: '-0.5%' },
      { kpi_name: 'Returns', current_value: '5000', previous_value: '5500', trend: 'down', delta: '-500' },
    ],
    primary_dimensions: ['Territory', 'Device Group'],
    time_range_supported: 'Last 6 Months',
    top_insights: [
      'AARD rates have increased by 1% in the last month',
      'Return rates have decreased by 0.5% in the last month',
      'Total returns have decreased by 500 units in the last month',
    ],
    known_limitations: [
      'Data is based on return transactions and may not reflect all return channels',
      'AARD rates are calculated based on a 30-day window',
    ],
    recommended_actions: [
      'Investigate the reasons for increased AARD rates and take corrective actions',
      'Continue to monitor return rates to ensure they remain low',
    ],
    related_reports: [
      { report_id: 'RPT-001', report_name: 'SU&G Performance Dashboard' },
      { report_id: 'RPT-003', report_name: 'Territory Take Rate Analysis' },
    ],
    used_by_roles: ['Operations Manager', 'Sales Manager'],
  },
  {
    report_id: 'RPT-005',
    report_name: 'Outlet Performance Scorecard',
    domain: 'Sales',
    source_dataset_id: 'DS-001',
    last_updated_ts: generateDate(1.5),
    enterprise_flag: false,
    source_application: 'Tableau',
    
    // Extended fields
    business_owner: 'Sarah Johnson (Sales Analytics)',
    primary_use_case: 'Evaluate outlet performance',
    created_date: generateDate(18),
    refresh_frequency: 'Daily',
    key_kpis: [
      { kpi_name: 'Take Rate', current_value: '58%', previous_value: '55%', trend: 'up', delta: '3%' },
      { kpi_name: 'RIS', current_value: '88%', previous_value: '86%', trend: 'up', delta: '2%' },
      { kpi_name: 'Run Rate', current_value: '$10.2M', previous_value: '9.6M', trend: 'up', delta: '$0.6M' },
    ],
    primary_dimensions: ['Territory', 'Device Group'],
    time_range_supported: 'Last 6 Months',
    top_insights: [
      'Northeast Metro has the highest take rate at 62%',
      'RIS is consistently above 85% across all territories',
      'Run rate is projected to exceed $10M for the year',
    ],
    known_limitations: [
      'Data is based on sales transactions and may not reflect all sales channels',
      'RIS scores are self-reported and may not be fully accurate',
    ],
    recommended_actions: [
      'Focus on territories with lower take rates for targeted marketing campaigns',
      'Invest in improving customer satisfaction to boost RIS scores',
    ],
    related_reports: [
      { report_id: 'RPT-001', report_name: 'SU&G Performance Dashboard' },
      { report_id: 'RPT-004', report_name: 'Returns & AARD Deep Dive' },
    ],
    used_by_roles: ['Sales Manager', 'Operations Manager'],
  },
  {
    report_id: 'RPT-006',
    report_name: 'Market Segmentation Analysis',
    domain: 'Strategy',
    source_dataset_id: 'DS-004',
    last_updated_ts: generateDate(5),
    enterprise_flag: true,
    source_application: 'Looker',
    
    // Extended fields
    business_owner: 'Robert Lee (Strategy & Planning)',
    primary_use_case: 'Analyze market segmentation and performance',
    created_date: generateDate(25),
    refresh_frequency: 'Weekly',
    key_kpis: [
      { kpi_name: 'Segment Share Index', current_value: '78', previous_value: '75', trend: 'up', delta: '3' },
      { kpi_name: 'Market Penetration', current_value: '60%', previous_value: '58%', trend: 'up', delta: '2%' },
      { kpi_name: 'Revenue', current_value: '$15M', previous_value: '14M', trend: 'up', delta: '$1M' },
    ],
    primary_dimensions: ['Market Segment', 'Territory'],
    time_range_supported: 'Last 6 Months',
    top_insights: [
      'Segment Share Index has increased by 3 in the last month',
      'Market penetration has increased by 2% in the last month',
      'Revenue has increased by $1M in the last month',
    ],
    known_limitations: [
      'Data is based on sales transactions and may not reflect all sales channels',
      'Market penetration is calculated based on a 30-day window',
    ],
    recommended_actions: [
      'Investigate the reasons for increased segment share index and take corrective actions',
      'Continue to monitor market penetration to ensure it remains high',
    ],
    related_reports: [
      { report_id: 'RPT-001', report_name: 'SU&G Performance Dashboard' },
      { report_id: 'RPT-003', report_name: 'Territory Take Rate Analysis' },
    ],
    used_by_roles: ['Strategy Manager', 'Sales Manager'],
  },
  {
    report_id: 'RPT-007',
    report_name: 'Revenue Forecasting Model',
    domain: 'Finance',
    source_dataset_id: 'DS-005',
    last_updated_ts: generateDate(4),
    enterprise_flag: true,
    source_application: 'Qlik',
    
    // Extended fields
    business_owner: 'David Thompson (Finance)',
    primary_use_case: 'Forecast revenue based on current sales trends',
    created_date: generateDate(22),
    refresh_frequency: 'Daily',
    key_kpis: [
      { kpi_name: 'Forecasted Revenue', current_value: '$120M', previous_value: '115M', trend: 'up', delta: '$5M' },
      { kpi_name: 'Actual Revenue', current_value: '$110M', previous_value: '105M', trend: 'up', delta: '$5M' },
      { kpi_name: 'Variance', current_value: '$10M', previous_value: '10M', trend: 'flat', delta: '0' },
    ],
    primary_dimensions: ['Fiscal Period', 'Account'],
    time_range_supported: 'Last 6 Months',
    top_insights: [
      'Forecasted revenue has increased by $5M in the last month',
      'Actual revenue has increased by $5M in the last month',
      'Variance between forecasted and actual revenue remains stable',
    ],
    known_limitations: [
      'Data is based on sales transactions and may not reflect all sales channels',
      'Forecasting model is based on historical data and may not account for future changes',
    ],
    recommended_actions: [
      'Investigate the reasons for increased forecasted revenue and take corrective actions',
      'Continue to monitor actual revenue to ensure it remains high',
    ],
    related_reports: [
      { report_id: 'RPT-001', report_name: 'SU&G Performance Dashboard' },
      { report_id: 'RPT-004', report_name: 'Returns & AARD Deep Dive' },
    ],
    used_by_roles: ['Finance Manager', 'Sales Manager'],
  },
];

// Catalog Datasets
export const catalogDatasets: CatalogDataset[] = [
  {
    dataset_id: 'DS-001',
    dataset_name: 'SU&G Sales Transactions',
    domain: 'Sales',
    last_refresh_ts: generateDate(0.25),
    refresh_frequency: 'Hourly',
    certified_flag: true,
    source_system: 'BigQuery',
    row_count: 1500000,
    field_count: 25,
    
    // Extended fields
    key_fields: [
      { field_name: 'date_id', field_type: 'Integer', description: 'Unique identifier for each date' },
      { field_name: 'outlet_id', field_type: 'String', description: 'Unique identifier for retail outlet' },
      { field_name: 'territory_id', field_type: 'String', description: 'Geographic territory identifier' },
      { field_name: 'sug_sales_revenue', field_type: 'Decimal', description: 'Total sales revenue from SU&G products' },
      { field_name: 'sug_sales_units', field_type: 'Integer', description: 'Number of units sold' },
      { field_name: 'take_rate_pct', field_type: 'Decimal', description: 'Percentage of eligible devices sold' },
      { field_name: 'return_rate_pct', field_type: 'Decimal', description: 'Percentage of units returned' },
    ],
    dataset_health: {
      freshness_status: 'Current',
      quality_score: 95,
      known_issues: [],
    },
    primary_use_cases: ['Sales performance analysis', 'Territory take rate tracking'],
    connected_reports: [
      { report_id: 'RPT-001', report_name: 'SU&G Performance Dashboard' },
      { report_id: 'RPT-003', report_name: 'Territory Take Rate Analysis' },
    ],
    data_owner: 'Sarah Johnson (Sales Analytics)',
    
    // Migration fields
    migration_readiness: {
      readiness_score: 85,
      risk_level: 'Low',
      estimated_effort: 'Medium',
      key_blockers: [],
      migration_window_recommendation: 'Off-peak hours (10 PM - 2 AM EST)',
    },
    pii_flag: false,
    downstream_systems: ['Salesforce', 'Tableau'],
    schema_tables_count: 3,
    null_rate: 0.02,
    duplication_rate: 0.001,
    migration_target_recommendation: 'BigQuery',
    migration_recommendation_reason: 'Best suited for your data volume and query patterns with strong performance on semi-structured data',
    storage_type: 'Data Warehouse',
  },
  {
    dataset_id: 'DS-002',
    dataset_name: 'Customer Feedback & RIS',
    domain: 'Customer Experience',
    last_refresh_ts: generateDate(0.5),
    refresh_frequency: 'Daily',
    certified_flag: true,
    source_system: 'BigQuery',
    row_count: 1000000,
    field_count: 30,
    
    // Extended fields
    key_fields: [
      { field_name: 'survey_date', field_type: 'Date', description: 'Date when survey was completed' },
      { field_name: 'customer_id', field_type: 'String', description: 'Unique customer identifier' },
      { field_name: 'outlet_id', field_type: 'String', description: 'Store where interaction occurred' },
      { field_name: 'ris_pct', field_type: 'Decimal', description: 'Retail Interaction Score percentage' },
      { field_name: 'satisfaction_score', field_type: 'Integer', description: 'Customer satisfaction rating (1-10)' },
      { field_name: 'nps_score', field_type: 'Integer', description: 'Net Promoter Score' },
    ],
    dataset_health: {
      freshness_status: 'Current',
      quality_score: 90,
      known_issues: [],
    },
    primary_use_cases: ['Customer satisfaction analysis', 'RIS score tracking'],
    connected_reports: [
      { report_id: 'RPT-002', report_name: 'Customer Experience Metrics' },
    ],
    data_owner: 'Michael Chen (CX Insights)',
    
    // Migration fields
    migration_readiness: {
      readiness_score: 92,
      risk_level: 'Low',
      estimated_effort: 'Small',
      key_blockers: [],
      migration_window_recommendation: 'Off-peak hours (11 PM - 3 AM EST)',
    },
    pii_flag: true,
    downstream_systems: ['BigQuery', 'Zendesk'],
    schema_tables_count: 2,
    null_rate: 0.01,
    duplication_rate: 0.0005,
    migration_target_recommendation: 'BigQuery',
    migration_recommendation_reason: 'Excellent PII handling and data governance features with compliance certifications',
    storage_type: 'Data Lake',
  },
  {
    dataset_id: 'DS-003',
    dataset_name: 'Returns & Exchanges',
    domain: 'Operations',
    last_refresh_ts: generateDate(1),
    refresh_frequency: 'Daily',
    certified_flag: true,
    source_system: 'BigQuery',
    row_count: 500000,
    field_count: 20,
    
    // Extended fields
    key_fields: [
      { field_name: 'transaction_date', field_type: 'Date', description: 'Date of return/exchange transaction' },
      { field_name: 'outlet_id', field_type: 'String', description: 'Store where transaction occurred' },
      { field_name: 'device_id', field_type: 'String', description: 'Device being returned/exchanged' },
      { field_name: 'return_units', field_type: 'Integer', description: 'Number of units returned' },
      { field_name: 'return_reason', field_type: 'String', description: 'Reason code for return' },
      { field_name: 'aard_pct', field_type: 'Decimal', description: 'All-Accessory Return Damage percentage' },
    ],
    dataset_health: {
      freshness_status: 'Current',
      quality_score: 85,
      known_issues: [],
    },
    primary_use_cases: ['Return rate analysis', 'AARD rate tracking'],
    connected_reports: [
      { report_id: 'RPT-004', report_name: 'Returns & AARD Deep Dive' },
    ],
    data_owner: 'Jessica Martinez (Operations)',
    
    // Migration fields
    migration_readiness: {
      readiness_score: 78,
      risk_level: 'Medium',
      estimated_effort: 'Medium',
      key_blockers: ['Schema transformation needed', 'Data validation required'],
      migration_window_recommendation: 'Weekend maintenance window',
    },
    pii_flag: false,
    downstream_systems: ['BigQuery', 'Operations Dashboard'],
    schema_tables_count: 2,
    null_rate: 0.05,
    duplication_rate: 0.002,
    migration_target_recommendation: 'BigQuery',
    migration_recommendation_reason: 'Seamless integration with Google Cloud services and cost-effective for analytical workloads',
    storage_type: 'Data Warehouse',
  },
  {
    dataset_id: 'DS-004',
    dataset_name: 'Market & Territory Master',
    domain: 'Geography',
    last_refresh_ts: generateDate(7),
    refresh_frequency: 'Weekly',
    certified_flag: false,
    source_system: 'Hadoop',
    row_count: 100000,
    field_count: 15,
    
    // Extended fields
    key_fields: [
      { field_name: 'territory_id', field_type: 'String', description: 'Territory identifier' },
      { field_name: 'market_id', field_type: 'String', description: 'Market identifier' },
      { field_name: 'region_name', field_type: 'String', description: 'Geographic region name' },
      { field_name: 'outlet_count', field_type: 'Integer', description: 'Number of outlets in territory' },
      { field_name: 'population', field_type: 'Integer', description: 'Population in territory' },
    ],
    dataset_health: {
      freshness_status: 'Stale',
      quality_score: 70,
      known_issues: ['Outdated population data'],
    },
    primary_use_cases: ['Territory performance analysis', 'Market segmentation'],
    connected_reports: [
      { report_id: 'RPT-006', report_name: 'Market Segmentation Analysis' },
    ],
    data_owner: 'Robert Lee (Strategy & Planning)',
    
    // Migration fields
    migration_readiness: {
      readiness_score: 55,
      risk_level: 'High',
      estimated_effort: 'Large',
      key_blockers: ['Data quality issues', 'Stale refresh', 'Schema incompatibility'],
      migration_window_recommendation: 'Extended maintenance window required',
    },
    pii_flag: false,
    downstream_systems: ['Hadoop', 'Strategy Portal'],
    schema_tables_count: 4,
    null_rate: 0.15,
    duplication_rate: 0.01,
    migration_target_recommendation: 'Hadoop',
    migration_recommendation_reason: 'Optimized for complex analytics and ML workflows with unified data lake architecture',
    storage_type: 'Data Lake',
  },
  {
    dataset_id: 'DS-005',
    dataset_name: 'Financial Planning Data',
    domain: 'Finance',
    last_refresh_ts: generateDate(2),
    refresh_frequency: 'Daily',
    certified_flag: true,
    source_system: 'Teradata',
    row_count: 2000000,
    field_count: 40,
    
    // Extended fields
    key_fields: [
      { field_name: 'fiscal_period', field_type: 'String', description: 'Fiscal period identifier (YYYYMM)' },
      { field_name: 'account_id', field_type: 'String', description: 'General ledger account identifier' },
      { field_name: 'cost_center', field_type: 'String', description: 'Cost center code' },
      { field_name: 'revenue', field_type: 'Decimal', description: 'Total revenue amount' },
      { field_name: 'cost', field_type: 'Decimal', description: 'Total cost amount' },
      { field_name: 'forecast_variance', field_type: 'Decimal', description: 'Variance from forecast' },
      { field_name: 'budget_status', field_type: 'String', description: 'Budget tracking status' },
    ],
    dataset_health: {
      freshness_status: 'Current',
      quality_score: 90,
      known_issues: [],
    },
    primary_use_cases: ['Revenue forecasting', 'Budget tracking'],
    connected_reports: [
      { report_id: 'RPT-007', report_name: 'Revenue Forecasting Model' },
    ],
    data_owner: 'David Thompson (Finance)',
    
    // Migration fields
    migration_readiness: {
      readiness_score: 70,
      risk_level: 'Medium',
      estimated_effort: 'Large',
      key_blockers: ['Complex transformations', 'Large data volume'],
      migration_window_recommendation: 'Weekend, multi-day window',
    },
    pii_flag: false,
    downstream_systems: ['Teradata', 'Finance Portal', 'SAP'],
    schema_tables_count: 8,
    null_rate: 0.03,
    duplication_rate: 0.0008,
    migration_target_recommendation: 'Teradata',
    storage_type: 'Lakehouse',
  },
  {
    dataset_id: 'DS-006',
    dataset_name: 'Accessory Sales Detailed',
    domain: 'Sales',
    last_refresh_ts: generateDate(0.75),
    refresh_frequency: 'Hourly',
    certified_flag: false,
    source_system: 'BigQuery',
    row_count: 800000,
    field_count: 25,
    
    // Extended fields
    key_fields: [
      { field_name: 'date_id', field_type: 'Integer', description: 'Unique identifier for each date' },
      { field_name: 'outlet_id', field_type: 'String', description: 'Unique identifier for retail outlet' },
      { field_name: 'territory_id', field_type: 'String', description: 'Geographic territory identifier' },
      { field_name: 'accessory_sales_revenue', field_type: 'Decimal', description: 'Total sales revenue from accessories' },
      { field_name: 'accessory_sales_units', field_type: 'Integer', description: 'Number of units sold' },
      { field_name: 'take_rate_pct', field_type: 'Decimal', description: 'Percentage of eligible devices sold' },
      { field_name: 'return_rate_pct', field_type: 'Decimal', description: 'Percentage of units returned' },
    ],
    dataset_health: {
      freshness_status: 'Current',
      quality_score: 80,
      known_issues: [],
    },
    primary_use_cases: ['Sales performance analysis', 'Territory take rate tracking'],
    connected_reports: [
      { report_id: 'RPT-001', report_name: 'SU&G Performance Dashboard' },
      { report_id: 'RPT-003', report_name: 'Territory Take Rate Analysis' },
    ],
    data_owner: 'Sarah Johnson (Sales Analytics)',
    
    // Migration fields
    migration_readiness: {
      readiness_score: 88,
      risk_level: 'Low',
      estimated_effort: 'Small',
      key_blockers: [],
      migration_window_recommendation: 'Off-peak hours (10 PM - 2 AM EST)',
    },
    pii_flag: false,
    downstream_systems: ['BigQuery', 'Tableau'],
    schema_tables_count: 2,
    null_rate: 0.02,
    duplication_rate: 0.0005,
    migration_target_recommendation: 'BigQuery',
    storage_type: 'Data Warehouse',
  },
  {
    dataset_id: 'DS-007',
    dataset_name: 'Device Inventory Levels',
    domain: 'Operations',
    last_refresh_ts: generateDate(1.5),
    refresh_frequency: 'Daily',
    certified_flag: true,
    source_system: 'BigQuery',
    row_count: 1200000,
    field_count: 30,
    
    // Extended fields
    key_fields: [
      { field_name: 'date_id', field_type: 'Integer', description: 'Unique identifier for each date' },
      { field_name: 'outlet_id', field_type: 'String', description: 'Unique identifier for retail outlet' },
      { field_name: 'territory_id', field_type: 'String', description: 'Geographic territory identifier' },
      { field_name: 'device_id', field_type: 'String', description: 'Device identifier' },
      { field_name: 'inventory_level', field_type: 'Integer', description: 'Current inventory level' },
      { field_name: 'reorder_level', field_type: 'Integer', description: 'Reorder level for inventory' },
    ],
    dataset_health: {
      freshness_status: 'Current',
      quality_score: 85,
      known_issues: [],
    },
    primary_use_cases: ['Inventory management', 'Reorder tracking'],
    connected_reports: [],
    data_owner: 'Jessica Martinez (Operations)',
    
    // Migration fields
    migration_readiness: {
      readiness_score: 75,
      risk_level: 'Medium',
      estimated_effort: 'Medium',
      key_blockers: ['Dependency mapping required'],
      migration_window_recommendation: 'Off-peak hours',
    },
    pii_flag: false,
    downstream_systems: ['BigQuery', 'Operations Portal'],
    schema_tables_count: 4,
    null_rate: 0.03,
    duplication_rate: 0.001,
    migration_target_recommendation: 'BigQuery',
    storage_type: 'Data Warehouse',
  },
  {
    dataset_id: 'DS-008',
    dataset_name: 'Outlet Metadata & Attributes',
    domain: 'Geography',
    last_refresh_ts: generateDate(14),
    refresh_frequency: 'Monthly',
    certified_flag: true,
    source_system: 'BigQuery',
    row_count: 50000,
    field_count: 15,
    
    // Extended fields
    key_fields: [
      { field_name: 'outlet_id', field_type: 'String', description: 'Unique identifier for retail outlet' },
      { field_name: 'territory_id', field_type: 'String', description: 'Geographic territory identifier' },
      { field_name: 'outlet_name', field_type: 'String', description: 'Name of the outlet' },
      { field_name: 'city', field_type: 'String', description: 'City where the outlet is located' },
      { field_name: 'state', field_type: 'String', description: 'State where the outlet is located' },
      { field_name: 'outlet_type', field_type: 'String', description: 'Type of outlet (e.g., store, kiosk)' },
    ],
    dataset_health: {
      freshness_status: 'Stale',
      quality_score: 75,
      known_issues: ['Outdated outlet type data'],
    },
    primary_use_cases: ['Outlet performance analysis', 'Territory segmentation'],
    connected_reports: [
      { report_id: 'RPT-005', report_name: 'Outlet Performance Scorecard' },
    ],
    data_owner: 'Sarah Johnson (Sales Analytics)',
    
    // Migration fields
    migration_readiness: {
      readiness_score: 60,
      risk_level: 'High',
      estimated_effort: 'Medium',
      key_blockers: ['Data quality issues', 'Stale refresh'],
      migration_window_recommendation: 'After data cleanup',
    },
    pii_flag: false,
    downstream_systems: ['BigQuery', 'Geography Portal'],
    schema_tables_count: 3,
    null_rate: 0.08,
    duplication_rate: 0.003,
    migration_target_recommendation: 'BigQuery',
    storage_type: 'Data Warehouse',
  },
];

// Metric Definitions
export const refMetricDefinitions: MetricDefinition[] = [
  {
    metric_id: 'MET-001',
    metric_name: 'Take Rate',
    definition: 'The percentage of eligible devices that have been sold.',
  },
  {
    metric_id: 'MET-002',
    metric_name: 'RIS',
    definition: 'The percentage of devices that have received a positive customer feedback score.',
  },
  {
    metric_id: 'MET-003',
    metric_name: 'Run Rate',
    definition: 'The projected annual revenue based on current sales trends.',
  },
  {
    metric_id: 'MET-004',
    metric_name: 'AARD',
    definition: 'The percentage of devices that have been returned within 30 days of purchase.',
  },
  {
    metric_id: 'MET-005',
    metric_name: 'Return Rate',
    definition: 'The percentage of devices that have been returned.',
  },
];

// Territories
export const dimGeoTerritories: DimGeoTerritory[] = [
  { territory_id: 'T-001', market_id: 'M-001', territory_name: 'Northeast Metro' },
  { territory_id: 'T-002', market_id: 'M-001', territory_name: 'Southeast Urban' },
  { territory_id: 'T-003', market_id: 'M-002', territory_name: 'Midwest Central' },
  { territory_id: 'T-004', market_id: 'M-002', territory_name: 'Southwest Regional' },
  { territory_id: 'T-005', market_id: 'M-003', territory_name: 'West Coast Premium' },
  { territory_id: 'T-006', market_id: 'M-003', territory_name: 'Pacific Northwest' },
  { territory_id: 'T-007', market_id: 'M-001', territory_name: 'Mid-Atlantic' },
  { territory_id: 'T-008', market_id: 'M-002', territory_name: 'Great Lakes' },
];

// Generate 90 days of daily sales data
const generateDailySales = (): FactSugSalesDaily[] => {
  const data: FactSugSalesDaily[] = [];
  for (let day = 89; day >= 0; day--) {
    const baseRevenue = 45000 + Math.random() * 15000;
    const trend = (89 - day) * 150; // Upward trend
    const weekendFactor = [0, 6].includes((day + new Date().getDay()) % 7) ? 0.7 : 1.0;
    
    data.push({
      date_id: 20240100 + (90 - day),
      outlet_id: 'OUT-001',
      device_id: 'DEV-001',
      sug_sales_units: Math.floor((250 + Math.random() * 100) * weekendFactor),
      eligible_device_units: Math.floor((400 + Math.random() * 50) * weekendFactor),
      sug_sales_revenue: (baseRevenue + trend) * weekendFactor,
      accessory_revenue: (baseRevenue + trend) * 0.28 * weekendFactor,
      return_units: Math.floor((15 + Math.random() * 10) * weekendFactor),
      passing_surveys: Math.floor((180 + Math.random() * 40) * weekendFactor),
      total_surveys: Math.floor((200 + Math.random() * 20) * weekendFactor),
    });
  }
  return data;
};

export const factSugSalesDaily = generateDailySales();

// Generate monthly rollup for last 6 months
const generateMonthlyRollup = (): FactSugMonthlyRollup[] => {
  const currentMonthId = getCurrentMonthId();
  const data: FactSugMonthlyRollup[] = [];
  
  // Current month data for all territories
  dimGeoTerritories.forEach((territory, idx) => {
    const baseTakeRate = 58 + (Math.random() * 20 - 10);
    data.push({
      month_id: currentMonthId,
      territory_id: territory.territory_id,
      sug_revenue: 850000 + Math.random() * 300000,
      run_rate: 10200000 + Math.random() * 2000000,
      take_rate_pct: baseTakeRate,
      aard_pct: 26 + Math.random() * 6,
      return_rate_pct: 4 + Math.random() * 3,
      ris_pct: 88 + Math.random() * 8,
    });
  });

  // Historical data for sparklines (last 6 months)
  for (let monthsAgo = 5; monthsAgo >= 1; monthsAgo--) {
    const monthId = currentMonthId - monthsAgo;
    dimGeoTerritories.forEach((territory) => {
      const historicalTakeRate = 55 + (Math.random() * 15 - 5);
      data.push({
        month_id: monthId,
        territory_id: territory.territory_id,
        sug_revenue: 800000 + Math.random() * 250000,
        run_rate: 9600000 + Math.random() * 1500000,
        take_rate_pct: historicalTakeRate,
        aard_pct: 25 + Math.random() * 5,
        return_rate_pct: 4.5 + Math.random() * 2.5,
        ris_pct: 86 + Math.random() * 7,
      });
    });
  }

  return data;
};

export const factSugMonthlyRollup = generateMonthlyRollup();

// ===== COMPUTED KPI FUNCTIONS =====

export const getReportsCount = (enterpriseOnly: boolean = false): number => {
  return catalogReports.filter(r => r.enterprise_flag === enterpriseOnly).length;
};

export const getDatasetsCount = (certifiedOnly: boolean = false): number => {
  if (certifiedOnly) {
    return catalogDatasets.filter(d => d.certified_flag).length;
  }
  return catalogDatasets.length;
};

export const getLatestRefreshTime = (): Date => {
  return new Date(Math.max(...catalogDatasets.map(d => d.last_refresh_ts.getTime())));
};

export const getLast90DaysRevenue = () => {
  return factSugSalesDaily.map((day, idx) => ({
    date: generateDate(89 - idx).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    revenue: Math.round(day.sug_sales_revenue),
  }));
};

export const getCurrentMonthMetrics = () => {
  const currentMonthId = getCurrentMonthId();
  const currentMonthData = factSugMonthlyRollup.filter(r => r.month_id === currentMonthId);
  
  const avgTakeRate = currentMonthData.reduce((sum, r) => sum + r.take_rate_pct, 0) / currentMonthData.length;
  const avgRIS = currentMonthData.reduce((sum, r) => sum + r.ris_pct, 0) / currentMonthData.length;
  const avgReturnRate = currentMonthData.reduce((sum, r) => sum + r.return_rate_pct, 0) / currentMonthData.length;
  const avgAARD = currentMonthData.reduce((sum, r) => sum + r.aard_pct, 0) / currentMonthData.length;
  const avgRunRate = currentMonthData.reduce((sum, r) => sum + r.run_rate, 0) / currentMonthData.length;

  return {
    takeRate: avgTakeRate,
    ris: avgRIS,
    returnRate: avgReturnRate,
    aard: avgAARD,
    runRate: avgRunRate,
  };
};

export const getTopTerritories = (limit: number = 5) => {
  const currentMonthId = getCurrentMonthId();
  const currentMonthData = factSugMonthlyRollup.filter(r => r.month_id === currentMonthId);
  
  return currentMonthData
    .sort((a, b) => b.take_rate_pct - a.take_rate_pct)
    .slice(0, limit)
    .map(r => {
      const territory = dimGeoTerritories.find(t => t.territory_id === r.territory_id);
      const historical = factSugMonthlyRollup
        .filter(h => h.territory_id === r.territory_id)
        .sort((a, b) => a.month_id - b.month_id)
        .slice(-6)
        .map(h => ({ value: h.take_rate_pct }));
      
      return {
        territory_id: r.territory_id,
        territory_name: territory?.territory_name || 'Unknown',
        take_rate_pct: r.take_rate_pct,
        sparkline: historical,
      };
    });
};

export const getBottomTerritories = (limit: number = 5) => {
  const currentMonthId = getCurrentMonthId();
  const currentMonthData = factSugMonthlyRollup.filter(r => r.month_id === currentMonthId);
  
  return currentMonthData
    .sort((a, b) => a.take_rate_pct - b.take_rate_pct)
    .slice(0, limit)
    .map(r => {
      const territory = dimGeoTerritories.find(t => t.territory_id === r.territory_id);
      const historical = factSugMonthlyRollup
        .filter(h => h.territory_id === r.territory_id)
        .sort((a, b) => a.month_id - b.month_id)
        .slice(-6)
        .map(h => ({ value: h.take_rate_pct }));
      
      return {
        territory_id: r.territory_id,
        territory_name: territory?.territory_name || 'Unknown',
        take_rate_pct: r.take_rate_pct,
        sparkline: historical,
      };
    });
};

export const getRecentReports = (limit: number = 5) => {
  return catalogReports
    .sort((a, b) => b.last_updated_ts.getTime() - a.last_updated_ts.getTime())
    .slice(0, limit);
};

export const getFeaturedDatasets = (limit: number = 6) => {
  return catalogDatasets
    .sort((a, b) => b.last_refresh_ts.getTime() - a.last_refresh_ts.getTime())
    .slice(0, limit);
};

// Helper to format relative time
export const formatRelativeTime = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays === 1) return '1 day ago';
  return `${diffDays} days ago`;
};

// ===== CONVERSATIONAL ANALYTICS FUNCTIONS =====

// Device master data
export const dimDevices: DimDevice[] = [
  { device_id: 'DEV-001', device_name: 'iPhone 15 Pro', device_group: 'Phone', manufacturer: 'Apple' },
  { device_id: 'DEV-002', device_name: 'Galaxy S24', device_group: 'Phone', manufacturer: 'Samsung' },
  { device_id: 'DEV-003', device_name: 'iPad Air', device_group: 'Tablet', manufacturer: 'Apple' },
  { device_id: 'DEV-004', device_name: 'Galaxy Tab S9', device_group: 'Tablet', manufacturer: 'Samsung' },
  { device_id: 'DEV-005', device_name: 'Apple Watch Series 9', device_group: 'Wearable', manufacturer: 'Apple' },
  { device_id: 'DEV-006', device_name: 'Galaxy Watch 6', device_group: 'Wearable', manufacturer: 'Samsung' },
];

// Generate intraday sales data (yesterday)
const generateIntradaySales = (): FactIntradayIntervalSales[] => {
  const data: FactIntradayIntervalSales[] = [];
  const yesterday = generateDate(1);
  const dateId = 20240189;
  
  for (let hour = 0; hour < 24; hour++) {
    // Store hours (9am-9pm) have higher sales
    const isStoreHours = hour >= 9 && hour <= 21;
    const peakHours = hour >= 12 && hour <= 18;
    const baseUnits = isStoreHours ? (peakHours ? 45 : 30) : 5;
    
    ['Phone', 'Tablet', 'Wearable'].forEach(deviceGroup => {
      const groupMultiplier = deviceGroup === 'Phone' ? 1.5 : deviceGroup === 'Tablet' ? 1.0 : 0.6;
      data.push({
        date_id: dateId,
        hour,
        outlet_id: 'OUT-001',
        device_group: deviceGroup,
        sales_units: Math.floor(baseUnits * groupMultiplier * (0.8 + Math.random() * 0.4)),
        sales_revenue: Math.floor(baseUnits * groupMultiplier * 450 * (0.8 + Math.random() * 0.4)),
      });
    });
  }
  
  return data;
};

export const factIntradayIntervalSales = generateIntradaySales();

// Generate network KPI points
const generateNetworkKpiPoints = (): FactNetworkKpiPoints[] => {
  const data: FactNetworkKpiPoints[] = [];
  const today = generateDate(0);
  const dateId = 20240190;
  
  // Generate 50 network sites across a geographic area
  for (let i = 0; i < 50; i++) {
    const lat = 37.0 + Math.random() * 5; // San Francisco Bay Area approx
    const lon = -122.5 + Math.random() * 2;
    const cqi = Math.floor(3 + Math.random() * 12); // CQI 3-15
    const rsrp = -120 + Math.random() * 40; // RSRP -120 to -80
    const sinr = -5 + Math.random() * 25; // SINR -5 to 20
    const score = (cqi / 15) * 40 + ((rsrp + 120) / 40) * 30 + ((sinr + 5) / 25) * 30;
    
    let status: 'good' | 'warning' | 'critical';
    if (score >= 70) status = 'good';
    else if (score >= 50) status = 'warning';
    else status = 'critical';
    
    data.push({
      date_id: dateId,
      site_id: `SITE-${String(i + 1).padStart(3, '0')}`,
      lat,
      lon,
      cqi,
      rsrp,
      sinr,
      score,
      status,
    });
  }
  
  return data;
};

export const factNetworkKpiPoints = generateNetworkKpiPoints();

// Get monthly take rate trend (last 6 months)
export const getMonthlyTakeRateTrend = () => {
  const currentMonthId = getCurrentMonthId();
  const months: { month: string; takeRate: number }[] = [];
  
  // Generate varied data with dramatic ups and downs between 10-90%
  const baseValues = [25, 68, 42, 85, 38, 72]; // Clear variation for visual impact
  
  for (let i = 5; i >= 0; i--) {
    const monthId = currentMonthId - i;
    const index = 5 - i; // Map to baseValues array
    
    months.push({
      month: getMonthName(monthId),
      takeRate: baseValues[index],
    });
  }
  
  return months;
};

// Get revenue by device group (last 30 days)
export const getRevenueByDeviceGroup = () => {
  // Simulate device group breakdown
  return [
    { device_group: 'Phone', revenue: 3500000, percentage: 58 },
    { device_group: 'Tablet', revenue: 1800000, percentage: 30 },
    { device_group: 'Wearable', revenue: 720000, percentage: 12 },
  ];
};

// Get market segment distribution (for Market Segmentation Analysis report)
export const getMarketSegmentDistribution = () => {
  return [
    { name: 'Enterprise', value: 42, revenue: 2520000 },
    { name: 'SMB', value: 28, revenue: 1680000 },
    { name: 'Consumer Premium', value: 18, revenue: 1080000 },
    { name: 'Consumer Value', value: 12, revenue: 720000 },
  ];
};

// Get segment performance trend (for Market Segmentation Analysis - 6 months)
export const getSegmentPerformanceTrend = () => {
  const months = ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan'];
  return months.map((month, idx) => ({
    month,
    segmentShareIndex: 72 + idx * 3 + Math.random() * 2, // Growing trend
    marketPenetration: 58 + idx * 2 + Math.random() * 1.5,
  }));
};

// Get performance breakdown by region (for various reports)
export const getPerformanceByRegion = () => {
  return [
    { name: 'West Coast', value: 35, performance: 92 },
    { name: 'Northeast', value: 28, performance: 88 },
    { name: 'Midwest', value: 22, performance: 84 },
    { name: 'Southeast', value: 15, performance: 79 },
  ];
};

// Get RIS vs Return Rate scatter data (current month, by territory)
export const getRisVsReturnRateScatter = () => {
  const currentMonthId = getCurrentMonthId();
  const currentMonthData = factSugMonthlyRollup.filter(r => r.month_id === currentMonthId);
  
  return currentMonthData.slice(0, 8).map(r => {
    const territory = dimGeoTerritories.find(t => t.territory_id === r.territory_id);
    return {
      territory_id: r.territory_id,
      territory_name: territory?.territory_name || 'Unknown',
      ris: r.ris_pct,
      returnRate: r.return_rate_pct,
    };
  });
};

// Get intraday sales by hour for a specific outlet (yesterday)
export const getIntradaySalesByHour = (outletId: string = 'OUT-001') => {
  const data = factIntradayIntervalSales.filter(s => s.outlet_id === outletId);
  const hourlyTotals: { hour: string; units: number }[] = [];
  
  for (let hour = 0; hour < 24; hour++) {
    const hourData = data.filter(d => d.hour === hour);
    const totalUnits = hourData.reduce((sum, d) => sum + d.sales_units, 0);
    hourlyTotals.push({
      hour: `${hour}:00`,
      units: totalUnits,
    });
  }
  
  return hourlyTotals;
};

// Get territories to watch (bottom performers)
export const getTerritoriesToWatch = () => {
  const currentMonthId = getCurrentMonthId();
  const currentMonthData = factSugMonthlyRollup.filter(r => r.month_id === currentMonthId);
  
  return currentMonthData
    .sort((a, b) => a.take_rate_pct - b.take_rate_pct)
    .slice(0, 5)
    .map((r, idx) => {
      const territory = dimGeoTerritories.find(t => t.territory_id === r.territory_id);
      return {
        territory_id: r.territory_id,
        territory_name: territory?.territory_name || 'Unknown',
        take_rate_pct: r.take_rate_pct,
        ris_pct: r.ris_pct,
        return_rate_pct: r.return_rate_pct,
        at_risk: idx < 2, // Flag bottom 2 as "At Risk"
      };
    });
};

// Get network KPI summary
export const getNetworkKpiSummary = () => {
  const goodCount = factNetworkKpiPoints.filter(p => p.status === 'good').length;
  const warningCount = factNetworkKpiPoints.filter(p => p.status === 'warning').length;
  const criticalCount = factNetworkKpiPoints.filter(p => p.status === 'critical').length;
  
  return {
    total: factNetworkKpiPoints.length,
    good: goodCount,
    warning: warningCount,
    critical: criticalCount,
    points: factNetworkKpiPoints,
  };
};

// Get prior month comparison for take rate
export const getPriorMonthComparison = () => {
  const currentMonthId = getCurrentMonthId();
  const priorMonthId = currentMonthId - 1;
  
  const currentData = factSugMonthlyRollup.filter(r => r.month_id === currentMonthId);
  const priorData = factSugMonthlyRollup.filter(r => r.month_id === priorMonthId);
  
  const currentAvg = currentData.reduce((sum, r) => sum + r.take_rate_pct, 0) / currentData.length;
  const priorAvg = priorData.reduce((sum, r) => sum + r.take_rate_pct, 0) / priorData.length;
  
  return {
    current: currentAvg,
    prior: priorAvg,
    change: currentAvg - priorAvg,
    changePercent: ((currentAvg - priorAvg) / priorAvg) * 100,
  };
};

// ===== REPORTS PAGE FUNCTIONS =====

// Get all reports
export const getAllReports = () => {
  return catalogReports.sort((a, b) => b.last_updated_ts.getTime() - a.last_updated_ts.getTime());
};

// Get report by ID
export const getReportById = (reportId: string) => {
  return catalogReports.find(r => r.report_id === reportId);
};

// Get report counts
export const getReportCounts = () => {
  return {
    total: catalogReports.length,
    standard: catalogReports.filter(r => !r.enterprise_flag).length,
    enterprise: catalogReports.filter(r => r.enterprise_flag).length,
  };
};

// Get lightweight preview data for a standard report
export const getReportPreviewData = (reportId: string) => {
  const report = getReportById(reportId);
  if (!report || report.enterprise_flag) return null;
  
  // For Customer Churn report, return churn-specific data
  if (reportId === 'RPT-CHURN-001') {
    return [
      { month: 'Jan', churn_rate: 4.2, change_vs_previous_month: 0 },
      { month: 'Feb', churn_rate: 4.8, change_vs_previous_month: 0.6 },
      { month: 'Mar', churn_rate: 5.6, change_vs_previous_month: 0.8 },
      { month: 'Apr', churn_rate: 5.1, change_vs_previous_month: -0.5 },
      { month: 'May', churn_rate: 6.3, change_vs_previous_month: 1.2 },
      { month: 'Jun', churn_rate: 5.7, change_vs_previous_month: -0.6 },
      { month: 'Jul', churn_rate: 5.2, change_vs_previous_month: -0.5 },
      { month: 'Aug', churn_rate: 4.9, change_vs_previous_month: -0.3 },
      { month: 'Sep', churn_rate: 5.4, change_vs_previous_month: 0.5 },
      { month: 'Oct', churn_rate: 4.7, change_vs_previous_month: -0.7 },
      { month: 'Nov', churn_rate: 5.0, change_vs_previous_month: 0.3 },
      { month: 'Dec', churn_rate: 4.5, change_vs_previous_month: -0.5 },
    ];
  }
  
  // For other standard reports, normalize to churn_rate field for chart compatibility
  if (report.domain === 'Customer Experience') {
    return getMonthlyTakeRateTrend().map(m => ({
      month: m.month,
      churn_rate: Math.round((85 + Math.random() * 10) * 10) / 10,
      change_vs_previous_month: 0,
    }));
  } else {
    return getMonthlyTakeRateTrend().map(m => ({
      month: m.month,
      churn_rate: m.takeRate,
      change_vs_previous_month: 0,
    }));
  }
};

// Get related insights for a report
export const getRelatedInsights = (reportId: string) => {
  const currentMetrics = getCurrentMonthMetrics();
  
  return [
    {
      label: 'Avg Take Rate (Current Month)',
      value: `${currentMetrics.takeRate.toFixed(1)}%`,
      trend: 'up',
    },
    {
      label: 'Avg RIS',
      value: `${currentMetrics.ris.toFixed(1)}%`,
      trend: 'stable',
    },
    {
      label: 'Run Rate',
      value: `$${(currentMetrics.runRate / 1000000).toFixed(2)}M`,
      trend: 'up',
    },
  ];
};

// ===== DATASETS PAGE FUNCTIONS =====

// Get all datasets
export const getAllDatasets = () => {
  return catalogDatasets.sort((a, b) => b.last_refresh_ts.getTime() - a.last_refresh_ts.getTime());
};

// Get dataset by ID
export const getDatasetById = (datasetId: string) => {
  return catalogDatasets.find(d => d.dataset_id === datasetId);
};

// Get dataset counts
export const getDatasetCounts = () => {
  const domains = new Set(catalogDatasets.map(d => d.domain));
  return {
    total: catalogDatasets.length,
    certified: catalogDatasets.filter(d => d.certified_flag).length,
    domains: domains.size,
  };
};

// Get reports using a specific dataset
export const getReportsByDatasetId = (datasetId: string) => {
  return catalogReports.filter(r => r.source_dataset_id === datasetId);
};

// Get dataset field schema information
export const getDatasetSchemaFields = (datasetId: string) => {
  const dataset = getDatasetById(datasetId);
  if (!dataset) return [];
  
  // Return schema fields based on domain
  if (dataset.domain === 'Sales') {
    return [
      { field_name: 'date_id', data_type: 'Integer', description: 'Unique identifier for each date' },
      { field_name: 'outlet_id', data_type: 'String', description: 'Unique identifier for retail outlet' },
      { field_name: 'territory_id', data_type: 'String', description: 'Geographic territory identifier' },
      { field_name: 'sug_sales_revenue', data_type: 'Decimal', description: 'Total sales revenue from SU&G products' },
      { field_name: 'sug_sales_units', data_type: 'Integer', description: 'Number of units sold' },
      { field_name: 'take_rate_pct', data_type: 'Decimal', description: 'Percentage of eligible devices sold' },
      { field_name: 'return_rate_pct', data_type: 'Decimal', description: 'Percentage of units returned' },
    ];
  } else if (dataset.domain === 'Customer Experience') {
    return [
      { field_name: 'survey_date', data_type: 'Date', description: 'Date when survey was completed' },
      { field_name: 'customer_id', data_type: 'String', description: 'Unique customer identifier' },
      { field_name: 'outlet_id', data_type: 'String', description: 'Store where interaction occurred' },
      { field_name: 'ris_pct', data_type: 'Decimal', description: 'Retail Interaction Score percentage' },
      { field_name: 'satisfaction_score', data_type: 'Integer', description: 'Customer satisfaction rating (1-10)' },
      { field_name: 'nps_score', data_type: 'Integer', description: 'Net Promoter Score' },
    ];
  } else if (dataset.domain === 'Operations') {
    return [
      { field_name: 'transaction_date', data_type: 'Date', description: 'Date of return/exchange transaction' },
      { field_name: 'outlet_id', data_type: 'String', description: 'Store where transaction occurred' },
      { field_name: 'device_id', data_type: 'String', description: 'Device being returned/exchanged' },
      { field_name: 'return_units', data_type: 'Integer', description: 'Number of units returned' },
      { field_name: 'return_reason', data_type: 'String', description: 'Reason code for return' },
      { field_name: 'aard_pct', data_type: 'Decimal', description: 'All-Accessory Return Damage percentage' },
    ];
  } else if (dataset.domain === 'Finance') {
    return [
      { field_name: 'fiscal_period', data_type: 'String', description: 'Fiscal period identifier (YYYYMM)' },
      { field_name: 'account_id', data_type: 'String', description: 'General ledger account identifier' },
      { field_name: 'cost_center', data_type: 'String', description: 'Cost center code' },
      { field_name: 'revenue', data_type: 'Decimal', description: 'Total revenue amount' },
      { field_name: 'cost', data_type: 'Decimal', description: 'Total cost amount' },
      { field_name: 'forecast_variance', data_type: 'Decimal', description: 'Variance from forecast' },
      { field_name: 'budget_status', data_type: 'String', description: 'Budget tracking status' },
    ];
  } else {
    // Geography or other domains
    return [
      { field_name: 'territory_id', data_type: 'String', description: 'Territory identifier' },
      { field_name: 'market_id', data_type: 'String', description: 'Market identifier' },
      { field_name: 'region_name', data_type: 'String', description: 'Geographic region name' },
      { field_name: 'outlet_count', data_type: 'Integer', description: 'Number of outlets in territory' },
      { field_name: 'population', data_type: 'Integer', description: 'Population in territory' },
    ];
  }
};

// Get dataset growth trend indicator
export const getDatasetGrowthTrend = (datasetId: string): 'Stable' | 'Increasing' | 'Volatile' => {
  // Mock logic based on dataset characteristics
  const dataset = getDatasetById(datasetId);
  if (!dataset) return 'Stable';
  
  if (dataset.refresh_frequency === 'Hourly' || dataset.refresh_frequency === 'Daily') {
    return 'Increasing';
  } else if (dataset.refresh_frequency === 'Weekly') {
    return 'Volatile';
  }
  return 'Stable';
};

// Get dataset owner (dummy data)
export const getDatasetOwner = (datasetId: string): string => {
  const dataset = getDatasetById(datasetId);
  if (!dataset) return 'Unknown';
  
  // Return owner based on domain
  const ownerMap: Record<string, string> = {
    'Sales': 'Sarah Johnson (Sales Analytics)',
    'Customer Experience': 'Michael Chen (CX Insights)',
    'Operations': 'Jessica Martinez (Operations)',
    'Finance': 'David Thompson (Finance)',
    'Geography': 'Emily Rodriguez (Data Governance)',
    'Strategy': 'Robert Lee (Strategy & Planning)',
  };
  
  return ownerMap[dataset.domain] || 'Data Team';
};

// Get key metrics powered by a dataset
export const getMetricsByDataset = (datasetId: string) => {
  // Return all metrics for demo purposes - in real system would filter by dataset
  return refMetricDefinitions;
};

// Get sample data preview for a dataset
export const getDatasetPreviewData = (datasetId: string) => {
  // Return monthly trend for the dataset
  return getMonthlyTakeRateTrend();
};

// ===== ENTERPRISE BI PAGE FUNCTIONS =====

// Outlier thresholds
export const refOutlierThresholds: RefOutlierThreshold[] = [
  { metric_name: 'Box Close %', min_threshold: 80, max_threshold: 100 },
  { metric_name: 'INB AHT (sec)', min_threshold: 180, max_threshold: 360 },
  { metric_name: 'Transfer %', min_threshold: 0, max_threshold: 15 },
  { metric_name: 'Sales Time %', min_threshold: 35, max_threshold: 100 },
  { metric_name: 'Hold %', min_threshold: 0, max_threshold: 12 },
];

// Generate contact center metrics
const generateContactCenterMetrics = (): FactContactCenterMetrics[] => {
  const employees = [
    'Sarah Martinez',
    'James Wilson',
    'Emily Chen',
    'Michael Brown',
    'Jessica Taylor',
    'David Anderson',
    'Rachel Kim',
    'Christopher Lee',
  ];
  
  return employees.map((name, idx) => {
    const boxClose = 75 + Math.random() * 25;
    const aht = 200 + Math.random() * 180;
    const transfer = Math.random() * 20;
    const salesTime = 30 + Math.random() * 40;
    const hold = Math.random() * 18;
    
    // Determine status based on thresholds
    let status: 'good' | 'warning' | 'critical' = 'good';
    if (boxClose < 80 || aht > 360 || transfer > 15 || salesTime < 35 || hold > 12) {
      status = 'critical';
    } else if (boxClose < 85 || aht > 300 || transfer > 10 || salesTime < 40 || hold > 8) {
      status = 'warning';
    }
    
    return {
      employee_id: `EMP-${String(idx + 1).padStart(3, '0')}`,
      employee_name: name,
      box_close_pct: boxClose,
      inb_aht_sec: aht,
      transfer_pct: transfer,
      sales_time_pct: salesTime,
      hold_pct: hold,
      status,
    };
  });
};

export const factContactCenterMetrics = generateContactCenterMetrics();

// Generate dynamic scores
const generateDynamicScores = (): FactDynamicScore[] => {
  const employees = [
    'Sarah Martinez',
    'James Wilson',
    'Emily Chen',
    'Michael Brown',
    'Jessica Taylor',
    'David Anderson',
    'Rachel Kim',
    'Christopher Lee',
    'Amanda Rodriguez',
    'Kevin Patel',
  ];
  
  const scores = employees.map((name, idx) => {
    const m1 = 70 + Math.random() * 30;
    const m2 = 65 + Math.random() * 35;
    const m3 = 75 + Math.random() * 25;
    const m4 = 60 + Math.random() * 40;
    const m5 = 70 + Math.random() * 30;
    const overall = (m1 + m2 + m3 + m4 + m5) / 5;
    
    return {
      employee_id: `EMP-${String(idx + 1).padStart(3, '0')}`,
      employee_name: name,
      metric_1: m1,
      metric_2: m2,
      metric_3: m3,
      metric_4: m4,
      metric_5: m5,
      overall_score: overall,
      rank: 0, // Will be filled after sorting
    };
  });
  
  // Sort by overall score and assign ranks
  scores.sort((a, b) => b.overall_score - a.overall_score);
  scores.forEach((s, idx) => s.rank = idx + 1);
  
  return scores;
};

export const factDynamicScores = generateDynamicScores();

// Get heatmap data for take rate by territory and month
export const getTakeRateHeatmapData = () => {
  const currentMonthId = getCurrentMonthId();
  const heatmapData: any[] = [];
  
  // Get last 6 months
  const months = [];
  for (let i = 5; i >= 0; i--) {
    months.push(currentMonthId - i);
  }
  
  dimGeoTerritories.forEach(territory => {
    const territoryData: any = {
      territory_name: territory.territory_name,
    };
    
    months.forEach(monthId => {
      const monthData = factSugMonthlyRollup.find(
        r => r.territory_id === territory.territory_id && r.month_id === monthId
      );
      territoryData[getMonthName(monthId)] = monthData?.take_rate_pct || 0;
    });
    
    heatmapData.push(territoryData);
  });
  
  return { data: heatmapData, months: months.map(m => getMonthName(m)) };
};

// Get device performance data (take rate vs return rate)
export const getDevicePerformanceData = () => {
  const deviceGroups = ['Phone', 'Tablet', 'Wearable'];
  
  return deviceGroups.map(group => {
    const takeRate = 55 + Math.random() * 20;
    const returnRate = 3 + Math.random() * 5;
    
    return {
      device_group: group,
      take_rate: takeRate,
      return_rate: returnRate,
    };
  });
};

// ===== GOVERNANCE PAGE FUNCTIONS =====

// Get governance overview metrics
export const getGovernanceMetrics = () => {
  const totalDatasets = catalogDatasets.length;
  const certifiedDatasets = catalogDatasets.filter(d => d.certified_flag).length;
  const standardReports = catalogReports.filter(r => !r.enterprise_flag).length;
  const enterpriseReports = catalogReports.filter(r => r.enterprise_flag).length;
  
  // Calculate freshness (datasets refreshed within last 48 hours)
  const now = new Date();
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const freshDatasets = catalogDatasets.filter(d => d.last_refresh_ts >= fortyEightHoursAgo).length;
  
  const governedMetrics = refMetricDefinitions.length;
  
  return {
    certifiedDatasets,
    totalDatasets,
    certificationRate: (certifiedDatasets / totalDatasets) * 100,
    standardReports,
    enterpriseReports,
    freshDatasets,
    freshnessRate: (freshDatasets / totalDatasets) * 100,
    governedMetrics,
  };
};

// Get dataset governance status
export const getDatasetGovernanceStatus = () => {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  return catalogDatasets.map(dataset => {
    const isFresh = dataset.last_refresh_ts >= twentyFourHoursAgo;
    let status: 'healthy' | 'at-risk' | 'review' = 'review';
    
    if (dataset.certified_flag && isFresh) {
      status = 'healthy';
    } else if (dataset.certified_flag && !isFresh) {
      status = 'at-risk';
    }
    
    return {
      ...dataset,
      status,
      isFresh,
    };
  });
};

// Get report landscape data for governance
export const getReportLandscapeData = () => {
  const standard = catalogReports.filter(r => !r.enterprise_flag).length;
  const enterprise = catalogReports.filter(r => r.enterprise_flag).length;
  
  return [
    { type: 'Standard', count: standard, color: '#60A5FA' },
    { type: 'Enterprise', count: enterprise, color: '#F59E0B' },
  ];
};

// ===== MIGRATION PAGE FUNCTIONS =====

export interface MigrationRequest {
  request_id: string;
  request_type: 'Report' | 'Dataset';
  source_platform: string;
  target_platform: string;
  asset_id: string;
  asset_name: string;
  status: 'Submitted' | 'In Review' | 'In Progress' | 'Completed';
  submitted_by: string;
  submitted_date: Date;
}

// Generate dummy migration requests
const generateMigrationRequests = (): MigrationRequest[] => {
  return [
    {
      request_id: 'MIG-001',
      request_type: 'Report',
      source_platform: 'Tableau',
      target_platform: 'Qlik',
      asset_id: 'RPT-001',
      asset_name: 'SU&G Performance Dashboard',
      status: 'Completed',
      submitted_by: 'Sarah Chen',
      submitted_date: generateDate(14),
    },
    {
      request_id: 'MIG-002',
      request_type: 'Dataset',
      source_platform: 'Looker',
      target_platform: 'Qlik',
      asset_id: 'DS-004',
      asset_name: 'Market & Territory Master',
      status: 'In Progress',
      submitted_by: 'Michael Torres',
      submitted_date: generateDate(7),
    },
    {
      request_id: 'MIG-003',
      request_type: 'Report',
      source_platform: 'Qlik',
      target_platform: 'Tableau',
      asset_id: 'RPT-003',
      asset_name: 'Territory Take Rate Analysis',
      status: 'In Review',
      submitted_by: 'Jennifer Kim',
      submitted_date: generateDate(5),
    },
    {
      request_id: 'MIG-004',
      request_type: 'Dataset',
      source_platform: 'Tableau',
      target_platform: 'Looker',
      asset_id: 'DS-006',
      asset_name: 'Accessory Sales Detailed',
      status: 'Submitted',
      submitted_by: 'David Martinez',
      submitted_date: generateDate(2),
    },
    {
      request_id: 'MIG-005',
      request_type: 'Report',
      source_platform: 'Looker',
      target_platform: 'Qlik',
      asset_id: 'RPT-002',
      asset_name: 'Customer Experience Metrics',
      status: 'Completed',
      submitted_by: 'Sarah Chen',
      submitted_date: generateDate(21),
    },
    {
      request_id: 'MIG-006',
      request_type: 'Report',
      source_platform: 'Tableau',
      target_platform: 'Looker',
      asset_id: 'RPT-007',
      asset_name: 'Revenue Forecasting Model',
      status: 'In Progress',
      submitted_by: 'Alex Johnson',
      submitted_date: generateDate(9),
    },
    {
      request_id: 'MIG-007',
      request_type: 'Dataset',
      source_platform: 'Qlik',
      target_platform: 'Tableau',
      asset_id: 'DS-005',
      asset_name: 'Financial Planning Data',
      status: 'In Review',
      submitted_by: 'Rachel Park',
      submitted_date: generateDate(4),
    },
    {
      request_id: 'MIG-008',
      request_type: 'Report',
      source_platform: 'Looker',
      target_platform: 'Tableau',
      asset_id: 'RPT-005',
      asset_name: 'Outlet Performance Scorecard',
      status: 'Submitted',
      submitted_by: 'Michael Torres',
      submitted_date: generateDate(1),
    },
  ];
};

export const migrationRequests = generateMigrationRequests();

// Get migration metrics
export const getMigrationMetrics = () => {
  const activeRequests = migrationRequests.filter(r => r.status !== 'Completed').length;
  const completedRequests = migrationRequests.filter(r => r.status === 'Completed').length;
  const eligibleReports = catalogReports.length;
  const eligibleDatasets = catalogDatasets.length;
  
  return {
    activeRequests,
    completedRequests,
    eligibleReports,
    eligibleDatasets,
    totalRequests: migrationRequests.length,
  };
};

// Get migration request by ID
export const getMigrationRequestById = (requestId: string) => {
  return migrationRequests.find(r => r.request_id === requestId);
};

// Get datasets ready for migration (readiness score >= 70)
export const getMigrationReadyDatasets = () => {
  return catalogDatasets.filter(d => 
    d.migration_readiness && d.migration_readiness.readiness_score >= 70
  );
};

// ===== FULL REPORT PAGE FUNCTIONS =====

// Generate monthly trend data for full report (12 months)
export const getFullReportMonthlyTrend = (reportId: string) => {
  const report = getReportById(reportId);
  if (!report) return [];
  
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  // Generate varying data based on report domain
  if (report.domain === 'Sales') {
    return months.map((month, idx) => ({
      month,
      revenue: 2500000 + Math.random() * 1500000 + (idx * 50000),
      takeRate: 45 + Math.random() * 25 + (idx * 1.5),
      units: 12000 + Math.random() * 8000 + (idx * 300),
    }));
  } else if (report.domain === 'Customer Experience') {
    return months.map((month, idx) => ({
      month,
      ris: 75 + Math.random() * 15 + (idx * 0.5),
      nps: 65 + Math.random() * 15,
      satisfaction: 7.5 + Math.random() * 1.5,
    }));
  } else {
    return months.map((month, idx) => ({
      month,
      value: 50 + Math.random() * 40 + (idx * 2),
      secondary: 30 + Math.random() * 20,
    }));
  }
};

// Generate year-over-year comparison data
export const getFullReportYoYData = (reportId: string, metricType: 'primary' | 'secondary') => {
  const report = getReportById(reportId);
  if (!report) return [];
  
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  return months.map((month, idx) => {
    const baseValue = metricType === 'primary' ? 3000000 : 15000;
    const thisYear = baseValue + Math.random() * (baseValue * 0.4) + (idx * (baseValue * 0.05));
    const lastYear = thisYear * (0.75 + Math.random() * 0.35);
    
    return {
      month,
      thisYear,
      lastYear,
    };
  });
};

// Generate top drivers/segments table data
export const getFullReportTopDrivers = (reportId: string) => {
  const report = getReportById(reportId);
  if (!report) return [];
  
  if (report.domain === 'Sales') {
    return [
      { name: 'iPhone 15 Pro', value: '$2.4M', share: '32%', trend: 'up' },
      { name: 'iPad Air', value: '$1.8M', share: '24%', trend: 'up' },
      { name: 'MacBook Pro', value: '$1.2M', share: '16%', trend: 'down' },
      { name: 'Apple Watch', value: '$1.1M', share: '15%', trend: 'up' },
      { name: 'AirPods Pro', value: '$0.9M', share: '13%', trend: 'flat' },
    ];
  } else if (report.domain === 'Customer Experience') {
    return [
      { name: 'Product Quality', value: '8.9', share: '28%', trend: 'up' },
      { name: 'Service Speed', value: '8.5', share: '24%', trend: 'up' },
      { name: 'Staff Knowledge', value: '8.2', share: '22%', trend: 'flat' },
      { name: 'Store Experience', value: '7.8', share: '18%', trend: 'down' },
      { name: 'Value for Money', value: '7.5', share: '8%', trend: 'flat' },
    ];
  } else {
    return [
      { name: 'Category A', value: '2,450', share: '35%', trend: 'up' },
      { name: 'Category B', value: '1,820', share: '26%', trend: 'up' },
      { name: 'Category C', value: '1,210', share: '17%', trend: 'flat' },
      { name: 'Category D', value: '980', share: '14%', trend: 'down' },
      { name: 'Category E', value: '540', share: '8%', trend: 'flat' },
    ];
  }
};

// Generate top entities table data (second table)
export const getFullReportTopEntities = (reportId: string) => {
  const report = getReportById(reportId);
  if (!report) return [];
  
  if (report.domain === 'Sales') {
    return [
      { entity: 'Northeast Metro', value: '$3.2M', impressions: '45,200', rate: '62%' },
      { entity: 'West Coast', value: '$2.8M', impressions: '38,500', rate: '58%' },
      { entity: 'Southeast', value: '$2.1M', impressions: '32,100', rate: '55%' },
      { entity: 'Midwest', value: '$1.9M', impressions: '28,400', rate: '52%' },
      { entity: 'Southwest', value: '$1.5M', impressions: '22,800', rate: '48%' },
    ];
  } else if (report.domain === 'Customer Experience') {
    return [
      { entity: 'Flagship Stores', value: '9.2', impressions: '12,500', rate: '92%' },
      { entity: 'Mall Locations', value: '8.5', impressions: '8,200', rate: '85%' },
      { entity: 'Street Stores', value: '8.1', impressions: '5,800', rate: '81%' },
      { entity: 'Outlet Centers', value: '7.8', impressions: '4,500', rate: '78%' },
      { entity: 'Pop-up Stores', value: '7.2', impressions: '2,100', rate: '72%' },
    ];
  } else {
    return [
      { entity: 'Region 1', value: '4,250', impressions: '18,900', rate: '68%' },
      { entity: 'Region 2', value: '3,820', impressions: '15,200', rate: '65%' },
      { entity: 'Region 3', value: '2,910', impressions: '12,400', rate: '58%' },
      { entity: 'Region 4', value: '2,450', impressions: '9,800', rate: '52%' },
      { entity: 'Region 5', value: '1,780', impressions: '6,500', rate: '45%' },
    ];
  }
};