import React, { useState } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Activity, TrendingUp, ChevronDown, ChevronUp, FileText, Database, Users, Eye, LayoutGrid, Table2 } from 'lucide-react';

interface ReportGenerationPreviewProps {
  layoutType: 'template' | 'custom' | 'reference';
  selectedTemplate?: string;
  customLayoutComponents?: Array<{id: string; type: string; position: number; size: string}>;
  referenceReportName?: string;
  dataset?: any;
  dimensions?: string[];
  selectedDimensions?: string[];
  filters?: string[];
  expectedUsage?: string;
  userRoles?: string[];
  selectedUserVolume?: string;
  selectedViewFrequency?: string;
  isReportFlowMode?: boolean;
  onContinue: () => void;
  onEditLayout: () => void;
  onEditScope: () => void;
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

export const ReportGenerationPreview: React.FC<ReportGenerationPreviewProps> = ({
  layoutType,
  selectedTemplate,
  customLayoutComponents,
  referenceReportName,
  dataset,
  dimensions,
  selectedDimensions,
  filters,
  expectedUsage,
  userRoles,
  selectedUserVolume,
  selectedViewFrequency,
  isReportFlowMode,
  onContinue,
  onEditLayout,
  onEditScope,
}) => {
  const [isDefinitionExpanded, setIsDefinitionExpanded] = useState(true);

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
    <div className="bg-white border border-gray-200 rounded-lg p-4" key={`chart-${id}`}>
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
    <div className="bg-white border border-gray-200 rounded-lg p-4" key={`chart-${id}`}>
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
    <div className="bg-white border border-gray-200 rounded-lg p-4" key={`chart-${id}`}>
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

  const renderComponentByType = (type: string, size: string) => {
    const heightClass = 
      size === 'small' ? 'h-auto' :
      size === 'large' ? 'h-auto' :
      'h-auto';

    switch (type) {
      case 'kpi_tile':
        return <div className={heightClass}>{renderKPITile('Total Revenue', '$42,850', '+12.5%')}</div>;
      case 'bar_chart':
        return <div className={heightClass}>{renderBarChart('preview-bar')}</div>;
      case 'line_chart':
        return <div className={heightClass}>{renderLineChart('preview-line')}</div>;
      case 'pie_chart':
        return <div className={heightClass}>{renderPieChart('preview-pie')}</div>;
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
    if (!customLayoutComponents || customLayoutComponents.length === 0) {
      return (
        <div className="text-center py-12 text-gray-400">
          <p className="text-[12px]" style={{ fontFamily: 'Inter, sans-serif' }}>
            No layout components configured
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {customLayoutComponents.map((comp) => (
          <div key={comp.id}>
            {renderComponentByType(comp.type, comp.size)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="mt-4 space-y-5">
      {/* Main Preview Section */}
      <div className="bg-white border border-[#E5E7EB] rounded-lg p-5">
        <div className="mb-4">
          <h4 className="text-[15px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
            Report Preview
          </h4>
          <p className="text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
            This is a model view of how your report will appear
          </p>
        </div>

        {/* Report Preview Content */}
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          {layoutType === 'template' ? renderTemplatePreview() : layoutType === 'custom' ? renderCustomPreview() : renderTemplatePreview()}
          
          {/* Fixed Table - Report Flow Mode Only */}
          {isReportFlowMode && (
            <div className="mt-4">
              <div className="bg-white border-2 border-[#E5E7EB] rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Table2 className="w-4 h-4 text-[#6B7280]" />
                    <span className="text-[12px] text-[#111827] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                      Table (Fixed)
                    </span>
                  </div>
                  <span className="text-[10px] text-[#9CA3AF] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Always visible
                  </span>
                </div>

                {/* Table preview */}
                <div className="border border-gray-200 rounded overflow-hidden">
                  {/* Table header */}
                  <div className="grid grid-cols-4 bg-gray-50 border-b border-gray-200">
                    <div className="px-3 py-2 text-[10px] font-semibold text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>Column 1</div>
                    <div className="px-3 py-2 text-[10px] font-semibold text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>Column 2</div>
                    <div className="px-3 py-2 text-[10px] font-semibold text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>Column 3</div>
                    <div className="px-3 py-2 text-[10px] font-semibold text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>Column 4</div>
                  </div>
                  {/* Table rows */}
                  {[1, 2, 3].map((row) => (
                    <div key={row} className="grid grid-cols-4 border-b border-gray-100 last:border-b-0">
                      <div className="px-3 py-2 text-[10px] text-[#9CA3AF]" style={{ fontFamily: 'Inter, sans-serif' }}>Data {row}</div>
                      <div className="px-3 py-2 text-[10px] text-[#9CA3AF]" style={{ fontFamily: 'Inter, sans-serif' }}>Data {row}</div>
                      <div className="px-3 py-2 text-[10px] text-[#9CA3AF]" style={{ fontFamily: 'Inter, sans-serif' }}>Data {row}</div>
                      <div className="px-3 py-2 text-[10px] text-[#9CA3AF]" style={{ fontFamily: 'Inter, sans-serif' }}>Data {row}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Report Definition Panel */}
      <div className="bg-white border border-[#E5E7EB] rounded-lg overflow-hidden">
        <button
          onClick={() => setIsDefinitionExpanded(!isDefinitionExpanded)}
          className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#6B7280]" />
            <h4 className="text-[13px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
              Report Definition
            </h4>
          </div>
          {isDefinitionExpanded ? (
            <ChevronUp className="w-4 h-4 text-[#6B7280]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#6B7280]" />
          )}
        </button>

        {isDefinitionExpanded && (
          <div className="px-5 py-4 border-t border-[#E5E7EB] space-y-4">
            {/* Data Source */}
            <div className="flex items-start gap-3">
              <Database className="w-4 h-4 text-[#6B7280] mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-[11px] text-[#6B7280] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Data Source
                </p>
                <p className="text-[12px] text-[#111827] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {dataset?.source || 'Data Marketplace'}
                </p>
              </div>
            </div>

            {/* Dataset */}
            {dataset && (
              <div className="flex items-start gap-3">
                <Database className="w-4 h-4 text-[#6B7280] mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-[11px] text-[#6B7280] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Dataset
                  </p>
                  <p className="text-[12px] text-[#111827] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {dataset.name}
                  </p>
                </div>
              </div>
            )}

            {/* Dimensions */}
            {selectedDimensions && selectedDimensions.length > 0 && (
              <div className="flex items-start gap-3">
                <LayoutGrid className="w-4 h-4 text-[#6B7280] mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-[11px] text-[#6B7280] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Dimensions
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedDimensions.map((dim, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center px-2 py-0.5 bg-blue-50 text-blue-700 text-[11px] rounded border border-blue-200"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        {dim}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Expected Usage */}
            {(selectedUserVolume || selectedViewFrequency) && (
              <div className="flex items-start gap-3">
                <Users className="w-4 h-4 text-[#6B7280] mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-[11px] text-[#6B7280] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Expected Usage
                  </p>
                  <p className="text-[12px] text-[#111827] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {selectedUserVolume && `${selectedUserVolume} users`}
                    {selectedUserVolume && selectedViewFrequency && ' • '}
                    {selectedViewFrequency && `${selectedViewFrequency} views`}
                  </p>
                </div>
              </div>
            )}

            {/* Layout Type */}
            <div className="flex items-start gap-3">
              <LayoutGrid className="w-4 h-4 text-[#6B7280] mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-[11px] text-[#6B7280] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Layout Type
                </p>
                <p className="text-[12px] text-[#111827] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {layoutType === 'template' ? 'Template-based' : layoutType === 'custom' ? 'Custom' : 'Referenced report'} 
                  {layoutType === 'template' && selectedTemplate && ` (${selectedTemplate.replace(/_/g, ' ')})`}
                  {layoutType === 'custom' && customLayoutComponents && ` (${customLayoutComponents.length} component${customLayoutComponents.length !== 1 ? 's' : ''})`}
                  {layoutType === 'reference' && referenceReportName && ` (${referenceReportName})`}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={onContinue}
          className="px-5 py-2.5 bg-[#111827] hover:bg-[#0F172A] text-white rounded-lg text-[13px] font-medium transition-colors flex items-center gap-2"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          Looks good — continue
        </button>
        <button
          onClick={onEditLayout}
          className="px-5 py-2.5 bg-white hover:bg-gray-50 border border-[#E5E7EB] text-[#111827] rounded-lg text-[13px] font-medium transition-colors"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          Edit layout
        </button>
        <button
          onClick={onEditScope}
          className="text-[13px] text-[#6B7280] hover:text-[#111827] underline font-medium"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          Edit scope
        </button>
      </div>
    </div>
  );
};