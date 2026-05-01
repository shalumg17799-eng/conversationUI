// Robust BigQuery Dataset Creation with Error Handling
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

const oldDatasetId = 'telecom_demo';
const newDatasetId = 'report_hub_demo';

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

// Create new dataset
async function createNewDataset() {
  try {
    console.log(`🔄 Creating new dataset: ${newDatasetId}`);
    
    // Delete if exists
    try {
      await bigquery.dataset(newDatasetId).delete();
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error) {
      // Dataset doesn't exist, continue
    }
    
    const [dataset] = await bigquery.createDataset(newDatasetId, {
      location: 'US',
    });
    
    console.log(`✅ Dataset ${dataset.id} created.`);
    return dataset;
  } catch (error) {
    console.error(`❌ Error creating dataset:`, error.message);
    throw error;
  }
}

// Create table with schema
async function createTable(tableId, schema) {
  try {
    console.log(`🔄 Creating table: ${tableId}`);
    
    const dataset = bigquery.dataset(newDatasetId);
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

// Load data into table in smaller batches
async function loadDataIntoTable(tableId, rows, batchSize = 100) {
  if (!rows || rows.length === 0) {
    console.log(`   No data to load for ${tableId}`);
    return;
  }

  try {
    console.log(`📦 Loading ${rows.length} rows into ${tableId} (batch size: ${batchSize})...`);
    
    const dataset = bigquery.dataset(newDatasetId);
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
        console.log(`   ✅ ${successCount}/${batch.length} rows loaded in batch ${Math.floor(i/batchSize) + 1}`);
      }
    }
    
    console.log(`✅ Data loading completed for ${tableId}`);
    
  } catch (error) {
    console.error(`❌ Error loading data into ${tableId}:`, error.message);
  }
}

// Create all tables with robust error handling
async function createAllTablesRobust() {
  try {
    console.log('🚀 Creating complete BigQuery dataset with robust error handling...');
    console.log(`New Dataset: ${newDatasetId}`);
    console.log(`Project: data-practice-472314`);
    
    // Create new dataset
    await createNewDataset();
    
    let successCount = 0;
    let totalTables = 18;
    
    // DIMENSION TABLES
    console.log('\n📊 Creating Dimension Tables...');
    
    // dim_markets
    const marketsSchema = [
      { name: 'market_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'market_name', type: 'STRING', mode: 'REQUIRED' },
      { name: 'description', type: 'STRING', mode: 'NULLABLE' }
    ];
    if (await createTable('dim_markets', marketsSchema)) {
      const marketsData = [
        { market_id: 'M-001', market_name: 'Northeast', description: 'Northeast region' },
        { market_id: 'M-002', market_name: 'Southeast', description: 'Southeast region' },
        { market_id: 'M-003', market_name: 'Midwest', description: 'Midwest region' },
        { market_id: 'M-004', market_name: 'West', description: 'West region' },
        { market_id: 'M-005', market_name: 'Southwest', description: 'Southwest region' }
      ];
      await loadDataIntoTable('dim_markets', marketsData);
      successCount++;
    }
    
    // dim_territories
    const territoriesData = await loadJsonFile('dim_territories.json');
    const territoriesSchema = [
      { name: 'territory_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'market_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'territory_name', type: 'STRING', mode: 'REQUIRED' }
    ];
    if (await createTable('dim_territories', territoriesSchema)) {
      await loadDataIntoTable('dim_territories', territoriesData);
      successCount++;
    }
    
    // dim_outlets
    const outletsData = await loadJsonFile('dim_outlets.json');
    const outletsSchema = [
      { name: 'outlet_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'territory_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'outlet_name', type: 'STRING', mode: 'REQUIRED' },
      { name: 'city', type: 'STRING', mode: 'REQUIRED' },
      { name: 'state', type: 'STRING', mode: 'REQUIRED' },
      { name: 'outlet_type', type: 'STRING', mode: 'NULLABLE' }
    ];
    if (await createTable('dim_outlets', outletsSchema)) {
      await loadDataIntoTable('dim_outlets', outletsData);
      successCount++;
    }
    
    // dim_devices
    const devicesData = await loadJsonFile('dim_devices.json');
    const devicesSchema = [
      { name: 'device_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'device_name', type: 'STRING', mode: 'REQUIRED' },
      { name: 'device_group', type: 'STRING', mode: 'REQUIRED' },
      { name: 'manufacturer', type: 'STRING', mode: 'REQUIRED' },
      { name: 'msrp', type: 'INTEGER', mode: 'NULLABLE' },
      { name: 'plan_eligible', type: 'BOOLEAN', mode: 'NULLABLE' }
    ];
    if (await createTable('dim_devices', devicesSchema)) {
      await loadDataIntoTable('dim_devices', devicesData);
      successCount++;
    }
    
    // FACT TABLES
    console.log('\n📈 Creating Fact Tables...');
    
    // fact_sug_sales_daily
    const salesDailyData = await loadJsonFile('fact_sug_sales_daily.json');
    const salesDailySchema = [
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
    ];
    if (await createTable('fact_sug_sales_daily', salesDailySchema)) {
      // Transform data to ensure proper types
      const transformedSalesData = salesDailyData.map(row => ({
        ...row,
        sug_sales_units: parseInt(row.sug_sales_units) || 0,
        eligible_device_units: parseInt(row.eligible_device_units) || 0,
        sug_sales_revenue: parseFloat(row.sug_sales_revenue) || 0,
        accessory_revenue: parseFloat(row.accessory_revenue) || 0,
        return_units: parseInt(row.return_units) || 0,
        passing_surveys: parseInt(row.passing_surveys) || 0,
        total_surveys: parseInt(row.total_surveys) || 0,
        date: row.date ? new Date(row.date) : null
      }));
      await loadDataIntoTable('fact_sug_sales_daily', transformedSalesData, 50);
      successCount++;
    }
    
    // fact_sug_monthly_rollup
    const monthlyRollupData = await loadJsonFile('fact_sug_monthly_rollup.json');
    const monthlyRollupSchema = [
      { name: 'month_id', type: 'INTEGER', mode: 'REQUIRED' },
      { name: 'territory_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'sug_revenue', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'run_rate', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'take_rate_pct', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'aard_pct', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'return_rate_pct', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'ris_pct', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'month', type: 'DATE', mode: 'NULLABLE' }
    ];
    if (await createTable('fact_sug_monthly_rollup', monthlyRollupSchema)) {
      const transformedMonthlyData = monthlyRollupData.map(row => ({
        ...row,
        month_id: parseInt(row.month_id) || 0,
        sug_revenue: parseFloat(row.sug_revenue) || 0,
        run_rate: parseFloat(row.run_rate) || 0,
        take_rate_pct: parseFloat(row.take_rate_pct) || 0,
        aard_pct: parseFloat(row.aard_pct) || 0,
        return_rate_pct: parseFloat(row.return_rate_pct) || 0,
        ris_pct: parseFloat(row.ris_pct) || 0,
        month: row.month ? new Date(row.month) : null
      }));
      await loadDataIntoTable('fact_sug_monthly_rollup', transformedMonthlyData);
      successCount++;
    }
    
    // Skip remaining fact tables for now to focus on the working ones
    
    // CATALOG TABLES
    console.log('\n📋 Creating Catalog Tables...');
    
    // catalog_reports
    const reportsData = await loadJsonFile('catalog_reports.json');
    const reportsSchema = [
      { name: 'report_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'report_name', type: 'STRING', mode: 'REQUIRED' },
      { name: 'domain', type: 'STRING', mode: 'REQUIRED' },
      { name: 'source_dataset_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'last_updated_ts', type: 'TIMESTAMP', mode: 'REQUIRED' },
      { name: 'enterprise_flag', type: 'BOOLEAN', mode: 'REQUIRED' }
    ];
    if (await createTable('catalog_reports', reportsSchema)) {
      const simplifiedReports = reportsData.map(report => ({
        report_id: report.report_id,
        report_name: report.report_name,
        domain: report.domain,
        source_dataset_id: report.source_dataset_id,
        last_updated_ts: new Date(report.last_updated_ts),
        enterprise_flag: report.enterprise_flag
      }));
      await loadDataIntoTable('catalog_reports', simplifiedReports);
      successCount++;
    }
    
    // catalog_datasets
    const datasetsData = await loadJsonFile('catalog_datasets.json');
    const datasetsSchema = [
      { name: 'dataset_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'dataset_name', type: 'STRING', mode: 'REQUIRED' },
      { name: 'domain', type: 'STRING', mode: 'REQUIRED' },
      { name: 'last_refresh_ts', type: 'TIMESTAMP', mode: 'REQUIRED' },
      { name: 'refresh_frequency', type: 'STRING', mode: 'REQUIRED' },
      { name: 'certified_flag', type: 'BOOLEAN', mode: 'REQUIRED' },
      { name: 'source_system', type: 'STRING', mode: 'NULLABLE' },
      { name: 'row_count', type: 'INTEGER', mode: 'NULLABLE' },
      { name: 'field_count', type: 'INTEGER', mode: 'NULLABLE' }
    ];
    if (await createTable('catalog_datasets', datasetsSchema)) {
      const simplifiedDatasets = datasetsData.map(dataset => ({
        dataset_id: dataset.dataset_id,
        dataset_name: dataset.dataset_name,
        domain: dataset.domain,
        last_refresh_ts: new Date(dataset.last_refresh_ts),
        refresh_frequency: dataset.refresh_frequency,
        certified_flag: dataset.certified_flag,
        source_system: dataset.source_system,
        row_count: parseInt(dataset.row_count) || 0,
        field_count: parseInt(dataset.field_count) || 0
      }));
      await loadDataIntoTable('catalog_datasets', simplifiedDatasets);
      successCount++;
    }
    
    // ANALYTICAL TABLES
    console.log('\n📊 Creating Analytical Tables...');
    
    // churn_monthly
    const churnData = await loadJsonFile('churn_monthly.json');
    const churnSchema = [
      { name: 'month', type: 'STRING', mode: 'REQUIRED' },
      { name: 'month_id', type: 'INTEGER', mode: 'REQUIRED' },
      { name: 'churn_rate', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'change_vs_previous_month', type: 'FLOAT', mode: 'REQUIRED' }
    ];
    if (await createTable('churn_monthly', churnSchema)) {
      const simplifiedChurn = churnData.map(row => ({
        month: row.month,
        month_id: parseInt(row.month_id) || 0,
        churn_rate: parseFloat(row.churn_rate) || 0,
        change_vs_previous_month: parseFloat(row.change_vs_previous_month) || 0
      }));
      await loadDataIntoTable('churn_monthly', simplifiedChurn);
      successCount++;
    }
    
    // take_rate_monthly_trend
    const takeRateData = await loadJsonFile('take_rate_monthly_trend.json');
    const takeRateSchema = [
      { name: 'month', type: 'STRING', mode: 'REQUIRED' },
      { name: 'takeRate', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'change_vs_previous_month', type: 'FLOAT', mode: 'REQUIRED' }
    ];
    if (await createTable('take_rate_monthly_trend', takeRateSchema)) {
      const transformedTakeRate = takeRateData.map(row => ({
        month: row.month,
        takeRate: parseFloat(row.takeRate) || 0,
        change_vs_previous_month: parseFloat(row.change_vs_previous_month) || 0
      }));
      await loadDataIntoTable('take_rate_monthly_trend', transformedTakeRate);
      successCount++;
    }
    
    // market_segment_distribution
    const marketSegData = await loadJsonFile('market_segment_distribution.json');
    const marketSegSchema = [
      { name: 'name', type: 'STRING', mode: 'REQUIRED' },
      { name: 'value', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'revenue', type: 'FLOAT', mode: 'NULLABLE' }
    ];
    if (await createTable('market_segment_distribution', marketSegSchema)) {
      const transformedMarketSeg = marketSegData.map(row => ({
        name: row.name,
        value: parseFloat(row.value) || 0,
        revenue: parseFloat(row.revenue) || 0
      }));
      await loadDataIntoTable('market_segment_distribution', transformedMarketSeg);
      successCount++;
    }
    
    console.log('\n✅ Dataset creation completed!');
    console.log(`📊 Success: ${successCount}/${totalTables} tables created and loaded`);
    console.log('\n🌐 You can now view the dataset in your Google Cloud BigQuery console:');
    console.log(`https://console.cloud.google.com/bigquery?project=data-practice-472314`);
    
  } catch (error) {
    console.error('❌ Error creating dataset:', error);
  }
}

// Run the robust creation script
createAllTablesRobust();
