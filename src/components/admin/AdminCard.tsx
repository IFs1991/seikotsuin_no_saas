import React from 'react';
import { Card } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';

interface AdminCardProps {
  title: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}

export function AdminCard({
  title,
  icon: Icon,
  children,
  className = '',
}: AdminCardProps) {
  return (
    <Card className={`p-6 ${className}`}>
      <h3 className='text-lg font-semibold text-gray-900 mb-4 flex items-center'>
        {Icon && <Icon className='w-5 h-5 mr-2' />}
        {title}
      </h3>
      {children}
    </Card>
  );
}
