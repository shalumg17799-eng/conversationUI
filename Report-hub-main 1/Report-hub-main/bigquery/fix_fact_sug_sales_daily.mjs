// Targeted fix for fact_sug_sales_daily - Critical issue resolution
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

// Check table schema
async function getTableSchema(tableName) {
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

// Sample data to understand structure
async function sampleSyntheticData() {
  console.log('🔍 Analyzing synthetic data structure...');
  
  const syntheticData = await loadSyntheticData('fact_sug_sales_daily.json');
  if (!syntheticData || syntheticData.length === 0) {
    console.log('❌ No synthetic data found');
    return;
  }
  
  console.log('📊 Synthetic Data Sample:');
  const sample = syntheticData[0];
  console.log('Sample record:');
  Object.keys(sample).forEach(key => {
    console.log(`  ${key}: ${sample[key]} (${typeof sample[key]})`);
  });
  
  console.log(`\n📈 Total records: ${syntheticData.length}`);
  return syntheticData;
}

// Check BigQuery table schema
async function analyzeBigQuerySchema() {
  console.log('\n🔍 Analyzing BigQuery table schema...');
  
  const schema = await getTableSchema('fact_sug_sales_daily');
  if (!schema) {
    console.log('❌ Could not get BigQuery schema');
    return;
  }
  
  console.log('📋 BigQuery Schema:');
  schema.forEach(field => {
    console.log(`  ${field.name}: ${field.type} (${field.mode})`);
  });
  
  return schema;
}

// Create and load data with proper schema matching
async function fixFactSugSalesDaily() {
  console.log('\n🔧 Starting targeted fix for fact_sug_sales_daily...');
  
  // Analyze both data sources
  const syntheticData = await sampleSyntheticData();
  const bqSchema = await analyzeBigQuerySchema();
  
  if (!syntheticData || !bqSchema) {
    console.log('❌ Cannot proceed without data and schema analysis');
    return;
  }
  
  // Clear existing data
  try {
    console.log('\n🗑️  Clearing existing data...');
    const deleteQuery = `DELETE FROM \`${datasetId}.fact_sug_sales_daily\` WHERE TRUE`;
    await bigquery.query(deleteQuery);
    console.log('✅ Data cleared');
  } catch (error) {
    console.log(`ℹ️  Clear operation: ${error.message}`);
  }
  
  // Transform data to match BigQuery schema exactly
  console.log('\n🔄 Transforming data to match BigQuery schema...');
  
  const transformedData = syntheticData.map((row, index) => {
    try {
      return {
        date_id: parseInt(row.date_id) || 0,
        outlet_id: String(row.outlet_id || ''),
        device_id: String(row.device_id || ''),
        sug_sales_units: parseInt(row.sug_sales_units) || 0,
        eligible_device_units: parseInt(row.eligible_device_units) || 0,
        sug_sales_revenue: parseFloat(row.sug_sales_revenue) || 0.0,
        accessory_revenue: parseFloat(row.accessory_revenue) || 0.0,
        return_units: parseInt(row.return_units) || 0,
        passing_surveys: parseInt(row.passing_surveys) || 0,
        total_surveys: parseInt(row.total_surveys) || 0,
        date: row.date ? new Date(row.date) : null
      };
    } catch (error) {
      console.log(`⚠️  Error transforming row ${index}: ${error.message}`);
      return null;
    }
  }).filter(row => row !== null);
  
  console.log(`📊 Transformed ${transformedData.length} valid rows from ${syntheticData.length} original rows`);
  
  // Load data in very small batches with detailed error reporting
  console.log('\n📦 Loading data in small batches...');
  
  const dataset = bigquery.dataset(datasetId);
  const table = dataset.table('fact_sug_sales_daily');
  
  let successCount = 0;
  let errorCount = 0;
  const batchSize = 10; // Very small batches for debugging
  
  for (let i = 0; i < transformedData.length; i += batchSize) {
    const batch = transformedData.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(transformedData.length / batchSize);
    
    console.log(`\n📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} rows)...`);
    
    try {
      await table.insert(batch);
      successCount += batch.length;
      console.log(`✅ Batch ${batchNum} successful: ${batch.length} rows`);
    } catch (batchError) {
      console.log(`⚠️  Batch ${batchNum} failed: ${batchError.message}`);
      
      // Try individual rows with detailed error reporting
      for (let j = 0; j < batch.length; j++) {
        const row = batch[j];
        const rowNum = i + j + 1;
        
        try {
          await table.insert([row]);
          successCount++;
          console.log(`✅ Row ${rowNum}: Success`);
        } catch (rowError) {
          errorCount++;
          console.log(`❌ Row ${rowNum}: ${rowError.message}`);
          
          // Log the problematic row for debugging
          if (errorCount <= 5) { // Only log first 5 errors to avoid spam
            console.log(`   Problematic data:`, JSON.stringify(row, null, 2));
          }
        }
      }
    }
    
    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n📊 Loading Results:');
  console.log(`✅ Success: ${successCount}/${transformedData.length} rows`);
  console.log(`❌ Errors: ${errorCount}/${transformedData.length} rows`);
  console.log(`📈 Success Rate: ${((successCount / transformedData.length) * 100).toFixed(1)}%`);
  
  // Verify final count
  try {
    const countQuery = `SELECT COUNT(*) as count FROM \`${datasetId}.fact_sug_sales_daily\``;
    const [rows] = await bigquery.query(countQuery);
    const finalCount = rows[0].count;
    console.log(`🔍 Final table count: ${finalCount} rows`);
    
    if (finalCount > 0) {
      console.log('🎉 SUCCESS: fact_sug_sales_daily now has data!');
    } else {
      console.log('❌ ISSUE: Table still has no data');
    }
  } catch (error) {
    console.log(`❌ Error verifying final count: ${error.message}`);
  }
}

// Run the targeted fix
fixFactSugSalesDaily().catch(console.error);
