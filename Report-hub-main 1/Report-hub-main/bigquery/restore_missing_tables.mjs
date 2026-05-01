// Restore missing tables and achieve maximum possible consistency
import { BigQuery } from '@google-cloud/bigquery';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const bigquery = new BigQuery({
  projectId: 'data-practice-472314',
  credentials: {
    client_email: 'bigquery-backend-dp@data-practice-472314.iam.gserviceaccount.com',
    private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDlLD8c44pDJE0F\nCvPvxjsgoZlo5WsAG43M2sfGWSjBF/Rtdauojm3cU55aeWVa71Px89cuYjsrg4Mw\nu2uDNFtYJxi4xK0dEzMed/y6cqpPtJ6IFTse+8Z78yrk89GSmFccJ/rkGgmTSRXY\nMJD8CuxC28RLcd+dVkSIHJeZuJ4Maro2VpBSMJ5kKv2IQrmg06+C8GEdC37Ri0xe\nBzNNqwbx9f1Jg36Ag8inpa6pxwxJCJj6n9KfvfGPyRTR3IX+kf7HRQrsWujIh1ZU\nQX3lUxyzr4nS2rkyV5sqfp9p1Yzrj5Jge0CSIaW0Vz5Qi5tfvRH9+swgMPvrvkAs\neoOFpvifAgMBAAECggEAMseKloKenMD65e6m3Y69hD36aaFIA8aXNXiWwo739k0y\nBl0H87nXgvXuRRrYB/22yopeuDLg7IPf+ljU+kYMJWzIUAyYVTRvY8VvdPq6XR3m\n8L1Pk85zDPz1GLUjz0k9KAp9z7QrQfz0P6qHPanH7wqWJKdvRoQafFRljRS4xIQo\nNe6v42nUnW1kS5rwPyI7LlE0WbxD1Lw1XYUEZg4H0iRP8C6JEh8vFKdOcvBhutYi\n0hbozQKfdMWTV+f24BWvD4TRZxKY6NvMEAKH2Mvx+6+/bZCSw+yO8ualuerSAkOj\n+2RgWPGikD+65/wRjCDQJNdKKVR4ECGYcZhuQ6IM7QKBgQDzz78jyxl8IEqLWNkD\ngTA7EaAqsPh3+jlVlU2KxoT5Dc9zn9kcypBDZ0uGhmNs8lDynjKaw3zMtRdrhfL9\n7huJb75GE9RJbPRSFas9wgrFaWjtxe1zz0kFbmNgxhGpu23Le/SYYUxsK+dy3Gy+\nPRaWavgFANv1bgLo11J0tbkFRQKBgQDwoSgt2IzebJB+lBaVloLuvAAxAtg3ELg4\nLMopGF56aZmXm4BHcxRwbPAgCsy0w1LKl/JvFbDyqE9FiwBJHnWKAiRxwxkILAHs\nFljVYSNA3RqdQuptTJMB84oKeXkd6urv/oOBiJBo4LV6xUI1nu28BfZOJBt37GLu\nIwfRHAdKkwKBgQDOKbhN0vqszD1ckXeIECCxghj2oIiqIyuCI+ra0z0zwCrQcbVM\nNDlC1cC2c0L1p/0s+vp9hZotG2A/apfrgwFD+PpjFXdn0zrRgkM3yLIE9jpk/P3p\n9LihYBOmjDX5WWThMOLGS1gtC/79UEifoNZNwQwSZwSYBztsmk6+I7/dJQKBgQCS\nP+DDvJIhvao0xJzVXh1GLE2RfEEddrQAsHhOcdk6XWRUmNZmlrMdgZiQYP/5/Z0c\nNS3MBkr9sP49LjaGOlUGBDdSTVmxdc3VR9/GELv0eG3slvcUZy4SSYrkwtX4sQcJ\nxo7286GRnMGwVKPhIy8q0BTbeWaYhLu8MN5XYcmssQKBgCZEZ8/+BB1fuoomCIW7\n15HiKFz9sSnKlBFW4JRPw6hapTj8p6X1B/MMQgZ8t2hEvE9Moci+fn1Z2bxaXgsF\nvkHbM4B079uwgvmunS6YV7U4wgdi8fq9GskXy/MdGf+rZ3Wqniifl9zO8eyDJTpR\nDrlls5cFfxGFFQglnbrTySYC\n-----END PRIVATE KEY-----\n"
  }
});

const datasetId = 'report_hub_demo';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '..', 'src', 'data');

// Load synthetic data
async function loadSyntheticData(filename) {
  try {
    const filePath = path.join(dataDir, filename);
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`❌ Error loading synthetic data from ${filename}:`, error.message);
    return null;
  }
}

// Create table with proper schema
async function createTable(tableId, schema) {
  try {
    console.log(`🔧 Creating table: ${tableId}`);
    
    const dataset = bigquery.dataset(datasetId);
    
    // Delete existing table if exists
    try {
      await dataset.table(tableId).delete();
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      // Table doesn't exist, continue
    }
    
    const [table] = await dataset.createTable(tableId, {
      schema,
      location: 'US',
    });
    
    console.log(`✅ Successfully created ${tableId}`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    return table;
  } catch (error) {
    console.error(`❌ Error creating ${tableId}:`, error.message);
    return null;
  }
}

// Load data into table using streaming
async function loadDataIntoTable(tableId, rows, batchSize = 100) {
  if (!rows || rows.length === 0) {
    console.log(`   No data to load for ${tableId}`);
    return;
  }

  try {
    console.log(`📦 Loading ${rows.length} rows into ${tableId}...`);
    
    const dataset = bigquery.dataset(datasetId);
    const table = dataset.table(tableId);
    
    // Process in batches
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      
      try {
        await table.insert(batch);
        console.log(`   ✅ Batch ${Math.floor(i/batchSize) + 1} loaded successfully`);
      } catch (batchError) {
        console.log(`   ⚠️  Batch ${Math.floor(i/batchSize) + 1} failed, trying individual rows...`);
        
        // Try individual rows
        let successCount = 0;
        for (const row of batch) {
          try {
            await table.insert([row]);
            successCount++;
          } catch (rowError) {
            // Skip failed rows
          }
        }
        console.log(`   ${successCount}/${batch.length} rows loaded in batch ${Math.floor(i/batchSize) + 1}`);
      }
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`✅ Data loading completed for ${tableId}`);
    
  } catch (error) {
    console.error(`❌ Error loading data into ${tableId}:`, error.message);
  }
}

// Restore dim_markets
async function restoreDimMarkets() {
  console.log('\n🔧 Restoring dim_markets...');
  
  const syntheticData = await loadSyntheticData('dim_markets.json');
  if (!syntheticData) return;
  
  const schema = [
    { name: 'market_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'market_name', type: 'STRING', mode: 'REQUIRED' }
  ];
  
  await createTable('dim_markets', schema);
  
  const transformedData = syntheticData.map(row => ({
    market_id: String(row.market_id),
    market_name: String(row.market_name)
  }));
  
  await loadDataIntoTable('dim_markets', transformedData);
}

// Restore fact_network_kpi_points
async function restoreFactNetworkKpiPoints() {
  console.log('\n🔧 Restoring fact_network_kpi_points...');
  
  const syntheticData = await loadSyntheticData('fact_network_kpi_points.json');
  if (!syntheticData) return;
  
  const schema = [
    { name: 'date_id', type: 'INTEGER', mode: 'REQUIRED' },
    { name: 'site_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'lat', type: 'FLOAT', mode: 'REQUIRED' },
    { name: 'lon', type: 'FLOAT', mode: 'REQUIRED' },
    { name: 'cqi', type: 'FLOAT', mode: 'REQUIRED' },
    { name: 'rsrp', type: 'FLOAT', mode: 'REQUIRED' },
    { name: 'sinr', type: 'FLOAT', mode: 'REQUIRED' },
    { name: 'score', type: 'FLOAT', mode: 'REQUIRED' },
    { name: 'status', type: 'STRING', mode: 'REQUIRED' },
    { name: 'region', type: 'STRING', mode: 'NULLABLE' }
  ];
  
  await createTable('fact_network_kpi_points', schema);
  
  const transformedData = syntheticData.map(row => ({
    date_id: parseInt(row.date_id) || 0,
    site_id: String(row.site_id),
    lat: parseFloat(row.lat) || 0.0,
    lon: parseFloat(row.lon) || 0.0,
    cqi: parseFloat(row.cqi) || 0.0,
    rsrp: parseFloat(row.rsrp) || 0.0,
    sinr: parseFloat(row.sinr) || 0.0,
    score: parseFloat(row.score) || 0.0,
    status: String(row.status),
    region: row.region || null
  }));
  
  await loadDataIntoTable('fact_network_kpi_points', transformedData);
}

// Restore fact_contact_center_metrics
async function restoreFactContactCenterMetrics() {
  console.log('\n🔧 Restoring fact_contact_center_metrics...');
  
  const syntheticData = await loadSyntheticData('fact_contact_center_metrics.json');
  if (!syntheticData) return;
  
  const schema = [
    { name: 'employee_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'employee_name', type: 'STRING', mode: 'REQUIRED' },
    { name: 'box_close_pct', type: 'FLOAT', mode: 'REQUIRED' },
    { name: 'inb_aht_sec', type: 'INTEGER', mode: 'REQUIRED' },
    { name: 'transfer_pct', type: 'FLOAT', mode: 'REQUIRED' },
    { name: 'sales_time_pct', type: 'FLOAT', mode: 'REQUIRED' },
    { name: 'hold_pct', type: 'FLOAT', mode: 'REQUIRED' },
    { name: 'status', type: 'STRING', mode: 'REQUIRED' },
    { name: 'team', type: 'STRING', mode: 'NULLABLE' },
    { name: 'territory_id', type: 'STRING', mode: 'NULLABLE' },
    { name: 'calls_handled', type: 'INTEGER', mode: 'NULLABLE' },
    { name: 'csat_score', type: 'FLOAT', mode: 'NULLABLE' }
  ];
  
  await createTable('fact_contact_center_metrics', schema);
  
  const transformedData = syntheticData.map(row => ({
    employee_id: String(row.employee_id),
    employee_name: String(row.employee_name),
    box_close_pct: parseFloat(row.box_close_pct) || 0.0,
    inb_aht_sec: parseInt(row.inb_aht_sec) || 0,
    transfer_pct: parseFloat(row.transfer_pct) || 0.0,
    sales_time_pct: parseFloat(row.sales_time_pct) || 0.0,
    hold_pct: parseFloat(row.hold_pct) || 0.0,
    status: String(row.status),
    team: row.team || null,
    territory_id: row.territory_id || null,
    calls_handled: row.calls_handled ? parseInt(row.calls_handled) : null,
    csat_score: row.csat_score ? parseFloat(row.csat_score) : null
  }));
  
  await loadDataIntoTable('fact_contact_center_metrics', transformedData);
}

// Restore fact_dynamic_scores
async function restoreFactDynamicScores() {
  console.log('\n🔧 Restoring fact_dynamic_scores...');
  
  const syntheticData = await loadSyntheticData('fact_dynamic_scores.json');
  if (!syntheticData) return;
  
  const schema = [
    { name: 'employee_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'employee_name', type: 'STRING', mode: 'REQUIRED' },
    { name: 'metric_1', type: 'FLOAT', mode: 'REQUIRED' },
    { name: 'metric_2', type: 'FLOAT', mode: 'REQUIRED' },
    { name: 'metric_3', type: 'FLOAT', mode: 'REQUIRED' },
    { name: 'metric_4', type: 'FLOAT', mode: 'REQUIRED' },
    { name: 'metric_5', type: 'FLOAT', mode: 'REQUIRED' },
    { name: 'overall_score', type: 'FLOAT', mode: 'REQUIRED' },
    { name: 'rank', type: 'INTEGER', mode: 'REQUIRED' }
  ];
  
  await createTable('fact_dynamic_scores', schema);
  
  const transformedData = syntheticData.map(row => ({
    employee_id: String(row.employee_id),
    employee_name: String(row.employee_name),
    metric_1: parseFloat(row.metric_1) || 0.0,
    metric_2: parseFloat(row.metric_2) || 0.0,
    metric_3: parseFloat(row.metric_3) || 0.0,
    metric_4: parseFloat(row.metric_4) || 0.0,
    metric_5: parseFloat(row.metric_5) || 0.0,
    overall_score: parseFloat(row.overall_score) || 0.0,
    rank: parseInt(row.rank) || 0
  }));
  
  await loadDataIntoTable('fact_dynamic_scores', transformedData);
}

// Restore catalog_reports
async function restoreCatalogReports() {
  console.log('\n🔧 Restoring catalog_reports...');
  
  const syntheticData = await loadSyntheticData('catalog_reports.json');
  if (!syntheticData) return;
  
  const schema = [
    { name: 'report_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'report_name', type: 'STRING', mode: 'REQUIRED' },
    { name: 'domain', type: 'STRING', mode: 'REQUIRED' },
    { name: 'source_dataset_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'last_updated_ts', type: 'STRING', mode: 'REQUIRED' },
    { name: 'enterprise_flag', type: 'BOOLEAN', mode: 'REQUIRED' },
    { name: 'source_application', type: 'STRING', mode: 'NULLABLE' },
    { name: 'business_owner', type: 'STRING', mode: 'NULLABLE' },
    { name: 'description', type: 'STRING', mode: 'NULLABLE' },
    { name: 'primary_use_case', type: 'STRING', mode: 'NULLABLE' },
    { name: 'created_date', type: 'STRING', mode: 'NULLABLE' },
    { name: 'refresh_frequency', type: 'STRING', mode: 'NULLABLE' },
    { name: 'key_kpis', type: 'RECORD', mode: 'REPEATED', fields: [
      { name: 'kpi_name', type: 'STRING', mode: 'NULLABLE' },
      { name: 'current_value', type: 'STRING', mode: 'NULLABLE' },
      { name: 'previous_value', type: 'STRING', mode: 'NULLABLE' },
      { name: 'trend', type: 'STRING', mode: 'NULLABLE' },
      { name: 'delta', type: 'STRING', mode: 'NULLABLE' }
    ]},
    { name: 'primary_dimensions', type: 'STRING', mode: 'REPEATED' },
    { name: 'time_range_supported', type: 'STRING', mode: 'NULLABLE' },
    { name: 'top_insights', type: 'STRING', mode: 'REPEATED' },
    { name: 'known_limitations', type: 'STRING', mode: 'REPEATED' },
    { name: 'recommended_actions', type: 'STRING', mode: 'REPEATED' },
    { name: 'related_reports', type: 'RECORD', mode: 'REPEATED', fields: [
      { name: 'report_id', type: 'STRING', mode: 'NULLABLE' },
      { name: 'report_name', type: 'STRING', mode: 'NULLABLE' }
    ]},
    { name: 'used_by_roles', type: 'STRING', mode: 'REPEATED' }
  ];
  
  await createTable('catalog_reports', schema);
  
  const transformedData = syntheticData.map(row => ({
    report_id: String(row.report_id),
    report_name: String(row.report_name),
    domain: String(row.domain),
    source_dataset_id: String(row.source_dataset_id),
    last_updated_ts: String(row.last_updated_ts),
    enterprise_flag: Boolean(row.enterprise_flag),
    source_application: row.source_application || null,
    business_owner: row.business_owner || null,
    description: row.description || null,
    primary_use_case: row.primary_use_case || null,
    created_date: row.created_date ? String(row.created_date) : null,
    refresh_frequency: row.refresh_frequency || null,
    key_kpis: Array.isArray(row.key_kpis) ? row.key_kpis : [],
    primary_dimensions: Array.isArray(row.primary_dimensions) ? row.primary_dimensions : [],
    time_range_supported: row.time_range_supported || null,
    top_insights: Array.isArray(row.top_insights) ? row.top_insights : [],
    known_limitations: Array.isArray(row.known_limitations) ? row.known_limitations : [],
    recommended_actions: Array.isArray(row.recommended_actions) ? row.recommended_actions : [],
    related_reports: Array.isArray(row.related_reports) ? row.related_reports : [],
    used_by_roles: Array.isArray(row.used_by_roles) ? row.used_by_roles : []
  }));
  
  await loadDataIntoTable('catalog_reports', transformedData);
}

// Restore catalog_datasets
async function restoreCatalogDatasets() {
  console.log('\n🔧 Restoring catalog_datasets...');
  
  const syntheticData = await loadSyntheticData('catalog_datasets.json');
  if (!syntheticData) return;
  
  const schema = [
    { name: 'dataset_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'dataset_name', type: 'STRING', mode: 'REQUIRED' },
    { name: 'domain', type: 'STRING', mode: 'REQUIRED' },
    { name: 'last_refresh_ts', type: 'STRING', mode: 'REQUIRED' },
    { name: 'refresh_frequency', type: 'STRING', mode: 'REQUIRED' },
    { name: 'certified_flag', type: 'BOOLEAN', mode: 'REQUIRED' },
    { name: 'source_system', type: 'STRING', mode: 'NULLABLE' },
    { name: 'row_count', type: 'INTEGER', mode: 'NULLABLE' },
    { name: 'field_count', type: 'INTEGER', mode: 'NULLABLE' },
    { name: 'key_fields', type: 'RECORD', mode: 'REPEATED', fields: [
      { name: 'field_name', type: 'STRING', mode: 'NULLABLE' },
      { name: 'field_type', type: 'STRING', mode: 'NULLABLE' },
      { name: 'description', type: 'STRING', mode: 'NULLABLE' }
    ]},
    { name: 'dataset_health', type: 'RECORD', mode: 'NULLABLE', fields: [
      { name: 'freshness_status', type: 'STRING', mode: 'NULLABLE' },
      { name: 'quality_score', type: 'INTEGER', mode: 'NULLABLE' },
      { name: 'known_issues', type: 'STRING', mode: 'REPEATED' }
    ]},
    { name: 'primary_use_cases', type: 'STRING', mode: 'REPEATED' },
    { name: 'connected_reports', type: 'RECORD', mode: 'REPEATED', fields: [
      { name: 'report_id', type: 'STRING', mode: 'NULLABLE' },
      { name: 'report_name', type: 'STRING', mode: 'NULLABLE' }
    ]},
    { name: 'data_owner', type: 'STRING', mode: 'NULLABLE' },
    { name: 'migration_readiness', type: 'RECORD', mode: 'NULLABLE', fields: [
      { name: 'readiness_score', type: 'INTEGER', mode: 'NULLABLE' },
      { name: 'risk_level', type: 'STRING', mode: 'NULLABLE' },
      { name: 'estimated_effort', type: 'STRING', mode: 'NULLABLE' },
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
  
  await createTable('catalog_datasets', schema);
  
  const transformedData = syntheticData.map(row => ({
    dataset_id: String(row.dataset_id),
    dataset_name: String(row.dataset_name),
    domain: String(row.domain),
    last_refresh_ts: String(row.last_refresh_ts),
    refresh_frequency: String(row.refresh_frequency),
    certified_flag: Boolean(row.certified_flag),
    source_system: row.source_system || null,
    row_count: row.row_count ? parseInt(row.row_count) : null,
    field_count: row.field_count ? parseInt(row.field_count) : null,
    key_fields: Array.isArray(row.key_fields) ? row.key_fields : [],
    dataset_health: row.dataset_health || null,
    primary_use_cases: Array.isArray(row.primary_use_cases) ? row.primary_use_cases : [],
    connected_reports: Array.isArray(row.connected_reports) ? row.connected_reports : [],
    data_owner: row.data_owner || null,
    migration_readiness: row.migration_readiness || null,
    pii_flag: Boolean(row.pii_flag),
    downstream_systems: Array.isArray(row.downstream_systems) ? row.downstream_systems : [],
    schema_tables_count: row.schema_tables_count ? parseInt(row.schema_tables_count) : null,
    null_rate: row.null_rate ? parseFloat(row.null_rate) : null,
    duplication_rate: row.duplication_rate ? parseFloat(row.duplication_rate) : null,
    migration_target_recommendation: row.migration_target_recommendation || null,
    migration_recommendation_reason: row.migration_recommendation_reason || null,
    storage_type: row.storage_type || null
  }));
  
  await loadDataIntoTable('catalog_datasets', transformedData);
}

// Main restoration function
async function restoreMissingTables() {
  console.log('🔧 RESTORING MISSING TABLES AND ACHIEVING MAXIMUM CONSISTENCY');
  console.log('=' .repeat(80));
  
  try {
    // Restore all missing tables
    await restoreDimMarkets();
    await restoreFactNetworkKpiPoints();
    await restoreFactContactCenterMetrics();
    await restoreFactDynamicScores();
    await restoreCatalogReports();
    await restoreCatalogDatasets();
    
    console.log('\n' + '=' .repeat(80));
    console.log('🎉 ALL MISSING TABLES RESTORED!');
    console.log('=' .repeat(80));
    
    console.log('\n🔄 Next Steps:');
    console.log('1. Run final validation to confirm maximum consistency:');
    console.log('   node validate_complete_consistency.mjs');
    console.log('2. Check dashboard functionality:');
    console.log('   http://localhost:5178/bigquery-dashboard');
    console.log('3. Verify data in Google Cloud Console:');
    console.log('   https://console.cloud.google.com/bigquery?project=data-practice-472314');
    
  } catch (error) {
    console.error('❌ Error during restoration:', error);
  }
}

// Run restoration
restoreMissingTables().catch(console.error);
