import type { Metadata } from 'next';
import {
  publicSiteOrigin,
  publishableValue,
  isProductionOrigin,
} from '../public/release-readiness';
import { decideLegalDelivery } from '../public/legal-delivery';
import {
  getWorksLegalPublication,
  worksLegalDeliveryEnvironment,
} from '../public/works-release-readiness';
import type { WorksLegalDocumentId } from '../public/works-legal-approval-records';
import { LegalPage } from './legal-page';

export function worksDocumentMetadata(
  document: WorksLegalDocumentId,
  title: string
): Metadata {
  const published =
    decideLegalDelivery(
      getWorksLegalPublication(document).approved,
      worksLegalDeliveryEnvironment()
    ) === 'published';
  const origin = publishableValue(publicSiteOrigin);
  return {
    ...(origin !== null && isProductionOrigin(origin)
      ? { metadataBase: new URL(origin) }
      : {}),
    title: `${title} | Tiramisu Works`,
    description: published
      ? `Tiramisu Worksの${title}。`
      : 'Works文書の正式公開は保留中です（公開承認待ち）。',
    alternates: { canonical: `/${document}` },
    robots: { index: published, follow: published },
  };
}

export function WorksDocument(props: React.ComponentProps<typeof LegalPage>) {
  return (
    <div className='lp-root lp-washi min-h-screen'>
      <main id='main'>
        <LegalPage {...props} />
      </main>
    </div>
  );
}
