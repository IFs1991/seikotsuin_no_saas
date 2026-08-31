export type WorksIconName =
  | 'calendar'
  | 'message'
  | 'megaphone'
  | 'brief'
  | 'workflow'
  | 'shield'
  | 'plug'
  | 'gauge'
  | 'clipboard'
  | 'users'
  | 'database'
  | 'file'
  | 'settings'
  | 'brain'
  | 'lock'
  | 'refresh'
  | 'audit'
  | 'clock'
  | 'store'
  | 'building'
  | 'sparkles'
  | 'money';

export type WorksIntegrationName =
  | 'line'
  | 'booking'
  | 'instagram'
  | 'google'
  | 'slack'
  | 'chatgpt';

export interface WorksNavItem {
  label: string;
  href: string;
}

export interface WorksFlowStep {
  integration: WorksIntegrationName;
  label: string;
}

export interface WorksCardItem {
  eyebrow?: string;
  title: string;
  description: string;
  outcome?: string;
  flow?: string;
  flowSteps?: WorksFlowStep[];
  icon?: WorksIconName;
}

export interface WorksStepItem {
  index: string;
  title: string;
  description: string;
}

export interface WorksFaqItem {
  question: string;
  answer: string;
}

export const worksNavItems: WorksNavItem[] = [
  { label: '課題', href: '#problems' },
  { label: '導入例', href: '#use-cases' },
  { label: '進め方', href: '#implementation' },
  { label: '棲み分け', href: '#product-family' },
  { label: '料金', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
];

export const heroTrustItems = [
  '既存ツールを原則そのまま活用',
  '最大2業務から小さく開始',
  '人の承認を残した安全設計',
];

export const heroStats = [
  { value: '1–3店舗', label: '本部システム導入前の規模' },
  { value: '2–10名', label: '少人数チームの運用改善' },
  { value: '既存環境', label: '全面移行を前提にしない' },
  { value: '原則30日', label: '診断から初期稼働まで' },
];

export const problemItems: WorksCardItem[] = [
  {
    eyebrow: 'Booking',
    title: '予約を別の台帳へ手で転記',
    description:
      'LINE、予約サービス、Calendar、顧客台帳を何度も確認して入力している。',
    outcome: '手入力 → 自動反映 + 確認',
    icon: 'calendar',
  },
  {
    eyebrow: 'Team',
    title: '誰が対応したか確認が必要',
    description:
      '個人LINEや口頭に情報が残り、未対応・重複・引き継ぎ漏れが起きる。',
    outcome: '属人化 → 通知 + 担当明確化',
    icon: 'message',
  },
  {
    eyebrow: 'Empty slot',
    title: '空き枠の告知が後回し',
    description:
      'キャンセルは把握しても、対象者選定や文面作成まで手が回らない。',
    outcome: '機会損失 → 候補抽出 + 下書き',
    icon: 'megaphone',
  },
  {
    eyebrow: 'Content',
    title: 'SNS・口コミ返信が続かない',
    description: 'ネタ出し、文章、確認、投稿までがオーナー一人に集中している。',
    outcome: '後回し → 生成 + 承認',
    icon: 'sparkles',
  },
  {
    eyebrow: 'Owner',
    title: '確認作業で経営時間が消える',
    description:
      '複数アプリを巡回し、今日の状況を把握するだけで時間を使っている。',
    outcome: '巡回 → 日次ブリーフ',
    icon: 'brief',
  },
  {
    eyebrow: 'AI',
    title: 'ChatGPTを契約したが定着しない',
    description:
      'プロンプト研修だけでは、予約・顧客対応・共有の日常業務に組み込まれない。',
    outcome: '使う人だけ → 業務フロー化',
    icon: 'brain',
  },
];

export const useCaseItems: WorksCardItem[] = [
  {
    eyebrow: 'Connect',
    title: '予約・顧客情報の連携',
    description:
      '予約、変更、キャンセルを検知し、必要な範囲だけ顧客台帳・Calendar・スタッフ通知へ反映します。',
    flow: '予約 → LINE → Google',
    flowSteps: [
      { integration: 'booking', label: '予約' },
      { integration: 'line', label: 'LINE' },
      { integration: 'google', label: 'Google' },
    ],
    icon: 'calendar',
  },
  {
    eyebrow: 'Recover',
    title: '空き枠・再来フォロー',
    description:
      '空き枠発生から候補顧客の抽出、告知文作成、スタッフ承認までを短縮。売上に近い業務から優先します。',
    flow: '空き枠 → 文面生成 → 承認 → LINE',
    flowSteps: [
      { integration: 'booking', label: '空き枠' },
      { integration: 'chatgpt', label: '文面案' },
      { integration: 'slack', label: '承認' },
      { integration: 'line', label: '配信' },
    ],
    icon: 'megaphone',
  },
  {
    eyebrow: 'Approve',
    title: 'SNS・口コミの承認フロー',
    description:
      'AIが下書きを作り、オーナーや担当者が確認してから公開。標準では勝手に外部送信しません。',
    flow: 'Instagram → ChatGPT → Slack → Instagram',
    flowSteps: [
      { integration: 'instagram', label: '素材' },
      { integration: 'chatgpt', label: '下書き' },
      { integration: 'slack', label: '承認' },
      { integration: 'instagram', label: '投稿' },
    ],
    icon: 'shield',
  },
  {
    eyebrow: 'Brief',
    title: 'オーナー向け日次ブリーフ',
    description:
      '予約、空き枠、問い合わせ、未承認を毎朝まとめ、複数アプリを巡回する時間を削減します。',
    flow: 'Google → ChatGPT → Slack',
    flowSteps: [
      { integration: 'google', label: '集計' },
      { integration: 'chatgpt', label: '要約' },
      { integration: 'slack', label: '通知' },
    ],
    icon: 'brief',
  },
];

export const principleItems: WorksCardItem[] = [
  {
    eyebrow: '01',
    title: '既存ツールを捨てない',
    description:
      'API・Webhook・メール・CSVなど、今の環境を活かせる経路から検討します。',
    icon: 'plug',
  },
  {
    eyebrow: '02',
    title: '人の判断を残す',
    description:
      '顧客返信、投稿、重要な更新は承認フローを標準にし、誤送信リスクを抑えます。',
    icon: 'shield',
  },
  {
    eyebrow: '03',
    title: '効果が測れる業務から',
    description:
      '削減時間、対応漏れ、予約回収など、Before / Afterを確認できるものを優先します。',
    icon: 'gauge',
  },
  {
    eyebrow: '04',
    title: '作りすぎない',
    description:
      '既製サービスで十分なら新規開発しません。繰り返し出る要件だけ共通化します。',
    icon: 'settings',
  },
];

export const controlPlaneItems: WorksCardItem[] = [
  {
    title: '接続と認証',
    description:
      '外部サービスの接続状態、OAuth、APIキー、権限範囲を一元管理します。',
    icon: 'plug',
  },
  {
    title: '承認ゲート',
    description:
      '外部送信・投稿・重要更新は、担当者の承認後に実行する設計を標準にします。',
    icon: 'lock',
  },
  {
    title: '監査と再試行',
    description:
      '誰が何を承認・実行したかを記録し、失敗時の再試行と停止判断を可能にします。',
    icon: 'audit',
  },
  {
    title: 'テンプレート化',
    description:
      '個別受託で終わらせず、再利用できるワークフローと設定に落とし込みます。',
    icon: 'workflow',
  },
];

export const implementationSteps: WorksStepItem[] = [
  {
    index: '01',
    title: '現状ヒアリング',
    description: '誰が、どのツールで、何をしているかを時系列で整理します。',
  },
  {
    index: '02',
    title: '優先業務を選定',
    description:
      '工数・売上影響・リスク・実装難度から、最初に改善する最大2業務を選びます。',
  },
  {
    index: '03',
    title: '設計・接続',
    description:
      '既存コネクタ、API、Webhook等で通知・承認・データ更新を構築します。',
  },
  {
    index: '04',
    title: 'スタッフ導入',
    description:
      '権限と担当を整理し、日常業務の中で使える状態へ落とし込みます。',
  },
  {
    index: '05',
    title: '計測・初期改善',
    description:
      '14日程度の運用を見て、軽微な修正とBefore / Afterの確認を行います。',
  },
];

export const includedItems = [
  '90分の業務ヒアリング',
  '最大2つの業務フロー',
  '外部サービス最大4種類',
  'スタッフ説明60分',
  '操作マニュアル',
  '14日間の軽微な調整',
];

export const excludedItems = [
  '独自予約システムの新規開発',
  '大規模なデータ移行',
  '電子カルテ等の基幹接続',
  '新規コネクタの個別開発',
  'SNS等の日常運用代行',
  '24時間監視・即時障害対応',
];

export const worksPlan = {
  name: 'Tiramisu Works',
  label: '1–3 locations',
  description: '既存のLINE・予約・Google・SNSを活かすAI業務導入支援。',
  bullets: [
    '少人数オペレーション',
    '既存環境の接続',
    '1〜2業務から改善',
    '人による承認を維持',
  ],
};

export const osPlan = {
  name: 'Tiramisu OS',
  label: '5+ locations',
  description: '5店舗以上の整骨院グループ向け、本部管理OS。',
  bullets: [
    '店舗横断ダッシュボード',
    '売上 / 日報 / 予約 / シフト',
    '店舗比較と経営KPI',
    '本部 / 店長 / スタッフ権限',
  ],
};

export const supportTags = [
  '鍼灸師',
  'Tiramisu開発',
  '生成AI・業務自動化',
  '小規模開発',
];

export const trustItems: WorksCardItem[] = [
  {
    title: '必要最小限のデータ',
    description:
      '業務に不要な個人情報を集めず、患者カルテ等の高感度情報は標準対象外とします。',
    icon: 'database',
  },
  {
    title: '権限を先に設計',
    description:
      '担当者ごとに閲覧・承認・実行できる範囲を分け、全員が全操作できる状態を避けます。',
    icon: 'users',
  },
  {
    title: '止められる仕組み',
    description:
      '連携失敗や誤動作時に自動実行を停止し、原因確認後に安全に再開できる前提で設計します。',
    icon: 'refresh',
  },
];

export const pricing = {
  initial: {
    label: 'Standard implementation',
    name: 'AI業務導入パッケージ',
    price: '250,000',
    unit: '円（税別）/ 初期',
    description:
      '現状業務を整理し、最大2つの業務フローを既存ツールとAI・自動化で初期稼働まで持っていきます。',
  },
  monthly: {
    label: 'Optional',
    name: '継続改善・保守',
    price: '30,000',
    unit: '円/月（税別）',
    description:
      '月次確認、軽微な設定改善、既存連携の保守、外部サービス変更への追従。大きな追加開発は別途です。',
  },
  custom: {
    label: 'Custom development',
    name: '個別開発',
    price: '100,000〜',
    unit: '円（税別）',
    description:
      '独自機能、新規コネクタ、管理画面、特殊なデータ連携など、標準範囲を超える場合のみ見積もります。',
  },
};

export const faqItems: WorksFaqItem[] = [
  {
    question: '今使っている予約システムを変える必要がありますか？',
    answer:
      '原則として変更を前提にしません。API、Webhook、メール通知、CSV等で既存環境を活かせる方法を優先します。連携できない場合は、代替案と費用対効果を説明します。',
  },
  {
    question: 'AIが顧客へ勝手に返信・投稿しますか？',
    answer:
      '標準では、顧客向けの返信・投稿・重要な更新は人の承認を挟みます。自動送信が適切な定型通知だけ、明確なルールと同意の範囲で自動化します。',
  },
  {
    question: '何を導入するか決めてから相談する必要がありますか？',
    answer:
      '不要です。現在の業務、利用中のツール、スタッフ体制を聞き、工数・売上影響・リスク・実装難度から候補を絞ります。自動化しない方が良い業務も明確に分けます。',
  },
  {
    question: '月額3万円は必須ですか？',
    answer:
      '必須ではありません。月額には既存連携の保守、軽微な改善、月次レビュー、外部サービス変更への追従が含まれます。改善や保守が不要なケースでは、継続契約を無理に勧めません。',
  },
  {
    question: '病院の患者情報やカルテも扱えますか？',
    answer:
      '病院・電子カルテ・症状等の高感度な医療情報は標準パッケージの対象外です。必要な場合は、権限、保管先、契約、法的要件、監査を含めて別途設計します。',
  },
  {
    question: 'どの外部サービスでも連携できますか？',
    answer:
      'できるとは限りません。各サービスのAPI、Webhook、権限、契約プラン、利用規約に依存します。実装前に連携可否を確認し、無理な場合はメール・CSV・既存自動化サービス等の代替経路を検討します。',
  },
];
