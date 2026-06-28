// 公開LPのCTAリンク解決ヘルパー。
//
// 外部フォーム（Googleフォーム等）のURLが設定されていればそこへ、
// 未設定なら既定のGoogleフォームへフォールバックする。
// URLを差し替える場合は NEXT_PUBLIC_LP_FORM_URL を設定するだけで全CTAが切り替わる。

const RAW_FORM_URL = (process.env.NEXT_PUBLIC_LP_FORM_URL ?? '').trim();
const DEFAULT_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSdDWLJGheg_Qgaxz7p2X45GumchuLIqabYjAmcBV-4h82HQag/viewform?usp=publish-editor';

export const LP_FORM_URL: string =
  RAW_FORM_URL.length > 0 ? RAW_FORM_URL : DEFAULT_FORM_URL;

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
    href: LP_FORM_URL,
    external: true,
  };
}
