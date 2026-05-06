import React from 'react';

interface SuggestedPromptsProps {
  prompts: string[];
  onPromptClick: (prompt: string) => void;
}

export function SuggestedPrompts({ prompts, onPromptClick }: SuggestedPromptsProps) {
  return (
    <div className="mt-4 pt-3 border-t border-border">
      <p className="text-[10px] text-muted-foreground font-medium mb-2" style={{ fontFamily: 'var(--font-body)' }}>
        Suggested next prompts
      </p>
      <div className="flex flex-wrap gap-2 mb-2">
        {prompts.map((prompt, idx) => (
          <button
            key={idx}
            onClick={() => onPromptClick(prompt)}
            className="px-3 py-1.5 bg-white hover:bg-muted border border-border rounded-full text-[11px] text-muted-foreground transition-colors shadow-sm hover:shadow"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {prompt}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground italic" style={{ fontFamily: 'var(--font-body)' }}>
        You're not restricted to these suggestions — ask anything in your own words.
      </p>
    </div>
  );
}
