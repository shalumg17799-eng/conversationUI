import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';

dotenv.config();

const projectId = process.env.BQ_PROJECT_ID || 'data-practice-472314';
const dataset = process.env.BQ_DATASET || 'report_hub_demo';

function buildBigQueryClient(): BigQuery {
  const clientEmail = process.env.BQ_CLIENT_EMAIL;
  const privateKey = process.env.BQ_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (clientEmail && privateKey) {
    return new BigQuery({ projectId, credentials: { client_email: clientEmail, private_key: privateKey } });
  }

  // Fall back to Application Default Credentials (gcloud auth)
  return new BigQuery({ projectId });
}

export const bigqueryClient = buildBigQueryClient();
export const DATASET = dataset;
export const PROJECT_ID = projectId;

export function qualifiedTable(tableName: string): string {
  return `\`${projectId}.${dataset}.${tableName}\``;
}

export async function runQuery(sql: string): Promise<any[]> {
  const [job] = await bigqueryClient.createQueryJob({ query: sql, location: 'US' });
  const [rows] = await job.getQueryResults();
  return rows;
}
