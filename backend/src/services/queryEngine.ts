import { BigQueryService } from './bigqueryService';
import { IntentResult } from '../types';

// Maps intent signals to BigQuery fetch functions
export const executeQuery = async (intent: IntentResult): Promise<any[]> => {
  const { metric, dimension, timeRange, intent: intentType } = intent;
  const m = metric.toLowerCase();
  const d = dimension.toLowerCase();

  console.log(`BQ Query — intent: ${intentType}, metric: ${m}, dimension: ${d}, time: ${timeRange}`);

  try {
    // Revenue / sales trends → monthly rollup
    if (m === 'revenue' || m === 'sales' || intentType === 'trend') {
      const rows = await BigQueryService.getMonthlyRollup();
      return rows.slice(0, 50);
    }

    // Take rate
    if (m === 'take_rate' || m === 'takerate' || m.includes('take')) {
      return await BigQueryService.getMonthlyRollup();
    }

    // Churn
    if (m === 'churn' || m.includes('churn')) {
      return await BigQueryService.getChurnMonthly();
    }

    // Performance by region/territory
    if (d === 'region' || m === 'performance' || m === 'score') {
      return await BigQueryService.getPerformanceByRegion();
    }

    // Device / product revenue
    if (d === 'device' || d === 'product' || m === 'device') {
      return await BigQueryService.getRevenueByDeviceGroup();
    }

    // Contact center / employee metrics
    if (m === 'contact' || m === 'agent' || m === 'employee' || d === 'employee') {
      return await BigQueryService.getContactCenterMetrics();
    }

    // Dynamic scores / rankings
    if (m === 'rank' || m === 'score' || m === 'dynamic') {
      return await BigQueryService.getDynamicScores();
    }

    // Markets / territories
    if (d === 'market' || m === 'market') {
      return await BigQueryService.getMarkets();
    }

    if (d === 'territory') {
      return await BigQueryService.getTerritories();
    }

    // Outlets / stores
    if (d === 'outlet' || d === 'store' || d === 'city') {
      return await BigQueryService.getOutlets();
    }

    // Catalog — reports
    if (m === 'report' || d === 'report') {
      return await BigQueryService.getCatalogReports();
    }

    // Catalog — datasets
    if (m === 'dataset' || d === 'dataset') {
      return await BigQueryService.getCatalogDatasets();
    }

    // Daily sales detail (default for sales + outlet/date combos)
    if (m === 'sales' || m === 'units' || intentType === 'comparison') {
      const rows = await BigQueryService.getDailySalesDetail();
      return rows.slice(0, 100);
    }

    // Default: monthly territory performance — richest general dataset
    const rows = await BigQueryService.getMonthlyTerritoryPerformance();
    return rows.slice(0, 50);

  } catch (err: any) {
    console.error('BigQuery executeQuery error:', err.message);
    // Return empty — pipeline handles gracefully
    return [];
  }
};
