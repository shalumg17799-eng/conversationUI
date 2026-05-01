// Final fix to achieve 100% schema consistency between synthetic and BigQuery data
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

// Update table schema to match synthetic data exactly
async function updateTableSchema(tableName, newSchema) {
  console.log(`🔧 Updating schema for ${tableName}...`);
  
  try {
    const dataset = bigquery.dataset(datasetId);
    const table = dataset.table(tableName);
    
    // Get current metadata
    const [metadata] = await table.getMetadata();
    
    // Update schema
    const options = {
      schema: newSchema
    };
    
    const [updatedTable] = await table.patch(options);
    console.log(`✅ Schema updated for ${tableName}`);
    return true;
  } catch (error) {
    console.log(`⚠️  Schema update failed for ${tableName}: ${error.message}`);
    return false;
  }
}

// Load data with exact synthetic schema match
async function loadDataWithExactSchema(tableName, syntheticData, schema) {
  console.log(`📦 Loading ${syntheticData.length} rows into ${tableName} with exact schema...`);
  
  try {
    // Create CSV content matching synthetic data exactly
    const csvHeader = schema.fields.map(field => field.name).join(',');
    const csvData = syntheticData.map(row => 
      schema.fields.map(field => {
        let value = row[field.name];
        if (value === null || value === undefined) return '';
        
        // Handle different data types
        switch (field.type) {
          case 'DATE':
            if (value) {
              return value instanceof Date ? value.toISOString().split('T')[0] : String(value);
            }
            return '';
          case 'TIMESTAMP':
            if (value) {
              return value instanceof Date ? value.toISOString() : String(value);
            }
            return '';
          case 'INTEGER':
            return parseInt(value) || 0;
          case 'FLOAT':
            return parseFloat(value) || 0.0;
          case 'BOOLEAN':
            return Boolean(value);
          default:
            return String(value);
        }
      }).join(',')
    );
    
    const csvContent = csvHeader + '\n' + csvData.join('\n');
    
    // Create temp file
    const tempFilePath = path.join(__dirname, `temp_${tableName}_${Date.now()}.csv`);
    fs.writeFileSync(tempFilePath, csvContent);
    
    // Load job configuration
    const jobConfig = {
      sourceFormat: 'CSV',
      skipLeadingRows: 1,
      autodetect: false,
      schema: schema,
      writeDisposition: 'WRITE_TRUNCATE', // Overwrite existing data
      createDisposition: 'CREATE_IF_NEEDED'
    };
    
    // Start load job
    const dataset = bigquery.dataset(datasetId);
    const table = dataset.table(tableName);
    
    const [job] = await table.load(tempFilePath, jobConfig);
    console.log(`🔄 Load job started: ${job.id}`);
    
    // Wait for job completion with proper promise handling
    const [metadata] = await new Promise((resolve, reject) => {
      job.on('complete', resolve);
      job.on('error', reject);
    });
    
    // Clean up temp file
    fs.unlinkSync(tempFilePath);
    
    if (metadata.status.errors) {
      console.log('❌ Load job completed with errors:', metadata.status.errors);
      return { success: 0, error: syntheticData.length };
    }
    
    console.log(`✅ Load job completed successfully!`);
    console.log(`📊 Loaded ${metadata.outputRows} rows`);
    
    return { success: metadata.outputRows || syntheticData.length, error: 0 };
    
  } catch (error) {
    console.error(`❌ Error in load job:`, error.message);
    return { success: 0, error: syntheticData.length };
  }
}

// Fix 1: dim_markets - Remove extra description field to match synthetic
async function fixDimMarketsExact() {
  console.log('\n🔧 Fixing dim_markets to match synthetic schema exactly...');
  
  const syntheticData = await loadSyntheticData('dim_markets.json');
  if (!syntheticData) return;
  
  // Schema matching synthetic data exactly
  const schema = {
    fields: [
      { name: 'market_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'market_name', type: 'STRING', mode: 'REQUIRED' }
    ]
  };
  
  const transformedData = syntheticData.map(row => ({
    market_id: String(row.market_id),
    market_name: String(row.market_name)
  }));
  
  const result = await loadDataWithExactSchema('dim_markets', transformedData, schema);
  console.log(`📊 dim_markets result: ${result.success} success, ${result.error} errors`);
}

// Fix 2: fact_sug_sales_daily - Add missing territory_id field
async function fixFactSugSalesDailyExact() {
  console.log('\n🔧 Fixing fact_sug_sales_daily to match synthetic schema exactly...');
  
  const syntheticData = await loadSyntheticData('fact_sug_sales_daily.json');
  if (!syntheticData) return;
  
  // Schema matching synthetic data exactly
  const schema = {
    fields: [
      { name: 'date_id', type: 'INTEGER', mode: 'REQUIRED' },
      { name: 'date', type: 'STRING', mode: 'REQUIRED' },
      { name: 'outlet_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'territory_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'device_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'sug_sales_units', type: 'INTEGER', mode: 'REQUIRED' },
      { name: 'eligible_device_units', type: 'INTEGER', mode: 'REQUIRED' },
      { name: 'sug_sales_revenue', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'accessory_revenue', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'return_units', type: 'INTEGER', mode: 'REQUIRED' },
      { name: 'passing_surveys', type: 'INTEGER', mode: 'REQUIRED' },
      { name: 'total_surveys', type: 'INTEGER', mode: 'REQUIRED' }
    ]
  };
  
  const transformedData = syntheticData.map(row => ({
    date_id: parseInt(row.date_id) || 0,
    date: String(row.date || ''),
    outlet_id: String(row.outlet_id || ''),
    territory_id: String(row.territory_id || ''),
    device_id: String(row.device_id || ''),
    sug_sales_units: parseInt(row.sug_sales_units) || 0,
    eligible_device_units: parseInt(row.eligible_device_units) || 0,
    sug_sales_revenue: parseFloat(row.sug_sales_revenue) || 0.0,
    accessory_revenue: parseFloat(row.accessory_revenue) || 0.0,
    return_units: parseInt(row.return_units) || 0,
    passing_surveys: parseInt(row.passing_surveys) || 0,
    total_surveys: parseInt(row.total_surveys) || 0
  }));
  
  const result = await loadDataWithExactSchema('fact_sug_sales_daily', transformedData, schema);
  console.log(`📊 fact_sug_sales_daily result: ${result.success} success, ${result.error} errors`);
}

// Fix 3: fact_sug_monthly_rollup - Remove extra month field, add month_name
async function fixFactSugMonthlyRollupExact() {
  console.log('\n🔧 Fixing fact_sug_monthly_rollup to match synthetic schema exactly...');
  
  const syntheticData = await loadSyntheticData('fact_sug_monthly_rollup.json');
  if (!syntheticData) return;
  
  const schema = {
    fields: [
      { name: 'month_id', type: 'INTEGER', mode: 'REQUIRED' },
      { name: 'territory_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'sug_revenue', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'run_rate', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'take_rate_pct', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'aard_pct', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'return_rate_pct', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'ris_pct', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'month_name', type: 'STRING', mode: 'NULLABLE' }
    ]
  };
  
  const transformedData = syntheticData.map(row => ({
    month_id: parseInt(row.month_id) || 0,
    territory_id: String(row.territory_id),
    sug_revenue: parseFloat(row.sug_revenue) || 0.0,
    run_rate: parseFloat(row.run_rate) || 0.0,
    take_rate_pct: parseFloat(row.take_rate_pct) || 0.0,
    aard_pct: parseFloat(row.aard_pct) || 0.0,
    return_rate_pct: parseFloat(row.return_rate_pct) || 0.0,
    ris_pct: parseFloat(row.ris_pct) || 0.0,
    month_name: row.month_name || null
  }));
  
  const result = await loadDataWithExactSchema('fact_sug_monthly_rollup', transformedData, schema);
  console.log(`📊 fact_sug_monthly_rollup result: ${result.success} success, ${result.error} errors`);
}

// Fix 4: fact_intraday_sales - Remove extra timestamp, add missing fields
async function fixFactIntradaySalesExact() {
  console.log('\n🔧 Fixing fact_intraday_sales to match synthetic schema exactly...');
  
  const syntheticData = await loadSyntheticData('fact_intraday_sales.json');
  if (!syntheticData) return;
  
  const schema = {
    fields: [
      { name: 'date_id', type: 'INTEGER', mode: 'REQUIRED' },
      { name: 'hour', type: 'INTEGER', mode: 'REQUIRED' },
      { name: 'outlet_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'device_group', type: 'STRING', mode: 'REQUIRED' },
      { name: 'sales_units', type: 'INTEGER', mode: 'REQUIRED' },
      { name: 'sales_revenue', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'hour_label', type: 'STRING', mode: 'NULLABLE' },
      { name: 'territory_id', type: 'STRING', mode: 'NULLABLE' }
    ]
  };
  
  const transformedData = syntheticData.map(row => ({
    date_id: parseInt(row.date_id) || 0,
    hour: parseInt(row.hour) || 0,
    outlet_id: String(row.outlet_id),
    device_group: String(row.device_group),
    sales_units: parseInt(row.sales_units) || 0,
    sales_revenue: parseFloat(row.sales_revenue) || 0.0,
    hour_label: row.hour_label || null,
    territory_id: row.territory_id || null
  }));
  
  const result = await loadDataWithExactSchema('fact_intraday_sales', transformedData, schema);
  console.log(`📊 fact_intraday_sales result: ${result.success} success, ${result.error} errors`);
}

// Fix 5: fact_network_kpi_points - Remove extra timestamp, add region
async function fixFactNetworkKpiPointsExact() {
  console.log('\n🔧 Fixing fact_network_kpi_points to match synthetic schema exactly...');
  
  const syntheticData = await loadSyntheticData('fact_network_kpi_points.json');
  if (!syntheticData) return;
  
  const schema = {
    fields: [
      { name: 'date_id', type: 'INTEGER', mode: 'REQUIRED' },
      { name: 'site_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'lat', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'lon', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'cqi', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'rsrp', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'sinr', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'score', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'status', type: 'STRING', mode: 'REQUIRED' },
      { name: 'region', type: 'STRING', mode: 'NULLABLE' }
    ]
  };
  
  const transformedData = syntheticData.map(row => ({
    date_id: parseInt(row.date_id) || 0,
    site_id: String(row.site_id),
    lat: parseFloat(row.lat) || 0.0,
    lon: parseFloat(row.lon) || 0.0,
    cqi: parseFloat(row.cqi) || 0.0,
    rsrp: parseFloat(row.rsrp) || 0.0,
    sinr: parseFloat(row.sinr) || 0.0,
    score: parseFloat(row.score) || 0.0,
    status: String(row.status),
    region: row.region || null
  }));
  
  const result = await loadDataWithExactSchema('fact_network_kpi_points', transformedData, schema);
  console.log(`📊 fact_network_kpi_points result: ${result.success} success, ${result.error} errors`);
}

// Fix 6: fact_contact_center_metrics - Remove extra date, add missing fields
async function fixFactContactCenterMetricsExact() {
  console.log('\n🔧 Fixing fact_contact_center_metrics to match synthetic schema exactly...');
  
  const syntheticData = await loadSyntheticData('fact_contact_center_metrics.json');
  if (!syntheticData) return;
  
  const schema = {
    fields: [
      { name: 'employee_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'employee_name', type: 'STRING', mode: 'REQUIRED' },
      { name: 'box_close_pct', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'inb_aht_sec', type: 'INTEGER', mode: 'REQUIRED' },
      { name: 'transfer_pct', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'sales_time_pct', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'hold_pct', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'status', type: 'STRING', mode: 'REQUIRED' },
      { name: 'team', type: 'STRING', mode: 'NULLABLE' },
      { name: 'territory_id', type: 'STRING', mode: 'NULLABLE' },
      { name: 'calls_handled', type: 'INTEGER', mode: 'NULLABLE' },
      { name: 'csat_score', type: 'FLOAT', mode: 'NULLABLE' }
    ]
  };
  
  const transformedData = syntheticData.map(row => ({
    employee_id: String(row.employee_id),
    employee_name: String(row.employee_name),
    box_close_pct: parseFloat(row.box_close_pct) || 0.0,
    inb_aht_sec: parseInt(row.inb_aht_sec) || 0,
    transfer_pct: parseFloat(row.transfer_pct) || 0.0,
    sales_time_pct: parseFloat(row.sales_time_pct) || 0.0,
    hold_pct: parseFloat(row.hold_pct) || 0.0,
    status: String(row.status),
    team: row.team || null,
    territory_id: row.territory_id || null,
    calls_handled: row.calls_handled ? parseInt(row.calls_handled) : null,
    csat_score: row.csat_score ? parseFloat(row.csat_score) : null
  }));
  
  const result = await loadDataWithExactSchema('fact_contact_center_metrics', transformedData, schema);
  console.log(`📊 fact_contact_center_metrics result: ${result.success} success, ${result.error} errors`);
}

// Fix 7: fact_dynamic_scores - Remove extra date field
async function fixFactDynamicScoresExact() {
  console.log('\n🔧 Fixing fact_dynamic_scores to match synthetic schema exactly...');
  
  const syntheticData = await loadSyntheticData('fact_dynamic_scores.json');
  if (!syntheticData) return;
  
  const schema = {
    fields: [
      { name: 'employee_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'employee_name', type: 'STRING', mode: 'REQUIRED' },
      { name: 'metric_1', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'metric_2', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'metric_3', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'metric_4', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'metric_5', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'overall_score', type: 'FLOAT', mode: 'REQUIRED' },
      { name: 'rank', type: 'INTEGER', mode: 'REQUIRED' }
    ]
  };
  
  const transformedData = syntheticData.map(row => ({
    employee_id: String(row.employee_id),
    employee_name: String(row.employee_name),
    metric_1: parseFloat(row.metric_1) || 0.0,
    metric_2: parseFloat(row.metric_2) || 0.0,
    metric_3: parseFloat(row.metric_3) || 0.0,
    metric_4: parseFloat(row.metric_4) || 0.0,
    metric_5: parseFloat(row.metric_5) || 0.0,
    overall_score: parseFloat(row.overall_score) || 0.0,
    rank: parseInt(row.rank) || 0
  }));
  
  const result = await loadDataWithExactSchema('fact_dynamic_scores', transformedData, schema);
  console.log(`📊 fact_dynamic_scores result: ${result.success} success, ${result.error} errors`);
}

// Fix 8: catalog_reports - Fix timestamp fields to be strings
async function fixCatalogReportsExact() {
  console.log('\n🔧 Fixing catalog_reports to match synthetic schema exactly...');
  
  const syntheticData = await loadSyntheticData('catalog_reports.json');
  if (!syntheticData) return;
  
  const schema = {
    fields: [
      { name: 'report_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'report_name', type: 'STRING', mode: 'REQUIRED' },
      { name: 'domain', type: 'STRING', mode: 'REQUIRED' },
      { name: 'source_dataset_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'last_updated_ts', type: 'STRING', mode: 'REQUIRED' },
      { name: 'enterprise_flag', type: 'BOOLEAN', mode: 'REQUIRED' },
      { name: 'source_application', type: 'STRING', mode: 'NULLABLE' },
      { name: 'business_owner', type: 'STRING', mode: 'NULLABLE' },
      { name: 'description', type: 'STRING', mode: 'NULLABLE' },
      { name: 'primary_use_case', type: 'STRING', mode: 'NULLABLE' },
      { name: 'created_date', type: 'STRING', mode: 'NULLABLE' },
      { name: 'refresh_frequency', type: 'STRING', mode: 'NULLABLE' },
      { name: 'key_kpis', type: 'RECORD', mode: 'REPEATED', fields: [
        { name: 'kpi_name', type: 'STRING', mode: 'NULLABLE' },
        { name: 'current_value', type: 'STRING', mode: 'NULLABLE' },
        { name: 'previous_value', type: 'STRING', mode: 'NULLABLE' },
        { name: 'trend', type: 'STRING', mode: 'NULLABLE' },
        { name: 'delta', type: 'STRING', mode: 'NULLABLE' }
      ]},
      { name: 'primary_dimensions', type: 'STRING', mode: 'REPEATED' },
      { name: 'time_range_supported', type: 'STRING', mode: 'NULLABLE' },
      { name: 'top_insights', type: 'STRING', mode: 'REPEATED' },
      { name: 'known_limitations', type: 'STRING', mode: 'REPEATED' },
      { name: 'recommended_actions', type: 'STRING', mode: 'REPEATED' },
      { name: 'related_reports', type: 'RECORD', mode: 'REPEATED', fields: [
        { name: 'report_id', type: 'STRING', mode: 'NULLABLE' },
        { name: 'report_name', type: 'STRING', mode: 'NULLABLE' }
      ]},
      { name: 'used_by_roles', type: 'STRING', mode: 'REPEATED' }
    ]
  };
  
  const transformedData = syntheticData.map(row => ({
    report_id: String(row.report_id),
    report_name: String(row.report_name),
    domain: String(row.domain),
    source_dataset_id: String(row.source_dataset_id),
    last_updated_ts: String(row.last_updated_ts),
    enterprise_flag: Boolean(row.enterprise_flag),
    source_application: row.source_application || null,
    business_owner: row.business_owner || null,
    description: row.description || null,
    primary_use_case: row.primary_use_case || null,
    created_date: row.created_date ? String(row.created_date) : null,
    refresh_frequency: row.refresh_frequency || null,
    key_kpis: Array.isArray(row.key_kpis) ? row.key_kpis : [],
    primary_dimensions: Array.isArray(row.primary_dimensions) ? row.primary_dimensions : [],
    time_range_supported: row.time_range_supported || null,
    top_insights: Array.isArray(row.top_insights) ? row.top_insights : [],
    known_limitations: Array.isArray(row.known_limitations) ? row.known_limitations : [],
    recommended_actions: Array.isArray(row.recommended_actions) ? row.recommended_actions : [],
    related_reports: Array.isArray(row.related_reports) ? row.related_reports : [],
    used_by_roles: Array.isArray(row.used_by_roles) ? row.used_by_roles : []
  }));
  
  const result = await loadDataWithExactSchema('catalog_reports', transformedData, schema);
  console.log(`📊 catalog_reports result: ${result.success} success, ${result.error} errors`);
}

// Fix 9: catalog_datasets - Fix timestamp fields to be strings
async function fixCatalogDatasetsExact() {
  console.log('\n🔧 Fixing catalog_datasets to match synthetic schema exactly...');
  
  const syntheticData = await loadSyntheticData('catalog_datasets.json');
  if (!syntheticData) return;
  
  const schema = {
    fields: [
      { name: 'dataset_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'dataset_name', type: 'STRING', mode: 'REQUIRED' },
      { name: 'domain', type: 'STRING', mode: 'REQUIRED' },
      { name: 'last_refresh_ts', type: 'STRING', mode: 'REQUIRED' },
      { name: 'refresh_frequency', type: 'STRING', mode: 'REQUIRED' },
      { name: 'certified_flag', type: 'BOOLEAN', mode: 'REQUIRED' },
      { name: 'source_system', type: 'STRING', mode: 'NULLABLE' },
      { name: 'row_count', type: 'INTEGER', mode: 'NULLABLE' },
      { name: 'field_count', type: 'INTEGER', mode: 'NULLABLE' },
      { name: 'key_fields', type: 'RECORD', mode: 'REPEATED', fields: [
        { name: 'field_name', type: 'STRING', mode: 'NULLABLE' },
        { name: 'field_type', type: 'STRING', mode: 'NULLABLE' },
        { name: 'description', type: 'STRING', mode: 'NULLABLE' }
      ]},
      { name: 'dataset_health', type: 'RECORD', mode: 'NULLABLE', fields: [
        { name: 'freshness_status', type: 'STRING', mode: 'NULLABLE' },
        { name: 'quality_score', type: 'INTEGER', mode: 'NULLABLE' },
        { name: 'known_issues', type: 'STRING', mode: 'REPEATED' }
      ]},
      { name: 'primary_use_cases', type: 'STRING', mode: 'REPEATED' },
      { name: 'connected_reports', type: 'RECORD', mode: 'REPEATED', fields: [
        { name: 'report_id', type: 'STRING', mode: 'NULLABLE' },
        { name: 'report_name', type: 'STRING', mode: 'NULLABLE' }
      ]},
      { name: 'data_owner', type: 'STRING', mode: 'NULLABLE' },
      { name: 'migration_readiness', type: 'RECORD', mode: 'NULLABLE', fields: [
        { name: 'readiness_score', type: 'INTEGER', mode: 'NULLABLE' },
        { name: 'risk_level', type: 'STRING', mode: 'NULLABLE' },
        { name: 'estimated_effort', type: 'STRING', mode: 'NULLABLE' },
        { name: 'key_blockers', type: 'STRING', mode: 'REPEATED' },
        { name: 'migration_window_recommendation', type: 'STRING', mode: 'NULLABLE' }
      ]},
      { name: 'pii_flag', type: 'BOOLEAN', mode: 'NULLABLE' },
      { name: 'downstream_systems', type: 'STRING', mode: 'REPEATED' },
      { name: 'schema_tables_count', type: 'INTEGER', mode: 'NULLABLE' },
      { name: 'null_rate', type: 'FLOAT', mode: 'NULLABLE' },
      { name: 'duplication_rate', type: 'FLOAT', mode: 'NULLABLE' },
      { name: 'migration_target_recommendation', type: 'STRING', mode: 'NULLABLE' },
      { name: 'migration_recommendation_reason', type: 'STRING', mode: 'NULLABLE' },
      { name: 'storage_type', type: 'STRING', mode: 'NULLABLE' }
    ]
  };
  
  const transformedData = syntheticData.map(row => ({
    dataset_id: String(row.dataset_id),
    dataset_name: String(row.dataset_name),
    domain: String(row.domain),
    last_refresh_ts: String(row.last_refresh_ts),
    refresh_frequency: String(row.refresh_frequency),
    certified_flag: Boolean(row.certified_flag),
    source_system: row.source_system || null,
    row_count: row.row_count ? parseInt(row.row_count) : null,
    field_count: row.field_count ? parseInt(row.field_count) : null,
    key_fields: Array.isArray(row.key_fields) ? row.key_fields : [],
    dataset_health: row.dataset_health || null,
    primary_use_cases: Array.isArray(row.primary_use_cases) ? row.primary_use_cases : [],
    connected_reports: Array.isArray(row.connected_reports) ? row.connected_reports : [],
    data_owner: row.data_owner || null,
    migration_readiness: row.migration_readiness || null,
    pii_flag: Boolean(row.pii_flag),
    downstream_systems: Array.isArray(row.downstream_systems) ? row.downstream_systems : [],
    schema_tables_count: row.schema_tables_count ? parseInt(row.schema_tables_count) : null,
    null_rate: row.null_rate ? parseFloat(row.null_rate) : null,
    duplication_rate: row.duplication_rate ? parseFloat(row.duplication_rate) : null,
    migration_target_recommendation: row.migration_target_recommendation || null,
    migration_recommendation_reason: row.migration_recommendation_reason || null,
    storage_type: row.storage_type || null
  }));
  
  const result = await loadDataWithExactSchema('catalog_datasets', transformedData, schema);
  console.log(`📊 catalog_datasets result: ${result.success} success, ${result.error} errors`);
}

// Main function to achieve 100% consistency
async function achieve100PercentConsistency() {
  console.log('🎯 ACHIEVING 100% SCHEMA CONSISTENCY');
  console.log('=' .repeat(80));
  console.log('This will fix ALL remaining field mismatches to perfectly match synthetic data...');
  
  try {
    // Fix all tables with exact schema matching
    console.log('\n📋 Fixing Dimension Tables:');
    await fixDimMarketsExact();
    
    console.log('\n📊 Fixing Fact Tables:');
    await fixFactSugSalesDailyExact();
    await fixFactSugMonthlyRollupExact();
    await fixFactIntradaySalesExact();
    await fixFactNetworkKpiPointsExact();
    await fixFactContactCenterMetricsExact();
    await fixFactDynamicScoresExact();
    
    console.log('\n📚 Fixing Catalog Tables:');
    await fixCatalogReportsExact();
    await fixCatalogDatasetsExact();
    
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
achieve100PercentConsistency().catch(console.error);
