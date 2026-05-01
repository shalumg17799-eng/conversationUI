// Complete Validation: Synthetic Data vs BigQuery Data Consistency Check
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

// All 18 tables to validate
const allTables = [
  // Dimension Tables
  { name: 'dim_markets', file: 'dim_markets.json', type: 'dimension' },
  { name: 'dim_territories', file: 'dim_territories.json', type: 'dimension' },
  { name: 'dim_outlets', file: 'dim_outlets.json', type: 'dimension' },
  { name: 'dim_devices', file: 'dim_devices.json', type: 'dimension' },
  
  // Fact Tables
  { name: 'fact_sug_sales_daily', file: 'fact_sug_sales_daily.json', type: 'fact' },
  { name: 'fact_sug_monthly_rollup', file: 'fact_sug_monthly_rollup.json', type: 'fact' },
  { name: 'fact_intraday_sales', file: 'fact_intraday_sales.json', type: 'fact' },
  { name: 'fact_network_kpi_points', file: 'fact_network_kpi_points.json', type: 'fact' },
  { name: 'fact_contact_center_metrics', file: 'fact_contact_center_metrics.json', type: 'fact' },
  { name: 'fact_dynamic_scores', file: 'fact_dynamic_scores.json', type: 'fact' },
  
  // Catalog Tables
  { name: 'catalog_reports', file: 'catalog_reports.json', type: 'catalog' },
  { name: 'catalog_datasets', file: 'catalog_datasets.json', type: 'catalog' },
  
  // Analytical Tables
  { name: 'churn_monthly', file: 'churn_monthly.json', type: 'analytical' },
  { name: 'take_rate_monthly_trend', file: 'take_rate_monthly_trend.json', type: 'analytical' },
  { name: 'market_segment_distribution', file: 'market_segment_distribution.json', type: 'analytical' },
  { name: 'segment_performance_trend', file: 'segment_performance_trend.json', type: 'analytical' },
  { name: 'performance_by_region', file: 'performance_by_region.json', type: 'analytical' },
  { name: 'revenue_by_device_group', file: 'revenue_by_device_group.json', type: 'analytical' }
];

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

// Get BigQuery table data
async function getBigQueryData(tableName, limit = 1000) {
  try {
    const query = `SELECT * FROM \`${datasetId}.${tableName}\` LIMIT ${limit}`;
    const [rows] = await bigquery.query(query);
    return rows;
  } catch (error) {
    console.error(`❌ Error getting BigQuery data from ${tableName}:`, error.message);
    return null;
  }
}

// Get BigQuery table schema
async function getBigQuerySchema(tableName) {
  try {
    const dataset = bigquery.dataset(datasetId);
    const table = dataset.table(tableName);
    const [metadata] = await table.getMetadata();
    return metadata.schema.fields;
  } catch (error) {
    console.error(`❌ Error getting schema for ${tableName}:`, error.message);
    return null;
  }
}

// Get BigQuery table row count
async function getBigQueryRowCount(tableName) {
  try {
    const query = `SELECT COUNT(*) as count FROM \`${datasetId}.${tableName}\``;
    const [rows] = await bigquery.query(query);
    return rows[0].count;
  } catch (error) {
    console.error(`❌ Error getting row count for ${tableName}:`, error.message);
    return 0;
  }
}

// Check if table exists in BigQuery
async function tableExists(tableName) {
  try {
    const dataset = bigquery.dataset(datasetId);
    const [tables] = await dataset.getTables();
    return tables.some(table => table.id === tableName);
  } catch (error) {
    console.error(`❌ Error checking if table ${tableName} exists:`, error.message);
    return false;
  }
}

// Validate field consistency between synthetic and BigQuery
function validateFieldConsistency(syntheticData, bigQueryData, tableName) {
  const issues = [];
  
  if (!syntheticData || syntheticData.length === 0) {
    issues.push(`No synthetic data found for ${tableName}`);
    return issues;
  }
  
  if (!bigQueryData || bigQueryData.length === 0) {
    issues.push(`No BigQuery data found for ${tableName}`);
    return issues;
  }
  
  // Get field names from synthetic data (first record)
  const syntheticFields = Object.keys(syntheticData[0]);
  
  // Get field names from BigQuery data (first record)
  const bigQueryFields = Object.keys(bigQueryData[0]);
  
  // Check for missing fields in BigQuery
  const missingInBigQuery = syntheticFields.filter(field => !bigQueryFields.includes(field));
  if (missingInBigQuery.length > 0) {
    issues.push(`Missing fields in BigQuery: ${missingInBigQuery.join(', ')}`);
  }
  
  // Check for extra fields in BigQuery
  const extraInBigQuery = bigQueryFields.filter(field => !syntheticFields.includes(field));
  if (extraInBigQuery.length > 0) {
    issues.push(`Extra fields in BigQuery: ${extraInBigQuery.join(', ')}`);
  }
  
  // Check field order consistency
  const fieldOrderMatch = JSON.stringify(syntheticFields) === JSON.stringify(bigQueryFields);
  if (!fieldOrderMatch) {
    issues.push(`Field order mismatch between synthetic and BigQuery`);
  }
  
  return issues;
}

// Validate data type consistency
function validateDataTypeConsistency(syntheticData, bigQueryData, tableName) {
  const issues = [];
  
  if (!syntheticData || syntheticData.length === 0 || !bigQueryData || bigQueryData.length === 0) {
    return issues;
  }
  
  const syntheticSample = syntheticData[0];
  const bigQuerySample = bigQueryData[0];
  
  // Check data types for each field
  Object.keys(syntheticSample).forEach(field => {
    if (bigQuerySample.hasOwnProperty(field)) {
      const syntheticType = typeof syntheticSample[field];
      const bigQueryType = typeof bigQuerySample[field];
      
      // Special handling for dates and numbers
      if (syntheticType === 'string' && bigQueryType === 'object') {
        // Likely a Date object in BigQuery
        if (bigQuerySample[field] instanceof Date) {
          // This is expected for date fields
        } else {
          issues.push(`Field ${field}: Expected string but got object in BigQuery`);
        }
      } else if (syntheticType === 'number' && bigQueryType === 'number') {
        // Numbers should match
      } else if (syntheticType === 'boolean' && bigQueryType === 'boolean') {
        // Booleans should match
      } else if (syntheticType === 'string' && bigQueryType === 'string') {
        // Strings should match
      } else if (syntheticType !== bigQueryType) {
        issues.push(`Field ${field}: Type mismatch - Synthetic: ${syntheticType}, BigQuery: ${bigQueryType}`);
      }
    }
  });
  
  return issues;
}

// Validate sample data values
function validateDataValues(syntheticData, bigQueryData, tableName) {
  const issues = [];
  
  if (!syntheticData || syntheticData.length === 0 || !bigQueryData || bigQueryData.length === 0) {
    return issues;
  }
  
  // Check if we have comparable data
  const syntheticSample = syntheticData[0];
  const bigQuerySample = bigQueryData[0];
  
  // Check if key identifiers match (if they exist)
  const idFields = ['id', 'ID', 'key', 'KEY', 'name', 'NAME'];
  const foundIdField = idFields.find(field => syntheticSample.hasOwnProperty(field));
  
  if (foundIdField) {
    const syntheticId = syntheticSample[foundIdField];
    const bigQueryId = bigQuerySample[foundIdField];
    
    if (syntheticId !== bigQueryId) {
      issues.push(`ID field ${foundIdField} mismatch: Synthetic="${syntheticId}", BigQuery="${bigQueryId}"`);
    }
  }
  
  // Check if counts are reasonable (BigQuery might have more or fewer records)
  const syntheticCount = syntheticData.length;
  const bigQueryCount = bigQueryData.length;
  
  if (syntheticCount > 0 && bigQueryCount === 0) {
    issues.push(`No data found in BigQuery but synthetic data has ${syntheticCount} records`);
  }
  
  return issues;
}

// Main validation function
async function validateCompleteConsistency() {
  console.log('🔍 Starting Complete Consistency Validation...');
  console.log(`Dataset: ${datasetId}`);
  console.log(`Project: data-practice-472314`);
  console.log(`Tables to validate: ${allTables.length}`);
  console.log('=' .repeat(80));
  
  const results = {
    totalTables: allTables.length,
    validatedTables: 0,
    tablesWithIssues: 0,
    tableResults: [],
    summary: {
      dimensionTables: { total: 0, validated: 0, issues: 0 },
      factTables: { total: 0, validated: 0, issues: 0 },
      catalogTables: { total: 0, validated: 0, issues: 0 },
      analyticalTables: { total: 0, validated: 0, issues: 0 }
    }
  };
  
  for (const table of allTables) {
    console.log(`\n🔍 Validating: ${table.name} (${table.type})`);
    
    const tableResult = {
      name: table.name,
      type: table.type,
      file: table.file,
      exists: false,
      syntheticRowCount: 0,
      bigQueryRowCount: 0,
      fieldConsistency: { status: 'pending', issues: [] },
      dataTypeConsistency: { status: 'pending', issues: [] },
      dataValueConsistency: { status: 'pending', issues: [] },
      overallStatus: 'pending'
    };
    
    try {
      // Check if table exists in BigQuery
      tableResult.exists = await tableExists(table.name);
      
      if (!tableResult.exists) {
        console.log(`   ❌ Table does not exist in BigQuery`);
        tableResult.overallStatus = 'failed';
        results.tablesWithIssues++;
      } else {
        console.log(`   ✅ Table exists in BigQuery`);
        
        // Load synthetic data
        const syntheticData = await loadSyntheticData(table.file);
        tableResult.syntheticRowCount = syntheticData ? syntheticData.length : 0;
        
        // Get BigQuery data
        const bigQueryData = await getBigQueryData(table.name, 100);
        tableResult.bigQueryRowCount = await getBigQueryRowCount(table.name);
        
        console.log(`   📊 Synthetic records: ${tableResult.syntheticRowCount}`);
        console.log(`   📊 BigQuery records: ${tableResult.bigQueryRowCount}`);
        
        // Validate field consistency
        tableResult.fieldConsistency.issues = validateFieldConsistency(syntheticData, bigQueryData, table.name);
        tableResult.fieldConsistency.status = tableResult.fieldConsistency.issues.length === 0 ? 'passed' : 'failed';
        
        // Validate data type consistency
        tableResult.dataTypeConsistency.issues = validateDataTypeConsistency(syntheticData, bigQueryData, table.name);
        tableResult.dataTypeConsistency.status = tableResult.dataTypeConsistency.issues.length === 0 ? 'passed' : 'failed';
        
        // Validate data values
        tableResult.dataValueConsistency.issues = validateDataValues(syntheticData, bigQueryData, table.name);
        tableResult.dataValueConsistency.status = tableResult.dataValueConsistency.issues.length === 0 ? 'passed' : 'failed';
        
        // Determine overall status
        const allChecksPassed = tableResult.fieldConsistency.status === 'passed' &&
                               tableResult.dataTypeConsistency.status === 'passed' &&
                               tableResult.dataValueConsistency.status === 'passed';
        
        tableResult.overallStatus = allChecksPassed ? 'passed' : 'warning';
        
        if (allChecksPassed) {
          console.log(`   ✅ All consistency checks passed`);
          results.validatedTables++;
        } else {
          console.log(`   ⚠️  Some consistency issues found`);
          results.tablesWithIssues++;
        }
        
        // Log specific issues
        [...tableResult.fieldConsistency.issues, ...tableResult.dataTypeConsistency.issues, ...tableResult.dataValueConsistency.issues].forEach(issue => {
          console.log(`      ⚠️  ${issue}`);
        });
      }
      
      // Update summary
      results.summary[`${table.type}Tables`].total++;
      if (tableResult.overallStatus === 'passed') {
        results.summary[`${table.type}Tables`].validated++;
      }
      if (tableResult.overallStatus !== 'passed') {
        results.summary[`${table.type}Tables`].issues++;
      }
      
    } catch (error) {
      console.error(`   ❌ Error validating ${table.name}:`, error.message);
      tableResult.overallStatus = 'error';
      results.tablesWithIssues++;
    }
    
    results.tableResults.push(tableResult);
  }
  
  // Generate final report
  console.log('\n' + '=' .repeat(80));
  console.log('📊 VALIDATION COMPLETE - FINAL REPORT');
  console.log('=' .repeat(80));
  
  console.log(`\n📈 Overall Summary:`);
  console.log(`   Total Tables: ${results.totalTables}`);
  console.log(`   Validated Tables: ${results.validatedTables}`);
  console.log(`   Tables with Issues: ${results.tablesWithIssues}`);
  console.log(`   Success Rate: ${((results.validatedTables / results.totalTables) * 100).toFixed(1)}%`);
  
  console.log(`\n📋 By Table Type:`);
  console.log(`   Dimension Tables: ${results.summary.dimensionTables.validated}/${results.summary.dimensionTables.total} validated`);
  console.log(`   Fact Tables: ${results.summary.factTables.validated}/${results.summary.factTables.total} validated`);
  console.log(`   Catalog Tables: ${results.summary.catalogTables.validated}/${results.summary.catalogTables.total} validated`);
  console.log(`   Analytical Tables: ${results.summary.analyticalTables.validated}/${results.summary.analyticalTables.total} validated`);
  
  console.log(`\n🔍 Detailed Results:`);
  results.tableResults.forEach(table => {
    const statusIcon = table.overallStatus === 'passed' ? '✅' : 
                      table.overallStatus === 'warning' ? '⚠️' : 
                      table.overallStatus === 'failed' ? '❌' : '❓';
    
    console.log(`   ${statusIcon} ${table.name} (${table.type})`);
    console.log(`      Exists: ${table.exists ? 'Yes' : 'No'}`);
    console.log(`      Synthetic: ${table.syntheticRowCount} records`);
    console.log(`      BigQuery: ${table.bigQueryRowCount} records`);
    console.log(`      Field Consistency: ${table.fieldConsistency.status}`);
    console.log(`      Data Type Consistency: ${table.dataTypeConsistency.status}`);
    console.log(`      Data Value Consistency: ${table.dataValueConsistency.status}`);
    
    if (table.overallStatus !== 'passed') {
      const allIssues = [...table.fieldConsistency.issues, ...table.dataTypeConsistency.issues, ...table.dataValueConsistency.issues];
      if (allIssues.length > 0) {
        console.log(`      Issues:`);
        allIssues.forEach(issue => console.log(`        - ${issue}`));
      }
    }
  });
  
  console.log('\n🌐 Access your data in Google Cloud Console:');
  console.log(`https://console.cloud.google.com/bigquery?project=data-practice-472314`);
  
  // Save detailed report to file
  const reportPath = path.join(__dirname, 'validation_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  
  return results;
}

// Run the complete validation
validateCompleteConsistency().catch(console.error);
