import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalArticle, LegalPage } from '@/components/legal/legal-page';
import { MarketingFooter } from '@/components/public/marketing-footer';
import { MarketingHeader } from '@/components/public/marketing-header';
import '../lp-styles.css';

// 利用規約（暫定案）。共通事項と製品別の条件を見出し・アンカーで分ける。
// 条文の確定は事業者と専門家の確認後（公開前チェック B09）。未確定の条件は架空の内容で埋めない。

export const metadata: Metadata = {
  title: '利用規約 | Tiramisu',
  description:
    'Tiramisu OS・Tiramisu Worksの利用規約（暫定案）。共通事項と製品ごとの条件を分けて記載しています。',
  alternates: { canonical: '/terms' },
};

const linkClass = 'underline underline-offset-4 hover:text-slate-900';

export default function TermsPage() {
  return (
    <div className='lp-root lp-washi min-h-screen'>
      <MarketingHeader />
      <main id='main'>
        <LegalPage
          title='利用規約'
          updatedAt='2026-10-22'
          sections={[
            {
              id: 'scope',
              title: 'このページについて',
              body: (
                <p>
                  本ページは、Tiramisu OSおよびTiramisu
                  Works（以下総称して「本サービス」）の利用条件をまとめる暫定案です。共通事項と製品ごとの条件を分けて記載しています。製品ごとの条件は、該当する製品の項をご確認ください。
                </p>
              ),
            },
            {
              id: 'common',
              title: '共通事項',
              body: (
                <>
                  <LegalArticle title='1. 運営者'>
                    <p>
                      本サービスは、個人事業主（以下「当事業者」といいます）が運営します。事業者の氏名等は
                      <Link
                        href='/legal'
                        prefetch={false}
                        className={linkClass}
                      >
                        運営者情報・販売条件
                      </Link>
                      に掲載します。
                    </p>
                  </LegalArticle>
                  <LegalArticle title='2. 契約の成立・料金・契約期間'>
                    <p>
                      利用の申込みと契約成立の手続、料金、支払時期・方法、契約期間、更新・解約・返金の条件は、製品ごとに個別の契約で定めます。これらの条件は確定前であり、確定後に本規約へ反映します。
                    </p>
                  </LegalArticle>
                  <LegalArticle title='3. お問い合わせ'>
                    <p>
                      本サービスに関するお問い合わせは、
                      <Link
                        href='/contact'
                        prefetch={false}
                        className={linkClass}
                      >
                        お問い合わせページ
                      </Link>
                      で受け付けます。
                    </p>
                  </LegalArticle>
                </>
              ),
            },
            {
              id: 'os',
              title: 'Tiramisu OS（店舗・本部管理）の条件',
              body: (
                <>
                  <LegalArticle title='第1条 適用'>
                    <p>
                      本項は、整骨院管理SaaS（Tiramisu
                      OS）パイロット版の利用条件を定めるものです。利用者は、本サービスを利用した時点で本規約に同意したものとみなされます。
                    </p>
                    <p>
                      本サービスは限定パイロットとして提供され、正式版と比較して提供機能や運用条件が一部異なる場合があります。
                    </p>
                  </LegalArticle>
                  <LegalArticle title='第2条 利用範囲'>
                    <p>
                      利用者は、自己の所属する院または許可されたテナントの業務目的に限り、本サービスを利用できます。
                    </p>
                    <p>
                      利用者は、アカウント情報を適切に管理し、第三者への貸与、共有、譲渡を行ってはなりません。
                    </p>
                  </LegalArticle>
                  <LegalArticle title='第3条 禁止事項'>
                    <p>
                      利用者は、法令違反、不正アクセス、他院データへの不正なアクセス、サービス運営を妨げる行為を行ってはなりません。
                    </p>
                    <p>
                      医療情報、患者情報、スタッフ情報を取り扱うため、業務上知り得た情報を正当な権限なく持ち出すことを禁止します。
                    </p>
                  </LegalArticle>
                  <LegalArticle title='第4条 個人情報と医療情報の取扱い'>
                    <p>
                      個人情報と医療情報の取扱条件は、正式提供前に確定するプライバシーポリシー、契約および利用院との役割分担に従うものとします。
                    </p>
                    <p>
                      適用される法令・ガイドライン、必要な安全管理措置、保存条件については、事業者情報と運用体制を確定したうえで専門家確認を行います。
                    </p>
                  </LegalArticle>
                  <LegalArticle title='第5条 免責'>
                    <p>
                      当事業者は、パイロット提供期間中、継続的な品質改善に努めますが、障害や仕様変更が生じる可能性があります。
                    </p>
                    <p>
                      利用者は、重要な業務判断を行う際には、本サービス上の情報のみならず、自院の運用記録や原資料も確認するものとします。
                    </p>
                  </LegalArticle>
                </>
              ),
            },
            {
              id: 'works',
              title: 'Tiramisu Works（既存ツールを活かす業務支援）の条件',
              body: (
                <>
                  <p>
                    Tiramisu
                    Worksの利用条件は確定前です。提供開始前に本規約へ反映します。このサイトからは、導入相談のみを受け付けています。
                  </p>
                  <LegalArticle title='確定前の主な論点'>
                    <ul className='list-disc space-y-1 pl-5'>
                      <li>
                        外部サービス（ChatGPT・連携先サービス等）の利用条件と、必要なプラン・別料金の扱い
                      </li>
                      <li>承認と実行の範囲、利用者・権限者の責任</li>
                      <li>
                        外部サービスの障害時の扱い、結果の確認と再実行の扱い
                      </li>
                      <li>データ・成果物・第三者コンテンツの権利</li>
                    </ul>
                  </LegalArticle>
                </>
              ),
            },
            {
              id: 'pending',
              title: '商用提供前の未確定事項',
              body: (
                <p>
                  事業者の正式名称の公開用表記、問い合わせ窓口の運用、料金・支払条件、契約期間・更新・解約・返金の条件、サービス水準、データ返却・削除条件、準拠法・裁判管轄は未確定です。正式提供前に契約文書へ反映し、専門家レビューを完了する必要があります。
                </p>
              ),
            },
          ]}
        />
      </main>
      <MarketingFooter />
    </div>
  );
}
