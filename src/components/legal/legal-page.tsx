import React from 'react';
import { LegalFooterLinks } from '@/components/legal/legal-footer-links';

interface LegalPageSection {
  /** 製品別の条件などへ直接リンクするためのアンカー（JavaScriptなしでも移動できる） */
  id?: string;
  title: string;
  body: React.ReactNode;
}

interface LegalPageProps {
  title: string;
  updatedAt: string;
  sections: LegalPageSection[];
}

// 未確定・未承認の項目。架空の値で埋めず、確定前であることを明示する。
export function LegalPendingValue({
  children = '確定後に掲載します',
}: {
  children?: React.ReactNode;
}) {
  return <span className='text-slate-500'>{children}</span>;
}

export function LegalArticle({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className='space-y-3'>
      <h3 className='text-base font-semibold text-slate-900'>{title}</h3>
      {children}
    </div>
  );
}

export function LegalPage({ title, updatedAt, sections }: LegalPageProps) {
  const anchoredSections = sections.filter(section => section.id);

  return (
    <div className='mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12'>
      <div className='rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8'>
        <div className='border-b border-slate-200 pb-6'>
          <h1 className='text-3xl font-bold text-slate-900'>{title}</h1>
          <p className='mt-2 text-sm text-slate-500'>最終更新日: {updatedAt}</p>
        </div>

        <aside
          className='mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950'
          aria-label='法務確認状況'
        >
          <p className='font-semibold'>商用利用前の法務確認が必要です</p>
          <p className='mt-1'>
            本文は暫定案です（Tiramisu
            OSは限定パイロット向け）。事業者情報、問い合わせ窓口、
            委託先・保管条件・保存期間・開示等の手順を確定し、専門家レビューを完了するまで、
            正式な契約条件や法令適合、第三者認証の取得を示すものではありません。
          </p>
        </aside>

        {anchoredSections.length > 0 ? (
          <nav
            aria-label='このページの目次'
            className='mt-6 rounded-xl border border-slate-200 p-4 text-sm'
          >
            <p className='font-semibold text-slate-900'>目次</p>
            <ul className='mt-2 flex flex-col gap-1'>
              {anchoredSections.map(section => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className='inline-flex min-h-8 items-center text-slate-700 underline underline-offset-4 hover:text-slate-900'
                  >
                    {section.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        <div className='mt-8 space-y-10 text-sm leading-7 text-slate-700'>
          {sections.map(section => (
            <section key={section.title} id={section.id}>
              <h2 className='text-xl font-semibold text-slate-900'>
                {section.title}
              </h2>
              <div className='mt-3 space-y-5'>{section.body}</div>
            </section>
          ))}
        </div>

        <div className='mt-10 border-t border-slate-200 pt-6 text-sm text-slate-600'>
          <LegalFooterLinks />
        </div>
      </div>
    </div>
  );
}
