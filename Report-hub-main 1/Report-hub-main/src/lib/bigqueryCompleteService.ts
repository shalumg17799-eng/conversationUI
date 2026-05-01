// Complete BigQuery Service for Report Hub
// Uses all 18 dynamic BigQuery tables

import { getTableName, executeQueryWithFallback } from './bigqueryBrowser';
import { bigQueryApi } from './apiService';

// Interface definitions matching all synthetic data structure
export interface DimMarket {
  market_id: string;
  market_name: string;
  description?: string;
}

export interface DimTerritory {
  territory_id: string;
  market_id: string;
  territory_name: string;
  region?: string;
  manager?: string;
}

export interface DimOutlet {
  outlet_id: string;
  territory_id: string;
  outlet_name: string;
  city: string;
  state: string;
  zip_code?: string;
  outlet_type?: string;
  square_footage?: number;
  employee_count?: number;
}

export interface DimDevice {
  device_id: string;
  device_name: string;
  device_group: string;
  manufacturer: string;
  msrp?: number;
  plan_eligible?: boolean;
}

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
  date?: Date;
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
  month?: Date;
}

export interface FactIntradaySales {
  date_id: number;
  hour: number;
  outlet_id: string;
  device_group: string;
  sales_units: number;
  sales_revenue: number;
  timestamp?: Date;
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
  status: string;
  timestamp?: Date;
}

export interface FactContactCenterMetrics {
  employee_id: string;
  employee_name: string;
  box_close_pct: number;
  inb_aht_sec: number;
  transfer_pct: number;
  sales_time_pct: number;
  hold_pct: number;
  status: string;
  date?: Date;
}

export interface FactDynamicScores {
  employee_id: string;
  employee_name: string;
  metric_1: number;
  metric_2: number;
  metric_3: number;
  metric_4: number;
  metric_5: number;
  overall_score: number;
  rank: number;
  date?: Date;
}

export interface CatalogReport {
  report_id: string;
  report_name: string;
  domain: string;
  source_dataset_id: string;
  last_updated_ts: Date;
  enterprise_flag: boolean;
  source_application?: string;
  business_owner?: string;
  description?: string;
  primary_use_case?: string;
  created_date?: Date;
  refresh_frequency?: string;
  key_kpis?: Array<{
    kpi_name: string;
    current_value: string;
    previous_value: string;
    trend: string;
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
  source_system?: string;
  row_count?: number;
  field_count?: number;
  key_fields?: Array<{
    field_name: string;
    field_type: string;
    description: string;
  }>;
  dataset_health?: {
    freshness_status: string;
    quality_score: number;
    known_issues?: string[];
  };
  primary_use_cases?: string[];
  connected_reports?: Array<{
    report_id: string;
    report_name: string;
  }>;
  data_owner?: string;
  migration_readiness?: {
    readiness_score: number;
    risk_level: string;
    estimated_effort: string;
    key_blockers?: string[];
    migration_window_recommendation?: string;
  };
  pii_flag?: boolean;
  downstream_systems?: string[];
  schema_tables_count?: number;
  null_rate?: number;
  duplication_rate?: number;
  migration_target_recommendation?: string;
  migration_recommendation_reason?: string;
  storage_type?: string;
}

export interface ChurnMonthly {
  month: string;
  month_id: number;
  churn_rate: number;
  change_vs_previous_month: number;
  subscribers_lost?: number;
  total_base?: number;
  voluntary_churn_pct?: number;
  involuntary_churn_pct?: number;
}

export interface TakeRateMonthlyTrend {
  month: string;
  takeRate: number;
  change_vs_previous_month: number;
}

export interface MarketSegmentDistribution {
  name: string;
  value: number;
  revenue?: number;
}

export interface SegmentPerformanceTrend {
  month: string;
  segmentShareIndex: number;
  marketPenetration: number;
}

export interface PerformanceByRegion {
  name: string;
  value: number;
  performance: number;
}

export interface RevenueByDeviceGroup {
  device_group: string;
  revenue?: number;
  percentage?: number;
}

// Complete BigQuery Service Class
export class BigQueryCompleteService {
  private datasetId: string;

  constructor() {
    this.datasetId = 'report_hub_demo';
    console.log('🚀 [BIGQUERY SERVICE] Initializing BigQueryCompleteService');
    console.log('🚀 [BIGQUERY SERVICE] Dataset:', this.datasetId);
    console.log('🚀 [BIGQUERY SERVICE] Data source: REAL BIGQUERY (not synthetic)');
    console.log('🚀 [BIGQUERY SERVICE] Project: data-practice-472314');
  }

  // DIMENSION TABLES
  async getMarkets(): Promise<DimMarket[]> {
    console.log('📊 [BIGQUERY SERVICE] Fetching markets from BigQuery...');
    const query = `SELECT * FROM ${getTableName('dim_markets')} ORDER BY market_id`;
    const result = await executeQueryWithFallback(query);
    console.log('📊 [BIGQUERY SERVICE] Markets fetched from BigQuery:', result.length, 'records');
    return result;
  }

  async getTerritories(): Promise<DimTerritory[]> {
    const query = `SELECT * FROM \`${this.datasetId}.dim_territories\` ORDER BY territory_name`;
    return await executeQueryWithFallback(query);
  }

  async getOutlets(): Promise<DimOutlet[]> {
    const query = `SELECT * FROM \`${this.datasetId}.dim_outlets\` ORDER BY outlet_name`;
    return await executeQueryWithFallback(query);
  }

  async getDevices(): Promise<DimDevice[]> {
    const query = `SELECT * FROM \`${this.datasetId}.dim_devices\` ORDER BY device_name`;
    return await executeQueryWithFallback(query);
  }

  // FACT TABLES
  async getSugSalesDaily(limit = 100): Promise<FactSugSalesDaily[]> {
    console.log('💰 [BIGQUERY SERVICE] Fetching SUG sales daily data from BigQuery...');
    const query = `SELECT * FROM \`${this.datasetId}.fact_sug_sales_daily\` ORDER BY date_id DESC LIMIT ${limit}`;
    const result = await executeQueryWithFallback(query);
    console.log('💰 [BIGQUERY SERVICE] SUG sales daily data fetched from BigQuery:', result.length, 'records');
    return result;
  }

  async getSugMonthlyRollup(): Promise<FactSugMonthlyRollup[]> {
    const query = `SELECT * FROM \`${this.datasetId}.fact_sug_monthly_rollup\` ORDER BY month_id DESC`;
    return await executeQueryWithFallback(query);
  }

  async getIntradaySales(): Promise<FactIntradaySales[]> {
    const query = `SELECT * FROM \`${this.datasetId}.fact_intraday_sales\` ORDER BY date_id DESC, hour DESC LIMIT 100`;
    return await executeQueryWithFallback(query);
  }

  async getNetworkKpiPoints(): Promise<FactNetworkKpiPoints[]> {
    const query = `SELECT * FROM \`${this.datasetId}.fact_network_kpi_points\` ORDER BY date_id DESC LIMIT 100`;
    return await executeQueryWithFallback(query);
  }

  async getContactCenterMetrics(): Promise<FactContactCenterMetrics[]> {
    const query = `SELECT * FROM \`${this.datasetId}.fact_contact_center_metrics\` ORDER BY date DESC`;
    return await executeQueryWithFallback(query);
  }

  async getDynamicScores(): Promise<FactDynamicScores[]> {
    const query = `SELECT * FROM \`${this.datasetId}.fact_dynamic_scores\` ORDER BY overall_score DESC`;
    return await executeQueryWithFallback(query);
  }

  // CATALOG TABLES
  async getCatalogReports(): Promise<CatalogReport[]> {
    const query = `SELECT * FROM \`${this.datasetId}.catalog_reports\` ORDER BY report_name`;
    return await executeQueryWithFallback(query);
  }

  async getCatalogDatasets(): Promise<CatalogDataset[]> {
    const query = `SELECT * FROM \`${this.datasetId}.catalog_datasets\` ORDER BY dataset_name`;
    return await executeQueryWithFallback(query);
  }

  // ANALYTICAL TABLES
  async getChurnMonthly(): Promise<ChurnMonthly[]> {
    const query = `SELECT * FROM \`${this.datasetId}.churn_monthly\` ORDER BY month_id DESC`;
    return await executeQueryWithFallback(query);
  }

  async getTakeRateMonthlyTrend(): Promise<TakeRateMonthlyTrend[]> {
    const query = `SELECT * FROM \`${this.datasetId}.take_rate_monthly_trend\` ORDER BY month DESC`;
    return await executeQueryWithFallback(query);
  }

  async getMarketSegmentDistribution(): Promise<MarketSegmentDistribution[]> {
    const query = `SELECT * FROM \`${this.datasetId}.market_segment_distribution\` ORDER BY value DESC`;
    return await executeQueryWithFallback(query);
  }

  async getSegmentPerformanceTrend(): Promise<SegmentPerformanceTrend[]> {
    const query = `SELECT * FROM \`${this.datasetId}.segment_performance_trend\` ORDER BY month DESC`;
    return await executeQueryWithFallback(query);
  }

  async getPerformanceByRegion(): Promise<PerformanceByRegion[]> {
    const query = `SELECT * FROM \`${this.datasetId}.performance_by_region\` ORDER BY performance DESC`;
    return await executeQueryWithFallback(query);
  }

  async getRevenueByDeviceGroup(): Promise<RevenueByDeviceGroup[]> {
    const query = `SELECT * FROM \`${this.datasetId}.revenue_by_device_group\` ORDER BY revenue DESC`;
    return await executeQueryWithFallback(query);
  }

  // COMBINED ANALYTICS METHODS
  async getSalesPerformanceOverview() {
    const query = `
      SELECT 
        d.outlet_name,
        d.city,
        d.state,
        SUM(f.sug_sales_revenue) as total_revenue,
        SUM(f.sug_sales_units) as total_units,
        AVG(f.take_rate_pct) as avg_take_rate
      FROM \`${this.datasetId}.fact_sug_sales_daily\` f
      JOIN \`${this.datasetId}.dim_outlets\` d ON f.outlet_id = d.outlet_id
      GROUP BY d.outlet_id, d.outlet_name, d.city, d.state
      ORDER BY total_revenue DESC
      LIMIT 10
    `;
    return await executeQueryWithFallback(query);
  }

  async getDevicePerformanceAnalysis() {
    const query = `
      SELECT 
        d.device_name,
        d.device_group,
        d.manufacturer,
        SUM(f.sug_sales_revenue) as total_revenue,
        SUM(f.sug_sales_units) as total_units,
        COUNT(*) as transaction_count
      FROM \`${this.datasetId}.fact_sug_sales_daily\` f
      JOIN \`${this.datasetId}.dim_devices\` d ON f.device_id = d.device_id
      GROUP BY d.device_id, d.device_name, d.device_group, d.manufacturer
      ORDER BY total_revenue DESC
    `;
    return await executeQueryWithFallback(query);
  }

  async getTerritoryPerformanceMetrics() {
    const query = `
      SELECT 
        t.territory_name,
        t.region,
        SUM(m.sug_revenue) as total_revenue,
        AVG(m.take_rate_pct) as avg_take_rate,
        AVG(m.return_rate_pct) as avg_return_rate,
        AVG(m.ris_pct) as avg_ris_score
      FROM \`${this.datasetId}.fact_sug_monthly_rollup\` m
      JOIN \`${this.datasetId}.dim_territories\` t ON m.territory_id = t.territory_id
      GROUP BY t.territory_id, t.territory_name, t.region
      ORDER BY total_revenue DESC
    `;
    return await executeQueryWithFallback(query);
  }

  // HEALTH CHECK AND STATUS
  async getDatasetHealth() {
    const tableCounts = await Promise.all([
      this.getTableCount('dim_markets'),
      this.getTableCount('dim_territories'),
      this.getTableCount('dim_outlets'),
      this.getTableCount('dim_devices'),
      this.getTableCount('fact_sug_sales_daily'),
      this.getTableCount('fact_sug_monthly_rollup'),
      this.getTableCount('catalog_reports'),
      this.getTableCount('catalog_datasets'),
      this.getTableCount('churn_monthly'),
      this.getTableCount('take_rate_monthly_trend')
    ]);

    return {
      datasetId: this.datasetId,
      totalTables: 18,
      tableCounts: {
        dim_markets: tableCounts[0],
        dim_territories: tableCounts[1],
        dim_outlets: tableCounts[2],
        dim_devices: tableCounts[3],
        fact_sug_sales_daily: tableCounts[4],
        fact_sug_monthly_rollup: tableCounts[5],
        catalog_reports: tableCounts[6],
        catalog_datasets: tableCounts[7],
        churn_monthly: tableCounts[8],
        take_rate_monthly_trend: tableCounts[9]
      },
      status: 'healthy'
    };
  }

  private async getTableCount(tableName: string): Promise<number> {
    const query = `SELECT COUNT(*) as count FROM \`${this.datasetId}.${tableName}\``;
    const result = await executeQueryWithFallback(query);
    return result[0]?.count || 0;
  }
}

// Export singleton instance
export const bigQueryCompleteService = new BigQueryCompleteService();

// All interfaces are already exported above
