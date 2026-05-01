// Update application configuration to use new dataset
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

const newDatasetId = 'report_hub_demo';

// Update server.js to use new dataset
async function updateServerConfig() {
  try {
    console.log('🔄 Updating server.js configuration...');
    
    const serverPath = path.join(projectRoot, 'server.js');
    let serverContent = fs.readFileSync(serverPath, 'utf8');
    
    // Replace old dataset with new dataset
    serverContent = serverContent.replace(/const datasetId = 'telecom_demo';/, `const datasetId = '${newDatasetId}';`);
    
    fs.writeFileSync(serverPath, serverContent);
    console.log('✅ Updated server.js to use new dataset');
    
  } catch (error) {
    console.error('❌ Error updating server.js:', error.message);
  }
}

// Update bigquery.ts configuration
async function updateBigQueryConfig() {
  try {
    console.log('🔄 Updating BigQuery configuration...');
    
    const bigQueryPath = path.join(projectRoot, 'src', 'lib', 'bigquery.ts');
    let bigQueryContent = fs.readFileSync(bigQueryPath, 'utf8');
    
    // Replace old dataset with new dataset
    bigQueryContent = bigQueryContent.replace(/const datasetId = 'telecom_demo';/, `const datasetId = '${newDatasetId}';`);
    
    fs.writeFileSync(bigQueryPath, bigQueryContent);
    console.log('✅ Updated bigquery.ts to use new dataset');
    
  } catch (error) {
    console.error('❌ Error updating bigquery.ts:', error.message);
  }
}

// Update bigqueryRealService.ts configuration
async function updateBigQueryRealService() {
  try {
    console.log('🔄 Updating BigQuery Real Service configuration...');
    
    const servicePath = path.join(projectRoot, 'src', 'lib', 'bigqueryRealService.ts');
    let serviceContent = fs.readFileSync(servicePath, 'utf8');
    
    // Replace old dataset with new dataset
    serviceContent = serviceContent.replace(/const datasetId = 'telecom_demo';/, `const datasetId = '${newDatasetId}';`);
    
    fs.writeFileSync(servicePath, serviceContent);
    console.log('✅ Updated bigqueryRealService.ts to use new dataset');
    
  } catch (error) {
    console.error('❌ Error updating bigqueryRealService.ts:', error.message);
  }
}

// Main update function
async function updateAllConfigs() {
  console.log('🚀 Updating application configuration to use new dataset...');
  console.log(`New Dataset: ${newDatasetId}`);
  
  await updateServerConfig();
  await updateBigQueryConfig();
  await updateBigQueryRealService();
  
  console.log('\n✅ All configurations updated!');
  console.log('\n📋 Summary:');
  console.log('- Updated server.js to use report_hub_demo dataset');
  console.log('- Updated bigquery.ts to use report_hub_demo dataset');
  console.log('- Updated bigqueryRealService.ts to use report_hub_demo dataset');
  console.log('\n🔄 Please restart your server to apply changes:');
  console.log('npm run start');
  console.log('\n🌐 Your application will now use the new dataset with consistent tables!');
}

// Run the updates
updateAllConfigs();
