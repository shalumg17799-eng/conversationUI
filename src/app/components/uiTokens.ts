// Shared design tokens (aligned to MASTER.md).
//
// Extracted from UITreeRenderer.tsx so the artifact shell can be its own module
// without either duplicating these values or importing from UITreeRenderer —
// which would be a cycle, since UITreeRenderer imports the shell.

export const FB = { fontFamily: '"Bricolage Grotesque", sans-serif' };
export const FI = { fontFamily: 'Inter, sans-serif' };
export const FM = { fontFamily: '"JetBrains Mono", monospace' };

export const SHADOW_DEFAULT = '0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.03)';
export const SHADOW_HOVER   = '0 4px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)';

export const CARD_BASE   = 'bg-white rounded-[12px] border border-[#E5E3DF] overflow-hidden';
export const CARD_HOVER  = 'transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-[#C8C5BF] hover:-translate-y-px';
