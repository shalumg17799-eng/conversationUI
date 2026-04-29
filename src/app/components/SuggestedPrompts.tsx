import React from 'react';

interface SuggestedPromptsProps {
  prompts: string[];
  onPromptClick: (prompt: string) => void;
}

export function SuggestedPrompts({ prompts, onPromptClick }: SuggestedPromptsProps) {
  return (
    <div className="mt-4 pt-3 border-t border-[#E5E7EB]">
      <p className="text-[10px] text-[#9CA3AF] font-medium mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
        Suggested next prompts
      </p>
      <div className="flex flex-wrap gap-2 mb-2">
        {prompts.map((prompt, idx) => (
          <button
            key={idx}
            onClick={() => onPromptClick(prompt)}
            className="px-3 py-1.5 bg-white hover:bg-gray-50 border border-[#E5E7EB] rounded-full text-[11px] text-[#6B7280] transition-colors shadow-sm hover:shadow"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            {prompt}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-[#9CA3AF] italic" style={{ fontFamily: 'Inter, sans-serif' }}>
        You're not restricted to these suggestions — ask anything in your own words.
      </p>
    </div>
  );
}
