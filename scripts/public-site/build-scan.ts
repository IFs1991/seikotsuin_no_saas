import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { PLACEHOLDER_DOMAINS } from '../../src/components/public/release-readiness';

export type ArtifactClass =
  | 'html'
  | 'rsc'
  | 'browser-js'
  | 'server-bundle'
  | 'server-map'
  | 'browser-map'
  | 'data';
export interface ScanFinding {
  file: string;
  fileClass: ArtifactClass;
  category: 'placeholder' | 'private';
  rule: string;
  occurrences: number;
  verdict: 'BLOCK' | 'VALIDATION_DATA';
  reason: string;
}
interface SourceMapData {
  sources: string[];
  sourcesContent: Array<string | null>;
  mappings: string;
  namesCount: number;
}
interface Range {
  start: number;
  end: number;
}
const canonicalPath = 'src/components/public/release-readiness.ts';
const extensions = new Set([
  '.html',
  '.rsc',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.body',
  '.meta',
  '.txt',
  '.map',
  '.css',
  '.xml',
]);
const normalize = (text: string) => text.replace(/\r\n/g, '\n');

function artifactClass(file: string): ArtifactClass {
  const name = file.replace(/\\/g, '/');
  if (name.endsWith('.html')) return 'html';
  if (name.endsWith('.rsc')) return 'rsc';
  const server =
    !/(^|\/)(?:public|static)\//.test(name) &&
    /^(?:server\/|standalone\/\.next\/server\/)/.test(name);
  if (name.endsWith('.map')) return server ? 'server-map' : 'browser-map';
  if (/\.(?:mjs|cjs|js)$/.test(name))
    return server ? 'server-bundle' : 'browser-js';
  return 'data';
}
function positions(text: string, term: string): number[] {
  const result: number[] = [];
  if (!term) return result;
  for (
    let offset = text.indexOf(term);
    offset >= 0;
    offset = text.indexOf(term, offset + term.length)
  )
    result.push(offset);
  return result;
}
function parseMap(text: string): SourceMapData | null {
  try {
    let duplicate = false;
    function inspect(node: ts.Node) {
      if (ts.isObjectLiteralExpression(node)) {
        const keys = new Set<string>();
        for (const property of node.properties) {
          if (
            ts.isPropertyAssignment(property) &&
            ts.isStringLiteral(property.name)
          ) {
            if (keys.has(property.name.text)) duplicate = true;
            keys.add(property.name.text);
          }
        }
      }
      ts.forEachChild(node, inspect);
    }
    inspect(ts.parseJsonText('artifact.map', text));
    if (duplicate) return null;
    const value: unknown = JSON.parse(text);
    if (
      typeof value !== 'object' ||
      value === null ||
      !('version' in value) ||
      value.version !== 3 ||
      !('sources' in value) ||
      !Array.isArray(value.sources) ||
      !value.sources.every((s: unknown) => typeof s === 'string') ||
      !('sourcesContent' in value) ||
      !Array.isArray(value.sourcesContent) ||
      !value.sourcesContent.every(
        (s: unknown) => s === null || typeof s === 'string'
      ) ||
      !('mappings' in value) ||
      typeof value.mappings !== 'string' ||
      !('names' in value) ||
      !Array.isArray(value.names) ||
      !value.names.every((name: unknown) => typeof name === 'string') ||
      'sections' in value
    )
      return null;
    const map: SourceMapData = {
      sources: value.sources.filter(
        (s: unknown): s is string => typeof s === 'string'
      ),
      sourcesContent: value.sourcesContent.filter(
        (s: unknown): s is string | null => s === null || typeof s === 'string'
      ),
      mappings: value.mappings,
      namesCount: value.names.length,
    };
    return validMappings(map) ? map : null;
  } catch {
    return null;
  }
}
function validMappings(map: SourceMapData): boolean {
  if (map.sources.length !== map.sourcesContent.length) return false;
  const lineLengths = map.sourcesContent.map(content =>
    content === null ? null : content.split('\n').map(line => line.length)
  );
  let source = 0,
    line = 0,
    column = 0,
    name = 0;
  for (const generatedLine of map.mappings.split(';')) {
    let generatedColumn = 0;
    if (!generatedLine) continue;
    for (const segment of generatedLine.split(',')) {
      const values = decodeSegment(segment);
      if (!values || values[0] < 0) return false;
      generatedColumn += values[0];
      if (!Number.isSafeInteger(generatedColumn)) return false;
      if (values.length === 1) continue;
      source += values[1];
      line += values[2];
      column += values[3];
      if (source < 0 || source >= map.sources.length || line < 0 || column < 0)
        return false;
      const lengths = lineLengths[source];
      if (lengths !== null) {
        if (line >= lengths.length || column > lengths[line]) return false;
      }
      if (values.length === 5) {
        name += values[4];
        if (name < 0 || name >= map.namesCount) return false;
      }
    }
  }
  return true;
}
// ECMA-426 base64 VLQ / four-field mappings。未知・破損・index mapは安全扱いにしない。
function decodeSegment(segment: string): number[] | null {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const result: number[] = [];
  let value = 0,
    multiplier = 1;
  for (const character of segment) {
    const digit = alphabet.indexOf(character);
    if (digit < 0 || multiplier > 2 ** 40) return null;
    value += (digit & 31) * multiplier;
    if (digit & 32) multiplier *= 32;
    else {
      result.push((value % 2 ? -1 : 1) * Math.floor(value / 2));
      value = 0;
      multiplier = 1;
    }
  }
  return multiplier === 1 &&
    (result.length === 1 || result.length === 4 || result.length === 5)
    ? result
    : null;
}
function originalPosition(
  map: SourceMapData,
  line: number,
  column: number
): { source: number; line: number; column: number } | null {
  let source = 0,
    originalLine = 0,
    originalColumn = 0;
  let best: { source: number; line: number; column: number } | null = null;
  const lines = map.mappings.split(';');
  if (line >= lines.length) return null;
  for (let currentLine = 0; currentLine <= line; currentLine++) {
    let generatedColumn = 0;
    for (const segment of lines[currentLine].split(',').filter(Boolean)) {
      const values = decodeSegment(segment);
      if (!values) return null;
      generatedColumn += values[0];
      if (currentLine === line && generatedColumn > column) break;
      if (values.length === 1) {
        if (currentLine === line) best = null;
        continue;
      }
      source += values[1];
      originalLine += values[2];
      originalColumn += values[3];
      if (
        source < 0 ||
        source >= map.sources.length ||
        originalLine < 0 ||
        originalColumn < 0
      )
        return null;
      if (currentLine === line)
        best = { source, line: originalLine, column: originalColumn };
    }
  }
  return best;
}
function validationRanges(text: string, named: boolean): Range[] {
  const source = ts.createSourceFile(
    named ? 'source.ts' : 'bundle.js',
    text,
    ts.ScriptTarget.Latest,
    true,
    named ? ts.ScriptKind.TS : ts.ScriptKind.JS
  );
  const ranges: Range[] = [];
  function visit(node: ts.Node) {
    if (
      ts.isArrayLiteralExpression(node) &&
      node.elements.length === PLACEHOLDER_DOMAINS.length &&
      node.elements.every(
        (element, index) =>
          ts.isStringLiteral(element) &&
          element.text === PLACEHOLDER_DOMAINS[index]
      ) &&
      (!named ||
        (ts.isVariableDeclaration(node.parent) &&
          ts.isIdentifier(node.parent.name) &&
          node.parent.name.text === 'PLACEHOLDER_DOMAINS'))
    ) {
      for (const element of node.elements)
        ranges.push({ start: element.getStart(source), end: element.end });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return ranges;
}
const within = (offset: number, ranges: Range[]) =>
  ranges.some(range => offset >= range.start && offset < range.end);
function isCanonical(
  source: string | undefined,
  text: string | null | undefined,
  canonical: string
): text is string {
  return (
    typeof source === 'string' &&
    source.replace(/\\/g, '/').endsWith(`/${canonicalPath}`) &&
    typeof text === 'string' &&
    normalize(text).trim() === canonical.trim()
  );
}
function isValidationOccurrence(
  text: string,
  offset: number,
  map: SourceMapData,
  ranges: Range[],
  canonical: string
): boolean {
  if (!within(offset, ranges)) return false;
  const before = text.slice(0, offset).split('\n');
  const origin = originalPosition(
    map,
    before.length - 1,
    before[before.length - 1].length
  );
  if (!origin) return false;
  const original = map.sourcesContent[origin.source];
  if (!isCanonical(map.sources[origin.source], original, canonical))
    return false;
  const sourceLines = original.split('\n');
  if (
    origin.line >= sourceLines.length ||
    origin.column > sourceLines[origin.line].length
  )
    return false;
  const sourceOffset =
    sourceLines
      .slice(0, origin.line)
      .reduce((total, part) => total + part.length + 1, 0) + origin.column;
  return within(sourceOffset, validationRanges(original, true));
}

export function scanBuildOutput(
  buildDir: string,
  privateTerms: readonly string[],
  projectDir = process.cwd()
): { fileCount: number; findings: ScanFinding[] } {
  try {
    const canonical = normalize(
      fs.readFileSync(path.join(projectDir, canonicalPath), 'utf8')
    );
    const findings: ScanFinding[] = [];
    let fileCount = 0;
    const stack = [buildDir];
    while (stack.length) {
      const file = stack.pop();
      if (!file) break;
      const stat = fs.statSync(file);
      if (stat.isDirectory()) {
        for (const entry of fs.readdirSync(file)) {
          const child = path.join(file, entry);
          if (path.resolve(child) !== path.resolve(buildDir, 'cache'))
            stack.push(child);
        }
        continue;
      }
      if (!extensions.has(path.extname(file))) continue;
      fileCount++;
      const text = fs.readFileSync(file, 'utf8');
      const rawRelative = path.relative(buildDir, file);
      const relative = privateTerms.reduce(
        (value, term, index) =>
          term ? value.split(term).join(`[非公開文字列#${index + 1}]`) : value,
        rawRelative
      );
      const kind = artifactClass(rawRelative);
      // 非公開実値にはprovenance例外を適用しない。ログには番号だけを残す。
      privateTerms.forEach((term, index) => {
        const count =
          positions(text, term).length + positions(rawRelative, term).length;
        if (count)
          findings.push({
            file: relative,
            fileClass: kind,
            category: 'private',
            rule: String(index + 1),
            occurrences: count,
            verdict: 'BLOCK',
            reason: '非公開文字列の混入',
          });
      });
      if (!PLACEHOLDER_DOMAINS.some(domain => text.includes(domain))) continue;
      const map =
        kind === 'server-map'
          ? parseMap(text)
          : kind === 'server-bundle' && fs.existsSync(`${file}.map`)
            ? parseMap(fs.readFileSync(`${file}.map`, 'utf8'))
            : null;
      const generatedRanges =
        kind === 'server-bundle' ? validationRanges(text, false) : [];
      for (const domain of PLACEHOLDER_DOMAINS) {
        let safe = 0,
          blocked = 0;
        if (kind === 'server-map' && map) {
          // sourcesContent以外のmapメタデータにあるURLも通常の混入として検出する。
          const json: unknown = JSON.parse(text);
          const metadata =
            typeof json === 'object' && json !== null
              ? Object.fromEntries(
                  Object.entries(json).filter(
                    ([key]) => key !== 'sourcesContent'
                  )
                )
              : json;
          blocked += positions(JSON.stringify(metadata), domain).length;
          map.sourcesContent.forEach((content, index) => {
            if (content === null) return;
            const ranges = isCanonical(map.sources[index], content, canonical)
              ? validationRanges(content, true)
              : [];
            for (const offset of positions(content, domain)) {
              if (within(offset, ranges)) safe++;
              else blocked++;
            }
          });
          blocked += Math.max(
            0,
            positions(text, domain).length - safe - blocked
          );
        } else {
          for (const offset of positions(text, domain)) {
            if (
              kind === 'server-bundle' &&
              map &&
              isValidationOccurrence(
                text,
                offset,
                map,
                generatedRanges,
                canonical
              )
            )
              safe++;
            else blocked++;
          }
        }
        if (safe)
          findings.push({
            file: relative,
            fileClass: kind,
            category: 'placeholder',
            rule: domain,
            occurrences: safe,
            verdict: 'VALIDATION_DATA',
            reason:
              '正本と一致する検査定数のAST位置・source map provenanceを検証',
          });
        if (blocked)
          findings.push({
            file: relative,
            fileClass: kind,
            category: 'placeholder',
            rule: domain,
            occurrences: blocked,
            verdict: 'BLOCK',
            reason: '配信データ、検査定数以外、または出所を検証できない混入',
          });
      }
    }
    return { fileCount, findings };
  } catch {
    // fs例外のmessageにも非公開値を含むpathが入り得るため転記しない。
    throw new Error('成果物の完全な検査に失敗しました（公開不可）。');
  }
}
