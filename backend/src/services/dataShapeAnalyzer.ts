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

// Surrogate date keys: numeric columns that encode a date/period rather than a metric,
// e.g. month_id=202404, week_id, fiscal_period. `detectColumnType` sees a number and calls
// them 'numeric', which suppresses time-series detection. We catch them here first —
// by NAME (month_id, week_id, year_id, day_id, quarter_id, fiscal_period, period_id,
// date_id, time_id, incl. table-prefixed variants) or by VALUE (YYYYMM / YYYYMMDD ints).
const SURROGATE_DATE_KEY_PATTERNS = /(^|_)((month|week|year|day|quarter|period|date|time)_id|fiscal_period)$/i;

function isNumericDateSurrogate(value: any): boolean {
  if (typeof value !== 'number' || !Number.isInteger(value)) return false;
  const s = String(Math.abs(value));
  if (s.length === 6) { // YYYYMM (e.g. 202404)
    const y = +s.slice(0, 4), m = +s.slice(4, 6);
    return y >= 1900 && y <= 2200 && m >= 1 && m <= 12;
  }
  if (s.length === 8) { // YYYYMMDD (e.g. 20240401)
    const y = +s.slice(0, 4), m = +s.slice(4, 6), d = +s.slice(6, 8);
    return y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
  }
  return false;
}

// Classify a column, treating surrogate date keys as datetime BEFORE the generic
// numeric/string/date detection. Real ISO date strings still fall through to detectColumnType.
const classifyColumnType = (colName: string, sampleValue: any): "numeric" | "categorical" | "datetime" => {
  if (SURROGATE_DATE_KEY_PATTERNS.test(colName)) return 'datetime';
  if (isNumericDateSurrogate(sampleValue)) return 'datetime';
  return detectColumnType(sampleValue);
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
    // Detect type using the first non-null value. Surrogate date keys (month_id etc.)
    // are resolved to 'datetime' by name/value before the generic numeric detection.
    const firstNonNull = rows.find(r => r[col] !== null && r[col] !== undefined);
    const type = classifyColumnType(col, firstNonNull ? firstNonNull[col] : null);
    
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
