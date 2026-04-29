import React from 'react';

export function ReportSkeleton() {
  return (
    <div className="mt-4 space-y-6 animate-pulse">
      {/* Header Skeleton */}
      <div className="bg-white border border-[#E5E7EB] rounded-xl p-5 shadow-sm border-l-4 border-l-gray-200">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-2"></div>
        <div className="h-4 bg-gray-100 rounded w-3/4"></div>
      </div>

      {/* Sections Skeleton */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <div className="h-px flex-1 bg-gray-100"></div>
          <div className="h-3 bg-gray-200 rounded w-16"></div>
          <div className="h-px flex-1 bg-gray-100"></div>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white border border-[#E5E7EB] rounded-xl p-4 h-24"></div>
          <div className="bg-white border border-[#E5E7EB] rounded-xl p-4 h-24"></div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <div className="h-px flex-1 bg-gray-100"></div>
          <div className="h-3 bg-gray-200 rounded w-24"></div>
          <div className="h-px flex-1 bg-gray-100"></div>
        </div>
        <div className="bg-white border border-[#E5E7EB] rounded-xl h-64 w-full"></div>
      </div>
    </div>
  );
}
