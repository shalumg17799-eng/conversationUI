import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface VerifyResult {
  success: boolean;
  role?: 'internal' | 'client';
  provider?: 'gemma' | 'sonnet';
}

// Verify username + password against the backend. Credentials are never compared
// client-side, so they are not present in the shipped bundle. On success the backend
// returns which role logged in and which LLM provider that role uses.
async function verifyCredentials(username: string, password: string): Promise<VerifyResult> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) return { success: false };
    return await res.json();
  } catch {
    return { success: false };
  }
}

// Persist the logged-in role + provider so the chat page can tell the backend
// which model to use on every request.
function storeSession(result: VerifyResult) {
  if (result.role) localStorage.setItem('auth_role', result.role);
  localStorage.setItem('llm_provider', result.provider ?? 'gemma');
}

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isHovered, setIsHovered] = React.useState(false);
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');

  useEffect(() => {
    // Optional magic-link login: ?user=<username>&access=<password>
    const token = searchParams.get('access');
    const user = searchParams.get('user') ?? '';
    if (token) {
      verifyCredentials(user, token).then((result) => {
        if (result.success) {
          storeSession(result);
          navigate('/persona');
        }
      });
    }
  }, []);

  const handleLogin = async () => {
    const result = await verifyCredentials(username, password);
    if (result.success) {
      storeSession(result);
      navigate('/persona');
    } else {
      setError('Incorrect username or password. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4 relative">
      {/* Subtle corner label */}
      <div className="absolute top-6 right-6 text-[11px] text-[var(--muted-foreground)]">
        Static Demo – Conceptual
      </div>

      {/* Main Login Card */}
      <div className="w-full max-w-[456px] bg-white rounded-[12px] border border-[var(--border)] p-7 shadow-sm">
        
        {/* 1) Brand / Identity */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-3 h-3 rounded-full bg-[var(--brand)] mb-3" />
          <div className="text-[18px] font-semibold text-[var(--foreground)] tracking-tight" style={{ fontFamily: 'Inter, sans-serif' }}>
            Report Hub
          </div>
          <div className="text-[13px] text-[var(--muted-foreground)] mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
            Single Pane of Glass for Analytics
          </div>
        </div>

        {/* 2) Welcome Message */}
        <div className="mb-6 text-center">
          <h1 className="text-[21px] font-semibold text-[var(--foreground)] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
            Welcome to Report Hub
          </h1>
          <p className="text-[13px] text-[var(--muted-foreground)] leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>
            Access insights, reports, and analytics across platforms through one unified experience.
          </p>
        </div>

        {/* 3) Username, Password & Primary Action */}
        <div className="mb-6">
          <label className="block text-[13px] font-medium text-[var(--foreground)] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
            Username
          </label>
          <input
            type="text"
            value={username}
            autoComplete="username"
            onChange={(e) => {
              setUsername(e.target.value);
              setError('');
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleLogin(); }}
            placeholder="Enter your username"
            className="w-full h-[42px] rounded-[8px] border border-[var(--border)] px-4 text-[14px] text-[var(--foreground)] mb-3 focus:outline-none focus:ring-2 focus:ring-[var(--foreground)] focus:border-transparent transition-all"
            style={{ fontFamily: 'Inter, sans-serif' }}
          />
          <label className="block text-[13px] font-medium text-[var(--foreground)] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
            Access Password
          </label>
          <input
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => {
              setPassword(e.target.value);
              setError('');
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleLogin(); }}
            placeholder="Enter password to continue"
            className="w-full h-[42px] rounded-[8px] border border-[var(--border)] px-4 text-[14px] text-[var(--foreground)] mb-3 focus:outline-none focus:ring-2 focus:ring-[var(--foreground)] focus:border-transparent transition-all"
            style={{ fontFamily: 'Inter, sans-serif' }}
          />
          {error && (
            <div className="mb-3 p-3 bg-[#FEF2F2] border border-[#FCA5A5] rounded-[8px] text-[12px] text-[#991B1B]" style={{ fontFamily: 'Inter, sans-serif' }}>
              {error}
            </div>
          )}
          <button
            onClick={handleLogin}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="w-full h-[42px] rounded-[8px] text-white transition-colors duration-200 font-medium"
            style={{ 
              fontFamily: 'Inter, sans-serif',
              backgroundColor: isHovered ? 'var(--primary)' : 'var(--foreground)',
              fontSize: '14px'
            }}
          >
            Enter with SSO
          </button>
          <p className="text-[11px] text-[var(--muted-foreground)] text-center mt-2" style={{ fontFamily: 'Inter, sans-serif' }}>
            Password required for access — demo environment
          </p>
        </div>

        {/* 4) Value Callout */}
        <div className="mb-6 bg-brand-subtle rounded-[8px] p-4">
          <div className="text-[12px] font-semibold text-[var(--foreground)] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
            What Report Hub enables
          </div>
          <ul className="space-y-1.5 text-[12px] text-[var(--muted-foreground)]" style={{ fontFamily: 'Inter, sans-serif' }}>
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
        <div className="pt-5 border-t border-[var(--border)]">
          <p className="text-[11px] text-[var(--muted-foreground)] text-center" style={{ fontFamily: 'Inter, sans-serif' }}>
            Conceptual experience for leadership review
          </p>
        </div>
      </div>
    </div>
  );
}