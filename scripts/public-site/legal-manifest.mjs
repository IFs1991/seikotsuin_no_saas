import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
export const manifestPath = 'src/components/legal/legal-content-snapshot.json';
export const commonInputs = [
  'src/components/legal/legal-page.tsx',
  'src/components/legal/legal-footer-links.tsx',
  'src/components/legal/operator-profile-list.tsx',
  'src/components/legal/legal-review-required.tsx',
  'src/components/legal/legal-review-fields.ts',
  'src/components/public/release-readiness.ts',
  'src/components/public/legal-delivery.ts',
  'src/components/public/lp-content.ts',
  'src/components/public/works-content.ts',
  'src/components/public/marketing-links.ts',
  'src/components/public/lp-links.ts',
];
export const documentIds = [
  'privacy',
  'terms',
  'legal',
  'works/privacy',
  'works/terms',
  'works/plugin',
];
const normalize = text => text.replace(/\r\n/g, '\n');
const digest = value =>
  createHash('sha256').update(value, 'utf8').digest('hex');
const excludedInputs = new Set([
  manifestPath,
  'src/components/public/legal-approval-records.ts',
  'src/components/public/works-legal-approval-records.ts',
]);
function legalInputs(projectDir, page) {
  const visited = new Set();
  const pending = [...commonInputs, page];
  while (pending.length) {
    const file = pending.pop();
    if (visited.has(file) || excludedInputs.has(file)) continue;
    visited.add(file);
    const text = normalize(
      fs.readFileSync(path.join(projectDir, file), 'utf8')
    );
    if (!/\.[cm]?[jt]sx?$/.test(file)) continue;
    const source = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true
    );
    const specifiers = [];
    function reference(node) {
      if (
        ts.isIdentifier(node) &&
        node.text === 'require' &&
        !(ts.isCallExpression(node.parent) && node.parent.expression === node)
      )
        throw new Error('requireの別名・値参照は法務依存で未対応です。');
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        !node.isTypeOnly &&
        !node.importClause?.isTypeOnly &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      )
        specifiers.push(node.moduleSpecifier.text);
      if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference)
      ) {
        if (
          !node.moduleReference.expression ||
          !ts.isStringLiteral(node.moduleReference.expression)
        )
          throw new Error('非静的な法務依存は検証できません。');
        specifiers.push(node.moduleReference.expression.text);
      }
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) &&
            node.expression.text === 'require'))
      ) {
        if (
          node.arguments.length !== 1 ||
          !ts.isStringLiteral(node.arguments[0])
        )
          throw new Error('非静的な法務依存は検証できません。');
        specifiers.push(node.arguments[0].text);
      }
      ts.forEachChild(node, reference);
    }
    reference(source);
    for (const specifier of specifiers) {
      if (!specifier.startsWith('@/') && !specifier.startsWith('.')) continue;
      const target = specifier.startsWith('@/')
        ? `src/${specifier.slice(2)}`
        : path.posix.normalize(
            path.posix.join(path.posix.dirname(file), specifier)
          );
      if (!target.startsWith('src/'))
        throw new Error('法務依存はsrc配下の正本に限定します。');
      if (excludedInputs.has(target) || excludedInputs.has(`${target}.ts`))
        continue;
      const resolved = [
        target,
        ...['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx'].map(
          extension => target + extension
        ),
      ].find(
        candidate =>
          fs.existsSync(path.join(projectDir, candidate)) &&
          fs.statSync(path.join(projectDir, candidate)).isFile()
      );
      if (!resolved)
        throw new Error('法務原稿の依存ファイルを解決できません。');
      pending.push(resolved);
    }
  }
  return [...visited].sort();
}

export function unresolvedFields(text, document, dependency = false) {
  const source = ts.createSourceFile(
    document + '.tsx',
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const aliases = new Map([
    ['LegalReviewRequired', 'review'],
    ['LegalPendingValue', 'pending'],
  ]);
  for (const statement of source.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      for (const element of statement.importClause.namedBindings.elements) {
        const kind = aliases.get((element.propertyName ?? element.name).text);
        if (kind) aliases.set(element.name.text, kind);
      }
    }
  }
  const kindOf = name =>
    aliases.get(name) ??
    (name.endsWith('.LegalReviewRequired')
      ? 'review'
      : name.endsWith('.LegalPendingValue')
        ? 'pending'
        : undefined);
  function findAliases(node) {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (ts.isIdentifier(node.name)) {
        const kind = kindOf(node.initializer.getText(source));
        if (kind) aliases.set(node.name.text, kind);
      } else if (ts.isObjectBindingPattern(node.name)) {
        for (const element of node.name.elements) {
          if (!ts.isIdentifier(element.name)) continue;
          const property = element.propertyName ?? element.name;
          const name =
            ts.isStringLiteral(property) || ts.isIdentifier(property)
              ? property.text
              : ts.isComputedPropertyName(property) &&
                  ts.isStringLiteral(property.expression)
                ? property.expression.text
                : undefined;
          const kind = name ? kindOf(name) : undefined;
          if (kind) aliases.set(element.name.text, kind);
        }
      }
    }
    ts.forEachChild(node, findAliases);
  }
  let previousSize;
  do {
    previousSize = aliases.size;
    findAliases(source);
  } while (aliases.size !== previousSize);
  const fields = new Set(),
    sections = new Set();
  function visit(node) {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'id' &&
      ts.isStringLiteral(node.initializer)
    )
      sections.add(node.initializer.text);
    if (
      ts.isExportDeclaration(node) &&
      node.exportClause &&
      ts.isNamedExports(node.exportClause)
    ) {
      for (const element of node.exportClause.elements)
        if (
          kindOf((element.propertyName ?? element.name).text) &&
          element.propertyName &&
          element.propertyName.text !== element.name.text
        )
          throw new Error('法務マーカーの再export別名は未対応です。');
    }
    if (
      ts.isCallExpression(node) &&
      node.arguments.some(argument => kindOf(argument.getText(source)))
    )
      throw new Error('法務マーカーは静的JSXで記述してください。');
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const kind = kindOf(node.tagName.getText(source));
      if (kind === 'pending')
        fields.add(
          document +
            ':sales-placeholder@' +
            (source.getLineAndCharacterOfPosition(node.pos).line + 1)
        );
      if (kind === 'review') {
        const attribute = node.attributes.properties.find(
          a => ts.isJsxAttribute(a) && a.name.getText(source) === 'field'
        );
        if (
          !attribute?.initializer ||
          !ts.isStringLiteral(attribute.initializer) ||
          !(dependency
            ? documentIds.some(id =>
                attribute.initializer.text.startsWith(id + ':')
              )
            : attribute.initializer.text.startsWith(document + ':'))
        )
          throw new Error('法務必須項目のマーカーが不正です。');
        fields.add(attribute.initializer.text);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  for (const field of fields)
    if (
      !dependency &&
      !field.includes('sales-placeholder@') &&
      !sections.has(field.slice(document.length + 1))
    )
      throw new Error('法務マーカーと条項アンカーが一致しません。');
  return [...fields].sort();
}

export function computeLegalManifest(projectDir = root) {
  const documents = {};
  for (const document of documentIds) {
    const page = `src/app/(public)/${document}/page.tsx`;
    const paths = legalInputs(projectDir, page);
    const inputs = paths.map(file => {
      const bytes = fs.readFileSync(path.join(projectDir, file));
      return [
        file,
        /\.(?:[cm]?[jt]sx?|css|json|svg|txt)$/.test(file)
          ? ['utf8-lf', normalize(bytes.toString('utf8'))]
          : ['base64', bytes.toString('base64')],
      ];
    });
    const text = normalize(
      fs.readFileSync(path.join(projectDir, page), 'utf8')
    );
    const fields = new Set(unresolvedFields(text, document));
    for (const file of paths) {
      if (file === page || !/\.[cm]?[jt]sx?$/.test(file)) continue;
      const content = normalize(
        fs.readFileSync(path.join(projectDir, file), 'utf8')
      );
      for (const field of unresolvedFields(content, document, true))
        fields.add(file + '#' + field);
    }
    documents[document] = {
      sha256: digest(
        JSON.stringify({ format: 'legal-source-v2', document, inputs })
      ),
      unresolvedFields: [...fields].sort(),
      inputFiles: paths,
    };
  }
  return { schemaVersion: 1, documents };
}
export function renderLegalManifest(manifest) {
  return JSON.stringify(manifest, null, 2) + '\n';
}
export function verifyLegalManifest(projectDir = root) {
  const expected = renderLegalManifest(computeLegalManifest(projectDir));
  const file = path.join(projectDir, manifestPath);
  return (
    fs.existsSync(file) && normalize(fs.readFileSync(file, 'utf8')) === expected
  );
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes('--write')) {
      fs.writeFileSync(
        path.join(root, manifestPath),
        renderLegalManifest(computeLegalManifest(root))
      );
      console.log('法務manifestを更新しました（承認状態は変更していません）。');
    } else if (!verifyLegalManifest(root)) {
      console.error(
        'RELEASE_BLOCKED: 法務原稿とmanifestが不一致です。npm run legal:manifestで更新し、変更後のhashを再レビューしてください。'
      );
      process.exitCode = 1;
    } else
      console.log(
        '法務manifest: 原稿・依存データと一致（法務承認ではありません）'
      );
  } catch {
    console.error('RELEASE_BLOCKED: 法務原稿の完全性を検証できません。');
    process.exitCode = 1;
  }
}
