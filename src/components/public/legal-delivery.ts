// サーバー専用の配信方針。URL/query/クライアントから切り替えない。
export interface LegalDeliveryEnvironment {
  nodeEnv?: string;
  vercelEnv?: string;
  publicationMode?: string;
}

export function legalDeliveryEnvironment(): LegalDeliveryEnvironment {
  return {
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    publicationMode: process.env.LEGAL_PUBLICATION_MODE,
  };
}

export function isLegalPreview(environment: LegalDeliveryEnvironment): boolean {
  return (
    environment.vercelEnv === 'preview' ||
    (environment.vercelEnv === undefined &&
      (environment.nodeEnv === 'development' || environment.nodeEnv === 'test'))
  );
}

/** 未設定・不明環境はProduction相当。承認済みフラグだけで配信しない。 */
export function decideLegalDelivery(
  approved: boolean,
  environment: LegalDeliveryEnvironment
): 'preview' | 'hold' | 'published' {
  if (isLegalPreview(environment)) return 'preview';
  return environment.vercelEnv === 'production' &&
    environment.publicationMode === 'approved' &&
    approved
    ? 'published'
    : 'hold';
}

/** 正式配信を選ぶビルドのみ、公開前チェックを必須化する。 */
export function requiresLegalReleaseCheck(
  environment: LegalDeliveryEnvironment
): boolean {
  return (
    !isLegalPreview(environment) && environment.publicationMode === 'approved'
  );
}
