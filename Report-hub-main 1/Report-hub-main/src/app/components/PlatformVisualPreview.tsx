import React from 'react';
import { Database, FileText, ChevronDown, Download, Share2, Filter, Settings, Search, ExternalLink, ArrowRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface PlatformVisualPreviewProps {
  sourcePlatform: string;
  targetPlatform: string;
}

export const PlatformVisualPreview: React.FC<PlatformVisualPreviewProps> = ({
  sourcePlatform,
  targetPlatform,
}) => {
  // Pie chart data based on regional sales distribution
  const pieChartData = [
    { name: 'North America', value: 45 },
    { name: 'Europe', value: 20 },
    { name: 'Asia Pacific', value: 35 },
  ];

  // Platform-specific color schemes
  const getPlatformColors = (platform: string): string[] => {
    switch (platform) {
      case 'Qlik':
        return ['#009845', '#0065a3', '#004a7c'];
      case 'Tableau':
        return ['#1f77b4', '#ff7f0e', '#2ca02c'];
      case 'Looker':
        return ['#4F46E5', '#6366F1', '#818CF8'];
      default:
        return ['#10B981', '#34D399', '#6EE7B7'];
    }
  };

  const renderChart = (platform: string) => {
    const colors = getPlatformColors(platform);
    return (
      <div style={{ width: '100%', height: '100%', minHeight: '120px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <RechartsPieChart>
            <Pie
              data={pieChartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, value }) => `${name}: ${value}%`}
              outerRadius={60}
              fill="#8884d8"
              dataKey="value"
            >
              {pieChartData.map((entry, index) => (
                <Cell key={`platform-visual-${entry.name}-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => `${value}%`} />
          </RechartsPieChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const sampleData = [
    { id: 'TXN-001', date: '2024-01-15', amount: '$1,245.00', customer: 'CUST-A123', region: 'North America' },
    { id: 'TXN-002', date: '2024-01-16', amount: '$892.50', customer: 'CUST-B456', region: 'Europe' },
    { id: 'TXN-003', date: '2024-01-17', amount: '$2,150.75', customer: 'CUST-C789', region: 'Asia Pacific' },
  ];

  const renderInterface = (platform: string) => {
    if (platform === 'Qlik') {
      return (
        <div className="bg-[#004a7c] rounded border border-[#009845] overflow-hidden shadow-lg h-[300px]">
          <div className="bg-[#004a7c] border-b border-white/10 px-2 py-1 flex items-center gap-2">
            <div className="w-4 h-4 bg-[#009845] rounded-sm flex items-center justify-center">
              <span className="text-white text-[8px] font-bold">Q</span>
            </div>
            <span className="text-[9px] font-semibold text-white">Qlik Sense</span>
          </div>
          <div className="flex h-[calc(100%-24px)]">
            <div className="w-12 bg-[#003a62] border-r border-white/5 p-1">
              <div className="text-[6px] text-white/40 mb-2 uppercase">Sheets</div>
              <div className="text-[6px] text-[#009845] bg-white/5 px-1 py-0.5 rounded mb-1">Dashboard</div>
              <div className="text-[6px] text-white/40 px-1 py-0.5">Details</div>
            </div>
            <div className="flex-1 bg-white p-2 overflow-hidden">
              <div className="bg-[#f0f0f0] rounded h-full p-2 flex flex-col">
                <span className="text-[8px] font-bold text-[#004a7c] mb-2">Sales Analysis</span>
                <div className="flex-1 bg-white rounded border border-gray-200 p-2">
                  {renderChart(platform)}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (platform === 'Tableau') {
      return (
        <div className="bg-white rounded border border-[#1f77b4] overflow-hidden shadow-lg h-[300px]">
          <div className="bg-[#1f77b4] px-2 py-1 flex items-center gap-2">
            <div className="w-4 h-4 bg-white rounded flex items-center justify-center">
              <span className="text-[#1f77b4] text-[8px] font-bold">+</span>
            </div>
            <span className="text-[9px] font-semibold text-white">Tableau Server</span>
          </div>
          <div className="flex bg-[#F5F5F5] h-[calc(100%-24px)]">
            <div className="w-14 bg-white border-r border-gray-200 p-1.5 space-y-2">
              <div className="text-[6px] text-gray-500 font-bold uppercase">Data</div>
              <div className="text-[6px] text-[#1f77b4] flex items-center gap-1"><Database className="w-2 h-2" />Sales</div>
              <div className="text-[6px] text-blue-600 bg-blue-50 p-0.5">Region</div>
              <div className="text-[6px] text-green-600">Sales</div>
            </div>
            <div className="flex-1 p-2">
              <div className="bg-white border border-gray-200 rounded h-full p-2 flex flex-col">
                <div className="text-[7px] text-gray-400 mb-2 italic">Sheet 1: Region vs Sales</div>
                <div className="flex-1">
                  {renderChart(platform)}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (platform === 'Looker') {
      return (
        <div className="bg-white rounded border border-indigo-300 overflow-hidden shadow-lg h-[300px]">
          <div className="bg-white border-b border-gray-200 px-2 py-1 flex items-center gap-2">
            <div className="w-5 h-5 bg-indigo-600 rounded flex items-center justify-center">
              <span className="text-white text-[9px] font-bold">L</span>
            </div>
            <span className="text-[9px] font-semibold text-gray-800">Looker</span>
          </div>
          <div className="flex h-[calc(100%-28px)]">
            <div className="w-20 bg-gray-50 border-r border-gray-200 p-1.5">
              <div className="text-[6px] text-gray-400 mb-1 font-bold uppercase">Dimensions</div>
              <div className="text-[6px] text-indigo-600 bg-indigo-50 p-0.5 rounded mb-2">Region</div>
              <div className="text-[6px] text-gray-400 mb-1 font-bold uppercase">Measures</div>
              <div className="text-[6px] text-indigo-600 bg-indigo-50 p-0.5 rounded">Amount</div>
            </div>
            <div className="flex-1 flex flex-col p-2">
              <div className="flex-1 bg-white border border-gray-100 rounded flex items-center justify-center p-2">
                {renderChart(platform)}
              </div>
              <div className="mt-2 text-[6px] text-gray-400">Visualization: Pie Chart</div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-gray-50 rounded border border-dashed border-gray-300 h-[300px] flex items-center justify-center text-gray-400 text-[10px]">
        Interface not available
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Current Platform: {sourcePlatform}</div>
          {renderInterface(sourcePlatform)}
        </div>
        <div className="space-y-2">
          <div className="text-[10px] font-medium text-[#111827] uppercase tracking-wider">Target Platform: {targetPlatform}</div>
          {renderInterface(targetPlatform)}
        </div>
      </div>
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex items-start gap-2">
        <div className="p-1 bg-blue-100 rounded text-blue-600">
          <TrendingUp className="w-3 h-3" />
        </div>
        <div>
          <p className="text-[11px] font-semibold text-blue-900">Migration Insight</p>
          <p className="text-[10px] text-blue-800 leading-relaxed">
            Migrating from {sourcePlatform} to {targetPlatform} will maintain all data relationships while improving query performance by approximately 15% due to optimized connector drivers.
          </p>
        </div>
      </div>
    </div>
  );
};