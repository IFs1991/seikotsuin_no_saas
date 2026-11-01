/** @jest-environment node */
/**
 * 公開前チェックCLIが next build と同じ環境ファイルを読み、問い合わせフォームURLを検証すること。
 * 実在の環境ファイルは使わず、一時ディレクトリを --project-dir に渡して隔離する。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const cli = path.join(
  repoRoot,
  'scripts/public-site/check-release-readiness.mjs'
);
const FORM_LINE = /^問い合わせフォームURL: .*$/m;

const tempDirs: string[] = [];

function makeProjectDir(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-check-env-'));
  tempDirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

function runCli(
  projectDir: string,
  extraEnv: Record<string, string> = {},
  args: string[] = []
) {
  // 親（Jest）の環境変数を引き継がない。NODE_ENV=test も渡さない。
  const result = spawnSync(
    process.execPath,
    [cli, '--project-dir', projectDir, ...args],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '', ...extraEnv },
      timeout: 60_000,
    }
  );
  const output = `${result.stdout}${result.stderr}`;
  return {
    status: result.status,
    output,
    formLine: output.match(FORM_LINE)?.[0] ?? '',
  };
}

afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('公開前チェックCLIの環境読み込み（F2）', () => {
  jest.setTimeout(120_000);

  it('ビルドスキャンで非公開文字列の混入を検出し、実値をログに出さない', () => {
    const privateTerm = 'PRIVATE_SENTINEL_ISSUE_167_ONLY';
    const dir = makeProjectDir({ 'private-terms.txt': privateTerm });
    const buildDir = path.join(dir, 'build');
    fs.mkdirSync(buildDir);
    fs.writeFileSync(
      path.join(buildDir, 'privacy.html'),
      `<p>${privateTerm}</p>`
    );
    const result = runCli(dir, {}, [
      '--scan-build',
      buildDir,
      '--private-terms-file',
      path.join(dir, 'private-terms.txt'),
    ]);
    expect(result.status).toBe(1);
    expect(result.output).toContain('NG 非公開文字列 #1: 1件');
    expect(result.output).not.toContain(privateTerm);
    expect(result.output).toContain('RELEASE_BLOCKED');
    fs.writeFileSync(
      path.join(buildDir, 'privacy.html'),
      '<p>公開可能な合成テスト原稿</p>'
    );
    const clean = runCli(dir, {}, [
      '--scan-build',
      buildDir,
      '--private-terms-file',
      path.join(dir, 'private-terms.txt'),
    ]);
    expect(clean.output).toContain('OK 非公開文字列 #1: 0件');
    // スキャンが安全でも、未承認の文書を公開可にしない。
    expect(clean.status).toBe(1);
    expect(clean.output).toContain('法務文書の承認未完了 3件');
  });

  it('.env.production だけにある http のURLを不正な設定として検出する', () => {
    const dir = makeProjectDir({
      '.env.production':
        'NEXT_PUBLIC_LP_FORM_URL=http://forms.fictional-tiramisu-test.co.jp/form\n',
    });
    const run = runCli(dir);
    expect(run.status).toBe(1);
    expect(run.formLine).toContain('不正な設定');
    expect(run.formLine).toContain('出所: .env.production');
    expect(run.formLine).toContain('既定のフォームには切り替えません');
    expect(run.output).toMatch(/確認エラー 1件/);
    // URLそのものは出力しない
    expect(run.output).not.toContain('forms.fictional-tiramisu-test.co.jp');
  });

  it('.env.production だけにある https のURLを採用する', () => {
    const dir = makeProjectDir({
      '.env.production':
        'NEXT_PUBLIC_LP_FORM_URL=https://forms.fictional-tiramisu-test.co.jp/form\n',
    });
    const run = runCli(dir);
    expect(run.formLine).toBe(
      '問い合わせフォームURL: 使用可能な形式（NEXT_PUBLIC_LP_FORM_URL（.env.production））'
    );
    expect(run.output).toContain('環境ファイル（本番モード）: .env.production');
    expect(run.output).not.toMatch(/確認エラー/);
    expect(run.output).not.toContain('forms.fictional-tiramisu-test.co.jp');
    // 台帳の未承認項目があるため判定は引き続き公開不可
    expect(run.status).toBe(1);
    expect(run.output).toContain('判定: 公開不可（RELEASE_BLOCKED）');
    expect(run.output).toContain('法務文書の承認未完了 3件');
    for (const document of ['privacy', 'terms', 'legal']) {
      expect(run.output).toContain(`法務文書 /${document}: 公開承認待ち`);
    }
  });

  it('プロセス環境変数が .env.production より優先される（不正なプロセス値は隠さない）', () => {
    const dir = makeProjectDir({
      '.env.production':
        'NEXT_PUBLIC_LP_FORM_URL=https://forms.fictional-tiramisu-test.co.jp/form\n',
    });
    const invalid = runCli(dir, {
      NEXT_PUBLIC_LP_FORM_URL: 'http://forms.fictional-tiramisu-test.co.jp/x',
    });
    expect(invalid.formLine).toContain('不正な設定');
    expect(invalid.formLine).toContain('出所: プロセス環境変数');

    const valid = runCli(
      makeProjectDir({
        '.env.production':
          'NEXT_PUBLIC_LP_FORM_URL=http://forms.fictional-tiramisu-test.co.jp/x\n',
      }),
      {
        NEXT_PUBLIC_LP_FORM_URL:
          'https://forms.fictional-tiramisu-test.co.jp/form',
      }
    );
    expect(valid.formLine).toBe(
      '問い合わせフォームURL: 使用可能な形式（NEXT_PUBLIC_LP_FORM_URL（プロセス環境変数））'
    );
  });

  it('.env.production.local・.env.local・.env.production・.env の優先順位が next build と一致する', () => {
    const http =
      'NEXT_PUBLIC_LP_FORM_URL=http://forms.fictional-tiramisu-test.co.jp/x\n';
    const https =
      'NEXT_PUBLIC_LP_FORM_URL=https://forms.fictional-tiramisu-test.co.jp/form\n';
    expect(
      runCli(makeProjectDir({ '.env.local': https, '.env.production': http }))
        .formLine
    ).toContain('（.env.local）');
    expect(
      runCli(
        makeProjectDir({ '.env.production.local': http, '.env.local': https })
      ).formLine
    ).toContain('出所: .env.production.local');
    expect(
      runCli(makeProjectDir({ '.env.production': https, '.env': http }))
        .formLine
    ).toContain('（.env.production）');
    // 本番モードでは .env.development は読まない
    expect(
      runCli(makeProjectDir({ '.env.development': http })).formLine
    ).toContain('既定のGoogleフォーム');
  });

  it('未設定なら既存のGoogleフォームへフォールバックする', () => {
    const run = runCli(makeProjectDir({}));
    expect(run.formLine).toBe(
      '問い合わせフォームURL: 使用可能な形式（既定のGoogleフォーム（NEXT_PUBLIC_LP_FORM_URL は未設定））'
    );
    expect(run.output).toContain('環境ファイル（本番モード）: なし');
  });

  it('資格情報付き・非URLの値も明示的なエラーとして報告する', () => {
    for (const value of [
      'https://user:secret@forms.fictional-tiramisu-test.co.jp/form',
      'javascript:alert(1)',
    ]) {
      const run = runCli(
        makeProjectDir({
          '.env.production': `NEXT_PUBLIC_LP_FORM_URL=${value}\n`,
        })
      );
      expect(run.formLine).toContain('不正な設定');
      expect(run.output).toMatch(/確認エラー 1件/);
      expect(run.output).not.toContain('secret');
    }
  });

  it('NODE_ENV=test では本番と異なる環境を読むため実行しない', () => {
    const run = runCli(makeProjectDir({}), { NODE_ENV: 'test' });
    expect(run.status).toBe(2);
    expect(run.output).toContain('NODE_ENV=test');
  });
});
