import React from 'react';
import Link from 'next/link';
import { createContactHref } from '@/components/public/marketing-links';
import {
  publishableValue,
  operatorProfile,
  isPublishableEmail,
  type OperatorProfile,
} from '@/components/public/release-readiness';

// 運営者情報の一覧。公開承認済み（approved_for_publication）の値だけを表示し、未承認・未入力の項目は
// 架空の値で埋めず「確定後に掲載します」と表示する（値が入っていても承認前は描画しない）。
// 所在地・電話番号の実値は扱わず、請求時に個別に提供する方針と窓口だけを表示する。
// 任意のprofileを受け取らず、正式公開判定と同じSSOTだけを読む。
export function OperatorProfileValue({
  field,
}: {
  field: keyof OperatorProfile;
}) {
  const value = publishableValue(operatorProfile[field]);
  return value !== null &&
    (field !== 'publicEmail' || isPublishableEmail(value)) ? (
    <>{value}</>
  ) : (
    <span className='text-slate-500'>確定後に掲載します</span>
  );
}

export function OperatorProfileList() {
  const disclosureHref = createContactHref({ intent: 'operator-disclosure' });
  const rows: Array<{ label: string; value: React.ReactNode }> = [
    {
      label: '事業者の区分',
      value: <OperatorProfileValue field='businessType' />,
    },
    {
      label: '事業者の氏名',
      value: <OperatorProfileValue field='name' />,
    },
    { label: 'サービス名', value: 'Tiramisu Works／Tiramisu OS' },
    {
      label: 'ブランド',
      value: <OperatorProfileValue field='brand' />,
    },
    {
      label: '所在地',
      value: (
        <>
          ご請求に応じてお知らせします（
          <Link
            href={disclosureHref}
            prefetch={false}
            className='underline underline-offset-4 hover:text-slate-900'
          >
            事業者情報の開示請求
          </Link>
          ）
        </>
      ),
    },
    {
      label: '電話番号',
      value: 'ご請求に応じてお知らせします（所在地と同じ窓口）',
    },
    {
      label: 'お問い合わせ',
      value: (
        <Link
          href='/contact'
          prefetch={false}
          className='underline underline-offset-4 hover:text-slate-900'
        >
          お問い合わせページ（Googleフォーム）
        </Link>
      ),
    },
    {
      label: 'メールアドレス',
      value: <OperatorProfileValue field='publicEmail' />,
    },
  ];

  return (
    <dl className='divide-y divide-slate-200 rounded-xl border border-slate-200'>
      {rows.map(row => (
        <div
          key={row.label}
          className='grid gap-1 p-4 sm:grid-cols-[10rem_1fr]'
        >
          <dt className='font-semibold text-slate-900'>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
