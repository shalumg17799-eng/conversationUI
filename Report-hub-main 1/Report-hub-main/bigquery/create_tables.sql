-- BigQuery Table Creation Script for Report Hub
-- Creates all 18 tables to replace synthetic data

-- =====================================================
-- DIMENSION TABLES
-- =====================================================

-- 1. dim_markets
CREATE OR REPLACE TABLE `data-practice-472314.telecom_demo.dim_markets` (
  market_id STRING,
  market_name STRING,
  description STRING
) OPTIONS(
  description="Geographic market definitions"
);

-- 2. dim_territories
CREATE OR REPLACE TABLE `data-practice-472314.telecom_demo.dim_territories` (
  territory_id STRING,
  market_id STRING,
  territory_name STRING,
  region STRING,
  manager STRING
) OPTIONS(
  description="Sales territory mappings"
);

-- 3. dim_outlets
CREATE OR REPLACE TABLE `data-practice-472314.telecom_demo.dim_outlets` (
  outlet_id STRING,
  territory_id STRING,
  outlet_name STRING,
  city STRING,
  state STRING,
  zip_code STRING,
  outlet_type STRING,
  square_footage INT64,
  employee_count INT64
) OPTIONS(
  description="Retail outlet information"
);

-- 4. dim_devices
CREATE OR REPLACE TABLE `data-practice-472314.telecom_demo.dim_devices` (
  device_id STRING,
  device_name STRING,
  device_group STRING,
  manufacturer STRING,
  model STRING,
  price FLOAT64,
  launch_date DATE,
  discontinued_date DATE
) OPTIONS(
  description="Device catalog"
);

-- =====================================================
-- FACT TABLES
-- =====================================================

-- 5. fact_sug_sales_daily
CREATE OR REPLACE TABLE `data-practice-472314.telecom_demo.fact_sug_sales_daily` (
  date_id INT64,
  outlet_id STRING,
  device_id STRING,
  sug_sales_units INT64,
  eligible_device_units INT64,
  sug_sales_revenue FLOAT64,
  accessory_revenue FLOAT64,
  return_units INT64,
  passing_surveys INT64,
  total_surveys INT64,
  date DATE
) PARTITION BY date
CLUSTER BY outlet_id, device_id
OPTIONS(
  description="Daily sales transactions",
  require_partition_filter=false
);

-- 6. fact_sug_monthly_rollup
CREATE OR REPLACE TABLE `data-practice-472314.telecom_demo.fact_sug_monthly_rollup` (
  month_id INT64,
  territory_id STRING,
  sug_revenue FLOAT64,
  run_rate FLOAT64,
  take_rate_pct FLOAT64,
  aard_pct FLOAT64,
  return_rate_pct FLOAT64,
  ris_pct FLOAT64,
  month DATE
) OPTIONS(
  description="Monthly aggregated metrics"
);

-- 7. fact_intraday_sales
CREATE OR REPLACE TABLE `data-practice-472314.telecom_demo.fact_intraday_sales` (
  date_id INT64,
  hour INT64,
  outlet_id STRING,
  device_group STRING,
  sales_units INT64,
  sales_revenue FLOAT64,
  timestamp TIMESTAMP
) PARTITION BY DATE(timestamp)
CLUSTER BY outlet_id, device_group
OPTIONS(
  description="Hourly sales data",
  require_partition_filter=false
);

-- 8. fact_network_kpi_points
CREATE OR REPLACE TABLE `data-practice-472314.telecom_demo.fact_network_kpi_points` (
  date_id INT64,
  site_id STRING,
  lat FLOAT64,
  lon FLOAT64,
  cqi FLOAT64,
  rsrp FLOAT64,
  sinr FLOAT64,
  score FLOAT64,
  status STRING,
  timestamp TIMESTAMP
) PARTITION BY DATE(timestamp)
CLUSTER BY site_id
OPTIONS(
  description="Network performance metrics",
  require_partition_filter=false
);

-- 9. fact_contact_center_metrics
CREATE OR REPLACE TABLE `data-practice-472314.telecom_demo.fact_contact_center_metrics` (
  employee_id STRING,
  employee_name STRING,
  box_close_pct FLOAT64,
  inb_aht_sec INT64,
  transfer_pct FLOAT64,
  sales_time_pct FLOAT64,
  hold_pct FLOAT64,
  status STRING,
  date DATE
) OPTIONS(
  description="Call center performance"
);

-- 10. fact_dynamic_scores
CREATE OR REPLACE TABLE `data-practice-472314.telecom_demo.fact_dynamic_scores` (
  employee_id STRING,
  employee_name STRING,
  metric_1 FLOAT64,
  metric_2 FLOAT64,
  metric_3 FLOAT64,
  metric_4 FLOAT64,
  metric_5 FLOAT64,
  overall_score FLOAT64,
  rank INT64,
  date DATE
) OPTIONS(
  description="Employee performance scores"
);

-- =====================================================
-- CATALOG TABLES
-- =====================================================

-- 11. catalog_reports
CREATE OR REPLACE TABLE `data-practice-472314.telecom_demo.catalog_reports` (
  report_id STRING,
  report_name STRING,
  domain STRING,
  source_dataset_id STRING,
  last_updated_ts TIMESTAMP,
  enterprise_flag BOOLEAN,
  source_application STRING,
  business_owner STRING,
  description STRING,
  primary_use_case STRING,
  created_date TIMESTAMP,
  refresh_frequency STRING,
  key_kpis ARRAY<STRUCT<
    kpi_name STRING,
    current_value STRING,
    previous_value STRING,
    trend STRING,
    delta STRING
  >>,
  primary_dimensions ARRAY<STRING>,
  time_range_supported STRING,
  top_insights ARRAY<STRING>,
  known_limitations ARRAY<STRING>,
  recommended_actions ARRAY<STRING>,
  related_reports ARRAY<STRUCT<
    report_id STRING,
    report_name STRING
  >>,
  used_by_roles ARRAY<STRING>
) OPTIONS(
  description="Report metadata"
);

-- 12. catalog_datasets
CREATE OR REPLACE TABLE `data-practice-472314.telecom_demo.catalog_datasets` (
  dataset_id STRING,
  dataset_name STRING,
  domain STRING,
  last_refresh_ts TIMESTAMP,
  refresh_frequency STRING,
  certified_flag BOOLEAN,
  source_system STRING,
  row_count INT64,
  field_count INT64,
  key_fields ARRAY<STRUCT<
    field_name STRING,
    field_type STRING,
    description STRING
  >>,
  dataset_health STRUCT<
    freshness_status STRING,
    quality_score INT64,
    known_issues ARRAY<STRING>
  >,
  primary_use_cases ARRAY<STRING>,
  connected_reports ARRAY<STRUCT<
    report_id STRING,
    report_name STRING
  >>,
  data_owner STRING,
  migration_readiness STRUCT<
    readiness_score INT64,
    risk_level STRING,
    estimated_effort STRING,
    key_blockers ARRAY<STRING>,
    migration_window_recommendation STRING
  >,
  pii_flag BOOLEAN,
  downstream_systems ARRAY<STRING>,
  schema_tables_count INT64,
  null_rate FLOAT64,
  duplication_rate FLOAT64,
  migration_target_recommendation STRING,
  migration_recommendation_reason STRING,
  storage_type STRING
) OPTIONS(
  description="Dataset metadata"
);

-- =====================================================
-- ANALYTICAL TABLES
-- =====================================================

-- 13. churn_monthly
CREATE OR REPLACE TABLE `data-practice-472314.telecom_demo.churn_monthly` (
  month STRING,
  churn_rate FLOAT64,
  change_vs_previous_month FLOAT64,
  month_date DATE
) OPTIONS(
  description="Monthly churn analysis"
);

-- 14. take_rate_monthly_trend
CREATE OR REPLACE TABLE `data-practice-472314.telecom_demo.take_rate_monthly_trend` (
  month STRING,
  take_rate FLOAT64,
  change_vs_previous_month FLOAT64,
  month_date DATE
) OPTIONS(
  description="Take rate trends"
);

-- 15. market_segment_distribution
CREATE OR REPLACE TABLE `data-practice-472314.telecom_demo.market_segment_distribution` (
  segment STRING,
  percentage FLOAT64,
  revenue FLOAT64,
  customer_count INT64,
  avg_revenue_per_customer FLOAT64
) OPTIONS(
  description="Market segment analysis"
);

-- 16. segment_performance_trend
CREATE OR REPLACE TABLE `data-practice-472314.telecom_demo.segment_performance_trend` (
  segment STRING,
  month STRING,
  performance_metric FLOAT64,
  revenue FLOAT64,
  customer_count INT64,
  month_date DATE
) OPTIONS(
  description="Segment performance over time"
);

-- 17. performance_by_region
CREATE OR REPLACE TABLE `data-practice-472314.telecom_demo.performance_by_region` (
  region STRING,
  performance_score FLOAT64,
  revenue FLOAT64,
  outlet_count INT64,
  employee_count INT64,
  avg_revenue_per_outlet FLOAT64
) OPTIONS(
  description="Regional performance metrics"
);

-- 18. revenue_by_device_group
CREATE OR REPLACE TABLE `data-practice-472314.telecom_demo.revenue_by_device_group` (
  device_group STRING,
  revenue FLOAT64,
  units_sold INT64,
  avg_price_per_unit FLOAT64,
  market_share_pct FLOAT64,
  growth_rate_pct FLOAT64
) OPTIONS(
  description="Device group revenue analysis"
);

-- =====================================================
-- VIEWS FOR COMMON QUERIES
-- =====================================================

-- View for daily sales with device and outlet details
CREATE OR REPLACE VIEW `data-practice-472314.telecom_demo.v_daily_sales_detail` AS
SELECT 
  f.date_id,
  f.date,
  f.outlet_id,
  o.outlet_name,
  o.city,
  o.state,
  f.device_id,
  d.device_name,
  d.device_group,
  d.manufacturer,
  f.sug_sales_units,
  f.sug_sales_revenue,
  f.accessory_revenue,
  f.return_units,
  f.passing_surveys,
  f.total_surveys,
  CASE 
    WHEN f.total_surveys > 0 THEN (f.passing_surveys * 100.0 / f.total_surveys)
    ELSE 0 
  END as survey_pass_rate_pct
FROM `data-practice-472314.telecom_demo.fact_sug_sales_daily` f
LEFT JOIN `data-practice-472314.telecom_demo.dim_outlets` o ON f.outlet_id = o.outlet_id
LEFT JOIN `data-practice-472314.telecom_demo.dim_devices` d ON f.device_id = d.device_id;

-- View for monthly territory performance
CREATE OR REPLACE VIEW `data-practice-472314.telecom_demo.v_monthly_territory_performance` AS
SELECT 
  f.month_id,
  f.month,
  f.territory_id,
  t.territory_name,
  t.market_id,
  m.market_name,
  f.sug_revenue,
  f.run_rate,
  f.take_rate_pct,
  f.aard_pct,
  f.return_rate_pct,
  f.ris_pct
FROM `data-practice-472314.telecom_demo.fact_sug_monthly_rollup` f
LEFT JOIN `data-practice-472314.telecom_demo.dim_territories` t ON f.territory_id = t.territory_id
LEFT JOIN `data-practice-472314.telecom_demo.dim_markets` m ON t.market_id = m.market_id;

-- View for network performance summary
CREATE OR REPLACE VIEW `data-practice-472314.telecom_demo.v_network_performance_summary` AS
SELECT 
  date_id,
  DATE(timestamp) as date,
  COUNT(*) as total_points,
  COUNTIF(status = 'good') as good_points,
  COUNTIF(status = 'warning') as warning_points,
  COUNTIF(status = 'critical') as critical_points,
  AVG(cqi) as avg_cqi,
  AVG(rsrp) as avg_rsrp,
  AVG(sinr) as avg_sinr,
  AVG(score) as avg_score,
  COUNT(DISTINCT site_id) as unique_sites
FROM `data-practice-472314.telecom_demo.fact_network_kpi_points`
GROUP BY date_id, DATE(timestamp)
ORDER BY date_id DESC;

-- =====================================================
-- TABLE CREATION COMPLETE
-- =====================================================
