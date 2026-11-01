import Link from 'next/link';

interface LegalFooterLinksProps {
  className?: string;
  product?: 'works';
}

export function LegalFooterLinks({
  className,
  product,
}: LegalFooterLinksProps) {
  const prefix = product === 'works' ? '/works' : '';
  return (
    <div className={className}>
      <Link href={`${prefix}/terms`} className='hover:underline'>
        利用規約
      </Link>
      <span aria-hidden='true'> | </span>
      <Link href={`${prefix}/privacy`} className='hover:underline'>
        プライバシーポリシー
      </Link>
      {product === 'works' ? (
        <>
          <span aria-hidden='true'> | </span>
          <Link href='/works/plugin' className='hover:underline'>
            Worksについて
          </Link>
          <span aria-hidden='true'> | </span>
          <Link
            href='/contact?product=works&intent=support'
            prefetch={false}
            className='hover:underline'
          >
            お問い合わせ
          </Link>
          <span aria-hidden='true'> | </span>
          <Link href='/works/privacy#operator' className='hover:underline'>
            運営者情報
          </Link>
        </>
      ) : null}
    </div>
  );
}
