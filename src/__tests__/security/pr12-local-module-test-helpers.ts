import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

export const repoRoot = path.resolve(__dirname, '../../..');

export function runPr12Module(
  moduleRelativePath: string,
  source: string
): { status: number | null; stdout: string; stderr: string } {
  const moduleUrl = pathToFileURL(
    path.join(repoRoot, ...moduleRelativePath.split('/'))
  ).href;
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `const subject = await import(${JSON.stringify(moduleUrl)});\n${source}`,
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        NODE_ENV: 'test',
        PATH: process.env.PATH ?? '',
        SystemRoot: process.env.SystemRoot ?? '',
        TEMP: process.env.TEMP ?? '',
        TMP: process.env.TMP ?? '',
      },
      timeout: 30_000,
      windowsHide: true,
    }
  );

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: [result.stderr, result.error?.message].filter(Boolean).join('\n'),
  };
}
