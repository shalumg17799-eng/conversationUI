// Simple API test script
import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3001/api';

async function testAPI() {
  try {
    console.log('Testing health endpoint...');
    const healthResponse = await fetch(`${API_BASE}/health`);
    const healthData = await healthResponse.json();
    console.log('Health check:', healthData);

    console.log('\nTesting BigQuery endpoint...');
    const queryResponse = await fetch(`${API_BASE}/bigquery`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: 'SELECT * FROM dim_plan ORDER BY price ASC'
      })
    });
    
    const queryData = await queryResponse.json();
    console.log('BigQuery response:', queryData);

  } catch (error) {
    console.error('API test failed:', error);
  }
}

testAPI();
