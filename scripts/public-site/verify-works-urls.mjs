// GETのみ。フォーム送信・OAuth・Provider操作を行わず、HTTP 200だけで合格にしない。
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { parse } = require('node-html-parser');

export function inspectWorksPage(html, document) {
  const dom = parse(html);
  const body = dom.querySelector('main')?.textContent ?? '';
  const robots =
    dom.querySelector('meta[name="robots"]')?.getAttribute('content') ?? '';
  const marker = document
    ? dom.querySelector(`[data-legal-document="${document}"]`)
    : undefined;
  const links = dom
    .querySelectorAll('a')
    .map(a => a.getAttribute('href') ?? '');
  if (!body.includes('Tiramisu Works') || /noindex/i.test(robots)) return false;
  if (document)
    return (
      marker?.getAttribute('data-legal-publication') === 'published' &&
      links.includes('/works/privacy') &&
      links.includes('/works/terms') &&
      !/UNKNOWN|OWNER_ACTION_REQUIRED|確認用原稿|確定後に掲載/.test(body)
    );
  return (
    body.includes('サポート') &&
    links.some(link =>
      /^https:\/\/(docs\.google\.com\/forms\/|forms\.gle\/)/.test(link)
    ) &&
    !/受信.*未確認|運用確認.*未完了/.test(body)
  );
}

export async function verifyWorksUrls(origin, fetchPage = fetch) {
  const paths = [
    ['websiteURL', '/works/plugin', 'works/plugin'],
    ['supportURL', '/contact?product=works&intent=support', null],
    ['privacyPolicyURL', '/works/privacy', 'works/privacy'],
    ['termsOfServiceURL', '/works/terms', 'works/terms'],
  ];
  return Promise.all(
    paths.map(async ([field, route, document]) => {
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
          (!document
            ? finalUrl.searchParams.get('product') === 'works' &&
              finalUrl.searchParams.get('intent') === 'support'
            : finalUrl.search === '');
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
            inspectWorksPage(html, document),
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
  } = require('../../src/components/public/release-readiness.ts');
  const {
    getWorksLegalPublication,
  } = require('../../src/components/public/works-release-readiness.ts');
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
    const ownerReady = ['works/privacy', 'works/terms', 'works/plugin'].every(
      id => getWorksLegalPublication(id).approved
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
