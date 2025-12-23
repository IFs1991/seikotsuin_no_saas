import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { ChevronLeft, Info, AlertTriangle, CheckCircle } from 'lucide-react';

export interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  variant?: 'default' | 'medical' | 'admin' | 'patient' | 'emergency';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  breadcrumb?: { label: string; href?: string }[];
  actions?: React.ReactNode;
  showBackButton?: boolean;
  onBack?: () => void;
  status?: 'info' | 'warning' | 'success' | 'error';
  statusMessage?: string;
}

const headerVariants = {
  variant: {
    default: 'border-b border-gray-200 bg-white',
    medical: 'border-b border-medical-blue-200 bg-medical-blue-50',
    admin: 'border-b border-admin-200 bg-admin-50',
    patient: 'border-b border-blue-200 bg-blue-50',
    emergency: 'border-b border-red-200 bg-red-50 border-l-4 border-l-red-500',
  },
  priority: {
    low: '',
    medium: 'border-l-2 border-l-blue-400',
    high: 'border-l-4 border-l-orange-500',
    urgent: 'border-l-4 border-l-red-500 animate-pulse-soft',
  },
};

const statusIcons = {
  info: Info,
  warning: AlertTriangle,
  success: CheckCircle,
  error: AlertTriangle,
};

const statusStyles = {
  info: 'text-blue-600',
  warning: 'text-yellow-600',
  success: 'text-green-600',
  error: 'text-red-600',
};

export const PageHeader = React.forwardRef<HTMLDivElement, PageHeaderProps>(
  ({
    className,
    title,
    description,
    variant = 'default',
    priority,
    breadcrumb,
    actions,
    showBackButton = false,
    onBack,
    status,
    statusMessage,
    ...props
  }, ref) => {
    const StatusIcon = status ? statusIcons[status] : null;

    return (
      <div
        ref={ref}
        className={cn(
          // 基本スタイル (Atlassian Design準拠)
          'px-6 py-4 space-y-4',
          // バリアント適用
          headerVariants.variant[variant],
          // 優先度適用
          priority && headerVariants.priority[priority],
          className
        )}
        data-variant={variant}
        data-priority={priority}
        {...props}
      >
        {/* ブレッドクラム */}
        {breadcrumb && breadcrumb.length > 0 && (
          <nav aria-label="breadcrumb" className="flex items-center space-x-2 text-sm text-gray-600">
            {breadcrumb.map((item, index) => (
              <React.Fragment key={index}>
                {index > 0 && <span className="text-gray-400">/</span>}
                {item.href ? (
                  <a 
                    href={item.href} 
                    className="hover:text-gray-900 transition-colors"
                    aria-current={index === breadcrumb.length - 1 ? 'page' : undefined}
                  >
                    {item.label}
                  </a>
                ) : (
                  <span 
                    className={cn(
                      index === breadcrumb.length - 1 ? 'text-gray-900 font-medium' : 'text-gray-600'
                    )}
                    aria-current={index === breadcrumb.length - 1 ? 'page' : undefined}
                  >
                    {item.label}
                  </span>
                )}
              </React.Fragment>
            ))}
          </nav>
        )}

        {/* メインヘッダー */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4 min-w-0 flex-1">
            {/* 戻るボタン */}
            {showBackButton && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onBack}
                className="flex-shrink-0"
                aria-label="前のページに戻る"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
            )}

            {/* タイトルセクション */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center space-x-2">
                <h1 
                  className={cn(
                    'text-2xl font-semibold text-gray-900 truncate',
                    variant === 'emergency' && 'text-red-900 font-bold'
                  )}
                >
                  {title}
                </h1>
                {priority === 'urgent' && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                    緊急
                  </span>
                )}
              </div>
              
              {description && (
                <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                  {description}
                </p>
              )}

              {/* ステータスメッセージ */}
              {status && statusMessage && StatusIcon && (
                <div className={cn("flex items-center space-x-1 mt-2", statusStyles[status])}>
                  <StatusIcon className="w-4 h-4" />
                  <span className="text-sm font-medium">{statusMessage}</span>
                </div>
              )}
            </div>
          </div>

          {/* アクションボタン */}
          {actions && (
            <div className="flex-shrink-0 ml-4">
              <div className="flex items-center space-x-2">
                {actions}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
);

PageHeader.displayName = 'PageHeader';

// 使用例を示すサンプルコンポーネント（実装時は削除）
export const PageHeaderExamples = () => {
  return (
    <div className="space-y-4 p-4">
      {/* 基本使用例 */}
      <PageHeader
        title="患者管理"
        description="患者情報の登録・編集・検索を行います"
        variant="medical"
        breadcrumb={[
          { label: 'ホーム', href: '/' },
          { label: '患者管理' }
        ]}
        actions={
          <Button variant="medical-primary">新規患者登録</Button>
        }
      />

      {/* 緊急時の例 */}
      <PageHeader
        title="緊急アラート"
        description="システムで重要な問題が検出されました"
        variant="emergency"
        priority="urgent"
        status="error"
        statusMessage="即座に対応が必要です"
        showBackButton
        actions={
          <Button variant="medical-urgent" size="emergency">
            対応開始
          </Button>
        }
      />

      {/* 管理者ページの例 */}
      <PageHeader
        title="セキュリティ設定"
        description="システムセキュリティの管理と監視"
        variant="admin"
        priority="high"
        breadcrumb={[
          { label: 'ホーム', href: '/' },
          { label: '管理者', href: '/admin' },
          { label: 'セキュリティ設定' }
        ]}
        status="success"
        statusMessage="すべてのセキュリティチェックが完了しています"
        actions={
          <>
            <Button variant="admin-secondary">設定エクスポート</Button>
            <Button variant="admin-primary">設定を保存</Button>
          </>
        }
      />
    </div>
  );
};