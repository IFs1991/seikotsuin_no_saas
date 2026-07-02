const { mkdir, readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');

require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'CommonJS',
    moduleResolution: 'Node',
  },
});

const {
  MOBILE_UIUX_PRODUCTION_ASSET_RESOURCES,
  buildMobileUiuxProductionAsset,
  getMobileUiuxProductionAssetPath,
  getMobileUiuxProductionAssetRoot,
  getMobileUiuxSourceAssetPath,
} = require('../../src/lib/mobile-uiux/production-asset.ts');

async function buildMobileUiuxProductionAssets() {
  return Promise.all(
    MOBILE_UIUX_PRODUCTION_ASSET_RESOURCES.map(async resource => {
      const sourceHtml = await readFile(
        getMobileUiuxSourceAssetPath(resource),
        'utf-8'
      );
      return {
        resource,
        outputPath: getMobileUiuxProductionAssetPath(resource),
        content: buildMobileUiuxProductionAsset(resource, sourceHtml),
      };
    })
  );
}

async function generateMobileUiuxProductionAssets(mode) {
  const assets = await buildMobileUiuxProductionAssets();

  if (mode === 'write') {
    await mkdir(getMobileUiuxProductionAssetRoot(), { recursive: true });
    await Promise.all(assets.map(writeProductionAssetIfChanged));
    return;
  }

  const drift = [];
  for (const asset of assets) {
    const actual = await readProductionAssetIfPresent(asset.outputPath);
    if (actual === null) {
      drift.push({
        resource: asset.resource,
        outputPath: asset.outputPath,
        reason: 'missing',
      });
      continue;
    }
    if (actual !== asset.content) {
      drift.push({
        resource: asset.resource,
        outputPath: asset.outputPath,
        reason: 'changed',
      });
    }
  }

  if (drift.length > 0) {
    const details = drift
      .map(
        item =>
          `${item.resource}: ${item.reason} (${path.relative(
            process.cwd(),
            item.outputPath
          )})`
      )
      .join('\n');
    throw new Error(
      `Mobile UIUX production assets are out of date.\n${details}\nRun npm run mobile-uiux:generate-production-assets.`
    );
  }

  console.log('mobile-uiux production assets are up to date');
}

async function writeProductionAssetIfChanged(asset) {
  const relativePath = path.relative(process.cwd(), asset.outputPath);
  const actual = await readProductionAssetIfPresent(asset.outputPath);
  if (actual === asset.content) {
    console.log(`up to date ${relativePath}`);
    return;
  }

  await writeFile(asset.outputPath, asset.content, 'utf-8');
  console.log(`generated ${relativePath}`);
}

async function readProductionAssetIfPresent(outputPath) {
  try {
    return await readFile(outputPath, 'utf-8');
  } catch (error) {
    if (isNodeFileNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

function isNodeFileNotFoundError(error) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

function parseMode(argv) {
  return argv.includes('--check') ? 'check' : 'write';
}

async function main() {
  await generateMobileUiuxProductionAssets(parseMode(process.argv.slice(2)));
}

main().catch(error => {
  const message =
    error instanceof Error && error.message.length > 0
      ? error.message
      : 'Mobile UIUX production asset generation failed';
  console.error(message);
  process.exitCode = 1;
});
