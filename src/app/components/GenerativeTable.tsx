import React, { useState, useMemo } from 'react';
import { ChevronRight, ChevronUp, ChevronDown, Download } from 'lucide-react';

interface GenerativeTableProps {
  columns: string[];
  rows: any[];
  title: string;
  maxInitialRows?: number;
}

export function GenerativeTable({ columns, rows, title, maxInitialRows = 10 }: GenerativeTableProps) {
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const sortedRows = useMemo(() => {
    let sortableItems = [...rows];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [rows, sortConfig]);

  const displayedRows = isExpanded ? sortedRows : sortedRows.slice(0, maxInitialRows);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const formatValue = (val: any) => {
    if (typeof val === 'number') {
      return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 2,
        minimumFractionDigits: 0
      }).format(val);
    }
    return val;
  };

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-xl overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-[#E5E7EB] bg-gray-50/50 flex justify-between items-center">
        <h5 className="text-[13px] font-bold text-[#111827]">{title}</h5>
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded-full text-gray-500 font-medium">
            {rows.length} rows
          </span>
          <button className="p-1 hover:bg-gray-200 rounded transition-colors text-gray-400">
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <thead className="bg-gray-50 text-[#6B7280] font-bold border-b border-[#E5E7EB]">
            <tr>
              {columns.map((col: string, i: number) => (
                <th 
                  key={i} 
                  className="px-4 py-3 uppercase tracking-wider text-[10px] cursor-pointer hover:bg-gray-100 transition-colors group"
                  onClick={() => requestSort(col)}
                >
                  <div className="flex items-center gap-1">
                    {col}
                    <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                      <ChevronUp className={`w-2.5 h-2.5 -mb-1 ${sortConfig?.key === col && sortConfig.direction === 'asc' ? 'text-rose-500' : 'text-gray-400'}`} />
                      <ChevronDown className={`w-2.5 h-2.5 ${sortConfig?.key === col && sortConfig.direction === 'desc' ? 'text-rose-500' : 'text-gray-400'}`} />
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E7EB]">
            {displayedRows.map((row: any, i: number) => (
              <tr key={i} className="hover:bg-rose-50/30 transition-colors">
                {columns.map((col: string, j: number) => (
                  <td key={j} className="px-4 py-3 text-[#374151] font-medium">
                    {formatValue(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        
        {rows.length > maxInitialRows && (
          <div className="px-4 py-2.5 border-t border-[#E5E7EB] bg-gray-50/30 text-center">
            <button 
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-[11px] text-rose-600 font-bold hover:text-rose-700 transition-colors flex items-center gap-1 mx-auto"
            >
              {isExpanded ? 'Show less' : `View all ${rows.length} rows`}
              <ChevronRight className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
