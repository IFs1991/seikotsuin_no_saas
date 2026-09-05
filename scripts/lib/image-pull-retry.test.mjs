import test from 'node:test';
import assert from 'node:assert/strict';
import { runWithMetaImagePullRetry } from './image-pull-retry.mjs';

const transient = Object.assign(new Error('CLI failed'), {
  stderr:
    'failed to pull public.ecr.aws/supabase/postgres-meta:v0.96.1 manifest: toomanyrequests 429',
});
test('retries transient image pulls with bounded delays and unchanged output', async () => {
  let calls = 0;
  const delays = [];
  const output = await runWithMetaImagePullRetry(
    () => {
      if (++calls === 1) throw transient;
      return 'export type Json = null;';
    },
    {
      sleep: async ms => {
        delays.push(ms);
      },
      warn: () => {},
    }
  );
  assert.equal(calls, 2);
  assert.deepEqual(delays, [1000]);
  assert.equal(output, 'export type Json = null;');
});
test('exhausts at three attempts', async () => {
  let calls = 0;
  const delays = [];
  await assert.rejects(
    runWithMetaImagePullRetry(
      () => {
        calls++;
        throw transient;
      },
      {
        sleep: async ms => {
          delays.push(ms);
        },
        warn: () => {},
      }
    ),
    error => error === transient
  );
  assert.equal(calls, 3);
  assert.deepEqual(delays, [1000, 3000]);
});
for (const stderr of [
  'SQL failed 429',
  'type mismatch postgres-meta',
  'pull postgres-meta manifest unknown 429',
  'pull postgres-meta unauthorized 429',
]) {
  test(`does not retry permanent or unrelated failure: ${stderr}`, async () => {
    let calls = 0;
    await assert.rejects(
      runWithMetaImagePullRetry(() => {
        calls++;
        throw Object.assign(new Error('failed'), { stderr });
      })
    );
    assert.equal(calls, 1);
  });
}
test('does not validate or retry malformed successful output', async () => {
  assert.equal(
    await runWithMetaImagePullRetry(() => 'not TypeScript'),
    'not TypeScript'
  );
});
