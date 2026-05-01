import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isHovered, setIsHovered] = React.useState(false);
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');

  useEffect(() => {
    const token = searchParams.get('access');
    if (token === 'rdvr@9705') {
      navigate('/persona');
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#F8F9FB] flex items-center justify-center p-4 relative">
      {/* Subtle corner label */}
      <div className="absolute top-6 right-6 text-[11px] text-[#6B7280]">
        Static Demo – Conceptual
      </div>

      {/* Main Login Card */}
      <div className="w-full max-w-[456px] bg-white rounded-[12px] border border-[#E5E7EB] p-7 shadow-sm">
        
        {/* 1) Brand / Identity */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-3 h-3 rounded-full bg-[#E11D48] mb-3" />
          <div className="text-[18px] font-semibold text-[#111827] tracking-tight" style={{ fontFamily: 'Inter, sans-serif' }}>
            Report Hub
          </div>
          <div className="text-[13px] text-[#6B7280] mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
            Single Pane of Glass for Analytics
          </div>
        </div>

        {/* 2) Welcome Message */}
        <div className="mb-6 text-center">
          <h1 className="text-[21px] font-semibold text-[#111827] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
            Welcome to Report Hub
          </h1>
          <p className="text-[13px] text-[#6B7280] leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>
            Access insights, reports, and analytics across platforms through one unified experience.
          </p>
        </div>

        {/* 3) Password & Primary Action */}
        <div className="mb-6">
          <label className="block text-[13px] font-medium text-[#111827] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
            Access Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError('');
            }}
            placeholder="Enter password to continue"
            className="w-full h-[42px] rounded-[8px] border border-[#E5E7EB] px-4 text-[14px] text-[#111827] mb-3 focus:outline-none focus:ring-2 focus:ring-[#111827] focus:border-transparent transition-all"
            style={{ fontFamily: 'Inter, sans-serif' }}
          />
          {error && (
            <div className="mb-3 p-3 bg-[#FEF2F2] border border-[#FCA5A5] rounded-[8px] text-[12px] text-[#991B1B]" style={{ fontFamily: 'Inter, sans-serif' }}>
              {error}
            </div>
          )}
          <button
            onClick={() => {
              if (password === 'rdvr@9705') {
                navigate('/persona');
              } else {
                setError('Incorrect password. Please try again.');
              }
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="w-full h-[42px] rounded-[8px] text-white transition-colors duration-200 font-medium"
            style={{ 
              fontFamily: 'Inter, sans-serif',
              backgroundColor: isHovered ? '#0F172A' : '#111827',
              fontSize: '14px'
            }}
          >
            Enter with SSO
          </button>
          <p className="text-[11px] text-[#6B7280] text-center mt-2" style={{ fontFamily: 'Inter, sans-serif' }}>
            Password required for access — demo environment
          </p>
        </div>

        {/* 4) Value Callout */}
        <div className="mb-6 bg-[#EFF6FF] rounded-[8px] p-4">
          <div className="text-[12px] font-semibold text-[#111827] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
            What Report Hub enables
          </div>
          <ul className="space-y-1.5 text-[12px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>One experience across BI platforms</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>Conversational access to insights</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>Lightweight analytics by default</span>
            </li>
          </ul>
        </div>

        {/* 5) Footer Note */}
        <div className="pt-5 border-t border-[#E5E7EB]">
          <p className="text-[11px] text-[#6B7280] text-center" style={{ fontFamily: 'Inter, sans-serif' }}>
            Conceptual experience for leadership review
          </p>
        </div>
      </div>
    </div>
  );
}