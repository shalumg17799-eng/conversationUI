import React from 'react';

export function ReportSkeleton() {
  return (
    <div className="mt-4 space-y-5 animate-pulse">
      {/* Title block */}
      <div className="bg-white border border-[#E5E3DF] rounded-[12px] p-5"
        style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
        <div className="h-5 bg-[#F4F2EF] rounded-[6px] w-2/5 mb-2.5" />
        <div className="h-3.5 bg-[#F4F2EF] rounded-[6px] w-3/4 mb-1.5" />
        <div className="h-3.5 bg-[#F4F2EF] rounded-[6px] w-1/2" />
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="bg-white border border-[#E5E3DF] rounded-[12px] p-5"
            style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
            <div className="h-3 bg-[#F4F2EF] rounded-[6px] w-16 mb-4" />
            <div className="h-7 bg-[#F4F2EF] rounded-[6px] w-24 mb-2.5" />
            <div className="h-3 bg-[#F4F2EF] rounded-[6px] w-12" />
          </div>
        ))}
      </div>

      {/* Chart placeholder */}
      <div className="bg-white border border-[#E5E3DF] rounded-[12px] p-5"
        style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
        <div className="h-4 bg-[#F4F2EF] rounded-[6px] w-40 mb-1.5" />
        <div className="h-3 bg-[#F4F2EF] rounded-[6px] w-56 mb-5" />
        <div className="h-[200px] bg-[#F4F2EF] rounded-[8px] w-full" />
      </div>

      {/* Ranked list placeholder */}
      <div className="bg-white border border-[#E5E3DF] rounded-[12px] p-5"
        style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
        <div className="h-4 bg-[#F4F2EF] rounded-[6px] w-32 mb-5" />
        <div className="space-y-4">
          {[80, 65, 50, 35].map((w, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="h-3.5 bg-[#F4F2EF] rounded-[6px]" style={{ width: `${w}%` }} />
                <div className="h-3.5 bg-[#F4F2EF] rounded-[6px] w-12" />
              </div>
              <div className="h-1 bg-[#F4F2EF] rounded-full w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
