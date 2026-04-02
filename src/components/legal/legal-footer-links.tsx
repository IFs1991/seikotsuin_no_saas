import Link from 'next/link';

interface LegalFooterLinksProps {
  className?: string;
}

export function LegalFooterLinks({ className }: LegalFooterLinksProps) {
  return (
    <div className={className}>
      <Link href='/terms' className='hover:underline'>
        利用規約
      </Link>
      <span aria-hidden='true'> | </span>
      <Link href='/privacy' className='hover:underline'>
        プライバシーポリシー
      </Link>
    </div>
  );
}
