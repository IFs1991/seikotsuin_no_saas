import React from 'react';
import { LegalFooterLinks } from '@/components/legal/legal-footer-links';
import Link from 'next/link';
import {
  decideLegalDelivery,
  legalDeliveryEnvironment,
} from '@/components/public/legal-delivery';
import {
  getLegalPublication,
  type LegalDocumentId,
} from '@/components/public/release-readiness';
import {
  getWorksLegalPublication,
  worksLegalDeliveryEnvironment,
} from '@/components/public/works-release-readiness';
import type { WorksLegalDocumentId } from '@/components/public/works-legal-approval-records';

interface LegalPageSection {
  /** 製品別の条件などへ直接リンクするためのアンカー（JavaScriptなしでも移動できる） */
  id?: string;
  title: string;
  body: React.ReactNode;
}

interface LegalPageProps {
  title: string;
  document: LegalDocumentId | WorksLegalDocumentId;
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

export function LegalPage({ title, document, sections }: LegalPageProps) {
  const anchoredSections = sections.filter(section => section.id);
  const worksDocument =
    document === 'works/privacy' ||
    document === 'works/terms' ||
    document === 'works/plugin';
  const publication = worksDocument
    ? getWorksLegalPublication(document)
    : getLegalPublication(document);
  const delivery = decideLegalDelivery(
    publication.approved,
    worksDocument ? worksLegalDeliveryEnvironment() : legalDeliveryEnvironment()
  );
  const published = delivery !== 'hold' && publication.approved;

  return (
    <div
      className='mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12'
      data-legal-document={document}
      data-legal-publication={delivery === 'published' ? 'published' : delivery}
    >
      <div className='rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8'>
        <div className='border-b border-slate-200 pb-6'>
          <h1 className='text-3xl font-bold text-slate-900'>{title}</h1>
          <p className='mt-2 text-sm text-slate-500'>
            {published && publication.approved
              ? `改定日: ${publication.revisedOn} ／ 施行日: ${publication.effectiveOn}`
              : '公開承認待ち（改定日・施行日は未確定）'}
          </p>
        </div>

        {!published ? (
          <aside
            className='mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950'
            aria-label='法務確認状況'
          >
            <p className='font-semibold'>
              {worksDocument
                ? 'Works文書の公開承認待ちです'
                : '商用利用前の法務確認が必要です'}
            </p>
            {delivery === 'hold' ? (
              <p className='mt-1'>
                法務文書の正式公開を保留しています。コードの配信・CIの成功は法務承認や公開許可を意味しません。未承認の本文はこの環境では配信しません。
              </p>
            ) : worksDocument ? (
              <p className='mt-1'>
                本文は確認用原稿です。実装確認と事業者の承認を分けて管理し、未確認の運用・保持条件を公開可能とは判定しません。
              </p>
            ) : (
              <p className='mt-1'>
                本文は暫定案です（Tiramisu
                OSは限定パイロット向け）。事業者情報、問い合わせ窓口、
                委託先・保管条件・保存期間・開示等の手順を確定し、専門家レビューを完了するまで、
                正式な契約条件や法令適合、第三者認証の取得を示すものではありません。
              </p>
            )}
          </aside>
        ) : null}

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
              <div className='mt-3 space-y-5'>
                {delivery !== 'hold' ? (
                  section.body
                ) : section.id === 'requests' ||
                  section.id === 'operator-disclosure' ? (
                  <>
                    <p>
                      {worksDocument
                        ? '本文の正式公開は保留中です。窓口運用は事業者から完了の申告があり、証跡を照合中です。'
                        : '本文の正式公開は保留中です。受付・返信の運用確認も完了していません。'}
                    </p>
                    <p>
                      <Link
                        href={
                          worksDocument
                            ? '/contact?product=works&intent=privacy'
                            : '/contact?intent=privacy'
                        }
                        prefetch={false}
                        className='underline underline-offset-4'
                      >
                        個人情報の取扱い・削除依頼
                      </Link>
                    </p>
                    <p>
                      <Link
                        href={
                          worksDocument
                            ? '/contact?product=works&intent=operator-disclosure'
                            : '/contact?intent=operator-disclosure'
                        }
                        prefetch={false}
                        className='underline underline-offset-4'
                      >
                        事業者情報の開示請求
                      </Link>
                    </p>
                  </>
                ) : (
                  <p>
                    この項目を含む文書本文は、正式公開の承認後に掲載します。
                  </p>
                )}
              </div>
            </section>
          ))}
        </div>

        <div className='mt-10 border-t border-slate-200 pt-6 text-sm text-slate-600'>
          <LegalFooterLinks product={worksDocument ? 'works' : undefined} />
        </div>
      </div>
    </div>
  );
}
