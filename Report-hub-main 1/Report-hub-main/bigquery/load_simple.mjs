// Simple BigQuery Data Loading Script
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

// Simple insert function
async function insertData(tableId, rows) {
  if (!rows || rows.length === 0) {
    console.log(`No data to insert for ${tableId}`);
    return;
  }

  try {
    console.log(`Loading ${rows.length} rows into ${tableId}...`);
    
    const dataset = bigquery.dataset(datasetId);
    const table = dataset.table(tableId);
    
    // Insert data without waiting for job completion
    await table.insert(rows);
    
    console.log(`✅ Successfully loaded data into ${tableId}`);
    
  } catch (error) {
    console.error(`❌ Error loading data into ${tableId}:`, error.message);
    // Continue with other tables even if one fails
  }
}

// Load sample data for all tables
async function loadSampleData() {
  try {
    console.log('🚀 Loading sample data into all tables...');
    
    // Sample data for dim_markets
    const markets = [
      { market_id: 'MKT-001', market_name: 'Northeast', description: 'Northeast region' },
      { market_id: 'MKT-002', market_name: 'Southeast', description: 'Southeast region' },
      { market_id: 'MKT-003', market_name: 'Midwest', description: 'Midwest region' },
      { market_id: 'MKT-004', market_name: 'West', description: 'West region' },
      { market_id: 'MKT-005', market_name: 'Southwest', description: 'Southwest region' }
    ];
    await insertData('dim_markets', markets);
    
    // Sample data for dim_territories
    const territories = [
      { territory_id: 'TERR-001', market_id: 'MKT-001', territory_name: 'Boston Metro', region: 'Northeast', manager: 'John Smith' },
      { territory_id: 'TERR-002', market_id: 'MKT-001', territory_name: 'New York Metro', region: 'Northeast', manager: 'Jane Doe' },
      { territory_id: 'TERR-003', market_id: 'MKT-002', territory_name: 'Atlanta Metro', region: 'Southeast', manager: 'Bob Johnson' },
      { territory_id: 'TERR-004', market_id: 'MKT-003', territory_name: 'Chicago Metro', region: 'Midwest', manager: 'Alice Brown' },
      { territory_id: 'TERR-005', market_id: 'MKT-004', territory_name: 'Los Angeles Metro', region: 'West', manager: 'Charlie Wilson' }
    ];
    await insertData('dim_territories', territories);
    
    // Sample data for dim_outlets
    const outlets = [
      { outlet_id: 'OUT-001', territory_id: 'TERR-001', outlet_name: 'Downtown Boston', city: 'Boston', state: 'MA', zip_code: '02101', outlet_type: 'Retail', square_footage: 2500, employee_count: 8 },
      { outlet_id: 'OUT-002', territory_id: 'TERR-001', outlet_name: 'Cambridge Store', city: 'Cambridge', state: 'MA', zip_code: '02142', outlet_type: 'Retail', square_footage: 1800, employee_count: 6 },
      { outlet_id: 'OUT-003', territory_id: 'TERR-002', outlet_name: 'Manhattan Store', city: 'New York', state: 'NY', zip_code: '10001', outlet_type: 'Flagship', square_footage: 5000, employee_count: 15 },
      { outlet_id: 'OUT-004', territory_id: 'TERR-003', outlet_name: 'Michigan Ave', city: 'Chicago', state: 'IL', zip_code: '60601', outlet_type: 'Retail', square_footage: 3000, employee_count: 10 },
      { outlet_id: 'OUT-005', territory_id: 'TERR-004', outlet_name: 'Hollywood Store', city: 'Los Angeles', state: 'CA', zip_code: '90028', outlet_type: 'Flagship', square_footage: 4500, employee_count: 12 }
    ];
    await insertData('dim_outlets', outlets);
    
    // Sample data for dim_devices
    const devices = [
      { device_id: 'DEV-001', device_name: 'iPhone 15 Pro', device_group: 'Premium', manufacturer: 'Apple', model: 'A3108', price: 999.99, launch_date: new Date('2023-09-15'), discontinued_date: null },
      { device_id: 'DEV-002', device_name: 'Samsung Galaxy S24', device_group: 'Premium', manufacturer: 'Samsung', model: 'SM-S906U', price: 899.99, launch_date: new Date('2024-01-17'), discontinued_date: null },
      { device_id: 'DEV-003', device_name: 'Google Pixel 8', device_group: 'Mid-range', manufacturer: 'Google', model: 'GZ4F0', price: 699.99, launch_date: new Date('2023-10-04'), discontinued_date: null },
      { device_id: 'DEV-004', device_name: 'OnePlus 12', device_group: 'Premium', manufacturer: 'OnePlus', model: 'CPH2583', price: 799.99, launch_date: new Date('2024-01-23'), discontinued_date: null },
      { device_id: 'DEV-005', device_name: 'Motorola Razr', device_group: 'Budget', manufacturer: 'Motorola', model: 'RAZR40', price: 399.99, launch_date: new Date('2023-06-01'), discontinued_date: null }
    ];
    await insertData('dim_devices', devices);
    
    // Sample data for catalog_reports
    const reports = [
      { 
        report_id: 'RPT-001', 
        report_name: 'SU&G Performance Dashboard', 
        domain: 'Sales', 
        source_dataset_id: 'DS-001', 
        last_updated_ts: new Date(), 
        enterprise_flag: false, 
        source_application: 'Tableau', 
        business_owner: 'Sarah Johnson', 
        description: 'Monitor SU&G sales performance',
        primary_use_case: 'Daily sales monitoring',
        created_date: new Date('2024-01-01'),
        refresh_frequency: 'Daily'
      },
      { 
        report_id: 'RPT-002', 
        report_name: 'Customer Experience Metrics', 
        domain: 'Customer Experience', 
        source_dataset_id: 'DS-002', 
        last_updated_ts: new Date(), 
        enterprise_flag: false, 
        source_application: 'Looker', 
        business_owner: 'Michael Chen', 
        description: 'Customer feedback and RIS scores',
        primary_use_case: 'Customer satisfaction tracking',
        created_date: new Date('2024-01-15'),
        refresh_frequency: 'Weekly'
      }
    ];
    await insertData('catalog_reports', reports);
    
    // Sample data for catalog_datasets
    const datasets = [
      { 
        dataset_id: 'DS-001', 
        dataset_name: 'SU&G Sales Transactions', 
        domain: 'Sales', 
        last_refresh_ts: new Date(), 
        refresh_frequency: 'Hourly', 
        certified_flag: true, 
        source_system: 'BigQuery', 
        row_count: 1500000, 
        field_count: 25,
        data_owner: 'Data Engineering Team',
        pii_flag: false
      },
      { 
        dataset_id: 'DS-002', 
        dataset_name: 'Customer Feedback & RIS', 
        domain: 'Customer Experience', 
        last_refresh_ts: new Date(), 
        refresh_frequency: 'Daily', 
        certified_flag: true, 
        source_system: 'BigQuery', 
        row_count: 1000000, 
        field_count: 30,
        data_owner: 'Customer Analytics Team',
        pii_flag: true
      }
    ];
    await insertData('catalog_datasets', datasets);
    
    // Sample data for churn_monthly
    const churn = [
      { month: 'Apr 2024', churn_rate: 4.2, change_vs_previous_month: -0.3, month_date: new Date('2024-04-01') },
      { month: 'Mar 2024', churn_rate: 4.5, change_vs_previous_month: 0.2, month_date: new Date('2024-03-01') },
      { month: 'Feb 2024', churn_rate: 4.3, change_vs_previous_month: -0.1, month_date: new Date('2024-02-01') },
      { month: 'Jan 2024', churn_rate: 4.4, change_vs_previous_month: 0.1, month_date: new Date('2024-01-01') }
    ];
    await insertData('churn_monthly', churn);
    
    // Sample data for take_rate_monthly_trend
    const takeRate = [
      { month: 'Apr 2024', take_rate: 58.5, change_vs_previous_month: 1.2, month_date: new Date('2024-04-01') },
      { month: 'Mar 2024', take_rate: 57.3, change_vs_previous_month: -0.8, month_date: new Date('2024-03-01') },
      { month: 'Feb 2024', take_rate: 58.1, change_vs_previous_month: 0.5, month_date: new Date('2024-02-01') },
      { month: 'Jan 2024', take_rate: 57.6, change_vs_previous_month: -0.3, month_date: new Date('2024-01-01') }
    ];
    await insertData('take_rate_monthly_trend', takeRate);
    
    console.log('✅ Sample data loaded successfully!');
    console.log('\n🌐 You can now view the data in your Google Cloud BigQuery console:');
    console.log(`https://console.cloud.google.com/bigquery?project=data-practice-472314`);
    
  } catch (error) {
    console.error('❌ Error loading sample data:', error);
  }
}

// Run the loading script
loadSampleData();
