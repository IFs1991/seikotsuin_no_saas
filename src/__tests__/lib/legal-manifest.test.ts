import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { z } from 'zod';
import { legalContentManifest } from '@/components/legal/legal-content-manifest';

const state = z.object({
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  unresolvedFields: z.array(z.string()),
  inputFiles: z.array(z.string()),
});
const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  documents: z.object({ privacy: state, terms: state, legal: state }),
});
const manifestPath = 'src/components/legal/legal-content-snapshot.json';
const approvalPath = 'src/components/public/legal-approval-records.ts';
const command =
  "import {computeLegalManifest,verifyLegalManifest,unresolvedFields} from './scripts/public-site/legal-manifest.mjs'; const mode=process.argv[2]; process.stdout.write(JSON.stringify(mode==='verify'?verifyLegalManifest(process.argv[1]):mode==='unresolved'?unresolvedFields(process.argv[1],'terms'):computeLegalManifest(process.argv[1])));";
function invoke(root: string, mode = 'compute'): unknown {
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', command, root, mode],
    { encoding: 'utf8', timeout: 60_000 }
  );
  if (result.status !== 0) throw new Error('manifest fixture command failed');
  const value: unknown = JSON.parse(result.stdout);
  return value;
}

describe('原稿SHA-256・依存データ・manifest鮮度（PR-3）', () => {
  jest.setTimeout(60_000);
  let root: string;
  const files = new Set<string>();
  const dirs = new Set<string>();
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'legal-manifest-'));
    dirs.add(root);
    const inputs = new Set(
      Object.values(legalContentManifest.documents).flatMap(document => [
        ...document.inputFiles,
      ])
    );
    for (const relative of [...inputs, manifestPath, approvalPath]) {
      const destination = path.join(root, relative);
      let directory = root;
      for (const part of path
        .relative(root, path.dirname(destination))
        .split(path.sep)) {
        directory = path.join(directory, part);
        if (!fs.existsSync(directory)) {
          fs.mkdirSync(directory);
          dirs.add(directory);
        }
      }
      fs.copyFileSync(path.join(process.cwd(), relative), destination);
      files.add(destination);
    }
  });
  afterEach(() => {
    for (const file of files) fs.unlinkSync(file);
    files.clear();
    for (const directory of [...dirs].sort((a, b) => b.length - a.length))
      fs.rmdirSync(directory);
    dirs.clear();
  });
  function compute() {
    return manifestSchema.parse(invoke(root));
  }
  function change(file: string, transform: (text: string) => string) {
    const absolute = path.join(root, file);
    fs.writeFileSync(absolute, transform(fs.readFileSync(absolute, 'utf8')));
  }
  function add(file: string, content: string) {
    const absolute = path.join(root, file);
    fs.writeFileSync(absolute, content);
    files.add(absolute);
  }
  it('同じ原稿・依存ソースは決定的で、CRLF差にも依存しない', () => {
    expect(compute()).toEqual(legalContentManifest);
    expect(invoke(root, 'verify')).toBe(true);
    change('src/app/(public)/privacy/page.tsx', text =>
      text.replace(/\r?\n/g, '\r\n')
    );
    expect(compute()).toEqual(legalContentManifest);
  });
  it('本文が変わるとhashと鮮度判定が変わり、版更新忘れを検出', () => {
    change('src/app/(public)/privacy/page.tsx', text =>
      text.replace('共通事項', '共通事項の変更')
    );
    const changed = compute();
    expect(changed.documents.privacy.sha256).not.toBe(
      legalContentManifest.documents.privacy.sha256
    );
    expect(changed.documents.terms.sha256).toBe(
      legalContentManifest.documents.terms.sha256
    );
    expect(invoke(root, 'verify')).toBe(false);
  });
  it('参照する料金が変われば3文書とも再レビューが必要', () => {
    change('src/components/public/works-content.ts', text =>
      text.replace(/monthlyFeeYen:\s*[\d_]+/, 'monthlyFeeYen: 19801')
    );
    const changed = compute();
    for (const id of ['privacy', 'terms', 'legal'] as const)
      expect(changed.documents[id].sha256).not.toBe(
        legalContentManifest.documents[id].sha256
      );
  });
  it('運営者情報・重要文言の変更も捕捉し、承認レコード自体は循環hashに入れない', () => {
    change(
      approvalPath,
      text => text + '\n// synthetic approval-only change\n'
    );
    expect(compute()).toEqual(legalContentManifest);
    change('src/components/public/release-readiness.ts', text =>
      text.replace('name: { value: null', "name: { value: '架空の表示変更'")
    );
    expect(compute().documents.legal.sha256).not.toBe(
      legalContentManifest.documents.legal.sha256
    );
  });
  it('必須条項マーカー・販売placeholderを収集し、未確定という単語だけは禁止しない', () => {
    const current = compute();
    expect(current.documents.privacy.unresolvedFields).toContain(
      'privacy:retention'
    );
    expect(
      current.documents.legal.unresolvedFields.some(field =>
        field.includes('sales-placeholder')
      )
    ).toBe(true);
    expect(
      invoke(
        "export const s = { id: 'response', body: <p>実行結果が未確定の場合は照合する</p> };",
        'unresolved'
      )
    ).toEqual([]);
  });
  it('画像の異なる不正UTF-8バイトも別hashとして検出', () => {
    const image = path.join(root, 'src/images/brand/tiramisu-wordmark.png');
    const bytes = fs.readFileSync(image);
    expect(bytes[0]).toBe(0x89);
    bytes[0] = 0x88;
    fs.writeFileSync(image, bytes);
    expect(compute().documents.privacy.sha256).not.toBe(
      legalContentManifest.documents.privacy.sha256
    );
    expect(invoke(root, 'verify')).toBe(false);
  });
  it.each(['import', 'require', 'import-equals'])(
    '%s経由の内部依存も本文変更を捕捉',
    kind => {
      const relative = 'src/app/(public)/privacy/dynamic-copy.ts';
      add(relative, "export const copy='合成の旧原稿';");
      const declaration =
        kind === 'import'
          ? "const loadCopy=()=>import('./dynamic-copy');"
          : kind === 'require'
            ? "const copy=require('./dynamic-copy');"
            : "import copy = require('./dynamic-copy');";
      change(
        'src/app/(public)/privacy/page.tsx',
        text => text + '\n' + declaration
      );
      const first = compute();
      expect(first.documents.privacy.inputFiles).toContain(relative);
      change(relative, text => text.replace('旧原稿', '新原稿'));
      expect(compute().documents.privacy.sha256).not.toBe(
        first.documents.privacy.sha256
      );
    }
  );
  it('依存先に移したマーカーと別名Pendingも未解決として収集', () => {
    const relative = 'src/app/(public)/privacy/partial-review.tsx';
    add(
      relative,
      "import { LegalReviewRequired as Review } from '@/components/legal/legal-review-required'; import { LegalPendingValue as Pending } from '@/components/legal/legal-page'; export function Part(){return <Review field='privacy:retention'><Pending /></Review>;}"
    );
    change(
      'src/app/(public)/privacy/page.tsx',
      text => "import {Part} from './partial-review';\n" + text
    );
    const current = compute();
    expect(current.documents.privacy.unresolvedFields).toContain(
      `${relative}#privacy:retention`
    );
    expect(
      current.documents.privacy.unresolvedFields.some(
        field =>
          field.startsWith(relative) && field.includes('sales-placeholder')
      )
    ).toBe(true);
  });
  it.each([
    'const Pending = Legal.LegalPendingValue;',
    'const { LegalPendingValue: Pending } = Legal;',
    "const { ['LegalPendingValue']: Pending } = Legal;",
  ])('namespaceからの別名も未確定placeholderとして検出: %s', declaration => {
    expect(
      invoke(
        "import * as Legal from '@/components/legal/legal-page'; " +
          declaration +
          " export const s={id:'common',body:<Pending/>};",
        'unresolved'
      )
    ).toEqual([expect.stringContaining('sales-placeholder')]);
  });
  it('ローカルprofileの名前で未確定fallbackを検査除外しない', () => {
    expect(
      invoke(
        "const profile={name:{value:null,status:'missing'}}; export const s={id:'common',body:publishableValue(profile.name)??<LegalPendingValue/>};",
        'unresolved'
      )
    ).toEqual([expect.stringContaining('sales-placeholder')]);
  });
  it('requireの関数別名は黙って依存追跡から落とさず拒否', () => {
    change(
      'src/app/(public)/privacy/page.tsx',
      text => text + "\nconst load=require; const extra=load('./extra');"
    );
    expect(() => compute()).toThrow('manifest fixture command failed');
  });
  it('非静的な依存は黙って無視せずfail-closedで拒否', () => {
    change(
      'src/app/(public)/privacy/page.tsx',
      text => text + '\nconst load=(name:string)=>import(name);'
    );
    expect(() => compute()).toThrow('manifest fixture command failed');
  });
  it('生成JSONの未解決項目だけを手で消しても鮮度検証に失敗', () => {
    change(manifestPath, text => {
      const manifest = manifestSchema.parse(JSON.parse(text));
      manifest.documents.privacy.unresolvedFields = [];
      return JSON.stringify(manifest, null, 2) + '\n';
    });
    expect(invoke(root, 'verify')).toBe(false);
  });
});
