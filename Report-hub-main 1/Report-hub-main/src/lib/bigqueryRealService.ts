// Real BigQuery Service for Report Hub
// Uses actual BigQuery tables instead of mock data

import { bigquery, getTableName, executeQuery } from './bigquery';

// Interface definitions matching the synthetic data structure
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
  model?: string;
  price?: number;
  launch_date?: Date;
  discontinued_date?: Date;
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

export interface FactIntradayIntervalSales {
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
  status: 'good' | 'warning' | 'critical';
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
  status: 'good' | 'warning' | 'critical';
  date?: Date;
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
  source_system?: string;
  row_count?: number;
  field_count?: number;
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
  migration_target_recommendation?: string;
  migration_recommendation_reason?: string;
  storage_type?: string;
}

// Real BigQuery Service Class
export class BigQueryRealService {
  // Dimension Tables
  static async getMarkets(): Promise<DimMarket[]> {
    const query = `SELECT * FROM ${getTableName('dim_markets')} ORDER BY market_name`;
    return await executeQuery(query);
  }

  static async getTerritories(): Promise<DimTerritory[]> {
    const query = `SELECT * FROM ${getTableName('dim_territories')} ORDER BY territory_name`;
    return await executeQuery(query);
  }

  static async getOutlets(): Promise<DimOutlet[]> {
    const query = `SELECT * FROM ${getTableName('dim_outlets')} ORDER BY outlet_name`;
    return await executeQuery(query);
  }

  static async getDevices(): Promise<DimDevice[]> {
    const query = `SELECT * FROM ${getTableName('dim_devices')} ORDER BY device_name`;
    return await executeQuery(query);
  }

  // Fact Tables
  static async getSalesDaily(dateRange?: { start: string; end: string }): Promise<FactSugSalesDaily[]> {
    let query = `SELECT * FROM ${getTableName('fact_sug_sales_daily')}`;
    
    if (dateRange) {
      query += ` WHERE date BETWEEN DATE('${dateRange.start}') AND DATE('${dateRange.end}')`;
    }
    
    query += ` ORDER BY date DESC, outlet_id`;
    return await executeQuery(query);
  }

  static async getMonthlyRollup(territoryId?: string): Promise<FactSugMonthlyRollup[]> {
    let query = `SELECT * FROM ${getTableName('fact_sug_monthly_rollup')}`;
    
    if (territoryId) {
      query += ` WHERE territory_id = '${territoryId}'`;
    }
    
    query += ` ORDER BY month_id DESC`;
    return await executeQuery(query);
  }

  static async getIntradaySales(date?: string): Promise<FactIntradayIntervalSales[]> {
    let query = `SELECT * FROM ${getTableName('fact_intraday_sales')}`;
    
    if (date) {
      query += ` WHERE DATE(timestamp) = DATE('${date}')`;
    }
    
    query += ` ORDER BY timestamp DESC`;
    return await executeQuery(query);
  }

  static async getNetworkKpiPoints(dateRange?: { start: string; end: string }): Promise<FactNetworkKpiPoints[]> {
    let query = `SELECT * FROM ${getTableName('fact_network_kpi_points')}`;
    
    if (dateRange) {
      query += ` WHERE DATE(timestamp) BETWEEN DATE('${dateRange.start}') AND DATE('${dateRange.end}')`;
    }
    
    query += ` ORDER BY timestamp DESC`;
    return await executeQuery(query);
  }

  static async getContactCenterMetrics(): Promise<FactContactCenterMetrics[]> {
    const query = `SELECT * FROM ${getTableName('fact_contact_center_metrics')} ORDER BY status, overall_score DESC`;
    return await executeQuery(query);
  }

  static async getDynamicScores(): Promise<FactDynamicScore[]> {
    const query = `SELECT * FROM ${getTableName('fact_dynamic_scores')} ORDER BY rank`;
    return await executeQuery(query);
  }

  // Catalog Tables
  static async getCatalogReports(domain?: string): Promise<CatalogReport[]> {
    let query = `SELECT * FROM ${getTableName('catalog_reports')}`;
    
    if (domain) {
      query += ` WHERE domain = '${domain}'`;
    }
    
    query += ` ORDER BY last_updated_ts DESC`;
    return await executeQuery(query);
  }

  static async getCatalogDatasets(domain?: string): Promise<CatalogDataset[]> {
    let query = `SELECT * FROM ${getTableName('catalog_datasets')}`;
    
    if (domain) {
      query += ` WHERE domain = '${domain}'`;
    }
    
    query += ` ORDER BY last_refresh_ts DESC`;
    return await executeQuery(query);
  }

  // Analytical Tables
  static async getChurnMonthly(): Promise<any[]> {
    const query = `SELECT * FROM ${getTableName('churn_monthly')} ORDER BY month_date DESC`;
    return await executeQuery(query);
  }

  static async getTakeRateTrend(): Promise<any[]> {
    const query = `SELECT * FROM ${getTableName('take_rate_monthly_trend')} ORDER BY month_date DESC`;
    return await executeQuery(query);
  }

  static async getMarketSegmentDistribution(): Promise<any[]> {
    const query = `SELECT * FROM ${getTableName('market_segment_distribution')} ORDER BY percentage DESC`;
    return await executeQuery(query);
  }

  static async getSegmentPerformanceTrend(): Promise<any[]> {
    const query = `SELECT * FROM ${getTableName('segment_performance_trend')} ORDER BY month_date DESC, segment`;
    return await executeQuery(query);
  }

  static async getPerformanceByRegion(): Promise<any[]> {
    const query = `SELECT * FROM ${getTableName('performance_by_region')} ORDER BY performance_score DESC`;
    return await executeQuery(query);
  }

  static async getRevenueByDeviceGroup(): Promise<any[]> {
    const query = `SELECT * FROM ${getTableName('revenue_by_device_group')} ORDER BY revenue DESC`;
    return await executeQuery(query);
  }

  // Pre-built Views
  static async getDailySalesDetail(dateRange?: { start: string; end: string }): Promise<any[]> {
    let query = `SELECT * FROM ${getTableName('v_daily_sales_detail')}`;
    
    if (dateRange) {
      query += ` WHERE date BETWEEN DATE('${dateRange.start}') AND DATE('${dateRange.end}')`;
    }
    
    query += ` ORDER BY date DESC, outlet_name`;
    return await executeQuery(query);
  }

  static async getMonthlyTerritoryPerformance(): Promise<any[]> {
    const query = `SELECT * FROM ${getTableName('v_monthly_territory_performance')} ORDER BY month_id DESC, territory_name`;
    return await executeQuery(query);
  }

  static async getNetworkPerformanceSummary(): Promise<any[]> {
    const query = `SELECT * FROM ${getTableName('v_network_performance_summary')} ORDER BY date DESC`;
    return await executeQuery(query);
  }

  // Aggregated Metrics
  static async getSalesMetrics(dateRange?: { start: string; end: string }): Promise<any> {
    let query = `
      SELECT 
        COUNT(*) as total_transactions,
        SUM(sug_sales_units) as total_units,
        SUM(sug_sales_revenue) as total_revenue,
        AVG(sug_sales_revenue) as avg_revenue_per_transaction,
        SUM(accessory_revenue) as total_accessory_revenue,
        AVG(CASE WHEN total_surveys > 0 THEN (passing_surveys * 100.0 / total_surveys) ELSE 0 END) as avg_survey_pass_rate
      FROM ${getTableName('fact_sug_sales_daily')}
    `;
    
    if (dateRange) {
      query += ` WHERE date BETWEEN DATE('${dateRange.start}') AND DATE('${dateRange.end}')`;
    }
    
    const results = await executeQuery(query);
    return results[0] || {};
  }

  static async getNetworkMetrics(): Promise<any> {
    const query = `
      SELECT 
        COUNT(*) as total_points,
        COUNTIF(status = 'good') as good_points,
        COUNTIF(status = 'warning') as warning_points,
        COUNTIF(status = 'critical') as critical_points,
        AVG(cqi) as avg_cqi,
        AVG(rsrp) as avg_rsrp,
        AVG(sinr) as avg_sinr,
        AVG(score) as avg_score,
        COUNT(DISTINCT site_id) as unique_sites
      FROM ${getTableName('fact_network_kpi_points')}
      WHERE DATE(timestamp) = CURRENT_DATE()
    `;
    
    const results = await executeQuery(query);
    return results[0] || {};
  }

  static async getEmployeeMetrics(): Promise<any> {
    const query = `
      SELECT 
        COUNT(*) as total_employees,
        AVG(box_close_pct) as avg_box_close_rate,
        AVG(inb_aht_sec) as avg_handle_time,
        AVG(transfer_pct) as avg_transfer_rate,
        AVG(sales_time_pct) as avg_sales_time,
        AVG(hold_pct) as avg_hold_time,
        COUNTIF(status = 'good') as good_performers,
        COUNTIF(status = 'warning') as warning_performers,
        COUNTIF(status = 'critical') as critical_performers
      FROM ${getTableName('fact_contact_center_metrics')}
    `;
    
    const results = await executeQuery(query);
    return results[0] || {};
  }

  // Search Functions
  static async searchReports(searchTerm: string): Promise<CatalogReport[]> {
    const query = `
      SELECT * FROM ${getTableName('catalog_reports')}
      WHERE 
        LOWER(report_name) LIKE LOWER('%${searchTerm}%') OR
        LOWER(domain) LIKE LOWER('%${searchTerm}%') OR
        LOWER(description) LIKE LOWER('%${searchTerm}%') OR
        LOWER(business_owner) LIKE LOWER('%${searchTerm}%')
      ORDER BY last_updated_ts DESC
      LIMIT 10
    `;
    return await executeQuery(query);
  }

  static async searchDatasets(searchTerm: string): Promise<CatalogDataset[]> {
    const query = `
      SELECT * FROM ${getTableName('catalog_datasets')}
      WHERE 
        LOWER(dataset_name) LIKE LOWER('%${searchTerm}%') OR
        LOWER(domain) LIKE LOWER('%${searchTerm}%') OR
        LOWER(data_owner) LIKE LOWER('%${searchTerm}%')
      ORDER BY last_refresh_ts DESC
      LIMIT 10
    `;
    return await executeQuery(query);
  }

  // Custom Query Executor
  static async executeCustomQuery(query: string): Promise<any[]> {
    return await executeQuery(query);
  }
}

export default BigQueryRealService;
