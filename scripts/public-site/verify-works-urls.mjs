// GETのみ。フォーム送信・OAuth・Provider操作を行わず、HTTP 200だけで合格にしない。
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { parse } = require('node-html-parser');

// 本人が2026-11-05に指定した申請metadataと同じ4URLを検査する。
// 専用 /works/privacy 等の検査で、共通法務URLの公開確認を代用しない。
export const submissionPages = [
  { field: 'websiteURL', route: '/works', kind: 'website', document: null },
  { field: 'supportURL', route: '/contact', kind: 'support', document: null },
  {
    field: 'privacyPolicyURL',
    route: '/privacy',
    kind: 'legal',
    document: 'privacy',
  },
  {
    field: 'termsOfServiceURL',
    route: '/terms',
    kind: 'legal',
    document: 'terms',
  },
];

const requiredLegalSections = {
  privacy: ['common', 'os', 'works', 'requests', 'retention'],
  terms: ['common', 'os', 'works', 'data-rights', 'liability'],
};

export function inspectWorksPage(
  html,
  document,
  kind = document ? 'legal' : 'support'
) {
  const dom = parse(html);
  // script/RSC内の文字列を、利用者が読める本文として数えない。
  for (const node of dom.querySelectorAll(
    'script, style, template, [hidden], [aria-hidden="true"]'
  ))
    node.remove();
  const main = dom.querySelector('main');
  const body = main?.textContent ?? '';
  const robots =
    dom.querySelector('meta[name="robots"]')?.getAttribute('content') ?? '';
  const marker = document
    ? main?.querySelector(`[data-legal-document="${document}"]`)
    : undefined;
  const links = dom
    .querySelectorAll('a')
    .map(a => a.getAttribute('href') ?? '');
  if (!body.includes('Tiramisu Works') || /noindex/i.test(robots)) return false;
  if (kind === 'legal') {
    const sections = requiredLegalSections[document];
    if (!sections) return false;
    return (
      marker?.getAttribute('data-legal-publication') === 'published' &&
      links.includes('/privacy') &&
      links.includes('/terms') &&
      sections.every(id => {
        const section = marker.querySelector(`section#${id}`);
        return (
          Boolean(section?.querySelector('h2')?.textContent.trim()) &&
          section
            .querySelectorAll('p, li')
            .some(node => node.textContent.trim())
        );
      }) &&
      !/UNKNOWN|OWNER_ACTION_REQUIRED|確認用原稿|確定後に掲載|公開承認待ち|正式公開.*保留|正式公開の承認後に掲載|未確定/.test(
        body
      )
    );
  }
  if (kind === 'website')
    return (
      Boolean(main?.querySelector('h1')?.textContent.trim()) &&
      Boolean(
        main?.querySelector('#how-it-works ol li h3 + p')?.textContent.trim()
      ) &&
      links.some(link => link === '/contact' || link.startsWith('/contact?')) &&
      links.includes('/privacy') &&
      links.includes('/terms')
    );
  if (kind !== 'support') return false;
  return (
    body.includes('サポート') &&
    links.some(
      link =>
        /^https:\/\/(docs\.google\.com\/forms\/|forms\.gle\/)/.test(link) ||
        /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(link)
    ) &&
    !/受信.*未確認|運用確認.*未完了/.test(body)
  );
}

export async function verifyWorksUrls(origin, fetchPage = fetch) {
  return Promise.all(
    submissionPages.map(async ({ field, route, document, kind }) => {
      try {
        const url = new URL(route, origin);
        const response = await fetchPage(url, {
          redirect: 'follow',
          signal: AbortSignal.timeout(20_000),
        });
        const finalUrl = new URL(response.url);
        const correctDestination =
          finalUrl.origin === url.origin &&
          finalUrl.pathname === url.pathname &&
          finalUrl.search === '';
        const html = await response.text();
        return {
          field,
          route,
          status: response.status,
          passed:
            response.ok &&
            correctDestination &&
            (response.headers.get('content-type') ?? '').includes(
              'text/html'
            ) &&
            inspectWorksPage(html, document, kind),
        };
      } catch {
        return { field, route, status: null, passed: false };
      }
    })
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  require('ts-node').register({
    transpileOnly: true,
    compilerOptions: { module: 'CommonJS', moduleResolution: 'Node' },
  });
  const {
    publicSiteOrigin,
    publishableValue,
    isProductionOrigin,
    getLegalPublication,
  } = require('../../src/components/public/release-readiness.ts');
  const index = process.argv.indexOf('--origin');
  const approvedOrigin = publishableValue(publicSiteOrigin);
  const origin = index === -1 ? approvedOrigin : process.argv[index + 1];
  if (!origin || !isProductionOrigin(origin)) {
    console.log(
      'PUBLIC_URL: BLOCKED（正式origin未設定、または候補origin不正）'
    );
    process.exitCode = 1;
  } else {
    const results = await verifyWorksUrls(origin);
    for (const result of results) console.log(JSON.stringify(result));
    const ownerReady = ['privacy', 'terms'].every(
      id => getLegalPublication(id).approved
    );
    const passed =
      results.every(result => result.passed) &&
      origin === approvedOrigin &&
      ownerReady;
    console.log(
      passed
        ? 'PUBLIC_URL: PASS（提出受理とは別）'
        : 'PUBLIC_URL: BLOCKED（候補応答と正式承認は別）'
    );
    process.exitCode = passed ? 0 : 1;
  }
}
