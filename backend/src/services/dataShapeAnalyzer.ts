import { ShapeSignature } from '../types';

// Column name patterns that indicate an ID/key column — numeric but not a metric.
// These should be treated as dimensions (or ignored) rather than measures.
const ID_COLUMN_PATTERNS = /(_id|_key|_code|_num|^id$|^key$|month_id|week_id|year_id|day_id|rank$)/i;

// A numeric column is an ID/key if:
//   1. Its name matches known ID patterns, OR
//   2. Its values are all integers with suspiciously high cardinality (unique per row) AND
//      the values don't look like money/rates (i.e. no decimal variance)
function isIdColumn(colName: string, rows: any[]): boolean {
  if (ID_COLUMN_PATTERNS.test(colName)) return true;

  // Secondary check: if all values are integers and cardinality = rowCount, it's likely a surrogate key
  const vals = rows.map(r => r[colName]).filter(v => v !== null && v !== undefined);
  if (vals.length === 0) return false;
  const allIntegers = vals.every(v => Number.isInteger(v));
  const unique = new Set(vals).size;
  return allIntegers && unique === rows.length;
}

/**
 * Detects the type of a column based on a sample value.
 */
const detectColumnType = (value: any): "numeric" | "categorical" | "datetime" => {
  if (value === null || value === undefined) return 'categorical';

  if (typeof value === 'number') return 'numeric';

  if (typeof value === 'string') {
    // Basic ISO Date check or Date string check
    const date = Date.parse(value);
    if (!isNaN(date) && value.length >= 10 && (value.includes('-') || value.includes('/'))) {
      return 'datetime';
    }
  }

  return 'categorical';
};

/**
 * Counts unique values in a column across all rows.
 */
const countUniqueValues = (rows: any[], columnName: string): number => {
  const uniqueValues = new Set(rows.map(row => row[columnName]));
  return uniqueValues.size;
};

export const analyzeDataShape = async (rows: any[]): Promise<ShapeSignature> => {
  // Layer 2: Data Shape Analyzer (deterministic)
  console.log('Layer 2 - Analyzing data shape');

  if (!rows || rows.length === 0) {
    return {
      rowCount: 0,
      columnCount: 0,
      columnTypes: {},
      dimensionColumns: [],
      measureColumns: [],
      isTimeSeries: false,
      cardinality: {},
      data: []
    };
  }

  const rowCount = rows.length;
  const columns = Object.keys(rows[0]);
  const columnCount = columns.length;
  
  const columnTypes: Record<string, "numeric" | "categorical" | "datetime"> = {};
  const cardinality: Record<string, number> = {};
  const dimensionColumns: string[] = [];
  const measureColumns: string[] = [];
  let timeColumn: string | undefined;
  let isTimeSeries = false;

  columns.forEach(col => {
    // Detect type using the first non-null value
    const firstNonNull = rows.find(r => r[col] !== null && r[col] !== undefined);
    const type = detectColumnType(firstNonNull ? firstNonNull[col] : null);
    
    columnTypes[col] = type;

    if (type === 'datetime') {
      isTimeSeries = true;
      timeColumn = col;
    } else if (type === 'numeric' && !isIdColumn(col, rows)) {
      measureColumns.push(col);
    } else {
      // Numeric ID columns are bucketed as dimensions (used for grouping, not aggregation)
      dimensionColumns.push(col);
    }
    
    // Calculate cardinality
    cardinality[col] = countUniqueValues(rows, col);
  });

  return {
    rowCount,
    columnCount,
    columnTypes,
    dimensionColumns,
    measureColumns,
    timeColumn,
    isTimeSeries,
    cardinality,
    data: rows
  };
};
