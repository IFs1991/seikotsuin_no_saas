import React from 'react';

interface AdminMessageProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  className?: string;
}

export function AdminMessage({
  message,
  type = 'success',
  className = '',
}: AdminMessageProps) {
  if (!message) return null;

  const baseClasses = 'p-4 rounded-md mb-6';
  const typeClasses = {
    success: 'bg-green-50 border border-green-200 text-green-700',
    error: 'bg-red-50 border border-red-200 text-red-700',
    info: 'bg-blue-50 border border-blue-200 text-blue-700',
  };

  return (
    <div className={`${baseClasses} ${typeClasses[type]} ${className}`}>
      {message}
    </div>
  );
}
