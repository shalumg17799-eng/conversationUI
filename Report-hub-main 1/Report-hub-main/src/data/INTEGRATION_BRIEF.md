# Synthetic Data Integration Brief
**For:** Backend / Frontend Developer  
**Date:** 2025-04-29  
**Scope:** Replace all hardcoded mock data in `src/lib/dataModel.ts` and `src/app/pages/FullReport.tsx` with data loaded from JSON files in `src/data/`

---

## Step 0 — File Inventory

All synthetic JSON files live at `src/data/`. Do not move or rename them — the paths below are the integration contract.

| File | Rows | Replaces |
|------|------|---------|
| `dim_markets.json` | 5 | — (new) |
| `dim_territories.json` | 20 | `dimGeoTerritories` in `dataModel.ts` |
| `dim_outlets.json` | 50 | — (new, replaces inline outlet references) |
| `dim_devices.json` | 20 | `dimDevices` in `dataModel.ts` |
| `catalog_reports.json` | 15 | `catalogReports` in `dataModel.ts` |
| `catalog_datasets.json` | 10 | `catalogDatasets` in `dataModel.ts` |
| `fact_sug_sales_daily.json` | 450 | `factSugSalesDaily` (generated fn) in `dataModel.ts` |
| `fact_sug_monthly_rollup.json` | 120 | `factSugMonthlyRollup` (generated fn) in `dataModel.ts` |
| `fact_intraday_sales.json` | 360 | `factIntradayIntervalSales` (generated fn) in `dataModel.ts` |
| `fact_network_kpi_points.json` | 75 | `factNetworkKpiPoints` (generated fn) in `dataModel.ts` |
| `fact_contact_center_metrics.json` | 30 | `generateContactCenterMetrics()` in `dataModel.ts` |
| `fact_dynamic_scores.json` | 30 | Dynamic score generation in Enterprise BI page |
| `churn_monthly.json` | 24 | `getReportPreviewData('RPT-CHURN-001')` in `dataModel.ts` |
| `full_report_data.json` | object | All 8 hardcoded `const` arrays in `FullReport.tsx` |
| `take_rate_monthly_trend.json` | 6 | `getMonthlyTakeRateTrend()` in `dataModel.ts` |
| `market_segment_distribution.json` | 4 | `getMarketSegmentDistribution()` in `dataModel.ts` |
| `segment_performance_trend.json` | 6 | `getSegmentPerformanceTrend()` in `dataModel.ts` |
| `performance_by_region.json` | 4 | `getPerformanceByRegion()` in `dataModel.ts` |
| `revenue_by_device_group.json` | 3 | `getRevenueByDeviceGroup()` in `dataModel.ts` |

---

## Step 1 — Wire up `src/lib/dataModel.ts`

### 1a. Add imports at the top of `dataModel.ts`

```typescript
// ── Synthetic data imports ─────────────────────────────────────────────────
import dimTerritoriesRaw     from '../data/dim_territories.json';
import dimDevicesRaw         from '../data/dim_devices.json';
import dimOutletsRaw         from '../data/dim_outlets.json';
import catalogReportsRaw     from '../data/catalog_reports.json';
import catalogDatasetsRaw    from '../data/catalog_datasets.json';
import factSalesDailyRaw     from '../data/fact_sug_sales_daily.json';
import factMonthlyRaw        from '../data/fact_sug_monthly_rollup.json';
import factIntradayRaw       from '../data/fact_intraday_sales.json';
import factNetworkRaw        from '../data/fact_network_kpi_points.json';
import factCCRaw             from '../data/fact_contact_center_metrics.json';
import factDynamicRaw        from '../data/fact_dynamic_scores.json';
import churnRaw              from '../data/churn_monthly.json';
import takeRateTrendRaw      from '../data/take_rate_monthly_trend.json';
import marketSegDistRaw      from '../data/market_segment_distribution.json';
import segPerfTrendRaw       from '../data/segment_performance_trend.json';
import perfByRegionRaw       from '../data/performance_by_region.json';
import revByDeviceRaw        from '../data/revenue_by_device_group.json';
```

> **Vite config note:** JSON imports work out of the box with Vite. No plugin needed.

### 1b. Replace static arrays

Find each `export const` block below and replace its body:

```typescript
// BEFORE
export const dimGeoTerritories: DimGeoTerritory[] = [ … hardcoded … ];

// AFTER
export const dimGeoTerritories: DimGeoTerritory[] = dimTerritoriesRaw as DimGeoTerritory[];

// ── Same pattern for: ──────────────────────────────────────────────────────
export const dimDevices:        DimDevice[]        = dimDevicesRaw        as DimDevice[];
export const catalogReports:    CatalogReport[]    = catalogReportsRaw    as CatalogReport[];
export const catalogDatasets:   CatalogDataset[]   = catalogDatasetsRaw   as CatalogDataset[];
```

> **Date handling:** `last_updated_ts` and `last_refresh_ts` arrive as ISO strings from JSON. Add a post-processing step:
> ```typescript
> export const catalogReports: CatalogReport[] = (catalogReportsRaw as any[]).map(r => ({
>   ...r,
>   last_updated_ts: new Date(r.last_updated_ts),
>   created_date:    r.created_date ? new Date(r.created_date) : undefined,
> }));
>
> export const catalogDatasets: CatalogDataset[] = (catalogDatasetsRaw as any[]).map(d => ({
>   ...d,
>   last_refresh_ts: new Date(d.last_refresh_ts),
> }));
> ```

### 1c. Replace generated fact tables

Delete the `generateDailySales()`, `generateMonthlyRollup()`, `generateIntradaySales()`, `generateNetworkKpiPoints()`, and `generateContactCenterMetrics()` functions and replace their `export const` assignments:

```typescript
export const factSugSalesDaily         = factSalesDailyRaw  as FactSugSalesDaily[];
export const factSugMonthlyRollup      = factMonthlyRaw     as FactSugMonthlyRollup[];
export const factIntradayIntervalSales = factIntradayRaw    as FactIntradayIntervalSales[];
export const factNetworkKpiPoints      = factNetworkRaw     as FactNetworkKpiPoints[];
```

### 1d. Replace small accessor functions

```typescript
export const getMonthlyTakeRateTrend       = () => takeRateTrendRaw;
export const getMarketSegmentDistribution  = () => marketSegDistRaw;
export const getSegmentPerformanceTrend    = () => segPerfTrendRaw;
export const getPerformanceByRegion        = () => perfByRegionRaw;
export const getRevenueByDeviceGroup       = () => revByDeviceRaw;
```

### 1e. Fix `getReportPreviewData` for churn report

Replace the hardcoded churn array inside `getReportPreviewData()`:

```typescript
if (reportId === 'RPT-CHURN-001') {
  // Was: hardcoded 12-row array
  // Now: last 12 months from churn_monthly.json
  return churnRaw
    .slice(-12)
    .map(d => ({
      month: d.month.split(' ')[0],   // "Apr 2025" → "Apr"
      churn_rate: d.churn_rate,
      change_vs_previous_month: d.change_vs_previous_month,
    }));
}
```

### 1f. Fix `getRelatedInsights` return type bug

The function currently returns `trend: 'stable'` — but `TrendIcon` in Reports.tsx only handles `'up' | 'down' | 'flat'`. Change to:

```typescript
{ label: 'Avg RIS', value: ..., trend: 'flat' }   // NOT 'stable'
```

---

## Step 2 — Wire up `src/app/pages/FullReport.tsx`

All 8 `const` arrays at the top of the file are fully replaced by `full_report_data.json`.

### 2a. Add import

```typescript
import fullReportData from '../../data/full_report_data.json';
```

### 2b. Delete the 8 hardcoded consts, replace with destructure

```typescript
const {
  monthly_trend:       MONTHLY_TREND,
  segment_pie:         SEGMENT_PIE,
  quarterly_yoy:       QUARTERLY_YOY,
  region_data:         REGION_DATA,
  engagement_trend:    ENGAGEMENT_TREND,
  top_performers:      TOP_PERFORMERS,
  segment_breakdown:   SEGMENT_BREAKDOWN,
  totals_row:          TOTALS_ROW,
  kpi_strip:           KPI_STRIP,
} = fullReportData;
```

### 2c. Wire the KPI strip

Replace the 5 hardcoded `<KpiCard>` calls in the "KPI STRIP" section:

```tsx
<KpiCard
  label="Total Revenue"
  value={KPI_STRIP.total_revenue.value}
  delta={KPI_STRIP.total_revenue.delta}
  subtext={KPI_STRIP.total_revenue.subtext}
  trend={KPI_STRIP.total_revenue.trend as 'up' | 'down' | 'flat'}
  icon={<DollarSign className="w-4 h-4" />}
/>
// … repeat for the other 4 KPIs
```

### 2d. Wire totals row in Segment Breakdown table footer

```tsx
{[TOTALS_ROW.q1, TOTALS_ROW.q2, TOTALS_ROW.q3, TOTALS_ROW.q4,
  TOTALS_ROW.ytd, TOTALS_ROW.change, TOTALS_ROW.pct].map(…)}
```

---

## Step 3 — Preserve Naming Conventions (Critical)

These identifiers are referenced across multiple files. **Do not rename them:**

| Name | Where used |
|------|-----------|
| `catalogReports` | `dataModel.ts`, `Reports.tsx`, `Conversational_new.tsx`, `FullReport.tsx` |
| `catalogDatasets` | `dataModel.ts`, `Reports.tsx`, `Datasets.tsx`, `FullReport.tsx` |
| `dimGeoTerritories` | `dataModel.ts` (internal lookups in `getTopTerritories` etc.) |
| `factSugSalesDaily` | `dataModel.ts` (used by `getLast90DaysRevenue`) |
| `factSugMonthlyRollup` | `dataModel.ts` (used by `getCurrentMonthMetrics`, `getTopTerritories`, etc.) |
| `factNetworkKpiPoints` | `dataModel.ts` (used by `getNetworkKpiSummary`) |

All exported **functions** (`getReportById`, `getAllReports`, `getTopTerritories`, etc.) keep their exact signatures — only the underlying data they read from changes.

---

## Step 4 — Known Mismatches & Assumptions

| # | Issue | Recommendation |
|---|-------|---------------|
| 1 | `getReportPreviewData()` returns `churn_rate` field for ALL reports (including Sales domain), but the chart Y-axis domain is `[0,8]` for churn and `[0,100]` for others. Non-churn reports passing take-rate values (25-85%) will render off-scale. | Either: (a) add a `metric_type` field to the preview data and set Y-domain dynamically, or (b) normalize all preview data to a consistent `value` field. The new `take_rate_monthly_trend.json` already has correct range. |
| 2 | `getRelatedInsights()` returns `trend: 'stable'` — this string is not handled by `TrendIcon` in Reports.tsx which only accepts `'up' \| 'down' \| 'flat'`. Will render `Minus` icon silently. | Change all `'stable'` → `'flat'` (see Step 1f). |
| 3 | `FullReport.tsx` `SEGMENT_BREAKDOWN` totals row is hardcoded separately from `segment_breakdown` array data. The new `full_report_data.json` includes a `totals_row` field computed to sum correctly with `segment_breakdown`. | Use `TOTALS_ROW` from the JSON — do not recompute in the component. |
| 4 | `fact_sug_sales_daily.json` covers only 5 outlets (one flagship per region). The actual schema supports all 50 outlets. **Assumption:** for dashboard charts, 5-outlet daily data is sufficient. If the dev needs all 50 outlets × 90 days, re-run the generator script with `sample_outlets = outlets_all`. | Flag if full 50-outlet daily dataset is needed. |
| 5 | `DS-009` (Employee & HR Data) and `RPT-013` (Employee Engagement Index) are new — they don't exist in the original `catalogReports`/`catalogDatasets`. They're added to make the catalog richer. If any page filters by dataset_id or report_id, ensure these new IDs don't break routing. | Test `/reports/RPT-013` and `/datasets/DS-009` routes before demo. |
| 6 | `catalog_reports.json` IDs use the existing scheme (`RPT-001` through `RPT-014` plus `RPT-CHURN-001`). The original code also dynamically adds reports via `saveReportConfiguration()` which does `catalogReports.unshift()`. **Assumption:** the mutable in-memory push is preserved — JSON import is the initial state, mutations still work at runtime. | Do not freeze the imported array. Keep `catalogReports` as a mutable `let` or plain array. |
| 7 | `dim_outlets.json` is new — no existing component directly queries it by ID yet. The `DimOutlet` TypeScript interface exists in `dataModel.ts` — export `dimOutlets` from there for future use. | Add `export const dimOutlets = dimOutletsRaw as DimOutlet[];` to `dataModel.ts`. |

---

## Step 5 — vite.config.ts (no changes needed)

Vite resolves JSON imports natively. No plugin required. If TypeScript complains about JSON module types, add to `tsconfig.json`:

```json
{
  "compilerOptions": {
    "resolveJsonModule": true
  }
}
```

---

## Step 6 — Smoke Test Checklist

After wiring, verify these routes render correctly:

- [ ] `/dashboard` — Line chart has 9 points (90-day sampled), 4 KPI tiles show real numbers
- [ ] `/reports` — Grid shows 15 report cards (was 7)
- [ ] `/reports/RPT-001` — Preview chart renders with take-rate data; Related Insights show 3 KPI cards
- [ ] `/reports/RPT-CHURN-001` — Bar chart renders 12 months of churn data in `[0,8]` Y-range
- [ ] `/reports/RPT-001/full` — All 5 KPI cards, trend chart (12 months), segment donut, quarterly bars, region bars, engagement area, TOP_PERFORMERS table (10 rows), SEGMENT_BREAKDOWN table (12 rows + totals) all render
- [ ] `/datasets` — Table shows 10 datasets
- [ ] `/datasets/DS-001` — Sample preview chart renders with 6-month take-rate data
- [ ] `/enterprise-bi` — Contact center table shows 30 agents with correct status badges
- [ ] Territory cards on Dashboard — Top 5 and Bottom 5 sparklines render correctly

---

*Generated by ReportHub Synthetic Data Pipeline — 2025-04-29*
