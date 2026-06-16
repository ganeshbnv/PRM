import React from 'react';
import { Zap } from 'lucide-react';

interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export function AuthCard({ title, subtitle, children }: AuthCardProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
      }}
    >
      {/* Decorative blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-brand-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-brand-600/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-float p-8">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg mb-4">
              <Zap size={22} className="text-white fill-white" />
            </div>
            <h1 className="text-heading-lg">{title}</h1>
            {subtitle && (
              <p className="text-slate-500 text-sm mt-1">{subtitle}</p>
            )}
          </div>

          {children}
        </div>

        <p className="text-center text-sidebar-muted text-xs mt-6">
          Powered by Wiki · Your team's knowledge base
        </p>
      </div>
    </div>
  );
}
