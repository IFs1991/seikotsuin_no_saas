// Tiramisu共通サイト（/）と製品選択モーダルの表示コンテンツ。
// LP表示上の製品名は Tiramisu Works／Tiramisu OS に統一する（業務アプリ全体の名称は変えない）。

export type MarketingProductKey = 'works' | 'os';

export interface MarketingProduct {
  key: MarketingProductKey;
  name: string;
  monogram: string;
  label: string;
  heading: string;
  description: string;
  points: string[];
  note: string;
  href: '/works' | '/os';
  linkLabel: string;
}

// 2製品は等しい重みで並べる（どちらかを「おすすめ」「人気」としない）。
export const marketingProducts: readonly MarketingProduct[] = [
  {
    key: 'works',
    name: 'Tiramisu Works',
    monogram: 'W',
    label: '既存ツールを活かす業務支援',
    heading: '今のツールを活かして、業務を進めたい',
    description:
      'ChatGPT・Slackを入口に、対応済み業務の依頼・承認・記録をつなぎます。',
    points: [
      'ChatGPT・Slackを入口に',
      '依頼・承認・記録をつなぐ',
      '店舗・権限ごとに確認',
    ],
    note: '接続先・利用条件は説明ページで確認',
    href: '/works',
    linkLabel: 'Tiramisu Worksを見る',
  },
  {
    key: 'os',
    name: 'Tiramisu OS',
    monogram: 'O',
    label: '店舗・本部管理',
    heading: '店舗の情報をまとめて、経営を見える化したい',
    description:
      '日報・売上・予約・シフト・店舗比較をまとめ、店舗と本部を支えます。',
    points: [
      '日報・売上・予約・シフト',
      '本部ダッシュボード',
      '店舗比較・経営の可視化',
    ],
    note: '主な対象は複数店舗の整骨院グループ',
    href: '/os',
    linkLabel: 'Tiramisu OSを見る',
  },
];

export const productSelectorCopy = {
  title: 'お店の運営に、どちらのTiramisuを。',
  description:
    '今のツールを活かすか、店舗の情報をまとめるか。目的に合わせて選べます。',
} as const;

export const brandTopCopy = {
  heroTitleLines: ['お店の可能性を、', 'もっと自由に。'],
  heroLead:
    '今のツールを活かす業務支援と、店舗の情報をまとめる経営管理。目的に合わせて選べる、2つのTiramisu。',
  productsTitle: 'それぞれの現場に、合うかたちで。',
  productsLead:
    '今のツールを活かして業務を進めたいなら Tiramisu Works、店舗の情報をまとめて経営を見える化したいなら Tiramisu OS。目的に合わせてお選びください。',
  consultTitle: 'どちらが合うか分からない場合も、ご相談ください。',
  consultLead:
    '今お使いのツールや店舗の運営方法をうかがい、目的に合う製品をご案内します。店舗数だけで決める必要はありません。',
} as const;

export interface ProductComparisonRow {
  axis: string;
  works: string;
  os: string;
}

// Works LP「OSとの違い」と共通トップの選び方で共用する比較表。
export const productComparisonRows: readonly ProductComparisonRow[] = [
  {
    axis: '主な目的',
    works: '既存サービスを活かし、業務の依頼・権限・承認・実行記録をつなぐ',
    os: '店舗データを集約し、本部と店舗の運営を管理する',
  },
  {
    axis: '主な入口',
    works: 'ChatGPT等の対応環境と、必要な設定・承認画面',
    os: '既存の業務管理画面',
  },
  {
    axis: '既存ツール',
    works: '原則として併用する',
    os: '移行・集約の対象は個別に確認する',
  },
  {
    axis: '選び方',
    works: '今使っているツールを活かしたい',
    os: '分散した業務情報を一元化したい',
  },
];
