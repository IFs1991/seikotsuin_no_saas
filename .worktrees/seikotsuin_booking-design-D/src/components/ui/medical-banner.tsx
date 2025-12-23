import React from 'react';
import { cn } from '@/lib/utils';
import { Alert, AlertTitle, AlertDescription } from './alert';
import { 
  AlertTriangle, 
  Info, 
  CheckCircle, 
  XCircle, 
  Clock,
  Shield,
  Heart,
  Activity
} from 'lucide-react';
import { Button } from './button';

export interface MedicalBannerProps {
  type: 'emergency' | 'urgent' | 'warning' | 'info' | 'success' | 'security' | 'maintenance';
  title: string;
  description?: string;
  actions?: {
    primary?: { label: string; onClick: () => void };
    secondary?: { label: string; onClick: () => void };
  };
  dismissible?: boolean;
  onDismiss?: () => void;
  autoHideDuration?: number;
  showTimestamp?: boolean;
  patientId?: string;
  staffRole?: 'doctor' | 'nurse' | 'admin' | 'receptionist';
}

const bannerConfig = {
  emergency: {
    variant: 'medical-urgent' as const,
    priority: 'urgent' as const,
    icon: AlertTriangle,
    iconClass: 'text-red-600 animate-pulse',
    titleClass: 'text-red-950 font-bold',
  },
  urgent: {
    variant: 'medical-error' as const,
    priority: 'high' as const,
    icon: XCircle,
    iconClass: 'text-red-600',
    titleClass: 'text-red-900 font-semibold',
  },
  warning: {
    variant: 'medical-warning' as const,
    priority: 'medium' as const,
    icon: AlertTriangle,
    iconClass: 'text-yellow-600',
    titleClass: 'text-yellow-900 font-medium',
  },
  info: {
    variant: 'medical-info' as const,
    priority: 'low' as const,
    icon: Info,
    iconClass: 'text-medical-blue-600',
    titleClass: 'text-medical-blue-900',
  },
  success: {
    variant: 'medical-success' as const,
    priority: 'low' as const,
    icon: CheckCircle,
    iconClass: 'text-medical-green-600',
    titleClass: 'text-medical-green-900',
  },
  security: {
    variant: 'security-warning' as const,
    priority: 'high' as const,
    icon: Shield,
    iconClass: 'text-yellow-600',
    titleClass: 'text-yellow-950 font-semibold',
  },
  maintenance: {
    variant: 'system-maintenance' as const,
    priority: 'medium' as const,
    icon: Activity,
    iconClass: 'text-purple-600',
    titleClass: 'text-purple-900',
  },
};

export const MedicalBanner = React.forwardRef<HTMLDivElement, MedicalBannerProps>(
  ({
    type,
    title,
    description,
    actions,
    dismissible = true,
    onDismiss,
    autoHideDuration,
    showTimestamp = true,
    patientId,
    staffRole,
    ...props
  }, ref) => {
    const config = bannerConfig[type];
    const Icon = config.icon;
    const [timestamp] = React.useState(new Date());

    // 緊急時の自動音声通知（医療現場配慮）
    React.useEffect(() => {
      if (type === 'emergency' && 'speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(
          `緊急アラート: ${title}`
        );
        utterance.rate = 1.2;
        utterance.volume = 0.8;
        speechSynthesis.speak(utterance);
      }
    }, [type, title]);

    return (
      <Alert
        ref={ref}
        variant={config.variant}
        priority={config.priority}
        dismissible={dismissible}
        onDismiss={onDismiss}
        autoHideDuration={autoHideDuration}
        className={cn(
          'mb-4',
          // 緊急時の追加スタイル
          type === 'emergency' && 'border-2 border-red-500 ring-4 ring-red-200',
          // スタッフロール別の境界線
          staffRole === 'doctor' && 'border-l-8 border-l-blue-600',
          staffRole === 'nurse' && 'border-l-8 border-l-green-600',
          staffRole === 'admin' && 'border-l-8 border-l-purple-600',
        )}
        data-patient-id={patientId}
        data-staff-role={staffRole}
        {...props}
      >
        <Icon className={cn('w-5 h-5', config.iconClass)} />
        
        <div className="flex-1">
          <AlertTitle className={cn('mb-1', config.titleClass)}>
            {title}
            {type === 'emergency' && (
              <span className="ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-red-200 text-red-900 animate-pulse">
                緊急
              </span>
            )}
            {patientId && (
              <span className="ml-2 text-sm font-normal text-gray-600">
                患者ID: {patientId}
              </span>
            )}
          </AlertTitle>
          
          {description && (
            <AlertDescription className="mb-3">
              {description}
            </AlertDescription>
          )}

          {/* タイムスタンプ */}
          {showTimestamp && (
            <div className="flex items-center text-xs text-gray-500 mb-3">
              <Clock className="w-3 h-3 mr-1" />
              {timestamp.toLocaleString('ja-JP', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </div>
          )}

          {/* アクションボタン */}
          {actions && (
            <div className="flex items-center space-x-2">
              {actions.primary && (
                <Button
                  variant={type === 'emergency' ? 'medical-urgent' : 'medical-primary'}
                  size={type === 'emergency' ? 'emergency' : 'default'}
                  onClick={actions.primary.onClick}
                  className="mr-2"
                >
                  {actions.primary.label}
                </Button>
              )}
              {actions.secondary && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={actions.secondary.onClick}
                >
                  {actions.secondary.label}
                </Button>
              )}
            </div>
          )}
        </div>
      </Alert>
    );
  }
);

MedicalBanner.displayName = 'MedicalBanner';

// 使用例を示すコンポーネント
export const MedicalBannerExamples = () => {
  const [showBanner, setShowBanner] = React.useState(true);

  return (
    <div className="space-y-4 p-4">
      {/* 緊急アラート */}
      {showBanner && (
        <MedicalBanner
          type="emergency"
          title="患者の容態が急変しました"
          description="田中太郎様（患者ID: P-2024-001）のバイタルサインに異常値を検出"
          patientId="P-2024-001"
          staffRole="doctor"
          actions={{
            primary: {
              label: '即座に対応',
              onClick: () => console.log('Emergency response triggered'),
            },
            secondary: {
              label: '詳細を確認',
              onClick: () => console.log('View details'),
            },
          }}
          onDismiss={() => setShowBanner(false)}
        />
      )}

      {/* セキュリティ警告 */}
      <MedicalBanner
        type="security"
        title="不正アクセスを検出"
        description="外部IPアドレスからの複数回ログイン試行が検出されました"
        staffRole="admin"
        actions={{
          primary: {
            label: 'セキュリティ対応',
            onClick: () => console.log('Security response'),
          },
          secondary: {
            label: 'ログを確認',
            onClick: () => console.log('View logs'),
          },
        }}
        autoHideDuration={10000}
      />

      {/* 成功メッセージ */}
      <MedicalBanner
        type="success"
        title="データバックアップが完了しました"
        description="本日分の患者データと診療記録のバックアップが正常に完了"
        staffRole="admin"
        showTimestamp={true}
        dismissible={true}
      />

      {/* 保守メンテナンス */}
      <MedicalBanner
        type="maintenance"
        title="システムメンテナンスのお知らせ"
        description="本日23:00-24:00にシステムメンテナンスを実施します"
        actions={{
          primary: {
            label: '詳細を確認',
            onClick: () => console.log('View maintenance details'),
          },
        }}
        autoHideDuration={0}
      />
    </div>
  );
};