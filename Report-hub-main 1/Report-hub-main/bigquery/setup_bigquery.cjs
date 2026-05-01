// BigQuery Setup Script - Creates dataset and all tables
import { BigQuery } from '@google-cloud/bigquery';

// BigQuery Configuration
const bigquery = new BigQuery({
  projectId: 'data-practice-472314',
  credentials: {
    client_email: 'bigquery-backend-dp@data-practice-472314.iam.gserviceaccount.com',
    private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDlLD8c44pDJE0F\nCvPvxjsgoZlo5WsAG43M2sfGWSjBF/Rtdauojm3cU55aeWVa71Px89cuYjsrg4Mw\nu2uDNFtYJxi4xK0dEzMed/y6cqpPtJ6IFTse+8Z78yrk89GSmFccJ/rkGgmTSRXY\nMJD8CuxC28RLcd+dVkSIHJeZuJ4Maro2VpBSMJ5kKv2IQrmg06+C8GEdC37Ri0xe\nBzNNqwbx9f1Jg36Ag8inpa6pxwxJCJj6n9KfvfGPyRTR3IX+kf7HRQrsWujIh1ZU\nQX3lUxyzr4nS2rkyV5sqfp9p1Yzrj5Jge0CSIaW0Vz5Qi5tfvRH9+swgMPvrvkAs\neoOFpvifAgMBAAECggEAMseKloKenMD65e6m3Y69hD36aaFIA8aXNXiWwo739k0y\nBl0H87nXgvXuRRrYB/22yopeuDLg7IPf+ljU+kYMJWzIUAyYVTRvY8VvdPq6XR3m\n8L1Pk85zDPz1GLUjz0k9KAp9z7QrQfz0P6qHPanH7wqWJKdvRoQafFRljRS4xIQo\nNe6v42nUnW1kS5rwPyI7LlE0WbxD1Lw1XYUEZg4H0iRP8C6JEh8vFKdOcvBhutYi\n0hbozQKfdMWTV+f24BWvD4TRZxKY6NvMEAKH2Mvx+6+/bZCSw+yO8ualuerSAkOj\n+2RgWPGikD+65/wRjCDQJNdKKVR4ECGYcZhuQ6IM7QKBgQDzz78jyxl8IEqLWNkD\ngTA7EaAqsPh3+jlVlU2KxoT5Dc9zn9kcypBDZ0uGhmNs8lDynjKaw3zMtRdrhfL9\n7huJb75GE9RJbPRSFas9wgrFaWjtxe1zz0kFbmNgxhGpu23Le/SYYUxsK+dy3Gy+\nPRaWavgFANv1bgLo11J0tbkFRQKBgQDwoSgt2IzebJB+lBaVloLuvAAxAtg3ELg4\nLMopGF56aZmXm4BHcxRwbPAgCsy0w1LKl/JvFbDyqE9FiwBJHnWKAiRxwxkILAHs\nFljVYSNA3RqdQuptTJMB84oKeWkd6urv/oOBiJBo4LV6xUI1nu28BfZOJBt37GLu\nIwfRHAdKkwKBgQDOKbhN0vqszD1ckXeIECCxghj2oIiqIyuCI+ra0z0zwCrQcbVM\nNDlC1cC2c0L1p/0s+vp9hZotG2A/apfrgwFD+PpjFXdn0zrRgkM3yLIE9jpk/P3p\n9LihYBOmjDX5WWThMOLGS1gtC/79UEifoNZNwQwSZwSYBztsmk6+I7/dJQKBgQCS\nP+DDvJIhvao0xJzVXh1GLE2RfEEddrQAsHhOcdk6XWRUmNZmlrMdgZiQYP/5/Z0c\nNS3MBkr9sP49LjaGOlUGBDdSTVmxdc3VR9/GELv0eG3slvcUZy4SSYrkwtX4sQcJ\nxo7286GRnMGwVKPhIy8q0BTbeWaYhLu8MN5XYcmssQKBgCZEZ8/+BB1fuoomCIW7\n15HiKFz9sSnKlBFW4JRPw6hapTj8p6X1B/MMQgZ8t2hEvE9Moci+fn1Z2bxaXgsF\nvkHbM4B079uwgvmunS6YV7U4wgdi8fq9GskXy/MdGf+rZ3Wqniifl9zO8eyDJTpR\nDrlls5cFfxGFFQglnbrTySYC\n-----END PRIVATE KEY-----\n"
  }
});

const datasetId = 'telecom_demo';

async function createDataset() {
  try {
    console.log(`Creating dataset: ${datasetId}`);
    
    const [dataset] = await bigquery.createDataset(datasetId, {
      location: 'US',
    });
    
    console.log(`Dataset ${dataset.id} created.`);
    return dataset;
  } catch (error) {
    if (error.code === 409) {
      console.log(`Dataset ${datasetId} already exists.`);
      return bigquery.dataset(datasetId);
    }
    throw error;
  }
}

async function createTable(tableId, schema) {
  try {
    console.log(`Creating table: ${tableId}`);
    
    const [table] = await bigquery.dataset(datasetId).createTable({
      tableId,
      schema,
      location: 'US',
    });
    
    console.log(`Table ${table.id} created.`);
    return table;
  } catch (error) {
    if (error.code === 409) {
      console.log(`Table ${tableId} already exists.`);
      return bigquery.dataset(datasetId).table(tableId);
    }
    throw error;
  }
}

async function setupAllTables() {
  try {
    console.log('🚀 Starting BigQuery setup for Report Hub...');
    console.log(`Project: data-practice-472314`);
    console.log(`Dataset: ${datasetId}`);
    
    // Create dataset
    await createDataset();
    
    // Dimension Tables
    console.log('\n📊 Creating Dimension Tables...');
    
    await createTable('dim_markets', [
      { name: 'market_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'market_name', type: 'STRING', mode: 'REQUIRED' },
      { name: 'description', type: 'STRING', mode: 'NULLABLE' }
    ]);
    
    await createTable('dim_territories', [
      { name: 'territory_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'market_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'territory_name', type: 'STRING', mode: 'REQUIRED' },
      { name: 'region', type: 'STRING', mode: 'NULLABLE' },
      { name: 'manager', type: 'STRING', mode: 'NULLABLE' }
    ]);
    
    await createTable('dim_outlets', [
      { name: 'outlet_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'territory_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'outlet_name', type: 'STRING', mode: 'REQUIRED' },
      { name: 'city', type: 'STRING', mode: 'REQUIRED' },
      { name: 'state', type: 'STRING', mode: 'REQUIRED' },
      { name: 'zip_code', type: 'STRING', mode: 'NULLABLE' },
      { name: 'outlet_type', type: 'STRING', mode: 'NULLABLE' },
      { name: 'square_footage', type: 'INTEGER', mode: 'NULLABLE' },
      { name: 'employee_count', type: 'INTEGER', mode: 'NULLABLE' }
    ]);
    
    await createTable('dim_devices', [
      { name: 'device_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'device_name', type: 'STRING', mode: 'REQUIRED' },
      { name: 'device_group', type: 'STRING', mode: 'REQUIRED' },
      { name: 'manufacturer', type: 'STRING', mode: 'REQUIRED' },
      { name: 'model', type: 'STRING', mode: 'NULLABLE' },
      { name: 'price', type: 'FLOAT', mode: 'NULLABLE' },
      { name: 'launch_date', type: 'DATE', mode: 'NULLABLE' },
      { name: 'discontinued_date', type: 'DATE', mode: 'NULLABLE' }
    ]);
    
    // Fact Tables
    console.log('\n📈 Creating Fact Tables...');
    
    await createTable('fact_sug_sales_daily', [
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
    ]);
    
    await createTable('fact_sug_monthly_rollup', [
      { name: 'month_id', type: 'INTEGER', mode: 'REQUIRED' },
      { name: 'territory_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'sug_revenue', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'run_rate', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'take_rate_pct', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'aard_pct', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'return_rate_pct', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'ris_pct', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'month', type: 'DATE', mode: 'NULLABLE' }
    ]);
    
    await createTable('fact_intraday_sales', [
      { name: 'date_id', type: 'INTEGER', mode: 'REQUIRED' },
      { name: 'hour', type: 'INTEGER', mode: 'REQUIRED' },
      { name: 'outlet_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'device_group', type: 'STRING', mode: 'REQUIRED' },
      { name: 'sales_units', type: 'INTEGER', mode: 'REQUIRED' },
      { name: 'sales_revenue', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'timestamp', type: 'TIMESTAMP', mode: 'NULLABLE' }
    ]);
    
    await createTable('fact_network_kpi_points', [
      { name: 'date_id', type: 'INTEGER', mode: 'REQUIRED' },
      { name: 'site_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'lat', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'lon', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'cqi', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'rsrp', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'sinr', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'score', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'status', type: 'STRING', mode: 'REQUIRED' },
      { name: 'timestamp', type: 'TIMESTAMP', mode: 'NULLABLE' }
    ]);
    
    await createTable('fact_contact_center_metrics', [
      { name: 'employee_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'employee_name', type: 'STRING', mode: 'REQUIRED' },
      { name: 'box_close_pct', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'inb_aht_sec', type: 'INTEGER', mode: 'REQUIRED' },
      { name: 'transfer_pct', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'sales_time_pct', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'hold_pct', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'status', type: 'STRING', mode: 'REQUIRED' },
      { name: 'date', type: 'DATE', mode: 'NULLABLE' }
    ]);
    
    await createTable('fact_dynamic_scores', [
      { name: 'employee_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'employee_name', type: 'STRING', mode: 'REQUIRED' },
      { name: 'metric_1', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'metric_2', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'metric_3', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'metric_4', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'metric_5', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'overall_score', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'rank', type: 'INTEGER', mode: 'REQUIRED' },
      { name: 'date', type: 'DATE', mode: 'NULLABLE' }
    ]);
    
    // Catalog Tables
    console.log('\n📋 Creating Catalog Tables...');
    
    await createTable('catalog_reports', [
      { name: 'report_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'report_name', type: 'STRING', mode: 'REQUIRED' },
      { name: 'domain', type: 'STRING', mode: 'REQUIRED' },
      { name: 'source_dataset_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'last_updated_ts', type: 'TIMESTAMP', mode: 'REQUIRED' },
      { name: 'enterprise_flag', type: 'BOOLEAN', mode: 'REQUIRED' },
      { name: 'source_application', type: 'STRING', mode: 'NULLABLE' },
      { name: 'business_owner', type: 'STRING', mode: 'NULLABLE' },
      { name: 'description', type: 'STRING', mode: 'NULLABLE' },
      { name: 'primary_use_case', type: 'STRING', mode: 'NULLABLE' },
      { name: 'created_date', type: 'TIMESTAMP', mode: 'NULLABLE' },
      { name: 'refresh_frequency', type: 'STRING', mode: 'NULLABLE' },
      { name: 'primary_dimensions', type: 'STRING', mode: 'REPEATED' },
      { name: 'time_range_supported', type: 'STRING', mode: 'NULLABLE' },
      { name: 'top_insights', type: 'STRING', mode: 'REPEATED' },
      { name: 'known_limitations', type: 'STRING', mode: 'REPEATED' },
      { name: 'recommended_actions', type: 'STRING', mode: 'REPEATED' },
      { name: 'used_by_roles', type: 'STRING', mode: 'REPEATED' }
    ]);
    
    await createTable('catalog_datasets', [
      { name: 'dataset_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'dataset_name', type: 'STRING', mode: 'REQUIRED' },
      { name: 'domain', type: 'STRING', mode: 'REQUIRED' },
      { name: 'last_refresh_ts', type: 'TIMESTAMP', mode: 'REQUIRED' },
      { name: 'refresh_frequency', type: 'STRING', mode: 'REQUIRED' },
      { name: 'certified_flag', type: 'BOOLEAN', mode: 'REQUIRED' },
      { name: 'source_system', type: 'STRING', mode: 'NULLABLE' },
      { name: 'row_count', type: 'INTEGER', mode: 'NULLABLE' },
      { name: 'field_count', type: 'INTEGER', mode: 'NULLABLE' },
      { name: 'data_owner', type: 'STRING', mode: 'NULLABLE' },
      { name: 'pii_flag', type: 'BOOLEAN', mode: 'NULLABLE' },
      { name: 'downstream_systems', type: 'STRING', mode: 'REPEATED' },
      { name: 'schema_tables_count', type: 'INTEGER', mode: 'NULLABLE' },
      { name: 'null_rate', type: 'FLOAT', mode: 'NULLABLE' },
      { name: 'duplication_rate', type: 'FLOAT', mode: 'NULLABLE' },
      { name: 'migration_target_recommendation', type: 'STRING', mode: 'NULLABLE' },
      { name: 'migration_recommendation_reason', type: 'STRING', mode: 'NULLABLE' },
      { name: 'storage_type', type: 'STRING', mode: 'NULLABLE' }
    ]);
    
    // Analytical Tables
    console.log('\n📊 Creating Analytical Tables...');
    
    await createTable('churn_monthly', [
      { name: 'month', type: 'STRING', mode: 'REQUIRED' },
      { name: 'churn_rate', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'change_vs_previous_month', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'month_date', type: 'DATE', mode: 'NULLABLE' }
    ]);
    
    await createTable('take_rate_monthly_trend', [
      { name: 'month', type: 'STRING', mode: 'REQUIRED' },
      { name: 'take_rate', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'change_vs_previous_month', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'month_date', type: 'DATE', mode: 'NULLABLE' }
    ]);
    
    await createTable('market_segment_distribution', [
      { name: 'segment', type: 'STRING', mode: 'REQUIRED' },
      { name: 'percentage', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'revenue', type: 'FLOAT', mode: 'NULLABLE' },
      { name: 'customer_count', type: 'INTEGER', mode: 'NULLABLE' },
      { name: 'avg_revenue_per_customer', type: 'FLOAT', mode: 'NULLABLE' }
    ]);
    
    await createTable('segment_performance_trend', [
      { name: 'segment', type: 'STRING', mode: 'REQUIRED' },
      { name: 'month', type: 'STRING', mode: 'REQUIRED' },
      { name: 'performance_metric', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'revenue', type: 'FLOAT', mode: 'NULLABLE' },
      { name: 'customer_count', type: 'INTEGER', mode: 'NULLABLE' },
      { name: 'month_date', type: 'DATE', mode: 'NULLABLE' }
    ]);
    
    await createTable('performance_by_region', [
      { name: 'region', type: 'STRING', mode: 'REQUIRED' },
      { name: 'performance_score', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'revenue', type: 'FLOAT', mode: 'NULLABLE' },
      { name: 'outlet_count', type: 'INTEGER', mode: 'NULLABLE' },
      { name: 'employee_count', type: 'INTEGER', mode: 'NULLABLE' },
      { name: 'avg_revenue_per_outlet', type: 'FLOAT', mode: 'NULLABLE' }
    ]);
    
    await createTable('revenue_by_device_group', [
      { name: 'device_group', type: 'STRING', mode: 'REQUIRED' },
      { name: 'revenue', type: 'FLOAT', mode: 'NULLABLE' },
      { name: 'units_sold', type: 'INTEGER', mode: 'NULLABLE' },
      { name: 'avg_price_per_unit', type: 'FLOAT', mode: 'NULLABLE' },
      { name: 'market_share_pct', type: 'FLOAT', mode: 'NULLABLE' },
      { name: 'growth_rate_pct', type: 'FLOAT', mode: 'NULLABLE' }
    ]);
    
    console.log('\n✅ All 18 tables created successfully!');
    console.log('\n📋 Summary:');
    console.log('- 4 Dimension tables');
    console.log('- 6 Fact tables'); 
    console.log('- 2 Catalog tables');
    console.log('- 6 Analytical tables');
    console.log('\n🌐 You can now view these tables in your Google Cloud BigQuery console:');
    console.log(`https://console.cloud.google.com/bigquery?project=data-practice-472314`);
    
  } catch (error) {
    console.error('❌ Error setting up BigQuery:', error);
    process.exit(1);
  }
}

// Run the setup
if (require.main === module) {
  setupAllTables();
}

export { setupAllTables };
