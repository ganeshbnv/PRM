import React from 'react';
import { cn } from '../../utils/cn';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helper?: string;
}

export function Input({ label, error, helper, className, id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <input
        {...props}
        id={inputId}
        className={cn(
          'h-10 rounded-lg border px-3.5 text-sm text-slate-900 bg-white',
          'placeholder:text-slate-400',
          'transition-all duration-150',
          'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-400',
          error
            ? 'border-red-400 focus:ring-red-400 focus:border-red-400'
            : 'border-surface-border hover:border-slate-300',
          className
        )}
      />
      {error && <p className="text-xs text-red-600 flex items-center gap-1">{error}</p>}
      {!error && helper && <p className="text-xs text-slate-500">{helper}</p>}
    </div>
  );
}
