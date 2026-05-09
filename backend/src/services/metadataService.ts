import fs from 'fs';
import path from 'path';
import { bigqueryClient, PROJECT_ID, DATASET } from '../lib/bigqueryClient';

const METADATA_DIR = path.join(__dirname, '../../metadata');
const METADATA_FILE = path.join(METADATA_DIR, 'dataset_context.json');

export interface TableMetadata {
  table_name: string;
  columns: { name: string; type: string }[];
  description?: string;
}

export interface DatasetContext {
  lastUpdated: string;
  tables: TableMetadata[];
  aliases: Record<string, string>;
}

const DEFAULT_ALIASES: Record<string, string> = {
  region: 'territory_id',
  territory: 'territory_id',
  area: 'market_id',
  market: 'market_id',
  revenue: 'sug_revenue',
  sales: 'sales',
  takerate: 'take_rate',
  churn: 'churn_rate',
  employee: 'employee_id',
  agent: 'employee_id',
  device: 'device_group',
  product: 'device_group'
};

/**
 * Resolves a business term to a physical column name
 */
export function resolveAlias(term: string): string {
  const context = getMetadataContext();
  const aliases = context?.aliases || DEFAULT_ALIASES;
  return aliases[term.toLowerCase()] || term;
}

/**
 * Fetches schema metadata from BigQuery INFORMATION_SCHEMA
 */
export async function syncMetadata(): Promise<DatasetContext> {
  console.log('[Metadata] Syncing with BigQuery INFORMATION_SCHEMA...');
  
  const query = `
    SELECT 
      table_name, 
      column_name, 
      data_type
    FROM \`${PROJECT_ID}.${DATASET}.INFORMATION_SCHEMA.COLUMNS\`
    WHERE table_name NOT LIKE 'catalog_%'
  `;

  const [rows] = await bigqueryClient.query({ query });
  
  const tablesMap = new Map<string, TableMetadata>();
  
  rows.forEach((row: any) => {
    if (!tablesMap.has(row.table_name)) {
      tablesMap.set(row.table_name, {
        table_name: row.table_name,
        columns: []
      });
    }
    tablesMap.get(row.table_name)!.columns.push({
      name: row.column_name,
      type: row.data_type
    });
  });

  const context: DatasetContext = {
    lastUpdated: new Date().toISOString(),
    tables: Array.from(tablesMap.values()),
    aliases: DEFAULT_ALIASES
  };

  if (!fs.existsSync(METADATA_DIR)) {
    fs.mkdirSync(METADATA_DIR, { recursive: true });
  }

  fs.writeFileSync(METADATA_FILE, JSON.stringify(context, null, 2));
  console.log(`[Metadata] Context saved to ${METADATA_FILE}`);
  
  return context;
}

/**
 * Loads metadata context from local file
 */
export function getMetadataContext(): DatasetContext | null {
  if (!fs.existsSync(METADATA_FILE)) {
    return null;
  }
  try {
    const data = fs.readFileSync(METADATA_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('[Metadata] Error reading metadata file:', err);
    return null;
  }
}

/**
 * Formats metadata for LLM consumption
 */
export function getGroundedContextString(): string {
  const context = getMetadataContext();
  if (!context) return "No grounded metadata available.";

  let output = `DATASET CONTEXT (Last Updated: ${context.lastUpdated}):\n`;
  context.tables.forEach(table => {
    const cols = table.columns.map(c => c.name).join(', ');
    output += `- Table: ${table.table_name} | Columns: ${cols}\n`;
  });
  
  return output;
}
