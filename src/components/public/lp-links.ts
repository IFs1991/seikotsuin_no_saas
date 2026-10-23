// 公開LPのCTAリンク解決ヘルパー。
//
// 外部フォーム（Googleフォーム等）のURLが設定されていればそこへ、
// 未設定なら既定のGoogleフォームへフォールバックする。
// URLを差し替える場合は NEXT_PUBLIC_LP_FORM_URL を設定するだけで全CTAが切り替わる。

const DEFAULT_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSdDWLJGheg_Qgaxz7p2X45GumchuLIqabYjAmcBV-4h82HQag/viewform?usp=publish-editor';

// 空白だけの値は未設定として扱う（LP_FORM_URL と resolveLpFormLink で共用する優先順位）。
function selectConfiguredFormUrl(rawValue: string | undefined): string | null {
  const trimmed = (rawValue ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

export const LP_FORM_URL: string =
  selectConfiguredFormUrl(process.env.NEXT_PUBLIC_LP_FORM_URL) ??
  DEFAULT_FORM_URL;

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

export type LpFormLinkResolution =
  | { status: 'ready'; href: string; source: 'env' | 'default' }
  | { status: 'invalid'; source: 'env' };

// 外部フォームとして開いてよいURLか。https以外（javascript: 等）や資格情報付きURLは採用しない。
export function isSafeExternalFormUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    url.hostname.length > 0 &&
    url.username === '' &&
    url.password === ''
  );
}

// 問い合わせページ用のフォームリンク解決。優先順位は LP_FORM_URL と同じで、
// 設定値が不正な場合は既定URLへ黙って戻さず invalid を返す（危険なリンクを表示しないため）。
export function resolveLpFormLink(
  rawValue: string | undefined = process.env.NEXT_PUBLIC_LP_FORM_URL
): LpFormLinkResolution {
  const configured = selectConfiguredFormUrl(rawValue);
  if (configured === null) {
    return { status: 'ready', href: DEFAULT_FORM_URL, source: 'default' };
  }
  return isSafeExternalFormUrl(configured)
    ? { status: 'ready', href: configured, source: 'env' }
    : { status: 'invalid', source: 'env' };
}
