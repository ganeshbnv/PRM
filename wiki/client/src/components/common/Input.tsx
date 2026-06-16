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
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <input
        {...props}
        id={inputId}
        className={cn(
          'rounded-md border px-3 py-2 text-sm text-gray-900',
          'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500',
          'placeholder:text-gray-400',
          error ? 'border-red-500' : 'border-gray-300',
          className
        )}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      {!error && helper && <p className="text-xs text-gray-500">{helper}</p>}
    </div>
  );
}
