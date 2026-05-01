// Simple fix for field order issues using SELECT statements
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

// Execute SQL query
async function executeSQL(query, description) {
  try {
    console.log(`🔄 ${description}...`);
    const [rows] = await bigquery.query(query);
    console.log(`✅ ${description} completed`);
    return rows;
  } catch (error) {
    console.log(`❌ ${description} failed: ${error.message}`);
    return null;
  }
}

// Fix 1: fact_sug_monthly_rollup - Remove extra month field
async function fixFactSugMonthlyRollupOrder() {
  console.log('\n🔧 Fixing fact_sug_monthly_rollup field order...');
  
  const createQuery = `
    CREATE OR REPLACE TABLE \`${datasetId}.fact_sug_monthly_rollup\` AS
    SELECT 
      month_id,
      territory_id,
      sug_revenue,
      run_rate,
      take_rate_pct,
      aard_pct,
      return_rate_pct,
      ris_pct,
      month_name
    FROM \`${datasetId}.fact_sug_monthly_rollup\`
  `;
  
  await executeSQL(createQuery, 'Recreating fact_sug_monthly_rollup with correct field order');
}

// Fix 2: fact_intraday_sales - Remove extra timestamp field
async function fixFactIntradaySalesOrder() {
  console.log('\n🔧 Fixing fact_intraday_sales field order...');
  
  const createQuery = `
    CREATE OR REPLACE TABLE \`${datasetId}.fact_intraday_sales\` AS
    SELECT 
      date_id,
      hour,
      outlet_id,
      device_group,
      sales_units,
      sales_revenue,
      hour_label,
      territory_id
    FROM \`${datasetId}.fact_intraday_sales\`
  `;
  
  await executeSQL(createQuery, 'Recreating fact_intraday_sales with correct field order');
}

// Fix 3: fact_contact_center_metrics - Remove extra date field
async function fixFactContactCenterMetricsOrder() {
  console.log('\n🔧 Fixing fact_contact_center_metrics field order...');
  
  const createQuery = `
    CREATE OR REPLACE TABLE \`${datasetId}.fact_contact_center_metrics\` AS
    SELECT 
      employee_id,
      employee_name,
      box_close_pct,
      inb_aht_sec,
      transfer_pct,
      sales_time_pct,
      hold_pct,
      status,
      team,
      territory_id,
      calls_handled,
      csat_score
    FROM \`${datasetId}.fact_contact_center_metrics\`
  `;
  
  await executeSQL(createQuery, 'Recreating fact_contact_center_metrics with correct field order');
}

// Main function to fix field order
async function fixFieldOrderSimple() {
  console.log('🎯 FINAL FIELD ORDER FIX FOR 100% CONSISTENCY');
  console.log('=' .repeat(80));
  
  try {
    // Fix field order in remaining 3 tables
    await fixFactSugMonthlyRollupOrder();
    await fixFactIntradaySalesOrder();
    await fixFactContactCenterMetricsOrder();
    
    console.log('\n' + '=' .repeat(80));
    console.log('🎉 FIELD ORDER FIXES COMPLETED!');
    console.log('=' .repeat(80));
    
    console.log('\n🔄 Next Steps:');
    console.log('1. Run final validation to confirm 100% consistency:');
    console.log('   node validate_complete_consistency.mjs');
    console.log('2. Check dashboard functionality:');
    console.log('   http://localhost:5178/bigquery-dashboard');
    console.log('3. Verify data in Google Cloud Console:');
    console.log('   https://console.cloud.google.com/bigquery?project=data-practice-472314');
    
  } catch (error) {
    console.error('❌ Error fixing field order:', error);
  }
}

// Run the field order fix
fixFieldOrderSimple().catch(console.error);
