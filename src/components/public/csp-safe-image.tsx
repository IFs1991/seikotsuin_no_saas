'use client';

import Image, { type ImageProps } from 'next/image';
import type { CSSProperties } from 'react';

// next/image は既定で style="color:transparent"（fill のときは配置も）を付けるため、
// 厳格CSP（style-src に unsafe-inline なし）で違反になる。サーバーコンポーネントから
// style={{ color: undefined }} を渡しても RSC のシリアライズで undefined が落ちて効かないため、
// client境界の中で打ち消す。fill の配置は className（absolute inset-0 h-full w-full 等）で指定する。
const CSP_SAFE_IMAGE_STYLE: CSSProperties = {
  position: undefined,
  height: undefined,
  width: undefined,
  left: undefined,
  top: undefined,
  right: undefined,
  bottom: undefined,
  color: undefined,
};

export function CspSafeImage({ alt, ...props }: Omit<ImageProps, 'style'>) {
  return <Image alt={alt} {...props} style={CSP_SAFE_IMAGE_STYLE} />;
}
