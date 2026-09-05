import { pathToFileURL } from 'node:url';
import { createManifest } from './core100-profile.mjs';
import {
  outputPaths,
  parseArguments,
  readConfiguration,
} from './core100-safety.mjs';

export async function main(argv = process.argv.slice(2)) {
  const flags = parseArguments(argv);
  const { profile, target } = await readConfiguration(flags.configFile);
  const paths = outputPaths(flags.outputDirectory, profile.runId);
  if (
    flags.command === 'plan' ||
    (flags.command === 'seed' && !flags.execute)
  ) {
    const manifest = createManifest(profile, target);
    console.log(
      JSON.stringify(
        {
          mode: 'OFFLINE_DRY_RUN',
          command: flags.command,
          target,
          profile,
          expected: manifest.expected,
          manifestFile: paths.manifest,
          fixtureInventory: manifest.fixtureInventory,
          execution:
            'BLOCKED until explicit execution approval, dedicated allowlisted target and credentials are provided',
          capacityStatus: 'BLOCKED',
        },
        null,
        2
      )
    );
    return 0;
  }
  const onProgress = event => console.log(JSON.stringify(event));
  let result;
  if (flags.command === 'seed') {
    const { seedDatabase } = await import('./core100-seed.mjs');
    result = await seedDatabase({ profile, target, flags, paths, onProgress });
  } else if (flags.command === 'load') {
    const { runLoad } = await import('./core100-load.mjs');
    result = await runLoad({ profile, target, flags, paths, onProgress });
  } else {
    const { verifyData } = await import('./core100-verify.mjs');
    result = await verifyData({ profile, target, flags, paths, onProgress });
  }
  console.log(JSON.stringify(result, null, 2));
  return ['FAIL', 'BLOCKED'].includes(result.status) ||
    ['FAIL', 'BLOCKED'].includes(result.verificationStatus)
    ? 1
    : 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.exitCode = await main();
  } catch (error) {
    const code =
      error instanceof Error && /^[A-Za-z0-9_:.-]+$/.test(error.message)
        ? error.message
        : 'CORE100_COMMAND_FAILED';
    console.error(JSON.stringify({ status: 'BLOCKED', code }));
    process.exitCode = 1;
  }
}
