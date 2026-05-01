// Load remaining data for tables that need data
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

// Load data into table
async function loadDataIntoTable(tableId, rows) {
  if (!rows || rows.length === 0) {
    console.log(`   No data to load for ${tableId}`);
    return;
  }

  try {
    console.log(`   Loading ${rows.length} rows into ${tableId}...`);
    
    const dataset = bigquery.dataset(datasetId);
    const table = dataset.table(tableId);
    
    await table.insert(rows);
    console.log(`   ✅ Successfully loaded data into ${tableId}`);
    
  } catch (error) {
    console.error(`   ❌ Error loading data into ${tableId}:`, error.message);
    // Continue with other tables even if one fails
  }
}

// Load data for tables that need it
async function loadRemainingData() {
  try {
    console.log('🚀 Loading remaining data for tables...');
    console.log(`Dataset: ${datasetId}`);
    console.log(`Project: data-practice-472314`);
    
    // Load dim_devices
    console.log('\n📦 Loading dim_devices...');
    const devicesData = await loadJsonFile('dim_devices.json');
    await loadDataIntoTable('dim_devices', devicesData);
    
    // Load dim_territories
    console.log('\n📦 Loading dim_territories...');
    const territoriesData = await loadJsonFile('dim_territories.json');
    await loadDataIntoTable('dim_territories', territoriesData);
    
    // Load dim_outlets
    console.log('\n📦 Loading dim_outlets...');
    const outletsData = await loadJsonFile('dim_outlets.json');
    await loadDataIntoTable('dim_outlets', outletsData);
    
    // Load catalog_datasets
    console.log('\n📦 Loading catalog_datasets...');
    const datasetsData = await loadJsonFile('catalog_datasets.json');
    const transformedDatasets = datasetsData.map(dataset => ({
      ...dataset,
      last_refresh_ts: new Date(dataset.last_refresh_ts),
      key_fields: dataset.key_fields || [],
      dataset_health: dataset.dataset_health || null,
      primary_use_cases: dataset.primary_use_cases || [],
      connected_reports: dataset.connected_reports || [],
      migration_readiness: dataset.migration_readiness || null,
      downstream_systems: dataset.downstream_systems || []
    }));
    await loadDataIntoTable('catalog_datasets', transformedDatasets);
    
    // Load churn_monthly
    console.log('\n📦 Loading churn_monthly...');
    const churnData = await loadJsonFile('churn_monthly.json');
    await loadDataIntoTable('churn_monthly', churnData);
    
    console.log('\n✅ All remaining data loaded successfully!');
    console.log('\n🌐 You can now view the complete data in your Google Cloud BigQuery console:');
    console.log(`https://console.cloud.google.com/bigquery?project=data-practice-472314`);
    
  } catch (error) {
    console.error('❌ Error loading remaining data:', error);
  }
}

// Run the loading script
loadRemainingData();
