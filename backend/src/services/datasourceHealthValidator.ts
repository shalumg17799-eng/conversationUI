import { bigqueryClient, PROJECT_ID, DATASET } from '../lib/bigqueryClient';

export interface DatasourceHealthResult {
  isHealthy: boolean;
  message?: string;
}

let cachedHealthStatus: { isHealthy: boolean; timestamp: number } | null = null;
const CACHE_TTL_MS = 30000; // 30 seconds

export async function validateDatasourceHealth(): Promise<DatasourceHealthResult> {
  const now = Date.now();
  
  if (cachedHealthStatus && (now - cachedHealthStatus.timestamp) < CACHE_TTL_MS) {
    console.log(`[DatasourceHealthCheck] Using cached status: ${cachedHealthStatus.isHealthy ? 'healthy' : 'unavailable'}`);
    return {
      isHealthy: cachedHealthStatus.isHealthy,
      message: cachedHealthStatus.isHealthy ? undefined : 'Unable to retrieve data because the analytical datasource is currently unavailable.'
    };
  }

  console.log(`[DatasourceHealthCheck] Validating credentials and connection...`);

  try {
    const hasCredentials = !!(process.env.BQ_CLIENT_EMAIL && process.env.BQ_PRIVATE_KEY);
    
    if (!hasCredentials) {
      console.log(`[DatasourceAuthFailure] Missing credentials`);
      cachedHealthStatus = { isHealthy: false, timestamp: now };
      return {
        isHealthy: false,
        message: 'Unable to retrieve data because the analytical datasource is currently unavailable.'
      };
    }

    await bigqueryClient.dataset(DATASET).get({ autoCreate: false });
    
    console.log(`[DatasourceAvailable] project=${PROJECT_ID} dataset=${DATASET}`);
    cachedHealthStatus = { isHealthy: true, timestamp: now };
    return { isHealthy: true };
    
  } catch (err: any) {
    console.log(`[DatasourceAuthFailure] ${err.message}`);
    console.log(`[DatasourceUnavailable]`);
    cachedHealthStatus = { isHealthy: false, timestamp: now };
    return {
      isHealthy: false,
      message: 'Unable to retrieve data because the analytical datasource is currently unavailable.'
    };
  }
}
