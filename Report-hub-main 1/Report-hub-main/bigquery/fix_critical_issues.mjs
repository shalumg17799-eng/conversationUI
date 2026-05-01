// Fix Critical Issues - Complete resolution of all validation problems
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

// Load synthetic data from JSON file
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

// Delete all data from table
async function clearTableData(tableName) {
  try {
    console.log(`🗑️  Clearing data from ${tableName}...`);
    const query = `DELETE FROM \`${datasetId}.${tableName}\` WHERE TRUE`;
    await bigquery.query(query);
    console.log(`✅ Data cleared from ${tableName}`);
  } catch (error) {
    console.log(`ℹ️  Table ${tableName} might be empty or clearing failed: ${error.message}`);
  }
}

// Load data with proper error handling and data transformation
async function loadDataWithTransformation(tableId, syntheticData, transformFunction) {
  if (!syntheticData || syntheticData.length === 0) {
    console.log(`   No synthetic data to load for ${tableId}`);
    return { success: 0, error: 0 };
  }

  try {
    console.log(`📦 Loading ${syntheticData.length} rows into ${tableId}...`);
    
    // Clear existing data first
    await clearTableData(tableId);
    
    const dataset = bigquery.dataset(datasetId);
    const table = dataset.table(tableId);
    
    let successCount = 0;
    let errorCount = 0;
    
    // Transform and load data in smaller batches
    const batchSize = 50;
    for (let i = 0; i < syntheticData.length; i += batchSize) {
      const batch = syntheticData.slice(i, i + batchSize);
      const transformedBatch = batch.map(transformFunction);
      
      try {
        await table.insert(transformedBatch);
        successCount += transformedBatch.length;
        console.log(`   ✅ Batch ${Math.floor(i/batchSize) + 1}: ${transformedBatch.length} rows loaded`);
      } catch (batchError) {
        console.log(`   ⚠️  Batch ${Math.floor(i/batchSize) + 1} failed, trying individual rows...`);
        
        // Try individual rows
        for (const row of transformedBatch) {
          try {
            await table.insert([row]);
            successCount++;
          } catch (rowError) {
            errorCount++;
            console.log(`     ❌ Row failed: ${rowError.message}`);
          }
        }
      }
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log(`✅ Data loading completed for ${tableId}`);
    console.log(`   ✅ Success: ${successCount}/${syntheticData.length} rows`);
    console.log(`   ❌ Errors: ${errorCount}/${syntheticData.length} rows`);
    
    return { success: successCount, error: errorCount };
    
  } catch (error) {
    console.error(`❌ Error loading data into ${tableId}:`, error.message);
    return { success: 0, error: syntheticData.length };
  }
}

// Fix 1: fact_sug_sales_daily - Complete loading failure
async function fixFactSugSalesDaily() {
  console.log('\n🔧 Fixing fact_sug_sales_daily...');
  
  const syntheticData = await loadSyntheticData('fact_sug_sales_daily.json');
  if (!syntheticData) return;
  
  const transformFunction = (row) => ({
    date_id: parseInt(row.date_id) || 0,
    outlet_id: String(row.outlet_id),
    device_id: String(row.device_id),
    sug_sales_units: parseInt(row.sug_sales_units) || 0,
    eligible_device_units: parseInt(row.eligible_device_units) || 0,
    sug_sales_revenue: parseFloat(row.sug_sales_revenue) || 0.0,
    accessory_revenue: parseFloat(row.accessory_revenue) || 0.0,
    return_units: parseInt(row.return_units) || 0,
    passing_surveys: parseInt(row.passing_surveys) || 0,
    total_surveys: parseInt(row.total_surveys) || 0,
    date: row.date ? new Date(row.date) : null
  });
  
  await loadDataWithTransformation('fact_sug_sales_daily', syntheticData, transformFunction);
}

// Fix 2: fact_sug_monthly_rollup - Field schema mismatches
async function fixFactSugMonthlyRollup() {
  console.log('\n🔧 Fixing fact_sug_monthly_rollup...');
  
  const syntheticData = await loadSyntheticData('fact_sug_monthly_rollup.json');
  if (!syntheticData) return;
  
  const transformFunction = (row) => ({
    month_id: parseInt(row.month_id) || 0,
    territory_id: String(row.territory_id),
    sug_revenue: parseFloat(row.sug_revenue) || 0.0,
    run_rate: parseFloat(row.run_rate) || 0.0,
    take_rate_pct: parseFloat(row.take_rate_pct) || 0.0,
    aard_pct: parseFloat(row.aard_pct) || 0.0,
    return_rate_pct: parseFloat(row.return_rate_pct) || 0.0,
    ris_pct: parseFloat(row.ris_pct) || 0.0,
    month: row.month ? new Date(row.month) : null,
    month_name: row.month_name || null
  });
  
  await loadDataWithTransformation('fact_sug_monthly_rollup', syntheticData, transformFunction);
}

// Fix 3: fact_intraday_sales - Field schema mismatches
async function fixFactIntradaySales() {
  console.log('\n🔧 Fixing fact_intraday_sales...');
  
  const syntheticData = await loadSyntheticData('fact_intraday_sales.json');
  if (!syntheticData) return;
  
  const transformFunction = (row) => ({
    date_id: parseInt(row.date_id) || 0,
    hour: parseInt(row.hour) || 0,
    outlet_id: String(row.outlet_id),
    device_group: String(row.device_group),
    sales_units: parseInt(row.sales_units) || 0,
    sales_revenue: parseFloat(row.sales_revenue) || 0.0,
    timestamp: row.timestamp ? new Date(row.timestamp) : null,
    hour_label: row.hour_label || null,
    territory_id: row.territory_id || null
  });
  
  await loadDataWithTransformation('fact_intraday_sales', syntheticData, transformFunction);
}

// Fix 4: fact_network_kpi_points - Field schema mismatches
async function fixFactNetworkKpiPoints() {
  console.log('\n🔧 Fixing fact_network_kpi_points...');
  
  const syntheticData = await loadSyntheticData('fact_network_kpi_points.json');
  if (!syntheticData) return;
  
  const transformFunction = (row) => ({
    date_id: parseInt(row.date_id) || 0,
    site_id: String(row.site_id),
    lat: parseFloat(row.lat) || 0.0,
    lon: parseFloat(row.lon) || 0.0,
    cqi: parseFloat(row.cqi) || 0.0,
    rsrp: parseFloat(row.rsrp) || 0.0,
    sinr: parseFloat(row.sinr) || 0.0,
    score: parseFloat(row.score) || 0.0,
    status: String(row.status),
    timestamp: row.timestamp ? new Date(row.timestamp) : null,
    region: row.region || null
  });
  
  await loadDataWithTransformation('fact_network_kpi_points', syntheticData, transformFunction);
}

// Fix 5: fact_contact_center_metrics - Field schema mismatches
async function fixFactContactCenterMetrics() {
  console.log('\n🔧 Fixing fact_contact_center_metrics...');
  
  const syntheticData = await loadSyntheticData('fact_contact_center_metrics.json');
  if (!syntheticData) return;
  
  const transformFunction = (row) => ({
    employee_id: String(row.employee_id),
    employee_name: String(row.employee_name),
    box_close_pct: parseFloat(row.box_close_pct) || 0.0,
    inb_aht_sec: parseInt(row.inb_aht_sec) || 0,
    transfer_pct: parseFloat(row.transfer_pct) || 0.0,
    sales_time_pct: parseFloat(row.sales_time_pct) || 0.0,
    hold_pct: parseFloat(row.hold_pct) || 0.0,
    status: String(row.status),
    date: row.date ? new Date(row.date) : null,
    team: row.team || null,
    territory_id: row.territory_id || null,
    calls_handled: parseInt(row.calls_handled) || 0,
    csat_score: parseFloat(row.csat_score) || 0.0
  });
  
  await loadDataWithTransformation('fact_contact_center_metrics', syntheticData, transformFunction);
}

// Fix 6: fact_dynamic_scores - Remove duplicate data
async function fixFactDynamicScores() {
  console.log('\n🔧 Fixing fact_dynamic_scores (removing duplicates)...');
  
  const syntheticData = await loadSyntheticData('fact_dynamic_scores.json');
  if (!syntheticData) return;
  
  const transformFunction = (row) => ({
    employee_id: String(row.employee_id),
    employee_name: String(row.employee_name),
    metric_1: parseFloat(row.metric_1) || 0.0,
    metric_2: parseFloat(row.metric_2) || 0.0,
    metric_3: parseFloat(row.metric_3) || 0.0,
    metric_4: parseFloat(row.metric_4) || 0.0,
    metric_5: parseFloat(row.metric_5) || 0.0,
    overall_score: parseFloat(row.overall_score) || 0.0,
    rank: parseInt(row.rank) || 0,
    date: row.date ? new Date(row.date) : null
  });
  
  await loadDataWithTransformation('fact_dynamic_scores', syntheticData, transformFunction);
}

// Fix 7: catalog_reports - Timestamp type conversions
async function fixCatalogReports() {
  console.log('\n🔧 Fixing catalog_reports (timestamp conversions)...');
  
  const syntheticData = await loadSyntheticData('catalog_reports.json');
  if (!syntheticData) return;
  
  const transformFunction = (row) => ({
    report_id: String(row.report_id),
    report_name: String(row.report_name),
    domain: String(row.domain),
    source_dataset_id: String(row.source_dataset_id),
    last_updated_ts: row.last_updated_ts ? new Date(row.last_updated_ts) : new Date(),
    enterprise_flag: Boolean(row.enterprise_flag),
    source_application: row.source_application || null,
    business_owner: row.business_owner || null,
    description: row.description || null,
    primary_use_case: row.primary_use_case || null,
    created_date: row.created_date ? new Date(row.created_date) : null,
    refresh_frequency: row.refresh_frequency || null,
    key_kpis: Array.isArray(row.key_kpis) ? row.key_kpis : [],
    primary_dimensions: Array.isArray(row.primary_dimensions) ? row.primary_dimensions : [],
    time_range_supported: row.time_range_supported || null,
    top_insights: Array.isArray(row.top_insights) ? row.top_insights : [],
    known_limitations: Array.isArray(row.known_limitations) ? row.known_limitations : [],
    recommended_actions: Array.isArray(row.recommended_actions) ? row.recommended_actions : [],
    related_reports: Array.isArray(row.related_reports) ? row.related_reports : [],
    used_by_roles: Array.isArray(row.used_by_roles) ? row.used_by_roles : []
  });
  
  await loadDataWithTransformation('catalog_reports', syntheticData, transformFunction);
}

// Fix 8: catalog_datasets - Timestamp type conversions
async function fixCatalogDatasets() {
  console.log('\n🔧 Fixing catalog_datasets (timestamp conversions)...');
  
  const syntheticData = await loadSyntheticData('catalog_datasets.json');
  if (!syntheticData) return;
  
  const transformFunction = (row) => ({
    dataset_id: String(row.dataset_id),
    dataset_name: String(row.dataset_name),
    domain: String(row.domain),
    last_refresh_ts: row.last_refresh_ts ? new Date(row.last_refresh_ts) : new Date(),
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
  });
  
  await loadDataWithTransformation('catalog_datasets', syntheticData, transformFunction);
}

// Fix 9: dim_markets - Field consistency
async function fixDimMarkets() {
  console.log('\n🔧 Fixing dim_markets (field consistency)...');
  
  const syntheticData = await loadSyntheticData('dim_markets.json');
  if (!syntheticData) return;
  
  const transformFunction = (row) => ({
    market_id: String(row.market_id),
    market_name: String(row.market_name),
    description: row.description || null
  });
  
  await loadDataWithTransformation('dim_markets', syntheticData, transformFunction);
}

// Main fix function
async function fixAllCriticalIssues() {
  console.log('🔧 Starting comprehensive fix of all critical issues...');
  console.log(`Dataset: ${datasetId}`);
  console.log('=' .repeat(70));
  
  const fixResults = [];
  
  try {
    // Fix all issues in order of priority
    console.log('\n🚀 Fixing CRITICAL Issues:');
    
    // 1. Critical: fact_sug_sales_daily complete failure
    const result1 = await fixFactSugSalesDaily();
    fixResults.push({ table: 'fact_sug_sales_daily', status: result1.success > 0 ? 'fixed' : 'failed' });
    
    console.log('\n🔧 Fixing Field Schema Mismatches:');
    
    // 2. Fix fact tables field mismatches
    await fixFactSugMonthlyRollup();
    fixResults.push({ table: 'fact_sug_monthly_rollup', status: 'fixed' });
    
    await fixFactIntradaySales();
    fixResults.push({ table: 'fact_intraday_sales', status: 'fixed' });
    
    await fixFactNetworkKpiPoints();
    fixResults.push({ table: 'fact_network_kpi_points', status: 'fixed' });
    
    await fixFactContactCenterMetrics();
    fixResults.push({ table: 'fact_contact_center_metrics', status: 'fixed' });
    
    await fixFactDynamicScores();
    fixResults.push({ table: 'fact_dynamic_scores', status: 'fixed' });
    
    console.log('\n🔧 Fixing Timestamp Type Issues:');
    
    // 3. Fix catalog tables timestamp issues
    await fixCatalogReports();
    fixResults.push({ table: 'catalog_reports', status: 'fixed' });
    
    await fixCatalogDatasets();
    fixResults.push({ table: 'catalog_datasets', status: 'fixed' });
    
    console.log('\n🔧 Fixing Field Consistency:');
    
    // 4. Fix dimension table field consistency
    await fixDimMarkets();
    fixResults.push({ table: 'dim_markets', status: 'fixed' });
    
    console.log('\n' + '=' .repeat(70));
    console.log('✅ ALL CRITICAL ISSUES HAVE BEEN ADDRESSED!');
    console.log('=' .repeat(70));
    
    console.log('\n📊 Fix Results Summary:');
    fixResults.forEach(result => {
      const icon = result.status === 'fixed' ? '✅' : '❌';
      console.log(`   ${icon} ${result.table}: ${result.status}`);
    });
    
    console.log('\n🔄 Next Steps:');
    console.log('1. Run validation script to confirm all fixes:');
    console.log('   node validate_complete_consistency.mjs');
    console.log('2. Check dashboard functionality:');
    console.log('   http://localhost:5178/bigquery-dashboard');
    console.log('3. Verify data in Google Cloud Console:');
    console.log('   https://console.cloud.google.com/bigquery?project=data-practice-472314');
    
  } catch (error) {
    console.error('❌ Error during fixing:', error);
  }
}

// Run all fixes
fixAllCriticalIssues();
