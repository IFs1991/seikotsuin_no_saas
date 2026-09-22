import { LP_FORM_URL } from '@/components/public/lp-links';

const rawWorksFormUrl = (process.env.NEXT_PUBLIC_WORKS_FORM_URL ?? '').trim();

export const WORKS_FORM_URL =
  rawWorksFormUrl.length > 0 ? rawWorksFormUrl : LP_FORM_URL;

export interface WorksCtaLink {
  label: string;
  href: string;
  external: boolean;
}

export function createWorksCta(label: string): WorksCtaLink {
  return {
    label,
    href: WORKS_FORM_URL,
    external: true,
  };
}
