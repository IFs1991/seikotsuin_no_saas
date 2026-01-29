import React from 'react';
import { cn } from '@/lib/utils';
import {
  // 基本医療アイコン
  Heart,
  Activity,
  Stethoscope,
  Pill,
  Thermometer,

  // 緊急・警告アイコン
  AlertTriangle,
  AlertCircle,
  XCircle,
  CheckCircle,
  Info,
  Clock,

  // ユーザー・患者関連
  User,
  Users,
  UserCheck,
  UserX,

  // システム・管理アイコン
  Shield,
  Lock,
  Unlock,
  Settings,
  Database,
  FileText,
  Calendar,
  Search,

  // ナビゲーション・操作
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Plus,
  Minus,
  Edit,
  Trash2,
  Save,
  Download,
  Upload,

  // 通信・通知
  Bell,
  BellOff,
  Mail,
  Phone,
  MessageSquare,

  // データ・分析
  BarChart3,
  PieChart,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

// アイコンのバリアント定義
export interface MedicalIconProps {
  name: keyof typeof iconMap;
  variant?:
    | 'default'
    | 'medical'
    | 'emergency'
    | 'success'
    | 'warning'
    | 'admin';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  className?: string;
  'aria-label'?: string;
}

// アイコンマッピング (Atlassian Design System準拠)
const iconMap = {
  // 医療・健康
  'medical-heart': Heart,
  'medical-activity': Activity,
  'medical-stethoscope': Stethoscope,
  'medical-pill': Pill,
  'medical-temperature': Thermometer,

  // 状態・アラート
  'status-emergency': AlertTriangle,
  'status-warning': AlertCircle,
  'status-error': XCircle,
  'status-success': CheckCircle,
  'status-info': Info,
  'status-pending': Clock,

  // ユーザー・患者
  'user-patient': User,
  'user-staff': Users,
  'user-approved': UserCheck,
  'user-blocked': UserX,

  // セキュリティ・システム
  'security-shield': Shield,
  'security-locked': Lock,
  'security-unlocked': Unlock,
  'system-settings': Settings,
  'system-database': Database,
  'system-file': FileText,
  'system-calendar': Calendar,
  'system-search': Search,

  // 操作・ナビゲーション
  'nav-left': ChevronLeft,
  'nav-right': ChevronRight,
  'nav-up': ChevronUp,
  'nav-down': ChevronDown,
  'action-add': Plus,
  'action-remove': Minus,
  'action-edit': Edit,
  'action-delete': Trash2,
  'action-save': Save,
  'action-download': Download,
  'action-upload': Upload,

  // 通信・通知
  'notify-bell': Bell,
  'notify-bell-off': BellOff,
  'notify-mail': Mail,
  'notify-phone': Phone,
  'notify-message': MessageSquare,

  // データ・分析
  'chart-bar': BarChart3,
  'chart-pie': PieChart,
  'trend-up': TrendingUp,
  'trend-down': TrendingDown,
} as const;

// バリアント別スタイル定義
const iconVariants = {
  variant: {
    default: 'text-gray-600',
    medical: 'text-medical-blue-600',
    emergency: 'text-red-600 animate-pulse',
    success: 'text-medical-green-600',
    warning: 'text-yellow-600',
    admin: 'text-admin-600',
  },
  size: {
    xs: 'w-3 h-3',
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
    xl: 'w-8 h-8',
  },
  priority: {
    low: '',
    medium: 'drop-shadow-sm',
    high: 'drop-shadow-md font-bold',
    urgent: 'drop-shadow-lg animate-pulse',
  },
};

// 医療特化アイコンコンポーネント
export const MedicalIcon = React.forwardRef<SVGSVGElement, MedicalIconProps>(
  (
    {
      name,
      variant = 'default',
      size = 'md',
      priority = 'low',
      className,
      'aria-label': ariaLabel,
      ...props
    },
    ref
  ) => {
    const IconComponent = iconMap[name];

    if (!IconComponent) {
      console.warn(`MedicalIcon: Unknown icon name "${name}"`);
      return null;
    }

    return (
      <IconComponent
        ref={ref}
        className={cn(
          // 基本スタイル
          'flex-shrink-0',
          // バリアント適用
          iconVariants.variant[variant],
          iconVariants.size[size],
          iconVariants.priority[priority],
          // 緊急時の特別処理
          priority === 'urgent' && 'text-red-600',
          className
        )}
        aria-label={ariaLabel || `${name}アイコン`}
        role='img'
        data-icon={name}
        data-variant={variant}
        data-priority={priority}
        {...props}
      />
    );
  }
);

MedicalIcon.displayName = 'MedicalIcon';

// アイコン使用ガイドライン用の型定義
export interface IconUsageGuide {
  category: string;
  icons: {
    name: keyof typeof iconMap;
    usage: string;
    variant: MedicalIconProps['variant'];
    context: string;
  }[];
}

// アイコン使用ガイドライン（Atlassian Design System準拠）
export const medicalIconGuides: IconUsageGuide[] = [
  {
    category: '医療・健康状態',
    icons: [
      {
        name: 'medical-heart',
        usage: 'バイタルサイン、心臓関連',
        variant: 'medical',
        context: '患者の心拍数表示、循環器科',
      },
      {
        name: 'medical-activity',
        usage: '生体活動、モニタリング',
        variant: 'medical',
        context: 'リアルタイムバイタル監視',
      },
      {
        name: 'medical-temperature',
        usage: '体温測定、発熱',
        variant: 'warning',
        context: '発熱患者の識別',
      },
    ],
  },
  {
    category: '緊急・アラート',
    icons: [
      {
        name: 'status-emergency',
        usage: '緊急事態、即座の対応が必要',
        variant: 'emergency',
        context: '患者の容態急変、システム障害',
      },
      {
        name: 'status-warning',
        usage: '注意喚起、確認が必要',
        variant: 'warning',
        context: '薬剤アレルギー注意、期限切れ警告',
      },
      {
        name: 'status-success',
        usage: '正常完了、成功状態',
        variant: 'success',
        context: '検査結果正常、処置完了',
      },
    ],
  },
  {
    category: 'セキュリティ・管理',
    icons: [
      {
        name: 'security-shield',
        usage: 'セキュリティ保護、安全状態',
        variant: 'admin',
        context: 'データ保護、アクセス権限管理',
      },
      {
        name: 'security-locked',
        usage: '保護された情報、制限アクセス',
        variant: 'admin',
        context: '患者個人情報、機密データ',
      },
      {
        name: 'user-approved',
        usage: '承認済みユーザー、有効なアカウント',
        variant: 'success',
        context: '認証済みスタッフ、患者確認済み',
      },
    ],
  },
];

// 使用例コンポーネント
export const MedicalIconExamples = () => {
  return (
    <div className='space-y-6 p-4'>
      <h2 className='text-xl font-semibold'>医療アイコン使用例</h2>

      {medicalIconGuides.map((guide, index) => (
        <div key={index} className='space-y-3'>
          <h3 className='text-lg font-medium text-gray-800'>
            {guide.category}
          </h3>
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
            {guide.icons.map((iconInfo, iconIndex) => (
              <div
                key={iconIndex}
                className='p-3 border rounded-medical bg-gray-50'
              >
                <div className='flex items-center space-x-2 mb-2'>
                  <MedicalIcon
                    name={iconInfo.name}
                    variant={iconInfo.variant}
                    size='lg'
                  />
                  <span className='font-medium text-sm'>{iconInfo.name}</span>
                </div>
                <p className='text-xs text-gray-600 mb-1'>{iconInfo.usage}</p>
                <p className='text-xs text-gray-500'>{iconInfo.context}</p>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className='mt-8 space-y-4'>
        <h3 className='text-lg font-medium'>優先度別の表示例</h3>
        <div className='flex items-center space-x-4'>
          <div className='flex items-center space-x-2'>
            <MedicalIcon name='status-emergency' priority='urgent' size='lg' />
            <span>緊急</span>
          </div>
          <div className='flex items-center space-x-2'>
            <MedicalIcon name='status-warning' priority='high' size='lg' />
            <span>高</span>
          </div>
          <div className='flex items-center space-x-2'>
            <MedicalIcon name='status-info' priority='medium' size='lg' />
            <span>中</span>
          </div>
          <div className='flex items-center space-x-2'>
            <MedicalIcon name='status-success' priority='low' size='lg' />
            <span>低</span>
          </div>
        </div>
      </div>
    </div>
  );
};
