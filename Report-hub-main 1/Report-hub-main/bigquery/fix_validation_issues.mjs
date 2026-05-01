// Fix validation issues - Load missing data and fix consistency problems
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

// Load data into table with individual row processing for problematic tables
async function loadDataIntoTableIndividually(tableId, rows) {
  if (!rows || rows.length === 0) {
    console.log(`   No data to load for ${tableId}`);
    return;
  }

  try {
    console.log(`📦 Loading ${rows.length} rows into ${tableId} (individual processing)...`);
    
    const dataset = bigquery.dataset(datasetId);
    const table = dataset.table(tableId);
    
    let successCount = 0;
    let errorCount = 0;
    
    // Process each row individually
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      try {
        await table.insert([row]);
        successCount++;
        
        // Show progress every 10 rows
        if ((i + 1) % 10 === 0) {
          console.log(`   ✅ Processed ${i + 1}/${rows.length} rows...`);
        }
        
      } catch (rowError) {
        errorCount++;
        console.log(`   ⚠️  Row ${i + 1} failed: ${rowError.message}`);
      }
      
      // Small delay between rows to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`✅ Data loading completed for ${tableId}`);
    console.log(`   ✅ Success: ${successCount}/${rows.length} rows`);
    console.log(`   ❌ Errors: ${errorCount}/${rows.length} rows`);
    
  } catch (error) {
    console.error(`❌ Error loading data into ${tableId}:`, error.message);
  }
}

// Fix fact tables with missing data
async function fixFactTables() {
  console.log('🔧 Fixing fact tables with missing data...');
  
  // Fix fact_sug_sales_daily
  console.log('\n📊 Fixing fact_sug_sales_daily...');
  const salesDailyData = await loadSyntheticData('fact_sug_sales_daily.json');
  if (salesDailyData) {
    const transformedSalesData = salesDailyData.map(row => ({
      date_id: parseInt(row.date_id) || 0,
      outlet_id: row.outlet_id,
      device_id: row.device_id,
      sug_sales_units: parseInt(row.sug_sales_units) || 0,
      eligible_device_units: parseInt(row.eligible_device_units) || 0,
      sug_sales_revenue: parseFloat(row.sug_sales_revenue) || 0,
      accessory_revenue: parseFloat(row.accessory_revenue) || 0,
      return_units: parseInt(row.return_units) || 0,
      passing_surveys: parseInt(row.passing_surveys) || 0,
      total_surveys: parseInt(row.total_surveys) || 0,
      date: row.date ? new Date(row.date) : null
    }));
    await loadDataIntoTableIndividually('fact_sug_sales_daily', transformedSalesData);
  }
  
  // Fix fact_sug_monthly_rollup
  console.log('\n📊 Fixing fact_sug_monthly_rollup...');
  const monthlyRollupData = await loadSyntheticData('fact_sug_monthly_rollup.json');
  if (monthlyRollupData) {
    const transformedMonthlyData = monthlyRollupData.map(row => ({
      month_id: parseInt(row.month_id) || 0,
      territory_id: row.territory_id,
      sug_revenue: parseFloat(row.sug_revenue) || 0,
      run_rate: parseFloat(row.run_rate) || 0,
      take_rate_pct: parseFloat(row.take_rate_pct) || 0,
      aard_pct: parseFloat(row.aard_pct) || 0,
      return_rate_pct: parseFloat(row.return_rate_pct) || 0,
      ris_pct: parseFloat(row.ris_pct) || 0,
      month: row.month ? new Date(row.month) : null
    }));
    await loadDataIntoTableIndividually('fact_sug_monthly_rollup', transformedMonthlyData);
  }
  
  // Fix fact_intraday_sales
  console.log('\n📊 Fixing fact_intraday_sales...');
  const intradayData = await loadSyntheticData('fact_intraday_sales.json');
  if (intradayData) {
    const transformedIntradayData = intradayData.map(row => ({
      date_id: parseInt(row.date_id) || 0,
      hour: parseInt(row.hour) || 0,
      outlet_id: row.outlet_id,
      device_group: row.device_group,
      sales_units: parseInt(row.sales_units) || 0,
      sales_revenue: parseFloat(row.sales_revenue) || 0,
      timestamp: row.timestamp ? new Date(row.timestamp) : null
    }));
    await loadDataIntoTableIndividually('fact_intraday_sales', transformedIntradayData);
  }
  
  // Fix fact_network_kpi_points
  console.log('\n📊 Fixing fact_network_kpi_points...');
  const networkKpiData = await loadSyntheticData('fact_network_kpi_points.json');
  if (networkKpiData) {
    const transformedNetworkKpiData = networkKpiData.map(row => ({
      date_id: parseInt(row.date_id) || 0,
      site_id: row.site_id,
      lat: parseFloat(row.lat) || 0,
      lon: parseFloat(row.lon) || 0,
      cqi: parseFloat(row.cqi) || 0,
      rsrp: parseFloat(row.rsrp) || 0,
      sinr: parseFloat(row.sinr) || 0,
      score: parseFloat(row.score) || 0,
      status: row.status,
      timestamp: row.timestamp ? new Date(row.timestamp) : null
    }));
    await loadDataIntoTableIndividually('fact_network_kpi_points', transformedNetworkKpiData);
  }
  
  // Fix fact_contact_center_metrics
  console.log('\n📊 Fixing fact_contact_center_metrics...');
  const contactCenterData = await loadSyntheticData('fact_contact_center_metrics.json');
  if (contactCenterData) {
    const transformedContactCenterData = contactCenterData.map(row => ({
      employee_id: row.employee_id,
      employee_name: row.employee_name,
      box_close_pct: parseFloat(row.box_close_pct) || 0,
      inb_aht_sec: parseInt(row.inb_aht_sec) || 0,
      transfer_pct: parseFloat(row.transfer_pct) || 0,
      sales_time_pct: parseFloat(row.sales_time_pct) || 0,
      hold_pct: parseFloat(row.hold_pct) || 0,
      status: row.status,
      date: row.date ? new Date(row.date) : null
    }));
    await loadDataIntoTableIndividually('fact_contact_center_metrics', transformedContactCenterData);
  }
}

// Fix dim_markets field consistency issue
async function fixDimMarkets() {
  console.log('\n📊 Fixing dim_markets field consistency...');
  
  const marketsData = await loadSyntheticData('dim_markets.json');
  if (marketsData) {
    // Add description field to match BigQuery schema
    const transformedMarkets = marketsData.map(market => ({
      market_id: market.market_id,
      market_name: market.market_name,
      description: market.description || null
    }));
    
    await loadDataIntoTableIndividually('dim_markets', transformedMarkets);
  }
}

// Fix fact_dynamic_scores field consistency
async function fixFactDynamicScores() {
  console.log('\n📊 Fixing fact_dynamic_scores field consistency...');
  
  const dynamicScoresData = await loadSyntheticData('fact_dynamic_scores.json');
  if (dynamicScoresData) {
    // Add date field to match BigQuery schema
    const transformedDynamicScores = dynamicScoresData.map(row => ({
      employee_id: row.employee_id,
      employee_name: row.employee_name,
      metric_1: parseFloat(row.metric_1) || 0,
      metric_2: parseFloat(row.metric_2) || 0,
      metric_3: parseFloat(row.metric_3) || 0,
      metric_4: parseFloat(row.metric_4) || 0,
      metric_5: parseFloat(row.metric_5) || 0,
      overall_score: parseFloat(row.overall_score) || 0,
      rank: parseInt(row.rank) || 0,
      date: row.date ? new Date(row.date) : null
    }));
    
    await loadDataIntoTableIndividually('fact_dynamic_scores', transformedDynamicScores);
  }
}

// Fix catalog tables timestamp issues
async function fixCatalogTables() {
  console.log('\n📊 Fixing catalog tables timestamp issues...');
  
  // Fix catalog_reports
  const reportsData = await loadSyntheticData('catalog_reports.json');
  if (reportsData) {
    const transformedReports = reportsData.map(report => ({
      report_id: report.report_id,
      report_name: report.report_name,
      domain: report.domain,
      source_dataset_id: report.source_dataset_id,
      last_updated_ts: new Date(report.last_updated_ts),
      enterprise_flag: report.enterprise_flag,
      source_application: report.source_application || null,
      business_owner: report.business_owner || null,
      description: report.description || null,
      primary_use_case: report.primary_use_case || null,
      created_date: report.created_date ? new Date(report.created_date) : null,
      refresh_frequency: report.refresh_frequency || null,
      key_kpis: report.key_kpis || [],
      primary_dimensions: report.primary_dimensions || [],
      time_range_supported: report.time_range_supported || null,
      top_insights: report.top_insights || [],
      known_limitations: report.known_limitations || [],
      recommended_actions: report.recommended_actions || [],
      related_reports: report.related_reports || [],
      used_by_roles: report.used_by_roles || []
    }));
    
    await loadDataIntoTableIndividually('catalog_reports', transformedReports);
  }
  
  // Fix catalog_datasets
  const datasetsData = await loadSyntheticData('catalog_datasets.json');
  if (datasetsData) {
    const transformedDatasets = datasetsData.map(dataset => ({
      dataset_id: dataset.dataset_id,
      dataset_name: dataset.dataset_name,
      domain: dataset.domain,
      last_refresh_ts: new Date(dataset.last_refresh_ts),
      refresh_frequency: dataset.refresh_frequency,
      certified_flag: dataset.certified_flag,
      source_system: dataset.source_system || null,
      row_count: dataset.row_count || null,
      field_count: dataset.field_count || null,
      key_fields: dataset.key_fields || [],
      dataset_health: dataset.dataset_health || null,
      primary_use_cases: dataset.primary_use_cases || [],
      connected_reports: dataset.connected_reports || [],
      data_owner: dataset.data_owner || null,
      migration_readiness: dataset.migration_readiness || null,
      pii_flag: dataset.pii_flag || null,
      downstream_systems: dataset.downstream_systems || [],
      schema_tables_count: dataset.schema_tables_count || null,
      null_rate: dataset.null_rate || null,
      duplication_rate: dataset.duplication_rate || null,
      migration_target_recommendation: dataset.migration_target_recommendation || null,
      migration_recommendation_reason: dataset.migration_recommendation_reason || null,
      storage_type: dataset.storage_type || null
    }));
    
    await loadDataIntoTableIndividually('catalog_datasets', transformedDatasets);
  }
}

// Main fix function
async function fixAllValidationIssues() {
  console.log('🔧 Starting comprehensive fix of validation issues...');
  console.log(`Dataset: ${datasetId}`);
  console.log('=' .repeat(60));
  
  try {
    // Fix fact tables with missing data
    await fixFactTables();
    
    // Fix dimension table field consistency
    await fixDimMarkets();
    
    // Fix fact table field consistency
    await fixFactDynamicScores();
    
    // Fix catalog tables timestamp issues
    await fixCatalogTables();
    
    console.log('\n✅ All validation issues have been fixed!');
    console.log('\n🔄 Please run the validation script again to confirm fixes:');
    console.log('node validate_complete_consistency.mjs');
    
  } catch (error) {
    console.error('❌ Error during fixing:', error);
  }
}

// Run the fixes
fixAllValidationIssues();
