// Tiramisu Works LP（/works）の表示コンテンツと料金データ。
//
// 料金は2026-10-22の事業者決定（暫定固定・税別）を正本とし、ここ1か所で管理する。
// 料金カード・問い合わせ・運営者情報ページはこのデータを参照し、二重管理しない。
// 機能の記述は claimId で公開主張の管理表（release-readiness.ts）と対応させ、
// 本番提供の根拠を確認するまで公開前チェックで公開不可と判定する。
// これは表示用データであり、課金APIや権限の実装ではない。

export type WorksPlanKey = 'light' | 'standard' | 'pro';

export interface WorksPlan {
  key: WorksPlanKey;
  name: string;
  /** 月額（税別・円） */
  monthlyFeeYen: number;
  /** 初期費用（税別・円） */
  initialFeeYen: number;
  scope: string;
  description: string;
  ctaLabel: string;
  featured: boolean;
}

export const worksPlans: readonly WorksPlan[] = [
  {
    key: 'light',
    name: 'Light',
    monthlyFeeYen: 19_800,
    initialFeeYen: 49_800,
    scope: '定型導入・セルフサービス中心',
    description:
      '定型の導入手順で、セルフサービスを中心に使い始めるプランです。個別カスタマイズや手厚い有人サポートは含みません。',
    ctaLabel: '導入相談',
    featured: false,
  },
  {
    key: 'standard',
    name: 'Standard',
    monthlyFeeYen: 29_800,
    initialFeeYen: 100_000,
    scope: '標準導入・接続と承認設定・限定支援',
    description:
      '標準的な業務導入に向けて、接続と承認の設定、限定的な運用支援を含むプランです。',
    ctaLabel: 'Standardを相談する',
    featured: true,
  },
  {
    key: 'pro',
    name: 'Pro',
    monthlyFeeYen: 49_800,
    initialFeeYen: 150_000,
    scope: '業務フロー拡大・導入調整・支援',
    description:
      'より多くの業務フローへの展開と、導入時の調整・運用支援を含むプランです。',
    ctaLabel: '導入相談',
    featured: false,
  },
];

const externalFeesNote =
  'ChatGPTの利用プラン、連携先サービスの利用料、LINEの送信料などは、各サービスの契約に基づき別途必要になる場合があります。負担関係は導入前にご案内します。';

export const worksPricingCopy = {
  title: '料金プラン',
  lead: '導入の進め方に合わせた3つのプランを用意しています。いずれも導入相談から始まり、このページから申込み・決済はできません。',
  provisionalLabel: '暫定価格（税別）／個別契約前に正式条件を案内',
  featuredBadge: '主力プラン',
  featuredCaption: '標準的な導入に',
  externalFeesNote,
  notes: [
    '暫定価格・税別。提供範囲と契約条件は導入前にご案内します。',
    'プランごとの対象業務・接続先・利用者数・サポートの範囲は、ご相談内容をうかがったうえで導入前にご案内します。',
    externalFeesNote,
  ],
  custom: {
    title: '個別見積もり',
    description:
      '特殊な連携、独自開発、複雑な業務設計、長時間の伴走支援などは、3つのプランとは別にご相談ください。',
    ctaLabel: '個別に相談する',
  },
} as const;

export function formatYen(amount: number): string {
  return `${amount.toLocaleString('ja-JP')}円`;
}

export const worksNavItems: ReadonlyArray<{ label: string; href: string }> = [
  { label: '課題', href: '#problems' },
  { label: '仕組み', href: '#how-it-works' },
  { label: 'できること', href: '#capabilities' },
  { label: '安全性', href: '#governance' },
  { label: 'OSとの違い', href: '#compare' },
  { label: '料金', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
];

export const worksHeroCopy = {
  eyebrow: 'Tiramisu Works',
  titleLines: ['今のツールはそのまま。', '業務の依頼を、承認と記録まで。'],
  lead: 'Tiramisu Worksは、ChatGPTを入口に、接続済みサービスを使う業務を支援します。対象の店舗・権限・承認条件を確認し、対応済みの業務を進めます。',
  primaryCtaLabel: '導入について相談する',
  secondaryCtaLabel: 'できることを見る',
} as const;

export const worksProblems: ReadonlyArray<{
  title: string;
  description: string;
}> = [
  {
    title: 'ツール間の転記が増える',
    description:
      'ChatGPT・Slack・LINE・予約など、使うツールが増えるほど、同じ内容の転記や確認が増えていきます。',
  },
  {
    title: '承認の確認があとから難しい',
    description:
      '誰が、どの店舗の作業を、どの内容で承認したのかを、あとから確かめにくくなります。',
  },
  {
    title: '作業の経緯が分散する',
    description:
      '依頼・下書き・実行結果が別々の場所に残り、経緯を追うのに時間がかかります。',
  },
];

export const worksFlowSteps: ReadonlyArray<{
  step: string;
  title: string;
  description: string;
}> = [
  {
    step: '01',
    title: '依頼・確認',
    description:
      'ChatGPTから業務を依頼します。対象の組織・店舗・接続先が分からない場合は、推測せずに確認します。',
  },
  {
    step: '02',
    title: '下書き・準備',
    description: '依頼内容をもとに、文面や操作内容の下書きを準備します。',
  },
  {
    step: '03',
    title: '必要な承認',
    description:
      '承認が必要な操作は、権限のある担当者が内容を確認してから進めます。',
  },
  {
    step: '04',
    title: '対応済みの実行',
    description: '接続・権限・承認がそろった、対応済みの操作だけを実行します。',
  },
  {
    step: '05',
    title: '記録・結果確認',
    description:
      '依頼・承認・実行の経緯と結果を記録し、あとから確認できるようにします。',
  },
];

export interface WorksUseCase {
  claimId: string;
  title: string;
  description: string;
  requirements: string;
}

// 公開確認済みとして扱う前に、実装・有効化・本番E2Eの根拠を確認する（公開前チェックの対象）。
export const worksUseCases: readonly WorksUseCase[] = [
  {
    claimId: 'works-approval-flow',
    title: '依頼と承認の流れを整える',
    description:
      'ChatGPTで受けた依頼を、権限のある担当者の承認を経てから進めます。誰が承認したかも記録に残ります。',
    requirements: '必要なもの: 対応するChatGPT環境、承認者と権限の設定',
  },
  {
    claimId: 'works-line-draft',
    title: '連絡文の下書きと承認',
    description:
      'LINE公式アカウント向けの文面などを下書きし、担当者の承認を経てから扱います。配信まで行えるかは、接続・設定・契約によって異なります。',
    requirements:
      '必要なもの: LINE公式アカウント、承認に使うSlackの設定（提供範囲は導入前に確認）',
  },
  {
    claimId: 'works-records',
    title: '作業の記録を残す',
    description:
      '依頼・承認・実行と、その結果を店舗ごとに記録し、あとから経緯を確認できます。',
    requirements: '必要なもの: 対象の組織・店舗の設定',
  },
];

export type WorksServiceAvailability =
  | 'entry'
  | 'confirm-scope'
  | 'in-progress';

export interface WorksServiceEntry {
  claimId: string;
  name: string;
  availability: WorksServiceAvailability;
  detail: string;
}

export const worksServiceAvailabilityLabels: Record<
  WorksServiceAvailability,
  string
> = {
  entry: '入口',
  'confirm-scope': '提供範囲を確認',
  'in-progress': '対応中',
};

// 「提供範囲を確認するもの」と「対応中」を表示上も分ける。
export const worksServices: readonly WorksServiceEntry[] = [
  {
    claimId: 'works-entry-chatgpt',
    name: 'ChatGPT',
    availability: 'entry',
    detail: '依頼の入口です。対応するプラン・利用環境は導入前に確認します。',
  },
  {
    claimId: 'works-slack',
    name: 'Slack',
    availability: 'confirm-scope',
    detail: '依頼・承認の連絡に使います。使える範囲は導入前に確認します。',
  },
  {
    claimId: 'works-line',
    name: 'LINE公式アカウント',
    availability: 'confirm-scope',
    detail:
      '文面の下書きと承認が中心です。配信の可否・範囲は導入前に確認します。',
  },
  {
    claimId: 'works-reservation',
    name: '予約サービス',
    availability: 'confirm-scope',
    detail:
      '対応できるサービスと操作の範囲を、導入前に個別に確認します。すべての操作に対応するものではありません。',
  },
  {
    claimId: 'works-instagram',
    name: 'Instagram',
    availability: 'in-progress',
    detail: '対応中です。現在は提供していません。',
  },
];

export const worksNotProvided = {
  claimId: 'works-not-provided',
  title: '現在提供していないもの',
  items: [
    '会計・売上データの参照',
    'Google マップ・Google ビジネス プロフィールとの連携',
    '画像・動画の公開',
    '決済の作成・返金の操作',
  ],
  note: '対応済みの業務・接続先以外は、自動で実行しません。',
} as const;

export const worksGovernanceItems: ReadonlyArray<{
  claimId: string;
  title: string;
  description: string;
}> = [
  {
    claimId: 'works-scope-check',
    title: '対象の組織・店舗を確認',
    description:
      '接続中の利用者・組織・店舗を確認し、対象が分からない場合は確認してから進めます。',
  },
  {
    claimId: 'works-approval-boundary',
    title: '権限と承認',
    description:
      '承認が必要な操作は、権限のある担当者が内容を確認してから進めます。ChatGPT側の許可設定を、担当者の承認の代わりにはしません。',
  },
  {
    claimId: 'works-audit-records',
    title: '記録',
    description:
      '依頼・承認・実行の記録を残し、あとから経緯を確認できるようにします。',
  },
  {
    claimId: 'works-limitations',
    title: '仕組みの限界',
    description:
      '外部サービスの障害や仕様変更、設定の不足によって、実行できない場合や結果の確認が必要になる場合があります。安全性や業務の結果を保証するものではありません。',
  },
];

export const worksOnboardingSteps: ReadonlyArray<{
  title: string;
  description: string;
}> = [
  {
    title: '相談',
    description: '今お使いのツールと、任せたい業務をうかがいます。',
  },
  {
    title: '対象業務の確認',
    description: '対応できる業務と、対象外の業務を整理します。',
  },
  {
    title: '接続・権限の設計',
    description: '接続先、承認者、店舗ごとの権限を設計します。',
  },
  { title: '検証', description: '実際の運用に近い条件で動作を確認します。' },
  {
    title: '提供開始',
    description: '確認できた業務から、利用を始めます。',
  },
];

export interface WorksFaqItem {
  question: string;
  answer: string;
}

// 未確定の条件は架空の回答をせず、導入前に案内する旨だけを記載する。
export const worksFaqItems: readonly WorksFaqItem[] = [
  {
    question: 'ChatGPTだけで使う場合と、何が違いますか？',
    answer:
      'Tiramisu Worksは、ChatGPTを入口にしながら、対象の店舗・権限・承認条件の確認と、依頼・承認・実行の記録を受け持ちます。ChatGPTの機能そのものを置き換えるものではありません。',
  },
  {
    question: 'Tiramisu OSとは何が違いますか？',
    answer:
      'Tiramisu OSは、日報・売上・予約・シフト等の店舗データを集約し、本部と店舗の運営を管理する製品です。Tiramisu Worksは、今お使いのツールを置き換えずに、業務の依頼・承認・記録をつなぎます。店舗数だけで決める必要はありません。',
  },
  {
    question: 'どのサービスと連携できますか？',
    answer:
      'ChatGPTとSlackを基本に、LINE公式アカウントや予約サービスは、対象業務と契約状況を確認したうえで提供範囲をご案内します。Instagramは対応中で、現在は提供していません。',
  },
  {
    question: '料金のほかに必要な費用はありますか？',
    answer:
      'ChatGPTの利用プラン、連携先サービスの利用料、LINEの送信料などは、各サービスの契約に基づき別途必要になる場合があります。負担関係は導入前にご案内します。',
  },
  {
    question: '導入はどのように進みますか？',
    answer:
      'ご相談のあと、対象業務の確認、接続・権限の設計、検証を経て、確認できた業務から利用を始めます。',
  },
  {
    question: 'サポートの範囲はどこまでですか？',
    answer:
      'サポートの範囲・方法はプランと契約条件によって異なります。正式な条件は契約前にご案内します。',
  },
  {
    question: '解約やデータの削除はどうなりますか？',
    answer:
      '契約期間・更新・解約・返金の条件と、解約後のデータの扱いは、契約前にご案内します。データの削除に関するご相談は、お問い合わせページで受け付けます。',
  },
];
