// Test BigQuery integration
import fetch from 'node-fetch';

async function testIntegration() {
  console.log('🧪 Testing BigQuery Integration...');
  
  try {
    // Test backend health
    const healthResponse = await fetch('http://localhost:3001/api/health');
    const healthData = await healthResponse.json();
    console.log('✅ Backend Health:', healthData);
    
    // Test BigQuery connection
    const query = `SELECT COUNT(*) as total_tables FROM \`data-practice-472314.report_hub_demo.INFORMATION_SCHEMA.TABLES\` WHERE table_type = 'BASE TABLE'`;
    
    const bqResponse = await fetch('http://localhost:3001/api/bigquery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    
    const bqData = await bqResponse.json();
    console.log('✅ BigQuery Response:', bqData);
    
    console.log('🎉 Integration test complete!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testIntegration();
