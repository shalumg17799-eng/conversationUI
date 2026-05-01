// Frontend startup script
import { createServer } from 'vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const config = defineConfig({
  plugins: [react()],
  server: {
    port: 5178,
    host: true
  },
  root: '.',
  build: {
    outDir: '../dist'
  }
});

console.log('🚀 Starting frontend development server...');
console.log('📱 Frontend will be available at: http://localhost:5178');
console.log('📊 BigQuery Dashboard: http://localhost:5178/bigquery-dashboard');

createServer(config).then(server => {
  server.listen().then(() => {
    console.log('✅ Frontend server started successfully!');
  });
}).catch(error => {
  console.error('❌ Failed to start frontend:', error);
});
