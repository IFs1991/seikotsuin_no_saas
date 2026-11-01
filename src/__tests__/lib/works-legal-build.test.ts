import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

describe('製品別の正式配信build前提', () => {
  it('WorksのみapprovedでもWorksチェックを必須化し、OSチェックは解除・代用しない', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'works-build-'));
    const file = path.join(directory, '.env.production');
    fs.writeFileSync(
      file,
      'WORKS_LEGAL_PUBLICATION_MODE=approved\nLEGAL_PUBLICATION_MODE=hold\n'
    );
    try {
      const result = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          "import {planLegalBuild} from './scripts/public-site/build-for-vercel.mjs'; process.stdout.write(JSON.stringify(planLegalBuild(process.argv[1])));",
          directory,
        ],
        {
          env: {
            PATH: process.env.PATH ?? '',
            NODE_ENV: 'production',
            VERCEL_ENV: 'production',
          },
          encoding: 'utf8',
          timeout: 60_000,
        }
      );
      expect(result.status).toBe(0);
      const value: unknown = JSON.parse(result.stdout);
      expect(value).toMatchObject({
        checkRequired: false,
        worksCheckRequired: true,
        worksEnvironment: { publicationMode: 'approved' },
      });
    } finally {
      fs.unlinkSync(file);
      fs.rmdirSync(directory);
    }
  });
});
