import React from 'react';
import type { LegalReviewField } from './legal-review-fields';
/** 原稿の必須確認箇所。DOMは増やさず、manifest生成時に正式公開のブロッカーとして収集する。 */
export function LegalReviewRequired({
  children,
}: {
  field: LegalReviewField;
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
