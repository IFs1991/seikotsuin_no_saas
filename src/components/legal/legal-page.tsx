import React from 'react';
import { LegalFooterLinks } from '@/components/legal/legal-footer-links';

interface LegalPageSection {
  title: string;
  body: React.ReactNode;
}

interface LegalPageProps {
  title: string;
  updatedAt: string;
  sections: LegalPageSection[];
}

export function LegalPage({ title, updatedAt, sections }: LegalPageProps) {
  return (
    <div className='min-h-screen bg-slate-50'>
      <div className='mx-auto max-w-4xl px-6 py-12'>
        <div className='rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200'>
          <div className='border-b border-slate-200 pb-6'>
            <h1 className='text-3xl font-bold text-slate-900'>{title}</h1>
            <p className='mt-2 text-sm text-slate-500'>
              最終更新日: {updatedAt}
            </p>
          </div>

          <aside
            className='mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950'
            aria-label='法務確認状況'
          >
            <p className='font-semibold'>商用利用前の法務確認が必要です</p>
            <p className='mt-1'>
              本文は限定パイロット向けの暫定案です。事業者情報、問い合わせ窓口、
              委託先・保管条件・保存期間・開示等の手順を確定し、専門家レビューを完了するまで、
              正式な契約条件や法令適合、第三者認証の取得を示すものではありません。
            </p>
          </aside>

          <div className='mt-8 space-y-8 text-sm leading-7 text-slate-700'>
            {sections.map(section => (
              <section key={section.title}>
                <h2 className='text-xl font-semibold text-slate-900'>
                  {section.title}
                </h2>
                <div className='mt-3 space-y-3'>{section.body}</div>
              </section>
            ))}
          </div>

          <div className='mt-10 border-t border-slate-200 pt-6 text-sm text-slate-600'>
            <LegalFooterLinks />
          </div>
        </div>
      </div>
    </div>
  );
}
