import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { scanBuildOutput } from '../../../scripts/public-site/build-scan';

const canonicalPath = 'src/components/public/release-readiness.ts';
const canonical = fs.readFileSync(
  path.join(process.cwd(), canonicalPath),
  'utf8'
);
const domains = ['tiramisu.jp', 'your-app.vercel.app'];
const generated = 'const deny=["tiramisu.jp","your-app.vercel.app"];';
const directories = [
  'server',
  'server/chunks',
  'server/app',
  'server/app/cache',
  'static',
  'standalone',
  'standalone/public',
  'standalone/public/server',
];
const alphabet =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function vlq(value: number): string {
  let encoded = Math.abs(value) * 2 + (value < 0 ? 1 : 0),
    result = '';
  do {
    const digit = encoded % 32;
    encoded = Math.floor(encoded / 32);
    result += alphabet[digit + (encoded ? 32 : 0)];
  } while (encoded);
  return result;
}
function sourceMap() {
  let previousGenerated = 0,
    previousLine = 0,
    previousColumn = 0;
  const segments = domains.map(domain => {
    const start = canonical.indexOf(`'${domain}'`);
    if (start < 0) throw new Error('canonical literal missing');
    const before = canonical.slice(0, start).split('\n');
    const line = before.length - 1,
      column = before[before.length - 1].length;
    const gen = generated.indexOf(`"${domain}"`);
    const segment = [
      gen - previousGenerated,
      0,
      line - previousLine,
      column - previousColumn,
    ]
      .map(vlq)
      .join('');
    previousGenerated = gen;
    previousLine = line;
    previousColumn = column;
    return segment;
  });
  return {
    version: 3,
    sources: [`webpack://app/./${canonicalPath}`],
    sourcesContent: [canonical],
    names: [],
    mappings: segments.join(','),
  };
}
describe('成果物分類と検査定数のprovenance（PR-2）', () => {
  let root: string;
  const files: string[] = [];
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'legal-scan-'));
    for (const dir of directories) fs.mkdirSync(path.join(root, dir));
  });
  afterEach(() => {
    for (const file of files.splice(0)) fs.unlinkSync(file);
    for (const dir of [...directories].reverse().concat(''))
      fs.rmdirSync(path.join(root, dir));
  });
  function write(relative: string, content: string) {
    const file = path.join(root, relative);
    fs.writeFileSync(file, content);
    if (!files.includes(file)) files.push(file);
  }
  it('正本AST/source map/生成ASTが一致する検査定数は分類を記録し、漏えいと誤判定しない', () => {
    write('server/chunks/validator.js', generated);
    write('server/chunks/validator.js.map', JSON.stringify(sourceMap()));
    const result = scanBuildOutput(root, []);
    expect(
      result.findings.filter(finding => finding.verdict === 'BLOCK')
    ).toEqual([]);
    expect(result.findings).toHaveLength(4);
    expect(new Set(result.findings.map(finding => finding.fileClass))).toEqual(
      new Set(['server-bundle', 'server-map'])
    );
  });
  it.each([
    ['page.html', 'html'],
    ['page.rsc', 'rsc'],
    ['static/app.js', 'browser-js'],
    ['static/app.js.map', 'browser-map'],
  ])('%sに実URLを混入すると検出', (file, kind) => {
    write(file, 'href="https://tiramisu.jp/private"');
    expect(scanBuildOutput(root, []).findings).toEqual([
      expect.objectContaining({ fileClass: kind, verdict: 'BLOCK' }),
    ]);
  });
  it('source mapがあっても生成されたURLや同一ファイルの別位置は除外しない', () => {
    write(
      'server/chunks/page.js',
      `${generated}\nconst href="https://tiramisu.jp";`
    );
    const map = sourceMap();
    map.sourcesContent[0] += '\nconst href="https://tiramisu.jp";';
    write('server/chunks/page.js.map', JSON.stringify(map));
    const result = scanBuildOutput(root, []);
    expect(
      result.findings.some(
        finding =>
          finding.verdict === 'BLOCK' && finding.fileClass === 'server-bundle'
      )
    ).toBe(true);
    expect(
      result.findings.some(
        finding =>
          finding.verdict === 'BLOCK' && finding.fileClass === 'server-map'
      )
    ).toBe(true);
  });
  it.each([
    null,
    '{broken',
    JSON.stringify({
      version: 3,
      sources: [],
      sourcesContent: [],
      mappings: '!!!!',
    }),
  ])('mapが欠損/破損/出所不明なら安全扱いにしない', map => {
    write('server/chunks/validator.js', generated);
    if (map) write('server/chunks/validator.js.map', map);
    expect(
      scanBuildOutput(root, []).findings.filter(
        finding => finding.verdict === 'BLOCK'
      )
    ).toHaveLength(2);
  });
  it('非公開氏名・住所・電話はHTML/RSC/JS/server/mapの分類にかかわらず検出', () => {
    const terms = [
      '（テスト用）非公開氏名',
      '架空県テスト市非公開住所',
      '000-0000-0000',
    ];
    for (const file of [
      'page.html',
      'page.rsc',
      'static/app.js',
      'server/chunks/raw.js',
      'server/chunks/raw.js.map',
    ])
      write(file, terms.join('|'));
    const result = scanBuildOutput(root, terms);
    expect(
      result.findings.filter(finding => finding.category === 'private')
    ).toHaveLength(15);
    expect(JSON.stringify(result)).not.toMatch(
      /非公開氏名|架空県|000-0000-0000/
    );
  });
  it('正常な成果物には不要な検出を発生させない', () => {
    write('page.html', '<a href="/privacy">Privacy</a>');
    expect(scanBuildOutput(root, []).findings).toEqual([]);
  });
  it('公開フォルダのserver名を検査データへ昇格させない', () => {
    write('standalone/public/server/validator.js', generated);
    write(
      'standalone/public/server/validator.js.map',
      JSON.stringify(sourceMap())
    );
    const result = scanBuildOutput(root, []);
    expect(result.findings.every(finding => finding.verdict === 'BLOCK')).toBe(
      true
    );
    expect(result.findings).toHaveLength(4);
  });
  it('配布応答のcacheディレクトリも非公開文字列を走査する', () => {
    write('server/app/cache/page.html', 'PRIVATE_CACHE_SENTINEL');
    expect(scanBuildOutput(root, ['PRIVATE_CACHE_SENTINEL']).findings).toEqual([
      expect.objectContaining({ category: 'private', verdict: 'BLOCK' }),
    ]);
  });
  it('map後半の破損やduplicate keyをparseで隠して安全扱いしない', () => {
    const map = sourceMap();
    for (const text of [
      JSON.stringify({ ...map, mappings: map.mappings + ';!!!!' }),
      '{"file":"https://tiramisu.jp",' +
        JSON.stringify({ ...map, file: 'clean.js' }).slice(1),
    ]) {
      write('server/chunks/validator.js.map', text);
      const findings = scanBuildOutput(root, []).findings;
      expect(findings.some(finding => finding.verdict === 'BLOCK')).toBe(true);
      expect(
        findings.some(finding => finding.verdict === 'VALIDATION_DATA')
      ).toBe(false);
    }
  });
  it('非公開語がファイル名に含まれても検出し、全分類の結果から実値を消す', () => {
    const term = '架空の未公開氏名';
    write(`${term}.html`, '<a href="https://tiramisu.jp">link</a>');
    const scan = scanBuildOutput(root, [term]);
    expect(scan.findings.some(finding => finding.category === 'private')).toBe(
      true
    );
    expect(JSON.stringify(scan)).not.toContain(term);
    expect(
      scan.findings.every(finding => finding.file.includes('[非公開文字列#1]'))
    ).toBe(true);
  });
});
