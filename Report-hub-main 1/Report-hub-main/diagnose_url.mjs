// Diagnose URL accessibility issues
import fetch from 'node-fetch';

async function diagnoseURL() {
  console.log('🔍 Diagnosing URL accessibility...');
  
  const urls = [
    'http://localhost:5178',
    'http://127.0.0.1:5178',
    'http://0.0.0.0:5178'
  ];
  
  for (const url of urls) {
    try {
      console.log(`\n🌐 Testing: ${url}`);
      const response = await fetch(url, { timeout: 5000 });
      console.log(`✅ Status: ${response.status}`);
      console.log(`✅ Headers: ${response.headers.get('content-type')}`);
      
      if (response.ok) {
        const text = await response.text();
        console.log(`✅ Content length: ${text.length} characters`);
        console.log(`✅ First 100 chars: ${text.substring(0, 100)}...`);
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
  }
  
  // Test backend
  try {
    console.log(`\n🔧 Testing Backend: http://localhost:3001/api/health`);
    const backendResponse = await fetch('http://localhost:3001/api/health');
    const backendData = await backendResponse.json();
    console.log(`✅ Backend: ${JSON.stringify(backendData)}`);
  } catch (error) {
    console.log(`❌ Backend Error: ${error.message}`);
  }
  
  console.log('\n📋 Troubleshooting Tips:');
  console.log('1. Try opening http://localhost:5178 in browser directly');
  console.log('2. Try http://127.0.0.1:5178 if localhost doesn\'t work');
  console.log('3. Check if browser is blocking localhost connections');
  console.log('4. Try different browser (Chrome, Firefox, Edge)');
  console.log('5. Clear browser cache and refresh');
}

diagnoseURL();
