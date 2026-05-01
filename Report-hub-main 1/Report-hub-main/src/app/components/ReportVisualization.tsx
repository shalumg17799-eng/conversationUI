import React, { useEffect, useRef } from 'react';
import * as am5 from '@amcharts/amcharts5';
import * as am5xy from '@amcharts/amcharts5/xy';
import * as am5percent from '@amcharts/amcharts5/percent';
import am5themes_Animated from '@amcharts/amcharts5/themes/Animated';
import {
  getMonthlyTakeRateTrend,
  getPerformanceByRegion,
  getMarketSegmentDistribution,
} from '@/lib/dataModel';

interface ReportVisualizationProps {
  visualizationType: 'Line trend' | 'Bar comparison' | 'KPI summary' | 'Mixed view' | string;
  metrics?: string[];
  dimensions?: string[];
  height?: number;
}

export function ReportVisualization({
  visualizationType,
  metrics,
  dimensions,
  height = 250,
}: ReportVisualizationProps) {
  const chartDivRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartDivRef.current) return;

    // Create root element
    const root = am5.Root.new(chartDivRef.current);

    // Set themes
    root.setThemes([am5themes_Animated.new(root)]);

    let chart: any;

    // Normalize visualization type to handle case sensitivity and variations
    let normalizedType = visualizationType.toLowerCase().trim();
    
    // Map common variations to standard types
    if (normalizedType.includes('trend') || normalizedType.includes('line')) {
      normalizedType = 'line trend';
    } else if (normalizedType.includes('bar') || normalizedType.includes('comparison')) {
      normalizedType = 'bar comparison';
    } else if (normalizedType.includes('pie') || normalizedType.includes('distribution')) {
      normalizedType = 'pie distribution';
    }

    if (normalizedType === 'line trend') {
      // Create line chart
      chart = root.container.children.push(
        am5xy.XYChart.new(root, {
          panX: false,
          panY: false,
          wheelX: 'none',
          wheelY: 'none',
          paddingLeft: 0,
          paddingRight: 0,
        })
      );

      // Create axes
      const xAxis = chart.xAxes.push(
        am5xy.DateAxis.new(root, {
          maxDeviation: 0.2,
          baseInterval: {
            timeUnit: 'day',
            count: 1,
          },
          renderer: am5xy.AxisRendererX.new(root, {
            minorGridEnabled: false,
          }),
          tooltip: am5.Tooltip.new(root, {}),
        })
      );

      xAxis.get('renderer').labels.template.setAll({
        fontSize: 10,
        fill: am5.color(0x6b7280),
      });

      const yAxis = chart.yAxes.push(
        am5xy.ValueAxis.new(root, {
          renderer: am5xy.AxisRendererY.new(root, {}),
        })
      );

      yAxis.get('renderer').labels.template.setAll({
        fontSize: 10,
        fill: am5.color(0x6b7280),
      });

      // Add series
      const series = chart.series.push(
        am5xy.LineSeries.new(root, {
          name: metrics?.[0] || 'Metric',
          xAxis: xAxis,
          yAxis: yAxis,
          valueYField: 'takeRate',
          valueXField: 'date',
          tooltip: am5.Tooltip.new(root, {
            labelText: '{valueY}%',
          }),
        })
      );

      series.strokes.template.setAll({
        strokeWidth: 2,
        stroke: am5.color(0xe11d48),
      });

      series.fills.template.setAll({
        visible: true,
        fillOpacity: 0.1,
        fill: am5.color(0xe11d48),
      });

      // Generate data from dataModel
      const lineData = getMonthlyTakeRateTrend().map((item, index) => {
        // Convert month name to a date
        // Since we're showing last 6 months, we'll create dates going backwards from today
        const date = new Date();
        date.setMonth(date.getMonth() - (5 - index));
        date.setDate(1); // Set to first of month
        date.setHours(0, 0, 0, 0);
        
        return {
          date: date.getTime(),
          takeRate: item.takeRate,
        };
      });

      series.data.setAll(lineData);

      // Add cursor
      chart.set('cursor', am5xy.XYCursor.new(root, {}));
    } else if (normalizedType === 'bar comparison') {
      // Create bar chart
      chart = root.container.children.push(
        am5xy.XYChart.new(root, {
          panX: false,
          panY: false,
          wheelX: 'none',
          wheelY: 'none',
          paddingLeft: 0,
          paddingRight: 0,
        })
      );

      // Create axes
      const xAxis = chart.xAxes.push(
        am5xy.CategoryAxis.new(root, {
          categoryField: 'name',
          renderer: am5xy.AxisRendererX.new(root, {
            minorGridEnabled: false,
          }),
          tooltip: am5.Tooltip.new(root, {}),
        })
      );

      xAxis.get('renderer').labels.template.setAll({
        fontSize: 10,
        fill: am5.color(0x6b7280),
      });

      const yAxis = chart.yAxes.push(
        am5xy.ValueAxis.new(root, {
          renderer: am5xy.AxisRendererY.new(root, {}),
        })
      );

      yAxis.get('renderer').labels.template.setAll({
        fontSize: 10,
        fill: am5.color(0x6b7280),
      });

      // Add series
      const series = chart.series.push(
        am5xy.ColumnSeries.new(root, {
          name: metrics?.[0] || 'Performance',
          xAxis: xAxis,
          yAxis: yAxis,
          valueYField: 'performance',
          categoryXField: 'name',
          tooltip: am5.Tooltip.new(root, {
            labelText: '{valueY}',
          }),
        })
      );

      series.columns.template.setAll({
        cornerRadiusTL: 4,
        cornerRadiusTR: 4,
        fill: am5.color(0xe11d48),
        stroke: am5.color(0xe11d48),
      });

      // Generate data from dataModel
      const barData = getPerformanceByRegion();
      xAxis.data.setAll(barData);
      series.data.setAll(barData);
    } else if (normalizedType === 'pie distribution') {
      // Create pie chart for KPI summary and mixed view
      chart = root.container.children.push(
        am5percent.PieChart.new(root, {
          layout: root.verticalLayout,
          paddingTop: 0,
          paddingBottom: 0,
        })
      );

      // Create series
      const series = chart.series.push(
        am5percent.PieSeries.new(root, {
          valueField: 'value',
          categoryField: 'name',
        })
      );

      series.slices.template.setAll({
        stroke: am5.color(0xffffff),
        strokeWidth: 2,
      });

      series.labels.template.setAll({
        fontSize: 10,
        fill: am5.color(0x6b7280),
      });

      // Generate data from dataModel
      const pieData = getMarketSegmentDistribution();
      series.data.setAll(pieData);

      // Add legend
      const legend = chart.children.push(
        am5.Legend.new(root, {
          centerX: am5.percent(50),
          x: am5.percent(50),
          layout: root.horizontalLayout,
        })
      );

      legend.labels.template.setAll({
        fontSize: 10,
        fill: am5.color(0x6b7280),
      });

      legend.data.setAll(series.dataItems);
    } else {
      // Default fallback - create a simple line chart
      console.warn(`Unknown visualization type: "${visualizationType}". Falling back to line trend.`);
      chart = root.container.children.push(
        am5xy.XYChart.new(root, {
          panX: false,
          panY: false,
          wheelX: 'none',
          wheelY: 'none',
          paddingLeft: 0,
          paddingRight: 0,
        })
      );

      // Create axes
      const xAxis = chart.xAxes.push(
        am5xy.DateAxis.new(root, {
          maxDeviation: 0.2,
          baseInterval: {
            timeUnit: 'day',
            count: 1,
          },
          renderer: am5xy.AxisRendererX.new(root, {
            minorGridEnabled: false,
          }),
          tooltip: am5.Tooltip.new(root, {}),
        })
      );

      xAxis.get('renderer').labels.template.setAll({
        fontSize: 10,
        fill: am5.color(0x6b7280),
      });

      const yAxis = chart.yAxes.push(
        am5xy.ValueAxis.new(root, {
          renderer: am5xy.AxisRendererY.new(root, {}),
        })
      );

      yAxis.get('renderer').labels.template.setAll({
        fontSize: 10,
        fill: am5.color(0x6b7280),
      });

      // Add series
      const series = chart.series.push(
        am5xy.LineSeries.new(root, {
          name: 'Metric',
          xAxis: xAxis,
          yAxis: yAxis,
          valueYField: 'takeRate',
          valueXField: 'date',
          tooltip: am5.Tooltip.new(root, {
            labelText: '{valueY}%',
          }),
        })
      );

      series.strokes.template.setAll({
        strokeWidth: 2,
        stroke: am5.color(0xe11d48),
      });

      series.fills.template.setAll({
        visible: true,
        fillOpacity: 0.1,
        fill: am5.color(0xe11d48),
      });

      // Generate data from dataModel
      const lineData = getMonthlyTakeRateTrend().map((item, index) => {
        // Convert month name to a date
        // Since we're showing last 6 months, we'll create dates going backwards from today
        const date = new Date();
        date.setMonth(date.getMonth() - (5 - index));
        date.setDate(1); // Set to first of month
        date.setHours(0, 0, 0, 0);
        
        return {
          date: date.getTime(),
          takeRate: item.takeRate,
        };
      });

      series.data.setAll(lineData);

      // Add cursor
      chart.set('cursor', am5xy.XYCursor.new(root, {}));
    }

    // Make chart animate on load
    if (chart) {
      chart.appear(1000, 100);
    }

    // Cleanup
    return () => {
      root.dispose();
    };
  }, [visualizationType, metrics, dimensions]);

  return <div ref={chartDivRef} style={{ width: '100%', height: `${height}px` }} />;
}