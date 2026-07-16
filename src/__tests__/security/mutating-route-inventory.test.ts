/** @jest-environment node */

import { execFileSync } from 'node:child_process';
import path from 'node:path';

type InventoryHandler = {
  id: string;
  route: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  classification: 'UNKNOWN';
  observed: Record<string, string[]>;
  hints: Record<string, string[]>;
  executionPath: { status: 'RESOLVED' | 'UNRESOLVED'; path: string | null };
};

type RouteInventory = {
  summary: {
    scannedRouteFiles: number;
    mutationRouteFiles: number;
    mutationHandlers: number;
    unclassifiedHandlers: number;
    sideEffectingGetCandidates: number;
  };
  handlers: InventoryHandler[];
  sideEffectingGetCandidates: Array<{ route: string }>;
};

const repoRoot = path.resolve(__dirname, '../../..');
const scriptPath = path.join(
  repoRoot,
  'scripts/commercial-hardening/generate-mutating-route-inventory.mjs'
);
const fixtureRoot = path.join(
  __dirname,
  '../fixtures/mutating-route-inventory/api'
);

function generateFixtureInventory(): RouteInventory {
  const stdout = execFileSync(
    process.execPath,
    [scriptPath, '--source-root', fixtureRoot, '--observed-only', '--stdout'],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  return JSON.parse(stdout) as RouteInventory;
}

describe('mutating route inventory generator', () => {
  it('discovers function, variable, and alias exports but excludes ordinary GET', () => {
    const inventory = generateFixtureInventory();

    expect(inventory.handlers.map(handler => handler.id)).toEqual([
      'POST /api/example',
      'PATCH /api/example',
      'DELETE /api/example',
      'POST /api/mixed',
    ]);
    expect(inventory.summary).toMatchObject({
      scannedRouteFiles: 3,
      mutationRouteFiles: 2,
      mutationHandlers: 4,
      unclassifiedHandlers: 4,
      sideEffectingGetCandidates: 1,
    });
    expect(inventory.sideEffectingGetCandidates).toEqual([
      expect.objectContaining({ route: '/api/internal/process' }),
    ]);
    expect(
      inventory.sideEffectingGetCandidates.map(candidate => candidate.route)
    ).not.toContain('/api/mixed');
  });

  it('keeps policy decisions UNKNOWN and records observed helper evidence', () => {
    const inventory = generateFixtureInventory();
    const post = inventory.handlers.find(handler => handler.method === 'POST');
    const patchHandler = inventory.handlers.find(
      handler => handler.method === 'PATCH'
    );
    const deleteHandler = inventory.handlers.find(
      handler => handler.method === 'DELETE'
    );

    expect(post).toMatchObject({
      classification: 'UNKNOWN',
      route: '/api/example',
    });
    expect(post?.observed.auth).toContain('processApiRequest');
    expect(patchHandler?.observed.validation).toContain('safeParse');
    expect(deleteHandler).toMatchObject({
      executionPath: {
        status: 'RESOLVED',
        path: expect.stringMatching(/example\/shared\.ts$/),
      },
    });
    expect(deleteHandler?.observed.clinicScope).toContain('ensureClinicAccess');
    expect(deleteHandler?.observed.writes).toContain('delete');
    expect(deleteHandler?.hints.idempotency).toContain('upsert call');
  });

  it('emits deterministic output', () => {
    expect(generateFixtureInventory()).toEqual(generateFixtureInventory());
  });

  it('keeps the committed repository manifest in sync', () => {
    expect(() =>
      execFileSync(process.execPath, [scriptPath, '--check'], {
        cwd: repoRoot,
        encoding: 'utf8',
      })
    ).not.toThrow();
  });
});
