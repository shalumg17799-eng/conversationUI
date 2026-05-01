// Browser-safe BigQuery Service - Uses backend API instead of direct BigQuery client
// This prevents "process is not defined" errors in the browser

// Dataset configuration
export const DATASET = 'report_hub_demo';
export const PROJECT_ID = 'data-practice-472314';

// Backend API endpoint
const API_BASE = 'http://localhost:3001/api/bigquery';

// Helper function to execute BigQuery queries via backend API
export async function executeQuery(query: string): Promise<any[]> {
  try {
    console.log('🔥 [BIGQUERY] Executing query via backend API:', query.substring(0, 100) + '...');
    console.log('🔥 [BIGQUERY] Full query:', query);
    console.log('🔥 [BIGQUERY] API endpoint:', API_BASE);
    console.log('🔥 [BIGQUERY] Timestamp:', new Date().toISOString());
    
    const startTime = performance.now();
    
    const response = await fetch(API_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      console.error('❌ [BIGQUERY] HTTP error:', response.status, response.statusText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    const endTime = performance.now();
    const duration = (endTime - startTime).toFixed(2);
    
    console.log('✅ [BIGQUERY] Query completed successfully!');
    console.log('✅ [BIGQUERY] Rows returned:', result.length);
    console.log('✅ [BIGQUERY] Query duration:', duration, 'ms');
    console.log('✅ [BIGQUERY] Data source: REAL BIGQUERY (not synthetic)');
    console.log('✅ [BIGQUERY] Dataset: report_hub_demo');
    console.log('✅ [BIGQUERY] Project: data-practice-472314');
    
    if (result.length > 0) {
      console.log('✅ [BIGQUERY] Sample data (first row):', result[0]);
      console.log('✅ [BIGQUERY] Data keys:', Object.keys(result[0]));
    }
    
    return result;
  } catch (error) {
    console.error('❌ [BIGQUERY] Query failed:', error);
    console.error('❌ [BIGQUERY] Error details:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

// Helper function to build qualified table names
export function getTableName(tableName: string): string {
  return `\`${PROJECT_ID}.${DATASET}.${tableName}\``;
}

// Mock data for testing when backend is not available
const mockData = {
  dim_markets: [
    { market_id: 'M001', market_name: 'North Region' },
    { market_id: 'M002', market_name: 'South Region' },
    { market_id: 'M003', market_name: 'East Region' },
    { market_id: 'M004', market_name: 'West Region' },
    { market_id: 'M005', market_name: 'Central Region' }
  ],
  fact_sug_sales_daily: [
    { date_id: 20250427, outlet_id: 'OUT001', device_id: 'DEV001', sug_sales_units: 10, sug_sales_revenue: 500 },
    { date_id: 20250428, outlet_id: 'OUT002', device_id: 'DEV002', sug_sales_units: 15, sug_sales_revenue: 750 }
  ]
};

// Fallback function for testing
export async function executeQueryWithFallback(query: string): Promise<any[]> {
  try {
    return await executeQuery(query);
  } catch (error) {
    console.warn('Backend query failed, using mock data:', error instanceof Error ? error.message : String(error));
    
    // Return mock data based on query content
    if (query.includes('dim_markets')) {
      return mockData.dim_markets;
    } else if (query.includes('fact_sug_sales_daily')) {
      return mockData.fact_sug_sales_daily;
    }
    
    return [];
  }
}
