                 {/* Similar Reports List */}
                 <div className="space-y-3 mb-4">
                   {message.data.reports.map((report: any) => {
                     // Determine usage indicator
                     const usageIndicator = report.used_by_roles && report.used_by_roles.length > 2 
                       ? 'Frequently used' 
                       : 'Low usage';
                     const usageColor = report.used_by_roles && report.used_by_roles.length > 2
                       ? 'text-green-700 bg-green-50 border-green-200'
                       : 'text-gray-600 bg-gray-50 border-gray-200';

                     // Determine report owner
                     const reportOwner = report.owner || report.created_by || 'Assigned Admin';

                     return (
                       <div
                         key={report.report_id}
                         className="bg-white border border-gray-300 rounded-lg p-4 shadow-sm"
                       >
                         <div className="flex items-start justify-between mb-3">
                           <div className="flex-1">
                             <div className="flex items-center gap-2 mb-1">
                               <h5 className="text-[13px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                                 {report.report_name}
                               </h5>
                               {report.source_application && (
                                 <span className="inline-flex items-center px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] rounded border border-blue-200 font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                                   {report.source_application}
                                 </span>
                               )}
                             </div>
                             {report.primary_use_case && (
                               <p className="text-[11px] text-[#6B7280] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                                 {report.primary_use_case}
                               </p>
                             )}
                           </div>
                         </div>

                         {/* Report Owner */}
                         <div className="flex items-center gap-1.5 mb-2">
                           <span className="text-[10px] text-[#9CA3AF] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                             Owner:
                           </span>
                           <span className="text-[11px] text-[#374151] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                             {reportOwner}
                           </span>
                         </div>

                         {/* Access Restriction Notice */}
                         <div className="flex items-start gap-1.5 mb-3 p-2 bg-blue-50 border border-blue-200 rounded">
                           <Shield className="w-3 h-3 text-blue-600 flex-shrink-0 mt-0.5" />
                           <p className="text-[10px] text-blue-800" style={{ fontFamily: 'Inter, sans-serif' }}>
                             Access restricted. You must request approval to view or modify this report.
                           </p>
                         </div>

                         {/* Key Dimensions */}
                         {report.primary_dimensions && report.primary_dimensions.length > 0 && (
                           <div className="flex items-center gap-1.5 mb-2">
                             <span className="text-[10px] text-[#9CA3AF] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                               Dimensions:
                             </span>
                             {report.primary_dimensions.map((dim: string, idx: number) => (
                               <span
                                 key={idx}
                                 className="inline-flex items-center px-1.5 py-0.5 bg-gray-100 text-gray-700 text-[10px] rounded"
                                 style={{ fontFamily: 'Inter, sans-serif' }}
                               >
                                 {dim}
                               </span>
                             ))}
                           </div>
                         )}

                         {/* Metadata Row */}
                         <div className="flex items-center gap-3 mb-3 text-[10px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
                           <span className="flex items-center gap-1">
                             <Clock className="w-3 h-3" />
                             Updated {formatRelativeTime(report.last_updated_ts)}
                           </span>
                           <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-medium ${usageColor}`}>
                             {usageIndicator}
                           </span>
                         </div>

                         {/* Action Buttons */}
                         <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
                           <button
                             onClick={() => {
                               addUserMessage(`Use ${report.report_name}`);
                               setIsGenerating(true);
                               
                               setTimeout(() => {
                                 setIsGenerating(false);
                                 addAssistantMessage(
                                   `This report is owned by ${reportOwner}. You need approval to access it.`,
                                   'text'
                                 );
                                 
                                 setTimeout(() => {
                                   addAssistantMessage(
                                     'Would you like to request access to this report?',
                                     'text'
                                   );
                                 }, 400);
                               }, 600);
                             }}
                             className="flex-1 px-3 py-2 bg-[#111827] hover:bg-[#0F172A] text-white rounded text-[12px] font-medium transition-colors"
                             style={{ fontFamily: 'Inter, sans-serif' }}
                           >
                             Use this report
                           </button>
                           <button
                             onClick={() => {
                               addUserMessage(`Enhance ${report.report_name}`);
                               setIsGenerating(true);
                               
                               setTimeout(() => {
                                 setIsGenerating(false);
                                 addAssistantMessage(
                                   'I\\'ll help you extend the existing report. Please note that enhancements require owner approval before publishing.',
                                   'text'
                                 );
                                 
                                 // TODO: Continue to enhancement flow
                               }, 600);
                             }}
                             className="flex-1 px-3 py-2 bg-white hover:bg-gray-50 border border-[#E5E7EB] text-[#111827] rounded text-[12px] font-medium transition-colors"
                             style={{ fontFamily: 'Inter, sans-serif' }}>
                             Enhance this report
                           </button>
                         </div>
                       </div>
                     );
                   })}
                 </div>
