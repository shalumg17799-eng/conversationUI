// Simple BigQuery Schema Fix Script
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

const datasetId = 'telecom_demo';

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

// Helper function to delay execution
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Create table with schema
async function createTableWithSchema(tableId, schema) {
  try {
    console.log(`🔄 Creating table: ${tableId}`);
    
    const dataset = bigquery.dataset(datasetId);
    
    // Drop existing table if it exists
    try {
      await dataset.table(tableId).delete();
      console.log(`   Dropped existing ${tableId}`);
      await delay(2000); // Wait for deletion to propagate
    } catch (error) {
      // Table might not exist, continue
      console.log(`   Table ${tableId} didn't exist or couldn't be dropped`);
    }
    
    // Create new table with correct schema
    const [table] = await dataset.createTable(tableId, {
      schema,
      location: 'US',
    });
    
    console.log(`   ✅ Successfully created ${tableId}`);
    await delay(3000); // Wait for creation to propagate
    return table;
  } catch (error) {
    console.error(`   ❌ Error creating ${tableId}:`, error.message);
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
    console.log(`   Loading ${rows.length} rows into ${tableId}...`);
    
    const dataset = bigquery.dataset(datasetId);
    const table = dataset.table(tableId);
    
    await table.insert(rows);
    console.log(`   ✅ Successfully loaded data into ${tableId}`);
    
  } catch (error) {
    console.error(`   ❌ Error loading data into ${tableId}:`, error.message);
    // Continue with other tables even if one fails
  }
}

// Fix dim_devices table
async function fixDimDevices() {
  console.log('\n🔧 Fixing dim_devices...');
  
  const syntheticData = await loadJsonFile('dim_devices.json');
  
  const schema = [
    { name: 'device_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'device_name', type: 'STRING', mode: 'REQUIRED' },
    { name: 'device_group', type: 'STRING', mode: 'REQUIRED' },
    { name: 'manufacturer', type: 'STRING', mode: 'REQUIRED' },
    { name: 'msrp', type: 'INTEGER', mode: 'NULLABLE' },
    { name: 'plan_eligible', type: 'BOOLEAN', mode: 'NULLABLE' }
  ];
  
  await createTableWithSchema('dim_devices', schema);
  await loadDataIntoTable('dim_devices', syntheticData);
}

// Fix dim_territories table
async function fixDimTerritories() {
  console.log('\n🔧 Fixing dim_territories...');
  
  const syntheticData = await loadJsonFile('dim_territories.json');
  
  const schema = [
    { name: 'territory_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'market_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'territory_name', type: 'STRING', mode: 'REQUIRED' }
  ];
  
  await createTableWithSchema('dim_territories', schema);
  await loadDataIntoTable('dim_territories', syntheticData);
}

// Fix dim_outlets table
async function fixDimOutlets() {
  console.log('\n🔧 Fixing dim_outlets...');
  
  const syntheticData = await loadJsonFile('dim_outlets.json');
  
  const schema = [
    { name: 'outlet_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'territory_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'outlet_name', type: 'STRING', mode: 'REQUIRED' },
    { name: 'city', type: 'STRING', mode: 'REQUIRED' },
    { name: 'state', type: 'STRING', mode: 'REQUIRED' },
    { name: 'outlet_type', type: 'STRING', mode: 'NULLABLE' }
  ];
  
  await createTableWithSchema('dim_outlets', schema);
  await loadDataIntoTable('dim_outlets', syntheticData);
}

// Fix catalog_reports table
async function fixCatalogReports() {
  console.log('\n🔧 Fixing catalog_reports...');
  
  const syntheticData = await loadJsonFile('catalog_reports.json');
  
  const schema = [
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
  
  // Transform data for BigQuery
  const transformedData = syntheticData.map(report => ({
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
  
  await createTableWithSchema('catalog_reports', schema);
  await loadDataIntoTable('catalog_reports', transformedData);
}

// Fix catalog_datasets table
async function fixCatalogDatasets() {
  console.log('\n🔧 Fixing catalog_datasets...');
  
  const syntheticData = await loadJsonFile('catalog_datasets.json');
  
  const schema = [
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
  
  // Transform data for BigQuery
  const transformedData = syntheticData.map(dataset => ({
    ...dataset,
    last_refresh_ts: new Date(dataset.last_refresh_ts),
    key_fields: dataset.key_fields || [],
    dataset_health: dataset.dataset_health || null,
    primary_use_cases: dataset.primary_use_cases || [],
    connected_reports: dataset.connected_reports || [],
    migration_readiness: dataset.migration_readiness || null,
    downstream_systems: dataset.downstream_systems || []
  }));
  
  await createTableWithSchema('catalog_datasets', schema);
  await loadDataIntoTable('catalog_datasets', transformedData);
}

// Fix churn_monthly table
async function fixChurnMonthly() {
  console.log('\n🔧 Fixing churn_monthly...');
  
  const syntheticData = await loadJsonFile('churn_monthly.json');
  
  const schema = [
    { name: 'month', type: 'STRING', mode: 'REQUIRED' },
    { name: 'month_id', type: 'INTEGER', mode: 'REQUIRED' },
    { name: 'churn_rate', type: 'FLOAT', mode: 'REQUIRED' },
    { name: 'change_vs_previous_month', type: 'FLOAT', mode: 'REQUIRED' },
    { name: 'subscribers_lost', type: 'INTEGER', mode: 'NULLABLE' },
    { name: 'total_base', type: 'INTEGER', mode: 'NULLABLE' },
    { name: 'voluntary_churn_pct', type: 'FLOAT', mode: 'NULLABLE' },
    { name: 'involuntary_churn_pct', type: 'FLOAT', mode: 'NULLABLE' }
  ];
  
  await createTableWithSchema('churn_monthly', schema);
  await loadDataIntoTable('churn_monthly', syntheticData);
}

// Fix take_rate_monthly_trend table
async function fixTakeRateTrend() {
  console.log('\n🔧 Fixing take_rate_monthly_trend...');
  
  const syntheticData = await loadJsonFile('take_rate_monthly_trend.json');
  
  const schema = [
    { name: 'month', type: 'STRING', mode: 'REQUIRED' },
    { name: 'takeRate', type: 'FLOAT', mode: 'REQUIRED' },
    { name: 'change_vs_previous_month', type: 'FLOAT', mode: 'REQUIRED' }
  ];
  
  await createTableWithSchema('take_rate_monthly_trend', schema);
  await loadDataIntoTable('take_rate_monthly_trend', syntheticData);
}

// Fix market_segment_distribution table
async function fixMarketSegmentDistribution() {
  console.log('\n🔧 Fixing market_segment_distribution...');
  
  const syntheticData = await loadJsonFile('market_segment_distribution.json');
  
  const schema = [
    { name: 'name', type: 'STRING', mode: 'REQUIRED' },
    { name: 'value', type: 'FLOAT', mode: 'REQUIRED' },
    { name: 'revenue', type: 'FLOAT', mode: 'NULLABLE' }
  ];
  
  await createTableWithSchema('market_segment_distribution', schema);
  await loadDataIntoTable('market_segment_distribution', syntheticData);
}

// Fix segment_performance_trend table
async function fixSegmentPerformanceTrend() {
  console.log('\n🔧 Fixing segment_performance_trend...');
  
  const syntheticData = await loadJsonFile('segment_performance_trend.json');
  
  const schema = [
    { name: 'month', type: 'STRING', mode: 'REQUIRED' },
    { name: 'segmentShareIndex', type: 'FLOAT', mode: 'REQUIRED' },
    { name: 'marketPenetration', type: 'FLOAT', mode: 'REQUIRED' }
  ];
  
  await createTableWithSchema('segment_performance_trend', schema);
  await loadDataIntoTable('segment_performance_trend', syntheticData);
}

// Fix performance_by_region table
async function fixPerformanceByRegion() {
  console.log('\n🔧 Fixing performance_by_region...');
  
  const syntheticData = await loadJsonFile('performance_by_region.json');
  
  const schema = [
    { name: 'name', type: 'STRING', mode: 'REQUIRED' },
    { name: 'value', type: 'FLOAT', mode: 'REQUIRED' },
    { name: 'performance', type: 'FLOAT', mode: 'REQUIRED' }
  ];
  
  await createTableWithSchema('performance_by_region', schema);
  await loadDataIntoTable('performance_by_region', syntheticData);
}

// Fix revenue_by_device_group table
async function fixRevenueByDeviceGroup() {
  console.log('\n🔧 Fixing revenue_by_device_group...');
  
  const syntheticData = await loadJsonFile('revenue_by_device_group.json');
  
  const schema = [
    { name: 'device_group', type: 'STRING', mode: 'REQUIRED' },
    { name: 'revenue', type: 'FLOAT', mode: 'NULLABLE' },
    { name: 'percentage', type: 'FLOAT', mode: 'NULLABLE' }
  ];
  
  await createTableWithSchema('revenue_by_device_group', schema);
  await loadDataIntoTable('revenue_by_device_group', syntheticData);
}

// Main fix function
async function fixAllTables() {
  try {
    console.log('🚀 Starting BigQuery schema fixes...');
    console.log(`Dataset: ${datasetId}`);
    console.log(`Project: data-practice-472314`);
    
    // Fix dimension tables
    await fixDimDevices();
    await fixDimTerritories();
    await fixDimOutlets();
    
    // Fix catalog tables
    await fixCatalogReports();
    await fixCatalogDatasets();
    
    // Fix analytical tables
    await fixChurnMonthly();
    await fixTakeRateTrend();
    await fixMarketSegmentDistribution();
    await fixSegmentPerformanceTrend();
    await fixPerformanceByRegion();
    await fixRevenueByDeviceGroup();
    
    console.log('\n✅ All schema fixes completed!');
    console.log('\n🌐 You can now view the corrected tables in your Google Cloud BigQuery console:');
    console.log(`https://console.cloud.google.com/bigquery?project=data-practice-472314`);
    
  } catch (error) {
    console.error('❌ Error fixing schemas:', error);
    process.exit(1);
  }
}

// Run the fix script
fixAllTables();
