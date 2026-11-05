import tiramisuWordmark from '@/images/brand/tiramisu-wordmark.png';
import tiramisuWorks from '@/images/brand/tiramisu-works-v2.png';
import tiramisuOs from '@/images/brand/tiramisu-os.png';
import { cn } from '@/lib/utils';
import { CspSafeImage } from './csp-safe-image';

const logos = {
  tiramisu: { src: tiramisuWordmark, alt: 'Tiramisu' },
  works: { src: tiramisuWorks, alt: 'Tiramisu Works' },
  os: { src: tiramisuOs, alt: 'Tiramisu OS' },
} as const;

interface BrandLogoProps {
  product?: keyof typeof logos;
  className?: string;
  priority?: boolean;
}

// 公開サイトのブランド表示。本文・ナビの製品名は可読性のため文字で残す。
export function BrandLogo({
  product = 'tiramisu',
  className,
  priority = false,
}: BrandLogoProps) {
  const logo = logos[product];
  return (
    <CspSafeImage
      src={logo.src}
      alt={logo.alt}
      width={320}
      height={Math.round((320 * logo.src.height) / logo.src.width)}
      className={cn(
        'h-auto w-48 max-w-full shrink-0 object-contain',
        className
      )}
      priority={priority}
    />
  );
}
