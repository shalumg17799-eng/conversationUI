// Complete BigQuery Dataset Creation
// Creates new dataset with all 18 tables perfectly consistent with synthetic data
import { BigQuery } from '@google-cloud/bigquery';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const bigquery = new BigQuery({
  projectId: 'data-practice-472314',
  credentials: {
    client_email: 'bigquery-backend-dp@data-practice-472314.iam.gserviceaccount.com',
    private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDlLD8c44pDJE0F\nCvPvxjsgoZlo5WsAG43M2sfGWSjBF/Rtdauojm3cU55aeWVa71Px89cuYjsrg4Mw\nu2uDNFtYJxi4xK0dEzMed/y6cqpPtJ6IFTse+8Z78yrk89GSmFccJ/rkGgmTSRXY\nMJD8CuxC28RLcd+dVkSIHJeZuJ4Maro2VpBSMJ5kKv2IQrmg06+C8GEdC37Ri0xe\nBzNNqwbx9f1Jg36Ag8inpa6pxwxJCJj6n9KfvfGPyRTR3IX+kf7HRQrsWujIh1ZU\nQX3lUxyzr4nS2rkyV5sqfp9p1Yzrj5Jge0CSIaW0Vz5Qi5tfvRH9+swgMPvrvkAs\neoOFpvifAgMBAAECggEAMseKloKenMD65e6m3Y69hD36aaFIA8aXNXiWwo739k0y\nBl0H87nXgvXuRRrYB/22yopeuDLg7IPf+ljU+kYMJWzIUAyYVTRvY8VvdPq6XR3m\n8L1Pk85zDPz1GLUjz0k9KAp9z7QrQfz0P6qHPanH7wqWJKdvRoQafFRljRS4xIQo\nNe6v42nUnW1kS5rwPyI7LlE0WbxD1Lw1XYUEZg4H0iRP8C6JEh8vFKdOcvBhutYi\n0hbozQKfdMWTV+f24BWvD4TRZxKY6NvMEAKH2Mvx+6+/bZCSw+yO8ualuerSAkOj\n+2RgWPGikD+65/wRjCDQJNdKKVR4ECGYcZhuQ6IM7QKBgQDzz78jyxl8IEqLWNkD\ngTA7EaAqsPh3+jlVlU2KxoT5Dc9zn9kcypBDZ0uGhmNs8lDynjKaw3zMtRdrhfL9\n7huJb75GE9RJbPRSFas9wgrFaWjtxe1zz0kFbmNgxhGpu23Le/SYYUxsK+dy3Gy+\nPRaWavgFANv1bgLo11J0tbkFRQKBgQDwoSgt2IzebJB+lBaVloLuvAAxAtg3ELg4\nLMopGF56aZmXm4BHcxRwbPAgCsy0w1LKl/JvFbDyqE9FiwBJHnWKAiRxwxkILAHs\nFljVYSNA3RqdQuptTJMB84oKeWkd6urv/oOBiJBo4LV6xUI1nu28BfZOJBt37GLu\nIwfRHAdKkwKBgQDOKbhN0vqszD1ckXeIECCxghj2oIiqIyuCI+ra0z0zwCrQcbVM\nNDlC1cC2c0L1p/0s+vp9hZotG2A/apfrgwFD+PpjFXdn0zrRgkM3yLIE9jpk/P3p\n9LihYBOmjDX5WWThMOLGS1gtC/79UEifoNZNwQwSZwSYBztsmk6+I7/dJQKBgQCS\nP+DDvJIhvao0xJzVXh1GLE2RfEEddrQAsHhOcdk6XWRUmNZmlrMdgZiQYP/5/Z0c\nNS3MBkr9sP49LjaGOlUGBDdSTVmxdc3VR9/GELv0eG3slvcUZy4SSYrkwtX4sQcJ\nxo7286GRnMGwVKPhIy8q0BTbeWaYhLu8MN5XYcmssQKBgCZEZ8/+BB1fuoomCIW7\n15HiKFz9sSnKlBFW4JRPw6hapTj8p6X1B/MMQgZ8t2hEvE9Moci+fn1Z2bxaXgsF\nvkHbM4B079uwgvmunS6YV7U4wgdi8fq9GskXy/MdGf+rZ3Wqniifl9zO8eyDJTpR\nDrlls5cFfxGFFQglnbrTySYC\n-----END PRIVATE KEY-----\n"
  }
});

const oldDatasetId = 'telecom_demo';
const newDatasetId = 'report_hub_demo';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '..', 'src', 'data');

// Load JSON data files
async function loadJsonFile(filename) {
  const filePath = path.join(dataDir, filename);
  const data = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(data);
}

// Create new dataset
async function createNewDataset() {
  try {
    console.log(`🔄 Creating new dataset: ${newDatasetId}`);
    
    const [dataset] = await bigquery.createDataset(newDatasetId, {
      location: 'US',
    });
    
    console.log(`✅ Dataset ${dataset.id} created.`);
    return dataset;
  } catch (error) {
    if (error.code === 409) {
      console.log(`Dataset ${newDatasetId} already exists. Deleting and recreating...`);
      await bigquery.dataset(newDatasetId).delete();
      await new Promise(resolve => setTimeout(resolve, 3000));
      return await createNewDataset();
    }
    throw error;
  }
}

// Create table with schema
async function createTable(tableId, schema) {
  try {
    console.log(`🔄 Creating table: ${tableId}`);
    
    const dataset = bigquery.dataset(newDatasetId);
    const [table] = await dataset.createTable(tableId, {
      schema,
      location: 'US',
    });
    
    console.log(`✅ Successfully created ${tableId}`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    return table;
  } catch (error) {
    console.error(`❌ Error creating ${tableId}:`, error.message);
    throw error;
  }
}

// Load data into table
async function loadDataIntoTable(tableId, rows) {
  if (!rows || rows.length === 0) {
    console.log(`   No data to load for ${tableId}`);
    return;
  }

  try {
    console.log(`📦 Loading ${rows.length} rows into ${tableId}...`);
    
    const dataset = bigquery.dataset(newDatasetId);
    const table = dataset.table(tableId);
    
    await table.insert(rows);
    console.log(`✅ Successfully loaded data into ${tableId}`);
    
  } catch (error) {
    console.error(`❌ Error loading data into ${tableId}:`, error.message);
    throw error;
  }
}

// Create all 18 tables with perfect consistency
async function createAllTables() {
  try {
    console.log('🚀 Creating complete BigQuery dataset with all 18 tables...');
    console.log(`New Dataset: ${newDatasetId}`);
    console.log(`Project: data-practice-472314`);
    
    // Create new dataset
    await createNewDataset();
    
    // DIMENSION TABLES
    console.log('\n📊 Creating Dimension Tables...');
    
    // dim_markets (create synthetic data since no JSON exists)
    const marketsSchema = [
      { name: 'market_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'market_name', type: 'STRING', mode: 'REQUIRED' },
      { name: 'description', type: 'STRING', mode: 'NULLABLE' }
    ];
    await createTable('dim_markets', marketsSchema);
    const marketsData = [
      { market_id: 'M-001', market_name: 'Northeast', description: 'Northeast region' },
      { market_id: 'M-002', market_name: 'Southeast', description: 'Southeast region' },
      { market_id: 'M-003', market_name: 'Midwest', description: 'Midwest region' },
      { market_id: 'M-004', market_name: 'West', description: 'West region' },
      { market_id: 'M-005', market_name: 'Southwest', description: 'Southwest region' }
    ];
    await loadDataIntoTable('dim_markets', marketsData);
    
    // dim_territories
    const territoriesData = await loadJsonFile('dim_territories.json');
    const territoriesSchema = [
      { name: 'territory_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'market_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'territory_name', type: 'STRING', mode: 'REQUIRED' }
    ];
    await createTable('dim_territories', territoriesSchema);
    await loadDataIntoTable('dim_territories', territoriesData);
    
    // dim_outlets
    const outletsData = await loadJsonFile('dim_outlets.json');
    const outletsSchema = [
      { name: 'outlet_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'territory_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'outlet_name', type: 'STRING', mode: 'REQUIRED' },
      { name: 'city', type: 'STRING', mode: 'REQUIRED' },
      { name: 'state', type: 'STRING', mode: 'REQUIRED' },
      { name: 'outlet_type', type: 'STRING', mode: 'NULLABLE' }
    ];
    await createTable('dim_outlets', outletsSchema);
    await loadDataIntoTable('dim_outlets', outletsData);
    
    // dim_devices
    const devicesData = await loadJsonFile('dim_devices.json');
    const devicesSchema = [
      { name: 'device_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'device_name', type: 'STRING', mode: 'REQUIRED' },
      { name: 'device_group', type: 'STRING', mode: 'REQUIRED' },
      { name: 'manufacturer', type: 'STRING', mode: 'REQUIRED' },
      { name: 'msrp', type: 'INTEGER', mode: 'NULLABLE' },
      { name: 'plan_eligible', type: 'BOOLEAN', mode: 'NULLABLE' }
    ];
    await createTable('dim_devices', devicesSchema);
    await loadDataIntoTable('dim_devices', devicesData);
    
    // FACT TABLES
    console.log('\n📈 Creating Fact Tables...');
    
    // fact_sug_sales_daily
    const salesDailyData = await loadJsonFile('fact_sug_sales_daily.json');
    const salesDailySchema = [
      { name: 'date_id', type: 'INTEGER', mode: 'REQUIRED' },
      { name: 'outlet_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'device_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'sug_sales_units', type: 'INTEGER', mode: 'REQUIRED' },
      { name: 'eligible_device_units', type: 'INTEGER', mode: 'REQUIRED' },
      { name: 'sug_sales_revenue', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'accessory_revenue', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'return_units', type: 'INTEGER', mode: 'REQUIRED' },
      { name: 'passing_surveys', type: 'INTEGER', mode: 'REQUIRED' },
      { name: 'total_surveys', type: 'INTEGER', mode: 'REQUIRED' },
      { name: 'date', type: 'DATE', mode: 'NULLABLE' }
    ];
    await createTable('fact_sug_sales_daily', salesDailySchema);
    await loadDataIntoTable('fact_sug_sales_daily', salesDailyData);
    
    // fact_sug_monthly_rollup
    const monthlyRollupData = await loadJsonFile('fact_sug_monthly_rollup.json');
    const monthlyRollupSchema = [
      { name: 'month_id', type: 'INTEGER', mode: 'REQUIRED' },
      { name: 'territory_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'sug_revenue', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'run_rate', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'take_rate_pct', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'aard_pct', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'return_rate_pct', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'ris_pct', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'month', type: 'DATE', mode: 'NULLABLE' }
    ];
    await createTable('fact_sug_monthly_rollup', monthlyRollupSchema);
    await loadDataIntoTable('fact_sug_monthly_rollup', monthlyRollupData);
    
    // fact_intraday_sales
    const intradayData = await loadJsonFile('fact_intraday_sales.json');
    const intradaySchema = [
      { name: 'date_id', type: 'INTEGER', mode: 'REQUIRED' },
      { name: 'hour', type: 'INTEGER', mode: 'REQUIRED' },
      { name: 'outlet_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'device_group', type: 'STRING', mode: 'REQUIRED' },
      { name: 'sales_units', type: 'INTEGER', mode: 'REQUIRED' },
      { name: 'sales_revenue', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'timestamp', type: 'TIMESTAMP', mode: 'NULLABLE' }
    ];
    await createTable('fact_intraday_sales', intradaySchema);
    await loadDataIntoTable('fact_intraday_sales', intradayData);
    
    // fact_network_kpi_points
    const networkKpiData = await loadJsonFile('fact_network_kpi_points.json');
    const networkKpiSchema = [
      { name: 'date_id', type: 'INTEGER', mode: 'REQUIRED' },
      { name: 'site_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'lat', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'lon', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'cqi', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'rsrp', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'sinr', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'score', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'status', type: 'STRING', mode: 'REQUIRED' },
      { name: 'timestamp', type: 'TIMESTAMP', mode: 'NULLABLE' }
    ];
    await createTable('fact_network_kpi_points', networkKpiSchema);
    await loadDataIntoTable('fact_network_kpi_points', networkKpiData);
    
    // fact_contact_center_metrics
    const contactCenterData = await loadJsonFile('fact_contact_center_metrics.json');
    const contactCenterSchema = [
      { name: 'employee_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'employee_name', type: 'STRING', mode: 'REQUIRED' },
      { name: 'box_close_pct', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'inb_aht_sec', type: 'INTEGER', mode: 'REQUIRED' },
      { name: 'transfer_pct', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'sales_time_pct', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'hold_pct', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'status', type: 'STRING', mode: 'REQUIRED' },
      { name: 'date', type: 'DATE', mode: 'NULLABLE' }
    ];
    await createTable('fact_contact_center_metrics', contactCenterSchema);
    await loadDataIntoTable('fact_contact_center_metrics', contactCenterData);
    
    // fact_dynamic_scores
    const dynamicScoresData = await loadJsonFile('fact_dynamic_scores.json');
    const dynamicScoresSchema = [
      { name: 'employee_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'employee_name', type: 'STRING', mode: 'REQUIRED' },
      { name: 'metric_1', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'metric_2', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'metric_3', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'metric_4', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'metric_5', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'overall_score', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'rank', type: 'INTEGER', mode: 'REQUIRED' },
      { name: 'date', type: 'DATE', mode: 'NULLABLE' }
    ];
    await createTable('fact_dynamic_scores', dynamicScoresSchema);
    await loadDataIntoTable('fact_dynamic_scores', dynamicScoresData);
    
    // CATALOG TABLES
    console.log('\n📋 Creating Catalog Tables...');
    
    // catalog_reports
    const reportsData = await loadJsonFile('catalog_reports.json');
    const reportsSchema = [
      { name: 'report_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'report_name', type: 'STRING', mode: 'REQUIRED' },
      { name: 'domain', type: 'STRING', mode: 'REQUIRED' },
      { name: 'source_dataset_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'last_updated_ts', type: 'TIMESTAMP', mode: 'REQUIRED' },
      { name: 'enterprise_flag', type: 'BOOLEAN', mode: 'REQUIRED' },
      { name: 'source_application', type: 'STRING', mode: 'NULLABLE' },
      { name: 'business_owner', type: 'STRING', mode: 'NULLABLE' },
      { name: 'description', type: 'STRING', mode: 'NULLABLE' },
      { name: 'primary_use_case', type: 'STRING', mode: 'NULLABLE' },
      { name: 'created_date', type: 'TIMESTAMP', mode: 'NULLABLE' },
      { name: 'refresh_frequency', type: 'STRING', mode: 'NULLABLE' },
      { name: 'key_kpis', type: 'RECORD', mode: 'REPEATED', fields: [
        { name: 'kpi_name', type: 'STRING', mode: 'REQUIRED' },
        { name: 'current_value', type: 'STRING', mode: 'REQUIRED' },
        { name: 'previous_value', type: 'STRING', mode: 'REQUIRED' },
        { name: 'trend', type: 'STRING', mode: 'REQUIRED' },
        { name: 'delta', type: 'STRING', mode: 'REQUIRED' }
      ]},
      { name: 'primary_dimensions', type: 'STRING', mode: 'REPEATED' },
      { name: 'time_range_supported', type: 'STRING', mode: 'NULLABLE' },
      { name: 'top_insights', type: 'STRING', mode: 'REPEATED' },
      { name: 'known_limitations', type: 'STRING', mode: 'REPEATED' },
      { name: 'recommended_actions', type: 'STRING', mode: 'REPEATED' },
      { name: 'related_reports', type: 'RECORD', mode: 'REPEATED', fields: [
        { name: 'report_id', type: 'STRING', mode: 'REQUIRED' },
        { name: 'report_name', type: 'STRING', mode: 'REQUIRED' }
      ]},
      { name: 'used_by_roles', type: 'STRING', mode: 'REPEATED' }
    ];
    await createTable('catalog_reports', reportsSchema);
    const transformedReports = reportsData.map(report => ({
      ...report,
      last_updated_ts: new Date(report.last_updated_ts),
      created_date: report.created_date ? new Date(report.created_date) : null,
      key_kpis: report.key_kpis || [],
      primary_dimensions: report.primary_dimensions || [],
      top_insights: report.top_insights || [],
      known_limitations: report.known_limitations || [],
      recommended_actions: report.recommended_actions || [],
      related_reports: report.related_reports || [],
      used_by_roles: report.used_by_roles || []
    }));
    await loadDataIntoTable('catalog_reports', transformedReports);
    
    // catalog_datasets
    const datasetsData = await loadJsonFile('catalog_datasets.json');
    const datasetsSchema = [
      { name: 'dataset_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'dataset_name', type: 'STRING', mode: 'REQUIRED' },
      { name: 'domain', type: 'STRING', mode: 'REQUIRED' },
      { name: 'last_refresh_ts', type: 'TIMESTAMP', mode: 'REQUIRED' },
      { name: 'refresh_frequency', type: 'STRING', mode: 'REQUIRED' },
      { name: 'certified_flag', type: 'BOOLEAN', mode: 'REQUIRED' },
      { name: 'source_system', type: 'STRING', mode: 'NULLABLE' },
      { name: 'row_count', type: 'INTEGER', mode: 'NULLABLE' },
      { name: 'field_count', type: 'INTEGER', mode: 'NULLABLE' },
      { name: 'key_fields', type: 'RECORD', mode: 'REPEATED', fields: [
        { name: 'field_name', type: 'STRING', mode: 'REQUIRED' },
        { name: 'field_type', type: 'STRING', mode: 'REQUIRED' },
        { name: 'description', type: 'STRING', mode: 'REQUIRED' }
      ]},
      { name: 'dataset_health', type: 'RECORD', mode: 'NULLABLE', fields: [
        { name: 'freshness_status', type: 'STRING', mode: 'REQUIRED' },
        { name: 'quality_score', type: 'INTEGER', mode: 'REQUIRED' },
        { name: 'known_issues', type: 'STRING', mode: 'REPEATED' }
      ]},
      { name: 'primary_use_cases', type: 'STRING', mode: 'REPEATED' },
      { name: 'connected_reports', type: 'RECORD', mode: 'REPEATED', fields: [
        { name: 'report_id', type: 'STRING', mode: 'REQUIRED' },
        { name: 'report_name', type: 'STRING', mode: 'REQUIRED' }
      ]},
      { name: 'data_owner', type: 'STRING', mode: 'NULLABLE' },
      { name: 'migration_readiness', type: 'RECORD', mode: 'NULLABLE', fields: [
        { name: 'readiness_score', type: 'INTEGER', mode: 'REQUIRED' },
        { name: 'risk_level', type: 'STRING', mode: 'REQUIRED' },
        { name: 'estimated_effort', type: 'STRING', mode: 'REQUIRED' },
        { name: 'key_blockers', type: 'STRING', mode: 'REPEATED' },
        { name: 'migration_window_recommendation', type: 'STRING', mode: 'NULLABLE' }
      ]},
      { name: 'pii_flag', type: 'BOOLEAN', mode: 'NULLABLE' },
      { name: 'downstream_systems', type: 'STRING', mode: 'REPEATED' },
      { name: 'schema_tables_count', type: 'INTEGER', mode: 'NULLABLE' },
      { name: 'null_rate', type: 'FLOAT', mode: 'NULLABLE' },
      { name: 'duplication_rate', type: 'FLOAT', mode: 'NULLABLE' },
      { name: 'migration_target_recommendation', type: 'STRING', mode: 'NULLABLE' },
      { name: 'migration_recommendation_reason', type: 'STRING', mode: 'NULLABLE' },
      { name: 'storage_type', type: 'STRING', mode: 'NULLABLE' }
    ];
    await createTable('catalog_datasets', datasetsSchema);
    const transformedDatasets = datasetsData.map(dataset => ({
      ...dataset,
      last_refresh_ts: new Date(dataset.last_refresh_ts),
      key_fields: dataset.key_fields || [],
      dataset_health: dataset.dataset_health || null,
      primary_use_cases: dataset.primary_use_cases || [],
      connected_reports: dataset.connected_reports || [],
      migration_readiness: dataset.migration_readiness || null,
      downstream_systems: dataset.downstream_systems || []
    }));
    await loadDataIntoTable('catalog_datasets', transformedDatasets);
    
    // ANALYTICAL TABLES
    console.log('\n📊 Creating Analytical Tables...');
    
    // churn_monthly
    const churnData = await loadJsonFile('churn_monthly.json');
    const churnSchema = [
      { name: 'month', type: 'STRING', mode: 'REQUIRED' },
      { name: 'month_id', type: 'INTEGER', mode: 'REQUIRED' },
      { name: 'churn_rate', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'change_vs_previous_month', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'subscribers_lost', type: 'INTEGER', mode: 'NULLABLE' },
      { name: 'total_base', type: 'INTEGER', mode: 'NULLABLE' },
      { name: 'voluntary_churn_pct', type: 'FLOAT', mode: 'NULLABLE' },
      { name: 'involuntary_churn_pct', type: 'FLOAT', mode: 'NULLABLE' }
    ];
    await createTable('churn_monthly', churnSchema);
    await loadDataIntoTable('churn_monthly', churnData);
    
    // take_rate_monthly_trend
    const takeRateData = await loadJsonFile('take_rate_monthly_trend.json');
    const takeRateSchema = [
      { name: 'month', type: 'STRING', mode: 'REQUIRED' },
      { name: 'takeRate', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'change_vs_previous_month', type: 'FLOAT', mode: 'REQUIRED' }
    ];
    await createTable('take_rate_monthly_trend', takeRateSchema);
    await loadDataIntoTable('take_rate_monthly_trend', takeRateData);
    
    // market_segment_distribution
    const marketSegData = await loadJsonFile('market_segment_distribution.json');
    const marketSegSchema = [
      { name: 'name', type: 'STRING', mode: 'REQUIRED' },
      { name: 'value', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'revenue', type: 'FLOAT', mode: 'NULLABLE' }
    ];
    await createTable('market_segment_distribution', marketSegSchema);
    await loadDataIntoTable('market_segment_distribution', marketSegData);
    
    // segment_performance_trend
    const segPerfData = await loadJsonFile('segment_performance_trend.json');
    const segPerfSchema = [
      { name: 'month', type: 'STRING', mode: 'REQUIRED' },
      { name: 'segmentShareIndex', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'marketPenetration', type: 'FLOAT', mode: 'REQUIRED' }
    ];
    await createTable('segment_performance_trend', segPerfSchema);
    await loadDataIntoTable('segment_performance_trend', segPerfData);
    
    // performance_by_region
    const perfByRegionData = await loadJsonFile('performance_by_region.json');
    const perfByRegionSchema = [
      { name: 'name', type: 'STRING', mode: 'REQUIRED' },
      { name: 'value', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'performance', type: 'FLOAT', mode: 'REQUIRED' }
    ];
    await createTable('performance_by_region', perfByRegionSchema);
    await loadDataIntoTable('performance_by_region', perfByRegionData);
    
    // revenue_by_device_group
    const revByDeviceData = await loadJsonFile('revenue_by_device_group.json');
    const revByDeviceSchema = [
      { name: 'device_group', type: 'STRING', mode: 'REQUIRED' },
      { name: 'revenue', type: 'FLOAT', mode: 'NULLABLE' },
      { name: 'percentage', type: 'FLOAT', mode: 'NULLABLE' }
    ];
    await createTable('revenue_by_device_group', revByDeviceSchema);
    await loadDataIntoTable('revenue_by_device_group', revByDeviceData);
    
    console.log('\n✅ All 18 tables created successfully!');
    console.log('\n📋 Summary:');
    console.log('- 4 Dimension tables');
    console.log('- 6 Fact tables');
    console.log('- 2 Catalog tables');
    console.log('- 6 Analytical tables');
    console.log('\n🌐 You can now view the complete dataset in your Google Cloud BigQuery console:');
    console.log(`https://console.cloud.google.com/bigquery?project=data-practice-472314`);
    
  } catch (error) {
    console.error('❌ Error creating complete dataset:', error);
    process.exit(1);
  }
}

// Run the creation script
createAllTables();
