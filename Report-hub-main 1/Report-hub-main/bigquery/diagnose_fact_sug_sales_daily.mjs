// Diagnostic script for fact_sug_sales_daily loading issues
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

// Comprehensive diagnostic
async function runDiagnostics() {
  console.log('🔍 Running comprehensive diagnostics for fact_sug_sales_daily...');
  console.log('=' .repeat(60));
  
  // 1. Check table existence and schema
  console.log('\n1️⃣ Checking table existence and schema...');
  try {
    const dataset = bigquery.dataset(datasetId);
    const table = dataset.table('fact_sug_sales_daily');
    const [metadata] = await table.getMetadata();
    
    console.log('✅ Table exists');
    console.log(`📋 Table type: ${metadata.tableReference.tableId}`);
    console.log(`📊 Table location: ${metadata.location}`);
    console.log(`📈 Table type: ${metadata.tableType}`);
    console.log(`📅 Created: ${metadata.creationTime}`);
    console.log(`🔄 Modified: ${metadata.modificationTime}`);
    console.log(`📏 Number of rows: ${metadata.numRows || 'Unknown'}`);
    
    console.log('\n📋 Schema Details:');
    metadata.schema.fields.forEach((field, index) => {
      console.log(`  ${index + 1}. ${field.name}: ${field.type} (${field.mode})`);
      if (field.fields) {
        field.fields.forEach((subField, subIndex) => {
          console.log(`     ${subIndex + 1}. ${subField.name}: ${subField.type} (${subField.mode})`);
        });
      }
    });
    
  } catch (error) {
    console.log('❌ Error accessing table:', error.message);
    return;
  }
  
  // 2. Check synthetic data structure
  console.log('\n2️⃣ Checking synthetic data structure...');
  const syntheticData = await loadSyntheticData('fact_sug_sales_daily.json');
  if (!syntheticData) {
    console.log('❌ Could not load synthetic data');
    return;
  }
  
  console.log(`📊 Synthetic data: ${syntheticData.length} records`);
  console.log('\n📋 Sample record structure:');
  const sample = syntheticData[0];
  Object.keys(sample).forEach((key, index) => {
    const value = sample[key];
    const type = typeof value;
    console.log(`  ${index + 1}. ${key}: ${value} (${type})`);
  });
  
  // 3. Test with a single simple record
  console.log('\n3️⃣ Testing with a single simple record...');
  try {
    const dataset = bigquery.dataset(datasetId);
    const table = dataset.table('fact_sug_sales_daily');
    
    // Create a minimal test record
    const testRecord = {
      date_id: 20240101,
      outlet_id: "TEST-001",
      device_id: "DEV-001",
      sug_sales_units: 100,
      eligible_device_units: 150,
      sug_sales_revenue: 50000.0,
      accessory_revenue: 1000.0,
      return_units: 5,
      passing_surveys: 80,
      total_surveys: 100,
      date: null
    };
    
    console.log('🧪 Test record:', JSON.stringify(testRecord, null, 2));
    
    // Clear table first
    console.log('🗑️  Clearing table for test...');
    await bigquery.query(`DELETE FROM \`${datasetId}.fact_sug_sales_daily\` WHERE TRUE`);
    
    // Insert test record
    console.log('📦 Inserting test record...');
    await table.insert([testRecord]);
    console.log('✅ Test record inserted successfully!');
    
    // Verify insertion
    console.log('🔍 Verifying test record...');
    const [rows] = await bigquery.query(`SELECT * FROM \`${datasetId}.fact_sug_sales_daily\` LIMIT 1`);
    if (rows.length > 0) {
      console.log('✅ Test record verified!');
      console.log('📊 Retrieved record:', JSON.stringify(rows[0], null, 2));
    } else {
      console.log('❌ Test record not found after insertion');
    }
    
  } catch (error) {
    console.log('❌ Test record failed:', error.message);
    console.log('🔍 Error details:', error.errors || error);
  }
  
  // 4. Test with actual synthetic data (first record only)
  console.log('\n4️⃣ Testing with first synthetic record...');
  try {
    const firstRecord = syntheticData[0];
    const transformedRecord = {
      date_id: parseInt(firstRecord.date_id) || 0,
      outlet_id: String(firstRecord.outlet_id || ''),
      device_id: String(firstRecord.device_id || ''),
      sug_sales_units: parseInt(firstRecord.sug_sales_units) || 0,
      eligible_device_units: parseInt(firstRecord.eligible_device_units) || 0,
      sug_sales_revenue: parseFloat(firstRecord.sug_sales_revenue) || 0.0,
      accessory_revenue: parseFloat(firstRecord.accessory_revenue) || 0.0,
      return_units: parseInt(firstRecord.return_units) || 0,
      passing_surveys: parseInt(firstRecord.passing_surveys) || 0,
      total_surveys: parseInt(firstRecord.total_surveys) || 0,
      date: firstRecord.date ? new Date(firstRecord.date) : null
    };
    
    console.log('🧪 Transformed first record:', JSON.stringify(transformedRecord, null, 2));
    
    // Clear table
    await bigquery.query(`DELETE FROM \`${datasetId}.fact_sug_sales_daily\` WHERE TRUE`);
    
    // Insert
    const dataset = bigquery.dataset(datasetId);
    const table = dataset.table('fact_sug_sales_daily');
    await table.insert([transformedRecord]);
    console.log('✅ First synthetic record inserted successfully!');
    
    // Verify
    const [rows] = await bigquery.query(`SELECT * FROM \`${datasetId}.fact_sug_sales_daily\` LIMIT 1`);
    if (rows.length > 0) {
      console.log('✅ First synthetic record verified!');
    } else {
      console.log('❌ First synthetic record not found');
    }
    
  } catch (error) {
    console.log('❌ First synthetic record failed:', error.message);
    console.log('🔍 Error details:', error.errors || error);
  }
  
  // 5. Check permissions
  console.log('\n5️⃣ Checking permissions...');
  try {
    // Test SELECT permission
    const [selectRows] = await bigquery.query(`SELECT COUNT(*) as count FROM \`${datasetId}.fact_sug_sales_daily\``);
    console.log('✅ SELECT permission OK');
    
    // Test DELETE permission
    await bigquery.query(`DELETE FROM \`${datasetId}.fact_sug_sales_daily\` WHERE FALSE`);
    console.log('✅ DELETE permission OK');
    
    // Test INSERT permission (with dummy data)
    const dataset = bigquery.dataset(datasetId);
    const table = dataset.table('fact_sug_sales_daily');
    const dummyRecord = {
      date_id: 999999999,
      outlet_id: "PERM-TEST",
      device_id: "PERM-TEST",
      sug_sales_units: 1,
      eligible_device_units: 1,
      sug_sales_revenue: 1.0,
      accessory_revenue: 1.0,
      return_units: 1,
      passing_surveys: 1,
      total_surveys: 1,
      date: null
    };
    
    await table.insert([dummyRecord]);
    console.log('✅ INSERT permission OK');
    
    // Clean up test record
    await bigquery.query(`DELETE FROM \`${datasetId}.fact_sug_sales_daily\` WHERE date_id = 999999999`);
    
  } catch (error) {
    console.log('❌ Permission error:', error.message);
  }
  
  console.log('\n' + '=' .repeat(60));
  console.log('🔍 Diagnostics complete!');
  console.log('\n💡 Next steps based on results:');
  console.log('1. If test records work but synthetic data fails -> data transformation issue');
  console.log('2. If even test records fail -> permissions or schema issue');
  console.log('3. If permissions work -> data format issue');
}

// Run diagnostics
runDiagnostics().catch(console.error);
