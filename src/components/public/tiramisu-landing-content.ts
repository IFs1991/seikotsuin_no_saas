import {
  BarChart3,
  Building2,
  CalendarClock,
  ClipboardList,
  FileBarChart2,
  GitCompareArrows,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
}

export const navItems: NavItem[] = [
  { label: '課題', href: '#problems' },
  { label: '機能', href: '#features' },
  { label: '試算', href: '#roi' },
  { label: '料金', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
];

export interface ProblemItem {
  title: string;
  description: string;
}

export const problemItems: ProblemItem[] = [
  {
    title: '店舗ごとの数字が見えない',
    description:
      '日報、売上、予約、シフト、患者数が別々に管理され、本部が全店舗の状態をつかむまでに時間がかかる。',
  },
  {
    title: '集計と確認が手作業に寄る',
    description:
      'Excel、LINE、紙、既存予約システムをまたいだ確認が増え、会議資料や店舗比較の作成が属人化する。',
  },
  {
    title: '院長ごとに管理レベルがばらつく',
    description:
      '同じ数字を見て話す前提がそろわず、改善の着眼点や報告粒度が店舗ごとに変わってしまう。',
  },
  {
    title: '店舗展開に管理基盤が追いつかない',
    description:
      '5店舗、10店舗と増えるほど、本部の確認負荷が増え、経営判断のスピードが落ちやすくなる。',
  },
];

export interface ValueItem {
  icon: LucideIcon;
  title: string;
  description: string;
}

export const valueItems: ValueItem[] = [
  {
    icon: ClipboardList,
    title: '日次報告を本部で一覧化',
    description:
      '店舗別日報と重要指標を同じ形式で集め、本部確認の手戻りを減らします。',
  },
  {
    icon: GitCompareArrows,
    title: '店舗比較を見える化',
    description:
      '売上、患者数、キャンセル率、スタッフ別実績を比較し、改善余地を見つけやすくします。',
  },
  {
    icon: FileBarChart2,
    title: '会議資料作成を軽くする',
    description:
      '週次、月次の確認に必要な経営データを整理し、報告作業の時間を短縮します。',
  },
  {
    icon: UsersRound,
    title: '現場と本部の数字をそろえる',
    description:
      '院長、エリアマネージャー、経営者が同じ数字を見ながら次の打ち手を話せる状態を作ります。',
  },
];

export interface FeatureItem {
  icon: LucideIcon;
  title: string;
  description: string;
}

export const featureItems: FeatureItem[] = [
  {
    icon: Building2,
    title: '店舗別日報',
    description: '売上、患者数、所感、申し送りを店舗別に確認できます。',
  },
  {
    icon: BarChart3,
    title: '本部ダッシュボード',
    description: 'グループ全体と店舗別の重要指標をひとつの画面で把握できます。',
  },
  {
    icon: WalletCards,
    title: '売上・患者数分析',
    description: '日次、週次、月次の推移を見ながら改善ポイントを整理できます。',
  },
  {
    icon: GitCompareArrows,
    title: '店舗比較',
    description:
      '店舗間の差分を見える化し、好調店舗の運用を横展開しやすくします。',
  },
  {
    icon: UsersRound,
    title: 'スタッフ別集計',
    description:
      'スタッフ単位の実績や行動量を確認し、育成と配置の判断を支援します。',
  },
  {
    icon: CalendarClock,
    title: '予約・シフト連携',
    description:
      '予約枠、稼働状況、シフト情報を経営確認に使いやすい形へ整理します。',
  },
  {
    icon: LockKeyhole,
    title: '権限管理',
    description:
      '本部、管理者、スタッフなど役割に応じた閲覧範囲を設計できます。',
  },
  {
    icon: Sparkles,
    title: 'AI分析支援',
    description:
      '自然言語で店舗データを確認するイメージをもとに、分析業務を支援します。',
  },
];

export interface PlanItem {
  name: string;
  monthlyPrice: string;
  stores: string;
  initialCost: string;
  positioning: string;
  extraStore: string;
  recommended?: boolean;
  features: string[];
}

export const planItems: PlanItem[] = [
  {
    name: 'Group Starter',
    monthlyPrice: '78,000円',
    stores: '5店舗まで',
    initialCost: '300,000円〜',
    positioning: 'まず本部集計を整えたい法人向け',
    extraStore: '6店舗目以降 8,000円/月',
    features: ['店舗別日報', '本部ダッシュボード', '基本KPI集計', '店舗比較'],
  },
  {
    name: 'Group Standard',
    monthlyPrice: '128,000円',
    stores: '10店舗まで',
    initialCost: '300,000円〜500,000円',
    positioning: '店舗比較と改善運用まで進めたい法人向け',
    extraStore: '11店舗目以降 8,000円/月',
    recommended: true,
    features: [
      'Starterの全機能',
      'スタッフ別集計',
      '予約・シフト連携',
      '本部レポート支援',
    ],
  },
  {
    name: 'Enterprise',
    monthlyPrice: '198,000円〜',
    stores: '20店舗以上',
    initialCost: '500,000円〜',
    positioning: '外部連携、独自帳票、運用設計が必要な法人向け',
    extraStore: '個別見積',
    features: [
      'Standardの全機能',
      '外部連携相談',
      '独自帳票設計',
      '運用設計支援',
    ],
  },
];

export interface FaqItem {
  question: string;
  answer: string;
}

export const faqItems: FaqItem[] = [
  {
    question: '1店舗だけでも利用できますか？',
    answer:
      '単店舗向けの簡易プランは月額12,000円〜でご相談可能です。ただし公開LPでは、5店舗以上の整骨院グループ向け本部管理を主対象にしています。',
  },
  {
    question: '既存の予約システムやExcelと併用できますか？',
    answer:
      '初期導入では既存運用を確認し、本部で必要な数字をどこから集めるかを整理します。全面移行ではなく、段階的な併用から始める設計も可能です。',
  },
  {
    question: 'AI機能は何をしてくれますか？',
    answer:
      'AI分析支援は、経営データを確認する手間や本部レポート作成を軽くするための支援機能です。医療判断や売上改善の保証を行うものではありません。',
  },
  {
    question: '年払い、補助金、稟議向け資料には対応できますか？',
    answer:
      '年払い、補助金、稟議資料は導入規模や運用条件に応じて相談可能です。デモ相談で店舗数、現行運用、導入時期を確認します。',
  },
  {
    question: '導入時に患者データや予約データをLPへ送信しますか？',
    answer:
      'この公開LP、AIデモ、本部業務削減シミュレーターは、患者データ、売上データ、予約データへアクセスせず、外部API送信やデータ保存も行いません。',
  },
];

export const trustItems: ValueItem[] = [
  {
    icon: ShieldCheck,
    title: '認証と権限は既存アプリに委譲',
    description:
      '公開LPは業務データへの入口ではなく、ログイン後の権限管理は現行システム側で扱います。',
  },
  {
    icon: MessageSquareText,
    title: '初回問い合わせは外部フォーム',
    description:
      '本体側に独自送信APIを増やさず、初回検証では問い合わせ受付を外部フォームに寄せます。',
  },
];
