export const GOOGLE_FORM_URL: string | null = null;

export const contactAnchor = '#contact';

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
    href: GOOGLE_FORM_URL ?? contactAnchor,
    external: GOOGLE_FORM_URL !== null,
  };
}
