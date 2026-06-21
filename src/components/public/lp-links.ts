// 公開LPのCTAリンク解決ヘルパー。
//
// 外部フォーム（Googleフォーム等）のURLが設定されていればそこへ、
// 未設定なら同一ページ内の問い合わせセクション(#contact)へフォールバックする。
// URLが決まったら NEXT_PUBLIC_LP_FORM_URL を設定するだけで全CTAが切り替わる。

const RAW_FORM_URL = (process.env.NEXT_PUBLIC_LP_FORM_URL ?? '').trim();

export const LP_FORM_URL: string | null = RAW_FORM_URL.length > 0 ? RAW_FORM_URL : null;

export const CONTACT_ANCHOR = '#contact';

export type CtaKind = 'demo' | 'document' | 'contact';

export interface CtaLink {
  label: string;
  kind: CtaKind;
  href: string;
  external: boolean;
}

export function createCtaLink(label: string, kind: CtaKind): CtaLink {
  return {
    label,
    kind,
    href: LP_FORM_URL ?? CONTACT_ANCHOR,
    external: LP_FORM_URL !== null,
  };
}
