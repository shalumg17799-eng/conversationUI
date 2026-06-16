import React from 'react';

// Phrases shown while the report streams. Cycled in order, looping at the end.
const THINKING_STEPS = [
  'Analyzing the ask…',
  'Checking the database…',
  'Fetching the relevant data…',
  'Crunching the numbers…',
  'Composing your report…',
];

export function ReportSkeleton({ steps = THINKING_STEPS }: { steps?: string[] }) {
  const [stepIndex, setStepIndex] = React.useState(0);

  React.useEffect(() => {
    if (steps.length <= 1) return;
    const id = setInterval(() => {
      // Advance through the steps, holding on the last one until streaming ends.
      setStepIndex(i => (i < steps.length - 1 ? i + 1 : i));
    }, 1800);
    return () => clearInterval(id);
  }, [steps]);

  return (
    <div className="flex items-center min-h-[32px]">
      <span
        key={stepIndex}
        className="text-[13px] text-[#6B6965] font-medium"
        style={{ fontFamily: 'Inter, sans-serif', animation: 'fadeIn 0.4s ease' }}
      >
        {steps[stepIndex]}
      </span>
      <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
    </div>
  );
}
