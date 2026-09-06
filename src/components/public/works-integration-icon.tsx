import Image from 'next/image';
import { cn } from '@/lib/utils';
import type { WorksIntegrationName } from '@/components/public/works-content';

const integrationMeta: Record<
  WorksIntegrationName,
  { src: string; alt: string }
> = {
  line: { src: '/images/works/integrations/line.png', alt: 'LINE' },
  booking: {
    src: '/images/works/integrations/booking.png',
    alt: '予約・カレンダー',
  },
  instagram: {
    src: '/images/works/integrations/instagram.png',
    alt: 'Instagram',
  },
  google: { src: '/images/works/integrations/google.png', alt: 'Google' },
  slack: { src: '/images/works/integrations/slack.png', alt: 'Slack' },
  chatgpt: {
    src: '/images/works/integrations/chatgpt.png',
    alt: 'ChatGPT',
  },
};

export function WorksIntegrationIcon({
  name,
  size = 38,
  className,
  decorative = false,
}: {
  name: WorksIntegrationName;
  size?: number;
  className?: string;
  decorative?: boolean;
}) {
  const meta = integrationMeta[name];
  return (
    <Image
      src={meta.src}
      alt={decorative ? '' : meta.alt}
      width={size}
      height={size}
      sizes={`${size}px`}
      className={cn('shrink-0 object-contain', className)}
      aria-hidden={decorative ? true : undefined}
    />
  );
}
