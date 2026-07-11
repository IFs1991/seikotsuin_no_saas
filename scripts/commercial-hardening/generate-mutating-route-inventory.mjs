#!/usr/bin/env node

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const MUTATION_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
const METHOD_ORDER = new Map(
  MUTATION_METHODS.map((method, index) => [method, index])
);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const DEFAULT_SOURCE_ROOT = path.join(REPO_ROOT, 'src/app/api');
const DEFAULT_OUTPUT = path.join(
  REPO_ROOT,
  'docs/stabilization/evidence/commercial-hardening/route-manifest.json'
);

const EVIDENCE_MARKERS = {
  auth: [
    ['processApiRequest', /\bprocessApiRequest\b/],
    ['processClinicScopedBody', /\bprocessClinicScopedBody\b/],
    ['ensureClinicAccess', /\bensureClinicAccess\b/],
    ['getCurrentUser', /\bgetCurrentUser\b/],
    ['getUserAccessContext', /\bgetUserAccessContext\b/],
    ['requireAdminAuth', /\brequireAdminAuth\b/],
    ['verifyAdminAuth', /\bverifyAdminAuth\b/],
    ['supabase.auth.getUser', /\.auth\.getUser\s*\(/],
    ['requireBillingInternalRequest', /\brequireBillingInternalRequest\b/],
    ['verifyPublicLineMyPageAuth', /\bverifyPublicLineMyPageAuth\b/],
    ['stripe-signature', /stripe-signature|constructEvent\s*\(/],
    ['webhook-signature', /webhook.*signature|signature.*webhook|svix-/i],
  ],
  internalSecret: [
    ['CRON_SECRET', /\bCRON_SECRET\b/],
    ['internal bearer comparison', /Bearer\s+\$\{[A-Za-z0-9_]+\}/],
  ],
  clinicScope: [
    ['processClinicScopedBody', /\bprocessClinicScopedBody\b/],
    ['ensureClinicAccess', /\bensureClinicAccess\b/],
    ['createScopedAdminContext', /\bcreateScopedAdminContext\b/],
    ['resolveScopedClinicIds', /\bresolveScopedClinicIds\b/],
    ['resolvePublicClinicContext', /\bresolvePublicClinicContext\b/],
  ],
  billing: [
    ['processClinicScopedBody', /\bprocessClinicScopedBody\b/],
    ['requireBusinessWriteAccess', /requireBusinessWriteAccess\s*:\s*true/],
    [
      'business write helper',
      /\b(?:ensure|require|resolve)[A-Za-z]*BusinessWrite[A-Za-z]*\b/,
    ],
  ],
  validation: [
    ['safeParse', /\.safeParse\s*\(/],
    ['processClinicScopedBody', /\bprocessClinicScopedBody\b/],
    ['zod', /\bz\.[A-Za-z]+\s*\(/],
    ['validation helper', /\b(?:validate|parse)[A-Z][A-Za-z0-9]*\b/],
  ],
  serviceRole: [
    ['createAdminClient', /\bcreateAdminClient\b/],
    ['createScopedAdminContext', /\bcreateScopedAdminContext\b/],
  ],
  origin: [
    ['processApiRequest', /\bprocessApiRequest\b/],
    ['processClinicScopedBody', /\bprocessClinicScopedBody\b/],
    ['origin header', /headers\.get\s*\(\s*['"]origin['"]/i],
  ],
  rateLimit: [
    [
      'rate limit helper',
      /\b(?:rateLimit|checkRateLimit|applyRateLimit)[A-Za-z0-9]*\b/i,
    ],
    ['middleware', /\bmiddleware\b/],
  ],
  idempotency: [
    ['idempotency key', /idempotenc/i],
    ['event claim', /\bclaim[A-Za-z0-9]*Event\b/],
  ],
  writes: [
    ['insert', /\.insert\s*\(/],
    ['update', /\.update\s*\(/],
    ['delete', /\.delete\s*\(/],
    ['upsert', /\.upsert\s*\(/],
    ['rpc', /\.rpc\s*\(/],
  ],
  sideEffectCall: [
    ['processEmailOutbox', /\bprocessEmailOutbox\s*\(/],
    ['processLineOutbox', /\bprocessLineOutbox\s*\(/],
    ['processReservationReminders', /\bprocessReservationReminders\s*\(/],
  ],
};

const EVIDENCE_HINT_MARKERS = {
  clinicScope: [
    ['clinic_id query predicate', /\.eq\s*\(\s*['"]clinic_id['"]/],
  ],
  validation: [['generic parse call', /\.parse\s*\(/]],
  idempotency: [['upsert call', /\.upsert\s*\(/]],
};

function parseArgs(argv) {
  const args = {
    sourceRoot: DEFAULT_SOURCE_ROOT,
    output: DEFAULT_OUTPUT,
    mode: 'stdout',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--source-root') {
      args.sourceRoot = path.resolve(argv[++index]);
    } else if (value === '--output') {
      args.output = path.resolve(argv[++index]);
    } else if (value === '--write') {
      args.mode = 'write';
    } else if (value === '--check') {
      args.mode = 'check';
    } else if (value === '--stdout') {
      args.mode = 'stdout';
    } else {
      throw new Error('Unknown argument: ' + value);
    }
  }

  return args;
}

function listRouteFiles(root) {
  const files = [];

  function visit(directory) {
    for (const entry of readdirSync(directory).sort()) {
      const absolutePath = path.join(directory, entry);
      const stats = statSync(absolutePath);
      if (stats.isDirectory()) {
        visit(absolutePath);
      } else if (entry === 'route.ts' || entry === 'route.tsx') {
        files.push(absolutePath);
      }
    }
  }

  visit(root);
  return files;
}

function normalizePath(value) {
  return value.split(path.sep).join('/');
}

function routeFromFile(sourceRoot, filePath) {
  const relativeDirectory = normalizePath(
    path.relative(sourceRoot, path.dirname(filePath))
  );
  return relativeDirectory === '' ? '/api' : '/api/' + relativeDirectory;
}

function getTopLevelDeclarations(sourceFile) {
  const declarations = new Map();

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      declarations.set(statement.name.text, statement);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          declarations.set(declaration.name.text, declaration);
        }
      }
    }
  }

  return declarations;
}

function collectExpandedText(startNode, sourceFile) {
  const declarations = getTopLevelDeclarations(sourceFile);
  const visited = new Set();
  const chunks = [];

  function visitNode(node, depth) {
    if (!node || depth > 6) return;
    const key = String(node.pos) + ':' + String(node.end);
    if (visited.has(key)) return;
    visited.add(key);
    chunks.push(node.getText(sourceFile));

    function inspect(child) {
      if (ts.isCallExpression(child) && ts.isIdentifier(child.expression)) {
        const declaration = declarations.get(child.expression.text);
        if (declaration) visitNode(declaration, depth + 1);
      }
      ts.forEachChild(child, inspect);
    }

    ts.forEachChild(node, inspect);
  }

  visitNode(startNode, 0);
  return chunks.join('\n');
}

function collectEvidence(sourceText) {
  return Object.fromEntries(
    Object.entries(EVIDENCE_MARKERS).map(([category, markers]) => [
      category,
      markers
        .filter(([, pattern]) => pattern.test(sourceText))
        .map(([label]) => label)
        .sort(),
    ])
  );
}

function collectHints(sourceText) {
  return Object.fromEntries(
    Object.entries(EVIDENCE_HINT_MARKERS).map(([category, markers]) => [
      category,
      markers
        .filter(([, pattern]) => pattern.test(sourceText))
        .map(([label]) => label)
        .sort(),
    ])
  );
}

function declarationKind(node) {
  if (ts.isFunctionDeclaration(node)) return 'function';
  if (ts.isVariableDeclaration(node)) return 'variable';
  if (ts.isExportSpecifier(node)) return 'alias';
  return ts.SyntaxKind[node.kind] ?? 'unknown';
}

function findRouteDeclaration(symbol, sourceFile) {
  return (
    symbol.declarations?.find(
      declaration => declaration.getSourceFile() === sourceFile
    ) ??
    symbol.valueDeclaration ??
    symbol.declarations?.[0]
  );
}

function resolveTargetSymbol(checker, symbol) {
  if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    return checker.getAliasedSymbol(symbol);
  }
  return symbol;
}

function createProgram(routeFiles) {
  return ts.createProgram(routeFiles, {
    allowJs: false,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
  });
}

function collectHandler(checker, sourceRoot, sourceFile, exportedSymbol, method) {
  const targetSymbol = resolveTargetSymbol(checker, exportedSymbol);
  const targetDeclaration =
    targetSymbol.valueDeclaration ?? targetSymbol.declarations?.[0];
  const routeDeclaration = findRouteDeclaration(exportedSymbol, sourceFile);
  const evidenceNode = targetDeclaration ?? routeDeclaration;
  const evidenceSourceFile = evidenceNode?.getSourceFile() ?? sourceFile;
  const evidenceText = evidenceNode
    ? collectExpandedText(evidenceNode, evidenceSourceFile)
    : sourceFile.getFullText();
  const observed = collectEvidence(evidenceText);
  const hints = collectHints(evidenceText);
  const lineNode = routeDeclaration ?? targetDeclaration ?? sourceFile;
  const line =
    sourceFile.getLineAndCharacterOfPosition(
      Math.max(0, lineNode.getStart(sourceFile, false))
    ).line + 1;
  const route = routeFromFile(sourceRoot, sourceFile.fileName);
  const unknowns = ['classification'];

  for (const category of [
    'auth',
    'clinicScope',
    'billing',
    'validation',
    'origin',
  ]) {
    if (observed[category].length === 0) unknowns.push(category);
  }

  return {
    id: method + ' ' + route,
    route,
    method,
    source: {
      path: normalizePath(path.relative(REPO_ROOT, sourceFile.fileName)),
      line,
      exportKind: declarationKind(
        routeDeclaration ?? targetDeclaration ?? sourceFile
      ),
    },
    executionPath: targetDeclaration
      ? {
          status: 'RESOLVED',
          path: normalizePath(
            path.relative(REPO_ROOT, targetDeclaration.getSourceFile().fileName)
          ),
        }
      : { status: 'UNRESOLVED', path: null },
    observed,
    hints,
    classification: 'UNKNOWN',
    unknowns,
  };
}

export function buildInventory(sourceRoot) {
  const routeFiles = listRouteFiles(sourceRoot);
  const program = createProgram(routeFiles);
  const checker = program.getTypeChecker();
  const handlers = [];
  const sideEffectingGetCandidates = [];

  for (const routeFile of routeFiles) {
    const sourceFile = program.getSourceFile(routeFile);
    if (!sourceFile) continue;
    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    if (!moduleSymbol) continue;
    const exports = new Map(
      checker
        .getExportsOfModule(moduleSymbol)
        .map(symbol => [symbol.getName(), symbol])
    );

    for (const method of MUTATION_METHODS) {
      const symbol = exports.get(method);
      if (symbol) {
        handlers.push(
          collectHandler(checker, sourceRoot, sourceFile, symbol, method)
        );
      }
    }

    const getSymbol = exports.get('GET');
    if (getSymbol) {
      const candidate = collectHandler(
        checker,
        sourceRoot,
        sourceFile,
        getSymbol,
        'GET'
      );
      const possibleSideEffect =
        candidate.observed.writes.length > 0 ||
        candidate.observed.sideEffectCall.length > 0;
      if (possibleSideEffect) {
        sideEffectingGetCandidates.push({
          ...candidate,
          classification: 'UNKNOWN_SIDE_EFFECT',
          unknowns: ['sideEffectDecision', ...candidate.unknowns],
        });
      }
    }
  }

  handlers.sort(
    (left, right) =>
      left.route.localeCompare(right.route) ||
      (METHOD_ORDER.get(left.method) ?? 99) -
        (METHOD_ORDER.get(right.method) ?? 99)
  );
  sideEffectingGetCandidates.sort((left, right) =>
    left.route.localeCompare(right.route)
  );

  const methodCounts = Object.fromEntries(
    MUTATION_METHODS.map(method => [
      method,
      handlers.filter(handler => handler.method === method).length,
    ])
  );

  return {
    schemaVersion: 1,
    generatedBy:
      'scripts/commercial-hardening/generate-mutating-route-inventory.mjs',
    sourceRoot: normalizePath(path.relative(REPO_ROOT, sourceRoot)),
    policyStatus: 'DRAFT_OBSERVED_FACTS_ONLY',
    summary: {
      scannedRouteFiles: routeFiles.length,
      mutationRouteFiles: new Set(
        handlers.map(handler => handler.source.path)
      ).size,
      mutationHandlers: handlers.length,
      methodCounts,
      unclassifiedHandlers: handlers.filter(
        handler => handler.classification === 'UNKNOWN'
      ).length,
      sideEffectingGetCandidates: sideEffectingGetCandidates.length,
    },
    handlers,
    sideEffectingGetCandidates,
  };
}

function serialize(inventory) {
  return JSON.stringify(inventory, null, 2) + '\n';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const output = serialize(buildInventory(args.sourceRoot));

  if (args.mode === 'stdout') {
    process.stdout.write(output);
    return;
  }

  if (args.mode === 'check') {
    const current = readFileSync(args.output, 'utf8');
    if (current !== output) {
      console.error(
        'Mutating route inventory drift: ' +
          path.relative(REPO_ROOT, args.output)
      );
      process.exitCode = 1;
    }
    return;
  }

  await mkdir(path.dirname(args.output), { recursive: true });
  writeFileSync(args.output, output, 'utf8');
  console.log('Wrote ' + path.relative(REPO_ROOT, args.output));
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
