// Test both servers are accessible
import fetch from 'node-fetch';

async function testServers() {
  console.log('🧪 Testing Server Access...');
  
  try {
    // Test backend
    console.log('\n1️⃣ Testing Backend (port 3001)...');
    const backendResponse = await fetch('http://localhost:3001/api/health');
    const backendData = await backendResponse.json();
    console.log('✅ Backend Status:', backendData);
    
    // Test frontend
    console.log('\n2️⃣ Testing Frontend (port 5178)...');
    const frontendResponse = await fetch('http://localhost:5178');
    console.log('✅ Frontend Status:', frontendResponse.status);
    
    console.log('\n🎉 Both servers are accessible!');
    console.log('\n🌐 Access URLs:');
    console.log('• Frontend: http://localhost:5178');
    console.log('• BigQuery Dashboard: http://localhost:5178/bigquery-dashboard');
    console.log('• Backend API: http://localhost:3001/api/health');
    
  } catch (error) {
    console.error('❌ Server test failed:', error.message);
  }
}

testServers();
