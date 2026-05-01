import React, { useEffect, useRef } from 'react';
import * as am5 from '@amcharts/amcharts5';
import * as am5xy from '@amcharts/amcharts5/xy';
import * as am5percent from '@amcharts/amcharts5/percent';
import am5themes_Animated from '@amcharts/amcharts5/themes/Animated';

interface InlineChartProps {
  chartType: 'line' | 'pie' | 'bar';
  title: string;
  reportName: string;
  datasetName?: string;
  data?: any[];
}

export function InlineChart({ chartType, title, reportName, datasetName, data }: InlineChartProps) {
  const chartDivRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartDivRef.current) return;

    // Create root element
    const root = am5.Root.new(chartDivRef.current);

    // Set themes
    root.setThemes([am5themes_Animated.new(root)]);

    let chart: any;

    if (chartType === 'line') {
      // Create line chart
      chart = root.container.children.push(
        am5xy.XYChart.new(root, {
          panX: false,
          panY: false,
          wheelX: 'none',
          wheelY: 'none',
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
            minorGridEnabled: true,
          }),
          tooltip: am5.Tooltip.new(root, {}),
        })
      );

      const yAxis = chart.yAxes.push(
        am5xy.ValueAxis.new(root, {
          renderer: am5xy.AxisRendererY.new(root, {}),
        })
      );

      // Add series
      const series = chart.series.push(
        am5xy.LineSeries.new(root, {
          name: title,
          xAxis: xAxis,
          yAxis: yAxis,
          valueYField: 'value',
          valueXField: 'date',
          tooltip: am5.Tooltip.new(root, {
            labelText: '{valueY}',
          }),
        })
      );

      series.strokes.template.setAll({
        strokeWidth: 2,
      });

      series.fills.template.setAll({
        visible: true,
        fillOpacity: 0.1,
      });

      // Generate mock data
      const generateLineData = () => {
        const data = [];
        const baseValue = 100;
        for (let i = 30; i >= 0; i--) {
          const date = new Date();
          date.setDate(date.getDate() - i);
          data.push({
            date: date.getTime(),
            value: baseValue + Math.random() * 50 - 25 + i * 0.5,
          });
        }
        return data;
      };

      series.data.setAll(data || generateLineData());

      // Add cursor
      chart.set('cursor', am5xy.XYCursor.new(root, {}));
    } else if (chartType === 'pie') {
      // Create pie chart
      chart = root.container.children.push(
        am5percent.PieChart.new(root, {
          layout: root.verticalLayout,
        })
      );

      // Create series
      const series = chart.series.push(
        am5percent.PieSeries.new(root, {
          valueField: 'value',
          categoryField: 'category',
        })
      );

      // Generate mock data
      const generatePieData = () => [
        { category: 'North America', value: 35 },
        { category: 'Europe', value: 28 },
        { category: 'Asia Pacific', value: 22 },
        { category: 'Latin America', value: 10 },
        { category: 'Other', value: 5 },
      ];

      series.data.setAll(data || generatePieData());

      // Add legend
      const legend = chart.children.push(
        am5.Legend.new(root, {
          centerX: am5.percent(50),
          x: am5.percent(50),
          layout: root.horizontalLayout,
        })
      );

      legend.data.setAll(series.dataItems);
    } else if (chartType === 'bar') {
      // Create bar chart
      chart = root.container.children.push(
        am5xy.XYChart.new(root, {
          panX: false,
          panY: false,
          wheelX: 'none',
          wheelY: 'none',
        })
      );

      // Create axes
      const xAxis = chart.xAxes.push(
        am5xy.CategoryAxis.new(root, {
          categoryField: 'category',
          renderer: am5xy.AxisRendererX.new(root, {
            minorGridEnabled: true,
          }),
          tooltip: am5.Tooltip.new(root, {}),
        })
      );

      const yAxis = chart.yAxes.push(
        am5xy.ValueAxis.new(root, {
          renderer: am5xy.AxisRendererY.new(root, {}),
        })
      );

      // Add series
      const series = chart.series.push(
        am5xy.ColumnSeries.new(root, {
          name: title,
          xAxis: xAxis,
          yAxis: yAxis,
          valueYField: 'value',
          categoryXField: 'category',
          tooltip: am5.Tooltip.new(root, {
            labelText: '{valueY}',
          }),
        })
      );

      series.columns.template.setAll({
        cornerRadiusTL: 5,
        cornerRadiusTR: 5,
      });

      // Generate mock data
      const generateBarData = () => [
        { category: 'Q1', value: 87 },
        { category: 'Q2', value: 92 },
        { category: 'Q3', value: 78 },
        { category: 'Q4', value: 95 },
      ];

      const barData = data || generateBarData();
      xAxis.data.setAll(barData);
      series.data.setAll(barData);
    }

    // Make chart animate on load
    chart.appear(1000, 100);

    // Cleanup
    return () => {
      root.dispose();
    };
  }, [chartType, title, data]);

  return (
    <div className="mt-3 bg-white border border-[#E5E7EB] rounded-lg overflow-hidden">
      <div className="p-4 border-b border-[#E5E7EB]">
        <h4 className="text-[14px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
          {title}
        </h4>
        <p className="text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
          Rendered from <span className="font-medium text-[#111827]">{reportName}</span>
          {datasetName && (
            <>
              {' '}using <span className="font-medium text-[#111827]">{datasetName}</span>
            </>
          )}
        </p>
      </div>
      <div ref={chartDivRef} style={{ width: '100%', height: '300px' }} />
    </div>
  );
}
