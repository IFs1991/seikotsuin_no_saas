// 公開サイト（Tiramisu共通サイト）の内部リンクと許可一覧。
//
// /contact の query はページ上の表示補助であり、契約・価格確定・権限の根拠には使わない。
// 外部フォームURLの解決は lp-links.ts に一本化している。

import type { CtaKind, CtaLink } from './lp-links';

export const CONTACT_PATH = '/contact';

export const CONTACT_PRODUCTS = ['works', 'os', 'both', 'undecided'] as const;
export const CONTACT_INTENTS = [
  'sales',
  'support',
  'privacy',
  'operator-disclosure',
] as const;
// Worksの料金カードから引き継ぐ希望分類。custom は個別見積もりの希望で、課金プランではない。
export const WORKS_PLAN_INTERESTS = [
  'light',
  'standard',
  'pro',
  'custom',
] as const;

export type ContactProduct = (typeof CONTACT_PRODUCTS)[number];
export type ContactIntent = (typeof CONTACT_INTENTS)[number];
export type WorksPlanInterest = (typeof WORKS_PLAN_INTERESTS)[number];

export interface ContactSelection {
  product: ContactProduct | null;
  intent: ContactIntent | null;
  plan: WorksPlanInterest | null;
}

export type ContactSearchParams = Record<string, string | string[] | undefined>;

function isOneOf<T extends string>(
  allowed: readonly T[],
  value: string
): value is T {
  return (allowed as readonly string[]).includes(value);
}

function pickAllowed<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[]
): T | null {
  // 重複指定（配列）はどれを採用するか曖昧なため、未知値と同じく未選択に戻す。
  if (typeof value !== 'string') return null;
  return isOneOf(allowed, value) ? value : null;
}

export function normalizeContactSelection(
  params: ContactSearchParams
): ContactSelection {
  const product = pickAllowed(params.product, CONTACT_PRODUCTS);
  const intent = pickAllowed(params.intent, CONTACT_INTENTS);
  // 希望プランは Works の導入相談のときだけ採用する。
  const plan =
    product === 'works' && intent === 'sales'
      ? pickAllowed(params.plan, WORKS_PLAN_INTERESTS)
      : null;
  return { product, intent, plan };
}

export interface ContactLinkInput {
  product?: ContactProduct;
  intent?: ContactIntent;
  plan?: WorksPlanInterest;
}

export function createContactHref(input: ContactLinkInput = {}): string {
  const query = new URLSearchParams();
  if (input.product) query.set('product', input.product);
  if (input.intent) query.set('intent', input.intent);
  if (input.plan && input.product === 'works' && input.intent === 'sales') {
    query.set('plan', input.plan);
  }
  const search = query.toString();
  return search ? `${CONTACT_PATH}?${search}` : CONTACT_PATH;
}

// 製品LPの相談CTA。外部フォームへ直接送らず、共通の問い合わせページを経由させる。
export function createContactCtaLink(
  label: string,
  kind: CtaKind,
  input: ContactLinkInput
): CtaLink {
  return { label, kind, href: createContactHref(input), external: false };
}

// 移設前のOS LP（/）に実在したセクションID。/#<id> だけを /os#<id> へ移す。
export const LEGACY_OS_ANCHOR_IDS = [
  'problems',
  'features',
  'ai',
  'roi',
  'pricing',
  'faq',
  'contact',
] as const;

// 遷移先は許可一覧のIDからだけ組み立て、任意のhashやURLは採用しない。
export function resolveLegacyOsAnchor(hash: string): string | null {
  if (!hash.startsWith('#')) return null;
  let id: string;
  try {
    id = decodeURIComponent(hash.slice(1));
  } catch {
    return null;
  }
  return isOneOf(LEGACY_OS_ANCHOR_IDS, id) ? `/os#${id}` : null;
}
