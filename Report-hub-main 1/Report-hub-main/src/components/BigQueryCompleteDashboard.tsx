// Complete BigQuery Dashboard - Uses all 18 dynamic tables
import React, { useState, useEffect } from 'react';
import { Card } from '../app/components/ui/Card';
import { Button } from '../app/components/ui/Button';
import { Badge } from '../app/components/ui/Badge';
import { 
  bigQueryCompleteService, 
  DimMarket, 
  DimTerritory, 
  DimOutlet, 
  DimDevice,
  FactSugSalesDaily,
  FactSugMonthlyRollup,
  CatalogReport,
  CatalogDataset,
  ChurnMonthly,
  TakeRateMonthlyTrend,
  MarketSegmentDistribution
} from '../lib/bigqueryCompleteService';

interface DashboardData {
  markets: DimMarket[];
  territories: DimTerritory[];
  outlets: DimOutlet[];
  devices: DimDevice[];
  salesDaily: FactSugSalesDaily[];
  salesMonthly: FactSugMonthlyRollup[];
  catalogReports: CatalogReport[];
  catalogDatasets: CatalogDataset[];
  churnData: ChurnMonthly[];
  takeRateData: TakeRateMonthlyTrend[];
  marketSegments: MarketSegmentDistribution[];
  salesPerformance: any[];
  devicePerformance: any[];
  territoryPerformance: any[];
  healthStatus: any;
  loading: boolean;
  error: string | null;
}

const BigQueryCompleteDashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData>({
    markets: [],
    territories: [],
    outlets: [],
    devices: [],
    salesDaily: [],
    salesMonthly: [],
    catalogReports: [],
    catalogDatasets: [],
    churnData: [],
    takeRateData: [],
    marketSegments: [],
    salesPerformance: [],
    devicePerformance: [],
    territoryPerformance: [],
    healthStatus: null,
    loading: true,
    error: null
  });

  const [selectedTable, setSelectedTable] = useState<string>('overview');

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setData(prev => ({ ...prev, loading: true, error: null }));

      // Load all data in parallel
      const [
        markets,
        territories,
        outlets,
        devices,
        salesDaily,
        salesMonthly,
        catalogReports,
        catalogDatasets,
        churnData,
        takeRateData,
        marketSegments,
        salesPerformance,
        devicePerformance,
        territoryPerformance,
        healthStatus
      ] = await Promise.all([
        bigQueryCompleteService.getMarkets(),
        bigQueryCompleteService.getTerritories(),
        bigQueryCompleteService.getOutlets(),
        bigQueryCompleteService.getDevices(),
        bigQueryCompleteService.getSugSalesDaily(50),
        bigQueryCompleteService.getSugMonthlyRollup(),
        bigQueryCompleteService.getCatalogReports(),
        bigQueryCompleteService.getCatalogDatasets(),
        bigQueryCompleteService.getChurnMonthly(),
        bigQueryCompleteService.getTakeRateMonthlyTrend(),
        bigQueryCompleteService.getMarketSegmentDistribution(),
        bigQueryCompleteService.getSalesPerformanceOverview(),
        bigQueryCompleteService.getDevicePerformanceAnalysis(),
        bigQueryCompleteService.getTerritoryPerformanceMetrics(),
        bigQueryCompleteService.getDatasetHealth()
      ]);

      setData({
        markets,
        territories,
        outlets,
        devices,
        salesDaily,
        salesMonthly,
        catalogReports,
        catalogDatasets,
        churnData,
        takeRateData,
        marketSegments,
        salesPerformance,
        devicePerformance,
        territoryPerformance,
        healthStatus,
        loading: false,
        error: null
      });

    } catch (error) {
      console.error('Error loading dashboard data:', error);
      setData(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load data'
      }));
    }
  };

  const renderOverview = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <div className="p-4">
          <h3 className="text-lg font-semibold mb-2">Markets</h3>
          <div className="text-2xl font-bold text-blue-600">{data.markets.length}</div>
          <p className="text-sm text-gray-600">Active markets</p>
        </div>
      </Card>
      <Card>
        <div className="p-4">
          <h3 className="text-lg font-semibold mb-2">Outlets</h3>
          <div className="text-2xl font-bold text-green-600">{data.outlets.length}</div>
          <p className="text-sm text-gray-600">Retail locations</p>
        </div>
      </Card>
      <Card>
        <div className="p-4">
          <h3 className="text-lg font-semibold mb-2">Devices</h3>
          <div className="text-2xl font-bold text-purple-600">{data.devices.length}</div>
          <p className="text-sm text-gray-600">Device models</p>
        </div>
      </Card>
      <Card>
        <div className="p-4">
          <h3 className="text-lg font-semibold mb-2">Reports</h3>
          <div className="text-2xl font-bold text-orange-600">{data.catalogReports.length}</div>
          <p className="text-sm text-gray-600">Available reports</p>
        </div>
      </Card>
    </div>
  );

  const renderSalesMetrics = () => (
    <div className="space-y-6">
      <Card>
        <div className="p-4">
          <h3 className="text-lg font-semibold mb-4">Sales Performance Overview</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Outlet</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">City</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Revenue</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Units</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Take Rate</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.salesPerformance.slice(0, 5).map((item, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {item.outlet_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.city}, {item.state}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      ${item.total_revenue?.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.total_units?.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.avg_take_rate?.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-4">
          <h3 className="text-lg font-semibold mb-4">Device Performance</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Device</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Group</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Revenue</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Units</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Transactions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.devicePerformance.slice(0, 5).map((item, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {item.device_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.device_group}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      ${item.total_revenue?.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.total_units?.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.transaction_count?.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  );

  const renderCustomerMetrics = () => (
    <div className="space-y-6">
      <Card>
        <div className="p-4">
          <h3 className="text-lg font-semibold mb-4">Churn Analysis</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Month</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Churn Rate</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Change</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lost Subscribers</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Base</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.churnData.slice(0, 6).map((item, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {item.month}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.churn_rate.toFixed(1)}%
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className={item.change_vs_previous_month >= 0 ? 'text-red-600' : 'text-green-600'}>
                        {item.change_vs_previous_month >= 0 ? '+' : ''}{item.change_vs_previous_month.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.subscribers_lost?.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.total_base?.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-4">
          <h3 className="text-lg font-semibold mb-4">Take Rate Trends</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Month</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Take Rate</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Change</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.takeRateData.map((item, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {item.month}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.takeRate.toFixed(1)}%
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className={item.change_vs_previous_month >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {item.change_vs_previous_month >= 0 ? '+' : ''}{item.change_vs_previous_month.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  );

  const renderCatalogData = () => (
    <div className="space-y-6">
      <Card>
        <div className="p-4">
          <h3 className="text-lg font-semibold mb-4">Report Catalog</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Report ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Report Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Domain</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Owner</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Enterprise</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.catalogReports.map((item, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {item.report_id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.report_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.domain}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.business_owner}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <Badge variant={item.enterprise_flag ? 'default' : 'secondary'}>
                        {item.enterprise_flag ? 'Yes' : 'No'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-4">
          <h3 className="text-lg font-semibold mb-4">Dataset Catalog</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dataset ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dataset Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Domain</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rows</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Certified</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.catalogDatasets.map((item, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {item.dataset_id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.dataset_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.domain}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.row_count?.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <Badge variant={item.certified_flag ? 'default' : 'secondary'}>
                        {item.certified_flag ? 'Yes' : 'No'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  );

  const renderSystemHealth = () => (
    <div className="space-y-6">
      <Card>
        <div className="p-4">
          <h3 className="text-lg font-semibold mb-4">Dataset Health Status</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Dataset Information</h4>
              <p><strong>Dataset ID:</strong> {data.healthStatus?.datasetId}</p>
              <p><strong>Total Tables:</strong> {data.healthStatus?.totalTables}</p>
              <p><strong>Status:</strong> <Badge variant="default">{data.healthStatus?.status}</Badge></p>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Table Record Counts</h4>
              {data.healthStatus?.tableCounts && Object.entries(data.healthStatus.tableCounts).map(([table, count]) => (
                <p key={table}><strong>{table}:</strong> {count as number} records</p>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-4">
          <h3 className="text-lg font-semibold mb-4">Market Segments</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Segment</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Percentage</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Revenue</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.marketSegments.map((item, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {item.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.value.toFixed(1)}%
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      ${item.revenue?.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  );

  if (data.loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading BigQuery data...</p>
        </div>
      </div>
    );
  }

  if (data.error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Data</h2>
          <p className="text-gray-600 mb-4">{data.error}</p>
          <Button onClick={loadDashboardData}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Report Hub Dashboard</h1>
              <p className="text-gray-600">Complete BigQuery Analytics - All 18 Tables</p>
            </div>
            <div className="flex space-x-2">
              <Button onClick={loadDashboardData} variant="outline">
                Refresh Data
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <nav className="flex space-x-4">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'sales', label: 'Sales Metrics' },
              { id: 'customers', label: 'Customer Metrics' },
              { id: 'catalog', label: 'Data Catalog' },
              { id: 'health', label: 'System Health' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setSelectedTable(tab.id)}
                className={`px-4 py-2 rounded-md text-sm font-medium ${
                  selectedTable === tab.id
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {selectedTable === 'overview' && renderOverview()}
        {selectedTable === 'sales' && renderSalesMetrics()}
        {selectedTable === 'customers' && renderCustomerMetrics()}
        {selectedTable === 'catalog' && renderCatalogData()}
        {selectedTable === 'health' && renderSystemHealth()}
      </div>
    </div>
  );
};

export default BigQueryCompleteDashboard;
