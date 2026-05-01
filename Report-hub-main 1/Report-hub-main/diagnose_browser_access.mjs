// Diagnose browser accessibility issues
import fetch from 'node-fetch';

async function diagnoseBrowserAccess() {
  console.log('🔍 Diagnosing Browser Accessibility Issues...');
  console.log('=' .repeat(60));
  
  // Test backend
  console.log('\n1️⃣ Testing Backend Server (port 3001)');
  try {
    const backendResponse = await fetch('http://localhost:3001/api/health');
    const backendData = await backendResponse.json();
    console.log('✅ Backend Status:', backendData);
    console.log('✅ Backend is accessible');
  } catch (error) {
    console.log('❌ Backend Error:', error.message);
  }
  
  // Test frontend main page
  console.log('\n2️⃣ Testing Frontend Main Page (port 5178)');
  try {
    const frontendResponse = await fetch('http://localhost:5178');
    console.log('✅ Frontend Status:', frontendResponse.status);
    console.log('✅ Frontend is accessible');
    
    const content = await frontendResponse.text();
    console.log('✅ Content length:', content.length, 'characters');
    console.log('✅ First 200 chars:', content.substring(0, 200));
  } catch (error) {
    console.log('❌ Frontend Error:', error.message);
  }
  
  // Test BigQuery API
  console.log('\n3️⃣ Testing BigQuery API');
  try {
    const query = `SELECT COUNT(*) as count FROM \`data-practice-472314.report_hub_demo.INFORMATION_SCHEMA.TABLES\` WHERE table_type = 'BASE TABLE'`;
    const bqResponse = await fetch('http://localhost:3001/api/bigquery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    const bqData = await bqResponse.json();
    console.log('✅ BigQuery API Status:', bqResponse.status);
    console.log('✅ BigQuery Tables Count:', bqData);
  } catch (error) {
    console.log('❌ BigQuery API Error:', error.message);
  }
  
  console.log('\n' + '=' .repeat(60));
  console.log('📋 Browser Troubleshooting Checklist:');
  console.log('');
  console.log('🌐 Try these URLs in your browser:');
  console.log('• http://localhost:5178');
  console.log('• http://127.0.0.1:5178');
  console.log('• http://localhost:5178/bigquery-dashboard');
  console.log('');
  console.log('🔧 Browser Fixes:');
  console.log('1. Clear browser cache (Ctrl+F5 or Cmd+Shift+R)');
  console.log('2. Try incognito/private mode');
  console.log('3. Try different browser (Chrome, Firefox, Edge)');
  console.log('4. Check browser console for errors (F12 → Console)');
  console.log('5. Disable browser extensions temporarily');
  console.log('6. Check if firewall is blocking localhost');
  console.log('7. Try http://127.0.0.1:5178 instead of localhost');
  console.log('');
  console.log('📱 Expected Behavior:');
  console.log('• Main page should show login screen');
  console.log('• Dashboard should load after login');
  console.log('• BigQuery data should appear in dashboard');
  console.log('• No "process is not defined" errors');
}

diagnoseBrowserAccess();
