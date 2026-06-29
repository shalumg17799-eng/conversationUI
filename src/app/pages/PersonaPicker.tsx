import React from 'react';
import { useNavigate } from 'react-router';
import { usePersona, personas, PersonaType } from '../context/PersonaContext';

export function PersonaPickerPage() {
  const navigate = useNavigate();
  const { setPersonaType } = usePersona();
  const [hoveredCard, setHoveredCard] = React.useState<PersonaType | null>(null);

  const handleSelect = (type: PersonaType) => {
    setPersonaType(type);
    navigate('/conversational');
  };

  const personaList: PersonaType[] = ['marketing_director', 'power_user'];

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4 relative">
      {/* Subtle corner label */}
      <div className="absolute top-6 right-6 text-[11px] text-[var(--muted-foreground)]" style={{ fontFamily: 'Inter, sans-serif' }}>
        Static Demo – Conceptual
      </div>

      <div className="w-full max-w-[680px]">
        {/* Brand / Identity */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-3 h-3 rounded-full bg-[var(--brand)] mb-3" />
          <div className="text-[18px] font-semibold text-[var(--foreground)] tracking-tight" style={{ fontFamily: 'Inter, sans-serif' }}>
            Report Hub
          </div>
        </div>

        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="text-[24px] font-semibold text-[var(--foreground)] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
            Choose your experience
          </h1>
          <p className="text-[14px] text-[var(--muted-foreground)] leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>
            Select a persona to tailor your Report Hub experience
          </p>
        </div>

        {/* Persona Cards */}
        <div className="grid grid-cols-2 gap-5">
          {personaList.map((type) => {
            const p = personas[type];
            const isHovered = hoveredCard === type;
            return (
              <button
                key={type}
                onClick={() => handleSelect(type)}
                onMouseEnter={() => setHoveredCard(type)}
                onMouseLeave={() => setHoveredCard(null)}
                className="bg-white rounded-[12px] border border-[var(--border)] p-6 shadow-sm text-left transition-all duration-200 cursor-pointer"
                style={{
                  fontFamily: 'Inter, sans-serif',
                  borderColor: isHovered ? 'var(--brand)' : 'var(--border)',
                  boxShadow: isHovered ? '0 4px 12px rgba(225, 29, 72, 0.1)' : '0 1px 2px rgba(0,0,0,0.05)',
                  transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
                }}
              >
                <div className="text-[32px] mb-4">{p.icon}</div>
                <div className="text-[16px] font-semibold text-[var(--foreground)] mb-2">{p.label}</div>
                <p className="text-[13px] text-[var(--muted-foreground)] leading-relaxed">{p.description}</p>
                <div
                  className="mt-5 w-full h-[38px] rounded-[8px] flex items-center justify-center text-[13px] font-medium transition-colors duration-200"
                  style={{
                    backgroundColor: isHovered ? 'var(--foreground)' : 'var(--background)',
                    color: isHovered ? 'var(--card)' : 'var(--muted-foreground)',
                    border: isHovered ? 'none' : '1px solid var(--border)',
                  }}
                >
                  {isHovered ? 'Continue' : 'Select'}
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-8 pt-5 border-t border-[var(--border)]">
          <p className="text-[11px] text-[var(--muted-foreground)] text-center" style={{ fontFamily: 'Inter, sans-serif' }}>
            You can switch personas anytime from the header
          </p>
        </div>
      </div>
    </div>
  );
}
