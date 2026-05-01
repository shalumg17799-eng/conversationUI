// Final fix for fact_sug_sales_daily - Handle streaming buffer issues
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

// Wait for streaming buffer to clear
async function waitForStreamingBuffer(tableName, maxWaitMinutes = 5) {
  console.log(`⏳ Waiting for streaming buffer to clear on ${tableName}...`);
  
  const maxWaitMs = maxWaitMinutes * 60 * 1000;
  const checkIntervalMs = 30000; // Check every 30 seconds
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
  
  console.log(`⚠️  Timeout waiting for streaming buffer to clear (${maxWaitMinutes} minutes)`);
  return false;
}

// Alternative approach: Use load jobs instead of streaming
async function loadDataViaJob(tableName, data) {
  console.log(`📦 Loading ${data.length} rows into ${tableName} via load job...`);
  
  try {
    // Create temporary CSV file for loading
    const csvData = data.map(row => [
      row.date_id,
      row.outlet_id,
      row.device_id,
      row.sug_sales_units,
      row.eligible_device_units,
      row.sug_sales_revenue,
      row.accessory_revenue,
      row.return_units,
      row.passing_surveys,
      row.total_surveys,
      row.date ? row.date.toISOString().split('T')[0] : ''
    ]);
    
    const csvHeader = 'date_id,outlet_id,device_id,sug_sales_units,eligible_device_units,sug_sales_revenue,accessory_revenue,return_units,passing_surveys,total_surveys,date';
    const csvContent = csvHeader + '\n' + csvData.map(row => row.join(',')).join('\n');
    
    // Create temp file
    const tempFilePath = path.join(__dirname, `temp_${tableName}_${Date.now()}.csv`);
    fs.writeFileSync(tempFilePath, csvContent);
    
    // Load job configuration
    const jobConfig = {
      sourceFormat: 'CSV',
      skipLeadingRows: 1,
      autodetect: false,
      schema: {
        fields: [
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
        ]
      },
      writeDisposition: 'WRITE_TRUNCATE' // Overwrite existing data
    };
    
    // Start load job
    const dataset = bigquery.dataset(datasetId);
    const table = dataset.table(tableName);
    
    const [job] = await table.load(tempFilePath, jobConfig);
    console.log(`🔄 Load job started: ${job.id}`);
    
    // Wait for job completion
    const [metadata] = await job.promise();
    
    // Clean up temp file
    fs.unlinkSync(tempFilePath);
    
    if (metadata.status.errors) {
      console.log('❌ Load job completed with errors:', metadata.status.errors);
      return { success: 0, error: data.length };
    }
    
    console.log(`✅ Load job completed successfully!`);
    console.log(`📊 Loaded ${metadata.outputRows} rows`);
    
    return { success: metadata.outputRows || data.length, error: 0 };
    
  } catch (error) {
    console.error(`❌ Error in load job:`, error.message);
    return { success: 0, error: data.length };
  }
}

// Main fix function
async function fixFactSugSalesDailyFinal() {
  console.log('🔧 Final fix for fact_sug_sales_daily - Handling streaming buffer issues...');
  console.log('=' .repeat(70));
  
  try {
    // Load synthetic data
    console.log('\n📊 Loading synthetic data...');
    const syntheticData = await loadSyntheticData('fact_sug_sales_daily.json');
    if (!syntheticData) {
      console.log('❌ Could not load synthetic data');
      return;
    }
    
    console.log(`📈 Found ${syntheticData.length} records in synthetic data`);
    
    // Transform data to match BigQuery schema
    console.log('\n🔄 Transforming data...');
    const transformedData = syntheticData.map(row => ({
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
    }));
    
    console.log(`✅ Transformed ${transformedData.length} records`);
    
    // Wait for streaming buffer to clear (if needed)
    console.log('\n⏳ Checking streaming buffer status...');
    await waitForStreamingBuffer('fact_sug_sales_daily', 2); // Wait up to 2 minutes
    
    // Use load job approach instead of streaming
    console.log('\n📦 Using load job approach (avoids streaming buffer issues)...');
    const result = await loadDataViaJob('fact_sug_sales_daily', transformedData);
    
    console.log('\n📊 Final Results:');
    console.log(`✅ Success: ${result.success} rows`);
    console.log(`❌ Errors: ${result.error} rows`);
    
    // Verify final count
    try {
      const countQuery = `SELECT COUNT(*) as count FROM \`${datasetId}.fact_sug_sales_daily\``;
      const [rows] = await bigquery.query(countQuery);
      const finalCount = rows[0].count;
      console.log(`🔍 Final table count: ${finalCount} rows`);
      
      if (finalCount > 0) {
        console.log('\n🎉 SUCCESS: fact_sug_sales_daily is now populated!');
        console.log('✅ Critical issue resolved!');
        
        // Show sample data
        console.log('\n📋 Sample data verification:');
        const [sampleRows] = await bigquery.query(`SELECT * FROM \`${datasetId}.fact_sug_sales_daily\` LIMIT 3`);
        sampleRows.forEach((row, index) => {
          console.log(`   Sample ${index + 1}: ${row.date_id} | ${row.outlet_id} | ${row.device_id} | $${row.sug_sales_revenue}`);
        });
        
      } else {
        console.log('\n❌ ISSUE: Table still has no data');
      }
    } catch (error) {
      console.log(`❌ Error verifying final count: ${error.message}`);
    }
    
  } catch (error) {
    console.error('❌ Error in final fix:', error);
  }
}

// Run the final fix
fixFactSugSalesDailyFinal().catch(console.error);
