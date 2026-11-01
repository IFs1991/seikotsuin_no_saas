// 必須条項の未解決マーカー。単語の全面禁止ではなく、原稿の要確認箇所を管理する。
export const legalReviewSections = {
  privacy: [
    'scope',
    'common',
    'os',
    'works',
    'contact-form',
    'requests',
    'retention',
    'pending',
  ],
  terms: [
    'scope',
    'common',
    'os',
    'works',
    'data-rights',
    'liability',
    'pending',
  ],
  legal: ['operator', 'operator-disclosure', 'works', 'os', 'sales-method'],
} as const;
export type LegalReviewField = {
  [Document in keyof typeof legalReviewSections]: `${Document}:${(typeof legalReviewSections)[Document][number]}`;
}[keyof typeof legalReviewSections];
export interface LegalContentState {
  sha256: string;
  unresolvedFields: readonly string[];
}
