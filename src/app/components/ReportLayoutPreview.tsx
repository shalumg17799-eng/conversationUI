import React from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Activity, TrendingUp } from 'lucide-react';

interface ReportLayoutPreviewProps {
  layoutType: 'template' | 'custom' | 'reference';
  selectedTemplate?: string;
  customLayoutComponents?: Array<{id: string; type: string; position: number; size: string}>;
  referenceReportName?: string;
  dataset?: any;
  dimensions?: string[];
}

const mockData = [
  { name: 'Jan', value: 4000, revenue: 2400 },
  { name: 'Feb', value: 3000, revenue: 1398 },
  { name: 'Mar', value: 2000, revenue: 9800 },
  { name: 'Apr', value: 2780, revenue: 3908 },
  { name: 'May', value: 1890, revenue: 4800 },
  { name: 'Jun', value: 2390, revenue: 3800 },
];

const mockPieData = [
  { name: 'Category A', value: 400 },
  { name: 'Category B', value: 300 },
  { name: 'Category C', value: 300 },
  { name: 'Category D', value: 200 },
];

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

export const ReportLayoutPreview: React.FC<ReportLayoutPreviewProps> = ({
  layoutType,
  selectedTemplate,
  customLayoutComponents,
  referenceReportName,
  dataset,
  dimensions,
}) => {
  const renderKPITile = (label: string, value: string, trend?: string) => (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <p className="text-[11px] text-gray-500 mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>{label}</p>
      <div className="flex items-end gap-2">
        <p className="text-[20px] font-semibold text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>{value}</p>
        {trend && (
          <div className="flex items-center gap-1 mb-1">
            <TrendingUp className="w-3 h-3 text-green-600" />
            <span className="text-[10px] text-green-600 font-medium">{trend}</span>
          </div>
        )}
      </div>
    </div>
  );

  const renderBarChart = (id: string = 'bar') => (
    <div className="bg-white border border-gray-200 rounded-lg p-4 h-[260px]" key={`chart-${id}`}>
      <h5 className="text-[12px] font-semibold text-gray-900 mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
        Monthly Performance
      </h5>
      <div style={{ width: '100%', height: '200px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={mockData}>
            <XAxis key={`xaxis-${id}`} dataKey="name" style={{ fontSize: '11px' }} />
            <YAxis key={`yaxis-${id}`} style={{ fontSize: '11px' }} />
            <Tooltip key={`tooltip-${id}`} />
            <Bar key={`bar-${id}`} dataKey="value" fill="#3B82F6" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  const renderLineChart = (id: string = 'line') => (
    <div className="bg-white border border-gray-200 rounded-lg p-4 h-[260px]" key={`chart-${id}`}>
      <h5 className="text-[12px] font-semibold text-gray-900 mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
        Trend Over Time
      </h5>
      <div style={{ width: '100%', height: '200px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={mockData}>
            <XAxis key={`xaxis-${id}`} dataKey="name" style={{ fontSize: '11px' }} />
            <YAxis key={`yaxis-${id}`} style={{ fontSize: '11px' }} />
            <Tooltip key={`tooltip-${id}`} />
            <Line key={`line-${id}`} type="monotone" dataKey="revenue" stroke="#8B5CF6" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  const renderPieChart = (id: string = 'pie') => (
    <div className="bg-white border border-gray-200 rounded-lg p-4 h-[260px]" key={`chart-${id}`}>
      <h5 className="text-[12px] font-semibold text-gray-900 mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
        Distribution
      </h5>
      <div style={{ width: '100%', height: '200px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              key={`pie-${id}`}
              data={mockPieData}
              cx="50%"
              cy="50%"
              labelLine={false}
              outerRadius={60}
              fill="#8884d8"
              dataKey="value"
            >
              {mockPieData.map((entry, index) => (
                <Cell key={`cell-${id}-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip key={`tooltip-${id}`} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  const renderTable = () => (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <table className="w-full text-[11px]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-2 text-left font-semibold text-gray-700">Period</th>
            <th className="px-4 py-2 text-right font-semibold text-gray-700">Value</th>
            <th className="px-4 py-2 text-right font-semibold text-gray-700">Revenue</th>
          </tr>
        </thead>
        <tbody>
          {mockData.map((row, idx) => (
            <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-4 py-2 text-gray-900">{row.name}</td>
              <td className="px-4 py-2 text-right text-gray-900">{row.value.toLocaleString()}</td>
              <td className="px-4 py-2 text-right text-gray-900">${row.revenue.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderComponentByType = (type: string, size: string, id: string) => {
    const heightClass = 
      size === 'small' ? 'h-auto' :
      size === 'large' ? 'h-auto' :
      'h-auto';

    switch (type) {
      case 'kpi_tile':
        return <div className={heightClass}>{renderKPITile('Total Revenue', '$42,850', '+12.5%')}</div>;
      case 'bar_chart':
        return <div className={heightClass}>{renderBarChart(id)}</div>;
      case 'line_chart':
        return <div className={heightClass}>{renderLineChart(id)}</div>;
      case 'pie_chart':
        return <div className={heightClass}>{renderPieChart(id)}</div>;
      case 'table':
        return <div className={heightClass}>{renderTable()}</div>;
      default:
        return null;
    }
  };

  const renderTemplatePreview = () => {
    switch (selectedTemplate) {
      case 'kpi_summary':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              {renderKPITile('Total Revenue', '$42,850', '+12.5%')}
              {renderKPITile('Active Users', '1,284', '+8.2%')}
              {renderKPITile('Conversion Rate', '3.2%', '+0.5%')}
            </div>
            {renderLineChart('kpi-summary-line')}
          </div>
        );
      
      case 'trend_over_time':
        return (
          <div className="space-y-4">
            {renderLineChart('trend-line')}
            {renderBarChart('trend-bar')}
          </div>
        );
      
      case 'comparison':
        return (
          <div className="space-y-4">
            {renderBarChart('comparison-bar')}
            <div className="grid grid-cols-2 gap-4">
              {renderPieChart('comparison-pie')}
              {renderKPITile('Total', '$128,450', '+15.3%')}
            </div>
          </div>
        );
      
      case 'table_first':
        return (
          <div className="space-y-4">
            {renderTable()}
            <div className="grid grid-cols-3 gap-4">
              {renderKPITile('Sum', '$21,768', '')}
              {renderKPITile('Avg', '$3,628', '')}
              {renderKPITile('Count', '6', '')}
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  const renderCustomPreview = () => {
    // Filter out any table components since table is mandatory at bottom
    const nonTableComponents = customLayoutComponents?.filter(comp => comp.type !== 'table') || [];
    
    return (
      <div className="space-y-3">
        {/* Render dragged components above the table */}
        {nonTableComponents.length > 0 && nonTableComponents.map((comp) => (
          <div key={comp.id}>
            {renderComponentByType(comp.type, comp.size, comp.id)}
          </div>
        ))}
        
        {/* Mandatory table at the bottom */}
        <div>
          {renderTable()}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-[12px] font-semibold text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>
          Live Preview
        </h4>
        <span className="text-[10px] text-gray-500 bg-white px-2 py-1 rounded border border-gray-200" style={{ fontFamily: 'Inter, sans-serif' }}>
          {layoutType === 'reference' ? 'Referenced layout with sample data' : 'Using sample data'}
        </span>
      </div>
      
      <div className="bg-white rounded-lg p-4 border border-gray-200">
        {layoutType === 'template' ? renderTemplatePreview() : layoutType === 'custom' ? renderCustomPreview() : renderTemplatePreview()}
      </div>
    </div>
  );
};