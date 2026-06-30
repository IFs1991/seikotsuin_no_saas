'use client';

import Link from 'next/link';
import type { ComponentProps, MouseEventHandler } from 'react';

import { buildMobileUiuxDisplayModeCookie } from '@/lib/mobile-uiux/display-mode';
import type { MobileUiuxDisplayMode } from '@/lib/mobile-uiux/contracts';

type DisplayModeLinkProps = ComponentProps<typeof Link> & {
  mode: MobileUiuxDisplayMode;
};

export function DisplayModeLink({
  mode,
  onClick,
  ...props
}: DisplayModeLinkProps) {
  const handleClick: MouseEventHandler<HTMLAnchorElement> = event => {
    document.cookie = buildMobileUiuxDisplayModeCookie(mode);
    onClick?.(event);
  };

  return <Link {...props} onClick={handleClick} />;
}
