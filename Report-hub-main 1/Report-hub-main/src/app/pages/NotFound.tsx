import React from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/ui/Button';

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#F8F9FB] flex flex-col items-center justify-center p-4">
      <h1 className="text-4xl font-bold text-gray-900 mb-2">Page not found</h1>
      <p className="text-gray-500 mb-8">The page you are looking for does not exist.</p>
      <Button onClick={() => navigate('/dashboard')}>
        Go to Dashboard
      </Button>
    </div>
  );
}
