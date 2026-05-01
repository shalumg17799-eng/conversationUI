import React, { useState, useEffect } from 'react';
import { CheckCircle2, RefreshCw, TrendingUp, Eye } from 'lucide-react';

// Report Generation and Preview Component (Step 5.5)
interface ReportPreviewProps {
  msgId: string;
  reportName: string;
  layoutOption: string;
  selectedTemplate?: string;
  onFinalize: () => void;
  onBackToVisual: () => void;
}

export const ReportPreviewUI: React.FC<ReportPreviewProps> = ({ msgId, reportName, layoutOption, selectedTemplate, onFinalize, onBackToVisual }) => {
  // msgId is kept for consistency with other step components but not currently used
  const [generationStep, setGenerationStep] = useState(0);
  const [isGenerating, setIsGenerating] = useState(true);

  // Simulate generation steps
  useEffect(() => {
    const steps = ['compile', 'bind', 'render', 'preview'];
    let currentStep = 0;
    
    const interval = setInterval(() => {
      if (currentStep < steps.length) {
        setGenerationStep(currentStep + 1);
        currentStep++;
      } else {
        setIsGenerating(false);
        clearInterval(interval);
      }
    }, 600);

    return () => clearInterval(interval);
  }, []);

  const getStepStatus = (stepIndex: number) => {
    if (stepIndex < generationStep) return 'completed';
    if (stepIndex === generationStep) return 'in-progress';
    return 'pending';
  };

  return (
    <div className="mb-6">
      {/* Assistant Message */}
      <div className="bg-gray-50 px-4 py-3 rounded-xl mb-4 max-w-[80%]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="text-[13px] text-[#111827] font-semibold mb-2">
          Generating your model report…
        </div>
        <div className="text-[13px] text-[#111827]">
          I'll compile the selected layout and configuration into a Model Report. Review the full report in preview mode before finalizing.
        </div>
      </div>

      {/* Main Content Area */}
      <div className="space-y-4 max-w-[90%]">
        {/* Model Report Generation Card */}
        <div className="bg-white border border-[#E5E7EB] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[14px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
              MODEL REPORT
            </h3>
            {!isGenerating && (
              <span className="inline-flex items-center gap-1.5 bg-green-50 text-green-700 text-[11px] font-semibold px-2.5 py-1 rounded-full">
                <CheckCircle2 className="w-3 h-3" />
                Ready
              </span>
            )}
          </div>

          {/* Generation Steps */}
          <div className="space-y-3">
            {[
              { id: 'compile', label: 'Compile layout', index: 0 },
              { id: 'bind', label: 'Bind data & filters', index: 1 },
              { id: 'render', label: 'Render visuals', index: 2 },
              { id: 'preview', label: 'Prepare preview', index: 3 },
            ].map((step) => {
              const status = getStepStatus(step.index);
              return (
                <div key={step.id} className="flex items-center gap-3">
                  {status === 'completed' && (
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                  )}
                  {status === 'in-progress' && (
                    <RefreshCw className="w-4 h-4 text-blue-600 flex-shrink-0 animate-spin" />
                  )}
                  {status === 'pending' && (
                    <div className="w-4 h-4 rounded-full border-2 border-gray-300 flex-shrink-0" />
                  )}
                  <span className={`text-[12px] ${
                    status === 'completed' ? 'text-[#111827]' : 
                    status === 'in-progress' ? 'text-blue-600 font-medium' : 
                    'text-[#9CA3AF]'
                  }`} style={{ fontFamily: 'Inter, sans-serif' }}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>

          {!isGenerating && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-[12px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                Report name: <span className="font-medium text-[#111827]">{reportName}</span>
              </p>
              <p className="text-[12px] text-[#6B7280] mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                Layout: <span className="font-medium text-[#111827]">
                  {layoutOption === 'keep_current' ? 'Keep current layout' :
                   layoutOption === 'template' ? `Template (${selectedTemplate || 'Selected'})` :
                   layoutOption === 'custom' ? 'Custom layout' :
                   'Referenced report'}
                </span>
              </p>
            </div>
          )}
        </div>

        {/* Preview Mode Section */}
        {!isGenerating && (
          <div className="bg-white border border-[#E5E7EB] rounded-xl p-5">
            <div className="mb-4">
              <h3 className="text-[14px] font-semibold text-[#111827] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                PREVIEW MODE
              </h3>
              <p className="text-[11px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                Review data accuracy and visual flow end-to-end before finalizing.
              </p>
            </div>

            {/* Report Preview Frame */}
            <div className="bg-gray-50 border-2 border-gray-200 rounded-lg overflow-hidden">
              {/* Preview Header */}
              <div className="bg-white border-b border-gray-200 px-4 py-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-[13px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {reportName}
                  </h4>
                  <span className="text-[10px] text-[#6B7280] bg-blue-50 px-2 py-1 rounded" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Report preview (Report Hub)
                  </span>
                </div>
                
                {/* Filters Row */}
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-[10px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Filters:
                  </span>
                  {['Segment: All', 'Region: North America', 'Time period: Last 6 months'].map((filter, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1 bg-white border border-gray-200 text-[10px] text-[#111827] px-2 py-1 rounded" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {filter}
                    </span>
                  ))}
                </div>
              </div>

              {/* Preview Content */}
              <div className="p-4 space-y-4">
                {/* KPI Tiles Row */}
                <div className="grid grid-cols-4 gap-3">
                  {['Total Revenue', 'Active Users', 'Conversion Rate', 'Avg. Order Value'].map((kpi, idx) => (
                    <div key={idx} className="bg-white border border-gray-200 rounded-lg p-3">
                      <div className="text-[9px] text-[#6B7280] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {kpi}
                      </div>
                      <div className="text-[16px] font-bold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {idx === 0 ? '$2.4M' : idx === 1 ? '12.5K' : idx === 2 ? '3.8%' : '$192'}
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <TrendingUp className="w-3 h-3 text-green-600" />
                        <span className="text-[9px] text-green-600 font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                          +12.3%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Chart Placeholder */}
                <div className="bg-white border border-gray-200 rounded-lg p-4 h-48">
                  <div className="text-[11px] font-semibold text-[#111827] mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Revenue Trend Over Time
                  </div>
                  <div className="h-32 bg-gradient-to-br from-blue-50 to-purple-50 rounded flex items-center justify-center">
                    <div className="text-[10px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                      [Chart visualization preview]
                    </div>
                  </div>
                </div>

                {/* Table Placeholder */}
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="text-[11px] font-semibold text-[#111827] mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Top Performing Segments
                  </div>
                  <div className="space-y-2">
                    {['Enterprise', 'Mid-Market', 'SMB'].map((segment, idx) => (
                      <div key={idx} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                        <span className="text-[10px] text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                          {segment}
                        </span>
                        <div className="flex items-center gap-4">
                          <span className="text-[10px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                            ${(850 - idx * 150)}K
                          </span>
                          <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500" style={{ width: `${85 - idx * 15}%` }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Preview Actions */}
            <div className="flex items-center gap-3 mt-4">
              <button
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-[12px] font-medium text-[#111827] hover:bg-gray-50 transition-colors"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                <Eye className="w-4 h-4" />
                Open full preview
              </button>
              <button
                onClick={onBackToVisual}
                className="text-[12px] text-[#6B7280] hover:text-[#111827] underline"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                Back to visual configuration
              </button>
              <button
                className="text-[12px] text-[#6B7280] hover:text-[#111827] underline"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                Flag an issue
              </button>
            </div>
          </div>
        )}

        {/* Primary CTA */}
        {!isGenerating && (
          <div className="flex flex-col gap-3">
            <button
              onClick={onFinalize}
              className="px-6 py-2.5 rounded-lg text-[13px] font-medium transition-all shadow-sm bg-[#111827] hover:bg-[#0F172A] text-white cursor-pointer"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Finalize and run migration
            </button>
          </div>
        )}
      </div>
    </div>
  );
}