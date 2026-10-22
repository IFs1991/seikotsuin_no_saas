import Image from 'next/image';
import Link from 'next/link';
import { worksNavItems } from '@/components/public/works-content';
import { CtaAnchor, consultCta } from '@/components/public/works/works-shared';
import worksLogo from '@/images/brand/tiramisu-works-logo.png';

export function WorksHeader() {
  return (
    <header className='sticky top-0 z-50 border-b border-white/10 bg-[#26363B]/95 text-white backdrop-blur'>
      <div className='mx-auto flex min-h-[68px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8'>
        <Link href='/works' className='flex min-w-0 items-center'>
          <Image
            src={worksLogo}
            alt='Tiramisu Works'
            width={240}
            height={77}
            priority
            className='h-11 w-auto object-contain sm:h-12'
          />
        </Link>
        <nav className='hidden items-center gap-5 text-[13px] text-white/65 xl:flex'>
          {worksNavItems.map(item => (
            <a
              key={item.href}
              href={item.href}
              className='transition-colors hover:text-white'
            >
              {item.label}
            </a>
          ))}
          <Link href='/' className='transition-colors hover:text-white'>
            Tiramisu本体
          </Link>
        </nav>
        <CtaAnchor
          cta={consultCta}
          variant='copper'
          className='min-h-10 shrink-0 px-4 py-2 text-[13px]'
        />
      </div>
    </header>
  );
}

export function WorksFooter() {
  return (
    <footer className='border-t border-white/10 bg-[#172428] py-8 text-white/45'>
      <div className='mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 px-4 text-center sm:px-6 md:flex-row md:text-left lg:px-8'>
        <div className='flex items-center gap-4'>
          <Image
            src={worksLogo}
            alt='Tiramisu Works'
            width={190}
            height={61}
            className='h-9 w-auto object-contain opacity-80'
          />
          <span className='hidden h-6 w-px bg-white/10 sm:block' />
          <span className='hidden font-mono text-[9px] uppercase tracking-[0.16em] sm:block'>
            AI workflow implementation
          </span>
        </div>
        <div className='flex flex-wrap justify-center gap-x-5 gap-y-2 text-[11px]'>
          <Link href='/' className='transition-colors hover:text-white'>
            Tiramisu OS
          </Link>
          <Link href='/privacy' className='transition-colors hover:text-white'>
            プライバシー
          </Link>
          <Link href='/terms' className='transition-colors hover:text-white'>
            利用規約
          </Link>
          <span>© 2026 Tiramisu</span>
        </div>
      </div>
    </footer>
  );
}
