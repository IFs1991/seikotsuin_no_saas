import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectWorksPage, verifyWorksUrls } from './verify-works-urls.mjs';
const page = (document, state = 'published', text = '') =>
  `<main data-legal-document="${document}" data-legal-publication="${state}">Tiramisu Works ${text}<a href="/works/privacy">Privacy</a><a href="/works/terms">Terms</a></main>`;
test('公開済みの正しいWorks本文だけを合格にし、200のhold・旧OS・noindex・未確定値を拒否', () => {
  assert.equal(inspectWorksPage(page('works/privacy'), 'works/privacy'), true);
  for (const html of [
    page('works/privacy', 'hold'),
    page('privacy'),
    '<main>ログイン</main>',
    page('works/privacy') + '<meta name="robots" content="noindex">',
    page('works/privacy', 'published', 'UNKNOWN'),
    page('works/privacy', 'published', '確定後に掲載'),
  ])
    assert.equal(inspectWorksPage(html, 'works/privacy'), false);
});
test('問い合わせは実フォーム導線が必要。運用未確認は合格にしない', () => {
  const support =
    '<main>Tiramisu Works サポート<a href="https://docs.google.com/forms/d/e/synthetic/viewform">窓口</a></main>';
  assert.equal(inspectWorksPage(support, null), true);
  assert.equal(
    inspectWorksPage(
      support.replace('サポート', 'サポート 受信は未確認'),
      null
    ),
    false
  );
  assert.equal(
    inspectWorksPage('<main>Tiramisu Works サポート</main>', null),
    false
  );
});
test('実GETの最終URLと内容を検査し、認証リダイレクト・404・fetch失敗を拒否', async () => {
  const results = await verifyWorksUrls(
    'https://publisher.fictional-tiramisu-test.co.jp',
    async url => ({
      url: url.pathname.endsWith('privacy')
        ? 'https://publisher.fictional-tiramisu-test.co.jp/login'
        : url.toString(),
      status: url.pathname.endsWith('terms') ? 404 : 200,
      ok: !url.pathname.endsWith('terms'),
      headers: new Headers({ 'content-type': 'text/html' }),
      text: async () =>
        url.pathname === '/contact'
          ? '<main>Tiramisu Works サポート<a href="https://docs.google.com/forms/d/e/synthetic/viewform">窓口</a></main>'
          : page(url.pathname.slice(1)),
    })
  );
  assert.deepEqual(
    results.map(r => r.passed),
    [true, true, false, false]
  );
  const failures = await verifyWorksUrls(
    'https://publisher.fictional-tiramisu-test.co.jp',
    async () => {
      throw new Error('offline');
    }
  );
  assert.equal(
    failures.every(r => r.passed === false && r.status === null),
    true
  );
});
