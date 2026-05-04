import { qualifiedTable, runQuery } from '../lib/bigqueryClient';

export interface DimMarket { market_id: string; market_name: string; description?: string }
export interface DimTerritory { territory_id: string; market_id: string; territory_name: string; region?: string; manager?: string }
export interface DimOutlet { outlet_id: string; territory_id: string; outlet_name: string; city: string; state: string; outlet_type?: string }
export interface DimDevice { device_id: string; device_name: string; device_group: string; manufacturer: string; price?: number }

export interface FactSugSalesDaily {
  date_id: number; outlet_id: string; device_id: string;
  sug_sales_units: number; sug_sales_revenue: number; accessory_revenue: number;
  return_units: number; passing_surveys: number; total_surveys: number; date?: Date;
}

export interface FactSugMonthlyRollup {
  month_id: number; territory_id: string; sug_revenue: number; run_rate: number;
  take_rate_pct: number; aard_pct: number; return_rate_pct: number; ris_pct: number; month?: Date;
}

export interface FactContactCenterMetrics {
  employee_id: string; employee_name: string; box_close_pct: number;
  inb_aht_sec: number; transfer_pct: number; sales_time_pct: number;
  hold_pct: number; status: 'good' | 'warning' | 'critical';
}

export interface CatalogReport {
  report_id: string; report_name: string; domain: string;
  source_dataset_id: string; last_updated_ts: Date; enterprise_flag: boolean;
  description?: string; business_owner?: string;
}

export interface CatalogDataset {
  dataset_id: string; dataset_name: string; domain: string;
  last_refresh_ts: Date; refresh_frequency: string; certified_flag: boolean;
  source_system?: string; row_count?: number;
}

export const BigQueryService = {
  getMarkets: () => runQuery(`SELECT * FROM ${qualifiedTable('dim_markets')} ORDER BY market_name`),
  getTerritories: () => runQuery(`SELECT * FROM ${qualifiedTable('dim_territories')} ORDER BY territory_name`),
  getOutlets: () => runQuery(`SELECT * FROM ${qualifiedTable('dim_outlets')} ORDER BY outlet_name`),
  getDevices: () => runQuery(`SELECT * FROM ${qualifiedTable('dim_devices')} ORDER BY device_name`),

  getSalesDaily: (dateRange?: { start: string; end: string }) => {
    let sql = `SELECT * FROM ${qualifiedTable('fact_sug_sales_daily')}`;
    if (dateRange) sql += ` WHERE date BETWEEN DATE('${dateRange.start}') AND DATE('${dateRange.end}')`;
    sql += ` ORDER BY date DESC, outlet_id`;
    return runQuery(sql);
  },

  getMonthlyRollup: (territoryId?: string) => {
    let sql = `SELECT * FROM ${qualifiedTable('fact_sug_monthly_rollup')}`;
    if (territoryId) sql += ` WHERE territory_id = '${territoryId}'`;
    sql += ` ORDER BY month_id DESC`;
    return runQuery(sql);
  },

  getIntradaySales: (date?: string) => {
    let sql = `SELECT * FROM ${qualifiedTable('fact_intraday_sales')}`;
    if (date) sql += ` WHERE DATE(timestamp) = DATE('${date}')`;
    sql += ` ORDER BY timestamp DESC`;
    return runQuery(sql);
  },

  getNetworkKpiPoints: (dateRange?: { start: string; end: string }) => {
    let sql = `SELECT * FROM ${qualifiedTable('fact_network_kpi_points')}`;
    if (dateRange) sql += ` WHERE DATE(timestamp) BETWEEN DATE('${dateRange.start}') AND DATE('${dateRange.end}')`;
    sql += ` ORDER BY timestamp DESC`;
    return runQuery(sql);
  },

  getContactCenterMetrics: () =>
    runQuery(`SELECT * FROM ${qualifiedTable('fact_contact_center_metrics')} ORDER BY status`),

  getDynamicScores: () =>
    runQuery(`SELECT * FROM ${qualifiedTable('fact_dynamic_scores')} ORDER BY rank`),

  getCatalogReports: (domain?: string) => {
    let sql = `SELECT * FROM ${qualifiedTable('catalog_reports')}`;
    if (domain) sql += ` WHERE domain = '${domain}'`;
    sql += ` ORDER BY last_updated_ts DESC`;
    return runQuery(sql);
  },

  getCatalogDatasets: (domain?: string) => {
    let sql = `SELECT * FROM ${qualifiedTable('catalog_datasets')}`;
    if (domain) sql += ` WHERE domain = '${domain}'`;
    sql += ` ORDER BY last_refresh_ts DESC`;
    return runQuery(sql);
  },

  getChurnMonthly: () => runQuery(`SELECT * FROM ${qualifiedTable('churn_monthly')} ORDER BY month_date DESC`),

  getPerformanceByRegion: () =>
    runQuery(`SELECT * FROM ${qualifiedTable('performance_by_region')} ORDER BY performance_score DESC`),

  getRevenueByDeviceGroup: () =>
    runQuery(`SELECT * FROM ${qualifiedTable('revenue_by_device_group')} ORDER BY revenue DESC`),

  getDailySalesDetail: (dateRange?: { start: string; end: string }) => {
    let sql = `SELECT * FROM ${qualifiedTable('v_daily_sales_detail')}`;
    if (dateRange) sql += ` WHERE date BETWEEN DATE('${dateRange.start}') AND DATE('${dateRange.end}')`;
    sql += ` ORDER BY date DESC, outlet_name`;
    return runQuery(sql);
  },

  getMonthlyTerritoryPerformance: () =>
    runQuery(`SELECT * FROM ${qualifiedTable('v_monthly_territory_performance')} ORDER BY month_id DESC, territory_name`),

  runRawQuery: (sql: string) => runQuery(sql),
};
