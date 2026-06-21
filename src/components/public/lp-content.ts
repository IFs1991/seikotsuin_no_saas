// 公開LP（Tiramisu）の表示コンテンツ。
// ターゲットは「5店舗以上の整骨院グループ／本部管理OS」。
// ビューと文言を分離し、文言調整をこのファイルに集約する。

import {
  BarChart3,
  Brain,
  Building2,
  CalendarClock,
  ClipboardList,
  GitCompareArrows,
  LineChart,
  type LucideIcon,
  MessageSquareText,
  Sparkles,
  TrendingUp,
  UsersRound,
  WalletCards,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
}

export const navItems: NavItem[] = [
  { label: '課題', href: '#problems' },
  { label: '機能', href: '#features' },
  { label: 'AI', href: '#ai' },
  { label: '試算', href: '#roi' },
  { label: '料金', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
];

// ヒーローのダッシュボードモック（架空データ）
export const heroStats: Array<{ value: string; label: string }> = [
  { value: '8店舗', label: '本部の確認対象' },
  { value: '92.4%', label: '日報提出率' },
  { value: '-18h', label: '月間集計削減見込み' },
];

export const heroStoreRows: Array<{
  store: string;
  note: string;
  tone: 'good' | 'warn' | 'info';
}> = [
  { store: '新宿院', note: '売上達成率 104%', tone: 'good' },
  { store: '横浜院', note: 'キャンセル率 要確認', tone: 'warn' },
  { store: '大宮院', note: '午後枠に空きあり', tone: 'info' },
];

// マーキー（導入検討エリア）
export const marqueePrefectures: string[] = [
  '北海道',
  '宮城県',
  '東京都',
  '神奈川県',
  '埼玉県',
  '愛知県',
  '大阪府',
  '京都府',
  '広島県',
  '福岡県',
  '熊本県',
  '沖縄県',
];

export interface ProblemItem {
  title: string;
  description: string;
}

export const problemItems: ProblemItem[] = [
  {
    title: '店舗ごとの数字が見えない',
    description:
      '日報・売上・予約・シフト・患者数が店舗ごとに分散し、本部が全店の状態をつかむまでに時間がかかる。',
  },
  {
    title: '集計と確認が手作業に寄る',
    description:
      'Excel・LINE・紙・既存予約システムをまたいだ確認が増え、会議資料や店舗比較の作成が属人化する。',
  },
  {
    title: '院長ごとに管理レベルがばらつく',
    description:
      '同じ数字を見て話す前提がそろわず、改善の着眼点や報告粒度が店舗ごとに変わってしまう。',
  },
  {
    title: '店舗展開に管理基盤が追いつかない',
    description:
      '5店舗、10店舗と増えるほど本部の確認負荷が膨らみ、経営判断のスピードが落ちやすくなる。',
  },
];

export interface PillarItem {
  index: string;
  eyebrow: string;
  icon: LucideIcon;
  title: string;
  description: string;
  bullets: string[];
  core?: boolean;
}

export const pillarItems: PillarItem[] = [
  {
    index: '01',
    eyebrow: 'Operations',
    icon: BarChart3,
    title: '本部オペレーション',
    description:
      '日報・売上・予約・シフト・患者データを、本部が同じ形式で確認できる土台。',
    bullets: ['店舗別日報の一覧', '本部ダッシュボード', '権限別の閲覧範囲', '店舗比較ビュー'],
  },
  {
    index: '02',
    eyebrow: 'AI Partner',
    icon: MessageSquareText,
    title: 'AI経営パートナー',
    description:
      '店舗横断の数字を読み込んだAIに、自然言語で確認。集計や会議準備の前さばきを任せる。',
    bullets: ['売上の異変を要点で提示', '店舗比較の自動要約', '本部レポートの下書き', '確認すべき店舗の抽出'],
    core: true,
  },
  {
    index: '03',
    eyebrow: 'Analytics',
    icon: TrendingUp,
    title: '経営KPI分析',
    description:
      '売上・粗利・リピート率・稼働率。本部判断に直結する指標を時系列で追跡。',
    bullets: ['月次KPIダッシュボード', '店舗別の差分可視化', 'リピート率の推移', '担当者別パフォーマンス'],
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
    description: '売上・患者数・所感・申し送りを店舗別に確認できます。',
  },
  {
    icon: BarChart3,
    title: '本部ダッシュボード',
    description: 'グループ全体と店舗別の重要指標をひとつの画面で把握できます。',
  },
  {
    icon: WalletCards,
    title: '売上・患者数分析',
    description: '日次・週次・月次の推移を見ながら改善ポイントを整理できます。',
  },
  {
    icon: GitCompareArrows,
    title: '店舗比較',
    description: '店舗間の差分を見える化し、好調店舗の運用を横展開しやすくします。',
  },
  {
    icon: UsersRound,
    title: 'スタッフ別集計',
    description: 'スタッフ単位の実績や行動量を確認し、育成と配置の判断を支援します。',
  },
  {
    icon: CalendarClock,
    title: '予約・シフト連携',
    description: '予約枠・稼働状況・シフト情報を経営確認に使いやすい形へ整理します。',
  },
  {
    icon: LineChart,
    title: '権限・多店舗管理',
    description: '本部・店長・スタッフなど役割に応じた閲覧範囲とスコープを設計できます。',
  },
  {
    icon: Sparkles,
    title: 'AI分析支援',
    description: '自然言語で店舗データを確認するイメージで、分析業務の前さばきを支援します。',
  },
];

// AIユースケース（架空データのシナリオ集）
export interface AiScenario {
  id: string;
  category: string;
  tag: string;
  icon: LucideIcon;
  question: string;
  answer: string;
}

export const aiScenarios: AiScenario[] = [
  {
    id: 'sales-drop',
    category: '売上分析',
    tag: '異変検知',
    icon: TrendingUp,
    question: '先週、本部全体で売上が落ちた店舗は？',
    answer:
      '8店舗中3店舗が前週比マイナス。最大は横浜院で-8.2%（自費メニューのリピート率が42%→31%）。木曜夜枠の新規→2回目転換の悪化が共通要因です。',
  },
  {
    id: 'cancel',
    category: 'キャンセル',
    tag: '離脱防止',
    icon: MessageSquareText,
    question: 'キャンセル率が高い店舗を見たい',
    answer:
      '大宮院（18.4%）と川崎院（15.1%）が突出。いずれも前日リマインド未送信の比率が高め。LINE自動リマインドのドラフトを店舗別に作成しますか？',
  },
  {
    id: 'staff',
    category: 'スタッフ',
    tag: '育成判断',
    icon: UsersRound,
    question: 'スタッフ別の改善ポイントを知りたい',
    answer:
      '田中さんは施術件数3位ですが自費率が院内トップ(68%)。新人の佐藤さんはリピート率82%で将来性あり。個人評価ではなく育成テーマの共有に使えます。',
  },
  {
    id: 'slots',
    category: '予約枠',
    tag: '稼働最適化',
    icon: CalendarClock,
    question: '空き枠が集中している時間帯は？',
    answer:
      '火曜10-12時と土曜18時以降の稼働率が25%切り。閉枠すれば月28時間（人件費約¥42,000）削減可能。土曜夕方は新患率が高いので火曜午前のみ推奨です。',
  },
  {
    id: 'report',
    category: '本部レポート',
    tag: '会議準備',
    icon: BarChart3,
    question: '今月の本部会議レポートを要約して',
    answer:
      '全店売上は前月比+4.1%。好調店舗の再現ポイントは「次回予約の同時提案」。注意店舗は新患減速が2か月連続の2店舗。論点を分けて整理しました。',
  },
  {
    id: 'benchmark',
    category: '経営KPI',
    tag: 'ベンチマーク',
    icon: Brain,
    question: 'グループ全体の限界利益率はどう？',
    answer:
      '42.3%で一般水準(35-40%)を上回っています。物販の粗利寄与が大きい一方、スタッフ稼働率68%に伸びしろ。下位2店舗の稼働改善が次の打ち手です。',
  },
];

// 料金（法人グループ向け）
export interface PlanItem {
  name: string;
  positioning: string;
  monthlyPrice: string;
  stores: string;
  initialCost: string;
  extraStore: string;
  features: string[];
  recommended?: boolean;
}

export const planItems: PlanItem[] = [
  {
    name: 'Group Starter',
    positioning: 'まず本部集計を整えたい法人向け',
    monthlyPrice: '¥78,000',
    stores: '5店舗まで',
    initialCost: '¥300,000〜',
    extraStore: '6店舗目以降 ¥8,000/月',
    features: ['店舗別日報', '本部ダッシュボード', '基本KPI集計', '店舗比較'],
  },
  {
    name: 'Group Standard',
    positioning: '店舗比較と改善運用まで進めたい法人向け',
    monthlyPrice: '¥128,000',
    stores: '10店舗まで',
    initialCost: '¥300,000〜¥500,000',
    extraStore: '11店舗目以降 ¥8,000/月',
    recommended: true,
    features: ['Starterの全機能', 'スタッフ別集計', '予約・シフト連携', '本部レポート支援'],
  },
  {
    name: 'Enterprise',
    positioning: '外部連携・独自帳票・運用設計が必要な法人向け',
    monthlyPrice: '¥198,000〜',
    stores: '20店舗以上',
    initialCost: '¥500,000〜',
    extraStore: '個別見積',
    features: ['Standardの全機能', '外部連携相談', '独自帳票設計', '運用設計支援'],
  },
];

// 比較表
export interface ComparisonRow {
  axis: string;
  tiramisu: string;
  others: string;
  excel: string;
}

export const comparisonRows: ComparisonRow[] = [
  {
    axis: '対象',
    tiramisu: '5店舗以上のグループ本部管理に特化',
    others: '単店舗の予約・会計が中心',
    excel: '規模拡大で破綻しやすい',
  },
  {
    axis: '店舗横断の比較',
    tiramisu: '本部ダッシュボードで標準化',
    others: 'オプション扱いが多い',
    excel: '手動集計・属人化',
  },
  {
    axis: 'AI分析支援',
    tiramisu: '店舗横断の要約・異変検知',
    others: 'ほぼ未搭載',
    excel: 'N/A',
  },
  {
    axis: '権限・スコープ',
    tiramisu: '本部/店長/スタッフを自動分離',
    others: 'オプション扱い',
    excel: 'なし',
  },
  {
    axis: '本部の確認負荷',
    tiramisu: '集計・確認・報告を一元化',
    others: '店舗報告の取りまとめが必要',
    excel: '人件費が膨らむ',
  },
];

// 導入ステップ
export interface TimelineItem {
  phase: string;
  title: string;
  description: string;
  active?: boolean;
}

export const timelineItems: TimelineItem[] = [
  {
    phase: 'STEP 01',
    title: '現状ヒアリング',
    description: '店舗数・現行の管理方法・本部の確認フローを整理し、必要な数字の出どころを確認します。',
    active: true,
  },
  {
    phase: 'STEP 02',
    title: '本部ダッシュボード導入',
    description: '店舗別日報と重要KPIを同じ形式に集約。既存運用と段階的に併用しながら立ち上げます。',
  },
  {
    phase: 'STEP 03',
    title: '店舗比較・改善運用',
    description: '店舗間の差分を可視化し、好調店舗の運用を横展開。週次・月次の確認サイクルを定着させます。',
  },
  {
    phase: 'STEP 04',
    title: 'AI分析支援の活用',
    description: '本部レポートの下書きや異変検知をAIに前さばきさせ、会議準備と確認の時間をさらに圧縮します。',
  },
];

export interface FaqItem {
  question: string;
  answer: string;
}

export const faqItems: FaqItem[] = [
  {
    question: '何店舗から導入できますか？',
    answer:
      '5店舗以上の整骨院グループ本部の管理を主対象にしています。単店舗向けの簡易プランもご相談可能ですが、本部一元管理・店舗比較の価値が出るのは複数店舗からです。',
  },
  {
    question: '既存の予約システムやExcelと併用できますか？',
    answer:
      '初期導入では既存運用を確認し、本部で必要な数字をどこから集めるかを整理します。全面移行ではなく、段階的な併用から始める設計が可能です。',
  },
  {
    question: 'AI機能は何をしてくれますか？',
    answer:
      'AI分析支援は、店舗横断の数字確認や本部レポート作成の前さばきを軽くするための支援機能です。医療判断や売上改善を保証するものではありません。',
  },
  {
    question: '年払い・補助金・稟議向け資料には対応できますか？',
    answer:
      '導入規模や運用条件に応じて相談可能です。デモ相談で店舗数・現行運用・導入時期を確認し、稟議に必要な資料を整えます。',
  },
  {
    question: '患者データや予約データはこのLPに送信されますか？',
    answer:
      'この公開LP、AIデモ、本部業務削減シミュレーターは患者データ・売上データ・予約データへアクセスせず、外部送信やデータ保存も行いません。',
  },
];
