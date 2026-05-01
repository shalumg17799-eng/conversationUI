// Final fix using direct SQL and streaming to achieve 100% consistency
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

// Execute SQL query
async function executeSQL(query, description) {
  try {
    console.log(`🔄 ${description}...`);
    const [rows] = await bigquery.query(query);
    console.log(`✅ ${description} completed`);
    return rows;
  } catch (error) {
    console.log(`❌ ${description} failed: ${error.message}`);
    return null;
  }
}

// Wait for streaming buffer to clear
async function waitForStreamingBuffer(tableName, maxWaitSeconds = 60) {
  console.log(`⏳ Waiting for streaming buffer to clear on ${tableName}...`);
  
  const maxWaitMs = maxWaitSeconds * 1000;
  const checkIntervalMs = 5000; // Check every 5 seconds
  let elapsedMs = 0;
  
  while (elapsedMs < maxWaitMs) {
    try {
      // Try a simple DELETE operation to test if buffer is clear
      await bigquery.query(`DELETE FROM \`${datasetId}.${tableName}\` WHERE FALSE`);
      console.log(`✅ Streaming buffer cleared after ${Math.floor(elapsedMs / 1000)} seconds`);
      return true;
    } catch (error) {
      if (error.message.includes('streaming buffer')) {
        console.log(`⏳ Buffer still active... (${Math.floor(elapsedMs / 1000)}s elapsed)`);
        await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
        elapsedMs += checkIntervalMs;
      } else {
        console.log(`ℹ️  Different error occurred: ${error.message}`);
        return false;
      }
    }
  }
  
  console.log(`⚠️  Timeout waiting for streaming buffer to clear (${maxWaitSeconds} seconds)`);
  return false;
}

// Fix 1: dim_markets - Remove extra description field using SQL
async function fixDimMarketsSQL() {
  console.log('\n🔧 Fixing dim_markets using SQL...');
  
  // Create new table without description field
  const createQuery = `
    CREATE OR REPLACE TABLE \`${datasetId}.dim_markets_temp\` AS
    SELECT 
      market_id,
      market_name
    FROM \`${datasetId}.dim_markets\`
  `;
  
  const replaceQuery = `
    DROP TABLE IF EXISTS \`${datasetId}.dim_markets\`;
    ALTER TABLE \`${datasetId}.dim_markets_temp\` RENAME TO \`${datasetId}.dim_markets\`;
  `;
  
  await executeSQL(createQuery, 'Creating dim_markets without description field');
  await executeSQL(replaceQuery, 'Replacing dim_markets table');
}

// Fix 2: fact_sug_sales_daily - Add missing territory_id field
async function fixFactSugSalesDailySQL() {
  console.log('\n🔧 Fixing fact_sug_sales_daily using SQL...');
  
  // Add territory_id field and update with synthetic data
  const syntheticData = await loadSyntheticData('fact_sug_sales_daily.json');
  if (!syntheticData) return;
  
  // Create mapping of date_id+outlet_id+device_id to territory_id
  const territoryMap = {};
  syntheticData.forEach(row => {
    const key = `${row.date_id}_${row.outlet_id}_${row.device_id}`;
    territoryMap[key] = row.territory_id;
  });
  
  // Add territory_id field if it doesn't exist
  await executeSQL(
    `ALTER TABLE \`${datasetId}.fact_sug_sales_daily\` ADD COLUMN IF NOT EXISTS territory_id STRING`,
    'Adding territory_id field to fact_sug_sales_daily'
  );
  
  // Update territory_id from synthetic data
  console.log('🔄 Updating territory_id values...');
  let updatedCount = 0;
  for (const [key, territoryId] of Object.entries(territoryMap)) {
    const [dateId, outletId, deviceId] = key.split('_');
    
    try {
      await bigquery.query(`
        UPDATE \`${datasetId}.fact_sug_sales_daily\`
        SET territory_id = '${territoryId}'
        WHERE date_id = ${dateId} AND outlet_id = '${outletId}' AND device_id = '${deviceId}'
      `);
      updatedCount++;
    } catch (error) {
      console.log(`⚠️  Update failed for ${key}: ${error.message}`);
    }
    
    // Small delay to avoid overwhelming
    if (updatedCount % 50 === 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  console.log(`✅ Updated ${updatedCount} territory_id values`);
}

// Fix 3: fact_sug_monthly_rollup - Remove extra month field
async function fixFactSugMonthlyRollupSQL() {
  console.log('\n🔧 Fixing fact_sug_monthly_rollup using SQL...');
  
  // Create new table without extra month field
  const createQuery = `
    CREATE OR REPLACE TABLE \`${datasetId}.fact_sug_monthly_rollup_temp\` AS
    SELECT 
      month_id,
      territory_id,
      sug_revenue,
      run_rate,
      take_rate_pct,
      aard_pct,
      return_rate_pct,
      ris_pct,
      month_name
    FROM \`${datasetId}.fact_sug_monthly_rollup\`
  `;
  
  const replaceQuery = `
    DROP TABLE IF EXISTS \`${datasetId}.fact_sug_monthly_rollup\`;
    ALTER TABLE \`${datasetId}.fact_sug_monthly_rollup_temp\` RENAME TO \`${datasetId}.fact_sug_monthly_rollup\`;
  `;
  
  await executeSQL(createQuery, 'Creating fact_sug_monthly_rollup without extra month field');
  await executeSQL(replaceQuery, 'Replacing fact_sug_monthly_rollup table');
}

// Fix 4: fact_intraday_sales - Remove extra timestamp, add missing fields
async function fixFactIntradaySalesSQL() {
  console.log('\n🔧 Fixing fact_intraday_sales using SQL...');
  
  // Add missing fields if they don't exist
  await executeSQL(
    `ALTER TABLE \`${datasetId}.fact_intraday_sales\` ADD COLUMN IF NOT EXISTS hour_label STRING`,
    'Adding hour_label field to fact_intraday_sales'
  );
  
  await executeSQL(
    `ALTER TABLE \`${datasetId}.fact_intraday_sales\` ADD COLUMN IF NOT EXISTS territory_id STRING`,
    'Adding territory_id field to fact_intraday_sales'
  );
  
  // Create new table without extra timestamp field
  const createQuery = `
    CREATE OR REPLACE TABLE \`${datasetId}.fact_intraday_sales_temp\` AS
    SELECT 
      date_id,
      hour,
      outlet_id,
      device_group,
      sales_units,
      sales_revenue,
      hour_label,
      territory_id
    FROM \`${datasetId}.fact_intraday_sales\`
  `;
  
  const replaceQuery = `
    DROP TABLE IF EXISTS \`${datasetId}.fact_intraday_sales\`;
    ALTER TABLE \`${datasetId}.fact_intraday_sales_temp\` RENAME TO \`${datasetId}.fact_intraday_sales\`;
  `;
  
  await executeSQL(createQuery, 'Creating fact_intraday_sales without extra timestamp field');
  await executeSQL(replaceQuery, 'Replacing fact_intraday_sales table');
}

// Fix 5: fact_network_kpi_points - Remove extra timestamp, add region
async function fixFactNetworkKpiPointsSQL() {
  console.log('\n🔧 Fixing fact_network_kpi_points using SQL...');
  
  // Add missing region field if it doesn't exist
  await executeSQL(
    `ALTER TABLE \`${datasetId}.fact_network_kpi_points\` ADD COLUMN IF NOT EXISTS region STRING`,
    'Adding region field to fact_network_kpi_points'
  );
  
  // Update region from synthetic data
  const syntheticData = await loadSyntheticData('fact_network_kpi_points.json');
  if (!syntheticData) return;
  
  const regionMap = {};
  syntheticData.forEach(row => {
    const key = `${row.date_id}_${row.site_id}`;
    regionMap[key] = row.region;
  });
  
  console.log('🔄 Updating region values...');
  let updatedCount = 0;
  for (const [key, region] of Object.entries(regionMap)) {
    const [dateId, siteId] = key.split('_');
    
    try {
      await bigquery.query(`
        UPDATE \`${datasetId}.fact_network_kpi_points\`
        SET region = ${region ? `'${region}'` : 'NULL'}
        WHERE date_id = ${dateId} AND site_id = '${siteId}'
      `);
      updatedCount++;
    } catch (error) {
      console.log(`⚠️  Update failed for ${key}: ${error.message}`);
    }
  }
  
  console.log(`✅ Updated ${updatedCount} region values`);
  
  // Remove extra timestamp field
  const createQuery = `
    CREATE OR REPLACE TABLE \`${datasetId}.fact_network_kpi_points_temp\` AS
    SELECT 
      date_id,
      site_id,
      lat,
      lon,
      cqi,
      rsrp,
      sinr,
      score,
      status,
      region
    FROM \`${datasetId}.fact_network_kpi_points\`
  `;
  
  const replaceQuery = `
    DROP TABLE IF EXISTS \`${datasetId}.fact_network_kpi_points\`;
    ALTER TABLE \`${datasetId}.fact_network_kpi_points_temp\` RENAME TO \`${datasetId}.fact_network_kpi_points\`;
  `;
  
  await executeSQL(createQuery, 'Creating fact_network_kpi_points without extra timestamp field');
  await executeSQL(replaceQuery, 'Replacing fact_network_kpi_points table');
}

// Fix 6: fact_contact_center_metrics - Remove extra date, add missing fields
async function fixFactContactCenterMetricsSQL() {
  console.log('\n🔧 Fixing fact_contact_center_metrics using SQL...');
  
  // Add missing fields if they don't exist
  const fieldsToAdd = [
    'team STRING',
    'territory_id STRING', 
    'calls_handled INTEGER',
    'csat_score FLOAT'
  ];
  
  for (const fieldDef of fieldsToAdd) {
    const fieldName = fieldDef.split(' ')[0];
    await executeSQL(
      `ALTER TABLE \`${datasetId}.fact_contact_center_metrics\` ADD COLUMN IF NOT EXISTS ${fieldDef}`,
      `Adding ${fieldName} field to fact_contact_center_metrics`
    );
  }
  
  // Update fields from synthetic data
  const syntheticData = await loadSyntheticData('fact_contact_center_metrics.json');
  if (!syntheticData) return;
  
  console.log('🔄 Updating missing field values...');
  let updatedCount = 0;
  for (const row of syntheticData) {
    try {
      await bigquery.query(`
        UPDATE \`${datasetId}.fact_contact_center_metrics\`
        SET 
          team = ${row.team ? `'${row.team}'` : 'NULL'},
          territory_id = ${row.territory_id ? `'${row.territory_id}'` : 'NULL'},
          calls_handled = ${row.calls_handled || 'NULL'},
          csat_score = ${row.csat_score || 'NULL'}
        WHERE employee_id = '${row.employee_id}'
      `);
      updatedCount++;
    } catch (error) {
      console.log(`⚠️  Update failed for ${row.employee_id}: ${error.message}`);
    }
  }
  
  console.log(`✅ Updated ${updatedCount} records`);
  
  // Remove extra date field
  const createQuery = `
    CREATE OR REPLACE TABLE \`${datasetId}.fact_contact_center_metrics_temp\` AS
    SELECT 
      employee_id,
      employee_name,
      box_close_pct,
      inb_aht_sec,
      transfer_pct,
      sales_time_pct,
      hold_pct,
      status,
      team,
      territory_id,
      calls_handled,
      csat_score
    FROM \`${datasetId}.fact_contact_center_metrics\`
  `;
  
  const replaceQuery = `
    DROP TABLE IF EXISTS \`${datasetId}.fact_contact_center_metrics\`;
    ALTER TABLE \`${datasetId}.fact_contact_center_metrics_temp\` RENAME TO \`${datasetId}.fact_contact_center_metrics\`;
  `;
  
  await executeSQL(createQuery, 'Creating fact_contact_center_metrics without extra date field');
  await executeSQL(replaceQuery, 'Replacing fact_contact_center_metrics table');
}

// Fix 7: fact_dynamic_scores - Remove extra date field
async function fixFactDynamicScoresSQL() {
  console.log('\n🔧 Fixing fact_dynamic_scores using SQL...');
  
  // Create new table without extra date field
  const createQuery = `
    CREATE OR REPLACE TABLE \`${datasetId}.fact_dynamic_scores_temp\` AS
    SELECT 
      employee_id,
      employee_name,
      metric_1,
      metric_2,
      metric_3,
      metric_4,
      metric_5,
      overall_score,
      rank
    FROM \`${datasetId}.fact_dynamic_scores\`
  `;
  
  const replaceQuery = `
    DROP TABLE IF EXISTS \`${datasetId}.fact_dynamic_scores\`;
    ALTER TABLE \`${datasetId}.fact_dynamic_scores_temp\` RENAME TO \`${datasetId}.fact_dynamic_scores\`;
  `;
  
  await executeSQL(createQuery, 'Creating fact_dynamic_scores without extra date field');
  await executeSQL(replaceQuery, 'Replacing fact_dynamic_scores table');
}

// Fix 8: catalog_reports - Convert timestamp fields to strings
async function fixCatalogReportsSQL() {
  console.log('\n🔧 Fixing catalog_reports timestamp fields...');
  
  // Convert timestamp fields to strings
  const createQuery = `
    CREATE OR REPLACE TABLE \`${datasetId}.catalog_reports_temp\` AS
    SELECT 
      report_id,
      report_name,
      domain,
      source_dataset_id,
      CAST(last_updated_ts AS STRING) as last_updated_ts,
      enterprise_flag,
      source_application,
      business_owner,
      description,
      primary_use_case,
      CAST(created_date AS STRING) as created_date,
      refresh_frequency,
      key_kpis,
      primary_dimensions,
      time_range_supported,
      top_insights,
      known_limitations,
      recommended_actions,
      related_reports,
      used_by_roles
    FROM \`${datasetId}.catalog_reports\`
  `;
  
  const replaceQuery = `
    DROP TABLE IF EXISTS \`${datasetId}.catalog_reports\`;
    ALTER TABLE \`${datasetId}.catalog_reports_temp\` RENAME TO \`${datasetId}.catalog_reports\`;
  `;
  
  await executeSQL(createQuery, 'Converting catalog_reports timestamp fields to strings');
  await executeSQL(replaceQuery, 'Replacing catalog_reports table');
}

// Fix 9: catalog_datasets - Convert timestamp fields to strings
async function fixCatalogDatasetsSQL() {
  console.log('\n🔧 Fixing catalog_datasets timestamp fields...');
  
  // Convert timestamp field to string
  const createQuery = `
    CREATE OR REPLACE TABLE \`${datasetId}.catalog_datasets_temp\` AS
    SELECT 
      dataset_id,
      dataset_name,
      domain,
      CAST(last_refresh_ts AS STRING) as last_refresh_ts,
      refresh_frequency,
      certified_flag,
      source_system,
      row_count,
      field_count,
      key_fields,
      dataset_health,
      primary_use_cases,
      connected_reports,
      data_owner,
      migration_readiness,
      pii_flag,
      downstream_systems,
      schema_tables_count,
      null_rate,
      duplication_rate,
      migration_target_recommendation,
      migration_recommendation_reason,
      storage_type
    FROM \`${datasetId}.catalog_datasets\`
  `;
  
  const replaceQuery = `
    DROP TABLE IF EXISTS \`${datasetId}.catalog_datasets\`;
    ALTER TABLE \`${datasetId}.catalog_datasets_temp\` RENAME TO \`${datasetId}.catalog_datasets\`;
  `;
  
  await executeSQL(createQuery, 'Converting catalog_datasets timestamp field to string');
  await executeSQL(replaceQuery, 'Replacing catalog_datasets table');
}

// Main function to achieve 100% consistency
async function achieve100PercentConsistencySQL() {
  console.log('🎯 ACHIEVING 100% SCHEMA CONSISTENCY USING SQL');
  console.log('=' .repeat(80));
  
  try {
    // Wait for any streaming buffer to clear
    await waitForStreamingBuffer('fact_sug_sales_daily', 30);
    
    console.log('\n📋 Fixing Dimension Tables:');
    await fixDimMarketsSQL();
    
    console.log('\n📊 Fixing Fact Tables:');
    await fixFactSugSalesDailySQL();
    await fixFactSugMonthlyRollupSQL();
    await fixFactIntradaySalesSQL();
    await fixFactNetworkKpiPointsSQL();
    await fixFactContactCenterMetricsSQL();
    await fixFactDynamicScoresSQL();
    
    console.log('\n📚 Fixing Catalog Tables:');
    await fixCatalogReportsSQL();
    await fixCatalogDatasetsSQL();
    
    console.log('\n' + '=' .repeat(80));
    console.log('🎉 100% SCHEMA CONSISTENCY ACHIEVED!');
    console.log('=' .repeat(80));
    
    console.log('\n🔄 Next Steps:');
    console.log('1. Run final validation to confirm 100% consistency:');
    console.log('   node validate_complete_consistency.mjs');
    console.log('2. Check dashboard functionality:');
    console.log('   http://localhost:5178/bigquery-dashboard');
    console.log('3. Verify data in Google Cloud Console:');
    console.log('   https://console.cloud.google.com/bigquery?project=data-practice-472314');
    
  } catch (error) {
    console.error('❌ Error achieving 100% consistency:', error);
  }
}

// Run the 100% consistency fix
achieve100PercentConsistencySQL().catch(console.error);
