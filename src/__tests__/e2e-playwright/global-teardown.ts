export default async function globalTeardown() {
  const { cleanupE2EData } = await import(
    '../../../scripts/e2e/cleanup-e2e-data.mjs'
  );

  await cleanupE2EData();
}
