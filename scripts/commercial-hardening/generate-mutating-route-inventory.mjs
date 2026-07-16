#!/usr/bin/env node

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import {
  loadMutatingRoutePolicy,
  mergePolicyIntoInventory,
  verifyMutatingRoutePolicy,
} from './mutating-route-policy-utils.mjs';

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
const DEFAULT_POLICY = path.join(
  REPO_ROOT,
  'src/lib/security/mutating-route-policy.ts'
);
const AUDIT_LOGGER_PERSISTED_METHODS = new Set([
  'logLogin',
  'logFailedLogin',
  'logLogout',
  'logDataAccess',
  'logDataModify',
  'logDataDelete',
  'logUnauthorizedAccess',
  'logAdminAction',
  'logDataExport',
]);
const PERSISTENT_DATA_METHODS = new Set([
  'insert',
  'update',
  'delete',
  'upsert',
  'rpc',
]);
const CANONICAL_POLICY_EVIDENCE_CALLS = new Set([
  '@/lib/api-helpers#processApiRequest',
  '@/lib/api-helpers#verifyAdminAuth',
  '@/lib/route-helpers#processClinicScopedBody',
  '@/lib/supabase/guards#ensureClinicAccess',
  '@/lib/billing/business-write#ensureScopedBusinessWriteAccess',
  '@/lib/billing/business-write#ensureBusinessWriteAccess',
  '@/lib/billing/internal-auth#requireBillingInternalRequest',
  '@/lib/line/public-my-page-auth#verifyPublicLineMyPageAuth',
  '@/lib/stripe/server#constructStripeWebhookEvent',
  '@/lib/notifications/email/webhook-handler#verifyResendWebhook',
  '@/lib/billing/stripe-events#claimStripeWebhookEvent',
  '@/lib/supabase#getCurrentUser',
  '@/lib/supabase#getUserAccessContext',
  '@/lib/supabase#canAccessClinicScope',
  '@/lib/supabase#resolveScopedClinicIds',
  '@/lib/supabase#requireAdminAuth',
  '@/lib/auth/manager-scope#resolveManagerAssignedClinicsWithinScope',
  '@/lib/billing/admin#resolveOrgRootClinicForBilling',
  '@/lib/supabase#createScopedAdminContext',
  '@/lib/supabase/scoped-admin#createScopedAdminContext',
  '@/lib/supabase#resolveChildClinicInScope',
  '@/lib/supabase/scoped-admin#resolveChildClinicInScope',
  '@/lib/chat/scoped-session#resolveScopedChatSessionId',
  '@/lib/chat/scoped-session#resolveScopedAdminChatSessionId',
  '@/lib/supabase/scoped-admin#createPublicClinicContext',
]);
const CANONICAL_OPAQUE_MUTATION_CALLS = new Set([
  '@/lib/monitoring/sentry#createSentryTestEvent',
  '@/lib/notifications/reservation-notifications#enqueuePublicReservationNotifications',
]);

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
    ['insert', /(?:\.insert|\[['"]insert['"]\])\s*\(/],
    ['update', /(?:\.update|\[['"]update['"]\])\s*\(/],
    ['delete', /(?:\.delete|\[['"]delete['"]\])\s*\(/],
    ['upsert', /(?:\.upsert|\[['"]upsert['"]\])\s*\(/],
    ['rpc', /(?:\.rpc|\[['"]rpc['"]\])\s*\(/],
  ],
  sideEffectCall: [
    ['processEmailOutbox', /\bprocessEmailOutbox\s*\(/],
    ['processLineOutbox', /\bprocessLineOutbox\s*\(/],
    ['processReservationReminders', /\bprocessReservationReminders\s*\(/],
  ],
};

const EVIDENCE_HINT_MARKERS = {
  clinicScope: [['clinic_id query predicate', /\.eq\s*\(\s*['"]clinic_id['"]/]],
  validation: [['generic parse call', /\.parse\s*\(/]],
  idempotency: [['upsert call', /\.upsert\s*\(/]],
};

function parseArgs(argv) {
  const args = {
    sourceRoot: DEFAULT_SOURCE_ROOT,
    output: DEFAULT_OUTPUT,
    policy: DEFAULT_POLICY,
    mode: 'stdout',
    observedOnly: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--source-root') {
      args.sourceRoot = path.resolve(argv[++index]);
    } else if (value === '--output') {
      args.output = path.resolve(argv[++index]);
    } else if (value === '--policy') {
      args.policy = path.resolve(argv[++index]);
    } else if (value === '--write') {
      args.mode = 'write';
    } else if (value === '--check') {
      args.mode = 'check';
    } else if (value === '--stdout') {
      args.mode = 'stdout';
    } else if (value === '--observed-only') {
      args.observedOnly = true;
    } else {
      throw new Error('Unknown argument: ' + value);
    }
  }

  if (args.observedOnly && args.mode !== 'stdout') {
    throw new Error('--observed-only is only allowed with --stdout');
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

function getImportBindings(sourceFile) {
  const bindings = new Map();

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.importClause
    ) {
      continue;
    }

    const moduleName = statement.moduleSpecifier.text;
    const importClause = statement.importClause;
    if (importClause.name) {
      bindings.set(importClause.name.text, {
        moduleName,
        importedName: 'default',
        localNode: importClause.name,
      });
    }

    const namedBindings = importClause.namedBindings;
    if (namedBindings && ts.isNamedImports(namedBindings)) {
      for (const element of namedBindings.elements) {
        bindings.set(element.name.text, {
          moduleName,
          importedName: element.propertyName?.text ?? element.name.text,
          localNode: element.name,
        });
      }
    } else if (namedBindings && ts.isNamespaceImport(namedBindings)) {
      bindings.set(namedBindings.name.text, {
        moduleName,
        importedName: '*',
        localNode: namedBindings.name,
      });
    }
  }

  return bindings;
}

function unwrapExpression(expression) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function getIdentifierValueSymbol(checker, identifier) {
  if (
    ts.isShorthandPropertyAssignment(identifier.parent) &&
    identifier.parent.name === identifier
  ) {
    return (
      checker.getShorthandAssignmentValueSymbol(identifier.parent) ??
      checker.getSymbolAtLocation(identifier)
    );
  }
  return checker.getSymbolAtLocation(identifier);
}

function getObjectProperty(expression, propertyName) {
  if (!expression) return undefined;
  const unwrapped = unwrapExpression(expression);
  if (!ts.isObjectLiteralExpression(unwrapped)) return undefined;

  let resolved;
  for (const property of unwrapped.properties) {
    // Security options must be statically unambiguous. A spread or computed
    // property can override an earlier literal at runtime, so reject the
    // entire lookup instead of trusting source-order text.
    if (
      ts.isSpreadAssignment(property) ||
      ('name' in property && ts.isComputedPropertyName(property.name))
    ) {
      return undefined;
    }
    if (
      ts.isShorthandPropertyAssignment(property) &&
      property.name.text === propertyName
    ) {
      resolved = property.name;
      continue;
    }
    if (!ts.isPropertyAssignment(property)) continue;
    const name = property.name;
    const text =
      ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;
    if (text === propertyName) {
      resolved = unwrapExpression(property.initializer);
    }
  }

  return resolved;
}

function isTrueLiteral(expression) {
  return expression?.kind === ts.SyntaxKind.TrueKeyword;
}

function isExactImportIdentifier(checker, identifier, binding) {
  if (!binding) return false;
  const identifierSymbol = checker.getSymbolAtLocation(identifier);
  const importSymbol = checker.getSymbolAtLocation(binding.localNode);
  return Boolean(
    identifierSymbol && importSymbol && identifierSymbol === importSymbol
  );
}

function exactImportedCallKey(checker, call) {
  const callee = unwrapExpression(call.expression);
  const imports = getImportBindings(call.getSourceFile());
  if (ts.isIdentifier(callee)) {
    const binding = imports.get(callee.text);
    return isExactImportIdentifier(checker, callee, binding)
      ? binding.moduleName + '#' + binding.importedName
      : undefined;
  }
  if (!ts.isPropertyAccessExpression(callee)) return undefined;
  const receiver = unwrapExpression(callee.expression);
  if (!ts.isIdentifier(receiver)) return undefined;
  const binding = imports.get(receiver.text);
  return binding?.importedName === '*' &&
    isExactImportIdentifier(checker, receiver, binding)
    ? binding.moduleName + '#' + callee.name.text
    : undefined;
}

function isCanonicalPolicyEvidenceCall(checker, call) {
  const key = exactImportedCallKey(checker, call);
  return Boolean(key && CANONICAL_POLICY_EVIDENCE_CALLS.has(key));
}

function namedFunctionBoundary(node) {
  const boundary = findContainingFunction(node);
  if (!boundary) return undefined;
  if (ts.isFunctionDeclaration(boundary) && boundary.name) {
    return boundary.name.text;
  }
  if (
    (ts.isArrowFunction(boundary) || ts.isFunctionExpression(boundary)) &&
    ts.isVariableDeclaration(boundary.parent) &&
    ts.isIdentifier(boundary.parent.name)
  ) {
    return boundary.parent.name.text;
  }
  return undefined;
}

function canonicalExternalMutationShape(call) {
  const callee = unwrapExpression(call.expression);
  if (!ts.isPropertyAccessExpression(callee)) return undefined;
  const collectionAccess = unwrapExpression(callee.expression);
  if (!ts.isPropertyAccessExpression(collectionAccess)) return undefined;
  const sourcePath = normalizePath(
    path.relative(REPO_ROOT, call.getSourceFile().fileName)
  );
  const boundaryName = namedFunctionBoundary(call);

  if (
    sourcePath === 'src/lib/billing/upgrade.ts' &&
    boundaryName === 'upgradeSingleToGroupSubscription' &&
    collectionAccess.name.text === 'subscriptions' &&
    callee.name.text === 'update'
  ) {
    return { payloadIndex: 1, resourceIdIndex: 0 };
  }
  if (
    sourcePath === 'src/lib/billing/tenant-activation.ts' &&
    boundaryName === 'ensureStripeStoreAddOnQuantity' &&
    collectionAccess.name.text === 'subscriptionItems' &&
    ['create', 'update'].includes(callee.name.text)
  ) {
    return {
      payloadIndex: callee.name.text === 'create' ? 0 : 1,
      resourceIdIndex: callee.name.text === 'create' ? undefined : 0,
      resourceProperty:
        callee.name.text === 'create' ? 'subscription' : undefined,
    };
  }
  return undefined;
}

function isCanonicalOpaqueMutationCall(checker, call) {
  if (canonicalExternalMutationShape(call)) return true;
  const directKey = exactImportedCallKey(checker, call);
  if (directKey && CANONICAL_OPAQUE_MUTATION_CALLS.has(directKey)) return true;

  const callee = unwrapExpression(call.expression);
  if (!ts.isPropertyAccessExpression(callee)) return false;
  const receiver = unwrapExpression(callee.expression);
  if (!ts.isIdentifier(receiver)) return false;
  const imports = getImportBindings(call.getSourceFile());
  const binding = imports.get(receiver.text);
  return Boolean(
    isExactImportIdentifier(checker, receiver, binding) &&
    binding?.moduleName === '@/lib/rate-limiting/rate-limiter' &&
    binding.importedName === 'rateLimiter' &&
    ['resetRateLimit', 'addToWhitelist'].includes(callee.name.text)
  );
}

function resolveCalledLocalDeclaration(
  checker,
  identifier,
  sourceFile,
  visitedSymbols = new Set()
) {
  const symbol = checker.getSymbolAtLocation(identifier);
  if (!symbol) return undefined;
  const target = resolveTargetSymbol(checker, symbol);
  if (visitedSymbols.has(target)) return undefined;
  const nextVisitedSymbols = new Set(visitedSymbols);
  nextVisitedSymbols.add(target);

  const directDeclaration = (target.declarations ?? []).find(declaration => {
    if (declaration.getSourceFile() !== sourceFile) return false;
    if (ts.isFunctionDeclaration(declaration)) return true;
    if (!ts.isVariableDeclaration(declaration) || !declaration.initializer) {
      return false;
    }
    const initializer = unwrapExpression(declaration.initializer);
    return (
      ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)
    );
  });
  if (directDeclaration) return directDeclaration;

  for (const declaration of target.declarations ?? []) {
    if (
      declaration.getSourceFile() !== sourceFile ||
      !ts.isVariableDeclaration(declaration) ||
      !declaration.initializer ||
      !isConstVariableDeclaration(declaration)
    ) {
      continue;
    }
    const initializer = unwrapExpression(declaration.initializer);
    if (ts.isIdentifier(initializer)) {
      const resolved = resolveCalledLocalDeclaration(
        checker,
        initializer,
        sourceFile,
        nextVisitedSymbols
      );
      if (resolved) return resolved;
    }
    if (ts.isCallExpression(initializer)) {
      const callee = unwrapExpression(initializer.expression);
      if (
        ts.isPropertyAccessExpression(callee) &&
        callee.name.text === 'bind'
      ) {
        const receiver = unwrapExpression(callee.expression);
        if (ts.isIdentifier(receiver)) {
          const resolved = resolveCalledLocalDeclaration(
            checker,
            receiver,
            sourceFile,
            nextVisitedSymbols
          );
          if (resolved) return resolved;
        }
      }
    }
  }
  return undefined;
}

function isRepositoryCallableDeclaration(declaration) {
  const declarationSource = declaration.getSourceFile();
  const normalizedSourcePath = normalizePath(
    path.resolve(declarationSource.fileName)
  );
  if (
    declarationSource.isDeclarationFile ||
    !normalizedSourcePath.startsWith(normalizePath(REPO_ROOT + path.sep)) ||
    normalizedSourcePath.includes('/node_modules/')
  ) {
    return false;
  }
  if (ts.isFunctionLike(declaration) && declaration.body) return true;
  if (!ts.isVariableDeclaration(declaration) || !declaration.initializer) {
    return false;
  }
  const initializer = unwrapExpression(declaration.initializer);
  return (
    (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) &&
    Boolean(initializer.body)
  );
}

function resolveCalledRepositoryDeclarations(
  checker,
  expression,
  visitedSymbols = new Set(),
  depth = 0
) {
  if (!expression || depth > 16) return [];
  const unwrapped = unwrapExpression(expression);

  if (
    ts.isPropertyAccessExpression(unwrapped) &&
    ['call', 'apply', 'bind'].includes(unwrapped.name.text)
  ) {
    return resolveCalledRepositoryDeclarations(
      checker,
      unwrapped.expression,
      visitedSymbols,
      depth + 1
    );
  }

  const symbol =
    ts.isPropertyAccessExpression(unwrapped) ||
    ts.isElementAccessExpression(unwrapped)
      ? checker.getSymbolAtLocation(unwrapped.name ?? unwrapped)
      : ts.isIdentifier(unwrapped)
        ? checker.getSymbolAtLocation(unwrapped)
        : undefined;
  if (!symbol) return [];
  const target = resolveTargetSymbol(checker, symbol);
  if (visitedSymbols.has(target)) return [];
  const nextVisitedSymbols = new Set(visitedSymbols);
  nextVisitedSymbols.add(target);

  const declarations = [];
  for (const declaration of target.declarations ?? []) {
    if (isRepositoryCallableDeclaration(declaration)) {
      declarations.push(declaration);
      continue;
    }
    if (
      !ts.isVariableDeclaration(declaration) ||
      !declaration.initializer ||
      !isConstVariableDeclaration(declaration)
    ) {
      continue;
    }
    const initializer = unwrapExpression(declaration.initializer);
    if (
      ts.isIdentifier(initializer) ||
      ts.isPropertyAccessExpression(initializer) ||
      ts.isElementAccessExpression(initializer)
    ) {
      declarations.push(
        ...resolveCalledRepositoryDeclarations(
          checker,
          initializer,
          nextVisitedSymbols,
          depth + 1
        )
      );
    }
  }

  return Array.from(new Set(declarations));
}

function findContainingFunction(node) {
  let current = node.parent;
  while (current) {
    if (ts.isFunctionLike(current)) return current;
    current = current.parent;
  }
  return undefined;
}

function isConditionallyExecuted(node, boundary) {
  let current = node.parent;
  while (current && current !== boundary) {
    if (
      ts.isIfStatement(current) ||
      ts.isConditionalExpression(current) ||
      ts.isIterationStatement(current, false) ||
      ts.isCatchClause(current) ||
      ts.isCaseClause(current) ||
      ts.isDefaultClause(current) ||
      (ts.isBinaryExpression(current) &&
        [
          ts.SyntaxKind.AmpersandAmpersandToken,
          ts.SyntaxKind.BarBarToken,
          ts.SyntaxKind.QuestionQuestionToken,
        ].includes(current.operatorToken.kind))
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function isWriteLikeCall(call) {
  const expression = unwrapExpression(call.expression);
  const writeMethods = new Set([
    ...PERSISTENT_DATA_METHODS,
    ...AUDIT_LOGGER_PERSISTED_METHODS,
  ]);
  if (ts.isPropertyAccessExpression(expression)) {
    return writeMethods.has(expression.name.text);
  }
  if (ts.isElementAccessExpression(expression)) {
    const property = unwrapExpression(expression.argumentExpression);
    return ts.isStringLiteral(property) && writeMethods.has(property.text);
  }
  if (!ts.isIdentifier(expression)) return false;
  return [
    'processEmailOutbox',
    'processLineOutbox',
    'processReservationReminders',
  ].includes(expression.text);
}

function semanticWriteMethodName(checker, call) {
  const expression = unwrapExpression(call.expression);
  let methodName;
  let methodNode;
  if (ts.isPropertyAccessExpression(expression)) {
    methodName = expression.name.text;
    methodNode = expression.name;
  } else if (ts.isElementAccessExpression(expression)) {
    const property = unwrapExpression(expression.argumentExpression);
    if (ts.isStringLiteral(property)) {
      methodName = property.text;
      methodNode = expression;
    }
  }

  if (!methodName) {
    return isWriteLikeCall(call) ? 'side-effect-call' : undefined;
  }
  if (AUDIT_LOGGER_PERSISTED_METHODS.has(methodName)) return methodName;
  if (!PERSISTENT_DATA_METHODS.has(methodName)) return undefined;

  const methodSymbol = methodNode
    ? checker.getSymbolAtLocation(methodNode)
    : undefined;
  if (!methodSymbol) return methodName;
  const target = resolveTargetSymbol(checker, methodSymbol);
  const declarations = target.declarations ?? [];
  if (declarations.length === 0) return methodName;
  const declarationPaths = declarations.map(declaration =>
    normalizePath(path.resolve(declaration.getSourceFile().fileName))
  );
  const hasRepositoryDeclaration = declarationPaths.some(
    declarationPath =>
      declarationPath.startsWith(normalizePath(REPO_ROOT + path.sep)) &&
      !declarationPath.includes('/node_modules/')
  );
  const hasSupabaseDeclaration = declarationPaths.some(
    declarationPath =>
      declarationPath.includes('/@supabase/') ||
      declarationPath.includes('/postgrest-js/')
  );
  return hasRepositoryDeclaration || hasSupabaseDeclaration
    ? methodName
    : undefined;
}

function isSemanticWriteLikeCall(checker, call) {
  return semanticWriteMethodName(checker, call) !== undefined;
}

function isNodeWithin(node, container) {
  return (
    node.getStart() >= container.getStart() &&
    node.getEnd() <= container.getEnd()
  );
}

function canEarlierNodeReachLaterNode(earlier, later, boundary) {
  let current = earlier.parent;
  while (current && current !== boundary) {
    if (ts.isIfStatement(current)) {
      const inThen = isNodeWithin(earlier, current.thenStatement);
      const inElse = Boolean(
        current.elseStatement && isNodeWithin(earlier, current.elseStatement)
      );
      if (inThen || inElse) {
        const branch = inThen ? current.thenStatement : current.elseStatement;
        const oppositeBranch = inThen
          ? current.elseStatement
          : current.thenStatement;
        if (oppositeBranch && isNodeWithin(later, oppositeBranch)) return false;
        if (
          branch &&
          !isNodeWithin(later, branch) &&
          statementAlwaysTerminates(branch)
        ) {
          return false;
        }
      }
    }
    current = current.parent;
  }
  return true;
}

function inlineFunctionInvocationCall(functionNode) {
  let current = functionNode;
  while (
    current.parent &&
    (ts.isParenthesizedExpression(current.parent) ||
      ts.isAsExpression(current.parent) ||
      ts.isSatisfiesExpression(current.parent) ||
      ts.isNonNullExpression(current.parent))
  ) {
    current = current.parent;
  }
  const parent = current.parent;
  if (!parent || !ts.isCallExpression(parent)) return undefined;
  return parent.expression === current || parent.arguments.includes(current)
    ? parent
    : undefined;
}

function callMayInvokeCallbackArguments(call) {
  const callee = unwrapExpression(call.expression);
  if (!ts.isPropertyAccessExpression(callee)) return false;
  return new Set([
    'map',
    'flatMap',
    'forEach',
    'reduce',
    'reduceRight',
    'filter',
    'find',
    'findIndex',
    'some',
    'every',
    'then',
    'catch',
    'finally',
  ]).has(callee.name.text);
}

function syntacticNamedCallbackMayWrite(identifier, visitedNames = new Set()) {
  const callbackName = identifier.text;
  if (visitedNames.has(callbackName)) return false;
  const nextVisitedNames = new Set(visitedNames);
  nextVisitedNames.add(callbackName);
  const sourceFile = identifier.getSourceFile();
  const declarations = [];
  let aliasMayWrite = false;

  function collect(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === callbackName) {
      declarations.push(node);
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === callbackName &&
      node.initializer
    ) {
      const initializer = unwrapExpression(node.initializer);
      if (
        ts.isArrowFunction(initializer) ||
        ts.isFunctionExpression(initializer)
      ) {
        declarations.push(node);
      } else if (
        ts.isIdentifier(initializer) &&
        syntacticNamedCallbackMayWrite(initializer, nextVisitedNames)
      ) {
        aliasMayWrite = true;
      } else if (ts.isCallExpression(initializer)) {
        const callee = unwrapExpression(initializer.expression);
        if (
          ts.isPropertyAccessExpression(callee) &&
          callee.name.text === 'bind'
        ) {
          const receiver = unwrapExpression(callee.expression);
          if (
            ts.isIdentifier(receiver) &&
            syntacticNamedCallbackMayWrite(receiver, nextVisitedNames)
          ) {
            aliasMayWrite = true;
          }
        }
      }
    }
    ts.forEachChild(node, collect);
  }
  collect(sourceFile);

  return (
    aliasMayWrite ||
    declarations.some(declaration => {
      const traversalRoot = getFunctionBody(declaration) ?? declaration;
      let found = false;
      function visit(node) {
        if (found) return;
        if (node !== traversalRoot && ts.isFunctionLike(node)) return;
        if (ts.isCallExpression(node)) {
          if (isWriteLikeCall(node)) {
            found = true;
            return;
          }
          const callee = unwrapExpression(node.expression);
          if (
            ts.isIdentifier(callee) &&
            syntacticNamedCallbackMayWrite(callee, nextVisitedNames)
          ) {
            found = true;
            return;
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(traversalRoot);
      return found;
    })
  );
}

function containsWriteBefore(boundary, targetNode) {
  let found = false;

  function visit(node) {
    if (found) return;
    if (
      node !== boundary &&
      ts.isFunctionLike(node) &&
      !inlineFunctionInvocationCall(node)
    ) {
      return;
    }
    if (ts.isCallExpression(node) && node.getStart() < targetNode.getStart()) {
      const invokesWritingCallback =
        callMayInvokeCallbackArguments(node) &&
        node.arguments.some(argument => {
          const candidate = unwrapExpression(argument);
          return (
            ts.isIdentifier(candidate) &&
            syntacticNamedCallbackMayWrite(candidate)
          );
        });
      if (
        (isWriteLikeCall(node) || invokesWritingCallback) &&
        canEarlierNodeReachLaterNode(node, targetNode, boundary)
      ) {
        found = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(boundary);
  return found;
}

function isAwaitedCall(call) {
  let current = call.parent;
  while (
    current &&
    (ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isNonNullExpression(current))
  ) {
    current = current.parent;
  }
  return Boolean(current && ts.isAwaitExpression(current));
}

function isUnconditionalPreWriteCall(call, requireAwait = false) {
  const boundary = findContainingFunction(call);
  return Boolean(
    boundary &&
    (!requireAwait || isAwaitedCall(call)) &&
    !isConditionallyExecuted(call, boundary) &&
    !containsWriteBefore(boundary, call)
  );
}

function isPreWriteCall(call) {
  const boundary = findContainingFunction(call);
  return Boolean(boundary && !containsWriteBefore(boundary, call));
}

function isAwaitedPreWriteCall(call) {
  return isAwaitedCall(call) && isPreWriteCall(call);
}

function throwingCallFailsClosed(call) {
  const boundary = findContainingFunction(call);
  let current = call.parent;
  while (current && current !== boundary) {
    if (
      ts.isTryStatement(current) &&
      isNodeWithin(call, current.tryBlock) &&
      current.catchClause &&
      !statementAlwaysTerminates(current.catchClause.block)
    ) {
      return false;
    }
    current = current.parent;
  }
  return true;
}

function statementAlwaysTerminates(statement) {
  if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) {
    return true;
  }
  if (ts.isBlock(statement)) {
    return statement.statements.some(statementAlwaysTerminates);
  }
  if (ts.isIfStatement(statement) && statement.elseStatement) {
    return (
      statementAlwaysTerminates(statement.thenStatement) &&
      statementAlwaysTerminates(statement.elseStatement)
    );
  }
  return false;
}

function conditionRejectsResult(checker, condition, resultSymbol, properties) {
  const unwrapped = unwrapExpression(condition);

  function isResultReference(expression) {
    const candidate = unwrapExpression(expression);
    if (ts.isIdentifier(candidate)) {
      return (
        properties.length === 0 &&
        checker.getSymbolAtLocation(candidate) === resultSymbol
      );
    }
    if (!ts.isPropertyAccessExpression(candidate)) return false;
    const receiver = unwrapExpression(candidate.expression);
    return (
      ts.isIdentifier(receiver) &&
      checker.getSymbolAtLocation(receiver) === resultSymbol &&
      properties.includes(candidate.name.text)
    );
  }

  if (
    ts.isPrefixUnaryExpression(unwrapped) &&
    unwrapped.operator === ts.SyntaxKind.ExclamationToken
  ) {
    return isResultReference(unwrapped.operand);
  }
  if (
    ts.isBinaryExpression(unwrapped) &&
    [
      ts.SyntaxKind.EqualsEqualsEqualsToken,
      ts.SyntaxKind.EqualsEqualsToken,
    ].includes(unwrapped.operatorToken.kind)
  ) {
    return (
      (isResultReference(unwrapped.left) &&
        unwrapped.right.kind === ts.SyntaxKind.FalseKeyword) ||
      (isResultReference(unwrapped.right) &&
        unwrapped.left.kind === ts.SyntaxKind.FalseKeyword)
    );
  }
  return false;
}

function callIsDirectExpressionValue(call, expression) {
  let current = call;
  while (current !== expression && current.parent) {
    const parent = current.parent;
    if (
      (ts.isAwaitExpression(parent) ||
        ts.isParenthesizedExpression(parent) ||
        ts.isAsExpression(parent) ||
        ts.isSatisfiesExpression(parent) ||
        ts.isNonNullExpression(parent)) &&
      parent.expression === current
    ) {
      current = parent;
      continue;
    }
    return false;
  }
  return current === expression;
}

function isStaticScopeFallback(expression) {
  const unwrapped = unwrapExpression(expression);
  return (
    unwrapped.kind === ts.SyntaxKind.NullKeyword ||
    (ts.isIdentifier(unwrapped) && unwrapped.text === 'undefined') ||
    (ts.isArrayLiteralExpression(unwrapped) && unwrapped.elements.length === 0)
  );
}

function callIsSafeScopeExpressionValue(checker, call, expression) {
  let current = call;
  while (current !== expression && current.parent) {
    const parent = current.parent;
    if (
      (ts.isAwaitExpression(parent) ||
        ts.isParenthesizedExpression(parent) ||
        ts.isAsExpression(parent) ||
        ts.isSatisfiesExpression(parent) ||
        ts.isNonNullExpression(parent)) &&
      parent.expression === current
    ) {
      current = parent;
      continue;
    }
    if (ts.isElementAccessExpression(parent) && parent.expression === current) {
      current = parent;
      continue;
    }
    if (
      ts.isPropertyAccessExpression(parent) &&
      parent.expression === current &&
      parent.name.text === 'slice' &&
      ts.isCallExpression(parent.parent) &&
      parent.parent.expression === parent
    ) {
      current = parent.parent;
      continue;
    }
    if (
      ts.isBinaryExpression(parent) &&
      parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
      parent.left === current &&
      isStaticScopeFallback(parent.right)
    ) {
      current = parent;
      continue;
    }
    if (ts.isConditionalExpression(parent)) {
      const otherBranch =
        parent.whenTrue === current
          ? parent.whenFalse
          : parent.whenFalse === current
            ? parent.whenTrue
            : undefined;
      if (otherBranch && isStaticScopeFallback(otherBranch)) {
        current = parent;
        continue;
      }
    }
    if (
      ts.isNewExpression(parent) &&
      parent.arguments?.length === 1 &&
      parent.arguments[0] === current &&
      isExactGlobalBuiltinIdentifier(
        checker,
        unwrapExpression(parent.expression),
        'Set'
      )
    ) {
      current = parent;
      continue;
    }
    if (
      ts.isCallExpression(parent) &&
      parent.arguments.length === 1 &&
      parent.arguments[0] === current
    ) {
      const callee = unwrapExpression(parent.expression);
      if (
        ts.isPropertyAccessExpression(callee) &&
        callee.name.text === 'from' &&
        isExactGlobalBuiltinIdentifier(
          checker,
          unwrapExpression(callee.expression),
          'Array'
        )
      ) {
        current = parent;
        continue;
      }
    }
    return false;
  }
  return current === expression;
}

function findVariableDeclarationForCall(
  checker,
  call,
  allowSafeScopeTransforms = false
) {
  let current = call.parent;
  while (current && !ts.isStatement(current)) {
    if (ts.isVariableDeclaration(current)) {
      return current.initializer &&
        (callIsDirectExpressionValue(call, current.initializer) ||
          (allowSafeScopeTransforms &&
            callIsSafeScopeExpressionValue(checker, call, current.initializer)))
        ? current
        : undefined;
    }
    current = current.parent;
  }
  return undefined;
}

function hasFailClosedResultHandling(
  checker,
  call,
  properties,
  requireAwait = false
) {
  const boundary = findContainingFunction(call);
  if (!isUnconditionalPreWriteCall(call, requireAwait) || !boundary) {
    return false;
  }

  const declaration = findVariableDeclarationForCall(checker, call);
  if (!declaration || !ts.isIdentifier(declaration.name)) return false;
  const resultSymbol = checker.getSymbolAtLocation(declaration.name);
  if (!resultSymbol) return false;

  const variableStatement = declaration.parent?.parent;
  if (!variableStatement || !ts.isVariableStatement(variableStatement)) {
    return false;
  }
  const block = variableStatement.parent;
  if (!ts.isBlock(block)) return false;
  const declarationIndex = block.statements.indexOf(variableStatement);
  if (declarationIndex < 0) return false;

  for (const statement of block.statements.slice(declarationIndex + 1)) {
    if (
      ts.isIfStatement(statement) &&
      conditionRejectsResult(
        checker,
        statement.expression,
        resultSymbol,
        properties
      ) &&
      statementAlwaysTerminates(statement.thenStatement)
    ) {
      return statement;
    }
    if (nodeReferencesSymbol(checker, statement, resultSymbol)) {
      return false;
    }
    let hasWrite = false;
    function inspect(node) {
      if (hasWrite) return;
      if (node !== statement && ts.isFunctionLike(node)) return;
      if (ts.isCallExpression(node) && isWriteLikeCall(node)) {
        hasWrite = true;
        return;
      }
      ts.forEachChild(node, inspect);
    }
    inspect(statement);
    if (hasWrite) return false;
  }
  return false;
}

function conditionMatchesResultPropertyLiteral(
  checker,
  condition,
  resultSymbol,
  propertyName,
  expectedLiteral
) {
  const unwrapped = unwrapExpression(condition);
  if (
    !ts.isBinaryExpression(unwrapped) ||
    ![
      ts.SyntaxKind.EqualsEqualsEqualsToken,
      ts.SyntaxKind.EqualsEqualsToken,
    ].includes(unwrapped.operatorToken.kind)
  ) {
    return false;
  }

  function isExpectedProperty(expression) {
    const candidate = unwrapExpression(expression);
    if (!ts.isPropertyAccessExpression(candidate)) return false;
    const receiver = unwrapExpression(candidate.expression);
    return (
      candidate.name.text === propertyName &&
      ts.isIdentifier(receiver) &&
      checker.getSymbolAtLocation(receiver) === resultSymbol
    );
  }

  function isExpectedLiteral(expression) {
    const candidate = unwrapExpression(expression);
    return ts.isStringLiteral(candidate) && candidate.text === expectedLiteral;
  }

  return (
    (isExpectedProperty(unwrapped.left) &&
      isExpectedLiteral(unwrapped.right)) ||
    (isExpectedProperty(unwrapped.right) && isExpectedLiteral(unwrapped.left))
  );
}

function hasDiscriminatedResultGuards(
  checker,
  call,
  propertyName,
  rejectedLiterals,
  isProcessingBoundary = () => false
) {
  if (!isUnconditionalPreWriteCall(call, true)) return false;
  const resultSymbol = callResultSymbol(checker, call);
  if (!resultSymbol) return false;

  const boundary = findContainingFunction(call);
  const body = boundary && getFunctionBody(boundary);
  if (!body || !ts.isBlock(body)) return false;
  const callStatementIndex = body.statements.findIndex(statement =>
    isNodeWithin(call, statement)
  );
  if (callStatementIndex < 0) return false;

  const guardedLiterals = new Set();
  let sawProcessingBoundary = false;
  const resultTarget = resolveTargetSymbol(checker, resultSymbol);
  const resultAliases = new Set([resultTarget]);
  for (const statement of body.statements.slice(callStatementIndex + 1)) {
    let foundAlias = true;
    while (foundAlias) {
      foundAlias = false;
      function collectAliases(node) {
        if (node !== statement && ts.isFunctionLike(node)) return;
        if (
          ts.isVariableDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          node.initializer &&
          isConstVariableDeclaration(node) &&
          Array.from(resultAliases).some(target =>
            expressionRootsAtSymbol(checker, node.initializer, target)
          )
        ) {
          const aliasSymbol = checker.getSymbolAtLocation(node.name);
          if (aliasSymbol) {
            const aliasTarget = resolveTargetSymbol(checker, aliasSymbol);
            if (!resultAliases.has(aliasTarget)) {
              resultAliases.add(aliasTarget);
              foundAlias = true;
            }
          }
        }
        ts.forEachChild(node, collectAliases);
      }
      collectAliases(statement);
    }
    if (
      Array.from(resultAliases).some(target =>
        nodeMutatesResolvedSymbol(checker, statement, target)
      )
    ) {
      return false;
    }
    if (
      ts.isIfStatement(statement) &&
      statementAlwaysTerminates(statement.thenStatement)
    ) {
      for (const literal of rejectedLiterals) {
        if (
          conditionMatchesResultPropertyLiteral(
            checker,
            statement.expression,
            resultSymbol,
            propertyName,
            literal
          )
        ) {
          guardedLiterals.add(literal);
        }
      }
    }
    let hasWrite = false;
    function inspect(node) {
      if (hasWrite) return;
      if (node !== statement && ts.isFunctionLike(node)) return;
      if (ts.isCallExpression(node)) {
        if (isProcessingBoundary(node)) {
          sawProcessingBoundary = true;
          hasWrite = true;
          return;
        }
        if (isWriteLikeCall(node)) {
          hasWrite = true;
          return;
        }
      }
      ts.forEachChild(node, inspect);
    }
    inspect(statement);
    if (hasWrite) break;
  }

  return (
    sawProcessingBoundary &&
    rejectedLiterals.every(literal => guardedLiterals.has(literal))
  );
}

function nodeMutatesResolvedSymbol(checker, node, targetSymbol) {
  let mutated = false;
  const mutatingMethods = new Set([
    'add',
    'clear',
    'copyWithin',
    'delete',
    'fill',
    'pop',
    'push',
    'reverse',
    'set',
    'shift',
    'sort',
    'splice',
    'unshift',
  ]);
  function visit(current) {
    if (mutated) return;
    if (current !== node && ts.isFunctionLike(current)) return;
    if (
      ts.isBinaryExpression(current) &&
      current.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      expressionRootsAtSymbol(checker, current.left, targetSymbol)
    ) {
      mutated = true;
      return;
    }
    if (
      ((ts.isPrefixUnaryExpression(current) &&
        [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(
          current.operator
        )) ||
        ts.isPostfixUnaryExpression(current)) &&
      expressionRootsAtSymbol(checker, current.operand, targetSymbol)
    ) {
      mutated = true;
      return;
    }
    if (ts.isCallExpression(current)) {
      const callee = unwrapExpression(current.expression);
      if (
        ts.isPropertyAccessExpression(callee) &&
        mutatingMethods.has(callee.name.text) &&
        expressionRootsAtSymbol(checker, callee.expression, targetSymbol)
      ) {
        mutated = true;
        return;
      }
      if (
        ts.isPropertyAccessExpression(callee) &&
        callee.name.text === 'assign' &&
        current.arguments[0] &&
        expressionRootsAtSymbol(checker, current.arguments[0], targetSymbol)
      ) {
        mutated = true;
        return;
      }
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
  return mutated;
}

function callableFunctionNode(declaration) {
  if (ts.isFunctionLike(declaration) && declaration.body) return declaration;
  if (!ts.isVariableDeclaration(declaration) || !declaration.initializer) {
    return undefined;
  }
  const initializer = unwrapExpression(declaration.initializer);
  return ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)
    ? initializer
    : undefined;
}

function repositoryCallArgumentMayMutate(
  checker,
  call,
  argumentIndex,
  visitedDeclarations = new Set(),
  depth = 0
) {
  if (depth > 12) return true;
  const argument = call.arguments[argumentIndex];
  if (!argument) return true;
  if (typeIsProvablyPrimitive(checker.getTypeAtLocation(argument))) {
    return false;
  }
  const declarations = resolveCalledRepositoryDeclarations(
    checker,
    call.expression
  );
  if (declarations.length === 0) return true;

  for (const declaration of declarations) {
    if (visitedDeclarations.has(declaration)) return true;
    const functionNode = callableFunctionNode(declaration);
    const parameter = functionNode?.parameters[argumentIndex];
    if (!functionNode || !parameter || !ts.isIdentifier(parameter.name)) {
      return true;
    }
    const parameterSymbol = checker.getSymbolAtLocation(parameter.name);
    if (!parameterSymbol) return true;
    const parameterTarget = resolveTargetSymbol(checker, parameterSymbol);
    if (
      nodeMutatesResolvedSymbol(checker, functionNode.body, parameterTarget)
    ) {
      return true;
    }

    const nextVisitedDeclarations = new Set(visitedDeclarations);
    nextVisitedDeclarations.add(declaration);
    let nestedMutation = false;
    function inspect(node) {
      if (nestedMutation) return;
      if (node !== functionNode.body && ts.isFunctionLike(node)) return;
      if (ts.isCallExpression(node)) {
        for (const [index, nestedArgument] of node.arguments.entries()) {
          if (
            expressionRootsAtSymbol(checker, nestedArgument, parameterTarget) &&
            repositoryCallArgumentMayMutate(
              checker,
              node,
              index,
              nextVisitedDeclarations,
              depth + 1
            )
          ) {
            nestedMutation = true;
            return;
          }
        }
      }
      ts.forEachChild(node, inspect);
    }
    inspect(functionNode.body);
    if (nestedMutation) return true;
  }

  return false;
}

function resolvesToCanonicalZodNamespace(
  checker,
  expression,
  imports,
  visitedSymbols = new Set(),
  depth = 0
) {
  if (!expression || depth > 12) return false;
  const unwrapped = unwrapExpression(expression);
  if (!ts.isIdentifier(unwrapped)) return false;
  const importBinding = imports.get(unwrapped.text);
  if (
    isExactImportIdentifier(checker, unwrapped, importBinding) &&
    importBinding.moduleName === 'zod' &&
    importBinding.importedName === 'z'
  ) {
    return true;
  }
  const symbol = getIdentifierValueSymbol(checker, unwrapped);
  if (!symbol) return false;
  const target = resolveTargetSymbol(checker, symbol);
  if (visitedSymbols.has(target)) return false;
  const nextVisitedSymbols = new Set(visitedSymbols);
  nextVisitedSymbols.add(target);
  return (target.declarations ?? []).some(
    declaration =>
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer &&
      isConstVariableDeclaration(declaration) &&
      resolvesToCanonicalZodNamespace(
        checker,
        declaration.initializer,
        getImportBindings(declaration.getSourceFile()),
        nextVisitedSymbols,
        depth + 1
      )
  );
}

function canonicalZodSchemaContainsUnsafeNode(
  checker,
  expression,
  imports,
  visitedSymbols = new Set(),
  depth = 0
) {
  if (!expression || depth > 64) return true;
  const unwrapped = unwrapExpression(expression);

  if (ts.isCallExpression(unwrapped)) {
    const callee = unwrapExpression(unwrapped.expression);
    if (ts.isPropertyAccessExpression(callee)) {
      const receiver = unwrapExpression(callee.expression);
      if (
        ['any', 'unknown'].includes(callee.name.text) &&
        resolvesToCanonicalZodNamespace(
          checker,
          receiver,
          imports,
          new Set(),
          depth + 1
        )
      ) {
        return true;
      }
    }
  }

  if (ts.isIdentifier(unwrapped)) {
    const binding = imports.get(unwrapped.text);
    if (
      isExactImportIdentifier(checker, unwrapped, binding) &&
      binding.moduleName === 'zod' &&
      binding.importedName === 'z'
    ) {
      return false;
    }
    const symbol = getIdentifierValueSymbol(checker, unwrapped);
    if (!symbol) return false;
    const target = resolveTargetSymbol(checker, symbol);
    if (visitedSymbols.has(target)) return false;
    const nextVisitedSymbols = new Set(visitedSymbols);
    nextVisitedSymbols.add(target);
    for (const declaration of target.declarations ?? []) {
      if (
        ts.isVariableDeclaration(declaration) &&
        declaration.initializer &&
        isConstVariableDeclaration(declaration) &&
        canonicalZodSchemaContainsUnsafeNode(
          checker,
          declaration.initializer,
          getImportBindings(declaration.getSourceFile()),
          nextVisitedSymbols,
          depth + 1
        )
      ) {
        return true;
      }
      if (
        ts.isFunctionDeclaration(declaration) &&
        declaration.body &&
        canonicalZodSchemaContainsUnsafeNode(
          checker,
          declaration.body,
          getImportBindings(declaration.getSourceFile()),
          nextVisitedSymbols,
          depth + 1
        )
      ) {
        return true;
      }
    }
    return false;
  }

  let unsafe = false;
  ts.forEachChild(unwrapped, child => {
    if (
      !unsafe &&
      canonicalZodSchemaContainsUnsafeNode(
        checker,
        child,
        imports,
        new Set(visitedSymbols),
        depth + 1
      )
    ) {
      unsafe = true;
    }
  });
  return unsafe;
}

function isCanonicalZodSchemaExpression(
  checker,
  expression,
  imports,
  visitedSymbols = new Set(),
  depth = 0
) {
  if (!expression || depth > 12) return false;
  if (
    canonicalZodSchemaContainsUnsafeNode(
      checker,
      expression,
      imports,
      new Set(),
      0
    )
  ) {
    return false;
  }
  const unwrapped = unwrapExpression(expression);

  if (ts.isIdentifier(unwrapped)) {
    const importBinding = imports.get(unwrapped.text);
    if (
      isExactImportIdentifier(checker, unwrapped, importBinding) &&
      importBinding.moduleName === 'zod' &&
      importBinding.importedName === 'z'
    ) {
      return true;
    }

    const symbol = getIdentifierValueSymbol(checker, unwrapped);
    if (!symbol) return false;
    const target = resolveTargetSymbol(checker, symbol);
    if (visitedSymbols.has(target)) return false;
    visitedSymbols.add(target);
    for (const declaration of target.declarations ?? []) {
      if (
        ts.isVariableDeclaration(declaration) &&
        declaration.initializer &&
        isConstVariableDeclaration(declaration) &&
        isCanonicalZodSchemaExpression(
          checker,
          declaration.initializer,
          getImportBindings(declaration.getSourceFile()),
          visitedSymbols,
          depth + 1
        )
      ) {
        return true;
      }
    }
    return false;
  }

  if (ts.isPropertyAccessExpression(unwrapped)) {
    return isCanonicalZodSchemaExpression(
      checker,
      unwrapped.expression,
      imports,
      visitedSymbols,
      depth + 1
    );
  }

  if (ts.isCallExpression(unwrapped)) {
    const callee = unwrapExpression(unwrapped.expression);
    if (ts.isPropertyAccessExpression(callee)) {
      const receiver = unwrapExpression(callee.expression);
      if (
        ['any', 'unknown'].includes(callee.name.text) &&
        resolvesToCanonicalZodNamespace(
          checker,
          receiver,
          imports,
          new Set(),
          depth + 1
        )
      ) {
        return false;
      }
      return isCanonicalZodSchemaExpression(
        checker,
        callee.expression,
        imports,
        visitedSymbols,
        depth + 1
      );
    }
    if (ts.isIdentifier(callee)) {
      const symbol = checker.getSymbolAtLocation(callee);
      if (!symbol) return false;
      const target = resolveTargetSymbol(checker, symbol);
      if (visitedSymbols.has(target)) return false;
      visitedSymbols.add(target);
      for (const declaration of target.declarations ?? []) {
        if (ts.isFunctionDeclaration(declaration) && declaration.body) {
          for (const statement of declaration.body.statements) {
            if (
              ts.isReturnStatement(statement) &&
              statement.expression &&
              isCanonicalZodSchemaExpression(
                checker,
                statement.expression,
                getImportBindings(declaration.getSourceFile()),
                visitedSymbols,
                depth + 1
              )
            ) {
              return true;
            }
          }
        }
        if (
          ts.isVariableDeclaration(declaration) &&
          declaration.initializer &&
          (ts.isArrowFunction(declaration.initializer) ||
            ts.isFunctionExpression(declaration.initializer))
        ) {
          const body = declaration.initializer.body;
          if (
            !ts.isBlock(body) &&
            isCanonicalZodSchemaExpression(
              checker,
              body,
              getImportBindings(declaration.getSourceFile()),
              visitedSymbols,
              depth + 1
            )
          ) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

function isDirectAuthorizationHeaderCall(checker, call, rootFunction) {
  const callee = unwrapExpression(call.expression);
  if (
    !ts.isPropertyAccessExpression(callee) ||
    callee.name.text !== 'get' ||
    !call.arguments[0] ||
    !ts.isStringLiteral(call.arguments[0]) ||
    call.arguments[0].text.toLowerCase() !== 'authorization'
  ) {
    return false;
  }
  const headersAccess = unwrapExpression(callee.expression);
  if (
    !ts.isPropertyAccessExpression(headersAccess) ||
    headersAccess.name.text !== 'headers'
  ) {
    return false;
  }
  const requestIdentifier = unwrapExpression(headersAccess.expression);
  if (!ts.isIdentifier(requestIdentifier)) return false;
  const requestSymbol = checker.getSymbolAtLocation(requestIdentifier);
  const requestParameter = rootFunction?.parameters[0];
  return Boolean(
    requestParameter &&
    requestSymbol?.declarations?.some(
      declaration => declaration === requestParameter
    ) &&
    symbolIsStableBeforeUse(
      checker,
      resolveTargetSymbol(checker, requestSymbol),
      call
    )
  );
}

function isDirectCronSecretExpression(checker, expression, sourceFile) {
  const unwrapped = unwrapExpression(expression);
  if (
    !ts.isPropertyAccessExpression(unwrapped) ||
    unwrapped.name.text !== 'CRON_SECRET' ||
    !ts.isPropertyAccessExpression(unwrapped.expression) ||
    unwrapped.expression.name.text !== 'env'
  ) {
    return false;
  }
  const processIdentifier = unwrapExpression(unwrapped.expression.expression);
  if (
    !ts.isIdentifier(processIdentifier) ||
    processIdentifier.text !== 'process'
  ) {
    return false;
  }
  const processSymbol = checker.getSymbolAtLocation(processIdentifier);
  return Boolean(
    processSymbol &&
    !(processSymbol.declarations ?? []).some(
      declaration => declaration.getSourceFile() === sourceFile
    )
  );
}

function nodeUsesSymbol(checker, node, symbol) {
  const unwrapped = unwrapExpression(node);
  return (
    ts.isIdentifier(unwrapped) &&
    checker.getSymbolAtLocation(unwrapped) === symbol
  );
}

function isMissingSecretPredicate(checker, condition, secretSymbol) {
  const unwrapped = unwrapExpression(condition);
  return (
    ts.isPrefixUnaryExpression(unwrapped) &&
    unwrapped.operator === ts.SyntaxKind.ExclamationToken &&
    nodeUsesSymbol(checker, unwrapped.operand, secretSymbol)
  );
}

function isBearerTemplateForSymbol(checker, expression, secretSymbol) {
  const unwrapped = unwrapExpression(expression);
  return (
    ts.isTemplateExpression(unwrapped) &&
    unwrapped.head.text === 'Bearer ' &&
    unwrapped.templateSpans.length === 1 &&
    nodeUsesSymbol(
      checker,
      unwrapped.templateSpans[0].expression,
      secretSymbol
    ) &&
    unwrapped.templateSpans[0].literal.text === ''
  );
}

function isBearerMismatchPredicate(
  checker,
  condition,
  headerSymbol,
  secretSymbol
) {
  const unwrapped = unwrapExpression(condition);
  return (
    ts.isBinaryExpression(unwrapped) &&
    unwrapped.operatorToken.kind ===
      ts.SyntaxKind.ExclamationEqualsEqualsToken &&
    ((nodeUsesSymbol(checker, unwrapped.left, headerSymbol) &&
      isBearerTemplateForSymbol(checker, unwrapped.right, secretSymbol)) ||
      (nodeUsesSymbol(checker, unwrapped.right, headerSymbol) &&
        isBearerTemplateForSymbol(checker, unwrapped.left, secretSymbol)))
  );
}

function flattenLogicalOr(expression) {
  const unwrapped = unwrapExpression(expression);
  if (
    ts.isBinaryExpression(unwrapped) &&
    unwrapped.operatorToken.kind === ts.SyntaxKind.BarBarToken
  ) {
    return [
      ...flattenLogicalOr(unwrapped.left),
      ...flattenLogicalOr(unwrapped.right),
    ];
  }
  return [unwrapped];
}

function conditionIsFailClosedCronGuard(
  checker,
  condition,
  headerSymbol,
  secretSymbol
) {
  const clauses = flattenLogicalOr(condition);
  return (
    clauses.some(clause =>
      isMissingSecretPredicate(checker, clause, secretSymbol)
    ) &&
    clauses.some(clause =>
      isBearerMismatchPredicate(checker, clause, headerSymbol, secretSymbol)
    )
  );
}

function containsStatus(node, expectedStatus) {
  let found = false;
  function visit(current) {
    if (found) return;
    if (
      ts.isNumericLiteral(current) &&
      current.text === String(expectedStatus)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
  return found;
}

function isDirectFixedResponseCall(checker, call, imports) {
  const callee = unwrapExpression(call.expression);
  if (ts.isIdentifier(callee)) {
    const binding = imports.get(callee.text);
    return (
      isExactImportIdentifier(checker, callee, binding) &&
      binding.moduleName === '@/lib/api-helpers' &&
      binding.importedName === 'createErrorResponse' &&
      call.arguments[1] !== undefined &&
      ts.isNumericLiteral(unwrapExpression(call.arguments[1])) &&
      ['405', '410'].includes(unwrapExpression(call.arguments[1]).text)
    );
  }
  if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== 'json') {
    return false;
  }
  const receiver = unwrapExpression(callee.expression);
  if (!ts.isIdentifier(receiver)) return false;
  const binding = imports.get(receiver.text);
  if (
    !isExactImportIdentifier(checker, receiver, binding) ||
    binding.moduleName !== 'next/server' ||
    binding.importedName !== 'NextResponse'
  ) {
    return false;
  }
  const init = getObjectProperty(call.arguments[1], 'status');
  return (
    init !== undefined &&
    ts.isNumericLiteral(init) &&
    ['405', '410'].includes(init.text)
  );
}

function getFunctionBody(node) {
  if (ts.isFunctionLike(node)) return node.body;
  if (!ts.isVariableDeclaration(node) || !node.initializer) return undefined;
  const initializer = unwrapExpression(node.initializer);
  return ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)
    ? initializer.body
    : undefined;
}

function hasDirectFixedNoMutationResponse(checker, startNode, imports) {
  const body = getFunctionBody(startNode);
  let expression;
  if (body && ts.isBlock(body)) {
    if (body.statements.length !== 1) return false;
    const statement = body.statements[0];
    if (!ts.isReturnStatement(statement) || !statement.expression) return false;
    expression = unwrapExpression(statement.expression);
  } else if (body) {
    expression = unwrapExpression(body);
  } else {
    return false;
  }

  return (
    ts.isCallExpression(expression) &&
    isDirectFixedResponseCall(checker, expression, imports)
  );
}

function collectStaticStringValues(
  checker,
  expression,
  visitedSymbols = new Set(),
  depth = 0
) {
  if (!expression || depth > 12) return undefined;
  const unwrapped = unwrapExpression(expression);
  if (ts.isStringLiteral(unwrapped)) {
    return [unwrapped.text];
  }
  if (ts.isArrayLiteralExpression(unwrapped)) {
    const values = [];
    for (const element of unwrapped.elements) {
      const elementValues = collectStaticStringValues(
        checker,
        ts.isSpreadElement(element) ? element.expression : element,
        visitedSymbols,
        depth + 1
      );
      if (!elementValues) return undefined;
      values.push(...elementValues);
    }
    return values;
  }
  if (ts.isCallExpression(unwrapped)) {
    const callee = unwrapExpression(unwrapped.expression);
    if (
      ts.isPropertyAccessExpression(callee) &&
      ts.isIdentifier(callee.expression) &&
      isExactGlobalBuiltinIdentifier(checker, callee.expression, 'Array') &&
      callee.name.text === 'from' &&
      unwrapped.arguments.length === 1
    ) {
      return collectStaticStringValues(
        checker,
        unwrapped.arguments[0],
        visitedSymbols,
        depth + 1
      );
    }
    return undefined;
  }
  if (
    ts.isNewExpression(unwrapped) &&
    ts.isIdentifier(unwrapExpression(unwrapped.expression)) &&
    isExactGlobalBuiltinIdentifier(
      checker,
      unwrapExpression(unwrapped.expression),
      'Set'
    ) &&
    unwrapped.arguments?.length === 1
  ) {
    return collectStaticStringValues(
      checker,
      unwrapped.arguments[0],
      visitedSymbols,
      depth + 1
    );
  }
  if (
    !ts.isIdentifier(unwrapped) &&
    !ts.isPropertyAccessExpression(unwrapped)
  ) {
    return undefined;
  }
  const symbol = checker.getSymbolAtLocation(unwrapped);
  if (!symbol) return undefined;
  const target = resolveTargetSymbol(checker, symbol);
  if (visitedSymbols.has(target)) return undefined;
  if (!symbolIsStableBeforeUse(checker, target, unwrapped)) return undefined;
  visitedSymbols.add(target);
  for (const declaration of target.declarations ?? []) {
    if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
      const values = collectStaticStringValues(
        checker,
        declaration.initializer,
        visitedSymbols,
        depth + 1
      );
      if (values) return values;
    }
  }
  return undefined;
}

function expressionContainsOnlyAdminRoles(checker, expression) {
  const values = collectStaticStringValues(checker, expression);
  return Boolean(
    values &&
    values.length > 0 &&
    values.every(value => ['admin', 'clinic_admin', 'manager'].includes(value))
  );
}

function resolveStaticBoolean(
  checker,
  expression,
  visitedSymbols = new Set(),
  depth = 0
) {
  if (!expression || depth > 12) return undefined;
  const unwrapped = unwrapExpression(expression);
  if (unwrapped.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (unwrapped.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (
    !ts.isIdentifier(unwrapped) &&
    !ts.isPropertyAccessExpression(unwrapped)
  ) {
    return undefined;
  }
  const symbol = checker.getSymbolAtLocation(unwrapped);
  if (!symbol) return undefined;
  const target = resolveTargetSymbol(checker, symbol);
  if (visitedSymbols.has(target)) return undefined;
  if (!symbolIsStableBeforeUse(checker, target, unwrapped)) return undefined;
  visitedSymbols.add(target);
  for (const declaration of target.declarations ?? []) {
    if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
      const value = resolveStaticBoolean(
        checker,
        declaration.initializer,
        visitedSymbols,
        depth + 1
      );
      if (value !== undefined) return value;
    }
  }
  return undefined;
}

function isConstVariableDeclaration(declaration) {
  return Boolean(
    ts.isVariableDeclarationList(declaration.parent) &&
    (declaration.parent.flags & ts.NodeFlags.Const) !== 0
  );
}

function isExactGlobalBuiltinIdentifier(checker, identifier, expectedName) {
  if (!ts.isIdentifier(identifier) || identifier.text !== expectedName) {
    return false;
  }
  const symbol = checker.getSymbolAtLocation(identifier);
  if (!symbol) return false;
  const target = resolveTargetSymbol(checker, symbol);
  const declarations = target.declarations ?? [];
  return (
    declarations.length > 0 &&
    declarations.every(
      declaration => declaration.getSourceFile().isDeclarationFile
    )
  );
}

function expressionRootsAtSymbol(checker, expression, targetSymbol) {
  const unwrapped = unwrapExpression(expression);
  if (ts.isIdentifier(unwrapped)) {
    const symbol = checker.getSymbolAtLocation(unwrapped);
    return Boolean(
      symbol && resolveTargetSymbol(checker, symbol) === targetSymbol
    );
  }
  if (
    ts.isPropertyAccessExpression(unwrapped) ||
    ts.isElementAccessExpression(unwrapped)
  ) {
    return expressionRootsAtSymbol(checker, unwrapped.expression, targetSymbol);
  }
  return false;
}

function symbolIsStableBeforeUse(checker, targetSymbol, useNode, sinceNode) {
  const variableDeclarations = (targetSymbol.declarations ?? []).filter(
    ts.isVariableDeclaration
  );
  if (
    !sinceNode &&
    variableDeclarations.length > 0 &&
    variableDeclarations.some(
      declaration => !isConstVariableDeclaration(declaration)
    )
  ) {
    return false;
  }

  const mutatingMethods = new Set([
    'add',
    'clear',
    'copyWithin',
    'delete',
    'fill',
    'pop',
    'push',
    'reverse',
    'set',
    'shift',
    'sort',
    'splice',
    'unshift',
  ]);
  const useSource = useNode.getSourceFile();
  const useBoundary = findContainingFunction(useNode);
  const sinceSource = sinceNode?.getSourceFile();
  const sources = new Set([
    useSource,
    ...(targetSymbol.declarations ?? []).map(declaration =>
      declaration.getSourceFile()
    ),
  ]);

  for (const source of sources) {
    let mutated = false;
    function visit(node) {
      if (mutated) return;
      if (source === useSource && node.getStart() >= useNode.getStart()) {
        return;
      }
      if (
        sinceNode &&
        source === sinceSource &&
        node.getEnd() <= sinceNode.getEnd()
      ) {
        return;
      }
      const containsOrigin = Boolean(
        sinceNode && source === sinceSource && isNodeWithin(sinceNode, node)
      );
      if (
        !containsOrigin &&
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        expressionRootsAtSymbol(checker, node.left, targetSymbol)
      ) {
        mutated = true;
        return;
      }
      if (
        !containsOrigin &&
        ts.isVariableDeclaration(node) &&
        node.initializer &&
        node.getEnd() <= useNode.getStart() &&
        expressionRootsAtSymbol(checker, node.initializer, targetSymbol) &&
        (!ts.isIdentifier(node.name) ||
          !checker.getSymbolAtLocation(node.name) ||
          resolveTargetSymbol(
            checker,
            checker.getSymbolAtLocation(node.name)
          ) !== targetSymbol)
      ) {
        mutated = true;
        return;
      }
      if (ts.isCallExpression(node)) {
        const callee = unwrapExpression(node.expression);
        if (
          ts.isPropertyAccessExpression(callee) &&
          mutatingMethods.has(callee.name.text) &&
          expressionRootsAtSymbol(checker, callee.expression, targetSymbol)
        ) {
          mutated = true;
          return;
        }
        if (
          !containsOrigin &&
          node.getEnd() <= useNode.getStart() &&
          node.arguments.some(argument =>
            expressionRootsAtSymbol(checker, argument, targetSymbol)
          )
        ) {
          const isGlobalArrayFromRead =
            ts.isPropertyAccessExpression(callee) &&
            callee.name.text === 'from' &&
            isExactGlobalBuiltinIdentifier(
              checker,
              unwrapExpression(callee.expression),
              'Array'
            );
          const isKnownGlobalMutation =
            ts.isPropertyAccessExpression(callee) &&
            ((callee.name.text === 'assign' &&
              isExactGlobalBuiltinIdentifier(
                checker,
                unwrapExpression(callee.expression),
                'Object'
              )) ||
              (callee.name.text === 'set' &&
                isExactGlobalBuiltinIdentifier(
                  checker,
                  unwrapExpression(callee.expression),
                  'Reflect'
                )));
          const potentiallyMutatingArgumentIndexes = node.arguments.flatMap(
            (argument, index) =>
              expressionRootsAtSymbol(checker, argument, targetSymbol) &&
              !typeIsProvablyPrimitive(checker.getTypeAtLocation(argument))
                ? [index]
                : []
          );
          const repositoryCallMayMutate =
            potentiallyMutatingArgumentIndexes.length > 0 &&
            potentiallyMutatingArgumentIndexes.some(index =>
              repositoryCallArgumentMayMutate(checker, node, index)
            );
          if (
            !isGlobalArrayFromRead &&
            (isKnownGlobalMutation ||
              (useBoundary &&
                findContainingFunction(node) === useBoundary &&
                repositoryCallMayMutate))
          ) {
            mutated = true;
            return;
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    if (mutated) return false;
  }
  return true;
}

function symbolHasNoDirectMutationBeforeUse(
  checker,
  targetSymbol,
  useNode,
  sinceNode
) {
  const boundary = findContainingFunction(useNode);
  if (!boundary) return false;
  const mutatingMethods = new Set([
    'add',
    'clear',
    'copyWithin',
    'delete',
    'fill',
    'pop',
    'push',
    'reverse',
    'set',
    'shift',
    'sort',
    'splice',
    'unshift',
  ]);
  let mutated = false;

  function visit(node) {
    if (mutated) return;
    if (node !== boundary && ts.isFunctionLike(node)) return;
    if (node.getStart() >= useNode.getStart()) return;
    if (sinceNode && node.getEnd() <= sinceNode.getEnd()) return;
    const containsOrigin = Boolean(sinceNode && isNodeWithin(sinceNode, node));

    if (
      !containsOrigin &&
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      expressionRootsAtSymbol(checker, node.left, targetSymbol)
    ) {
      mutated = true;
      return;
    }
    if (
      !containsOrigin &&
      ((ts.isPrefixUnaryExpression(node) &&
        [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(
          node.operator
        )) ||
        ts.isPostfixUnaryExpression(node)) &&
      expressionRootsAtSymbol(checker, node.operand, targetSymbol)
    ) {
      mutated = true;
      return;
    }
    if (ts.isCallExpression(node) && !containsOrigin) {
      const callee = unwrapExpression(node.expression);
      if (
        ts.isPropertyAccessExpression(callee) &&
        mutatingMethods.has(callee.name.text) &&
        expressionRootsAtSymbol(checker, callee.expression, targetSymbol)
      ) {
        mutated = true;
        return;
      }
      if (
        ts.isPropertyAccessExpression(callee) &&
        ((callee.name.text === 'assign' &&
          isExactGlobalBuiltinIdentifier(
            checker,
            unwrapExpression(callee.expression),
            'Object'
          )) ||
          (callee.name.text === 'set' &&
            isExactGlobalBuiltinIdentifier(
              checker,
              unwrapExpression(callee.expression),
              'Reflect'
            ))) &&
        node.arguments[0] &&
        expressionRootsAtSymbol(checker, node.arguments[0], targetSymbol)
      ) {
        mutated = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(boundary);
  return !mutated;
}

function typeIsProvablyString(type) {
  if (type.isUnion()) return type.types.every(typeIsProvablyString);
  if (type.isIntersection()) return type.types.some(typeIsProvablyString);
  return (type.flags & ts.TypeFlags.StringLike) !== 0;
}

function typeIsProvablyPrimitive(type) {
  if (type.isUnion()) return type.types.every(typeIsProvablyPrimitive);
  if (type.isIntersection()) return type.types.some(typeIsProvablyPrimitive);
  return (
    (type.flags &
      (ts.TypeFlags.StringLike |
        ts.TypeFlags.NumberLike |
        ts.TypeFlags.BooleanLike |
        ts.TypeFlags.BigIntLike |
        ts.TypeFlags.ESSymbolLike |
        ts.TypeFlags.Null |
        ts.TypeFlags.Undefined)) !==
    0
  );
}

function hasProvablyNonNullClinicTarget(checker, expression) {
  if (!expression) return false;
  const unwrapped = unwrapExpression(expression);
  if (
    unwrapped.kind === ts.SyntaxKind.NullKeyword ||
    (ts.isIdentifier(unwrapped) && unwrapped.text === 'undefined')
  ) {
    return false;
  }
  return typeIsProvablyString(checker.getTypeAtLocation(unwrapped));
}

function callResultSymbol(checker, call, allowSafeScopeTransforms = false) {
  const declaration = findVariableDeclarationForCall(
    checker,
    call,
    allowSafeScopeTransforms
  );
  if (declaration && ts.isIdentifier(declaration.name)) {
    return checker.getSymbolAtLocation(declaration.name);
  }
  let current = call.parent;
  while (current && !ts.isStatement(current)) {
    if (
      ts.isBinaryExpression(current) &&
      current.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(current.left) &&
      (callIsDirectExpressionValue(call, current.right) ||
        (allowSafeScopeTransforms &&
          callIsSafeScopeExpressionValue(checker, call, current.right)))
    ) {
      return checker.getSymbolAtLocation(current.left);
    }
    current = current.parent;
  }
  return undefined;
}

function nodeReferencesSymbol(checker, node, targetSymbol) {
  let found = false;
  function visit(current) {
    if (found) return;
    if (current !== node && ts.isFunctionLike(current)) return;
    if (
      ts.isIdentifier(current) &&
      getIdentifierValueSymbol(checker, current) === targetSymbol
    ) {
      found = true;
      return;
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
  return found;
}

function typeIncludesCollection(checker, type) {
  if (type.isUnion() || type.isIntersection()) {
    return type.types.some(member => typeIncludesCollection(checker, member));
  }
  if (checker.isArrayType(type) || checker.isTupleType(type)) return true;
  const symbolName = type.aliasSymbol?.getName() ?? type.getSymbol()?.getName();
  return ['Array', 'ReadonlyArray', 'Set', 'ReadonlySet'].includes(symbolName);
}

function resultSymbolMayBeCollection(checker, resultSymbol) {
  for (const declaration of resultSymbol.declarations ?? []) {
    const location = declaration.name ?? declaration;
    if (
      typeIncludesCollection(
        checker,
        checker.getTypeOfSymbolAtLocation(resultSymbol, location)
      )
    ) {
      return true;
    }
  }
  return false;
}

function conditionRejectsMissingResult(
  checker,
  condition,
  resultSymbol,
  allowBareFalsy
) {
  const unwrapped = unwrapExpression(condition);

  function isResultIdentifier(expression) {
    const candidate = unwrapExpression(expression);
    return (
      ts.isIdentifier(candidate) &&
      checker.getSymbolAtLocation(candidate) === resultSymbol
    );
  }

  function isResultLength(expression) {
    const candidate = unwrapExpression(expression);
    if (!ts.isPropertyAccessExpression(candidate)) return false;
    const receiver = unwrapExpression(candidate.expression);
    return (
      candidate.name.text === 'length' &&
      ts.isIdentifier(receiver) &&
      checker.getSymbolAtLocation(receiver) === resultSymbol
    );
  }

  if (
    ts.isPrefixUnaryExpression(unwrapped) &&
    unwrapped.operator === ts.SyntaxKind.ExclamationToken
  ) {
    return (
      isResultLength(unwrapped.operand) ||
      (allowBareFalsy && isResultIdentifier(unwrapped.operand))
    );
  }
  if (
    ts.isBinaryExpression(unwrapped) &&
    unwrapped.operatorToken.kind === ts.SyntaxKind.BarBarToken
  ) {
    return (
      conditionRejectsMissingResult(
        checker,
        unwrapped.left,
        resultSymbol,
        allowBareFalsy
      ) ||
      conditionRejectsMissingResult(
        checker,
        unwrapped.right,
        resultSymbol,
        allowBareFalsy
      )
    );
  }
  if (!ts.isBinaryExpression(unwrapped)) return false;
  const operator = unwrapped.operatorToken.kind;
  const left = unwrapExpression(unwrapped.left);
  const right = unwrapExpression(unwrapped.right);
  const isNullish = expression => {
    const candidate = unwrapExpression(expression);
    return (
      candidate.kind === ts.SyntaxKind.NullKeyword ||
      (ts.isIdentifier(candidate) && candidate.text === 'undefined')
    );
  };
  const isZero = expression =>
    ts.isNumericLiteral(unwrapExpression(expression)) &&
    unwrapExpression(expression).text === '0';

  if (
    [
      ts.SyntaxKind.EqualsEqualsEqualsToken,
      ts.SyntaxKind.EqualsEqualsToken,
    ].includes(operator) &&
    allowBareFalsy &&
    ((isResultIdentifier(left) && isNullish(right)) ||
      (isResultIdentifier(right) && isNullish(left)))
  ) {
    return true;
  }
  return (
    [
      ts.SyntaxKind.EqualsEqualsEqualsToken,
      ts.SyntaxKind.EqualsEqualsToken,
      ts.SyntaxKind.LessThanEqualsToken,
    ].includes(operator) &&
    ((isResultLength(left) && isZero(right)) ||
      (operator !== ts.SyntaxKind.LessThanEqualsToken &&
        isResultLength(right) &&
        isZero(left)))
  );
}

function conditionRejectsOutOfScopeResult(checker, condition, resultSymbol) {
  const unwrapped = unwrapExpression(condition);
  if (
    ts.isBinaryExpression(unwrapped) &&
    unwrapped.operatorToken.kind === ts.SyntaxKind.BarBarToken
  ) {
    return (
      conditionRejectsOutOfScopeResult(checker, unwrapped.left, resultSymbol) ||
      conditionRejectsOutOfScopeResult(checker, unwrapped.right, resultSymbol)
    );
  }
  if (
    !ts.isPrefixUnaryExpression(unwrapped) ||
    unwrapped.operator !== ts.SyntaxKind.ExclamationToken
  ) {
    return false;
  }
  const operand = unwrapExpression(unwrapped.operand);
  if (!ts.isCallExpression(operand)) return false;
  const callee = unwrapExpression(operand.expression);
  if (
    !ts.isPropertyAccessExpression(callee) ||
    callee.name.text !== 'includes' ||
    operand.arguments.length !== 1 ||
    !hasProvablyNonNullClinicTarget(checker, operand.arguments[0])
  ) {
    return false;
  }
  const receiver = unwrapExpression(callee.expression);
  return (
    ts.isIdentifier(receiver) &&
    checker.getSymbolAtLocation(receiver) === resultSymbol
  );
}

function findOutOfScopeTargetForResult(checker, condition, resultSymbol) {
  let target;
  function visit(node) {
    if (target) return;
    if (ts.isCallExpression(node)) {
      const callee = unwrapExpression(node.expression);
      if (
        ts.isPropertyAccessExpression(callee) &&
        callee.name.text === 'includes' &&
        node.arguments.length === 1
      ) {
        const receiver = unwrapExpression(callee.expression);
        if (
          ts.isIdentifier(receiver) &&
          checker.getSymbolAtLocation(receiver) === resultSymbol
        ) {
          target = node.arguments[0];
          return;
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(condition);
  return target;
}

function findTerminatingGuardForResult(checker, call, resultSymbol) {
  const boundary = findContainingFunction(call);
  if (!boundary) return undefined;
  const resultMayBeCollection = resultSymbolMayBeCollection(
    checker,
    resultSymbol
  );
  const allowBareFalsy = !resultMayBeCollection;
  let guard;

  function visit(node) {
    if (guard) return;
    if (node !== boundary && ts.isFunctionLike(node)) return;
    if (
      ts.isIfStatement(node) &&
      node.getStart() > call.getStart() &&
      statementAlwaysTerminates(node.thenStatement) &&
      symbolIsStableBeforeUse(
        checker,
        resolveTargetSymbol(checker, resultSymbol),
        node.expression,
        call
      ) &&
      (conditionRejectsOutOfScopeResult(
        checker,
        node.expression,
        resultSymbol
      ) ||
        (!resultMayBeCollection &&
          conditionRejectsMissingResult(
            checker,
            node.expression,
            resultSymbol,
            allowBareFalsy
          ))) &&
      !containsWriteBefore(boundary, node)
    ) {
      guard = node;
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(boundary);
  return guard;
}

function isAdminUsersAccessBinding(binding, importedName) {
  return (
    binding?.importedName === importedName &&
    ['./access', '../access'].includes(binding.moduleName)
  );
}

function findRejectingIf(node) {
  let current = node.parent;
  while (current) {
    if (ts.isIfStatement(current)) {
      const start = node.getStart();
      if (
        start >= current.expression.getStart() &&
        start < current.expression.getEnd() &&
        statementAlwaysTerminates(current.thenStatement)
      ) {
        return current;
      }
    }
    current = current.parent;
  }
  return undefined;
}

function isInsideRejectingIf(node) {
  return Boolean(findRejectingIf(node));
}

function isNegatedNode(node) {
  let current = node;
  let negationCount = 0;
  while (current.parent) {
    const parent = current.parent;
    if (
      ts.isParenthesizedExpression(parent) ||
      ts.isAsExpression(parent) ||
      ts.isSatisfiesExpression(parent) ||
      ts.isNonNullExpression(parent)
    ) {
      current = parent;
      continue;
    }
    if (
      ts.isPrefixUnaryExpression(parent) &&
      parent.operator === ts.SyntaxKind.ExclamationToken &&
      parent.operand === current
    ) {
      negationCount += 1;
      current = parent;
      continue;
    }
    if (
      ts.isBinaryExpression(parent) &&
      parent.operatorToken.kind === ts.SyntaxKind.BarBarToken &&
      (parent.left === current || parent.right === current)
    ) {
      current = parent;
      continue;
    }
    if (ts.isIfStatement(parent) && parent.expression === current) {
      return negationCount % 2 === 1;
    }
    return false;
  }
  return false;
}

function isRejectedFalsePredicateInSome(node) {
  let current = node.parent;
  if (
    !current ||
    !ts.isPrefixUnaryExpression(current) ||
    current.operator !== ts.SyntaxKind.ExclamationToken ||
    current.operand !== node
  ) {
    return false;
  }
  const arrow = current.parent;
  if (!ts.isArrowFunction(arrow) || arrow.body !== current) return false;
  const someCall = arrow.parent;
  if (!ts.isCallExpression(someCall) || !someCall.arguments.includes(arrow)) {
    return false;
  }
  const callee = unwrapExpression(someCall.expression);
  if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== 'some') {
    return false;
  }

  current = someCall;
  while (current.parent) {
    const parent = current.parent;
    if (
      ts.isParenthesizedExpression(parent) ||
      ts.isAsExpression(parent) ||
      ts.isSatisfiesExpression(parent) ||
      ts.isNonNullExpression(parent)
    ) {
      current = parent;
      continue;
    }
    if (
      ts.isBinaryExpression(parent) &&
      parent.operatorToken.kind === ts.SyntaxKind.BarBarToken &&
      (parent.left === current || parent.right === current)
    ) {
      current = parent;
      continue;
    }
    return Boolean(
      ts.isIfStatement(parent) &&
      parent.expression === current &&
      statementAlwaysTerminates(parent.thenStatement)
    );
  }
  return false;
}

function rejectedSomeCollectionExpression(node) {
  const negation = node.parent;
  if (
    !negation ||
    !ts.isPrefixUnaryExpression(negation) ||
    negation.operator !== ts.SyntaxKind.ExclamationToken ||
    negation.operand !== node
  ) {
    return undefined;
  }
  const arrow = negation.parent;
  if (!ts.isArrowFunction(arrow) || arrow.body !== negation) return undefined;
  const someCall = arrow.parent;
  if (!ts.isCallExpression(someCall) || !someCall.arguments.includes(arrow)) {
    return undefined;
  }
  const callee = unwrapExpression(someCall.expression);
  return ts.isPropertyAccessExpression(callee) && callee.name.text === 'some'
    ? callee.expression
    : undefined;
}

function callFalseTriggersRejectingGuard(node) {
  return isNegatedNode(node) || isRejectedFalsePredicateInSome(node);
}

function collectApprovedEvidence(checker, startNode, sourceFile, observed) {
  const categories = {
    auth: new Set(),
    adminRole: new Set(),
    clinicScope: new Set(),
    clinicScopeCoverage: new Set(),
    billing: new Set(),
    validation: new Set(),
    internalSecret: new Set(),
    lineAuth: new Set(),
    webhookSignature: new Set(),
    idempotency: new Set(),
    rateLimit: new Set(),
    noMutation: new Set(),
    sideEffectCall: new Set(),
  };
  const imports = getImportBindings(sourceFile);
  const visitedDeclarations = new Set();
  const scopedAdminBindings = new Set();
  const scopedAdminUsersClinicIdBindings = new Set();
  const approvedProcessResultBindings = new Set();
  const approvedPermissionsBindings = new Set();
  const approvedAccessContextOrigins = new Map();
  const canonicalClinicScopeBindings = new Set();
  const cronSecretBindings = new Set();
  const authorizationHeaderBindings = new Set();
  const evidenceCandidates = Object.fromEntries(
    Object.keys(categories).map(category => [category, new Set()])
  );
  const clinicScopeCandidateBindings = new Map();
  const scopedAdminAssertions = new Set();
  const scopedBillingRootResolvers = new Set();

  function add(category, label, candidate, clinicBinding) {
    categories[category].add(label);
    if (candidate) evidenceCandidates[category].add(candidate);
    if (category === 'clinicScope' && candidate && clinicBinding) {
      const bindings = clinicScopeCandidateBindings.get(candidate) ?? [];
      if (!bindings.includes(clinicBinding)) bindings.push(clinicBinding);
      clinicScopeCandidateBindings.set(candidate, bindings);
    }
  }

  function importedCallKey(expression) {
    const unwrapped = unwrapExpression(expression);
    if (!ts.isCallExpression(unwrapped)) return null;
    const callee = unwrapExpression(unwrapped.expression);
    if (!ts.isIdentifier(callee)) return null;
    const binding = imports.get(callee.text);
    return isExactImportIdentifier(checker, callee, binding)
      ? binding.moduleName + '#' + binding.importedName
      : null;
  }

  function isScopedAdminFactoryCall(expression) {
    const key = importedCallKey(expression);
    return (
      Boolean(
        key === '@/lib/supabase#createScopedAdminContext' ||
        key === '@/lib/supabase/scoped-admin#createScopedAdminContext'
      ) &&
      expressionIsApprovedPermissions(
        unwrapExpression(expression).arguments[0],
        expression
      )
    );
  }

  function setHasResolvedSymbol(symbols, symbol) {
    if (!symbol) return false;
    const target = resolveTargetSymbol(checker, symbol);
    return Array.from(symbols).some(
      candidate => resolveTargetSymbol(checker, candidate) === target
    );
  }

  function mapEntryForResolvedSymbol(entries, symbol) {
    if (!symbol) return undefined;
    const target = resolveTargetSymbol(checker, symbol);
    for (const [candidate, origin] of entries) {
      if (resolveTargetSymbol(checker, candidate) === target) return origin;
    }
    return undefined;
  }

  function expressionIsApprovedAuthorityObject(expression, useNode) {
    const unwrapped = unwrapExpression(expression);
    if (!ts.isIdentifier(unwrapped)) return false;
    const symbol = getIdentifierValueSymbol(checker, unwrapped);
    if (!symbol) return false;
    const target = resolveTargetSymbol(checker, symbol);
    if (setHasResolvedSymbol(approvedProcessResultBindings, symbol)) {
      return symbolHasNoDirectMutationBeforeUse(checker, target, useNode);
    }
    const accessOrigin = mapEntryForResolvedSymbol(
      approvedAccessContextOrigins,
      symbol
    );
    return Boolean(
      accessOrigin &&
      symbolHasNoDirectMutationBeforeUse(checker, target, useNode, accessOrigin)
    );
  }

  function expressionIsApprovedPermissions(
    expression,
    useNode = expression,
    visitedSymbols = new Set(),
    depth = 0
  ) {
    if (!expression || depth > 12) return false;
    const unwrapped = unwrapExpression(expression);

    if (
      ts.isPropertyAccessExpression(unwrapped) &&
      unwrapped.name.text === 'permissions'
    ) {
      return expressionIsApprovedAuthorityObject(unwrapped.expression, useNode);
    }
    if (!ts.isIdentifier(unwrapped)) return false;

    const symbol = getIdentifierValueSymbol(checker, unwrapped);
    if (!symbol) return false;
    const target = resolveTargetSymbol(checker, symbol);
    if (visitedSymbols.has(target)) return false;
    const nextVisited = new Set(visitedSymbols);
    nextVisited.add(target);

    if (setHasResolvedSymbol(approvedPermissionsBindings, symbol)) {
      return symbolHasNoDirectMutationBeforeUse(checker, target, useNode);
    }

    for (const declaration of target.declarations ?? []) {
      if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
        if (
          symbolHasNoDirectMutationBeforeUse(checker, target, useNode) &&
          expressionIsApprovedPermissions(
            declaration.initializer,
            declaration.initializer,
            nextVisited,
            depth + 1
          )
        ) {
          return true;
        }
      }
      if (!ts.isParameter(declaration)) continue;
      const functionNode = declaration.parent;
      const parameterIndex = functionNode.parameters.indexOf(declaration);
      const functionDeclaration =
        ts.isFunctionDeclaration(functionNode) ||
        ts.isMethodDeclaration(functionNode) ||
        ts.isFunctionExpression(functionNode) ||
        ts.isArrowFunction(functionNode)
          ? functionNode
          : undefined;
      if (!functionDeclaration || parameterIndex < 0) continue;
      const callSites = findCallSitesForDeclaration(functionDeclaration);
      if (
        callSites.length > 0 &&
        callSites.every(callSite =>
          expressionIsApprovedPermissions(
            callSite.arguments[parameterIndex],
            callSite,
            new Set(nextVisited),
            depth + 1
          )
        )
      ) {
        return true;
      }
    }
    return false;
  }

  function expressionIsProcessDto(
    expression,
    processResultSymbol,
    useNode,
    visitedSymbols = new Set(),
    depth = 0
  ) {
    if (!expression || depth > 12) return false;
    const unwrapped = unwrapExpression(expression);
    const processTarget = resolveTargetSymbol(checker, processResultSymbol);

    if (
      ts.isPropertyAccessExpression(unwrapped) &&
      unwrapped.name.text === 'dto'
    ) {
      const receiver = unwrapExpression(unwrapped.expression);
      if (!ts.isIdentifier(receiver)) return false;
      const receiverSymbol = getIdentifierValueSymbol(checker, receiver);
      return Boolean(
        receiverSymbol &&
        resolveTargetSymbol(checker, receiverSymbol) === processTarget &&
        symbolHasNoDirectMutationBeforeUse(checker, processTarget, useNode)
      );
    }

    if (ts.isObjectLiteralExpression(unwrapped)) {
      for (const property of [...unwrapped.properties].reverse()) {
        if (ts.isPropertyAssignment(property)) {
          const name = staticPropertyName(property.name);
          if (name === 'clinic_id') {
            const initializer = unwrapExpression(property.initializer);
            return (
              ts.isPropertyAccessExpression(initializer) &&
              initializer.name.text === 'clinic_id' &&
              expressionIsProcessDto(
                initializer.expression,
                processResultSymbol,
                property.initializer,
                new Set(visitedSymbols),
                depth + 1
              )
            );
          }
          if (ts.isComputedPropertyName(property.name)) return false;
          continue;
        }
        if (ts.isShorthandPropertyAssignment(property)) {
          if (property.name.text === 'clinic_id') return false;
          continue;
        }
        if (ts.isSpreadAssignment(property)) {
          return expressionIsProcessDto(
            property.expression,
            processResultSymbol,
            property.expression,
            new Set(visitedSymbols),
            depth + 1
          );
        }
        return false;
      }
      return false;
    }

    if (!ts.isIdentifier(unwrapped)) return false;
    const symbol = getIdentifierValueSymbol(checker, unwrapped);
    if (!symbol) return false;
    const target = resolveTargetSymbol(checker, symbol);
    if (visitedSymbols.has(target)) return false;
    const nextVisited = new Set(visitedSymbols);
    nextVisited.add(target);

    for (const declaration of target.declarations ?? []) {
      if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
        if (
          symbolHasNoDirectMutationBeforeUse(
            checker,
            target,
            useNode,
            declaration.initializer
          ) &&
          expressionIsProcessDto(
            declaration.initializer,
            processResultSymbol,
            declaration.initializer,
            nextVisited,
            depth + 1
          )
        ) {
          return true;
        }
      }
      if (!ts.isBindingElement(declaration)) continue;
      const propertyName = declaration.propertyName ?? declaration.name;
      const pattern = declaration.parent;
      const variableDeclaration = pattern.parent;
      if (
        (ts.isIdentifier(propertyName) || ts.isStringLiteral(propertyName)) &&
        propertyName.text === 'dto' &&
        ts.isObjectBindingPattern(pattern) &&
        ts.isVariableDeclaration(variableDeclaration) &&
        variableDeclaration.initializer
      ) {
        const initializer = unwrapExpression(variableDeclaration.initializer);
        if (ts.isIdentifier(initializer)) {
          const initializerSymbol = getIdentifierValueSymbol(
            checker,
            initializer
          );
          if (
            initializerSymbol &&
            resolveTargetSymbol(checker, initializerSymbol) === processTarget &&
            symbolHasNoDirectMutationBeforeUse(
              checker,
              target,
              useNode,
              variableDeclaration.initializer
            )
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }

  function findProcessDtoClinicBindings(processResultSymbol) {
    const bindings = [];
    function visit(node) {
      if (node !== startNode && ts.isFunctionDeclaration(node)) return;
      if (
        ts.isPropertyAccessExpression(node) &&
        node.name.text === 'clinic_id' &&
        expressionIsProcessDto(node.expression, processResultSymbol, node)
      ) {
        bindings.push(node);
        return;
      }
      if (ts.isElementAccessExpression(node)) {
        const argument = unwrapExpression(node.argumentExpression);
        if (
          ts.isStringLiteral(argument) &&
          argument.text === 'clinic_id' &&
          expressionIsProcessDto(node.expression, processResultSymbol, node)
        ) {
          bindings.push(node);
          return;
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(startNode);
    return bindings;
  }

  function recordApprovedPermissionsFromDirectCall(call) {
    const declaration = findVariableDeclarationForCall(checker, call);
    if (!declaration || !ts.isObjectBindingPattern(declaration.name)) return;
    for (const element of declaration.name.elements) {
      const propertyName = element.propertyName ?? element.name;
      if (
        (ts.isIdentifier(propertyName) || ts.isStringLiteral(propertyName)) &&
        propertyName.text === 'permissions' &&
        ts.isIdentifier(element.name)
      ) {
        const symbol = checker.getSymbolAtLocation(element.name);
        if (symbol) approvedPermissionsBindings.add(symbol);
      }
    }
  }

  function resolveCanonicalAuditMethod(
    expression,
    visitedSymbols = new Set(),
    depth = 0
  ) {
    if (!expression || depth > 12) return undefined;
    const unwrapped = unwrapExpression(expression);

    if (ts.isPropertyAccessExpression(unwrapped)) {
      if (['call', 'apply', 'bind'].includes(unwrapped.name.text)) {
        return resolveCanonicalAuditMethod(
          unwrapped.expression,
          visitedSymbols,
          depth + 1
        );
      }
      if (!AUDIT_LOGGER_PERSISTED_METHODS.has(unwrapped.name.text)) {
        return undefined;
      }
      const receiver = unwrapExpression(unwrapped.expression);
      return resolvesToCanonicalAuditLoggerObject(
        receiver,
        new Set(visitedSymbols),
        depth + 1
      )
        ? unwrapped.name.text
        : undefined;
    }

    if (ts.isElementAccessExpression(unwrapped)) {
      const argument = unwrapExpression(unwrapped.argumentExpression);
      if (
        !ts.isStringLiteral(argument) ||
        !AUDIT_LOGGER_PERSISTED_METHODS.has(argument.text)
      ) {
        return undefined;
      }
      const receiver = unwrapExpression(unwrapped.expression);
      return resolvesToCanonicalAuditLoggerObject(
        receiver,
        new Set(visitedSymbols),
        depth + 1
      )
        ? argument.text
        : undefined;
    }

    if (ts.isCallExpression(unwrapped)) {
      return resolveCanonicalAuditMethod(
        unwrapped.expression,
        visitedSymbols,
        depth + 1
      );
    }

    if (!ts.isIdentifier(unwrapped)) return undefined;
    const symbol = checker.getSymbolAtLocation(unwrapped);
    if (!symbol) return undefined;
    const target = resolveTargetSymbol(checker, symbol);
    if (visitedSymbols.has(target)) return undefined;
    visitedSymbols.add(target);

    const useBoundary = findContainingFunction(unwrapped);
    const hasModuleDeclaration = (target.declarations ?? []).some(
      declaration =>
        declaration.getSourceFile() === sourceFile &&
        !findContainingFunction(declaration)
    );
    const assignmentBoundaries = [
      ...(hasModuleDeclaration ? [sourceFile] : []),
      ...(useBoundary ? [useBoundary] : []),
    ];
    if (assignmentBoundaries.length > 0) {
      const assignedMethods = [];
      let hasUnresolvedAssignment = false;
      for (const assignmentBoundary of assignmentBoundaries) {
        const isModuleBoundary = ts.isSourceFile(assignmentBoundary);
        function visitAssignments(node) {
          if (node !== assignmentBoundary && ts.isFunctionLike(node)) return;
          if (!isModuleBoundary && node.getStart() >= unwrapped.getStart()) {
            return;
          }
          if (
            ts.isBinaryExpression(node) &&
            node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            ts.isIdentifier(unwrapExpression(node.left))
          ) {
            const leftSymbol = getIdentifierValueSymbol(
              checker,
              unwrapExpression(node.left)
            );
            if (
              leftSymbol &&
              resolveTargetSymbol(checker, leftSymbol) === target
            ) {
              let current = node.parent;
              let unconditional = true;
              while (current && current !== assignmentBoundary) {
                if (
                  ts.isIfStatement(current) ||
                  ts.isConditionalExpression(current) ||
                  ts.isIterationStatement(current, false) ||
                  ts.isTryStatement(current) ||
                  ts.isCatchClause(current) ||
                  ts.isSwitchStatement(current)
                ) {
                  unconditional = false;
                  break;
                }
                current = current.parent;
              }
              const assignedMethod = unconditional
                ? resolveCanonicalAuditMethod(
                    node.right,
                    new Set(visitedSymbols),
                    depth + 1
                  )
                : undefined;
              if (assignedMethod) assignedMethods.push(assignedMethod);
              else hasUnresolvedAssignment = true;
            }
          }
          ts.forEachChild(node, visitAssignments);
        }
        visitAssignments(assignmentBoundary);
      }
      if (
        assignedMethods.length > 0 &&
        assignedMethods.every(method => method === assignedMethods[0])
      ) {
        return assignedMethods[0];
      }
      if (hasUnresolvedAssignment) return undefined;
    }

    for (const declaration of target.declarations ?? []) {
      if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
        const method = resolveCanonicalAuditMethod(
          declaration.initializer,
          visitedSymbols,
          depth + 1
        );
        if (method) return method;
      }
      if (ts.isBindingElement(declaration)) {
        const propertyNode = declaration.propertyName ?? declaration.name;
        const methodName =
          ts.isIdentifier(propertyNode) || ts.isStringLiteral(propertyNode)
            ? propertyNode.text
            : undefined;
        if (!AUDIT_LOGGER_PERSISTED_METHODS.has(methodName)) continue;
        const bindingPattern = declaration.parent;
        const variableDeclaration = bindingPattern.parent;
        if (
          !ts.isObjectBindingPattern(bindingPattern) ||
          !ts.isVariableDeclaration(variableDeclaration) ||
          !variableDeclaration.initializer
        ) {
          continue;
        }
        const receiver = unwrapExpression(variableDeclaration.initializer);
        if (resolvesToCanonicalAuditLoggerObject(receiver)) {
          return methodName;
        }
      }
    }
    return undefined;
  }

  function resolvesToCanonicalAuditLoggerObject(
    expression,
    visitedSymbols = new Set(),
    depth = 0
  ) {
    if (!expression || depth > 12) return false;
    const unwrapped = unwrapExpression(expression);
    const expressionImports =
      unwrapped.getSourceFile() === sourceFile
        ? imports
        : getImportBindings(unwrapped.getSourceFile());
    if (ts.isPropertyAccessExpression(unwrapped)) {
      if (unwrapped.name.text !== 'AuditLogger') return false;
      const namespace = unwrapExpression(unwrapped.expression);
      if (!ts.isIdentifier(namespace)) return false;
      const namespaceBinding = expressionImports.get(namespace.text);
      return Boolean(
        namespaceBinding?.importedName === '*' &&
        namespaceBinding.moduleName === '@/lib/audit-logger' &&
        isExactImportIdentifier(checker, namespace, namespaceBinding)
      );
    }
    if (!ts.isIdentifier(unwrapped)) return false;
    const binding = expressionImports.get(unwrapped.text);
    if (
      isExactImportIdentifier(checker, unwrapped, binding) &&
      binding.moduleName === '@/lib/audit-logger' &&
      binding.importedName === 'AuditLogger'
    ) {
      return true;
    }

    const symbol = checker.getSymbolAtLocation(unwrapped);
    if (!symbol) return false;
    const target = resolveTargetSymbol(checker, symbol);
    if (visitedSymbols.has(target)) return false;
    const nextVisitedSymbols = new Set(visitedSymbols);
    nextVisitedSymbols.add(target);
    return (target.declarations ?? []).some(declaration => {
      if (
        !ts.isVariableDeclaration(declaration) ||
        !declaration.initializer ||
        !ts.isVariableDeclarationList(declaration.parent) ||
        (declaration.parent.flags & ts.NodeFlags.Const) === 0
      ) {
        return false;
      }
      return resolvesToCanonicalAuditLoggerObject(
        declaration.initializer,
        nextVisitedSymbols,
        depth + 1
      );
    });
  }

  function collectReachableWritePaths() {
    const paths = [];
    const pathKeys = new Set();

    function visitDeclaration(declaration, callChain, activeDeclarations) {
      if (!declaration || activeDeclarations.has(declaration)) return;
      const nextActiveDeclarations = new Set(activeDeclarations);
      nextActiveDeclarations.add(declaration);
      const traversalRoot = getFunctionBody(declaration) ?? declaration;

      function visit(node, effectiveCallChain = callChain) {
        if (node !== traversalRoot && ts.isFunctionLike(node)) {
          const invocationCall = inlineFunctionInvocationCall(node);
          if (!invocationCall) return;
          ts.forEachChild(node, child =>
            visit(child, [...effectiveCallChain, invocationCall])
          );
          return;
        }
        if (ts.isCallExpression(node)) {
          if (
            isSemanticWriteLikeCall(checker, node) ||
            isCanonicalOpaqueMutationCall(checker, node) ||
            resolveCanonicalAuditMethod(node.expression)
          ) {
            const key =
              node.getSourceFile().fileName +
              ':' +
              String(node.pos) +
              ':' +
              effectiveCallChain
                .map(call => call.getSourceFile().fileName + ':' + call.pos)
                .join('>');
            if (!pathKeys.has(key)) {
              pathKeys.add(key);
              paths.push({ leaf: node, callChain: [...effectiveCallChain] });
            }
          } else {
            const expression = unwrapExpression(node.expression);
            if (!isCanonicalPolicyEvidenceCall(checker, node)) {
              for (const calledDeclaration of resolveCalledRepositoryDeclarations(
                checker,
                expression
              )) {
                visitDeclaration(
                  calledDeclaration,
                  [...effectiveCallChain, node],
                  nextActiveDeclarations
                );
              }
            }
            if (callMayInvokeCallbackArguments(node)) {
              for (const argument of node.arguments) {
                const callback = unwrapExpression(argument);
                if (!ts.isIdentifier(callback)) continue;
                for (const callbackDeclaration of resolveCalledRepositoryDeclarations(
                  checker,
                  callback
                )) {
                  visitDeclaration(
                    callbackDeclaration,
                    [...effectiveCallChain, node],
                    nextActiveDeclarations
                  );
                }
              }
            }
          }
        }
        ts.forEachChild(node, child => visit(child, effectiveCallChain));
      }

      visit(traversalRoot);
    }

    visitDeclaration(startNode, [], new Set());
    return paths;
  }

  function candidateDominatesCheckpoint(candidate, checkpoint) {
    const boundary = findContainingFunction(candidate);
    if (!boundary || boundary !== findContainingFunction(checkpoint)) {
      return false;
    }
    if (candidate.getStart() >= checkpoint.getStart()) return false;
    if (
      ts.isIfStatement(candidate) &&
      isNodeWithin(checkpoint, candidate.thenStatement)
    ) {
      return false;
    }

    let current = candidate.parent;
    while (current && current !== boundary) {
      if (ts.isIfStatement(current)) {
        if (isNodeWithin(candidate, current.thenStatement)) {
          if (!isNodeWithin(checkpoint, current.thenStatement)) return false;
        } else if (
          current.elseStatement &&
          isNodeWithin(candidate, current.elseStatement)
        ) {
          if (!isNodeWithin(checkpoint, current.elseStatement)) return false;
        }
      } else if (ts.isIterationStatement(current, false)) {
        if (
          isNodeWithin(candidate, current.statement) &&
          !isNodeWithin(checkpoint, current.statement)
        ) {
          return false;
        }
      } else if (ts.isCatchClause(current)) {
        if (!isNodeWithin(checkpoint, current.block)) return false;
      } else if (ts.isCaseClause(current) || ts.isDefaultClause(current)) {
        if (!isNodeWithin(checkpoint, current)) return false;
      } else if (ts.isConditionalExpression(current)) {
        if (isNodeWithin(candidate, current.whenTrue)) {
          if (!isNodeWithin(checkpoint, current.whenTrue)) return false;
        } else if (isNodeWithin(candidate, current.whenFalse)) {
          if (!isNodeWithin(checkpoint, current.whenFalse)) return false;
        }
      } else if (
        ts.isBinaryExpression(current) &&
        [
          ts.SyntaxKind.AmpersandAmpersandToken,
          ts.SyntaxKind.BarBarToken,
          ts.SyntaxKind.QuestionQuestionToken,
        ].includes(current.operatorToken.kind) &&
        isNodeWithin(candidate, current.right) &&
        !isNodeWithin(checkpoint, current.right)
      ) {
        return false;
      } else if (ts.isTryStatement(current)) {
        if (isNodeWithin(candidate, current.tryBlock)) {
          if (
            (current.catchClause &&
              isNodeWithin(checkpoint, current.catchClause)) ||
            (current.finallyBlock &&
              isNodeWithin(checkpoint, current.finallyBlock))
          ) {
            return false;
          }
          if (
            !isNodeWithin(checkpoint, current.tryBlock) &&
            current.catchClause &&
            !statementAlwaysTerminates(current.catchClause.block)
          ) {
            return false;
          }
        } else if (
          current.catchClause &&
          isNodeWithin(candidate, current.catchClause)
        ) {
          if (!isNodeWithin(checkpoint, current.catchClause)) return false;
        } else if (
          current.finallyBlock &&
          isNodeWithin(candidate, current.finallyBlock) &&
          !isNodeWithin(checkpoint, current.finallyBlock)
        ) {
          return false;
        }
      }
      current = current.parent;
    }

    return true;
  }

  function candidateProtectsWritePath(candidate, writePath) {
    return [writePath.leaf, ...writePath.callChain].some(checkpoint =>
      candidateDominatesCheckpoint(candidate, checkpoint)
    );
  }

  function expressionsHaveSameValue(leftExpression, rightExpression) {
    const left = unwrapExpression(leftExpression);
    const right = unwrapExpression(rightExpression);
    if (left === right) return true;
    if (ts.isIdentifier(left) && ts.isIdentifier(right)) {
      const leftSymbol = getIdentifierValueSymbol(checker, left);
      const rightSymbol = getIdentifierValueSymbol(checker, right);
      return Boolean(
        leftSymbol &&
        rightSymbol &&
        resolveTargetSymbol(checker, leftSymbol) ===
          resolveTargetSymbol(checker, rightSymbol)
      );
    }
    if (
      ts.isPropertyAccessExpression(left) &&
      ts.isPropertyAccessExpression(right)
    ) {
      return (
        left.name.text === right.name.text &&
        expressionsHaveSameValue(left.expression, right.expression)
      );
    }
    if (
      ts.isElementAccessExpression(left) &&
      ts.isElementAccessExpression(right)
    ) {
      return (
        left.argumentExpression.getText() ===
          right.argumentExpression.getText() &&
        expressionsHaveSameValue(left.expression, right.expression)
      );
    }
    return false;
  }

  function rootValueSymbol(expression) {
    let current = unwrapExpression(expression);
    while (
      ts.isPropertyAccessExpression(current) ||
      ts.isElementAccessExpression(current)
    ) {
      current = unwrapExpression(current.expression);
    }
    if (!ts.isIdentifier(current)) return undefined;
    const symbol = getIdentifierValueSymbol(checker, current);
    return symbol ? resolveTargetSymbol(checker, symbol) : undefined;
  }

  function expressionsHaveStableSameValue(expression, guardedValue, useNode) {
    if (!expressionsHaveSameValue(expression, guardedValue)) return false;
    const rootSymbol = rootValueSymbol(expression);
    if (!rootSymbol) return true;
    const unwrapped = unwrapExpression(expression);
    return typeIsProvablyString(checker.getTypeAtLocation(unwrapped))
      ? symbolHasNoDirectMutationBeforeUse(
          checker,
          rootSymbol,
          useNode,
          guardedValue
        )
      : symbolIsStableBeforeUse(checker, rootSymbol, useNode, guardedValue);
  }

  function resolveStableStaticObjectProperty(
    expression,
    propertyName,
    useNode = expression,
    visitedSymbols = new Set(),
    depth = 0
  ) {
    if (!expression || depth > 8) return undefined;
    const unwrapped = unwrapExpression(expression);
    const direct = getObjectProperty(unwrapped, propertyName);
    if (direct) return direct;
    if (!ts.isIdentifier(unwrapped)) return undefined;

    const symbol = getIdentifierValueSymbol(checker, unwrapped);
    if (!symbol) return undefined;
    const target = resolveTargetSymbol(checker, symbol);
    if (visitedSymbols.has(target)) return undefined;
    if (!symbolHasNoDirectMutationBeforeUse(checker, target, useNode)) {
      return undefined;
    }
    const nextVisited = new Set(visitedSymbols);
    nextVisited.add(target);
    let resolved;
    for (const declaration of target.declarations ?? []) {
      if (!ts.isVariableDeclaration(declaration) || !declaration.initializer) {
        continue;
      }
      const candidate = resolveStableStaticObjectProperty(
        declaration.initializer,
        propertyName,
        useNode,
        nextVisited,
        depth + 1
      );
      if (!candidate) continue;
      if (resolved && !expressionsHaveSameValue(resolved, candidate)) {
        return undefined;
      }
      resolved = candidate;
    }
    return resolved;
  }

  function relevantCallsForFunction(functionNode, writePath) {
    if (!writePath) return [];
    const calls = [];
    const seen = new Set();
    for (const root of [writePath.leaf, ...writePath.callChain]) {
      function visit(node) {
        if (node !== root && ts.isFunctionLike(node)) return;
        if (ts.isCallExpression(node)) {
          const callee = unwrapExpression(node.expression);
          for (const declaration of resolveCalledRepositoryDeclarations(
            checker,
            callee
          )) {
            if (
              (declaration === functionNode ||
                functionNodeForDeclaration(declaration) === functionNode) &&
              !seen.has(node)
            ) {
              seen.add(node);
              calls.push(node);
            }
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(root);
    }
    return calls;
  }

  function resolveObjectPropertyValuesForWritePath(
    expression,
    propertyName,
    writePath,
    visitedSymbols = new Set(),
    depth = 0
  ) {
    if (!expression || depth > 12) return [];
    const direct = resolveStableStaticObjectProperty(
      expression,
      propertyName,
      expression
    );
    if (direct) return [direct];
    const unwrapped = unwrapExpression(expression);
    if (!ts.isIdentifier(unwrapped)) return [];
    const symbol = getIdentifierValueSymbol(checker, unwrapped);
    if (!symbol) return [];
    const target = resolveTargetSymbol(checker, symbol);
    if (visitedSymbols.has(target)) return [];
    if (!symbolHasNoDirectMutationBeforeUse(checker, target, expression)) {
      return [];
    }
    const nextVisited = new Set(visitedSymbols);
    nextVisited.add(target);
    const values = [];
    for (const declaration of target.declarations ?? []) {
      if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
        values.push(
          ...resolveObjectPropertyValuesForWritePath(
            declaration.initializer,
            propertyName,
            writePath,
            nextVisited,
            depth + 1
          )
        );
      }
      if (ts.isParameter(declaration)) {
        const functionNode = declaration.parent;
        const parameterIndex = functionNode.parameters.indexOf(declaration);
        if (parameterIndex < 0) continue;
        for (const call of relevantCallsForFunction(functionNode, writePath)) {
          const argument = call.arguments[parameterIndex];
          if (!argument) continue;
          values.push(
            ...resolveObjectPropertyValuesForWritePath(
              argument,
              propertyName,
              writePath,
              nextVisited,
              depth + 1
            )
          );
        }
      }
    }
    return values;
  }

  function resolveClinicInsertParentScopes(resultSymbol) {
    const parentScopes = [];
    for (const declaration of resultSymbol.declarations ?? []) {
      if (!ts.isBindingElement(declaration)) continue;
      const propertyName = declaration.propertyName ?? declaration.name;
      const pattern = declaration.parent;
      const variableDeclaration = pattern.parent;
      if (
        !ts.isObjectBindingPattern(pattern) ||
        !ts.isVariableDeclaration(variableDeclaration) ||
        !variableDeclaration.initializer ||
        !(ts.isIdentifier(propertyName) || ts.isStringLiteral(propertyName)) ||
        propertyName.text !== 'data'
      ) {
        continue;
      }
      function visit(node) {
        if (ts.isCallExpression(node)) {
          const callee = unwrapExpression(node.expression);
          if (
            ts.isPropertyAccessExpression(callee) &&
            callee.name.text === 'insert' &&
            staticSupabaseTableName(node) === 'clinics'
          ) {
            const parentScope = resolveStableStaticObjectProperty(
              node.arguments[0],
              'parent_id',
              node
            );
            if (parentScope) parentScopes.push(parentScope);
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(variableDeclaration.initializer);
    }
    return parentScopes;
  }

  function resolveThisPropertyConstructionValues(propertyAccess, writePath) {
    if (!writePath) return [];
    const receiver = unwrapExpression(propertyAccess.expression);
    if (receiver.kind !== ts.SyntaxKind.ThisKeyword) return [];

    let classNode = propertyAccess.parent;
    while (classNode && !ts.isClassDeclaration(classNode)) {
      classNode = classNode.parent;
    }
    if (!classNode?.name) return [];
    const classSymbol = checker.getSymbolAtLocation(classNode.name);
    if (!classSymbol) return [];
    const classTarget = resolveTargetSymbol(checker, classSymbol);
    const constructor = classNode.members.find(ts.isConstructorDeclaration);
    if (!constructor) return [];
    const parameterIndex = constructor.parameters.findIndex(parameter => {
      if (!ts.isIdentifier(parameter.name)) return false;
      return parameter.name.text === propertyAccess.name.text;
    });
    if (parameterIndex < 0) return [];

    const values = [];
    for (const call of writePath.callChain) {
      const callee = unwrapExpression(call.expression);
      if (!ts.isPropertyAccessExpression(callee)) continue;
      const instance = unwrapExpression(callee.expression);
      if (!ts.isIdentifier(instance)) continue;
      const instanceSymbol = getIdentifierValueSymbol(checker, instance);
      if (!instanceSymbol) continue;
      const instanceTarget = resolveTargetSymbol(checker, instanceSymbol);
      for (const declaration of instanceTarget.declarations ?? []) {
        if (
          !ts.isVariableDeclaration(declaration) ||
          !declaration.initializer
        ) {
          continue;
        }
        const initializer = unwrapExpression(declaration.initializer);
        if (!ts.isNewExpression(initializer)) continue;
        const constructorExpression = unwrapExpression(initializer.expression);
        const constructorSymbol = checker.getSymbolAtLocation(
          constructorExpression
        );
        if (
          !constructorSymbol ||
          resolveTargetSymbol(checker, constructorSymbol) !== classTarget
        ) {
          continue;
        }
        const value = initializer.arguments?.[parameterIndex];
        if (value) values.push(value);
      }
    }
    return values;
  }

  function isNullishResourceExpression(expression) {
    const unwrapped = unwrapExpression(expression);
    return (
      unwrapped.kind === ts.SyntaxKind.NullKeyword ||
      (ts.isIdentifier(unwrapped) && unwrapped.text === 'undefined')
    );
  }

  function functionReturnExpressions(functionNode) {
    if (!functionNode.body) return [];
    if (!ts.isBlock(functionNode.body)) return [functionNode.body];
    const returned = [];
    function visit(node) {
      if (node !== functionNode.body && ts.isFunctionLike(node)) return;
      if (ts.isReturnStatement(node)) {
        if (node.expression) returned.push(node.expression);
        return;
      }
      ts.forEachChild(node, visit);
    }
    visit(functionNode.body);
    return returned;
  }

  function bindingsForCall(functionNode, call, inheritedBindings) {
    const bindings = new Map(inheritedBindings);
    for (const [index, parameter] of functionNode.parameters.entries()) {
      const argument = call.arguments[index];
      if (!argument) continue;
      if (ts.isIdentifier(parameter.name)) {
        const symbol = getIdentifierValueSymbol(checker, parameter.name);
        if (symbol)
          bindings.set(resolveTargetSymbol(checker, symbol), argument);
        continue;
      }
      if (!ts.isObjectBindingPattern(parameter.name)) continue;
      for (const element of parameter.name.elements) {
        if (
          element.dotDotDotToken ||
          !ts.isIdentifier(element.name) ||
          (element.propertyName &&
            !ts.isIdentifier(element.propertyName) &&
            !ts.isStringLiteral(element.propertyName))
        ) {
          continue;
        }
        const value = resolveStableStaticObjectProperty(
          argument,
          (element.propertyName ?? element.name).text,
          call
        );
        const symbol = getIdentifierValueSymbol(checker, element.name);
        if (value && symbol) {
          bindings.set(resolveTargetSymbol(checker, symbol), value);
        }
      }
    }
    return bindings;
  }

  function collectResourcePropertyValues(
    expression,
    propertyName,
    writePath,
    parameterBindings = new Map(),
    visitedSymbols = new Set(),
    visitedDeclarations = new Set(),
    depth = 0
  ) {
    if (!expression || depth > 18) return [];
    const unwrapped = unwrapExpression(expression);
    if (ts.isAwaitExpression(unwrapped)) {
      return collectResourcePropertyValues(
        unwrapped.expression,
        propertyName,
        writePath,
        parameterBindings,
        visitedSymbols,
        visitedDeclarations,
        depth + 1
      );
    }
    if (ts.isObjectLiteralExpression(unwrapped)) {
      const values = [];
      for (const property of [...unwrapped.properties].reverse()) {
        if (ts.isPropertyAssignment(property)) {
          const name = staticPropertyName(property.name);
          if (name === propertyName) return [property.initializer];
        } else if (
          ts.isShorthandPropertyAssignment(property) &&
          property.name.text === propertyName
        ) {
          return [property.name];
        } else if (ts.isSpreadAssignment(property)) {
          values.push(
            ...collectResourcePropertyValues(
              property.expression,
              propertyName,
              writePath,
              parameterBindings,
              new Set(visitedSymbols),
              visitedDeclarations,
              depth + 1
            )
          );
        }
      }
      return values;
    }
    if (ts.isConditionalExpression(unwrapped)) {
      return [unwrapped.whenTrue, unwrapped.whenFalse].flatMap(branch =>
        collectResourcePropertyValues(
          branch,
          propertyName,
          writePath,
          parameterBindings,
          new Set(visitedSymbols),
          visitedDeclarations,
          depth + 1
        )
      );
    }
    if (
      ts.isBinaryExpression(unwrapped) &&
      unwrapped.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
    ) {
      return [unwrapped.left, unwrapped.right].flatMap(branch =>
        collectResourcePropertyValues(
          branch,
          propertyName,
          writePath,
          parameterBindings,
          new Set(visitedSymbols),
          visitedDeclarations,
          depth + 1
        )
      );
    }
    if (ts.isIdentifier(unwrapped)) {
      const symbol = getIdentifierValueSymbol(checker, unwrapped);
      if (!symbol) return [];
      const target = resolveTargetSymbol(checker, symbol);
      const bound = parameterBindings.get(target);
      if (bound) {
        return collectResourcePropertyValues(
          bound,
          propertyName,
          writePath,
          parameterBindings,
          visitedSymbols,
          visitedDeclarations,
          depth + 1
        );
      }
      if (visitedSymbols.has(target)) return [];
      const nextSymbols = new Set(visitedSymbols);
      nextSymbols.add(target);
      const values = [];
      for (const declaration of target.declarations ?? []) {
        if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
          values.push(
            ...collectResourcePropertyValues(
              declaration.initializer,
              propertyName,
              writePath,
              parameterBindings,
              nextSymbols,
              visitedDeclarations,
              depth + 1
            )
          );
        } else if (ts.isParameter(declaration)) {
          const functionNode = declaration.parent;
          const parameterIndex = functionNode.parameters.indexOf(declaration);
          for (const call of relevantCallsForFunction(
            functionNode,
            writePath
          )) {
            const argument = call.arguments[parameterIndex];
            if (!argument) continue;
            values.push(
              ...collectResourcePropertyValues(
                argument,
                propertyName,
                writePath,
                parameterBindings,
                nextSymbols,
                visitedDeclarations,
                depth + 1
              )
            );
          }
        }
      }
      return values;
    }
    if (ts.isPropertyAccessExpression(unwrapped)) {
      const receiverValues = collectResourcePropertyValues(
        unwrapped.expression,
        unwrapped.name.text,
        writePath,
        parameterBindings,
        visitedSymbols,
        visitedDeclarations,
        depth + 1
      );
      return receiverValues.flatMap(value =>
        collectResourcePropertyValues(
          value,
          propertyName,
          writePath,
          parameterBindings,
          new Set(visitedSymbols),
          visitedDeclarations,
          depth + 1
        )
      );
    }
    if (ts.isCallExpression(unwrapped)) {
      const values = [];
      for (const declaration of resolveCalledRepositoryDeclarations(
        checker,
        unwrapExpression(unwrapped.expression)
      )) {
        const functionNode = functionNodeForDeclaration(declaration);
        if (!functionNode || visitedDeclarations.has(functionNode)) continue;
        const nextDeclarations = new Set(visitedDeclarations);
        nextDeclarations.add(functionNode);
        const nextBindings = bindingsForCall(
          functionNode,
          unwrapped,
          parameterBindings
        );
        for (const returned of functionReturnExpressions(functionNode)) {
          if (isNullishResourceExpression(returned)) continue;
          values.push(
            ...collectResourcePropertyValues(
              returned,
              propertyName,
              writePath,
              nextBindings,
              new Set(visitedSymbols),
              nextDeclarations,
              depth + 1
            )
          );
        }
      }
      return values;
    }
    return [];
  }

  function addSupabaseClinicOrigins(expression, origins, parameterBindings) {
    const tableName = staticSupabaseTableName(expression);
    if (!tableName) return;
    function visitChain(node) {
      const current = unwrapExpression(node);
      if (ts.isCallExpression(current)) {
        const callee = unwrapExpression(current.expression);
        if (ts.isPropertyAccessExpression(callee)) {
          const methodName = callee.name.text;
          if (
            ['insert', 'update', 'upsert'].includes(methodName) &&
            current.arguments[0]
          ) {
            const payloadState = {
              sinks: [],
              complete: true,
              inspected: false,
            };
            collectClinicPayloadSinks(
              current.arguments[0],
              payloadState,
              current,
              new Set(),
              0,
              parameterBindings
            );
            if (payloadState.complete) {
              for (const sink of payloadState.sinks) {
                origins.push({
                  expression: sink,
                  parameterBindings:
                    clinicSinkParameterBindings.get(sink) ?? parameterBindings,
                });
              }
            }
          }
          if (
            ['containedBy', 'eq', 'in'].includes(methodName) &&
            current.arguments.length >= 2
          ) {
            const column = unwrapExpression(current.arguments[0]);
            if (
              ts.isStringLiteral(column) &&
              (clinicSinkPropertyNames.has(column.text) ||
                (tableName === 'clinics' &&
                  ['id', 'parent_id'].includes(column.text)))
            ) {
              origins.push({
                expression: current.arguments[1],
                parameterBindings,
              });
            }
          }
          visitChain(callee.expression);
        }
      } else if (
        ts.isPropertyAccessExpression(current) ||
        ts.isElementAccessExpression(current)
      ) {
        visitChain(current.expression);
      }
    }
    visitChain(expression);
  }

  function collectScopedResourceOrigins(
    expression,
    writePath,
    parameterBindings = new Map(),
    visitedSymbols = new Set(),
    visitedDeclarations = new Set(),
    depth = 0
  ) {
    if (!expression || depth > 20) return [];
    const unwrapped = unwrapExpression(expression);
    if (isNullishResourceExpression(unwrapped)) return [];
    if (ts.isAwaitExpression(unwrapped)) {
      return collectScopedResourceOrigins(
        unwrapped.expression,
        writePath,
        parameterBindings,
        visitedSymbols,
        visitedDeclarations,
        depth + 1
      );
    }

    const directOrigins = [];
    addSupabaseClinicOrigins(unwrapped, directOrigins, parameterBindings);
    if (directOrigins.length > 0) return directOrigins;

    if (ts.isIdentifier(unwrapped)) {
      const symbol = getIdentifierValueSymbol(checker, unwrapped);
      if (!symbol) return [];
      const target = resolveTargetSymbol(checker, symbol);
      const bound = parameterBindings.get(target);
      if (bound) {
        return collectScopedResourceOrigins(
          bound,
          writePath,
          parameterBindings,
          visitedSymbols,
          visitedDeclarations,
          depth + 1
        );
      }
      if (visitedSymbols.has(target)) return [];
      const nextSymbols = new Set(visitedSymbols);
      nextSymbols.add(target);
      const origins = [];
      const useBoundary = findContainingFunction(unwrapped);
      if (useBoundary) {
        function visitAssignments(node) {
          if (node !== useBoundary && ts.isFunctionLike(node)) return;
          if (node.getStart() >= unwrapped.getStart()) return;
          if (
            ts.isBinaryExpression(node) &&
            node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            expressionRootsAtSymbol(checker, node.left, target)
          ) {
            origins.push(
              ...collectScopedResourceOrigins(
                node.right,
                writePath,
                parameterBindings,
                nextSymbols,
                visitedDeclarations,
                depth + 1
              )
            );
            return;
          }
          ts.forEachChild(node, visitAssignments);
        }
        visitAssignments(useBoundary);
      }
      for (const declaration of target.declarations ?? []) {
        if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
          origins.push(
            ...collectScopedResourceOrigins(
              declaration.initializer,
              writePath,
              parameterBindings,
              nextSymbols,
              visitedDeclarations,
              depth + 1
            )
          );
        } else if (ts.isBindingElement(declaration)) {
          const pattern = declaration.parent;
          const variableDeclaration = pattern.parent;
          if (
            ts.isObjectBindingPattern(pattern) &&
            ts.isVariableDeclaration(variableDeclaration) &&
            variableDeclaration.initializer
          ) {
            origins.push(
              ...collectScopedResourceOrigins(
                variableDeclaration.initializer,
                writePath,
                parameterBindings,
                nextSymbols,
                visitedDeclarations,
                depth + 1
              )
            );
          } else if (
            ts.isArrayBindingPattern(pattern) &&
            ts.isVariableDeclaration(variableDeclaration) &&
            variableDeclaration.initializer
          ) {
            let initializer = unwrapExpression(variableDeclaration.initializer);
            if (ts.isAwaitExpression(initializer)) {
              initializer = unwrapExpression(initializer.expression);
            }
            if (ts.isCallExpression(initializer)) {
              const callee = unwrapExpression(initializer.expression);
              const values = initializer.arguments[0]
                ? unwrapExpression(initializer.arguments[0])
                : undefined;
              const bindingIndex = pattern.elements.indexOf(declaration);
              if (
                ts.isPropertyAccessExpression(callee) &&
                ts.isIdentifier(unwrapExpression(callee.expression)) &&
                unwrapExpression(callee.expression).text === 'Promise' &&
                callee.name.text === 'all' &&
                values &&
                ts.isArrayLiteralExpression(values) &&
                bindingIndex >= 0 &&
                values.elements[bindingIndex]
              ) {
                origins.push(
                  ...collectScopedResourceOrigins(
                    values.elements[bindingIndex],
                    writePath,
                    parameterBindings,
                    nextSymbols,
                    visitedDeclarations,
                    depth + 1
                  )
                );
              }
            }
          }
        } else if (ts.isParameter(declaration)) {
          const functionNode = declaration.parent;
          const parameterIndex = functionNode.parameters.indexOf(declaration);
          for (const call of relevantCallsForFunction(
            functionNode,
            writePath
          )) {
            const argument = call.arguments[parameterIndex];
            if (!argument) continue;
            origins.push(
              ...collectScopedResourceOrigins(
                argument,
                writePath,
                parameterBindings,
                nextSymbols,
                visitedDeclarations,
                depth + 1
              )
            );
          }
        }
      }
      return origins;
    }

    if (ts.isPropertyAccessExpression(unwrapped)) {
      const receiverOrigins = collectScopedResourceOrigins(
        unwrapped.expression,
        writePath,
        parameterBindings,
        visitedSymbols,
        visitedDeclarations,
        depth + 1
      );
      if (receiverOrigins.length > 0) return receiverOrigins;
      const propertyValues = collectResourcePropertyValues(
        unwrapped.expression,
        unwrapped.name.text,
        writePath,
        parameterBindings,
        visitedSymbols,
        visitedDeclarations,
        depth + 1
      );
      return propertyValues.flatMap(value =>
        collectScopedResourceOrigins(
          value,
          writePath,
          parameterBindings,
          new Set(visitedSymbols),
          visitedDeclarations,
          depth + 1
        )
      );
    }

    if (ts.isElementAccessExpression(unwrapped)) {
      return collectScopedResourceOrigins(
        unwrapped.expression,
        writePath,
        parameterBindings,
        visitedSymbols,
        visitedDeclarations,
        depth + 1
      );
    }

    if (ts.isObjectLiteralExpression(unwrapped)) {
      const origins = [];
      for (const property of unwrapped.properties) {
        if (ts.isSpreadAssignment(property)) {
          origins.push(
            ...collectScopedResourceOrigins(
              property.expression,
              writePath,
              parameterBindings,
              new Set(visitedSymbols),
              visitedDeclarations,
              depth + 1
            )
          );
          continue;
        }
        if (ts.isPropertyAssignment(property)) {
          const name = staticPropertyName(property.name);
          if (name && clinicSinkPropertyNames.has(name)) {
            origins.push({
              expression: property.initializer,
              parameterBindings,
            });
          }
        } else if (
          ts.isShorthandPropertyAssignment(property) &&
          clinicSinkPropertyNames.has(property.name.text)
        ) {
          origins.push({
            expression: property.name,
            parameterBindings,
          });
        }
      }
      return origins;
    }

    if (ts.isConditionalExpression(unwrapped)) {
      return [unwrapped.whenTrue, unwrapped.whenFalse].flatMap(branch =>
        collectScopedResourceOrigins(
          branch,
          writePath,
          parameterBindings,
          new Set(visitedSymbols),
          visitedDeclarations,
          depth + 1
        )
      );
    }

    if (
      ts.isBinaryExpression(unwrapped) &&
      unwrapped.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
    ) {
      return [unwrapped.left, unwrapped.right].flatMap(branch =>
        collectScopedResourceOrigins(
          branch,
          writePath,
          parameterBindings,
          new Set(visitedSymbols),
          visitedDeclarations,
          depth + 1
        )
      );
    }

    if (ts.isCallExpression(unwrapped)) {
      const externalShape = canonicalExternalMutationShape(unwrapped);
      if (externalShape) {
        const payload = unwrapped.arguments[externalShape.payloadIndex];
        if (payload) {
          const payloadState = {
            sinks: [],
            complete: true,
            inspected: false,
          };
          collectClinicPayloadSinks(
            payload,
            payloadState,
            unwrapped,
            new Set(),
            0,
            parameterBindings
          );
          if (payloadState.complete && payloadState.sinks.length > 0) {
            return payloadState.sinks.map(sink => ({
              expression: sink,
              parameterBindings:
                clinicSinkParameterBindings.get(sink) ?? parameterBindings,
            }));
          }
        }
      }
      const callee = unwrapExpression(unwrapped.expression);
      if (
        ts.isPropertyAccessExpression(callee) &&
        ['at', 'filter', 'find', 'slice'].includes(callee.name.text)
      ) {
        return collectScopedResourceOrigins(
          callee.expression,
          writePath,
          parameterBindings,
          visitedSymbols,
          visitedDeclarations,
          depth + 1
        );
      }
      const origins = [];
      for (const declaration of resolveCalledRepositoryDeclarations(
        checker,
        callee
      )) {
        const functionNode = functionNodeForDeclaration(declaration);
        if (!functionNode || visitedDeclarations.has(functionNode)) continue;
        const nextDeclarations = new Set(visitedDeclarations);
        nextDeclarations.add(functionNode);
        const nextBindings = bindingsForCall(
          functionNode,
          unwrapped,
          parameterBindings
        );
        for (const returned of functionReturnExpressions(functionNode)) {
          if (isNullishResourceExpression(returned)) continue;
          origins.push(
            ...collectScopedResourceOrigins(
              returned,
              writePath,
              nextBindings,
              new Set(visitedSymbols),
              nextDeclarations,
              depth + 1
            )
          );
        }
      }
      return origins;
    }
    return [];
  }

  function scopedResourceDependsOnGuardedValue(
    expression,
    guardedValue,
    writePath,
    parameterBindings,
    depth
  ) {
    const origins = collectScopedResourceOrigins(
      expression,
      writePath,
      parameterBindings
    );
    const matches =
      origins.length > 0 &&
      origins.every(origin =>
        expressionDependsOnGuardedValue(
          origin.expression,
          guardedValue,
          origin.expression,
          new Set(),
          depth + 1,
          writePath,
          origin.parameterBindings
        )
      );
    return matches;
  }

  function expressionDependsOnGuardedValue(
    expression,
    guardedValue,
    useNode = expression,
    visitedSymbols = new Set(),
    depth = 0,
    writePath,
    parameterBindings = new Map()
  ) {
    if (!expression || !guardedValue || depth > 16) return false;
    const unwrapped = unwrapExpression(expression);
    if (expressionsHaveStableSameValue(unwrapped, guardedValue, useNode)) {
      return true;
    }

    const unwrappedGuardedValue = unwrapExpression(guardedValue);
    if (ts.isIdentifier(unwrappedGuardedValue)) {
      const guardedSymbol = getIdentifierValueSymbol(
        checker,
        unwrappedGuardedValue
      );
      if (guardedSymbol) {
        const guardedTarget = resolveTargetSymbol(checker, guardedSymbol);
        if (!visitedSymbols.has(guardedTarget)) {
          const nextVisited = new Set(visitedSymbols);
          nextVisited.add(guardedTarget);
          for (const declaration of guardedTarget.declarations ?? []) {
            if (
              ts.isVariableDeclaration(declaration) &&
              declaration.initializer &&
              symbolIsStableBeforeUse(
                checker,
                guardedTarget,
                unwrappedGuardedValue,
                declaration.initializer
              ) &&
              expressionDependsOnGuardedValue(
                unwrapped,
                declaration.initializer,
                useNode,
                nextVisited,
                depth + 1,
                writePath,
                parameterBindings
              )
            ) {
              return true;
            }
          }
        }
      }
    }

    if (ts.isPropertyAccessExpression(unwrapped)) {
      if (
        unwrapped.name.text === 'id' &&
        expressionsHaveStableSameValue(
          unwrapped.expression,
          guardedValue,
          useNode
        )
      ) {
        return true;
      }
      if (
        clinicSinkPropertyNames.has(unwrapped.name.text) &&
        scopedResourceDependsOnGuardedValue(
          unwrapped.expression,
          guardedValue,
          writePath,
          parameterBindings,
          depth
        )
      ) {
        return true;
      }
      const mappedPropertyValues = collectResourcePropertyValues(
        unwrapped.expression,
        unwrapped.name.text,
        writePath,
        parameterBindings
      );
      if (
        mappedPropertyValues.length > 0 &&
        mappedPropertyValues.every(value =>
          expressionDependsOnGuardedValue(
            value,
            guardedValue,
            value,
            new Set(visitedSymbols),
            depth + 1,
            writePath,
            parameterBindings
          )
        )
      ) {
        return true;
      }
      const constructionValues = resolveThisPropertyConstructionValues(
        unwrapped,
        writePath
      );
      if (
        constructionValues.length > 0 &&
        constructionValues.every(value =>
          expressionDependsOnGuardedValue(
            value,
            guardedValue,
            value,
            new Set(visitedSymbols),
            depth + 1,
            writePath,
            parameterBindings
          )
        )
      ) {
        return true;
      }
    }

    if (
      ts.isPropertyAccessExpression(unwrapped) &&
      ts.isIdentifier(unwrapExpression(unwrapped.expression))
    ) {
      const receiver = unwrapExpression(unwrapped.expression);
      const receiverSymbol = getIdentifierValueSymbol(checker, receiver);
      if (receiverSymbol && unwrapped.name.text === 'id') {
        const receiverTarget = resolveTargetSymbol(checker, receiverSymbol);
        const insertParentScopes =
          resolveClinicInsertParentScopes(receiverTarget);
        if (
          insertParentScopes.length === 1 &&
          insertParentScopes.every(parentScope =>
            expressionDependsOnGuardedValue(
              parentScope,
              guardedValue,
              parentScope,
              new Set(visitedSymbols),
              depth + 1,
              writePath,
              parameterBindings
            )
          ) &&
          symbolHasNoDirectMutationBeforeUse(checker, receiverTarget, useNode)
        ) {
          return true;
        }
      }
      const boundArgument = receiverSymbol
        ? parameterBindings.get(resolveTargetSymbol(checker, receiverSymbol))
        : undefined;
      const guarded = unwrapExpression(guardedValue);
      const mappedProperty = boundArgument
        ? resolveStableStaticObjectProperty(
            boundArgument,
            unwrapped.name.text,
            useNode
          )
        : undefined;
      if (
        mappedProperty &&
        expressionDependsOnGuardedValue(
          mappedProperty,
          guardedValue,
          mappedProperty,
          new Set(visitedSymbols),
          depth + 1,
          writePath,
          parameterBindings
        )
      ) {
        return true;
      }
      if (receiverSymbol && writePath) {
        const receiverTarget = resolveTargetSymbol(checker, receiverSymbol);
        for (const declaration of receiverTarget.declarations ?? []) {
          if (!ts.isParameter(declaration)) continue;
          const functionNode = declaration.parent;
          const parameterIndex = functionNode.parameters.indexOf(declaration);
          if (parameterIndex < 0) continue;
          const matchingCall = writePath.callChain.find(call => {
            const callee = unwrapExpression(call.expression);
            return resolveCalledRepositoryDeclarations(checker, callee).some(
              candidate =>
                candidate === functionNode ||
                functionNodeForDeclaration(candidate) === functionNode
            );
          });
          const argument = matchingCall?.arguments[parameterIndex];
          if (
            argument &&
            ts.isPropertyAccessExpression(guarded) &&
            guarded.name.text === unwrapped.name.text &&
            expressionsHaveStableSameValue(
              argument,
              guarded.expression,
              matchingCall
            )
          ) {
            return true;
          }
          const argumentProperties = argument
            ? resolveObjectPropertyValuesForWritePath(
                argument,
                unwrapped.name.text,
                writePath
              )
            : [];
          if (
            argumentProperties.length > 0 &&
            symbolHasNoDirectMutationBeforeUse(
              checker,
              receiverTarget,
              useNode
            ) &&
            argumentProperties.every(argumentProperty =>
              expressionDependsOnGuardedValue(
                argumentProperty,
                guardedValue,
                matchingCall,
                new Set(visitedSymbols),
                depth + 1,
                writePath,
                parameterBindings
              )
            )
          ) {
            return true;
          }
        }
      }
      if (
        boundArgument &&
        ts.isPropertyAccessExpression(guarded) &&
        guarded.name.text === unwrapped.name.text &&
        (expressionsHaveSameValue(boundArgument, guarded.expression) ||
          expressionDependsOnGuardedValue(
            boundArgument,
            guarded.expression,
            boundArgument,
            new Set(visitedSymbols),
            depth + 1,
            writePath,
            parameterBindings
          ))
      ) {
        const boundRoot = rootValueSymbol(boundArgument);
        return boundRoot
          ? symbolHasNoDirectMutationBeforeUse(
              checker,
              boundRoot,
              boundArgument,
              guarded.expression
            )
          : true;
      }
    }

    if (ts.isIdentifier(unwrapped)) {
      const symbol = getIdentifierValueSymbol(checker, unwrapped);
      if (!symbol) return false;
      const target = resolveTargetSymbol(checker, symbol);
      const boundArgument = parameterBindings.get(target);
      if (boundArgument) {
        return expressionDependsOnGuardedValue(
          boundArgument,
          guardedValue,
          boundArgument,
          new Set(visitedSymbols),
          depth + 1,
          writePath,
          parameterBindings
        );
      }
      if (visitedSymbols.has(target)) return false;
      const nextVisited = new Set(visitedSymbols);
      nextVisited.add(target);

      const boundary = findContainingFunction(useNode);
      if (boundary) {
        const assignments = [];
        function visitAssignments(node) {
          if (node !== boundary && ts.isFunctionLike(node)) return;
          if (node.getStart() >= useNode.getStart()) return;
          if (
            ts.isBinaryExpression(node) &&
            node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            ts.isIdentifier(unwrapExpression(node.left))
          ) {
            const leftSymbol = getIdentifierValueSymbol(
              checker,
              unwrapExpression(node.left)
            );
            if (
              leftSymbol &&
              resolveTargetSymbol(checker, leftSymbol) === target
            ) {
              assignments.push(node.right);
            }
          }
          ts.forEachChild(node, visitAssignments);
        }
        visitAssignments(boundary);
        if (assignments.length > 0) {
          return assignments.every(assignment =>
            expressionDependsOnGuardedValue(
              assignment,
              guardedValue,
              assignment,
              new Set(nextVisited),
              depth + 1,
              writePath,
              parameterBindings
            )
          );
        }
      }

      for (const declaration of target.declarations ?? []) {
        if (
          ts.isVariableDeclaration(declaration) &&
          declaration.initializer &&
          expressionDependsOnGuardedValue(
            declaration.initializer,
            guardedValue,
            declaration.initializer,
            nextVisited,
            depth + 1,
            writePath,
            parameterBindings
          )
        ) {
          return symbolIsStableBeforeUse(
            checker,
            target,
            useNode,
            declaration.initializer
          );
        }
        if (ts.isBindingElement(declaration)) {
          const pattern = declaration.parent;
          const variableDeclaration = pattern.parent;
          const propertyName = declaration.propertyName ?? declaration.name;
          const guarded = unwrapExpression(guardedValue);
          if (
            ts.isObjectBindingPattern(pattern) &&
            ts.isVariableDeclaration(variableDeclaration) &&
            variableDeclaration.initializer &&
            (ts.isIdentifier(propertyName) ||
              ts.isStringLiteral(propertyName)) &&
            ts.isPropertyAccessExpression(guarded) &&
            guarded.name.text === propertyName.text &&
            expressionsHaveSameValue(
              guarded.expression,
              variableDeclaration.initializer
            )
          ) {
            return symbolIsStableBeforeUse(
              checker,
              target,
              useNode,
              variableDeclaration.initializer
            );
          }
          if (
            ts.isObjectBindingPattern(pattern) &&
            ts.isParameter(pattern.parent) &&
            (ts.isIdentifier(propertyName) ||
              ts.isStringLiteral(propertyName)) &&
            writePath
          ) {
            const parameter = pattern.parent;
            const functionNode = parameter.parent;
            const parameterIndex = functionNode.parameters.indexOf(parameter);
            const values = relevantCallsForFunction(
              functionNode,
              writePath
            ).flatMap(call => {
              const argument = call.arguments[parameterIndex];
              return argument
                ? resolveObjectPropertyValuesForWritePath(
                    argument,
                    propertyName.text,
                    writePath
                  )
                : [];
            });
            if (
              values.length > 0 &&
              values.every(value =>
                expressionDependsOnGuardedValue(
                  value,
                  guardedValue,
                  value,
                  new Set(nextVisited),
                  depth + 1,
                  writePath,
                  parameterBindings
                )
              )
            ) {
              return true;
            }
          }
        }
        if (ts.isParameter(declaration) && writePath) {
          const functionNode = declaration.parent;
          const parameterIndex = functionNode.parameters.indexOf(declaration);
          if (parameterIndex < 0) continue;
          const matchingCall = writePath.callChain.find(call => {
            const callee = unwrapExpression(call.expression);
            return resolveCalledRepositoryDeclarations(checker, callee).some(
              candidate =>
                candidate === functionNode ||
                functionNodeForDeclaration(candidate) === functionNode
            );
          });
          const argument = matchingCall?.arguments[parameterIndex];
          if (
            argument &&
            symbolHasNoDirectMutationBeforeUse(checker, target, useNode) &&
            expressionDependsOnGuardedValue(
              argument,
              guardedValue,
              matchingCall,
              nextVisited,
              depth + 1,
              writePath,
              parameterBindings
            )
          ) {
            return true;
          }
        }
      }
    }

    let found = false;
    function visit(child) {
      if (found) return;
      if (
        expressionDependsOnGuardedValue(
          child,
          guardedValue,
          useNode,
          new Set(visitedSymbols),
          depth + 1,
          writePath,
          parameterBindings
        )
      ) {
        found = true;
      }
    }
    ts.forEachChild(unwrapped, visit);
    return found;
  }

  const clinicSinkPropertyNames = new Set([
    'affected_clinics',
    'clinic_id',
    'clinic_ids',
    'clinicId',
    'clinicIds',
    'org_root_clinic_id',
    'owner_clinic_id',
    'ownerClinicId',
    'p_clinic_id',
    'p_clinic_ids',
    'p_primary_clinic_id',
    'target_clinic_id',
    'targetClinicId',
  ]);
  const nestedClinicPayloadPropertyNames = new Set([
    'context_data',
    'details',
    'metadata',
  ]);
  const clinicSinkParameterBindings = new Map();
  const clinicSinkPropertyNamesByExpression = new Map();

  function pushClinicSink(
    state,
    expression,
    parameterBindings = new Map(),
    propertyName
  ) {
    state.sinks.push(expression);
    if (parameterBindings.size > 0) {
      clinicSinkParameterBindings.set(expression, new Map(parameterBindings));
    }
    if (propertyName) {
      clinicSinkPropertyNamesByExpression.set(expression, propertyName);
    }
  }

  function staticPropertyName(node) {
    return ts.isIdentifier(node) ||
      ts.isStringLiteral(node) ||
      ts.isNumericLiteral(node)
      ? node.text
      : undefined;
  }

  function collectClinicPayloadMutations(
    checkerValue,
    targetSymbol,
    useNode,
    sinceNode,
    state,
    parameterBindings,
    visitedDeclarations
  ) {
    const boundary = findContainingFunction(useNode);
    if (!boundary) return false;
    let safe = true;

    function visit(node) {
      if (!safe) return;
      if (node !== boundary && ts.isFunctionLike(node)) return;
      if (node.getStart() >= useNode.getStart()) return;
      if (node.getEnd() <= sinceNode.getEnd()) return;
      const containsOrigin = isNodeWithin(sinceNode, node);
      const containsUse = isNodeWithin(useNode, node);

      if (
        !containsOrigin &&
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
        expressionRootsAtSymbol(checkerValue, node.left, targetSymbol)
      ) {
        const left = unwrapExpression(node.left);
        if (ts.isIdentifier(left)) {
          safe = false;
          return;
        }
        if (ts.isPropertyAccessExpression(left)) {
          if (clinicSinkPropertyNames.has(left.name.text)) {
            pushClinicSink(
              state,
              node.right,
              parameterBindings,
              left.name.text
            );
          }
          return;
        }
        if (ts.isElementAccessExpression(left)) {
          const argument = unwrapExpression(left.argumentExpression);
          if (!ts.isStringLiteral(argument)) {
            safe = false;
            return;
          }
          if (clinicSinkPropertyNames.has(argument.text)) {
            pushClinicSink(state, node.right, parameterBindings, argument.text);
          }
          return;
        }
        safe = false;
        return;
      }

      if (ts.isCallExpression(node) && !containsOrigin && !containsUse) {
        const callee = unwrapExpression(node.expression);
        if (
          ts.isPropertyAccessExpression(callee) &&
          ['push', 'unshift'].includes(callee.name.text) &&
          expressionRootsAtSymbol(checkerValue, callee.expression, targetSymbol)
        ) {
          for (const argument of node.arguments) {
            collectClinicPayloadSinks(
              ts.isSpreadElement(argument) ? argument.expression : argument,
              state,
              node,
              new Set(),
              0,
              parameterBindings,
              visitedDeclarations
            );
          }
          return;
        }
        const mutatesTarget =
          (ts.isPropertyAccessExpression(callee) &&
            expressionRootsAtSymbol(
              checkerValue,
              callee.expression,
              targetSymbol
            ) &&
            [
              'copyWithin',
              'fill',
              'pop',
              'push',
              'reverse',
              'shift',
              'sort',
              'splice',
              'unshift',
            ].includes(callee.name.text)) ||
          (ts.isPropertyAccessExpression(callee) &&
            ['assign', 'set'].includes(callee.name.text) &&
            node.arguments[0] &&
            expressionRootsAtSymbol(
              checkerValue,
              node.arguments[0],
              targetSymbol
            ));
        if (mutatesTarget) {
          safe = false;
          return;
        }
        if (
          node.arguments.some(argument =>
            expressionRootsAtSymbol(checkerValue, argument, targetSymbol)
          )
        ) {
          safe = false;
          return;
        }
      }
      ts.forEachChild(node, visit);
    }

    visit(boundary);
    return safe;
  }

  function collectClinicPayloadSinks(
    expression,
    state,
    useNode = expression,
    visitedSymbols = new Set(),
    depth = 0,
    parameterBindings = new Map(),
    visitedDeclarations = new Set()
  ) {
    if (!expression || depth > 12) {
      state.complete = false;
      return;
    }
    const unwrapped = unwrapExpression(expression);
    if (ts.isIdentifier(unwrapped)) {
      const symbol = getIdentifierValueSymbol(checker, unwrapped);
      if (!symbol) {
        state.complete = false;
        return;
      }
      const target = resolveTargetSymbol(checker, symbol);
      const boundArgument = parameterBindings.get(target);
      if (boundArgument) {
        collectClinicPayloadSinks(
          boundArgument,
          state,
          useNode,
          new Set(visitedSymbols),
          depth + 1,
          parameterBindings,
          visitedDeclarations
        );
        return;
      }
      if (visitedSymbols.has(target)) {
        state.complete = false;
        return;
      }
      const nextVisited = new Set(visitedSymbols);
      nextVisited.add(target);
      let resolved = false;
      for (const declaration of target.declarations ?? []) {
        if (ts.isBindingElement(declaration)) {
          resolved = true;
          state.inspected = true;
          continue;
        }
        if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
          resolved = true;
          state.inspected = true;
          const localUseNode =
            unwrapped.getSourceFile() === declaration.getSourceFile()
              ? unwrapped
              : useNode;
          if (
            !collectClinicPayloadMutations(
              checker,
              target,
              localUseNode,
              declaration.initializer,
              state,
              parameterBindings,
              visitedDeclarations
            )
          ) {
            state.complete = false;
            continue;
          }
          collectClinicPayloadSinks(
            declaration.initializer,
            state,
            localUseNode,
            nextVisited,
            depth + 1,
            parameterBindings,
            visitedDeclarations
          );
        }
      }
      if (!resolved) state.complete = false;
      return;
    }
    if (ts.isObjectLiteralExpression(unwrapped)) {
      state.inspected = true;
      const settledClinicProperties = new Set();
      for (const property of [...unwrapped.properties].reverse()) {
        if (ts.isPropertyAssignment(property)) {
          const name = staticPropertyName(property.name);
          if (
            name &&
            clinicSinkPropertyNames.has(name) &&
            !settledClinicProperties.has(name)
          ) {
            pushClinicSink(
              state,
              property.initializer,
              parameterBindings,
              name
            );
            settledClinicProperties.add(name);
          } else if (name && nestedClinicPayloadPropertyNames.has(name)) {
            collectClinicPayloadSinks(
              property.initializer,
              state,
              useNode,
              new Set(visitedSymbols),
              depth + 1,
              parameterBindings,
              visitedDeclarations
            );
          } else if (ts.isComputedPropertyName(property.name)) {
            state.complete = false;
          }
        } else if (ts.isShorthandPropertyAssignment(property)) {
          if (
            clinicSinkPropertyNames.has(property.name.text) &&
            !settledClinicProperties.has(property.name.text)
          ) {
            pushClinicSink(
              state,
              property.name,
              parameterBindings,
              property.name.text
            );
            settledClinicProperties.add(property.name.text);
          }
        } else if (ts.isSpreadAssignment(property)) {
          const spreadState = { sinks: [], complete: true, inspected: false };
          collectClinicPayloadSinks(
            property.expression,
            spreadState,
            useNode,
            new Set(visitedSymbols),
            depth + 1,
            parameterBindings,
            visitedDeclarations
          );
          if (!spreadState.complete || !spreadState.inspected) {
            state.complete = false;
          }
          for (const sink of spreadState.sinks) {
            const name = clinicSinkPropertyNamesByExpression.get(sink);
            if (name && settledClinicProperties.has(name)) continue;
            pushClinicSink(
              state,
              sink,
              clinicSinkParameterBindings.get(sink) ?? new Map(),
              name
            );
            if (name && !ts.isConditionalExpression(property.expression)) {
              settledClinicProperties.add(name);
            }
          }
        } else {
          state.complete = false;
        }
      }
      return;
    }
    if (ts.isArrayLiteralExpression(unwrapped)) {
      state.inspected = true;
      for (const element of unwrapped.elements) {
        collectClinicPayloadSinks(
          ts.isSpreadElement(element) ? element.expression : element,
          state,
          useNode,
          new Set(visitedSymbols),
          depth + 1,
          parameterBindings,
          visitedDeclarations
        );
      }
      return;
    }
    if (ts.isConditionalExpression(unwrapped)) {
      state.inspected = true;
      collectClinicPayloadSinks(
        unwrapped.whenTrue,
        state,
        useNode,
        new Set(visitedSymbols),
        depth + 1,
        parameterBindings,
        visitedDeclarations
      );
      collectClinicPayloadSinks(
        unwrapped.whenFalse,
        state,
        useNode,
        new Set(visitedSymbols),
        depth + 1,
        parameterBindings,
        visitedDeclarations
      );
      return;
    }
    if (ts.isCallExpression(unwrapped)) {
      const callee = unwrapExpression(unwrapped.expression);
      if (
        ts.isPropertyAccessExpression(callee) &&
        ['flatMap', 'map'].includes(callee.name.text)
      ) {
        state.inspected = true;
        const callback = unwrapExpression(unwrapped.arguments[0]);
        if (
          !callback ||
          (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback))
        ) {
          state.complete = false;
          return;
        }
        const returnedExpressions = [];
        if (!ts.isBlock(callback.body)) {
          returnedExpressions.push(callback.body);
        } else {
          function visitCallbackReturns(node) {
            if (node !== callback.body && ts.isFunctionLike(node)) return;
            if (ts.isReturnStatement(node)) {
              if (node.expression) returnedExpressions.push(node.expression);
              else state.complete = false;
              return;
            }
            ts.forEachChild(node, visitCallbackReturns);
          }
          visitCallbackReturns(callback.body);
        }
        if (returnedExpressions.length === 0) {
          state.complete = false;
          return;
        }
        for (const returnedExpression of returnedExpressions) {
          collectClinicPayloadSinks(
            returnedExpression,
            state,
            returnedExpression,
            new Set(visitedSymbols),
            depth + 1,
            parameterBindings,
            visitedDeclarations
          );
        }
        return;
      }
      if (!ts.isIdentifier(callee)) return;
      const symbol = checker.getSymbolAtLocation(callee);
      if (!symbol) return;
      const target = resolveTargetSymbol(checker, symbol);
      const declaration = (target.declarations ?? []).find(candidate => {
        if (candidate.getSourceFile().isDeclarationFile) return false;
        return Boolean(functionNodeForDeclaration(candidate));
      });
      if (!declaration || visitedDeclarations.has(declaration)) {
        state.complete = false;
        return;
      }
      const functionNode = functionNodeForDeclaration(declaration);
      if (!functionNode) return;
      state.inspected = true;
      const nextDeclarations = new Set(visitedDeclarations);
      nextDeclarations.add(declaration);
      const nextBindings = new Map(parameterBindings);
      for (const [index, parameter] of functionNode.parameters.entries()) {
        const argument = unwrapped.arguments[index];
        if (!argument) continue;
        if (ts.isIdentifier(parameter.name)) {
          const parameterSymbol = getIdentifierValueSymbol(
            checker,
            parameter.name
          );
          if (!parameterSymbol) continue;
          nextBindings.set(
            resolveTargetSymbol(checker, parameterSymbol),
            argument
          );
          continue;
        }
        if (!ts.isObjectBindingPattern(parameter.name)) {
          state.complete = false;
          continue;
        }
        for (const element of parameter.name.elements) {
          if (
            element.dotDotDotToken ||
            !ts.isIdentifier(element.name) ||
            (element.propertyName &&
              !ts.isIdentifier(element.propertyName) &&
              !ts.isStringLiteral(element.propertyName))
          ) {
            state.complete = false;
            continue;
          }
          const propertyName = (element.propertyName ?? element.name).text;
          const propertyValue = resolveStableStaticObjectProperty(
            argument,
            propertyName,
            unwrapped
          );
          const elementSymbol = getIdentifierValueSymbol(checker, element.name);
          if (!elementSymbol) {
            state.complete = false;
            continue;
          }
          if (!propertyValue) continue;
          nextBindings.set(
            resolveTargetSymbol(checker, elementSymbol),
            propertyValue
          );
        }
      }

      const returnedExpressions = [];
      if (!ts.isBlock(functionNode.body)) {
        returnedExpressions.push(functionNode.body);
      } else {
        function visitReturns(node) {
          if (node !== functionNode.body && ts.isFunctionLike(node)) return;
          if (ts.isReturnStatement(node)) {
            if (node.expression) returnedExpressions.push(node.expression);
            else state.complete = false;
            return;
          }
          ts.forEachChild(node, visitReturns);
        }
        visitReturns(functionNode.body);
      }
      if (returnedExpressions.length === 0) {
        state.complete = false;
        return;
      }
      for (const returnedExpression of returnedExpressions) {
        collectClinicPayloadSinks(
          returnedExpression,
          state,
          unwrapped,
          new Set(visitedSymbols),
          depth + 1,
          nextBindings,
          nextDeclarations
        );
      }
      return;
    }
  }

  function staticSupabaseTableName(expression, depth = 0) {
    if (!expression || depth > 16) return undefined;
    const unwrapped = unwrapExpression(expression);
    if (ts.isCallExpression(unwrapped)) {
      const callee = unwrapExpression(unwrapped.expression);
      if (ts.isPropertyAccessExpression(callee)) {
        if (
          callee.name.text === 'from' &&
          unwrapped.arguments.length === 1 &&
          ts.isStringLiteral(unwrapExpression(unwrapped.arguments[0]))
        ) {
          return unwrapExpression(unwrapped.arguments[0]).text;
        }
        return staticSupabaseTableName(callee.expression, depth + 1);
      }
      return undefined;
    }
    if (
      ts.isPropertyAccessExpression(unwrapped) ||
      ts.isElementAccessExpression(unwrapped)
    ) {
      return staticSupabaseTableName(unwrapped.expression, depth + 1);
    }
    return undefined;
  }

  function isCanonicalGlobalObservabilityWrite(call) {
    const sourcePath = normalizePath(
      path.relative(REPO_ROOT, call.getSourceFile().fileName)
    );
    return (
      sourcePath === 'src/lib/billing/audit.ts' &&
      namedFunctionBoundary(call) === 'writeBillingAuditLog' &&
      staticSupabaseTableName(call) === 'billing_audit_logs'
    );
  }

  function isCanonicalScopedChatSessionWritePath(writePath) {
    const leaf = writePath.leaf;
    const sourcePath = normalizePath(
      path.relative(REPO_ROOT, leaf.getSourceFile().fileName)
    );
    const boundary = findContainingFunction(leaf);
    if (
      sourcePath !== 'src/lib/chat/scoped-session.ts' ||
      !boundary ||
      namedFunctionBoundary(leaf) !== 'createScopedAdminChatSession' ||
      staticSupabaseTableName(leaf) !== 'chat_sessions'
    ) {
      return false;
    }

    const payload = leaf.arguments[0];
    const payloadClinicId = resolveStableStaticObjectProperty(
      payload,
      'clinic_id',
      leaf
    );
    const payloadContextData = resolveStableStaticObjectProperty(
      payload,
      'context_data',
      leaf
    );
    if (!payloadClinicId || !payloadContextData) return false;

    let hasExactInternalScopeAssertion = false;
    function visit(node) {
      if (hasExactInternalScopeAssertion) return;
      if (node !== boundary && ts.isFunctionLike(node)) return;
      if (
        ts.isCallExpression(node) &&
        node.getStart() < leaf.getStart() &&
        !isConditionallyExecuted(node, boundary)
      ) {
        const callee = unwrapExpression(node.expression);
        const declaration = ts.isIdentifier(callee)
          ? resolveCalledRepositoryDeclarations(checker, callee).find(
              candidate =>
                namedFunctionBoundary(candidate) ===
                  'assertAdminSessionContextInScope' ||
                (ts.isFunctionDeclaration(candidate) &&
                  candidate.name?.text === 'assertAdminSessionContextInScope')
            )
          : undefined;
        const input = node.arguments[0];
        const context = resolveStableStaticObjectProperty(
          input,
          'context',
          node
        );
        const sessionClinicId = resolveStableStaticObjectProperty(
          input,
          'sessionClinicId',
          node
        );
        const requestedClinicId = resolveStableStaticObjectProperty(
          input,
          'requestedClinicId',
          node
        );
        const contextData = resolveStableStaticObjectProperty(
          input,
          'contextData',
          node
        );
        if (
          declaration &&
          declaration.getSourceFile() === leaf.getSourceFile() &&
          context &&
          sessionClinicId &&
          requestedClinicId &&
          contextData &&
          expressionsHaveSameValue(sessionClinicId, payloadClinicId) &&
          expressionsHaveSameValue(requestedClinicId, payloadClinicId) &&
          expressionsHaveSameValue(contextData, payloadContextData) &&
          context.getText(context.getSourceFile()) === 'input.context'
        ) {
          hasExactInternalScopeAssertion = true;
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(boundary);
    if (!hasExactInternalScopeAssertion) return false;

    return writePath.callChain.some(call => {
      if (
        exactImportedCallKey(checker, call) !==
        '@/lib/chat/scoped-session#createScopedAdminChatSession'
      ) {
        return false;
      }
      const context = resolveStableStaticObjectProperty(
        call.arguments[0],
        'context',
        call
      );
      if (!context || !ts.isIdentifier(unwrapExpression(context))) return false;
      const symbol = getIdentifierValueSymbol(
        checker,
        unwrapExpression(context)
      );
      return Boolean(symbol && scopedAdminBindings.has(symbol));
    });
  }

  function collectClinicSinksForCheckpoint(checkpoint, writePath) {
    const state = { sinks: [], complete: true, inspected: false };
    const boundary = findContainingFunction(checkpoint);
    const boundaryCall = boundary
      ? relevantCallsForFunction(boundary, writePath)[0]
      : undefined;
    const checkpointBindings =
      boundary && boundaryCall
        ? bindingsForCall(boundary, boundaryCall, new Map())
        : new Map();
    function visit(node) {
      if (node !== checkpoint && ts.isFunctionLike(node)) return;
      if (ts.isCallExpression(node)) {
        const callee = unwrapExpression(node.expression);
        const externalMutation = canonicalExternalMutationShape(node);
        if (externalMutation) {
          const payload = node.arguments[externalMutation.payloadIndex];
          if (payload) {
            collectClinicPayloadSinks(
              payload,
              state,
              node,
              new Set(),
              0,
              checkpointBindings
            );
          }
          const resourceId =
            externalMutation.resourceIdIndex === undefined
              ? externalMutation.resourceProperty && payload
                ? resolveStableStaticObjectProperty(
                    payload,
                    externalMutation.resourceProperty,
                    node
                  )
                : undefined
              : node.arguments[externalMutation.resourceIdIndex];
          if (resourceId) {
            pushClinicSink(
              state,
              resourceId,
              checkpointBindings,
              '__scoped_resource_id__'
            );
          } else {
            state.complete = false;
          }
        } else if (
          isSemanticWriteLikeCall(checker, node) &&
          node.arguments[0]
        ) {
          collectClinicPayloadSinks(
            node.arguments[0],
            state,
            node,
            new Set(),
            0,
            checkpointBindings
          );
          if (
            staticSupabaseTableName(node) === 'chat_messages' &&
            ts.isPropertyAccessExpression(callee) &&
            ['insert', 'upsert'].includes(callee.name.text)
          ) {
            const sessionId = resolveStableStaticObjectProperty(
              node.arguments[0],
              'session_id',
              node
            );
            if (sessionId) {
              pushClinicSink(state, sessionId, new Map(), 'session_id');
            } else {
              state.complete = false;
            }
          }
          if (
            ts.isPropertyAccessExpression(callee) &&
            ['insert', 'upsert'].includes(callee.name.text) &&
            staticSupabaseTableName(node) === 'clinics'
          ) {
            const parentId = resolveStableStaticObjectProperty(
              node.arguments[0],
              'parent_id',
              node
            );
            if (parentId) {
              pushClinicSink(state, parentId, new Map(), 'parent_id');
            } else {
              state.complete = false;
            }
          }
        }
        if (isCanonicalOpaqueMutationCall(checker, node) && !externalMutation) {
          const opaquePayload = node.arguments[1] ?? node.arguments[0];
          if (opaquePayload) {
            collectClinicPayloadSinks(
              opaquePayload,
              state,
              node,
              new Set(),
              0,
              checkpointBindings
            );
          }
        }
        if (
          ts.isPropertyAccessExpression(callee) &&
          callee.name.text === 'rpc' &&
          node.arguments[1]
        ) {
          collectClinicPayloadSinks(
            node.arguments[1],
            state,
            node,
            new Set(),
            0,
            checkpointBindings
          );
        }
        if (
          ts.isPropertyAccessExpression(callee) &&
          ['containedBy', 'eq', 'in'].includes(callee.name.text) &&
          node.arguments.length >= 2
        ) {
          const column = unwrapExpression(node.arguments[0]);
          if (
            ts.isStringLiteral(column) &&
            (clinicSinkPropertyNames.has(column.text) ||
              (column.text === 'id' &&
                staticSupabaseTableName(node) === 'clinics'))
          ) {
            pushClinicSink(
              state,
              node.arguments[1],
              new Map(),
              column.text === 'id' ? 'clinic_id' : column.text
            );
          } else if (
            ts.isStringLiteral(column) &&
            column.text === 'id' &&
            staticSupabaseTableName(node) !== 'clinics'
          ) {
            pushClinicSink(
              state,
              node.arguments[1],
              new Map(),
              '__scoped_resource_id__'
            );
          }
        }
        const auditMethod = resolveCanonicalAuditMethod(node.expression);
        if (
          ['logDataAccess', 'logDataExport'].includes(auditMethod) &&
          node.arguments[4]
        ) {
          pushClinicSink(state, node.arguments[4], new Map(), 'clinic_id');
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(checkpoint);
    if (
      state.sinks.some(
        sink =>
          clinicSinkPropertyNamesByExpression.get(sink) !==
          '__scoped_resource_id__'
      )
    ) {
      state.sinks = state.sinks.filter(
        sink =>
          clinicSinkPropertyNamesByExpression.get(sink) !==
          '__scoped_resource_id__'
      );
    }
    return state;
  }

  function clinicCandidatesProtectWritePath(candidates, writePath) {
    const dominantCandidates = candidates.filter(candidate =>
      candidateProtectsWritePath(candidate, writePath)
    );
    if (dominantCandidates.length === 0) return false;
    // Audit rows are global observability records. They are still treated as
    // reachable persistence, so every applicable auth/scope gate must dominate
    // the canonical call, but the audit table itself does not have to carry the
    // domain write's clinic key.
    if (
      resolveCanonicalAuditMethod(writePath.leaf.expression) ||
      isCanonicalGlobalObservabilityWrite(writePath.leaf) ||
      isCanonicalScopedChatSessionWritePath(writePath)
    ) {
      return true;
    }
    const checkpoints = [writePath.leaf, ...writePath.callChain].map(
      checkpoint => {
        let current = checkpoint;
        while (current.parent) {
          const parent = current.parent;
          if (
            (ts.isPropertyAccessExpression(parent) ||
              ts.isElementAccessExpression(parent)) &&
            parent.expression === current
          ) {
            current = parent;
            continue;
          }
          if (ts.isCallExpression(parent) && parent.expression === current) {
            current = parent;
            continue;
          }
          if (
            (ts.isAwaitExpression(parent) ||
              ts.isParenthesizedExpression(parent)) &&
            parent.expression === current
          ) {
            current = parent;
            continue;
          }
          break;
        }
        return current;
      }
    );
    const collected = checkpoints.map(checkpoint =>
      collectClinicSinksForCheckpoint(checkpoint, writePath)
    );
    const sinkMatchesCandidate = sink =>
      dominantCandidates.some(candidate => {
        const bindings = clinicScopeCandidateBindings.get(candidate) ?? [];
        const parameterBindings =
          clinicSinkParameterBindings.get(sink) ?? new Map();
        return bindings.some(binding =>
          clinicSinkPropertyNamesByExpression.get(sink) ===
          '__scoped_resource_id__'
            ? scopedResourceDependsOnGuardedValue(
                sink,
                binding,
                writePath,
                parameterBindings,
                0
              )
            : expressionDependsOnGuardedValue(
                sink,
                binding,
                sink,
                new Set(),
                0,
                writePath,
                parameterBindings
              )
        );
      });
    if (collected.some(state => !state.complete)) {
      return false;
    }
    const sinks = collected.flatMap(state => state.sinks);
    if (sinks.length === 0) {
      return false;
    }
    const leafCallee = unwrapExpression(writePath.leaf.expression);
    const isUpdateWrite =
      ts.isPropertyAccessExpression(leafCallee) &&
      leafCallee.name.text === 'update';
    const nonNullSinks = sinks.filter(
      sink => unwrapExpression(sink).kind !== ts.SyntaxKind.NullKeyword
    );
    if (
      isUpdateWrite &&
      nonNullSinks.length > 0 &&
      nonNullSinks.length < sinks.length
    ) {
      return nonNullSinks.every(sinkMatchesCandidate);
    }
    return sinks.every(sinkMatchesCandidate);
  }

  function clinicCandidateProtectsWritePath(candidate, writePath) {
    return clinicCandidatesProtectWritePath([candidate], writePath);
  }

  function writePathTouchesNode(writePath, node) {
    return [writePath.leaf, ...writePath.callChain].some(checkpoint =>
      isNodeWithin(checkpoint, node)
    );
  }

  function hasExplicitAlternateClinicScopeBypass(
    clinicScopeCandidates,
    writePaths
  ) {
    for (const candidate of clinicScopeCandidates) {
      const boundary = findContainingFunction(candidate);
      let current = candidate.parent;
      while (current && current !== boundary) {
        if (ts.isIfStatement(current)) {
          const guardedBranch = isNodeWithin(candidate, current.thenStatement)
            ? current.thenStatement
            : current.elseStatement &&
                isNodeWithin(candidate, current.elseStatement)
              ? current.elseStatement
              : undefined;
          if (guardedBranch) {
            const protectedBranchWrite = writePaths.some(
              writePath =>
                writePathTouchesNode(writePath, guardedBranch) &&
                clinicCandidatesProtectWritePath(
                  clinicScopeCandidates,
                  writePath
                )
            );
            const alternateWrite = writePaths.some(writePath => {
              const touchesGuardedBranch = writePathTouchesNode(
                writePath,
                guardedBranch
              );
              if (touchesGuardedBranch) return false;
              const touchesExplicitElse = Boolean(
                current.elseStatement &&
                writePathTouchesNode(writePath, current.elseStatement)
              );
              const followsConditional = [
                writePath.leaf,
                ...writePath.callChain,
              ].some(checkpoint => checkpoint.getStart() > current.getEnd());
              if (!touchesExplicitElse && !followsConditional) return false;
              return !clinicCandidatesProtectWritePath(
                clinicScopeCandidates,
                writePath
              );
            });
            if (protectedBranchWrite && alternateWrite) return true;
          }
        }
        current = current.parent;
      }
    }
    return false;
  }

  function declarationMayWrite(declaration, visited = new Set()) {
    if (!declaration || visited.has(declaration)) return false;
    visited.add(declaration);
    let found = false;
    const traversalRoot = getFunctionBody(declaration) ?? declaration;

    function visit(node) {
      if (found) return;
      if (node !== traversalRoot && ts.isFunctionLike(node)) return;
      if (ts.isCallExpression(node)) {
        if (
          isSemanticWriteLikeCall(checker, node) ||
          isCanonicalOpaqueMutationCall(checker, node)
        ) {
          found = true;
          return;
        }
        if (isCanonicalPolicyEvidenceCall(checker, node)) {
          ts.forEachChild(node, visit);
          return;
        }
        const expression = unwrapExpression(node.expression);
        for (const calledDeclaration of resolveCalledRepositoryDeclarations(
          checker,
          expression
        )) {
          if (declarationMayWrite(calledDeclaration, visited)) {
            found = true;
            return;
          }
        }
      }
      ts.forEachChild(node, visit);
    }

    visit(traversalRoot);
    return found;
  }

  function functionNodeForDeclaration(declaration) {
    if (ts.isFunctionLike(declaration)) return declaration;
    if (!ts.isVariableDeclaration(declaration) || !declaration.initializer) {
      return undefined;
    }
    const initializer = unwrapExpression(declaration.initializer);
    return ts.isArrowFunction(initializer) ||
      ts.isFunctionExpression(initializer)
      ? initializer
      : undefined;
  }

  const rootFunction = functionNodeForDeclaration(startNode);

  function findCallSitesForDeclaration(targetDeclaration) {
    const calls = [];
    function visit(node) {
      if (ts.isCallExpression(node)) {
        const expression = unwrapExpression(node.expression);
        if (
          ts.isIdentifier(expression) &&
          resolveCalledLocalDeclaration(checker, expression, sourceFile) ===
            targetDeclaration
        ) {
          calls.push(node);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    return calls;
  }

  function expressionIsStaticValue(expression, depth = 0) {
    if (!expression || depth > 8) return false;
    const unwrapped = unwrapExpression(expression);
    if (
      ts.isStringLiteral(unwrapped) ||
      ts.isNumericLiteral(unwrapped) ||
      unwrapped.kind === ts.SyntaxKind.TrueKeyword ||
      unwrapped.kind === ts.SyntaxKind.FalseKeyword ||
      unwrapped.kind === ts.SyntaxKind.NullKeyword ||
      (ts.isIdentifier(unwrapped) && unwrapped.text === 'undefined')
    ) {
      return true;
    }
    if (ts.isArrayLiteralExpression(unwrapped)) {
      return unwrapped.elements.every(element =>
        expressionIsStaticValue(
          ts.isSpreadElement(element) ? element.expression : element,
          depth + 1
        )
      );
    }
    if (ts.isObjectLiteralExpression(unwrapped)) {
      return unwrapped.properties.every(property => {
        if (ts.isPropertyAssignment(property)) {
          return expressionIsStaticValue(property.initializer, depth + 1);
        }
        if (ts.isShorthandPropertyAssignment(property)) return false;
        if (ts.isSpreadAssignment(property)) {
          return expressionIsStaticValue(property.expression, depth + 1);
        }
        return false;
      });
    }
    return false;
  }

  function expressionIsRequestDerived(
    expression,
    useNode = expression,
    visitedSymbols = new Set(),
    visitedDeclarations = new Set(),
    depth = 0
  ) {
    if (!expression || depth > 20) return false;
    const unwrapped = unwrapExpression(expression);

    if (ts.isAwaitExpression(unwrapped)) {
      return expressionIsRequestDerived(
        unwrapped.expression,
        useNode,
        visitedSymbols,
        visitedDeclarations,
        depth + 1
      );
    }
    if (
      ts.isPropertyAccessExpression(unwrapped) ||
      ts.isElementAccessExpression(unwrapped)
    ) {
      return expressionIsRequestDerived(
        unwrapped.expression,
        useNode,
        visitedSymbols,
        visitedDeclarations,
        depth + 1
      );
    }
    if (ts.isConditionalExpression(unwrapped)) {
      return (
        expressionIsRequestDerived(
          unwrapped.whenTrue,
          useNode,
          new Set(visitedSymbols),
          new Set(visitedDeclarations),
          depth + 1
        ) &&
        expressionIsRequestDerived(
          unwrapped.whenFalse,
          useNode,
          new Set(visitedSymbols),
          new Set(visitedDeclarations),
          depth + 1
        )
      );
    }
    if (ts.isBinaryExpression(unwrapped)) {
      const leftDerived = expressionIsRequestDerived(
        unwrapped.left,
        useNode,
        new Set(visitedSymbols),
        new Set(visitedDeclarations),
        depth + 1
      );
      const rightDerived = expressionIsRequestDerived(
        unwrapped.right,
        useNode,
        new Set(visitedSymbols),
        new Set(visitedDeclarations),
        depth + 1
      );
      return (
        (leftDerived &&
          (rightDerived || expressionIsStaticValue(unwrapped.right))) ||
        (rightDerived && expressionIsStaticValue(unwrapped.left))
      );
    }
    if (ts.isTemplateExpression(unwrapped)) {
      return unwrapped.templateSpans.some(span =>
        expressionIsRequestDerived(
          span.expression,
          useNode,
          new Set(visitedSymbols),
          new Set(visitedDeclarations),
          depth + 1
        )
      );
    }
    if (ts.isArrayLiteralExpression(unwrapped)) {
      let hasDerivedElement = false;
      for (const element of unwrapped.elements) {
        const value = ts.isSpreadElement(element)
          ? element.expression
          : element;
        if (
          expressionIsRequestDerived(
            value,
            useNode,
            new Set(visitedSymbols),
            new Set(visitedDeclarations),
            depth + 1
          )
        ) {
          hasDerivedElement = true;
        } else if (!expressionIsStaticValue(value)) {
          return false;
        }
      }
      return hasDerivedElement;
    }
    if (ts.isObjectLiteralExpression(unwrapped)) {
      let hasDerivedProperty = false;
      for (const property of unwrapped.properties) {
        let value;
        if (ts.isPropertyAssignment(property)) value = property.initializer;
        else if (ts.isShorthandPropertyAssignment(property))
          value = property.name;
        else if (ts.isSpreadAssignment(property)) value = property.expression;
        else return false;
        if (
          expressionIsRequestDerived(
            value,
            useNode,
            new Set(visitedSymbols),
            new Set(visitedDeclarations),
            depth + 1
          )
        ) {
          hasDerivedProperty = true;
        } else if (!expressionIsStaticValue(value)) {
          return false;
        }
      }
      return hasDerivedProperty;
    }
    if (ts.isNewExpression(unwrapped)) {
      return Boolean(
        unwrapped.arguments?.some(argument =>
          expressionIsRequestDerived(
            argument,
            useNode,
            new Set(visitedSymbols),
            new Set(visitedDeclarations),
            depth + 1
          )
        )
      );
    }
    if (ts.isCallExpression(unwrapped)) {
      const callee = unwrapExpression(unwrapped.expression);
      if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === 'JSON' &&
        callee.name.text === 'parse'
      ) {
        return expressionIsRequestDerived(
          unwrapped.arguments[0],
          useNode,
          visitedSymbols,
          visitedDeclarations,
          depth + 1
        );
      }
      if (ts.isPropertyAccessExpression(callee)) {
        const receiverDerived = expressionIsRequestDerived(
          callee.expression,
          useNode,
          new Set(visitedSymbols),
          new Set(visitedDeclarations),
          depth + 1
        );
        if (
          receiverDerived &&
          [
            'json',
            'text',
            'arrayBuffer',
            'clone',
            'getReader',
            'read',
            'join',
          ].includes(callee.name.text)
        ) {
          return true;
        }
        if (
          callee.name.text === 'decode' &&
          unwrapped.arguments.some(argument =>
            expressionIsRequestDerived(
              argument,
              useNode,
              new Set(visitedSymbols),
              new Set(visitedDeclarations),
              depth + 1
            )
          )
        ) {
          return true;
        }
      }
      if (ts.isIdentifier(callee)) {
        const declaration = resolveCalledLocalDeclaration(
          checker,
          callee,
          sourceFile
        );
        const functionNode = declaration
          ? functionNodeForDeclaration(declaration)
          : undefined;
        if (
          declaration &&
          functionNode &&
          !visitedDeclarations.has(declaration)
        ) {
          const nextVisitedDeclarations = new Set(visitedDeclarations);
          nextVisitedDeclarations.add(declaration);
          const returns = [];
          const body = getFunctionBody(declaration);
          if (body) {
            function visitReturn(node) {
              if (node !== body && ts.isFunctionLike(node)) return;
              if (ts.isReturnStatement(node) && node.expression) {
                returns.push(node.expression);
                return;
              }
              ts.forEachChild(node, visitReturn);
            }
            visitReturn(body);
          }
          if (
            returns.length > 0 &&
            returns.every(returnExpression =>
              expressionIsRequestDerived(
                returnExpression,
                returnExpression,
                new Set(visitedSymbols),
                nextVisitedDeclarations,
                depth + 1
              )
            )
          ) {
            return true;
          }
        }
      }
      return false;
    }
    if (!ts.isIdentifier(unwrapped)) return false;

    const symbol = getIdentifierValueSymbol(checker, unwrapped);
    if (!symbol) return false;
    const target = resolveTargetSymbol(checker, symbol);
    if (visitedSymbols.has(target)) return false;
    const nextVisitedSymbols = new Set(visitedSymbols);
    nextVisitedSymbols.add(target);

    const boundary = findContainingFunction(useNode);
    const assignments = [];
    const pushes = [];
    if (boundary) {
      function visitAssignments(node) {
        if (node !== boundary && ts.isFunctionLike(node)) return;
        if (node.getStart() >= useNode.getStart()) return;
        if (
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isIdentifier(unwrapExpression(node.left)) &&
          checker.getSymbolAtLocation(unwrapExpression(node.left)) === symbol
        ) {
          assignments.push(node.right);
        }
        if (ts.isCallExpression(node)) {
          const callee = unwrapExpression(node.expression);
          if (
            ts.isPropertyAccessExpression(callee) &&
            callee.name.text === 'push' &&
            ts.isIdentifier(unwrapExpression(callee.expression)) &&
            checker.getSymbolAtLocation(unwrapExpression(callee.expression)) ===
              symbol
          ) {
            pushes.push(...node.arguments);
          }
        }
        ts.forEachChild(node, visitAssignments);
      }
      visitAssignments(boundary);
    }
    if (assignments.length > 0) {
      return assignments.every(assignment =>
        expressionIsRequestDerived(
          assignment,
          assignment,
          new Set(nextVisitedSymbols),
          new Set(visitedDeclarations),
          depth + 1
        )
      );
    }

    for (const declaration of target.declarations ?? []) {
      if (ts.isParameter(declaration)) {
        const containingFunction = findContainingFunction(declaration);
        if (containingFunction === rootFunction) return true;
        if (!containingFunction) continue;
        const parameterIndex =
          containingFunction.parameters.indexOf(declaration);
        if (parameterIndex < 0) continue;
        const declarationNode =
          containingFunction.parent &&
          ts.isVariableDeclaration(containingFunction.parent)
            ? containingFunction.parent
            : containingFunction;
        const callSites = findCallSitesForDeclaration(declarationNode);
        if (
          callSites.length > 0 &&
          callSites.every(callSite => {
            const argument = callSite.arguments[parameterIndex];
            return Boolean(
              argument &&
              expressionIsRequestDerived(
                argument,
                callSite,
                new Set(nextVisitedSymbols),
                new Set(visitedDeclarations),
                depth + 1
              )
            );
          })
        ) {
          return true;
        }
      }
      if (ts.isBindingElement(declaration)) {
        const pattern = declaration.parent;
        const variableDeclaration = pattern.parent;
        if (
          ts.isVariableDeclaration(variableDeclaration) &&
          variableDeclaration.initializer &&
          expressionIsRequestDerived(
            variableDeclaration.initializer,
            useNode,
            nextVisitedSymbols,
            visitedDeclarations,
            depth + 1
          )
        ) {
          return true;
        }
      }
      if (
        ts.isVariableDeclaration(declaration) &&
        declaration.initializer &&
        expressionIsRequestDerived(
          declaration.initializer,
          useNode,
          nextVisitedSymbols,
          visitedDeclarations,
          depth + 1
        )
      ) {
        return true;
      }
    }

    return pushes.some(value =>
      expressionIsRequestDerived(
        value,
        value,
        new Set(nextVisitedSymbols),
        new Set(visitedDeclarations),
        depth + 1
      )
    );
  }

  function rawInputAliasesAreUnusedAfterCall(call) {
    const input = unwrapExpression(call.arguments[0]);
    const boundary = findContainingFunction(call);
    if (!boundary) return false;
    const taintedSymbols = new Set();
    const visitedProvenanceSymbols = new Set();

    function collectRequestDerivedSymbols(node) {
      if (ts.isIdentifier(node) && expressionIsRequestDerived(node, call)) {
        const symbol = checker.getSymbolAtLocation(node);
        const isRootRequestParameter = Boolean(
          symbol?.declarations?.some(
            declaration =>
              ts.isParameter(declaration) &&
              findContainingFunction(declaration) === rootFunction
          )
        );
        if (symbol && !isRootRequestParameter) {
          taintedSymbols.add(symbol);
          const target = resolveTargetSymbol(checker, symbol);
          if (!visitedProvenanceSymbols.has(target)) {
            visitedProvenanceSymbols.add(target);
            for (const declaration of target.declarations ?? []) {
              if (
                ts.isVariableDeclaration(declaration) &&
                declaration.initializer &&
                declaration.initializer.getEnd() <= call.getStart()
              ) {
                collectRequestDerivedSymbols(declaration.initializer);
              }
              if (ts.isBindingElement(declaration)) {
                const pattern = declaration.parent;
                const variableDeclaration = pattern.parent;
                if (
                  ts.isVariableDeclaration(variableDeclaration) &&
                  variableDeclaration.initializer &&
                  variableDeclaration.initializer.getEnd() <= call.getStart()
                ) {
                  collectRequestDerivedSymbols(variableDeclaration.initializer);
                }
              }
            }
            function visitAssignments(node) {
              if (node !== boundary && ts.isFunctionLike(node)) return;
              if (node.getStart() >= call.getStart()) return;
              if (
                ts.isBinaryExpression(node) &&
                node.getEnd() <= call.getStart() &&
                node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
                ts.isIdentifier(unwrapExpression(node.left))
              ) {
                const assignedSymbol = checker.getSymbolAtLocation(
                  unwrapExpression(node.left)
                );
                if (
                  assignedSymbol &&
                  resolveTargetSymbol(checker, assignedSymbol) === target
                ) {
                  collectRequestDerivedSymbols(node.right);
                }
              }
              ts.forEachChild(node, visitAssignments);
            }
            visitAssignments(boundary);
          }
        }
      }
      ts.forEachChild(node, collectRequestDerivedSymbols);
    }
    collectRequestDerivedSymbols(input);

    function nodeReferencesTaintedSymbol(node) {
      let found = false;
      function visit(current) {
        if (found) return;
        if (current !== node && ts.isFunctionLike(current)) return;
        if (
          ts.isIdentifier(current) &&
          taintedSymbols.has(checker.getSymbolAtLocation(current))
        ) {
          found = true;
          return;
        }
        ts.forEachChild(current, visit);
      }
      visit(node);
      return found;
    }

    const resultSymbol = callResultSymbol(checker, call);
    function containsUnvalidatedRequestData(node) {
      if (!node) return false;
      const candidate = unwrapExpression(node);
      if (
        resultSymbol &&
        ts.isPropertyAccessExpression(candidate) &&
        candidate.name.text === 'data' &&
        ts.isIdentifier(unwrapExpression(candidate.expression)) &&
        checker.getSymbolAtLocation(unwrapExpression(candidate.expression)) ===
          resultSymbol
      ) {
        return false;
      }
      if (ts.isIdentifier(candidate)) {
        if (
          resultSymbol &&
          expressionDependsOnResultData(candidate, resultSymbol) &&
          !expressionIsRequestDerived(candidate, candidate)
        ) {
          return false;
        }
        return expressionIsRequestDerived(candidate, candidate);
      }
      if (
        expressionIsRequestDerived(candidate, candidate) &&
        (ts.isCallExpression(candidate) ||
          ts.isPropertyAccessExpression(candidate) ||
          ts.isElementAccessExpression(candidate))
      ) {
        return true;
      }
      let found = false;
      function visit(child) {
        if (!found && containsUnvalidatedRequestData(child)) found = true;
      }
      ts.forEachChild(candidate, visit);
      return found;
    }

    let changed = true;
    while (changed) {
      changed = false;
      function collectAliases(node) {
        if (node !== boundary && ts.isFunctionLike(node)) return;
        if (node.getStart() >= call.getStart()) return;
        if (
          ts.isVariableDeclaration(node) &&
          node.getEnd() <= call.getStart() &&
          node.initializer &&
          nodeReferencesTaintedSymbol(node.initializer)
        ) {
          const identifiers = [];
          function collectBindingIdentifiers(binding) {
            if (ts.isIdentifier(binding)) identifiers.push(binding);
            else if (
              ts.isObjectBindingPattern(binding) ||
              ts.isArrayBindingPattern(binding)
            ) {
              for (const element of binding.elements) {
                if (ts.isBindingElement(element)) {
                  collectBindingIdentifiers(element.name);
                }
              }
            }
          }
          collectBindingIdentifiers(node.name);
          for (const identifier of identifiers) {
            const symbol = checker.getSymbolAtLocation(identifier);
            if (symbol && !taintedSymbols.has(symbol)) {
              taintedSymbols.add(symbol);
              changed = true;
            }
          }
        }
        if (
          ts.isBinaryExpression(node) &&
          node.getEnd() <= call.getStart() &&
          node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isIdentifier(unwrapExpression(node.left)) &&
          nodeReferencesTaintedSymbol(node.right)
        ) {
          const symbol = checker.getSymbolAtLocation(
            unwrapExpression(node.left)
          );
          if (symbol && !taintedSymbols.has(symbol)) {
            taintedSymbols.add(symbol);
            changed = true;
          }
        }
        ts.forEachChild(node, collectAliases);
      }
      collectAliases(boundary);
    }

    let reused = false;
    function visit(node) {
      if (reused) return;
      if (node !== boundary && ts.isFunctionLike(node)) return;
      if (
        node.getStart() > call.getEnd() &&
        ts.isIdentifier(node) &&
        taintedSymbols.has(checker.getSymbolAtLocation(node))
      ) {
        reused = true;
        return;
      }
      if (node.getStart() > call.getEnd() && ts.isCallExpression(node)) {
        const callee = unwrapExpression(node.expression);
        const calledDeclarations = resolveCalledRepositoryDeclarations(
          checker,
          callee
        );
        if (
          (isSemanticWriteLikeCall(checker, node) ||
            isCanonicalOpaqueMutationCall(checker, node) ||
            calledDeclarations.some(declaration =>
              declarationMayWrite(declaration)
            ) ||
            isCanonicalPublicReservationWriteCall(node)) &&
          node.arguments.some(containsUnvalidatedRequestData)
        ) {
          reused = true;
          return;
        }
        if (
          ts.isPropertyAccessExpression(callee) &&
          ['json', 'text', 'arrayBuffer'].includes(callee.name.text) &&
          expressionIsRequestDerived(callee.expression, node)
        ) {
          reused = true;
          return;
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(boundary);
    return !reused;
  }

  function requestBodyIsNotReadOutsideLocalParser(declaration, outerCall) {
    const boundary = findContainingFunction(outerCall);
    if (!boundary) return false;
    const requestSymbols = new Set();
    for (const argument of outerCall.arguments) {
      const unwrapped = unwrapExpression(argument);
      if (!ts.isIdentifier(unwrapped)) continue;
      const symbol = checker.getSymbolAtLocation(unwrapped);
      if (
        symbol?.declarations?.some(
          candidate =>
            ts.isParameter(candidate) &&
            findContainingFunction(candidate) === rootFunction
        )
      ) {
        requestSymbols.add(symbol);
      }
    }
    if (requestSymbols.size === 0) return true;

    function isRequestReference(expression) {
      const candidate = unwrapExpression(expression);
      return (
        ts.isIdentifier(candidate) &&
        requestSymbols.has(checker.getSymbolAtLocation(candidate))
      );
    }

    function localCallReadsRequestBody(call) {
      const callee = unwrapExpression(call.expression);
      if (!ts.isIdentifier(callee)) return false;
      const localDeclaration = resolveCalledLocalDeclaration(
        checker,
        callee,
        sourceFile
      );
      const functionNode = localDeclaration
        ? functionNodeForDeclaration(localDeclaration)
        : undefined;
      if (!functionNode) return false;
      const requestArgumentIndexes = [];
      call.arguments.forEach((argument, index) => {
        if (isRequestReference(argument)) requestArgumentIndexes.push(index);
      });
      if (requestArgumentIndexes.length === 0) return false;
      const parameterSymbols = new Set(
        requestArgumentIndexes
          .map(index => functionNode.parameters[index])
          .filter(parameter => parameter && ts.isIdentifier(parameter.name))
          .map(parameter => checker.getSymbolAtLocation(parameter.name))
          .filter(Boolean)
      );
      let readsBody = false;
      const body = getFunctionBody(localDeclaration);
      if (!body) return false;
      function visitLocal(node) {
        if (readsBody) return;
        if (node !== body && ts.isFunctionLike(node)) return;
        if (ts.isCallExpression(node)) {
          const expression = unwrapExpression(node.expression);
          if (
            ts.isPropertyAccessExpression(expression) &&
            ['json', 'text', 'arrayBuffer'].includes(expression.name.text)
          ) {
            const receiver = unwrapExpression(expression.expression);
            if (
              ts.isIdentifier(receiver) &&
              parameterSymbols.has(checker.getSymbolAtLocation(receiver))
            ) {
              readsBody = true;
              return;
            }
          }
        }
        ts.forEachChild(node, visitLocal);
      }
      visitLocal(body);
      return readsBody;
    }

    let reused = false;
    function visit(node) {
      if (reused) return;
      if (node !== boundary && ts.isFunctionLike(node)) return;
      if (node === outerCall) {
        return;
      }
      if (ts.isCallExpression(node)) {
        const callee = unwrapExpression(node.expression);
        if (
          ts.isPropertyAccessExpression(callee) &&
          ['json', 'text', 'arrayBuffer'].includes(callee.name.text) &&
          isRequestReference(callee.expression)
        ) {
          reused = true;
          return;
        }
        if (localCallReadsRequestBody(node)) {
          reused = true;
          return;
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(boundary);
    return !reused;
  }

  function expressionDependsOnResultData(
    expression,
    resultSymbol,
    visitedSymbols = new Set(),
    depth = 0
  ) {
    if (!expression || depth > 16) return false;
    const unwrapped = unwrapExpression(expression);
    if (ts.isPropertyAccessExpression(unwrapped)) {
      const receiver = unwrapExpression(unwrapped.expression);
      if (
        ['data', 'dto'].includes(unwrapped.name.text) &&
        ts.isIdentifier(receiver) &&
        checker.getSymbolAtLocation(receiver) === resultSymbol
      ) {
        return true;
      }
    }
    if (ts.isIdentifier(unwrapped)) {
      const symbol = checker.getSymbolAtLocation(unwrapped);
      if (!symbol) return false;
      const target = resolveTargetSymbol(checker, symbol);
      if (visitedSymbols.has(target)) return false;
      const nextVisitedSymbols = new Set(visitedSymbols);
      nextVisitedSymbols.add(target);
      const boundary = findContainingFunction(unwrapped);
      if (boundary) {
        const assignments = [];
        function visitAssignments(node) {
          if (node !== boundary && ts.isFunctionLike(node)) return;
          if (node.getStart() >= unwrapped.getStart()) return;
          if (
            ts.isBinaryExpression(node) &&
            node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            ts.isIdentifier(unwrapExpression(node.left)) &&
            checker.getSymbolAtLocation(unwrapExpression(node.left)) === symbol
          ) {
            assignments.push(node.right);
          }
          ts.forEachChild(node, visitAssignments);
        }
        visitAssignments(boundary);
        if (assignments.length > 0) {
          return assignments.every(assignment =>
            expressionDependsOnResultData(
              assignment,
              resultSymbol,
              new Set(nextVisitedSymbols),
              depth + 1
            )
          );
        }
      }
      for (const declaration of target.declarations ?? []) {
        if (ts.isBindingElement(declaration)) {
          const pattern = declaration.parent;
          const variableDeclaration = pattern.parent;
          if (
            ts.isVariableDeclaration(variableDeclaration) &&
            variableDeclaration.initializer &&
            expressionDependsOnResultData(
              variableDeclaration.initializer,
              resultSymbol,
              nextVisitedSymbols,
              depth + 1
            )
          ) {
            return true;
          }
        }
        if (
          ts.isVariableDeclaration(declaration) &&
          declaration.initializer &&
          expressionDependsOnResultData(
            declaration.initializer,
            resultSymbol,
            nextVisitedSymbols,
            depth + 1
          )
        ) {
          return true;
        }
      }
    }
    let found = false;
    function visit(child) {
      if (found) return;
      if (
        expressionDependsOnResultData(
          child,
          resultSymbol,
          new Set(visitedSymbols),
          depth + 1
        )
      ) {
        found = true;
      }
    }
    ts.forEachChild(unwrapped, visit);
    return found;
  }

  function isCanonicalPublicReservationWriteCall(call) {
    const callee = unwrapExpression(call.expression);
    if (!ts.isPropertyAccessExpression(callee)) return false;
    if (
      !['findOrCreateCustomer', 'createReservation'].includes(callee.name.text)
    ) {
      return false;
    }
    const receiver = unwrapExpression(callee.expression);
    if (!ts.isIdentifier(receiver)) return false;
    const receiverSymbol = checker.getSymbolAtLocation(receiver);
    if (!receiverSymbol) return false;
    const target = resolveTargetSymbol(checker, receiverSymbol);
    return (target.declarations ?? []).some(declaration => {
      if (!ts.isVariableDeclaration(declaration) || !declaration.initializer) {
        return false;
      }
      const initializer = unwrapExpression(declaration.initializer);
      if (!ts.isNewExpression(initializer)) return false;
      const constructor = unwrapExpression(initializer.expression);
      if (!ts.isIdentifier(constructor)) return false;
      const binding = imports.get(constructor.text);
      return (
        isExactImportIdentifier(checker, constructor, binding) &&
        binding.moduleName === '@/lib/services/public-reservation-service' &&
        binding.importedName === 'PublicReservationService'
      );
    });
  }

  function validatedResultFlowsToWrite(call) {
    const resultSymbol = callResultSymbol(checker, call);
    const boundary = findContainingFunction(call);
    if (!resultSymbol || !boundary) return false;
    let found = false;
    function visit(node) {
      if (found) return;
      if (node !== boundary && ts.isFunctionLike(node)) return;
      if (node.getStart() <= call.getStart()) {
        ts.forEachChild(node, visit);
        return;
      }
      if (ts.isCallExpression(node)) {
        const expression = unwrapExpression(node.expression);
        const calledDeclarations = resolveCalledRepositoryDeclarations(
          checker,
          expression
        );
        if (
          (isSemanticWriteLikeCall(checker, node) ||
            isCanonicalOpaqueMutationCall(checker, node) ||
            calledDeclarations.some(declaration =>
              declarationMayWrite(declaration)
            ) ||
            isCanonicalPublicReservationWriteCall(node)) &&
          node.arguments.some(argument =>
            expressionDependsOnResultData(argument, resultSymbol)
          )
        ) {
          found = true;
          return;
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(boundary);
    return found;
  }

  function resultFlowsToWrite(call) {
    const resultSymbol = callResultSymbol(checker, call);
    const boundary = findContainingFunction(call);
    if (!resultSymbol || !boundary) return false;
    let found = false;
    function visit(node) {
      if (found) return;
      if (node !== boundary && ts.isFunctionLike(node)) return;
      if (node.getStart() <= call.getStart()) {
        ts.forEachChild(node, visit);
        return;
      }
      if (ts.isCallExpression(node)) {
        const expression = unwrapExpression(node.expression);
        const calledDeclarations = resolveCalledRepositoryDeclarations(
          checker,
          expression
        );
        if (
          (isSemanticWriteLikeCall(checker, node) ||
            isCanonicalOpaqueMutationCall(checker, node) ||
            calledDeclarations.some(declaration =>
              declarationMayWrite(declaration)
            )) &&
          node.arguments.some(argument =>
            nodeReferencesSymbol(checker, argument, resultSymbol)
          )
        ) {
          found = true;
          return;
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(boundary);
    return found;
  }

  function expressionIsExactRootRequest(expression, useNode) {
    const requestParameter = rootFunction?.parameters[0];
    if (!requestParameter || !ts.isIdentifier(requestParameter.name)) {
      return false;
    }
    const candidate = unwrapExpression(expression);
    if (!ts.isIdentifier(candidate)) return false;
    const candidateSymbol = getIdentifierValueSymbol(checker, candidate);
    const requestSymbol = getIdentifierValueSymbol(
      checker,
      requestParameter.name
    );
    if (!candidateSymbol || !requestSymbol) return false;
    const requestTarget = resolveTargetSymbol(checker, requestSymbol);
    return (
      resolveTargetSymbol(checker, candidateSymbol) === requestTarget &&
      symbolHasNoDirectMutationBeforeUse(
        checker,
        requestTarget,
        useNode,
        requestParameter
      )
    );
  }

  function expressionIsRootRequestAlias(
    expression,
    useNode,
    visitedSymbols = new Set(),
    visitedDeclarations = new Set(),
    depth = 0
  ) {
    if (!expression || depth > 12) return false;
    if (expressionIsExactRootRequest(expression, useNode)) return true;

    const candidate = unwrapExpression(expression);
    if (!ts.isIdentifier(candidate)) return false;
    const symbol = getIdentifierValueSymbol(checker, candidate);
    if (!symbol) return false;
    const target = resolveTargetSymbol(checker, symbol);
    if (visitedSymbols.has(target)) return false;
    if (!symbolHasNoDirectMutationBeforeUse(checker, target, useNode)) {
      return false;
    }

    const nextVisitedSymbols = new Set(visitedSymbols);
    nextVisitedSymbols.add(target);
    for (const declaration of target.declarations ?? []) {
      if (ts.isParameter(declaration)) {
        const containingFunction = findContainingFunction(declaration);
        if (!containingFunction || containingFunction === rootFunction) {
          continue;
        }
        const parameterIndex =
          containingFunction.parameters.indexOf(declaration);
        if (parameterIndex < 0) continue;
        const declarationNode =
          containingFunction.parent &&
          ts.isVariableDeclaration(containingFunction.parent)
            ? containingFunction.parent
            : containingFunction;
        if (visitedDeclarations.has(declarationNode)) continue;
        const callSites = findCallSitesForDeclaration(declarationNode);
        const nextVisitedDeclarations = new Set(visitedDeclarations);
        nextVisitedDeclarations.add(declarationNode);
        if (
          callSites.length > 0 &&
          callSites.every(callSite => {
            const argument = callSite.arguments[parameterIndex];
            return Boolean(
              argument &&
              expressionIsRootRequestAlias(
                argument,
                callSite,
                new Set(nextVisitedSymbols),
                nextVisitedDeclarations,
                depth + 1
              )
            );
          })
        ) {
          return true;
        }
      }
      if (
        ts.isVariableDeclaration(declaration) &&
        declaration.initializer &&
        expressionIsRootRequestAlias(
          declaration.initializer,
          useNode,
          nextVisitedSymbols,
          visitedDeclarations,
          depth + 1
        )
      ) {
        return true;
      }
    }
    return false;
  }

  function expressionIsExactRootRequestHeaderValue(
    expression,
    useNode = expression,
    visitedSymbols = new Set(),
    depth = 0
  ) {
    if (!expression || depth > 12) return false;
    const candidate = unwrapExpression(expression);

    if (
      ts.isPropertyAccessExpression(candidate) ||
      ts.isElementAccessExpression(candidate)
    ) {
      return expressionIsExactRootRequestHeaderValue(
        candidate.expression,
        useNode,
        visitedSymbols,
        depth + 1
      );
    }
    if (ts.isCallExpression(candidate)) {
      const callee = unwrapExpression(candidate.expression);
      if (ts.isPropertyAccessExpression(callee)) {
        const receiver = unwrapExpression(callee.expression);
        if (
          callee.name.text === 'get' &&
          ts.isPropertyAccessExpression(receiver) &&
          receiver.name.text === 'headers' &&
          expressionIsRootRequestAlias(receiver.expression, useNode) &&
          candidate.arguments.length === 1 &&
          expressionIsStaticValue(candidate.arguments[0])
        ) {
          return true;
        }
        if (
          [
            'at',
            'slice',
            'split',
            'toLowerCase',
            'toUpperCase',
            'trim',
          ].includes(callee.name.text) &&
          candidate.arguments.every(argument =>
            expressionIsStaticValue(argument)
          )
        ) {
          return expressionIsExactRootRequestHeaderValue(
            callee.expression,
            useNode,
            visitedSymbols,
            depth + 1
          );
        }
      }
      return false;
    }
    if (!ts.isIdentifier(candidate)) return false;

    const symbol = getIdentifierValueSymbol(checker, candidate);
    if (!symbol) return false;
    const target = resolveTargetSymbol(checker, symbol);
    if (visitedSymbols.has(target)) return false;
    if (!symbolHasNoDirectMutationBeforeUse(checker, target, useNode)) {
      return false;
    }
    const nextVisitedSymbols = new Set(visitedSymbols);
    nextVisitedSymbols.add(target);
    for (const declaration of target.declarations ?? []) {
      if (
        ts.isVariableDeclaration(declaration) &&
        declaration.initializer &&
        expressionIsExactRootRequestHeaderValue(
          declaration.initializer,
          useNode,
          nextVisitedSymbols,
          depth + 1
        )
      ) {
        return true;
      }
    }
    return false;
  }

  function expressionIsRequestBoundRateKey(
    expression,
    useNode = expression,
    visitedSymbols = new Set(),
    visitedDeclarations = new Set(),
    depth = 0
  ) {
    if (!expression || depth > 16) return false;
    const candidate = unwrapExpression(expression);
    if (ts.isTemplateExpression(candidate)) {
      let hasRequestBoundSpan = false;
      for (const span of candidate.templateSpans) {
        if (
          expressionIsRequestBoundRateKey(
            span.expression,
            useNode,
            new Set(visitedSymbols),
            new Set(visitedDeclarations),
            depth + 1
          )
        ) {
          hasRequestBoundSpan = true;
          continue;
        }
        if (!expressionIsStaticValue(span.expression)) return false;
      }
      return hasRequestBoundSpan;
    }
    if (
      expressionIsRequestDerived(expression, useNode) ||
      expressionIsExactRootRequestHeaderValue(expression, useNode)
    ) {
      return true;
    }

    if (ts.isCallExpression(candidate)) {
      const callee = unwrapExpression(candidate.expression);
      if (!ts.isIdentifier(callee)) return false;
      const declaration = resolveCalledLocalDeclaration(
        checker,
        callee,
        sourceFile
      );
      const functionNode = declaration
        ? functionNodeForDeclaration(declaration)
        : undefined;
      if (
        !declaration ||
        !functionNode ||
        visitedDeclarations.has(declaration)
      ) {
        return false;
      }
      const body = getFunctionBody(declaration);
      if (!body) return false;
      const returns = [];
      function visitReturn(node) {
        if (node !== body && ts.isFunctionLike(node)) return;
        if (ts.isReturnStatement(node) && node.expression) {
          returns.push(node.expression);
          return;
        }
        ts.forEachChild(node, visitReturn);
      }
      visitReturn(body);
      if (returns.length === 0) return false;
      const nextVisitedDeclarations = new Set(visitedDeclarations);
      nextVisitedDeclarations.add(declaration);
      let hasRequestBoundReturn = false;
      for (const returnExpression of returns) {
        if (
          expressionIsRequestBoundRateKey(
            returnExpression,
            returnExpression,
            new Set(visitedSymbols),
            nextVisitedDeclarations,
            depth + 1
          )
        ) {
          hasRequestBoundReturn = true;
          continue;
        }
        if (!expressionIsStaticValue(returnExpression)) return false;
      }
      return hasRequestBoundReturn;
    }
    if (!ts.isIdentifier(candidate)) return false;

    const symbol = getIdentifierValueSymbol(checker, candidate);
    if (!symbol) return false;
    const target = resolveTargetSymbol(checker, symbol);
    if (visitedSymbols.has(target)) return false;
    if (!symbolHasNoDirectMutationBeforeUse(checker, target, useNode)) {
      return false;
    }
    const nextVisitedSymbols = new Set(visitedSymbols);
    nextVisitedSymbols.add(target);
    for (const declaration of target.declarations ?? []) {
      if (
        ts.isVariableDeclaration(declaration) &&
        declaration.initializer &&
        expressionIsRequestBoundRateKey(
          declaration.initializer,
          useNode,
          nextVisitedSymbols,
          visitedDeclarations,
          depth + 1
        )
      ) {
        return true;
      }
    }
    return false;
  }

  function localDeclarationIsRequestParser(declaration, outerCall) {
    if (
      !isAwaitedPreWriteCall(outerCall) ||
      !resultFlowsToWrite(outerCall) ||
      !rawInputAliasesAreUnusedAfterCall(outerCall) ||
      !requestBodyIsNotReadOutsideLocalParser(declaration, outerCall)
    ) {
      return false;
    }
    if (
      !outerCall.arguments.some(argument =>
        expressionIsRequestDerived(argument, outerCall)
      )
    ) {
      return false;
    }
    const body = getFunctionBody(declaration);
    if (!body || !ts.isBlock(body)) return false;
    const returns = [];
    function visit(node) {
      if (node !== body && ts.isFunctionLike(node)) return;
      if (ts.isReturnStatement(node)) {
        returns.push(node);
        return;
      }
      ts.forEachChild(node, visit);
    }
    visit(body);
    if (returns.length === 0 || !ts.isReturnStatement(body.statements.at(-1))) {
      return false;
    }
    return returns.every(statement => {
      const returned = statement.expression
        ? unwrapExpression(statement.expression)
        : undefined;
      if (!returned || !ts.isCallExpression(returned)) return false;
      const callee = unwrapExpression(returned.expression);
      return (
        ts.isPropertyAccessExpression(callee) &&
        callee.name.text === 'parse' &&
        isCanonicalZodSchemaExpression(
          checker,
          callee.expression,
          getImportBindings(declaration.getSourceFile())
        ) &&
        expressionIsRequestDerived(returned.arguments[0], returned) &&
        throwingCallFailsClosed(returned)
      );
    });
  }

  function expressionIsExactParsedVerifiedBody(
    expression,
    rawBody,
    useNode,
    visitedSymbols = new Set(),
    depth = 0
  ) {
    if (!expression || !rawBody || depth > 12) return false;
    const candidate = unwrapExpression(expression);
    if (ts.isCallExpression(candidate)) {
      const callee = unwrapExpression(candidate.expression);
      if (
        !ts.isPropertyAccessExpression(callee) ||
        callee.name.text !== 'parse' ||
        !isExactGlobalBuiltinIdentifier(
          checker,
          unwrapExpression(callee.expression),
          'JSON'
        ) ||
        !candidate.arguments[0] ||
        !expressionsHaveStableSameValue(
          candidate.arguments[0],
          rawBody,
          candidate
        ) ||
        !throwingCallFailsClosed(candidate)
      ) {
        return false;
      }
      return true;
    }
    if (!ts.isIdentifier(candidate)) return false;
    const symbol = getIdentifierValueSymbol(checker, candidate);
    if (!symbol) return false;
    const target = resolveTargetSymbol(checker, symbol);
    if (visitedSymbols.has(target)) return false;
    const nextVisitedSymbols = new Set(visitedSymbols);
    nextVisitedSymbols.add(target);
    const origins = [];
    for (const declaration of target.declarations ?? []) {
      if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
        origins.push({
          expression: declaration.initializer,
          node: declaration,
        });
      }
    }
    const boundary = findContainingFunction(useNode);
    if (boundary) {
      function visitAssignments(node) {
        if (node !== boundary && ts.isFunctionLike(node)) return;
        if (node.getStart() >= useNode.getStart()) return;
        if (
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          expressionRootsAtSymbol(checker, node.left, target)
        ) {
          origins.push({ expression: node.right, node });
          return;
        }
        ts.forEachChild(node, visitAssignments);
      }
      visitAssignments(boundary);
    }
    if (origins.length !== 1) return false;
    const [origin] = origins;
    return (
      expressionIsExactParsedVerifiedBody(
        origin.expression,
        rawBody,
        origin.node,
        nextVisitedSymbols,
        depth + 1
      ) && symbolIsStableBeforeUse(checker, target, useNode, origin.node)
    );
  }

  function isApprovedAsyncThrowingGate(call) {
    return isAwaitedPreWriteCall(call) && throwingCallFailsClosed(call);
  }

  function inspectImportedCall(call, binding) {
    const key = binding.moduleName + '#' + binding.importedName;

    if (key === '@/lib/api-helpers#processApiRequest') {
      const guard = hasFailClosedResultHandling(
        checker,
        call,
        ['success'],
        true
      );
      if (!guard) return;
      const resultSymbol = callResultSymbol(checker, call);
      if (resultSymbol) approvedProcessResultBindings.add(resultSymbol);
      add('auth', key, guard);
      const options = call.arguments[1];
      const allowedRoles = getObjectProperty(options, 'allowedRoles');
      if (
        allowedRoles &&
        expressionContainsOnlyAdminRoles(checker, allowedRoles)
      ) {
        add('adminRole', key + ':allowedRoles', guard);
      }
      const clinicId = getObjectProperty(options, 'clinicId');
      const requireClinicMatch = getObjectProperty(
        options,
        'requireClinicMatch'
      );
      if (
        hasProvablyNonNullClinicTarget(checker, clinicId) &&
        (requireClinicMatch === undefined ||
          resolveStaticBoolean(checker, requireClinicMatch) === true)
      ) {
        add('clinicScope', key + ':clinic', guard, clinicId);
      }
      if (
        isTrueLiteral(getObjectProperty(options, 'requireBusinessWriteAccess'))
      ) {
        add('billing', key + ':businessWrite', guard);
      }
      return;
    }

    if (key === '@/lib/route-helpers#processClinicScopedBody') {
      const guard = hasFailClosedResultHandling(
        checker,
        call,
        ['success'],
        true
      );
      if (!guard) return;
      const resultSymbol = callResultSymbol(checker, call);
      if (resultSymbol) approvedProcessResultBindings.add(resultSymbol);
      add('auth', key, guard);
      if (resultSymbol) {
        for (const clinicBinding of findProcessDtoClinicBindings(
          resultSymbol
        )) {
          add('clinicScope', key, guard, clinicBinding);
        }
      }
      add('billing', key, guard);
      if (
        validatedResultFlowsToWrite(call) &&
        rawInputAliasesAreUnusedAfterCall(call)
      ) {
        add('validation', key, guard);
      }
      return;
    }

    if (key === '@/lib/supabase/guards#ensureClinicAccess') {
      if (!isApprovedAsyncThrowingGate(call)) return;
      recordApprovedPermissionsFromDirectCall(call);
      add('auth', key, call);
      const clinicTarget = call.arguments[2];
      const requireClinicMatch = getObjectProperty(
        call.arguments[3],
        'requireClinicMatch'
      );
      if (
        hasProvablyNonNullClinicTarget(checker, clinicTarget) &&
        (requireClinicMatch === undefined ||
          resolveStaticBoolean(checker, requireClinicMatch) === true)
      ) {
        add('clinicScope', key, call, clinicTarget);
      }
      const allowedRoles = getObjectProperty(call.arguments[3], 'allowedRoles');
      if (
        allowedRoles &&
        expressionContainsOnlyAdminRoles(checker, allowedRoles)
      ) {
        add('adminRole', key + ':allowedRoles', call);
      }
      return;
    }

    if (
      key === '@/lib/billing/business-write#ensureScopedBusinessWriteAccess'
    ) {
      if (!isApprovedAsyncThrowingGate(call)) return;
      const input = call.arguments[0];
      const permissions = getObjectProperty(input, 'permissions');
      const targetClinicId = getObjectProperty(input, 'targetClinicId');
      if (
        !expressionIsApprovedPermissions(permissions, call) ||
        !hasProvablyNonNullClinicTarget(checker, targetClinicId)
      ) {
        return;
      }
      add('clinicScope', key, call, targetClinicId);
      add('billing', key, call);
      return;
    }

    if (key === '@/lib/billing/business-write#ensureBusinessWriteAccess') {
      if (!isApprovedAsyncThrowingGate(call)) return;
      add('billing', key, call);
      return;
    }

    if (key === '@/lib/billing/internal-auth#requireBillingInternalRequest') {
      const guard = hasFailClosedResultHandling(checker, call, ['success']);
      if (!guard || !expressionIsExactRootRequest(call.arguments[0], call)) {
        return;
      }
      add('auth', key, guard);
      add('internalSecret', key, guard);
      return;
    }

    if (key === '@/lib/line/public-my-page-auth#verifyPublicLineMyPageAuth') {
      const guard = hasFailClosedResultHandling(checker, call, ['ok'], true);
      if (!guard) return;
      add('auth', key, guard);
      const clinicId = getObjectProperty(call.arguments[0], 'clinicId');
      if (hasProvablyNonNullClinicTarget(checker, clinicId)) {
        add('clinicScope', key, guard, clinicId);
      }
      add('lineAuth', key, guard);
      add('validation', key, guard);
      return;
    }

    if (key === '@/lib/stripe/server#constructStripeWebhookEvent') {
      const input = call.arguments[0];
      const payload = getObjectProperty(input, 'payload');
      const signature = getObjectProperty(input, 'signature');
      const resultSymbol = callResultSymbol(checker, call);
      const boundary = findContainingFunction(call);
      let verifiedEventIsProcessed = false;
      if (resultSymbol && boundary) {
        function findProcessingCall(node) {
          if (verifiedEventIsProcessed) return;
          if (node !== boundary && ts.isFunctionLike(node)) return;
          if (ts.isCallExpression(node) && node.getStart() > call.getEnd()) {
            const callee = unwrapExpression(node.expression);
            if (ts.isIdentifier(callee)) {
              const processingBinding = imports.get(callee.text);
              const event = getObjectProperty(node.arguments[0], 'event');
              if (
                isExactImportIdentifier(checker, callee, processingBinding) &&
                processingBinding?.moduleName ===
                  '@/lib/billing/stripe-events' &&
                ['claimStripeWebhookEvent', 'processStripeEvent'].includes(
                  processingBinding.importedName
                ) &&
                event &&
                rootValueSymbol(event) ===
                  resolveTargetSymbol(checker, resultSymbol) &&
                symbolIsStableBeforeUse(
                  checker,
                  resolveTargetSymbol(checker, resultSymbol),
                  node,
                  call
                )
              ) {
                verifiedEventIsProcessed = true;
                return;
              }
            }
          }
          ts.forEachChild(node, findProcessingCall);
        }
        findProcessingCall(boundary);
      }
      if (
        !isUnconditionalPreWriteCall(call) ||
        !throwingCallFailsClosed(call) ||
        !payload ||
        !signature ||
        !expressionIsRequestDerived(payload, call) ||
        !expressionIsExactRootRequestHeaderValue(signature, call) ||
        !verifiedEventIsProcessed
      ) {
        return;
      }
      add('webhookSignature', key, call);
      return;
    }

    if (
      key === '@/lib/notifications/email/webhook-handler#verifyResendWebhook'
    ) {
      const guard = hasFailClosedResultHandling(checker, call, []);
      const rawBody = call.arguments[0];
      const headers = call.arguments[1];
      const boundary = findContainingFunction(call);
      let verifiedPayloadIsProcessed = false;
      if (rawBody && boundary) {
        function findHandlerCall(node) {
          if (verifiedPayloadIsProcessed) return;
          if (node !== boundary && ts.isFunctionLike(node)) return;
          if (ts.isCallExpression(node) && node.getStart() > guard?.getEnd()) {
            const callee = unwrapExpression(node.expression);
            if (ts.isIdentifier(callee)) {
              const handlerBinding = imports.get(callee.text);
              const event = node.arguments[1];
              if (
                isExactImportIdentifier(checker, callee, handlerBinding) &&
                handlerBinding?.moduleName ===
                  '@/lib/notifications/email/webhook-handler' &&
                handlerBinding.importedName === 'handleResendWebhookEvent' &&
                event &&
                expressionIsExactParsedVerifiedBody(event, rawBody, node)
              ) {
                verifiedPayloadIsProcessed = true;
                return;
              }
            }
          }
          ts.forEachChild(node, findHandlerCall);
        }
        findHandlerCall(boundary);
      }
      if (
        !guard ||
        !rawBody ||
        !headers ||
        !expressionIsRequestDerived(rawBody, call) ||
        !expressionIsRequestDerived(headers, call) ||
        !verifiedPayloadIsProcessed
      ) {
        return;
      }
      add('webhookSignature', key, guard);
      return;
    }

    if (key === '@/lib/billing/stripe-events#claimStripeWebhookEvent') {
      const claimedEvent = getObjectProperty(call.arguments[0], 'event');
      const isStripeProcessingBoundary = candidate => {
        const expression = unwrapExpression(candidate.expression);
        if (!ts.isIdentifier(expression)) return false;
        const candidateBinding = imports.get(expression.text);
        if (
          !(
            isExactImportIdentifier(checker, expression, candidateBinding) &&
            candidateBinding?.moduleName === '@/lib/billing/stripe-events' &&
            candidateBinding.importedName === 'processStripeEvent'
          )
        ) {
          return false;
        }
        const processedEvent = getObjectProperty(
          candidate.arguments[0],
          'event'
        );
        const eventSymbol = processedEvent
          ? rootValueSymbol(processedEvent)
          : undefined;
        return Boolean(
          claimedEvent &&
          processedEvent &&
          eventSymbol &&
          expressionsHaveSameValue(processedEvent, claimedEvent) &&
          symbolIsStableBeforeUse(checker, eventSymbol, candidate, call)
        );
      };
      if (
        !hasDiscriminatedResultGuards(
          checker,
          call,
          'status',
          ['duplicate', 'terminal_failure', 'busy'],
          isStripeProcessingBoundary
        )
      ) {
        return;
      }
      add('idempotency', key, call);
      return;
    }

    if (key === '@/lib/supabase#getCurrentUser') {
      const guard = hasFailClosedResultHandling(checker, call, [], true);
      if (!guard) return;
      add('auth', key, guard);
      return;
    }

    if (key === '@/lib/supabase#getUserAccessContext') {
      if (!isAwaitedPreWriteCall(call) || !throwingCallFailsClosed(call)) {
        return;
      }
      const resultSymbol = callResultSymbol(checker, call);
      if (resultSymbol) approvedAccessContextOrigins.set(resultSymbol, call);
      return;
    }

    if (key === '@/lib/supabase#canAccessClinicScope') {
      const guard = findRejectingIf(call);
      if (
        expressionIsApprovedPermissions(call.arguments[0], call) &&
        callFalseTriggersRejectingGuard(call) &&
        guard &&
        isPreWriteCall(call)
      ) {
        add(
          'clinicScope',
          key,
          guard,
          rejectedSomeCollectionExpression(call) ?? call.arguments[1]
        );
      }
      return;
    }

    if (key === '@/lib/supabase#resolveScopedClinicIds') {
      if (!expressionIsApprovedPermissions(call.arguments[0], call)) return;
      const resultSymbol = callResultSymbol(checker, call, true);
      const guard = resultSymbol
        ? findTerminatingGuardForResult(checker, call, resultSymbol)
        : undefined;
      if (!isPreWriteCall(call) || !guard) {
        return;
      }
      add(
        'clinicScope',
        key,
        guard,
        findOutOfScopeTargetForResult(checker, guard.expression, resultSymbol)
      );
      return;
    }

    if (
      key ===
      '@/lib/auth/manager-scope#resolveManagerAssignedClinicsWithinScope'
    ) {
      const resultSymbol = callResultSymbol(checker, call, true);
      const guard = resultSymbol
        ? findTerminatingGuardForResult(checker, call, resultSymbol)
        : undefined;
      if (!isAwaitedPreWriteCall(call) || !guard) {
        return;
      }
      const resultTarget = resolveTargetSymbol(checker, resultSymbol);
      let guardedClinicTarget;
      function findGuardedClinicTarget(node) {
        if (guardedClinicTarget) return;
        if (node !== startNode && ts.isFunctionDeclaration(node)) return;
        if (ts.isCallExpression(node)) {
          const callee = unwrapExpression(node.expression);
          if (
            ts.isPropertyAccessExpression(callee) &&
            callee.name.text === 'find' &&
            ts.isIdentifier(unwrapExpression(callee.expression))
          ) {
            const receiver = unwrapExpression(callee.expression);
            const receiverSymbol = getIdentifierValueSymbol(checker, receiver);
            const predicate = node.arguments[0];
            if (
              receiverSymbol &&
              resolveTargetSymbol(checker, receiverSymbol) === resultTarget &&
              (ts.isArrowFunction(predicate) ||
                ts.isFunctionExpression(predicate))
            ) {
              function findComparison(current) {
                if (guardedClinicTarget) return;
                if (
                  ts.isBinaryExpression(current) &&
                  [
                    ts.SyntaxKind.EqualsEqualsEqualsToken,
                    ts.SyntaxKind.EqualsEqualsToken,
                  ].includes(current.operatorToken.kind)
                ) {
                  const left = unwrapExpression(current.left);
                  const right = unwrapExpression(current.right);
                  if (
                    ts.isPropertyAccessExpression(left) &&
                    left.name.text === 'clinic_id'
                  ) {
                    guardedClinicTarget = right;
                    return;
                  }
                  if (
                    ts.isPropertyAccessExpression(right) &&
                    right.name.text === 'clinic_id'
                  ) {
                    guardedClinicTarget = left;
                    return;
                  }
                }
                ts.forEachChild(current, findComparison);
              }
              findComparison(predicate.body);
            }
          }
        }
        ts.forEachChild(node, findGuardedClinicTarget);
      }
      findGuardedClinicTarget(startNode);
      if (guardedClinicTarget) {
        add('clinicScope', key, guard, guardedClinicTarget);
      }
      return;
    }

    if (key === '@/lib/billing/admin#resolveOrgRootClinicForBilling') {
      if (!isAwaitedPreWriteCall(call)) return;
      const input = call.arguments[0];
      const client = getObjectProperty(input, 'client');
      const scopedClinicIds = getObjectProperty(input, 'scopedClinicIds');
      if (
        client &&
        scopedClinicIds &&
        ts.isPropertyAccessExpression(client) &&
        ts.isPropertyAccessExpression(scopedClinicIds) &&
        client.name.text === 'client' &&
        scopedClinicIds.name.text === 'scopedClinicIds' &&
        client.expression.getText(sourceFile) ===
          scopedClinicIds.expression.getText(sourceFile) &&
        ts.isIdentifier(client.expression) &&
        scopedAdminBindings.has(checker.getSymbolAtLocation(client.expression))
      ) {
        scopedBillingRootResolvers.add(call);
      }
      return;
    }

    if (
      key === '@/lib/supabase#createScopedAdminContext' ||
      key === '@/lib/supabase/scoped-admin#createScopedAdminContext'
    ) {
      return;
    }

    if (
      key === '@/lib/supabase#resolveChildClinicInScope' ||
      key === '@/lib/supabase/scoped-admin#resolveChildClinicInScope'
    ) {
      const context = unwrapExpression(call.arguments[0]);
      const declaration = findVariableDeclarationForCall(checker, call, true);
      if (
        !isAwaitedCall(call) ||
        !throwingCallFailsClosed(call) ||
        !ts.isIdentifier(context) ||
        !scopedAdminBindings.has(getIdentifierValueSymbol(checker, context)) ||
        !declaration ||
        !ts.isIdentifier(declaration.name)
      ) {
        return;
      }
      add('clinicScope', key, call, declaration.name);
      return;
    }

    if (
      key === '@/lib/chat/scoped-session#resolveScopedChatSessionId' ||
      key === '@/lib/chat/scoped-session#resolveScopedAdminChatSessionId'
    ) {
      const input = call.arguments[0];
      const declaration = findVariableDeclarationForCall(checker, call, true);
      const permissions = getObjectProperty(input, 'permissions');
      const contextProperty = getObjectProperty(input, 'context');
      const context = contextProperty
        ? unwrapExpression(contextProperty)
        : undefined;
      const hasApprovedAuthority = key.endsWith('#resolveScopedChatSessionId')
        ? expressionIsApprovedPermissions(permissions, call)
        : Boolean(
            context &&
            ts.isIdentifier(context) &&
            scopedAdminBindings.has(getIdentifierValueSymbol(checker, context))
          );
      if (
        !isAwaitedCall(call) ||
        !throwingCallFailsClosed(call) ||
        !hasApprovedAuthority ||
        !declaration ||
        !ts.isIdentifier(declaration.name)
      ) {
        return;
      }
      add('clinicScope', key, call, declaration.name);
      return;
    }

    if (
      isAdminUsersAccessBinding(binding, 'resolveScopedAdminUsersClinicIds') ||
      isAdminUsersAccessBinding(binding, 'getScopedAdminUsersClinicIds')
    ) {
      const requireAwait =
        binding.importedName === 'resolveScopedAdminUsersClinicIds';
      if (
        !(requireAwait ? isAwaitedPreWriteCall(call) : isPreWriteCall(call))
      ) {
        return;
      }
      const permissions = requireAwait
        ? getObjectProperty(call.arguments[0], 'permissions')
        : call.arguments[0];
      if (!expressionIsApprovedPermissions(permissions, call)) return;
      const resultSymbol = callResultSymbol(checker, call, true);
      if (resultSymbol) scopedAdminUsersClinicIdBindings.add(resultSymbol);
      return;
    }

    if (
      isAdminUsersAccessBinding(
        binding,
        'canAccessResolvedScopedAdminUsersClinic'
      )
    ) {
      const scopedIds = unwrapExpression(call.arguments[0]);
      const guard = findRejectingIf(call);
      if (
        ts.isIdentifier(scopedIds) &&
        scopedAdminUsersClinicIdBindings.has(
          checker.getSymbolAtLocation(scopedIds)
        ) &&
        callFalseTriggersRejectingGuard(call) &&
        guard &&
        isPreWriteCall(call)
      ) {
        add(
          'clinicScope',
          'AST scoped admin-users clinic membership guard',
          guard,
          call.arguments[1]
        );
      }
      return;
    }

    if (key === '@/lib/supabase/scoped-admin#createPublicClinicContext') {
      if (!isAwaitedPreWriteCall(call) || !throwingCallFailsClosed(call))
        return;
      const clinicTarget = call.arguments[0];
      if (hasProvablyNonNullClinicTarget(checker, clinicTarget)) {
        add('clinicScope', key, call, clinicTarget);
      }
      return;
    }

    if (key === '@/lib/api-helpers#verifyAdminAuth') {
      const guard = hasFailClosedResultHandling(
        checker,
        call,
        ['success'],
        true
      );
      if (!guard) return;
      add('auth', key, guard);
      add('adminRole', key, guard);
      return;
    }

    if (key === '@/lib/supabase#requireAdminAuth') {
      if (
        !isUnconditionalPreWriteCall(call, true) ||
        !throwingCallFailsClosed(call)
      ) {
        return;
      }
      add('auth', key, call);
      add('adminRole', key, call);
      return;
    }
  }

  function inspectNode(node, depth, traversalRoot = node) {
    if (depth > 8) return;
    if (
      node !== traversalRoot &&
      ts.isFunctionLike(node) &&
      !(
        ts.isArrowFunction(node) &&
        ts.isCallExpression(node.parent) &&
        findRejectingIf(node.parent)
      )
    ) {
      return;
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      isScopedAdminFactoryCall(node.initializer)
    ) {
      const symbol = checker.getSymbolAtLocation(node.name);
      if (symbol) scopedAdminBindings.add(symbol);
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      const symbol = checker.getSymbolAtLocation(node.name);
      const initializer = unwrapExpression(node.initializer);
      if (
        symbol &&
        isDirectCronSecretExpression(checker, initializer, sourceFile)
      ) {
        cronSecretBindings.add(symbol);
      }
      if (
        symbol &&
        ts.isCallExpression(initializer) &&
        isDirectAuthorizationHeaderCall(checker, initializer, rootFunction)
      ) {
        authorizationHeaderBindings.add(symbol);
      }
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer
    ) {
      const initializer = unwrapExpression(node.initializer);
      if (
        ts.isIdentifier(initializer) &&
        approvedProcessResultBindings.has(
          checker.getSymbolAtLocation(initializer)
        )
      ) {
        for (const element of node.name.elements) {
          const propertyName = element.propertyName ?? element.name;
          if (
            ts.isIdentifier(propertyName) &&
            propertyName.text === 'permissions' &&
            ts.isIdentifier(element.name)
          ) {
            const symbol = checker.getSymbolAtLocation(element.name);
            if (symbol) approvedPermissionsBindings.add(symbol);
          }
        }
      }
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      let initializer = unwrapExpression(node.initializer);
      if (
        ts.isBinaryExpression(initializer) &&
        initializer.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
      ) {
        initializer = unwrapExpression(initializer.left);
      }
      if (
        ts.isPropertyAccessExpression(initializer) &&
        initializer.name.text === 'clinic_scope_ids'
      ) {
        const permissionsReceiver = unwrapExpression(initializer.expression);
        if (expressionIsApprovedPermissions(permissionsReceiver, node)) {
          const symbol = checker.getSymbolAtLocation(node.name);
          if (symbol) canonicalClinicScopeBindings.add(symbol);
        }
      }
    }

    if (
      ts.isIfStatement(node) &&
      statementAlwaysTerminates(node.thenStatement) &&
      containsStatus(node.thenStatement, 401)
    ) {
      const boundary = findContainingFunction(node);
      if (
        boundary &&
        !isConditionallyExecuted(node, boundary) &&
        !containsWriteBefore(boundary, node)
      ) {
        for (const secretSymbol of cronSecretBindings) {
          for (const headerSymbol of authorizationHeaderBindings) {
            if (
              symbolIsStableBeforeUse(
                checker,
                resolveTargetSymbol(checker, secretSymbol),
                node.expression
              ) &&
              symbolIsStableBeforeUse(
                checker,
                resolveTargetSymbol(checker, headerSymbol),
                node.expression
              ) &&
              conditionIsFailClosedCronGuard(
                checker,
                node.expression,
                headerSymbol,
                secretSymbol
              )
            ) {
              add('auth', 'AST CRON_SECRET bearer denial guard', node);
              add(
                'internalSecret',
                'AST CRON_SECRET bearer denial guard',
                node
              );
            }
          }
        }
      }
    }

    if (ts.isBinaryExpression(node)) {
      const operator = node.operatorToken.kind;
      if (
        operator === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(node.left) &&
        isScopedAdminFactoryCall(node.right)
      ) {
        const symbol = checker.getSymbolAtLocation(node.left);
        if (symbol) scopedAdminBindings.add(symbol);
      }
    }

    if (ts.isCallExpression(node)) {
      const auditMethod = resolveCanonicalAuditMethod(node.expression);
      if (auditMethod) {
        add(
          'sideEffectCall',
          '@/lib/audit-logger#AuditLogger.' + auditMethod,
          node
        );
      }
      const expression = unwrapExpression(node.expression);
      if (ts.isIdentifier(expression)) {
        const binding = imports.get(expression.text);
        if (isExactImportIdentifier(checker, expression, binding)) {
          inspectImportedCall(node, binding);
        }

        const declaration = resolveCalledLocalDeclaration(
          checker,
          expression,
          sourceFile
        );
        if (declaration && localDeclarationIsRequestParser(declaration, node)) {
          add('validation', 'AST request-bound local Zod parser', node);
        }
        if (declaration && !visitedDeclarations.has(declaration)) {
          visitedDeclarations.add(declaration);
          inspectNode(declaration, depth + 1, declaration);
        }
      } else if (ts.isPropertyAccessExpression(expression)) {
        const methodName = expression.name.text;
        const resultGuard =
          methodName === 'safeParse'
            ? hasFailClosedResultHandling(checker, node, ['success'])
            : undefined;
        if (
          methodName === 'safeParse' &&
          isCanonicalZodSchemaExpression(
            checker,
            expression.expression,
            imports
          ) &&
          resultGuard &&
          expressionIsRequestDerived(node.arguments[0], node) &&
          validatedResultFlowsToWrite(node) &&
          rawInputAliasesAreUnusedAfterCall(node)
        ) {
          add('validation', 'AST schema.safeParse', resultGuard);
        }
        if (
          methodName === 'parse' &&
          isCanonicalZodSchemaExpression(
            checker,
            expression.expression,
            imports
          ) &&
          isUnconditionalPreWriteCall(node) &&
          throwingCallFailsClosed(node) &&
          expressionIsRequestDerived(node.arguments[0], node) &&
          resultFlowsToWrite(node) &&
          rawInputAliasesAreUnusedAfterCall(node)
        ) {
          add('validation', 'AST schema.parse', node);
        }
        const receiver = unwrapExpression(expression.expression);
        if (
          methodName === 'assertClinicInScope' &&
          ts.isIdentifier(receiver) &&
          scopedAdminBindings.has(checker.getSymbolAtLocation(receiver)) &&
          throwingCallFailsClosed(node)
        ) {
          scopedAdminAssertions.add(node);
        }
        if (methodName === 'checkCSPReportLimit' && ts.isIdentifier(receiver)) {
          const rateLimitBinding = imports.get(receiver.text);
          const rateLimitGuard = hasFailClosedResultHandling(
            checker,
            node,
            ['allowed'],
            true
          );
          if (
            isExactImportIdentifier(checker, receiver, rateLimitBinding) &&
            rateLimitBinding?.moduleName ===
              '@/lib/rate-limiting/csp-rate-limiter' &&
            rateLimitBinding.importedName === 'cspRateLimiter' &&
            rateLimitGuard &&
            expressionIsRequestBoundRateKey(node.arguments[0], node)
          ) {
            add(
              'rateLimit',
              '@/lib/rate-limiting/csp-rate-limiter#cspRateLimiter.checkCSPReportLimit',
              rateLimitGuard
            );
          }
        }
        if (
          methodName === 'includes' &&
          ts.isIdentifier(receiver) &&
          scopedAdminUsersClinicIdBindings.has(
            checker.getSymbolAtLocation(receiver)
          ) &&
          callFalseTriggersRejectingGuard(node) &&
          isInsideRejectingIf(node) &&
          isPreWriteCall(node)
        ) {
          const guard = findRejectingIf(node);
          add(
            'clinicScope',
            'AST scoped admin-users clinic membership guard',
            guard
          );
        }
        if (
          methodName === 'includes' &&
          ts.isIdentifier(receiver) &&
          canonicalClinicScopeBindings.has(
            checker.getSymbolAtLocation(receiver)
          ) &&
          symbolIsStableBeforeUse(
            checker,
            resolveTargetSymbol(checker, checker.getSymbolAtLocation(receiver)),
            node
          ) &&
          node.arguments.length === 1 &&
          hasProvablyNonNullClinicTarget(checker, node.arguments[0]) &&
          callFalseTriggersRejectingGuard(node) &&
          isInsideRejectingIf(node) &&
          isPreWriteCall(node)
        ) {
          add(
            'clinicScope',
            'AST canonical permissions clinic scope',
            findRejectingIf(node),
            rejectedSomeCollectionExpression(node) ?? node.arguments[0]
          );
        }
        if (ts.isIdentifier(receiver)) {
          const namespaceBinding = imports.get(receiver.text);
          if (
            namespaceBinding?.importedName === '*' &&
            isExactImportIdentifier(checker, receiver, namespaceBinding)
          ) {
            inspectImportedCall(node, {
              moduleName: namespaceBinding.moduleName,
              importedName: methodName,
            });
          }
        }
      }
    }

    ts.forEachChild(node, child => inspectNode(child, depth, traversalRoot));
  }

  inspectNode(startNode, 0);

  for (const assertion of scopedAdminAssertions) {
    add(
      'clinicScope',
      'AST scoped admin assertion',
      assertion,
      assertion.arguments[0]
    );
  }
  for (const resolver of scopedBillingRootResolvers) {
    const declaration = findVariableDeclarationForCall(checker, resolver, true);
    if (declaration && ts.isIdentifier(declaration.name)) {
      add(
        'clinicScope',
        'AST scoped billing root resolver',
        resolver,
        declaration.name
      );
    }
  }
  if (
    hasDirectFixedNoMutationResponse(checker, startNode, imports) &&
    observed.writes.length === 0 &&
    observed.sideEffectCall.length === 0
  ) {
    add(
      'noMutation',
      'AST fixed 405/410 response without write calls',
      startNode
    );
  }

  const reachableWritePaths = collectReachableWritePaths();
  const clinicScopeCandidates = Array.from(evidenceCandidates.clinicScope);
  const clinicProtectedWritePaths = reachableWritePaths.filter(writePath =>
    clinicCandidatesProtectWritePath(clinicScopeCandidates, writePath)
  );
  if (
    hasExplicitAlternateClinicScopeBypass(
      clinicScopeCandidates,
      reachableWritePaths
    ) ||
    (categories.clinicScope.size > 0 && reachableWritePaths.length === 0) ||
    (clinicProtectedWritePaths.length > 0 &&
      clinicProtectedWritePaths.length < reachableWritePaths.length)
  ) {
    categories.clinicScope.clear();
  }
  if (
    categories.clinicScope.size > 0 &&
    reachableWritePaths.length > 0 &&
    reachableWritePaths.every(writePath =>
      clinicCandidatesProtectWritePath(clinicScopeCandidates, writePath)
    )
  ) {
    for (const label of categories.clinicScope) {
      categories.clinicScopeCoverage.add(label);
    }
  }
  for (const category of [
    'auth',
    'adminRole',
    'billing',
    'validation',
    'internalSecret',
    'lineAuth',
    'webhookSignature',
    'idempotency',
    'rateLimit',
  ]) {
    const candidates = Array.from(evidenceCandidates[category]);
    if (
      categories[category].size > 0 &&
      (reachableWritePaths.length === 0 ||
        reachableWritePaths.some(
          writePath =>
            !candidates.some(candidate =>
              candidateProtectsWritePath(candidate, writePath)
            )
        ))
    ) {
      categories[category].clear();
    }
  }

  return Object.fromEntries(
    Object.entries(categories).map(([category, values]) => [
      category,
      Array.from(values).sort(),
    ])
  );
}

function collectExpandedText(checker, startNode, followImportedCalls) {
  const visited = new Set();
  const chunks = [];
  const writeLabels = new Set();
  const routeSourceFile = startNode.getSourceFile();

  function visitNode(node, depth) {
    if (!node || depth > 12) return;
    const nodeSource = node.getSourceFile();
    const key =
      nodeSource.fileName + ':' + String(node.pos) + ':' + String(node.end);
    if (visited.has(key)) return;
    visited.add(key);
    const nodeText = node.getText(nodeSource);
    chunks.push(nodeText);

    function inspect(child) {
      if (ts.isCallExpression(child)) {
        const writeMethod = semanticWriteMethodName(checker, child);
        if (writeMethod && PERSISTENT_DATA_METHODS.has(writeMethod)) {
          writeLabels.add(writeMethod);
        }
        const callee = unwrapExpression(child.expression);
        if (
          !isCanonicalPolicyEvidenceCall(checker, child) &&
          !isCanonicalOpaqueMutationCall(checker, child)
        ) {
          const declarations = followImportedCalls
            ? resolveCalledRepositoryDeclarations(checker, callee)
            : ts.isIdentifier(callee)
              ? [
                  resolveCalledLocalDeclaration(
                    checker,
                    callee,
                    routeSourceFile
                  ),
                ].filter(Boolean)
              : [];
          for (const declaration of declarations) {
            visitNode(declaration, depth + 1);
          }
        }
        if (callMayInvokeCallbackArguments(child)) {
          for (const argument of child.arguments) {
            const callback = unwrapExpression(argument);
            if (!ts.isIdentifier(callback)) continue;
            const callbackDeclarations = followImportedCalls
              ? resolveCalledRepositoryDeclarations(checker, callback)
              : [
                  resolveCalledLocalDeclaration(
                    checker,
                    callback,
                    routeSourceFile
                  ),
                ].filter(Boolean);
            for (const callbackDeclaration of callbackDeclarations) {
              visitNode(callbackDeclaration, depth + 1);
            }
          }
        }
      }
      ts.forEachChild(child, inspect);
    }

    ts.forEachChild(node, inspect);
  }

  visitNode(startNode, 0);
  return {
    text: chunks.join('\n'),
    writes: Array.from(writeLabels).sort(),
  };
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
  const configPath = path.join(REPO_ROOT, 'tsconfig.json');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) {
    throw new Error(
      'Unable to load tsconfig.json: ' +
        ts.flattenDiagnosticMessageText(config.error.messageText, '\n')
    );
  }
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    REPO_ROOT,
    undefined,
    configPath
  );
  return ts.createProgram(routeFiles, {
    ...parsed.options,
    allowJs: false,
    incremental: false,
    noEmit: true,
    skipLibCheck: true,
  });
}

function collectHandler(
  checker,
  sourceRoot,
  sourceFile,
  exportedSymbol,
  method
) {
  const targetSymbol = resolveTargetSymbol(checker, exportedSymbol);
  const targetDeclaration =
    targetSymbol.valueDeclaration ?? targetSymbol.declarations?.[0];
  const routeDeclaration = findRouteDeclaration(exportedSymbol, sourceFile);
  const evidenceNode = targetDeclaration ?? routeDeclaration;
  const evidenceSourceFile = evidenceNode?.getSourceFile() ?? sourceFile;
  const expandedEvidence = evidenceNode
    ? collectExpandedText(checker, evidenceNode, method !== 'GET')
    : { text: sourceFile.getFullText(), writes: [] };
  const observed = collectEvidence(expandedEvidence.text);
  observed.writes = expandedEvidence.writes;
  const hints = collectHints(expandedEvidence.text);
  const approved = evidenceNode
    ? collectApprovedEvidence(
        checker,
        evidenceNode,
        evidenceSourceFile,
        observed
      )
    : collectApprovedEvidence(checker, sourceFile, sourceFile, observed);
  observed.sideEffectCall = Array.from(
    new Set([...observed.sideEffectCall, ...approved.sideEffectCall])
  ).sort();
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
    approved,
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
    schemaVersion: 2,
    generatedBy:
      'scripts/commercial-hardening/generate-mutating-route-inventory.mjs',
    sourceRoot: normalizePath(path.relative(REPO_ROOT, sourceRoot)),
    policyStatus: 'DRAFT_OBSERVED_FACTS_ONLY',
    summary: {
      scannedRouteFiles: routeFiles.length,
      mutationRouteFiles: new Set(handlers.map(handler => handler.source.path))
        .size,
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
  const observedInventory = buildInventory(args.sourceRoot);
  let inventory = observedInventory;

  if (!args.observedOnly) {
    const policy = await loadMutatingRoutePolicy(args.policy);
    const verification = verifyMutatingRoutePolicy(observedInventory, policy);
    if (verification.errors.length > 0) {
      for (const error of verification.errors) {
        console.error(error.code + ': ' + error.message);
      }
      process.exitCode = 1;
      return;
    }
    inventory = mergePolicyIntoInventory(observedInventory, verification);
  }

  const output = serialize(inventory);

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
