import express from 'express';
import cors from 'cors';
import { bigquery, executeQuery, TEST_MODE } from './src/lib/bigquery.js';

// Set TEST_MODE to false to use real BigQuery data
const USE_REAL_BIGQUERY = true; // Set to true when tables are created and loaded

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Mock data for testing (when TEST_MODE is true)
const mockData = {
  plans: [
    { plan_id: 'PLAN001', name: 'Basic Mobile', tier: 'Basic', price: 29.99, data_limit_gb: 5, hotspot_limit_gb: 2, international_countries: 0 },
    { plan_id: 'PLAN002', name: 'Premium Mobile', tier: 'Premium', price: 59.99, data_limit_gb: 20, hotspot_limit_gb: 10, international_countries: 25 },
    { plan_id: 'PLAN003', name: 'Unlimited Pro', tier: 'Unlimited', price: 89.99, data_limit_gb: -1, hotspot_limit_gb: 20, international_countries: 50 }
  ],
  subscribers: [
    { subscriber_id: 'SUB001', plan_id: 'PLAN001', device_id: 'DEV001', segment: 'Consumer', autopay_enabled: true, tenure_days: 180 },
    { subscriber_id: 'SUB002', plan_id: 'PLAN002', device_id: 'DEV002', segment: 'Business', autopay_enabled: false, tenure_days: 365 },
    { subscriber_id: 'SUB003', plan_id: 'PLAN003', device_id: 'DEV003', segment: 'Consumer', autopay_enabled: true, tenure_days: 730 }
  ],
  usage: [
    { date: '2025-04-28', subscriber_id: 'SUB001', data_gb_used: 3.2, hotspot_gb_used: 1.1, throttle_flag: false },
    { date: '2025-04-28', subscriber_id: 'SUB002', data_gb_used: 15.8, hotspot_gb_used: 5.2, throttle_flag: false },
    { date: '2025-04-28', subscriber_id: 'SUB003', data_gb_used: 45.1, hotspot_gb_used: 12.3, throttle_flag: false }
  ]
};

// BigQuery API endpoint
app.post('/api/bigquery', async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    console.log('🔥 [BACKEND] BigQuery API request received');
    console.log('🔥 [BACKEND] Query:', query.substring(0, 100) + '...');
    console.log('🔥 [BACKEND] Full query:', query);
    console.log('🔥 [BACKEND] USE_REAL_BIGQUERY:', USE_REAL_BIGQUERY);
    console.log('🔥 [BACKEND] TEST_MODE:', TEST_MODE);
    console.log('🔥 [BACKEND] Timestamp:', new Date().toISOString());

    // Use real BigQuery if enabled, otherwise fall back to mock data
    if (USE_REAL_BIGQUERY && !TEST_MODE) {
      console.log('🚀 [BACKEND] Using REAL BigQuery (not synthetic data)');
      try {
        const startTime = performance.now();
        const rows = await executeQuery(query);
        const endTime = performance.now();
        const duration = (endTime - startTime).toFixed(2);
        
        console.log('✅ [BACKEND] BigQuery query executed successfully!');
        console.log('✅ [BACKEND] Rows returned:', rows.length);
        console.log('✅ [BACKEND] Query duration:', duration, 'ms');
        console.log('✅ [BACKEND] Data source: REAL BIGQUERY (not synthetic)');
        console.log('✅ [BACKEND] Dataset: report_hub_demo');
        console.log('✅ [BACKEND] Project: data-practice-472314');
        
        if (rows.length > 0) {
          console.log('✅ [BACKEND] Sample row:', rows[0]);
        }
        
        return res.status(200).json(rows);
      } catch (bqError) {
        console.error('❌ [BACKEND] BigQuery execution error:', bqError);
        console.error('❌ [BACKEND] Error details:', bqError.message);
        // Fall back to mock data on BigQuery errors
        console.log('❌ [BACKEND] Falling back to mock data...');
      }
    }

    // Mock data fallback
    console.log('Using mock data for query:', query.substring(0, 50) + '...');

    // Enhanced mock query detection for all 18 tables
    if (query.includes('dim_markets')) {
      return res.status(200).json([
        { market_id: 'MKT-001', market_name: 'Northeast', description: 'Northeast region' },
        { market_id: 'MKT-002', market_name: 'Southeast', description: 'Southeast region' },
        { market_id: 'MKT-003', market_name: 'Midwest', description: 'Midwest region' },
        { market_id: 'MKT-004', market_name: 'West', description: 'West region' },
        { market_id: 'MKT-005', market_name: 'Southwest', description: 'Southwest region' }
      ]);
    } else if (query.includes('dim_territories')) {
      return res.status(200).json([
        { territory_id: 'TERR-001', market_id: 'MKT-001', territory_name: 'Boston Metro', region: 'Northeast', manager: 'John Smith' },
        { territory_id: 'TERR-002', market_id: 'MKT-001', territory_name: 'New York Metro', region: 'Northeast', manager: 'Jane Doe' },
        { territory_id: 'TERR-003', market_id: 'MKT-002', territory_name: 'Atlanta Metro', region: 'Southeast', manager: 'Bob Johnson' }
      ]);
    } else if (query.includes('dim_outlets')) {
      return res.status(200).json([
        { outlet_id: 'OUT-001', territory_id: 'TERR-001', outlet_name: 'Downtown Boston', city: 'Boston', state: 'MA', zip_code: '02101', outlet_type: 'Retail', square_footage: 2500, employee_count: 8 },
        { outlet_id: 'OUT-002', territory_id: 'TERR-001', outlet_name: 'Cambridge Store', city: 'Cambridge', state: 'MA', zip_code: '02142', outlet_type: 'Retail', square_footage: 1800, employee_count: 6 }
      ]);
    } else if (query.includes('dim_devices')) {
      return res.status(200).json([
        { device_id: 'DEV-001', device_name: 'iPhone 15 Pro', device_group: 'Premium', manufacturer: 'Apple', model: 'A3108', price: 999.99, launch_date: new Date('2023-09-15') },
        { device_id: 'DEV-002', device_name: 'Samsung Galaxy S24', device_group: 'Premium', manufacturer: 'Samsung', model: 'SM-S906U', price: 899.99, launch_date: new Date('2024-01-17') }
      ]);
    } else if (query.includes('fact_sug_sales_daily')) {
      return res.status(200).json([
        { date_id: 20240428, outlet_id: 'OUT-001', device_id: 'DEV-001', sug_sales_units: 25, eligible_device_units: 40, sug_sales_revenue: 24999.75, accessory_revenue: 1500.00, return_units: 2, passing_surveys: 22, total_surveys: 25, date: new Date('2024-04-28') },
        { date_id: 20240428, outlet_id: 'OUT-002', device_id: 'DEV-002', sug_sales_units: 18, eligible_device_units: 35, sug_sales_revenue: 16199.82, accessory_revenue: 1200.00, return_units: 1, passing_surveys: 16, total_surveys: 18, date: new Date('2024-04-28') }
      ]);
    } else if (query.includes('fact_sug_monthly_rollup')) {
      return res.status(200).json([
        { month_id: 202404, territory_id: 'TERR-001', sug_revenue: 150000.00, run_rate: 1800000.00, take_rate_pct: 62.5, aard_pct: 2.8, return_rate_pct: 4.2, ris_pct: 88.0, month: new Date('2024-04-01') },
        { month_id: 202404, territory_id: 'TERR-002', sug_revenue: 125000.00, run_rate: 1500000.00, take_rate_pct: 58.3, aard_pct: 3.1, return_rate_pct: 4.5, ris_pct: 86.5, month: new Date('2024-04-01') }
      ]);
    } else if (query.includes('catalog_reports')) {
      return res.status(200).json([
        { report_id: 'RPT-001', report_name: 'SU&G Performance Dashboard', domain: 'Sales', source_dataset_id: 'DS-001', last_updated_ts: new Date(), enterprise_flag: false, source_application: 'Tableau', business_owner: 'Sarah Johnson', description: 'Monitor SU&G sales performance' },
        { report_id: 'RPT-002', report_name: 'Customer Experience Metrics', domain: 'Customer Experience', source_dataset_id: 'DS-002', last_updated_ts: new Date(), enterprise_flag: false, source_application: 'Looker', business_owner: 'Michael Chen', description: 'Customer feedback and RIS scores' }
      ]);
    } else if (query.includes('catalog_datasets')) {
      return res.status(200).json([
        { dataset_id: 'DS-001', dataset_name: 'SU&G Sales Transactions', domain: 'Sales', last_refresh_ts: new Date(), refresh_frequency: 'Hourly', certified_flag: true, source_system: 'BigQuery', row_count: 1500000, field_count: 25 },
        { dataset_id: 'DS-002', dataset_name: 'Customer Feedback & RIS', domain: 'Customer Experience', last_refresh_ts: new Date(), refresh_frequency: 'Daily', certified_flag: true, source_system: 'BigQuery', row_count: 1000000, field_count: 30 }
      ]);
    } else if (query.includes('churn_monthly')) {
      return res.status(200).json([
        { month: 'Apr 2024', churn_rate: 4.2, change_vs_previous_month: -0.3, month_date: new Date('2024-04-01') },
        { month: 'Mar 2024', churn_rate: 4.5, change_vs_previous_month: 0.2, month_date: new Date('2024-03-01') }
      ]);
    } else if (query.includes('take_rate_monthly_trend')) {
      return res.status(200).json([
        { month: 'Apr 2024', take_rate: 58.5, change_vs_previous_month: 1.2, month_date: new Date('2024-04-01') },
        { month: 'Mar 2024', take_rate: 57.3, change_vs_previous_month: -0.8, month_date: new Date('2024-03-01') }
      ]);
    } else {
      // Generic mock response for other queries
      return res.status(200).json([]);
    }

  } catch (error) {
    console.error('BigQuery API Error:', error);
    res.status(500).json({ 
      error: 'Query execution failed',
      details: error.message 
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    test_mode: TEST_MODE
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
  console.log(`TEST_MODE: ${TEST_MODE}`);
  console.log('Available endpoints:');
  console.log('  POST /api/bigquery - Execute BigQuery queries');
  console.log('  GET  /api/health  - Health check');
});

export default app;
