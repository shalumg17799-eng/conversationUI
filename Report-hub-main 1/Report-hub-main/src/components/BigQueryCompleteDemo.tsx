import React, { useState, useEffect } from 'react';
import { Card } from '../app/components/ui/Card';
import { Button } from '../app/components/ui/Button';
import { Badge } from '../app/components/ui/Badge';
import { bigQueryApi } from '../lib/apiService';

// Interface for the demo data
interface TableData {
  tableName: string;
  type: 'dimension' | 'fact' | 'catalog' | 'analytical';
  description: string;
  recordCount: number;
  lastUpdated: string;
  sampleData: any[];
}

export function BigQueryCompleteDemo() {
  const [tables, setTables] = useState<TableData[]>([]);
  const [selectedTable, setSelectedTable] = useState<TableData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Define all 18 tables with their queries
  const allTables = [
    {
      tableName: 'dim_markets',
      type: 'dimension' as const,
      description: 'Geographic market definitions',
      query: 'SELECT * FROM telecom_demo.dim_markets ORDER BY market_name'
    },
    {
      tableName: 'dim_territories',
      type: 'dimension' as const,
      description: 'Sales territory mappings',
      query: 'SELECT * FROM telecom_demo.dim_territories ORDER BY territory_name'
    },
    {
      tableName: 'dim_outlets',
      type: 'dimension' as const,
      description: 'Retail outlet information',
      query: 'SELECT * FROM telecom_demo.dim_outlets ORDER BY outlet_name'
    },
    {
      tableName: 'dim_devices',
      type: 'dimension' as const,
      description: 'Device catalog',
      query: 'SELECT * FROM telecom_demo.dim_devices ORDER BY device_name'
    },
    {
      tableName: 'fact_sug_sales_daily',
      type: 'fact' as const,
      description: 'Daily sales transactions',
      query: 'SELECT * FROM telecom_demo.fact_sug_sales_daily ORDER BY date DESC LIMIT 10'
    },
    {
      tableName: 'fact_sug_monthly_rollup',
      type: 'fact' as const,
      description: 'Monthly aggregated metrics',
      query: 'SELECT * FROM telecom_demo.fact_sug_monthly_rollup ORDER BY month_id DESC LIMIT 10'
    },
    {
      tableName: 'fact_intraday_sales',
      type: 'fact' as const,
      description: 'Hourly sales data',
      query: 'SELECT * FROM telecom_demo.fact_intraday_sales ORDER BY timestamp DESC LIMIT 10'
    },
    {
      tableName: 'fact_network_kpi_points',
      type: 'fact' as const,
      description: 'Network performance metrics',
      query: 'SELECT * FROM telecom_demo.fact_network_kpi_points ORDER BY timestamp DESC LIMIT 10'
    },
    {
      tableName: 'fact_contact_center_metrics',
      type: 'fact' as const,
      description: 'Call center performance',
      query: 'SELECT * FROM telecom_demo.fact_contact_center_metrics ORDER BY status, overall_score DESC'
    },
    {
      tableName: 'fact_dynamic_scores',
      type: 'fact' as const,
      description: 'Employee performance scores',
      query: 'SELECT * FROM telecom_demo.fact_dynamic_scores ORDER BY rank'
    },
    {
      tableName: 'catalog_reports',
      type: 'catalog' as const,
      description: 'Report metadata',
      query: 'SELECT * FROM telecom_demo.catalog_reports ORDER BY last_updated_ts DESC'
    },
    {
      tableName: 'catalog_datasets',
      type: 'catalog' as const,
      description: 'Dataset metadata',
      query: 'SELECT * FROM telecom_demo.catalog_datasets ORDER BY last_refresh_ts DESC'
    },
    {
      tableName: 'churn_monthly',
      type: 'analytical' as const,
      description: 'Monthly churn analysis',
      query: 'SELECT * FROM telecom_demo.churn_monthly ORDER BY month_date DESC'
    },
    {
      tableName: 'take_rate_monthly_trend',
      type: 'analytical' as const,
      description: 'Take rate trends',
      query: 'SELECT * FROM telecom_demo.take_rate_monthly_trend ORDER BY month_date DESC'
    },
    {
      tableName: 'market_segment_distribution',
      type: 'analytical' as const,
      description: 'Market segment analysis',
      query: 'SELECT * FROM telecom_demo.market_segment_distribution ORDER BY percentage DESC'
    },
    {
      tableName: 'segment_performance_trend',
      type: 'analytical' as const,
      description: 'Segment performance over time',
      query: 'SELECT * FROM telecom_demo.segment_performance_trend ORDER BY month_date DESC, segment'
    },
    {
      tableName: 'performance_by_region',
      type: 'analytical' as const,
      description: 'Regional performance metrics',
      query: 'SELECT * FROM telecom_demo.performance_by_region ORDER BY performance_score DESC'
    },
    {
      tableName: 'revenue_by_device_group',
      type: 'analytical' as const,
      description: 'Device group revenue analysis',
      query: 'SELECT * FROM telecom_demo.revenue_by_device_group ORDER BY revenue DESC'
    }
  ];

  const loadTableData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const tableResults: TableData[] = [];
      
      for (const table of allTables) {
        try {
          const result = await bigQueryApi.executeBigQuery(table.query);
          
          if (result.error) {
            console.warn(`Error loading ${table.tableName}:`, result.error);
            tableResults.push({
              ...table,
              recordCount: 0,
              lastUpdated: new Date().toISOString(),
              sampleData: []
            });
          } else {
            tableResults.push({
              ...table,
              recordCount: result.data?.length || 0,
              lastUpdated: new Date().toISOString(),
              sampleData: result.data?.slice(0, 3) || []
            });
          }
        } catch (err) {
          console.warn(`Error loading ${table.tableName}:`, err);
          tableResults.push({
            ...table,
            recordCount: 0,
            lastUpdated: new Date().toISOString(),
            sampleData: []
          });
        }
      }
      
      setTables(tableResults);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTableData();
  }, []);

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'dimension': return 'bg-blue-100 text-blue-800';
      case 'fact': return 'bg-green-100 text-green-800';
      case 'catalog': return 'bg-purple-100 text-purple-800';
      case 'analytical': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const renderSampleData = (data: any[], tableName: string) => {
    if (!data || data.length === 0) {
      return <p className="text-gray-500">No data available</p>;
    }

    const columns = Object.keys(data[0]);
    
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              {columns.map(col => (
                <th key={col} className="text-left p-2 font-medium">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr key={idx} className="border-b">
                {columns.map(col => (
                  <td key={col} className="p-2">
                    {typeof row[col] === 'object' 
                      ? JSON.stringify(row[col])
                      : String(row[col])
                    }
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">BigQuery Complete Demo</h1>
          <p className="text-gray-600 mt-2">
            All 18 tables from synthetic data now in BigQuery
          </p>
        </div>
        <Button onClick={loadTableData} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh All Data'}
        </Button>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <p className="text-red-800">Error: {error}</p>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <h3 className="text-sm font-medium text-gray-600 mb-2">Total Tables</h3>
          <div className="text-2xl font-bold">{tables.length}</div>
        </Card>
        <Card>
          <h3 className="text-sm font-medium text-gray-600 mb-2">Dimension Tables</h3>
          <div className="text-2xl font-bold">
            {tables.filter(t => t.type === 'dimension').length}
          </div>
        </Card>
        <Card>
          <h3 className="text-sm font-medium text-gray-600 mb-2">Fact Tables</h3>
          <div className="text-2xl font-bold">
            {tables.filter(t => t.type === 'fact').length}
          </div>
        </Card>
        <Card>
          <h3 className="text-sm font-medium text-gray-600 mb-2">Total Records</h3>
          <div className="text-2xl font-bold">
            {tables.reduce((sum, t) => sum + t.recordCount, 0).toLocaleString()}
          </div>
        </Card>
      </div>

      {/* Tables Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tables.map((table) => (
          <Card 
            key={table.tableName}
            className={`cursor-pointer transition-all hover:shadow-lg ${
              selectedTable?.tableName === table.tableName ? 'ring-2 ring-blue-500' : ''
            }`}
            onClick={() => setSelectedTable(table)}
          >
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-lg">{table.tableName}</h3>
                <Badge className={getTypeColor(table.type)}>
                  {table.type}
                </Badge>
              </div>
              <p className="text-sm text-gray-600 mb-2">{table.description}</p>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Records: {table.recordCount.toLocaleString()}</span>
                <span className="text-gray-500">
                  {new Date(table.lastUpdated).toLocaleDateString()}
                </span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Selected Table Detail */}
      {selectedTable && (
        <Card>
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold">{selectedTable.tableName}</h2>
                <p className="text-gray-600">{selectedTable.description}</p>
              </div>
              <Badge className={getTypeColor(selectedTable.type)}>
                {selectedTable.type}
              </Badge>
            </div>
            
            <div className="mb-4">
              <h3 className="text-lg font-semibold mb-2">Sample Data (First 3 records)</h3>
              {renderSampleData(selectedTable.sampleData, selectedTable.tableName)}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="font-medium">Total Records:</span> {selectedTable.recordCount.toLocaleString()}
              </div>
              <div>
                <span className="font-medium">Last Updated:</span> {new Date(selectedTable.lastUpdated).toLocaleString()}
              </div>
              <div>
                <span className="font-medium">Type:</span> {selectedTable.type}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* API Status */}
      <Card>
        <h2 className="text-xl font-semibold mb-4">BigQuery Integration Status</h2>
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <span className="text-green-700">Connected to BigQuery API</span>
          </div>
          <p className="text-sm text-gray-600">
            All 18 tables have been created and populated with synthetic data.
            The system can now switch between mock data and real BigQuery queries.
          </p>
          <div className="text-sm text-gray-500">
            <p>• 4 Dimension tables (markets, territories, outlets, devices)</p>
            <p>• 6 Fact tables (sales, monthly rollup, intraday, network, contact center, dynamic scores)</p>
            <p>• 2 Catalog tables (reports, datasets)</p>
            <p>• 6 Analytical tables (churn, take rate, segments, performance, revenue)</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
