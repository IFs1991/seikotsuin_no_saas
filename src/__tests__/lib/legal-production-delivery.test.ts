import { spawnSync } from 'node:child_process';
import {
  decideLegalDelivery,
  requiresLegalReleaseCheck,
} from '@/components/public/legal-delivery';
import { LegalPage } from '@/components/legal/legal-page';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Productionと法務正式配信の分離', () => {
  it('Nextと同じ本番env優先順位でファイル由来approvedにも事前チェックを要求する', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'legal-build-env-'));
    // repoの設定や実値を読まない。破棄はfixtureの既知ファイルのみ。
    const envFile = path.join(dir, '.env.production');
    fs.writeFileSync(envFile, 'LEGAL_PUBLICATION_MODE=approved\n');
    try {
      const script =
        "import { planLegalBuild } from './scripts/public-site/build-for-vercel.mjs'; const plan = planLegalBuild(process.argv[1]); process.stdout.write(JSON.stringify(plan));";
      const invoke = (mode?: string) =>
        spawnSync(
          process.execPath,
          ['--input-type=module', '-e', script, dir],
          {
            env: {
              PATH: process.env.PATH ?? '',
              NODE_ENV: 'production',
              VERCEL_ENV: 'production',
              ...(mode ? { LEGAL_PUBLICATION_MODE: mode } : {}),
            },
            encoding: 'utf8',
            timeout: 60_000,
          }
        );
      const fromFile = invoke();
      expect(fromFile.status).toBe(0);
      expect(JSON.parse(fromFile.stdout)).toMatchObject({
        checkRequired: true,
        environment: { publicationMode: 'approved' },
      });
      expect(JSON.parse(invoke('hold').stdout)).toMatchObject({
        checkRequired: false,
        environment: { publicationMode: 'hold' },
      });
    } finally {
      fs.unlinkSync(envFile);
      fs.rmdirSync(dir);
    }
  });
  it.each([
    {},
    { nodeEnv: 'production' },
    { nodeEnv: 'production', vercelEnv: 'unknown' },
    { vercelEnv: 'production' },
    { vercelEnv: 'production', publicationMode: 'hold' },
    { vercelEnv: 'production', publicationMode: 'typo' },
  ])('未設定・未知環境は承認済みでもhold: %j', env => {
    expect(decideLegalDelivery(true, env)).toBe('hold');
  });
  it('Productionでは明示設定と承認の両方が必要', () => {
    const env = { vercelEnv: 'production', publicationMode: 'approved' };
    expect(decideLegalDelivery(false, env)).toBe('hold');
    expect(decideLegalDelivery(true, env)).toBe('published');
    expect(requiresLegalReleaseCheck(env)).toBe(true);
  });
  it('Preview・開発は原稿確認可能、release-checkは正式配信だけ', () => {
    for (const env of [
      { vercelEnv: 'preview', publicationMode: 'approved' },
      { nodeEnv: 'development' },
      { nodeEnv: 'test' },
    ]) {
      expect(decideLegalDelivery(false, env)).toBe('preview');
      expect(requiresLegalReleaseCheck(env)).toBe(false);
    }
    expect(requiresLegalReleaseCheck({ vercelEnv: 'production' })).toBe(false);
  });
  it('Production SSRは原稿のpropsをHTMLへ出さず既存アンカーを保持', () => {
    const previous = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = 'production';
    try {
      const html = renderToStaticMarkup(
        createElement(LegalPage, {
          title: '法務試験',
          document: 'privacy',
          sections: [
            {
              id: 'common',
              title: '共通事項',
              body: 'DRAFT_SENTINEL_NEVER_SERVE',
            },
            {
              id: 'requests',
              title: '開示等の請求',
              body: 'PRIVATE_DRAFT_REQUEST_TEXT',
            },
          ],
        })
      );
      expect(html).not.toMatch(/DRAFT_SENTINEL|PRIVATE_DRAFT/);
      expect(html).toContain('id="requests"');
      expect(html).toContain('/contact?intent=privacy');
      expect(html).toContain('/contact?intent=operator-disclosure');
      expect(html).toContain('正式公開を保留');
      expect(html).toContain('窓口運用は事業者から完了の申告があり、証跡を照合中');
      expect(html).not.toContain('受付・返信の運用確認も完了していません');
    } finally {
      if (previous === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = previous;
    }
  });
  it('未承認の正式配信buildはNext buildより前に失敗する', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/public-site/build-for-vercel.mjs'],
      {
        env: {
          ...process.env,
          NODE_ENV: 'production',
          VERCEL_ENV: 'production',
          LEGAL_PUBLICATION_MODE: 'approved',
        },
        encoding: 'utf8',
        timeout: 60_000,
      }
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('RELEASE_BLOCKED');
    expect(result.stdout).not.toContain(
      'Creating an optimized production build'
    );
  });
});
