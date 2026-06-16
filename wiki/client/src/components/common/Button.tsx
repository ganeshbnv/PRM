import React from 'react';
import { cn } from '../../utils/cn';
import { Spinner } from './Spinner';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const variants = {
  primary: [
    'bg-brand-600 text-white',
    'hover:bg-brand-700 active:bg-brand-800',
    'focus-visible:ring-brand-500',
    'shadow-sm',
  ].join(' '),
  secondary: [
    'bg-white text-slate-700 border border-surface-border',
    'hover:bg-surface-muted active:bg-slate-100',
    'focus-visible:ring-brand-500',
    'shadow-sm',
  ].join(' '),
  ghost: [
    'text-slate-600',
    'hover:bg-surface-muted hover:text-slate-900 active:bg-slate-100',
    'focus-visible:ring-brand-500',
  ].join(' '),
  danger: [
    'bg-red-600 text-white',
    'hover:bg-red-700 active:bg-red-800',
    'focus-visible:ring-red-500',
    'shadow-sm',
  ].join(' '),
};

const sizes = {
  sm: 'h-7  px-3   text-xs  gap-1.5',
  md: 'h-9  px-4   text-sm  gap-2',
  lg: 'h-10 px-5   text-sm  gap-2',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  children,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium rounded-lg',
        'transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
        'disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className
      )}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}
