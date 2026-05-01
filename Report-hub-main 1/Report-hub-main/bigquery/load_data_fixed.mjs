// BigQuery Data Loading Script - Loads synthetic data into all 18 tables
import { BigQuery } from '@google-cloud/bigquery';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// BigQuery Configuration
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

// Helper function to insert data into BigQuery
async function insertData(tableId, rows) {
  if (!rows || rows.length === 0) {
    console.log(`No data to insert for ${tableId}`);
    return;
  }

  try {
    console.log(`Loading ${rows.length} rows into ${tableId}...`);
    
    const dataset = bigquery.dataset(datasetId);
    const table = dataset.table(tableId);
    
    const [job] = await table.insert(rows);
    
    console.log(`Job ${job.id} created for ${tableId}`);
    
    // Wait for job completion
    await job.getMetadata();
    console.log(`Successfully loaded data into ${tableId}`);
    
  } catch (error) {
    console.error(`Error loading data into ${tableId}:`, error);
    throw error;
  }
}

// Transform and load dimension tables
async function loadDimensionTables() {
  console.log('Loading dimension tables...');
  
  // dim_markets - Create sample data since JSON doesn't exist
  const markets = [
    { market_id: 'MKT-001', market_name: 'Northeast', description: 'Northeast region' },
    { market_id: 'MKT-002', market_name: 'Southeast', description: 'Southeast region' },
    { market_id: 'MKT-003', market_name: 'Midwest', description: 'Midwest region' },
    { market_id: 'MKT-004', market_name: 'West', description: 'West region' },
    { market_id: 'MKT-005', market_name: 'Southwest', description: 'Southwest region' }
  ];
  await insertData('dim_markets', markets);
  
  // dim_territories
  const territoriesData = await loadJsonFile('dim_territories.json');
  const territories = territoriesData.map(territory => ({
    territory_id: territory.territory_id,
    market_id: territory.market_id || `MKT-${territory.market_name?.toUpperCase().replace(/\s+/g, '-')}`,
    territory_name: territory.territory_name,
    region: territory.region || 'Unknown',
    manager: territory.manager || 'Unassigned'
  }));
  await insertData('dim_territories', territories);
  
  // dim_outlets
  const outletsData = await loadJsonFile('dim_outlets.json');
  const outlets = outletsData.map(outlet => ({
    outlet_id: outlet.outlet_id,
    territory_id: outlet.territory_id,
    outlet_name: outlet.outlet_name,
    city: outlet.city,
    state: outlet.state,
    zip_code: outlet.zip_code || '00000',
    outlet_type: outlet.outlet_type || 'Retail',
    square_footage: outlet.square_footage || 1000,
    employee_count: outlet.employee_count || 5
  }));
  await insertData('dim_outlets', outlets);
  
  // dim_devices
  const devicesData = await loadJsonFile('dim_devices.json');
  const devices = devicesData.map(device => ({
    device_id: device.device_id,
    device_name: device.device_name,
    device_group: device.device_group,
    manufacturer: device.manufacturer,
    model: device.model || device.device_name,
    price: device.price || 0,
    launch_date: device.launch_date ? new Date(device.launch_date) : new Date('2023-01-01'),
    discontinued_date: device.discontinued_date ? new Date(device.discontinued_date) : null
  }));
  await insertData('dim_devices', devices);
}

// Transform and load fact tables
async function loadFactTables() {
  console.log('Loading fact tables...');
  
  // fact_sug_sales_daily
  const salesDailyData = await loadJsonFile('fact_sug_sales_daily.json');
  const salesDaily = salesDailyData.map(sale => ({
    date_id: sale.date_id,
    outlet_id: sale.outlet_id,
    device_id: sale.device_id,
    sug_sales_units: sale.sug_sales_units,
    eligible_device_units: sale.eligible_device_units,
    sug_sales_revenue: sale.sug_sales_revenue,
    accessory_revenue: sale.accessory_revenue,
    return_units: sale.return_units,
    passing_surveys: sale.passing_surveys,
    total_surveys: sale.total_surveys,
    date: new Date(`2024-01-01`).setDate(sale.date_id % 365) // Generate date from date_id
  }));
  await insertData('fact_sug_sales_daily', salesDaily);
  
  // fact_sug_monthly_rollup
  const monthlyRollupData = await loadJsonFile('fact_sug_monthly_rollup.json');
  const monthlyRollup = monthlyRollupData.map(rollup => ({
    month_id: rollup.month_id,
    territory_id: rollup.territory_id,
    sug_revenue: rollup.sug_revenue,
    run_rate: rollup.run_rate,
    take_rate_pct: rollup.take_rate_pct,
    aard_pct: rollup.aard_pct,
    return_rate_pct: rollup.return_rate_pct,
    ris_pct: rollup.ris_pct,
    month: new Date(`${rollup.month_id.toString().slice(0,4)}-${rollup.month_id.toString().slice(-2)}-01`)
  }));
  await insertData('fact_sug_monthly_rollup', monthlyRollup);
  
  // fact_intraday_sales
  const intradayData = await loadJsonFile('fact_intraday_sales.json');
  const intraday = intradayData.map(sale => ({
    date_id: sale.date_id,
    hour: sale.hour,
    outlet_id: sale.outlet_id,
    device_group: sale.device_group,
    sales_units: sale.sales_units,
    sales_revenue: sale.sales_revenue,
    timestamp: new Date(`2024-01-01`).setHours(sale.hour)
  }));
  await insertData('fact_intraday_sales', intraday);
  
  // fact_network_kpi_points
  const networkKpiData = await loadJsonFile('fact_network_kpi_points.json');
  const networkKpi = networkKpiData.map(kpi => ({
    date_id: kpi.date_id,
    site_id: kpi.site_id,
    lat: kpi.lat,
    lon: kpi.lon,
    cqi: kpi.cqi,
    rsrp: kpi.rsrp,
    sinr: kpi.sinr,
    score: kpi.score,
    status: kpi.status,
    timestamp: new Date()
  }));
  await insertData('fact_network_kpi_points', networkKpi);
  
  // fact_contact_center_metrics
  const contactCenterData = await loadJsonFile('fact_contact_center_metrics.json');
  const contactCenter = contactCenterData.map(metric => ({
    employee_id: metric.employee_id,
    employee_name: metric.employee_name,
    box_close_pct: metric.box_close_pct,
    inb_aht_sec: metric.inb_aht_sec,
    transfer_pct: metric.transfer_pct,
    sales_time_pct: metric.sales_time_pct,
    hold_pct: metric.hold_pct,
    status: metric.status,
    date: new Date()
  }));
  await insertData('fact_contact_center_metrics', contactCenter);
  
  // fact_dynamic_scores
  const dynamicScoresData = await loadJsonFile('fact_dynamic_scores.json');
  const dynamicScores = dynamicScoresData.map(score => ({
    employee_id: score.employee_id,
    employee_name: score.employee_name,
    metric_1: score.metric_1,
    metric_2: score.metric_2,
    metric_3: score.metric_3,
    metric_4: score.metric_4,
    metric_5: score.metric_5,
    overall_score: score.overall_score,
    rank: score.rank,
    date: new Date()
  }));
  await insertData('fact_dynamic_scores', dynamicScores);
}

// Load catalog tables
async function loadCatalogTables() {
  console.log('Loading catalog tables...');
  
  // catalog_reports
  const reportsData = await loadJsonFile('catalog_reports.json');
  const reports = reportsData.map(report => ({
    ...report,
    last_updated_ts: new Date(report.last_updated_ts),
    created_date: report.created_date ? new Date(report.created_date) : null,
    key_kpis: report.key_kpis || [],
    primary_dimensions: report.primary_dimensions || [],
    top_insights: report.top_insights || [],
    known_limitations: report.known_limitations || [],
    recommended_actions: report.recommended_actions || [],
    related_reports: report.related_reports || [],
    used_by_roles: report.used_by_roles || []
  }));
  await insertData('catalog_reports', reports);
  
  // catalog_datasets
  const datasetsData = await loadJsonFile('catalog_datasets.json');
  const datasets = datasetsData.map(dataset => ({
    ...dataset,
    last_refresh_ts: new Date(dataset.last_refresh_ts),
    key_fields: dataset.key_fields || [],
    dataset_health: dataset.dataset_health || {
      freshness_status: 'Current',
      quality_score: 95,
      known_issues: []
    },
    primary_use_cases: dataset.primary_use_cases || [],
    connected_reports: dataset.connected_reports || [],
    migration_readiness: dataset.migration_readiness || {
      readiness_score: 85,
      risk_level: 'Low',
      estimated_effort: 'Medium',
      key_blockers: [],
      migration_window_recommendation: 'Off-peak hours'
    },
    downstream_systems: dataset.downstream_systems || []
  }));
  await insertData('catalog_datasets', datasets);
}

// Load analytical tables
async function loadAnalyticalTables() {
  console.log('Loading analytical tables...');
  
  // churn_monthly
  const churnData = await loadJsonFile('churn_monthly.json');
  const churn = churnData.map(churn => ({
    month: churn.month,
    churn_rate: churn.churn_rate,
    change_vs_previous_month: churn.change_vs_previous_month,
    month_date: new Date(churn.month + ' 2024')
  }));
  await insertData('churn_monthly', churn);
  
  // take_rate_monthly_trend
  const takeRateData = await loadJsonFile('take_rate_monthly_trend.json');
  const takeRate = takeRateData.map(trend => ({
    month: trend.month,
    take_rate: trend.take_rate,
    change_vs_previous_month: trend.change_vs_previous_month,
    month_date: new Date(trend.month + ' 2024')
  }));
  await insertData('take_rate_monthly_trend', takeRate);
  
  // market_segment_distribution
  const marketSegData = await loadJsonFile('market_segment_distribution.json');
  const marketSeg = marketSegData.map(seg => ({
    segment: seg.segment,
    percentage: seg.percentage,
    revenue: seg.revenue || 0,
    customer_count: Math.floor(Math.random() * 10000) + 1000,
    avg_revenue_per_customer: (seg.revenue || 0) / (Math.floor(Math.random() * 10000) + 1000)
  }));
  await insertData('market_segment_distribution', marketSeg);
  
  // segment_performance_trend
  const segPerfData = await loadJsonFile('segment_performance_trend.json');
  const segPerf = segPerfData.map(perf => ({
    segment: perf.segment,
    month: perf.month,
    performance_metric: perf.performance_metric,
    revenue: perf.revenue || 0,
    customer_count: Math.floor(Math.random() * 5000) + 500,
    month_date: new Date(perf.month + ' 2024')
  }));
  await insertData('segment_performance_trend', segPerf);
  
  // performance_by_region
  const perfByRegionData = await loadJsonFile('performance_by_region.json');
  const perfByRegion = perfByRegionData.map(perf => ({
    region: perf.region,
    performance_score: perf.performance_score,
    revenue: perf.revenue || 0,
    outlet_count: Math.floor(Math.random() * 50) + 10,
    employee_count: Math.floor(Math.random() * 200) + 50,
    avg_revenue_per_outlet: (perf.revenue || 0) / (Math.floor(Math.random() * 50) + 10)
  }));
  await insertData('performance_by_region', perfByRegion);
  
  // revenue_by_device_group
  const revByDeviceData = await loadJsonFile('revenue_by_device_group.json');
  const revByDevice = revByDeviceData.map(rev => ({
    device_group: rev.device_group,
    revenue: rev.revenue || 0,
    units_sold: Math.floor(Math.random() * 10000) + 1000,
    avg_price_per_unit: (rev.revenue || 0) / (Math.floor(Math.random() * 10000) + 1000),
    market_share_pct: rev.market_share_pct || 0,
    growth_rate_pct: rev.growth_rate_pct || 0
  }));
  await insertData('revenue_by_device_group', revByDevice);
}

// Main loading function
async function loadAllData() {
  try {
    console.log('🚀 Starting BigQuery data loading...');
    console.log(`Dataset: ${datasetId}`);
    console.log(`Project: data-practice-472314`);
    
    // Load all tables in order
    await loadDimensionTables();
    await loadFactTables();
    await loadCatalogTables();
    await loadAnalyticalTables();
    
    console.log('✅ All data loaded successfully!');
    console.log('\n📊 Tables loaded:');
    console.log('- 4 Dimension tables');
    console.log('- 6 Fact tables');
    console.log('- 2 Catalog tables');
    console.log('- 6 Analytical tables');
    console.log('\n🌐 You can now view the data in your Google Cloud BigQuery console:');
    console.log(`https://console.cloud.google.com/bigquery?project=data-practice-472314`);
    
  } catch (error) {
    console.error('❌ Error loading data:', error);
    process.exit(1);
  }
}

// Run the loading script
loadAllData();
