import { memo, type ReactNode } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface AdminFormCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

function AdminFormCardComponent({
  title,
  description,
  children,
  className,
  contentClassName,
}: AdminFormCardProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className='text-xl font-semibold'>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className={cn('space-y-4', contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}

export const AdminFormCard = memo(AdminFormCardComponent);
