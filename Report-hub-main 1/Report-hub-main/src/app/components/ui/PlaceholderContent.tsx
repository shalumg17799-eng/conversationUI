import React from 'react';
import { Card } from "./Card";
import { Badge } from "./Badge";

interface PlaceholderContentProps {
  features?: string[];
  plannedModules?: string[];
}

export function PlaceholderContent({ 
  features = [], 
  plannedModules = [] 
}: PlaceholderContentProps) {
  return (
    <div className="space-y-6">
      {/* Primary Coming Soon Card */}
      <Card className="min-h-[200px] flex flex-col justify-center items-center text-center p-8">
        <div className="bg-gray-100 p-3 rounded-full mb-4">
          <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Coming soon</h3>
        <p className="text-gray-500 text-sm mb-6 max-w-sm">
          This screen will be built in the next step.
        </p>
        {features.length > 0 && (
          <div className="bg-gray-50 rounded-lg p-4 w-full max-w-md text-left">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Planned Features</p>
            <ul className="space-y-2">
              {features.map((feature, i) => (
                <li key={i} className="flex items-start text-sm text-gray-700">
                  <span className="mr-2 text-rose-500">•</span>
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* Secondary Planned Modules Card */}
      {plannedModules.length > 0 && (
        <Card>
          <h4 className="text-sm font-semibold text-gray-900 mb-4">Planned modules</h4>
          <div className="flex flex-wrap gap-2">
            {plannedModules.map((module, i) => (
              <Badge key={i} variant="default">
                {module}
              </Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
