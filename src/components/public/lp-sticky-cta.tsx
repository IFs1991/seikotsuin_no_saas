'use client';

import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { createCtaLink } from './lp-links';

const demoCta = createCtaLink('デモ相談をする', 'demo');

// スクロールが一定量を超えたら下部に出るスティッキーCTA。
export function LpStickyCta() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        setVisible(window.scrollY > 600);
        ticking = false;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-50 border-t border-[#E8E4DE] bg-white/95 px-4 py-3 shadow-[0_-4px_20px_rgba(43,58,63,0.06)] backdrop-blur-md transition-transform duration-500 md:px-6 ${
        visible ? 'translate-y-0' : 'translate-y-full'
      }`}
      aria-hidden={!visible}
    >
      <div className='mx-auto flex max-w-6xl items-center justify-between gap-3'>
        <div className='flex flex-col'>
          <p className='text-[13px] font-bold text-[#1A1A1A]'>
            5店舗以上の整骨院グループ向け 本部管理OS
          </p>
          <p className='hidden text-[11px] text-[#595959] sm:block'>
            店舗数と現在の管理方法をもとに、デモ相談で確認します
          </p>
        </div>
        <a
          href={demoCta.href}
          target={demoCta.external ? '_blank' : undefined}
          rel={demoCta.external ? 'noreferrer' : undefined}
          tabIndex={visible ? 0 : -1}
          className='inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-[8px] bg-[#2B3A3F] px-5 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-[#1f292d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4956C] focus-visible:ring-offset-2 md:text-[14px]'
        >
          {demoCta.label}
          <ArrowRight className='h-4 w-4' aria-hidden='true' />
        </a>
      </div>
    </div>
  );
}
