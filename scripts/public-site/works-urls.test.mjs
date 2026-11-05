import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectWorksPage, verifyWorksUrls } from './verify-works-urls.mjs';

const links = '<a href="/privacy">Privacy</a><a href="/terms">Terms</a>';
const sections = {
  privacy: ['common', 'os', 'works', 'requests', 'retention'],
  terms: ['common', 'os', 'works', 'data-rights', 'liability'],
};
const page = (document, state = 'published', text = '') =>
  `<main><article data-legal-document="${document}" data-legal-publication="${state}">
  <h1>Tiramisu Works ${document}</h1>${text}
  ${(sections[document] ?? []).map(id => `<section id="${id}"><h2>${id}</h2><p>利用条件とデータの取扱いについて説明します。</p></section>`).join('')}
  ${links}</article></main>`;
const website = `<main><h1>Tiramisu Works</h1><section id="how-it-works"><p>How it works</p><ol><li><h3>依頼</h3><p>接続済みのツールで業務を支援します。</p></li></ol></section><a href="/contact">お問い合わせ</a>${links}</main>`;
const support =
  '<main>Tiramisu Works サポート<a href="https://docs.google.com/forms/d/e/synthetic/viewform">窓口</a></main>';
const origin = 'https://publisher.fictional-tiramisu-test.co.jp';

test('共通法務の公開済み本文だけを合格にし、hold・別文書・noindex・未確定値を拒否', () => {
  for (const document of ['privacy', 'terms'])
    assert.equal(inspectWorksPage(page(document), document), true);
  for (const html of [
    page('privacy', 'hold'),
    page('privacy', 'preview'),
    page('works/privacy'),
    page('terms'),
    '<main>ログイン</main>',
    page('privacy') + '<meta name="robots" content="noindex">',
    ...[
      'UNKNOWN',
      'OWNER_ACTION_REQUIRED',
      '確定後に掲載',
      '公開承認待ち',
      'この項目を含む文書本文は、正式公開の承認後に掲載します。',
      '法務文書の正式公開は保留中です。',
      '保存期間は未確定です。',
    ].map(text => page('privacy', 'published', text)),
  ])
    assert.equal(inspectWorksPage(html, 'privacy'), false);
});

test('published属性だけの空ページ・見出しだけ・RSC内だけの本文を拒否', () => {
  for (const html of [
    `<main><article data-legal-document="privacy" data-legal-publication="published">Tiramisu Works ${links}</article></main>`,
    page('privacy').replaceAll(/<p>.*?<\/p>/g, ''),
    page('privacy').replaceAll(/<p>(.*?)<\/p>/g, '<script>$1</script>'),
    page('privacy').replace('id="retention"', 'id="other"'),
    page('privacy').replace('<article ', '<article hidden '),
    page('privacy').replace('<article ', '<article aria-hidden="true" '),
    page('privacy').replace('/privacy', '/works/privacy'),
  ])
    assert.equal(inspectWorksPage(html, 'privacy'), false);
});

test('製品サイトは法務ページと別に説明・問い合わせ・共通法務リンクを確認', () => {
  assert.equal(inspectWorksPage(website, null, 'website'), true);
  for (const html of [
    support,
    '<main><h1>Tiramisu Works</h1></main>',
    website.replace('id="how-it-works"', 'id="other"'),
    website.replace(/<ol>.*?<\/ol>/, ''),
    website.replace('/terms', '/works/terms'),
    website + '<meta name="robots" content="noindex">',
  ])
    assert.equal(inspectWorksPage(html, null, 'website'), false);
});

test('問い合わせはフォームまたはメール導線が必要。運用未確認は合格にしない', () => {
  assert.equal(inspectWorksPage(support, null), true);
  assert.equal(
    inspectWorksPage(
      '<main>Tiramisu Works サポート<a href="mailto:help@fictional-tiramisu-test.co.jp">メール</a></main>',
      null
    ),
    true
  );
  for (const html of [
    '<main>Tiramisu Works サポート<a href="mailto:invalid">メール</a></main>',
    support.replace('サポート', 'サポート 受信は未確認'),
    '<main>Tiramisu Works サポート</main>',
  ])
    assert.equal(inspectWorksPage(html, null), false);
});

function responseFor(url, overrides = {}) {
  return {
    url: url.toString(),
    status: 200,
    ok: true,
    headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
    text: async () =>
      url.pathname === '/works'
        ? website
        : url.pathname === '/contact'
          ? support
          : page(url.pathname.slice(1)),
    ...overrides,
  };
}

test('本人指定の4URLそのものをGETし、旧専用URLやquery付き窓口で代用しない', async () => {
  const visited = [];
  const results = await verifyWorksUrls(origin, async url => {
    visited.push(url.toString());
    return responseFor(url);
  });
  assert.deepEqual(
    visited,
    ['/works', '/contact', '/privacy', '/terms'].map(path => origin + path)
  );
  assert.deepEqual(
    results.map(({ field, route }) => ({ field, route })),
    [
      { field: 'websiteURL', route: '/works' },
      { field: 'supportURL', route: '/contact' },
      { field: 'privacyPolicyURL', route: '/privacy' },
      { field: 'termsOfServiceURL', route: '/terms' },
    ]
  );
  assert.equal(
    results.every(r => r.passed),
    true
  );
});

test('最終URLの変更・非HTML・404・fetch失敗を拒否する', async () => {
  for (const overrides of [
    { url: origin + '/login' },
    { url: 'https://other.fictional-tiramisu-test.co.jp/privacy' },
    { url: origin + '/privacy?draft=true' },
    { headers: new Headers({ 'content-type': 'application/json' }) },
    { status: 404, ok: false },
  ]) {
    const results = await verifyWorksUrls(origin, async url =>
      responseFor(url, url.pathname === '/privacy' ? overrides : {})
    );
    assert.deepEqual(
      results.map(r => r.passed),
      [true, true, false, true]
    );
  }
  const failures = await verifyWorksUrls(origin, async () => {
    throw new Error('offline');
  });
  assert.equal(
    failures.every(r => r.passed === false && r.status === null),
    true
  );
});
