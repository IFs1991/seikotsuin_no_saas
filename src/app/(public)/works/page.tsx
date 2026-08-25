import type { Metadata } from 'next';
import { WorksBottomSections } from '@/components/public/works/works-bottom-sections';
import { WorksFooter, WorksHeader } from '@/components/public/works/works-layout';
import { WorksTopSections } from '@/components/public/works/works-top-sections';
import './works-styles.css';

export const metadata: Metadata = {
  title: 'Tiramisu Works | 今ある業務を、AIでつなぐ',
  description:
    '1〜3店舗のサロン・治療院・小規模事業者向け。LINE、予約、Google、SNSなど既存ツールを活かし、AIと承認フローで毎日回る業務へ変える導入支援です。',
};

export default function TiramisuWorksLandingPage() {
  return (
    <div className='works-root works-paper min-h-screen'>
      <WorksHeader />
      <main>
        <WorksTopSections />
        <WorksBottomSections />
      </main>
      <WorksFooter />
    </div>
  );
}
