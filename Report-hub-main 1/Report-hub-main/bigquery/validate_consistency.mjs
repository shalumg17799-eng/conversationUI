// BigQuery Consistency Validation Script
// Checks field/column consistency between synthetic data and BigQuery tables
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

// Get BigQuery table schema
async function getTableSchema(tableId) {
  try {
    const dataset = bigquery.dataset(datasetId);
    const table = dataset.table(tableId);
    const [metadata] = await table.getMetadata();
    return metadata.schema.fields;
  } catch (error) {
    console.error(`Error getting schema for ${tableId}:`, error.message);
    return null;
  }
}

// Get BigQuery table data
async function getTableData(tableId, limit = 5) {
  try {
    const query = `SELECT * FROM \`${datasetId}.${tableId}\` LIMIT ${limit}`;
    const [rows] = await bigquery.query(query);
    return rows;
  } catch (error) {
    console.error(`Error getting data for ${tableId}:`, error.message);
    return [];
  }
}

// Validate table consistency
async function validateTable(tableId, jsonFile) {
  console.log(`\n🔍 Validating ${tableId}...`);
  
  try {
    // Load synthetic data
    const syntheticData = await loadJsonFile(jsonFile);
    console.log(`   Synthetic data: ${syntheticData.length} rows`);
    
    // Get BigQuery schema
    const bqSchema = await getTableSchema(tableId);
    if (!bqSchema) {
      console.log(`   ❌ Could not get BigQuery schema for ${tableId}`);
      return false;
    }
    
    // Get BigQuery data
    const bqData = await getTableData(tableId, 5);
    console.log(`   BigQuery data: ${bqData.length} rows (sample)`);
    
    // Get synthetic data fields
    const syntheticFields = syntheticData.length > 0 ? Object.keys(syntheticData[0]) : [];
    console.log(`   Synthetic fields: ${syntheticFields.join(', ')}`);
    
    // Get BigQuery fields
    const bqFields = bqSchema.map(field => field.name);
    console.log(`   BigQuery fields: ${bqFields.join(', ')}`);
    
    // Check for missing fields
    const missingInBQ = syntheticFields.filter(field => !bqFields.includes(field));
    const extraInBQ = bqFields.filter(field => !syntheticFields.includes(field));
    
    if (missingInBQ.length > 0) {
      console.log(`   ⚠️  Missing in BigQuery: ${missingInBQ.join(', ')}`);
    }
    
    if (extraInBQ.length > 0) {
      console.log(`   ℹ️  Extra in BigQuery: ${extraInBQ.join(', ')}`);
    }
    
    // Check data types
    if (syntheticData.length > 0 && bqData.length > 0) {
      console.log(`   📊 Sample synthetic data:`, syntheticData[0]);
      console.log(`   📊 Sample BigQuery data:`, bqData[0]);
    }
    
    const isConsistent = missingInBQ.length === 0;
    console.log(`   ${isConsistent ? '✅' : '❌'} Consistency check: ${isConsistent ? 'PASS' : 'FAIL'}`);
    
    return isConsistent;
    
  } catch (error) {
    console.error(`   ❌ Error validating ${tableId}:`, error.message);
    return false;
  }
}

// Main validation function
async function validateAllTables() {
  console.log('🚀 Starting BigQuery consistency validation...');
  console.log(`Dataset: ${datasetId}`);
  console.log(`Project: data-practice-472314`);
  
  const tables = [
    { tableId: 'dim_territories', jsonFile: 'dim_territories.json' },
    { tableId: 'dim_outlets', jsonFile: 'dim_outlets.json' },
    { tableId: 'dim_devices', jsonFile: 'dim_devices.json' },
    { tableId: 'fact_sug_sales_daily', jsonFile: 'fact_sug_sales_daily.json' },
    { tableId: 'fact_sug_monthly_rollup', jsonFile: 'fact_sug_monthly_rollup.json' },
    { tableId: 'fact_intraday_sales', jsonFile: 'fact_intraday_sales.json' },
    { tableId: 'fact_network_kpi_points', jsonFile: 'fact_network_kpi_points.json' },
    { tableId: 'fact_contact_center_metrics', jsonFile: 'fact_contact_center_metrics.json' },
    { tableId: 'fact_dynamic_scores', jsonFile: 'fact_dynamic_scores.json' },
    { tableId: 'catalog_reports', jsonFile: 'catalog_reports.json' },
    { tableId: 'catalog_datasets', jsonFile: 'catalog_datasets.json' },
    { tableId: 'churn_monthly', jsonFile: 'churn_monthly.json' },
    { tableId: 'take_rate_monthly_trend', jsonFile: 'take_rate_monthly_trend.json' },
    { tableId: 'market_segment_distribution', jsonFile: 'market_segment_distribution.json' },
    { tableId: 'segment_performance_trend', jsonFile: 'segment_performance_trend.json' },
    { tableId: 'performance_by_region', jsonFile: 'performance_by_region.json' },
    { tableId: 'revenue_by_device_group', jsonFile: 'revenue_by_device_group.json' }
  ];
  
  let consistentCount = 0;
  let totalChecked = 0;
  
  for (const { tableId, jsonFile } of tables) {
    const isConsistent = await validateTable(tableId, jsonFile);
    if (isConsistent) consistentCount++;
    totalChecked++;
  }
  
  console.log(`\n📋 Validation Summary:`);
  console.log(`✅ Consistent tables: ${consistentCount}/${totalChecked}`);
  console.log(`❌ Inconsistent tables: ${totalChecked - consistentCount}/${totalChecked}`);
  
  if (consistentCount === totalChecked) {
    console.log(`\n🎉 All tables are consistent!`);
  } else {
    console.log(`\n⚠️  Some tables need attention. See details above.`);
  }
}

// Run the validation
validateAllTables();
