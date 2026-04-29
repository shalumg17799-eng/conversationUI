import React from 'react';
import { ArrowRight, Database, FileText, BarChart3 } from 'lucide-react';
import { BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from 'recharts';

// Platform Preview Comparison Component (Step 5.5)
interface PlatformPreviewComparisonProps {
  msgId: string;
  reportName: string;
  sourcePlatform: string;
  destinationPlatform?: string;
  onContinue: () => void;
  onBack?: () => void;
}

export const PlatformPreviewComparison: React.FC<PlatformPreviewComparisonProps> = ({ 
  msgId, 
  reportName, 
  sourcePlatform, 
  destinationPlatform = 'Report Hub',
  onContinue, 
  onBack 
}) => {
  // msgId is kept for consistency with other step components
  
  // Format platform names for display
  const formatPlatformName = (platform: string) => {
    const platformMap: Record<string, string> = {
      'tableau': 'Tableau',
      'looker': 'Looker',
      'qlik': 'Qlik',
      'powerbi': 'Power BI',
      'bifabric': 'Report Hub'
    };
    return platformMap[platform.toLowerCase()] || platform;
  };

  const sourcePlatformName = formatPlatformName(sourcePlatform);
  const destinationPlatformName = formatPlatformName(destinationPlatform);

  // Mock data for migration visualization
  const monthlyData = [
    { month: 'Jan', churnRate: 4.2, revenue: 12500 },
    { month: 'Feb', churnRate: 5.1, revenue: 13200 },
    { month: 'Mar', churnRate: 4.8, revenue: 14100 },
    { month: 'Apr', churnRate: 6.3, revenue: 13800 },
    { month: 'May', churnRate: 5.5, revenue: 15200 },
    { month: 'Jun', churnRate: 4.9, revenue: 16400 },
  ];

  const regionalData = [
    { name: 'North America', value: 42, color: '#3B82F6' },
    { name: 'Europe', value: 28, color: '#8B5CF6' },
    { name: 'Asia Pacific', value: 20, color: '#10B981' },
    { name: 'Other', value: 10, color: '#F59E0B' },
  ];

  const sampleTables = ['customers', 'orders', 'products', 'revenue_summary'];

  return (
    <div className="mb-6">
      {/* Assistant Message */}
      <div className="bg-gray-50 px-4 py-3 rounded-xl mb-4 max-w-[80%]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="text-[13px] text-[#111827] font-semibold mb-2">
          Preview your report migration
        </div>
        <div className="text-[13px] text-[#111827]">
          Compare how <span className="font-semibold">{reportName}</span> will look before and after migration. The layout and data remain consistent, but the visual styling adapts to {destinationPlatformName}'s interface.
        </div>
      </div>

      {/* Main Content Area */}
      <div className="space-y-4 max-w-[90%]">
        {/* Section Header */}
        <div>
          <h3 className="text-[14px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
            PLATFORM PREVIEW
          </h3>
          <p className="text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
            Compare how the report appears before and after migration.
          </p>
        </div>

        {/* Platform Preview Image */}
        <div className="bg-white border border-[#E5E7EB] rounded-xl overflow-hidden">
          {/* Two-column comparison layout */}
          <div className="grid grid-cols-2 divide-x divide-[#E5E7EB]">
            {/* LEFT COLUMN - Before Migration */}
            <div className="p-4">
              <div className="mb-3">
                <div className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Before Migration
                </div>
                <div className="text-[13px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Source Platform: {sourcePlatformName}
                </div>
              </div>

              {/* Simulated Platform UI Shell */}
              <div className="bg-gray-50 border border-[#E5E7EB] rounded-lg overflow-hidden">
                {/* Sidebar + Main Area */}
                <div className="flex" style={{ height: '320px' }}>
                  {/* Sidebar - Tables List */}
                  <div className="w-32 bg-gray-100 border-r border-[#E5E7EB] p-2">
                    <div className="text-[9px] font-semibold text-[#6B7280] uppercase mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                      Tables
                    </div>
                    <div className="space-y-1">
                      {sampleTables.map((table) => (
                        <div key={table} className="flex items-center gap-1 text-[10px] text-[#374151] bg-white px-2 py-1 rounded" style={{ fontFamily: 'Inter, sans-serif' }}>
                          <Database className="w-3 h-3 text-[#6B7280]" />
                          <span className="truncate">{table}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Main Area - Query + Results */}
                  <div className="flex-1 p-2 space-y-2">
                    {/* Query Panel */}
                    <div className="bg-white border border-[#E5E7EB] rounded p-2">
                      <div className="flex items-center gap-1 mb-1">
                        <FileText className="w-3 h-3 text-[#6B7280]" />
                        <span className="text-[9px] font-semibold text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>QUERY</span>
                      </div>
                      <div className="text-[9px] text-[#374151] font-mono leading-tight" style={{ fontFamily: 'monospace' }}>
                        SELECT month, churn_rate<br />
                        FROM customer_churn<br />
                        WHERE year = 2024
                      </div>
                    </div>

                    {/* Results - Pie Chart */}
                    <div className="bg-white border border-[#E5E7EB] rounded p-2">
                      <div className="flex items-center gap-1 mb-1">
                        <BarChart3 className="w-3 h-3 text-[#6B7280]" />
                        <span className="text-[9px] font-semibold text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>RESULTS</span>
                      </div>
                      <div style={{ height: '160px' }}>
                        <ResponsiveContainer width="100%" height={160}>
                          <PieChart>
                            <Pie
                              data={regionalData}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              outerRadius={50}
                              label={false}
                            >
                              {regionalData.map((entry, index) => (
                                <Cell key={`platform-preview-${entry.name}-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={{ fontSize: '10px', fontFamily: 'Inter, sans-serif' }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Data Preservation Label */}
              <div className="text-[9px] text-[#6B7280] text-center mt-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                Data preserved via Report Hub migration model
              </div>
            </div>

            {/* RIGHT COLUMN - After Migration */}
            <div className="p-4">
              <div className="mb-3">
                <div className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                  After Migration
                </div>
                <div className="text-[13px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Destination Platform: {destinationPlatformName}
                </div>
              </div>

              {/* Simulated Platform UI Shell */}
              <div className="bg-gray-50 border border-[#E5E7EB] rounded-lg overflow-hidden">
                {/* Sidebar + Main Area */}
                <div className="flex" style={{ height: '320px' }}>
                  {/* Sidebar - Tables List */}
                  <div className="w-32 bg-blue-50 border-r border-[#E5E7EB] p-2">
                    <div className="text-[9px] font-semibold text-[#6B7280] uppercase mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                      Tables
                    </div>
                    <div className="space-y-1">
                      {sampleTables.map((table) => (
                        <div key={table} className="flex items-center gap-1 text-[10px] text-[#374151] bg-white px-2 py-1 rounded" style={{ fontFamily: 'Inter, sans-serif' }}>
                          <Database className="w-3 h-3 text-blue-600" />
                          <span className="truncate">{table}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Main Area - Query + Results */}
                  <div className="flex-1 p-2 space-y-2">
                    {/* Query Panel */}
                    <div className="bg-white border border-[#E5E7EB] rounded p-2">
                      <div className="flex items-center gap-1 mb-1">
                        <FileText className="w-3 h-3 text-blue-600" />
                        <span className="text-[9px] font-semibold text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>QUERY</span>
                      </div>
                      <div className="text-[9px] text-[#374151] font-mono leading-tight" style={{ fontFamily: 'monospace' }}>
                        SELECT month, churn_rate<br />
                        FROM customer_churn<br />
                        WHERE year = 2024
                      </div>
                    </div>

                    {/* Results - Bar Chart */}
                    <div className="bg-white border border-[#E5E7EB] rounded p-2">
                      <div className="flex items-center gap-1 mb-1">
                        <BarChart3 className="w-3 h-3 text-blue-600" />
                        <span className="text-[9px] font-semibold text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>RESULTS</span>
                      </div>
                      <div style={{ height: '160px' }}>
                        <ResponsiveContainer width="100%" height={160}>
                          <BarChart data={monthlyData} margin={{ top: 5, right: 5, left: 0, bottom: 20 }}>
                            <XAxis 
                              dataKey="month" 
                              tick={{ fill: '#6B7280', fontSize: 9, fontFamily: 'Inter, sans-serif' }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis 
                              tick={{ fill: '#6B7280', fontSize: 9, fontFamily: 'Inter, sans-serif' }}
                              axisLine={false}
                              tickLine={false}
                              domain={[0, 8]}
                            />
                            <Tooltip contentStyle={{ fontSize: '10px', fontFamily: 'Inter, sans-serif' }} />
                            <Bar dataKey="churnRate" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Data Preservation Label */}
              <div className="text-[9px] text-[#6B7280] text-center mt-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                Data preserved via Report Hub migration model
              </div>
            </div>
          </div>
        </div>

        {/* Explanatory Note */}
        <div className="text-[11px] text-[#6B7280] italic" style={{ fontFamily: 'Inter, sans-serif' }}>
          The source preview reflects the original report in its native BI tool. The destination preview shows the same report standardized in {destinationPlatformName}.
        </div>

        {/* Action Controls */}
        <div className="flex gap-3 pt-2">
          {onBack && (
            <button
              onClick={onBack}
              className="px-4 py-2 text-[13px] font-medium text-[#374151] bg-white border border-[#D1D5DB] rounded-lg hover:bg-gray-50 transition-colors"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Back to visual configuration
            </button>
          )}
          <button
            onClick={onContinue}
            className="px-4 py-2 text-[13px] font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center gap-2"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            Continue to execution
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};