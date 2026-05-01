import React from 'react';
import { BarChart3, LineChart, PieChart, Table2, Activity } from 'lucide-react';

interface TemplatePreviewProps {
  templateId: string;
}

export const TemplatePreview: React.FC<TemplatePreviewProps> = ({ templateId }) => {
  const renderPreview = () => {
    switch (templateId) {
      case 'kpi_summary':
        return (
          <div className="flex gap-2 h-full items-center justify-center p-2">
            <div className="flex-1 bg-white border border-gray-300 rounded p-2 h-16 flex flex-col items-center justify-center">
              <Activity className="w-4 h-4 text-gray-400 mb-1" />
              <div className="h-1 w-8 bg-gray-300 rounded"></div>
            </div>
            <div className="flex-1 bg-white border border-gray-300 rounded p-2 h-16 flex flex-col items-center justify-center">
              <Activity className="w-4 h-4 text-gray-400 mb-1" />
              <div className="h-1 w-8 bg-gray-300 rounded"></div>
            </div>
            <div className="flex-1 bg-white border border-gray-300 rounded p-2 h-16 flex flex-col items-center justify-center">
              <Activity className="w-4 h-4 text-gray-400 mb-1" />
              <div className="h-1 w-8 bg-gray-300 rounded"></div>
            </div>
          </div>
        );
      
      case 'trend_over_time':
        return (
          <div className="h-full flex items-center justify-center p-3">
            <div className="w-full h-20 bg-white border border-gray-300 rounded p-3 flex items-end gap-1">
              <LineChart className="w-full h-12 text-gray-400" strokeWidth={1} />
            </div>
          </div>
        );
      
      case 'comparison':
        return (
          <div className="h-full flex items-center justify-center p-3">
            <div className="w-full h-20 bg-white border border-gray-300 rounded p-3 flex items-end justify-around gap-1">
              <div className="w-6 h-12 bg-gray-300 rounded"></div>
              <div className="w-6 h-16 bg-gray-300 rounded"></div>
              <div className="w-6 h-10 bg-gray-300 rounded"></div>
              <div className="w-6 h-14 bg-gray-300 rounded"></div>
            </div>
          </div>
        );
      
      case 'table_first':
        return (
          <div className="h-full flex items-center justify-center p-3">
            <div className="w-full bg-white border border-gray-300 rounded p-2 space-y-1">
              <div className="flex gap-1">
                <div className="h-2 w-full bg-gray-400 rounded"></div>
                <div className="h-2 w-full bg-gray-400 rounded"></div>
                <div className="h-2 w-full bg-gray-400 rounded"></div>
              </div>
              <div className="flex gap-1">
                <div className="h-2 w-full bg-gray-200 rounded"></div>
                <div className="h-2 w-full bg-gray-200 rounded"></div>
                <div className="h-2 w-full bg-gray-200 rounded"></div>
              </div>
              <div className="flex gap-1">
                <div className="h-2 w-full bg-gray-200 rounded"></div>
                <div className="h-2 w-full bg-gray-200 rounded"></div>
                <div className="h-2 w-full bg-gray-200 rounded"></div>
              </div>
              <div className="flex gap-1">
                <div className="h-2 w-full bg-gray-200 rounded"></div>
                <div className="h-2 w-full bg-gray-200 rounded"></div>
                <div className="h-2 w-full bg-gray-200 rounded"></div>
              </div>
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="w-full h-24 bg-gray-50 rounded border border-gray-200 overflow-hidden">
      {renderPreview()}
    </div>
  );
};
